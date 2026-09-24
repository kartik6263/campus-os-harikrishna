import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Router, type NextFunction, type Request, type Response } from 'express';
import pg from 'pg';
import { z } from 'zod';
import { env } from './env.js';
import { ApiError, asyncHandler, validate } from './lib/http.js';
import { clientForSchema, schemaFor, tenantContext } from './db.js';

/**
 * Phase 2 — the shared pool.
 *
 * Every request to a pool names its institute (X-Tenant). The control plane
 * is asked, with a short cache, whether that institute exists, is active and
 * is placed on this pool; the request then runs entirely against the
 * institute's own schema.
 */

const SLUG = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;

interface Placement { status: string; placement: string; pool: string | null }
const cache = new Map<string, { at: number; value: Placement | null }>();
const CACHE_MS = 30_000;

async function placementOf(slug: string): Promise<Placement | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const res = await fetch(`${env.CONTROL_PLANE_URL}/api/resolve?slug=${encodeURIComponent(slug)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const value = res.status === 404 ? null : res.ok ? ((await res.json()) as Placement) : undefined;
  if (value === undefined) throw new ApiError(503, 'The institute directory is unavailable. Try again shortly.');
  cache.set(slug, { at: Date.now(), value });
  return value;
}

/** Forget a cached answer, e.g. right after the control plane changes it. */
export const forgetPlacement = (slug: string) => cache.delete(slug);

/** Puts each request on a pool into its institute's schema. */
export function tenantScope(req: Request, _res: Response, next: NextFunction) {
  if (!env.POOL_MODE || req.path === '/api/health' || req.path.startsWith('/internal/')) return next();

  const slug = String(req.headers['x-tenant'] ?? '').trim().toLowerCase();
  if (!SLUG.test(slug)) return next(ApiError.badRequest('Which institute? Send its code in X-Tenant.'));

  placementOf(slug)
    .then((p) => {
      if (!p) throw ApiError.notFound('No such institute');
      if (p.placement !== 'pooled' || p.pool !== env.POOL_ID) throw ApiError.notFound('That institute is not served here');
      if (p.status === 'suspended') throw ApiError.forbidden('This institute’s account is suspended');
      if (p.status !== 'active') throw new ApiError(503, 'This institute is being set up or moved. Try again shortly.');
      const schema = schemaFor(slug);
      tenantContext.run({ slug, schema, client: clientForSchema(schema) }, () => next());
    })
    .catch(next);
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

/** The pool database's URL, pointed at one schema (Prisma, and node-pg). */
export function urlForSchema(schema: string, forPrisma: boolean): string {
  const u = new URL(env.DATABASE_URL);
  if (forPrisma) u.searchParams.set('schema', schema);
  else u.searchParams.set('options', `-c search_path=${schema}`);
  return u.toString();
}

function run(command: string, extraEnv: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`"${command}" exited with ${code}`))));
  });
}

/** Brings one institute's schema to the current migrations. */
export async function migrateSchema(schema: string) {
  await run('npx prisma migrate deploy', { DATABASE_URL: urlForSchema(schema, true) });
}

async function withPool<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Every institute schema on this pool. */
export async function tenantSchemas(): Promise<string[]> {
  return withPool(async (c) => {
    const { rows } = await c.query<{ nspname: string }>("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't\\_%' ORDER BY 1");
    return rows.map((r) => r.nspname);
  });
}

// ─── Control-plane calls ──────────────────────────────────────────────────────

function requirePoolSecret(req: Request, _res: Response, next: NextFunction) {
  const given = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
  const real = Buffer.from(env.POOL_SECRET ?? '');
  if (!env.POOL_MODE || !real.length || given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
    return next(ApiError.unauthorized('Pool secret required'));
  }
  next();
}

export const poolRouter = Router();
poolRouter.use(requirePoolSecret);

/** Creates an institute's schema, migrates it, and writes its profile. */
poolRouter.post(
  '/tenants',
  validate('body', z.object({
    slug: z.string().regex(SLUG),
    name: z.string().min(2),
    kind: z.string().default('University'),
    shortCode: z.string().max(6).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { slug, name, kind, shortCode } = req.body as { slug: string; name: string; kind: string; shortCode?: string };
    const schema = schemaFor(slug);
    await withPool((c) => c.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`));
    await migrateSchema(schema);
    // The same start-up preparation a dedicated institute gets: its profile
    // and a first campus, nothing else, so its IT Cell sets up first.
    await run('node scripts/seed-if-empty.mjs', {
      DATABASE_URL: urlForSchema(schema, false),
      SEED_DEMO: 'false',
      INSTITUTION_NAME: name,
      INSTITUTION_KIND: kind,
      INSTITUTION_SHORT_CODE: shortCode ?? '',
    });
    forgetPlacement(slug);
    res.status(201).json({ ok: true, schema });
  }),
);

/** Takes an institute off this pool after a move: its schema is renamed, not dropped. */
poolRouter.post(
  '/tenants/:slug/retire',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug);
    if (!SLUG.test(slug)) throw ApiError.badRequest('Bad institute code');
    const schema = schemaFor(slug);
    const kept = `moved__${schema}__${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    await withPool((c) => c.query(`ALTER SCHEMA "${schema}" RENAME TO "${kept}"`));
    forgetPlacement(slug);
    res.json({ ok: true, keptAs: kept });
  }),
);

/** Deletes an institute and all of its data from this pool. */
poolRouter.delete(
  '/tenants/:slug',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug);
    if (!SLUG.test(slug)) throw ApiError.badRequest('Bad institute code');
    await withPool((c) => c.query(`DROP SCHEMA IF EXISTS "${schemaFor(slug)}" CASCADE`));
    forgetPlacement(slug);
    res.json({ ok: true });
  }),
);

/** Drops the cached placement so a suspension or move takes effect now. */
poolRouter.post(
  '/tenants/:slug/refresh',
  asyncHandler(async (req, res) => {
    forgetPlacement(String(req.params.slug));
    res.json({ ok: true });
  }),
);

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env, tenantWebUrl } from './env.js';
import { getTenant, logEvent, pool, type Tenant } from './db.js';
import { RESERVED_SLUGS, deleteTenant, moveToDedicated, provider, provisionTenant, resumeTenant, suspendTenant } from './provision.js';
import { checkAll } from './monitor.js';

const here = path.dirname(fileURLToPath(import.meta.url));

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** What the panel shows for an institute. */
function view(t: Tenant) {
  return {
    slug: t.slug, name: t.name, kind: t.kind, shortCode: t.short_code, status: t.status,
    provider: t.provider, placement: t.placement, poolId: t.pool_id, apiUrl: t.api_url, dbName: t.db_name, serviceId: t.service_id,
    webUrl: tenantWebUrl(t.slug), error: t.error, healthOk: t.health_ok, healthAt: t.health_at,
    createdAt: t.created_at,
  };
}

function requireOwner(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  try {
    if (!token) throw new Error();
    jwt.verify(token, env.CONTROL_PLANE_SECRET, { issuer: 'resolion-control-plane' });
    next();
  } catch {
    next(new HttpError(401, 'Sign in to the control plane'));
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => { res.json({ ok: true, service: 'resolion-control-plane', provisioner: env.PROVISIONER }); });

  // ─── Public: which backend an institute's subdomain talks to ───────────────
  // Called from every institute's site, so any origin may read it.
  app.get('/api/resolve', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=60');
    next();
  }, wrap(async (req, res) => {
    const slug = String(req.query.slug ?? '').toLowerCase();
    const t = slug ? await getTenant(slug) : null;
    if (!t) throw new HttpError(404, 'No such institute');
    res.json({
      slug: t.slug,
      name: t.name,
      status: t.status,
      placement: t.placement,
      pool: t.pool_id,
      apiUrl: t.status === 'active' ? t.api_url : null,
      // On a shared pool the app sends this as X-Tenant on every request.
      tenantHeader: t.placement === 'pooled' ? t.slug : null,
    });
  }));

  // ─── Owner sign-in ─────────────────────────────────────────────────────────
  app.post('/api/login', wrap(async (req, res) => {
    const given = Buffer.from(String((req.body as { password?: string })?.password ?? ''));
    const real = Buffer.from(env.CONTROL_PLANE_PASSWORD);
    // Constant-time, and a pause, so the password cannot be guessed quickly.
    await new Promise((r) => setTimeout(r, 400));
    if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) throw new HttpError(401, 'Wrong password');
    const token = jwt.sign({ sub: 'owner' }, env.CONTROL_PLANE_SECRET, { expiresIn: '12h', issuer: 'resolion-control-plane' });
    res.json({ token, provisioner: env.PROVISIONER, baseDomain: env.BASE_DOMAIN ?? null });
  }));

  const api = express.Router();
  api.use(requireOwner);

  api.get('/tenants', wrap(async (_req, res) => {
    const { rows } = await pool.query<Tenant>('SELECT * FROM tenants ORDER BY created_at DESC');
    res.json({ provisioner: env.PROVISIONER, baseDomain: env.BASE_DOMAIN ?? null, poolAvailable: Boolean(env.POOL_API_URL && env.POOL_SECRET), tenants: rows.map(view) });
  }));

  api.get('/tenants/:slug', wrap(async (req, res) => {
    const t = await getTenant(String(req.params.slug));
    if (!t) throw new HttpError(404, 'No such institute');
    const { rows } = await pool.query('SELECT at, level, message FROM tenant_events WHERE tenant_id = $1 ORDER BY at DESC LIMIT 50', [t.id]);
    res.json({ ...view(t), events: rows });
  }));

  const slugSchema = z.string().trim().toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/, 'Use 3–30 lowercase letters, numbers or hyphens, starting with a letter')
    .refine((s) => !RESERVED_SLUGS.has(s), 'That address is reserved');

  // One click: registers the institute and provisions it in the background.
  api.post('/tenants', wrap(async (req, res) => {
    const body = z.object({
      slug: slugSchema,
      name: z.string().trim().min(2).max(160),
      kind: z.enum(['University', 'College', 'School', 'Institute', 'Academy', 'Other']).default('University'),
      shortCode: z.string().trim().max(6).optional(),
      placement: z.enum(['dedicated', 'pooled']).default('dedicated'),
    }).parse(req.body);
    if (await getTenant(body.slug)) throw new HttpError(409, 'That address is already taken');
    if (body.placement === 'pooled' && !(env.POOL_API_URL && env.POOL_SECRET)) {
      throw new HttpError(400, 'No shared pool is configured yet; choose Dedicated or set POOL_API_URL and POOL_SECRET');
    }
    const { rows } = await pool.query<Tenant>(
      `INSERT INTO tenants (slug, name, kind, short_code, status, provider, placement) VALUES ($1, $2, $3, $4, 'provisioning', $5, $6) RETURNING *`,
      [body.slug, body.name, body.kind, body.shortCode?.toUpperCase() || null, provider.name, body.placement],
    );
    await logEvent(rows[0]!.id, 'info', `Registered "${body.name}"`);
    void provisionTenant(body.slug);
    res.status(202).json(view(rows[0]!));
  }));

  // Registers a deployment that already exists (e.g. the demo), without provisioning.
  api.post('/tenants/adopt', wrap(async (req, res) => {
    const body = z.object({ slug: slugSchema.or(z.literal('demo')), name: z.string().trim().min(2), apiUrl: z.string().url() }).parse(req.body);
    if (await getTenant(body.slug)) throw new HttpError(409, 'That address is already taken');
    const { rows } = await pool.query<Tenant>(
      `INSERT INTO tenants (slug, name, status, provider, api_url) VALUES ($1, $2, 'active', 'external', $3) RETURNING *`,
      [body.slug, body.name, body.apiUrl.replace(/\/$/, '')],
    );
    await logEvent(rows[0]!.id, 'info', `Adopted existing deployment at ${body.apiUrl}`);
    res.status(201).json(view(rows[0]!));
  }));

  const act = (fn: (t: Tenant) => Promise<void>, allowed?: string[]) => wrap(async (req, res) => {
    const t = await getTenant(String(req.params.slug));
    if (!t) throw new HttpError(404, 'No such institute');
    if (allowed && !allowed.includes(t.status)) throw new HttpError(409, `Not possible while ${t.status}`);
    await fn(t);
    res.json({ ok: true });
  });

  api.post('/tenants/:slug/retry', act(async (t) => { void provisionTenant(t.slug); }, ['failed']));
  api.post('/tenants/:slug/suspend', act(suspendTenant, ['active']));
  api.post('/tenants/:slug/resume', act(resumeTenant, ['suspended']));
  api.post('/tenants/:slug/check', act(async () => { await checkAll(); }));
  api.post('/tenants/:slug/move', wrap(async (req, res) => {
    const t = await getTenant(String(req.params.slug));
    if (!t) throw new HttpError(404, 'No such institute');
    if (t.placement !== 'pooled' || t.status !== 'active') throw new HttpError(409, 'Only an active institute on the shared pool can move');
    void moveToDedicated(t);
    res.status(202).json({ ok: true });
  }));
  api.delete('/tenants/:slug', wrap(async (req, res) => {
    const t = await getTenant(String(req.params.slug));
    if (!t) throw new HttpError(404, 'No such institute');
    // Deleting destroys the institute's data; the address must be typed back.
    if ((req.body as { confirm?: string })?.confirm !== t.slug) throw new HttpError(400, 'Type the institute address to confirm');
    await deleteTenant(t);
    res.json({ ok: true });
  }));

  app.use('/api', api);
  app.use(express.static(path.join(here, '..', 'public')));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return void res.status(400).json({ error: err.issues.map((i) => i.message).join('; ') });
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

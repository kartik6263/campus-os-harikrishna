import crypto from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import pg from 'pg';
import { env, tenantOrigin } from '../env.js';
import { pool, type Tenant } from '../db.js';
import type { Provider } from './types.js';

/**
 * Testing provisioner: each institute gets a database on the local Postgres
 * and its own backend process from ../ (the same code the cloud deploys), on
 * its own port. Lets the whole chain be exercised without cloud accounts.
 */
const running = new Map<string, ChildProcess>();
const dbNameFor = (slug: string) => `t_${slug.replace(/-/g, '_')}`;

function dbUrl(dbName: string) {
  const u = new URL(env.LOCAL_PG_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: env.LOCAL_PG_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function nextPort(): Promise<number> {
  const { rows } = await pool.query<{ max: number | null }>("SELECT max(port) AS max FROM tenants WHERE provider = 'local'");
  return Math.max(env.LOCAL_FIRST_PORT, (rows[0]?.max ?? 0) + 1);
}

function start(t: Tenant, databaseUrl: string, port: number) {
  const backendDir = path.resolve(process.cwd(), env.LOCAL_BACKEND_DIR);
  const child = spawn('npx prisma migrate deploy && node scripts/seed-if-empty.mjs && npx tsx src/index.ts', {
    cwd: backendDir,
    shell: true,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
      JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
      // The web app and the mobile app's browser preview (native apps send no Origin).
      CORS_ORIGINS: `http://localhost:5173,http://localhost:8081,${tenantOrigin(t.slug)}`,
      TURNSTILE_ORIGINS: 'http://localhost:5173',
      APP_URL: `http://localhost:5173/?tenant=${t.slug}`,
      SEED_DEMO: 'false',
      INSTITUTION_NAME: t.name,
      INSTITUTION_KIND: t.kind,
      INSTITUTION_SHORT_CODE: t.short_code ?? '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[${t.slug}]`;
  child.stdout?.on('data', (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`${tag} ${d}`));
  child.on('exit', (code) => { running.delete(t.slug); console.log(`${tag} backend exited (${code})`); });
  running.set(t.slug, child);
}

function stop(slug: string) {
  const child = running.get(slug);
  if (!child) return;
  // A shell-spawned tree: kill the whole group on Windows and elsewhere.
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill('SIGTERM');
  running.delete(slug);
}

export const localProvider: Provider = {
  name: 'local',

  async createDatabase(slug) {
    const dbName = dbNameFor(slug);
    await admin((c) => c.query(`CREATE DATABASE "${dbName}"`));
    return { dbName, url: dbUrl(dbName) };
  },

  async databaseUrlFor(dbName) { return dbUrl(dbName); },

  async createBackend(t, databaseUrl) {
    const port = await nextPort();
    start(t, databaseUrl, port);
    return { apiUrl: `http://localhost:${port}`, port };
  },

  async suspend(t) { stop(t.slug); },
  async resume(t) {
    if (t.db_name && t.port) start(t, dbUrl(t.db_name), t.port);
  },
  async deleteBackend(t) { stop(t.slug); },
  async deleteDatabase(t) {
    if (t.db_name) await admin((c) => c.query(`DROP DATABASE IF EXISTS "${t.db_name}" WITH (FORCE)`));
  },

  // Local backends die with the control plane; bring the active ones back.
  async onBoot(tenants) {
    for (const t of tenants) {
      if (t.provider === 'local' && t.status === 'active' && t.db_name && t.port) start(t, dbUrl(t.db_name), t.port);
    }
  },
};

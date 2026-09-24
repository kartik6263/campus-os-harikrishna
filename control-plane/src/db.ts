import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export type TenantStatus = 'provisioning' | 'deploying' | 'active' | 'failed' | 'suspended' | 'deleting';

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  kind: string;
  short_code: string | null;
  status: TenantStatus;
  provider: 'local' | 'cloud' | 'external';
  api_url: string | null;
  db_name: string | null;
  service_id: string | null;
  port: number | null;
  error: string | null;
  health_ok: boolean | null;
  health_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** The registry's tables; safe to run on every start. */
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id          serial PRIMARY KEY,
      slug        text UNIQUE NOT NULL,
      name        text NOT NULL,
      kind        text NOT NULL DEFAULT 'University',
      short_code  text,
      status      text NOT NULL,
      provider    text NOT NULL,
      api_url     text,
      db_name     text,
      service_id  text,
      port        integer,
      error       text,
      health_ok   boolean,
      health_at   timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS tenant_events (
      id         serial PRIMARY KEY,
      tenant_id  integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      at         timestamptz NOT NULL DEFAULT now(),
      level      text NOT NULL,
      message    text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tenant_events_tenant ON tenant_events (tenant_id, at DESC);
  `);
}

export async function getTenant(slug: string): Promise<Tenant | null> {
  const { rows } = await pool.query<Tenant>('SELECT * FROM tenants WHERE slug = $1', [slug]);
  return rows[0] ?? null;
}

export async function updateTenant(id: number, patch: Partial<Omit<Tenant, 'id' | 'created_at'>>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await pool.query(`UPDATE tenants SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => patch[k as keyof typeof patch])]);
}

export async function logEvent(tenantId: number, level: 'info' | 'warn' | 'error', message: string) {
  await pool.query('INSERT INTO tenant_events (tenant_id, level, message) VALUES ($1, $2, $3)', [tenantId, level, message]);
  console.log(`[tenant ${tenantId}] ${level}: ${message}`);
}

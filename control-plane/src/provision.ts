import { env, tenantWebUrl } from './env.js';
import { getTenant, logEvent, pool, updateTenant, type Tenant } from './db.js';
import { cloudProvider } from './providers/cloud.js';
import { localProvider } from './providers/local.js';
import type { Provider } from './providers/types.js';
import { copySchemaToDatabase, poolCall, schemaFor } from './pool.js';

export const provider: Provider = env.PROVISIONER === 'cloud' ? cloudProvider : localProvider;

/** Connection failures (AggregateError) carry an empty message; fall back to their code. */
function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as { code?: string }).code;
  return err.message || (code ? `${code} (${err.name})` : err.name);
}

/** Subdomains an institute cannot take. */
export const RESERVED_SLUGS = new Set(['www', 'app', 'api', 'admin', 'control', 'demo', 'mail', 'status', 'help', 'support']);

async function waitForHealth(t: Tenant, apiUrl: string, minutes: number): Promise<boolean> {
  const until = Date.now() + minutes * 60_000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, env.PROVISIONER === 'cloud' ? 20_000 : 2_000));
  }
  await logEvent(t.id, 'warn', `No healthy response from ${apiUrl} after ${minutes} minutes`);
  return false;
}

/**
 * Creates everything an institute runs on, recording each step. Picks up
 * where a failed attempt stopped, so "Retry" never creates things twice.
 */
export async function provisionTenant(slug: string): Promise<void> {
  let t = await getTenant(slug);
  if (!t) return;
  if (t.placement === 'pooled') return provisionPooled(t);
  try {
    let databaseUrl: string | null = null;

    if (!t.db_name) {
      await updateTenant(t.id, { status: 'provisioning', error: null });
      await logEvent(t.id, 'info', `Creating database (${provider.name})…`);
      const db = await provider.createDatabase(t.slug);
      databaseUrl = db.url;
      await updateTenant(t.id, { db_name: db.dbName });
      await logEvent(t.id, 'info', `Database ${db.dbName} created`);
    }

    t = (await getTenant(slug))!;
    if (!t.api_url) {
      databaseUrl ??= await provider.databaseUrlFor(t.db_name!);
      await logEvent(t.id, 'info', 'Creating backend from the shared codebase…');
      const be = await provider.createBackend(t, databaseUrl);
      await updateTenant(t.id, { api_url: be.apiUrl, service_id: be.serviceId ?? null, port: be.port ?? null, status: 'deploying' });
      await logEvent(t.id, 'info', `Backend ${be.serviceId ?? `on port ${be.port}`} at ${be.apiUrl}; waiting for it to come up`);
    }

    t = (await getTenant(slug))!;
    await updateTenant(t.id, { status: 'deploying' });
    const healthy = await waitForHealth(t, t.api_url!, env.PROVISIONER === 'cloud' ? 20 : 3);
    if (!healthy) throw new Error('Backend did not become healthy in time; check its logs, then Retry');

    await updateTenant(t.id, { status: 'active', health_ok: true, health_at: new Date(), error: null });
    await logEvent(t.id, 'info', `Live. Its IT Cell sets up at ${tenantWebUrl(t.slug)}`);
  } catch (err) {
    const message = errorText(err);
    await updateTenant(t!.id, { status: 'failed', error: message });
    await logEvent(t!.id, 'error', message);
  }
}

/** A pooled institute: its own schema on the shared pool backend and database. */
async function provisionPooled(t: Tenant): Promise<void> {
  try {
    await updateTenant(t.id, { status: 'provisioning', error: null, pool_id: env.POOL_ID });
    await logEvent(t.id, 'info', `Creating schema ${schemaFor(t.slug)} on shared pool ${env.POOL_ID}…`);
    await poolCall('/tenants', {
      method: 'POST',
      body: JSON.stringify({ slug: t.slug, name: t.name, kind: t.kind, ...(t.short_code ? { shortCode: t.short_code } : {}) }),
    });
    const apiUrl = env.POOL_API_URL!.replace(/\/$/, '');
    await updateTenant(t.id, { api_url: apiUrl, db_name: schemaFor(t.slug), status: 'active', health_ok: true, health_at: new Date() });
    await logEvent(t.id, 'info', `Live on the shared pool. Its IT Cell sets up at ${tenantWebUrl(t.slug)}`);
  } catch (err) {
    const message = errorText(err);
    await updateTenant(t.id, { status: 'failed', error: message });
    await logEvent(t.id, 'error', message);
  }
}

/** Makes the pool drop its cached answer so a change applies at once. */
async function refreshOnPool(t: Tenant) {
  if (t.placement === 'pooled') await poolCall(`/tenants/${t.slug}/refresh`, { method: 'POST' }).catch(() => {});
}

/**
 * Moves a pooled institute onto its own database and backend (Phase 1
 * placement), e.g. when it grows. Its users see a short pause; the pool's
 * copy is renamed and kept, not deleted.
 */
export async function moveToDedicated(t: Tenant): Promise<void> {
  const log = (m: string) => logEvent(t.id, 'info', m);
  await updateTenant(t.id, { status: 'moving', error: null });
  await refreshOnPool(t);
  let created: { dbName?: string; serviceId?: string; port?: number } = {};
  try {
    await log('Creating dedicated database…');
    const db = await provider.createDatabase(t.slug);
    created.dbName = db.dbName;
    await log(`Database ${db.dbName} created; creating dedicated backend…`);
    const fresh = (await getTenant(t.slug))!;
    const be = await provider.createBackend({ ...fresh, db_name: db.dbName }, db.url);
    created = { ...created, serviceId: be.serviceId, port: be.port };
    await log(`Backend at ${be.apiUrl}; waiting for it to migrate and start…`);
    if (!(await waitForHealth(t, be.apiUrl, env.PROVISIONER === 'cloud' ? 20 : 3))) throw new Error('Dedicated backend did not become healthy');

    await log('Copying data from the pool…');
    await copySchemaToDatabase(schemaFor(t.slug), db.url, log);

    await updateTenant(t.id, {
      placement: 'dedicated', pool_id: null, api_url: be.apiUrl, db_name: db.dbName,
      service_id: be.serviceId ?? null, port: be.port ?? null, status: 'active', health_ok: true, health_at: new Date(),
    });
    const kept = (await poolCall(`/tenants/${t.slug}/retire`, { method: 'POST' })) as { keptAs?: string };
    await log(`Moved to dedicated. The pool's copy is kept as schema ${kept?.keptAs ?? '(renamed)'}.`);
  } catch (err) {
    const message = errorText(err);
    // The pool's data was only read, so the institute simply stays pooled.
    await updateTenant(t.id, { status: 'active', error: `Move failed: ${message}` });
    await refreshOnPool(t);
    await logEvent(t.id, 'error', `Move failed, still on the pool: ${message}`);
    const partial = { ...t, db_name: created.dbName ?? null, service_id: created.serviceId ?? null, port: created.port ?? null };
    await provider.deleteBackend(partial).catch(() => {});
    if (created.dbName) await provider.deleteDatabase(partial).catch(() => {});
  }
}

export async function suspendTenant(t: Tenant) {
  if (t.placement !== 'pooled') await provider.suspend(t);
  await updateTenant(t.id, { status: 'suspended' });
  await refreshOnPool(t);
  await logEvent(t.id, 'warn', 'Suspended: its site now shows "Account suspended"');
}

export async function resumeTenant(t: Tenant) {
  if (t.placement !== 'pooled') await provider.resume(t);
  await updateTenant(t.id, { status: 'active' });
  await refreshOnPool(t);
  await logEvent(t.id, 'info', 'Resumed');
}

/** Removes the backend and the database — the institute's data is gone. */
export async function deleteTenant(t: Tenant) {
  await updateTenant(t.id, { status: 'deleting' });
  await logEvent(t.id, 'warn', 'Deleting backend and database…');
  if (t.placement === 'pooled') {
    await poolCall(`/tenants/${t.slug}`, { method: 'DELETE' });
  } else if (t.provider !== 'external') {
    await provider.deleteBackend(t);
    await provider.deleteDatabase(t);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

import { env, tenantWebUrl } from './env.js';
import { getTenant, logEvent, pool, updateTenant, type Tenant } from './db.js';
import { cloudProvider } from './providers/cloud.js';
import { localProvider } from './providers/local.js';
import type { Provider } from './providers/types.js';

export const provider: Provider = env.PROVISIONER === 'cloud' ? cloudProvider : localProvider;

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
    const message = err instanceof Error ? err.message : String(err);
    await updateTenant(t!.id, { status: 'failed', error: message });
    await logEvent(t!.id, 'error', message);
  }
}

export async function suspendTenant(t: Tenant) {
  await provider.suspend(t);
  await updateTenant(t.id, { status: 'suspended' });
  await logEvent(t.id, 'warn', 'Suspended: its site now shows "Account suspended"');
}

export async function resumeTenant(t: Tenant) {
  await provider.resume(t);
  await updateTenant(t.id, { status: 'active' });
  await logEvent(t.id, 'info', 'Resumed');
}

/** Removes the backend and the database — the institute's data is gone. */
export async function deleteTenant(t: Tenant) {
  await updateTenant(t.id, { status: 'deleting' });
  await logEvent(t.id, 'warn', 'Deleting backend and database…');
  if (t.provider !== 'external') {
    await provider.deleteBackend(t);
    await provider.deleteDatabase(t);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

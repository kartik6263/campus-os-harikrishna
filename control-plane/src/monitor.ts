import { logEvent, pool, updateTenant, type Tenant } from './db.js';

/**
 * Health across every institute: each active backend's /api/health, with a
 * logged event whenever one goes down or comes back.
 */
export async function checkAll() {
  const { rows } = await pool.query<Tenant>("SELECT * FROM tenants WHERE status = 'active' AND api_url IS NOT NULL");
  await Promise.all(rows.map(async (t) => {
    let ok = false;
    try {
      const res = await fetch(`${t.api_url}/api/health`, { signal: AbortSignal.timeout(60_000) });
      ok = res.ok;
    } catch { ok = false; }
    if (t.health_ok !== null && t.health_ok !== ok) {
      await logEvent(t.id, ok ? 'info' : 'error', ok ? 'Backend is healthy again' : 'Backend is not responding');
    }
    await updateTenant(t.id, { health_ok: ok, health_at: new Date() });
  }));
}

export function startMonitor(intervalSeconds: number) {
  const tick = () => { checkAll().catch((err) => console.error('Health check failed:', err)); };
  setTimeout(tick, 10_000);
  return setInterval(tick, intervalSeconds * 1000);
}

import { env } from './env.js';
import { migrate, pool, type Tenant } from './db.js';
import { provider, provisionTenant } from './provision.js';
import { startMonitor } from './monitor.js';
import { createApp } from './app.js';

await migrate();

const { rows } = await pool.query<Tenant>('SELECT * FROM tenants');
await provider.onBoot?.(rows);

// A restart (redeploy, or a free instance sleeping) drops any in-progress
// provisioning; pick those institutes up again from where they stopped.
for (const t of rows) {
  if (t.placement === 'dedicated' && ['provisioning', 'deploying'].includes(t.status)) void provisionTenant(t.slug);
}

createApp().listen(env.PORT, (err?: Error) => {
  // Express 5 reports a failed bind here rather than throwing.
  if (err) {
    console.error(`Could not start on port ${env.PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Resolion control plane on http://localhost:${env.PORT} (provisioner: ${env.PROVISIONER})`);
});
startMonitor(env.HEALTH_INTERVAL_SECONDS);

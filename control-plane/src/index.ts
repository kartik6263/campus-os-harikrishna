import { env } from './env.js';
import { migrate, pool, type Tenant } from './db.js';
import { provider } from './provision.js';
import { startMonitor } from './monitor.js';
import { createApp } from './app.js';

await migrate();

const { rows } = await pool.query<Tenant>('SELECT * FROM tenants');
await provider.onBoot?.(rows);

createApp().listen(env.PORT, () => {
  console.log(`Resolion control plane on http://localhost:${env.PORT} (provisioner: ${env.PROVISIONER})`);
});
startMonitor(env.HEALTH_INTERVAL_SECONDS);

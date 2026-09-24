// Production start: bring the database(s) up to date, then serve.
//
// A dedicated deployment (one institute) migrates its database and prepares
// it (scripts/seed-if-empty.mjs). A shared pool (POOL_MODE=true) migrates
// every institute's schema on it, so one deploy upgrades all of them.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

function run(command, env = {}) {
  const r = spawnSync(command, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`"${command}" failed (${r.status}); not starting.`);
    process.exit(r.status ?? 1);
  }
}

if (process.env.POOL_MODE === 'true') {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't\\_%' ORDER BY 1");
  await client.end();

  console.log(`Shared pool ${process.env.POOL_ID ?? ''}: migrating ${rows.length} institute schema(s)…`);
  for (const { nspname } of rows) {
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', nspname);
    console.log(`→ ${nspname}`);
    run('npx prisma migrate deploy', { DATABASE_URL: url.toString() });
  }
} else {
  run('npx prisma migrate deploy');
  run('node scripts/seed-if-empty.mjs');
}

run('node dist/src/index.js');

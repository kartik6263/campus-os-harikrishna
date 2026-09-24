/**
 * Local Postgres for development.
 *
 * Downloads and runs a real Postgres server from node_modules — no system
 * install, no Docker. Data lives in `.pgdata/` (git-ignored).
 *
 * In any other environment (Neon, Supabase, RDS, a system Postgres) you do not
 * need this: just point DATABASE_URL at that server and skip `db:start`.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const PG = {
  user: 'campus',
  password: 'campus',
  port: 5433,
  database: 'campusos',
  dataDir: path.join(root, '.pgdata'),
};

function create() {
  return new EmbeddedPostgres({
    databaseDir: PG.dataDir,
    user: PG.user,
    password: PG.password,
    port: PG.port,
    persistent: true,
  });
}

const cmd = process.argv[2];

if (cmd === 'start') {
  const pg = create();
  const fs = await import('node:fs');
  if (!fs.existsSync(PG.dataDir)) {
    console.log('Initialising cluster in .pgdata …');
    await pg.initialise();
  }
  await pg.start();

  // Create the database explicitly as UTF8 from template0. On a Windows host
  // initdb picks the system locale (WIN1252), which cannot store the Hindi
  // copy this app ships — inserts fail with "no equivalent in encoding".
  const { Client } = await import('pg');
  const admin = new Client({
    host: 'localhost',
    port: PG.port,
    user: PG.user,
    password: PG.password,
    database: 'postgres',
  });
  await admin.connect();
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [PG.database]);
  if (existing.rowCount === 0) {
    await admin.query(
      `CREATE DATABASE "${PG.database}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    console.log(`Created database "${PG.database}" (UTF8).`);
  }
  await admin.end();
  console.log(`Postgres listening on port ${PG.port}.`);
  console.log(`DATABASE_URL="postgresql://${PG.user}:${PG.password}@localhost:${PG.port}/${PG.database}"`);
  console.log('Leave this process running; Ctrl-C to stop.');
  process.on('SIGINT', async () => {
    await pg.stop();
    process.exit(0);
  });
  await new Promise(() => {});
} else if (cmd === 'stop') {
  await create().stop();
  console.log('Postgres stopped.');
} else {
  console.error('Usage: tsx scripts/pg.ts start|stop');
  process.exit(1);
}

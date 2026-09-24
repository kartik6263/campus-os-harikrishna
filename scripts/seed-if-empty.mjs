// Loads the demo data on a brand-new database, and never again.
//
// prisma/seed.ts wipes every table before it inserts, so running it on each
// deploy would erase real data. This checks for existing users first.
import { execSync } from 'node:child_process';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
await client.end();

if (rows[0].n > 0) {
  console.log(`Database already has ${rows[0].n} users; skipping seed.`);
} else {
  console.log('Empty database; loading demo data…');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
}

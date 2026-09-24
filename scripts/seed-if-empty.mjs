// Loads the demo data on a brand-new database, and never again.
//
// prisma/seed.ts wipes every table before it inserts, so running it on each
// deploy would erase real data. This checks for existing users first.
//
// One exception: a database still holding the old institution-specific demo
// (its admin account was admin@jiwaji.ac.in) is re-seeded once with the
// neutral Resolion demo. That account exists nowhere else, and the re-seed
// removes it, so this can fire at most once and never on a customer's data.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
const legacy = await client.query("SELECT 1 FROM users WHERE email = 'admin@jiwaji.ac.in' LIMIT 1");
await client.end();

if (legacy.rowCount > 0) {
  console.log('Old demo data found; replacing it with the neutral Resolion demo…');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
} else if (rows[0].n > 0) {
  console.log(`Database already has ${rows[0].n} users; skipping seed.`);
} else {
  console.log('Empty database; loading demo data…');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
}

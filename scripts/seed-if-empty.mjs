// Prepares the database on start.
//
// A real institute's deployment starts empty: this writes its institution
// profile (from INSTITUTION_* settings) and a first campus, and nothing else,
// so the sign-in page offers "Create IT Cell account". The demo deployment
// sets SEED_DEMO=true and gets the full demo data instead.
//
// prisma/seed.ts wipes every table before it inserts, so it only ever runs on
// an empty database. One exception: a database still holding the old
// institution-specific demo (its admin was admin@jiwaji.ac.in) is re-seeded
// once with the neutral demo; that account exists nowhere else.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
const legacy = await client.query("SELECT 1 FROM users WHERE email = 'admin@jiwaji.ac.in' LIMIT 1");
const demo = process.env.SEED_DEMO === 'true';

if (legacy.rowCount > 0) {
  await client.end();
  console.log('Old demo data found; replacing it with the neutral Resolion demo…');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
} else if (rows[0].n > 0) {
  await client.end();
  console.log(`Database already has ${rows[0].n} users; nothing to prepare.`);
} else if (demo) {
  await client.end();
  console.log('Empty database and SEED_DEMO=true; loading demo data…');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
} else {
  // A new institute: its profile and one campus, so the IT Cell can start.
  const name = process.env.INSTITUTION_NAME?.trim() || 'New Institution';
  const shortCode = (process.env.INSTITUTION_SHORT_CODE?.trim() || name.replace(/[^A-Za-z ]/g, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 6) || 'INST').toUpperCase();
  const kind = process.env.INSTITUTION_KIND?.trim() || 'University';

  await client.query(
    `INSERT INTO institution (id, name, "shortCode", kind, country, "updatedAt")
     VALUES ('default', $1, $2, $3, 'India', now())
     ON CONFLICT (id) DO NOTHING`,
    [name, shortCode, kind],
  );
  const colleges = await client.query('SELECT count(*)::int AS n FROM colleges');
  if (colleges.rows[0].n === 0) {
    await client.query(
      `INSERT INTO colleges (id, code, name, "createdAt") VALUES ($1, $2, $3, now())`,
      [`col_${Date.now().toString(36)}`, `${shortCode}-MAIN`, `${name} — Main Campus`],
    );
  }
  await client.end();
  console.log(`New institute "${name}" (${shortCode}) ready; waiting for its IT Cell to set up.`);
}

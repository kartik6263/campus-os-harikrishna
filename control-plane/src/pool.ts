import pg from 'pg';
import { env } from './env.js';

/** Calls the shared pool's control endpoints. */
export async function poolCall(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!env.POOL_API_URL || !env.POOL_SECRET) throw new Error('No shared pool is configured (POOL_API_URL, POOL_SECRET)');
  const res = await fetch(`${env.POOL_API_URL.replace(/\/$/, '')}/internal/pool${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.POOL_SECRET}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pool ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}

export const schemaFor = (slug: string) => `t_${slug.replace(/-/g, '_')}`;

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Copies one institute's data from its schema on the pool into its new
 * dedicated database, which has already been migrated to the same version.
 *
 * Runs as one transaction on the target with every foreign key deferred to
 * commit, so tables can be filled in any order (cycles included) without
 * superuser rights; row counts are checked table by table before commit.
 */
export async function copySchemaToDatabase(schema: string, targetUrl: string, log: (m: string) => Promise<void>) {
  if (!env.POOL_DATABASE_URL) throw new Error('POOL_DATABASE_URL is needed to move an institute off the pool');
  const source = new pg.Client({ connectionString: env.POOL_DATABASE_URL });
  const target = new pg.Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();

  try {
    const { rows: tables } = await source.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
        ORDER BY table_name`,
      [schema],
    );
    const { rows: fks } = await target.query<{ table_name: string; conname: string }>(
      `SELECT c.relname AS table_name, con.conname
         FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f' AND n.nspname = 'public'`,
    );

    // Constraint changes are schema DDL; do them outside the data transaction.
    for (const fk of fks) await target.query(`ALTER TABLE ${q(fk.table_name)} ALTER CONSTRAINT ${q(fk.conname)} DEFERRABLE INITIALLY DEFERRED`);

    let total = 0;
    try {
      await target.query('BEGIN');
      await target.query('SET CONSTRAINTS ALL DEFERRED');
      // The new backend wrote a starting profile and campus; the copy replaces them.
      await target.query(`TRUNCATE ${tables.map((t) => q(t.table_name)).join(', ')} CASCADE`);

      for (const { table_name } of tables) {
        const { rows } = await source.query(`SELECT * FROM ${q(schema)}.${q(table_name)}`);
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]!);
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const values: unknown[] = [];
          const tuples = batch.map((row) => `(${cols.map((c) => {
            const v = row[c];
            // node-pg sends objects as JSON, which is right for json columns only.
            values.push(v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v);
            return `$${values.length}`;
          }).join(', ')})`);
          await target.query(`INSERT INTO ${q(table_name)} (${cols.map(q).join(', ')}) VALUES ${tuples.join(', ')}`, values);
        }
        const { rows: [check] } = await target.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${q(table_name)}`);
        if (check!.n !== rows.length) throw new Error(`${table_name}: copied ${check!.n} of ${rows.length} rows`);
        total += rows.length;
      }

      // Auto-numbered columns continue after the copied rows.
      const { rows: seqCols } = await target.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND (column_default LIKE 'nextval%' OR is_identity = 'YES')`,
      );
      for (const s of seqCols) {
        await target.query(
          `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT max(${q(s.column_name)}) FROM ${q(s.table_name)}), 1),
                  (SELECT max(${q(s.column_name)}) FROM ${q(s.table_name)}) IS NOT NULL)`,
          [s.table_name, s.column_name],
        );
      }

      await target.query('COMMIT'); // deferred foreign keys are all checked here
    } catch (err) {
      await target.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      for (const fk of fks) {
        await target.query(`ALTER TABLE ${q(fk.table_name)} ALTER CONSTRAINT ${q(fk.conname)} NOT DEFERRABLE`).catch(() => {});
      }
    }
    await log(`Copied ${total} rows across ${tables.length} tables`);
  } finally {
    await source.end();
    await target.end();
  }
}

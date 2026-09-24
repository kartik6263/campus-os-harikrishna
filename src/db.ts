import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

// Prisma 7 takes the connection through a driver adapter rather than reading
// the URL from schema.prisma. Swapping to Neon/Supabase/RDS is just a change
// of DATABASE_URL — no code change here.
const log: Array<'warn' | 'error'> = ['warn', 'error'];
const baseClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }), log });

// ─── Shared pool (Phase 2) ────────────────────────────────────────────────────
//
// On a pool, one backend serves many institutes, each in its own Postgres
// schema of the same database. The request's institute is held in async
// context, and `prisma` below resolves to that institute's client — so every
// module keeps importing `prisma` and is scoped without knowing it.

export interface TenantContext {
  slug: string;
  schema: string;
  client: PrismaClient;
}

export const tenantContext = new AsyncLocalStorage<TenantContext>();

/** The schema an institute's data lives in on a pool. */
export const schemaFor = (slug: string) => `t_${slug.replace(/-/g, '_')}`;

const tenantClients = new Map<string, PrismaClient>();
const MAX_OPEN_TENANTS = 50;

/** One client per institute, opened on first use, least-recently-used closed. */
export function clientForSchema(schema: string): PrismaClient {
  let client = tenantClients.get(schema);
  if (client) {
    tenantClients.delete(schema); // re-insert: most recently used last
  } else {
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: env.POOL_TENANT_CONNECTIONS }, { schema }),
      log,
    });
    if (tenantClients.size >= MAX_OPEN_TENANTS) {
      const [oldest, old] = tenantClients.entries().next().value!;
      tenantClients.delete(oldest);
      void old.$disconnect();
    }
  }
  tenantClients.set(schema, client);
  return client;
}

/** The institute handling this request, on a pool; undefined otherwise. */
export const currentTenant = () => tenantContext.getStore();

/**
 * The database for whoever is asking: this request's institute on a pool,
 * the deployment's own database otherwise.
 */
export const prisma: PrismaClient = new Proxy(baseClient, {
  get(target, prop) {
    const client = tenantContext.getStore()?.client ?? target;
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export async function disconnect() {
  await Promise.all([baseClient.$disconnect(), ...[...tenantClients.values()].map((c) => c.$disconnect())]);
}

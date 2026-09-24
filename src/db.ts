import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

// Prisma 7 takes the connection through a driver adapter rather than reading
// the URL from schema.prisma. Swapping to Neon/Supabase/RDS is just a change
// of DATABASE_URL — no code change here.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
});

export async function disconnect() {
  await prisma.$disconnect();
}

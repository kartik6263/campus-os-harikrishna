import { createApp } from './app.js';
import { env } from './env.js';
import { disconnect, prisma } from './db.js';

const app = createApp();

async function main() {
  // Fail fast with a clear message rather than on the first request.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error('Cannot reach the database at DATABASE_URL.');
    console.error('If you are using the bundled Postgres, run `npm run db:start` first.');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const server = app.listen(env.PORT, (err?: Error) => {
    // Express 5 reports a failed bind (e.g. port taken) here rather than throwing.
    if (err) {
      console.error(`Could not start on port ${env.PORT}: ${err.message}`);
      process.exit(1);
    }
    console.log(`Campus OS API listening on http://localhost:${env.PORT}`);
    console.log(`Health: http://localhost:${env.PORT}/api/health`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close();
    await disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Cloudflare Turnstile. Unset disables the check entirely. */
  TURNSTILE_SECRET_KEY: z.string().optional(),
  /** Browser origins whose sign-in and sign-up must pass Turnstile. */
  TURNSTILE_ORIGINS: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

/** The deployed web app, allowed whatever CORS_ORIGINS says. */
const WEB_APP_ORIGIN = 'https://campus-os-lime.vercel.app';

export const env = {
  ...parsed.data,
  corsOrigins: [
    ...new Set([...parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean), WEB_APP_ORIGIN]),
  ],
  turnstileOrigins: parsed.data.TURNSTILE_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};

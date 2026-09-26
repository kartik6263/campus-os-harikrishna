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
  /** The web app's address, for links in emails (password reset). */
  APP_URL: z.string().url().default('https://campus-os-lime.vercel.app'),
  /** Outgoing mail. Unset: reset links are not emailed. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // ── Phase 2: shared pool ──
  /** true: this backend serves many institutes, each in its own schema. */
  POOL_MODE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  /** Which pool this is; the control plane places institutes by this ID. */
  POOL_ID: z.string().default('pool-1'),
  /** The control plane, the authority on which institutes exist here. */
  CONTROL_PLANE_URL: z.string().url().optional(),
  /** Shared with the control plane for its create/remove calls. */
  POOL_SECRET: z.string().min(16).optional(),
  /** The link an institute's users open, with {slug}, for reset emails. */
  APP_URL_TEMPLATE: z.string().optional(),
  /** Database connections held per institute on a pool. */
  POOL_TENANT_CONNECTIONS: z.coerce.number().default(3),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

/** The deployed web apps (Vercel, and the Expo web build), allowed whatever CORS_ORIGINS says. */
const WEB_APP_ORIGINS = ['https://campus-os-lime.vercel.app', 'https://campus-os.expo.app'];

export const env = {
  ...parsed.data,
  corsOrigins: [
    ...new Set([...parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean), ...WEB_APP_ORIGINS]),
  ],
  turnstileOrigins: parsed.data.TURNSTILE_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};

if (env.POOL_MODE && (!env.CONTROL_PLANE_URL || !env.POOL_SECRET)) {
  console.error('POOL_MODE=true needs CONTROL_PLANE_URL and POOL_SECRET.');
  process.exit(1);
}

/**
 * Whether a browser origin is in a list. An entry like
 * `https://*.campusos.com` admits every institute's subdomain — which a
 * shared pool needs, since it serves all of them.
 */
export function originAllowed(list: string[], origin: string): boolean {
  return list.some((entry) => {
    if (!entry.includes('*.')) return entry === origin;
    const [scheme, host] = entry.split('*.');
    return origin.startsWith(scheme!) && origin.endsWith(`.${host}`) && !origin.slice(scheme!.length, -host!.length - 1).includes('/');
  });
}

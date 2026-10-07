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

  /** true on the demo deployment: registers may be filled with sample rows. */
  SEED_DEMO: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  /** Claude, for the campus assistant. Unset: the assistant answers from its built-in reports only. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),

  /** Razorpay. Unset: fees are settled by the simulated path (demo only). */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  /** Signs the payment.captured webhook — the backstop if a browser closes mid-payment. */
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  /**
   * DigiLocker (MeitY), as a Requester: the institute's client ID and secret
   * from partners.digilocker.gov.in. Unset: profiles are verified by the
   * office from uploaded proof instead.
   */
  DIGILOCKER_CLIENT_ID: z.string().optional(),
  DIGILOCKER_CLIENT_SECRET: z.string().optional(),
  /** Registered with DigiLocker. Defaults to the web app's address (APP_URL + "/"). */
  DIGILOCKER_REDIRECT_URI: z.string().url().optional(),
  DIGILOCKER_API_BASE: z.string().url().default('https://digilocker.meripehchaan.gov.in/public/oauth2'),

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

// A blank line in an env file (KEY=) means "not set", not "set to nothing":
// otherwise an empty MAIL_FROM becomes the sender, an empty URL fails to parse.
for (const [key, value] of Object.entries(process.env)) {
  if (value === '') delete process.env[key];
}

// The local .env has long used TURNSTILE_SECRET; accept it rather than
// silently running with the captcha switched off.
if (!process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SECRET) {
  process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET;
}

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

/**
 * The public demo's web apps (Vercel, and the Expo web build). Only the demo
 * deployment admits them unasked; an institute's own server trusts nothing
 * but its CORS_ORIGINS.
 */
const DEMO_WEB_APP_ORIGINS = ['https://campus-os-lime.vercel.app', 'https://campus-os.expo.app'];

export const env = {
  ...parsed.data,
  corsOrigins: [
    ...new Set([
      ...parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
      ...(parsed.data.SEED_DEMO ? DEMO_WEB_APP_ORIGINS : []),
    ]),
  ],
  turnstileOrigins: parsed.data.TURNSTILE_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};

// A production server refuses to start on secrets anyone could guess: every
// session token is only as strong as these two strings.
if (env.isProd) {
  const problems: string[] = [];
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = env[key];
    if (value.length < 32) problems.push(`${key} must be at least 32 characters`);
    if (/replace-me|change-?me|^dev[-_]|^(secret|password)$/i.test(value)) problems.push(`${key} looks like a placeholder`);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  // Otherwise password-reset links would point at the public demo.
  if (!env.SEED_DEMO && !process.env.APP_URL) problems.push('APP_URL must be set to the address people open');
  if (env.TURNSTILE_SECRET_KEY?.startsWith('1x0000000000000000000000000000000')) {
    problems.push("TURNSTILE_SECRET_KEY is Cloudflare's always-pass test key");
  }
  if (problems.length) {
    console.error('Refusing to start in production:\n  - ' + problems.join('\n  - '));
    console.error('Generate secrets with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
    process.exit(1);
  }
}

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

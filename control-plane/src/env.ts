import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4500),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  /** The control plane's own registry database (not any institute's). */
  DATABASE_URL: z.string().min(1),
  /** Owner sign-in for this panel, and the key its sessions are signed with. */
  CONTROL_PLANE_PASSWORD: z.string().min(10),
  CONTROL_PLANE_SECRET: z.string().min(16),

  /** "local" runs institutes on this machine (testing); "cloud" uses Neon + Render. */
  PROVISIONER: z.enum(['local', 'cloud']).default('local'),

  /** Institutes live at <slug>.BASE_DOMAIN once a domain is set up. */
  BASE_DOMAIN: z.string().optional(),
  /** The shared web app, used with ?tenant=<slug> until BASE_DOMAIN exists. */
  WEB_APP_URL: z.string().url().default('https://campus-os-lime.vercel.app'),

  // ── cloud: Neon (one database per institute, inside one Neon project) ──
  NEON_API_KEY: z.string().optional(),
  NEON_PROJECT_ID: z.string().optional(),
  NEON_BRANCH_ID: z.string().optional(),
  NEON_ROLE_NAME: z.string().default('neondb_owner'),

  // ── cloud: Render (one web service per institute, same repo) ──
  RENDER_API_KEY: z.string().optional(),
  RENDER_OWNER_ID: z.string().optional(),
  GITHUB_REPO_URL: z.string().default('https://github.com/kartik6263/campus-os-harikrishna'),
  GITHUB_BRANCH: z.string().default('main'),
  RENDER_REGION: z.string().default('singapore'),
  RENDER_PLAN: z.string().default('starter'),
  /** Passed to every institute's backend (same mail account for resets). */
  TENANT_SMTP_HOST: z.string().optional(),
  TENANT_SMTP_PORT: z.string().optional(),
  TENANT_SMTP_USER: z.string().optional(),
  TENANT_SMTP_PASS: z.string().optional(),
  TENANT_MAIL_FROM: z.string().optional(),

  // ── local: institutes run as processes against the local Postgres ──
  LOCAL_PG_URL: z.string().default('postgresql://campus:campus@localhost:5433/postgres'),
  LOCAL_BACKEND_DIR: z.string().default('..'),
  LOCAL_FIRST_PORT: z.coerce.number().default(4101),

  HEALTH_INTERVAL_SECONDS: z.coerce.number().default(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid control-plane configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

if (env.PROVISIONER === 'cloud') {
  const missing = ['NEON_API_KEY', 'NEON_PROJECT_ID', 'NEON_BRANCH_ID', 'RENDER_API_KEY', 'RENDER_OWNER_ID']
    .filter((k) => !env[k as keyof typeof env]);
  if (missing.length) {
    console.error(`PROVISIONER=cloud needs: ${missing.join(', ')}`);
    process.exit(1);
  }
}

/** The address an institute's users open. */
export function tenantWebUrl(slug: string): string {
  return env.BASE_DOMAIN ? `https://${slug}.${env.BASE_DOMAIN}` : `${env.WEB_APP_URL.replace(/\/$/, '')}/?tenant=${slug}`;
}

/** The browser origin an institute's backend must accept. */
export function tenantOrigin(slug: string): string {
  return env.BASE_DOMAIN ? `https://${slug}.${env.BASE_DOMAIN}` : new URL(env.WEB_APP_URL).origin;
}

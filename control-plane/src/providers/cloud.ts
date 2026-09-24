import { env, tenantOrigin, tenantWebUrl } from '../env.js';
import type { Tenant } from '../db.js';
import type { Provider } from './types.js';

const NEON = 'https://console.neon.tech/api/v2';
const RENDER = 'https://api.render.com/v1';

async function call<T>(base: string, key: string, path: string, init: RequestInit = {}, retries = 0): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });
  // Neon refuses a change while another is running on the project; wait and retry.
  if (res.status === 423 && retries < 10) {
    await new Promise((r) => setTimeout(r, 3000));
    return call<T>(base, key, path, init, retries + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${base}${path} → ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const neon = <T>(path: string, init?: RequestInit) => call<T>(NEON, env.NEON_API_KEY!, path, init);
const render = <T>(path: string, init?: RequestInit) => call<T>(RENDER, env.RENDER_API_KEY!, path, init);

const dbNameFor = (slug: string) => `t_${slug.replace(/-/g, '_')}`;

/**
 * Production provisioning: a database in the shared Neon project, and a Render
 * web service built from the same repository and branch as every other
 * institute — so one push deploys all of them.
 */
export const cloudProvider: Provider = {
  name: 'cloud',

  async createDatabase(slug) {
    const dbName = dbNameFor(slug);
    const branch = env.NEON_BRANCH_ID!;
    await neon(`/projects/${env.NEON_PROJECT_ID}/branches/${branch}/databases`, {
      method: 'POST',
      body: JSON.stringify({ database: { name: dbName, owner_name: env.NEON_ROLE_NAME } }),
    });
    return { dbName, url: await this.databaseUrlFor(dbName) };
  },

  async databaseUrlFor(dbName) {
    const q = new URLSearchParams({ database_name: dbName, role_name: env.NEON_ROLE_NAME, branch_id: env.NEON_BRANCH_ID!, pooled: 'false' });
    const { uri } = await neon<{ uri: string }>(`/projects/${env.NEON_PROJECT_ID}/connection_uri?${q}`);
    return uri;
  },

  async createBackend(tenant, databaseUrl) {
    const origin = tenantOrigin(tenant.slug);
    const envVars: Array<{ key: string; value?: string; generateValue?: boolean }> = [
      { key: 'NODE_ENV', value: 'production' },
      { key: 'DATABASE_URL', value: databaseUrl },
      { key: 'JWT_ACCESS_SECRET', generateValue: true },
      { key: 'JWT_REFRESH_SECRET', generateValue: true },
      { key: 'CORS_ORIGINS', value: origin },
      { key: 'TURNSTILE_ORIGINS', value: origin },
      { key: 'APP_URL', value: tenantWebUrl(tenant.slug) },
      { key: 'SEED_DEMO', value: 'false' },
      { key: 'INSTITUTION_NAME', value: tenant.name },
      { key: 'INSTITUTION_KIND', value: tenant.kind },
      ...(tenant.short_code ? [{ key: 'INSTITUTION_SHORT_CODE', value: tenant.short_code }] : []),
      ...(['HOST', 'PORT', 'USER', 'PASS'] as const)
        .filter((k) => env[`TENANT_SMTP_${k}`])
        .map((k) => ({ key: `SMTP_${k}`, value: env[`TENANT_SMTP_${k}`]! })),
      ...(env.TENANT_MAIL_FROM ? [{ key: 'MAIL_FROM', value: env.TENANT_MAIL_FROM }] : []),
    ];

    const { service } = await render<{ service: { id: string; serviceDetails?: { url?: string }; url?: string } }>('/services', {
      method: 'POST',
      body: JSON.stringify({
        type: 'web_service',
        name: `rcos-${tenant.slug}`,
        ownerId: env.RENDER_OWNER_ID,
        repo: env.GITHUB_REPO_URL,
        branch: env.GITHUB_BRANCH,
        autoDeploy: 'yes',
        envVars,
        serviceDetails: {
          runtime: 'node',
          plan: env.RENDER_PLAN,
          region: env.RENDER_REGION,
          healthCheckPath: '/api/health',
          envSpecificDetails: {
            buildCommand: 'npm install --include=dev && npm run build',
            startCommand: 'npm start',
          },
        },
      }),
    });
    const apiUrl = service.serviceDetails?.url ?? service.url;
    if (!apiUrl) throw new Error('Render created the service but returned no URL');
    return { apiUrl, serviceId: service.id };
  },

  async suspend(t) {
    if (t.service_id) await render(`/services/${t.service_id}/suspend`, { method: 'POST' });
  },
  async resume(t) {
    if (t.service_id) await render(`/services/${t.service_id}/resume`, { method: 'POST' });
  },
  async deleteBackend(t) {
    if (t.service_id) await render(`/services/${t.service_id}`, { method: 'DELETE' });
  },
  async deleteDatabase(t) {
    if (t.db_name) {
      await neon(`/projects/${env.NEON_PROJECT_ID}/branches/${env.NEON_BRANCH_ID}/databases/${t.db_name}`, { method: 'DELETE' });
    }
  },
};

import type { Tenant } from '../db.js';

/** Where an institute's database and backend are created. */
export interface Provider {
  readonly name: 'local' | 'cloud';
  /** A new, empty database for the institute; returns its name and URL. */
  createDatabase(slug: string): Promise<{ dbName: string; url: string }>;
  /** The connection URL of a database created earlier (for a retry). */
  databaseUrlFor(dbName: string): Promise<string>;
  /** The institute's own backend, from the shared codebase, on that database. */
  createBackend(tenant: Tenant, databaseUrl: string): Promise<{ apiUrl: string; serviceId?: string; port?: number }>;
  suspend(tenant: Tenant): Promise<void>;
  resume(tenant: Tenant): Promise<void>;
  deleteBackend(tenant: Tenant): Promise<void>;
  deleteDatabase(tenant: Tenant): Promise<void>;
  /** Called once when the control plane starts. */
  onBoot?(tenants: Tenant[]): Promise<void>;
}

/** Environment every institute's backend starts with. */
export interface TenantEnv {
  [key: string]: string;
}

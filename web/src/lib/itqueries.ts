/**
 * Server state for the IT console (Phase 9).
 *
 * The three things the console can actually do — administer accounts, edit
 * the permission matrix, and read the audit chain — come from here. The org
 * tree and the workflow designer have no backend and stay on their mocks.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type ApiRole =
  | 'STUDENT' | 'PARENT' | 'FACULTY' | 'OFFICE' | 'PRINCIPAL' | 'REGISTRAR' | 'ADMIN';

export interface ApiAccount {
  id: string;
  email: string;
  role: ApiRole;
  name: string;
  identifier: string | null;
  isActive: boolean;
  locked: boolean;
  lockedAt: string | null;
  lockReason: string | null;
  failedAttempts: number;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  neverSignedIn: boolean;
  status: 'active' | 'locked' | 'pending' | 'disabled';
}

export interface ApiPermissionRule {
  id: string;
  role: ApiRole;
  module: string;
  action: string;
  effect: 'ALLOW' | 'DENY';
  note: string | null;
  updatedAt: string;
}

export interface ApiAuditEntry {
  id: string;
  seq: number;
  occurredAt: string;
  actor: string;
  actorRole: string | null;
  module: string;
  action: string;
  target: string;
  detail: string | null;
  ip: string | null;
  outcome: 'OK' | 'WARN' | 'DENIED';
  hash: string;
  prevHash: string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  users: ['it', 'users'] as const,
  permissions: ['it', 'permissions'] as const,
  audit: ['it', 'audit'] as const,
  verify: ['it', 'audit', 'verify'] as const,
};

export const useAccounts = () =>
  useQuery({
    queryKey: keys.users,
    queryFn: () =>
      api<{
        totals: { total: number; active: number; locked: number; pending: number; disabled: number };
        byRole: Record<string, number>;
        users: ApiAccount[];
      }>('/api/it/users'),
  });

export const usePermissionMatrix = () =>
  useQuery({
    queryKey: keys.permissions,
    queryFn: () =>
      api<{
        modules: string[];
        actions: string[];
        defaultEffect: 'ALLOW';
        denials: number;
        rules: ApiPermissionRule[];
      }>('/api/it/permissions'),
  });

export const useAuditLog = () =>
  useQuery({
    queryKey: keys.audit,
    queryFn: () =>
      api<{
        totals: { returned: number; denied: number; warnings: number };
        entries: ApiAuditEntry[];
      }>('/api/it/audit?limit=200'),
  });

/** Walks the chain on the server and reports the first break. */
export const useChainCheck = () =>
  useQuery({
    queryKey: keys.verify,
    queryFn: () =>
      api<{
        entries: number;
        intact: boolean;
        brokenAt: { seq: number; id: string; reason: string } | null;
      }>('/api/it/audit/verify'),
    // Only on demand: verifying is itself an audited act.
    enabled: false,
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useLockAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, locked, reason }: { id: string; locked: boolean; reason?: string }) =>
      api<{ email: string; locked: boolean; sessionsRevoked: boolean }>(
        `/api/it/users/${id}/lock`,
        { method: 'POST', body: { locked, reason } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['it'] }),
  });
}

export type ProvisionRole = 'STUDENT' | 'PARENT' | 'FACULTY' | 'PRINCIPAL' | 'OFFICE' | 'REGISTRAR' | 'ADMIN';

/** Colleges and programmes the Create User form offers. */
export const useProvisioningOptions = () =>
  useQuery({
    queryKey: ['it', 'provisioning-options'],
    queryFn: () =>
      api<{
        colleges: Array<{ id: string; code: string; name: string }>;
        programmes: Array<{ id: string; code: string; name: string; collegeId: string | null; years: number }>;
      }>('/api/it/provisioning-options'),
  });

/** Adds a campus / college / school wing. */
export function useAddCollege() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; district?: string }) =>
      api<{ id: string; code: string; name: string }>('/api/it/colleges', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['it', 'provisioning-options'] }),
  });
}

/** Adds a programme — a course, or a class/grade. */
export function useAddProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; years: number; collegeId?: string }) =>
      api<{ id: string; code: string; name: string }>('/api/it/programmes', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['it', 'provisioning-options'] }),
  });
}

/** Issues a user ID and starting password for any role. */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ id: string; email: string; name: string; role: ProvisionRole; temporaryPassword?: string }>(
        '/api/it/users',
        { method: 'POST', body },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['it', 'users'] }),
  });
}

/** Approves a requested account, or disables an active one. */
export function useActivateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<{ email: string; isActive: boolean }>(
        `/api/it/users/${id}/activate`,
        { method: 'POST', body: { active } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['it'] }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ email: string; temporaryPassword: string; mustChangePassword: boolean }>(
        `/api/it/users/${id}/reset-password`,
        { method: 'POST' },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['it'] }),
  });
}

export function useSetPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      role: ApiRole;
      module: string;
      action: string;
      effect: 'ALLOW' | 'DENY';
      note?: string;
    }) => api<ApiPermissionRule>('/api/it/permissions', { method: 'PUT', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.permissions }),
  });
}

// ═══ Legacy adapters ═════════════════════════════════════════════════════════

export type UserStatus = 'active' | 'locked' | 'pending' | 'disabled';
export type UserRole = string;

export interface LegacyITUser {
  id: string;
  accountId: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  orgUnit: string;
  orgCode: string;
  status: UserStatus;
  lastLogin: string;
  createdAt: string;
  credentialSent: boolean;
  mfaEnabled: boolean;
  failedAttempts: number;
  lockReason: string | null;
  mustChangePassword: boolean;
}

/** The console's own words for a role. */
const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  PARENT: 'Parent',
  FACULTY: 'Faculty',
  OFFICE: 'Office',
  PRINCIPAL: 'Principal',
  REGISTRAR: 'Registrar',
  ADMIN: 'IT Cell Admin',
};

/** `USERS` as the accounts screen expects it. */
export function useAccountList() {
  const q = useAccounts();

  const data = useMemo(
    () =>
      (q.data?.users ?? []).map<LegacyITUser>((u) => ({
        // The screen prints `id`; the identifier is the meaningful one.
        id: u.identifier ?? u.email,
        accountId: u.id,
        name: u.name,
        email: u.email,
        // Not held on the account record; the person's own record has it.
        mobile: '—',
        role: ROLE_LABEL[u.role] ?? u.role,
        orgUnit: 'Govt. Model College, Demo City',
        orgCode: 'RDU-AC-002',
        status: u.status,
        lastLogin: u.lastLoginAt ? formatDate(u.lastLoginAt) : '—',
        createdAt: formatDate(u.createdAt),
        // An account that has signed in has had its credentials used.
        credentialSent: !u.neverSignedIn,
        // Not a thing this build has; shown as off rather than invented.
        mfaEnabled: false,
        failedAttempts: u.failedAttempts,
        lockReason: u.lockReason,
        mustChangePassword: u.mustChangePassword,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, byRole: q.data?.byRole, isPending: q.isPending, error: q.error };
}

export type PermValue = 'allow' | 'deny' | 'inherit';

export interface LegacyRoleTemplate {
  id: string;
  apiRole: ApiRole;
  name: string;
  desc: string;
  users: number;
}

const ROLE_DESCRIPTIONS: Record<ApiRole, string> = {
  STUDENT: 'Reads their own academic, financial and certificate records',
  PARENT: 'Reads the record of a ward they are linked to',
  FACULTY: 'Marks attendance, enters internal marks, mentors students',
  OFFICE: 'Admissions counter, fee counter, certificates and exam scrutiny',
  PRINCIPAL: 'College governance, the approval inbox and the compliance file',
  REGISTRAR: 'The examination wing, procurement, RTI and accreditation',
  ADMIN: 'Everything, including the console itself',
};

/**
 * `ROLE_TEMPLATES` and the matrix, from the rules the guards actually read.
 *
 * A module with no rule is allowed, so the matrix is rendered as allow
 * everywhere except where a rule withholds — which is what the server does.
 */
export function usePermissionData() {
  const matrix = usePermissionMatrix();
  const accounts = useAccounts();

  const roles = useMemo<LegacyRoleTemplate[]>(() => {
    const counts = accounts.data?.byRole ?? {};
    return (Object.keys(ROLE_DESCRIPTIONS) as ApiRole[]).map((r) => ({
      id: r.toLowerCase(),
      apiRole: r,
      name: ROLE_LABEL[r] ?? r,
      desc: ROLE_DESCRIPTIONS[r],
      users: counts[r] ?? 0,
    }));
  }, [accounts.data]);

  const modules = matrix.data?.modules ?? [];
  const actions = matrix.data?.actions ?? [];

  /** The effective matrix for one role: allow unless a rule withholds. */
  const matrixFor = useMemo(
    () => (apiRole: ApiRole) => {
      const rules = (matrix.data?.rules ?? []).filter((r) => r.role === apiRole);
      return Object.fromEntries(
        modules.map((m) => [
          m,
          Object.fromEntries(
            actions.map((a) => {
              const rule = rules.find((x) => x.module === m && x.action === a);
              return [a, (rule?.effect === 'DENY' ? 'deny' : 'allow') as PermValue];
            }),
          ),
        ]),
      );
    },
    [matrix.data, modules, actions],
  );

  return {
    roles,
    modules,
    actions,
    matrixFor,
    rules: matrix.data?.rules ?? [],
    denials: matrix.data?.denials ?? 0,
    isPending: matrix.isPending,
    error: matrix.error,
  };
}

export interface LegacyAuditEntry {
  id: string;
  seq: number;
  timestamp: string;
  actor: string;
  actorId: string;
  module: string;
  action: string;
  target: string;
  orgUnit: string;
  ip: string;
  hash: string;
  prevHash: string;
  status: 'ok' | 'warn';
  detail: string | null;
  outcome: 'OK' | 'WARN' | 'DENIED';
}

/** `AUDIT_ENTRIES` as the audit screen expects it. */
export function useAuditList() {
  const q = useAuditLog();

  const data = useMemo(
    () =>
      (q.data?.entries ?? []).map<LegacyAuditEntry>((e) => ({
        id: e.id,
        seq: e.seq,
        timestamp: new Date(e.occurredAt).toLocaleString('en-IN'),
        actor: e.actor,
        actorId: e.actorRole ?? '—',
        module: e.module,
        action: e.action,
        target: e.target,
        orgUnit: 'RDU-AC-002',
        ip: e.ip ?? '—',
        hash: e.hash,
        prevHash: e.prevHash,
        // The screen knows two states; a refusal is the one worth colouring.
        status: e.outcome === 'OK' ? 'ok' : 'warn',
        detail: e.detail,
        outcome: e.outcome,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

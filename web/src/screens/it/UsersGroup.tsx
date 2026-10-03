import { useState, useMemo, useRef } from 'react';
import { Button, Modal, InlineAlert, StatusPill, Spinner, OtpInput, Avatar, Tooltip, toast } from '../../components/ui';
import {
  useAccountList,
  useActivateAccount,
  useCreateUser,
  useProvisioningOptions,
  type ProvisionRole,
  useLockAccount,
  useResetPassword,
  type LegacyITUser as ITUser,
  type UserRole,
  type UserStatus,
} from '../../lib/itqueries';
import { inst } from '../../lib/institution';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { downloadCSV, downloadPdf, downloadTemplate, readCSV } from '../../lib/export';
import { useCollection } from '../../lib/records';
import { useOverview } from '../AdminConsole';

type BulkAction = 'reset' | 'slips' | 'lock' | 'deactivate';

const BULK_TEXT: Record<BulkAction, { title: string; verb: string; warn: string }> = {
  reset: { title: 'Reset passwords', verb: 'Reset', warn: 'Each account gets a new temporary password and must change it at next sign-in. A CSV of the new passwords downloads when done — keep it safe.' },
  slips: { title: 'Print credential slips', verb: 'Reset and print', warn: 'Each account gets a new temporary password, printed one per row in a PDF to hand out. Existing passwords stop working.' },
  lock: { title: 'Lock accounts', verb: 'Lock', warn: 'Locked accounts cannot sign in and their sessions are ended at once, until the IT Cell unlocks them.' },
  deactivate: { title: 'Deactivate accounts', verb: 'Deactivate', warn: 'Deactivated accounts cannot sign in. Their records are kept and they can be reactivated.' },
};

/** Acts on every account the current filters show, except the IT Cell member doing it. */
function BulkBar({ users }: { users: ITUser[] }) {
  const { user: me } = useAuth();
  const lock = useLockAccount();
  const reset = useResetPassword();
  const activate = useActivateAccount();
  const [action, setAction] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const targets = users.filter(u => u.accountId !== me?.id && (action !== 'lock' || u.status !== 'locked') && (action !== 'deactivate' || u.status !== 'disabled'));

  async function run() {
    if (!action) return;
    setBusy(true);
    setProgress(0);
    const issued: Array<{ name: string; email: string; role: string; password: string }> = [];
    let failed = 0;
    for (const [i, u] of targets.entries()) {
      try {
        if (action === 'reset' || action === 'slips') {
          const r = await reset.mutateAsync(u.accountId);
          issued.push({ name: u.name, email: r.email, role: u.role, password: r.temporaryPassword });
        } else if (action === 'lock') {
          await lock.mutateAsync({ id: u.accountId, locked: true, reason: reason.trim() || 'Bulk lock by the IT Cell' });
        } else {
          await activate.mutateAsync({ id: u.accountId, active: false });
        }
      } catch {
        failed++;
      }
      setProgress(i + 1);
    }
    if (action === 'reset' && issued.length) downloadCSV('temporary-passwords', issued, [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Sign-in email' }, { key: 'role', label: 'Role' }, { key: 'password', label: 'Temporary password' }]);
    if (action === 'slips' && issued.length) {
      await downloadPdf({
        title: 'Credential slips',
        subtitle: 'Hand each person their own row. The password works once: they must set their own at first sign-in.',
        fileName: 'credential-slips',
        sections: [{ table: { head: ['Name', 'Role', 'Sign-in email', 'Temporary password', 'Received (signature)'], body: issued.map(r => [r.name, r.role, r.email, r.password, '']) } }],
        signatory: 'IT Cell',
      });
    }
    toast[failed ? 'warning' : 'success'](`${BULK_TEXT[action].title}: ${targets.length - failed} done${failed ? `, ${failed} failed` : ''}`);
    setBusy(false);
    setAction(null);
    setReason('');
  }

  return (
    <>
      <div className="border-t border-[#D3D8E0] px-4 py-2 flex flex-wrap items-center gap-3 bg-white shrink-0">
        <span className="text-[12px] text-[#5A6577]">Bulk actions on the {users.length} account{users.length === 1 ? '' : 's'} shown:</span>
        <Button size="sm" variant="ghost" disabled={!users.length} onClick={() => setAction('reset')}>Reset passwords</Button>
        <Button size="sm" variant="ghost" disabled={!users.length} onClick={() => setAction('slips')}>Print credential slips</Button>
        <Button size="sm" variant="ghost" disabled={!users.length} onClick={() => setAction('lock')}>Lock accounts</Button>
        <Button size="sm" variant="destructive" disabled={!users.length} onClick={() => setAction('deactivate')}>Deactivate batch</Button>
        <Button size="sm" variant="ghost" className="ml-auto" disabled={!users.length} onClick={() => downloadCSV('accounts', users, [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status' }, { key: 'lastLogin', label: 'Last sign-in' }])}>Export CSV</Button>
      </div>
      <Modal open={action !== null} onClose={() => !busy && setAction(null)} title={action ? BULK_TEXT[action].title : ''}
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>Cancel</Button><Button variant={action === 'deactivate' || action === 'lock' ? 'destructive' : 'primary'} loading={busy} disabled={!targets.length} onClick={() => void run()}>{action ? `${BULK_TEXT[action].verb} ${targets.length} account${targets.length === 1 ? '' : 's'}` : ''}</Button></>}>
        {action && (
          <div className="space-y-3 text-[13px] text-[#16264A]">
            <InlineAlert type="warning">{BULK_TEXT[action].warn}</InlineAlert>
            <p>This applies to <strong>{targets.length}</strong> account{targets.length === 1 ? '' : 's'} matching your current search and filters{users.length !== targets.length ? ` (${users.length - targets.length} skipped: yours, or already in that state)` : ''}. Every change is written to the audit chain.</p>
            {action === 'lock' && <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (shown to the user when they try to sign in)" className="w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]" />}
            <div className="max-h-40 overflow-y-auto border border-[#D3D8E0] rounded-[4px] divide-y divide-[#EDEFF3]">
              {targets.slice(0, 50).map(u => <p key={u.accountId} className="px-3 py-1.5 text-[12px]">{u.name} · <span className="text-[#5A6577]">{u.email}</span></p>)}
              {targets.length > 50 && <p className="px-3 py-1.5 text-[12px] text-[#5A6577]">…and {targets.length - 50} more</p>}
            </div>
            {busy && <p className="text-[12px] text-[#5A6577]">Working… {progress} of {targets.length}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

const STATUS_MAP: Record<UserStatus, { label: string; pill: 'approved' | 'pending' | 'rejected' | 'draft' }> = {
  active: { label: 'Active', pill: 'approved' },
  locked: { label: 'Locked', pill: 'rejected' },
  pending: { label: 'Pending', pill: 'pending' },
  disabled: { label: 'Disabled', pill: 'draft' },
};

interface Props {
  subScreen: string;
  onSub: (s: string) => void;
  impersonating: ITUser | null;
  onImpersonate: (u: ITUser | null) => void;
}

export default function UsersGroup({ subScreen, onSub, impersonating, onImpersonate }: Props) {
  const { data: USERS, totals } = useAccountList();

  // Read the open record back out of the live list, so locking or resetting
  // shows in the panel that did it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = USERS.find(u => u.accountId === selectedId) ?? null;
  const setSelected = (u: ITUser | null) => setSelectedId(u?.accountId ?? null);
  void totals;
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [delegationOpen, setDelegationOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    return USERS.filter(u => {
      const q = search.toLowerCase();
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.includes(q) || u.id.toLowerCase().includes(q);
      const matchRole = !roleFilter || u.role === roleFilter;
      const matchStatus = !statusFilter || u.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [USERS, search, roleFilter, statusFilter]);

  const visible = filtered.slice(0, visibleCount);

  function loadMore() {
    setVisibleCount(v => v + 10);
  }

  if (subScreen === 'delegation') return <DelegationScreen onBack={() => onSub('directory')} />;

  return (
    <div className="flex h-full min-h-0">
      {/* Directory Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#D3D8E0] bg-white shrink-0">
          <div className="flex items-center gap-2 border border-[#D3D8E0] rounded-[4px] px-2.5 bg-[#EDEFF3] h-8 min-w-[220px]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(15); }}
              placeholder="Name, email, ID, mobile…" className="flex-1 text-[13px] bg-transparent outline-none text-[#16264A] placeholder-[#5A6577]" />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="h-8 px-2 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none bg-white">
            <option value="">All roles</option>
            {['Student','Faculty','HOD','Principal','Exam Controller','Accounts Clerk','Hostel Warden','College Admin','Registrar','IT Cell Admin'].map(r => <option key={r}>{r}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 px-2 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none bg-white">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="pending">Pending</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <span className="text-[12px] text-[#5A6577] ml-1">
            Showing {visible.length} of <span className="font-mono font-semibold">4,82,341</span> total
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => onSub('delegation')}>Delegation</Button>
            <Button size="sm" variant="secondary" onClick={() => setBulkImportOpen(true)}>Bulk Import</Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>Create User</Button>
          </div>
        </div>

        {/* Table header */}
        <div className="overflow-x-auto flex-1">
          <table className="ruled-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" className="cursor-pointer" /></th>
                <th>User</th>
                <th>Role</th>
                <th>Org Unit</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>MFA</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(u => (
                <tr key={u.id} onClick={() => setSelected(u)} className="cursor-pointer">
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" className="cursor-pointer" /></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={u.name} size={28} />
                      <div>
                        <p className="text-[13px] font-medium text-[#16264A] leading-tight">{u.name}</p>
                        <p className="text-[11px] text-[#5A6577] font-mono leading-tight">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-[13px]">{u.role}</td>
                  <td className="text-[13px] text-[#5A6577] max-w-[160px] truncate">{u.orgUnit}</td>
                  <td><StatusPill status={STATUS_MAP[u.status].pill} compact /></td>
                  <td className="font-mono text-[12px] text-[#5A6577]">{u.lastLogin}</td>
                  <td>
                    <span className={`text-[11px] font-semibold ${u.mfaEnabled ? 'text-[#0E7A5F]' : 'text-[#5A6577]'}`}>
                      {u.mfaEnabled ? '✓ On' : '—'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button className="text-[12px] text-[#E0952A] hover:underline cursor-pointer" onClick={() => setSelected(u)}>View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Load more */}
          {visible.length < filtered.length && (
            <div className="flex justify-center py-4 border-t border-[#D3D8E0]">
              <Button variant="secondary" size="sm" loading={loading} onClick={loadMore}>
                Load more ({filtered.length - visible.length} remaining)
              </Button>
            </div>
          )}

          {/* Skeleton loading hint */}
          {loading && (
            <div className="px-4 py-3 text-center text-[12px] text-[#5A6577] flex items-center justify-center gap-2">
              <Spinner size={14} />
              Fetching next page from server…
            </div>
          )}
        </div>

        <BulkBar users={filtered} />
      </div>

      {/* User Record */}
      {selected && (
        <div className="w-80 border-l border-[#D3D8E0] flex flex-col bg-white shrink-0 overflow-y-auto">
          <UserRecord user={selected} onClose={() => setSelected(null)} onImpersonate={onImpersonate} />
        </div>
      )}

      {/* Modals */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create User"
        width="560px">
        {createOpen && <CreateUserForm onClose={() => setCreateOpen(false)} />}
      </Modal>

      <Modal open={bulkImportOpen} onClose={() => setBulkImportOpen(false)} title="Bulk User Import" width="560px">
        <BulkUserImport onClose={() => setBulkImportOpen(false)} />
      </Modal>
    </div>
  );
}

// ─── User Record ──────────────────────────────────────────────────────────────

function UserRecord({ user, onClose, onImpersonate }: { user: ITUser; onClose: () => void; onImpersonate: (u: ITUser | null) => void }) {
  const lockAccount = useLockAccount();
  const resetPassword = useResetPassword();
  const activateAccount = useActivateAccount();

  /** Accounts requested from the sign-in page arrive disabled. */
  async function approve() {
    try {
      const r = await activateAccount.mutateAsync({ id: user.accountId, active: true });
      toast.success(`${r.email} approved — they can now sign in.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve that account.');
    }
  }

  const [resetOpen, setResetOpen] = useState(false);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [credState, setCredState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [handover, setHandover] = useState<string | null>(null);

  /** Locking also revokes every live session, which is what makes it a lock. */
  async function toggleLock() {
    const locking = user.status !== 'locked';
    try {
      const r = await lockAccount.mutateAsync({
        id: user.accountId,
        locked: locking,
        ...(locking ? { reason: 'Locked from the IT console.' } : {}),
      });
      setLockConfirm(false);
      toast.success(
        locking
          ? `${r.email} locked — live sessions revoked.`
          : `${r.email} unlocked.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change that lock.');
    }
  }

  async function doReset() {
    try {
      const r = await resetPassword.mutateAsync(user.accountId);
      setResetOpen(false);
      // Shown once, here: there is nowhere else it is recoverable from.
      toast.success(`Temporary password for ${r.email}: ${r.temporaryPassword}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset that password.');
    }
  }

  /** A one-time link to set their own password: emailed if mail is set up, else handed over. */
  async function sendCreds() {
    setCredState('sending');
    try {
      const r = await api<{ email: string; emailed: boolean; link?: string; expiresInMinutes: number }>(`/api/it/users/${user.accountId}/send-reset-link`, { method: 'POST' });
      if (r.emailed) {
        setCredState('sent');
        toast.success(`Password-set link emailed to ${r.email} (valid ${r.expiresInMinutes} min)`);
      } else {
        setCredState('idle');
        setHandover(r.link ?? null);
      }
    } catch (err) {
      setCredState('idle');
      toast.error(err instanceof Error ? err.message : 'Could not create the link');
    }
  }

  return (
    <div className="animate-fade-in flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#16264A] text-white p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={40} />
            <div>
              <p className="font-semibold text-[14px] leading-tight">{user.name}</p>
              <p className="text-[11px] text-white/60 font-mono">{user.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <StatusPill status={STATUS_MAP[user.status].pill} compact />
          <span className="text-[11px] text-white/60">{user.role}</span>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 flex flex-col gap-3">
          {[
            ['Email', user.email],
            ['Mobile', user.mobile],
            ['Org Unit', user.orgUnit],
            ['Org Code', user.orgCode],
            ['Created', user.createdAt],
            ['Last Login', user.lastLogin],
            ['MFA', user.mfaEnabled ? 'Enabled' : 'Not enrolled'],
            ['Failed Attempts', String(user.failedAttempts)],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-[#D3D8E0] pb-2">
              <p className="text-[10px] uppercase tracking-wider text-[#5A6577]">{label}</p>
              <p className="text-[13px] text-[#16264A] font-medium mt-0.5 break-all">{value}</p>
            </div>
          ))}

          {/* Credential status */}
          <div className="border border-[#D3D8E0] rounded-[2px] p-3">
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Credential Status</p>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${user.credentialSent ? 'bg-[#0E7A5F]' : 'bg-[#E0952A]'}`} />
              <span className="text-[13px] text-[#16264A]">{user.credentialSent ? 'Credentials dispatched' : 'Not yet sent'}</span>
            </div>
            <Button size="sm" variant="secondary" loading={credState === 'sending'} onClick={sendCreds} className="w-full">
              {credState === 'sent' ? '✓ Link emailed' : 'Send password-set link'}
            </Button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-[#D3D8E0] p-4 flex flex-col gap-2 shrink-0">
        {user.status === 'disabled' && (
          <Button size="sm" loading={activateAccount.isPending} onClick={approve} className="w-full">Approve & Activate Account</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setResetOpen(true)} className="w-full">Reset Password</Button>
        {user.status === 'active' && (
          <Button size="sm" variant="destructive" onClick={() => setLockConfirm(true)} className="w-full">
            Lock Account {user.failedAttempts > 0 ? `(${user.failedAttempts} failed)` : ''}
          </Button>
        )}
        {user.status === 'locked' && (
          <Button size="sm" loading={lockAccount.isPending} onClick={toggleLock} className="w-full">Unlock Account</Button>
        )}
      </div>

      <Modal open={handover !== null} onClose={() => setHandover(null)} title="Hand over this link"
        footer={<><Button variant="secondary" onClick={() => setHandover(null)}>Close</Button><Button onClick={() => { void navigator.clipboard.writeText(handover ?? '').then(() => toast.success('Link copied')); }}>Copy link</Button></>}>
        <div className="flex flex-col gap-3 text-[13px]">
          <InlineAlert type="info">No mail server is configured, so the link was not emailed. Give it to {user.name} directly — it works once, for 30 minutes, and lets them set their own password.</InlineAlert>
          <p className="font-mono text-[12px] break-all bg-[#EDEFF3] rounded-[4px] p-3 select-all">{handover}</p>
        </div>
      </Modal>

      {/* Lock confirmation */}
      <Modal open={lockConfirm} onClose={() => setLockConfirm(false)} title="Lock Account"
        footer={<><Button variant="secondary" onClick={() => setLockConfirm(false)}>Cancel</Button><Button variant="destructive" loading={lockAccount.isPending} onClick={toggleLock}>Lock account</Button></>}>
        <p className="text-[13px] text-[#5A6577]">
          {user.name} ({user.email}) will be signed out everywhere and unable to sign in until the account is unlocked.
        </p>
      </Modal>

      {/* Reset modal */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset Password"
        footer={<><Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button><Button loading={resetPassword.isPending} onClick={doReset}>Issue new password</Button></>}>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#5A6577]">A new starting password will be issued for this account and shown to you once. The user must replace it at next sign-in, and is signed out everywhere now.</p>
          <div className="bg-[#EDEFF3] rounded-[4px] px-3 py-2 text-[13px] font-mono text-[#16264A]">{user.email}</div>
          <div className="bg-[#EDEFF3] rounded-[4px] px-3 py-2 text-[13px] font-mono text-[#16264A]">{user.mobile}</div>
          <InlineAlert type="info">Users can also reset their own password with “Forgot password?” on the sign-in page.</InlineAlert>
        </div>
      </Modal>
    </div>
  );
}

// ─── Create User Form ─────────────────────────────────────────────────────────

const ROLE_OPTIONS: Array<{ value: ProvisionRole; label: string }> = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'FACULTY', label: 'Faculty' },
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'OFFICE', label: 'Office staff' },
  { value: 'REGISTRAR', label: 'Registrar' },
  { value: 'ADMIN', label: 'IT Cell admin' },
];

const field = 'w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-[14px] outline-none focus:border-[#E0952A] bg-white';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-[13px] font-medium text-[#16264A] block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[#5A6577] mt-1">{hint}</p>}
    </div>
  );
}

/**
 * The IT Cell issues an ID (the person's email) and a starting password,
 * with the record their role works from. They must set their own password
 * at first sign-in; what the role may do is set in Roles & Permissions.
 */
function CreateUserForm({ onClose }: { onClose: () => void }) {
  const createUser = useCreateUser();
  const { data: options } = useProvisioningOptions();
  const [done, setDone] = useState<{ email: string; name: string; temporaryPassword?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    role: 'STUDENT' as ProvisionRole, name: '', email: '', password: '',
    collegeId: '', enrolmentNo: '', programmeId: '', semester: '1', dob: '',
    employeeId: '', designation: '', department: '', wardEnrolmentNo: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  const isStudent = f.role === 'STUDENT';
  const isStaff = ['FACULTY', 'PRINCIPAL', 'OFFICE', 'REGISTRAR'].includes(f.role);
  const hasDept = f.role === 'FACULTY' || f.role === 'PRINCIPAL';
  const needsCollege = f.role !== 'PARENT' && f.role !== 'ADMIN';
  const programmes = (options?.programmes ?? []).filter(p => !f.collegeId || !p.collegeId || p.collegeId === f.collegeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = { role: f.role, name: f.name.trim(), email: f.email.trim() };
    if (f.password) body.password = f.password;
    if (needsCollege && f.collegeId) body.collegeId = f.collegeId;
    if (isStudent) Object.assign(body, { enrolmentNo: f.enrolmentNo, programmeId: f.programmeId, semester: Number(f.semester), dob: f.dob });
    if (isStaff) Object.assign(body, { employeeId: f.employeeId, designation: f.designation });
    if (hasDept) body.department = f.department;
    if (f.role === 'PARENT') body.wardEnrolmentNo = f.wardEnrolmentNo;
    try {
      const r = await createUser.mutateAsync(body);
      setDone({ email: r.email, name: r.name, temporaryPassword: r.temporaryPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that user.');
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert type="success">{done.name} can now sign in. They will be asked to set their own password first.</InlineAlert>
        <div className="border border-[#D3D8E0] rounded-[4px] p-3 font-mono text-[13px] text-[#16264A] flex flex-col gap-1">
          <span>User ID: {done.email}</span>
          <span>Password: {done.temporaryPassword ?? '(the one you set)'}</span>
        </div>
        {done.temporaryPassword && (
          <p className="text-[12px] text-[#A8242C]">Copy this password now and hand it over — it is not shown again.</p>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => { setDone(null); setF(prev => ({ ...prev, name: '', email: '', password: '', enrolmentNo: '', employeeId: '', wardEnrolmentNo: '' })); }}>Create another</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error && <InlineAlert type="error">{error}</InlineAlert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role">
          <select value={f.role} onChange={set('role')} className={field}>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Full name"><input value={f.name} onChange={set('name')} className={field} required /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email (user ID)"><input type="email" value={f.email} onChange={set('email')} className={field} required /></Field>
        <Field label="Starting password" hint="Leave blank to generate one">
          <input type="text" value={f.password} onChange={set('password')} className={`${field} font-mono`} minLength={8} />
        </Field>
      </div>

      {needsCollege && (options?.colleges.length ?? 0) > 1 && (
        <Field label="College">
          <select value={f.collegeId} onChange={set('collegeId')} className={field}>
            <option value="">{options?.colleges[0]?.name} (default)</option>
            {options?.colleges.slice(1).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      {isStudent && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Enrolment number"><input value={f.enrolmentNo} onChange={set('enrolmentNo')} className={`${field} font-mono`} required /></Field>
            <Field label="Date of birth"><input type="date" value={f.dob} onChange={set('dob')} className={field} required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Programme">
              <select value={f.programmeId} onChange={set('programmeId')} className={field} required>
                <option value="">Choose…</option>
                {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Semester">
              <select value={f.semester} onChange={set('semester')} className={field}>
                {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </Field>
          </div>
        </>
      )}

      {isStaff && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Employee ID"><input value={f.employeeId} onChange={set('employeeId')} className={`${field} font-mono`} required /></Field>
          <Field label="Designation"><input value={f.designation} onChange={set('designation')} className={field} required placeholder={hasDept ? 'Assistant Professor' : 'Accounts Clerk'} /></Field>
        </div>
      )}
      {hasDept && <Field label="Department"><input value={f.department} onChange={set('department')} className={field} required placeholder="Computer Science" /></Field>}
      {f.role === 'PARENT' && (
        <Field label="Ward’s enrolment number" hint="The parent will see this student’s records">
          <input value={f.wardEnrolmentNo} onChange={set('wardEnrolmentNo')} className={`${field} font-mono`} required />
        </Field>
      )}

      <InlineAlert type="info">They sign in with this email and password, then must set their own password. Set what this role can do in Roles &amp; Permissions.</InlineAlert>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={createUser.isPending}>Create user</Button>
      </div>
    </form>
  );
}

// ─── Bulk User Import ─────────────────────────────────────────────────────────

const IMPORT_HEADERS = ['role', 'name', 'email', 'college_code', 'enrolment_no', 'programme_code', 'semester', 'dob', 'employee_id', 'designation', 'department', 'ward_enrolment_no'];
const IMPORT_ROLES: ProvisionRole[] = ['STUDENT', 'PARENT', 'FACULTY', 'PRINCIPAL', 'OFFICE', 'REGISTRAR', 'ADMIN'];

interface ImportRow { row: number; data: Record<string, string>; errors: string[]; body: Record<string, unknown> | null }

function BulkUserImport({ onClose }: { onClose: () => void }) {
  const options = useProvisioningOptions();
  const createUser = useCreateUser();
  const [phase, setPhase] = useState<'upload' | 'preview' | 'running' | 'done'>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<Array<{ row: number; name: string; email: string; role: string; password: string; error?: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function validate(data: Record<string, string>, row: number): ImportRow {
    const errors: string[] = [];
    const role = (data.role ?? '').trim().toUpperCase() as ProvisionRole;
    const colleges = options.data?.colleges ?? [];
    const programmes = options.data?.programmes ?? [];
    if (!IMPORT_ROLES.includes(role)) errors.push(`role must be one of ${IMPORT_ROLES.join(', ')}`);
    if (!data.name?.trim()) errors.push('name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email ?? '')) errors.push('a valid email is required');
    const body: Record<string, unknown> = { role, name: data.name?.trim(), email: data.email?.trim() };
    const college = colleges.find(c => c.code.toLowerCase() === (data.college_code ?? '').trim().toLowerCase());
    if (role !== 'PARENT' && role !== 'ADMIN' && role !== 'REGISTRAR') {
      if (!college) errors.push(`college_code "${data.college_code ?? ''}" is not a college on record`);
      else body.collegeId = college.id;
    }
    if (role === 'STUDENT') {
      const programme = programmes.find(p => p.code.toLowerCase() === (data.programme_code ?? '').trim().toLowerCase());
      if (!data.enrolment_no?.trim()) errors.push('enrolment_no is required');
      if (!programme) errors.push(`programme_code "${data.programme_code ?? ''}" is not a programme on record`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dob ?? '')) errors.push('dob must be YYYY-MM-DD');
      Object.assign(body, { enrolmentNo: data.enrolment_no?.trim(), programmeId: programme?.id, semester: Number(data.semester) || 1, dob: data.dob });
    }
    if (['FACULTY', 'PRINCIPAL', 'OFFICE', 'REGISTRAR'].includes(role)) {
      if (!data.employee_id?.trim()) errors.push('employee_id is required');
      if (!data.designation?.trim()) errors.push('designation is required');
      Object.assign(body, { employeeId: data.employee_id?.trim(), designation: data.designation?.trim() });
    }
    if (role === 'FACULTY' || role === 'PRINCIPAL') {
      if (!data.department?.trim()) errors.push('department is required');
      body.department = data.department?.trim();
    }
    if (role === 'PARENT') {
      if (!data.ward_enrolment_no?.trim()) errors.push('ward_enrolment_no is required');
      body.wardEnrolmentNo = data.ward_enrolment_no?.trim();
    }
    return { row, data, errors, body: errors.length ? null : body };
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await readCSV(file);
      if (!parsed.length) { toast.error('That file has no rows under the header'); return; }
      setRows(parsed.map((d, i) => validate(Object.fromEntries(Object.entries(d).map(([k, v]) => [k.toLowerCase(), v])), i + 2)));
      setPhase('preview');
    } catch {
      toast.error('Could not read that file — save it as CSV (UTF-8) and try again');
    }
  }

  async function commit() {
    setPhase('running');
    const out: typeof results = [];
    for (const r of rows.filter(x => x.body)) {
      try {
        const res = await createUser.mutateAsync(r.body!);
        out.push({ row: r.row, name: res.name, email: res.email, role: res.role, password: res.temporaryPassword ?? '(set by the user)' });
      } catch (err) {
        out.push({ row: r.row, name: String(r.data.name), email: String(r.data.email), role: String(r.data.role), password: '', error: err instanceof Error ? err.message : 'failed' });
      }
      setResults([...out]);
    }
    setPhase('done');
    const made = out.filter(x => !x.error);
    if (made.length) downloadCSV('imported-accounts', made, [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Sign-in email' }, { key: 'role', label: 'Role' }, { key: 'password', label: 'Temporary password' }]);
  }

  const valid = rows.filter(r => r.body).length;
  const invalid = rows.length - valid;

  if (phase === 'upload') {
    return (
      <div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => void onFile(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-[#D3D8E0] rounded-[4px] p-8 text-center cursor-pointer hover:border-[#E0952A]">
          <p className="text-[14px] font-medium text-[#16264A]">Choose a CSV file</p>
          <p className="text-[12px] text-[#5A6577] mt-1">Columns: {IMPORT_HEADERS.join(', ')}. Only the columns a role needs must be filled.</p>
        </button>
        <div className="flex gap-4 mt-3">
          <button onClick={() => downloadTemplate('user-import', IMPORT_HEADERS, ['STUDENT', 'Asha Verma', 'asha.verma@example.edu', (options.data?.colleges[0]?.code ?? 'COLLEGE-CODE'), 'ENR/2026/0001', (options.data?.programmes[0]?.code ?? 'PROGRAMME-CODE'), '1', '2007-05-14', '', '', '', ''])} className="text-[13px] text-[#E0952A] hover:underline cursor-pointer">Download template</button>
          <span className="text-[12px] text-[#5A6577]">Colleges: {(options.data?.colleges ?? []).map(c => c.code).join(', ') || '—'}</span>
        </div>
      </div>
    );
  }

  if (phase === 'preview') {
    return (
      <div>
        <div className="flex gap-3 text-[13px] mb-3"><span className="text-[#0E7A5F] font-semibold">{valid} ready</span><span className="text-[#A8242C] font-semibold">{invalid} with errors</span></div>
        <div className="max-h-72 overflow-y-auto border border-[#D3D8E0] rounded-[2px]">
          <table className="ruled-table text-[12px]">
            <thead><tr><th>Row</th><th>Name</th><th>Role</th><th>Email</th><th>Check</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.row} className={r.errors.length ? 'bg-[#FEE2E2]/30' : ''}>
                <td className="font-mono">{r.row}</td><td>{r.data.name || <em className="text-[#A8242C]">empty</em>}</td><td>{r.data.role}</td><td className="font-mono">{r.data.email}</td>
                <td>{r.errors.length ? <span className="text-[#A8242C]">✕ {r.errors.join('; ')}</span> : <span className="text-[#0E7A5F]">✓</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" disabled={!valid} onClick={() => void commit()}>Create {valid} account{valid === 1 ? '' : 's'}</Button>
          <Button size="sm" variant="secondary" onClick={() => setPhase('upload')}>Choose another file</Button>
          {invalid > 0 && <Button size="sm" variant="ghost" onClick={() => downloadCSV('import-errors', rows.filter(r => r.errors.length).map(r => ({ row: r.row, ...r.data, errors: r.errors.join('; ') })))}>Download error report</Button>}
        </div>
      </div>
    );
  }

  const made = results.filter(r => !r.error);
  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {phase === 'running' ? (
        <p className="text-[13px] text-[#5A6577] flex items-center gap-2"><Spinner size={14} /> Creating accounts… {results.length} of {valid}</p>
      ) : (
        <>
          <p className="font-semibold text-[#16264A]">{made.length} account{made.length === 1 ? '' : 's'} created{results.length - made.length ? `, ${results.length - made.length} refused` : ''}</p>
          <p className="text-[12px] text-[#5A6577]">A CSV of the new sign-ins and temporary passwords has downloaded. Hand each one over privately; every account must set its own password at first sign-in.</p>
        </>
      )}
      {results.some(r => r.error) && (
        <div className="border border-[#D3D8E0] rounded-[2px] max-h-40 overflow-y-auto">
          {results.filter(r => r.error).map(r => <p key={r.row} className="px-3 py-1.5 text-[12px] text-[#A8242C] border-b border-[#EDEFF3]">Row {r.row} ({r.email}): {r.error}</p>)}
        </div>
      )}
      {phase === 'done' && <Button size="sm" onClick={onClose}>Done</Button>}
    </div>
  );
}

// ─── Delegated Provisioning ───────────────────────────────────────────────────

interface Delegation { id: string; collegeCode: string; collegeName: string; adminName: string; adminEmail: string; status: 'active' | 'pending'; maxStudents: number; maxStaff: number }

const DEMO_DELEGATIONS: Delegation[] = [
  { id: 'DLG-RDU-AC-011', collegeCode: 'RDU-AC-011', collegeName: 'Govt. Science College', adminName: 'College Administrator', adminEmail: 'admin.ac011@demo.resolion.edu', status: 'active', maxStudents: 1200, maxStaff: 60 },
  { id: 'DLG-RDU-AC-052', collegeCode: 'RDU-AC-052', collegeName: 'Tribal Area Degree College', adminName: 'College Administrator', adminEmail: 'admin.ac052@demo.resolion.edu', status: 'pending', maxStudents: 600, maxStaff: 30 },
];

function DelegationScreen({ onBack }: { onBack: () => void }) {
  const register = useCollection<Delegation>('it:delegations', DEMO_DELEGATIONS);
  const options = useProvisioningOptions();
  const overview = useOverview();
  const createUser = useCreateUser();
  const [editId, setEditId] = useState<string | null>(null);
  const [limits, setLimits] = useState({ maxStudents: 0, maxStaff: 0 });
  const [addOpen, setAddOpen] = useState(false);
  const [f, setF] = useState({ collegeId: '', name: '', email: '', maxStudents: '1000', maxStaff: '50' });
  const counts = new Map((overview.data?.colleges ?? []).map(c => [c.code, c]));
  const editing = register.items.find(d => d._rid === editId) ?? null;

  async function addAdmin() {
    const college = options.data?.colleges.find(c => c.id === f.collegeId);
    if (!college) return;
    try {
      const res = await createUser.mutateAsync({ role: 'OFFICE', name: f.name.trim(), email: f.email.trim(), collegeId: college.id, employeeId: `CA-${college.code}`, designation: 'College Administrator' });
      register.add({ id: `DLG-${college.code}`, collegeCode: college.code, collegeName: college.name, adminName: res.name, adminEmail: res.email, status: 'active', maxStudents: Number(f.maxStudents) || 0, maxStaff: Number(f.maxStaff) || 0 });
      toast.success(`${res.email} created${res.temporaryPassword ? ` — temporary password ${res.temporaryPassword}` : ''}`);
      setAddOpen(false);
      setF({ collegeId: '', name: '', email: '', maxStudents: '1000', maxStaff: '50' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the account');
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#D3D8E0] shrink-0">
        <button onClick={onBack} aria-label="Back" className="text-[#5A6577] hover:text-[#16264A] cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="text-h3 font-semibold text-[#16264A]">Delegated Provisioning</h2>
        <Button size="sm" className="ml-auto" onClick={() => setAddOpen(true)}>Add College Admin</Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <InlineAlert type="info">
            The IT Cell gives each college an administrator (a College Office account) who can then run that college's admissions and counter, within the limits set here.
          </InlineAlert>

          <div className="mt-5 border border-[#D3D8E0] rounded-[2px] overflow-x-auto">
            {register.isLoading ? <div className="flex justify-center py-6"><Spinner /></div> : (
              <table className="ruled-table">
                <thead><tr><th>College</th><th>College Admin</th><th>Status</th><th className="text-right">Students now</th><th className="text-right">Student limit</th><th className="text-right">Staff limit</th><th></th></tr></thead>
                <tbody>
                  {register.items.length === 0 && <tr><td colSpan={7} className="text-center text-[13px] text-[#5A6577] py-6">No college admins yet.</td></tr>}
                  {register.items.map(d => {
                    const live = counts.get(d.collegeCode);
                    const over = live && live.students > d.maxStudents;
                    return (
                      <tr key={d._rid} className={editId === d._rid ? 'bg-[#FEF9EC]' : ''}>
                        <td><p className="text-[13px] font-medium text-[#16264A]">{d.collegeName}</p><p className="text-[11px] text-[#5A6577] font-mono">{d.collegeCode}</p></td>
                        <td className="text-[13px] text-[#5A6577]">{d.adminName}<br /><span className="font-mono text-[12px]">{d.adminEmail}</span></td>
                        <td><StatusPill status={d.status === 'active' ? 'approved' : 'pending'} compact /></td>
                        <td className={`text-right font-mono text-[13px] ${over ? 'text-[#A8242C] font-semibold' : ''}`}>{live ? live.students.toLocaleString('en-IN') : '—'}</td>
                        <td className="text-right font-mono text-[13px]">{d.maxStudents.toLocaleString('en-IN')}</td>
                        <td className="text-right font-mono text-[13px]">{d.maxStaff}</td>
                        <td>
                          <div className="flex gap-2 justify-end">
                            <button className="text-[12px] text-[#E0952A] hover:underline cursor-pointer" onClick={() => { setEditId(d._rid!); setLimits({ maxStudents: d.maxStudents, maxStaff: d.maxStaff }); }}>Edit limits</button>
                            {d.status === 'pending' && <button className="text-[12px] text-[#0E7A5F] hover:underline cursor-pointer" onClick={() => { register.update(d._rid!, { status: 'active' }); toast.success(`${d.collegeName} delegation activated`); }}>Activate</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {editing && (
            <div className="mt-4 bg-white border border-[#D3D8E0] rounded-[2px] p-5 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[14px] font-semibold text-[#16264A]">Edit limits — {editing.collegeName}</p>
                <button onClick={() => setEditId(null)} aria-label="Close" className="text-[#5A6577] cursor-pointer">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[13px] font-medium text-[#16264A] block mb-1">Max student accounts</label>
                  <input type="number" min={0} value={limits.maxStudents} onChange={e => setLimits({ ...limits, maxStudents: Number(e.target.value) })} className="w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-[14px] outline-none focus:border-[#E0952A] font-mono" /></div>
                <div><label className="text-[13px] font-medium text-[#16264A] block mb-1">Max staff accounts</label>
                  <input type="number" min={0} value={limits.maxStaff} onChange={e => setLimits({ ...limits, maxStaff: Number(e.target.value) })} className="w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-[14px] outline-none focus:border-[#E0952A] font-mono" /></div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={() => { register.update(editing._rid!, limits); toast.success('Limits saved'); setEditId(null); }}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditId(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add college admin" width="480px"
        footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button loading={createUser.isPending} disabled={!f.collegeId || !f.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)} onClick={() => void addAdmin()}>Create account</Button></>}>
        <div className="flex flex-col gap-3 text-[13px]">
          <label className="font-medium text-[#16264A]">College
            <select value={f.collegeId} onChange={e => setF({ ...f, collegeId: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] bg-white cursor-pointer">
              <option value="">Choose…</option>
              {(options.data?.colleges ?? []).filter(c => !register.items.some(d => d.collegeCode === c.code)).map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          </label>
          <label className="font-medium text-[#16264A]">Administrator's name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px]" /></label>
          <label className="font-medium text-[#16264A]">Official email<input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] font-mono" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="font-medium text-[#16264A]">Student limit<input type="number" value={f.maxStudents} onChange={e => setF({ ...f, maxStudents: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] font-mono" /></label>
            <label className="font-medium text-[#16264A]">Staff limit<input type="number" value={f.maxStaff} onChange={e => setF({ ...f, maxStaff: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] font-mono" /></label>
          </div>
          <p className="text-[12px] text-[#5A6577]">This creates a College Office account for that college. Its temporary password is shown once; the administrator must change it at first sign-in.</p>
        </div>
      </Modal>
    </div>
  );
}

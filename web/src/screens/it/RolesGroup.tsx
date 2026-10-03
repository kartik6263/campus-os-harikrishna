import { useState, useMemo } from 'react';
import { Button, Modal, InlineAlert, Tooltip, toast } from '../../components/ui';
import {
  useAccountList,
  usePermissionData,
  useSetPermission,
  type ApiRole,
  type PermValue,
} from '../../lib/itqueries';
import { inst } from '../../lib/institution';

const SCOPE_OPTIONS = [
  { value: 'SELF', label: 'Self only', desc: 'Own records only' },
  { value: 'OWN_DEPARTMENT', label: 'Own Dept.', desc: 'All records in their department' },
  { value: 'OWN_COLLEGE', label: 'Own College', desc: 'All records in their college' },
  { value: 'COLLEGE_GROUP', label: 'College Group', desc: 'Assigned cluster of colleges' },
  { value: 'UNIVERSITY_WIDE', label: 'University-wide', desc: 'All org units' },
];

const PERM_CYCLE: PermValue[] = ['inherit', 'allow', 'deny'];
const PERM_DISPLAY: Record<PermValue, { label: string; bg: string; text: string }> = {
  allow: { label: '✓', bg: '#D1FAE5', text: '#0E7A5F' },
  deny: { label: '✕', bg: '#FEE2E2', text: '#A8242C' },
  inherit: { label: '—', bg: 'transparent', text: '#D3D8E0' },
};

interface Props {
  subScreen: string;
  onSub: (s: string) => void;
}

export default function RolesGroup({ subScreen, onSub }: Props) {
  const { roles: ROLE_TEMPLATES, modules: MODULES, actions: ACTIONS, matrixFor } = usePermissionData();
  const { data: USERS } = useAccountList();
  const setPermission = useSetPermission();

  const [activeRole, setActiveRole] = useState('admin');
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [effectiveUser, setEffectiveUser] = useState(USERS[0]);
  const [effectiveOpen, setEffectiveOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const currentRole = ROLE_TEMPLATES.find(r => r.id === activeRole);

  // The matrix is the server's: allow everywhere except where a rule
  // withholds, which is exactly how the route guards read it.
  const matrix: Record<string, Record<string, PermValue>> = currentRole
    ? matrixFor(currentRole.apiRole)
    : {};

  function loadRole(roleId: string) {
    setActiveRole(roleId);
    setOverrides(new Set());
  }

  /**
   * Toggles one cell.
   *
   * There is no third state: the guards read allow or deny, and a cell that
   * claimed to "inherit" would mean nothing to them.
   */
  async function cycleCell(mod: string, action: string) {
    const role = ROLE_TEMPLATES.find(r => r.id === activeRole);
    if (!role) return;
    const next: PermValue = matrix[mod]?.[action] === 'deny' ? 'allow' : 'deny';
    try {
      await setPermission.mutateAsync({
        role: role.apiRole as ApiRole,
        module: mod,
        action,
        effect: next === 'deny' ? 'DENY' : 'ALLOW',
      });
      setOverrides(prev => { const n = new Set(prev); n.add(`${mod}:${action}`); return n; });
      toast.success(
        next === 'deny'
          ? `${role.name} may no longer ${action} in ${mod}.`
          : `${role.name} may ${action} in ${mod} again.`,
      );
    } catch (err) {
      // The console refuses to lock its own administrators out.
      toast.error(err instanceof Error ? err.message : 'Could not change that permission.');
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Role list */}
      <div className="w-52 shrink-0 border-r border-[#D3D8E0] flex flex-col">
        <div className="px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Role Templates</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {ROLE_TEMPLATES.map(role => (
            <button
              key={role.id}
              onClick={() => loadRole(role.id)}
              className={`w-full text-left px-4 py-2.5 transition-colors cursor-pointer border-r-2 ${activeRole === role.id ? 'bg-[#FEF9EC] text-[#E0952A] border-[#E0952A]' : 'text-[#16264A] border-transparent hover:bg-[#F5F6F8]'}`}
            >
              <p className="text-[13px] font-medium">{role.name}</p>
              <p className="text-[11px] text-[#5A6577] font-mono">{role.users.toLocaleString('en-IN')} users</p>
            </button>
          ))}
        </div>
        <p className="border-t border-[#D3D8E0] p-3 text-[11px] text-[#5A6577] leading-snug">These are the system's seven roles. What each may do is set in the matrix; every change takes effect at once and is audited.</p>
      </div>

      {/* Matrix */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Role header */}
        <div className="px-5 py-3 border-b border-[#D3D8E0] bg-white flex items-start justify-between shrink-0">
          <div>
            <p className="text-[15px] font-semibold text-[#16264A]">{currentRole?.name}</p>
            <p className="text-[12px] text-[#5A6577] max-w-sm">{currentRole?.desc}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => setEffectiveOpen(true)}>Effective Permissions</Button>
            <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>Users with this role</Button>
            {overrides.size > 0 && <span className="self-center text-[12px] font-semibold text-[#0E7A5F]">✓ {overrides.size} change{overrides.size === 1 ? '' : 's'} saved</span>}
          </div>
        </div>

        {/* Scope selector */}
        <div className="px-5 py-3 border-b border-[#D3D8E0] bg-[#EDEFF3]/60 flex items-center gap-3 shrink-0">
          <p className="text-[12px] font-semibold text-[#16264A] shrink-0">Records this role reaches:</p>
          <div className="flex gap-1.5">
            {SCOPE_OPTIONS.map(s => (
              <Tooltip key={s.value} text={s.desc}>
                <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-[4px] border ${
                  (activeRole === 'student' && s.value === 'SELF') ||
                  (activeRole === 'faculty' && s.value === 'OWN_DEPARTMENT') ||
                  (activeRole === 'it_admin' && s.value === 'UNIVERSITY_WIDE') ||
                  (activeRole === 'registrar' && s.value === 'UNIVERSITY_WIDE')
                    ? 'bg-[#16264A] text-white border-[#16264A]'
                    : 'bg-white text-[#5A6577] border-[#D3D8E0]'
                }`}>{s.label}</span>
              </Tooltip>
            ))}
          </div>
          {overrides.size > 0 && (
            <span className="text-[11px] text-[#E0952A] font-semibold ml-2">
              {overrides.size} change{overrides.size !== 1 ? 's' : ''} made this session — already in force
            </span>
          )}
        </div>

        {/* Permission matrix */}
        <div className="flex-1 overflow-auto">
          <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
            <thead>
              <tr className="sticky top-0 z-10">
                <th className="text-left px-4 py-2.5 text-[12px] font-semibold text-[#5A6577] bg-[#F5F6F8] border-b border-r border-[#D3D8E0] min-w-[160px] sticky left-0 z-20">Module</th>
                {ACTIONS.map(a => (
                  <th key={a} className="px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] bg-[#F5F6F8] border-b border-r border-[#D3D8E0] capitalize min-w-[72px] text-center whitespace-nowrap">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, mi) => (
                <tr key={mod} className={mi % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                  <td className="px-4 py-2 text-[13px] font-medium text-[#16264A] border-b border-r border-[#D3D8E0] sticky left-0 bg-inherit z-10">{mod}</td>
                  {ACTIONS.map(action => {
                    const val = matrix[mod]?.[action] ?? 'inherit';
                    const cfg = PERM_DISPLAY[val];
                    const isOverride = overrides.has(`${mod}:${action}`);
                    return (
                      <td key={action} className="border-b border-r border-[#D3D8E0] p-1 text-center">
                        <button
                          onClick={() => cycleCell(mod, action)}
                          className={`w-9 h-7 rounded-[2px] text-[13px] font-bold transition-all cursor-pointer relative ${isOverride ? 'ring-2 ring-[#E0952A] ring-offset-1' : ''}`}
                          style={{ background: cfg.bg, color: cfg.text }}
                          title={`${mod} / ${action}: ${val}${isOverride ? ' (override)' : ''}`}
                        >
                          {cfg.label}
                          {isOverride && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#E0952A] rounded-full" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-5 py-3 text-[11px] text-[#5A6577] flex gap-6 border-t border-[#D3D8E0]">
            {Object.entries(PERM_DISPLAY).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="w-6 h-5 rounded-[2px] flex items-center justify-center font-bold text-[12px]" style={{ background: v.bg || '#EDEFF3', color: v.text }}>{v.label}</span>
                <span className="capitalize">{k}</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#E0952A]" />
              Explicit override (click to cycle)
            </span>
          </div>
        </div>
      </div>

      {/* Effective Permission Modal */}
      <Modal open={effectiveOpen} onClose={() => setEffectiveOpen(false)} title="Effective Permission Preview" width="640px">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[13px] font-medium text-[#16264A] block mb-1">Select User</label>
            <select
              value={effectiveUser.id}
              onChange={e => setEffectiveUser(USERS.find(u => u.id === e.target.value) ?? USERS[0])}
              className="w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-[14px] outline-none"
            >
              {USERS.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>

          <div className="bg-[#EDEFF3] rounded-[2px] p-3 text-[13px]">
            <p className="font-semibold text-[#16264A]">{effectiveUser.name}</p>
            <p className="text-[#5A6577]">Role: {effectiveUser.role} · Scope: {effectiveUser.role === 'Student' ? 'SELF' : effectiveUser.role === 'Faculty' ? 'OWN_DEPARTMENT' : 'UNIVERSITY_WIDE'} · Org: {effectiveUser.orgUnit}</p>
          </div>

          <div className="border border-[#D3D8E0] rounded-[2px] overflow-auto max-h-72">
            <table className="ruled-table text-[12px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-[#F5F6F8] z-10">Module</th>
                  {ACTIONS.map(a => <th key={a} className="text-center capitalize">{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod, mi) => {
                  const previewRole = ROLE_TEMPLATES.find(r => r.name === effectiveUser?.role);
                  const def = previewRole ? matrixFor(previewRole.apiRole) : {};
                  return (
                    <tr key={mod} className={mi % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                      <td className="font-medium text-[#16264A] sticky left-0 bg-inherit z-10">{mod}</td>
                      {ACTIONS.map(action => {
                        const val = (def[mod]?.[action] ?? 'deny') as PermValue;
                        const cfg = PERM_DISPLAY[val === 'inherit' ? 'deny' : val];
                        return (
                          <td key={action} className="text-center">
                            <span className="inline-flex items-center justify-center w-7 h-6 rounded-[2px] font-bold"
                              style={{ background: cfg.bg || 'transparent', color: cfg.text }}>
                              {cfg.label}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border border-[#D3D8E0] rounded-[2px] p-3">
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">How this is calculated</p>
            <div className="flex flex-col gap-1 text-[12px]">
              <span className="text-[#5A6577]">① Role: <span className="text-[#16264A] font-medium">{effectiveUser.role}</span> grants base permissions</span>
              <span className="text-[#5A6577]">② Scope: <span className="text-[#16264A] font-medium">{effectiveUser.role === 'Student' ? 'SELF' : 'OWN_DEPARTMENT'}</span> filters to own org boundary</span>
              <span className="text-[#5A6577]">③ No explicit overrides set for this user</span>
              <span className="text-[#5A6577]">④ Effective = Role ∩ Scope ∩ Overrides</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Users holding the role */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={`${currentRole?.name ?? ''} — accounts`} width="560px"
        footer={<Button onClick={() => setAssignOpen(false)}>Close</Button>}>
        {(() => {
          const holders = USERS.filter(u => u.role === currentRole?.name);
          return (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-[#5A6577]">{holders.length} account{holders.length === 1 ? '' : 's'} hold this role. A person's role is fixed when the IT Cell issues their account (User Directory → Create user), because each role carries its own record — a student file, a staff file.</p>
              <div className="border border-[#D3D8E0] rounded-[2px] max-h-72 overflow-y-auto divide-y divide-[#EDEFF3]">
                {holders.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-[#5A6577]">No accounts yet.</p>}
                {holders.map(u => (
                  <div key={u.accountId} className="px-3 py-2 flex items-center justify-between text-[13px]">
                    <span className="text-[#16264A]">{u.name} <span className="text-[11px] text-[#5A6577] font-mono">{u.email}</span></span>
                    <span className="text-[11px] text-[#5A6577]">{u.status}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

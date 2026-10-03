import { useState } from 'react';
import { useLang } from '../lib/language';
import { useAuth } from '../lib/auth';
import { takeITCellEntry } from '../lib/itcell';
import { ToastContainer, toast } from '../components/ui';
import PortalUser from '../components/PortalUser';
import type { Screen } from '../lib/data';
import type { LegacyITUser as ITUser } from '../lib/itqueries';
import OrgGroup from './it/OrgGroup';
import UsersGroup from './it/UsersGroup';
import RolesGroup from './it/RolesGroup';
import WorkflowGroup from './it/WorkflowGroup';
import AuditGroup from './it/AuditGroup';
import InstitutionGroup from './it/InstitutionGroup';
import { inst, instPlace } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void; }

type Group = 'institution' | 'org' | 'users' | 'roles' | 'workflows' | 'audit';

interface NavItem {
  group: Group;
  label: string;
  sub: string;
  icon: React.ReactNode;
  badge?: string;
  subs: Array<{ id: string; label: string }>;
}

const NAV: NavItem[] = [
  {
    group: 'institution',
    label: 'Institution',
    sub: 'profile',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></svg>,
    subs: [{ id: 'profile', label: 'Institution Profile' }],
  },
  {
    group: 'org',
    label: 'Organisation',
    sub: 'tree',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    subs: [
      { id: 'tree', label: 'Org Unit Tree' },
      { id: 'bulk-import', label: 'Bulk Import (CSV)' },
    ],
  },
  {
    group: 'users',
    label: 'Users & Provisioning',
    sub: 'directory',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    subs: [
      { id: 'directory', label: 'User Directory' },
      { id: 'delegation', label: 'Delegated Provisioning' },
    ],
  },
  {
    group: 'roles',
    label: 'Roles & Permissions',
    sub: 'matrix',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    subs: [
      { id: 'matrix', label: 'Permission Matrix' },
    ],
  },
  {
    group: 'workflows',
    label: 'Workflow Builder',
    sub: 'builder',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="5" r="3"/><path d="M12 8v3"/><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M12 11l-7 6"/><path d="M12 11l7 6"/></svg>,
    subs: [
      { id: 'builder', label: 'Approval Chains' },
    ],
  },
  {
    group: 'audit',
    label: 'Audit & Health',
    sub: 'log',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3c2.28 0 4.36.84 5.94 2.22"/><path d="M21 3l-2 2m2-2-2 2m4 0h-4v-4"/></svg>,
    badge: '1 warn',
    subs: [
      { id: 'log', label: 'Audit Log' },
      { id: 'health', label: 'Platform Health' },
    ],
  },
];

export default function ITConsole({ onNavigate }: Props) {
  const { lang, toggle, t } = useLang();
  const { signOut } = useAuth();
  const leave = async () => { await signOut(); onNavigate('landing'); };
  // Opened from the Admin Console sidebar at a given page, or at the start.
  const [entry] = useState(takeITCellEntry);
  const [activeGroup, setActiveGroup] = useState<Group>(entry.group);
  const [activeSub, setActiveSub] = useState(entry.sub);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [impersonating, setImpersonating] = useState<ITUser | null>(null);

  function selectGroup(g: Group, sub: string) {
    setActiveGroup(g);
    setActiveSub(sub);
  }

  function startImpersonation(user: ITUser | null) {
    if (user) {
      setImpersonating(user);
      toast.info(`Impersonating ${user.name} — all actions are logged`);
    } else {
      setImpersonating(null);
      toast.success('Impersonation session ended');
    }
  }

  const activeNav = NAV.find(n => n.group === activeGroup)!;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#EDEFF3' }}>
      <ToastContainer />

      {/* Impersonation Banner */}
      {impersonating && (
        <div className="bg-[#A8242C] text-white px-6 py-2 flex items-center justify-between shrink-0 z-50">
          <div className="flex items-center gap-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span className="text-[13px] font-semibold">
              Impersonating: <span className="font-bold">{impersonating.name}</span> ({impersonating.id} · {impersonating.role} · {impersonating.orgUnit})
            </span>
            <span className="text-[11px] text-white/70">Every action is being recorded in the audit log</span>
          </div>
          <button
            onClick={() => startImpersonation(null)}
            className="text-[12px] font-semibold bg-white text-[#A8242C] px-3 py-1 rounded-[4px] hover:bg-[#FEE2E2] cursor-pointer"
          >
            End Session
          </button>
        </div>
      )}

      {/* Top Bar */}
      <header className="h-14 bg-[#0D1B35] flex items-center px-4 gap-3 z-30 shrink-0">
        <button onClick={() => setRailCollapsed(r => !r)} className="text-white/60 hover:text-white cursor-pointer p-1">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#E0952A] rounded-[4px] flex items-center justify-center text-white font-bold text-[11px]">{inst().shortCode}</div>
          <div className="hidden sm:block">
            <p className="text-white font-semibold text-[12px] leading-tight">Admin Console · IT Cell</p>
            <p className="text-white/40 text-[10px] leading-tight">{instPlace()}</p>
          </div>
        </div>

        {/* Global search: the institution-wide palette */}
        <div className="flex-1 mx-4 max-w-md">
          <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))} className="w-full flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-[4px] px-3 py-1.5 cursor-pointer text-left">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="opacity-50"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <span className="text-white/40 text-[12px] flex-1">Search users, students, records…</span>
            <kbd className="text-[10px] text-white/50 font-mono">Ctrl K</kbd>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button onClick={toggle} className="text-[11px] font-semibold text-white/60 hover:text-white cursor-pointer border border-white/20 rounded-[4px] px-2 py-1">{lang === 'en' ? 'हिं' : 'EN'}</button>

          <PortalUser onNavigate={onNavigate} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left Rail */}
        <aside className={`${railCollapsed ? 'w-0 overflow-hidden' : 'w-56'} bg-[#16264A] transition-all duration-200 flex flex-col shrink-0 z-20`}>
          <div className="flex-1 overflow-y-auto py-3">
            {NAV.map(item => (
              <div key={item.group} className="mb-1">
                {/* Group header */}
                <button
                  onClick={() => selectGroup(item.group, item.subs[0].id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
                    activeGroup === item.group ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${item.badge.includes('warn') ? 'bg-[#E0952A] text-white' : 'bg-white/20 text-white'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>

                {/* Sub items */}
                {activeGroup === item.group && item.subs.length > 1 && (
                  <div className="animate-slide-down">
                    {item.subs.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => { setActiveGroup(item.group); setActiveSub(sub.id); }}
                        className={`w-full text-left px-10 py-2 text-[12px] transition-colors cursor-pointer ${
                          activeSub === sub.id ? 'text-[#E0952A] bg-white/5' : 'text-white/50 hover:text-white'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom links */}
          <div className="border-t border-white/10 p-4 space-y-2">
            <button onClick={() => onNavigate('admin-console')} className="flex items-center gap-2 text-[12px] text-white/40 hover:text-white cursor-pointer w-full">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Admin Console
            </button>
            <button onClick={() => onNavigate('landing')} className="flex items-center gap-2 text-[12px] text-white/40 hover:text-white cursor-pointer w-full">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              Home
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Breadcrumb band */}
          <div className="px-5 py-2.5 border-b border-[#D3D8E0] bg-white flex items-center gap-2 text-[12px] text-[#5A6577] shrink-0">
            <button onClick={() => onNavigate('admin-console')} className="font-semibold text-[#16264A] hover:text-[#E0952A] cursor-pointer">Admin Console</button>
            <span className="text-[#D3D8E0]">/</span>
            <span className="font-semibold text-[#16264A]">IT Cell</span>
            <span className="text-[#D3D8E0]">/</span>
            <span className="text-[#16264A]">{activeNav.label}</span>
            {activeSub !== activeNav.sub && (
              <>
                <span className="text-[#D3D8E0]">/</span>
                <span className="text-[#16264A]">{activeNav.subs.find(s => s.id === activeSub)?.label}</span>
              </>
            )}
          </div>

          {/* Screen content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeGroup === 'institution' && <InstitutionGroup />}
            {activeGroup === 'org' && <OrgGroup subScreen={activeSub} onSub={setActiveSub} onOpenUsers={() => selectGroup('users', 'directory')} />}
            {activeGroup === 'users' && (
              <UsersGroup
                subScreen={activeSub}
                onSub={setActiveSub}
                impersonating={impersonating}
                onImpersonate={startImpersonation}
              />
            )}
            {activeGroup === 'roles' && <RolesGroup subScreen={activeSub} onSub={setActiveSub} />}
            {activeGroup === 'workflows' && <WorkflowGroup subScreen={activeSub} onSub={setActiveSub} />}
            {activeGroup === 'audit' && <AuditGroup subScreen={activeSub} onSub={s => setActiveSub(s)} />}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#D3D8E0] bg-white px-6 py-2 flex items-center justify-between text-[10px] text-[#5A6577] shrink-0">
        <span>Resolion Campus OS · Admin Console · IT Cell · {inst().name} · Restricted Access</span>
        <span className="font-mono">Build 2024.09.19 · Node 18.20 · TZ: Asia/Kolkata</span>
      </footer>
    </div>
  );
}

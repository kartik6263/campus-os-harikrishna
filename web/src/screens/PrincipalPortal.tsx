import { useState } from 'react';
import type { Screen } from '../lib/data';
import { useApprovalQueue } from '../lib/governancequeries';
import { Avatar, ToastContainer } from '../components/ui';
import PortalUser, { WorkspaceLink } from '../components/PortalUser';
import { useAuth, displayName, ROLE_TITLES } from '../lib/auth';
import { useInstitution } from '../lib/institution';
import CollegeDashboard from './principal/CollegeDashboard';
import ApprovalInbox from './principal/ApprovalInbox';
import WorkloadAllocation from './principal/WorkloadAllocation';
import AffiliationCompliance from './principal/AffiliationCompliance';
import SubjectAllocation from './shared/SubjectAllocation';

interface Props { onNavigate: (s: Screen) => void }

type Module = 'inbox' | 'dashboard' | 'allocation' | 'workload' | 'affiliation';



export default function PrincipalPortal({ onNavigate }: Props) {
  const { totals } = useApprovalQueue();
  const pendingCount = totals?.pending ?? 0;

  const [module, setModule] = useState<Module>('inbox');
  const { user, signOut } = useAuth();
  const inst = useInstitution();

  const navItems: Array<{ id: Module; label: string; badge?: number }> = [
    { id: 'inbox', label: 'Approval Inbox', badge: pendingCount },
    { id: 'dashboard', label: 'College Dashboard' },
    { id: 'allocation', label: 'Subject Allocation' },
    { id: 'workload', label: 'Faculty Workload' },
    { id: 'affiliation', label: 'Affiliation Compliance' },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#EDEFF3] overflow-hidden">
      {/* Top bar */}
      <header className="bg-[#0D1B35] flex items-center justify-between px-6 h-12 shrink-0">
        <span className="text-white font-semibold text-[15px] tracking-tight">
          Resolion Campus OS — Principal Portal
        </span>
        <div className="flex items-center gap-4">
          <WorkspaceLink screen="governance" label="Governance ↗" onNavigate={onNavigate} className="text-[12px] text-[#A0AEC0] hover:text-white cursor-pointer hidden md:block" />
          <span className="text-[#A0AEC0] text-[13px] hidden md:block">{inst.place}</span>
          <PortalUser onNavigate={onNavigate} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <nav className="w-56 bg-[#16264A] flex flex-col shrink-0">
          {/* User */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-[#243B60]">
            <Avatar name={displayName(user) || 'Principal'} size={36} />
            <div>
              <div className="text-white text-[13px] font-semibold leading-tight">{displayName(user)}</div>
              <div className="text-[#8BA3CC] text-[11px]">{user ? ROLE_TITLES[user.role] : ''}</div>
            </div>
          </div>

          {/* Nav */}
          <div className="flex-1 py-2">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-[13px] transition-colors ${
                  module === item.id
                    ? 'bg-[#E0952A] text-white font-semibold'
                    : 'text-[#B0C4DE] hover:bg-[#1E3560] hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-[3px] ${
                    module === item.id ? 'bg-white text-[#E0952A]' : 'bg-[#A8242C] text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Bottom quick links */}
          <div className="border-t border-[#243B60] py-3">
            <div className="px-4 mb-1">
              <span className="text-[10px] font-semibold text-[#5A7BA0] uppercase tracking-wider">Quick Links</span>
            </div>
            <button
              onClick={() => onNavigate('intelligence')}
              className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#8BA3CC] hover:text-white hover:bg-[#1E3560] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              At-risk students
            </button>
            <button
              onClick={() => onNavigate(user && ['ADMIN', 'REGISTRAR'].includes(user.role) ? 'it-console' : 'governance')}
              className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#8BA3CC] hover:text-white hover:bg-[#1E3560] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
              </svg>
              {user && ['ADMIN', 'REGISTRAR'].includes(user.role) ? 'IT Console' : 'Governance'}
            </button>
            <button
              onClick={async () => { await signOut(); onNavigate('landing'); }}
              className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#8BA3CC] hover:text-white hover:bg-[#1E3560] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {module === 'inbox' && <ApprovalInbox onNavigate={onNavigate} onModule={(m) => setModule(m as Module)} />}
          {module === 'dashboard' && <CollegeDashboard onNavigate={onNavigate} onModule={(m) => setModule(m as Module)} />}
          {module === 'allocation' && <SubjectAllocation />}
          {module === 'workload' && <WorkloadAllocation onNavigate={onNavigate} onModule={(m) => setModule(m as Module)} />}
          {module === 'affiliation' && <AffiliationCompliance onNavigate={onNavigate} onModule={(m) => setModule(m as Module)} />}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}

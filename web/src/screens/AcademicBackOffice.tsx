import { useState } from 'react';
import type { Screen } from '../lib/data';
import { ToastContainer } from '../components/ui';
import PortalUser from '../components/PortalUser';
import { useSessionList } from '../lib/examqueries';
import ExamSetup from './backoffice/ExamSetup';
import EligibilityEngine from './backoffice/EligibilityEngine';
import CentreAllocation from './backoffice/CentreAllocation';
import Confidential from './backoffice/Confidential';
import Evaluation from './backoffice/Evaluation';
import ResultProcessing from './backoffice/ResultProcessing';
import RevaluationDegree from './backoffice/RevaluationDegree';
import { inst, instPlace } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void }

type Module =
  | 'exam-setup' | 'eligibility' | 'centre-alloc' | 'confidential'
  | 'evaluation' | 'results' | 'revaluation';

interface NavGroup {
  label: string;
  items: Array<{ id: Module; label: string; badge?: string; restricted?: boolean }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Examination',
    items: [
      { id: 'exam-setup', label: 'Exam Cycle Setup' },
      { id: 'eligibility', label: 'Eligibility & Scrutiny' },
      { id: 'centre-alloc', label: 'Centres & Hall Tickets' },
      { id: 'confidential', label: 'Confidential Section', restricted: true },
      { id: 'evaluation', label: 'Evaluation & Moderation' },
      { id: 'results', label: 'Result Processing' },
      { id: 'revaluation', label: 'Revaluation & Degrees' },
    ],
  },
];

const MODULE_LABELS: Record<Module, string> = {
  'exam-setup': 'Exam Cycle Setup',
  'eligibility': 'Eligibility & Form Scrutiny',
  'centre-alloc': 'Centres & Hall Tickets',
  'confidential': 'Confidential Section',
  'evaluation': 'Evaluation & Moderation',
  'results': 'Result Processing',
  'revaluation': 'Revaluation & Degrees',
};

export default function AcademicBackOffice({ onNavigate }: Props) {
  const [module, setModule] = useState<Module>('exam-setup');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { current } = useSessionList();

  const pass = { onNavigate, onModule: (m: string) => setModule(m as Module) };

  return (
    <div className="flex flex-col min-h-screen bg-[#EDEFF3]">
      <ToastContainer />

      {/* Top bar */}
      <header className="h-14 bg-[#0D1B35] flex items-center px-4 gap-3 shrink-0 z-30">
        <button onClick={() => setSidebarOpen(o => !o)} className="text-white/60 hover:text-white cursor-pointer p-1 shrink-0">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#E0952A] rounded-[4px] flex items-center justify-center text-white font-bold text-[10px]">{inst().shortCode}</div>
          <div className="hidden sm:block">
            <p className="text-white font-semibold text-[12px] leading-tight">Examination Back-Office</p>
            <p className="text-white/40 text-[10px] leading-tight">{instPlace()}</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-white/40 text-[12px] ml-3">
          <span>/</span>
          <span className="text-white/70">{MODULE_LABELS[module]}</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {module === 'confidential' && (
            <span className="text-[11px] font-bold bg-[#A8242C] text-white px-2 py-0.5 rounded-[4px] uppercase tracking-wider">RESTRICTED ACCESS</span>
          )}
          <button onClick={() => onNavigate('acad-ops')} className="text-[11px] text-white/40 hover:text-white cursor-pointer hidden md:block">Academic Ops ↗</button>
          <button onClick={() => onNavigate('it-console')} className="text-[11px] text-white/40 hover:text-white cursor-pointer hidden md:block">IT Cell ↗</button>
          <PortalUser onNavigate={onNavigate} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <aside className={`${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'} bg-[#16264A] transition-all duration-200 flex flex-col shrink-0 z-20`}>
          <div className="flex-1 overflow-y-auto py-3">
            {NAV_GROUPS.map(group => (
              <div key={group.label} className="mb-3">
                <p className="px-4 py-1.5 text-[10px] font-bold text-white/30 uppercase tracking-widest">{group.label}</p>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setModule(item.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors cursor-pointer border-l-2 ${
                      module === item.id
                        ? 'text-white bg-white/10 border-[#E0952A]'
                        : 'text-white/60 hover:text-white hover:bg-white/5 border-transparent'
                    }`}
                  >
                    {item.restricted && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[#A8242C]"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    )}
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 p-4 space-y-2">
            <button onClick={() => onNavigate('principal-portal')} className="text-[12px] text-white/40 hover:text-white cursor-pointer w-full text-left flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>Principal Portal
            </button>
            <button onClick={() => onNavigate('acad-ops')} className="text-[12px] text-white/40 hover:text-white cursor-pointer w-full text-left flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Academic Operations
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {module === 'exam-setup' && <ExamSetup {...pass} />}
          {module === 'eligibility' && <EligibilityEngine {...pass} />}
          {module === 'centre-alloc' && <CentreAllocation {...pass} />}
          {module === 'confidential' && <Confidential {...pass} />}
          {module === 'evaluation' && <Evaluation {...pass} />}
          {module === 'results' && <ResultProcessing {...pass} />}
          {module === 'revaluation' && <RevaluationDegree {...pass} />}
        </main>
      </div>

      <footer className="border-t border-[#D3D8E0] bg-white px-6 py-2 flex items-center justify-between text-[10px] text-[#5A6577] shrink-0">
        <span>Resolion Campus OS · {inst().name} · Examination wing</span>
        <span className="font-mono">{current ? `${current.name} · forms ${current.formWindowOpen} – ${current.formWindowClose}` : 'No live sitting'}</span>
      </footer>
    </div>
  );
}

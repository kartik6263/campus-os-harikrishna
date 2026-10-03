import { useState } from 'react';
import type { Screen } from '../lib/data';
import { ToastContainer } from '../components/ui';
import PortalUser from '../components/PortalUser';

interface Props { onNavigate: (s: Screen) => void }

import AdmissionCounselling from './acadops/admission/AdmissionCounselling';
import SyllabusCurriculum from './acadops/admission/SyllabusCurriculum';
import AcademicRecords from './acadops/admission/AcademicRecords';
import UniversityLibrary from './acadops/admission/UniversityLibrary';
import HostelManagement from './acadops/campus/HostelManagement';
import TransportManagement from './acadops/campus/TransportManagement';
import FeeFinance from './acadops/campus/FeeFinance';
import UniversityScholarship from './acadops/campus/UniversityScholarship';
import UniversityGrievance from './acadops/campus/UniversityGrievance';
import { inst, instPlace } from '../lib/institution';

type Module =
  | 'admission' | 'curriculum' | 'records' | 'library'
  | 'hostel' | 'transport' | 'fee-finance' | 'scholarship' | 'grievance';

interface NavSection {
  title: string;
  items: Array<{ id: Module; label: string; icon: string; badge?: string; restricted?: boolean }>;
}

const NAV: NavSection[] = [
  {
    title: 'Admission & Academics',
    items: [
      { id: 'admission', label: 'Admission & Counselling', icon: '📋' },
      { id: 'curriculum', label: 'Syllabus & Curriculum', icon: '📖' },
      { id: 'records', label: 'Academic Records', icon: '📁' },
      { id: 'library', label: 'Library', icon: '📚' },
    ],
  },
  {
    title: 'Campus Services',
    items: [
      { id: 'hostel', label: 'Hostel', icon: '🏠' },
      { id: 'transport', label: 'Transport', icon: '🚌' },
      { id: 'fee-finance', label: 'Fee & Finance', icon: '₹' },
      { id: 'scholarship', label: 'Scholarship', icon: '🏅' },
      { id: 'grievance', label: 'Grievance', icon: '📢' },
    ],
  },
];

const MODULE_TITLES: Record<Module, string> = {
  'admission': 'Admission & Counselling', 'curriculum': 'Syllabus & Curriculum',
  'records': 'Academic Records', 'library': 'University Library',
  'hostel': 'Hostel Management', 'transport': 'Transport Management',
  'fee-finance': 'Fee & Finance', 'scholarship': 'Scholarship',
  'grievance': 'Grievance & Helpdesk',
};

export default function AcadOps({ onNavigate }: Props) {
  const [module, setModule] = useState<Module>('admission');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Admission & Academics', 'Campus Services']));

  function toggleSection(title: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  const sectionTitle = NAV.find(s => s.items.some(i => i.id === module))?.title ?? '';

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#EDEFF3' }}>
      <ToastContainer />

      {/* Top Bar */}
      <header className="h-14 bg-[#0D1B35] flex items-center px-4 gap-3 shrink-0 z-30">
        <button onClick={() => setRailCollapsed(r => !r)} className="text-white/60 hover:text-white cursor-pointer p-1">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#E0952A] rounded-[2px] flex items-center justify-center text-white font-bold text-[10px]">{inst().shortCode}</div>
          <div className="hidden sm:block">
            <p className="text-white font-semibold text-[12px] leading-tight">Academic Operations</p>
            <p className="text-white/40 text-[10px] leading-tight">{instPlace()}</p>
          </div>
        </div>
        <div className="h-5 w-px bg-white/20 mx-1 hidden md:block" />
        <span className="hidden md:block text-[12px] text-white/60">{sectionTitle} → {MODULE_TITLES[module]}</span>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => onNavigate('academic-back-office')} className="text-[11px] text-white/50 hover:text-white cursor-pointer hidden lg:block">Examinations ↗</button>
          <button onClick={() => onNavigate('it-console')} className="text-[11px] text-white/50 hover:text-white cursor-pointer hidden lg:block">IT Cell ↗</button>
          <PortalUser onNavigate={onNavigate} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left Rail */}
        <aside className={`${railCollapsed ? 'w-0 overflow-hidden' : 'w-52'} bg-[#16264A] transition-all duration-200 flex flex-col shrink-0 z-20 overflow-y-auto`}>
          {NAV.map(section => (
            <div key={section.title} className="mb-1">
              <button onClick={() => toggleSection(section.title)} className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-white/40 uppercase tracking-widest hover:text-white/60 cursor-pointer">
                <span>{section.title}</span>
                <span className={`transition-transform ${expandedSections.has(section.title) ? 'rotate-90' : ''}`}>›</span>
              </button>
              {expandedSections.has(section.title) && (
                <div>
                  {section.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setModule(item.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition-colors cursor-pointer border-r-2 ${
                        module === item.id
                          ? 'bg-white/10 text-white border-[#E0952A]'
                          : 'text-white/60 border-transparent hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="text-[11px] w-4 text-center shrink-0">{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className="text-[9px] font-bold bg-[#E0952A] text-white px-1.5 py-0.5 rounded-full shrink-0">{item.badge}</span>
                      )}
                      {item.restricted && (
                        <span className="text-[9px] text-[#A8242C] font-bold shrink-0">RESTRICTED</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="mt-auto border-t border-white/10 p-3 space-y-1">
            <button onClick={() => onNavigate('academic-back-office')} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white cursor-pointer w-full">
              Examination Back-Office ↗
            </button>
            <button onClick={() => onNavigate('principal-portal')} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white cursor-pointer w-full">
              Principal Portal ↗
            </button>
            <button onClick={() => onNavigate('it-console')} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white cursor-pointer w-full">
              IT Cell Console ↗
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {module === 'admission' && <AdmissionCounselling onNavigate={onNavigate} />}
          {module === 'curriculum' && <SyllabusCurriculum />}
          {module === 'records' && <AcademicRecords />}
          {module === 'library' && <UniversityLibrary />}
          {module === 'hostel' && <HostelManagement />}
          {module === 'transport' && <TransportManagement />}
          {module === 'fee-finance' && <FeeFinance onNavigate={onNavigate} />}
          {module === 'scholarship' && <UniversityScholarship />}
          {module === 'grievance' && <UniversityGrievance />}
        </main>
      </div>
    </div>
  );
}

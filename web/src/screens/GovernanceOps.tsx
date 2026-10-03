import { useState } from 'react';
import type { Screen } from '../lib/data';
import { ToastContainer } from '../components/ui';
import PortalUser, { WorkspaceLink } from '../components/PortalUser';

import AffiliationMgmt from './governance/affiliation/AffiliationMgmt';
import AccreditationCompliance from './governance/hubs/AccreditationHub';
import ProcurementModule from './governance/hubs/ProcurementHub';
import FinanceAccounts from './governance/finance/FinanceAccounts';
import HRPayroll from './governance/hr/HRPayroll';
import RTIModule from './governance/rti/RTIModule';
import AssetInventory from './governance/assets/AssetInventory';
import PlacementInternship from './governance/stakeholders/PlacementInternship';
import AlumniModule from './governance/stakeholders/AlumniModule';
import IncubationStartup from './governance/stakeholders/IncubationStartup';
import MoUGrants from './governance/stakeholders/MoUGrants';
import AdmissionEnquiry from './governance/stakeholders/AdmissionEnquiry';
import CommunicationHub from './governance/stakeholders/CommunicationHub';
import { inst, instPlace } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void }

type Module =
  | 'affiliation' | 'accreditation' | 'procurement'
  | 'finance' | 'hr' | 'rti' | 'assets'
  | 'placement' | 'alumni' | 'incubation' | 'mou' | 'enquiry' | 'communication';

interface NavSection {
  title: string;
  items: Array<{ id: Module; label: string; icon: string; badge?: string; flagship?: boolean }>;
}

const NAV: NavSection[] = [
  {
    title: 'University Governance',
    items: [
      { id: 'affiliation', label: 'Affiliation Management', icon: '🏛', flagship: true },
      { id: 'accreditation', label: 'Accreditation & Compliance', icon: '✓' },
      { id: 'procurement', label: 'Procurement', icon: '📦' },
      { id: 'finance', label: 'Finance & Accounts', icon: '₹' },
      { id: 'hr', label: 'HR & Payroll', icon: '👤' },
      { id: 'rti', label: 'RTI', icon: '📜' },
      { id: 'assets', label: 'Asset & Inventory', icon: '🗄' },
    ],
  },
  {
    title: 'Stakeholders & Outreach',
    items: [
      { id: 'placement', label: 'Placement & Internship', icon: '💼' },
      { id: 'alumni', label: 'Alumni', icon: '🎓' },
      { id: 'incubation', label: 'Incubation & Startup', icon: '🚀' },
      { id: 'mou', label: 'MoU & Grants', icon: '🤝' },
      { id: 'enquiry', label: 'Admission Enquiry', icon: '📞' },
      { id: 'communication', label: 'Communication', icon: '📢' },
    ],
  },
];

const MODULE_TITLES: Record<Module, string> = {
  affiliation: 'Affiliation Management', accreditation: 'Accreditation & Compliance',
  procurement: 'Procurement', finance: 'Finance & Accounts', hr: 'HR & Payroll',
  rti: 'RTI', assets: 'Asset & Inventory', placement: 'Placement & Internship',
  alumni: 'Alumni', incubation: 'Incubation & Startup', mou: 'MoU & Grants',
  enquiry: 'Admission Enquiry', communication: 'Communication',
};

export default function GovernanceOps({ onNavigate }: Props) {
  const [module, setModule] = useState<Module>('affiliation');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['University Governance', 'Stakeholders & Outreach'])
  );

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

      <header className="h-14 bg-[#0D1B35] flex items-center px-4 gap-3 shrink-0 z-30">
        <button onClick={() => setRailCollapsed(r => !r)} className="text-white/60 hover:text-white cursor-pointer p-1">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#A8242C] rounded-[2px] flex items-center justify-center text-white font-bold text-[10px]">{inst().shortCode}</div>
          <div className="hidden sm:block">
            <p className="text-white font-semibold text-[12px] leading-tight">University Governance</p>
            <p className="text-white/40 text-[10px] leading-tight">{instPlace()}</p>
          </div>
        </div>
        <div className="h-5 w-px bg-white/20 mx-1 hidden md:block" />
        <span className="hidden md:block text-[12px] text-white/60">{sectionTitle} → {MODULE_TITLES[module]}</span>
        <div className="ml-auto flex items-center gap-3">
          <WorkspaceLink screen="acad-ops" label="Academic Ops ↗" onNavigate={onNavigate} />
          <WorkspaceLink screen="intelligence" label="Intelligence ↗" onNavigate={onNavigate} />
          <PortalUser onNavigate={onNavigate} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
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
                          ? 'bg-white/10 text-white border-[#A8242C]'
                          : 'text-white/60 border-transparent hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="text-[11px] w-4 text-center shrink-0">{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.flagship && <span className="text-[8px] text-[#A8242C] font-bold shrink-0">FLAGSHIP</span>}
                      {item.badge && !item.flagship && (
                        <span className="text-[9px] font-bold bg-[#A8242C] text-white px-1.5 py-0.5 rounded-full shrink-0">{item.badge}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="mt-auto border-t border-white/10 p-3 space-y-1">
            <button onClick={() => onNavigate('acad-ops')} className="text-[11px] text-white/40 hover:text-white cursor-pointer w-full text-left">Academic Operations ↗</button>
            <button onClick={() => onNavigate('intelligence')} className="text-[11px] text-white/40 hover:text-white cursor-pointer w-full text-left">Intelligence Layer ↗</button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          {module === 'affiliation' && <AffiliationMgmt />}
          {module === 'accreditation' && <AccreditationCompliance />}
          {module === 'procurement' && <ProcurementModule />}
          {module === 'finance' && <FinanceAccounts />}
          {module === 'hr' && <HRPayroll />}
          {module === 'rti' && <RTIModule />}
          {module === 'assets' && <AssetInventory />}
          {module === 'placement' && <PlacementInternship />}
          {module === 'alumni' && <AlumniModule />}
          {module === 'incubation' && <IncubationStartup />}
          {module === 'mou' && <MoUGrants />}
          {module === 'enquiry' && <AdmissionEnquiry />}
          {module === 'communication' && <CommunicationHub />}
        </main>
      </div>
    </div>
  );
}

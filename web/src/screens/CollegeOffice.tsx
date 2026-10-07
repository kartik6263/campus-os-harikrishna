import { useState } from 'react';
import type React from 'react';
import type { Screen } from '../lib/data';
import { Avatar, ToastContainer } from '../components/ui';
import PortalUser from '../components/PortalUser';
import { useAuth, displayName } from '../lib/auth';
import AdmissionEntry from './office/AdmissionEntry';
import FeeCollection from './office/FeeCollection';
import CertificateQueue from './office/CertificateQueue';
import ExamScrutiny from './office/ExamScrutiny';
import VerificationRegister from './office/VerificationRegister';
import { inst, instPlace } from '../lib/institution';

interface Props {
  onNavigate: (s: Screen) => void;
}

type Module = 'admission' | 'fee' | 'certificate' | 'exam' | 'verification';

const MODULE_LABELS: Record<Module, string> = {
  admission: 'Admission Entry',
  fee: 'Fee Collection',
  certificate: 'Certificate Queue',
  exam: 'Exam Scrutiny',
  verification: 'Identity Verification',
};

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconCash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
function IconClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

interface NavItem {
  id: Module;
  label: string;
  icon: () => React.ReactElement;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'admission', label: 'Admission Entry', icon: IconUsers },
  { id: 'fee', label: 'Fee Collection', icon: IconCash },
  { id: 'certificate', label: 'Certificate Queue', icon: IconFile },
  { id: 'exam', label: 'Exam Scrutiny', icon: IconClipboard },
  { id: 'verification', label: 'Identity Verification', icon: IconShield },
];

export default function CollegeOffice({ onNavigate }: Props) {
  const [module, setModule] = useState<Module>('admission');
  const { user, signOut } = useAuth();

  const moduleProps = { onModule: (m: string) => setModule(m as Module) };

  return (
    <div className="flex h-screen overflow-hidden bg-[#EDEFF3]" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Left Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#16264A] flex flex-col h-full">
        {/* Identity */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Avatar name={displayName(user) || 'Office'} size={36} />
            <div className="min-w-0">
              <p className="text-white text-[13px] font-semibold truncate leading-tight">{displayName(user)}</p>
              <p className="text-white/60 text-[11px] truncate">{inst().name}</p>
            </div>
          </div>
          <span className="inline-block bg-white/10 text-white/80 text-[10px] font-mono px-2 py-0.5 rounded-[2px]">
            {user?.office?.designation ?? 'College Office'}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = module === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors text-left cursor-pointer
                  ${active
                    ? 'bg-white/10 text-white border-l-2 border-[#E0952A]'
                    : 'text-white/70 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                  }`}
              >
                <span className="flex-shrink-0"><item.icon /></span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/10 p-3">
          <button
            onClick={async () => { await signOut(); onNavigate('landing'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:text-[#E0952A] hover:bg-white/5 rounded-[2px] transition-colors cursor-pointer"
          >
            <IconLogout />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-[#0D1B35] flex items-center px-6 gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 mr-4">
            <div className="w-6 h-6 bg-[#E0952A] rounded-[2px] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">{inst().shortCode}</span>
            </div>
            <span className="text-white font-semibold text-[15px] tracking-tight">Resolion Campus OS — College Office</span>
          </div>
          <div className="flex-1 flex items-center gap-2 text-[13px]">
            <span className="text-white/40">College Office</span>
            <span className="text-white/30">/</span>
            <span className="text-white/80">{MODULE_LABELS[module]}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white/50 text-[12px] truncate max-w-[200px] hidden md:block">
              {instPlace()}
            </span>
            <PortalUser onNavigate={onNavigate} />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {module === 'admission' && <AdmissionEntry {...moduleProps} />}
          {module === 'fee' && <FeeCollection {...moduleProps} />}
          {module === 'certificate' && <CertificateQueue {...moduleProps} />}
          {module === 'exam' && <ExamScrutiny {...moduleProps} />}
          {module === 'verification' && <VerificationRegister />}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}

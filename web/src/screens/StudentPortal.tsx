import { useState, useRef, useEffect, type ReactElement } from 'react';
import type { Screen } from '../lib/data';
import { Avatar, toast } from '../components/ui';
import { useNotifications, useStudentRecord } from '../lib/queries';
import Markdown from '../components/Markdown';
import { LOOKUP_LABELS, speak, useAssistant, useSpeechInput } from '../lib/assistant';
import Dashboard from './student/Dashboard';
import Profile from './student/Profile';
import Attendance from './student/Attendance';
import Timetable from './student/Timetable';
import Examination from './student/Examination';
import Fee from './student/Fee';
import Certificates from './student/Certificates';
import Hostel from './student/Hostel';
import Transport from './student/Transport';
import Library from './student/Library';
import Grievance from './student/Grievance';
import Syllabus from './student/Syllabus';
import Announcements from './student/Announcements';
import Placement from './student/Placement';
import Scholarship from './student/Scholarship';
import { inst } from '../lib/institution';
import { useAuth, displayName } from '../lib/auth';

export type Module =
  | 'dashboard'
  | 'profile'
  | 'attendance'
  | 'timetable'
  | 'examination'
  | 'fee'
  | 'certificates'
  | 'hostel'
  | 'transport'
  | 'library'
  | 'grievance'
  | 'syllabus'
  | 'announcements'
  | 'placement'
  | 'scholarship'
  | 'more-grid';

interface Props {
  onNavigate: (s: Screen) => void;
}

const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Home',
  profile: 'Profile',
  attendance: 'Attendance',
  timetable: 'Timetable',
  examination: 'Examination',
  fee: 'Fees',
  certificates: 'Certificates & Records',
  hostel: 'Hostel',
  transport: 'Transport',
  library: 'Library',
  grievance: 'Grievance & Helpdesk',
  syllabus: 'Syllabus & Study Material',
  announcements: 'Announcements',
  placement: 'Placement & Internship',
  scholarship: 'Scholarship',
  'more-grid': 'More',
};

interface NavTab {
  id: Module;
  label: string;
  icon: () => ReactElement;
}

const BOTTOM_NAV_TABS: NavTab[] = [
  {
    id: 'dashboard',
    label: 'Home',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'attendance',
    label: 'Attend.',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'fee',
    label: 'Fees',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9 10h6M9 14h6M12 7v2M12 15v2" />
      </svg>
    ),
  },
  {
    id: 'examination',
    label: 'Exams',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'more-grid',
    label: 'More',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
];

interface MoreModuleEntry {
  id: Module;
  label: string;
  subtitle: string;
  icon: () => ReactElement;
}

const MORE_MODULES: MoreModuleEntry[] = [
  {
    id: 'profile', label: 'Profile', subtitle: 'Personal & academic details',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'attendance', label: 'Attendance', subtitle: 'Subject-wise attendance records',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'timetable', label: 'Timetable', subtitle: 'Weekly class schedule',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: 'examination', label: 'Examination', subtitle: 'Form, hall ticket & results',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: 'fee', label: 'Fees', subtitle: 'Payment, dues & receipts',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9 10h6M9 14h6M12 7v2M12 15v2" />
      </svg>
    ),
  },
  {
    id: 'certificates', label: 'Certificates & Records', subtitle: 'Apply & track certificates',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
      </svg>
    ),
  },
  {
    id: 'hostel', label: 'Hostel', subtitle: 'Room, mess & facility',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'transport', label: 'Transport', subtitle: 'Bus route & pass status',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    id: 'library', label: 'Library', subtitle: 'Books, fines & catalogue',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    id: 'grievance', label: 'Grievance & Helpdesk', subtitle: 'Submit & track complaints',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'syllabus', label: 'Syllabus & Study Material', subtitle: 'Units, notes & resources',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'announcements', label: 'Announcements', subtitle: 'University & college notices',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    id: 'placement', label: 'Placement & Internship', subtitle: 'Drives, applications & status',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    id: 'scholarship', label: 'Scholarship', subtitle: 'Applications & disbursement',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
];

// ── Persistent AI Chat Widget ─────────────────────────────────────────────────

const QUICK_CHIPS: Record<'en' | 'hi', string[]> = {
  en: ['What is my attendance?', 'Do I owe any fees?', 'My latest result', "Today's classes"],
  hi: ['मेरी उपस्थिति कितनी है?', 'क्या मेरी फीस बकाया है?', 'मेरा रिज़ल्ट', 'आज की कक्षाएं'],
};

const STUDENT_LOOKUPS: Record<string, string> = {
  ...LOOKUP_LABELS,
  my_attendance: 'Your attendance',
  my_fees: 'Your fee ledger',
  my_results: 'Your results',
  my_timetable: 'Your timetable',
  my_learning_plan: 'Your learning plan',
};

/** The helpdesk assistant, answering only from this student's own records. */
function AIChatWidget({ onClose }: { onClose: () => void }) {
  const [inputVal, setInputVal] = useState('');
  const [lang, setLang] = useState<'hi' | 'en'>('en');
  const { turns, ask, busy, reset } = useAssistant();
  const bottomRef = useRef<HTMLDivElement>(null);
  const voice = useSpeechInput(lang, text => { void handleSend(text); });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  async function handleSend(text?: string) {
    const query = (text ?? inputVal).trim();
    if (!query) return;
    setInputVal('');
    await ask(query);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col" style={{ top: 48 }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-16 left-2 right-2 sm:left-auto sm:w-[420px] rounded-2xl flex flex-col shadow-2xl overflow-hidden" style={{ maxHeight: 'calc(100vh - 140px)', background: '#0D1B35' }}>
        <div className="flex items-center gap-2.5 px-4 py-3 bg-[#0A1428] border-b border-white/10 shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] flex items-center justify-center text-white text-[12px] font-bold">AI</div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-white leading-tight">Campus Assistant</div>
            <div className="text-[10px] text-white/40">Answers from your own records only · 🔒 Private</div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded overflow-hidden border border-white/10">
              <button onClick={() => setLang('en')} className={`px-2 py-1 text-[10px] font-medium cursor-pointer ${lang === 'en' ? 'bg-[#7C3AED] text-white' : 'text-white/40'}`}>EN</button>
              <button onClick={() => setLang('hi')} className={`px-2 py-1 text-[10px] font-medium cursor-pointer ${lang === 'hi' ? 'bg-[#7C3AED] text-white' : 'text-white/40'}`}>हि</button>
            </div>
            {turns.length > 0 && <button onClick={reset} className="text-white/40 hover:text-white cursor-pointer text-[11px] ml-1">Clear</button>}
            <button onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white cursor-pointer text-[18px] leading-none ml-1">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px]">
          {turns.length === 0 && (
            <p className="text-[12px] text-white/50 text-center py-6">{lang === 'hi' ? 'अपनी उपस्थिति, फीस, परिणाम या कक्षाओं के बारे में पूछें।' : 'Ask about your attendance, fees, results or classes — in English or Hindi.'}</p>
          )}
          {turns.map((t, i) => t.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] bg-[#1E3A5F] text-white rounded-2xl rounded-tr-sm px-3 py-2 text-[13px]">{t.content}</div>
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-1">
              <div className={`rounded-2xl rounded-tl-sm px-3 py-2.5 text-[13px] max-w-[90%] text-white/90 ${t.error ? 'bg-red-950 border border-red-800' : 'bg-[#0A1428] border border-white/10'}`}>
                <Markdown text={t.content} dark />
                {!t.error && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-blue-300">
                    {(t.lookups ?? []).map(l => <span key={l} className="bg-blue-950/60 border border-blue-800/50 rounded px-1.5 py-0.5">📂 {STUDENT_LOOKUPS[l] ?? l}</span>)}
                    <button onClick={() => speak(t.content, lang)} className="ml-auto text-white/40 hover:text-white cursor-pointer" aria-label="Read aloud">🔊</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-[12px] text-white/50 px-1">Checking your records…</div>}
          <div ref={bottomRef} />
        </div>

        <div className="bg-[#0A1428] border-t border-white/10 px-3 py-2.5 shrink-0">
          <div className="flex gap-2 mb-2 flex-wrap">
            {QUICK_CHIPS[lang].map(chip => (
              <button key={chip} onClick={() => void handleSend(chip)} disabled={busy}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 text-[11px] hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40">
                {chip}
              </button>
            ))}
          </div>
          {voice.error && <p className="text-[11px] text-red-300 mb-1.5">{voice.error}</p>}
          <div className="flex gap-2">
            <input
              value={voice.listening ? voice.interim : inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleSend()}
              placeholder={voice.listening ? 'Listening…' : lang === 'hi' ? 'अपना सवाल लिखें...' : 'Ask your question...'}
              className="flex-1 px-3 py-2 bg-[#0D1B35] border border-white/10 rounded-lg text-white text-[13px] placeholder-white/30 outline-none focus:border-[#7C3AED] transition-colors"
            />
            {voice.supported && (
              <button onClick={() => (voice.listening ? voice.stop() : voice.start())} aria-label="Speak"
                className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer ${voice.listening ? 'bg-red-500 animate-pulse' : 'bg-white/10 hover:bg-white/20'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>
              </button>
            )}
            <button onClick={() => void handleSend()} disabled={!inputVal.trim() || busy} aria-label="Send"
              className="w-9 h-9 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 flex items-center justify-center cursor-pointer transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

interface MoreGridProps {
  onNavigate: (m: Module) => void;
}

function MoreGrid({ onNavigate, onSignOut }: MoreGridProps & { onSignOut: () => void }) {
  const { user } = useAuth();
  return (
    <div className="bg-[#EDEFF3] min-h-full pb-4">
      <div className="px-4 py-2 bg-[#EDEFF3]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5A6577]">All Modules</p>
      </div>
      <div className="bg-white">
        {MORE_MODULES.map((mod, i) => (
          <button
            key={mod.id}
            onClick={() => onNavigate(mod.id)}
            className={`w-full flex items-center gap-4 px-4 min-h-[56px] text-left active:bg-[#EDEFF3] transition-colors${i < MORE_MODULES.length - 1 ? ' border-b border-[#D3D8E0]' : ''}`}
          >
            <span className="text-[#5A6577] flex-shrink-0">{mod.icon()}</span>
            <span className="flex-1 min-w-0 py-3">
              <span className="block text-[15px] font-medium text-[#16264A] leading-tight">{mod.label}</span>
              <span className="block text-[12px] text-[#5A6577] truncate mt-0.5">{mod.subtitle}</span>
            </span>
            <span className="text-[#5A6577] flex-shrink-0"><ChevronRight /></span>
          </button>
        ))}
      </div>
      <div className="px-4 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5A6577]">Account</p>
      </div>
      <div className="bg-white">
        <div className="px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[14px] font-medium text-[#16264A]">{displayName(user)}</p>
          <p className="text-[12px] text-[#5A6577]">{user?.email}</p>
        </div>
        <button onClick={onSignOut} className="w-full flex items-center gap-4 px-4 min-h-[52px] text-left text-[15px] font-medium text-[#A8242C] active:bg-[#FEE2E2] cursor-pointer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </div>
    </div>
  );
}

const BOTTOM_TAB_IDS = new Set<Module>(BOTTOM_NAV_TABS.map(t => t.id));

export default function StudentPortal({ onNavigate }: Props) {
  const [module, setModule] = useState<Module>('dashboard');
  const { signOut } = useAuth();
  const [history, setHistory] = useState<Module[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  // Real unread count from the API rather than a count of urgent notices.
  const { data: notifications } = useNotifications();
  const urgentCount = notifications?.unreadCount ?? 0;
  const { data: STUDENT } = useStudentRecord();

  function navigate(m: Module | null) {
    // Several screens' own back links pass no target: that means back.
    if (!m) { goBack(); return; }
    setHistory(prev => [...prev, module]);
    setModule(m);
  }

  function goBack() {
    if (history.length === 0) { setModule('dashboard'); return; }
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setModule(prev);
  }

  const isSubModule = history.length > 0;
  const activeBottomTab: Module = BOTTOM_TAB_IDS.has(module) ? module : 'more-grid';

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-[#EDEFF3] flex flex-col"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      {/* Fixed Top Bar */}
      <header
        className="fixed top-0 left-0 right-0 z-40 h-12 flex items-center justify-between px-2"
        style={{ backgroundColor: '#0D1B35' }}
      >
        {/* Left zone */}
        <div className="flex items-center w-11">
          {isSubModule ? (
            <button
              onClick={goBack}
              className="flex items-center justify-center w-11 h-11 text-white active:opacity-60"
              aria-label="Go back"
            >
              <ChevronLeft />
            </button>
          ) : (
            <button
              onClick={() => navigate('more-grid')}
              className="flex items-center justify-center w-11 h-11 text-white active:opacity-60 cursor-pointer"
              aria-label="All services"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
          <span className="text-[9px] font-semibold tracking-widest uppercase text-white/50 leading-none">Resolion Campus OS — {inst().name}</span>
          <span className="text-[14px] font-semibold text-white leading-snug truncate max-w-full px-1 mt-0.5">
            {MODULE_LABELS[module]}
          </span>
        </div>

        {/* Right zone */}
        <div className="flex items-center gap-0.5 w-[68px] justify-end">
          <button
            onClick={() => navigate('announcements')}
            className="relative flex items-center justify-center w-11 h-11 text-white active:opacity-60"
            aria-label={`Notifications — ${urgentCount} unread`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {urgentCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none"
                style={{ backgroundColor: '#E0952A' }}
              >
                {urgentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('profile')}
            className="flex items-center justify-center w-8 h-8 active:opacity-60"
            aria-label="Profile"
          >
            <Avatar name={STUDENT?.name ?? '…'} size={30} />
          </button>
        </div>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto pt-12 pb-16">
        {module === 'dashboard' && <Dashboard onNavigate={navigate} onMainNavigate={onNavigate} />}
        {module === 'profile' && <Profile onNavigate={navigate} />}
        {module === 'attendance' && <Attendance onNavigate={navigate} />}
        {module === 'timetable' && <Timetable onNavigate={navigate} />}
        {module === 'examination' && <Examination onNavigate={navigate} />}
        {module === 'fee' && <Fee onNavigate={navigate} />}
        {module === 'certificates' && <Certificates onNavigate={navigate} />}
        {module === 'hostel' && <Hostel onNavigate={navigate} />}
        {module === 'transport' && <Transport onNavigate={navigate} />}
        {module === 'library' && <Library onNavigate={navigate} />}
        {module === 'grievance' && <Grievance onNavigate={navigate} />}
        {module === 'syllabus' && <Syllabus onNavigate={navigate} />}
        {module === 'announcements' && <Announcements onNavigate={navigate} />}
        {module === 'placement' && <Placement onNavigate={navigate} />}
        {module === 'scholarship' && <Scholarship onNavigate={navigate} />}
        {module === 'more-grid' && <MoreGrid onNavigate={navigate} onSignOut={async () => { await signOut(); onNavigate('landing'); }} />}
      </main>

      {/* Fixed Bottom Nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 h-16 flex items-stretch bg-white"
        style={{ borderTop: '1px solid #D3D8E0' }}
      >
        {BOTTOM_NAV_TABS.map(tab => {
          const isActive = activeBottomTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setHistory([]);
                setModule(tab.id);
                setChatOpen(false);
              }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 active:bg-[#EDEFF3] transition-colors"
              style={{ color: isActive ? '#E0952A' : '#5A6577', minHeight: 44 }}
              aria-label={tab.label}
            >
              {tab.icon()}
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Floating AI Chat Button */}
      <button
        onClick={() => setChatOpen(o => !o)}
        className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all cursor-pointer"
        style={{
          background: chatOpen ? '#4C1D95' : 'linear-gradient(135deg, #7C3AED, #4C1D95)',
          boxShadow: '0 4px 20px rgba(124,58,237,0.5)',
        }}
        aria-label="AI Assistant"
        title="Resolion Campus OS AI Assistant"
      >
        {chatOpen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <path d="M13 8H7M17 12H7"/>
          </svg>
        )}
        {!chatOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white text-[7px] font-bold text-white flex items-center justify-center">AI</span>
        )}
      </button>

      {/* AI Chat Widget */}
      {chatOpen && <AIChatWidget onClose={() => setChatOpen(false)} />}
    </div>
  );
}

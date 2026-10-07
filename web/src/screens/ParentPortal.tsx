import { useState, useRef, useEffect } from 'react';
import Markdown from '../components/Markdown';
import { LOOKUP_LABELS, useAssistant, useSpeechInput } from '../lib/assistant';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/queries';
import type { Screen } from '../lib/data';
import { ToastContainer } from '../components/ui';
import ParentDashboard from './parent/ParentDashboard';
import ParentAttendance from './parent/ParentAttendance';
import ParentFee from './parent/ParentFee';
import ParentResults from './parent/ParentResults';
import ParentAnnouncements from './parent/ParentAnnouncements';
import ParentGatePass from './parent/ParentGatePass';
import ParentMessaging from './parent/ParentMessaging';
import ParentVerification from './parent/ParentVerification';
import { inst } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void }

type Module = 'dashboard' | 'attendance' | 'fee' | 'results' | 'announcements' | 'gate-pass' | 'messaging' | 'verification' | 'more';

const BOTTOM_NAV: Array<{ id: Module; labelHi: string; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Home', labelHi: 'होम', icon: '🏠' },
  { id: 'attendance', label: 'Attendance', labelHi: 'उपस्थिति', icon: '📋' },
  { id: 'fee', label: 'Fee', labelHi: 'शुल्क', icon: '₹' },
  { id: 'results', label: 'Results', labelHi: 'परिणाम', icon: '📊' },
  { id: 'more', label: 'More', labelHi: 'और', icon: '☰' },
];

const MORE_ITEMS: Array<{ id: Module; label: string; labelHi: string; icon: string }> = [
  { id: 'announcements', label: 'Announcements', labelHi: 'सूचनाएं', icon: '📢' },
  { id: 'gate-pass', label: 'Leave & Gate Pass', labelHi: 'अवकाश', icon: '🚪' },
  { id: 'messaging', label: 'Message Teacher', labelHi: 'अध्यापक से संपर्क', icon: '💬' },
  { id: 'verification', label: 'Verification (DigiLocker)', labelHi: 'सत्यापन (डिजीलॉकर)', icon: '🔐' },
];

// Compact assistant for the parent portal: answers about the ward only.
const PARENT_CHIPS_HI = ['उपस्थिति कितनी है?', 'फीस कितनी बकाया है?', 'आज की कक्षाएं'];
const PARENT_CHIPS_EN = ["What is my child's attendance?", 'Is any fee due?', 'Latest result'];
const PARENT_LOOKUPS: Record<string, string> = { ...LOOKUP_LABELS, my_attendance: 'Attendance', my_fees: 'Fee ledger', my_results: 'Results', my_timetable: 'Timetable', my_learning_plan: 'Learning plan' };

function ParentAIWidget({ lang, onClose }: { lang: 'hi' | 'en'; onClose: () => void }) {
  const t = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  const { turns, ask, busy } = useAssistant();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const voice = useSpeechInput(lang, text => { void ask(text); });
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput('');
    void ask(q);
  }

  const chips = lang === 'hi' ? PARENT_CHIPS_HI : PARENT_CHIPS_EN;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto rounded-t-2xl flex flex-col shadow-2xl" style={{ maxHeight: '75vh', background: '#0D1B35' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 bg-[#0A1428] border-b border-white/10 shrink-0 rounded-t-2xl">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] flex items-center justify-center text-white text-[10px] font-bold">AI</div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-white">{t('Campus Assistant', 'कैम्पस सहायक')}</div>
            <div className="text-[9px] text-white/40">{t("Your ward's records only · Hindi · English", 'केवल आपके बच्चे के अभिलेख · हिंदी · English')}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white cursor-pointer text-[18px]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[160px]">
          {turns.length === 0 && <p className="text-[12px] text-white/50 text-center py-4">{t("Ask about your child's attendance, fees, results or classes.", 'अपने बच्चे की उपस्थिति, फीस, परिणाम या कक्षाओं के बारे में पूछें।')}</p>}
          {turns.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-xl text-[13px] ${m.role === 'user' ? 'bg-[#16264A] text-white' : m.error ? 'bg-red-950 border border-red-800 text-white/90' : 'bg-[#0A1428] border border-white/10 text-white/90'}`}>
                {m.role === 'user' ? m.content : <Markdown text={m.content} dark />}
                {m.role === 'assistant' && !m.error && (m.lookups?.length ?? 0) > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">{m.lookups!.map(l => <span key={l} className="text-[9px] bg-white/10 text-white/60 rounded px-1.5 py-0.5">📂 {PARENT_LOOKUPS[l] ?? l}</span>)}</div>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="text-[12px] text-white/50 px-1">{t('Checking the records…', 'अभिलेख देख रहे हैं…')}</p>}
          <div ref={bottomRef} />
        </div>
        <div className="bg-[#0A1428] border-t border-white/10 px-3 py-2.5 shrink-0">
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {chips.map(c => <button key={c} onClick={() => send(c)} disabled={busy} className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 text-[11px] hover:bg-white/10 cursor-pointer disabled:opacity-40">{c}</button>)}
          </div>
          <div className="flex gap-2">
            <input value={voice.listening ? voice.interim : input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={voice.listening ? t('Listening…', 'सुन रहे हैं…') : t('Ask about attendance, fee, results…', 'उपस्थिति, शुल्क, परिणाम…')}
              className="flex-1 px-3 py-2 bg-[#0D1B35] border border-white/10 rounded-lg text-white text-[13px] placeholder-white/30 outline-none focus:border-[#7C3AED]" />
            {voice.supported && (
              <button onClick={() => (voice.listening ? voice.stop() : voice.start())} aria-label="Speak" className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer ${voice.listening ? 'bg-red-500 animate-pulse' : 'bg-white/10'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>
              </button>
            )}
            <button onClick={() => send()} disabled={!input.trim() || busy} aria-label="Send" className="w-9 h-9 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 flex items-center justify-center cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ParentPortal({ onNavigate }: Props) {
  const [module, setModule] = useState<Module>('dashboard');
  const [lang, setLang] = useState<'hi' | 'en'>('en');
  const { signOut } = useAuth();
  const { data: ward } = useProfile();
  const leave = async () => { await signOut(); onNavigate('landing'); };
  const [aiOpen, setAiOpen] = useState(false);

  function navigate(m: Module) { setModule(m); }
  const t = (en: string, hi: string) => lang === 'hi' ? hi : en;

  if (module === 'more') {
    return (
      <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto">
        <ToastContainer />
        <div className="h-12 bg-[#16264A] flex items-center px-4 gap-3 shrink-0">
          <button onClick={() => setModule('dashboard')} className="text-white cursor-pointer">←</button>
          <p className="text-white font-semibold text-[14px]">{t('More Options', 'और विकल्प')}</p>
          <button onClick={() => setLang(l => l === 'hi' ? 'en' : 'hi')} className="ml-auto text-[11px] text-white/60 hover:text-white cursor-pointer">
            {lang === 'hi' ? 'English' : 'हिंदी'}
          </button>
        </div>
        <div className="flex-1 px-4 py-4 space-y-3">
          {MORE_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setModule(item.id)}
              className="w-full flex items-center gap-4 bg-white border border-[#D3D8E0] p-4 text-left cursor-pointer"
            >
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-[15px] font-semibold text-[#16264A]">{t(item.label, item.labelHi)}</p>
              </div>
              <span className="ml-auto text-[#5A6577]">›</span>
            </button>
          ))}
          <button onClick={leave} className="w-full flex items-center gap-4 bg-red-50 border border-red-200 p-4 text-left cursor-pointer mt-6">
            <span className="text-2xl">🚪</span>
            <p className="text-[15px] font-semibold text-red-700">{t('Sign Out', 'साइन आउट')}</p>
          </button>
        </div>
        <nav className="h-16 bg-white border-t border-[#D3D8E0] flex items-stretch shrink-0">
          {BOTTOM_NAV.map(tab => (
            <button
              key={tab.id}
              onClick={() => setModule(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                module === tab.id ? 'text-[#16264A]' : 'text-[#5A6577]'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{t(tab.label, tab.labelHi)}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F8FA] max-w-md mx-auto">
      <ToastContainer />

      <header className="h-12 bg-[#16264A] flex items-center px-4 gap-3 shrink-0">
        {module !== 'dashboard' && (
          <button onClick={() => setModule('dashboard')} className="text-white cursor-pointer text-lg leading-none">←</button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#E0952A] rounded-[2px] flex items-center justify-center text-white font-bold text-[9px]">{inst().shortCode}</div>
          <div>
            <p className="text-white font-semibold text-[13px] leading-tight">{t('Parent Portal', 'अभिभावक पोर्टल')} · {inst().shortCode}</p>
            {ward && <p className="text-white/50 text-[10px] leading-tight">{ward.name} · {ward.programme.shortName} Sem {ward.semester}</p>}
          </div>
        </div>
        <button onClick={() => setLang(l => l === 'hi' ? 'en' : 'hi')} className="ml-auto text-[11px] text-white/60 hover:text-white cursor-pointer">
          {lang === 'hi' ? 'English' : 'हिंदी'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-16">
        {module === 'dashboard' && <ParentDashboard lang={lang} navigate={(m: string) => navigate(m as Module)} />}
        {module === 'attendance' && <ParentAttendance lang={lang} />}
        {module === 'fee' && <ParentFee lang={lang} />}
        {module === 'results' && <ParentResults lang={lang} />}
        {module === 'announcements' && <ParentAnnouncements lang={lang} />}
        {module === 'gate-pass' && <ParentGatePass lang={lang} />}
        {module === 'messaging' && <ParentMessaging lang={lang} />}
        {module === 'verification' && <ParentVerification lang={lang} />}
      </div>

      <nav className="h-16 bg-white border-t border-[#D3D8E0] flex items-stretch shrink-0 fixed bottom-0 left-0 right-0 max-w-md mx-auto z-30">
        {BOTTOM_NAV.map(tab => (
          <button
            key={tab.id}
            onClick={() => setModule(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
              module === tab.id || (tab.id === 'more' && MORE_ITEMS.some(m => m.id === module))
                ? 'text-[#16264A] font-bold'
                : 'text-[#5A6577]'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{t(tab.label, tab.labelHi)}</span>
          </button>
        ))}
      </nav>

      {/* Floating AI button */}
      <button
        onClick={() => setAiOpen(o => !o)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center cursor-pointer"
        style={{ background: 'linear-gradient(135deg,#7C3AED,#4C1D95)' }}
        title={t('AI Assistant', 'AI सहायक')}
      >
        <span className="text-white text-[11px] font-bold">AI</span>
      </button>

      {aiOpen && <ParentAIWidget lang={lang} onClose={() => setAiOpen(false)} />}
    </div>
  );
}

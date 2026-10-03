import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useLang } from '../lib/language';
import { useAuth, displayName, ROLE_TITLES } from '../lib/auth';
import { Avatar, Modal } from './ui';
import type { Screen } from '../lib/data';
import { workspacesFor } from '../lib/workspaces';
import { PRODUCT_NAME, useInstitution } from '../lib/institution';

interface AppShellProps {
  children: ReactNode;
  onNavigate: (s: Screen) => void;
  /** The workspace this shell is showing, highlighted in the rail. */
  current: Screen;
  title: string;
  breadcrumb?: Array<{ label: string; onClick?: () => void }>;
}

interface Activity { id: string; occurredAt: string; actorName: string; module: string; action: string; target: string; outcome: string }

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

/**
 * The frame of the administration workspaces: the institution's bar, a rail
 * of the workspaces this role may open, and a live activity feed read from
 * the audit chain.
 */
export default function AppShell({ children, onNavigate, current, title, breadcrumb }: AppShellProps) {
  const { lang, toggle, t } = useLang();
  const [railOpen, setRailOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => Number(localStorageGet('resolion.activitySeen') ?? 0));
  const [about, setAbout] = useState<null | 'accessibility' | 'help'>(null);

  const inst = useInstitution();
  const { user, signOut } = useAuth();
  const leave = async () => { await signOut(); onNavigate('landing'); };
  const spaces = workspacesFor(user?.role);

  const activity = useQuery({
    queryKey: ['insights', 'activity'],
    queryFn: () => api<{ entries: Activity[] }>('/api/insights/activity'),
    refetchInterval: 30_000,
  });
  const entries = activity.data?.entries ?? [];
  const unread = entries.filter(e => new Date(e.occurredAt).getTime() > seenAt).length;

  function markSeen() {
    const now = Date.now();
    setSeenAt(now);
    localStorageSet('resolion.activitySeen', String(now));
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#EDEFF3]">
      <header className="h-14 bg-[#16264A] flex items-center px-4 gap-3 z-30 shrink-0">
        <button onClick={() => setRailOpen(r => !r)} aria-label={t('Toggle menu', 'मेनू')} className="text-white/70 hover:text-white cursor-pointer p-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#E0952A] rounded-[4px] flex items-center justify-center text-white font-bold text-[12px]">{inst.shortCode}</div>
          <div className="hidden sm:block">
            <p className="text-white font-semibold text-[13px] leading-tight">{inst.displayName(lang)}</p>
            <p className="text-white/50 text-[10px] leading-tight">{title}</p>
          </div>
        </div>

        <div className="flex-1" />

        <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          className="hidden md:flex items-center gap-2 text-white/60 hover:text-white cursor-pointer text-[12px] border border-white/20 rounded-[4px] px-3 py-1.5 min-w-[220px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <span className="flex-1 text-left">{t('Search students, staff, records…', 'छात्र, स्टाफ, अभिलेख खोजें…')}</span>
          <kbd className="text-[10px] bg-white/10 rounded px-1.5 font-mono">Ctrl K</kbd>
        </button>

        <button onClick={toggle} className="text-[12px] font-semibold text-white/70 hover:text-white cursor-pointer border border-white/20 rounded-[4px] px-2.5 py-1">
          {lang === 'en' ? 'हिं' : 'EN'}
        </button>

        <div className="relative">
          <button onClick={() => { setNotifOpen(o => !o); setProfileOpen(false); }} aria-label={t('Activity', 'गतिविधि')} className="relative text-white/70 hover:text-white cursor-pointer p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-[#E0952A] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-[4px] shadow-lg border border-[#D3D8E0] z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
                <span className="font-semibold text-[14px] text-[#16264A]">{t('Live activity', 'लाइव गतिविधि')}</span>
                <button onClick={markSeen} disabled={unread === 0} className="text-[12px] text-[#E0952A] cursor-pointer disabled:opacity-40 disabled:cursor-default">{t('Mark all read', 'सभी पढ़ा')}</button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {entries.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-[#5A6577]">{activity.isLoading ? t('Loading…', 'लोड हो रहा है…') : t('Nothing has happened yet.', 'अभी तक कुछ नहीं हुआ।')}</p>}
                {entries.map(e => {
                  const fresh = new Date(e.occurredAt).getTime() > seenAt;
                  return (
                    <div key={e.id} className={`px-4 py-2.5 border-b border-[#EDEFF3] last:border-b-0 ${fresh ? 'bg-[#FEF9EC]' : ''}`}>
                      <p className="text-[13px] text-[#16264A]"><span className="font-medium">{e.actorName}</span> · {e.action}</p>
                      <p className="text-[11px] text-[#5A6577] truncate">{e.module} · {e.target} · {ago(e.occurredAt)}{e.outcome !== 'OK' && <span className="ml-1 text-[#A8242C] font-semibold">{e.outcome}</span>}</p>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => { setNotifOpen(false); onNavigate('it-console'); }} className="w-full text-center text-[12px] text-[#E0952A] py-2.5 border-t border-[#D3D8E0] hover:bg-[#EDEFF3] cursor-pointer">{t('Open the full audit chain →', 'पूर्ण ऑडिट श्रृंखला खोलें →')}</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => { setProfileOpen(o => !o); setNotifOpen(false); }} className="flex items-center gap-2 cursor-pointer">
            <Avatar name={displayName(user) || 'User'} size={30} />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-[4px] shadow-lg border border-[#D3D8E0] z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-[#D3D8E0]">
                <p className="font-semibold text-[14px] text-[#16264A]">{displayName(user)}</p>
                <p className="text-[12px] text-[#5A6577]">{user ? ROLE_TITLES[user.role] : ''}</p>
                <p className="text-[11px] text-[#5A6577] truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <button onClick={() => { setProfileOpen(false); onNavigate('it-console'); }} className="w-full text-left px-4 py-2.5 text-[13px] text-[#16264A] hover:bg-[#EDEFF3] cursor-pointer">{t('Account & security (IT Cell)', 'खाता एवं सुरक्षा (आईटी सेल)')}</button>
                <button onClick={() => { setProfileOpen(false); setAbout('help'); }} className="w-full text-left px-4 py-2.5 text-[13px] text-[#16264A] hover:bg-[#EDEFF3] cursor-pointer">{t('Help & shortcuts', 'सहायता एवं शॉर्टकट')}</button>
                <div className="border-t border-[#D3D8E0] mt-1 pt-1">
                  <button onClick={leave} className="w-full text-left px-4 py-2.5 text-[13px] text-[#A8242C] hover:bg-[#FEE2E2] cursor-pointer">{t('Sign Out', 'साइन आउट')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className={`${railOpen ? 'w-60' : 'w-0 overflow-hidden'} bg-white border-r border-[#D3D8E0] transition-all duration-200 flex flex-col shrink-0 z-20`}>
          <p className="px-4 pt-4 pb-2 text-[10px] font-semibold text-[#5A6577] uppercase tracking-widest">{t('Workspaces', 'कार्यक्षेत्र')}</p>
          <nav className="flex-1 overflow-y-auto pb-2">
            {spaces.map(w => (
              <button key={w.screen} onClick={() => onNavigate(w.screen)}
                className={`w-full flex items-start gap-2.5 text-left px-4 py-2.5 transition-colors cursor-pointer ${w.screen === current ? 'bg-[#FEF9EC] border-r-2 border-[#E0952A]' : 'hover:bg-[#EDEFF3]'}`}>
                <span className="text-[14px] w-5 text-center shrink-0">{w.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-[13px] ${w.screen === current ? 'text-[#E0952A] font-semibold' : 'text-[#16264A] font-medium'}`}>{lang === 'hi' ? w.labelHi : w.label}</span>
                  <span className="block text-[11px] text-[#5A6577] leading-snug">{w.description}</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="border-t border-[#D3D8E0] p-4">
            <button onClick={leave} className="flex items-center gap-2 text-[13px] text-[#5A6577] hover:text-[#A8242C] cursor-pointer w-full">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              {t('Sign Out', 'साइन आउट')}
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          {breadcrumb && (
            <div className="px-6 py-3 border-b border-[#D3D8E0] bg-white flex items-center gap-2 text-[13px] text-[#5A6577]">
              <span className="text-[#16264A]">{title}</span>
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="text-[#D3D8E0]">/</span>
                  {b.onClick
                    ? <button onClick={b.onClick} className="hover:text-[#16264A] cursor-pointer">{b.label}</button>
                    : <span className="text-[#16264A] font-medium">{b.label}</span>}
                </span>
              ))}
            </div>
          )}
          <div className="p-6 pb-20">{children}</div>
        </main>
      </div>

      <footer className="border-t border-[#D3D8E0] bg-white px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#5A6577]">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-[#16264A]">{inst.place}</span>
          <span>{PRODUCT_NAME}</span>
        </div>
        <div className="flex items-center gap-4">
          {spaces.some(w => w.screen === 'acad-ops') && <button onClick={() => onNavigate('acad-ops')} className="hover:text-[#16264A] cursor-pointer">{t('Grievance cell', 'शिकायत प्रकोष्ठ')}</button>}
          {spaces.some(w => w.screen === 'governance') && <button onClick={() => onNavigate('governance')} className="hover:text-[#16264A] cursor-pointer">RTI</button>}
          <button onClick={() => setAbout('accessibility')} className="hover:text-[#16264A] cursor-pointer">{t('Accessibility', 'सुलभता')}</button>
          <span>© {new Date().getFullYear()} {PRODUCT_NAME}</span>
        </div>
      </footer>

      <Modal open={about !== null} onClose={() => setAbout(null)} title={about === 'help' ? t('Help & shortcuts', 'सहायता एवं शॉर्टकट') : t('Accessibility statement', 'सुलभता वक्तव्य')} width="520px">
        {about === 'help' ? <HelpBody t={t} /> : <AccessibilityBody />}
      </Modal>
    </div>
  );
}

function HelpBody({ t }: { t: (a: string, b: string) => string }) {
  const rows: Array<[string, string]> = [
    ['Ctrl / ⌘ + K', t('Search students, staff and records, or jump to a workspace', 'छात्र, स्टाफ, अभिलेख खोजें या कार्यक्षेत्र बदलें')],
    ['Esc', t('Close a dialog or the search', 'संवाद या खोज बंद करें')],
    ['हिं / EN', t('Switch between Hindi and English', 'हिंदी और अंग्रेज़ी के बीच बदलें')],
  ];
  return (
    <div className="text-[13px] text-[#16264A]">
      <table className="w-full mb-4">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-[#EDEFF3]"><td className="py-2 pr-4 font-mono text-[12px] whitespace-nowrap">{k}</td><td className="py-2 text-[#5A6577]">{v}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="text-[#5A6577]">{t('Every action you take is written to a tamper-evident audit chain the IT Cell can verify. For account problems, contact your IT Cell.', 'आपकी हर कार्रवाई एक छेड़छाड़-रोधी ऑडिट श्रृंखला में दर्ज होती है। खाते की समस्या के लिए अपने आईटी सेल से संपर्क करें।')}</p>
    </div>
  );
}

function AccessibilityBody() {
  return (
    <div className="text-[13px] text-[#16264A] space-y-3">
      <p>{PRODUCT_NAME} aims to meet WCAG 2.1 level AA and the Government of India Guidelines for Indian Government Websites (GIGW 3.0).</p>
      <ul className="list-disc pl-5 space-y-1 text-[#5A6577]">
        <li>Every screen is available in English and Hindi.</li>
        <li>Text and controls meet AA contrast on the default theme; status is never shown by colour alone.</li>
        <li>All actions can be reached by keyboard; Ctrl+K opens search from anywhere.</li>
        <li>Documents are issued as tagged PDFs with a verification QR code.</li>
      </ul>
      <p className="text-[#5A6577]">If something is hard to use, tell your institution's IT Cell — accessibility issues are treated as defects.</p>
    </div>
  );
}

function localStorageGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

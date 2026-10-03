import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth, displayName, ROLE_TITLES } from '../lib/auth';
import { useLang } from '../lib/language';
import { canOpen, workspaceFor, workspacesFor } from '../lib/workspaces';
import type { Screen } from '../lib/data';
import { Spinner } from './ui';

interface Hit { kind: string; id: string; title: string; subtitle: string; screen: Screen }

/**
 * The way between workspaces: a launcher in the corner and a command palette
 * on Ctrl/⌘ K, listing only what the signed-in role may open and searching
 * the institution's live records.
 */
export default function WorkspaceSwitcher({ current, onNavigate }: { current: Screen; onNavigate: (s: Screen) => void }) {
  const { user, signOut } = useAuth();
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const spaces = workspacesFor(user?.role);
  const staff = user && !['STUDENT', 'PARENT'].includes(user.role);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setCursor(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(id);
  }, [q]);

  const search = useQuery({
    queryKey: ['insights', 'search', debounced],
    queryFn: () => api<{ hits: Hit[] }>(`/api/insights/search?q=${encodeURIComponent(debounced)}`),
    enabled: Boolean(staff && open && debounced.length >= 2),
    staleTime: 10_000,
  });

  const filteredSpaces = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? spaces.filter(w => `${w.label} ${w.description}`.toLowerCase().includes(needle)) : spaces;
  }, [q, spaces]);

  const hits = (search.data?.hits ?? []).filter(h => user && canOpen(user.role, h.screen));
  const items: Array<{ key: string; go: () => void }> = [
    ...filteredSpaces.map(w => ({ key: `ws-${w.screen}`, go: () => go(w.screen) })),
    ...hits.map(h => ({ key: `hit-${h.id}`, go: () => go(h.screen) })),
  ];

  function go(s: Screen) {
    setOpen(false);
    onNavigate(s);
  }

  // A student or parent has one workspace and its own navigation.
  if (!user || spaces.length < 2) return null;

  const here = workspaceFor(current);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 bg-[#16264A] text-white text-[12px] pl-3 pr-2 py-2 rounded-full shadow-lg hover:bg-[#1F3462] cursor-pointer border border-white/10"
        title={t('Switch workspace or search (Ctrl+K)', 'कार्यक्षेत्र बदलें या खोजें (Ctrl+K)')}
      >
        <span className="text-[13px]">{here?.icon ?? '◎'}</span>
        <span className="hidden sm:inline font-medium">{here ? (lang === 'hi' ? here.labelHi : here.label) : t('Workspaces', 'कार्यक्षेत्र')}</span>
        <kbd className="hidden sm:inline text-[10px] bg-white/15 rounded px-1.5 py-0.5 font-mono">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[95] bg-[#0B1530]/50 flex items-start justify-center pt-[10vh] px-4" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-xl bg-white rounded-[6px] shadow-2xl border border-[#D3D8E0] overflow-hidden animate-fade-in" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 border-b border-[#D3D8E0]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input
                ref={inputRef}
                value={q}
                onChange={e => { setQ(e.target.value); setCursor(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
                  if (e.key === 'Enter') items[cursor]?.go();
                }}
                placeholder={staff ? t('Search workspaces, students, staff, applications…', 'कार्यक्षेत्र, छात्र, स्टाफ, आवेदन खोजें…') : t('Search workspaces…', 'कार्यक्षेत्र खोजें…')}
                className="flex-1 py-3.5 text-[15px] text-[#16264A] outline-none bg-transparent"
              />
              {search.isFetching && <Spinner size={14} />}
              <kbd className="text-[10px] text-[#5A6577] border border-[#D3D8E0] rounded px-1.5 py-0.5 font-mono">Esc</kbd>
            </div>

            <div className="max-h-[55vh] overflow-y-auto py-2">
              {filteredSpaces.length > 0 && <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#5A6577]">{t('Workspaces', 'कार्यक्षेत्र')}</p>}
              {filteredSpaces.map((w, i) => (
                <button key={w.screen} onClick={() => go(w.screen)} onMouseEnter={() => setCursor(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer ${cursor === i ? 'bg-[#FEF9EC]' : ''}`}>
                  <span className="w-8 h-8 rounded-[4px] bg-[#EDEFF3] flex items-center justify-center text-[15px] shrink-0">{w.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-[#16264A]">{lang === 'hi' ? w.labelHi : w.label}{w.screen === current && <span className="ml-2 text-[11px] text-[#E0952A]">{t('current', 'वर्तमान')}</span>}</span>
                    <span className="block text-[12px] text-[#5A6577] truncate">{w.description}</span>
                  </span>
                </button>
              ))}

              {hits.length > 0 && <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#5A6577]">{t('Records', 'अभिलेख')}</p>}
              {hits.map((h, j) => {
                const i = filteredSpaces.length + j;
                return (
                  <button key={h.id} onClick={() => go(h.screen)} onMouseEnter={() => setCursor(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer ${cursor === i ? 'bg-[#FEF9EC]' : ''}`}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#16264A] bg-[#EDEFF3] rounded px-1.5 py-0.5 w-24 text-center shrink-0 truncate">{h.kind}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-[#16264A] truncate">{h.title}</span>
                      <span className="block text-[11px] text-[#5A6577] truncate">{h.subtitle}</span>
                    </span>
                    <span className="text-[11px] text-[#5A6577] shrink-0">{workspaceFor(h.screen)?.label}</span>
                  </button>
                );
              })}

              {staff && debounced.length >= 2 && !search.isFetching && hits.length === 0 && filteredSpaces.length === 0 && (
                <p className="px-4 py-6 text-center text-[13px] text-[#5A6577]">{t(`Nothing matches "${debounced}".`, `"${debounced}" से कुछ मेल नहीं खाता।`)}</p>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#D3D8E0] bg-[#F7F8FA] text-[12px] text-[#5A6577]">
              <span>{displayName(user)} · {ROLE_TITLES[user.role]}</span>
              <button onClick={async () => { setOpen(false); await signOut(); onNavigate('landing'); }} className="text-[#A8242C] hover:underline cursor-pointer">{t('Sign out', 'साइन आउट')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

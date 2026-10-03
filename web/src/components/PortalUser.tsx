import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth, displayName, ROLE_TITLES } from '../lib/auth';
import type { Screen } from '../lib/data';
import { Avatar } from './ui';
import { canOpen } from '../lib/workspaces';

interface Activity { id: string; occurredAt: string; actorName: string; module: string; action: string; target: string; outcome: string }

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

const SEEN_KEY = 'resolion.activitySeen';
const readSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY) ?? 0); } catch { return 0; } };

/**
 * The right-hand end of a workspace's top bar: a live activity bell read from
 * the audit chain, and the signed-in user with a real sign-out.
 */
export default function PortalUser({ onNavigate, dark = true }: { onNavigate: (s: Screen) => void; dark?: boolean }) {
  const { user, signOut } = useAuth();
  const [menu, setMenu] = useState<null | 'bell' | 'user'>(null);
  const [seenAt, setSeenAt] = useState(readSeen);
  const staff = user && !['STUDENT', 'PARENT'].includes(user.role);

  const activity = useQuery({
    queryKey: ['insights', 'activity'],
    queryFn: () => api<{ entries: Activity[] }>('/api/insights/activity'),
    enabled: Boolean(staff),
    refetchInterval: 30_000,
  });
  const entries = activity.data?.entries ?? [];
  const unread = entries.filter(e => new Date(e.occurredAt).getTime() > seenAt).length;
  const tone = dark ? 'text-white/60 hover:text-white' : 'text-[#5A6577] hover:text-[#16264A]';

  function markSeen() {
    const now = Date.now();
    setSeenAt(now);
    try { localStorage.setItem(SEEN_KEY, String(now)); } catch { /* private mode */ }
  }

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      {staff && (
        <div className="relative">
          <button onClick={() => setMenu(m => (m === 'bell' ? null : 'bell'))} aria-label="Activity" className={`relative cursor-pointer p-1 ${tone}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 bg-[#E0952A] text-white text-[8px] font-bold rounded-full flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {menu === 'bell' && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#D3D8E0] z-50 rounded-[4px] shadow-lg animate-fade-in">
              <div className="px-4 py-2.5 border-b border-[#D3D8E0] flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#16264A]">Recent activity</span>
                <button onClick={markSeen} disabled={unread === 0} className="text-[11px] text-[#E0952A] cursor-pointer disabled:opacity-40 disabled:cursor-default">Mark all read</button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {entries.length === 0 && <p className="px-4 py-5 text-center text-[12px] text-[#5A6577]">{activity.isLoading ? 'Loading…' : 'No activity yet.'}</p>}
                {entries.map(e => (
                  <div key={e.id} className={`px-4 py-2.5 border-b border-[#EDEFF3] last:border-b-0 ${new Date(e.occurredAt).getTime() > seenAt ? 'bg-[#FEF9EC]' : ''}`}>
                    <p className="text-[12px] text-[#16264A]"><span className="font-medium">{e.actorName}</span> · {e.action}</p>
                    <p className="text-[11px] text-[#5A6577] truncate">{e.module} · {e.target} · {ago(e.occurredAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="relative">
        <button onClick={() => setMenu(m => (m === 'user' ? null : 'user'))} className="flex items-center gap-2 cursor-pointer">
          <Avatar name={displayName(user) || 'User'} size={28} />
        </button>
        {menu === 'user' && (
          <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-[#D3D8E0] z-50 rounded-[4px] shadow-lg animate-fade-in">
            <div className="px-4 py-3 border-b border-[#D3D8E0]">
              <p className="text-[14px] font-semibold text-[#16264A]">{displayName(user)}</p>
              <p className="text-[12px] text-[#5A6577]">{user.faculty?.designation ?? user.office?.designation ?? ROLE_TITLES[user.role]}</p>
              <p className="text-[11px] text-[#5A6577] truncate">{user.email}</p>
            </div>
            {staff && <button onClick={() => { setMenu(null); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })); }} className="w-full text-left px-4 py-2.5 text-[13px] text-[#16264A] hover:bg-[#EDEFF3] cursor-pointer">Switch workspace · Ctrl K</button>}
            <button onClick={async () => { setMenu(null); await signOut(); onNavigate('landing'); }} className="w-full text-left px-4 py-2.5 text-[13px] text-[#A8242C] hover:bg-[#FEE2E2] cursor-pointer border-t border-[#D3D8E0]">Sign out</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A link to another workspace, shown only to roles that may open it. */
export function WorkspaceLink({ screen, label, onNavigate, className = 'text-[11px] text-white/50 hover:text-white cursor-pointer hidden lg:block' }: { screen: Screen; label: string; onNavigate: (s: Screen) => void; className?: string }) {
  const { user } = useAuth();
  if (!user || !canOpen(user.role, screen)) return null;
  return <button onClick={() => onNavigate(screen)} className={className}>{label}</button>;
}

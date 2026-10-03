import { useState } from 'react';
import type { Module } from '../StudentPortal';
import { useAnnouncementList } from '../../lib/queries';

interface Props { onNavigate: (m: Module) => void }

type FilterKey = 'all' | 'university' | 'college' | 'department' | 'batch';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'university', label: 'University' },
  { key: 'college', label: 'College' },
  { key: 'department', label: 'Department' },
  { key: 'batch', label: 'Batch' },
];

const SCOPE_PILL: Record<string, { bg: string; text: string }> = {
  university: { bg: '#1E3A5F', text: '#FFFFFF' },
  college:    { bg: '#1D4ED8', text: '#FFFFFF' },
  department: { bg: '#5A6577', text: '#FFFFFF' },
  batch:      { bg: '#D3D8E0', text: '#16264A' },
};

const SCOPE_LABEL: Record<string, string> = {
  university: 'University',
  college: 'College',
  department: 'Department',
  batch: 'Batch',
};

// Simulate unread counts
const UNREAD: Record<FilterKey, number> = { all: 3, university: 1, college: 1, department: 1, batch: 0 };

export default function Announcements({ onNavigate }: Props) {
  const { data: ANNOUNCEMENTS } = useAnnouncementList();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [read, setRead] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (!read.has(id)) {
      setRead(prev => new Set(prev).add(id));
    }
  }

  const filtered = filter === 'all'
    ? ANNOUNCEMENTS
    : ANNOUNCEMENTS.filter(a => a.scope === filter);

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      {/* Header */}
      <div className="bg-[#16264A] px-4 py-4">
        <button onClick={() => onNavigate(null as any)} className="flex items-center gap-2 text-white/60 hover:text-white mb-3 cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          <span className="text-[13px]">Student Portal</span>
        </button>
        <h1 className="text-[20px] font-semibold text-white">Announcements</h1>
        <p className="text-[13px] text-white/60 mt-0.5">
          {ANNOUNCEMENTS.filter(a => !read.has(a.id)).length} unread notices
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border-b border-[#D3D8E0] sticky top-0 z-10">
        <div className="flex overflow-x-auto">
          {FILTERS.map(f => {
            const count = UNREAD[f.key];
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`shrink-0 px-4 py-3 text-[13px] font-medium cursor-pointer transition-colors relative flex items-center gap-1.5 whitespace-nowrap ${
                  filter === f.key
                    ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px'
                    : 'text-[#5A6577] hover:text-[#16264A]'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#A8242C] text-white text-[9px] font-bold shrink-0">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white mt-[1px] px-4 py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[#EDEFF3] flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          </div>
          <p className="text-[15px] font-medium text-[#16264A]">No announcements</p>
          <p className="text-[13px] text-[#5A6577] mt-1">No {filter === 'all' ? '' : SCOPE_LABEL[filter] + ' '}notices at this time</p>
        </div>
      ) : (
        <div className="bg-white mt-[1px]">
          {filtered.map((ann, i) => {
            const isExpanded = expanded.has(ann.id);
            const isRead = read.has(ann.id);
            const scopePill = SCOPE_PILL[ann.scope] || SCOPE_PILL.batch;

            return (
              <button
                key={ann.id}
                onClick={() => toggleExpand(ann.id)}
                className={`w-full text-left cursor-pointer transition-colors ${i < filtered.length - 1 ? 'border-b border-[#D3D8E0]' : ''} ${
                  !isRead ? 'bg-[#FEF9EC]' : 'hover:bg-[#FAFBFC]'
                } ${ann.urgent ? 'border-l-4 border-l-[#E0952A]' : ''}`}
              >
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {!isRead && (
                        <span className="w-2 h-2 rounded-full bg-[#E0952A] shrink-0 mt-1.5" />
                      )}
                      <p className={`text-[14px] font-semibold text-[#16264A] leading-snug line-clamp-2 ${!isRead ? '' : 'pl-0'}`}>
                        {ann.title}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {ann.urgent && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#A8242C] text-white rounded-[2px]">URGENT</span>
                      )}
                      <span className="text-[11px] text-[#5A6577]">{ann.date}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-[2px]"
                      style={{ background: scopePill.bg, color: scopePill.text }}>
                      {SCOPE_LABEL[ann.scope]}
                    </span>
                  </div>

                  {isExpanded ? (
                    <p className="text-[13px] text-[#5A6577] leading-relaxed">{ann.body}</p>
                  ) : (
                    <p className="text-[13px] text-[#5A6577] line-clamp-2">{ann.body}</p>
                  )}

                  <p className="text-[11px] text-[#E0952A] mt-2 font-medium">
                    {isExpanded ? 'Tap to collapse ↑' : 'Tap to read more ↓'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}

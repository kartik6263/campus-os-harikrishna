import { useState, useMemo } from 'react';
import {
  useApprovalQueue,
  useDecideApproval,
  type LegacyApprovalItem as ApprovalItem,
} from '../../lib/governancequeries';
import { Button, Modal, InlineAlert, toast, Checkbox, Toggle } from '../../components/ui';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

const SectionLabel = ({ children, right }: { children: string; right?: React.ReactNode }) => (
  <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between border-b border-[#D3D8E0]">
    <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{children}</span>
    {right}
  </div>
);

const TYPE_COLORS: Record<string, string> = {
  faculty_leave: 'bg-[#DBEAFE] text-[#1E40AF]',
  marks_entry: 'bg-[#D1FAE5] text-[#065F46]',
  attendance_correction: 'bg-[#FEF3C7] text-[#92400E]',
  exam_form_ex_student: 'bg-[#FCE7F3] text-[#9D174D]',
  cert_request: 'bg-[#CCFBF1] text-[#134E4A]',
  fee_waiver: 'bg-[#FEE2E2] text-[#991B1B]',
  hostel_leave: 'bg-[#E0E7FF] text-[#3730A3]',
  student_edit: 'bg-[#F3F4F6] text-[#374151]',
  result_publish: 'bg-[#D1FAE5] text-[#065F46]',
  timetable_change: 'bg-[#FEF9C3] text-[#713F12]',
  workflow_trigger: 'bg-[#F3E8FF] text-[#6B21A8]',
};

const PRIORITY_COLORS = {
  high: 'bg-[#FEE2E2] text-[#A8242C]',
  normal: 'bg-[#F3F4F6] text-[#5A6577]',
  low: 'bg-[#D1FAE5] text-[#065F46]',
};

const DELEGATE_OPTIONS = [
  'Dr. V.K. Sharma (Vice Principal)',
  'Prof. M.L. Gupta (HOD CS)',
  'Sri R.K. Yadav (Registrar)',
];

function slaDays(deadline: string): number {
  const parts = deadline.split('-').map(Number);
  const d = new Date(parts[2], parts[1] - 1, parts[0]);
  return Math.floor((d.getTime() - Date.now()) / 86400000);
}

function SlaTag({ deadline }: { deadline: string }) {
  const days = slaDays(deadline);
  if (days < 0) return <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-[#FEE2E2] text-[#A8242C] rounded-[3px]">Overdue {Math.abs(days)}d</span>;
  if (days <= 1) return <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-[#FEF3C7] text-[#8A6D1F] rounded-[3px]">Due {days === 0 ? 'today' : 'tomorrow'}</span>;
  return <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-[#D1FAE5] text-[#065F46] rounded-[3px]">{days}d left</span>;
}

export default function ApprovalInbox(_props: Props) {
  const { data: items } = useApprovalQueue();
  const decide = useDecideApproval();
  const [filter, setFilter] = useState({ type: 'all', priority: 'all', search: '' });
  const [sortBy, setSortBy] = useState<'sla' | 'raisedOn' | 'priority'>('sla');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Read the open item back out of the live queue, so a decision taken in the
  // faculty portal is reflected here rather than frozen at the moment it opened.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailItem = items.find(i => i.id === detailId) ?? null;
  const setDetailItem = (i: ApprovalItem | null) => setDetailId(i?.id ?? null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const [delegateTo, setDelegateTo] = useState(DELEGATE_OPTIONS[0]);
  const [delegateNote, setDelegateNote] = useState('');
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [onLeaveMode, setOnLeaveMode] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');

  const pendingItems = useMemo(() => items.filter(a => a.status === 'pending'), [items]);
  const highCount = pendingItems.filter(a => a.priority === 'high').length;
  const overdueCount = pendingItems.filter(a => slaDays(a.slaDeadline) < 0).length;
  const dueTodayCount = pendingItems.filter(a => slaDays(a.slaDeadline) === 0).length;

  // type counts
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    pendingItems.forEach(a => { m[a.type] = (m[a.type] || 0) + 1; });
    return m;
  }, [pendingItems]);

  const typeFilters = [
    { id: 'all', label: 'All' },
    { id: 'faculty_leave', label: 'Faculty Leave' },
    { id: 'marks_entry', label: 'Internal Marks' },
    { id: 'attendance_correction', label: 'Attendance Correction' },
    { id: 'exam_form_ex_student', label: 'Ex-Student Clearance' },
    { id: 'cert_request', label: 'Certificate' },
    { id: 'fee_waiver', label: 'Fee Waiver' },
    { id: 'hostel_leave', label: 'Hostel Leave' },
    { id: 'student_edit', label: 'Student Edit' },
    { id: 'result_publish', label: 'Result Publication' },
  ];

  const filteredItems = useMemo(() => {
    let arr = [...pendingItems];
    if (filter.type !== 'all') arr = arr.filter(a => a.type === filter.type);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      arr = arr.filter(a =>
        a.subject.toLowerCase().includes(q) ||
        a.from.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }
    if (sortBy === 'sla') arr.sort((a, b) => slaDays(a.slaDeadline) - slaDays(b.slaDeadline));
    else if (sortBy === 'priority') {
      const o = { high: 0, normal: 1, low: 2 };
      arr.sort((a, b) => o[a.priority] - o[b.priority]);
    }
    return arr;
  }, [pendingItems, filter, sortBy]);

  async function approveItem(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      await decide.mutateAsync({ type: item.apiType, id, decision: 'APPROVE' });
      if (detailId === id) setDetailItem(null);
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      if (item.type === 'marks_entry') {
        toast.success('Marks approved and locked — the sheet can no longer be edited.');
      } else if (item.type === 'faculty_leave') {
        toast.success('Leave approved — the lecturer sees the decision in their own portal.');
      } else {
        toast.success(`Approved — ${item.from.name} notified.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve that item.');
    }
  }

  function openReject(id: string) {
    setRejectId(id);
    setRejectReason('');
    setRejectOpen(true);
  }

  async function confirmReject() {
    if (!rejectId || rejectReason.length < 20) return;
    const item = items.find(i => i.id === rejectId);
    if (!item) return;
    try {
      await decide.mutateAsync({
        type: item.apiType,
        id: rejectId,
        decision: 'REJECT',
        note: rejectReason,
      });
      if (detailId === rejectId) setDetailItem(null);
      setSelected(prev => { const s = new Set(prev); s.delete(rejectId); return s; });
      setRejectOpen(false);
      toast.error(`Rejected — ${item.from.name} notified with the reason.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject that item.');
    }
  }

  function openDelegate(id: string) {
    setDelegateId(id);
    setDelegateTo(DELEGATE_OPTIONS[0]);
    setDelegateNote('');
    setDelegateOpen(true);
  }

  function confirmDelegate() {
    if (!delegateId) return;
    setDelegateOpen(false);
    // Nothing is written: an approval is signed by whoever decides it, and the
    // API has no notion of passing that signature to somebody else.
    toast.info(
      `Delegation is not recorded yet — ${delegateTo} cannot sign this. Approve or reject it here.`,
    );
  }

  /** Decides a selection one at a time; each goes to the module that owns it. */
  async function decideMany(decision: 'APPROVE' | 'REJECT', note?: string) {
    const ids = Array.from(selected);
    let done = 0;
    for (const id of ids) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      try {
        await decide.mutateAsync({ type: item.apiType, id, decision, note });
        done += 1;
      } catch {
        /* the queue refetches either way; the count below is what happened */
      }
    }
    setSelected(new Set());
    if (detailId && ids.includes(detailId)) setDetailItem(null);
    return { done, attempted: ids.length };
  }

  async function bulkApprove() {
    setBulkApproveOpen(false);
    const { done, attempted } = await decideMany('APPROVE');
    if (done === 0) toast.error('None of those could be approved.');
    else if (done < attempted) toast.info(`${done} of ${attempted} approved; the rest were refused.`);
    else toast.success(`${done} items approved.`);
  }

  async function confirmBulkReject() {
    if (bulkRejectReason.length < 20) return;
    setBulkRejectOpen(false);
    const { done, attempted } = await decideMany('REJECT', bulkRejectReason);
    if (done === 0) toast.error('None of those could be rejected.');
    else if (done < attempted) toast.info(`${done} of ${attempted} rejected; the rest were refused.`);
    else toast.error(`${done} items rejected.`);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function selectAll() {
    if (selected.size === filteredItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map(a => a.id)));
    }
  }

  const now = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div className="flex h-full bg-[#EDEFF3] overflow-hidden">
      {/* LEFT: filter sidebar */}
      <aside className="w-52 bg-white border-r border-[#D3D8E0] flex flex-col shrink-0 overflow-y-auto">
        <div className="px-3 py-3 border-b border-[#D3D8E0]">
          <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Overview</div>
          <div className="grid grid-cols-2 gap-1">
            <div className="bg-[#EDEFF3] p-2 rounded-[2px]">
              <div className="text-[18px] font-bold text-[#16264A]">{pendingItems.length}</div>
              <div className="text-[10px] text-[#5A6577]">Total Pending</div>
            </div>
            <div className="bg-[#FEE2E2] p-2 rounded-[2px]">
              <div className="text-[18px] font-bold text-[#A8242C]">{highCount}</div>
              <div className="text-[10px] text-[#A8242C]">High Priority</div>
            </div>
            <div className="bg-[#FEE2E2] p-2 rounded-[2px]">
              <div className="text-[18px] font-bold text-[#A8242C]">{overdueCount}</div>
              <div className="text-[10px] text-[#A8242C]">Overdue SLA</div>
            </div>
            <div className="bg-[#FEF3C7] p-2 rounded-[2px]">
              <div className="text-[18px] font-bold text-[#8A6D1F]">{dueTodayCount}</div>
              <div className="text-[10px] text-[#8A6D1F]">Due Today</div>
            </div>
          </div>
        </div>

        {/* Type filters */}
        <div className="px-3 py-3 border-b border-[#D3D8E0] flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1.5">Filter by Type</div>
          {typeFilters.map(tf => (
            <button
              key={tf.id}
              onClick={() => setFilter(f => ({ ...f, type: tf.id }))}
              className={`w-full flex items-center justify-between px-2 py-1.5 text-[12px] rounded-[2px] transition-colors ${
                filter.type === tf.id
                  ? 'bg-[#16264A] text-white font-semibold'
                  : 'text-[#16264A] hover:bg-[#EDEFF3]'
              }`}
            >
              <span>{tf.label}</span>
              {tf.id !== 'all' && typeCounts[tf.id] ? (
                <span className={`text-[10px] font-bold px-1.5 rounded-[3px] ${
                  filter.type === tf.id ? 'bg-white text-[#16264A]' : 'bg-[#EDEFF3] text-[#5A6577]'
                }`}>
                  {typeCounts[tf.id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="px-3 py-3 border-b border-[#D3D8E0]">
          <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1.5">Sort</div>
          {[
            { id: 'sla', label: 'Oldest First (SLA)' },
            { id: 'raisedOn', label: 'Newest First' },
            { id: 'priority', label: 'High Priority First' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id as any)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded-[2px] ${
                sortBy === s.id ? 'text-[#E0952A] font-semibold' : 'text-[#5A6577] hover:bg-[#EDEFF3]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${sortBy === s.id ? 'bg-[#E0952A]' : 'bg-[#D3D8E0]'}`} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Delegation mode */}
        <div className="px-3 py-3">
          <Toggle
            on={onLeaveMode}
            onChange={setOnLeaveMode}
            label="Delegation Mode"
          />
          {onLeaveMode && (
            <div className="mt-2 p-2 bg-[#FEF3C7] border border-[#E0952A] rounded-[2px]">
              <div className="text-[11px] font-semibold text-[#8A6D1F]">Delegation Active</div>
              <div className="text-[11px] text-[#8A6D1F] mt-0.5">Dr. V.K. Sharma (Vice Principal) is handling approvals.</div>
            </div>
          )}
        </div>
      </aside>

      {/* CENTER: list */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="bg-white border-b border-[#D3D8E0] px-4 py-2.5 flex items-center gap-3 shrink-0">
          <input
            type="text"
            placeholder="Search by subject, name or ID…"
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            className="flex-1 h-8 px-3 text-[13px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] bg-[#F7F8FA] text-[#16264A] placeholder-[#9CA3AF]"
          />
          <Checkbox
            label="Select All"
            checked={selected.size > 0 && selected.size === filteredItems.length}
            onChange={selectAll}
          />
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="bg-[#16264A] px-4 py-2 flex items-center gap-3 shrink-0">
            <span className="text-white text-[13px] font-medium mr-2">{selected.size} selected</span>
            <Button size="sm" onClick={() => setBulkApproveOpen(true)}>
              Approve Selected ({selected.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { setBulkRejectReason(''); setBulkRejectOpen(true); }}>
              Reject Selected ({selected.size})
            </Button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-[#A0AEC0] hover:text-white text-[12px]">
              Clear selection
            </button>
          </div>
        )}

        {onLeaveMode && (
          <div className="bg-[#FEF3C7] border-b border-[#E0952A] px-4 py-1.5 shrink-0">
            <span className="text-[12px] text-[#8A6D1F] font-semibold">
              Delegation active — Dr. V.K. Sharma (Vice Principal) is handling approvals. All actions attributed to delegate.
            </span>
          </div>
        )}

        {/* Item list */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <div className="w-14 h-14 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0E7A5F" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <div className="text-[17px] font-semibold text-[#16264A]">✓ All Clear</div>
                <div className="text-[13px] text-[#5A6577] mt-1">No pending approvals. Your inbox is empty.</div>
                <div className="text-[11px] text-[#9CA3AF] mt-1">{now}</div>
              </div>
            </div>
          ) : (
            filteredItems.map(item => {
              const isActive = detailItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setDetailItem(isActive ? null : item)}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-[#D3D8E0] cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#EEF2FF] border-l-2 border-l-[#16264A]'
                      : 'bg-white hover:bg-[#F7F8FA] border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="mt-0.5" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] shrink-0 ${TYPE_COLORS[item.type] || 'bg-[#F3F4F6] text-[#374151]'}`}>
                        {item.typeLabel}
                      </span>
                      {item.amount !== undefined && (
                        <span className="text-[10px] font-semibold text-[#5A6577] bg-[#F3F4F6] px-1.5 py-0.5 rounded-[3px]">
                          ₹{item.amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] font-semibold text-[#16264A] leading-snug line-clamp-2">{item.subject}</div>
                    <div className="text-[12px] text-[#5A6577] mt-0.5">
                      {item.from.name} · {item.from.role} · {item.raisedOn}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] ${PRIORITY_COLORS[item.priority]}`}>
                      {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                    </span>
                    <SlaTag deadline={item.slaDeadline} />
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        title="Approve"
                        onClick={() => approveItem(item.id)}
                        className="w-6 h-6 flex items-center justify-center text-[#0E7A5F] hover:bg-[#D1FAE5] rounded-[3px] transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <button
                        title="Reject"
                        onClick={() => openReject(item.id)}
                        className="w-6 h-6 flex items-center justify-center text-[#A8242C] hover:bg-[#FEE2E2] rounded-[3px] transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      <button
                        title="View Detail"
                        onClick={() => setDetailItem(isActive ? null : item)}
                        className="w-6 h-6 flex items-center justify-center text-[#5A6577] hover:bg-[#EDEFF3] rounded-[3px] transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: Detail pane */}
      {detailItem && (
        <aside className="w-96 bg-white border-l border-[#D3D8E0] flex flex-col overflow-hidden shrink-0">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-[#D3D8E0] shrink-0">
            <div className="flex items-start justify-between gap-2">
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-[3px] ${TYPE_COLORS[detailItem.type] || ''}`}>
                {detailItem.typeLabel}
              </span>
              <button onClick={() => setDetailItem(null)} className="text-[#5A6577] hover:text-[#16264A]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <code className="font-mono text-[11px] text-[#5A6577] mt-1 block">{detailItem.id}</code>
            <div className="flex gap-3 mt-1">
              <span className="text-[11px] text-[#5A6577]">Raised: {detailItem.raisedOn}</span>
              <SlaTag deadline={detailItem.slaDeadline} />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* From */}
            <div className="px-4 py-3 border-b border-[#D3D8E0]">
              <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1.5">From</div>
              <div className="text-[14px] font-semibold text-[#16264A]">{detailItem.from.name}</div>
              <div className="text-[12px] text-[#5A6577]">{detailItem.from.role}</div>
              <code className="font-mono text-[11px] text-[#9CA3AF]">{detailItem.from.id}</code>
            </div>

            {/* Subject + details */}
            <div className="px-4 py-3 border-b border-[#D3D8E0]">
              <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1.5">Subject</div>
              <div className="text-[14px] font-semibold text-[#16264A] leading-snug">{detailItem.subject}</div>
              <p className="text-[13px] text-[#5A6577] mt-2 leading-relaxed">{detailItem.details}</p>
              {detailItem.amount !== undefined && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-[#FEF3C7] border border-[#E0952A] px-2 py-1 rounded-[2px]">
                  <span className="text-[12px] font-semibold text-[#8A6D1F]">Amount: ₹{detailItem.amount.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Meta */}
            {detailItem.meta && Object.keys(detailItem.meta).length > 0 && (
              <div className="px-4 py-3 border-b border-[#D3D8E0]">
                <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1.5">Details</div>
                {Object.entries(detailItem.meta).map(([k, v]) => (
                  <div key={k} className="flex gap-3 py-1 border-b border-[#EDEFF3]">
                    <span className="text-[12px] text-[#5A6577] capitalize w-28 shrink-0">{k}</span>
                    <span className="text-[12px] font-medium text-[#16264A]">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Attachments */}
            {detailItem.attachments && detailItem.attachments.length > 0 && (
              <div className="px-4 py-3 border-b border-[#D3D8E0]">
                <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1.5">Attachments</div>
                <div className="flex flex-col gap-1">
                  {detailItem.attachments.map(f => (
                    <button
                      key={f}
                      onClick={() => toast.info(`Downloading ${f}…`)}
                      className="flex items-center gap-2 text-[12px] text-[#16264A] hover:text-[#E0952A] transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="font-mono text-[11px]">{f}</span>
                      <span className="text-[#E0952A] ml-auto text-[11px]">Download</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comment box */}
            {commentOpen && (
              <div className="px-4 py-3 border-b border-[#D3D8E0]">
                <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1.5">Add Comment</div>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder="Enter your comment…"
                  className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="secondary" onClick={() => {
                    if (comment.trim()) toast.success('Comment added.');
                    setCommentOpen(false);
                    setComment('');
                  }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCommentOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky actions */}
          <div className="px-4 py-3 border-t border-[#D3D8E0] flex flex-col gap-2 shrink-0 bg-white">
            <Button size="lg" className="w-full" onClick={() => approveItem(detailItem.id)}>
              Approve
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => openReject(detailItem.id)}>
                Reject
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => openDelegate(detailItem.id)}>
                Delegate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCommentOpen(v => !v); }}>
                Comment
              </Button>
            </div>
          </div>
        </aside>
      )}

      {/* Reject Modal */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject with Reason"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={rejectReason.length < 20}
              onClick={confirmReject}
            >
              Reject
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[13px] font-medium text-[#16264A] block mb-1">
              Reason for rejection <span className="text-[#A8242C]">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Provide a clear reason (minimum 20 characters)…"
              className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none"
            />
            <div className="flex justify-between mt-1">
              {rejectReason.length > 0 && rejectReason.length < 20 && (
                <span className="text-[12px] text-[#A8242C]">Minimum 20 characters required ({rejectReason.length}/20)</span>
              )}
              {rejectReason.length >= 20 && (
                <span className="text-[12px] text-[#0E7A5F]">✓ Reason sufficient</span>
              )}
              <span className="text-[11px] text-[#9CA3AF] ml-auto">{rejectReason.length} chars</span>
            </div>
          </div>
          <InlineAlert type="warning">
            The applicant will be notified of this rejection with the reason provided.
          </InlineAlert>
        </div>
      </Modal>

      {/* Delegate Modal */}
      <Modal
        open={delegateOpen}
        onClose={() => setDelegateOpen(false)}
        title="Delegate Approval"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDelegateOpen(false)}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={confirmDelegate}>Delegate</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[13px] font-medium text-[#16264A] block mb-1">Delegate to</label>
            <select
              value={delegateTo}
              onChange={e => setDelegateTo(e.target.value)}
              className="w-full h-9 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
            >
              {DELEGATE_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[13px] font-medium text-[#16264A] block mb-1">Note (optional)</label>
            <textarea
              value={delegateNote}
              onChange={e => setDelegateNote(e.target.value)}
              rows={3}
              placeholder="Add a note for the delegate…"
              className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* Bulk Approve Modal */}
      <Modal
        open={bulkApproveOpen}
        onClose={() => setBulkApproveOpen(false)}
        title={`Approve ${selected.size} Items?`}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setBulkApproveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={bulkApprove}>Approve All</Button>
          </div>
        }
      >
        <p className="text-[14px] text-[#5A6577]">
          You are about to approve <strong className="text-[#16264A]">{selected.size} items</strong>. All applicants will be notified. This action cannot be undone.
        </p>
      </Modal>

      {/* Bulk Reject Modal */}
      <Modal
        open={bulkRejectOpen}
        onClose={() => setBulkRejectOpen(false)}
        title={`Reject ${selected.size} Items`}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setBulkRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={bulkRejectReason.length < 20} onClick={confirmBulkReject}>
              Reject All
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#5A6577]">
            This reason will be sent to all <strong className="text-[#16264A]">{selected.size}</strong> applicants.
          </p>
          <div>
            <label className="text-[13px] font-medium text-[#16264A] block mb-1">
              Reason <span className="text-[#A8242C]">*</span>
            </label>
            <textarea
              value={bulkRejectReason}
              onChange={e => setBulkRejectReason(e.target.value)}
              rows={4}
              placeholder="Provide rejection reason (min 20 characters)…"
              className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none"
            />
            {bulkRejectReason.length > 0 && bulkRejectReason.length < 20 && (
              <span className="text-[12px] text-[#A8242C]">Minimum 20 characters ({bulkRejectReason.length}/20)</span>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

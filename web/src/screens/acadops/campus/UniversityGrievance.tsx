import { useMemo, useState } from 'react';
import { Button, Select, Modal, toast, ToastContainer, Spinner } from '../../../components/ui';
import { UNIVERSITY_GRIEVANCES, type UniversityGrievance as SampleGrievance } from '../../../lib/campusservices';
import { inst } from '../../../lib/institution';
import { useAuth, displayName } from '../../../lib/auth';
import { useCollection, downloadStoredFile, formatBytes, type Stored } from '../../../lib/records';
import { downloadCSV } from '../../../lib/export';
import { NEXT_LEVEL, SLA_DAYS, addDays, daysSince, daysUntil, dmy, parseDmy, type GrievanceDoc, type GrievanceLevel, type GrievanceStatus } from '../../../lib/grievances';

/**
 * The grievance cell: every grievance any student has raised, from the same
 * register their portal writes to, so a reply here is on their phone at once.
 */

type G = Stored<GrievanceDoc>;

const ASSIGNEES = ['College grievance officer', 'Finance Officer', 'Scholarship Section', 'CoE — Result Section', 'Hostel Warden', 'Anti-Ragging Committee', 'Dean Academics', 'Registrar'];

/** The demo's sample grievances, in the shared shape. */
const SAMPLES: GrievanceDoc[] = UNIVERSITY_GRIEVANCES.map((g: SampleGrievance) => ({
  id: g.id,
  category: g.categoryPath.startsWith('Anti-Ragging') ? 'Ragging / Harassment' : g.categoryPath.split('>')[0]!.trim(),
  subject: g.subject,
  description: g.description,
  raisedOn: g.raisedOn,
  status: (g.status === 'cm_helpline' ? 'escalated' : g.status) as GrievanceStatus,
  slaDeadline: g.slaDeadline,
  level: g.status === 'escalated' || g.status === 'cm_helpline' ? 'Grievance Redressal Committee' : 'College grievance officer',
  assignedTo: g.assignedTo,
  priority: g.priority === 'low' ? 'normal' : g.priority,
  raisedByName: g.raisedBy.name,
  raisedById: g.raisedBy.id,
  college: g.raisedBy.college,
  trail: [{ actor: g.raisedBy.name, action: 'Grievance registered', date: g.raisedOn }, ...(g.resolvedOn ? [{ actor: g.assignedTo, action: 'Resolved', date: g.resolvedOn, note: g.resolution }] : [])],
  comments: g.publicThread.map(m => ({ by: m.by, role: m.isStaff ? 'staff' as const : 'student' as const, at: new Date(parseDmy(m.timestamp.slice(0, 10))).toISOString(), text: m.message })),
  internalNotes: g.internalNotes.map(n => ({ by: n.by, note: n.note, at: n.timestamp })),
  resolution: g.resolution,
  resolvedOn: g.resolvedOn,
  rating: g.satisfactionRating,
}));

const STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Open' },
  in_progress: { bg: '#FEF9EC', text: '#8A6D1F', label: 'In Progress' },
  escalated: { bg: '#FFF0E0', text: '#B45309', label: 'Escalated' },
  resolved: { bg: '#D1FAE5', text: '#0E7A5F', label: 'Resolved' },
  closed: { bg: '#EDEFF3', text: '#5A6577', label: 'Closed' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { bg: '#EDEFF3', text: '#5A6577', label: status };
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>;
}

const who = (g: G) => g._student?.name ?? g.raisedByName ?? 'Student';
const whoId = (g: G) => g._student?.enrolmentNo ?? g.raisedById ?? '';
const settled = (g: GrievanceDoc) => g.status === 'resolved' || g.status === 'closed';
const breached = (g: GrievanceDoc) => !settled(g) && daysUntil(g.slaDeadline) < 0;

function SlaTimer({ g }: { g: G }) {
  if (settled(g)) return <span className="text-[11px] text-[#0E7A5F]">Resolved</span>;
  const left = daysUntil(g.slaDeadline);
  if (left < 0) return <span className="text-[11px] font-semibold text-[#A8242C] bg-[#FEE2E2] px-2 py-0.5 rounded-full">SLA breached · {Math.abs(left)}d over</span>;
  if (left <= 1) return <span className="text-[11px] font-semibold text-[#B45309] bg-[#FFF0E0] px-2 py-0.5 rounded-full">{left === 0 ? 'Due today' : '1 day left'} ⚠</span>;
  return <span className="text-[11px] text-[#5A6577]">{left}d remaining</span>;
}

function GrievanceDetail({ g, me, onUpdate, onClose }: { g: G; me: string; onUpdate: (patch: Partial<GrievanceDoc>) => void; onClose: () => void }) {
  const [thread, setThread] = useState<'student' | 'internal'>('student');
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [modal, setModal] = useState<null | 'resolve' | 'assign' | 'escalate'>(null);
  const [resolution, setResolution] = useState('');
  const [assignee, setAssignee] = useState(g.assignedTo ?? ASSIGNEES[0]!);
  const level: GrievanceLevel = g.level ?? 'College grievance officer';
  const next = NEXT_LEVEL[level];
  const elapsed = daysSince(g.raisedOn);
  const total = elapsed + Math.max(0, daysUntil(g.slaDeadline));
  const pct = Math.min(1, elapsed / (total || 1));
  const trail = (action: string, noteText?: string) => [...g.trail, { actor: me, action, date: dmy(), ...(noteText ? { note: noteText } : {}) }];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`px-5 py-4 border-b border-[#D3D8E0] ${settled(g) ? 'bg-[#D1FAE5]/30' : 'bg-white'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[12px] text-[#5A6577]">{g.id}</span>
              <StatusBadge status={g.status} />
              {g.priority && g.priority !== 'normal' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FEE2E2] text-[#A8242C] uppercase">{g.priority}</span>}
            </div>
            <h3 className="text-[15px] font-bold text-[#16264A] mt-1">{g.subject}</h3>
            <div className="flex flex-wrap gap-2 mt-1 text-[12px] text-[#5A6577]">
              <span>{who(g)} {whoId(g) && <span className="font-mono">({whoId(g)})</span>}</span><span>·</span><span>{g.category}</span><span>·</span><span>Raised {g.raisedOn}</span>
            </div>
            <p className="text-[12px] text-[#5A6577] mt-1">With: <strong className="text-[#16264A]">{g.assignedTo ?? level}</strong> · Level: {level}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[#5A6577] hover:text-[#16264A] p-1 cursor-pointer shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {!settled(g) && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-[#5A6577]">SLA {SLA_DAYS[level]} days at this level</span>
              <SlaTimer g={g} />
            </div>
            <div className="h-2 bg-[#EDEFF3] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: breached(g) ? '#A8242C' : pct > 0.8 ? '#B45309' : '#E0952A' }} />
            </div>
            <div className="flex justify-between text-[10px] text-[#5A6577] mt-0.5"><span>Raised</span><span>Due {g.slaDeadline}</span></div>
          </div>
        )}

        <div className="flex gap-2 mt-3 flex-wrap">
          {!settled(g) ? (
            <>
              {g.status === 'open' && <Button size="sm" variant="secondary" onClick={() => { onUpdate({ status: 'in_progress', trail: trail('Taken up') }); toast.success('Marked in progress — the student can see it'); }}>Take up</Button>}
              <Button size="sm" variant="secondary" onClick={() => setModal('assign')}>Assign</Button>
              {next && <Button size="sm" variant="secondary" onClick={() => setModal('escalate')}>Escalate</Button>}
              <Button size="sm" onClick={() => setModal('resolve')}>Resolve</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => { onUpdate({ status: 'open', slaDeadline: dmy(addDays(SLA_DAYS[level])), trail: trail('Reopened by the cell') }); toast.success('Grievance reopened'); }}>Reopen</Button>
          )}
        </div>
      </div>

      <div className="flex border-b border-[#D3D8E0] bg-white">
        <button onClick={() => setThread('student')} className={`px-4 py-2.5 text-[13px] font-medium cursor-pointer ${thread === 'student' ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>Conversation with student</button>
        <button onClick={() => setThread('internal')} className={`px-4 py-2.5 text-[13px] font-medium cursor-pointer flex items-center gap-1.5 ${thread === 'internal' ? 'text-[#7C3AED] border-b-2 border-[#7C3AED] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>
          Internal notes <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#EDE9FE] text-[#7C3AED] font-semibold">Staff only</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ background: thread === 'internal' ? '#F5F3FF' : '#FAFAFA' }}>
        {thread === 'student' ? (
          <div className="p-4 space-y-3">
            <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-3">
              <div className="flex items-center gap-2 mb-1"><span className="text-[12px] font-semibold text-[#16264A]">{who(g)}</span><span className="text-[11px] text-[#5A6577]">· {g.raisedOn}</span></div>
              <p className="text-[13px] text-[#16264A]">{g.description}</p>
              {(g.attachments ?? []).map(f => (
                <button key={f.id} onClick={() => void downloadStoredFile(f.id, f.name).catch(() => toast.error('Could not download'))} className="block mt-2 text-[12px] text-[#1D4ED8] hover:underline cursor-pointer">📎 {f.name} · {formatBytes(f.size)}</button>
              ))}
            </div>
            {(g.comments ?? []).map((m, i) => (
              <div key={i} className={`rounded-[4px] p-3 ${m.role === 'staff' ? 'bg-[#EFF6FF] border border-[#93C5FD] ml-4' : 'bg-white border border-[#D3D8E0]'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[12px] font-semibold ${m.role === 'staff' ? 'text-[#1D4ED8]' : 'text-[#16264A]'}`}>{m.role === 'student' ? who(g) : m.by}</span>
                  {m.role === 'staff' && <span className="text-[10px] bg-[#DBEAFE] text-[#1D4ED8] rounded-full px-1.5 py-0.5 font-medium">Official</span>}
                  <span className="text-[11px] text-[#5A6577]">· {new Date(m.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <p className="text-[13px] text-[#16264A]">{m.text}</p>
              </div>
            ))}
            {!settled(g) && (
              <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-3">
                <textarea className="w-full text-[13px] text-[#16264A] outline-none resize-none bg-transparent" rows={3} placeholder="Reply to the student — they see it in their portal at once…" value={reply} onChange={e => setReply(e.target.value)} />
                <div className="flex justify-end mt-2">
                  <Button size="sm" disabled={!reply.trim()} onClick={() => {
                    onUpdate({ comments: [...(g.comments ?? []), { by: me, role: 'staff', at: new Date().toISOString(), text: reply.trim() }], ...(g.status === 'open' ? { status: 'in_progress' as const } : {}) });
                    setReply('');
                    toast.success('Reply sent to the student');
                  }}>Send to Student</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="bg-[#EDE9FE] border border-[#C4B5FD] rounded-[4px] px-3 py-2 text-[12px] text-[#7C3AED] font-medium">The server never sends internal notes to the student or a parent.</div>
            {(g.internalNotes ?? []).length === 0 && <p className="text-[13px] text-[#5A6577] py-4 text-center">No internal notes yet.</p>}
            {(g.internalNotes ?? []).map((n, i) => (
              <div key={i} className="bg-white border border-[#C4B5FD] rounded-[4px] p-3">
                <div className="flex items-center gap-2 mb-1"><span className="text-[12px] font-semibold text-[#7C3AED]">{n.by}</span><span className="text-[11px] text-[#5A6577]">· {n.at.includes('T') ? new Date(n.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : n.at}</span></div>
                <p className="text-[13px] text-[#16264A]">{n.note}</p>
              </div>
            ))}
            <div className="bg-white border border-[#C4B5FD] rounded-[4px] p-3">
              <textarea className="w-full text-[13px] text-[#16264A] outline-none resize-none bg-transparent" rows={3} placeholder="Add an internal note (staff only)…" value={note} onChange={e => setNote(e.target.value)} />
              <div className="flex justify-end mt-2">
                <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={() => { onUpdate({ internalNotes: [...(g.internalNotes ?? []), { by: me, note: note.trim(), at: new Date().toISOString() }] }); setNote(''); toast.success('Internal note saved'); }}>Add Note</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {settled(g) && g.resolution && (
        <div className="bg-[#D1FAE5] border-t border-[#6EE7B7] px-5 py-3">
          <p className="text-[12px] font-semibold text-[#0E7A5F]">Resolved {g.resolvedOn ? `on ${g.resolvedOn}` : ''}</p>
          <p className="text-[13px] text-[#16264A] mt-0.5">{g.resolution}</p>
          {g.rating && <p className="text-[12px] text-[#5A6577] mt-1">Student rating: {'★'.repeat(g.rating)}{'☆'.repeat(5 - g.rating)}</p>}
        </div>
      )}

      <Modal open={modal === 'resolve'} onClose={() => setModal(null)} title="Resolve grievance"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button disabled={!resolution.trim()} onClick={() => {
          onUpdate({ status: 'resolved', resolution: resolution.trim(), resolvedOn: dmy(), trail: trail('Resolved', resolution.trim()) });
          toast.success('Resolved — the student is asked to rate the resolution');
          setModal(null);
        }}>Mark resolved</Button></>}>
        <label className="text-[13px] font-medium text-[#16264A]">Resolution summary <span className="text-[#A8242C]">*</span></label>
        <textarea className="mt-1 w-full border border-[#D3D8E0] rounded-[4px] p-3 text-[14px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none" rows={4} placeholder="What was done — the student sees this." value={resolution} onChange={e => setResolution(e.target.value)} />
      </Modal>

      <Modal open={modal === 'assign'} onClose={() => setModal(null)} title="Assign grievance"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={() => { onUpdate({ assignedTo: assignee, trail: trail(`Assigned to ${assignee}`) }); toast.success(`Assigned to ${assignee}`); setModal(null); }}>Assign</Button></>}>
        <Select label="Assign to" value={assignee} onChange={e => setAssignee(e.target.value)}>
          {ASSIGNEES.map(a => <option key={a}>{a}</option>)}
        </Select>
      </Modal>

      <Modal open={modal === 'escalate'} onClose={() => setModal(null)} title="Escalate grievance"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button variant="destructive" onClick={() => {
          if (!next) return;
          onUpdate({ status: 'escalated', level: next, assignedTo: next, slaDeadline: dmy(addDays(SLA_DAYS[next])), trail: trail(`Escalated to the ${next}`) });
          toast.warning(`Escalated to the ${next}`);
          setModal(null);
        }}>Escalate</Button></>}>
        <div className="flex flex-col gap-1 text-[13px]">
          {(Object.keys(SLA_DAYS) as GrievanceLevel[]).map((l, i) => (
            <div key={l} className={`flex items-center gap-2 px-3 py-2 rounded-[4px] ${l === level ? 'bg-[#FEF9EC] text-[#8A6D1F] font-semibold' : l === next ? 'bg-[#EFF6FF] text-[#1D4ED8] font-semibold' : 'bg-[#EDEFF3] text-[#5A6577]'}`}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-white">{i + 1}</span>{l} · {SLA_DAYS[l]} days
              {l === level && <span className="ml-auto text-[11px]">← current</span>}
              {l === next && <span className="ml-auto text-[11px]">← next</span>}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Analytics({ rows }: { rows: G[] }) {
  const categories = [...new Set(rows.map(r => r.category))];
  const byCat = categories.map(c => {
    const of = rows.filter(r => r.category === c);
    return { category: c, count: of.length, resolved: of.filter(settled).length, breached: of.filter(breached).length };
  }).sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...byCat.map(c => c.count));
  const resolvedRows = rows.filter(r => settled(r) && r.resolvedOn);
  const avgDays = resolvedRows.length ? (resolvedRows.reduce((s, r) => s + Math.max(0, (parseDmy(r.resolvedOn!).getTime() - parseDmy(r.raisedOn).getTime()) / 86_400_000), 0) / resolvedRows.length).toFixed(1) : '—';
  const open = rows.filter(r => !settled(r));
  const ageing = [['0–3 days', 0, 3], ['4–7 days', 4, 7], ['8–15 days', 8, 15], ['16–30 days', 16, 30], ['Over 30 days', 31, 99999]] as const;
  const ratings = rows.filter(r => r.rating);
  const kpis = [
    { label: 'Total grievances', value: rows.length, sub: `${open.length} open` },
    { label: 'Within SLA', value: rows.length ? `${Math.round(((rows.length - rows.filter(breached).length) / rows.length) * 100)}%` : '—', sub: `${rows.filter(breached).length} breached now` },
    { label: 'Average resolution', value: `${avgDays} days`, sub: `${resolvedRows.length} resolved` },
    { label: 'Student satisfaction', value: ratings.length ? `${(ratings.reduce((s, r) => s + (r.rating ?? 0), 0) / ratings.length).toFixed(1)} / 5` : '—', sub: `${ratings.length} ratings` },
  ];
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
            <p className="text-[11px] text-[#5A6577] uppercase tracking-wider">{k.label}</p>
            <p className="text-[26px] font-bold mt-1 text-[#16264A] font-mono">{k.value}</p>
            <p className="text-[12px] text-[#5A6577] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5">
          <h3 className="text-[14px] font-semibold text-[#16264A] mb-4">By category</h3>
          <div className="space-y-3">
            {byCat.map(c => (
              <div key={c.category}>
                <div className="flex items-center justify-between text-[12px] mb-1"><span className="text-[#16264A]">{c.category}</span><span className="text-[#5A6577]">{c.count} · {c.resolved} resolved{c.breached ? ` · ${c.breached} breached` : ''}</span></div>
                <div className="h-2.5 bg-[#EDEFF3] rounded-full overflow-hidden flex gap-[2px]">
                  <div className="h-full bg-[#0E7A5F] rounded-l-full" style={{ width: `${(c.resolved / max) * 100}%` }} title={`${c.resolved} resolved`} />
                  <div className="h-full bg-[#16264A]" style={{ width: `${((c.count - c.resolved) / max) * 100}%` }} title={`${c.count - c.resolved} open`} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#5A6577] mt-3 flex gap-4"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0E7A5F]" />Resolved</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#16264A]" />Open</span></p>
        </div>
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5">
          <h3 className="text-[14px] font-semibold text-[#16264A] mb-4">Age of open grievances</h3>
          <div className="space-y-3">
            {ageing.map(([label, lo, hi]) => {
              const n = open.filter(r => { const d = daysSince(r.raisedOn); return d >= lo && d <= hi; }).length;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-[12px] mb-1"><span className="text-[#5A6577]">{label}</span><span className="font-semibold text-[#16264A]">{n}</span></div>
                  <div className="h-2.5 bg-[#EDEFF3] rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#E0952A]" style={{ width: `${open.length ? (n / open.length) * 100 : 0}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UniversityGrievance() {
  const { user } = useAuth();
  const me = displayName(user) || 'Grievance cell';
  const register = useCollection<GrievanceDoc>('student:grievance', SAMPLES);
  const rows = register.items;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [analytics, setAnalytics] = useState(false);

  const categories = useMemo(() => [...new Set(rows.map(r => r.category))].sort(), [rows]);
  const filtered = rows.filter(g => {
    if (category === 'breached' && !breached(g)) return false;
    if (category !== 'all' && category !== 'breached' && g.category !== category) return false;
    if (statusFilter && g.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return g.id.toLowerCase().includes(q) || who(g).toLowerCase().includes(q) || g.subject.toLowerCase().includes(q);
    }
    return true;
  });
  const selected = rows.find(g => g._rid === selectedId) ?? null;

  const counts = {
    open: rows.filter(g => g.status === 'open').length,
    breached: rows.filter(breached).length,
    escalated: rows.filter(g => g.status === 'escalated').length,
    resolvedToday: rows.filter(g => g.resolvedOn === dmy()).length,
  };

  return (
    <div className="min-h-screen bg-[#EDEFF3] flex flex-col">
      <ToastContainer />
      <div className="bg-[#16264A] text-white px-6 py-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">{inst().name} · Student welfare</p>
          <h1 className="text-[22px] font-bold">Grievance Cell{analytics ? ' — Analytics' : ''}</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Active: {rows.filter(g => !settled(g)).length} · Total: {rows.length} · grievances students raise in their portal arrive here directly</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => downloadCSV('grievances', rows, [
            { key: 'id', label: 'Grievance' }, { key: 'category', label: 'Category' }, { key: 'subject', label: 'Subject' },
            { key: 'who', label: 'Raised by', value: who }, { key: 'raisedOn', label: 'Raised on' }, { key: 'status', label: 'Status' },
            { key: 'level', label: 'Level', value: r => r.level ?? 'College grievance officer' }, { key: 'assignedTo', label: 'Assigned to' },
            { key: 'slaDeadline', label: 'SLA deadline' }, { key: 'resolvedOn', label: 'Resolved on' }, { key: 'rating', label: 'Rating' },
          ])}>Export CSV</Button>
          <Button variant="secondary" size="sm" onClick={() => setAnalytics(a => !a)}>{analytics ? '← Helpdesk' : 'Analytics'}</Button>
        </div>
      </div>

      {register.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : analytics ? <Analytics rows={rows} /> : (
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
          <div className="w-48 shrink-0 bg-white border-r border-[#D3D8E0] flex flex-col h-full overflow-y-auto">
            <p className="px-3 py-3 border-b border-[#D3D8E0] text-[11px] uppercase tracking-widest text-[#5A6577] font-semibold">Categories</p>
            {[{ id: 'all', label: 'All grievances', n: rows.length }, { id: 'breached', label: '🔴 SLA breached', n: counts.breached }, ...categories.map(c => ({ id: c, label: c, n: rows.filter(r => r.category === c).length }))].map(c => (
              <button key={c.id} onClick={() => { setCategory(c.id); setSelectedId(null); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] cursor-pointer ${category === c.id ? 'bg-[#FEF9EC] text-[#E0952A] font-semibold border-r-2 border-[#E0952A]' : 'text-[#16264A] hover:bg-[#EDEFF3]'}`}>
                <span className="truncate">{c.label}</span>
                <span className="text-[11px] bg-[#EDEFF3] text-[#5A6577] rounded-full px-1.5 py-0.5 font-normal shrink-0">{c.n}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col flex-1 min-w-0 border-r border-[#D3D8E0]">
            <div className="bg-white border-b border-[#D3D8E0] px-4 py-3 space-y-2">
              <div className="flex gap-2">
                <div className="flex items-center gap-2 flex-1 border border-[#D3D8E0] rounded-[4px] px-3 bg-white">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID, name, subject…" className="flex-1 py-2 text-[13px] outline-none bg-transparent text-[#16264A] placeholder-[#5A6577]" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 px-3 text-[13px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none cursor-pointer">
                  <option value="">All status</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[{ label: 'Open', value: counts.open, bg: '#EFF6FF', text: '#1D4ED8' }, { label: 'SLA breached', value: counts.breached, bg: '#FEE2E2', text: '#A8242C' }, { label: 'Escalated', value: counts.escalated, bg: '#FFF0E0', text: '#B45309' }, { label: 'Resolved today', value: counts.resolvedToday, bg: '#D1FAE5', text: '#0E7A5F' }].map(p => (
                  <span key={p.label} className="px-2.5 py-1 rounded-full text-[12px] font-semibold" style={{ background: p.bg, color: p.text }}>{p.label}: {p.value}</span>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
              {filtered.length === 0 ? <div className="flex items-center justify-center h-32 text-[13px] text-[#5A6577]">No grievances match your filter.</div> : filtered.map(g => (
                <button key={g._rid} onClick={() => setSelectedId(g._rid!)}
                  className={`w-full text-left px-4 py-3 border-b border-[#EDEFF3] cursor-pointer ${selectedId === g._rid ? 'bg-[#FEF9EC] border-l-4 border-l-[#E0952A]' : 'hover:bg-[#FAFAFA]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[11px] text-[#5A6577]">{g.id}</span><StatusBadge status={g.status} />{g.priority === 'critical' && <span className="text-[10px] font-bold text-[#A8242C]">CRITICAL</span>}</div>
                      <p className="text-[13px] font-semibold text-[#16264A] mt-1 truncate">{g.subject}</p>
                      <p className="text-[12px] text-[#5A6577] mt-1">{who(g)} · {g.category} · → {g.assignedTo ?? g.level ?? 'College grievance officer'}</p>
                    </div>
                    <div className="shrink-0 text-right"><SlaTimer g={g} /></div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col bg-white" style={{ width: selected ? 480 : 280, minWidth: 220 }}>
            {selected ? (
              <GrievanceDetail g={selected} me={me} onClose={() => setSelectedId(null)} onUpdate={patch => register.update(selected._rid!, patch)} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 text-[#5A6577]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D3D8E0" strokeWidth="1.5" className="mb-3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                <p className="text-[14px] font-medium text-[#16264A]">Select a grievance</p>
                <p className="text-[13px] mt-1">Open any grievance to reply to the student, assign, escalate or resolve it.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

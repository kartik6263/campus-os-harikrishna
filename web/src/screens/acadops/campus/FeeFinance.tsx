import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { downloadCSV } from '../../../lib/export';
import { useCollection } from '../../../lib/records';
import type { Screen } from '../../../lib/data';

/**
 * The accounts section's view of the fee books. Every figure is read from the
 * same ledger the student's fee screen and the college counter write to:
 * dues, payments (counter and online), reminders, and raising a semester's
 * charges on a programme. Money is taken only at the College Office counter
 * or online — never from this screen.
 */

interface DueRow {
  id: string; name: string; enrolmentNo: string; semester: number; mobile: string | null;
  programme: string; programmeId: string; college: string; collegeId: string;
  charged: number; paid: number; due: number; heads: Array<{ head: string; due: number }>;
  oldestDue: string | null; daysOverdue: number; reminders: number; lastReminderAt: string | null;
}
interface PaymentRow {
  id: string; paidAt: string; amount: number; mode: string; status: 'SUCCESS' | 'PENDING' | 'FAILED'; head: string;
  receiptNo: string | null; txnId: string; channel: 'Counter' | 'Online'; instrument: string | null;
  student: string; enrolmentNo: string; programme: string;
}
interface ProgrammeRow { id: string; code: string; name: string; shortName: string; semesters: Array<{ semester: number; students: number }> }

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function bucket(days: number) {
  if (days > 90) return { label: '90+ days', cls: 'bg-[#FEE2E2] text-[#A8242C]' };
  if (days > 30) return { label: '31–90 days', cls: 'bg-[#FEF3DC] text-[#9A5B00]' };
  if (days > 0) return { label: '1–30 days', cls: 'bg-[#FEF9EC] text-[#8A6D1F]' };
  return { label: 'Not yet due', cls: 'bg-[#F1F5F9] text-[#5A6577]' };
}

export default function FeeFinance({ onNavigate }: { onNavigate?: (s: Screen) => void }) {
  const [tab, setTab] = useState('dues');
  const dues = useQuery({ queryKey: ['finance', 'dues'], queryFn: () => api<{ totals: { students: number; due: number; over30: number; over90: number }; rows: DueRow[] }>('/api/office/finance/dues') });
  const t = dues.data?.totals;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Fee & Finance</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Dues, collections, reminders and fee structures — live from the fee ledger</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Outstanding', t ? inr(t.due) : '—'], ['Students owing', t?.students ?? '—'], ['Over 30 days', t?.over30 ?? '—'], ['Over 90 days', t?.over90 ?? '—']].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'dues', label: 'Dues & Defaulters' }, { id: 'payments', label: 'Collections' }, { id: 'charges', label: 'Raise Fee Charges' }, { id: 'refunds', label: 'Refunds' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <InlineAlert type="info">
          Payments are taken at the College Office fee counter or online by the student; both post here at once.
          {onNavigate && <button onClick={() => onNavigate('college-office')} className="ml-2 underline cursor-pointer">Open the fee counter →</button>}
        </InlineAlert>
        {tab === 'dues' && <DuesTab q={dues} />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'charges' && <ChargesTab />}
        {tab === 'refunds' && <RefundsTab />}
      </div>
    </div>
  );
}

// ─── Dues & defaulters ───────────────────────────────────────────────────────

function DuesTab({ q }: { q: ReturnType<typeof useQuery<{ totals: unknown; rows: DueRow[] }>> }) {
  const qc = useQueryClient();
  const [college, setCollege] = useState('');
  const [programme, setProgramme] = useState('');
  const [age, setAge] = useState('0');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [remindOpen, setRemindOpen] = useState(false);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<DueRow | null>(null);

  const rows = q.data?.rows ?? [];
  const colleges = useMemo(() => [...new Map(rows.map(r => [r.collegeId, r.college])).entries()], [rows]);
  const programmes = useMemo(() => [...new Map(rows.map(r => [r.programmeId, r.programme])).entries()], [rows]);
  const s = search.trim().toLowerCase();
  const shown = rows.filter(r => (!college || r.collegeId === college) && (!programme || r.programmeId === programme) && r.daysOverdue >= Number(age) &&
    (!s || r.name.toLowerCase().includes(s) || r.enrolmentNo.toLowerCase().includes(s)));

  const remind = useMutation({
    mutationFn: () => api<{ sent: number; skipped: number }>('/api/office/finance/remind', { method: 'POST', body: { studentIds: [...picked], note: note.trim() || undefined } }),
    onSuccess: r => { toast.success(`Reminder sent to ${r.sent} student(s) — it appears on their fee screen and notifications`); setPicked(new Set()); setRemindOpen(false); setNote(''); void qc.invalidateQueries({ queryKey: ['finance'] }); },
  });

  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;

  const allPicked = shown.length > 0 && shown.every(r => picked.has(r.id));
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Input placeholder="Search name or enrolment no." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={college} onChange={e => setCollege(e.target.value)} className="w-52"><option value="">All colleges</option>{colleges.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
        <Select value={programme} onChange={e => setProgramme(e.target.value)} className="w-36"><option value="">All programmes</option>{programmes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
        <Select value={age} onChange={e => setAge(e.target.value)} className="w-40"><option value="0">Any age</option><option value="1">Overdue</option><option value="31">Over 30 days</option><option value="91">Over 90 days</option></Select>
        <Button size="sm" variant="secondary" disabled={!shown.length} onClick={() => downloadCSV('fee-dues-register', shown.map(r => ({ enrolmentNo: r.enrolmentNo, name: r.name, programme: `${r.programme} Sem ${r.semester}`, college: r.college, charged: r.charged, paid: r.paid, due: r.due, oldestDue: r.oldestDue?.slice(0, 10) ?? '', daysOverdue: r.daysOverdue, reminders: r.reminders, mobile: r.mobile ?? '' })))}>Export CSV</Button>
        <Button size="sm" disabled={!picked.size} onClick={() => setRemindOpen(true)}>Send reminder ({picked.size})</Button>
      </div>
      {shown.length === 0 ? <div className="p-6"><EmptyState title={rows.length ? 'No students match these filters' : 'No outstanding dues'} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[880px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              <th className="px-4 py-2.5 w-8"><input type="checkbox" checked={allPicked} onChange={e => setPicked(e.target.checked ? new Set(shown.map(r => r.id)) : new Set())} aria-label="Select all" /></th>
              {['Student', 'Programme', 'Charged', 'Paid', 'Due', 'Ageing', 'Reminders', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.map(r => {
                const b = bucket(r.daysOverdue);
                return (
                  <tr key={r.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA]">
                    <td className="px-4 py-3"><input type="checkbox" checked={picked.has(r.id)} onChange={e => { const n = new Set(picked); e.target.checked ? n.add(r.id) : n.delete(r.id); setPicked(n); }} aria-label={`Select ${r.name}`} /></td>
                    <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{r.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.enrolmentNo}</p></td>
                    <td className="px-4 py-3 text-[#5A6577]">{r.programme} Sem {r.semester}<p className="text-[11px]">{r.college}</p></td>
                    <td className="px-4 py-3 tabular-nums text-[#5A6577]">{inr(r.charged)}</td>
                    <td className="px-4 py-3 tabular-nums text-[#0E7A5F]">{inr(r.paid)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-[#A8242C]">{inr(r.due)}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${b.cls}`}>{b.label}</span>{r.daysOverdue > 0 && <p className="text-[11px] text-[#5A6577] mt-0.5">{r.daysOverdue} days</p>}</td>
                    <td className="px-4 py-3 text-[12px] text-[#5A6577]">{r.reminders ? `${r.reminders} · last ${day(r.lastReminderAt)}` : 'None'}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setOpen(r)}>Details</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={remindOpen} onClose={() => setRemindOpen(false)} title={`Send fee reminder to ${picked.size} student(s)`}
        footer={<><Button size="sm" variant="secondary" onClick={() => setRemindOpen(false)}>Cancel</Button><Button size="sm" loading={remind.isPending} onClick={() => remind.mutate()}>Send</Button></>}>
        <div className="space-y-4">
          {remind.isError && <InlineAlert type="error">{errText(remind.error)}</InlineAlert>}
          <p className="text-[13px] text-[#5A6577]">Each student gets an urgent in-app notification with their exact outstanding amount, in English and Hindi. Parents see it on the ward's account.</p>
          <Input label="Add a line (optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Last date without late fee is 15 October." maxLength={300} />
        </div>
      </Modal>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.name} — ${open.enrolmentNo}` : ''} footer={<Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
        {open && (
          <div className="space-y-3 text-[13px]">
            <p className="text-[#5A6577]">{open.programme} Sem {open.semester} · {open.college}{open.mobile ? ` · ${open.mobile}` : ''}</p>
            <table className="w-full"><tbody>
              {open.heads.map(h => <tr key={h.head} className="border-b border-[#EDEFF3]"><td className="py-2 text-[#16264A]">{h.head}</td><td className="py-2 text-right tabular-nums text-[#A8242C]">{inr(h.due)}</td></tr>)}
              <tr><td className="py-2 font-semibold text-[#16264A]">Total due</td><td className="py-2 text-right font-semibold tabular-nums text-[#A8242C]">{inr(open.due)}</td></tr>
            </tbody></table>
            <p className="text-[12px] text-[#5A6577]">Oldest unpaid charge due {day(open.oldestDue)}.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Collections ─────────────────────────────────────────────────────────────

function PaymentsTab() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const q = useQuery({
    queryKey: ['finance', 'payments', from, to],
    queryFn: () => api<{ totals: { collected: number; count: number; pending: number; failed: number; byMode: Record<string, number> }; payments: PaymentRow[] }>(`/api/office/finance/payments?from=${from}&to=${to}`),
    enabled: !!from && !!to && from <= to,
  });
  const rows = (q.data?.payments ?? []).filter(p => (!status || p.status === status) && (!channel || p.channel === channel));
  const tt = q.data?.totals;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} min={from} max={isoDaysAgo(0)} onChange={e => setTo(e.target.value)} />
        <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option value="SUCCESS">Successful</option><option value="PENDING">Awaiting clearance</option><option value="FAILED">Failed / bounced</option></Select>
        <Select label="Channel" value={channel} onChange={e => setChannel(e.target.value)}><option value="">All</option><option>Counter</option><option>Online</option></Select>
        <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCSV(`fee-collections-${from}-to-${to}`, rows.map(p => ({ date: p.paidAt.slice(0, 10), receiptNo: p.receiptNo ?? '', txnId: p.txnId, enrolmentNo: p.enrolmentNo, student: p.student, programme: p.programme, head: p.head, amount: p.amount, mode: p.mode, channel: p.channel, instrument: p.instrument ?? '', status: p.status })))}>Export CSV</Button>
      </div>
      {tt && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Collected', inr(tt.collected)], ['Payments', String(tt.count)], ['Awaiting clearance', inr(tt.pending)], ['Failed / bounced', String(tt.failed)]].map(([l, v]) => (
            <div key={l} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4"><p className="text-[20px] font-semibold text-[#16264A] tabular-nums">{v}</p><p className="text-[12px] text-[#5A6577]">{l}</p></div>
          ))}
        </div>
      )}
      {tt && Object.keys(tt.byMode).length > 0 && (
        <p className="text-[12px] text-[#5A6577]">By mode: {Object.entries(tt.byMode).map(([m, v]) => `${m} ${inr(v)}`).join(' · ')}</p>
      )}
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        {q.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No payments in this period" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[880px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Date', 'Receipt / Txn', 'Student', 'Head', 'Amount', 'Mode', 'Status'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className="border-b border-[#EDEFF3]">
                    <td className="px-4 py-3 text-[#5A6577]">{day(p.paidAt)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#5A6577]">{p.receiptNo ?? '—'}<br />{p.txnId}</td>
                    <td className="px-4 py-3"><p className="text-[#16264A]">{p.student}</p><p className="text-[11px] text-[#5A6577]">{p.enrolmentNo} · {p.programme}</p></td>
                    <td className="px-4 py-3 text-[#5A6577]">{p.head}</td>
                    <td className={`px-4 py-3 tabular-nums font-medium ${p.amount < 0 ? 'text-[#0E7A5F]' : 'text-[#16264A]'}`}>{inr(p.amount)}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{p.mode}<p className="text-[11px]">{p.channel}{p.instrument ? ` · ${p.instrument}` : ''}</p></td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${p.status === 'SUCCESS' ? 'bg-[#D1FAE5] text-[#0E7A5F]' : p.status === 'PENDING' ? 'bg-[#FEF9EC] text-[#8A6D1F]' : 'bg-[#FEE2E2] text-[#A8242C]'}`}>{p.status === 'SUCCESS' ? 'Successful' : p.status === 'PENDING' ? 'Awaiting clearance' : 'Failed'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Raise fee charges ───────────────────────────────────────────────────────

type HeadDraft = { head: string; category: 'TUITION' | 'DEVELOPMENT' | 'EXAM' | 'OTHER'; amount: string; dueDate: string };
const newHead = (): HeadDraft => ({ head: '', category: 'TUITION', amount: '', dueDate: '' });

function ChargesTab() {
  const qc = useQueryClient();
  const progs = useQuery({ queryKey: ['finance', 'programmes'], queryFn: () => api<ProgrammeRow[]>('/api/office/finance/programmes') });
  const [programmeId, setProgrammeId] = useState('');
  const [semester, setSemester] = useState('');
  const [term, setTerm] = useState('');
  const [heads, setHeads] = useState<HeadDraft[]>([newHead()]);
  const [preview, setPreview] = useState<{ students: number; wouldCreate: number; skipped: number; total: number } | null>(null);

  const prog = progs.data?.find(p => p.id === programmeId);
  const valid = programmeId && semester && term.trim().length >= 3 && heads.length > 0 && heads.every(h => h.head.trim().length >= 2 && Number(h.amount) > 0 && h.dueDate);
  const body = () => ({ programmeId, semester: Number(semester), term: term.trim(), heads: heads.map(h => ({ head: h.head.trim(), category: h.category, amount: Number(h.amount), dueDate: h.dueDate })) });

  const check = useMutation({
    mutationFn: () => api<{ students: number; wouldCreate: number; skipped: number; total: number }>('/api/office/finance/charges', { method: 'POST', body: { ...body(), dryRun: true } }),
    onSuccess: setPreview,
  });
  const apply = useMutation({
    mutationFn: () => api<{ created: number; students: number; total: number }>('/api/office/finance/charges', { method: 'POST', body: body() }),
    onSuccess: r => {
      toast.success(`${r.created} charge(s) raised on ${r.students} student(s) — ${inr(r.total)}. Students see them on their fee screen now.`);
      setPreview(null); setHeads([newHead()]);
      void qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
  const setHead = (i: number, patch: Partial<HeadDraft>) => { setHeads(hs => hs.map((h, j) => (j === i ? { ...h, ...patch } : h))); setPreview(null); };

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-[#16264A]">Raise a semester's fee charges</h2>
        <p className="text-[13px] text-[#5A6577] mt-1">Adds each fee head to every student of the chosen programme and semester. A student who already has that head for the term is skipped, so it is safe to run again.</p>
      </div>
      {progs.isError && <InlineAlert type="error">{errText(progs.error)}</InlineAlert>}
      <div className="grid md:grid-cols-3 gap-4">
        <Select label="Programme" value={programmeId} onChange={e => { setProgrammeId(e.target.value); setSemester(''); setPreview(null); }}>
          <option value="">Choose…</option>
          {(progs.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.shortName})</option>)}
        </Select>
        <Select label="Semester" value={semester} onChange={e => { setSemester(e.target.value); setPreview(null); }} disabled={!prog}>
          <option value="">Choose…</option>
          {(prog?.semesters ?? []).map(s => <option key={s.semester} value={s.semester}>Semester {s.semester} — {s.students} students</option>)}
        </Select>
        <Input label="Term" value={term} onChange={e => { setTerm(e.target.value); setPreview(null); }} placeholder="e.g. 2026-27 Odd" />
      </div>
      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-[#5A6577] uppercase tracking-wider">Fee heads</p>
        {heads.map((h, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 md:col-span-4"><Input label={i === 0 ? 'Head' : undefined} value={h.head} onChange={e => setHead(i, { head: e.target.value })} placeholder="Tuition Fee" /></div>
            <div className="col-span-4 md:col-span-2"><Select label={i === 0 ? 'Category' : undefined} value={h.category} onChange={e => setHead(i, { category: e.target.value as HeadDraft['category'] })}>{['TUITION', 'DEVELOPMENT', 'EXAM', 'OTHER'].map(c => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}</Select></div>
            <div className="col-span-4 md:col-span-2"><Input label={i === 0 ? 'Amount (₹)' : undefined} inputMode="numeric" value={h.amount} onChange={e => setHead(i, { amount: e.target.value.replace(/\D/g, '') })} /></div>
            <div className="col-span-4 md:col-span-3"><Input label={i === 0 ? 'Due date' : undefined} type="date" value={h.dueDate} onChange={e => setHead(i, { dueDate: e.target.value })} /></div>
            <div className="col-span-12 md:col-span-1 pb-1"><button onClick={() => { setHeads(hs => hs.filter((_, j) => j !== i)); setPreview(null); }} disabled={heads.length === 1} className="text-[12px] text-[#A8242C] hover:underline cursor-pointer disabled:opacity-30">Remove</button></div>
          </div>
        ))}
        <button onClick={() => setHeads(hs => [...hs, newHead()])} className="text-[13px] text-[#E0952A] hover:underline cursor-pointer">+ Add head</button>
      </div>
      {(check.isError || apply.isError) && <InlineAlert type="error">{errText(check.error ?? apply.error)}</InlineAlert>}
      {preview && (
        <InlineAlert type={preview.wouldCreate ? 'warning' : 'info'}>
          {preview.wouldCreate
            ? `This will add ${preview.wouldCreate} charge(s) totalling ${inr(preview.total)} across ${preview.students} student(s)${preview.skipped ? `; ${preview.skipped} already billed and skipped` : ''}. Students see them immediately.`
            : `Nothing to add — all ${preview.students} student(s) already carry these heads for this term.`}
        </InlineAlert>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!valid} loading={check.isPending} onClick={() => check.mutate()}>Preview</Button>
        <Button disabled={!valid || !preview?.wouldCreate} loading={apply.isPending} onClick={() => apply.mutate()}>Raise charges</Button>
      </div>
    </div>
  );
}

// ─── Refunds ─────────────────────────────────────────────────────────────────

interface Refund { id: string; enrolmentNo: string; name: string; reason: string; amount: number; requestedOn: string; status: 'pending' | 'approved' | 'rejected' | 'paid'; note?: string; payoutRef?: string; paidOn?: string }

function RefundsTab() {
  const refunds = useCollection<Refund>('acad:fee-refunds', []);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ enrolmentNo: '', name: '', reason: '', amount: '' });
  const [acting, setActing] = useState<{ r: Refund; kind: 'rejected' | 'paid' } | null>(null);
  const [text, setText] = useState('');

  function add() {
    const amount = Number(f.amount);
    if (!f.enrolmentNo.trim() || !f.name.trim() || !f.reason.trim() || !(amount > 0)) { toast.error('Fill every field'); return; }
    refunds.add({ id: `RF-${Date.now().toString(36).toUpperCase()}`, enrolmentNo: f.enrolmentNo.trim(), name: f.name.trim(), reason: f.reason.trim(), amount, requestedOn: new Date().toISOString().slice(0, 10), status: 'pending' });
    setF({ enrolmentNo: '', name: '', reason: '', amount: '' }); setAdding(false);
    toast.success('Refund request recorded');
  }
  function finish() {
    if (!acting) return;
    if (!text.trim()) { toast.error(acting.kind === 'paid' ? 'Enter the payout reference (UTR / cheque no.)' : 'Give a reason'); return; }
    refunds.update(acting.r.id, acting.kind === 'paid' ? { status: 'paid', payoutRef: text.trim(), paidOn: new Date().toISOString().slice(0, 10) } : { status: 'rejected', note: text.trim() });
    toast.success(acting.kind === 'paid' ? 'Refund marked as paid' : 'Refund rejected');
    setActing(null); setText('');
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A]">Refund register</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={!refunds.items.length} onClick={() => downloadCSV('fee-refunds', refunds.items.map(({ _rid, _key, _createdAt, _updatedAt, _studentId, _student, _tmp, ...r }) => r))}>Export CSV</Button>
          <Button size="sm" onClick={() => setAdding(true)}>+ Record request</Button>
        </div>
      </div>
      {refunds.isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : refunds.items.length === 0 ? <div className="p-6"><EmptyState title="No refund requests" description="Record excess payments, withdrawals and caution-money refunds here, then approve and pay them." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Student', 'Reason', 'Amount', 'Requested', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {refunds.items.map(r => (
                <tr key={r.id} className="border-b border-[#EDEFF3]">
                  <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{r.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.enrolmentNo}</p></td>
                  <td className="px-4 py-3 text-[#5A6577]">{r.reason}{r.note && <p className="text-[11px] text-[#A8242C]">{r.note}</p>}</td>
                  <td className="px-4 py-3 tabular-nums text-[#16264A]">{inr(r.amount)}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{day(r.requestedOn)}</td>
                  <td className="px-4 py-3 text-[12px]"><span className="font-semibold capitalize">{r.status}</span>{r.payoutRef && <p className="text-[11px] text-[#0E7A5F]">{r.payoutRef} · {day(r.paidOn ?? null)}</p>}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    {r.status === 'pending' && <><Button size="sm" variant="ghost" onClick={() => setActing({ r, kind: 'rejected' })}>Reject</Button><Button size="sm" onClick={() => { refunds.update(r.id, { status: 'approved' }); toast.success('Refund approved'); }}>Approve</Button></>}
                    {r.status === 'approved' && <Button size="sm" onClick={() => setActing({ r, kind: 'paid' })}>Mark paid</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Record refund request" footer={<><Button size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" onClick={add}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Enrolment no." value={f.enrolmentNo} onChange={e => setF({ ...f, enrolmentNo: e.target.value })} />
          <Input label="Student name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <div className="col-span-2"><Input label="Reason" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="e.g. Excess payment of exam fee" /></div>
          <Input label="Amount (₹)" inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
        </div>
      </Modal>
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting?.kind === 'paid' ? 'Mark refund paid' : 'Reject refund'} footer={<><Button size="sm" variant="secondary" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" onClick={finish}>Save</Button></>}>
        <Input label={acting?.kind === 'paid' ? 'Payout reference (UTR / cheque no.)' : 'Reason'} value={text} onChange={e => setText(e.target.value)} />
      </Modal>
    </div>
  );
}

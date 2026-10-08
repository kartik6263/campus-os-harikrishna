import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { downloadCSV } from '../../lib/export';
import {
  CONCESSION_KINDS, MODE_LABEL, inr, receiptPdf, statementPdf,
  useApplyStructure, useConcessions, useDecideConcession, useDecideRefund, useDeleteStructure, useInstalmentPlan, useLateFines,
  useLookupStudent, usePayRefund, useRefunds, useRequestConcession, useRequestRefund, useSaveStructure, useStructures, useStudentStatement,
  type CounterStudent, type FeeStructure,
} from '../../lib/feeadmin';

/**
 * The fee desk: a student's full ledger (statement, receipts, instalment
 * plan, concessions and refunds asked for there), the concession and refund
 * registers with their approvals, fee structures applied to a class, and
 * late fines. The office proposes; the registrar, principal or
 * administrator decides and sets structures.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const APPROVERS = ['REGISTRAR', 'PRINCIPAL', 'ADMIN'];
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const istDay = (o = 0) => new Date(Date.now() + 5.5 * 3_600_000 + o * 86_400_000).toISOString().slice(0, 10);
const area = 'px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-[#D3D8E0] rounded-[4px] ${className}`}>{children}</div>;
}
function Pill({ s }: { s: string }) {
  const cls = s === 'APPROVED' || s === 'PAID' ? 'bg-[#D1FAE5] text-[#0E7A5F]' : s === 'REJECTED' ? 'bg-[#FEE2E2] text-[#A8242C]' : 'bg-[#FEF9EC] text-[#8A6D1F]';
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[2px] ${cls}`}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>;
}

/** The desk as a whole, for portals that have no fee screen of their own. */
export default function FeeDesk() {
  const { user } = useAuth();
  const approver = APPROVERS.includes(user?.role ?? '');
  const [tab, setTab] = useState(approver ? 'concessions' : 'ledger');
  const tabs = [
    { id: 'ledger', label: 'Student ledger' },
    { id: 'concessions', label: 'Concessions' },
    { id: 'refunds', label: 'Refunds' },
    ...(approver ? [{ id: 'structures', label: 'Fee structures' }, { id: 'fines', label: 'Late fines' }] : []),
  ];
  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Fee accounts</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Statements, concessions, refunds, fee structures and late fines — on the same ledger as the counter and online payments</p>
      </div>
      <div className="bg-white px-4 overflow-x-auto"><Tabs tabs={tabs} activeId={tab} onChange={setTab} /></div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {tab === 'ledger' && <StudentLedger />}
        {tab === 'concessions' && <ConcessionsPanel />}
        {tab === 'refunds' && <RefundsPanel />}
        {tab === 'structures' && <StructuresPanel />}
        {tab === 'fines' && <LateFinesPanel />}
      </div>
    </div>
  );
}

// ─── Student ledger ───────────────────────────────────────────────────────────

export function StudentLedger() {
  const lookup = useLookupStudent();
  const [q, setQ] = useState('');
  const [student, setStudent] = useState<CounterStudent | null>(null);
  const st = useStudentStatement(student?.id ?? null);
  const [action, setAction] = useState<{ kind: 'concession' | 'refund'; itemId: string } | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  async function find() {
    if (q.trim().length < 2) return;
    try { setStudent(await lookup.mutateAsync(q.trim())); } catch (e) { setStudent(null); toast.error(errText(e)); }
  }
  const terms = useMemo(() => [...new Set((st.data?.items ?? []).map((i) => i.term))], [st.data]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex gap-2 items-end">
        <div className="flex-1"><Input label="Student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Enrolment no., roll no. or name" onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} /></div>
        <Button loading={lookup.isPending} onClick={() => void find()}>Open ledger</Button>
      </Card>
      {!student && <Card><EmptyState title="Look a student up" description="Their statement, receipts, instalments, concessions and refunds open here." /></Card>}
      {student && st.isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {st.error && <InlineAlert type="error">{errText(st.error)}</InlineAlert>}
      {student && st.data && (
        <>
          <Card className="p-4 flex flex-wrap gap-4 items-center justify-between">
            <div>
              <p className="text-[16px] font-semibold text-[#16264A]">{student.name}</p>
              <p className="text-[12px] text-[#5A6577]">{student.enrolmentNo} · {student.programme.shortName} semester {student.semester}</p>
            </div>
            <div className="flex gap-6 text-center">
              {[['Charged', st.data.totals.charged], ['Paid / credited', st.data.totals.paid], ['Outstanding', st.data.totals.due]].map(([l, v]) => <div key={l as string}><p className="text-[18px] font-bold text-[#16264A]">{inr(v as number)}</p><p className="text-[11px] text-[#5A6577]">{l}</p></div>)}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => statementPdf(st.data!)}>Statement PDF</Button>
              <Button variant="secondary" size="sm" disabled={!terms.length} onClick={() => setPlan(terms[terms.length - 1]!)}>Instalment plan</Button>
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <p className="px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#EDEFF3]">Fee heads</p>
            <table className="w-full text-[13px]">
              <thead className="bg-[#F7F8FA]"><tr>{['Head', 'Term', 'Due date', 'Charged', 'Paid', 'Due', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>
                {st.data.items.map((i) => (
                  <tr key={i.id} className="border-t border-[#EDEFF3]">
                    <td className="px-3 py-2 text-[#16264A]">{i.head}{i.fine && <span className="ml-1 text-[10px] text-[#A8242C] font-semibold">FINE</span>}</td>
                    <td className="px-3 py-2 text-[#5A6577]">{i.term}</td>
                    <td className="px-3 py-2 text-[#5A6577]">{day(i.dueDate)}</td>
                    <td className="px-3 py-2">{inr(i.amount)}</td>
                    <td className="px-3 py-2">{inr(i.paid)}</td>
                    <td className={`px-3 py-2 font-semibold ${i.due ? 'text-[#A8242C]' : 'text-[#0E7A5F]'}`}>{inr(i.due)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {i.due > 0 && <button className="text-[12px] text-[#E0952A] cursor-pointer mr-3" onClick={() => setAction({ kind: 'concession', itemId: i.id })}>Concession</button>}
                      {i.paid > 0 && <button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => setAction({ kind: 'refund', itemId: i.id })}>Refund</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto">
            <p className="px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#EDEFF3]">Receipts and credits</p>
            {st.data.receipts.length === 0 && <p className="px-4 py-4 text-[13px] text-[#5A6577]">None yet.</p>}
            {st.data.receipts.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[#EDEFF3] last:border-0 text-[13px]">
                <div>
                  <p className={`font-medium ${r.status === 'CANCELLED' ? 'line-through text-[#5A6577]' : 'text-[#16264A]'}`}>{r.head} · {inr(Math.abs(r.amount))} <span className="text-[11px] text-[#5A6577]">{r.kind !== 'RECEIPT' ? r.kind.toLowerCase() : MODE_LABEL[r.mode] ?? r.mode}</span></p>
                  <p className="text-[11px] text-[#5A6577]"><span className="font-mono">{r.receiptNo ?? r.txnId}</span> · {day(r.date)}{r.appliedTo.length ? ` · ${r.appliedTo.map((a) => `${a.head} ${inr(a.amount)}`).join(', ')}` : ''}{r.cancelReason ? ` · cancelled: ${r.cancelReason}` : ''}{r.status === 'PENDING' ? ' · awaiting clearance' : ''}</p>
                </div>
                {r.receiptNo && <button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => receiptPdf({ receiptNo: r.receiptNo!, date: r.date, student: student.name, enrolmentNo: student.enrolmentNo, programme: `${student.programme.shortName} ${student.semester}`, head: r.head, amount: Math.abs(r.amount), mode: r.mode, instrument: r.instrument, status: r.status, receivedBy: r.receivedBy, appliedTo: r.appliedTo, cancelReason: r.cancelReason })}>PDF</button>}
              </div>
            ))}
          </Card>

          {st.data.instalments.length > 0 && (
            <Card>
              <p className="px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#EDEFF3]">Instalments</p>
              {st.data.instalments.map((i) => <p key={i.id} className="px-4 py-1.5 text-[13px] border-b border-[#EDEFF3] last:border-0">{i.term} · #{i.number} · {inr(i.amount)} · due {day(i.dueDate)} · {i.paidAt ? <span className="text-[#0E7A5F]">paid {day(i.paidAt)}</span> : <span className="text-[#8A6D1F]">unpaid</span>}</p>)}
            </Card>
          )}
        </>
      )}
      {student && action && <RequestModal student={student} action={action} items={st.data?.items ?? []} onClose={() => setAction(null)} />}
      {student && plan && <PlanModal studentId={student.id} terms={terms} term={plan} setTerm={setPlan} due={(st.data?.items ?? []).filter((i) => i.term === plan).reduce((t, i) => t + i.due, 0)} onClose={() => setPlan(null)} />}
    </div>
  );
}

function RequestModal({ student, action, items, onClose }: { student: CounterStudent; action: { kind: 'concession' | 'refund'; itemId: string }; items: Array<{ id: string; head: string; due: number; paid: number }>; onClose: () => void }) {
  const item = items.find((i) => i.id === action.itemId);
  const con = useRequestConcession();
  const ref = useRequestRefund();
  const [kind, setKind] = useState('NEED_BASED');
  const [amount, setAmount] = useState(String(action.kind === 'concession' ? item?.due ?? '' : item?.paid ?? ''));
  const [reason, setReason] = useState('');
  const m = action.kind === 'concession' ? con : ref;
  const ok = Number(amount) > 0 && reason.trim().length >= 10;
  function submit() {
    if (action.kind === 'concession') con.mutate({ studentId: student.id, feeItemId: action.itemId, kind, amount: Number(amount), reason: reason.trim() }, { onSuccess: (c) => { toast.success(`Concession ${c.concessionNo} sent for approval`); onClose(); } });
    else ref.mutate({ studentId: student.id, feeItemId: action.itemId, amount: Number(amount), reason: reason.trim() }, { onSuccess: (r) => { toast.success(`Refund ${r.refundNo} sent for approval`); onClose(); } });
  }
  return (
    <Modal open onClose={onClose} title={action.kind === 'concession' ? 'Propose a concession' : 'Raise a refund'}
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!ok} loading={m.isPending} onClick={submit}>Send for approval</Button></>}>
      <div className="flex flex-col gap-3">
        {m.isError && <InlineAlert type="error">{errText(m.error)}</InlineAlert>}
        <p className="text-[13px] text-[#16264A]">{student.name} · {item?.head} · {action.kind === 'concession' ? `${inr(item?.due ?? 0)} unpaid` : `${inr(item?.paid ?? 0)} paid`}</p>
        {action.kind === 'concession' && <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(CONCESSION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
        <Input label="Amount (₹)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <label className="flex flex-col gap-1"><span className="text-[13px] font-medium text-[#16264A]">Reason</span><textarea rows={3} maxLength={500} className={area} value={reason} onChange={(e) => setReason(e.target.value)} /><span className="text-[11px] text-[#5A6577]">At least 10 characters. The registrar or principal decides.</span></label>
      </div>
    </Modal>
  );
}

function PlanModal({ studentId, terms, term, setTerm, due, onClose }: { studentId: string; terms: string[]; term: string; setTerm: (t: string) => void; due: number; onClose: () => void }) {
  const save = useInstalmentPlan();
  const [parts, setParts] = useState(() => [{ amount: String(Math.ceil(due / 2)), dueDate: istDay(15) }, { amount: String(due - Math.ceil(due / 2)), dueDate: istDay(45) }]);
  const sum = parts.reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const ok = sum === due && due > 0 && parts.every((p) => Number(p.amount) > 0 && p.dueDate) && parts.every((p, i) => i === 0 || p.dueDate > parts[i - 1]!.dueDate);
  return (
    <Modal open onClose={onClose} title="Instalment plan" width="540px"
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!ok} loading={save.isPending} onClick={() => save.mutate({ studentId, term, parts: parts.map((p) => ({ amount: Number(p.amount), dueDate: p.dueDate })) }, { onSuccess: (r) => { toast.success(`${r.parts} instalments set — the student is told`); onClose(); } })}>Save plan</Button></>}>
      <div className="flex flex-col gap-3">
        {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
        <Select label="Term" value={term} onChange={(e) => setTerm(e.target.value)}>{terms.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
        <p className="text-[12px] text-[#5A6577]">{inr(due)} is outstanding for {term}. The parts must add up to it, with due dates in order. Any unpaid plan for the term is replaced.</p>
        {parts.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Input label={`Part ${i + 1} (₹)`} inputMode="numeric" value={p.amount} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/\D/g, '') } : x)))} />
            <Input label="Due" type="date" value={p.dueDate} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} />
            <button className="text-[12px] text-[#A8242C] cursor-pointer pb-2 disabled:opacity-40" disabled={parts.length === 1} onClick={() => setParts(parts.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={parts.length >= 12} onClick={() => setParts([...parts, { amount: '', dueDate: '' }])}>Add part</Button>
          <span className={`text-[12px] font-semibold ${sum === due ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>Total {inr(sum)} of {inr(due)}</span>
        </div>
      </div>
    </Modal>
  );
}

// ─── Concessions ──────────────────────────────────────────────────────────────

export function ConcessionsPanel() {
  const { user } = useAuth();
  const approver = APPROVERS.includes(user?.role ?? '');
  const [status, setStatus] = useState('PENDING');
  const { data, isPending, error } = useConcessions(status || undefined);
  const decide = useDecideConcession();
  const [acting, setActing] = useState<{ id: string; approve: boolean; label: string } | null>(null);
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 flex flex-wrap gap-3 items-end justify-between">
        <div className="w-52"><Select label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Awaiting decision</option><option value="APPROVED">Granted</option><option value="REJECTED">Refused</option><option value="">All</option></Select></div>
        <p className="text-[12px] text-[#5A6577] flex-1">Proposed from a student’s ledger. {approver ? 'Granting credits the head at once.' : 'The registrar or principal decides.'}</p>
        <Button variant="secondary" size="sm" disabled={!data?.length} onClick={() => downloadCSV('fee-concessions', data!, [{ key: 'concessionNo', label: 'No.' }, { key: 'student', label: 'Student', value: (r) => `${r.student.name} (${r.student.enrolmentNo})` }, { key: 'feeItem', label: 'Head', value: (r) => r.feeItem.head }, { key: 'kind', label: 'Kind' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Reason' }, { key: 'decidedBy', label: 'Decided by' }])}>Export CSV</Button>
      </Card>
      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && data.length === 0 && <Card><EmptyState title="Nothing here" description="No concession matches." /></Card>}
      {data?.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-[14px] font-semibold text-[#16264A]">{c.student.name} <span className="text-[12px] font-normal text-[#5A6577]">{c.student.enrolmentNo} · {c.student.programme.shortName} {c.student.semester}</span></p>
              <p className="text-[13px]">{inr(c.amount)} off {c.feeItem.head} ({c.feeItem.term}) · {CONCESSION_KINDS[c.kind] ?? c.kind} <span className="font-mono text-[11px] text-[#5A6577]">{c.concessionNo}</span></p>
            </div>
            <Pill s={c.status} />
          </div>
          <p className="text-[13px] text-[#5A6577] mt-1">{c.reason}</p>
          <p className="text-[11px] text-[#5A6577] mt-1">Proposed by {c.requestedBy} on {day(c.createdAt)}{c.decidedBy ? ` · decided by ${c.decidedBy}: ${c.decisionNote}` : ''}</p>
          {approver && c.status === 'PENDING' && (
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={() => { setActing({ id: c.id, approve: true, label: c.concessionNo }); setNote('Granted.'); decide.reset(); }}>Grant</Button>
              <Button size="sm" variant="secondary" onClick={() => { setActing({ id: c.id, approve: false, label: c.concessionNo }); setNote(''); decide.reset(); }}>Refuse</Button>
            </div>
          )}
        </Card>
      ))}
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting?.approve ? `Grant ${acting.label}` : `Refuse ${acting?.label}`}
        footer={<><Button variant="secondary" size="sm" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" disabled={note.trim().length < 3} loading={decide.isPending} onClick={() => decide.mutate({ id: acting!.id, approve: acting!.approve, note: note.trim() }, { onSuccess: () => { toast.success(acting!.approve ? 'Concession granted — the head is credited' : 'Concession refused'); setActing(null); } })}>{acting?.approve ? 'Grant' : 'Refuse'}</Button></>}>
        {decide.isError && <InlineAlert type="error">{errText(decide.error)}</InlineAlert>}
        <Input label="Note — the student sees it" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </div>
  );
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

export function RefundsPanel() {
  const { user } = useAuth();
  const approver = APPROVERS.includes(user?.role ?? '');
  const [status, setStatus] = useState('');
  const { data, isPending, error } = useRefunds(status || undefined);
  const decide = useDecideRefund();
  const pay = usePayRefund();
  const [acting, setActing] = useState<{ id: string; kind: 'approve' | 'reject' | 'pay'; label: string } | null>(null);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('NEFT');
  function submit() {
    if (!acting) return;
    const done = (t: string) => { toast.success(t); setActing(null); };
    if (acting.kind === 'pay') pay.mutate({ id: acting.id, mode, reference: note.trim() }, { onSuccess: () => done('Refund paid — the ledger and the student are updated') });
    else decide.mutate({ id: acting.id, approve: acting.kind === 'approve', note: note.trim() }, { onSuccess: () => done(acting.kind === 'approve' ? 'Refund approved' : 'Refund rejected') });
  }
  const err = decide.error ?? pay.error;
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 flex flex-wrap gap-3 items-end justify-between">
        <div className="w-52"><Select label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="REQUESTED">Awaiting approval</option><option value="APPROVED">Approved — to pay</option><option value="PAID">Paid</option><option value="REJECTED">Rejected</option></Select></div>
        <p className="text-[12px] text-[#5A6577] flex-1">Raised from a student’s ledger against a head they paid. Paying it out reduces that head’s charge and payment alike.</p>
        <Button variant="secondary" size="sm" disabled={!data?.length} onClick={() => downloadCSV('fee-refunds', data!, [{ key: 'refundNo', label: 'No.' }, { key: 'student', label: 'Student', value: (r) => `${r.student.name} (${r.student.enrolmentNo})` }, { key: 'feeItem', label: 'Head', value: (r) => r.feeItem.head }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Reason' }, { key: 'payoutMode', label: 'Paid by' }, { key: 'payoutRef', label: 'Reference' }])}>Export CSV</Button>
      </Card>
      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && data.length === 0 && <Card><EmptyState title="No refunds" description="Raise one from a student's ledger." /></Card>}
      {data?.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-[14px] font-semibold text-[#16264A]">{r.student.name} <span className="text-[12px] font-normal text-[#5A6577]">{r.student.enrolmentNo}</span></p>
              <p className="text-[13px]">{inr(r.amount)} on {r.feeItem.head} ({r.feeItem.term}) <span className="font-mono text-[11px] text-[#5A6577]">{r.refundNo}</span></p>
            </div>
            <Pill s={r.status} />
          </div>
          <p className="text-[13px] text-[#5A6577] mt-1">{r.reason}</p>
          <p className="text-[11px] text-[#5A6577] mt-1">Raised by {r.requestedBy} on {day(r.createdAt)}{r.decidedBy ? ` · ${r.decidedBy}: ${r.decisionNote}` : ''}{r.paidAt ? ` · paid ${day(r.paidAt)} by ${r.payoutMode} (${r.payoutRef})` : ''}</p>
          <div className="flex gap-2 mt-2">
            {approver && r.status === 'REQUESTED' && <><Button size="sm" onClick={() => { setActing({ id: r.id, kind: 'approve', label: r.refundNo }); setNote('Approved.'); decide.reset(); }}>Approve</Button><Button size="sm" variant="secondary" onClick={() => { setActing({ id: r.id, kind: 'reject', label: r.refundNo }); setNote(''); decide.reset(); }}>Reject</Button></>}
            {r.status === 'APPROVED' && <Button size="sm" onClick={() => { setActing({ id: r.id, kind: 'pay', label: r.refundNo }); setNote(''); pay.reset(); }}>Record payout</Button>}
          </div>
        </Card>
      ))}
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting?.kind === 'pay' ? `Pay ${acting.label}` : acting?.kind === 'approve' ? `Approve ${acting?.label}` : `Reject ${acting?.label}`}
        footer={<><Button variant="secondary" size="sm" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" disabled={note.trim().length < 3} loading={decide.isPending || pay.isPending} onClick={submit}>Save</Button></>}>
        <div className="flex flex-col gap-3">
          {err && <InlineAlert type="error">{errText(err)}</InlineAlert>}
          {acting?.kind === 'pay' && <Select label="Paid by" value={mode} onChange={(e) => setMode(e.target.value)}><option value="NEFT">NEFT / RTGS</option><option value="CHEQUE">Cheque</option><option value="UPI">UPI</option><option value="CASH">Cash</option></Select>}
          <Input label={acting?.kind === 'pay' ? 'Reference (UTR / cheque no.)' : 'Note — the student sees it'} value={note} maxLength={acting?.kind === 'pay' ? 80 : 300} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Fee structures ───────────────────────────────────────────────────────────

type HeadDraft = { head: string; category: FeeStructure['heads'][number]['category']; amount: string; dueDate: string };
type StructDraft = { id?: string; name: string; programmeId: string; semester: string; term: string; heads: HeadDraft[]; instalments: Array<{ percent: string; dueDate: string }> };

export function StructuresPanel() {
  const { data, isPending, error } = useStructures();
  const programmes = useQuery({ queryKey: ['finance', 'programmes'], queryFn: () => api<Array<{ id: string; shortName: string; name: string; semesters: Array<{ semester: number; students: number }> }>>('/api/fee-admin/programmes') });
  const save = useSaveStructure();
  const remove = useDeleteStructure();
  const apply = useApplyStructure();
  const [draft, setDraft] = useState<StructDraft | null>(null);
  const [preview, setPreview] = useState<{ id: string; r: { students: number; charges: number; amount: number; instalments: number; skipped: number } } | null>(null);

  const blank = (): StructDraft => ({ name: '', programmeId: programmes.data?.[0]?.id ?? '', semester: '1', term: '', heads: [{ head: 'Tuition Fee', category: 'TUITION', amount: '', dueDate: istDay(30) }], instalments: [] });
  const fromRow = (s: FeeStructure): StructDraft => ({ id: s.id, name: s.name, programmeId: s.programmeId, semester: String(s.semester), term: s.term, heads: s.heads.map((h) => ({ ...h, amount: String(h.amount) })), instalments: s.instalments.map((i) => ({ percent: String(i.percent), dueDate: i.dueDate })) });
  const total = draft ? draft.heads.reduce((t, h) => t + (Number(h.amount) || 0), 0) : 0;
  const pct = draft ? draft.instalments.reduce((t, i) => t + (Number(i.percent) || 0), 0) : 0;
  const valid = !!draft && draft.name.trim().length >= 3 && !!draft.programmeId && Number(draft.semester) > 0 && draft.term.trim().length >= 3 && draft.heads.length > 0 && draft.heads.every((h) => h.head.trim().length >= 2 && Number(h.amount) > 0 && h.dueDate) && (draft.instalments.length === 0 || (pct === 100 && draft.instalments.every((i) => i.dueDate)));

  function submit() {
    if (!draft) return;
    save.mutate({ id: draft.id, name: draft.name.trim(), programmeId: draft.programmeId, semester: Number(draft.semester), term: draft.term.trim(), heads: draft.heads.map((h) => ({ head: h.head.trim(), category: h.category, amount: Number(h.amount), dueDate: h.dueDate })), instalments: draft.instalments.map((i) => ({ percent: Number(i.percent), dueDate: i.dueDate })) }, { onSuccess: () => { toast.success('Fee structure saved'); setDraft(null); } });
  }

  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !data) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-3">
        <p className="text-[12px] text-[#5A6577]">A structure is a class’s fees for a term. Applying it charges every active student of the class the heads they do not already carry, with the instalment plan; run it again after late admissions.</p>
        <Button disabled={!programmes.data} onClick={() => { save.reset(); setDraft(blank()); }}>New structure</Button>
      </div>
      {data.length === 0 && <Card><EmptyState title="No fee structures" description="Set one up for each class and term." /></Card>}
      {data.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-[14px] font-semibold text-[#16264A]">{s.name}</p>
              <p className="text-[12px] text-[#5A6577]">{s.programme} semester {s.semester} · {s.term} · {s.students} active students · {inr(s.total)} each{s.instalments.length ? ` in ${s.instalments.length} instalments (${s.instalments.map((i) => `${i.percent}%`).join(' / ')})` : ''}</p>
              <p className="text-[12px] text-[#5A6577]">{s.heads.map((h) => `${h.head} ${inr(h.amount)}`).join(' · ')}</p>
              <p className="text-[11px] text-[#5A6577] mt-0.5">{s.appliedAt ? `Applied ${day(s.appliedAt)} to ${s.appliedTo} student(s)` : 'Not applied yet'}</p>
            </div>
            <div className="flex gap-2 items-start">
              <Button size="sm" variant="secondary" onClick={() => { save.reset(); setDraft(fromRow(s)); }}>Edit</Button>
              <Button size="sm" loading={apply.isPending && apply.variables?.id === s.id && apply.variables.dryRun} onClick={() => apply.mutate({ id: s.id, dryRun: true }, { onSuccess: (r) => setPreview({ id: s.id, r }), onError: (e) => toast.error(errText(e)) })}>Apply…</Button>
              {!s.appliedAt && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete ${s.name}?`)) remove.mutate(s.id, { onSuccess: () => toast.success('Structure deleted'), onError: (e) => toast.error(errText(e)) }); }}>Delete</Button>}
            </div>
          </div>
        </Card>
      ))}

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Apply fee structure"
        footer={<><Button variant="secondary" size="sm" onClick={() => setPreview(null)}>Cancel</Button><Button size="sm" disabled={!preview?.r.charges && !preview?.r.instalments} loading={apply.isPending} onClick={() => apply.mutate({ id: preview!.id, dryRun: false }, { onSuccess: (r) => { toast.success(`${r.charges} charges and ${r.instalments} instalments raised — students are told`); setPreview(null); } })}>Charge students</Button></>}>
        {preview && (preview.r.charges || preview.r.instalments
          ? <InlineAlert type="warning">This adds {preview.r.charges} charge(s) totalling {inr(preview.r.amount)} and {preview.r.instalments} instalment(s) across {preview.r.students} student(s){preview.r.skipped ? `; ${preview.r.skipped} already billed and skipped` : ''}.</InlineAlert>
          : <InlineAlert type="info">Nothing to add — all {preview.r.students} student(s) already carry these heads.</InlineAlert>)}
      </Modal>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit fee structure' : 'New fee structure'} width="760px"
        footer={<><Button variant="secondary" size="sm" onClick={() => setDraft(null)}>Cancel</Button><Button size="sm" disabled={!valid} loading={save.isPending} onClick={submit}>Save</Button></>}>
        {draft && (
          <div className="flex flex-col gap-3">
            {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
            <Input label="Name" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. BCA semester V — 2026-27" />
            <div className="grid grid-cols-3 gap-3">
              <Select label="Programme" value={draft.programmeId} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, programmeId: e.target.value })}>{(programmes.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select>
              <Input label="Semester" inputMode="numeric" disabled={!!draft.id} value={draft.semester} onChange={(e) => setDraft({ ...draft, semester: e.target.value.replace(/\D/g, '') })} />
              <Input label="Term" value={draft.term} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, term: e.target.value })} placeholder="2026-27-ODD" />
            </div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Heads · {inr(total)}</p>
            {draft.heads.map((h, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-end">
                <Input label={i === 0 ? 'Head' : undefined} value={h.head} onChange={(e) => setDraft({ ...draft, heads: draft.heads.map((x, j) => (j === i ? { ...x, head: e.target.value } : x)) })} />
                <Select label={i === 0 ? 'Category' : undefined} value={h.category} onChange={(e) => setDraft({ ...draft, heads: draft.heads.map((x, j) => (j === i ? { ...x, category: e.target.value as HeadDraft['category'] } : x)) })}><option value="TUITION">Tuition</option><option value="DEVELOPMENT">Development</option><option value="EXAM">Examination</option><option value="OTHER">Other</option></Select>
                <Input label={i === 0 ? 'Amount (₹)' : undefined} inputMode="numeric" value={h.amount} onChange={(e) => setDraft({ ...draft, heads: draft.heads.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/\D/g, '') } : x)) })} />
                <Input label={i === 0 ? 'Due' : undefined} type="date" value={h.dueDate} onChange={(e) => setDraft({ ...draft, heads: draft.heads.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)) })} />
                <button className="text-[12px] text-[#A8242C] cursor-pointer pb-2 disabled:opacity-40" disabled={draft.heads.length === 1} onClick={() => setDraft({ ...draft, heads: draft.heads.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <Button variant="secondary" size="sm" className="self-start" onClick={() => setDraft({ ...draft, heads: [...draft.heads, { head: '', category: 'OTHER', amount: '', dueDate: draft.heads[0]?.dueDate ?? istDay(30) }] })}>Add head</Button>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Instalments {draft.instalments.length ? `· ${pct}% of 100%` : '— none: pay in full'}</p>
            {draft.instalments.map((ins, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <Input label={i === 0 ? 'Percent' : undefined} inputMode="numeric" value={ins.percent} onChange={(e) => setDraft({ ...draft, instalments: draft.instalments.map((x, j) => (j === i ? { ...x, percent: e.target.value.replace(/\D/g, '') } : x)) })} />
                <Input label={i === 0 ? 'Due' : undefined} type="date" value={ins.dueDate} onChange={(e) => setDraft({ ...draft, instalments: draft.instalments.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)) })} />
                <button className="text-[12px] text-[#A8242C] cursor-pointer pb-2" onClick={() => setDraft({ ...draft, instalments: draft.instalments.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <Button variant="secondary" size="sm" className="self-start" disabled={draft.instalments.length >= 6} onClick={() => setDraft({ ...draft, instalments: [...draft.instalments, { percent: draft.instalments.length ? '' : '50', dueDate: '' }] })}>Add instalment</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Late fines ───────────────────────────────────────────────────────────────

export function LateFinesPanel() {
  const run = useLateFines();
  const [f, setF] = useState({ perDay: '10', cap: '500', graceDays: '7', term: '' });
  const [result, setResult] = useState<{ overdue: number; created: number; updated: number; amount: number; dryRun: boolean } | null>(null);
  const body = (dryRun: boolean) => ({ perDay: Number(f.perDay), cap: Number(f.cap), graceDays: Number(f.graceDays), ...(f.term.trim() ? { term: f.term.trim() } : {}), dryRun });
  const ok = Number(f.perDay) > 0 && Number(f.cap) > 0;
  return (
    <Card className="p-4 flex flex-col gap-3 max-w-[640px]">
      <div>
        <p className="text-[15px] font-semibold text-[#16264A]">Late fines</p>
        <p className="text-[12px] text-[#5A6577]">A fine on every overdue head: so much a day after the grace period, up to a cap. Running it again brings each fine up to date — it never adds a second fine or lowers one already paid.</p>
      </div>
      {run.isError && <InlineAlert type="error">{errText(run.error)}</InlineAlert>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input label="₹ per day" inputMode="numeric" value={f.perDay} onChange={(e) => setF({ ...f, perDay: e.target.value.replace(/\D/g, '') })} />
        <Input label="Cap (₹)" inputMode="numeric" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value.replace(/\D/g, '') })} />
        <Input label="Grace days" inputMode="numeric" value={f.graceDays} onChange={(e) => setF({ ...f, graceDays: e.target.value.replace(/\D/g, '') })} />
        <Input label="Term (optional)" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} />
      </div>
      {result && <InlineAlert type={result.dryRun ? 'info' : 'success'}>{result.overdue} overdue head(s). {result.dryRun ? 'Would add' : 'Added'} {result.created} fine(s) and {result.dryRun ? 'would update' : 'updated'} {result.updated}, totalling {inr(result.amount)}.</InlineAlert>}
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!ok} loading={run.isPending && run.variables?.dryRun} onClick={() => run.mutate(body(true), { onSuccess: setResult })}>Preview</Button>
        <Button disabled={!ok || !result?.dryRun || (!result.created && !result.updated)} loading={run.isPending && !run.variables?.dryRun} onClick={() => run.mutate(body(false), { onSuccess: (r) => { setResult(r); toast.success(`${r.created + r.updated} fine(s) levied`); } })}>Levy fines</Button>
      </div>
    </Card>
  );
}

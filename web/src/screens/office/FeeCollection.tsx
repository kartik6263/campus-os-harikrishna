import { useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { downloadCSV } from '../../lib/export';
import {
  COUNTER_MODES, MODE_LABEL, inr, receiptPdf,
  useCancelReceipt, useCloseDay, useCounterDay, useDayBook, useLookupStudent, useSettleCheque, useTake,
  type CounterMode, type CounterReceiptRow, type CounterStudent, type TakenPayment,
} from '../../lib/feeadmin';

interface Props { onModule: (m: string) => void }

/**
 * The college fee counter: look a student up, take money against a chosen
 * head or their oldest dues, hand over a PDF receipt; clear or bounce
 * cheques and drafts; cancel a receipt taken in error; and close the day's
 * cash book.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const STATUS: Record<CounterReceiptRow['status'], { label: string; cls: string }> = {
  COMPLETE: { label: 'Received', cls: 'bg-[#D1FAE5] text-[#0E7A5F]' },
  PENDING_CLEARANCE: { label: 'Awaiting clearance', cls: 'bg-[#FEF9EC] text-[#8A6D1F]' },
  BOUNCED: { label: 'Bounced', cls: 'bg-[#FEE2E2] text-[#A8242C]' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-[#EDEFF3] text-[#5A6577] line-through' },
};
const NEEDS_REF: Partial<Record<CounterMode, string>> = { CHEQUE: 'Cheque number', DD: 'Demand draft number', UPI: 'UPI reference', CARD: 'Card approval code', NEFT: 'UTR number' };

export default function FeeCollection(_props: Props) {
  const [tab, setTab] = useState('receipts');
  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
      <CollectPanel />
      <div className="flex-1 flex flex-col bg-[#EDEFF3] min-h-0">
        <div className="bg-white px-4"><Tabs tabs={[{ id: 'receipts', label: 'Receipts' }, { id: 'daybook', label: 'Day book' }]} activeId={tab} onChange={setTab} /></div>
        <div className="flex-1 overflow-y-auto">{tab === 'receipts' ? <Receipts /> : <DayBookTab />}</div>
      </div>
    </div>
  );
}

// ─── Taking money ─────────────────────────────────────────────────────────────

function CollectPanel() {
  const lookup = useLookupStudent();
  const take = useTake();
  const [q, setQ] = useState('');
  const [student, setStudent] = useState<CounterStudent | null>(null);
  const [feeItemId, setFeeItemId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<CounterMode>('CASH');
  const [ref, setRef] = useState('');
  const [bank, setBank] = useState('');
  const [done, setDone] = useState<TakenPayment | null>(null);

  async function find(query = q) {
    if (query.trim().length < 2) return;
    try {
      const s = await lookup.mutateAsync(query.trim());
      setStudent(s); setFeeItemId(''); setAmount(s.totals.due > 0 ? String(s.totals.due) : '');
    } catch (e) { setStudent(null); toast.error(errText(e)); }
  }
  const chosen = student?.heads.find((h) => h.id === feeItemId);
  const owing = student?.heads.filter((h) => h.due > 0) ?? [];
  const n = Number(amount);
  const needsRef = NEEDS_REF[mode];
  const ok = !!student && Number.isInteger(n) && n > 0 && (!needsRef || ref.trim().length >= 3);

  async function collect(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !ok) return;
    try {
      const r = await take.mutateAsync({
        studentId: student.id, amount: n, mode, head: chosen?.head ?? (owing.length === 1 ? owing[0]!.head : 'Fee payment'),
        ...(feeItemId ? { feeItemId } : {}), ...(needsRef ? { instrument: ref.trim() } : {}), ...(bank.trim() ? { remarks: bank.trim() } : {}),
      });
      setDone(r);
      setRef(''); setBank('');
      await find(student.enrolmentNo);
    } catch (err) { toast.error(errText(err)); }
  }

  return (
    <div className="lg:w-[420px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-[#D3D8E0] bg-white overflow-y-auto">
      <div className="border-b border-[#D3D8E0] px-5 py-4">
        <h2 className="text-[16px] font-semibold text-[#16264A]">Fee counter</h2>
        <p className="text-[12px] text-[#5A6577]">Cash, UPI, card, cheque, DD or bank transfer — a receipt for every rupee</p>
      </div>
      <form onSubmit={collect} className="p-5 flex flex-col gap-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1"><Input label="Student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Enrolment no., roll no. or name" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void find(); } }} /></div>
          <Button type="button" variant="secondary" loading={lookup.isPending} onClick={() => void find()}>Look up</Button>
        </div>
        {student && (
          <div className="border border-[#D3D8E0] rounded-[4px]">
            <div className="px-3 py-2 bg-[#EDEFF3]">
              <p className="text-[14px] font-semibold text-[#16264A]">{student.name}</p>
              <p className="text-[12px] text-[#5A6577]">{student.enrolmentNo} · {student.programme.shortName} semester {student.semester}{student.mobile ? ` · ${student.mobile}` : ''}</p>
              <p className={`text-[13px] font-semibold mt-1 ${student.totals.due ? 'text-[#A8242C]' : 'text-[#0E7A5F]'}`}>{student.totals.due ? `Outstanding ${inr(student.totals.due)}` : 'Nothing outstanding'}</p>
            </div>
            {owing.length > 0 && (
              <div className="max-h-48 overflow-y-auto">
                {owing.map((h) => (
                  <label key={h.id} className={`flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] border-t border-[#EDEFF3] cursor-pointer ${feeItemId === h.id ? 'bg-[#FEF9EC]' : ''}`}>
                    <span className="flex items-center gap-2"><input type="radio" name="head" checked={feeItemId === h.id} onChange={() => { setFeeItemId(h.id); setAmount(String(h.due)); }} />{h.head} <span className="text-[#5A6577]">{h.term}</span></span>
                    <span className="font-semibold text-[#16264A]">{inr(h.due)}</span>
                  </label>
                ))}
                <label className={`flex items-center gap-2 px-3 py-1.5 text-[12px] border-t border-[#EDEFF3] cursor-pointer ${!feeItemId ? 'bg-[#FEF9EC]' : ''}`}>
                  <input type="radio" name="head" checked={!feeItemId} onChange={() => { setFeeItemId(''); setAmount(String(student.totals.due)); }} />Oldest dues first (any amount)
                </label>
              </div>
            )}
          </div>
        )}
        <Input label="Amount (₹)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} hint={chosen && n > chosen.due ? `More than the ${inr(chosen.due)} owed on this head — the rest is held as an advance` : undefined} />
        <Select label="Mode" value={mode} onChange={(e) => { setMode(e.target.value as CounterMode); setRef(''); }}>
          {COUNTER_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
        </Select>
        {needsRef && <Input label={needsRef} value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} />}
        {(mode === 'CHEQUE' || mode === 'DD') && <Input label="Bank and branch" value={bank} maxLength={120} onChange={(e) => setBank(e.target.value)} hint="A cheque or DD reduces the dues only when it clears." />}
        <Button type="submit" loading={take.isPending} disabled={!ok}>Collect {n > 0 ? inr(n) : ''}</Button>
      </form>

      <Modal open={!!done} onClose={() => setDone(null)} title={done?.status === 'PENDING_CLEARANCE' ? 'Provisional receipt' : 'Payment received'} width="480px"
        footer={<><Button variant="secondary" size="sm" onClick={() => setDone(null)}>Close</Button><Button size="sm" onClick={() => done && receiptPdf({ receiptNo: done.receiptNo, date: done.receivedAt, student: done.studentName, enrolmentNo: done.enrolmentNo, programme: student ? `${student.programme.shortName} ${student.semester}` : undefined, head: done.head, amount: done.amount, mode: done.mode, instrument: done.instrument, status: done.status, appliedTo: done.appliedTo })}>Download receipt (PDF)</Button></>}>
        {done && (
          <div className="flex flex-col gap-2 text-[13px]">
            <p className="text-[24px] font-bold text-[#16264A]">{inr(done.amount)}</p>
            <p><span className="text-[#5A6577]">Receipt</span> <span className="font-mono font-semibold">{done.receiptNo}</span></p>
            <p className="text-[#5A6577]">{done.studentName} · {MODE_LABEL[done.mode] ?? done.mode}{done.instrument ? ` · ${done.instrument}` : ''}</p>
            {done.status === 'PENDING_CLEARANCE'
              ? <InlineAlert type="warning">Recorded pending clearance. Mark it cleared in Receipts when the bank confirms; only then do the dues come down.</InlineAlert>
              : done.appliedTo.length > 0 && (
                <div className="border border-[#EDEFF3] rounded-[4px]">
                  {done.appliedTo.map((a) => <div key={a.head} className="flex justify-between px-3 py-1.5 border-b border-[#EDEFF3] last:border-0"><span>{a.head}</span><span className="font-semibold">{inr(a.amount)}</span></div>)}
                </div>
              )}
            {done.unallocated > 0 && done.status !== 'PENDING_CLEARANCE' && <InlineAlert type="info">{inr(done.unallocated)} is more than was owed and stays on the account as an advance.</InlineAlert>}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

function Receipts() {
  const { user } = useAuth();
  const [date, setDate] = useState(istToday());
  const { data, isPending, error } = useCounterDay(date);
  const settle = useSettleCheque();
  const cancel = useCancelReceipt();
  const [open, setOpen] = useState<CounterReceiptRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const senior = user?.role === 'REGISTRAR' || user?.role === 'ADMIN';
  const rows = data?.receipts ?? [];

  function pdf(r: CounterReceiptRow) {
    receiptPdf({ receiptNo: r.receiptNo, date: r.receivedAt, student: r.studentName, enrolmentNo: r.enrolmentNo, programme: r.programme, head: r.head, amount: r.amount, mode: r.mode, instrument: r.instrument, status: r.status, receivedBy: r.receivedBy, cancelReason: r.status === 'CANCELLED' ? r.remarks : null });
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-3 flex flex-wrap gap-3 items-end justify-between">
        <div className="flex gap-3 items-end">
          <Input label="Day" type="date" max={istToday()} value={date} onChange={(e) => setDate(e.target.value)} />
          {data && <p className="text-[12px] text-[#5A6577] pb-2">Received {inr(data.totals.collected)} · {data.totals.count} receipts · {inr(data.totals.awaitingClearance)} awaiting clearance</p>}
        </div>
        <Button variant="secondary" size="sm" disabled={!rows.length} onClick={() => downloadCSV(`counter-receipts-${date}`, rows, [
          { key: 'receiptNo', label: 'Receipt' }, { key: 'receivedAt', label: 'Time', value: (r: CounterReceiptRow) => time(r.receivedAt) }, { key: 'enrolmentNo', label: 'Enrolment' }, { key: 'studentName', label: 'Student' },
          { key: 'head', label: 'Head' }, { key: 'amount', label: 'Amount' }, { key: 'mode', label: 'Mode' }, { key: 'instrument', label: 'Reference' }, { key: 'status', label: 'Status' }, { key: 'receivedBy', label: 'Clerk' },
        ])}>Export CSV</Button>
      </div>
      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && rows.length === 0 && <div className="bg-white border border-[#D3D8E0] rounded-[4px]"><EmptyState title="No receipts" description="Nothing was received at the counter on this day." /></div>}
      {rows.length > 0 && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F7F8FA]"><tr>{['Time', 'Receipt', 'Student', 'Head', 'Amount', 'Mode', 'Status'].map((h) => <th key={h} className={`px-3 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#EDEFF3] hover:bg-[#FAFBFC] cursor-pointer" onClick={() => { setOpen(r); setCancelling(false); setReason(''); settle.reset(); cancel.reset(); }}>
                  <td className="px-3 py-2 text-[#5A6577]">{time(r.receivedAt)}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.receiptNo}</td>
                  <td className="px-3 py-2"><p className="font-medium text-[#16264A]">{r.studentName}</p><p className="text-[11px] text-[#5A6577]">{r.enrolmentNo}</p></td>
                  <td className="px-3 py-2 text-[#5A6577]">{r.head}</td>
                  <td className="px-3 py-2 text-right font-semibold">{inr(r.amount)}</td>
                  <td className="px-3 py-2 text-[#5A6577]">{MODE_LABEL[r.mode] ?? r.mode}{r.instrument ? <span className="block text-[11px] font-mono">{r.instrument}</span> : null}</td>
                  <td className="px-3 py-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[2px] ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Receipt ${open.receiptNo}` : ''} width="500px"
        footer={<><Button variant="secondary" size="sm" onClick={() => setOpen(null)}>Close</Button>{open && <Button size="sm" onClick={() => pdf(open)}>Download PDF</Button>}</>}>
        {open && (
          <div className="flex flex-col gap-3 text-[13px]">
            {(settle.isError || cancel.isError) && <InlineAlert type="error">{errText(settle.error ?? cancel.error)}</InlineAlert>}
            <div className="grid grid-cols-2 gap-2">
              <p><span className="text-[#5A6577] block text-[11px]">Student</span>{open.studentName} · {open.enrolmentNo}</p>
              <p><span className="text-[#5A6577] block text-[11px]">Amount</span><span className="font-semibold">{inr(open.amount)}</span></p>
              <p><span className="text-[#5A6577] block text-[11px]">Mode</span>{MODE_LABEL[open.mode] ?? open.mode}{open.instrument ? ` · ${open.instrument}` : ''}</p>
              <p><span className="text-[#5A6577] block text-[11px]">Received by</span>{open.receivedBy} at {time(open.receivedAt)}</p>
            </div>
            <span className={`self-start text-[11px] font-semibold px-2 py-0.5 rounded-[2px] ${STATUS[open.status].cls}`}>{STATUS[open.status].label}</span>
            {open.remarks && <p className="text-[12px] text-[#5A6577]">{open.remarks}</p>}
            {open.status === 'PENDING_CLEARANCE' && (
              <div className="flex gap-2">
                <Button size="sm" loading={settle.isPending} onClick={() => settle.mutate({ id: open.id, outcome: 'CLEARED' }, { onSuccess: () => { toast.success('Cleared — the dues have come down'); setOpen(null); } })}>Mark cleared</Button>
                <Button size="sm" variant="destructive" loading={settle.isPending} onClick={() => settle.mutate({ id: open.id, outcome: 'BOUNCED', remarks: 'Returned unpaid by the bank' }, { onSuccess: () => { toast.success('Marked bounced — the student is told'); setOpen(null); } })}>Bounced</Button>
              </div>
            )}
            {(open.status === 'COMPLETE' || open.status === 'PENDING_CLEARANCE') && (
              !cancelling
                ? <button className="self-start text-[12px] text-[#A8242C] cursor-pointer" onClick={() => setCancelling(true)}>Cancel this receipt…</button>
                : (
                  <div className="flex flex-col gap-2 border-t border-[#EDEFF3] pt-3">
                    <p className="text-[12px] text-[#5A6577]">{senior ? 'Cancelling reverses what it paid; the student owes it again.' : 'You can cancel only today’s receipts, before the day book is closed.'}</p>
                    <Input label="Reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered against the wrong student" />
                    <Button size="sm" variant="destructive" disabled={reason.trim().length < 10} loading={cancel.isPending}
                      onClick={() => cancel.mutate({ paymentId: open.paymentId, reason: reason.trim() }, { onSuccess: (r) => { toast.success(`Receipt cancelled — ${inr(r.reversed)} owed again`); setOpen(null); } })}>Cancel receipt</Button>
                  </div>
                )
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Day book ─────────────────────────────────────────────────────────────────

function DayBookTab() {
  const [date, setDate] = useState(istToday());
  const { data, isPending, error } = useDayBook(date);
  const close = useCloseDay();
  const [counted, setCounted] = useState('');
  const [remarks, setRemarks] = useState('');
  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !data) return <div className="p-4"><InlineAlert type="error">{errText(error)}</InlineAlert></div>;
  const diff = counted ? Number(counted) - data.cash : 0;
  const Group = ({ title, rows }: { title: string; rows: Array<{ key: string; amount: number }> }) => (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <p className="px-3 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#EDEFF3]">{title}</p>
      {rows.length === 0 && <p className="px-3 py-3 text-[12px] text-[#5A6577]">Nothing</p>}
      {rows.map((r) => <div key={r.key} className="flex justify-between px-3 py-1.5 text-[13px] border-b border-[#EDEFF3] last:border-0"><span>{MODE_LABEL[r.key] ?? r.key}</span><span className="font-semibold">{inr(r.amount)}</span></div>)}
    </div>
  );
  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-3 flex flex-wrap gap-4 items-end">
        <Input label="Day" type="date" max={istToday()} value={date} onChange={(e) => { setDate(e.target.value); setCounted(''); setRemarks(''); }} />
        <p className="text-[13px] pb-2"><span className="text-[#5A6577]">Collected</span> <span className="font-bold">{inr(data.collected)}</span> · <span className="text-[#5A6577]">cash in hand</span> <span className="font-bold">{inr(data.cash)}</span> · {data.count} receipts{data.pendingClearance ? ` · ${inr(data.pendingClearance)} awaiting clearance` : ''}</p>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" disabled={!data.entries.length} onClick={() => downloadCSV(`day-book-${date}`, data.entries, [
          { key: 'time', label: 'Time', value: (r) => time(r.time) }, { key: 'receiptNo', label: 'Receipt' }, { key: 'enrolmentNo', label: 'Enrolment' }, { key: 'student', label: 'Student' }, { key: 'head', label: 'Head' },
          { key: 'amount', label: 'Amount' }, { key: 'mode', label: 'Mode' }, { key: 'channel', label: 'Channel' }, { key: 'clerk', label: 'Clerk' }, { key: 'status', label: 'Status' },
        ])}>Export CSV</Button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <Group title="By mode" rows={data.byMode} /><Group title="By clerk / channel" rows={data.byClerk} /><Group title="By head" rows={data.byHead} />
      </div>
      {data.cancelled.length > 0 && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
          <p className="px-3 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#EDEFF3]">Cancelled receipts</p>
          {data.cancelled.map((c, i) => <p key={i} className="px-3 py-1.5 text-[12px] border-b border-[#EDEFF3] last:border-0"><span className="font-mono">{c.receiptNo}</span> · {inr(c.amount)} · {c.reason} · {c.by}</p>)}
        </div>
      )}
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-col gap-3 max-w-[560px]">
        <p className="text-[15px] font-semibold text-[#16264A]">Close the cash book</p>
        {data.closed ? (
          <InlineAlert type="success">Closed by {data.closed.closedBy} on {new Date(data.closed.closedAt).toLocaleString('en-IN')}: book {inr(data.closed.expectedCash)}, counted {inr(data.closed.countedCash)}{data.closed.difference ? ` (difference ${inr(data.closed.difference)} — ${data.closed.remarks})` : ''}. Receipts of this day can no longer be cancelled.</InlineAlert>
        ) : (
          <>
            {close.isError && <InlineAlert type="error">{errText(close.error)}</InlineAlert>}
            <p className="text-[12px] text-[#5A6577]">Count the cash in the drawer. Once closed, the day’s receipts are final.</p>
            <Input label="Cash counted (₹)" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, ''))} hint={counted ? (diff === 0 ? 'Matches the book' : `${diff > 0 ? 'Excess' : 'Short'} by ${inr(Math.abs(diff))}`) : `The book says ${inr(data.cash)}`} />
            {diff !== 0 && <Input label="Explain the difference" value={remarks} maxLength={300} onChange={(e) => setRemarks(e.target.value)} />}
            <Button disabled={!counted || (diff !== 0 && remarks.trim().length < 5)} loading={close.isPending}
              onClick={() => close.mutate({ date, countedCash: Number(counted), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }, { onSuccess: () => toast.success(`Day book for ${date} closed`) })}>Close day</Button>
          </>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { useAuth, displayName } from '../../../lib/auth';
import { downloadCSV } from '../../../lib/export';
import { useCollection, type Stored } from '../../../lib/records';
import { BUDGET_HEADS } from '../../../lib/governancedata';

/**
 * Finance & accounts for the governance office: the year's budget heads with
 * what has actually been spent and committed against each (computed from the
 * bills, never typed), bills through their approval chain to payment, the
 * trail of every decision, and closing the financial year.
 */

interface Head { id: string; fy: string; code: string; title: string; category: 'revenue' | 'capital'; allocation: number; sanctioned: number }
type BillStatus = 'pending' | 'approved' | 'paid' | 'rejected';
interface Bill {
  id: string; fy: string; billNo: string; payee: string; headCode: string; amount: number; billDate: string; description: string;
  stage: number; status: BillStatus; raisedBy: string; raisedAt: string;
  history: Array<{ at: string; by: string; action: string; note?: string }>;
  paidOn?: string; utr?: string;
}
interface Closing { id: string; fy: string; checks: Record<string, boolean>; closedAt?: string; closedBy?: string }

const STAGES = ['Section Head', 'Finance Officer', 'Registrar', 'Vice-Chancellor'];
/** Bills above this go to the Vice-Chancellor as well. */
const VC_LIMIT = 500000;
const stagesFor = (amount: number) => (amount > VC_LIMIT ? STAGES : STAGES.slice(0, 3));
const CHECKS = ['All bills for the year submitted', 'All advances settled', 'Bank reconciliation done', 'Final accounts prepared', 'Auditors appointed'];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fyOf = (d = new Date()) => { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; };
const SAMPLE_HEADS: Head[] = BUDGET_HEADS.map(h => ({ id: `${fyOf()}-${h.code}`, fy: fyOf(), code: h.code, title: h.title, category: h.category, allocation: h.allocation, sanctioned: h.sanctioned }));

export default function FinanceAccounts() {
  const [tab, setTab] = useState('budget');
  const [fy, setFy] = useState(fyOf());
  const heads = useCollection<Head>('gov:budget-heads', SAMPLE_HEADS);
  const bills = useCollection<Bill>('gov:bills', []);
  const closings = useCollection<Closing>('gov:fy-closing', []);
  const closed = closings.items.find(c => c.fy === fy)?.closedAt;
  const fyHeads = heads.items.filter(h => h.fy === fy);
  const fyBills = bills.items.filter(b => b.fy === fy);
  const years = [...new Set([fyOf(), ...heads.items.map(h => h.fy), ...bills.items.map(b => b.fy)])].sort().reverse();

  const spent = (code: string) => fyBills.filter(b => b.headCode === code && b.status === 'paid').reduce((n, b) => n + b.amount, 0);
  const committed = (code: string) => fyBills.filter(b => b.headCode === code && (b.status === 'pending' || b.status === 'approved')).reduce((n, b) => n + b.amount, 0);
  const totals = { sanctioned: fyHeads.reduce((n, h) => n + h.sanctioned, 0), spent: fyHeads.reduce((n, h) => n + spent(h.code), 0), committed: fyHeads.reduce((n, h) => n + committed(h.code), 0) };

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div><h1 className="text-[18px] font-bold text-white">Finance & Accounts</h1><p className="text-[13px] text-white/60 mt-0.5">Budget, bills, approvals and year closing</p></div>
          <select value={fy} onChange={e => setFy(e.target.value)} className="h-8 px-2 text-[13px] rounded-[4px] bg-white/10 text-white border border-white/20 cursor-pointer">{years.map(y => <option key={y} value={y} className="text-[#16264A]">FY {y}</option>)}</select>
          {closed && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/15 text-white">Closed {day(closed)}</span>}
        </div>
        <div className="flex gap-6 text-center">
          {[['Sanctioned', inr(totals.sanctioned)], ['Spent', inr(totals.spent)], ['Committed', inr(totals.committed)], ['Available', inr(totals.sanctioned - totals.spent - totals.committed)]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'budget', label: 'Budget' }, { id: 'bills', label: `Bills & Payments${fyBills.filter(b => b.status === 'pending').length ? ` (${fyBills.filter(b => b.status === 'pending').length})` : ''}` }, { id: 'trail', label: 'Audit Trail' }, { id: 'closing', label: 'Year Closing' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {closed && <InlineAlert type="info">FY {fy} is closed. Its budget and bills can be read but not changed.</InlineAlert>}
        {heads.isLoading || bills.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'budget' && <BudgetTab fy={fy} heads={heads} fyHeads={fyHeads} spent={spent} committed={committed} locked={!!closed} />}
            {tab === 'bills' && <BillsTab fy={fy} bills={bills} fyBills={fyBills} heads={fyHeads} spent={spent} committed={committed} locked={!!closed} />}
            {tab === 'trail' && <TrailTab bills={fyBills} />}
            {tab === 'closing' && <ClosingTab fy={fy} closings={closings} bills={fyBills} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll<T extends object> = ReturnType<typeof useCollection<T>>;

function BudgetTab({ fy, heads, fyHeads, spent, committed, locked }: { fy: string; heads: Coll<Head>; fyHeads: Stored<Head>[]; spent: (c: string) => number; committed: (c: string) => number; locked: boolean }) {
  const [editing, setEditing] = useState<Stored<Head> | 'new' | null>(null);
  const [f, setF] = useState({ code: '', title: '', category: 'revenue' as Head['category'], allocation: '', sanctioned: '' });
  function open(h: Stored<Head> | 'new') {
    setEditing(h);
    setF(h === 'new' ? { code: '', title: '', category: 'revenue', allocation: '', sanctioned: '' } : { code: h.code, title: h.title, category: h.category, allocation: String(h.allocation), sanctioned: String(h.sanctioned) });
  }
  function save() {
    const allocation = Number(f.allocation), sanctioned = Number(f.sanctioned);
    if (!f.code.trim() || !f.title.trim() || !(allocation > 0)) { toast.error('Code, title and allocation are required'); return; }
    if (sanctioned > allocation) { toast.error('Sanctioned cannot exceed the allocation'); return; }
    if (editing !== 'new' && editing && sanctioned < spent(editing.code) + committed(editing.code)) { toast.error(`Already spent or committed ${inr(spent(editing.code) + committed(editing.code))} on this head`); return; }
    if (editing === 'new' && fyHeads.some(h => h.code.toLowerCase() === f.code.trim().toLowerCase())) { toast.error('That head code already exists this year'); return; }
    const doc = { code: f.code.trim().toUpperCase(), title: f.title.trim(), category: f.category, allocation, sanctioned };
    if (editing === 'new') heads.add({ id: `${fy}-${doc.code}`, fy, ...doc });
    else if (editing) heads.update(editing.id, doc);
    toast.success('Budget head saved'); setEditing(null);
  }
  function rollOver() {
    const prev = `${Number(fy.slice(0, 4)) - 1}-${fy.slice(2, 4)}`;
    const source = heads.items.filter(h => h.fy === prev);
    if (!source.length) { toast.error(`No heads in FY ${prev} to copy`); return; }
    source.forEach(h => heads.add({ ...h, id: `${fy}-${h.code}`, fy, _rid: undefined } as Head));
    toast.success(`${source.length} heads copied from FY ${prev} — revise the amounts`);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A] flex-1">Budget heads — FY {fy}</p>
        <Button size="sm" variant="secondary" disabled={!fyHeads.length} onClick={() => downloadCSV(`budget-${fy}`, fyHeads.map(h => ({ code: h.code, head: h.title, category: h.category, allocation: h.allocation, sanctioned: h.sanctioned, spent: spent(h.code), committed: committed(h.code), available: h.sanctioned - spent(h.code) - committed(h.code) })))}>Export CSV</Button>
        {!locked && fyHeads.length === 0 && <Button size="sm" variant="secondary" onClick={rollOver}>Copy last year's heads</Button>}
        {!locked && <Button size="sm" onClick={() => open('new')}>+ Add head</Button>}
      </div>
      {fyHeads.length === 0 ? <div className="p-6"><EmptyState title={`No budget heads for FY ${fy}`} /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Head', 'Allocation', 'Sanctioned', 'Spent', 'Committed', 'Available', 'Used', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{fyHeads.map(h => {
            const s = spent(h.code), c = committed(h.code), avail = h.sanctioned - s - c, pct = h.sanctioned ? Math.round(((s + c) / h.sanctioned) * 100) : 0;
            return (
              <tr key={h.id} className="border-b border-[#EDEFF3] tabular-nums">
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{h.title}</p><p className="font-mono text-[11px] text-[#5A6577]">{h.code} · {h.category}</p></td>
                <td className="px-4 py-3">{inr(h.allocation)}</td><td className="px-4 py-3">{inr(h.sanctioned)}</td><td className="px-4 py-3">{inr(s)}</td><td className="px-4 py-3">{inr(c)}</td>
                <td className={`px-4 py-3 font-medium ${avail < 0 ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>{inr(avail)}</td>
                <td className="px-4 py-3 w-32"><div className="h-2 bg-[#EDEFF3] rounded-full"><div className={`h-full rounded-full ${pct > 90 ? 'bg-[#A8242C]' : pct > 70 ? 'bg-[#E0952A]' : 'bg-[#0E7A5F]'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div><p className="text-[11px] text-[#5A6577]">{pct}%</p></td>
                <td className="px-4 py-3 text-right">{!locked && <Button size="sm" variant="ghost" onClick={() => open(h)}>Edit</Button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add budget head' : 'Edit budget head'} footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Code" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} disabled={editing !== 'new'} placeholder="A06-CONT" />
          <Select label="Category" value={f.category} onChange={e => setF({ ...f, category: e.target.value as Head['category'] })}><option value="revenue">Revenue</option><option value="capital">Capital</option></Select>
          <div className="col-span-2"><Input label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
          <Input label="Allocation (₹)" inputMode="numeric" value={f.allocation} onChange={e => setF({ ...f, allocation: e.target.value.replace(/\D/g, '') })} />
          <Input label="Sanctioned (₹)" inputMode="numeric" value={f.sanctioned} onChange={e => setF({ ...f, sanctioned: e.target.value.replace(/\D/g, '') })} />
        </div>
      </Modal>
    </div>
  );
}

function BillsTab({ fy, bills, fyBills, heads, spent, committed, locked }: { fy: string; bills: Coll<Bill>; fyBills: Stored<Bill>[]; heads: Stored<Head>[]; spent: (c: string) => number; committed: (c: string) => number; locked: boolean }) {
  const { user } = useAuth();
  const me = displayName(user) || 'Accounts';
  const [view, setView] = useState<'action' | 'all'>('action');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ billNo: '', payee: '', headCode: heads[0]?.code ?? '', amount: '', billDate: new Date().toISOString().slice(0, 10), description: '' });
  const [acting, setActing] = useState<{ b: Stored<Bill>; kind: 'approve' | 'reject' | 'pay' } | null>(null);
  const [note, setNote] = useState('');
  const rows = fyBills.filter(b => view === 'all' || b.status === 'pending' || b.status === 'approved');

  function add() {
    const amount = Number(f.amount);
    const head = heads.find(h => h.code === f.headCode);
    if (!f.billNo.trim() || !f.payee.trim() || !head || !(amount > 0)) { toast.error('Bill number, payee, head and amount are required'); return; }
    if (fyBills.some(b => b.billNo.toLowerCase() === f.billNo.trim().toLowerCase() && b.payee.toLowerCase() === f.payee.trim().toLowerCase())) { toast.error('This bill from this payee is already entered'); return; }
    const avail = head.sanctioned - spent(head.code) - committed(head.code);
    if (amount > avail && !window.confirm(`Only ${inr(avail)} is available under ${head.code}. Enter the bill anyway?`)) return;
    const now = new Date().toISOString();
    bills.add({ id: `BILL-${Date.now().toString(36).toUpperCase()}`, fy, billNo: f.billNo.trim(), payee: f.payee.trim(), headCode: head.code, amount, billDate: f.billDate, description: f.description.trim(), stage: 0, status: 'pending', raisedBy: me, raisedAt: now, history: [{ at: now, by: me, action: 'Entered' }] });
    toast.success(`Bill entered — with the ${STAGES[0]} for approval`);
    setAdding(false); setF({ ...f, billNo: '', payee: '', amount: '', description: '' });
  }
  function act() {
    if (!acting) return;
    const { b, kind } = acting;
    const now = new Date().toISOString();
    if (kind === 'reject') {
      if (!note.trim()) { toast.error('Give a reason'); return; }
      bills.update(b.id, { status: 'rejected', history: [...b.history, { at: now, by: me, action: `Rejected at ${STAGES[b.stage]}`, note: note.trim() }] });
      toast.success('Bill rejected');
    } else if (kind === 'approve') {
      const chain = stagesFor(b.amount);
      const last = b.stage >= chain.length - 1;
      bills.update(b.id, { stage: last ? b.stage : b.stage + 1, status: last ? 'approved' : 'pending', history: [...b.history, { at: now, by: me, action: `Approved by ${STAGES[b.stage]}`, note: note.trim() || undefined }] });
      toast.success(last ? 'Bill fully approved — ready to pay' : `Forwarded to the ${chain[b.stage + 1]}`);
    } else {
      if (!note.trim()) { toast.error('Enter the UTR / cheque number'); return; }
      bills.update(b.id, { status: 'paid', paidOn: now, utr: note.trim(), history: [...b.history, { at: now, by: me, action: 'Paid', note: note.trim() }] });
      toast.success('Payment recorded');
    }
    setActing(null); setNote('');
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        {(['action', 'all'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{v === 'action' ? 'Awaiting action' : 'All bills'}</button>)}
        <p className="text-[12px] text-[#5A6577] flex-1">Approval: {STAGES.slice(0, 3).join(' → ')}; above {inr(VC_LIMIT)} also the Vice-Chancellor.</p>
        <Button size="sm" variant="secondary" disabled={!fyBills.length} onClick={() => downloadCSV(`bills-${fy}`, fyBills.map(b => ({ bill: b.billNo, payee: b.payee, head: b.headCode, amount: b.amount, date: b.billDate, status: b.status, stage: b.status === 'pending' ? STAGES[b.stage] : '', paidOn: b.paidOn?.slice(0, 10) ?? '', utr: b.utr ?? '' })))}>Export CSV</Button>
        {!locked && <Button size="sm" disabled={!heads.length} onClick={() => setAdding(true)}>+ Enter bill</Button>}
      </div>
      {!heads.length && <div className="p-4"><InlineAlert type="warning">Set up the year's budget heads first.</InlineAlert></div>}
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No bills here" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Bill', 'Payee', 'Head', 'Amount', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(b => (
            <tr key={b.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{b.billNo}</p><p className="text-[11px] text-[#5A6577]">{day(b.billDate)}{b.description ? ` · ${b.description}` : ''}</p></td>
              <td className="px-4 py-3 text-[#16264A]">{b.payee}</td>
              <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{b.headCode}</td>
              <td className="px-4 py-3 tabular-nums font-medium">{inr(b.amount)}</td>
              <td className="px-4 py-3 text-[12px]">{b.status === 'pending' ? <span className="text-[#8A6D1F] font-semibold">With {STAGES[b.stage]}</span> : b.status === 'approved' ? <span className="text-[#1D4ED8] font-semibold">Approved — to pay</span> : b.status === 'paid' ? <span className="text-[#0E7A5F] font-semibold">Paid {day(b.paidOn)}</span> : <span className="text-[#A8242C] font-semibold">Rejected</span>}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                {!locked && b.status === 'pending' && <><Button size="sm" variant="ghost" onClick={() => { setActing({ b, kind: 'reject' }); setNote(''); }}>Reject</Button><Button size="sm" onClick={() => { setActing({ b, kind: 'approve' }); setNote(''); }}>Approve</Button></>}
                {!locked && b.status === 'approved' && <Button size="sm" onClick={() => { setActing({ b, kind: 'pay' }); setNote(''); }}>Record payment</Button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Enter bill" width="560px" footer={<><Button size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" onClick={add}>Enter</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bill / invoice no." value={f.billNo} onChange={e => setF({ ...f, billNo: e.target.value })} />
          <Input label="Bill date" type="date" value={f.billDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setF({ ...f, billDate: e.target.value })} />
          <div className="col-span-2"><Input label="Payee" value={f.payee} onChange={e => setF({ ...f, payee: e.target.value })} /></div>
          <Select label="Budget head" value={f.headCode} onChange={e => setF({ ...f, headCode: e.target.value })}>{heads.map(h => <option key={h.code} value={h.code}>{h.code} — {h.title}</option>)}</Select>
          <Input label="Amount (₹)" inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
          <div className="col-span-2"><Input label="Description" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        </div>
      </Modal>
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting ? `${acting.kind === 'approve' ? `Approve as ${STAGES[acting.b.stage]}` : acting.kind === 'reject' ? 'Reject bill' : 'Record payment'} — ${acting.b.billNo}` : ''}
        footer={<><Button size="sm" variant="secondary" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" variant={acting?.kind === 'reject' ? 'destructive' : 'primary'} onClick={act}>Confirm</Button></>}>
        {acting && (
          <div className="space-y-3 text-[13px]">
            <p className="text-[#16264A]">{acting.b.payee} · {inr(acting.b.amount)} · {acting.b.headCode}</p>
            <ul className="text-[12px] text-[#5A6577] space-y-0.5">{acting.b.history.map((h, i) => <li key={i}>{day(h.at)} · {h.action} · {h.by}{h.note ? ` — ${h.note}` : ''}</li>)}</ul>
            <Input label={acting.kind === 'pay' ? 'UTR / cheque number' : acting.kind === 'reject' ? 'Reason' : 'Remarks (optional)'} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function TrailTab({ bills }: { bills: Stored<Bill>[] }) {
  const entries = useMemo(() => bills.flatMap(b => b.history.map(h => ({ ...h, billNo: b.billNo, payee: b.payee, amount: b.amount }))).sort((a, b) => b.at.localeCompare(a.at)), [bills]);
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Every decision on every bill</p><Button size="sm" variant="secondary" disabled={!entries.length} onClick={() => downloadCSV('finance-audit-trail', entries.map(e => ({ when: e.at, bill: e.billNo, payee: e.payee, amount: e.amount, action: e.action, by: e.by, note: e.note ?? '' })))}>Export CSV</Button></div>
      {entries.length === 0 ? <div className="p-6"><EmptyState title="No activity yet" /></div> : (
        <table className="w-full text-[13px]"><tbody>{entries.slice(0, 300).map((e, i) => (
          <tr key={i} className="border-b border-[#EDEFF3]"><td className="px-4 py-2.5 text-[#5A6577] whitespace-nowrap">{new Date(e.at).toLocaleString('en-IN')}</td><td className="px-4 py-2.5 text-[#16264A]">{e.action}</td><td className="px-4 py-2.5 text-[#5A6577]">{e.billNo} · {e.payee} · {inr(e.amount)}</td><td className="px-4 py-2.5 text-[#5A6577]">{e.by}{e.note ? ` — ${e.note}` : ''}</td></tr>
        ))}</tbody></table>
      )}
    </div>
  );
}

function ClosingTab({ fy, closings, bills }: { fy: string; closings: Coll<Closing>; bills: Stored<Bill>[] }) {
  const { user } = useAuth();
  const c = closings.items.find(x => x.fy === fy);
  const checks = c?.checks ?? {};
  const open = bills.filter(b => b.status === 'pending' || b.status === 'approved');
  function toggle(k: string) {
    const next = { ...checks, [k]: !checks[k] };
    if (c) closings.update(c.id, { checks: next }); else closings.add({ id: `FY-${fy}`, fy, checks: next });
  }
  function close() {
    if (!window.confirm(`Close FY ${fy}? Its budget and bills become read-only.`)) return;
    const data = { checks, closedAt: new Date().toISOString(), closedBy: displayName(user) };
    if (c) closings.update(c.id, data); else closings.add({ id: `FY-${fy}`, fy, ...data });
    toast.success(`FY ${fy} closed`);
  }
  const ready = CHECKS.every(k => checks[k]) && open.length === 0;
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 max-w-2xl space-y-4">
      <p className="text-[14px] font-semibold text-[#16264A]">Closing FY {fy}</p>
      {open.length > 0 && <InlineAlert type="warning">{open.length} bill(s) are still pending or unpaid. Settle or reject them before closing.</InlineAlert>}
      <div className="space-y-2">{CHECKS.map(k => <label key={k} className="flex items-center gap-3 text-[13px] text-[#16264A] cursor-pointer"><input type="checkbox" checked={!!checks[k]} disabled={!!c?.closedAt} onChange={() => toggle(k)} /> {k}</label>)}</div>
      {c?.closedAt ? <InlineAlert type="success">Closed on {day(c.closedAt)} by {c.closedBy}.</InlineAlert> : <Button disabled={!ready} onClick={close}>Close the financial year</Button>}
    </div>
  );
}

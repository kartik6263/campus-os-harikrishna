import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, Toggle, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { useAuth, displayName } from '../../../lib/auth';
import { downloadCSV } from '../../../lib/export';
import { formatBytes, useCollection, useFiles, type Stored } from '../../../lib/records';
import {
  SAMPLE_SCHEMES, STATUS_TEXT, STATUS_TONE, inr, statusOf,
  type Application, type Decision, type DecisionStatus, type EffectiveStatus, type Scheme,
} from '../../../lib/scholarship';

/**
 * The scholarship desk: the scheme master, verification of students'
 * applications and documents, forwarding to the scheme portal, and recording
 * sanction and disbursement. Students see every decision taken here.
 */

const DECISIONS = 'desk:scholarship-decisions';
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

type Row = { app: Stored<Application>; decision: Stored<Decision> | null; status: EffectiveStatus };

export default function UniversityScholarship() {
  const [tab, setTab] = useState('applications');
  const qc = useQueryClient();
  const { user } = useAuth();
  const schemes = useCollection<Scheme>('campus:scholarship-schemes', SAMPLE_SCHEMES);
  const apps = useCollection<Application>('student:scholarship-applications', []);
  const decisions = useCollection<Decision>(DECISIONS, []);

  const rows: Row[] = useMemo(() => apps.items.map(app => {
    const decision = decisions.items.find(d => d.id === app.id && d._studentId === app._studentId) ?? null;
    return { app, decision, status: statusOf(app, decision) };
  }), [apps.items, decisions.items]);

  /** Records the desk's verdict, filed against the student so they can read it. */
  async function decide(row: Row, status: DecisionStatus, extra: Partial<Decision> = {}) {
    const at = new Date().toISOString();
    const by = displayName(user) || 'Scholarship desk';
    const entry = { status, at, by, ...(extra.note ? { note: extra.note } : {}) };
    try {
      if (row.decision) {
        decisions.update(row.decision._rid ?? row.decision.id, { ...extra, status, at, by, history: [...(row.decision.history ?? []), entry] });
      } else {
        await api(`/api/records/${DECISIONS}`, { method: 'POST', body: { studentId: row.app._studentId, data: { id: row.app.id, status, at, by, ...extra, history: [entry] } } });
        await qc.invalidateQueries({ queryKey: ['records', DECISIONS] });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save the decision');
      throw e;
    }
  }

  const count = (s: EffectiveStatus) => rows.filter(r => r.status === s).length;
  const tabs = [
    { id: 'applications', label: `Applications${count('submitted') ? ` (${count('submitted')} to verify)` : ''}` },
    { id: 'dispatch', label: `Forward to Portal${count('verified') ? ` (${count('verified')})` : ''}` },
    { id: 'disbursement', label: 'Sanction & Disbursement' },
    { id: 'schemes', label: 'Scheme Master' },
  ];

  const loading = schemes.isLoading || apps.isLoading || decisions.isLoading;
  const disbursed = rows.filter(r => r.status === 'disbursed').reduce((s, r) => s + (r.decision?.amountSanctioned ?? r.app.amount), 0);

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Scholarship Desk</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Schemes, verification, portal forwarding and disbursement</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Applications', rows.length], ['To verify', count('submitted')], ['Forwarded', count('dispatched') + count('sanctioned')], ['Disbursed', inr(disbursed)]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6"><Tabs tabs={tabs} activeId={tab} onChange={setTab} /></div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'applications' && <ApplicationsTab rows={rows} schemes={schemes.items} decide={decide} />}
            {tab === 'dispatch' && <DispatchTab rows={rows} decide={decide} />}
            {tab === 'disbursement' && <DisbursementTab rows={rows} decide={decide} />}
            {tab === 'schemes' && <SchemesTab schemes={schemes} rows={rows} />}
          </>
        )}
      </div>
    </div>
  );
}

type Decide = (row: Row, status: DecisionStatus, extra?: Partial<Decision>) => Promise<void>;

function StatusChip({ s }: { s: EffectiveStatus }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] whitespace-nowrap ${STATUS_TONE[s]}`}>{s[0]!.toUpperCase() + s.slice(1)}</span>;
}

// ─── Applications & verification ─────────────────────────────────────────────

function ApplicationsTab({ rows, schemes, decide }: { rows: Row[]; schemes: Scheme[]; decide: Decide }) {
  const [scheme, setScheme] = useState('');
  const [status, setStatus] = useState<string>('submitted');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Row | null>(null);

  const query = q.trim().toLowerCase();
  const shown = rows.filter(r =>
    (!scheme || r.app.schemeId === scheme) && (!status || r.status === status) &&
    (!query || [r.app._student?.name, r.app._student?.enrolmentNo, r.app.id].some(s => s?.toLowerCase().includes(query))));

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Input placeholder="Search student, enrolment or application no." value={q} onChange={e => setQ(e.target.value)} className="flex-1 min-w-[220px]" />
        <Select value={scheme} onChange={e => setScheme(e.target.value)} className="w-56">
          <option value="">All schemes</option>
          {schemes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-44">
          <option value="">Any status</option>
          {(['submitted', 'returned', 'verified', 'dispatched', 'sanctioned', 'disbursed', 'failed', 'rejected', 'withdrawn'] as EffectiveStatus[]).map(s => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
        </Select>
        <Button variant="secondary" size="sm" onClick={() => downloadCSV('scholarship-applications', shown.map(r => ({ application: r.app.id, student: r.app._student?.name ?? '', enrolmentNo: r.app._student?.enrolmentNo ?? '', scheme: r.app.schemeName, year: r.app.academicYear, amount: r.app.amount, income: r.app.familyIncome, category: r.app.category, status: r.status, appliedAt: r.app.appliedAt.slice(0, 10) })))}>Export CSV</Button>
      </div>
      {shown.length === 0 ? <div className="p-6"><EmptyState title={rows.length ? 'No applications match' : 'No applications yet'} description={rows.length ? undefined : 'Students apply from their portal; applications appear here.'} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[820px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Application', 'Student', 'Scheme', 'Income', 'Applied', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.app._rid ?? r.app.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA]">
                  <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{r.app.id}</td>
                  <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{r.app._student?.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.app._student?.enrolmentNo} · {r.app.category}</p></td>
                  <td className="px-4 py-3 text-[#16264A]">{r.app.schemeName}<p className="text-[11px] text-[#5A6577]">{inr(r.app.amount)} · {r.app.academicYear}</p></td>
                  <td className="px-4 py-3 text-[#5A6577]">{inr(r.app.familyIncome)}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{fmtDate(r.app.appliedAt)}</td>
                  <td className="px-4 py-3"><StatusChip s={r.status} /></td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant={r.status === 'submitted' ? 'primary' : 'ghost'} onClick={() => setOpen(r)}>{r.status === 'submitted' ? 'Verify' : 'Open'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <VerifyModal row={open ? rows.find(r => r.app.id === open.app.id && r.app._studentId === open.app._studentId) ?? null : null} scheme={open ? schemes.find(s => s.id === open.app.schemeId) : undefined} decide={decide} onClose={() => setOpen(null)} />
    </div>
  );
}

function VerifyModal({ row, scheme, decide, onClose }: { row: Row | null; scheme?: Scheme; decide: Decide; onClose: () => void }) {
  const files = useFiles(row ? `student:scholarship/${row.app.id}` : null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(status: DecisionStatus, needsNote: boolean, msg: string) {
    if (!row) return;
    if (needsNote && !note.trim()) { toast.error('Write what the student must correct, or why it is rejected'); return; }
    setBusy(true);
    try {
      await decide(row, status, note.trim() ? { note: note.trim() } : {});
      toast.success(msg);
      setNote('');
      onClose();
    } catch { /* toast shown */ } finally { setBusy(false); }
  }

  const pending = row?.status === 'submitted';
  return (
    <Modal open={!!row} onClose={onClose} title={row ? `${row.app._student?.name ?? ''} — ${row.app.schemeName}` : ''} width="640px"
      footer={pending ? <>
        <Button variant="destructive" size="sm" loading={busy} onClick={() => void act('rejected', true, 'Application rejected — the student has been told')}>Reject</Button>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => void act('returned', true, 'Returned to the student for correction')}>Return for correction</Button>
        <Button size="sm" loading={busy} disabled={files.files.length === 0} onClick={() => void act('verified', false, 'Verified')}>Verify</Button>
      </> : <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>}>
      {row && (
        <div className="space-y-4 text-[13px]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ['Application', row.app.id], ['Status', STATUS_TEXT[row.status]],
              ['Enrolment no.', row.app._student?.enrolmentNo ?? '—'], ['Category', row.app.category],
              ['Declared income', inr(row.app.familyIncome)], ['Amount', inr(row.app.amount)],
              ['Bank', `${row.app.bankName} · ••••${row.app.accountLast4}`], ['IFSC', row.app.ifsc],
            ].map(([l, v]) => <div key={l}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[#16264A]">{v}</p></div>)}
          </div>
          {scheme?.rules.incomeCap != null && row.app.familyIncome >= scheme.rules.incomeCap && <InlineAlert type="warning">Declared income is above this scheme's ceiling of {inr(scheme.rules.incomeCap)}.</InlineAlert>}
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Documents {scheme && <span className="normal-case font-normal">· required: {scheme.docs.join(', ')}</span>}</p>
            {files.isLoading ? <Spinner /> : files.files.length === 0 ? <p className="text-[#A8242C]">The student has not uploaded any documents yet.</p> : (
              <div className="border border-[#D3D8E0] rounded-[4px] divide-y divide-[#EDEFF3]">
                {files.files.map(f => (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2"><span className="flex-1 truncate text-[#16264A]">{f.name}</span><span className="text-[#5A6577] text-[12px]">{formatBytes(f.size)}</span><button onClick={() => void files.download(f)} className="text-[#E0952A] hover:underline cursor-pointer text-[12px]">Open</button></div>
                ))}
              </div>
            )}
          </div>
          {row.decision?.history?.length ? (
            <div>
              <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">History</p>
              <ul className="space-y-1">{row.decision.history.map((h, i) => <li key={i} className="text-[12px] text-[#16264A]">{fmtDate(h.at)} · {h.status} · {h.by}{h.note ? <span className="text-[#5A6577]"> — {h.note}</span> : null}</li>)}</ul>
            </div>
          ) : null}
          {pending && <Input label="Note to the student (required to return or reject)" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Income certificate is older than one year — upload the current one" />}
        </div>
      )}
    </Modal>
  );
}

// ─── Forward to portal ───────────────────────────────────────────────────────

function DispatchTab({ rows, decide }: { rows: Row[]; decide: Decide }) {
  const ready = rows.filter(r => r.status === 'verified');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = ready.filter(r => picked.has(r.app.id));

  async function forward() {
    if (!ref.trim()) { toast.error('Enter the batch or acknowledgement number the portal gave you'); return; }
    setBusy(true);
    let done = 0;
    for (const r of chosen) {
      try { await decide(r, 'dispatched', { portalRef: ref.trim(), note: `Portal batch ${ref.trim()}` }); done++; } catch { break; }
    }
    setBusy(false);
    if (done) toast.success(`${done} application(s) marked as forwarded`);
    setPicked(new Set()); setRef('');
  }

  return (
    <div className="space-y-4">
      <InlineAlert type="info">Download the verified applications, upload them on the scheme's portal, then record the batch number the portal gives you here. Students see the update at once.</InlineAlert>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[14px] font-semibold text-[#16264A] flex-1">{ready.length} verified, ready to forward</p>
          <Button size="sm" variant="secondary" disabled={!ready.length} onClick={() => downloadCSV('scholarship-portal-upload', ready.map(r => ({ application: r.app.id, student: r.app._student?.name ?? '', enrolmentNo: r.app._student?.enrolmentNo ?? '', scheme: r.app.schemeName, category: r.app.category, familyIncome: r.app.familyIncome, bank: r.app.bankName, ifsc: r.app.ifsc, accountLast4: r.app.accountLast4, amount: r.app.amount })))}>Download for portal (CSV)</Button>
        </div>
        {ready.length === 0 ? <div className="p-6"><EmptyState title="Nothing waiting to be forwarded" /></div> : (
          <>
            <div className="divide-y divide-[#EDEFF3]">
              {ready.map(r => (
                <label key={r.app._rid ?? r.app.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#F7F8FA]">
                  <input type="checkbox" checked={picked.has(r.app.id)} onChange={e => { const n = new Set(picked); e.target.checked ? n.add(r.app.id) : n.delete(r.app.id); setPicked(n); }} />
                  <span className="flex-1 text-[13px] text-[#16264A]">{r.app._student?.name} <span className="text-[#5A6577]">· {r.app.schemeName} · {inr(r.app.amount)}</span></span>
                  <span className="font-mono text-[11px] text-[#5A6577]">{r.app.id}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-t border-[#D3D8E0]">
              <button onClick={() => setPicked(new Set(picked.size === ready.length ? [] : ready.map(r => r.app.id)))} className="text-[12px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{picked.size === ready.length ? 'Clear' : 'Select all'}</button>
              <Input label="Portal batch / acknowledgement no." value={ref} onChange={e => setRef(e.target.value)} className="flex-1 min-w-[220px]" />
              <Button loading={busy} disabled={!chosen.length} onClick={() => void forward()}>Mark {chosen.length || ''} as forwarded</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sanction & disbursement ─────────────────────────────────────────────────

function DisbursementTab({ rows, decide }: { rows: Row[]; decide: Decide }) {
  const live = rows.filter(r => ['dispatched', 'sanctioned', 'failed', 'disbursed'].includes(r.status));
  const [acting, setActing] = useState<{ row: Row; kind: 'sanctioned' | 'disbursed' | 'failed' } | null>(null);
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  function start(row: Row, kind: 'sanctioned' | 'disbursed' | 'failed') {
    setActing({ row, kind });
    setAmount(String(row.decision?.amountSanctioned ?? row.app.amount));
    setUtr(''); setNote(''); setDate(new Date().toISOString().slice(0, 10));
  }

  async function save() {
    if (!acting) return;
    const { row, kind } = acting;
    const amt = Number(amount);
    try {
      if (kind === 'sanctioned') {
        if (!(amt > 0)) { toast.error('Enter the sanctioned amount'); return; }
        await decide(row, 'sanctioned', { amountSanctioned: amt, note: `Sanctioned ${inr(amt)}` });
      } else if (kind === 'disbursed') {
        if (!utr.trim()) { toast.error('Enter the bank UTR / transaction reference'); return; }
        await decide(row, 'disbursed', { utr: utr.trim(), disbursedOn: date, amountSanctioned: amt > 0 ? amt : row.app.amount, note: `UTR ${utr.trim()}` });
      } else {
        if (!note.trim()) { toast.error('Write why the payment failed'); return; }
        await decide(row, 'failed', { note: note.trim() });
      }
      toast.success('Saved — the student can see it');
      setActing(null);
    } catch { /* toast shown */ }
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#16264A]">Forwarded applications</p>
        <Button size="sm" variant="secondary" disabled={!live.length} onClick={() => downloadCSV('scholarship-disbursement', live.map(r => ({ application: r.app.id, student: r.app._student?.name ?? '', scheme: r.app.schemeName, status: r.status, portalRef: r.decision?.portalRef ?? '', sanctioned: r.decision?.amountSanctioned ?? '', utr: r.decision?.utr ?? '', disbursedOn: r.decision?.disbursedOn ?? '' })))}>Export CSV</Button>
      </div>
      {live.length === 0 ? <div className="p-6"><EmptyState title="No forwarded applications yet" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[780px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Student', 'Scheme', 'Portal ref', 'Amount', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {live.map(r => (
                <tr key={r.app._rid ?? r.app.id} className="border-b border-[#EDEFF3]">
                  <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{r.app._student?.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.app.id}</p></td>
                  <td className="px-4 py-3 text-[#16264A]">{r.app.schemeName}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{r.decision?.portalRef ?? '—'}</td>
                  <td className="px-4 py-3 text-[#16264A]">{inr(r.decision?.amountSanctioned ?? r.app.amount)}{r.decision?.utr && <p className="text-[11px] text-[#0E7A5F]">UTR {r.decision.utr} · {fmtDate(r.decision.disbursedOn)}</p>}</td>
                  <td className="px-4 py-3"><StatusChip s={r.status} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    {r.status === 'dispatched' && <Button size="sm" variant="secondary" onClick={() => start(r, 'sanctioned')}>Sanctioned</Button>}
                    {(r.status === 'dispatched' || r.status === 'sanctioned' || r.status === 'failed') && <Button size="sm" onClick={() => start(r, 'disbursed')}>Record payment</Button>}
                    {(r.status === 'dispatched' || r.status === 'sanctioned') && <Button size="sm" variant="ghost" onClick={() => start(r, 'failed')}>Failed</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting ? `${acting.kind === 'sanctioned' ? 'Record sanction' : acting.kind === 'disbursed' ? 'Record payment' : 'Payment failed'} — ${acting.row.app._student?.name}` : ''}
        footer={<><Button size="sm" variant="secondary" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" onClick={() => void save()}>Save</Button></>}>
        {acting && (
          <div className="space-y-4">
            {acting.kind !== 'failed' && <Input label="Amount (₹)" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} />}
            {acting.kind === 'disbursed' && <>
              <Input label="Bank UTR / transaction reference" value={utr} onChange={e => setUtr(e.target.value)} />
              <Input label="Credited on" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} />
            </>}
            {acting.kind === 'failed' && <Input label="Reason (the student sees this)" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Account closed — update bank details with the office" />}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Scheme master ───────────────────────────────────────────────────────────

const blank = { name: '', provider: '', funding: 'State' as Scheme['funding'], amount: '', perYear: true, description: '', minCgpa: '', minAttendance: '', incomeCap: '', categories: '', docs: '', closesOn: '', portal: '' };

function SchemesTab({ schemes, rows }: { schemes: ReturnType<typeof useCollection<Scheme>>; rows: Row[] }) {
  const [editing, setEditing] = useState<Stored<Scheme> | 'new' | null>(null);
  const [f, setF] = useState(blank);

  function open(s: Stored<Scheme> | 'new') {
    setEditing(s);
    setF(s === 'new' ? blank : {
      name: s.name, provider: s.provider, funding: s.funding, amount: String(s.amount), perYear: s.perYear, description: s.description,
      minCgpa: s.rules.minCgpa?.toString() ?? '', minAttendance: s.rules.minAttendance?.toString() ?? '', incomeCap: s.rules.incomeCap?.toString() ?? '',
      categories: (s.rules.categories ?? []).join(', '), docs: s.docs.join(', '), closesOn: s.closesOn ?? '', portal: s.portal ?? '',
    });
  }

  function save() {
    const amount = Number(f.amount);
    if (!f.name.trim() || !(amount > 0)) { toast.error('A scheme needs a name and an amount'); return; }
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const doc = {
      name: f.name.trim(), provider: f.provider.trim(), funding: f.funding, amount, perYear: f.perYear, description: f.description.trim(),
      rules: { minCgpa: num(f.minCgpa), minAttendance: num(f.minAttendance), incomeCap: num(f.incomeCap), categories: f.categories.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) },
      docs: f.docs.split(',').map(s => s.trim()).filter(Boolean), closesOn: f.closesOn || undefined, portal: f.portal.trim() || undefined,
    };
    if (editing === 'new') schemes.add({ id: `SCH-${Date.now().toString(36).toUpperCase()}`, windowOpen: false, ...doc });
    else if (editing) schemes.update(editing.id, doc);
    toast.success('Scheme saved');
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => open('new')}>+ Add Scheme</Button></div>
      {schemes.items.length === 0 && <EmptyState title="No schemes yet" description="Add the central, state and institutional schemes your students can apply for." />}
      {schemes.items.map(s => {
        const n = rows.filter(r => r.app.schemeId === s.id).length;
        return (
          <div key={s.id} className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-2"><p className="text-[15px] font-semibold text-[#16264A]">{s.name}</p><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.windowOpen ? 'bg-[#D1FAE5] text-[#0E7A5F]' : 'bg-[#F1F5F9] text-[#5A6577]'}`}>{s.windowOpen ? 'Open' : 'Closed'}</span></div>
              <p className="text-[12px] text-[#5A6577]">{s.provider} · {s.funding} · {inr(s.amount)}{s.perYear ? '/yr' : ''}{s.closesOn ? ` · closes ${fmtDate(s.closesOn)}` : ''}</p>
              <p className="text-[12px] text-[#5A6577] mt-1">
                {[s.rules.minCgpa != null && `CGPA ≥ ${s.rules.minCgpa}`, s.rules.minAttendance != null && `Attendance ≥ ${s.rules.minAttendance}%`, s.rules.incomeCap != null && `Income < ${inr(s.rules.incomeCap)}`, s.rules.categories?.length && s.rules.categories.join('/')].filter(Boolean).join(' · ') || 'Open to all'}
              </p>
              <p className="text-[12px] text-[#5A6577] mt-1">{n} application{n === 1 ? '' : 's'}</p>
            </div>
            <div className="flex items-center gap-3">
              <Toggle on={s.windowOpen} onChange={v => { schemes.update(s.id, { windowOpen: v }); toast.success(v ? 'Applications opened' : 'Applications closed'); }} label="Accepting applications" />
              <Button size="sm" variant="secondary" onClick={() => open(s)}>Edit</Button>
            </div>
          </div>
        );
      })}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add Scheme' : 'Edit Scheme'} width="640px"
        footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="Scheme name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <Input label="Provider" value={f.provider} onChange={e => setF({ ...f, provider: e.target.value })} />
          <Select label="Funding" value={f.funding} onChange={e => setF({ ...f, funding: e.target.value as Scheme['funding'] })}>{['Central', 'State', 'Institution', 'Private'].map(x => <option key={x}>{x}</option>)}</Select>
          <Input label="Amount (₹) *" inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
          <div className="flex items-end pb-2"><Toggle on={f.perYear} onChange={v => setF({ ...f, perYear: v })} label="Per year (recurring)" /></div>
          <div className="col-span-2"><Input label="Description" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
          <Input label="Minimum CGPA" inputMode="decimal" value={f.minCgpa} onChange={e => setF({ ...f, minCgpa: e.target.value.replace(/[^\d.]/g, '') })} />
          <Input label="Minimum attendance %" inputMode="numeric" value={f.minAttendance} onChange={e => setF({ ...f, minAttendance: e.target.value.replace(/\D/g, '') })} />
          <Input label="Family income ceiling (₹/yr)" inputMode="numeric" value={f.incomeCap} onChange={e => setF({ ...f, incomeCap: e.target.value.replace(/\D/g, '') })} />
          <Input label="Categories (comma-separated, blank = all)" value={f.categories} onChange={e => setF({ ...f, categories: e.target.value })} placeholder="SC, ST, OBC" />
          <div className="col-span-2"><Input label="Documents required (comma-separated)" value={f.docs} onChange={e => setF({ ...f, docs: e.target.value })} /></div>
          <Input label="Applications close on" type="date" value={f.closesOn} onChange={e => setF({ ...f, closesOn: e.target.value })} />
          <Input label="Scheme portal (if forwarded)" value={f.portal} onChange={e => setF({ ...f, portal: e.target.value })} placeholder="National Scholarship Portal" />
        </div>
      </Modal>
    </div>
  );
}

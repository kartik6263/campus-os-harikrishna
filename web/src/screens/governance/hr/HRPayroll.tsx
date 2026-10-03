import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, Toggle, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { useAuth, displayName } from '../../../lib/auth';
import { downloadCSV, downloadPdf } from '../../../lib/export';
import { inst } from '../../../lib/institution';
import { useCollection, useDocument, type Stored } from '../../../lib/records';
import {
  DEFAULT_SETTINGS, blankProfile, computeLine, daysWithin, inr, monthLabel,
  type HrProfile, type PayLine, type PayrollRun, type PayrollSettings, type StaffMember, type Vacancy,
} from '../../../lib/hr';

/**
 * HR & payroll for the governance office: the staff directory (from the
 * system's own staff records, plus contract staff added here), pay and bank
 * details, leave as decided by heads of department, the monthly payroll run
 * with payslips and a bank advice, service books, and recruitment.
 */

interface LeaveRow { id: string; kind: string; fromDate: string; toDate: string; days: number; reason: string; status: string; appliedAt: string; decidedBy: string | null; decisionNote: string | null; employee: string; employeeId: string; department: string }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Sample pay for the seeded staff, used only on the demo deployment. */
const SAMPLE_PROFILES: HrProfile[] = [
  { id: 'GMC/FAC/CS/0001', payLevel: 'Level 14', basicPay: 144200, allowances: [{ name: 'Transport', amount: 7200 }], deductions: [], pf: true, status: 'active', serviceBook: [{ date: '1998-08-01', kind: 'Appointment', detail: 'Joined as Lecturer', orderNo: 'EST/1998/112' }] },
  { id: 'GMC/FAC/CS/0012', payLevel: 'Level 13A', basicPay: 131400, allowances: [{ name: 'Transport', amount: 7200 }], deductions: [{ name: 'LIC', amount: 2500 }], pf: true, status: 'active', serviceBook: [] },
  { id: 'GMC/FAC/CS/0021', payLevel: 'Level 13A', basicPay: 131400, allowances: [{ name: 'Transport', amount: 7200 }], deductions: [], pf: true, status: 'active', serviceBook: [] },
  { id: 'GMC/FAC/CS/0033', payLevel: 'Level 10', basicPay: 57700, allowances: [{ name: 'Transport', amount: 3600 }], deductions: [], pf: true, status: 'active', serviceBook: [] },
  { id: 'GMC/FAC/CS/0047', payLevel: 'Level 12', basicPay: 79800, allowances: [{ name: 'Transport', amount: 3600 }], deductions: [], pf: true, status: 'active', serviceBook: [] },
  { id: 'GMC/FAC/CS/0058', payLevel: 'Guest', basicPay: 30000, allowances: [], deductions: [], pf: false, consolidated: true, status: 'active', serviceBook: [] },
  { id: 'GMC/OFF/0001', payLevel: 'Level 6', basicPay: 35400, allowances: [{ name: 'Transport', amount: 1800 }], deductions: [], pf: true, status: 'active', serviceBook: [] },
  { id: 'GMC/OFF/0009', payLevel: 'Level 8', basicPay: 47600, allowances: [{ name: 'Transport', amount: 1800 }], deductions: [], pf: true, status: 'active', serviceBook: [] },
];

export default function HRPayroll() {
  const [tab, setTab] = useState('staff');
  const staffQ = useQuery({ queryKey: ['hr', 'staff'], queryFn: () => api<StaffMember[]>('/api/governance/hr/staff') });
  const leavesQ = useQuery({ queryKey: ['hr', 'leaves'], queryFn: () => api<LeaveRow[]>('/api/governance/hr/leaves') });
  const profiles = useCollection<HrProfile>('gov:hr-profiles', SAMPLE_PROFILES);

  // The system's staff, plus contract staff HR entered by hand.
  const people: StaffMember[] = useMemo(() => {
    const sys = staffQ.data ?? [];
    const manual = profiles.items.filter(p => p.manual && !sys.some(s => s.employeeId === p.id)).map(p => ({
      id: p.id, employeeId: p.id, name: p.manual!.name, designation: p.manual!.designation, department: p.manual!.department,
      type: 'contractual' as const, mobile: null, email: '', active: p.status === 'active', joinedOn: p.manual!.joinedOn, college: '', isHod: false,
    }));
    return [...sys, ...manual];
  }, [staffQ.data, profiles.items]);
  const profileOf = (employeeId: string) => profiles.items.find(p => p.id === employeeId);
  const pending = (leavesQ.data ?? []).filter(l => l.status === 'PENDING').length;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">HR & Payroll</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Staff, leave, monthly payroll, service books and recruitment</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Staff', people.length], ['Teaching', people.filter(p => p.type === 'teaching').length], ['Pay not set', people.filter(p => !(profileOf(p.employeeId)?.basicPay)).length], ['Leave pending', pending]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'staff', label: 'Staff & Pay' }, { id: 'leave', label: 'Leave' }, { id: 'payroll', label: 'Payroll' }, { id: 'service', label: 'Service Book' }, { id: 'recruitment', label: 'Recruitment' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {staffQ.isError && <InlineAlert type="error">{errText(staffQ.error)}</InlineAlert>}
        {staffQ.isLoading || profiles.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'staff' && <StaffTab people={people} profiles={profiles} />}
            {tab === 'leave' && <LeaveTab q={leavesQ} />}
            {tab === 'payroll' && <PayrollTab people={people} profiles={profiles.items} leaves={leavesQ.data ?? []} />}
            {tab === 'service' && <ServiceTab people={people} profiles={profiles} />}
            {tab === 'recruitment' && <RecruitmentTab />}
          </>
        )}
      </div>
    </div>
  );
}

type Profiles = ReturnType<typeof useCollection<HrProfile>>;

// ─── Staff & pay ─────────────────────────────────────────────────────────────

function StaffTab({ people, profiles }: { people: StaffMember[]; profiles: Profiles }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [adding, setAdding] = useState(false);
  const s = search.trim().toLowerCase();
  const rows = people.filter(p => (!type || p.type === type) && (!s || [p.name, p.employeeId, p.designation, p.department].some(x => x.toLowerCase().includes(s))));
  const profileOf = (id: string) => profiles.items.find(p => p.id === id);

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Input placeholder="Search name, employee id, designation" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[220px]" />
        <Select value={type} onChange={e => setType(e.target.value)} className="w-44"><option value="">All staff</option><option value="teaching">Teaching</option><option value="non_teaching">Non-teaching</option><option value="contractual">Contract</option></Select>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('staff-directory', rows.map(p => { const pr = profileOf(p.employeeId); return { employeeId: p.employeeId, name: p.name, designation: p.designation, department: p.department, type: p.type, college: p.college, joined: p.joinedOn.slice(0, 10), email: p.email, mobile: p.mobile ?? '', payLevel: pr?.payLevel ?? '', basicPay: pr?.basicPay ?? '', status: pr?.status ?? (p.active ? 'active' : 'inactive') }; }))}>Export CSV</Button>
        <Button size="sm" onClick={() => setAdding(true)}>+ Contract staff</Button>
      </div>
      <p className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3]">Teachers and office staff appear here as soon as the IT Cell gives them an account. Add contract staff without accounts by hand.</p>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No staff match" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Employee', 'Designation', 'Department', 'Joined', 'Pay', 'Bank', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(p => {
                const pr = profileOf(p.employeeId);
                return (
                  <tr key={p.employeeId} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA]">
                    <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{p.name}{p.isHod && <span className="ml-1 text-[10px] font-semibold text-[#8A6D1F]">HOD</span>}</p><p className="font-mono text-[11px] text-[#5A6577]">{p.employeeId}</p></td>
                    <td className="px-4 py-3 text-[#5A6577]">{p.designation}<p className="text-[11px]">{p.type === 'teaching' ? 'Teaching' : p.type === 'non_teaching' ? 'Non-teaching' : 'Contract'}</p></td>
                    <td className="px-4 py-3 text-[#5A6577]">{p.department}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{day(p.joinedOn)}</td>
                    <td className="px-4 py-3">{pr?.basicPay ? <span className="text-[#16264A]">{inr(pr.basicPay)}<span className="text-[11px] text-[#5A6577]"> {pr.consolidated ? 'consolidated' : `basic · ${pr.payLevel ?? ''}`}</span></span> : <span className="text-[12px] font-semibold text-[#9A5B00]">Not set</span>}</td>
                    <td className="px-4 py-3 text-[12px] text-[#5A6577]">{pr?.accountLast4 ? `${pr.bankName ?? ''} ••${pr.accountLast4}` : '—'}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit pay</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PayEditor person={editing} profile={editing ? profileOf(editing.employeeId) : undefined} onClose={() => setEditing(null)}
        onSave={pr => { if (profileOf(pr.id)) profiles.update(pr.id, pr); else profiles.add(pr); toast.success('Pay details saved'); setEditing(null); }} />
      <AddContract open={adding} onClose={() => setAdding(false)} existing={people.map(p => p.employeeId)} onAdd={pr => { profiles.add(pr); toast.success(`${pr.manual!.name} added`); setAdding(false); }} />
    </div>
  );
}

function PayEditor({ person, profile, onClose, onSave }: { person: StaffMember | null; profile?: HrProfile; onClose: () => void; onSave: (p: HrProfile) => void }) {
  const [p, setP] = useState<HrProfile | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [account, setAccount] = useState('');
  if (person && opened !== person.employeeId) { setOpened(person.employeeId); setP(profile ? { ...profile } : blankProfile(person.employeeId)); setAccount(''); }
  if (!person && opened) { setOpened(null); }

  function save() {
    if (!p) return;
    if (!(p.basicPay > 0)) { toast.error('Enter the basic (or consolidated) pay'); return; }
    if (p.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.ifsc)) { toast.error('Not a valid IFSC'); return; }
    onSave({ ...p, ...(account ? { accountLast4: account.slice(-4) } : {}) });
  }
  const list = (k: 'allowances' | 'deductions', label: string) => p && (
    <div>
      <p className="text-[12px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">{label}</p>
      {p[k].map((a, i) => (
        <div key={i} className="flex gap-2 mb-2">
          <Input value={a.name} onChange={e => setP({ ...p, [k]: p[k].map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="flex-1" />
          <Input inputMode="numeric" value={String(a.amount)} onChange={e => setP({ ...p, [k]: p[k].map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/\D/g, '')) } : x)) })} className="w-32" />
          <button onClick={() => setP({ ...p, [k]: p[k].filter((_, j) => j !== i) })} className="text-[12px] text-[#A8242C] cursor-pointer">Remove</button>
        </div>
      ))}
      <button onClick={() => setP({ ...p, [k]: [...p[k], { name: '', amount: 0 }] })} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">+ Add</button>
    </div>
  );

  return (
    <Modal open={!!person} onClose={onClose} title={person ? `Pay — ${person.name}` : ''} width="620px" footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
      {p && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Pay level" value={p.payLevel ?? ''} onChange={e => setP({ ...p, payLevel: e.target.value })} placeholder="Level 10" />
            <Input label={p.consolidated ? 'Consolidated pay (₹)' : 'Basic pay (₹)'} inputMode="numeric" value={p.basicPay ? String(p.basicPay) : ''} onChange={e => setP({ ...p, basicPay: Number(e.target.value.replace(/\D/g, '')) })} />
            <Select label="Status" value={p.status} onChange={e => setP({ ...p, status: e.target.value as HrProfile['status'] })}>{['active', 'on_leave', 'retired', 'relieved'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
          </div>
          <div className="flex gap-6">
            <Toggle on={!!p.consolidated} onChange={v => setP({ ...p, consolidated: v, pf: v ? false : p.pf })} label="Consolidated (no DA/HRA)" />
            <Toggle on={p.pf} onChange={v => setP({ ...p, pf: v })} label="Provident fund" />
          </div>
          {list('allowances', 'Other monthly allowances')}
          {list('deductions', 'Other monthly deductions')}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Bank" value={p.bankName ?? ''} onChange={e => setP({ ...p, bankName: e.target.value })} />
            <Input label="IFSC" value={p.ifsc ?? ''} onChange={e => setP({ ...p, ifsc: e.target.value.toUpperCase().slice(0, 11) })} />
            <Input label={`Account number${p.accountLast4 ? ` (on file: ••${p.accountLast4})` : ''}`} inputMode="numeric" value={account} onChange={e => setAccount(e.target.value.replace(/\D/g, '').slice(0, 18))} hint="Only the last 4 digits are kept" />
            <Input label="PAN (last 4)" value={p.panLast4 ?? ''} onChange={e => setP({ ...p, panLast4: e.target.value.toUpperCase().slice(-4) })} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function AddContract({ open, onClose, onAdd, existing }: { open: boolean; onClose: () => void; onAdd: (p: HrProfile) => void; existing: string[] }) {
  const [f, setF] = useState({ id: '', name: '', designation: '', department: '', joinedOn: new Date().toISOString().slice(0, 10), pay: '' });
  function add() {
    if (!f.id.trim() || !f.name.trim() || !f.designation.trim() || !(Number(f.pay) > 0)) { toast.error('Employee id, name, designation and pay are required'); return; }
    if (existing.includes(f.id.trim())) { toast.error('That employee id is already in use'); return; }
    onAdd({ ...blankProfile(f.id.trim()), manual: { name: f.name.trim(), designation: f.designation.trim(), department: f.department.trim() || 'General', joinedOn: f.joinedOn }, basicPay: Number(f.pay), consolidated: true, pf: false });
    setF({ id: '', name: '', designation: '', department: '', joinedOn: new Date().toISOString().slice(0, 10), pay: '' });
  }
  return (
    <Modal open={open} onClose={onClose} title="Add contract staff" footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" onClick={add}>Add</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Employee id" value={f.id} onChange={e => setF({ ...f, id: e.target.value })} placeholder="CON/2026/001" />
        <Input label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <Input label="Designation" value={f.designation} onChange={e => setF({ ...f, designation: e.target.value })} />
        <Input label="Department" value={f.department} onChange={e => setF({ ...f, department: e.target.value })} />
        <Input label="Joined on" type="date" value={f.joinedOn} onChange={e => setF({ ...f, joinedOn: e.target.value })} />
        <Input label="Consolidated monthly pay (₹)" inputMode="numeric" value={f.pay} onChange={e => setF({ ...f, pay: e.target.value.replace(/\D/g, '') })} />
      </div>
    </Modal>
  );
}

// ─── Leave ───────────────────────────────────────────────────────────────────

function LeaveTab({ q }: { q: ReturnType<typeof useQuery<LeaveRow[]>> }) {
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const rows = (q.data ?? []).filter(l => (!status || l.status === status) && (!kind || l.kind === kind));
  const byPerson = [...(q.data ?? []).filter(l => l.status === 'APPROVED').reduce((m, l) => m.set(l.employee, (m.get(l.employee) ?? 0) + l.days), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  return (
    <div className="grid lg:grid-cols-4 gap-4">
      <div className="lg:col-span-3 bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[13px] text-[#5A6577] flex-1">Teachers apply in their workspace and their head of department decides. Unpaid leave flows into payroll as loss of pay.</p>
          <Select value={kind} onChange={e => setKind(e.target.value)} className="w-36"><option value="">All kinds</option>{['CASUAL', 'MEDICAL', 'EARNED', 'STUDY', 'DUTY', 'MATERNITY', 'UNPAID'].map(k => <option key={k} value={k}>{k[0] + k.slice(1).toLowerCase()}</option>)}</Select>
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-36"><option value="">Any status</option>{['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map(k => <option key={k} value={k}>{k[0] + k.slice(1).toLowerCase()}</option>)}</Select>
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('staff-leave', rows.map(l => ({ employee: l.employee, employeeId: l.employeeId, department: l.department, kind: l.kind, from: l.fromDate.slice(0, 10), to: l.toDate.slice(0, 10), days: l.days, status: l.status, decidedBy: l.decidedBy ?? '', reason: l.reason })))}>Export CSV</Button>
        </div>
        {rows.length === 0 ? <div className="p-6"><EmptyState title="No leave applications" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[720px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Employee', 'Kind', 'Dates', 'Days', 'Status', 'Decided by'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>{rows.map(l => (
                <tr key={l.id} className="border-b border-[#EDEFF3]">
                  <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{l.employee}</p><p className="text-[11px] text-[#5A6577]">{l.department}</p></td>
                  <td className="px-4 py-3 text-[#5A6577]">{l.kind[0] + l.kind.slice(1).toLowerCase()}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{day(l.fromDate)} – {day(l.toDate)}</td>
                  <td className="px-4 py-3 tabular-nums">{l.days}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${l.status === 'APPROVED' ? 'bg-[#D1FAE5] text-[#0E7A5F]' : l.status === 'PENDING' ? 'bg-[#FEF9EC] text-[#8A6D1F]' : 'bg-[#F1F5F9] text-[#5A6577]'}`}>{l.status[0] + l.status.slice(1).toLowerCase()}</span></td>
                  <td className="px-4 py-3 text-[12px] text-[#5A6577]">{l.decidedBy ?? '—'}{l.decisionNote ? ` · ${l.decisionNote}` : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
        <p className="text-[14px] font-semibold text-[#16264A] mb-3">Most leave taken (approved days)</p>
        {byPerson.length === 0 ? <p className="text-[13px] text-[#5A6577]">None.</p> : byPerson.map(([n, d]) => <div key={n} className="flex justify-between text-[13px] py-1"><span className="text-[#16264A] truncate">{n}</span><span className="tabular-nums text-[#5A6577]">{d}</span></div>)}
      </div>
    </div>
  );
}

// ─── Payroll ─────────────────────────────────────────────────────────────────

function PayrollTab({ people, profiles, leaves }: { people: StaffMember[]; profiles: HrProfile[]; leaves: LeaveRow[] }) {
  const { user } = useAuth();
  const settings = useDocument<PayrollSettings>('gov:payroll-settings', DEFAULT_SETTINGS, DEFAULT_SETTINGS);
  const runs = useCollection<PayrollRun>('gov:payroll-runs', []);
  const [month, setMonth] = useState(thisMonth());
  const [editSettings, setEditSettings] = useState<PayrollSettings | null>(null);
  const run = runs.items.find(r => r.month === month);
  const s = settings.value;

  const payable = people.filter(p => { const pr = profiles.find(x => x.id === p.employeeId); return pr && pr.basicPay > 0 && pr.status !== 'retired' && pr.status !== 'relieved'; });
  const missing = people.length - payable.length;

  function generate() {
    const lines = payable.map(p => {
      const pr = profiles.find(x => x.id === p.employeeId)!;
      const lop = leaves.filter(l => l.employeeId === p.employeeId && l.kind === 'UNPAID' && l.status === 'APPROVED').reduce((n, l) => n + daysWithin(l.fromDate, l.toDate, month), 0);
      const previousTds = run?.lines.find(x => x.employeeId === p.employeeId)?.tds ?? 0;
      return computeLine({ employeeId: p.employeeId, name: p.name, designation: p.designation, department: p.department }, pr, s, month, lop, previousTds);
    });
    const doc: PayrollRun = { id: `PR-${month}`, month, status: 'draft', createdAt: new Date().toISOString(), settings: { ...s }, lines };
    if (run) runs.update(run.id, doc); else runs.add(doc);
    toast.success(`Draft payroll for ${monthLabel(month)}: ${lines.length} staff`);
  }

  function setTds(employeeId: string, tds: number) {
    if (!run) return;
    const lines = run.lines.map(l => {
      if (l.employeeId !== employeeId) return l;
      const totalDeductions = l.lop + l.pf + l.pt + tds + l.otherDeductions;
      return { ...l, tds, totalDeductions, net: Math.max(0, l.gross - totalDeductions) };
    });
    runs.update(run.id, { lines });
  }

  function finalise() {
    if (!run) return;
    if (!window.confirm(`Finalise ${monthLabel(month)} payroll for ${run.lines.length} staff, net ${inr(run.lines.reduce((n, l) => n + l.net, 0))}? It cannot be changed afterwards.`)) return;
    runs.update(run.id, { status: 'final', finalisedAt: new Date().toISOString(), finalisedBy: displayName(user) });
    toast.success('Payroll finalised');
  }

  async function payslip(l: PayLine) {
    await downloadPdf({
      title: 'Salary Slip', subtitle: `${inst().name} · ${monthLabel(month)}`, reference: `${run!.id}/${l.employeeId}`,
      fileName: `payslip-${l.employeeId.replace(/\//g, '-')}-${month}`,
      sections: [
        { fields: [['Employee', l.name], ['Employee id', l.employeeId], ['Designation', l.designation], ['Department', l.department], ['Bank', l.accountLast4 ? `${l.bank ?? ''} ••${l.accountLast4} (${l.ifsc ?? ''})` : '—'], ['Loss-of-pay days', l.lopDays]] },
        { heading: 'Earnings', table: { head: ['Head', 'Amount (Rs.)'], body: [['Basic', l.basic], ['Dearness allowance', l.da], ['House rent allowance', l.hra], ['Other allowances', l.allowances], ['Gross', l.gross]] } },
        { heading: 'Deductions', table: { head: ['Head', 'Amount (Rs.)'], body: [['Loss of pay', l.lop], ['Provident fund', l.pf], ['Professional tax', l.pt], ['Income tax (TDS)', l.tds], ['Other', l.otherDeductions], ['Total deductions', l.totalDeductions]] } },
        { fields: [['Net pay', `Rs. ${l.net.toLocaleString('en-IN')}`]] },
        { text: ['This is a computer-generated salary slip.'] },
      ],
      signatory: 'Drawing & Disbursing Officer',
    });
  }

  const totals = run ? run.lines.reduce((t, l) => ({ gross: t.gross + l.gross, ded: t.ded + l.totalDeductions, net: t.net + l.net }), { gross: 0, ded: 0, net: 0 }) : null;
  const locked = run?.status === 'final';

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Input label="Month" type="month" value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} />
        <div className="text-[12px] text-[#5A6577] flex-1">Rates: DA {s.daPercent}% · HRA {s.hraPercent}% · PF {s.pfPercent}% · Professional tax {inr(s.professionalTax)} <button onClick={() => setEditSettings({ ...s })} className="ml-2 text-[#E0952A] hover:underline cursor-pointer">Change</button></div>
        {!locked && <Button onClick={generate} disabled={!payable.length}>{run ? 'Recalculate draft' : 'Generate draft'}</Button>}
        {run && !locked && <Button variant="secondary" onClick={finalise}>Finalise</Button>}
      </div>
      {missing > 0 && <InlineAlert type="warning">{missing} staff member(s) have no pay set and are left out. Set it under Staff & Pay.</InlineAlert>}
      {!run ? <EmptyState title={`No payroll for ${monthLabel(month)} yet`} description="Generate a draft, check it, enter TDS, then finalise." /> : (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
            <p className="text-[14px] font-semibold text-[#16264A] flex-1">{monthLabel(month)} · {locked ? `Finalised ${day(run.finalisedAt)}${run.finalisedBy ? ` by ${run.finalisedBy}` : ''}` : 'Draft'}</p>
            <span className="text-[13px] text-[#5A6577]">Gross {inr(totals!.gross)} · Deductions {inr(totals!.ded)} · <b className="text-[#16264A]">Net {inr(totals!.net)}</b></span>
            <Button size="sm" variant="secondary" onClick={() => downloadCSV(`payroll-register-${month}`, run.lines.map(l => ({ employeeId: l.employeeId, name: l.name, basic: l.basic, da: l.da, hra: l.hra, allowances: l.allowances, gross: l.gross, lopDays: l.lopDays, lop: l.lop, pf: l.pf, pt: l.pt, tds: l.tds, other: l.otherDeductions, net: l.net })))}>Register CSV</Button>
            <Button size="sm" variant="secondary" disabled={!locked} onClick={() => downloadCSV(`bank-advice-${month}`, run.lines.map(l => ({ employeeId: l.employeeId, name: l.name, bank: l.bank ?? '', ifsc: l.ifsc ?? '', accountLast4: l.accountLast4 ?? '', amount: l.net })))}>Bank advice CSV</Button>
          </div>
          {!locked && <p className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3]">Enter each person's TDS for the month, then finalise. Payslips and the bank advice are available once finalised.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[980px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Employee', 'Basic', 'DA', 'HRA', 'Allow.', 'Gross', 'LOP', 'PF', 'PT', 'TDS', 'Other', 'Net', ''].map(h => <th key={h} className="text-right first:text-left px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>{run.lines.map(l => (
                <tr key={l.employeeId} className="border-b border-[#EDEFF3] text-right tabular-nums">
                  <td className="px-3 py-2 text-left"><p className="text-[#16264A] font-medium">{l.name}</p><p className="text-[11px] text-[#5A6577]">{l.designation}</p></td>
                  <td className="px-3 py-2">{l.basic.toLocaleString('en-IN')}</td><td className="px-3 py-2">{l.da.toLocaleString('en-IN')}</td><td className="px-3 py-2">{l.hra.toLocaleString('en-IN')}</td><td className="px-3 py-2">{l.allowances.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 font-medium">{l.gross.toLocaleString('en-IN')}</td>
                  <td className={`px-3 py-2 ${l.lop ? 'text-[#A8242C]' : ''}`}>{l.lop ? `${l.lop.toLocaleString('en-IN')} (${l.lopDays}d)` : '0'}</td>
                  <td className="px-3 py-2">{l.pf.toLocaleString('en-IN')}</td><td className="px-3 py-2">{l.pt}</td>
                  <td className="px-3 py-2">{locked ? l.tds.toLocaleString('en-IN') : <input aria-label={`TDS for ${l.name}`} inputMode="numeric" defaultValue={l.tds || ''} onBlur={e => setTds(l.employeeId, Number(e.target.value.replace(/\D/g, '')) || 0)} className="w-20 text-right border border-[#D3D8E0] rounded-[3px] px-1 py-0.5" />}</td>
                  <td className="px-3 py-2">{l.otherDeductions.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 font-semibold text-[#16264A]">{l.net.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{locked && <button onClick={() => void payslip(l)} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">Payslip</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      <Modal open={!!editSettings} onClose={() => setEditSettings(null)} title="Payroll rates" footer={<><Button size="sm" variant="secondary" onClick={() => setEditSettings(null)}>Cancel</Button><Button size="sm" onClick={() => { settings.set(editSettings!); setEditSettings(null); toast.success('Rates saved — recalculate any draft to apply them'); }}>Save</Button></>}>
        {editSettings && (
          <div className="grid grid-cols-2 gap-3">
            {([['daPercent', 'DA % of basic'], ['hraPercent', 'HRA % of basic'], ['pfPercent', 'PF % of basic + DA'], ['professionalTax', 'Professional tax (₹/month)']] as const).map(([k, l]) => (
              <Input key={k} label={l} inputMode="decimal" value={String(editSettings[k])} onChange={e => setEditSettings({ ...editSettings, [k]: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} />
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Service book ────────────────────────────────────────────────────────────

function ServiceTab({ people, profiles }: { people: StaffMember[]; profiles: Profiles }) {
  const [chosen, setChosen] = useState('');
  const [entry, setEntry] = useState({ date: new Date().toISOString().slice(0, 10), kind: 'Increment', detail: '', orderNo: '' });
  const person = people.find(p => p.employeeId === chosen);
  const pr = profiles.items.find(p => p.id === chosen);
  const book = [...(pr?.serviceBook ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  function add() {
    if (!person || !entry.detail.trim()) { toast.error('Describe the entry'); return; }
    const e = { date: entry.date, kind: entry.kind, detail: entry.detail.trim(), orderNo: entry.orderNo.trim() || undefined };
    if (pr) profiles.update(pr.id, { serviceBook: [...pr.serviceBook, e] });
    else profiles.add({ ...blankProfile(person.employeeId), serviceBook: [e] });
    setEntry({ ...entry, detail: '', orderNo: '' });
    toast.success('Service book entry added');
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 space-y-3">
        <Select label="Employee" value={chosen} onChange={e => setChosen(e.target.value)}><option value="">Choose…</option>{people.map(p => <option key={p.employeeId} value={p.employeeId}>{p.name} — {p.employeeId}</option>)}</Select>
        {person && <>
          <Input label="Date" type="date" value={entry.date} onChange={e => setEntry({ ...entry, date: e.target.value })} />
          <Select label="Kind" value={entry.kind} onChange={e => setEntry({ ...entry, kind: e.target.value })}>{['Appointment', 'Confirmation', 'Increment', 'Promotion', 'Transfer', 'Training', 'Award', 'Disciplinary', 'Leave', 'Retirement'].map(k => <option key={k}>{k}</option>)}</Select>
          <Input label="Detail" value={entry.detail} onChange={e => setEntry({ ...entry, detail: e.target.value })} />
          <Input label="Order no." value={entry.orderNo} onChange={e => setEntry({ ...entry, orderNo: e.target.value })} />
          <Button onClick={add}>Add entry</Button>
        </>}
      </div>
      <div className="lg:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[14px] font-semibold text-[#16264A]">{person ? `Service book — ${person.name}` : 'Choose an employee'}</p>
          {person && book.length > 0 && <Button size="sm" variant="secondary" onClick={() => void downloadPdf({ title: 'Service Book', subtitle: `${person.name} · ${person.employeeId}`, fileName: `service-book-${person.employeeId.replace(/\//g, '-')}`, sections: [{ fields: [['Designation', person.designation], ['Department', person.department], ['Joined', day(person.joinedOn)]] }, { table: { head: ['Date', 'Kind', 'Detail', 'Order no.'], body: [...book].reverse().map(b => [b.date, b.kind, b.detail, b.orderNo ?? '']) } }] })}>PDF</Button>}
        </div>
        {!person ? null : book.length === 0 ? <div className="p-6"><EmptyState title="No entries yet" /></div> : (
          <ol className="border-l-2 border-[#D3D8E0] ml-6 my-4 space-y-3 pr-4">
            {book.map((b, i) => <li key={i} className="pl-4"><p className="text-[13px] font-medium text-[#16264A]">{b.kind} · {day(b.date)}</p><p className="text-[13px] text-[#5A6577]">{b.detail}{b.orderNo ? ` · Order ${b.orderNo}` : ''}</p></li>)}
          </ol>
        )}
      </div>
    </div>
  );
}

// ─── Recruitment ─────────────────────────────────────────────────────────────

const VSTATUS: Vacancy['status'][] = ['draft', 'open', 'shortlisting', 'interview', 'filled', 'cancelled'];

function RecruitmentTab() {
  const vacancies = useCollection<Vacancy>('gov:vacancies', []);
  const [open, setOpen] = useState<Stored<Vacancy> | 'new' | null>(null);
  const [f, setF] = useState({ title: '', department: '', type: 'teaching' as Vacancy['type'], posts: '1', qualification: '', lastDate: '', notes: '' });

  function edit(v: Stored<Vacancy> | 'new') {
    setOpen(v);
    setF(v === 'new' ? { title: '', department: '', type: 'teaching', posts: '1', qualification: '', lastDate: '', notes: '' } : { title: v.title, department: v.department, type: v.type, posts: String(v.posts), qualification: v.qualification, lastDate: v.lastDate, notes: v.notes ?? '' });
  }
  function save() {
    if (!f.title.trim() || !f.lastDate || !(Number(f.posts) > 0)) { toast.error('Title, posts and last date are required'); return; }
    const doc = { title: f.title.trim(), department: f.department.trim(), type: f.type, posts: Number(f.posts), qualification: f.qualification.trim(), lastDate: f.lastDate, notes: f.notes.trim() || undefined };
    if (open === 'new') vacancies.add({ id: `VAC-${Date.now().toString(36).toUpperCase()}`, status: 'draft', applications: 0, createdAt: new Date().toISOString(), ...doc });
    else if (open) vacancies.update(open.id, doc);
    toast.success('Vacancy saved');
    setOpen(null);
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Vacancies</p><Button size="sm" onClick={() => edit('new')}>+ New vacancy</Button></div>
      {vacancies.items.length === 0 ? <div className="p-6"><EmptyState title="No vacancies" description="Record sanctioned posts you are recruiting for and track them to filled." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Post', 'Department', 'Posts', 'Last date', 'Applications', 'Stage', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{vacancies.items.map(v => (
              <tr key={v.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{v.title}</p><p className="text-[11px] text-[#5A6577]">{v.qualification}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{v.department}</td>
                <td className="px-4 py-3 tabular-nums">{v.posts}</td>
                <td className="px-4 py-3 text-[#5A6577]">{day(v.lastDate)}</td>
                <td className="px-4 py-3"><input aria-label={`Applications for ${v.title}`} inputMode="numeric" defaultValue={v.applications} onBlur={e => vacancies.update(v.id, { applications: Number(e.target.value.replace(/\D/g, '')) || 0 })} className="w-20 border border-[#D3D8E0] rounded-[3px] px-1 py-0.5 tabular-nums" /></td>
                <td className="px-4 py-3"><Select value={v.status} onChange={e => { vacancies.update(v.id, { status: e.target.value as Vacancy['status'] }); toast.success('Stage updated'); }} className="w-36">{VSTATUS.map(s => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}</Select></td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => edit(v)}>Edit</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open === 'new' ? 'New vacancy' : 'Edit vacancy'} footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="Post title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Assistant Professor — Computer Science" /></div>
          <Input label="Department" value={f.department} onChange={e => setF({ ...f, department: e.target.value })} />
          <Select label="Type" value={f.type} onChange={e => setF({ ...f, type: e.target.value as Vacancy['type'] })}><option value="teaching">Teaching</option><option value="non_teaching">Non-teaching</option><option value="contractual">Contract</option></Select>
          <Input label="Number of posts" inputMode="numeric" value={f.posts} onChange={e => setF({ ...f, posts: e.target.value.replace(/\D/g, '') })} />
          <Input label="Last date to apply" type="date" value={f.lastDate} onChange={e => setF({ ...f, lastDate: e.target.value })} />
          <div className="col-span-2"><Input label="Qualification" value={f.qualification} onChange={e => setF({ ...f, qualification: e.target.value })} placeholder="Master's with 55%, NET/PhD" /></div>
          <div className="col-span-2"><Input label="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

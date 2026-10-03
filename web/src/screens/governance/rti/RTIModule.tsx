import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Modal, Input, toast, ToastContainer, Spinner } from '../../../components/ui';
import { api } from '../../../lib/api';
import {
  useAssignPio,
  useDecideAppeal,
  useExemptions,
  useFileAppeal,
  useRegisterRti,
  useRejectRti,
  useReplyRti,
  useRtiList,
  useTransferRti,
  type LegacyRTIApplication as RTIApplication,
} from '../../../lib/rtiqueries';
import { useCollection, useFiles } from '../../../lib/records';
import { downloadCSV, downloadPdf } from '../../../lib/export';
import { useAuth, displayName } from '../../../lib/auth';

/**
 * Right to Information. The register is the server's: the 30-day clock, the
 * Section 8 grounds and the appeals are all computed and enforced there.
 * The §4 proactive-disclosure register is kept here, with its documents.
 */

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

const STATUS: Record<RTIApplication['status'], { label: string; color: string }> = {
  received: { label: 'Received', color: 'bg-blue-100 text-blue-800' },
  assigned: { label: 'Assigned', color: 'bg-purple-100 text-purple-800' },
  under_process: { label: 'Under process', color: 'bg-amber-100 text-amber-800' },
  replied: { label: 'Replied', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Refused (§8)', color: 'bg-red-100 text-red-800' },
  transferred: { label: 'Transferred (§6(3))', color: 'bg-gray-100 text-gray-700' },
  first_appeal: { label: 'First appeal', color: 'bg-orange-100 text-orange-800' },
  cic_appeal: { label: 'CIC appeal', color: 'bg-red-100 text-red-800' },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600' },
};

const open = (s: RTIApplication['status']) => ['received', 'assigned', 'under_process'].includes(s);

interface Officer { employeeId: string; name: string; designation: string }
const useOfficers = () => useQuery({ queryKey: ['rti', 'officers'], queryFn: () => api<{ officers: Officer[] }>('/api/rti/officers').then(r => r.officers) });

function ApplicationDetail({ app, onClose }: { app: RTIApplication; onClose: () => void }) {
  const officers = useOfficers();
  const exemptions = useExemptions();
  const assign = useAssignPio();
  const reply = useReplyRti();
  const reject = useRejectRti();
  const transfer = useTransferRti();
  const fileAppeal = useFileAppeal();
  const decide = useDecideAppeal();
  const [pio, setPio] = useState('');
  const [mode, setMode] = useState<'reply' | 'reject' | 'transfer'>('reply');
  const [text, setText] = useState(app.replyText ?? '');
  const [pages, setPages] = useState('0');
  const [grounds, setGrounds] = useState<string[]>([]);
  const [authority, setAuthority] = useState('');
  const [appealGrounds, setAppealGrounds] = useState('');
  const [decision, setDecision] = useState('');
  const pendingAppeal = app.appeals.find(a => a.outcome === 'PENDING');

  const days = 30;
  const passed = days - app.daysRemaining;
  const pct = Math.min(100, Math.max(0, (passed / days) * 100));
  const overdue = app.daysRemaining < 0;
  const urgent = !overdue && app.daysRemaining < 7;

  async function run(p: Promise<unknown>, ok: string) {
    try { await p; toast.success(ok); } catch (err) { toast.error(err instanceof Error ? err.message : 'That did not go through'); }
  }

  function replyPdf() {
    return downloadPdf({
      title: 'Reply under the Right to Information Act, 2005',
      reference: app.id,
      fileName: `RTI-reply-${app.id}`,
      sections: [
        { fields: [['Applicant', app.applicantName], ['Received on', app.receivedOn], ['Subject', app.subject], ['Public Information Officer', app.pio]] },
        { heading: 'Information sought', text: [app.particulars] },
        app.status === 'rejected'
          ? { heading: 'Decision: request refused', text: [`Exempt under ${app.rejectionGrounds.map(g => `Section ${g.clause}`).join(', ')}.`, app.rejectionReason ?? '', 'You may file a first appeal within 30 days of receiving this reply.'] }
          : { heading: 'Information supplied', text: [app.replyText ?? '', `Pages supplied: ${app.pagesSupplied ?? 0}.`, 'If you are not satisfied, you may file a first appeal within 30 days.'] },
      ],
      signatory: 'Public Information Officer',
    });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 gap-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-mono">{app.id}</p>
          <h3 className="text-base font-semibold text-[#16264A] mt-0.5">{app.subject}</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
      </div>

      <div className="bg-[#EDEFF3] rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-gray-500">Applicant</span><p className="font-medium text-[#16264A]">{app.applicantName}</p></div>
        <div><span className="text-gray-500">Category</span><p className="font-medium">{app.infoCategory}</p></div>
        <div><span className="text-gray-500">Received</span><p className="font-medium">{app.receivedOn}</p></div>
        <div><span className="text-gray-500">Fee</span><p className="font-medium">{app.bplExempt ? 'Exempt (BPL)' : app.feePaid ? 'Paid' : 'Not paid'}</p></div>
        <div><span className="text-gray-500">PIO</span><p className="font-medium">{app.pio}</p></div>
        <div><span className="text-gray-500">Status</span><p><Badge label={STATUS[app.status].label} color={STATUS[app.status].color} /></p></div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 text-sm">
        <p className="text-gray-500 mb-1">Information sought</p>
        <p className="text-[#16264A] whitespace-pre-line">{app.particulars}</p>
      </div>

      {open(app.status) && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#16264A]">30-day statutory clock (§7)</span>
            <span className={`text-sm font-bold ${overdue ? 'text-red-600' : urgent ? 'text-amber-600' : 'text-green-700'}`}>{overdue ? `${Math.abs(app.daysRemaining)} days overdue${app.deemedRefusal ? ' — deemed refusal' : ''}` : `${app.daysRemaining} days remaining`}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"><div className={`h-3 rounded-full ${overdue ? 'bg-red-500' : urgent ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${overdue ? 100 : pct}%` }} /></div>
          <div className="flex justify-between text-xs text-gray-400 mt-1"><span>Received {app.receivedOn}</span><span>Due {app.deadline}</span></div>
        </div>
      )}

      {open(app.status) && (
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-medium text-[#16264A] mb-3">Public Information Officer</p>
          <div className="flex items-end gap-3">
            <select value={pio} onChange={e => setPio(e.target.value)} className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white cursor-pointer">
              <option value="">{officers.isLoading ? 'Loading staff…' : 'Choose an officer…'}</option>
              {(officers.data ?? []).map(o => <option key={o.employeeId} value={o.employeeId}>{o.name} — {o.designation}</option>)}
            </select>
            <Button size="sm" variant="secondary" disabled={!pio} loading={assign.isPending} onClick={() => void run(assign.mutateAsync({ id: app.applicationId, pioEmployeeId: pio }), 'PIO assigned')}>{app.pio === 'Not yet assigned' ? 'Assign' : 'Reassign'}</Button>
          </div>
        </div>
      )}

      {open(app.status) && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex gap-1 mb-3">
            {([['reply', 'Supply information'], ['reject', 'Refuse (§8)'], ['transfer', 'Transfer (§6(3))']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${mode === k ? 'bg-[#16264A] text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
            ))}
          </div>
          {mode === 'reply' && (
            <>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="The information supplied, or where it is attached…" className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E0952A]" />
              <div className="flex items-end justify-between gap-3 mt-2">
                <div className="w-36"><Input label="Pages supplied" type="number" value={pages} onChange={e => setPages(e.target.value)} /></div>
                <Button size="sm" loading={reply.isPending} disabled={text.trim().length < 10} onClick={() => void run(reply.mutateAsync({ id: app.applicationId, replyText: text.trim(), pagesSupplied: Number(pages) || 0 }), 'Reply recorded and the clock stopped')}>Send reply</Button>
              </div>
            </>
          )}
          {mode === 'reject' && (
            <>
              <p className="text-xs text-gray-500 mb-2">A refusal must cite the clause of Section 8 it rests on.</p>
              <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                {(exemptions.data?.exemptions ?? []).map(e => (
                  <label key={e.clause} className="flex gap-2 text-xs cursor-pointer"><input type="checkbox" checked={grounds.includes(e.clause)} onChange={() => setGrounds(g => g.includes(e.clause) ? g.filter(x => x !== e.clause) : [...g, e.clause])} /><span><strong>{e.clause}</strong> — {e.text}</span></label>
                ))}
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Why the clause applies to this request…" className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none" />
              <div className="flex justify-end mt-2"><Button size="sm" variant="destructive" loading={reject.isPending} disabled={!grounds.length || text.trim().length < 10} onClick={() => void run(reject.mutateAsync({ id: app.applicationId, grounds, reason: text.trim() }), 'Refusal recorded with its grounds')}>Refuse request</Button></div>
            </>
          )}
          {mode === 'transfer' && (
            <>
              <p className="text-xs text-gray-500 mb-2">{app.transferWindowClosed ? 'The 5-day transfer window has closed for this application.' : 'Within 5 days of receipt, an application held by another authority may be transferred to it.'}</p>
              <Input label="Public authority that holds the information" value={authority} onChange={e => setAuthority(e.target.value)} />
              <div className="flex justify-end mt-2"><Button size="sm" variant="secondary" loading={transfer.isPending} disabled={authority.trim().length < 3 || app.transferWindowClosed} onClick={() => void run(transfer.mutateAsync({ id: app.applicationId, authority: authority.trim() }), `Transferred to ${authority.trim()}`)}>Transfer</Button></div>
            </>
          )}
        </div>
      )}

      {(app.status === 'replied' || app.status === 'rejected') && (
        <div className="border border-gray-200 rounded-lg p-4 text-sm">
          <p className="font-medium text-[#16264A] mb-1">{app.status === 'rejected' ? 'Refused' : 'Reply sent'}</p>
          <p className="text-gray-600 whitespace-pre-line">{app.status === 'rejected' ? `${app.rejectionGrounds.map(g => `§${g.clause}`).join(', ')} — ${app.rejectionReason ?? ''}` : app.replyText}</p>
          {app.answeredLate && <p className="text-xs text-red-600 mt-1">Answered after the 30-day limit.</p>}
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="secondary" onClick={() => void replyPdf()}>Download reply (PDF)</Button>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Record a first appeal received from the applicant</p>
            <textarea value={appealGrounds} onChange={e => setAppealGrounds(e.target.value)} rows={2} placeholder="Grounds stated in the appeal…" className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none" />
            <div className="flex justify-end mt-2"><Button size="sm" variant="ghost" loading={fileAppeal.isPending} disabled={appealGrounds.trim().length < 10} onClick={() => void run(fileAppeal.mutateAsync({ id: app.applicationId, tier: 'FIRST', grounds: appealGrounds.trim() }), 'First appeal registered')}>Register first appeal</Button></div>
          </div>
        </div>
      )}

      {app.deemedRefusal && open(app.status) && !pendingAppeal && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-sm">
          <p className="font-semibold text-red-800">Deemed refusal (§7(2))</p>
          <p className="text-red-700 text-xs mt-1">The 30 days have passed without a decision. The applicant may appeal; record it here if they have.</p>
          <textarea value={appealGrounds} onChange={e => setAppealGrounds(e.target.value)} rows={2} placeholder="Appeal grounds…" className="w-full mt-2 border border-red-200 rounded px-3 py-2 text-sm resize-none" />
          <div className="flex justify-end mt-2"><Button size="sm" variant="destructive" disabled={appealGrounds.trim().length < 10} loading={fileAppeal.isPending} onClick={() => void run(fileAppeal.mutateAsync({ id: app.applicationId, tier: 'FIRST', grounds: appealGrounds.trim() }), 'First appeal registered')}>Register appeal</Button></div>
        </div>
      )}

      {pendingAppeal && (
        <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
          <p className="text-sm font-semibold text-orange-800 mb-2">{pendingAppeal.tier === 'FIRST' ? 'First appeal' : 'Second appeal (CIC)'} — {pendingAppeal.appealNo}</p>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div><span className="text-gray-500">Filed</span><p className="font-medium">{new Date(pendingAppeal.filedOn).toLocaleDateString('en-IN')}</p></div>
            <div><span className="text-gray-500">Against</span><p className="font-medium">{pendingAppeal.deemedRefusal ? 'Deemed refusal' : 'The reply'}</p></div>
          </div>
          <p className="text-xs text-gray-600 mb-2">{pendingAppeal.grounds}</p>
          <textarea value={decision} onChange={e => setDecision(e.target.value)} rows={3} className="w-full border border-orange-300 rounded px-3 py-2 text-sm resize-none" placeholder="Order of the First Appellate Authority…" />
          <div className="flex justify-end gap-2 mt-2">
            {(['UPHELD', 'PARTIALLY_ALLOWED', 'ALLOWED'] as const).map(o => (
              <Button key={o} size="sm" variant={o === 'ALLOWED' ? 'primary' : 'secondary'} disabled={decision.trim().length < 10} loading={decide.isPending} onClick={() => void run(decide.mutateAsync({ id: pendingAppeal.id, outcome: o, decision: decision.trim() }), `Appeal ${o.toLowerCase().replace('_', ' ')}`)}>{o === 'UPHELD' ? 'Uphold reply' : o === 'ALLOWED' ? 'Allow appeal' : 'Partly allow'}</Button>
            ))}
          </div>
        </div>
      )}

      {app.appeals.filter(a => a.outcome !== 'PENDING').map(a => (
        <div key={a.id} className="border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
          <strong className="text-[#16264A]">{a.appealNo}</strong> ({a.tier === 'FIRST' ? 'first' : 'CIC'}) — {a.outcome.toLowerCase().replace('_', ' ')} {a.decidedOn ? `on ${new Date(a.decidedOn).toLocaleDateString('en-IN')}` : ''}{a.decision ? `: ${a.decision}` : ''}
        </div>
      ))}
    </div>
  );
}

// ─── Register application ─────────────────────────────────────────────────────

function RegisterModal({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const register = useRegisterRti();
  const [f, setF] = useState({ applicantName: '', applicantEmail: '', applicantAddress: '', subject: '', particulars: '', category: 'Academic', bplExempt: false, feePaid: true });
  const valid = f.applicantName.trim().length >= 2 && f.subject.trim().length >= 5 && f.particulars.trim().length >= 10 && (!f.applicantEmail || /\S+@\S+\.\S+/.test(f.applicantEmail));
  async function submit() {
    try {
      const r = await register.mutateAsync({ applicantName: f.applicantName.trim(), applicantEmail: f.applicantEmail.trim() || undefined, applicantAddress: f.applicantAddress.trim() || undefined, subject: f.subject.trim(), particulars: f.particulars.trim(), category: f.category, bplExempt: f.bplExempt, feePaid: f.feePaid });
      toast.success(`Registered as ${r.applicationNo} — the 30-day clock has started`);
      onClose();
      setF({ applicantName: '', applicantEmail: '', applicantAddress: '', subject: '', particulars: '', category: 'Academic', bplExempt: false, feePaid: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not register the application');
    }
  }
  return (
    <Modal open={isOpen} onClose={onClose} title="Register RTI application" width="560px"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={register.isPending} disabled={!valid} onClick={() => void submit()}>Register</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Applicant name" value={f.applicantName} onChange={e => setF({ ...f, applicantName: e.target.value })} />
          <Input label="Applicant email (optional)" value={f.applicantEmail} onChange={e => setF({ ...f, applicantEmail: e.target.value })} />
        </div>
        <Input label="Postal address (optional)" value={f.applicantAddress} onChange={e => setF({ ...f, applicantAddress: e.target.value })} />
        <Input label="Subject" value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} />
        <label className="font-medium text-[#16264A]">Information sought<textarea rows={4} value={f.particulars} onChange={e => setF({ ...f, particulars: e.target.value })} className="mt-1 w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 resize-none" /></label>
        <div className="grid grid-cols-3 gap-3 items-end">
          <label className="font-medium text-[#16264A]">Category<select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className="mt-1 w-full h-9 px-2 border border-[#D3D8E0] rounded-[4px] bg-white">{['Academic', 'Examination', 'Admission', 'Finance', 'Recruitment', 'Procurement', 'Administration', 'Other'].map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.bplExempt} onChange={e => setF({ ...f, bplExempt: e.target.checked })} /> BPL (fee exempt)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.feePaid} onChange={e => setF({ ...f, feePaid: e.target.checked })} /> ₹10 fee paid</label>
        </div>
      </div>
    </Modal>
  );
}

// ─── §4 proactive disclosure ──────────────────────────────────────────────────

const SECTION4: string[] = [
  'Organisation, functions & duties', 'Powers & duties of officers', 'Procedure followed in decision making', 'Norms set for discharge of functions',
  'Rules, regulations & instructions', 'Categories of documents held', 'Arrangement for consultation with the public', 'Boards, councils & committees',
  'Directory of officers & employees', 'Monthly remuneration of officers & employees', 'Budget allocated to each agency', 'Execution of subsidy programmes',
  'Recipients of concessions, permits or authorisations', 'Information available in electronic form', 'Facilities available to citizens for obtaining information',
  'Names & particulars of Public Information Officers', 'Such other information as may be prescribed',
];

interface Disclosure { id: string; no: number; title: string; summary: string; updated: string; updatedBy: string }
const SEED_DISCLOSURES: Disclosure[] = SECTION4.map((title, i) => ({ id: `S4-${String(i + 1).padStart(2, '0')}`, no: i + 1, title, summary: '', updated: '01-04-2024', updatedBy: 'Registrar' }));

function DisclosureCard({ d, onEdit }: { d: Disclosure; onEdit: () => void }) {
  const files = useFiles(`gov:rti-s4/${d.id}`);
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3 border border-gray-100">
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-[#E0952A] bg-amber-50 rounded px-1.5 py-0.5 shrink-0">{String(d.no).padStart(2, '0')}</span>
        <p className="text-sm font-medium text-[#16264A] leading-snug">{d.title}</p>
      </div>
      {d.summary && <p className="text-xs text-gray-600 line-clamp-3">{d.summary}</p>}
      {files.files.map(f => <button key={f.id} onClick={() => void files.download(f)} className="text-xs text-blue-600 hover:underline text-left cursor-pointer">📎 {f.name}</button>)}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-500">Updated {d.updated} · {d.updatedBy}</span>
        <div className="flex gap-3">
          <button className="text-xs text-blue-600 hover:underline cursor-pointer" onClick={() => void files.upload('.pdf,.doc,.docx,.xls,.xlsx')}>Attach</button>
          <button className="text-xs text-[#E0952A] hover:underline cursor-pointer" onClick={onEdit}>Update</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RTIModule() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('applications');
  const { data: apps, totals, isPending } = useRtiList();
  const officers = useOfficers();
  const assign = useAssignPio();
  const disclosures = useCollection<Disclosure>('gov:rti-section4', SEED_DISCLOSURES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedApp = apps.find(a => a.id === selectedId) ?? null;
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPio, setBulkPio] = useState('');
  const [editing, setEditing] = useState<Disclosure | null>(null);
  const [editSummary, setEditSummary] = useState('');

  const filtered = apps.filter(a => !filterStatus || a.status === filterStatus);
  const checked = apps.filter(a => checkedIds.has(a.id));
  const toggle = (id: string) => setCheckedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const stats = [
    { label: 'Applications', value: totals?.total ?? apps.length },
    { label: 'Open', value: totals?.open ?? apps.filter(a => open(a.status)).length },
    { label: 'Overdue', value: totals?.overdue ?? 0, danger: true },
    { label: 'Deemed refusals', value: totals?.deemedRefusals ?? 0, danger: true },
    { label: 'Under appeal', value: totals?.underAppeal ?? 0, warn: true },
    { label: 'Answered late', value: totals?.answeredLate ?? 0, warn: true },
  ];

  async function bulkAssign() {
    const targets = checked.filter(a => open(a.status));
    let ok = 0;
    for (const a of targets) {
      try { await assign.mutateAsync({ id: a.applicationId, pioEmployeeId: bulkPio }); ok++; } catch { /* reported below */ }
    }
    toast[ok === targets.length ? 'success' : 'warning'](`PIO assigned to ${ok} of ${targets.length} open application${targets.length === 1 ? '' : 's'}`);
    setBulkOpen(false);
    setCheckedIds(new Set());
  }

  const exportRows = (rows: RTIApplication[]) => downloadCSV('rti-register', rows, [
    { key: 'id', label: 'Application' }, { key: 'applicantName', label: 'Applicant' }, { key: 'subject', label: 'Subject' }, { key: 'infoCategory', label: 'Category' },
    { key: 'receivedOn', label: 'Received' }, { key: 'deadline', label: 'Due' }, { key: 'status', label: 'Status' }, { key: 'pio', label: 'PIO' },
    { key: 'daysRemaining', label: 'Days remaining' }, { key: 'deemedRefusal', label: 'Deemed refusal' }, { key: 'answeredLate', label: 'Answered late' },
  ]);

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <ToastContainer />
      <div className="bg-[#16264A] text-white px-6 py-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">RTI Management — Right to Information</h1>
          <p className="text-sm text-blue-200 mt-0.5">30-day statutory clock · Section 8 exemptions · first and second appeals · §4 proactive disclosure</p>
        </div>
        <Button size="sm" onClick={() => setRegisterOpen(true)}>+ Register application</Button>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap gap-6">
        {stats.map(s => (
          <div key={s.label} className="flex flex-col">
            <span className={`text-xl font-bold font-mono ${s.danger && s.value ? 'text-red-600' : s.warn && s.value ? 'text-amber-600' : 'text-[#16264A]'}`}>{s.value}</span>
            <span className="text-xs text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {[{ id: 'applications', label: 'Applications' }, { id: 'section4', label: 'Proactive Disclosure (§4)' }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-3 text-sm font-medium border-b-2 cursor-pointer ${activeTab === t.id ? 'border-[#E0952A] text-[#E0952A]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {activeTab === 'applications' && (
        <div className={`flex gap-4 p-5 ${selectedApp ? 'h-[calc(100vh-220px)]' : ''}`}>
          <div className={`${selectedApp ? 'w-[52%]' : 'w-full'} flex flex-col gap-3 min-w-0`}>
            <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-300 rounded px-3 py-1.5 text-sm cursor-pointer">
                <option value="">All statuses</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <div className="flex items-center gap-2 ml-auto">
                {checkedIds.size > 0 && <span className="text-sm text-gray-600">{checkedIds.size} selected</span>}
                <Button size="sm" variant="secondary" disabled={!checkedIds.size} onClick={() => setBulkOpen(true)}>Bulk assign PIO</Button>
                <Button size="sm" variant="secondary" disabled={!filtered.length} onClick={() => exportRows(checked.length ? checked : filtered)}>Export {checked.length ? 'selected' : 'all'}</Button>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-auto">
              {isPending ? <div className="flex justify-center py-10"><Spinner /></div> : (
                <table className="w-full text-sm">
                  <thead className="bg-[#16264A] text-white text-xs">
                    <tr>
                      <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all" checked={filtered.length > 0 && filtered.every(a => checkedIds.has(a.id))} onChange={e => setCheckedIds(e.target.checked ? new Set(filtered.map(a => a.id)) : new Set())} /></th>
                      <th className="px-3 py-3 text-left">Application</th>
                      <th className="px-3 py-3 text-left">Applicant</th>
                      <th className="px-3 py-3 text-left">Subject</th>
                      <th className="px-3 py-3 text-left">Due</th>
                      <th className="px-3 py-3 text-left">Days</th>
                      <th className="px-3 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-500">No applications{filterStatus ? ' with that status' : ' yet'}.</td></tr>}
                    {filtered.map((a, i) => {
                      const sel = selectedApp?.id === a.id;
                      const live = open(a.status);
                      return (
                        <tr key={a.id} onClick={() => setSelectedId(sel ? null : a.id)} className={`border-b border-gray-100 cursor-pointer ${sel ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-amber-50`}>
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${a.id}`} checked={checkedIds.has(a.id)} onChange={() => toggle(a.id)} /></td>
                          <td className="px-3 py-3 font-mono text-xs text-blue-700">{a.id}</td>
                          <td className="px-3 py-3 font-medium">{a.applicantName}</td>
                          <td className="px-3 py-3 text-gray-700 max-w-[200px] truncate">{a.subject}</td>
                          <td className="px-3 py-3 text-gray-600">{a.deadline}</td>
                          <td className="px-3 py-3 font-semibold">{live ? <span className={a.daysRemaining < 0 ? 'text-red-600' : a.daysRemaining < 7 ? 'text-amber-600' : 'text-green-700'}>{a.daysRemaining < 0 ? `−${Math.abs(a.daysRemaining)}d` : `${a.daysRemaining}d`}</span> : <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-3"><Badge label={STATUS[a.status].label} color={STATUS[a.status].color} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          {selectedApp && <div className="flex-1 bg-white rounded-lg shadow-sm overflow-hidden min-w-0"><ApplicationDetail key={selectedApp.id} app={selectedApp} onClose={() => setSelectedId(null)} /></div>}
        </div>
      )}

      {activeTab === 'section4' && (
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#16264A]">Section 4(1)(b) — Proactive Disclosure Register</h2>
              <p className="text-sm text-gray-500 mt-0.5">The 17 categories every public authority must publish suo motu, with the documents behind each.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void downloadPdf({ title: 'Proactive disclosure under Section 4(1)(b), RTI Act 2005', fileName: 'rti-section4-register', sections: [{ table: { head: ['No.', 'Category', 'Summary', 'Last updated'], body: disclosures.items.slice().sort((a, b) => a.no - b.no).map(d => [d.no, d.title, d.summary || '—', d.updated]) } }], signatory: 'Public Information Officer' })}>Download register (PDF)</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {disclosures.items.slice().sort((a, b) => a.no - b.no).map(d => <DisclosureCard key={d._rid ?? d.id} d={d} onEdit={() => { setEditing(d); setEditSummary(d.summary); }} />)}
          </div>
        </div>
      )}

      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Assign PIO to ${checked.filter(a => open(a.status)).length} open application(s)`}
        footer={<><Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button><Button disabled={!bulkPio} loading={assign.isPending} onClick={() => void bulkAssign()}>Assign</Button></>}>
        <select value={bulkPio} onChange={e => setBulkPio(e.target.value)} className="w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-sm bg-white cursor-pointer">
          <option value="">Choose an officer…</option>
          {(officers.data ?? []).map(o => <option key={o.employeeId} value={o.employeeId}>{o.name} — {o.designation}</option>)}
        </select>
        {checked.some(a => !open(a.status)) && <p className="text-xs text-gray-500 mt-2">Answered or closed applications in the selection are skipped.</p>}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `§4 — ${editing.title}` : ''}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => { if (editing) { disclosures.update(editing.id, { summary: editSummary.trim(), updated: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'), updatedBy: displayName(user) }); toast.success('Disclosure updated'); } setEditing(null); }}>Save</Button></>}>
        <label className="text-sm font-medium text-[#16264A]">What is published under this head<textarea rows={6} value={editSummary} onChange={e => setEditSummary(e.target.value)} placeholder="Summary, or where on the website the full document is kept…" className="mt-1 w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-sm resize-none" /></label>
        <p className="text-xs text-gray-500 mt-2">Attach the documents themselves from the card's “Attach” link.</p>
      </Modal>
    </div>
  );
}

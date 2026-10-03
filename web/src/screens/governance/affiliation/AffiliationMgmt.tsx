import { useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { useAuth, displayName } from '../../../lib/auth';
import { downloadCSV, downloadPdf } from '../../../lib/export';
import { inst } from '../../../lib/institution';
import { formatBytes, useCollection, useFiles, type Stored } from '../../../lib/records';
import { AFFILIATED_COLLEGES, AFFILIATION_FEES, DISTRICTS, DOCUMENT_CHECKLIST, type AffiliationType } from '../../../lib/affiliationdata';

/**
 * Affiliation of colleges, as the statute runs it: an application with its fee
 * and documents, scrutiny and objections, inspection and the committee's
 * report, the Standing Committee's decision, the Letter of Intent, and the
 * affiliation order. The register and district view are built from the
 * orders actually issued.
 */

type Stage = 'submitted' | 'scrutiny' | 'inspection' | 'committee' | 'loi' | 'affiliated' | 'conditional' | 'rejected';
const STAGE_LABEL: Record<Stage, string> = { submitted: 'Submitted', scrutiny: 'Document scrutiny', inspection: 'Inspection', committee: 'Standing Committee', loi: 'LOI issued', affiliated: 'Affiliated', conditional: 'Conditional', rejected: 'Rejected' };
const STAGE_TONE: Record<Stage, string> = { submitted: 'bg-[#F1F5F9] text-[#5A6577]', scrutiny: 'bg-[#EFF6FF] text-[#1D4ED8]', inspection: 'bg-[#F5F3FF] text-[#6D28D9]', committee: 'bg-[#FEF9EC] text-[#8A6D1F]', loi: 'bg-[#E0F2FE] text-[#0369A1]', affiliated: 'bg-[#D1FAE5] text-[#0E7A5F]', conditional: 'bg-[#FEF3DC] text-[#9A5B00]', rejected: 'bg-[#FEE2E2] text-[#A8242C]' };
const TYPE_LABEL: Record<AffiliationType, string> = { new: 'New college', renewal: 'Renewal', additional_programme: 'Additional programme', intake_increase: 'Intake increase' };

interface Doc { name: string; required: boolean; status: 'pending' | 'verified' | 'objection'; objection?: string; reply?: string }
interface Inspection { date: string; members: string; report?: { infrastructure: number; faculty: number; library: number; labs: number; recommendation: 'approve' | 'conditional' | 'reject'; remarks: string; submittedAt: string } }
interface Application {
  id: string; appNo: string; collegeCode: string; collegeName: string; district: string; type: AffiliationType;
  programmes: string; intake: number; academicYear: string; submittedOn: string; fee: number; feeReceipt?: string;
  stage: Stage; docs: Doc[]; inspection?: Inspection;
  committee?: { meetingDate: string; decision: 'approve' | 'conditional' | 'reject'; conditions: string[]; resolution: string };
  loi?: { no: string; issuedOn: string; validUntil: string };
  order?: { no: string; issuedOn: string; validUpto: string; conditions: string[] };
  history: Array<{ at: string; by: string; action: string; note?: string }>;
}

const today = () => new Date().toISOString().slice(0, 10);
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const day = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const toIso = (d: string) => (/^\d{2}-\d{2}-\d{4}$/.test(d) ? d.split('-').reverse().join('-') : d);
const docsFor = (t: AffiliationType): Doc[] => DOCUMENT_CHECKLIST.filter(d => d.applicableFor.includes(t)).map(d => ({ name: d.name, required: d.required, status: 'pending' }));
const acYear = () => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear(); return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; };

/** The colleges already affiliated, entered once as orders so the register starts complete. */
const SAMPLE: Application[] = AFFILIATED_COLLEGES.filter(c => c.status !== 'suspended').map(c => ({
  id: `AFF-${c.code}`, appNo: `AFF/${c.code}`, collegeCode: c.code, collegeName: c.name, district: c.district, type: 'renewal', programmes: c.programmes.join(', '), intake: c.totalIntake,
  academicYear: '2023-24', submittedOn: '2023-01-15', fee: AFFILIATION_FEES.renewal, feeReceipt: 'Legacy', stage: c.status === 'conditional' ? 'conditional' : 'affiliated', docs: [],
  order: { no: `ORD/${c.code}`, issuedOn: '2023-04-01', validUpto: toIso(c.validUpto), conditions: Array.from({ length: c.pendingConditions }, (_, i) => `Pending condition ${i + 1}`) }, history: [],
}));

export default function AffiliationMgmt() {
  const [tab, setTab] = useState('applications');
  const [district, setDistrict] = useState('');
  const apps = useCollection<Application>('gov:affiliation-applications', SAMPLE);
  const inProcess = apps.items.filter(a => !['affiliated', 'conditional', 'rejected'].includes(a.stage));
  const orders = apps.items.filter(a => a.order);

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-[18px] font-bold text-white">Affiliation Management</h1><p className="text-[13px] text-white/60 mt-0.5">Applications, scrutiny, inspection, committee, orders and the register</p></div>
        <div className="flex gap-6 text-center">
          {[['In process', inProcess.length], ['With objections', inProcess.filter(a => a.docs.some(d => d.status === 'objection')).length], ['Affiliated', orders.filter(a => a.order!.validUpto >= today()).length], ['Expiring ≤ 6 months', orders.filter(a => a.order!.validUpto >= today() && a.order!.validUpto <= addMonths(today(), 6)).length]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'applications', label: 'Applications' }, { id: 'register', label: 'Affiliation Register' }, { id: 'districts', label: 'By District' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {apps.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'applications' && <Applications apps={apps} />}
            {tab === 'register' && <Register orders={orders} district={district} setDistrict={setDistrict} apps={apps} />}
            {tab === 'districts' && <Districts orders={orders} inProcess={inProcess} onPick={d => { setDistrict(d); setTab('register'); }} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll = ReturnType<typeof useCollection<Application>>;

function Applications({ apps }: { apps: Coll }) {
  const { user } = useAuth();
  const me = displayName(user) || 'Affiliation cell';
  const [stage, setStage] = useState('active');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ collegeCode: '', collegeName: '', district: DISTRICTS[0]!, type: 'new' as AffiliationType, programmes: '', intake: '', feeReceipt: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = apps.items.filter(a => (stage === 'active' ? !['affiliated', 'conditional', 'rejected'].includes(a.stage) : !stage || a.stage === stage));
  const open = apps.items.find(a => a.id === openId) ?? null;

  function add() {
    if (!f.collegeName.trim() || !f.collegeCode.trim() || !f.programmes.trim() || !(Number(f.intake) > 0)) { toast.error('College, code, programmes and intake are required'); return; }
    const now = new Date().toISOString();
    apps.add({
      id: `AFF-${Date.now().toString(36).toUpperCase()}`, appNo: `AFF/${new Date().getFullYear()}/${String(Date.now()).slice(-5)}`, collegeCode: f.collegeCode.trim().toUpperCase(), collegeName: f.collegeName.trim(), district: f.district,
      type: f.type, programmes: f.programmes.trim(), intake: Number(f.intake), academicYear: acYear(), submittedOn: today(), fee: AFFILIATION_FEES[f.type], feeReceipt: f.feeReceipt.trim() || undefined,
      stage: 'submitted', docs: docsFor(f.type), history: [{ at: now, by: me, action: 'Application received' }],
    });
    toast.success('Application received'); setAdding(false); setF({ ...f, collegeCode: '', collegeName: '', programmes: '', intake: '', feeReceipt: '' });
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Select value={stage} onChange={e => setStage(e.target.value)} className="w-52"><option value="active">In process</option><option value="">All</option>{(Object.keys(STAGE_LABEL) as Stage[]).map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('affiliation-applications', rows.map(a => ({ app: a.appNo, college: a.collegeName, code: a.collegeCode, district: a.district, type: TYPE_LABEL[a.type], programmes: a.programmes, intake: a.intake, submitted: a.submittedOn, fee: a.fee, feeReceipt: a.feeReceipt ?? '', stage: STAGE_LABEL[a.stage] })))}>Export CSV</Button>
        <Button size="sm" onClick={() => setAdding(true)}>+ Receive application</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No applications here" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Application', 'College', 'Type', 'Documents', 'Stage'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(a => { const obj = a.docs.filter(d => d.status === 'objection').length; return (
            <tr key={a.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA] cursor-pointer" onClick={() => setOpenId(a.id)}>
              <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{a.appNo}<p className="font-sans text-[11px]">{day(a.submittedOn)}</p></td>
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{a.collegeName}</p><p className="text-[11px] text-[#5A6577]">{a.collegeCode} · {a.district}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{TYPE_LABEL[a.type]}<p className="text-[11px]">{a.programmes} · {a.intake} seats</p></td>
              <td className="px-4 py-3 text-[12px]">{a.docs.length ? <>{a.docs.filter(d => d.status === 'verified').length}/{a.docs.length} verified{obj ? <span className="text-[#A8242C] font-semibold"> · {obj} objection(s)</span> : ''}</> : '—'}</td>
              <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STAGE_TONE[a.stage]}`}>{STAGE_LABEL[a.stage]}</span></td>
            </tr>
          ); })}</tbody>
        </table>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Receive affiliation application" width="580px" footer={<><Button size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" onClick={add}>Receive</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="College name" value={f.collegeName} onChange={e => setF({ ...f, collegeName: e.target.value })} /></div>
          <Input label="College code" value={f.collegeCode} onChange={e => setF({ ...f, collegeCode: e.target.value })} />
          <Select label="District" value={f.district} onChange={e => setF({ ...f, district: e.target.value })}>{DISTRICTS.map(d => <option key={d}>{d}</option>)}</Select>
          <Select label="Type" value={f.type} onChange={e => setF({ ...f, type: e.target.value as AffiliationType })}>{(Object.keys(TYPE_LABEL) as AffiliationType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select>
          <Input label="Total intake sought" inputMode="numeric" value={f.intake} onChange={e => setF({ ...f, intake: e.target.value.replace(/\D/g, '') })} />
          <div className="col-span-2"><Input label="Programmes" value={f.programmes} onChange={e => setF({ ...f, programmes: e.target.value })} placeholder="B.A., B.Sc., B.Com." /></div>
          <Input label={`Fee receipt no. (₹${AFFILIATION_FEES[f.type].toLocaleString('en-IN')})`} value={f.feeReceipt} onChange={e => setF({ ...f, feeReceipt: e.target.value })} />
        </div>
      </Modal>
      {open && <AppDetail app={open} me={me} onClose={() => setOpenId(null)} update={p => apps.update(open.id, p)} />}
    </div>
  );
}

function AppDetail({ app: a, me, onClose, update }: { app: Stored<Application>; me: string; onClose: () => void; update: (p: Partial<Application>) => void }) {
  const files = useFiles(`gov:affiliation/${a.id}`);
  const [note, setNote] = useState('');
  const [insp, setInsp] = useState({ date: '', members: '' });
  const [rep, setRep] = useState({ infrastructure: '3', faculty: '3', library: '3', labs: '3', recommendation: 'approve' as 'approve' | 'conditional' | 'reject', remarks: '' });
  const [com, setCom] = useState({ meetingDate: today(), decision: 'approve' as 'approve' | 'conditional' | 'reject', conditions: '', resolution: '' });
  const [years, setYears] = useState('5');
  const log = (action: string, extra: Partial<Application> = {}, n?: string) => update({ ...extra, history: [...a.history, { at: new Date().toISOString(), by: me, action, ...(n ? { note: n } : {}) }] });
  const setDoc = (i: number, patch: Partial<Doc>) => update({ docs: a.docs.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const docsOk = a.docs.filter(d => d.required).every(d => d.status === 'verified');

  async function orderPdf(kind: 'loi' | 'order') {
    const o = kind === 'loi' ? a.loi! : a.order!;
    await downloadPdf({
      title: kind === 'loi' ? 'Letter of Intent' : a.stage === 'conditional' ? 'Conditional Affiliation Order' : 'Affiliation Order', subtitle: inst().name, reference: o.no, fileName: `${kind}-${a.collegeCode}`,
      sections: [
        { fields: [['College', `${a.collegeName} (${a.collegeCode})`], ['District', a.district], ['Programmes', a.programmes], ['Sanctioned intake', a.intake], ['Issued on', day(o.issuedOn)], [kind === 'loi' ? 'Valid until' : 'Affiliation valid up to', day('validUntil' in o ? o.validUntil : o.validUpto)]] },
        ...(kind === 'order' && a.order!.conditions.length ? [{ heading: 'Conditions', text: a.order!.conditions.map((c, i) => `${i + 1}. ${c}`) }] : []),
        { text: [kind === 'loi' ? 'The college may begin preparations for the programmes above. Admissions may be made only after the affiliation order is issued.' : `Issued on the recommendation of the Standing Committee${a.committee ? ` (resolution ${a.committee.resolution})` : ''}.`] },
      ],
      signatory: 'Registrar',
    });
  }

  return (
    <Modal open onClose={onClose} title={`${a.collegeName} — ${a.appNo}`} width="760px" footer={<Button size="sm" variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-5 text-[13px] max-h-[70vh] overflow-y-auto pr-1">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[#5A6577]"><span>{TYPE_LABEL[a.type]}</span><span>{a.programmes}</span><span>{a.intake} seats</span><span>Fee ₹{a.fee.toLocaleString('en-IN')} {a.feeReceipt ? `· receipt ${a.feeReceipt}` : <b className="text-[#A8242C]">· unpaid</b>}</span><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STAGE_TONE[a.stage]}`}>{STAGE_LABEL[a.stage]}</span></div>

        {a.stage === 'submitted' && (
          <div className="flex flex-wrap items-end gap-2">
            {!a.feeReceipt && <Input label="Fee receipt no." value={note} onChange={e => setNote(e.target.value)} />}
            <Button size="sm" disabled={!a.feeReceipt && !note.trim()} onClick={() => { log('Sent for document scrutiny', { stage: 'scrutiny', feeReceipt: a.feeReceipt ?? note.trim() }); setNote(''); toast.success('Moved to scrutiny'); }}>Start scrutiny</Button>
          </div>
        )}

        {a.docs.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Document checklist</p>
            {a.docs.map((d, i) => (
              <div key={d.name} className="py-2 border-b border-[#EDEFF3]">
                <div className="flex items-center gap-2">
                  <span className={`flex-1 ${d.status === 'verified' ? 'text-[#0E7A5F]' : d.status === 'objection' ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>{d.status === 'verified' ? '✓ ' : ''}{d.name}{d.required ? '' : ' (optional)'}</span>
                  {a.stage === 'scrutiny' && d.status !== 'verified' && <>
                    <button onClick={() => setDoc(i, { status: 'verified' })} className="text-[12px] text-[#0E7A5F] hover:underline cursor-pointer">Verify</button>
                    <button onClick={() => { const why = window.prompt(`Objection on "${d.name}"`); if (why) { setDoc(i, { status: 'objection', objection: why, reply: undefined }); log(`Objection: ${d.name}`, {}, why); } }} className="text-[12px] text-[#A8242C] hover:underline cursor-pointer">Object</button>
                  </>}
                </div>
                {d.objection && d.status === 'objection' && <p className="text-[12px] text-[#A8242C] mt-0.5">Objection: {d.objection}{d.reply ? <span className="text-[#16264A]"> · College reply: {d.reply}</span> : ''}</p>}
                {d.status === 'objection' && !d.reply && <button onClick={() => { const r = window.prompt("Record the college's reply"); if (r) setDoc(i, { reply: r }); }} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">Record college's reply</button>}
              </div>
            ))}
            {a.stage === 'scrutiny' && <Button size="sm" className="mt-2" disabled={!docsOk} onClick={() => { log('Scrutiny complete — documents in order', { stage: 'inspection' }); toast.success('Moved to inspection'); }}>Documents in order — send for inspection</Button>}
          </div>
        )}

        {a.stage === 'inspection' && (
          <div className="border border-[#D3D8E0] rounded-[4px] p-3 space-y-2">
            <p className="font-semibold text-[#16264A]">Inspection</p>
            {!a.inspection ? (
              <div className="grid grid-cols-3 gap-2 items-end">
                <Input label="Date" type="date" min={today()} value={insp.date} onChange={e => setInsp({ ...insp, date: e.target.value })} />
                <div className="col-span-2"><Input label="Committee members" value={insp.members} onChange={e => setInsp({ ...insp, members: e.target.value })} placeholder="Convener, subject expert, nominee" /></div>
                <Button size="sm" disabled={!insp.date || !insp.members.trim()} onClick={() => { log(`Inspection scheduled for ${day(insp.date)}`, { inspection: { date: insp.date, members: insp.members.trim() } }); toast.success('Inspection scheduled'); }}>Schedule</Button>
              </div>
            ) : (
              <>
                <p className="text-[#5A6577]">Scheduled {day(a.inspection.date)} · {a.inspection.members}</p>
                <p className="text-[12px] text-[#5A6577]">Score each 1 (poor) – 5 (excellent):</p>
                <div className="grid grid-cols-4 gap-2">{(['infrastructure', 'faculty', 'library', 'labs'] as const).map(k => <Select key={k} label={cap(k)} value={rep[k]} onChange={e => setRep({ ...rep, [k]: e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</Select>)}</div>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <Select label="Recommendation" value={rep.recommendation} onChange={e => setRep({ ...rep, recommendation: e.target.value as typeof rep.recommendation })}><option value="approve">Approve</option><option value="conditional">Approve with conditions</option><option value="reject">Reject</option></Select>
                  <div className="col-span-2"><Input label="Remarks" value={rep.remarks} onChange={e => setRep({ ...rep, remarks: e.target.value })} /></div>
                </div>
                <p className="text-[12px] text-[#5A6577]">Upload the signed report and photographs under Documents below.</p>
                <Button size="sm" disabled={!rep.remarks.trim()} onClick={() => { log('Inspection report submitted', { stage: 'committee', inspection: { ...a.inspection!, report: { infrastructure: +rep.infrastructure, faculty: +rep.faculty, library: +rep.library, labs: +rep.labs, recommendation: rep.recommendation, remarks: rep.remarks.trim(), submittedAt: new Date().toISOString() } } }, rep.recommendation); toast.success('Report submitted — to the Standing Committee'); }}>Submit report</Button>
              </>
            )}
          </div>
        )}
        {a.inspection?.report && <p className="text-[#5A6577]">Inspection ({day(a.inspection.date)}): infrastructure {a.inspection.report.infrastructure}/5, faculty {a.inspection.report.faculty}/5, library {a.inspection.report.library}/5, labs {a.inspection.report.labs}/5 · recommends <b>{a.inspection.report.recommendation}</b> — {a.inspection.report.remarks}</p>}

        {a.stage === 'committee' && (
          <div className="border border-[#D3D8E0] rounded-[4px] p-3 space-y-2">
            <p className="font-semibold text-[#16264A]">Standing Committee decision</p>
            <div className="grid grid-cols-3 gap-2">
              <Input label="Meeting date" type="date" max={today()} value={com.meetingDate} onChange={e => setCom({ ...com, meetingDate: e.target.value })} />
              <Select label="Decision" value={com.decision} onChange={e => setCom({ ...com, decision: e.target.value as typeof com.decision })}><option value="approve">Approve</option><option value="conditional">Approve with conditions</option><option value="reject">Reject</option></Select>
              <Input label="Resolution no." value={com.resolution} onChange={e => setCom({ ...com, resolution: e.target.value })} />
            </div>
            {com.decision === 'conditional' && <Input label="Conditions (one per line, separated by ;)" value={com.conditions} onChange={e => setCom({ ...com, conditions: e.target.value })} />}
            <Button size="sm" disabled={!com.resolution.trim() || (com.decision === 'conditional' && !com.conditions.trim())} onClick={() => {
              const committee = { meetingDate: com.meetingDate, decision: com.decision, conditions: com.conditions.split(';').map(s => s.trim()).filter(Boolean), resolution: com.resolution.trim() };
              if (com.decision === 'reject') { log('Rejected by the Standing Committee', { stage: 'rejected', committee }, committee.resolution); toast.success('Application rejected'); return; }
              const loi = { no: `LOI/${new Date().getFullYear()}/${a.collegeCode}`, issuedOn: today(), validUntil: addMonths(today(), 6) };
              log('Standing Committee approved — LOI issued', { stage: 'loi', committee, loi }, committee.resolution); toast.success('LOI issued');
            }}>Record decision</Button>
          </div>
        )}

        {a.loi && <div className="flex items-center gap-3"><span className="text-[#16264A]">LOI {a.loi.no} · valid until {day(a.loi.validUntil)}</span><Button size="sm" variant="secondary" onClick={() => void orderPdf('loi')}>LOI PDF</Button></div>}
        {a.stage === 'loi' && (
          <div className="border border-[#D3D8E0] rounded-[4px] p-3 flex flex-wrap items-end gap-2">
            <p className="w-full font-semibold text-[#16264A]">Issue the affiliation order once the LOI conditions are met</p>
            <Select label="Valid for (years)" value={years} onChange={e => setYears(e.target.value)}>{['1', '3', '5'].map(y => <option key={y}>{y}</option>)}</Select>
            <Button size="sm" onClick={() => {
              const conditional = a.committee?.decision === 'conditional';
              const order = { no: `ORD/${new Date().getFullYear()}/${a.collegeCode}`, issuedOn: today(), validUpto: addMonths(today(), Number(years) * 12), conditions: a.committee?.conditions ?? [] };
              log(conditional ? 'Conditional affiliation order issued' : 'Affiliation order issued', { stage: conditional ? 'conditional' : 'affiliated', order }); toast.success('Order issued — the college is on the register');
            }}>Issue order</Button>
          </div>
        )}
        {a.order && (
          <div className="space-y-1">
            <div className="flex items-center gap-3"><span className="text-[#16264A]">Order {a.order.no} · valid up to {day(a.order.validUpto)}</span><Button size="sm" variant="secondary" onClick={() => void orderPdf('order')}>Order PDF</Button></div>
            {a.order.conditions.map((c, i) => <label key={i} className="flex items-center gap-2 text-[12px] cursor-pointer"><input type="checkbox" checked={c.startsWith('✓ ')} onChange={() => { const conditions = a.order!.conditions.map((x, j) => (j === i ? (x.startsWith('✓ ') ? x.slice(2) : `✓ ${x}`) : x)); const allMet = conditions.every(x => x.startsWith('✓ ')); update({ order: { ...a.order!, conditions }, ...(allMet && a.stage === 'conditional' ? { stage: 'affiliated' } : {}) }); if (allMet && a.stage === 'conditional') toast.success('All conditions met — now fully affiliated'); }} />{c.replace(/^✓ /, '')}</label>)}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1"><p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Documents</p><Button size="sm" variant="secondary" onClick={() => void files.upload('.pdf,image/*,.doc,.docx')}>Upload</Button></div>
          {files.files.length === 0 ? <p className="text-[#5A6577]">None uploaded.</p> : files.files.map(x => <div key={x.id} className="flex justify-between py-1"><span className="text-[#16264A]">{x.name} <span className="text-[#5A6577]">{formatBytes(x.size)}</span></span><button onClick={() => void files.download(x)} className="text-[#E0952A] hover:underline cursor-pointer">Open</button></div>)}
        </div>

        {a.history.length > 0 && (
          <div><p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">History</p><ul className="space-y-0.5 text-[12px] text-[#5A6577]">{[...a.history].reverse().map((h, i) => <li key={i}>{new Date(h.at).toLocaleString('en-IN')} · {h.action} · {h.by}{h.note ? ` — ${h.note}` : ''}</li>)}</ul></div>
        )}
      </div>
    </Modal>
  );
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function Register({ orders, district, setDistrict, apps }: { orders: Stored<Application>[]; district: string; setDistrict: (d: string) => void; apps: Coll }) {
  const { user } = useAuth();
  const rows = orders.filter(a => !district || a.district === district).sort((a, b) => a.collegeName.localeCompare(b.collegeName));
  const state = (a: Application) => a.order!.validUpto < today() ? 'Expired' : a.stage === 'conditional' ? 'Conditional' : a.order!.validUpto <= addMonths(today(), 6) ? 'Expiring' : 'Affiliated';
  const tone: Record<string, string> = { Expired: 'text-[#A8242C]', Conditional: 'text-[#9A5B00]', Expiring: 'text-[#8A6D1F]', Affiliated: 'text-[#0E7A5F]' };
  function renew(a: Stored<Application>) {
    if (apps.items.some(x => x.collegeCode === a.collegeCode && x.type === 'renewal' && !['affiliated', 'conditional', 'rejected'].includes(x.stage))) { toast.info('A renewal is already in process for this college'); return; }
    apps.add({ id: `AFF-${Date.now().toString(36).toUpperCase()}`, appNo: `AFF/${new Date().getFullYear()}/${String(Date.now()).slice(-5)}`, collegeCode: a.collegeCode, collegeName: a.collegeName, district: a.district, type: 'renewal', programmes: a.programmes, intake: a.intake, academicYear: acYear(), submittedOn: today(), fee: AFFILIATION_FEES.renewal, stage: 'submitted', docs: docsFor('renewal'), history: [{ at: new Date().toISOString(), by: displayName(user) || 'Affiliation cell', action: `Renewal opened (previous order ${a.order!.no})` }] });
    toast.success('Renewal application opened');
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Select value={district} onChange={e => setDistrict(e.target.value)} className="w-52"><option value="">All districts</option>{DISTRICTS.map(d => <option key={d}>{d}</option>)}</Select>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('affiliation-register', rows.map(a => ({ code: a.collegeCode, college: a.collegeName, district: a.district, programmes: a.programmes, intake: a.intake, order: a.order!.no, issued: a.order!.issuedOn, validUpto: a.order!.validUpto, status: state(a), openConditions: a.order!.conditions.filter(c => !c.startsWith('✓ ')).length })))}>Export register</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No affiliated colleges" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['College', 'Programmes', 'Intake', 'Order', 'Valid up to', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(a => { const s = state(a); const openC = a.order!.conditions.filter(c => !c.startsWith('✓ ')).length; return (
            <tr key={a.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{a.collegeName}</p><p className="text-[11px] text-[#5A6577]">{a.collegeCode} · {a.district}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{a.programmes}</td><td className="px-4 py-3 tabular-nums">{a.intake}</td>
              <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{a.order!.no}</td><td className="px-4 py-3 text-[#5A6577]">{day(a.order!.validUpto)}</td>
              <td className={`px-4 py-3 text-[12px] font-semibold ${tone[s]}`}>{s}{openC ? ` · ${openC} condition(s) open` : ''}</td>
              <td className="px-4 py-3 text-right">{(s === 'Expired' || s === 'Expiring') && <Button size="sm" variant="secondary" onClick={() => renew(a)}>Open renewal</Button>}</td>
            </tr>
          ); })}</tbody>
        </table>
      )}
    </div>
  );
}

function Districts({ orders, inProcess, onPick }: { orders: Application[]; inProcess: Application[]; onPick: (d: string) => void }) {
  const all = [...new Set([...DISTRICTS, ...orders.map(o => o.district), ...inProcess.map(o => o.district)])];
  const stats = all.map(d => {
    const mine = orders.filter(o => o.district === d);
    return { d, colleges: mine.length, valid: mine.filter(o => o.order!.validUpto >= today()).length, expired: mine.filter(o => o.order!.validUpto < today()).length, intake: mine.reduce((n, o) => n + o.intake, 0), pending: inProcess.filter(o => o.district === d).length };
  }).sort((a, b) => b.colleges - a.colleges);
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      {!orders.length && !inProcess.length && <div className="p-4"><InlineAlert type="info">No colleges yet.</InlineAlert></div>}
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['District', 'Colleges', 'Valid', 'Expired', 'Total intake', 'Applications in process', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
        <tbody>{stats.map(s => <tr key={s.d} className="border-b border-[#EDEFF3] tabular-nums"><td className="px-4 py-3 text-[#16264A] font-medium">{s.d}</td><td className="px-4 py-3">{s.colleges}</td><td className="px-4 py-3 text-[#0E7A5F]">{s.valid}</td><td className={`px-4 py-3 ${s.expired ? 'text-[#A8242C] font-semibold' : ''}`}>{s.expired}</td><td className="px-4 py-3">{s.intake.toLocaleString('en-IN')}</td><td className="px-4 py-3">{s.pending}</td><td className="px-4 py-3 text-right">{s.colleges > 0 && <Button size="sm" variant="ghost" onClick={() => onPick(s.d)}>View colleges</Button>}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

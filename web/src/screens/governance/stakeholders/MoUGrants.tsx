import { useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { downloadCSV } from '../../../lib/export';
import { formatBytes, useCollection, useFiles, type Stored } from '../../../lib/records';
import { MOUS } from '../../../lib/governancedata';

/**
 * MoUs, research grants and consultancy: each MoU from draft through signing
 * into the register, its deliverables and signed copy, renewals as they fall
 * due; grants with the tranches actually received; consultancy earnings.
 */

const STAGES = ['draft', 'legal', 'approval', 'signing', 'registered'] as const;
type Stage = typeof STAGES[number];
const STAGE_LABEL: Record<Stage, string> = { draft: 'Draft', legal: 'Legal vetting', approval: 'Approval', signing: 'Signing', registered: 'Registered' };
interface Deliverable { item: string; due: string; done: boolean }
interface MoU { id: string; partner: string; type: 'industry' | 'academic' | 'government' | 'international'; purpose: string; nodal: string; stage: Stage; signedOn?: string; validUpto?: string; deliverables: Deliverable[]; notes?: string }
interface Grant { id: string; title: string; pi: string; agency: string; sanctioned: number; start: string; end: string; tranches: Array<{ date: string; amount: number; ref: string }>; ucSubmitted: boolean }
interface Consultancy { id: string; client: string; title: string; faculty: string; value: number; received: number; start: string; status: 'ongoing' | 'completed' }

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const toIso = (d: string) => (/^\d{2}-\d{2}-\d{4}$/.test(d) ? d.split('-').reverse().join('-') : d);
const daysTo = (iso: string) => Math.ceil((new Date(`${iso}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
/** Where a registered MoU stands today. */
function validity(m: MoU): { label: string; tone: string } {
  if (m.stage !== 'registered' || !m.validUpto) return { label: STAGE_LABEL[m.stage], tone: 'bg-[#F1F5F9] text-[#5A6577]' };
  const d = daysTo(m.validUpto);
  if (d < 0) return { label: 'Expired', tone: 'bg-[#FEE2E2] text-[#A8242C]' };
  if (d <= 90) return { label: `Expires in ${d} d`, tone: 'bg-[#FEF9EC] text-[#8A6D1F]' };
  return { label: 'Active', tone: 'bg-[#D1FAE5] text-[#0E7A5F]' };
}
const SAMPLE: MoU[] = MOUS.map(m => ({ id: m.id, partner: m.partner, type: m.type, purpose: m.purpose, nodal: m.nodal, stage: 'registered', signedOn: toIso(m.signedOn), validUpto: toIso(m.validUpto), deliverables: m.deliverables.map(d => ({ item: d.item, due: toIso(d.due), done: d.status === 'completed' })) }));

export default function MoUGrants() {
  const [tab, setTab] = useState('mou');
  const mous = useCollection<MoU>('gov:mous', SAMPLE);
  const grants = useCollection<Grant>('gov:research-grants', []);
  const consultancy = useCollection<Consultancy>('gov:consultancy', []);
  const registered = mous.items.filter(m => m.stage === 'registered');
  const due = registered.filter(m => m.validUpto && daysTo(m.validUpto) <= 90).length;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-[18px] font-bold text-white">MoUs & Grants</h1><p className="text-[13px] text-white/60 mt-0.5">Collaborations, research funding and consultancy</p></div>
        <div className="flex gap-6 text-center">
          {[['Active MoUs', registered.filter(m => m.validUpto && daysTo(m.validUpto) >= 0).length], ['In pipeline', mous.items.filter(m => m.stage !== 'registered').length], ['Renewals due', due], ['Grants sanctioned', inr(grants.items.reduce((n, g) => n + g.sanctioned, 0))]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'mou', label: 'MoUs' }, { id: 'renewals', label: `Renewals${due ? ` (${due})` : ''}` }, { id: 'grants', label: 'Research Grants' }, { id: 'consultancy', label: 'Consultancy' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {mous.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'mou' && <MouTab mous={mous} />}
            {tab === 'renewals' && <Renewals mous={mous} />}
            {tab === 'grants' && <Grants grants={grants} />}
            {tab === 'consultancy' && <ConsultancyTab items={consultancy} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll<T extends object> = ReturnType<typeof useCollection<T>>;

function MouTab({ mous }: { mous: Coll<MoU> }) {
  const [stage, setStage] = useState('');
  const [editing, setEditing] = useState<Stored<MoU> | 'new' | null>(null);
  const [f, setF] = useState({ partner: '', type: 'industry' as MoU['type'], purpose: '', nodal: '', notes: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = mous.items.filter(m => !stage || m.stage === stage);
  const open = mous.items.find(m => m.id === openId) ?? null;

  function edit(m: Stored<MoU> | 'new') { setEditing(m); setF(m === 'new' ? { partner: '', type: 'industry', purpose: '', nodal: '', notes: '' } : { partner: m.partner, type: m.type, purpose: m.purpose, nodal: m.nodal, notes: m.notes ?? '' }); }
  function save() {
    if (!f.partner.trim() || !f.purpose.trim() || !f.nodal.trim()) { toast.error('Partner, purpose and nodal officer are required'); return; }
    const doc = { partner: f.partner.trim(), type: f.type, purpose: f.purpose.trim(), nodal: f.nodal.trim(), notes: f.notes.trim() || undefined };
    if (editing === 'new') mous.add({ id: `MOU/${new Date().getFullYear()}/${String(Date.now()).slice(-4)}`, stage: 'draft', deliverables: [], ...doc });
    else if (editing) mous.update(editing.id, doc);
    toast.success('Saved'); setEditing(null);
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Select value={stage} onChange={e => setStage(e.target.value)} className="w-48"><option value="">All stages</option>{STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('mou-register', rows.map(m => ({ id: m.id, partner: m.partner, type: m.type, purpose: m.purpose, nodal: m.nodal, stage: STAGE_LABEL[m.stage], signed: m.signedOn ?? '', validUpto: m.validUpto ?? '', deliverablesDone: `${m.deliverables.filter(d => d.done).length}/${m.deliverables.length}` })))}>Export register</Button>
        <Button size="sm" onClick={() => edit('new')}>+ New MoU</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No MoUs" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['MoU', 'Partner', 'Valid', 'Deliverables', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(m => { const v = validity(m); const late = m.deliverables.filter(d => !d.done && d.due < today()).length; return (
            <tr key={m.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA] cursor-pointer" onClick={() => setOpenId(m.id)}>
              <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{m.id}</td>
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{m.partner}</p><p className="text-[11px] text-[#5A6577] capitalize">{m.type} · {m.nodal}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{m.signedOn ? `${day(m.signedOn)} – ${day(m.validUpto)}` : '—'}</td>
              <td className="px-4 py-3 text-[12px]">{m.deliverables.filter(d => d.done).length}/{m.deliverables.length}{late ? <span className="text-[#A8242C] font-semibold"> · {late} overdue</span> : ''}</td>
              <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${v.tone}`}>{v.label}</span></td>
              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => edit(m)}>Edit</Button></td>
            </tr>
          ); })}</tbody>
        </table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New MoU' : 'Edit MoU'} footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Partner" value={f.partner} onChange={e => setF({ ...f, partner: e.target.value })} />
          <Select label="Type" value={f.type} onChange={e => setF({ ...f, type: e.target.value as MoU['type'] })}>{['industry', 'academic', 'government', 'international'].map(t => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</Select>
          <div className="col-span-2"><Input label="Purpose" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })} /></div>
          <Input label="Nodal officer" value={f.nodal} onChange={e => setF({ ...f, nodal: e.target.value })} />
          <Input label="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
        </div>
      </Modal>
      <MouDrawer mou={open} onClose={() => setOpenId(null)} update={p => open && mous.update(open.id, p)} />
    </div>
  );
}

function MouDrawer({ mou: m, onClose, update }: { mou: Stored<MoU> | null; onClose: () => void; update: (p: Partial<MoU>) => void }) {
  const files = useFiles(m ? `gov:mou/${m.id}` : null);
  const [sign, setSign] = useState({ signedOn: today(), validUpto: '' });
  const [d, setD] = useState({ item: '', due: '' });
  if (!m) return null;
  const idx = STAGES.indexOf(m.stage);
  const next = STAGES[idx + 1];
  return (
    <Modal open onClose={onClose} title={`${m.partner} — ${m.id}`} width="640px" footer={<Button size="sm" variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-4 text-[13px]">
        <p className="text-[#5A6577]">{m.purpose}</p>
        <ol className="flex gap-1">{STAGES.map((s, i) => <li key={s} className="flex-1"><div className={`h-1.5 rounded-full ${i <= idx ? 'bg-[#0E7A5F]' : 'bg-[#EDEFF3]'}`} /><p className={`text-[10px] mt-1 ${i === idx ? 'font-semibold text-[#16264A]' : 'text-[#5A6577]'}`}>{STAGE_LABEL[s]}</p></li>)}</ol>
        {next && next !== 'registered' && <Button size="sm" onClick={() => { update({ stage: next }); toast.success(`Moved to ${STAGE_LABEL[next]}`); }}>Move to {STAGE_LABEL[next]}</Button>}
        {next === 'registered' && (
          <div className="border border-[#D3D8E0] rounded-[4px] p-3 space-y-2">
            <p className="font-semibold text-[#16264A]">Register the signed MoU</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Signed on" type="date" max={today()} value={sign.signedOn} onChange={e => setSign({ ...sign, signedOn: e.target.value })} />
              <Input label="Valid until" type="date" min={sign.signedOn} value={sign.validUpto} onChange={e => setSign({ ...sign, validUpto: e.target.value })} />
            </div>
            {files.files.length === 0 && <InlineAlert type="warning">Upload the signed copy below before registering.</InlineAlert>}
            <Button size="sm" disabled={!sign.validUpto || files.files.length === 0} onClick={() => { update({ stage: 'registered', signedOn: sign.signedOn, validUpto: sign.validUpto }); toast.success('MoU registered'); }}>Register</Button>
          </div>
        )}
        <div>
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Deliverables</p>
          {m.deliverables.length === 0 ? <p className="text-[#5A6577]">None recorded.</p> : m.deliverables.map((x, i) => (
            <label key={i} className="flex items-center gap-2 py-1 cursor-pointer"><input type="checkbox" checked={x.done} onChange={() => update({ deliverables: m.deliverables.map((y, j) => (j === i ? { ...y, done: !y.done } : y)) })} /><span className={x.done ? 'line-through text-[#5A6577]' : x.due < today() ? 'text-[#A8242C]' : 'text-[#16264A]'}>{x.item}</span><span className="ml-auto text-[11px] text-[#5A6577]">due {day(x.due)}</span></label>
          ))}
          <div className="flex gap-2 mt-2 items-end">
            <Input label="Add deliverable" value={d.item} onChange={e => setD({ ...d, item: e.target.value })} className="flex-1" />
            <Input label="Due" type="date" value={d.due} onChange={e => setD({ ...d, due: e.target.value })} />
            <Button size="sm" disabled={!d.item.trim() || !d.due} onClick={() => { update({ deliverables: [...m.deliverables, { item: d.item.trim(), due: d.due, done: false }] }); setD({ item: '', due: '' }); }}>Add</Button>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1"><p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Documents</p><Button size="sm" variant="secondary" onClick={() => void files.upload('.pdf,.doc,.docx,image/*')}>Upload</Button></div>
          {files.files.length === 0 ? <p className="text-[#5A6577]">No documents.</p> : files.files.map(x => <div key={x.id} className="flex justify-between py-1"><span className="text-[#16264A]">{x.name} <span className="text-[#5A6577]">{formatBytes(x.size)}</span></span><button onClick={() => void files.download(x)} className="text-[#E0952A] hover:underline cursor-pointer">Open</button></div>)}
        </div>
      </div>
    </Modal>
  );
}

function Renewals({ mous }: { mous: Coll<MoU> }) {
  const due = mous.items.filter(m => m.stage === 'registered' && m.validUpto && daysTo(m.validUpto) <= 90).sort((a, b) => a.validUpto!.localeCompare(b.validUpto!));
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">Expired or expiring within 90 days</p>
      {due.length === 0 ? <div className="p-6"><EmptyState title="Nothing due for renewal" /></div> : (
        <table className="w-full text-[13px]"><tbody>{due.map(m => { const d = daysTo(m.validUpto!); return (
          <tr key={m.id} className="border-b border-[#EDEFF3]">
            <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{m.partner}</p><p className="text-[11px] text-[#5A6577]">{m.id} · {m.nodal}</p></td>
            <td className={`px-4 py-3 ${d < 0 ? 'text-[#A8242C] font-semibold' : 'text-[#8A6D1F]'}`}>{d < 0 ? `Expired ${day(m.validUpto)}` : `Expires ${day(m.validUpto)} (${d} days)`}</td>
            <td className="px-4 py-3 text-right"><Button size="sm" onClick={() => { mous.add({ ...m, id: `${m.id}/R${new Date().getFullYear()}`, stage: 'draft', signedOn: undefined, validUpto: undefined, deliverables: [], notes: `Renewal of ${m.id}`, _rid: undefined } as MoU); toast.success('Renewal draft opened in the MoU list'); }}>Start renewal</Button></td>
          </tr>
        ); })}</tbody></table>
      )}
    </div>
  );
}

function Grants({ grants }: { grants: Coll<Grant> }) {
  const [editing, setEditing] = useState<Stored<Grant> | 'new' | null>(null);
  const [f, setF] = useState({ title: '', pi: '', agency: '', sanctioned: '', start: '', end: '' });
  const [tranche, setTranche] = useState<Stored<Grant> | null>(null);
  const [t, setT] = useState({ date: today(), amount: '', ref: '' });
  function open(g: Stored<Grant> | 'new') { setEditing(g); setF(g === 'new' ? { title: '', pi: '', agency: '', sanctioned: '', start: '', end: '' } : { title: g.title, pi: g.pi, agency: g.agency, sanctioned: String(g.sanctioned), start: g.start, end: g.end }); }
  function save() {
    if (!f.title.trim() || !f.pi.trim() || !f.agency.trim() || !(Number(f.sanctioned) > 0) || !f.start || !f.end) { toast.error('Fill every field'); return; }
    const doc = { title: f.title.trim(), pi: f.pi.trim(), agency: f.agency.trim(), sanctioned: Number(f.sanctioned), start: f.start, end: f.end };
    if (editing === 'new') grants.add({ id: `GR-${Date.now().toString(36)}`, tranches: [], ucSubmitted: false, ...doc }); else if (editing) grants.update(editing.id, doc);
    toast.success('Grant saved'); setEditing(null);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A] flex-1">Research grants</p><Button size="sm" variant="secondary" disabled={!grants.items.length} onClick={() => downloadCSV('research-grants', grants.items.map(g => ({ title: g.title, pi: g.pi, agency: g.agency, sanctioned: g.sanctioned, received: g.tranches.reduce((n, x) => n + x.amount, 0), start: g.start, end: g.end, ucSubmitted: g.ucSubmitted ? 'yes' : 'no' })))}>Export CSV</Button><Button size="sm" onClick={() => open('new')}>+ Add grant</Button></div>
      {grants.items.length === 0 ? <div className="p-6"><EmptyState title="No grants recorded" /></div> : (
        <table className="w-full text-[13px]"><thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Project', 'Agency', 'Sanctioned', 'Received', 'Period', 'UC', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{grants.items.map(g => { const rec = g.tranches.reduce((n, x) => n + x.amount, 0); return (
            <tr key={g.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{g.title}</p><p className="text-[11px] text-[#5A6577]">PI: {g.pi}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{g.agency}</td><td className="px-4 py-3 tabular-nums">{inr(g.sanctioned)}</td>
              <td className="px-4 py-3 tabular-nums">{inr(rec)}<p className="text-[11px] text-[#5A6577]">{g.tranches.length} tranche(s)</p></td>
              <td className={`px-4 py-3 text-[#5A6577] ${g.end < today() && !g.ucSubmitted ? 'text-[#A8242C]' : ''}`}>{day(g.start)} – {day(g.end)}</td>
              <td className="px-4 py-3"><input type="checkbox" aria-label="Utilisation certificate submitted" checked={g.ucSubmitted} onChange={() => grants.update(g.id, { ucSubmitted: !g.ucSubmitted })} /></td>
              <td className="px-4 py-3 text-right whitespace-nowrap"><Button size="sm" variant="secondary" onClick={() => { setTranche(g); setT({ date: today(), amount: '', ref: '' }); }}>+ Tranche</Button><Button size="sm" variant="ghost" onClick={() => open(g)}>Edit</Button></td>
            </tr>
          ); })}</tbody></table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add grant' : 'Edit grant'} footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="Project title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
          <Input label="Principal investigator" value={f.pi} onChange={e => setF({ ...f, pi: e.target.value })} />
          <Input label="Funding agency" value={f.agency} onChange={e => setF({ ...f, agency: e.target.value })} placeholder="DST, UGC, SERB…" />
          <Input label="Sanctioned (₹)" inputMode="numeric" value={f.sanctioned} onChange={e => setF({ ...f, sanctioned: e.target.value.replace(/\D/g, '') })} />
          <div />
          <Input label="Start" type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} />
          <Input label="End" type="date" min={f.start} value={f.end} onChange={e => setF({ ...f, end: e.target.value })} />
        </div>
      </Modal>
      <Modal open={!!tranche} onClose={() => setTranche(null)} title={tranche ? `Tranche received — ${tranche.title}` : ''} footer={<><Button size="sm" variant="secondary" onClick={() => setTranche(null)}>Cancel</Button><Button size="sm" onClick={() => { if (!tranche || !(Number(t.amount) > 0) || !t.ref.trim()) { toast.error('Amount and reference are required'); return; } const rec = tranche.tranches.reduce((n, x) => n + x.amount, 0) + Number(t.amount); if (rec > tranche.sanctioned && !window.confirm('This takes receipts above the sanctioned amount. Record anyway?')) return; grants.update(tranche.id, { tranches: [...tranche.tranches, { date: t.date, amount: Number(t.amount), ref: t.ref.trim() }] }); toast.success('Tranche recorded'); setTranche(null); }}>Record</Button></>}>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Date" type="date" max={today()} value={t.date} onChange={e => setT({ ...t, date: e.target.value })} />
          <Input label="Amount (₹)" inputMode="numeric" value={t.amount} onChange={e => setT({ ...t, amount: e.target.value.replace(/\D/g, '') })} />
          <Input label="Sanction / UTR ref." value={t.ref} onChange={e => setT({ ...t, ref: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

function ConsultancyTab({ items }: { items: Coll<Consultancy> }) {
  const [editing, setEditing] = useState<Stored<Consultancy> | 'new' | null>(null);
  const [f, setF] = useState({ client: '', title: '', faculty: '', value: '', received: '0', start: today(), status: 'ongoing' as Consultancy['status'] });
  function open(c: Stored<Consultancy> | 'new') { setEditing(c); setF(c === 'new' ? { client: '', title: '', faculty: '', value: '', received: '0', start: today(), status: 'ongoing' } : { client: c.client, title: c.title, faculty: c.faculty, value: String(c.value), received: String(c.received), start: c.start, status: c.status }); }
  function save() {
    if (!f.client.trim() || !f.title.trim() || !f.faculty.trim() || !(Number(f.value) > 0)) { toast.error('Client, title, faculty and value are required'); return; }
    if (Number(f.received) > Number(f.value)) { toast.error('Received cannot exceed the contract value'); return; }
    const doc = { client: f.client.trim(), title: f.title.trim(), faculty: f.faculty.trim(), value: Number(f.value), received: Number(f.received) || 0, start: f.start, status: f.status };
    if (editing === 'new') items.add({ id: `CNS-${Date.now().toString(36)}`, ...doc }); else if (editing) items.update(editing.id, doc);
    toast.success('Saved'); setEditing(null);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A] flex-1">Consultancy · {inr(items.items.reduce((n, c) => n + c.received, 0))} received</p><Button size="sm" variant="secondary" disabled={!items.items.length} onClick={() => downloadCSV('consultancy', items.items.map(c => ({ client: c.client, title: c.title, faculty: c.faculty, value: c.value, received: c.received, start: c.start, status: c.status })))}>Export CSV</Button><Button size="sm" onClick={() => open('new')}>+ Add</Button></div>
      {items.items.length === 0 ? <div className="p-6"><EmptyState title="No consultancy recorded" /></div> : (
        <table className="w-full text-[13px]"><tbody>{items.items.map(c => <tr key={c.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3"><p className="text-[#16264A] font-medium">{c.title}</p><p className="text-[11px] text-[#5A6577]">{c.client} · {c.faculty}</p></td><td className="px-4 py-3 tabular-nums">{inr(c.received)} / {inr(c.value)}</td><td className="px-4 py-3 text-[12px] capitalize">{c.status}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => open(c)}>Edit</Button></td></tr>)}</tbody></table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add consultancy' : 'Edit consultancy'} footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Client" value={f.client} onChange={e => setF({ ...f, client: e.target.value })} />
          <Input label="Faculty" value={f.faculty} onChange={e => setF({ ...f, faculty: e.target.value })} />
          <div className="col-span-2"><Input label="Assignment" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
          <Input label="Contract value (₹)" inputMode="numeric" value={f.value} onChange={e => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} />
          <Input label="Received so far (₹)" inputMode="numeric" value={f.received} onChange={e => setF({ ...f, received: e.target.value.replace(/\D/g, '') })} />
          <Input label="Started" type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} />
          <Select label="Status" value={f.status} onChange={e => setF({ ...f, status: e.target.value as Consultancy['status'] })}><option value="ongoing">Ongoing</option><option value="completed">Completed</option></Select>
        </div>
      </Modal>
    </div>
  );
}

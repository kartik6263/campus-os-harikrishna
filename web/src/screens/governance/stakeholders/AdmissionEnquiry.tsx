import { useState } from 'react';
import { Button, Drawer, EmptyState, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { downloadCSV } from '../../../lib/export';
import { useCollection, type Stored } from '../../../lib/records';
import { ENQUIRIES, type EnquirySource, type EnquiryStatus } from '../../../lib/governancedata';

/**
 * The admission enquiry desk: every prospective student who called, walked
 * in or wrote, each one's follow-ups and counsellor, the campaigns that
 * brought them, and how many went on to apply and join. All of it is kept.
 */

interface FollowUp { at: string; mode: string; notes: string; outcome: string; by?: string }
interface Enquiry {
  id: string; name: string; mobile: string; email?: string; programme: string; source: EnquirySource;
  receivedOn: string; status: EnquiryStatus; counsellor?: string; nextFollowup?: string; notes?: string;
  campaignId?: string; applicationNo?: string; followUps?: FollowUp[];
}
interface Counsellor { id: string; name: string; mobile?: string; active: boolean }
interface Campaign { id: string; name: string; channel: string; startsOn: string; endsOn?: string; budget?: number; notes?: string }

const SOURCES: Array<[EnquirySource, string]> = [['website', 'Website'], ['walk_in', 'Walk-in'], ['phone', 'Phone'], ['campaign', 'Campaign'], ['referral', 'Referral'], ['social', 'Social media']];
const STATUSES: Array<[EnquiryStatus, string, string]> = [
  ['new', 'New', 'bg-[#EFF6FF] text-[#1D4ED8]'],
  ['contacted', 'Contacted', 'bg-[#F5F3FF] text-[#6D28D9]'],
  ['followup_scheduled', 'Follow-up scheduled', 'bg-[#FEF9EC] text-[#8A6D1F]'],
  ['application_started', 'Applied', 'bg-[#E0F2FE] text-[#0369A1]'],
  ['admitted', 'Admitted', 'bg-[#D1FAE5] text-[#0E7A5F]'],
  ['not_interested', 'Not interested', 'bg-[#F1F5F9] text-[#5A6577]'],
  ['unreachable', 'Unreachable', 'bg-[#FEE2E2] text-[#A8242C]'],
];
const statusLabel = (s: EnquiryStatus) => STATUSES.find(x => x[0] === s)?.[1] ?? s;
const statusTone = (s: EnquiryStatus) => STATUSES.find(x => x[0] === s)?.[2] ?? '';
const sourceLabel = (s: EnquirySource) => SOURCES.find(x => x[0] === s)?.[1] ?? s;
const OPEN: EnquiryStatus[] = ['new', 'contacted', 'followup_scheduled'];
const today = () => new Date().toISOString().slice(0, 10);
/** Sample rows were written with dd-mm-yyyy dates; registers keep ISO. */
const toIso = (d?: string) => (d && /^\d{2}-\d{2}-\d{4}$/.test(d) ? d.split('-').reverse().join('-') : d);
const day = (iso?: string) => (iso ? new Date(`${toIso(iso)!.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const SAMPLE: Enquiry[] = ENQUIRIES.map(e => ({ ...e, receivedOn: toIso(e.receivedOn)!, nextFollowup: toIso(e.nextFollowup), followUps: [] }));

export default function AdmissionEnquiry() {
  const [tab, setTab] = useState('enquiries');
  const enquiries = useCollection<Enquiry>('acad:enquiries', SAMPLE);
  const counsellors = useCollection<Counsellor>('acad:enquiry-counsellors', []);
  const campaigns = useCollection<Campaign>('acad:enquiry-campaigns', []);
  const all = enquiries.items;
  const due = all.filter(e => OPEN.includes(e.status) && e.nextFollowup && toIso(e.nextFollowup)! <= today()).length;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Admission Enquiries</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Prospective students, follow-ups, counsellors and campaigns</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Enquiries', all.length], ['Open', all.filter(e => OPEN.includes(e.status)).length], ['Follow-ups due', due], ['Admitted', all.filter(e => e.status === 'admitted').length]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'enquiries', label: 'Enquiries' }, { id: 'counsellors', label: 'Counsellors' }, { id: 'campaigns', label: 'Campaigns' }, { id: 'analytics', label: 'Conversion' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {enquiries.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'enquiries' && <EnquiriesTab enquiries={enquiries} counsellors={counsellors.items.filter(c => c.active)} campaigns={campaigns.items} />}
            {tab === 'counsellors' && <CounsellorsTab counsellors={counsellors} enquiries={all} />}
            {tab === 'campaigns' && <CampaignsTab campaigns={campaigns} enquiries={all} />}
            {tab === 'analytics' && <AnalyticsTab enquiries={all} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll<T extends object> = ReturnType<typeof useCollection<T>>;

// ─── Enquiries ───────────────────────────────────────────────────────────────

const blank = { name: '', mobile: '', email: '', programme: '', source: 'walk_in' as EnquirySource, campaignId: '', counsellor: '', notes: '', nextFollowup: '' };

function EnquiriesTab({ enquiries, counsellors, campaigns }: { enquiries: Coll<Enquiry>; counsellors: Counsellor[]; campaigns: Campaign[] }) {
  const [view, setView] = useState<'open' | 'due' | 'all'>('open');
  const [search, setSearch] = useState('');
  const [counsellor, setCounsellor] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState('');

  const s = search.trim().toLowerCase();
  const rows = enquiries.items.filter(e =>
    (view === 'all' || (view === 'open' ? OPEN.includes(e.status) : OPEN.includes(e.status) && !!e.nextFollowup && toIso(e.nextFollowup)! <= today())) &&
    (!counsellor || (counsellor === '—' ? !e.counsellor : e.counsellor === counsellor)) &&
    (!s || e.name.toLowerCase().includes(s) || e.mobile.replace(/\s/g, '').includes(s.replace(/\s/g, '')) || e.programme.toLowerCase().includes(s)));
  const open = enquiries.items.find(e => e.id === openId) ?? null;

  function add() {
    const mobile = f.mobile.replace(/\D/g, '');
    if (!f.name.trim() || mobile.length < 10 || !f.programme.trim()) { toast.error('Name, a 10-digit mobile and the programme are required'); return; }
    const dup = enquiries.items.find(e => e.mobile.replace(/\D/g, '').endsWith(mobile.slice(-10)) && OPEN.includes(e.status));
    if (dup && !window.confirm(`${dup.name} (${dup.id}) already has an open enquiry with this mobile. Add another anyway?`)) return;
    enquiries.add({
      id: `ENQ/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`, name: f.name.trim(), mobile: f.mobile.trim(), email: f.email.trim() || undefined,
      programme: f.programme.trim(), source: f.source, campaignId: f.source === 'campaign' ? f.campaignId || undefined : undefined,
      receivedOn: today(), status: f.nextFollowup ? 'followup_scheduled' : 'new', counsellor: f.counsellor || undefined,
      nextFollowup: f.nextFollowup || undefined, notes: f.notes.trim() || undefined, followUps: [],
    });
    toast.success('Enquiry recorded');
    setF(blank); setAdding(false);
  }

  function bulkAssign() {
    if (!assignTo) return;
    picked.forEach(id => enquiries.update(id, { counsellor: assignTo }));
    toast.success(`${picked.size} enquiry(ies) assigned to ${assignTo}`);
    setPicked(new Set()); setAssignTo('');
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        {(['open', 'due', 'all'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577] hover:border-[#16264A]'}`}>{v === 'open' ? 'Open' : v === 'due' ? 'Follow-up due' : 'All'}</button>
        ))}
        <Input placeholder="Search name, mobile or programme" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={counsellor} onChange={e => setCounsellor(e.target.value)} className="w-48"><option value="">All counsellors</option><option value="—">Unassigned</option>{counsellors.map(c => <option key={c.id}>{c.name}</option>)}</Select>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('admission-enquiries', rows.map(e => ({ id: e.id, name: e.name, mobile: e.mobile, email: e.email ?? '', programme: e.programme, source: sourceLabel(e.source), received: e.receivedOn, status: statusLabel(e.status), counsellor: e.counsellor ?? '', nextFollowup: e.nextFollowup ?? '', followUps: e.followUps?.length ?? 0 })))}>Export CSV</Button>
        <Button size="sm" onClick={() => setAdding(true)}>+ New enquiry</Button>
      </div>
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-[#FEF9EC] border-b border-[#D3D8E0] text-[13px]">
          <span>{picked.size} selected</span>
          <Select value={assignTo} onChange={e => setAssignTo(e.target.value)} className="w-52"><option value="">Assign to counsellor…</option>{counsellors.map(c => <option key={c.id}>{c.name}</option>)}</Select>
          <Button size="sm" disabled={!assignTo} onClick={bulkAssign}>Assign</Button>
          {counsellors.length === 0 && <span className="text-[12px] text-[#5A6577]">Add counsellors under the Counsellors tab first.</span>}
        </div>
      )}
      {rows.length === 0 ? <div className="p-6"><EmptyState title={enquiries.items.length ? 'Nothing in this view' : 'No enquiries yet'} description={enquiries.items.length ? undefined : 'Record calls, walk-ins and web enquiries here.'} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              <th className="px-4 py-2.5 w-8"><input type="checkbox" aria-label="Select all" checked={rows.every(r => picked.has(r.id))} onChange={e => setPicked(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} /></th>
              {['Enquirer', 'Programme', 'Source', 'Received', 'Counsellor', 'Next follow-up', 'Status'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(e => {
                const overdue = OPEN.includes(e.status) && e.nextFollowup && toIso(e.nextFollowup)! < today();
                return (
                  <tr key={e.id} onClick={() => setOpenId(e.id)} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA] cursor-pointer">
                    <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}><input type="checkbox" aria-label={`Select ${e.name}`} checked={picked.has(e.id)} onChange={ev => { const n = new Set(picked); ev.target.checked ? n.add(e.id) : n.delete(e.id); setPicked(n); }} /></td>
                    <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{e.name}</p><p className="text-[11px] text-[#5A6577]">{e.mobile}</p></td>
                    <td className="px-4 py-3 text-[#16264A]">{e.programme}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{sourceLabel(e.source)}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{day(e.receivedOn)}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{e.counsellor ?? <span className="text-[#9A5B00]">Unassigned</span>}</td>
                    <td className={`px-4 py-3 ${overdue ? 'text-[#A8242C] font-semibold' : 'text-[#5A6577]'}`}>{day(e.nextFollowup)}{overdue ? ' · overdue' : ''}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${statusTone(e.status)}`}>{statusLabel(e.status)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New enquiry" width="560px" footer={<><Button size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" onClick={add}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <Input label="Mobile *" inputMode="tel" value={f.mobile} onChange={e => setF({ ...f, mobile: e.target.value })} />
          <Input label="Email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <Input label="Programme of interest *" value={f.programme} onChange={e => setF({ ...f, programme: e.target.value })} placeholder="BCA" />
          <Select label="Source" value={f.source} onChange={e => setF({ ...f, source: e.target.value as EnquirySource })}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          {f.source === 'campaign' ? (
            <Select label="Campaign" value={f.campaignId} onChange={e => setF({ ...f, campaignId: e.target.value })}><option value="">Choose…</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          ) : <div />}
          <Select label="Counsellor" value={f.counsellor} onChange={e => setF({ ...f, counsellor: e.target.value })}><option value="">Unassigned</option>{counsellors.map(c => <option key={c.id}>{c.name}</option>)}</Select>
          <Input label="First follow-up" type="date" min={today()} value={f.nextFollowup} onChange={e => setF({ ...f, nextFollowup: e.target.value })} />
          <div className="col-span-2"><Input label="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
        </div>
      </Modal>

      <EnquiryDrawer enquiry={open} counsellors={counsellors} campaigns={campaigns} onClose={() => setOpenId(null)} update={(patch) => open && enquiries.update(open.id, patch)} />
    </div>
  );
}

function EnquiryDrawer({ enquiry: e, counsellors, campaigns, onClose, update }: { enquiry: Stored<Enquiry> | null; counsellors: Counsellor[]; campaigns: Campaign[]; onClose: () => void; update: (p: Partial<Enquiry>) => void }) {
  const [fu, setFu] = useState({ mode: 'Call', notes: '', outcome: 'contacted' as EnquiryStatus, next: '' });
  const [appNo, setAppNo] = useState('');

  function log() {
    if (!e) return;
    if (!fu.notes.trim()) { toast.error('Write what was discussed'); return; }
    if (fu.outcome === 'followup_scheduled' && !fu.next) { toast.error('Pick the next follow-up date'); return; }
    const entry: FollowUp = { at: new Date().toISOString(), mode: fu.mode, notes: fu.notes.trim(), outcome: statusLabel(fu.outcome) };
    update({ followUps: [...(e.followUps ?? []), entry], status: fu.outcome, nextFollowup: fu.outcome === 'followup_scheduled' ? fu.next : OPEN.includes(fu.outcome) ? e.nextFollowup : undefined });
    toast.success('Follow-up logged');
    setFu({ mode: 'Call', notes: '', outcome: 'contacted', next: '' });
  }

  return (
    <Drawer open={!!e} onClose={onClose} title={e ? `${e.name} — ${e.id}` : ''}>
      {e && (
        <div className="space-y-5 text-[13px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[['Mobile', e.mobile], ['Email', e.email ?? '—'], ['Programme', e.programme], ['Source', `${sourceLabel(e.source)}${e.campaignId ? ` · ${campaigns.find(c => c.id === e.campaignId)?.name ?? ''}` : ''}`], ['Received', day(e.receivedOn)], ['Status', statusLabel(e.status)]].map(([l, v]) => (
              <div key={l}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[#16264A]">{v}</p></div>
            ))}
          </div>
          {e.notes && <p className="text-[#5A6577] bg-[#F7F8FA] border border-[#EDEFF3] rounded-[4px] p-2">{e.notes}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Select label="Counsellor" value={e.counsellor ?? ''} onChange={ev => { update({ counsellor: ev.target.value || undefined }); toast.success('Counsellor updated'); }}><option value="">Unassigned</option>{counsellors.map(c => <option key={c.id}>{c.name}</option>)}{e.counsellor && !counsellors.some(c => c.name === e.counsellor) && <option>{e.counsellor}</option>}</Select>
            <Select label="Status" value={e.status} onChange={ev => { update({ status: ev.target.value as EnquiryStatus }); toast.success('Status updated'); }}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </div>
          {(e.status === 'application_started' || e.status === 'admitted') && (
            <div className="flex items-end gap-2">
              <Input label="Admission application no." value={appNo || e.applicationNo || ''} onChange={ev => setAppNo(ev.target.value)} className="flex-1" />
              <Button size="sm" variant="secondary" disabled={!appNo.trim()} onClick={() => { update({ applicationNo: appNo.trim() }); setAppNo(''); toast.success('Linked'); }}>Link</Button>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Follow-ups</p>
            {(e.followUps ?? []).length === 0 ? <p className="text-[#5A6577]">None yet.</p> : (
              <ol className="border-l-2 border-[#D3D8E0] ml-1 space-y-2">
                {[...(e.followUps ?? [])].reverse().map((x, i) => <li key={i} className="pl-3"><p className="text-[#16264A]">{x.mode} · {x.outcome}</p><p className="text-[#5A6577]">{x.notes}</p><p className="text-[11px] text-[#5A6577]">{new Date(x.at).toLocaleString('en-IN')}</p></li>)}
              </ol>
            )}
          </div>
          <div className="border border-[#D3D8E0] rounded-[4px] p-3 space-y-3">
            <p className="font-semibold text-[#16264A]">Log a follow-up</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Mode" value={fu.mode} onChange={ev => setFu({ ...fu, mode: ev.target.value })}>{['Call', 'WhatsApp', 'SMS', 'Email', 'Visit'].map(m => <option key={m}>{m}</option>)}</Select>
              <Select label="Outcome" value={fu.outcome} onChange={ev => setFu({ ...fu, outcome: ev.target.value as EnquiryStatus })}>{STATUSES.filter(([v]) => v !== 'new').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </div>
            <Input label="What was discussed" value={fu.notes} onChange={ev => setFu({ ...fu, notes: ev.target.value })} />
            {fu.outcome === 'followup_scheduled' && <Input label="Next follow-up" type="date" min={today()} value={fu.next} onChange={ev => setFu({ ...fu, next: ev.target.value })} />}
            <Button size="sm" onClick={log}>Save follow-up</Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ─── Counsellors ─────────────────────────────────────────────────────────────

function CounsellorsTab({ counsellors, enquiries }: { counsellors: Coll<Counsellor>; enquiries: Enquiry[] }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  function add() {
    if (name.trim().length < 2) return;
    if (counsellors.items.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) { toast.error('That counsellor is already listed'); return; }
    counsellors.add({ id: `CNS-${Date.now().toString(36)}`, name: name.trim(), mobile: mobile.trim() || undefined, active: true });
    setName(''); setMobile('');
    toast.success('Counsellor added');
  }
  const stats = (n: string) => {
    const mine = enquiries.filter(e => e.counsellor === n);
    return { total: mine.length, open: mine.filter(e => OPEN.includes(e.status)).length, overdue: mine.filter(e => OPEN.includes(e.status) && e.nextFollowup && toIso(e.nextFollowup)! < today()).length, admitted: mine.filter(e => e.status === 'admitted').length };
  };
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Input label="Counsellor name" value={name} onChange={e => setName(e.target.value)} className="flex-1 min-w-[200px]" />
        <Input label="Mobile" value={mobile} onChange={e => setMobile(e.target.value)} />
        <Button disabled={name.trim().length < 2} onClick={add}>Add counsellor</Button>
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        {counsellors.items.length === 0 ? <div className="p-6"><EmptyState title="No counsellors yet" description="Add the staff who call back enquirers; then assign enquiries to them." /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Counsellor', 'Assigned', 'Open', 'Overdue follow-ups', 'Admitted', 'Conversion', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {counsellors.items.map(c => {
                const s = stats(c.name);
                return (
                  <tr key={c.id} className={`border-b border-[#EDEFF3] ${c.active ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{c.name}</p><p className="text-[11px] text-[#5A6577]">{c.mobile ?? ''}</p></td>
                    <td className="px-4 py-3 tabular-nums">{s.total}</td>
                    <td className="px-4 py-3 tabular-nums">{s.open}</td>
                    <td className={`px-4 py-3 tabular-nums ${s.overdue ? 'text-[#A8242C] font-semibold' : ''}`}>{s.overdue}</td>
                    <td className="px-4 py-3 tabular-nums">{s.admitted}</td>
                    <td className="px-4 py-3 tabular-nums">{s.total ? `${Math.round((s.admitted / s.total) * 100)}%` : '—'}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => counsellors.update(c.id, { active: !c.active })}>{c.active ? 'Deactivate' : 'Activate'}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

function CampaignsTab({ campaigns, enquiries }: { campaigns: Coll<Campaign>; enquiries: Enquiry[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', channel: 'Newspaper', startsOn: today(), endsOn: '', budget: '', notes: '' });
  function save() {
    if (!f.name.trim()) { toast.error('Name the campaign'); return; }
    campaigns.add({ id: `CMP-${Date.now().toString(36)}`, name: f.name.trim(), channel: f.channel, startsOn: f.startsOn, endsOn: f.endsOn || undefined, budget: f.budget ? Number(f.budget) : undefined, notes: f.notes.trim() || undefined });
    toast.success('Campaign added — choose it as the source when recording enquiries');
    setOpen(false); setF({ name: '', channel: 'Newspaper', startsOn: today(), endsOn: '', budget: '', notes: '' });
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Outreach campaigns</p><Button size="sm" onClick={() => setOpen(true)}>+ New campaign</Button></div>
      {campaigns.items.length === 0 ? <div className="p-6"><EmptyState title="No campaigns yet" description="Track newspaper ads, school visits and social posts, and see which ones bring admissions." /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Campaign', 'Channel', 'Period', 'Enquiries', 'Admitted', 'Cost / admission'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {campaigns.items.map(c => {
              const mine = enquiries.filter(e => e.campaignId === c.id);
              const adm = mine.filter(e => e.status === 'admitted').length;
              return (
                <tr key={c.id} className="border-b border-[#EDEFF3]">
                  <td className="px-4 py-3 text-[#16264A] font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{c.channel}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{day(c.startsOn)} – {c.endsOn ? day(c.endsOn) : 'ongoing'}</td>
                  <td className="px-4 py-3 tabular-nums">{mine.length}</td>
                  <td className="px-4 py-3 tabular-nums">{adm}</td>
                  <td className="px-4 py-3 tabular-nums">{c.budget && adm ? `₹${Math.round(c.budget / adm).toLocaleString('en-IN')}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New campaign" footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <Select label="Channel" value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}>{['Newspaper', 'School visit', 'Social media', 'Radio', 'Hoarding', 'SMS / WhatsApp', 'Education fair', 'Other'].map(c => <option key={c}>{c}</option>)}</Select>
          <Input label="Budget (₹)" inputMode="numeric" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value.replace(/\D/g, '') })} />
          <Input label="Starts" type="date" value={f.startsOn} onChange={e => setF({ ...f, startsOn: e.target.value })} />
          <Input label="Ends" type="date" value={f.endsOn} min={f.startsOn} onChange={e => setF({ ...f, endsOn: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Conversion analytics ────────────────────────────────────────────────────

function AnalyticsTab({ enquiries }: { enquiries: Enquiry[] }) {
  if (!enquiries.length) return <EmptyState title="No enquiries yet" />;
  const total = enquiries.length;
  const contacted = enquiries.filter(e => e.status !== 'new').length;
  const applied = enquiries.filter(e => e.status === 'application_started' || e.status === 'admitted').length;
  const admitted = enquiries.filter(e => e.status === 'admitted').length;
  const group = (key: (e: Enquiry) => string) => [...enquiries.reduce((m, e) => { const k = key(e); const v = m.get(k) ?? { n: 0, a: 0 }; v.n++; if (e.status === 'admitted') v.a++; return m.set(k, v); }, new Map<string, { n: number; a: number }>())].sort((a, b) => b[1].n - a[1].n);
  const Bar = ({ label, n, max, sub }: { label: string; n: number; max: number; sub?: string }) => (
    <div className="flex items-center gap-3 text-[13px]"><span className="w-36 truncate text-[#16264A]">{label}</span><div className="flex-1 h-3 bg-[#EDEFF3] rounded-full overflow-hidden"><div className="h-full bg-[#E0952A] rounded-full" style={{ width: `${(n / max) * 100}%` }} /></div><span className="w-24 text-right tabular-nums text-[#16264A]">{n}{sub ? <span className="text-[#5A6577]"> {sub}</span> : null}</span></div>
  );
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <p className="text-[14px] font-semibold text-[#16264A]">Funnel</p>
        <Bar label="Enquiries" n={total} max={total} /><Bar label="Contacted" n={contacted} max={total} /><Bar label="Applied" n={applied} max={total} /><Bar label="Admitted" n={admitted} max={total} />
        <p className="text-[12px] text-[#5A6577]">{Math.round((admitted / total) * 100)}% of enquiries became admissions.</p>
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <p className="text-[14px] font-semibold text-[#16264A]">By programme (enquiries · admitted)</p>
        {group(e => e.programme).map(([k, v]) => <Bar key={k} label={k} n={v.n} max={total} sub={`· ${v.a}`} />)}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <p className="text-[14px] font-semibold text-[#16264A]">By source (enquiries · admitted)</p>
        {group(e => sourceLabel(e.source)).map(([k, v]) => <Bar key={k} label={k} n={v.n} max={total} sub={`· ${v.a}`} />)}
      </div>
    </div>
  );
}

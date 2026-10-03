import { useState } from 'react';
import { Button, Drawer, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { downloadCSV } from '../../../lib/export';
import { useCollection, type Stored } from '../../../lib/records';
import { ASSETS } from '../../../lib/governancedata';

/**
 * The asset register: every asset with its tag, location and condition; its
 * current value by written-down-value depreciation from the purchase date;
 * maintenance, AMC, physical verification and disposal. One register, kept.
 */

type Category = 'furniture' | 'it_equipment' | 'lab_equipment' | 'vehicle' | 'building' | 'other';
type Condition = 'good' | 'fair' | 'poor' | 'condemned';
interface Asset {
  id: string; tagNo: string; name: string; category: Category; department: string; location: string;
  purchaseDate: string; purchaseValue: number; depreciationRate: number; condition: Condition;
  supplier?: string; invoiceNo?: string;
  amc?: { vendor: string; expiry: string; cost: number };
  maintenance: Array<{ date: string; detail: string; cost: number }>;
  verifications: Array<{ date: string; found: boolean; note?: string }>;
  disposal?: { status: 'proposed' | 'approved' | 'disposed'; reason: string; proposedOn: string; disposedOn?: string; realised?: number };
}

const CATS: Array<[Category, string]> = [['it_equipment', 'IT equipment'], ['lab_equipment', 'Lab equipment'], ['furniture', 'Furniture'], ['vehicle', 'Vehicle'], ['building', 'Building'], ['other', 'Other']];
const catLabel = (c: Category) => CATS.find(x => x[0] === c)?.[1] ?? c;
const COND_TONE: Record<Condition, string> = { good: 'bg-[#D1FAE5] text-[#0E7A5F]', fair: 'bg-[#FEF9EC] text-[#8A6D1F]', poor: 'bg-[#FEE2E2] text-[#A8242C]', condemned: 'bg-[#F1F5F9] text-[#5A6577]' };
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);
const day = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const toIso = (d?: string) => (d && /^\d{2}-\d{2}-\d{4}$/.test(d) ? d.split('-').reverse().join('-') : d);
const yearsSince = (iso: string) => Math.max(0, (Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / (365.25 * 86_400_000));
/** Written-down value: the rate applied to the remaining value each year. */
const currentValue = (a: Asset) => (a.disposal?.status === 'disposed' ? 0 : a.purchaseValue * Math.pow(1 - a.depreciationRate / 100, yearsSince(a.purchaseDate)));
const daysTo = (iso: string) => Math.ceil((new Date(`${iso}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);

const SAMPLE: Asset[] = ASSETS.map(a => ({
  id: a.id, tagNo: a.tagNo, name: a.name, category: a.category, department: a.department, location: a.location,
  purchaseDate: toIso(a.purchaseDate)!, purchaseValue: a.purchaseValue, depreciationRate: a.depreciationRate, condition: a.condition,
  amc: a.amcExpiry ? { vendor: 'Authorised service partner', expiry: toIso(a.amcExpiry)!, cost: Math.round(a.purchaseValue * 0.08) } : undefined,
  maintenance: [], verifications: [],
}));

export default function AssetInventory() {
  const [tab, setTab] = useState('register');
  const assets = useCollection<Asset>('gov:assets', SAMPLE);
  const live = assets.items.filter(a => a.disposal?.status !== 'disposed');
  const amcDue = live.filter(a => a.amc && daysTo(a.amc.expiry) <= 60).length;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Assets & Inventory</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Register, AMC, depreciation, physical verification and disposal</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Assets', live.length], ['Book value', inr(live.reduce((n, a) => n + currentValue(a), 0))], ['AMC due ≤ 60 days', amcDue], ['Pending disposal', assets.items.filter(a => a.disposal && a.disposal.status !== 'disposed').length]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'register', label: 'Asset Register' }, { id: 'amc', label: 'AMC' }, { id: 'depreciation', label: 'Depreciation' }, { id: 'verify', label: 'Physical Verification' }, { id: 'disposal', label: 'Disposal' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {assets.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'register' && <RegisterTab assets={assets} />}
            {tab === 'amc' && <AmcTab assets={assets} />}
            {tab === 'depreciation' && <DepreciationTab assets={live} />}
            {tab === 'verify' && <VerifyTab assets={assets} />}
            {tab === 'disposal' && <DisposalTab assets={assets} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll = ReturnType<typeof useCollection<Asset>>;

// ─── Register ────────────────────────────────────────────────────────────────

const blank = { tagNo: '', name: '', category: 'it_equipment' as Category, department: '', location: '', purchaseDate: today(), purchaseValue: '', depreciationRate: '15', condition: 'good' as Condition, supplier: '', invoiceNo: '' };

function RegisterTab({ assets }: { assets: Coll }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [dept, setDept] = useState('');
  const [editing, setEditing] = useState<Stored<Asset> | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const [openId, setOpenId] = useState<string | null>(null);
  const depts = [...new Set(assets.items.map(a => a.department).filter(Boolean))].sort();
  const s = search.trim().toLowerCase();
  const rows = assets.items.filter(a => a.disposal?.status !== 'disposed' && (!cat || a.category === cat) && (!dept || a.department === dept) && (!s || [a.name, a.tagNo, a.location].some(x => x.toLowerCase().includes(s))));
  const open = assets.items.find(a => a.id === openId) ?? null;

  function edit(a: Stored<Asset> | 'new') {
    setEditing(a);
    setF(a === 'new' ? blank : { tagNo: a.tagNo, name: a.name, category: a.category, department: a.department, location: a.location, purchaseDate: a.purchaseDate, purchaseValue: String(a.purchaseValue), depreciationRate: String(a.depreciationRate), condition: a.condition, supplier: a.supplier ?? '', invoiceNo: a.invoiceNo ?? '' });
  }
  function save() {
    if (!f.name.trim() || !f.tagNo.trim() || !(Number(f.purchaseValue) > 0)) { toast.error('Name, tag number and purchase value are required'); return; }
    if (assets.items.some(a => a.tagNo.toLowerCase() === f.tagNo.trim().toLowerCase() && (editing === 'new' || a.id !== editing?.id))) { toast.error('That tag number is already used'); return; }
    const doc = { tagNo: f.tagNo.trim(), name: f.name.trim(), category: f.category, department: f.department.trim(), location: f.location.trim(), purchaseDate: f.purchaseDate, purchaseValue: Number(f.purchaseValue), depreciationRate: Number(f.depreciationRate) || 0, condition: f.condition, supplier: f.supplier.trim() || undefined, invoiceNo: f.invoiceNo.trim() || undefined };
    if (editing === 'new') assets.add({ id: `AST-${Date.now().toString(36).toUpperCase()}`, maintenance: [], verifications: [], ...doc });
    else if (editing) assets.update(editing.id, doc);
    toast.success('Asset saved');
    setEditing(null);
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Input placeholder="Search name, tag or location" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={cat} onChange={e => setCat(e.target.value)} className="w-40"><option value="">All categories</option>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select value={dept} onChange={e => setDept(e.target.value)} className="w-44"><option value="">All departments</option>{depts.map(d => <option key={d}>{d}</option>)}</Select>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('asset-register', rows.map(a => ({ tagNo: a.tagNo, name: a.name, category: catLabel(a.category), department: a.department, location: a.location, purchased: a.purchaseDate, purchaseValue: a.purchaseValue, depreciationPct: a.depreciationRate, bookValue: Math.round(currentValue(a)), condition: a.condition, amcExpiry: a.amc?.expiry ?? '' })))}>Export CSV</Button>
        <Button size="sm" onClick={() => edit('new')}>+ Add asset</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title={assets.items.length ? 'No assets match' : 'The register is empty'} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[880px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Asset', 'Category', 'Department / location', 'Purchased', 'Cost', 'Book value', 'Condition', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{rows.map(a => (
              <tr key={a.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA] cursor-pointer" onClick={() => setOpenId(a.id)}>
                <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{a.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{a.tagNo}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{catLabel(a.category)}</td>
                <td className="px-4 py-3 text-[#5A6577]">{a.department}<p className="text-[11px]">{a.location}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{day(a.purchaseDate)}</td>
                <td className="px-4 py-3 tabular-nums">{inr(a.purchaseValue)}</td>
                <td className="px-4 py-3 tabular-nums text-[#16264A]">{inr(currentValue(a))}</td>
                <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] capitalize ${COND_TONE[a.condition]}`}>{a.condition}</span></td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => edit(a)}>Edit</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add asset' : 'Edit asset'} width="620px" footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="Asset name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <Input label="Tag number *" value={f.tagNo} onChange={e => setF({ ...f, tagNo: e.target.value })} placeholder="RDU/IT/2026/0001" />
          <Select label="Category" value={f.category} onChange={e => setF({ ...f, category: e.target.value as Category })}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Input label="Department" value={f.department} onChange={e => setF({ ...f, department: e.target.value })} />
          <Input label="Location" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
          <Input label="Purchase date" type="date" max={today()} value={f.purchaseDate} onChange={e => setF({ ...f, purchaseDate: e.target.value })} />
          <Input label="Purchase value (₹) *" inputMode="numeric" value={f.purchaseValue} onChange={e => setF({ ...f, purchaseValue: e.target.value.replace(/\D/g, '') })} />
          <Input label="Depreciation % a year (WDV)" inputMode="decimal" value={f.depreciationRate} onChange={e => setF({ ...f, depreciationRate: e.target.value.replace(/[^\d.]/g, '') })} />
          <Select label="Condition" value={f.condition} onChange={e => setF({ ...f, condition: e.target.value as Condition })}>{['good', 'fair', 'poor', 'condemned'].map(c => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}</Select>
          <Input label="Supplier" value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} />
          <Input label="Invoice no." value={f.invoiceNo} onChange={e => setF({ ...f, invoiceNo: e.target.value })} />
        </div>
      </Modal>
      <AssetDrawer asset={open} onClose={() => setOpenId(null)} update={p => open && assets.update(open.id, p)} />
    </div>
  );
}

function AssetDrawer({ asset: a, onClose, update }: { asset: Stored<Asset> | null; onClose: () => void; update: (p: Partial<Asset>) => void }) {
  const [m, setM] = useState({ date: today(), detail: '', cost: '' });
  return (
    <Drawer open={!!a} onClose={onClose} title={a ? `${a.name}` : ''}>
      {a && (
        <div className="space-y-5 text-[13px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[['Tag', a.tagNo], ['Category', catLabel(a.category)], ['Department', a.department], ['Location', a.location], ['Purchased', day(a.purchaseDate)], ['Cost', inr(a.purchaseValue)], ['Book value', inr(currentValue(a))], ['Depreciation', `${a.depreciationRate}% WDV`], ['Supplier', a.supplier ?? '—'], ['Invoice', a.invoiceNo ?? '—'], ['AMC', a.amc ? `${a.amc.vendor}, until ${day(a.amc.expiry)}` : 'None'], ['Last verified', a.verifications.length ? day(a.verifications[a.verifications.length - 1]!.date) : 'Never']].map(([l, v]) => (
              <div key={l}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[#16264A]">{v}</p></div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Maintenance log</p>
            {a.maintenance.length === 0 ? <p className="text-[#5A6577]">No maintenance recorded.</p> : (
              <ul className="divide-y divide-[#EDEFF3] border border-[#D3D8E0] rounded-[4px]">{[...a.maintenance].reverse().map((x, i) => <li key={i} className="px-3 py-2 flex justify-between gap-2"><span className="text-[#16264A]">{day(x.date)} · {x.detail}</span><span className="tabular-nums text-[#5A6577]">{inr(x.cost)}</span></li>)}</ul>
            )}
            <div className="grid grid-cols-6 gap-2 mt-2 items-end">
              <div className="col-span-2"><Input label="Date" type="date" max={today()} value={m.date} onChange={e => setM({ ...m, date: e.target.value })} /></div>
              <div className="col-span-3"><Input label="Work done" value={m.detail} onChange={e => setM({ ...m, detail: e.target.value })} /></div>
              <div className="col-span-1"><Input label="₹" inputMode="numeric" value={m.cost} onChange={e => setM({ ...m, cost: e.target.value.replace(/\D/g, '') })} /></div>
            </div>
            <Button size="sm" className="mt-2" disabled={!m.detail.trim()} onClick={() => { update({ maintenance: [...a.maintenance, { date: m.date, detail: m.detail.trim(), cost: Number(m.cost) || 0 }] }); setM({ date: today(), detail: '', cost: '' }); toast.success('Maintenance logged'); }}>Log maintenance</Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ─── AMC ─────────────────────────────────────────────────────────────────────

function AmcTab({ assets }: { assets: Coll }) {
  const [editing, setEditing] = useState<Stored<Asset> | null>(null);
  const [f, setF] = useState({ vendor: '', expiry: '', cost: '' });
  const withAmc = assets.items.filter(a => a.amc && a.disposal?.status !== 'disposed').sort((x, y) => x.amc!.expiry.localeCompare(y.amc!.expiry));
  const candidates = assets.items.filter(a => !a.amc && a.disposal?.status !== 'disposed' && (a.category === 'it_equipment' || a.category === 'lab_equipment' || a.category === 'vehicle'));
  function open(a: Stored<Asset>) { setEditing(a); setF({ vendor: a.amc?.vendor ?? '', expiry: a.amc ? '' : '', cost: a.amc ? String(a.amc.cost) : '' }); }
  function save() {
    if (!editing || !f.vendor.trim() || !f.expiry) { toast.error('Vendor and the new expiry date are required'); return; }
    assets.update(editing.id, { amc: { vendor: f.vendor.trim(), expiry: f.expiry, cost: Number(f.cost) || 0 } });
    toast.success('AMC saved'); setEditing(null);
  }
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">Annual maintenance contracts</p>
        {withAmc.length === 0 ? <div className="p-6"><EmptyState title="No AMCs recorded" /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Asset', 'Vendor', 'Expires', 'Annual cost', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{withAmc.map(a => { const d = daysTo(a.amc!.expiry); return (
              <tr key={a.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{a.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{a.tagNo}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{a.amc!.vendor}</td>
                <td className={`px-4 py-3 ${d < 0 ? 'text-[#A8242C] font-semibold' : d <= 60 ? 'text-[#9A5B00] font-semibold' : 'text-[#5A6577]'}`}>{day(a.amc!.expiry)}{d < 0 ? ' · lapsed' : d <= 60 ? ` · ${d} days` : ''}</td>
                <td className="px-4 py-3 tabular-nums">{inr(a.amc!.cost)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant={d <= 60 ? 'primary' : 'ghost'} onClick={() => open(a)}>Renew</Button></td>
              </tr>
            ); })}</tbody>
          </table>
        )}
      </div>
      {candidates.length > 0 && <InlineAlert type="info">{candidates.length} IT, lab or vehicle asset(s) have no AMC. Add one from the asset's Edit or here: {candidates.slice(0, 3).map(c => <button key={c.id} onClick={() => open(c)} className="underline ml-1 cursor-pointer">{c.name}</button>)}</InlineAlert>}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `AMC — ${editing.name}` : ''} footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <Input label="Vendor" value={f.vendor} onChange={e => setF({ ...f, vendor: e.target.value })} />
          <Input label="Valid until" type="date" min={today()} value={f.expiry} onChange={e => setF({ ...f, expiry: e.target.value })} />
          <Input label="Annual cost (₹)" inputMode="numeric" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value.replace(/\D/g, '') })} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Depreciation ────────────────────────────────────────────────────────────

function DepreciationTab({ assets }: { assets: Asset[] }) {
  const byCat = CATS.map(([c, l]) => {
    const list = assets.filter(a => a.category === c);
    const cost = list.reduce((n, a) => n + a.purchaseValue, 0);
    const book = list.reduce((n, a) => n + currentValue(a), 0);
    return { c, l, n: list.length, cost, book };
  }).filter(x => x.n);
  // This financial year's charge: value at 1 April less value now.
  const fyStart = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-04-01`; })();
  const charge = (a: Asset) => { const start = a.purchaseDate > fyStart ? a.purchaseValue : a.purchaseValue * Math.pow(1 - a.depreciationRate / 100, yearsSince(a.purchaseDate) - yearsSince(fyStart)); return Math.max(0, start - currentValue(a)); };
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A]">Depreciation (written-down value) · financial year from {day(fyStart)}</p>
        <Button size="sm" variant="secondary" disabled={!assets.length} onClick={() => downloadCSV('depreciation-schedule', assets.map(a => ({ tagNo: a.tagNo, name: a.name, category: catLabel(a.category), purchased: a.purchaseDate, cost: a.purchaseValue, ratePct: a.depreciationRate, chargeThisYear: Math.round(charge(a)), bookValue: Math.round(currentValue(a)) })))}>Schedule CSV</Button>
      </div>
      {byCat.length === 0 ? <div className="p-6"><EmptyState title="No assets" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Category', 'Assets', 'Cost', 'Charge this year', 'Book value', 'Written off'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {byCat.map(x => <tr key={x.c} className="border-b border-[#EDEFF3] tabular-nums"><td className="px-4 py-3 text-[#16264A]">{x.l}</td><td className="px-4 py-3">{x.n}</td><td className="px-4 py-3">{inr(x.cost)}</td><td className="px-4 py-3">{inr(assets.filter(a => a.category === x.c).reduce((n, a) => n + charge(a), 0))}</td><td className="px-4 py-3 font-medium">{inr(x.book)}</td><td className="px-4 py-3 text-[#5A6577]">{x.cost ? Math.round(((x.cost - x.book) / x.cost) * 100) : 0}%</td></tr>)}
            <tr className="font-semibold tabular-nums"><td className="px-4 py-3">Total</td><td className="px-4 py-3">{assets.length}</td><td className="px-4 py-3">{inr(byCat.reduce((n, x) => n + x.cost, 0))}</td><td className="px-4 py-3">{inr(assets.reduce((n, a) => n + charge(a), 0))}</td><td className="px-4 py-3">{inr(byCat.reduce((n, x) => n + x.book, 0))}</td><td /></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Physical verification ───────────────────────────────────────────────────

function VerifyTab({ assets }: { assets: Coll }) {
  const depts = [...new Set(assets.items.map(a => a.department).filter(Boolean))].sort();
  const [dept, setDept] = useState(depts[0] ?? '');
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const list = assets.items.filter(a => a.department === dept && a.disposal?.status !== 'disposed');
  const missing = assets.items.filter(a => a.verifications.length && !a.verifications[a.verifications.length - 1]!.found && a.disposal?.status !== 'disposed');

  function submit() {
    const date = today();
    list.forEach(a => { if (a.id in marks) assets.update(a.id, { verifications: [...a.verifications, { date, found: marks[a.id]! }] }); });
    const n = Object.keys(marks).length, lost = Object.values(marks).filter(v => !v).length;
    toast.success(`${n} asset(s) verified${lost ? `, ${lost} not found` : ''}`);
    setMarks({});
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
          <Select value={dept} onChange={e => { setDept(e.target.value); setMarks({}); }} className="w-56">{depts.map(d => <option key={d}>{d}</option>)}</Select>
          <span className="text-[12px] text-[#5A6577] flex-1">Walk the department and mark each asset found or not found.</span>
          <Button size="sm" disabled={!Object.keys(marks).length} onClick={submit}>Save verification ({Object.keys(marks).length})</Button>
        </div>
        {list.length === 0 ? <div className="p-6"><EmptyState title="No assets in this department" /></div> : (
          <ul className="divide-y divide-[#EDEFF3]">
            {list.map(a => {
              const last = a.verifications[a.verifications.length - 1];
              return (
                <li key={a.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0"><p className="text-[13px] text-[#16264A] font-medium">{a.name}</p><p className="text-[11px] text-[#5A6577]">{a.tagNo} · {a.location} · last verified {last ? `${day(last.date)} (${last.found ? 'found' : 'not found'})` : 'never'}</p></div>
                  <button onClick={() => setMarks({ ...marks, [a.id]: true })} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${marks[a.id] === true ? 'bg-[#0E7A5F] text-white border-[#0E7A5F]' : 'border-[#D3D8E0] text-[#5A6577]'}`}>Found</button>
                  <button onClick={() => setMarks({ ...marks, [a.id]: false })} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${marks[a.id] === false ? 'bg-[#A8242C] text-white border-[#A8242C]' : 'border-[#D3D8E0] text-[#5A6577]'}`}>Not found</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
        <div className="flex items-center justify-between mb-2"><p className="text-[14px] font-semibold text-[#16264A]">Discrepancies</p>{missing.length > 0 && <Button size="sm" variant="secondary" onClick={() => downloadCSV('verification-discrepancies', missing.map(a => ({ tagNo: a.tagNo, name: a.name, department: a.department, location: a.location, lastChecked: a.verifications[a.verifications.length - 1]!.date, bookValue: Math.round(currentValue(a)) })))}>CSV</Button>}</div>
        {missing.length === 0 ? <p className="text-[13px] text-[#5A6577]">None — every verified asset was found.</p> : missing.map(a => <p key={a.id} className="text-[13px] text-[#A8242C] py-1 border-b border-[#EDEFF3] last:border-0">{a.name} <span className="text-[#5A6577]">· {a.department}</span></p>)}
      </div>
    </div>
  );
}

// ─── Disposal ────────────────────────────────────────────────────────────────

function DisposalTab({ assets }: { assets: Coll }) {
  const [proposing, setProposing] = useState(false);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [closing, setClosing] = useState<Stored<Asset> | null>(null);
  const [realised, setRealised] = useState('');
  const inProcess = assets.items.filter(a => a.disposal);
  const eligible = assets.items.filter(a => !a.disposal && (a.condition === 'poor' || a.condition === 'condemned'));

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Condemnation & disposal</p><Button size="sm" onClick={() => setProposing(true)}>+ Propose disposal</Button></div>
      {inProcess.length === 0 ? <div className="p-6"><EmptyState title="Nothing proposed for disposal" description="Assets in poor or condemned condition can be proposed, approved by the committee, then disposed of." /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Asset', 'Reason', 'Proposed', 'Book value', 'Stage', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{inProcess.map(a => (
            <tr key={a.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{a.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{a.tagNo}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{a.disposal!.reason}</td>
              <td className="px-4 py-3 text-[#5A6577]">{day(a.disposal!.proposedOn)}</td>
              <td className="px-4 py-3 tabular-nums">{a.disposal!.status === 'disposed' ? `realised ${inr(a.disposal!.realised ?? 0)}` : inr(currentValue(a))}</td>
              <td className="px-4 py-3 capitalize text-[12px] font-semibold">{a.disposal!.status}{a.disposal!.disposedOn ? ` ${day(a.disposal!.disposedOn)}` : ''}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {a.disposal!.status === 'proposed' && <><Button size="sm" variant="ghost" onClick={() => { assets.update(a.id, { disposal: undefined }); toast.success('Proposal withdrawn'); }}>Withdraw</Button><Button size="sm" onClick={() => { assets.update(a.id, { disposal: { ...a.disposal!, status: 'approved' } }); toast.success('Disposal approved'); }}>Approve</Button></>}
                {a.disposal!.status === 'approved' && <Button size="sm" onClick={() => { setClosing(a); setRealised(''); }}>Record disposal</Button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={proposing} onClose={() => setProposing(false)} title="Propose disposal" footer={<><Button size="sm" variant="secondary" onClick={() => setProposing(false)}>Cancel</Button><Button size="sm" disabled={!pick || !reason.trim()} onClick={() => { const a = assets.items.find(x => x.id === pick)!; assets.update(a.id, { disposal: { status: 'proposed', reason: reason.trim(), proposedOn: today() } }); toast.success('Proposed for disposal'); setProposing(false); setPick(''); setReason(''); }}>Propose</Button></>}>
        <div className="space-y-3">
          <Select label="Asset (poor or condemned condition)" value={pick} onChange={e => setPick(e.target.value)}><option value="">Choose…</option>{eligible.map(a => <option key={a.id} value={a.id}>{a.name} — {a.tagNo}</option>)}</Select>
          {eligible.length === 0 && <p className="text-[12px] text-[#5A6577]">Mark an asset's condition as poor or condemned first.</p>}
          <Input label="Reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Beyond economical repair" />
        </div>
      </Modal>
      <Modal open={!!closing} onClose={() => setClosing(null)} title={closing ? `Dispose — ${closing.name}` : ''} footer={<><Button size="sm" variant="secondary" onClick={() => setClosing(null)}>Cancel</Button><Button size="sm" onClick={() => { assets.update(closing!.id, { condition: 'condemned', disposal: { ...closing!.disposal!, status: 'disposed', disposedOn: today(), realised: Number(realised) || 0 } }); toast.success('Disposal recorded — removed from the register'); setClosing(null); }}>Record</Button></>}>
        <Input label="Amount realised (₹, 0 if scrapped)" inputMode="numeric" value={realised} onChange={e => setRealised(e.target.value.replace(/\D/g, ''))} />
      </Modal>
    </div>
  );
}

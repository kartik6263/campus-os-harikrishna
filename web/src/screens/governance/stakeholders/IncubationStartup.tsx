import { useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { downloadCSV } from '../../../lib/export';
import { useCollection, useDocument, type Stored } from '../../../lib/records';
import { STARTUPS } from '../../../lib/governancedata';

/**
 * The incubation centre: cohorts, the startup portfolio with each one's stage
 * and milestones, mentors, grants actually disbursed, demo days and the
 * co-working seats each startup holds.
 */

const STAGES = ['ideation', 'prototype', 'pilot', 'market', 'growth'] as const;
type Stage = typeof STAGES[number];
interface Startup { id: string; name: string; founders: string; sector: string; cohortId: string; stage: Stage; seats: number; mentorIds: string[]; dpiit?: string; status: 'incubating' | 'graduated' | 'exited'; milestones: Array<{ date: string; text: string; done: boolean }> }
interface Cohort { id: string; name: string; start: string; end: string; intake: number }
interface Mentor { id: string; name: string; expertise: string; organisation: string }
interface Disbursal { id: string; startupId: string; scheme: string; amount: number; date: string; ref: string }
interface DemoDay { id: string; date: string; venue: string; startupIds: string[]; investors: number; outcome?: string }
interface Space { id: 'doc'; totalSeats: number }

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const SAMPLE_COHORTS: Cohort[] = [{ id: 'COH-3', name: 'Cohort 3 (2023)', start: '2023-07-01', end: '2024-06-30', intake: 8 }, { id: 'COH-4', name: 'Cohort 4 (2024)', start: '2024-07-01', end: '2025-06-30', intake: 10 }];
const SAMPLE_STARTUPS: Startup[] = STARTUPS.map(s => ({ id: s.id, name: s.name, founders: s.founders.join(', '), sector: s.sector, cohortId: s.cohort.includes('3') ? 'COH-3' : 'COH-4', stage: s.stage, seats: s.seatsAllocated, mentorIds: [], status: 'incubating', milestones: [{ date: '2024-09-01', text: s.lastMilestone, done: true }, { date: '2024-11-30', text: s.nextMilestone, done: false }] }));

export default function IncubationStartup() {
  const [tab, setTab] = useState('portfolio');
  const startups = useCollection<Startup>('gov:startups', SAMPLE_STARTUPS);
  const cohorts = useCollection<Cohort>('gov:incubation-cohorts', SAMPLE_COHORTS);
  const mentors = useCollection<Mentor>('gov:incubation-mentors', []);
  const disbursals = useCollection<Disbursal>('gov:incubation-grants', []);
  const demoDays = useCollection<DemoDay>('gov:demo-days', []);
  const space = useDocument<Space>('gov:coworking', { id: 'doc', totalSeats: 40 }, { id: 'doc', totalSeats: 0 });
  const active = startups.items.filter(s => s.status === 'incubating');
  const seatsUsed = active.reduce((n, s) => n + s.seats, 0);

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-[18px] font-bold text-white">Incubation & Startups</h1><p className="text-[13px] text-white/60 mt-0.5">Cohorts, portfolio, mentors, funding and space</p></div>
        <div className="flex gap-6 text-center">
          {[['Incubating', active.length], ['Graduated', startups.items.filter(s => s.status === 'graduated').length], ['Grants disbursed', inr(disbursals.items.reduce((n, d) => n + d.amount, 0))], ['Seats used', `${seatsUsed}/${space.value.totalSeats}`]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'portfolio', label: 'Portfolio' }, { id: 'cohorts', label: 'Cohorts' }, { id: 'mentors', label: 'Mentors' }, { id: 'grants', label: 'Grants & Funding' }, { id: 'demo', label: 'Demo Days' }, { id: 'space', label: 'Co-working' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {startups.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'portfolio' && <Portfolio startups={startups} cohorts={cohorts.items} mentors={mentors.items} disbursals={disbursals.items} />}
            {tab === 'cohorts' && <Cohorts cohorts={cohorts} startups={startups.items} />}
            {tab === 'mentors' && <Mentors mentors={mentors} startups={startups.items} />}
            {tab === 'grants' && <Grants disbursals={disbursals} startups={startups.items} />}
            {tab === 'demo' && <DemoDays demoDays={demoDays} startups={startups.items} />}
            {tab === 'space' && <SpaceTab space={space} startups={startups} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll<T extends object> = ReturnType<typeof useCollection<T>>;
const STAGE_TONE: Record<Stage, string> = { ideation: 'bg-[#F1F5F9] text-[#5A6577]', prototype: 'bg-[#EFF6FF] text-[#1D4ED8]', pilot: 'bg-[#FEF9EC] text-[#8A6D1F]', market: 'bg-[#F5F3FF] text-[#6D28D9]', growth: 'bg-[#D1FAE5] text-[#0E7A5F]' };

function Portfolio({ startups, cohorts, mentors, disbursals }: { startups: Coll<Startup>; cohorts: Cohort[]; mentors: Mentor[]; disbursals: Disbursal[] }) {
  const [view, setView] = useState<'incubating' | 'all'>('incubating');
  const [editing, setEditing] = useState<Stored<Startup> | 'new' | null>(null);
  const [f, setF] = useState({ name: '', founders: '', sector: '', cohortId: cohorts[0]?.id ?? '', stage: 'ideation' as Stage, seats: '1', dpiit: '', mentorIds: [] as string[] });
  const [openId, setOpenId] = useState<string | null>(null);
  const [m, setM] = useState({ text: '', date: '' });
  const rows = startups.items.filter(s => view === 'all' || s.status === 'incubating');
  const open = startups.items.find(s => s.id === openId) ?? null;
  const funded = (id: string) => disbursals.filter(d => d.startupId === id).reduce((n, d) => n + d.amount, 0);

  function edit(s: Stored<Startup> | 'new') {
    setEditing(s);
    setF(s === 'new' ? { name: '', founders: '', sector: '', cohortId: cohorts[0]?.id ?? '', stage: 'ideation', seats: '1', dpiit: '', mentorIds: [] } : { name: s.name, founders: s.founders, sector: s.sector, cohortId: s.cohortId, stage: s.stage, seats: String(s.seats), dpiit: s.dpiit ?? '', mentorIds: s.mentorIds });
  }
  function save() {
    if (!f.name.trim() || !f.founders.trim() || !f.sector.trim() || !f.cohortId) { toast.error('Name, founders, sector and cohort are required'); return; }
    const doc = { name: f.name.trim(), founders: f.founders.trim(), sector: f.sector.trim(), cohortId: f.cohortId, stage: f.stage, seats: Number(f.seats) || 0, dpiit: f.dpiit.trim() || undefined, mentorIds: f.mentorIds };
    if (editing === 'new') startups.add({ id: `INC-${Date.now().toString(36).toUpperCase()}`, status: 'incubating', milestones: [], ...doc });
    else if (editing) startups.update(editing.id, doc);
    toast.success('Saved'); setEditing(null);
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        {(['incubating', 'all'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{v === 'incubating' ? 'Incubating' : 'All'}</button>)}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('incubation-portfolio', rows.map(s => ({ startup: s.name, founders: s.founders, sector: s.sector, cohort: cohorts.find(c => c.id === s.cohortId)?.name ?? '', stage: s.stage, status: s.status, seats: s.seats, funded: funded(s.id), dpiit: s.dpiit ?? '' })))}>Export CSV</Button>
        <Button size="sm" disabled={!cohorts.length} onClick={() => edit('new')}>+ Admit startup</Button>
      </div>
      {!cohorts.length && <div className="p-4"><InlineAlert type="warning">Create a cohort first.</InlineAlert></div>}
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No startups here" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Startup', 'Cohort', 'Stage', 'Next milestone', 'Funded', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(s => { const next = s.milestones.filter(x => !x.done).sort((a, b) => a.date.localeCompare(b.date))[0]; return (
            <tr key={s.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA] cursor-pointer" onClick={() => { setOpenId(s.id); setM({ text: '', date: '' }); }}>
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{s.name}{s.status !== 'incubating' && <span className="ml-2 text-[10px] text-[#5A6577] uppercase">{s.status}</span>}</p><p className="text-[11px] text-[#5A6577]">{s.sector} · {s.founders}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{cohorts.find(c => c.id === s.cohortId)?.name ?? '—'}</td>
              <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STAGE_TONE[s.stage]}`}>{cap(s.stage)}</span></td>
              <td className={`px-4 py-3 text-[12px] ${next && next.date < today() ? 'text-[#A8242C] font-semibold' : 'text-[#5A6577]'}`}>{next ? `${next.text} · ${day(next.date)}` : '—'}</td>
              <td className="px-4 py-3 tabular-nums">{funded(s.id) ? inr(funded(s.id)) : '—'}</td>
              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => edit(s)}>Edit</Button></td>
            </tr>
          ); })}</tbody>
        </table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Admit startup' : 'Edit startup'} width="600px" footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Startup name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <Input label="Sector" value={f.sector} onChange={e => setF({ ...f, sector: e.target.value })} />
          <div className="col-span-2"><Input label="Founders (name, programme, batch)" value={f.founders} onChange={e => setF({ ...f, founders: e.target.value })} /></div>
          <Select label="Cohort" value={f.cohortId} onChange={e => setF({ ...f, cohortId: e.target.value })}>{cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="Stage" value={f.stage} onChange={e => setF({ ...f, stage: e.target.value as Stage })}>{STAGES.map(s => <option key={s} value={s}>{cap(s)}</option>)}</Select>
          <Input label="Co-working seats" inputMode="numeric" value={f.seats} onChange={e => setF({ ...f, seats: e.target.value.replace(/\D/g, '') })} />
          <Input label="DPIIT recognition no." value={f.dpiit} onChange={e => setF({ ...f, dpiit: e.target.value })} />
          {mentors.length > 0 && <div className="col-span-2"><p className="text-[13px] font-medium text-[#16264A] mb-1">Mentors</p><div className="flex flex-wrap gap-1.5">{mentors.map(x => <button key={x.id} onClick={() => setF({ ...f, mentorIds: f.mentorIds.includes(x.id) ? f.mentorIds.filter(i => i !== x.id) : [...f.mentorIds, x.id] })} className={`text-[12px] px-2.5 py-1 rounded-[4px] border cursor-pointer ${f.mentorIds.includes(x.id) ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{x.name}</button>)}</div></div>}
        </div>
      </Modal>
      <Modal open={!!open} onClose={() => setOpenId(null)} title={open ? `${open.name} — milestones` : ''} width="600px" footer={<Button size="sm" variant="secondary" onClick={() => setOpenId(null)}>Close</Button>}>
        {open && (
          <div className="space-y-3 text-[13px]">
            <p className="text-[#5A6577]">Mentors: {open.mentorIds.map(i => mentors.find(x => x.id === i)?.name).filter(Boolean).join(', ') || 'none assigned'}</p>
            {open.milestones.length === 0 ? <p className="text-[#5A6577]">No milestones yet.</p> : [...open.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((x, i) => (
              <label key={i} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={x.done} onChange={() => startups.update(open.id, { milestones: open.milestones.map(y => (y === x ? { ...y, done: !y.done } : y)) })} /><span className={x.done ? 'line-through text-[#5A6577]' : x.date < today() ? 'text-[#A8242C]' : 'text-[#16264A]'}>{x.text}</span><span className="ml-auto text-[11px] text-[#5A6577]">{day(x.date)}</span></label>
            ))}
            <div className="flex gap-2 items-end">
              <Input label="New milestone" value={m.text} onChange={e => setM({ ...m, text: e.target.value })} className="flex-1" />
              <Input label="Target" type="date" value={m.date} onChange={e => setM({ ...m, date: e.target.value })} />
              <Button size="sm" disabled={!m.text.trim() || !m.date} onClick={() => { startups.update(open.id, { milestones: [...open.milestones, { text: m.text.trim(), date: m.date, done: false }] }); setM({ text: '', date: '' }); }}>Add</Button>
            </div>
            {open.status === 'incubating' && <div className="flex gap-2 pt-2 border-t border-[#EDEFF3]"><Button size="sm" variant="secondary" onClick={() => { startups.update(open.id, { status: 'graduated', seats: 0 }); toast.success(`${open.name} graduated — seats released`); }}>Mark graduated</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Mark ${open.name} as exited?`)) { startups.update(open.id, { status: 'exited', seats: 0 }); toast.success('Marked exited — seats released'); } }}>Mark exited</Button></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Cohorts({ cohorts, startups }: { cohorts: Coll<Cohort>; startups: Startup[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', start: '', end: '', intake: '' });
  function add() {
    if (!f.name.trim() || !f.start || !f.end || f.end <= f.start || !(Number(f.intake) > 0)) { toast.error('Name, a valid period and intake are required'); return; }
    cohorts.add({ id: `COH-${Date.now().toString(36)}`, name: f.name.trim(), start: f.start, end: f.end, intake: Number(f.intake) });
    toast.success('Cohort created'); setOpen(false); setF({ name: '', start: '', end: '', intake: '' });
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Cohorts</p><Button size="sm" onClick={() => setOpen(true)}>+ New cohort</Button></div>
      {cohorts.items.length === 0 ? <div className="p-6"><EmptyState title="No cohorts" /></div> : (
        <table className="w-full text-[13px]"><tbody>{cohorts.items.map(c => { const n = startups.filter(s => s.cohortId === c.id).length; return (
          <tr key={c.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3 text-[#16264A] font-medium">{c.name}</td><td className="px-4 py-3 text-[#5A6577]">{day(c.start)} – {day(c.end)}{c.end < today() ? ' · ended' : c.start <= today() ? ' · running' : ' · upcoming'}</td><td className={`px-4 py-3 tabular-nums ${n > c.intake ? 'text-[#A8242C] font-semibold' : ''}`}>{n}/{c.intake} admitted</td></tr>
        ); })}</tbody></table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New cohort" footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={add}>Create</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Cohort 5 (2026)" /></div>
          <Input label="Starts" type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} />
          <Input label="Ends" type="date" min={f.start} value={f.end} onChange={e => setF({ ...f, end: e.target.value })} />
          <Input label="Intake (startups)" inputMode="numeric" value={f.intake} onChange={e => setF({ ...f, intake: e.target.value.replace(/\D/g, '') })} />
        </div>
      </Modal>
    </div>
  );
}

function Mentors({ mentors, startups }: { mentors: Coll<Mentor>; startups: Startup[] }) {
  const [f, setF] = useState({ name: '', expertise: '', organisation: '' });
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Input label="Mentor" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="flex-1 min-w-[180px]" />
        <Input label="Expertise" value={f.expertise} onChange={e => setF({ ...f, expertise: e.target.value })} />
        <Input label="Organisation" value={f.organisation} onChange={e => setF({ ...f, organisation: e.target.value })} />
        <Button disabled={!f.name.trim() || !f.expertise.trim()} onClick={() => { mentors.add({ id: `MNT-${Date.now().toString(36)}`, name: f.name.trim(), expertise: f.expertise.trim(), organisation: f.organisation.trim() }); setF({ name: '', expertise: '', organisation: '' }); toast.success('Mentor added'); }}>Add mentor</Button>
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        {mentors.items.length === 0 ? <div className="p-6"><EmptyState title="No mentors yet" description="Add mentors, then assign them to startups from the portfolio." /></div> : (
          <table className="w-full text-[13px]"><tbody>{mentors.items.map(x => { const mine = startups.filter(s => s.mentorIds.includes(x.id) && s.status === 'incubating'); return (
            <tr key={x.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3"><p className="text-[#16264A] font-medium">{x.name}</p><p className="text-[11px] text-[#5A6577]">{x.organisation}</p></td><td className="px-4 py-3 text-[#5A6577]">{x.expertise}</td><td className="px-4 py-3 text-[12px] text-[#16264A]">{mine.map(s => s.name).join(', ') || <span className="text-[#5A6577]">No startups</span>}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" disabled={mine.length > 0} onClick={() => mentors.remove(x.id)}>Remove</Button></td></tr>
          ); })}</tbody></table>
        )}
      </div>
    </div>
  );
}

function Grants({ disbursals, startups }: { disbursals: Coll<Disbursal>; startups: Startup[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ startupId: startups[0]?.id ?? '', scheme: 'Startup India Seed Fund', amount: '', date: today(), ref: '' });
  const nameOf = (id: string) => startups.find(s => s.id === id)?.name ?? '—';
  const sorted = [...disbursals.items].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A] flex-1">Funding disbursed</p><Button size="sm" variant="secondary" disabled={!sorted.length} onClick={() => downloadCSV('incubation-funding', sorted.map(d => ({ date: d.date, startup: nameOf(d.startupId), scheme: d.scheme, amount: d.amount, ref: d.ref })))}>Export CSV</Button><Button size="sm" disabled={!startups.length} onClick={() => setOpen(true)}>+ Record disbursal</Button></div>
      {sorted.length === 0 ? <div className="p-6"><EmptyState title="Nothing disbursed yet" /></div> : (
        <table className="w-full text-[13px]"><tbody>{sorted.map(d => <tr key={d.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3 text-[#5A6577]">{day(d.date)}</td><td className="px-4 py-3 text-[#16264A] font-medium">{nameOf(d.startupId)}</td><td className="px-4 py-3 text-[#5A6577]">{d.scheme}</td><td className="px-4 py-3 tabular-nums">{inr(d.amount)}</td><td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{d.ref}</td></tr>)}</tbody></table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Record disbursal" footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={() => { if (!f.startupId || !(Number(f.amount) > 0) || !f.ref.trim()) { toast.error('Startup, amount and reference are required'); return; } disbursals.add({ id: `DSB-${Date.now().toString(36)}`, startupId: f.startupId, scheme: f.scheme.trim(), amount: Number(f.amount), date: f.date, ref: f.ref.trim() }); toast.success('Disbursal recorded'); setOpen(false); setF({ ...f, amount: '', ref: '' }); }}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Startup" value={f.startupId} onChange={e => setF({ ...f, startupId: e.target.value })}>{startups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Input label="Scheme" value={f.scheme} onChange={e => setF({ ...f, scheme: e.target.value })} />
          <Input label="Amount (₹)" inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
          <Input label="Date" type="date" max={today()} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          <div className="col-span-2"><Input label="Sanction / UTR reference" value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

function DemoDays({ demoDays, startups }: { demoDays: Coll<DemoDay>; startups: Startup[] }) {
  const [editing, setEditing] = useState<Stored<DemoDay> | 'new' | null>(null);
  const [f, setF] = useState({ date: '', venue: '', startupIds: [] as string[], investors: '0', outcome: '' });
  const nameOf = (id: string) => startups.find(s => s.id === id)?.name ?? '—';
  function open(d: Stored<DemoDay> | 'new') { setEditing(d); setF(d === 'new' ? { date: '', venue: '', startupIds: [], investors: '0', outcome: '' } : { date: d.date, venue: d.venue, startupIds: d.startupIds, investors: String(d.investors), outcome: d.outcome ?? '' }); }
  function save() {
    if (!f.date || !f.venue.trim() || !f.startupIds.length) { toast.error('Date, venue and at least one startup are required'); return; }
    const doc = { date: f.date, venue: f.venue.trim(), startupIds: f.startupIds, investors: Number(f.investors) || 0, outcome: f.outcome.trim() || undefined };
    if (editing === 'new') demoDays.add({ id: `DD-${Date.now().toString(36)}`, ...doc }); else if (editing) demoDays.update(editing.id, doc);
    toast.success('Saved'); setEditing(null);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Demo days</p><Button size="sm" onClick={() => open('new')}>+ Schedule</Button></div>
      {demoDays.items.length === 0 ? <div className="p-6"><EmptyState title="No demo days yet" /></div> : (
        <table className="w-full text-[13px]"><tbody>{[...demoDays.items].sort((a, b) => b.date.localeCompare(a.date)).map(d => <tr key={d.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3 text-[#16264A] font-medium">{day(d.date)}<p className="text-[11px] text-[#5A6577] font-normal">{d.venue}</p></td><td className="px-4 py-3 text-[#16264A]">{d.startupIds.map(nameOf).join(', ')}</td><td className="px-4 py-3 text-[#5A6577]">{d.investors} investors{d.outcome ? ` · ${d.outcome}` : ''}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => open(d)}>Edit</Button></td></tr>)}</tbody></table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Schedule demo day' : 'Edit demo day'} footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          <Input label="Venue" value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} />
          <div className="col-span-2"><p className="text-[13px] font-medium text-[#16264A] mb-1">Presenting</p><div className="flex flex-wrap gap-1.5">{startups.filter(s => s.status === 'incubating').map(s => <button key={s.id} onClick={() => setF({ ...f, startupIds: f.startupIds.includes(s.id) ? f.startupIds.filter(i => i !== s.id) : [...f.startupIds, s.id] })} className={`text-[12px] px-2.5 py-1 rounded-[4px] border cursor-pointer ${f.startupIds.includes(s.id) ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{s.name}</button>)}</div></div>
          <Input label="Investors attending" inputMode="numeric" value={f.investors} onChange={e => setF({ ...f, investors: e.target.value.replace(/\D/g, '') })} />
          <Input label="Outcome" value={f.outcome} onChange={e => setF({ ...f, outcome: e.target.value })} placeholder="2 term sheets, 1 pilot" />
        </div>
      </Modal>
    </div>
  );
}

function SpaceTab({ space, startups }: { space: ReturnType<typeof useDocument<Space>>; startups: Coll<Startup> }) {
  const [total, setTotal] = useState(String(space.value.totalSeats));
  const active = startups.items.filter(s => s.status === 'incubating');
  const used = active.reduce((n, s) => n + s.seats, 0);
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Input label="Total co-working seats" inputMode="numeric" value={total} onChange={e => setTotal(e.target.value.replace(/\D/g, ''))} />
        <Button variant="secondary" onClick={() => { const n = Number(total); if (n < used) { toast.error(`${used} seats are allotted; total cannot be less`); return; } space.set({ totalSeats: n }); toast.success('Saved'); }}>Save</Button>
        <p className="text-[13px] text-[#5A6577]">{used} allotted · {Math.max(0, space.value.totalSeats - used)} free</p>
      </div>
      {used > space.value.totalSeats && <InlineAlert type="warning">More seats are allotted than the space has.</InlineAlert>}
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        {active.length === 0 ? <div className="p-6"><EmptyState title="No startups incubating" /></div> : (
          <table className="w-full text-[13px]"><tbody>{active.map(s => (
            <tr key={s.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3 text-[#16264A] font-medium">{s.name}</td><td className="px-4 py-3"><input aria-label={`Seats for ${s.name}`} inputMode="numeric" defaultValue={s.seats} onBlur={e => { const n = Number(e.target.value.replace(/\D/g, '')) || 0; if (n !== s.seats) { startups.update(s.id, { seats: n }); toast.success('Seats updated'); } }} className="w-20 border border-[#D3D8E0] rounded-[3px] px-2 py-1 tabular-nums" /> seats</td></tr>
          ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

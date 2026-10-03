import { useState } from 'react';
import { Button, EmptyState, Input, Modal, Select, Spinner, Tabs, Toggle, toast } from '../../../components/ui';
import { downloadCSV } from '../../../lib/export';
import { useCollection, type Stored } from '../../../lib/records';
import { ALUMNI_PROFILES } from '../../../lib/governancedata';

/**
 * The alumni office: a verified directory, chapters by city, events, mentorship
 * of current students, contributions with receipts, and alumni stories.
 */

interface Alumnus {
  id: string; name: string; rollNo: string; programme: string; passoutYear: number; college: string;
  currentRole: string; currentOrg: string; location: string; email?: string; mobile?: string; linkedin?: string;
  mentor: boolean; status: 'pending' | 'verified' | 'rejected'; note?: string; registeredOn: string;
}
interface AlumniEvent { id: string; name: string; date: string; venue: string; capacity: number; rsvp: number; notes?: string }
interface Mentorship { id: string; alumnusId: string; student: string; topic: string; startedOn: string; status: 'active' | 'closed' }
interface Contribution { id: string; alumnusId: string; amount: number; date: string; purpose: string; receiptNo: string; mode: string }
interface Story { id: string; alumnusId: string; headline: string; body: string; featured: boolean; published: boolean }

const SAMPLE: Alumnus[] = ALUMNI_PROFILES.map(a => ({ id: a.id, name: a.name, rollNo: a.rollNo, programme: a.programme, passoutYear: a.passoutYear, college: a.college, currentRole: a.currentRole, currentOrg: a.currentOrg, location: a.location, linkedin: a.linkedin, mentor: a.mentorshipAvailable, status: 'verified', registeredOn: '2024-06-01' }));
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

export default function AlumniModule() {
  const [tab, setTab] = useState('directory');
  const alumni = useCollection<Alumnus>('gov:alumni', SAMPLE);
  const events = useCollection<AlumniEvent>('gov:alumni-events', []);
  const mentorships = useCollection<Mentorship>('gov:alumni-mentorships', []);
  const contributions = useCollection<Contribution>('gov:alumni-contributions', []);
  const stories = useCollection<Story>('gov:alumni-stories', []);
  const verified = alumni.items.filter(a => a.status === 'verified');
  const pending = alumni.items.filter(a => a.status === 'pending').length;
  const nameOf = (id: string) => alumni.items.find(a => a.id === id)?.name ?? '—';

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-[18px] font-bold text-white">Alumni</h1><p className="text-[13px] text-white/60 mt-0.5">Directory, chapters, events, mentorship and giving</p></div>
        <div className="flex gap-6 text-center">
          {[['Verified alumni', verified.length], ['To verify', pending], ['Mentors', verified.filter(a => a.mentor).length], ['Contributions', inr(contributions.items.reduce((n, c) => n + c.amount, 0))]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'directory', label: `Directory${pending ? ` (${pending} to verify)` : ''}` }, { id: 'chapters', label: 'Chapters' }, { id: 'events', label: 'Events' }, { id: 'mentorship', label: 'Mentorship' }, { id: 'giving', label: 'Contributions' }, { id: 'stories', label: 'Stories' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {alumni.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'directory' && <Directory alumni={alumni} contributions={contributions.items} />}
            {tab === 'chapters' && <Chapters alumni={verified} />}
            {tab === 'events' && <Events events={events} />}
            {tab === 'mentorship' && <MentorshipTab mentorships={mentorships} mentors={verified.filter(a => a.mentor)} nameOf={nameOf} />}
            {tab === 'giving' && <Giving contributions={contributions} alumni={verified} nameOf={nameOf} />}
            {tab === 'stories' && <Stories stories={stories} alumni={verified} nameOf={nameOf} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll<T extends object> = ReturnType<typeof useCollection<T>>;
const blank = { name: '', rollNo: '', programme: '', passoutYear: '', college: '', currentRole: '', currentOrg: '', location: '', email: '', mobile: '', linkedin: '', mentor: false };

function Directory({ alumni, contributions }: { alumni: Coll<Alumnus>; contributions: Contribution[] }) {
  const [view, setView] = useState<'verified' | 'pending' | 'all'>('verified');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Stored<Alumnus> | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const s = search.trim().toLowerCase();
  const rows = alumni.items.filter(a => (view === 'all' || a.status === view) && (!s || [a.name, a.currentOrg, a.location, a.programme, String(a.passoutYear)].some(x => x.toLowerCase().includes(s))));
  const given = (id: string) => contributions.filter(c => c.alumnusId === id).reduce((n, c) => n + c.amount, 0);

  function open(a: Stored<Alumnus> | 'new') {
    setEditing(a);
    setF(a === 'new' ? blank : { name: a.name, rollNo: a.rollNo, programme: a.programme, passoutYear: String(a.passoutYear), college: a.college, currentRole: a.currentRole, currentOrg: a.currentOrg, location: a.location, email: a.email ?? '', mobile: a.mobile ?? '', linkedin: a.linkedin ?? '', mentor: a.mentor });
  }
  function save() {
    const year = Number(f.passoutYear);
    if (!f.name.trim() || !f.programme.trim() || !(year > 1950 && year <= new Date().getFullYear())) { toast.error('Name, programme and a valid pass-out year are required'); return; }
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) { toast.error('Not a valid email'); return; }
    const doc = { name: f.name.trim(), rollNo: f.rollNo.trim(), programme: f.programme.trim(), passoutYear: year, college: f.college.trim(), currentRole: f.currentRole.trim(), currentOrg: f.currentOrg.trim(), location: f.location.trim(), email: f.email.trim() || undefined, mobile: f.mobile.trim() || undefined, linkedin: f.linkedin.trim() || undefined, mentor: f.mentor };
    if (editing === 'new') {
      if (f.rollNo.trim() && alumni.items.some(a => a.rollNo.toLowerCase() === f.rollNo.trim().toLowerCase())) { toast.error('An alumnus with this roll number is already registered'); return; }
      alumni.add({ id: `ALU-${Date.now().toString(36).toUpperCase()}`, status: 'pending', registeredOn: today(), ...doc });
      toast.success('Registered — verify against the college records to add to the directory');
    } else if (editing) { alumni.update(editing.id, doc); toast.success('Saved'); }
    setEditing(null);
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        {(['verified', 'pending', 'all'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{v === 'verified' ? 'Directory' : v === 'pending' ? 'To verify' : 'All'}</button>)}
        <Input placeholder="Search name, organisation, city, batch" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('alumni', rows.map(a => ({ name: a.name, rollNo: a.rollNo, programme: a.programme, batch: a.passoutYear, college: a.college, role: a.currentRole, organisation: a.currentOrg, city: a.location, email: a.email ?? '', mobile: a.mobile ?? '', mentor: a.mentor ? 'yes' : '', status: a.status })))}>Export CSV</Button>
        <Button size="sm" onClick={() => open('new')}>+ Register alumnus</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No alumni here" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Name', 'Batch', 'Now', 'City', 'Given', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(a => (
            <tr key={a.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{a.name}{a.mentor && <span className="ml-2 text-[10px] font-semibold text-[#0E7A5F]">MENTOR</span>}</p><p className="font-mono text-[11px] text-[#5A6577]">{a.rollNo}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{a.programme} · {a.passoutYear}<p className="text-[11px]">{a.college}</p></td>
              <td className="px-4 py-3 text-[#16264A]">{a.currentRole}<p className="text-[11px] text-[#5A6577]">{a.currentOrg}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{a.location}</td>
              <td className="px-4 py-3 tabular-nums">{given(a.id) ? inr(given(a.id)) : '—'}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                {a.status === 'pending' && <><Button size="sm" variant="ghost" onClick={() => { const why = window.prompt('Reason for rejecting'); if (why) { alumni.update(a.id, { status: 'rejected', note: why }); toast.success('Rejected'); } }}>Reject</Button><Button size="sm" onClick={() => { alumni.update(a.id, { status: 'verified' }); toast.success(`${a.name} added to the directory`); }}>Verify</Button></>}
                <Button size="sm" variant="ghost" onClick={() => open(a)}>Edit</Button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Register alumnus' : 'Edit alumnus'} width="620px" footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <Input label="Roll / enrolment no." value={f.rollNo} onChange={e => setF({ ...f, rollNo: e.target.value })} />
          <Input label="Programme *" value={f.programme} onChange={e => setF({ ...f, programme: e.target.value })} />
          <Input label="Pass-out year *" inputMode="numeric" value={f.passoutYear} onChange={e => setF({ ...f, passoutYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          <div className="col-span-2"><Input label="College" value={f.college} onChange={e => setF({ ...f, college: e.target.value })} /></div>
          <Input label="Current role" value={f.currentRole} onChange={e => setF({ ...f, currentRole: e.target.value })} />
          <Input label="Organisation" value={f.currentOrg} onChange={e => setF({ ...f, currentOrg: e.target.value })} />
          <Input label="City" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
          <Input label="Email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <Input label="Mobile" value={f.mobile} onChange={e => setF({ ...f, mobile: e.target.value })} />
          <Input label="LinkedIn" value={f.linkedin} onChange={e => setF({ ...f, linkedin: e.target.value })} />
          <div className="col-span-2"><Toggle on={f.mentor} onChange={v => setF({ ...f, mentor: v })} label="Willing to mentor current students" /></div>
        </div>
      </Modal>
    </div>
  );
}

function Chapters({ alumni }: { alumni: Alumnus[] }) {
  const groups = [...alumni.reduce((m, a) => m.set(a.location || 'Unknown', [...(m.get(a.location || 'Unknown') ?? []), a]), new Map<string, Alumnus[]>())].sort((a, b) => b[1].length - a[1].length);
  if (!groups.length) return <EmptyState title="No verified alumni yet" />;
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {groups.map(([city, list]) => (
        <div key={city} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
          <div className="flex items-center justify-between"><p className="text-[15px] font-semibold text-[#16264A]">{city}</p><span className="text-[13px] text-[#5A6577]">{list.length} member{list.length === 1 ? '' : 's'}</span></div>
          <p className="text-[12px] text-[#5A6577] mt-1">{list.filter(a => a.mentor).length} mentor(s) · batches {Math.min(...list.map(a => a.passoutYear))}–{Math.max(...list.map(a => a.passoutYear))}</p>
          <ul className="mt-2 text-[12px] text-[#16264A] space-y-0.5">{list.slice(0, 5).map(a => <li key={a.id}>{a.name} <span className="text-[#5A6577]">· {a.currentOrg}</span></li>)}</ul>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => downloadCSV(`alumni-chapter-${city}`, list.map(a => ({ name: a.name, batch: a.passoutYear, organisation: a.currentOrg, email: a.email ?? '', mobile: a.mobile ?? '' })))}>Contact list</Button>
        </div>
      ))}
    </div>
  );
}

function Events({ events }: { events: Coll<AlumniEvent> }) {
  const [editing, setEditing] = useState<Stored<AlumniEvent> | 'new' | null>(null);
  const [f, setF] = useState({ name: '', date: '', venue: '', capacity: '', rsvp: '0', notes: '' });
  function open(e: Stored<AlumniEvent> | 'new') { setEditing(e); setF(e === 'new' ? { name: '', date: '', venue: '', capacity: '', rsvp: '0', notes: '' } : { name: e.name, date: e.date, venue: e.venue, capacity: String(e.capacity), rsvp: String(e.rsvp), notes: e.notes ?? '' }); }
  function save() {
    if (!f.name.trim() || !f.date || !(Number(f.capacity) > 0)) { toast.error('Name, date and capacity are required'); return; }
    const doc = { name: f.name.trim(), date: f.date, venue: f.venue.trim(), capacity: Number(f.capacity), rsvp: Number(f.rsvp) || 0, notes: f.notes.trim() || undefined };
    if (editing === 'new') events.add({ id: `EVT-${Date.now().toString(36)}`, ...doc }); else if (editing) events.update(editing.id, doc);
    toast.success('Event saved'); setEditing(null);
  }
  const sorted = [...events.items].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Events</p><Button size="sm" onClick={() => open('new')}>+ New event</Button></div>
      {sorted.length === 0 ? <div className="p-6"><EmptyState title="No events yet" /></div> : (
        <table className="w-full text-[13px]"><thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Event', 'Date', 'Venue', 'RSVP', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{sorted.map(e => <tr key={e.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3 text-[#16264A] font-medium">{e.name}</td><td className="px-4 py-3 text-[#5A6577]">{day(e.date)}{e.date < today() ? ' · past' : ''}</td><td className="px-4 py-3 text-[#5A6577]">{e.venue}</td><td className={`px-4 py-3 tabular-nums ${e.rsvp > e.capacity ? 'text-[#A8242C] font-semibold' : ''}`}>{e.rsvp}/{e.capacity}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => open(e)}>Edit</Button></td></tr>)}</tbody></table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New event' : 'Edit event'} footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Input label="Event" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <Input label="Date" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          <Input label="Venue" value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} />
          <Input label="Capacity" inputMode="numeric" value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value.replace(/\D/g, '') })} />
          <Input label="RSVPs received" inputMode="numeric" value={f.rsvp} onChange={e => setF({ ...f, rsvp: e.target.value.replace(/\D/g, '') })} />
          <div className="col-span-2"><Input label="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

function MentorshipTab({ mentorships, mentors, nameOf }: { mentorships: Coll<Mentorship>; mentors: Alumnus[]; nameOf: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ alumnusId: mentors[0]?.id ?? '', student: '', topic: '' });
  function add() {
    if (!f.alumnusId || !f.student.trim() || !f.topic.trim()) { toast.error('Mentor, student and topic are required'); return; }
    mentorships.add({ id: `MEN-${Date.now().toString(36)}`, alumnusId: f.alumnusId, student: f.student.trim(), topic: f.topic.trim(), startedOn: today(), status: 'active' });
    toast.success('Mentorship started'); setOpen(false); setF({ ...f, student: '', topic: '' });
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Mentorship pairs · {mentors.length} mentors available</p><Button size="sm" disabled={!mentors.length} onClick={() => setOpen(true)}>+ Pair a student</Button></div>
      {mentorships.items.length === 0 ? <div className="p-6"><EmptyState title="No mentorships yet" description={mentors.length ? 'Pair a current student with an alumni mentor.' : 'Mark alumni willing to mentor in the directory first.'} /></div> : (
        <table className="w-full text-[13px]"><thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Mentor', 'Student', 'Topic', 'Since', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{mentorships.items.map(m => <tr key={m.id} className={`border-b border-[#EDEFF3] ${m.status === 'closed' ? 'opacity-50' : ''}`}><td className="px-4 py-3 text-[#16264A]">{nameOf(m.alumnusId)}</td><td className="px-4 py-3 text-[#16264A]">{m.student}</td><td className="px-4 py-3 text-[#5A6577]">{m.topic}</td><td className="px-4 py-3 text-[#5A6577]">{day(m.startedOn)}</td><td className="px-4 py-3 text-right">{m.status === 'active' && <Button size="sm" variant="ghost" onClick={() => mentorships.update(m.id, { status: 'closed' })}>Close</Button>}</td></tr>)}</tbody></table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Pair a student with a mentor" footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={add}>Pair</Button></>}>
        <div className="space-y-3">
          <Select label="Mentor" value={f.alumnusId} onChange={e => setF({ ...f, alumnusId: e.target.value })}>{mentors.map(m => <option key={m.id} value={m.id}>{m.name} — {m.currentRole}, {m.currentOrg}</option>)}</Select>
          <Input label="Student (name and enrolment no.)" value={f.student} onChange={e => setF({ ...f, student: e.target.value })} />
          <Input label="Topic" value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })} placeholder="Career in data science" />
        </div>
      </Modal>
    </div>
  );
}

function Giving({ contributions, alumni, nameOf }: { contributions: Coll<Contribution>; alumni: Alumnus[]; nameOf: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ alumnusId: alumni[0]?.id ?? '', amount: '', date: today(), purpose: '', receiptNo: '', mode: 'Bank transfer' });
  function add() {
    if (!f.alumnusId || !(Number(f.amount) > 0) || !f.purpose.trim() || !f.receiptNo.trim()) { toast.error('Donor, amount, purpose and receipt number are required'); return; }
    contributions.add({ id: `CON-${Date.now().toString(36)}`, alumnusId: f.alumnusId, amount: Number(f.amount), date: f.date, purpose: f.purpose.trim(), receiptNo: f.receiptNo.trim(), mode: f.mode });
    toast.success('Contribution recorded'); setOpen(false); setF({ ...f, amount: '', purpose: '', receiptNo: '' });
  }
  const sorted = [...contributions.items].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A] flex-1">Contributions · {inr(contributions.items.reduce((n, c) => n + c.amount, 0))}</p><Button size="sm" variant="secondary" disabled={!sorted.length} onClick={() => downloadCSV('alumni-contributions', sorted.map(c => ({ date: c.date, donor: nameOf(c.alumnusId), amount: c.amount, purpose: c.purpose, receipt: c.receiptNo, mode: c.mode })))}>Export CSV</Button><Button size="sm" disabled={!alumni.length} onClick={() => setOpen(true)}>+ Record</Button></div>
      {sorted.length === 0 ? <div className="p-6"><EmptyState title="No contributions recorded" /></div> : (
        <table className="w-full text-[13px]"><thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Date', 'Donor', 'Purpose', 'Amount', 'Receipt'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{sorted.map(c => <tr key={c.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-3 text-[#5A6577]">{day(c.date)}</td><td className="px-4 py-3 text-[#16264A]">{nameOf(c.alumnusId)}</td><td className="px-4 py-3 text-[#5A6577]">{c.purpose}</td><td className="px-4 py-3 tabular-nums font-medium">{inr(c.amount)}</td><td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{c.receiptNo} · {c.mode}</td></tr>)}</tbody></table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Record contribution" footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={add}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Select label="Donor" value={f.alumnusId} onChange={e => setF({ ...f, alumnusId: e.target.value })}>{alumni.map(a => <option key={a.id} value={a.id}>{a.name} ({a.passoutYear})</option>)}</Select></div>
          <Input label="Amount (₹)" inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
          <Input label="Date" type="date" value={f.date} max={today()} onChange={e => setF({ ...f, date: e.target.value })} />
          <div className="col-span-2"><Input label="Purpose" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })} placeholder="Scholarship fund, lab equipment…" /></div>
          <Input label="Receipt no. (accounts)" value={f.receiptNo} onChange={e => setF({ ...f, receiptNo: e.target.value })} />
          <Select label="Mode" value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>{['Bank transfer', 'Cheque', 'UPI', 'Cash', 'In kind'].map(m => <option key={m}>{m}</option>)}</Select>
        </div>
      </Modal>
    </div>
  );
}

function Stories({ stories, alumni, nameOf }: { stories: Coll<Story>; alumni: Alumnus[]; nameOf: (id: string) => string }) {
  const [editing, setEditing] = useState<Stored<Story> | 'new' | null>(null);
  const [f, setF] = useState({ alumnusId: alumni[0]?.id ?? '', headline: '', body: '', featured: false });
  function open(s: Stored<Story> | 'new') { setEditing(s); setF(s === 'new' ? { alumnusId: alumni[0]?.id ?? '', headline: '', body: '', featured: false } : { alumnusId: s.alumnusId, headline: s.headline, body: s.body, featured: s.featured }); }
  function save() {
    if (!f.alumnusId || !f.headline.trim() || f.body.trim().length < 20) { toast.error('Alumnus, headline and a story of at least 20 characters are required'); return; }
    const doc = { alumnusId: f.alumnusId, headline: f.headline.trim(), body: f.body.trim(), featured: f.featured };
    if (editing === 'new') stories.add({ id: `STY-${Date.now().toString(36)}`, published: false, ...doc }); else if (editing) stories.update(editing.id, doc);
    toast.success('Story saved'); setEditing(null);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Alumni stories</p><Button size="sm" disabled={!alumni.length} onClick={() => open('new')}>+ New story</Button></div>
      {stories.items.length === 0 ? <div className="p-6"><EmptyState title="No stories yet" /></div> : (
        <ul className="divide-y divide-[#EDEFF3]">{stories.items.map(s => (
          <li key={s.id} className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0"><p className="text-[14px] font-medium text-[#16264A]">{s.headline}{s.featured && <span className="ml-2 text-[10px] font-semibold text-[#E0952A]">FEATURED</span>}</p><p className="text-[12px] text-[#5A6577]">{nameOf(s.alumnusId)} · {s.published ? 'Published' : 'Draft'}</p></div>
            <Button size="sm" variant={s.published ? 'ghost' : 'primary'} onClick={() => { stories.update(s.id, { published: !s.published }); toast.success(s.published ? 'Unpublished' : 'Published'); }}>{s.published ? 'Unpublish' : 'Publish'}</Button>
            <Button size="sm" variant="ghost" onClick={() => open(s)}>Edit</Button>
          </li>
        ))}</ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New story' : 'Edit story'} width="600px" footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <Select label="Alumnus" value={f.alumnusId} onChange={e => setF({ ...f, alumnusId: e.target.value })}>{alumni.map(a => <option key={a.id} value={a.id}>{a.name} ({a.passoutYear})</option>)}</Select>
          <Input label="Headline" value={f.headline} onChange={e => setF({ ...f, headline: e.target.value })} />
          <label className="flex flex-col gap-1"><span className="text-[13px] font-medium text-[#16264A]">Story</span><textarea rows={6} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#16264A]" /></label>
          <Toggle on={f.featured} onChange={v => setF({ ...f, featured: v })} label="Feature on the alumni page" />
        </div>
      </Modal>
    </div>
  );
}

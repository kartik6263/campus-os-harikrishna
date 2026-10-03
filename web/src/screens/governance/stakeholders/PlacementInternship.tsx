import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { useAuth, displayName } from '../../../lib/auth';
import { downloadCSV } from '../../../lib/export';
import { useCollection, useFiles, type Stored } from '../../../lib/records';
import {
  SAMPLE_DRIVES, STATUS_LABEL, STATUS_TONE, pkg, statusOf,
  type AppStatus, type Company, type Drive, type Outcome, type OutcomeStatus, type PlacementApp,
} from '../../../lib/placement';

/**
 * The training & placement cell: drives and internships, every applicant
 * with their résumé, shortlists, interview rounds and offers, the recruiters
 * on the panel, and the placement statistics NIRF asks for.
 */

const OUTCOMES = 'desk:placement-outcomes';
const day = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
type Row = { app: Stored<PlacementApp>; outcome: Stored<Outcome> | null; status: AppStatus };

export default function PlacementInternship() {
  const [tab, setTab] = useState('drives');
  const qc = useQueryClient();
  const { user } = useAuth();
  const drives = useCollection<Drive>('campus:placement-drives', SAMPLE_DRIVES);
  const apps = useCollection<PlacementApp>('student:placement-applications', []);
  const outcomes = useCollection<Outcome>(OUTCOMES, []);
  const companies = useCollection<Company>('acad:placement-companies', []);

  const rows: Row[] = useMemo(() => apps.items.map(app => {
    const outcome = outcomes.items.find(o => o.id === app.id && o._studentId === app._studentId) ?? null;
    return { app, outcome, status: statusOf(app, outcome) };
  }), [apps.items, outcomes.items]);

  async function decide(row: Row, status: OutcomeStatus, extra: Partial<Outcome> = {}) {
    const at = new Date().toISOString();
    const by = displayName(user) || 'Placement cell';
    const entry = { status, at, by, ...(extra.note ? { note: extra.note } : {}), ...(extra.round ? { round: extra.round } : {}) };
    if (row.outcome) {
      outcomes.update(row.outcome._rid ?? row.outcome.id, { ...extra, status, at, by, history: [...(row.outcome.history ?? []), entry] });
    } else {
      await api(`/api/records/${OUTCOMES}`, { method: 'POST', body: { studentId: row.app._studentId, data: { id: row.app.id, status, at, by, ...extra, history: [entry] } } });
      await qc.invalidateQueries({ queryKey: ['records', OUTCOMES] });
    }
  }

  const placed = new Set(rows.filter(r => r.status === 'accepted' && r.app.kind === 'placement').map(r => r.app._studentId)).size;
  const loading = drives.isLoading || apps.isLoading || outcomes.isLoading;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Training & Placement</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Drives, internships, applicants, offers and recruiters</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Open drives', drives.items.filter(d => d.status === 'open').length], ['Applications', rows.filter(r => r.status !== 'withdrawn').length], ['Offers', rows.filter(r => ['offer', 'accepted', 'declined'].includes(r.status)).length], ['Students placed', placed]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'drives', label: 'Drives & Internships' }, { id: 'applicants', label: 'Applicants & Offers' }, { id: 'companies', label: 'Recruiters' }, { id: 'stats', label: 'Statistics & NIRF' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'drives' && <DrivesTab drives={drives} rows={rows} companies={companies.items} />}
            {tab === 'applicants' && <ApplicantsTab drives={drives.items} rows={rows} decide={decide} />}
            {tab === 'companies' && <CompaniesTab companies={companies} drives={drives.items} />}
            {tab === 'stats' && <StatsTab drives={drives.items} rows={rows} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Drives ──────────────────────────────────────────────────────────────────

const blank = { company: '', role: '', kind: 'placement' as Drive['kind'], package: '', location: '', description: '', minCgpa: '', programmes: '', deadline: '', driveDate: '', rounds: 'Aptitude test, Technical interview, HR interview' };

function DrivesTab({ drives, rows, companies }: { drives: ReturnType<typeof useCollection<Drive>>; rows: Row[]; companies: Company[] }) {
  const [editing, setEditing] = useState<Stored<Drive> | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const [kind, setKind] = useState('');

  function open(d: Stored<Drive> | 'new') {
    setEditing(d);
    setF(d === 'new' ? blank : { company: d.company, role: d.role, kind: d.kind, package: String(d.package), location: d.location, description: d.description, minCgpa: d.minCgpa?.toString() ?? '', programmes: d.programmes.join(', '), deadline: d.deadline, driveDate: d.driveDate ?? '', rounds: d.rounds.join(', ') });
  }
  function save() {
    if (!f.company.trim() || !f.role.trim() || !(Number(f.package) > 0) || !f.deadline) { toast.error('Company, role, package and deadline are required'); return; }
    const doc = {
      company: f.company.trim(), role: f.role.trim(), kind: f.kind, package: Number(f.package), location: f.location.trim(), description: f.description.trim(),
      minCgpa: f.minCgpa ? Number(f.minCgpa) : undefined, programmes: f.programmes.split(',').map(s => s.trim()).filter(Boolean),
      deadline: f.deadline, driveDate: f.driveDate || undefined, rounds: f.rounds.split(',').map(s => s.trim()).filter(Boolean),
    };
    if (editing === 'new') drives.add({ id: `DRV-${Date.now().toString(36).toUpperCase()}`, status: 'open', ...doc });
    else if (editing) drives.update(editing.id, doc);
    toast.success(editing === 'new' ? 'Drive opened — eligible students can apply now' : 'Drive updated');
    setEditing(null);
  }
  const shown = drives.items.filter(d => !kind || d.kind === kind);

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A] flex-1">Drives</p>
        <Select value={kind} onChange={e => setKind(e.target.value)} className="w-40"><option value="">All</option><option value="placement">Placements</option><option value="internship">Internships</option></Select>
        <Button size="sm" onClick={() => open('new')}>+ New drive</Button>
      </div>
      {shown.length === 0 ? <div className="p-6"><EmptyState title="No drives yet" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Company / role', 'Package', 'Eligibility', 'Apply by', 'Applicants', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{shown.map(d => {
              const n = rows.filter(r => r.app.driveId === d.id && r.status !== 'withdrawn').length;
              return (
                <tr key={d.id} className="border-b border-[#EDEFF3]">
                  <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{d.company}</p><p className="text-[11px] text-[#5A6577]">{d.role} · {d.kind === 'internship' ? 'Internship' : 'Full-time'} · {d.location}</p></td>
                  <td className="px-4 py-3 text-[#0E7A5F] font-medium">{pkg(d)}</td>
                  <td className="px-4 py-3 text-[12px] text-[#5A6577]">{d.minCgpa ? `CGPA ≥ ${d.minCgpa}` : 'Any CGPA'} · {d.programmes.join(', ') || 'All programmes'}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{day(d.deadline)}</td>
                  <td className="px-4 py-3 tabular-nums">{n}</td>
                  <td className="px-4 py-3"><Select value={d.status} onChange={e => { drives.update(d.id, { status: e.target.value as Drive['status'] }); toast.success('Status updated'); }} className="w-32">{['open', 'closed', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}</Select></td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => open(d)}>Edit</Button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New drive' : 'Edit drive'} width="640px" footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input label="Company *" list="placement-companies" value={f.company} onChange={e => setF({ ...f, company: e.target.value })} />
            <datalist id="placement-companies">{companies.filter(c => c.status === 'empanelled').map(c => <option key={c.id} value={c.name} />)}</datalist>
          </div>
          <Input label="Role *" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} />
          <Select label="Kind" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as Drive['kind'] })}><option value="placement">Full-time placement</option><option value="internship">Internship</option></Select>
          <Input label={f.kind === 'internship' ? 'Stipend (₹/month) *' : 'CTC (lakh per annum) *'} inputMode="decimal" value={f.package} onChange={e => setF({ ...f, package: e.target.value.replace(/[^\d.]/g, '') })} />
          <Input label="Location" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
          <Input label="Minimum CGPA" inputMode="decimal" value={f.minCgpa} onChange={e => setF({ ...f, minCgpa: e.target.value.replace(/[^\d.]/g, '') })} />
          <Input label="Programmes (comma-separated, blank = all)" value={f.programmes} onChange={e => setF({ ...f, programmes: e.target.value })} placeholder="BCA, MCA" />
          <Input label="Selection rounds (comma-separated)" value={f.rounds} onChange={e => setF({ ...f, rounds: e.target.value })} />
          <Input label="Apply by *" type="date" value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} />
          <Input label="Drive date" type="date" value={f.driveDate} onChange={e => setF({ ...f, driveDate: e.target.value })} />
          <div className="col-span-2"><Input label="Description" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Applicants & offers ─────────────────────────────────────────────────────

function ApplicantsTab({ drives, rows, decide }: { drives: Drive[]; rows: Row[]; decide: (r: Row, s: OutcomeStatus, extra?: Partial<Outcome>) => Promise<void> }) {
  const [driveId, setDriveId] = useState(drives[0]?.id ?? '');
  const [status, setStatus] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [offering, setOffering] = useState<Row | null>(null);
  const [offer, setOffer] = useState({ package: '', joiningDate: '', note: '' });
  const [round, setRound] = useState('');
  const [busy, setBusy] = useState(false);
  const drive = drives.find(d => d.id === driveId);
  const list = rows.filter(r => r.app.driveId === driveId && r.status !== 'withdrawn' && (!status || r.status === status));
  const key = (r: Row) => `${r.app._studentId}|${r.app.id}`;

  async function bulk(s: OutcomeStatus) {
    const chosen = list.filter(r => picked.has(key(r)));
    if (!chosen.length) return;
    if (s === 'interview' && !round) { toast.error('Pick the round'); return; }
    setBusy(true);
    try {
      for (const r of chosen) await decide(r, s, s === 'interview' ? { round } : {});
      toast.success(`${chosen.length} applicant(s) marked ${STATUS_LABEL[s].toLowerCase()} — they can see it now`);
      setPicked(new Set());
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not save'); } finally { setBusy(false); }
  }
  async function recordOffer() {
    if (!offering || !(Number(offer.package) > 0)) { toast.error('Enter the package offered'); return; }
    try {
      await decide(offering, 'offer', { package: Number(offer.package), joiningDate: offer.joiningDate || undefined, note: offer.note.trim() || undefined });
      toast.success('Offer recorded — the student can accept it in their portal');
      setOffering(null); setOffer({ package: '', joiningDate: '', note: '' });
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not save'); }
  }

  if (!drives.length) return <EmptyState title="Open a drive first" />;
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Select value={driveId} onChange={e => { setDriveId(e.target.value); setPicked(new Set()); }} className="w-80">{drives.map(d => <option key={d.id} value={d.id}>{d.company} — {d.role}</option>)}</Select>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-44"><option value="">Any status</option>{(Object.keys(STATUS_LABEL) as AppStatus[]).filter(s => s !== 'withdrawn').map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!list.length} onClick={() => downloadCSV(`applicants-${driveId}`, list.map(r => ({ student: r.app._student?.name ?? '', enrolmentNo: r.app._student?.enrolmentNo ?? '', applied: r.app.appliedAt.slice(0, 10), status: STATUS_LABEL[r.status], round: r.outcome?.round ?? '', package: r.outcome?.package ?? '' })))}>Export for recruiter</Button>
      </div>
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-[#FEF9EC] border-b border-[#D3D8E0] text-[13px]">
          <span>{picked.size} selected</span>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void bulk('shortlisted')}>Shortlist</Button>
          <Select value={round} onChange={e => setRound(e.target.value)} className="w-48"><option value="">Interview round…</option>{(drive?.rounds ?? []).map(r => <option key={r}>{r}</option>)}</Select>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void bulk('interview')}>Move to round</Button>
          <Button size="sm" variant="ghost" loading={busy} onClick={() => void bulk('rejected')}>Not selected</Button>
        </div>
      )}
      {list.length === 0 ? <div className="p-6"><EmptyState title="No applicants" description="Eligible students apply from their portal." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[780px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              <th className="px-4 py-2.5 w-8"><input type="checkbox" aria-label="Select all" checked={list.every(r => picked.has(key(r)))} onChange={e => setPicked(e.target.checked ? new Set(list.map(key)) : new Set())} /></th>
              {['Student', 'Applied', 'Résumé', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody>{list.map(r => (
              <tr key={key(r)} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${r.app._student?.name}`} checked={picked.has(key(r))} disabled={['offer', 'accepted', 'declined'].includes(r.status)} onChange={e => { const n = new Set(picked); e.target.checked ? n.add(key(r)) : n.delete(key(r)); setPicked(n); }} /></td>
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{r.app._student?.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.app._student?.enrolmentNo}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{day(r.app.appliedAt)}</td>
                <td className="px-4 py-3"><Resume studentId={r.app._studentId ?? null} /></td>
                <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>{r.outcome?.round && r.status === 'interview' && <p className="text-[11px] text-[#5A6577] mt-0.5">{r.outcome.round}</p>}{r.outcome?.package && ['offer', 'accepted', 'declined'].includes(r.status) && <p className="text-[11px] text-[#0E7A5F] mt-0.5">{pkg({ kind: r.app.kind, package: r.outcome.package })}</p>}</td>
                <td className="px-4 py-3 text-right">{['shortlisted', 'interview', 'applied'].includes(r.status) && <Button size="sm" onClick={() => { setOffering(r); setOffer({ package: drive ? String(drive.package) : '', joiningDate: '', note: '' }); }}>Record offer</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!offering} onClose={() => setOffering(null)} title={offering ? `Offer — ${offering.app._student?.name}` : ''} footer={<><Button size="sm" variant="secondary" onClick={() => setOffering(null)}>Cancel</Button><Button size="sm" onClick={() => void recordOffer()}>Record offer</Button></>}>
        <div className="space-y-3">
          <Input label={offering?.app.kind === 'internship' ? 'Stipend (₹/month)' : 'CTC (lakh per annum)'} inputMode="decimal" value={offer.package} onChange={e => setOffer({ ...offer, package: e.target.value.replace(/[^\d.]/g, '') })} />
          <Input label="Joining date" type="date" value={offer.joiningDate} onChange={e => setOffer({ ...offer, joiningDate: e.target.value })} />
          <Input label="Note to the student" value={offer.note} onChange={e => setOffer({ ...offer, note: e.target.value })} placeholder="e.g. Offer letter will be emailed by HR within a week" />
        </div>
      </Modal>
    </div>
  );
}

function Resume({ studentId }: { studentId: string | null }) {
  const files = useFiles(studentId ? `student:placement/${studentId}` : null);
  if (files.isLoading) return <span className="text-[12px] text-[#5A6577]">…</span>;
  const f = files.files[0];
  return f ? <button onClick={() => void files.download(f)} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">Open</button> : <span className="text-[12px] text-[#A8242C]">None</span>;
}

// ─── Recruiters ──────────────────────────────────────────────────────────────

function CompaniesTab({ companies, drives }: { companies: ReturnType<typeof useCollection<Company>>; drives: Drive[] }) {
  const [open, setOpen] = useState<Stored<Company> | 'new' | null>(null);
  const [f, setF] = useState({ name: '', sector: 'IT Services', contactName: '', email: '', phone: '', notes: '' });
  function edit(c: Stored<Company> | 'new') {
    setOpen(c);
    setF(c === 'new' ? { name: '', sector: 'IT Services', contactName: '', email: '', phone: '', notes: '' } : { name: c.name, sector: c.sector, contactName: c.contactName, email: c.email, phone: c.phone, notes: c.notes ?? '' });
  }
  function save() {
    if (!f.name.trim() || !f.contactName.trim()) { toast.error('Company and contact person are required'); return; }
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) { toast.error('Not a valid email'); return; }
    const doc = { name: f.name.trim(), sector: f.sector, contactName: f.contactName.trim(), email: f.email.trim(), phone: f.phone.trim(), notes: f.notes.trim() || undefined };
    if (open === 'new') companies.add({ id: `CO-${Date.now().toString(36).toUpperCase()}`, status: 'pending', since: new Date().toISOString().slice(0, 10), ...doc });
    else if (open) companies.update(open.id, doc);
    toast.success('Recruiter saved');
    setOpen(null);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Recruiter panel</p><Button size="sm" onClick={() => edit('new')}>+ Add recruiter</Button></div>
      {companies.items.length === 0 ? <div className="p-6"><EmptyState title="No recruiters yet" description="Keep each recruiter's HR contact and status; empanelled ones are suggested when you open a drive." /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Company', 'Sector', 'Contact', 'Drives', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{companies.items.map(c => (
            <tr key={c.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3 text-[#16264A] font-medium">{c.name}{c.notes && <p className="text-[11px] text-[#5A6577] font-normal">{c.notes}</p>}</td>
              <td className="px-4 py-3 text-[#5A6577]">{c.sector}</td>
              <td className="px-4 py-3 text-[12px] text-[#5A6577]">{c.contactName}<br />{c.email} {c.phone}</td>
              <td className="px-4 py-3 tabular-nums">{drives.filter(d => d.company.toLowerCase() === c.name.toLowerCase()).length}</td>
              <td className="px-4 py-3"><Select value={c.status} onChange={e => { companies.update(c.id, { status: e.target.value as Company['status'] }); toast.success('Status updated'); }} className="w-36"><option value="pending">Pending</option><option value="empanelled">Empanelled</option><option value="blacklisted">Blacklisted</option></Select></td>
              <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => edit(c)}>Edit</Button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open === 'new' ? 'Add recruiter' : 'Edit recruiter'} footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Company" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <Select label="Sector" value={f.sector} onChange={e => setF({ ...f, sector: e.target.value })}>{['IT Services', 'Product', 'BFSI', 'Manufacturing', 'Consulting', 'Education', 'Healthcare', 'Government', 'Other'].map(s => <option key={s}>{s}</option>)}</Select>
          <Input label="HR contact" value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} />
          <Input label="Email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <Input label="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
          <Input label="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Statistics & NIRF ───────────────────────────────────────────────────────

function StatsTab({ drives, rows }: { drives: Drive[]; rows: Row[] }) {
  const accepted = rows.filter(r => r.status === 'accepted' && r.app.kind === 'placement' && r.outcome?.package);
  const pkgs = accepted.map(r => r.outcome!.package!).sort((a, b) => a - b);
  const median = pkgs.length ? (pkgs.length % 2 ? pkgs[(pkgs.length - 1) / 2]! : (pkgs[pkgs.length / 2 - 1]! + pkgs[pkgs.length / 2]!) / 2) : 0;
  const applicants = new Set(rows.filter(r => r.status !== 'withdrawn' && r.app.kind === 'placement').map(r => r.app._studentId)).size;
  const placed = new Set(accepted.map(r => r.app._studentId)).size;
  const offersMade = rows.filter(r => ['offer', 'accepted', 'declined'].includes(r.status)).length;
  const byCompany = [...accepted.reduce((m, r) => m.set(r.app.company, (m.get(r.app.company) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const interns = rows.filter(r => r.status === 'accepted' && r.app.kind === 'internship').length;

  const tiles: Array<[string, string]> = [
    ['Students placed', String(placed)], ['Placement rate (of applicants)', applicants ? `${Math.round((placed / applicants) * 100)}%` : '—'],
    ['Median CTC', median ? `₹${median} LPA` : '—'], ['Highest CTC', pkgs.length ? `₹${pkgs[pkgs.length - 1]} LPA` : '—'],
    ['Offers made', String(offersMade)], ['Internships accepted', String(interns)],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map(([l, v]) => <div key={l} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4"><p className="text-[22px] font-semibold text-[#16264A] tabular-nums">{v}</p><p className="text-[12px] text-[#5A6577]">{l}</p></div>)}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5">
          <p className="text-[14px] font-semibold text-[#16264A] mb-3">Accepted offers by recruiter</p>
          {byCompany.length === 0 ? <p className="text-[13px] text-[#5A6577]">None yet.</p> : byCompany.map(([c, n]) => <div key={c} className="flex justify-between text-[13px] py-1 border-b border-[#EDEFF3] last:border-0"><span className="text-[#16264A]">{c}</span><span className="tabular-nums">{n}</span></div>)}
        </div>
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
          <p className="text-[14px] font-semibold text-[#16264A]">NIRF graduation outcome data</p>
          <p className="text-[13px] text-[#5A6577]">NIRF asks for students placed and the median salary for each graduating batch. This export is computed from accepted full-time offers recorded here.</p>
          <InlineAlert type="info">Record every offer and the student's acceptance before exporting, so the figures are complete.</InlineAlert>
          <Button variant="secondary" disabled={!accepted.length} onClick={() => downloadCSV('nirf-placement', [
            ...accepted.map(r => ({ student: r.app._student?.name ?? '', enrolmentNo: r.app._student?.enrolmentNo ?? '', company: r.app.company, role: r.app.role, ctcLpa: r.outcome!.package, joining: r.outcome!.joiningDate ?? '' })),
          ])}>Export placed students (CSV)</Button>
          <p className="text-[12px] text-[#5A6577]">{drives.length} drives · {placed} placed · median ₹{median || 0} LPA</p>
        </div>
      </div>
    </div>
  );
}

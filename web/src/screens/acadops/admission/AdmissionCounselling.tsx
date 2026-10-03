import { useMemo, useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { downloadCSV, downloadTablePdf } from '../../../lib/export';
import { useAdmissions, type ApiAdmission } from '../../../lib/officequeries';
import { useCollection, type Stored } from '../../../lib/records';
import type { Screen } from '../../../lib/data';

/**
 * University-level admissions: every application the college counters have
 * taken, merit lists ranked from the merit ranks recorded at intake, the seat
 * matrix with seats filled counted from actual enrolments, and the funnel.
 *
 * Applications are opened, verified and enrolled at the College Office
 * counter; this screen reads the same records and never forks them.
 */

const CATEGORIES = ['GEN', 'EWS', 'OBC', 'SC', 'ST'] as const;
type Category = typeof CATEGORIES[number];

interface SeatRow { id: string; programmeCode: string; programme: string; seats: Record<Category, number>; frozen?: boolean }
interface MeritList { id: string; programmeCode: string; programme: string; round: number; publishedAt: string; publishedBy?: string; entries: Array<{ rank: number; applicationNo: string; name: string; category: string; meritRank: number; status: string }> }

const STATUS_LABEL: Record<string, string> = { PENDING_DOCS: 'Documents pending', VERIFIED: 'Verified', ENROLLED: 'Enrolled', REJECTED: 'Rejected' };
const STATUS_TONE: Record<string, string> = {
  PENDING_DOCS: 'bg-[#FEF9EC] text-[#8A6D1F]', VERIFIED: 'bg-[#EFF6FF] text-[#1D4ED8]',
  ENROLLED: 'bg-[#D1FAE5] text-[#0E7A5F]', REJECTED: 'bg-[#FEE2E2] text-[#A8242C]',
};
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
/** Applicants record categories loosely ("General", "obc"); seats are counted against the standard five. */
function normCat(c: string | null): Category {
  const u = (c ?? '').trim().toUpperCase();
  if (u.startsWith('GEN') || u === 'UR' || u === 'OPEN' || u === '') return 'GEN';
  return (CATEGORIES as readonly string[]).includes(u) ? (u as Category) : 'GEN';
}

export default function AdmissionCounselling({ onNavigate }: { onNavigate?: (s: Screen) => void }) {
  const [tab, setTab] = useState('applications');
  const q = useAdmissions();
  const apps = q.data ?? [];
  const programmes = useMemo(() => [...new Map(apps.map(a => [a.programme.code, a.programme])).values()].sort((a, b) => a.name.localeCompare(b.name)), [apps]);
  const count = (s: string) => apps.filter(a => a.status === s).length;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Admission & Counselling</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Applications, merit lists, seat matrix and the admission funnel</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Applications', apps.length], ['Docs pending', count('PENDING_DOCS')], ['Verified', count('VERIFIED')], ['Enrolled', count('ENROLLED')]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'applications', label: 'Applications' }, { id: 'merit', label: 'Merit Lists' }, { id: 'seats', label: 'Seat Matrix' }, { id: 'analytics', label: 'Analytics' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {q.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : q.isError ? <InlineAlert type="error">{errText(q.error)}</InlineAlert> : (
          <>
            {tab === 'applications' && <ApplicationsTab apps={apps} programmes={programmes} onNavigate={onNavigate} />}
            {tab === 'merit' && <MeritTab apps={apps} programmes={programmes} />}
            {tab === 'seats' && <SeatsTab apps={apps} programmes={programmes} />}
            {tab === 'analytics' && <AnalyticsTab apps={apps} programmes={programmes} />}
          </>
        )}
      </div>
    </div>
  );
}

type Prog = { code: string; shortName: string; name: string };

// ─── Applications ────────────────────────────────────────────────────────────

function ApplicationsTab({ apps, programmes, onNavigate }: { apps: ApiAdmission[]; programmes: Prog[]; onNavigate?: (s: Screen) => void }) {
  const [prog, setProg] = useState('');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ApiAdmission | null>(null);
  const s = search.trim().toLowerCase();
  const rows = apps.filter(a => (!prog || a.programme.code === prog) && (!status || a.status === status) && (!cat || normCat(a.category) === cat) &&
    (!s || a.name.toLowerCase().includes(s) || a.applicationNo.toLowerCase().includes(s) || (a.mobile ?? '').includes(s)));

  return (
    <>
      <InlineAlert type="info">
        Applications are opened, verified and enrolled at the College Office admission counter. This view covers every college.
        {onNavigate && <button onClick={() => onNavigate('college-office')} className="ml-2 underline cursor-pointer">Open the admission counter →</button>}
      </InlineAlert>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
          <Input placeholder="Search name, application no. or mobile" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[220px]" />
          <Select value={prog} onChange={e => setProg(e.target.value)} className="w-48"><option value="">All programmes</option>{programmes.map(p => <option key={p.code} value={p.code}>{p.shortName}</option>)}</Select>
          <Select value={cat} onChange={e => setCat(e.target.value)} className="w-32"><option value="">All categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</Select>
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-44"><option value="">Any status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('admission-applications', rows.map(a => ({ applicationNo: a.applicationNo, name: a.name, programme: a.programme.shortName, category: a.category ?? '', meritRank: a.meritRank ?? '', mobile: a.mobile ?? '', email: a.email ?? '', applied: a.admissionDate.slice(0, 10), documents: `${a.documentsVerified}/${a.documentsRequired}`, status: STATUS_LABEL[a.status] ?? a.status })))}>Export CSV</Button>
        </div>
        {rows.length === 0 ? <div className="p-6"><EmptyState title={apps.length ? 'No applications match' : 'No applications yet'} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[860px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Application', 'Applicant', 'Programme', 'Category', 'Merit rank', 'Documents', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA]">
                    <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{a.applicationNo}<p className="font-sans text-[11px]">{day(a.admissionDate)}</p></td>
                    <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{a.name}</p><p className="text-[11px] text-[#5A6577]">{a.mobile ?? a.email ?? ''}</p></td>
                    <td className="px-4 py-3 text-[#5A6577]">{a.programme.shortName}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{a.category ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-[#16264A]">{a.meritRank ?? '—'}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{a.documentsVerified}/{a.documentsRequired}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status] ?? a.status}</span></td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setOpen(a)}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.name} — ${open.applicationNo}` : ''} width="560px" footer={<Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
        {open && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[['Programme', open.programme.name], ['Status', STATUS_LABEL[open.status] ?? open.status], ['Category', open.category ?? '—'], ['Merit rank', String(open.meritRank ?? '—')], ['Date of birth', day(open.dob)], ['Gender', open.gender ?? '—'], ['Mobile', open.mobile ?? '—'], ['Email', open.email ?? '—']].map(([l, v]) => (
                <div key={l}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[#16264A]">{v}</p></div>
              ))}
            </div>
            {open.rejectReason && <InlineAlert type="error">Rejected: {open.rejectReason}</InlineAlert>}
            <div>
              <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Documents</p>
              <ul className="divide-y divide-[#EDEFF3] border border-[#D3D8E0] rounded-[4px]">
                {open.documents.map(d => (
                  <li key={d.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#16264A]">{d.name}{d.required ? '' : ' (optional)'}</span>
                    <span className={`text-[12px] ${d.verified ? 'text-[#0E7A5F]' : d.uploaded ? 'text-[#8A6D1F]' : 'text-[#A8242C]'}`}>{d.verified ? `Verified${d.verifiedBy ? ` by ${d.verifiedBy}` : ''}` : d.uploaded ? 'Received, not verified' : 'Not received'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ─── Merit lists ─────────────────────────────────────────────────────────────

function MeritTab({ apps, programmes }: { apps: ApiAdmission[]; programmes: Prog[] }) {
  const lists = useCollection<MeritList>('acad:merit-lists', []);
  const [prog, setProg] = useState(programmes[0]?.code ?? '');
  const [viewing, setViewing] = useState<Stored<MeritList> | null>(null);
  const p = programmes.find(x => x.code === prog);

  // Candidates still in the race, by the merit rank recorded at intake.
  const ranked = apps
    .filter(a => a.programme.code === prog && a.status !== 'REJECTED' && a.meritRank != null)
    .sort((a, b) => a.meritRank! - b.meritRank! || a.applicationNo.localeCompare(b.applicationNo));
  const unranked = apps.filter(a => a.programme.code === prog && a.status !== 'REJECTED' && a.meritRank == null).length;
  const published = lists.items.filter(l => l.programmeCode === prog).sort((a, b) => b.round - a.round);
  const nextRound = (published[0]?.round ?? 0) + 1;

  function publish() {
    if (!p || !ranked.length) return;
    if (!window.confirm(`Publish round ${nextRound} merit list for ${p.shortName} with ${ranked.length} candidates? A published list cannot be edited.`)) return;
    lists.add({
      id: `ML-${p.code}-${nextRound}`, programmeCode: p.code, programme: p.name, round: nextRound, publishedAt: new Date().toISOString(),
      entries: ranked.map((a, i) => ({ rank: i + 1, applicationNo: a.applicationNo, name: a.name, category: a.category ?? 'GEN', meritRank: a.meritRank!, status: a.status })),
    });
    toast.success(`Round ${nextRound} merit list published for ${p.shortName}`);
  }

  const pdf = (l: MeritList) => downloadTablePdf(`${l.programme} — Merit List, Round ${l.round}`, l.entries.map(e => ({ Rank: e.rank, 'Application No.': e.applicationNo, Name: e.name, Category: e.category, 'Merit Rank': e.meritRank })), undefined, `Published ${day(l.publishedAt)}`);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Select label="Programme" value={prog} onChange={e => setProg(e.target.value)} className="w-72">{programmes.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}</Select>
        <div className="flex-1" />
        <Button variant="secondary" disabled={!ranked.length} onClick={() => downloadCSV(`merit-draft-${prog}`, ranked.map((a, i) => ({ rank: i + 1, applicationNo: a.applicationNo, name: a.name, category: a.category ?? '', meritRank: a.meritRank, status: STATUS_LABEL[a.status] })))}>Download draft</Button>
        <Button disabled={!ranked.length} onClick={publish}>Publish round {nextRound}</Button>
      </div>
      {unranked > 0 && <InlineAlert type="warning">{unranked} application(s) for this programme have no merit rank and are left out. Record the rank at the admission counter.</InlineAlert>}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px]">
          <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">Current standing — {ranked.length} candidates</p>
          {ranked.length === 0 ? <div className="p-6"><EmptyState title="No ranked applications for this programme" /></div> : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-[#EDEFF3]"><tr>{['#', 'Applicant', 'Category', 'Merit rank', 'Status'].map(h => <th key={h} className="text-left px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody>{ranked.map((a, i) => (
                  <tr key={a.id} className="border-b border-[#EDEFF3]"><td className="px-4 py-2 tabular-nums">{i + 1}</td><td className="px-4 py-2"><p className="text-[#16264A]">{a.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{a.applicationNo}</p></td><td className="px-4 py-2 text-[#5A6577]">{a.category ?? '—'}</td><td className="px-4 py-2 tabular-nums">{a.meritRank}</td><td className="px-4 py-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span></td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
          <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">Published lists</p>
          {lists.isLoading ? <div className="p-6 flex justify-center"><Spinner /></div> : published.length === 0 ? <p className="p-4 text-[13px] text-[#5A6577]">None yet for this programme.</p> : (
            <ul className="divide-y divide-[#EDEFF3]">
              {published.map(l => (
                <li key={l.id} className="px-4 py-3 flex items-center gap-2">
                  <div className="flex-1"><p className="text-[13px] font-medium text-[#16264A]">Round {l.round}</p><p className="text-[11px] text-[#5A6577]">{l.entries.length} candidates · {day(l.publishedAt)}</p></div>
                  <Button size="sm" variant="ghost" onClick={() => setViewing(l)}>View</Button>
                  <Button size="sm" variant="ghost" onClick={() => void pdf(l)}>PDF</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${viewing.programme} — Round ${viewing.round}` : ''} width="640px"
        footer={<><Button size="sm" variant="secondary" onClick={() => viewing && downloadCSV(`merit-${viewing.programmeCode}-round-${viewing.round}`, viewing.entries)}>CSV</Button><Button size="sm" onClick={() => setViewing(null)}>Close</Button></>}>
        {viewing && (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[13px]"><tbody>{viewing.entries.map(e => <tr key={e.applicationNo} className="border-b border-[#EDEFF3]"><td className="py-1.5 w-10 tabular-nums">{e.rank}</td><td className="py-1.5 text-[#16264A]">{e.name}</td><td className="py-1.5 font-mono text-[11px] text-[#5A6577]">{e.applicationNo}</td><td className="py-1.5 text-[#5A6577]">{e.category}</td></tr>)}</tbody></table>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Seat matrix ─────────────────────────────────────────────────────────────

function SeatsTab({ apps, programmes }: { apps: ApiAdmission[]; programmes: Prog[] }) {
  const matrix = useCollection<SeatRow>('acad:seat-matrix', []);
  const [editing, setEditing] = useState<{ code: string; seats: Record<Category, string> } | null>(null);

  const filled = (code: string, c: Category) => apps.filter(a => a.programme.code === code && a.status === 'ENROLLED' && normCat(a.category) === c).length;
  const rowFor = (code: string) => matrix.items.find(r => r.programmeCode === code);

  function save() {
    if (!editing) return;
    const seats = Object.fromEntries(CATEGORIES.map(c => [c, Math.max(0, Number(editing.seats[c]) || 0)])) as Record<Category, number>;
    const p = programmes.find(x => x.code === editing.code)!;
    const existing = rowFor(editing.code);
    if (existing) matrix.update(existing.id, { seats });
    else matrix.add({ id: `SEATS-${p.code}`, programmeCode: p.code, programme: p.name, seats });
    toast.success(`Seats saved for ${p.shortName}`);
    setEditing(null);
  }

  if (matrix.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A]">Sanctioned seats and seats filled (from enrolments)</p>
        <Button size="sm" variant="secondary" onClick={() => downloadCSV('seat-matrix', programmes.map(p => { const r = rowFor(p.code); return { programme: p.name, ...Object.fromEntries(CATEGORIES.flatMap(c => [[`${c}_seats`, r?.seats[c] ?? 0], [`${c}_filled`, filled(p.code, c)]])) }; }))}>Export CSV</Button>
      </div>
      {programmes.length === 0 ? <div className="p-6"><EmptyState title="No programmes have applications yet" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[820px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase">Programme</th>{CATEGORIES.map(c => <th key={c} className="text-center px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase">{c}</th>)}<th className="text-center px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase">Total</th><th /></tr></thead>
            <tbody>
              {programmes.map(p => {
                const r = rowFor(p.code);
                const totalSeats = r ? CATEGORIES.reduce((n, c) => n + r.seats[c], 0) : 0;
                const totalFilled = CATEGORIES.reduce((n, c) => n + filled(p.code, c), 0);
                return (
                  <tr key={p.code} className="border-b border-[#EDEFF3]">
                    <td className="px-4 py-3 text-[#16264A] font-medium">{p.name}</td>
                    {CATEGORIES.map(c => {
                      const f = filled(p.code, c); const s = r?.seats[c] ?? 0;
                      return <td key={c} className={`px-3 py-3 text-center tabular-nums ${s && f > s ? 'text-[#A8242C] font-semibold' : 'text-[#16264A]'}`}>{f}<span className="text-[#5A6577]">/{s}</span></td>;
                    })}
                    <td className="px-3 py-3 text-center tabular-nums font-semibold text-[#16264A]">{totalFilled}/{totalSeats}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing({ code: p.code, seats: Object.fromEntries(CATEGORIES.map(c => [c, String(r?.seats[c] ?? 0)])) as Record<Category, string> })}>{r ? 'Edit' : 'Set seats'}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-3 text-[12px] text-[#5A6577]">Filled counts are enrolled applicants. A red figure means enrolments exceed the sanctioned seats for that category.</p>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Sanctioned seats — ${programmes.find(p => p.code === editing.code)?.shortName}` : ''}
        footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        {editing && (
          <div className="grid grid-cols-5 gap-3">
            {CATEGORIES.map(c => <Input key={c} label={c} inputMode="numeric" value={editing.seats[c]} onChange={e => setEditing({ ...editing, seats: { ...editing.seats, [c]: e.target.value.replace(/\D/g, '') } })} />)}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Analytics ───────────────────────────────────────────────────────────────

function Bar({ label, value, max, tone = '#16264A' }: { label: string; value: number; max: number; tone?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="w-40 shrink-0 truncate text-[#16264A]">{label}</span>
      <div className="flex-1 h-3 bg-[#EDEFF3] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: tone }} /></div>
      <span className="w-12 text-right tabular-nums text-[#16264A]">{value}</span>
    </div>
  );
}

function AnalyticsTab({ apps, programmes }: { apps: ApiAdmission[]; programmes: Prog[] }) {
  if (!apps.length) return <EmptyState title="No applications yet" />;
  const funnel = [
    ['Applied', apps.length],
    ['Documents complete', apps.filter(a => a.status === 'VERIFIED' || a.status === 'ENROLLED').length],
    ['Enrolled', apps.filter(a => a.status === 'ENROLLED').length],
  ] as const;
  const byProg = programmes.map(p => ({ p, n: apps.filter(a => a.programme.code === p.code).length, e: apps.filter(a => a.programme.code === p.code && a.status === 'ENROLLED').length })).sort((a, b) => b.n - a.n);
  const byCat = CATEGORIES.map(c => ({ c, n: apps.filter(a => normCat(a.category) === c).length }));
  const rejected = apps.filter(a => a.status === 'REJECTED');
  const reasons = [...rejected.reduce((m, a) => m.set(a.rejectReason ?? 'No reason given', (m.get(a.rejectReason ?? 'No reason given') ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <p className="text-[14px] font-semibold text-[#16264A]">Admission funnel</p>
        {funnel.map(([l, v]) => <Bar key={l} label={l} value={v} max={apps.length} tone="#E0952A" />)}
        <p className="text-[12px] text-[#5A6577]">Conversion: {Math.round((funnel[2][1] / apps.length) * 100)}% of applicants enrolled · {rejected.length} rejected</p>
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <p className="text-[14px] font-semibold text-[#16264A]">Applications by category</p>
        {byCat.map(x => <Bar key={x.c} label={x.c} value={x.n} max={apps.length} />)}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <p className="text-[14px] font-semibold text-[#16264A]">Demand by programme (applied · enrolled)</p>
        {byProg.map(x => <div key={x.p.code}><Bar label={x.p.shortName} value={x.n} max={byProg[0]?.n ?? 1} /><p className="text-[11px] text-[#5A6577] ml-[172px]">{x.e} enrolled</p></div>)}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-2">
        <p className="text-[14px] font-semibold text-[#16264A]">Top rejection reasons</p>
        {reasons.length === 0 ? <p className="text-[13px] text-[#5A6577]">No rejections.</p> : reasons.map(([r, n]) => <div key={r} className="flex justify-between text-[13px]"><span className="text-[#16264A]">{r}</span><span className="tabular-nums text-[#5A6577]">{n}</span></div>)}
      </div>
    </div>
  );
}

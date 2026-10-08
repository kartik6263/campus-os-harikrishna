import { Fragment, useMemo, useState } from 'react';
import { Button, Checkbox, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { downloadCSV } from '../../lib/export';
import { downloadStoredFile } from '../../lib/records';
import {
  LEAVE_KIND, LEAVE_STATUS, ymd,
  useAddHoliday, useCompliance, useDecideCondonation, useDecideLeave, useDefaulters, useHolidays, useNotifyDefaulters, usePolicy,
  useRemoveHoliday, useRevokeLeave, useSavePolicy, useStaffCondonations, useStaffLeaves, useSummary,
  type CondonationStatus, type Defaulter, type LeaveStatus, type StaffCondonation, type StaffLeave,
} from '../../lib/attendanceadmin';

/**
 * The attendance desk for staff: how every class stands, the shortage list
 * (exportable, with a notice to the students), whether lecturers are taking
 * their roll calls, student leave to approve, condonation of shortages,
 * and the rule itself with the holiday list.
 *
 * What each person sees follows their office: the principal, registrar and
 * administrator the institution; the college office and heads of department
 * their college; a lecturer their own roll calls and their mentees' leave.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const SENIOR = ['PRINCIPAL', 'REGISTRAR', 'ADMIN'];
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-[#D3D8E0] rounded-[4px] ${className}`}>{children}</div>;
}
function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'bad' | 'warn' | 'good' }) {
  const c = tone === 'bad' ? '#A8242C' : tone === 'warn' ? '#8A6D1F' : tone === 'good' ? '#0E7A5F' : '#16264A';
  return <Card className="px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-[#5A6577]">{label}</p><p className="text-[22px] font-bold mt-0.5" style={{ color: c }}>{value}</p></Card>;
}
function Pill({ s }: { s: LeaveStatus | CondonationStatus }) {
  const cls = s === 'APPROVED' ? 'bg-[#D1FAE5] text-[#0E7A5F]' : s === 'REJECTED' ? 'bg-[#FEE2E2] text-[#A8242C]' : s === 'PENDING' ? 'bg-[#FEF9EC] text-[#8A6D1F]' : 'bg-[#EDEFF3] text-[#5A6577]';
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-[2px] ${cls}`}>{s === 'APPROVED' ? 'Approved' : s === 'REJECTED' ? 'Refused' : s === 'PENDING' ? 'Pending' : 'Withdrawn'}</span>;
}
const pctTone = (p: number | null, t: number, w: number) => (p === null ? '#5A6577' : p < t ? '#A8242C' : p < w ? '#8A6D1F' : '#0E7A5F');
function Proof({ file }: { file: { id: string; name: string } | null }) {
  if (!file) return <span className="text-[12px] text-[#5A6577]">None</span>;
  return <button className="text-[12px] text-[#E0952A] cursor-pointer hover:underline" onClick={() => downloadStoredFile(file.id, file.name).catch((e) => toast.error(errText(e)))}>{file.name}</button>;
}

export default function AttendanceAdmin() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const senior = SENIOR.includes(role);
  const isHod = !!user?.faculty?.isHod;
  const reports = role !== 'FACULTY' || isHod;
  const decidesLeave = senior || role === 'FACULTY';
  const tabs = [
    ...(reports ? [{ id: 'overview', label: 'Class-wise' }, { id: 'shortage', label: 'Shortage list' }] : []),
    { id: 'compliance', label: role === 'FACULTY' && !isHod ? 'My roll calls' : 'Roll-call compliance' },
    ...(decidesLeave ? [{ id: 'leave', label: role === 'FACULTY' && !isHod ? "Mentees' leave" : 'Leave approvals' }] : []),
    ...(reports ? [{ id: 'condonation', label: 'Condonation' }] : []),
    { id: 'policy', label: 'Rule & holidays' },
  ];
  const [tab, setTab] = useState(tabs[0]!.id);

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Attendance</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Class-wise standing, shortage, roll-call compliance, student leave and condonation — counted only from submitted roll calls</p>
      </div>
      <div className="bg-white px-4 overflow-x-auto"><Tabs tabs={tabs} activeId={tab} onChange={setTab} /></div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {tab === 'overview' && <Overview />}
        {tab === 'shortage' && <Shortage />}
        {tab === 'compliance' && <ComplianceTab />}
        {tab === 'leave' && <LeaveTab canRevoke={senior || isHod} />}
        {tab === 'condonation' && <CondonationTab canDecide={senior} />}
        {tab === 'policy' && <PolicyTab canEdit={role === 'REGISTRAR' || role === 'ADMIN'} canHolidays={senior} />}
      </div>
    </div>
  );
}

// ─── Class-wise ───────────────────────────────────────────────────────────────

function Overview() {
  const { data, isPending, error } = useSummary();
  const [open, setOpen] = useState<string | null>(null);
  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !data) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  const students = data.classes.reduce((t, c) => t + c.students, 0);
  const short = data.classes.reduce((t, c) => t + c.shortStudents, 0);
  const avgs = data.classes.filter((c) => c.average !== null);
  const avg = avgs.length ? (avgs.reduce((t, c) => t + c.average! * c.students, 0) / avgs.reduce((t, c) => t + c.students, 0)).toFixed(1) : null;

  function exportAll() {
    const rows = data!.classes.flatMap((c) => c.subjects.map((s) => ({ programme: c.programme, semester: c.semester, ...s, lastHeld: s.lastHeld ? s.lastHeld.slice(0, 10) : '' })));
    downloadCSV(`attendance-classwise-${data!.term}`, rows, [
      { key: 'programme', label: 'Programme' }, { key: 'semester', label: 'Semester' }, { key: 'code', label: 'Code' }, { key: 'name', label: 'Subject' }, { key: 'faculty', label: 'Teacher' },
      { key: 'held', label: 'Classes held' }, { key: 'lastHeld', label: 'Last held' }, { key: 'average', label: 'Average %' }, { key: 'below', label: `Below ${data!.threshold}%` }, { key: 'warning', label: `${data!.threshold}–${data!.warnBelow}%` },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Term" value={data.term} />
        <Stat label="Active students" value={students} />
        <Stat label="Average attendance" value={avg ? `${avg}%` : '—'} tone={avg === null ? undefined : Number(avg) < data.threshold ? 'bad' : Number(avg) < data.warnBelow ? 'warn' : 'good'} />
        <Stat label={`Short in a subject (<${data.threshold}%)`} value={short} tone={short ? 'bad' : 'good'} />
      </div>
      <div className="flex justify-end"><Button size="sm" variant="secondary" disabled={!data.classes.length} onClick={exportAll}>Export CSV</Button></div>
      {data.classes.length === 0 && <EmptyState title="No active students" description="Classes appear here once students are enrolled for the term." />}
      {data.classes.map((c) => {
        const k = `${c.programmeId}:${c.semester}`;
        return (
          <Card key={k}>
            <button className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer text-left" onClick={() => setOpen(open === k ? null : k)}>
              <div>
                <p className="text-[14px] font-semibold text-[#16264A]">{c.programme} · Semester {c.semester}</p>
                <p className="text-[12px] text-[#5A6577]">{c.students} students · {c.subjects.length} subjects · {c.shortStudents} short</p>
              </div>
              <span className="text-[18px] font-bold" style={{ color: pctTone(c.average, data.threshold, data.warnBelow) }}>{c.average === null ? '—' : `${c.average}%`}</span>
            </button>
            {open === k && (
              <div className="overflow-x-auto border-t border-[#EDEFF3]">
                <table className="w-full text-[13px]">
                  <thead className="bg-[#F7F8FA]"><tr><Th>Subject</Th><Th>Teacher</Th><Th right>Held</Th><Th>Last held</Th><Th right>Average</Th><Th right>Short</Th><Th right>Near line</Th></tr></thead>
                  <tbody>
                    {c.subjects.map((s) => (
                      <tr key={s.code} className="border-t border-[#EDEFF3]">
                        <td className="px-3 py-2"><span className="font-mono text-[12px] text-[#5A6577]">{s.code}</span> {s.name}</td>
                        <td className="px-3 py-2 text-[#5A6577]">{s.faculty}</td>
                        <td className="px-3 py-2 text-right">{s.held}</td>
                        <td className="px-3 py-2 text-[#5A6577]">{when(s.lastHeld)}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: pctTone(s.average, data.threshold, data.warnBelow) }}>{s.average === null ? '—' : `${s.average}%`}</td>
                        <td className="px-3 py-2 text-right" style={{ color: s.below ? '#A8242C' : undefined }}>{s.below}</td>
                        <td className="px-3 py-2 text-right" style={{ color: s.warning ? '#8A6D1F' : undefined }}>{s.warning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {c.subjects.some((s) => s.held === 0) && <p className="px-4 py-2 text-[12px] text-[#8A6D1F]">A subject with no class held has had no roll call submitted this term.</p>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Shortage list ────────────────────────────────────────────────────────────

function Shortage() {
  const summary = useSummary();
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [programmeId, semester] = cls ? (cls.split(':') as [string, string]) : [undefined, undefined];
  const { data, isPending, error } = useDefaulters({ programmeId, semester: semester ? Number(semester) : undefined, q: query || undefined });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notify, setNotify] = useState(false);
  const [message, setMessage] = useState('');
  const send = useNotifyDefaulters();
  const rows = data?.students ?? [];

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));

  function openNotice() {
    setMessage(`Your attendance is below ${data!.threshold}% in one or more subjects. Below ${data!.threshold}% you cannot sit those examinations. Attend every class from now, and meet your mentor this week.`);
    send.reset();
    setNotify(true);
  }
  function exportRows() {
    downloadCSV(`attendance-shortage-${data!.term}`, rows, [
      { key: 'enrolmentNo', label: 'Enrolment no.' }, { key: 'rollNo', label: 'Roll no.' }, { key: 'name', label: 'Name' }, { key: 'programme', label: 'Class' },
      { key: 'overall', label: 'Overall %' }, { key: 'lowest', label: 'Lowest subject %' },
      { key: 'short', label: 'Short subjects', value: (r: Defaulter) => r.short.map((s) => `${s.code} ${s.percent}% (${s.present}/${s.total})`).join('; ') },
      { key: 'condonable', label: 'Condonable', value: (r: Defaulter) => (r.condonable ? 'Yes' : 'No') },
      { key: 'condonation', label: 'Condonation', value: (r: Defaulter) => (r.condonation ? `${r.condonation.requestNo} ${r.condonation.status}` : '') },
      { key: 'mentor', label: 'Mentor' }, { key: 'mobile', label: 'Mobile' }, { key: 'parentEmail', label: 'Parent email' },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <div className="md:w-64">
          <Select label="Class" value={cls} onChange={(e) => { setCls(e.target.value); setPicked(new Set()); }}>
            <option value="">All classes</option>
            {(summary.data?.classes ?? []).map((c) => <option key={`${c.programmeId}:${c.semester}`} value={`${c.programmeId}:${c.semester}`}>{c.programme} · Semester {c.semester}</option>)}
          </Select>
        </div>
        <form className="flex-1 flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPicked(new Set()); }}>
          <div className="flex-1"><Input label="Student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or enrolment number" /></div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!rows.length} onClick={exportRows}>Export CSV</Button>
          <Button disabled={!picked.size} onClick={openNotice}>Notify {picked.size || ''} selected</Button>
        </div>
      </Card>

      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && (
        <>
          <p className="text-[12px] text-[#5A6577]">{rows.length} student{rows.length === 1 ? '' : 's'} below {data.threshold}% in at least one subject, {data.term}. Condonation is possible down to {data.floor}%.</p>
          {rows.length === 0 ? <Card><EmptyState title="No shortage" description="Every student here is at or above the bar in every subject." /></Card> : (
            <Card className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#F7F8FA]"><tr>
                  <th className="px-3 py-2.5 w-8"><Checkbox checked={allPicked} onChange={(v) => setPicked(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                  <Th>Student</Th><Th>Class</Th><Th right>Overall</Th><Th>Short subjects</Th><Th>Condonation</Th><Th>Mentor</Th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-[#EDEFF3] align-top">
                      <td className="px-3 py-2.5"><Checkbox checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                      <td className="px-3 py-2.5"><p className="font-medium text-[#16264A]">{r.name}</p><p className="text-[11px] font-mono text-[#5A6577]">{r.enrolmentNo}</p>{r.pendingLeave > 0 && <p className="text-[11px] text-[#8A6D1F]">{r.pendingLeave} leave pending</p>}</td>
                      <td className="px-3 py-2.5 text-[#5A6577] whitespace-nowrap">{r.programme}</td>
                      <td className="px-3 py-2.5 text-right">{r.overall}%</td>
                      <td className="px-3 py-2.5">{r.short.map((s) => <span key={s.code} className="inline-block mr-1.5 mb-1 px-1.5 py-0.5 rounded-[2px] bg-[#FEE2E2] text-[#A8242C] text-[11px] font-semibold">{s.code} {s.percent}% <span className="font-normal">({s.present}/{s.total})</span></span>)}</td>
                      <td className="px-3 py-2.5 text-[12px]">{r.condonation ? <><Pill s={r.condonation.status} /> <span className="font-mono text-[#5A6577]">{r.condonation.requestNo}</span></> : r.condonable ? <span className="text-[#8A6D1F]">Can be condoned</span> : <span className="text-[#A8242C]">Below {data.floor}% — detained</span>}</td>
                      <td className="px-3 py-2.5 text-[#5A6577] text-[12px]">{r.mentor ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      <Modal open={notify} onClose={() => setNotify(false)} title={`Send a shortage notice to ${picked.size} student${picked.size === 1 ? '' : 's'}`}
        footer={<><Button variant="secondary" size="sm" onClick={() => setNotify(false)}>Cancel</Button><Button size="sm" loading={send.isPending} disabled={message.trim().length < 10}
          onClick={() => send.mutate({ studentIds: [...picked], message: message.trim() }, { onSuccess: (r) => { toast.success(`Notice sent to ${r.sent} student${r.sent === 1 ? '' : 's'}`); setNotify(false); setPicked(new Set()); } })}>Send notice</Button></>}>
        <div className="flex flex-col gap-2">
          {send.isError && <InlineAlert type="error">{errText(send.error)}</InlineAlert>}
          <textarea rows={5} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
          <p className="text-[11px] text-[#5A6577]">Goes to each student's notifications (and their parent's view), marked urgent. Recorded in the audit log.</p>
        </div>
      </Modal>
    </div>
  );
}

// ─── Roll-call compliance ─────────────────────────────────────────────────────

function ComplianceTab() {
  const today = istToday();
  const [from, setFrom] = useState(shift(today, -6));
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: shift(today, -6), to: today });
  const { data, isPending, error } = useCompliance(range.from, range.to);
  const [open, setOpen] = useState<string | null>(null);

  function exportMissing() {
    const rows = data!.faculty.flatMap((f) => f.missing.map((m) => ({ lecturer: f.name, department: f.department, ...m, state: m.state === 'draft' ? 'Started, not submitted' : 'Not taken' })));
    downloadCSV(`roll-calls-pending-${data!.from}-to-${data!.to}`, rows, [
      { key: 'lecturer', label: 'Lecturer' }, { key: 'department', label: 'Department' }, { key: 'date', label: 'Date' }, { key: 'time', label: 'Time' }, { key: 'code', label: 'Code' }, { key: 'name', label: 'Subject' }, { key: 'state', label: 'State' },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" disabled={!from || !to || from > to} onClick={() => setRange({ from, to })}>Show</Button>
        <div className="flex-1" />
        <Button variant="secondary" disabled={!data || !data.faculty.some((f) => f.missing.length)} onClick={exportMissing}>Export pending list</Button>
      </Card>
      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Classes timetabled" value={data.expected} />
            <Stat label="Roll calls submitted" value={data.marked} tone="good" />
            <Stat label="Pending" value={data.expected - data.marked} tone={data.expected - data.marked ? 'bad' : 'good'} />
            <Stat label="Compliance" value={data.rate === null ? '—' : `${data.rate}%`} tone={data.rate === null ? undefined : data.rate < 90 ? 'bad' : data.rate < 98 ? 'warn' : 'good'} />
          </div>
          <p className="text-[12px] text-[#5A6577]">
            {ymd(data.from)} to {ymd(data.to)}. Cancelled classes, holidays{data.holidays.length ? ` (${data.holidays.map((h) => `${ymd(h.date)} ${h.name}`).join(', ')})` : ''} and classes not yet over are left out.
            {data.own && ' Open Attendance Marking to take any roll call still pending.'}
          </p>
          {data.faculty.length === 0 ? <Card><EmptyState title="No timetabled classes" description="No class was timetabled in this period." /></Card> : (
            <Card className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#F7F8FA]"><tr><Th>Lecturer</Th><Th>Department</Th><Th right>Timetabled</Th><Th right>Submitted</Th><Th right>Started only</Th><Th right>Compliance</Th><Th /></tr></thead>
                <tbody>
                  {data.faculty.map((f) => (
                    <Fragment key={f.id}>
                      <tr className="border-t border-[#EDEFF3]">
                        <td className="px-3 py-2.5 font-medium text-[#16264A]">{f.name}</td>
                        <td className="px-3 py-2.5 text-[#5A6577]">{f.department}</td>
                        <td className="px-3 py-2.5 text-right">{f.expected}</td>
                        <td className="px-3 py-2.5 text-right">{f.marked}</td>
                        <td className="px-3 py-2.5 text-right">{f.draft}</td>
                        <td className="px-3 py-2.5 text-right font-semibold" style={{ color: f.rate === null ? undefined : f.rate < 90 ? '#A8242C' : f.rate < 98 ? '#8A6D1F' : '#0E7A5F' }}>{f.rate === null ? '—' : `${f.rate}%`}</td>
                        <td className="px-3 py-2.5 text-right">{f.missing.length > 0 && <button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => setOpen(open === f.id ? null : f.id)}>{open === f.id ? 'Hide' : `${f.missing.length} pending`}</button>}</td>
                      </tr>
                      {open === f.id && (
                        <tr className="bg-[#FAFBFC]"><td colSpan={7} className="px-3 py-2">
                          {f.missing.map((m, i) => (
                            <div key={i} className="flex flex-wrap gap-x-4 text-[12px] py-1 border-b border-[#EDEFF3] last:border-0">
                              <span className="w-28">{ymd(m.date)}</span><span className="w-28 text-[#5A6577]">{m.time}</span><span className="flex-1"><span className="font-mono text-[#5A6577]">{m.code}</span> {m.name}</span>
                              <span className={m.state === 'draft' ? 'text-[#8A6D1F]' : 'text-[#A8242C]'}>{m.state === 'draft' ? 'Started, not submitted' : 'Not taken'}</span>
                            </div>
                          ))}
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Leave approvals ──────────────────────────────────────────────────────────

function LeaveTab({ canRevoke }: { canRevoke: boolean }) {
  const [status, setStatus] = useState<LeaveStatus | ''>('PENDING');
  const { data, isPending, error } = useStaffLeaves(status || undefined);
  const decide = useDecideLeave();
  const revoke = useRevokeLeave();
  const [acting, setActing] = useState<{ leave: StaffLeave; mode: 'approve' | 'reject' | 'revoke' } | null>(null);
  const [note, setNote] = useState('');

  function start(leave: StaffLeave, mode: 'approve' | 'reject' | 'revoke') { setActing({ leave, mode }); setNote(''); decide.reset(); revoke.reset(); }
  function submit() {
    if (!acting) return;
    const { leave, mode } = acting;
    if (mode === 'revoke') revoke.mutate({ id: leave.id, note: note.trim() }, { onSuccess: (r) => { toast.success(`Leave revoked — ${r.restored} absence${r.restored === 1 ? '' : 's'} restored`); setActing(null); } });
    else decide.mutate({ id: leave.id, approve: mode === 'approve', note: note.trim() || undefined }, { onSuccess: (r) => { toast.success(mode === 'approve' ? `Approved — ${r.excused} absence${r.excused === 1 ? '' : 's'} excused` : 'Leave refused; the student is told why'); setActing(null); } });
  }
  const needNote = acting?.mode === 'reject' ? 5 : acting?.mode === 'revoke' ? 10 : 0;
  const err = decide.error ?? revoke.error;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex gap-3 items-end">
        <div className="w-56">
          <Select label="Show" value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus | '')}>
            <option value="PENDING">Awaiting decision</option><option value="APPROVED">Approved</option><option value="REJECTED">Not approved</option><option value="CANCELLED">Withdrawn / revoked</option><option value="">All</option>
          </Select>
        </div>
        <p className="text-[12px] text-[#5A6577] flex-1">Approving excuses the student's absences in those dates — those already marked and any marked later.</p>
      </Card>
      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && data.length === 0 && <Card><EmptyState title="Nothing here" description={status === 'PENDING' ? 'No leave is waiting for you.' : 'No leave matches.'} /></Card>}
      {data && data.map((l) => (
        <Card key={l.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-[#16264A]">{l.student.name} <span className="text-[12px] font-normal text-[#5A6577]">{l.student.enrolmentNo} · {l.student.programme.shortName} {l.student.semester}</span></p>
              <p className="text-[13px] text-[#16264A] mt-0.5">{LEAVE_KIND[l.kind]} · {ymd(l.fromDate)}{l.toDate !== l.fromDate ? ` to ${ymd(l.toDate)}` : ''} <span className="font-mono text-[11px] text-[#5A6577]">{l.leaveNo}</span></p>
            </div>
            <Pill s={l.status} />
          </div>
          <p className="text-[13px] text-[#5A6577] mt-2 whitespace-pre-wrap">{l.reason}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px] text-[#5A6577]">
            <span>Proof: <Proof file={l.proof} /></span>
            <span>Applied {when(l.createdAt)}</span>
            {l.decidedBy && <span>{l.status === 'APPROVED' ? 'Approved' : l.status === 'REJECTED' ? 'Refused' : 'Closed'} by {l.decidedBy} on {when(l.decidedAt)}</span>}
            {l.status === 'APPROVED' && <span>{l.excused} absence{l.excused === 1 ? '' : 's'} excused</span>}
            {l.decisionNote && <span>Note: {l.decisionNote}</span>}
          </div>
          {(l.status === 'PENDING' || (l.status === 'APPROVED' && canRevoke)) && (
            <div className="flex gap-2 mt-3">
              {l.status === 'PENDING' && <><Button size="sm" onClick={() => start(l, 'approve')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => start(l, 'reject')}>Refuse</Button></>}
              {l.status === 'APPROVED' && canRevoke && <Button size="sm" variant="secondary" onClick={() => start(l, 'revoke')}>Revoke</Button>}
            </div>
          )}
        </Card>
      ))}

      <Modal open={!!acting} onClose={() => setActing(null)} title={acting?.mode === 'approve' ? 'Approve leave' : acting?.mode === 'reject' ? 'Refuse leave' : 'Revoke approved leave'}
        footer={<><Button variant="secondary" size="sm" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" loading={decide.isPending || revoke.isPending} disabled={note.trim().length < needNote} onClick={submit}>{acting?.mode === 'approve' ? 'Approve' : acting?.mode === 'reject' ? 'Refuse' : 'Revoke'}</Button></>}>
        {acting && (
          <div className="flex flex-col gap-3">
            {err && <InlineAlert type="error">{errText(err)}</InlineAlert>}
            <p className="text-[13px] text-[#16264A]">{acting.leave.student.name} · {LEAVE_KIND[acting.leave.kind]} · {ymd(acting.leave.fromDate)} to {ymd(acting.leave.toDate)}</p>
            {acting.mode === 'revoke' && <InlineAlert type="warning">The {acting.leave.excused} excused absence{acting.leave.excused === 1 ? '' : 's'} will count as absent again. Use this when the leave proves to be false.</InlineAlert>}
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">{acting.mode === 'approve' ? 'Note to the student (optional)' : 'Reason — the student sees this'}</span>
              <textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
              {needNote > 0 && <span className="text-[11px] text-[#5A6577]">At least {needNote} characters.</span>}
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Condonation ──────────────────────────────────────────────────────────────

function CondonationTab({ canDecide }: { canDecide: boolean }) {
  const [status, setStatus] = useState<CondonationStatus | ''>('PENDING');
  const { data, isPending, error } = useStaffCondonations(status || undefined);
  const decide = useDecideCondonation();
  const [acting, setActing] = useState<{ c: StaffCondonation; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [fee, setFee] = useState('0');

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex gap-3 items-end">
        <div className="w-56">
          <Select label="Show" value={status} onChange={(e) => setStatus(e.target.value as CondonationStatus | '')}>
            <option value="PENDING">Awaiting decision</option><option value="APPROVED">Granted</option><option value="REJECTED">Refused</option><option value="">All</option>
          </Select>
        </div>
        <p className="text-[12px] text-[#5A6577] flex-1">{canDecide ? 'Granting lets the student sit every exam of this term in which they are at or above the condonation floor. A fee goes on their fee account.' : 'Condonation is decided by the principal or registrar.'}</p>
      </Card>
      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && data.length === 0 && <Card><EmptyState title="Nothing here" description="No condonation request matches." /></Card>}
      {data && data.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-[#16264A]">{c.student.name} <span className="text-[12px] font-normal text-[#5A6577]">{c.student.enrolmentNo} · {c.student.programme.shortName} {c.student.semester}</span></p>
              <p className="text-[13px] text-[#16264A] mt-0.5">Lowest subject at <span className="font-semibold text-[#A8242C]">{c.percent}%</span> · {c.term} · {c.kind === 'MEDICAL' ? 'Medical grounds' : 'Other grounds'} <span className="font-mono text-[11px] text-[#5A6577]">{c.requestNo}</span></p>
            </div>
            <Pill s={c.status} />
          </div>
          <p className="text-[13px] text-[#5A6577] mt-2 whitespace-pre-wrap">{c.reason}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px] text-[#5A6577]">
            <span>Proof: <Proof file={c.proof} /></span>
            <span>Asked {when(c.createdAt)}</span>
            {c.decidedBy && <span>Decided by {c.decidedBy} on {when(c.decidedAt)}</span>}
            {c.status === 'APPROVED' && c.fee > 0 && <span>Fee ₹{c.fee.toLocaleString('en-IN')}</span>}
            {c.decisionNote && <span>Note: {c.decisionNote}</span>}
          </div>
          {canDecide && c.status === 'PENDING' && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => { setActing({ c, approve: true }); setNote('Condoned on the grounds stated.'); setFee('0'); decide.reset(); }}>Grant</Button>
              <Button size="sm" variant="secondary" onClick={() => { setActing({ c, approve: false }); setNote(''); setFee('0'); decide.reset(); }}>Refuse</Button>
            </div>
          )}
        </Card>
      ))}

      <Modal open={!!acting} onClose={() => setActing(null)} title={acting?.approve ? 'Grant condonation' : 'Refuse condonation'}
        footer={<><Button variant="secondary" size="sm" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" loading={decide.isPending} disabled={note.trim().length < 5 || !/^\d{1,6}$/.test(fee)}
          onClick={() => decide.mutate({ id: acting!.c.id, approve: acting!.approve, note: note.trim(), fee: acting!.approve ? Number(fee) : 0 }, { onSuccess: () => { toast.success(acting!.approve ? 'Condonation granted' : 'Condonation refused'); setActing(null); } })}>{acting?.approve ? 'Grant' : 'Refuse'}</Button></>}>
        {acting && (
          <div className="flex flex-col gap-3">
            {decide.isError && <InlineAlert type="error">{errText(decide.error)}</InlineAlert>}
            <p className="text-[13px] text-[#16264A]">{acting.c.student.name} · {acting.c.requestNo} · lowest {acting.c.percent}%</p>
            {acting.approve && <Input label="Condonation fee (₹, 0 for none)" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))} />}
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Decision note — the student sees this</span>
              <textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
              <span className="text-[11px] text-[#5A6577]">At least 5 characters.</span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Rule & holidays ──────────────────────────────────────────────────────────

function PolicyTab({ canEdit, canHolidays }: { canEdit: boolean; canHolidays: boolean }) {
  const { data: p, isPending, error } = usePolicy();
  const save = useSavePolicy();
  const [form, setForm] = useState<{ threshold: string; condonationFloor: string; warnBelow: string; leaveBackdateDays: string; lateCountsAsPresent: boolean } | null>(null);
  const year = new Date().getFullYear();
  const [y, setY] = useState(year);
  const holidays = useHolidays(y);
  const add = useAddHoliday();
  const remove = useRemoveHoliday();
  const [h, setH] = useState({ date: '', name: '' });

  const f = form ?? (p ? { threshold: String(p.threshold), condonationFloor: String(p.condonationFloor), warnBelow: String(p.warnBelow), leaveBackdateDays: String(p.leaveBackdateDays), lateCountsAsPresent: p.lateCountsAsPresent } : null);
  const nums = useMemo(() => (f ? { threshold: Number(f.threshold), condonationFloor: Number(f.condonationFloor), warnBelow: Number(f.warnBelow), leaveBackdateDays: Number(f.leaveBackdateDays) } : null), [f]);
  const problem = !nums ? null
    : [nums.threshold, nums.condonationFloor, nums.warnBelow].some((n) => !Number.isFinite(n) || n < 0 || n > 100) ? 'Percentages must be between 0 and 100'
    : nums.condonationFloor >= nums.threshold ? 'The condonation floor must be below the minimum'
    : nums.warnBelow < nums.threshold ? 'The warning line must be at or above the minimum'
    : !Number.isInteger(nums.leaveBackdateDays) || nums.leaveBackdateDays < 0 || nums.leaveBackdateDays > 90 ? 'Back-dating must be 0 to 90 days' : null;

  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !p || !f) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  const set = (k: keyof typeof f, v: string | boolean) => setForm({ ...f, [k]: v });

  return (
    <div className="grid md:grid-cols-2 gap-4 items-start">
      <Card className="p-4 flex flex-col gap-3">
        <div>
          <p className="text-[15px] font-semibold text-[#16264A]">Attendance rule</p>
          <p className="text-[12px] text-[#5A6577]">One rule for every percentage in the system — student, parent, lecturer, exam form and reports. Last changed {p.updatedBy ? `by ${p.updatedBy} ` : ''}on {when(p.updatedAt)}.</p>
        </div>
        {!canEdit && <InlineAlert type="info">Only the registrar or the administrator can change the rule.</InlineAlert>}
        {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Minimum to sit exams (%)" inputMode="decimal" disabled={!canEdit} value={f.threshold} onChange={(e) => set('threshold', e.target.value)} />
          <Input label="Condonation floor (%)" inputMode="decimal" disabled={!canEdit} value={f.condonationFloor} onChange={(e) => set('condonationFloor', e.target.value)} hint="Below this, no condonation" />
          <Input label="Warn students below (%)" inputMode="decimal" disabled={!canEdit} value={f.warnBelow} onChange={(e) => set('warnBelow', e.target.value)} />
          <Input label="Leave back-dating (days)" inputMode="numeric" disabled={!canEdit} value={f.leaveBackdateDays} onChange={(e) => set('leaveBackdateDays', e.target.value)} />
        </div>
        <Checkbox label="A late mark counts as attended" checked={f.lateCountsAsPresent} disabled={!canEdit} onChange={(v) => set('lateCountsAsPresent', v)} />
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button disabled={!!problem || !form} loading={save.isPending} onClick={() => save.mutate({ ...nums!, lateCountsAsPresent: f.lateCountsAsPresent }, { onSuccess: () => { toast.success('Attendance rule saved'); setForm(null); } })}>Save rule</Button>
            {form && <Button variant="secondary" onClick={() => setForm(null)}>Discard</Button>}
            {problem && form && <span className="text-[12px] text-[#A8242C]">{problem}</span>}
          </div>
        )}
      </Card>

      <Card className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#16264A]">Holidays</p>
            <p className="text-[12px] text-[#5A6577]">No roll call is expected on these days.</p>
          </div>
          <Select value={String(y)} onChange={(e) => setY(Number(e.target.value))}>
            {[year - 1, year, year + 1].map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </div>
        {canHolidays && (
          <form className="flex flex-col sm:flex-row gap-2 sm:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate({ date: h.date, name: h.name.trim() }, { onSuccess: () => { toast.success('Holiday added'); setH({ date: '', name: '' }); }, onError: (er) => toast.error(errText(er)) }); }}>
            <Input label="Date" type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} />
            <div className="flex-1"><Input label="Occasion" value={h.name} maxLength={120} onChange={(e) => setH({ ...h, name: e.target.value })} placeholder="e.g. Diwali" /></div>
            <Button type="submit" loading={add.isPending} disabled={!h.date || h.name.trim().length < 2}>Add</Button>
          </form>
        )}
        {holidays.isPending && <Spinner />}
        {holidays.error && <InlineAlert type="error">{errText(holidays.error)}</InlineAlert>}
        {holidays.data && holidays.data.length === 0 && <p className="text-[13px] text-[#5A6577] py-4 text-center">No holiday listed for {y}.</p>}
        {holidays.data && holidays.data.length > 0 && (
          <div className="divide-y divide-[#EDEFF3]">
            {holidays.data.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="w-28 text-[#16264A]">{ymd(d.date)}</span>
                <span className="flex-1 text-[#5A6577]">{d.name}</span>
                {canHolidays && <button className="text-[12px] text-[#A8242C] cursor-pointer disabled:opacity-50" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove ${d.name} (${ymd(d.date)})?`)) remove.mutate(d.id, { onSuccess: () => toast.success('Holiday removed'), onError: (er) => toast.error(errText(er)) }); }}>Remove</button>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

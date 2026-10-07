import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, InlineAlert, SkeletonRow, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useMySubjects } from '../../lib/facultyqueries';
import { openMaterial } from '../../lib/records';
import { downloadCSV } from '../../lib/export';

interface Props {
  onNavigate: (s: unknown) => void;
  onModule: (m: string) => void;
}

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
interface Overview {
  assignmentId: string; code: string; name: string; credits: number; semester: number; classLabel: string; section: string; room: string; kind: string; term: string; threshold: number;
  schedule: Array<{ slotId: string; day: string; time: string; room: string; cancelled: boolean }>;
  registers: { held: number; submitted: number; unsubmitted: Array<{ sessionId: string; date: string; time: string }>; locked: number; lastHeld: string | null };
  marks: { status: string; components: Array<{ id: string; key: string; label: string; maxMarks: number }>; maxTotal: number };
  materials: Array<{ id: string; unit: number; unitTitle: string; filename: string; type: string; url: string | null; visibleToStudents: boolean; uploadedAt: string }>;
  summary: { students: number; averageAttendance: number | null; belowThreshold: number; averageMarks: number | null; pendingDisputes: number };
  students: Array<{
    id: string; rollNo: string; enrolmentNo: string; name: string; mobile: string | null; email: string;
    attendance: { present: number; held: number; percent: number }; overallAttendance: number; missedRecently: number;
    marks: Record<string, number | null>; marksTotal: number | null; pendingDisputes: number;
  }>;
}
interface StudentDetail {
  student: { id: string; name: string; rollNo: string; enrolmentNo: string; programme: string; semester: number; mobile: string | null; email: string; guardianEmail: string | null };
  attendance: { present: number; held: number; percent: number; threshold: number; classes: Array<{ sessionId: string; date: string; time: string; status: Status; source: string | null }> };
  marks: Array<{ label: string; maxMarks: number; value: number | null }>;
  marksStatus: string;
  otherSubjects: Array<{ code: string; name: string; faculty: string; percent: number; held: number }>;
  results: Array<{ semester: number; sgpa: number; cgpa: number; outcome: string }>;
  disputes: Array<{ id: string; date: string; time: string; markedAs: string; requestedStatus: string; status: string; reason: string }>;
}

const DAY: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };
const MARK: Record<Status, { l: string; bg: string; fg: string }> = {
  PRESENT: { l: 'P', bg: '#D1FAE5', fg: '#0E7A5F' }, ABSENT: { l: 'A', bg: '#FEE2E2', fg: '#A8242C' },
  LATE: { l: 'L', bg: '#FEF9EC', fg: '#8A6D1F' }, EXCUSED: { l: 'E', bg: '#EFF6FF', fg: '#1D4ED8' },
};
const MARKS_STATUS: Record<string, string> = { NOT_STARTED: 'Not started', DRAFT: 'Draft', SUBMITTED: 'With HOD', APPROVED: 'Approved', RETURNED: 'Returned by HOD' };
const tone = (p: number, t: number) => (p >= t ? '#0E7A5F' : p >= t - 10 ? '#8A6D1F' : '#A8242C');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] px-4 py-3">
      <div className="text-[20px] font-semibold" style={{ color: color ?? '#16264A' }}>{value}</div>
      <div className="text-[12px] text-[#5A6577]">{label}</div>
      {sub && <div className="text-[11px] text-[#5A6577] mt-0.5">{sub}</div>}
    </div>
  );
}

/** Every subject on the lecturer's load; open one to see its class in full. */
export default function MySubjects({ onModule }: Props) {
  const subjects = useMySubjects();
  const [open, setOpen] = useState<string | null>(null);

  if (open) return <SubjectDetail assignmentId={open} onBack={() => setOpen(null)} onModule={onModule} />;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[#16264A]">My subjects</h1>
        <p className="text-[13px] text-[#5A6577]">Open a subject for its students' attendance, internal marks, study material and timetable.</p>
      </div>
      {subjects.isPending && <SkeletonRow />}
      {subjects.error && <InlineAlert type="error">{errText(subjects.error)}</InlineAlert>}
      {!subjects.isPending && subjects.data.length === 0 && <InlineAlert type="info">No subject is allocated to you this term. The principal or your head of department allocates subjects under Subject Allocation.</InlineAlert>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {subjects.data.map(s => (
          <button key={s.assignmentId} onClick={() => setOpen(s.assignmentId)} className="text-left bg-white border border-[#D3D8E0] rounded-[4px] p-4 hover:border-[#E0952A] cursor-pointer">
            <p className="font-mono text-[12px] text-[#5A6577]">{s.code} · {s.credits} credits · {s.type}</p>
            <p className="text-[15px] font-semibold text-[#16264A] mt-0.5">{s.name}</p>
            <p className="text-[12px] text-[#5A6577] mt-1">{s.classLabel} · {s.room}</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[12px] text-[#16264A]">{s.totalStudents} students</span>
              <span className="text-[12px] text-[#E0952A] font-medium">Open →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SubjectDetail({ assignmentId, onBack, onModule }: { assignmentId: string; onBack: () => void; onModule: (m: string) => void }) {
  const q = useQuery({ queryKey: ['faculty', 'overview', assignmentId], queryFn: () => api<Overview>(`/api/faculty/subjects/${assignmentId}/overview`) });
  const [tab, setTab] = useState<'students' | 'marks' | 'material' | 'schedule'>('students');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'roll' | 'attendance' | 'marks'>('roll');
  const [student, setStudent] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = (q.data?.students ?? []).filter(s => {
      const t = search.trim().toLowerCase();
      return !t || s.name.toLowerCase().includes(t) || s.rollNo.toLowerCase().includes(t) || s.enrolmentNo.toLowerCase().includes(t);
    });
    if (sort === 'attendance') return [...list].sort((a, b) => a.attendance.percent - b.attendance.percent);
    if (sort === 'marks') return [...list].sort((a, b) => (b.marksTotal ?? -1) - (a.marksTotal ?? -1));
    return list;
  }, [q.data, search, sort]);

  if (q.isPending) return <div className="p-6"><SkeletonRow /><SkeletonRow /></div>;
  if (q.error || !q.data) return <div className="p-6 space-y-3"><Button size="sm" variant="secondary" onClick={onBack}>← All subjects</Button><InlineAlert type="error">{errText(q.error)}</InlineAlert></div>;
  const d = q.data;

  function exportStudents() {
    downloadCSV(`${d.code}-students`, d.students.map(s => ({
      rollNo: s.rollNo, enrolmentNo: s.enrolmentNo, name: s.name, mobile: s.mobile ?? '', email: s.email,
      attended: s.attendance.present, held: s.attendance.held, percent: s.attendance.percent, overall: s.overallAttendance,
      ...Object.fromEntries(d.marks.components.map(c => [c.key, s.marks[c.key] ?? ''])), marksTotal: s.marksTotal ?? '',
    })), [
      { key: 'rollNo', label: 'Roll No' }, { key: 'enrolmentNo', label: 'Enrolment No' }, { key: 'name', label: 'Name' }, { key: 'mobile', label: 'Mobile' }, { key: 'email', label: 'Email' },
      { key: 'attended', label: 'Attended' }, { key: 'held', label: 'Held' }, { key: 'percent', label: `${d.code} %` }, { key: 'overall', label: 'Overall %' },
      ...d.marks.components.map(c => ({ key: c.key, label: `${c.label} (/${c.maxMarks})` })), { key: 'marksTotal', label: `Internal (/${d.marks.maxTotal})` },
    ]);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <Button size="sm" variant="secondary" onClick={onBack}>← All subjects</Button>
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold text-[#16264A]">{d.name} <span className="font-mono text-[13px] text-[#5A6577]">{d.code}</span></h1>
          <p className="text-[13px] text-[#5A6577]">{d.classLabel} · Semester {d.semester} · {d.credits} credits · {d.kind.toLowerCase()} · {d.room} · {d.term}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => onModule('attendance')}>Take attendance</Button>
        <Button size="sm" variant="secondary" onClick={() => onModule('marks')}>Enter marks</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Students" value={d.summary.students} />
        <Stat label="Classes held" value={d.registers.held} sub={d.registers.lastHeld ? `last ${day(d.registers.lastHeld)}` : 'none yet'} />
        <Stat label="Average attendance" value={d.summary.averageAttendance === null ? '—' : `${d.summary.averageAttendance}%`} color={d.summary.averageAttendance === null ? undefined : tone(d.summary.averageAttendance, d.threshold)} />
        <Stat label={`Below ${d.threshold}%`} value={d.summary.belowThreshold} color={d.summary.belowThreshold ? '#A8242C' : undefined} />
        <Stat label="Internal marks" value={MARKS_STATUS[d.marks.status] ?? d.marks.status} sub={d.summary.averageMarks === null ? 'no marks entered' : `class average ${d.summary.averageMarks}%`} />
      </div>
      {d.registers.unsubmitted.length > 0 && <InlineAlert type="warning">{d.registers.unsubmitted.length} class register(s) opened but not submitted ({d.registers.unsubmitted.slice(0, 3).map(u => day(u.date)).join(', ')}{d.registers.unsubmitted.length > 3 ? '…' : ''}). Finish them under Attendance.</InlineAlert>}
      {d.summary.pendingDisputes > 0 && <InlineAlert type="info">{d.summary.pendingDisputes} attendance dispute(s) are waiting for you under Attendance → Correction requests.</InlineAlert>}

      <div className="flex border-b border-[#D3D8E0] bg-white px-2 rounded-t-[4px]">
        {([['students', `Students (${d.students.length})`], ['marks', 'Internal marks'], ['material', `Study material (${d.materials.length})`], ['schedule', 'Timetable']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-3 text-[13px] font-medium border-b-2 cursor-pointer ${tab === id ? 'border-[#E0952A] text-[#16264A]' : 'border-transparent text-[#5A6577]'}`}>{label}</button>
        ))}
      </div>

      {tab === 'students' && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
          <div className="flex items-center gap-2 p-3 border-b border-[#D3D8E0] flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, roll or enrolment no." className="h-8 px-3 text-[13px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] w-64" />
            <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px] bg-white cursor-pointer">
              <option value="roll">By roll number</option><option value="attendance">Lowest attendance first</option><option value="marks">Highest marks first</option>
            </select>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={exportStudents}>Download class list (CSV)</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#EDEFF3] text-[11px] uppercase tracking-wider text-[#5A6577]">
                <tr><th className="px-4 py-2">Roll</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">This subject</th><th className="px-4 py-2">Overall</th><th className="px-4 py-2">Last 5 registers</th><th className="px-4 py-2">Internal</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id} className="border-t border-[#EDEFF3] text-[13px] hover:bg-[#FAFBFC] cursor-pointer" onClick={() => setStudent(s.id)}>
                    <td className="px-4 py-2 font-mono">{s.rollNo}</td>
                    <td className="px-4 py-2"><div className="text-[#16264A] font-medium">{s.name}</div><div className="text-[11px] text-[#5A6577]">{s.enrolmentNo}</div></td>
                    <td className="px-4 py-2">{s.attendance.held === 0 ? <span className="text-[#5A6577]">—</span> : <span className="font-semibold" style={{ color: tone(s.attendance.percent, d.threshold) }}>{s.attendance.percent}% <span className="font-normal text-[#5A6577]">({s.attendance.present}/{s.attendance.held})</span></span>}</td>
                    <td className="px-4 py-2" style={{ color: tone(s.overallAttendance, d.threshold) }}>{s.overallAttendance}%</td>
                    <td className="px-4 py-2 text-[12px]">{d.registers.submitted === 0 ? '—' : s.missedRecently === 0 ? <span className="text-[#0E7A5F]">none missed</span> : <span className="text-[#A8242C]">missed {s.missedRecently}</span>}</td>
                    <td className="px-4 py-2">{s.marksTotal === null ? <span className="text-[#5A6577]">—</span> : `${s.marksTotal}/${d.marks.maxTotal}`}</td>
                    <td className="px-4 py-2 text-right text-[12px] text-[#E0952A]">{s.pendingDisputes > 0 ? `${s.pendingDisputes} dispute · ` : ''}Details →</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-[13px] text-[#5A6577]">{d.students.length ? 'No student matches.' : 'No students are enrolled.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'marks' && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
          {d.marks.components.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#5A6577]">The marks sheet has not been opened yet. <button className="text-[#E0952A] cursor-pointer" onClick={() => onModule('marks')}>Open Internal Marks →</button></div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-[#EDEFF3] text-[11px] uppercase tracking-wider text-[#5A6577]">
                <tr><th className="px-4 py-2">Roll</th><th className="px-4 py-2">Name</th>{d.marks.components.map(c => <th key={c.id} className="px-3 py-2 text-center">{c.label}<br /><span className="normal-case">/{c.maxMarks}</span></th>)}<th className="px-4 py-2 text-center">Total /{d.marks.maxTotal}</th></tr>
              </thead>
              <tbody>
                {d.students.map(s => (
                  <tr key={s.id} className="border-t border-[#EDEFF3] text-[13px]">
                    <td className="px-4 py-2 font-mono">{s.rollNo}</td><td className="px-4 py-2">{s.name}</td>
                    {d.marks.components.map(c => <td key={c.id} className="px-3 py-2 text-center font-mono">{s.marks[c.key] ?? '—'}</td>)}
                    <td className="px-4 py-2 text-center font-mono font-semibold">{s.marksTotal ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'material' && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
          <div className="flex items-center p-3 border-b border-[#D3D8E0]">
            <p className="text-[13px] text-[#5A6577] mr-auto">What you have shared for this subject, by unit.</p>
            <Button size="sm" onClick={() => onModule('study-material')}>Upload material</Button>
          </div>
          {d.materials.length === 0 ? <p className="p-6 text-center text-[13px] text-[#5A6577]">Nothing shared yet.</p> : d.materials.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#EDEFF3] last:border-0">
              <span className="text-[11px] font-mono text-[#5A6577] w-14">Unit {m.unit}</span>
              <div className="min-w-0 mr-auto"><p className="text-[13px] text-[#16264A] truncate">{m.filename}</p><p className="text-[11px] text-[#5A6577]">{m.unitTitle} · {m.type} · {day(m.uploadedAt)} · {m.visibleToStudents ? 'visible to students' : 'hidden from students'}</p></div>
              <Button size="sm" variant="secondary" disabled={!m.url} onClick={() => void openMaterial(m.url, m.filename)}>{m.url ? 'Open' : 'No file'}</Button>
            </div>
          ))}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
          {d.schedule.length === 0 ? <p className="p-6 text-center text-[13px] text-[#5A6577]">No weekly class time is set. Ask the principal or your head of department to add one under Subject Allocation.</p> : d.schedule.map(s => (
            <div key={s.slotId} className="flex items-center gap-4 px-4 py-3 border-b border-[#EDEFF3] last:border-0 text-[13px]">
              <span className="w-24 font-medium text-[#16264A]">{DAY[s.day]}</span><span className="font-mono">{s.time}</span><span className="text-[#5A6577]">{s.room}</span>
              {s.cancelled && <span className="text-[11px] text-[#A8242C]">cancelled</span>}
            </div>
          ))}
          <p className="px-4 py-2 text-[12px] text-[#5A6577]">{d.registers.submitted} of {d.registers.held} registers submitted · {d.registers.locked} locked</p>
        </div>
      )}

      <Drawer open={student !== null} onClose={() => setStudent(null)} title="Student in this subject">
        {student && <StudentPanel assignmentId={assignmentId} studentId={student} code={d.code} />}
      </Drawer>
    </div>
  );
}

function StudentPanel({ assignmentId, studentId, code }: { assignmentId: string; studentId: string; code: string }) {
  const q = useQuery({ queryKey: ['faculty', 'student', assignmentId, studentId], queryFn: () => api<StudentDetail>(`/api/faculty/subjects/${assignmentId}/students/${studentId}`) });
  if (q.isPending) return <SkeletonRow />;
  if (q.error || !q.data) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  const { student: s, attendance: a } = q.data;
  const scored = q.data.marks.filter(m => m.value !== null);

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <div>
        <p className="text-[16px] font-semibold text-[#16264A]">{s.name}</p>
        <p className="text-[12px] text-[#5A6577]">{s.rollNo} · {s.enrolmentNo} · {s.programme} · Sem {s.semester}</p>
        <div className="flex flex-wrap gap-3 mt-2">
          {s.mobile && <a href={`tel:${s.mobile}`} className="text-[#E0952A]">📞 {s.mobile}</a>}
          <a href={`mailto:${s.email}`} className="text-[#E0952A]">✉ {s.email}</a>
          {s.guardianEmail && <a href={`mailto:${s.guardianEmail}`} className="text-[#E0952A]">✉ Guardian</a>}
          <button onClick={() => navigator.clipboard.writeText(s.email).then(() => toast.success('Email copied'), () => toast.error('Could not copy'))} className="text-[#5A6577] cursor-pointer">Copy email</button>
        </div>
      </div>

      <section>
        <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Attendance in {code}</p>
        <p className="text-[20px] font-semibold" style={{ color: tone(a.percent, a.threshold) }}>{a.held ? `${a.percent}%` : '—'} <span className="text-[13px] font-normal text-[#5A6577]">{a.present} of {a.held} classes</span></p>
        {a.classes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {a.classes.slice(0, 40).map(c => (
              <span key={c.sessionId} title={`${day(c.date)} ${c.time} · ${c.status.toLowerCase()}${c.source ? ` (${c.source.toLowerCase()})` : ''}`}
                className="w-7 h-7 flex items-center justify-center rounded-[2px] text-[11px] font-bold" style={{ background: MARK[c.status].bg, color: MARK[c.status].fg }}>{MARK[c.status].l}</span>
            ))}
          </div>
        )}
        {a.classes.length > 40 && <p className="text-[11px] text-[#5A6577] mt-1">Latest 40 of {a.classes.length} classes shown, newest first.</p>}
      </section>

      <section>
        <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Internal marks · {MARKS_STATUS[q.data.marksStatus] ?? q.data.marksStatus}</p>
        {q.data.marks.length === 0 ? <p className="text-[#5A6577]">Marks sheet not opened yet.</p> : (
          <table className="w-full">
            <tbody>
              {q.data.marks.map(m => <tr key={m.label} className="border-b border-[#EDEFF3]"><td className="py-1.5">{m.label}</td><td className="py-1.5 text-right font-mono">{m.value ?? '—'} / {m.maxMarks}</td></tr>)}
              <tr><td className="py-1.5 font-semibold">Total</td><td className="py-1.5 text-right font-mono font-semibold">{scored.length ? scored.reduce((x, m) => x + (m.value ?? 0), 0) : '—'} / {q.data.marks.reduce((x, m) => x + m.maxMarks, 0)}</td></tr>
            </tbody>
          </table>
        )}
      </section>

      <section>
        <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Attendance in all subjects this term</p>
        {q.data.otherSubjects.map(o => (
          <div key={o.code} className="flex justify-between py-1 border-b border-[#EDEFF3]">
            <span>{o.name} <span className="text-[11px] text-[#5A6577]">· {o.faculty}</span></span>
            <span style={{ color: o.held ? tone(o.percent, a.threshold) : '#5A6577' }}>{o.held ? `${o.percent}%` : '—'}</span>
          </div>
        ))}
      </section>

      {q.data.results.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Results</p>
          {q.data.results.map(r => <div key={r.semester} className="flex justify-between py-1 border-b border-[#EDEFF3]"><span>Semester {r.semester}</span><span>SGPA {r.sgpa.toFixed(2)} · CGPA {r.cgpa.toFixed(2)} · {r.outcome.toLowerCase()}</span></div>)}
        </section>
      )}

      {q.data.disputes.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Attendance disputes</p>
          {q.data.disputes.map(x => <div key={x.id} className="py-1 border-b border-[#EDEFF3]">{day(x.date)} {x.time}: {x.markedAs.toLowerCase()} → {x.requestedStatus.toLowerCase()} · <b>{x.status.toLowerCase()}</b><div className="text-[12px] text-[#5A6577]">{x.reason}</div></div>)}
        </section>
      )}
    </div>
  );
}

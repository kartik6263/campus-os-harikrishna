import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, InlineAlert, Modal, SkeletonRow, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useMySubjects, useTodayClassList, type ApiAttendanceStatus } from '../../lib/facultyqueries';
import { downloadStoredFile } from '../../lib/records';
import { downloadCSV, downloadPdf, qrDataUrl } from '../../lib/export';

interface Props {
  onNavigate: (s: unknown) => void;
  onModule: (m: string) => void;
}

type Mark = 'P' | 'A' | 'L' | 'E';
const TO_API: Record<Mark, ApiAttendanceStatus> = { P: 'PRESENT', A: 'ABSENT', L: 'LATE', E: 'EXCUSED' };
const FROM_API: Record<ApiAttendanceStatus, Mark> = { PRESENT: 'P', ABSENT: 'A', LATE: 'L', EXCUSED: 'E' };
const MARK_STYLE: Record<Mark, { on: string; hover: string; label: string }> = {
  P: { on: 'bg-[#0E7A5F] text-white border-[#0E7A5F]', hover: 'hover:border-[#0E7A5F] hover:text-[#0E7A5F]', label: 'Present' },
  A: { on: 'bg-[#A8242C] text-white border-[#A8242C]', hover: 'hover:border-[#A8242C] hover:text-[#A8242C]', label: 'Absent' },
  L: { on: 'bg-[#8A6D1F] text-white border-[#8A6D1F]', hover: 'hover:border-[#8A6D1F] hover:text-[#8A6D1F]', label: 'Late' },
  E: { on: 'bg-[#1D4ED8] text-white border-[#1D4ED8]', hover: 'hover:border-[#1D4ED8] hover:text-[#1D4ED8]', label: 'Excused (leave/duty)' },
};
const SOURCE: Record<string, string> = { QR: 'QR', MANUAL: 'Roll call', CORRECTION: 'Correction', SEED: 'Imported' };

interface SheetStudent { id: string; rollNo: string; name: string; status: ApiAttendanceStatus | null; source: string | null; runningPercent: number | null; runningHeld: number }
interface Sheet {
  assignmentId: string; code: string; subject: string; classLabel: string; date: string;
  today: boolean; future: boolean; qrOpen: boolean;
  daySlots: Array<{ slotId: string; time: string; room: string; cancelled: boolean }>;
  scheduled: boolean; slotId: string | null; time: string | null; room: string; cancelled: boolean;
  sessionId: string | null; markedAt: string | null; locked: boolean; lockedAt: string | null; lockHours: number;
  students: SheetStudent[];
}
interface Correction {
  id: string; rollNo: string; studentName: string; code: string; subject: string; date: string; time: string;
  markedAs: string; requestedStatus: string; reason: string; attachmentFileId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; raisedAt: string; decidedAt: string | null; decisionNote: string | null;
}
interface SessionRow { sessionId: string; date: string; time: string; room: string; present: number; totalStudents: number; markedAt: string | null; markedBy: string | null; locked: boolean; lockedAt: string | null }
interface Register { code: string; subject: string; classLabel: string; term: string; sessions: Array<{ id: string; date: string; time: string }>; students: Array<{ rollNo: string; name: string; marks: ApiAttendanceStatus[]; present: number; percent: number }> }

/** Today on the Indian calendar, as YYYY-MM-DD. */
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Could not reach the server.');
const pctTone = (p: number) => (p < 65 ? '#A8242C' : p < 75 ? '#8A6D1F' : '#0E7A5F');

/**
 * The lecturer's attendance desk: the roll call for any of their subjects on
 * any day it met, a live QR code the class can mark itself with, the register
 * of every class held, and the students' disputes to decide.
 */
export default function AttendanceMarking(_props: Props) {
  const qc = useQueryClient();
  const subjects = useMySubjects();
  const today = useTodayClassList();
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  // Until one is picked, open on the subject that meets today.
  const meetsToday = today.data.find(c => !c.cancelled)?.code;
  const subject = subjects.data.find(s => s.assignmentId === assignmentId)
    ?? subjects.data.find(s => s.code === meetsToday) ?? subjects.data[0] ?? null;
  const [date, setDate] = useState(istToday);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [tab, setTab] = useState<'mark' | 'register' | 'corrections'>('mark');

  const sheetKey = ['faculty', 'sheet', subject?.assignmentId, date, slotId];
  const [qrSession, setQrSession] = useState<string | null>(null);
  const sheet = useQuery({
    queryKey: sheetKey,
    enabled: Boolean(subject),
    queryFn: () => api<Sheet>(`/api/faculty/subjects/${subject!.assignmentId}/sheet?date=${date}${slotId ? `&slotId=${slotId}` : ''}`),
    // While the class is scanning, watch the sheet fill.
    refetchInterval: qrSession ? 4000 : false,
    // The QR is often on a projector while the lecturer's attention is elsewhere.
    refetchIntervalInBackground: true,
  });

  // Local marks, over what the server holds. Rows the lecturer touched are
  // kept when the sheet refreshes; the rest follow the server (QR scans).
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const touched = useRef(new Set<string>());
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(prev => {
      const next: Record<string, Mark> = {};
      for (const s of sheet.data.students) {
        if (touched.current.has(s.id) && prev[s.id]) next[s.id] = prev[s.id]!;
        else if (s.status) next[s.id] = FROM_API[s.status];
      }
      return next;
    });
  }, [sheet.data]);
  const resetLocal = () => { touched.current = new Set(); setMarks({}); };

  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const students = sheet.data?.students ?? [];
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? students.filter(s => s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q)) : students;
  }, [students, search]);
  const counts = useMemo(() => {
    const c = { P: 0, A: 0, L: 0, E: 0 };
    for (const s of students) { const m = marks[s.id]; if (m) c[m]++; }
    return c;
  }, [marks, students]);
  const unmarked = students.length - counts.P - counts.A - counts.L - counts.E;

  const sh = sheet.data;
  const blocked = !sh || sh.locked || sh.future || !sh.scheduled || sh.cancelled;
  const blockReason = !sh ? null
    : sh.future ? 'This date is in the future — attendance can only be taken for a class that has happened.'
    : !sh.scheduled ? `${sh.code} is not on your timetable on ${dayLabel(date)}. Pick a day it meets.`
    : sh.cancelled ? 'This class is cancelled on the timetable.'
    : sh.locked ? `Locked ${sh.lockHours} hours after submission. Students can still raise a correction, which you decide under Correction requests.`
    : null;

  const set = (id: string, m: Mark) => { touched.current.add(id); setMarks(prev => ({ ...prev, [id]: m })); };
  const setAll = (m: Mark, onlyUnmarked = false) => {
    setMarks(prev => {
      const next = { ...prev };
      for (const s of students) if (!onlyUnmarked || !prev[s.id]) { next[s.id] = m; touched.current.add(s.id); }
      return next;
    });
  };

  const save = useMutation({
    mutationFn: (draft: boolean) => api<{ present: number; absent: number }>(`/api/faculty/subjects/${subject!.assignmentId}/sheet`, {
      method: 'POST',
      body: { date, ...(sh?.slotId ? { slotId: sh.slotId } : {}), draft, records: students.filter(s => marks[s.id]).map(s => ({ studentId: s.id, status: TO_API[marks[s.id]!] })) },
    }),
    onSuccess: (r, draft) => {
      toast.success(draft ? 'Draft saved — you can keep editing' : `Submitted: ${r.present} present, ${r.absent} absent`);
      setConfirm(false);
      touched.current = new Set();
      void qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: e => toast.error(errText(e)),
  });

  // ── Live QR ──
  const [qr, setQr] = useState<{ token: string; image: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const openQr = useMutation({
    mutationFn: async () => {
      const { sessionId } = await api<{ sessionId: string }>(`/api/faculty/subjects/${subject!.assignmentId}/sheet/open`, { method: 'POST', body: { date, ...(sh?.slotId ? { slotId: sh.slotId } : {}) } });
      return sessionId;
    },
    onSuccess: id => setQrSession(id),
    onError: e => toast.error(errText(e)),
  });
  useEffect(() => {
    if (!qrSession) { setQr(null); return; }
    let stop = false;
    let timer: number | undefined;
    const rotate = async () => {
      try {
        const r = await api<{ token: string; expiresAt: string; ttlSeconds: number }>(`/api/attendance/session/${qrSession}/qr`, { method: 'POST' });
        if (stop) return;
        setQr({ token: r.token, image: await qrDataUrl(r.token, 320), expiresAt: new Date(r.expiresAt).getTime() });
        // A fresh code a few seconds before the old one lapses, so a scan never meets a dead code.
        timer = window.setTimeout(rotate, Math.max(5, r.ttlSeconds - 5) * 1000);
      } catch (e) {
        toast.error(errText(e));
        setQrSession(null);
      }
    };
    void rotate();
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; if (timer) window.clearTimeout(timer); window.clearInterval(tick); };
  }, [qrSession]);
  async function closeQr() {
    const id = qrSession;
    setQrSession(null);
    if (id) await api(`/api/attendance/session/${id}/qr`, { method: 'DELETE' }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['faculty'] });
  }

  // ── Register & corrections ──
  const sessions = useQuery({
    queryKey: ['faculty', 'sessions', subject?.assignmentId],
    enabled: Boolean(subject) && tab === 'register',
    queryFn: () => api<{ sessions: SessionRow[]; totalStudents: number }>(`/api/faculty/subjects/${subject!.assignmentId}/sessions`),
  });
  const [corrStatus, setCorrStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const corrections = useQuery({ queryKey: ['faculty', 'corrections', corrStatus], queryFn: () => api<Correction[]>(`/api/faculty/corrections?status=${corrStatus}`) });
  const pendingCount = useQuery({ queryKey: ['faculty', 'corrections', 'PENDING'], queryFn: () => api<Correction[]>('/api/faculty/corrections?status=PENDING') }).data?.length ?? 0;
  const [deciding, setDeciding] = useState<{ c: Correction; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: () => api(`/api/faculty/corrections/${deciding!.c.id}/decide`, { method: 'POST', body: { decision: deciding!.decision, ...(note.trim() ? { note: note.trim() } : {}) } }),
    onSuccess: () => { toast.success(deciding!.decision === 'APPROVE' ? `Approved — ${deciding!.c.studentName}'s record is corrected` : 'Rejected — the student is told why'); setDeciding(null); setNote(''); void qc.invalidateQueries({ queryKey: ['faculty'] }); },
    onError: e => toast.error(errText(e)),
  });

  async function downloadRegister(kind: 'csv' | 'pdf') {
    if (!subject) return;
    try {
      const r = await api<Register>(`/api/faculty/subjects/${subject.assignmentId}/register`);
      if (r.sessions.length === 0) { toast.error('No class has been held yet'); return; }
      const heads = r.sessions.map(s => new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }));
      const letter = (m: ApiAttendanceStatus) => FROM_API[m];
      if (kind === 'csv') {
        const rows = r.students.map(s => ({ rollNo: s.rollNo, name: s.name, ...Object.fromEntries(s.marks.map((m, i) => [`c${i}`, letter(m)])), present: s.present, held: r.sessions.length, percent: s.percent }));
        downloadCSV(`${r.code}-attendance-register`, rows, [
          { key: 'rollNo', label: 'Roll No' }, { key: 'name', label: 'Name' },
          ...heads.map((h, i) => ({ key: `c${i}`, label: `${h} ${r.sessions[i]!.time}` })),
          { key: 'present', label: 'Attended' }, { key: 'held', label: 'Held' }, { key: 'percent', label: '%' },
        ]);
      } else {
        await downloadPdf({
          title: `Attendance register — ${r.code} ${r.subject}`,
          subtitle: `${r.classLabel} · ${r.term} · ${r.sessions.length} classes · P present, A absent, L late, E excused`,
          landscape: true,
          sections: [{ table: { head: ['Roll', 'Name', ...heads, 'Att.', '%'], body: r.students.map(s => [s.rollNo, s.name, ...s.marks.map(letter), String(s.present), `${s.percent}`]) } }],
        });
      }
    } catch (e) { toast.error(errText(e)); }
  }

  if (subjects.isPending) return <div className="p-4"><SkeletonRow /><SkeletonRow /></div>;
  if (subjects.data.length === 0) {
    return <div className="p-6"><InlineAlert type="info">No subject is allocated to you this term. The principal or your head of department allocates subjects under Subject Allocation.</InlineAlert></div>;
  }

  const todayCodes = new Map(today.data.map(c => [c.code, c]));

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Subjects and date ── */}
      <div className="w-64 flex-shrink-0 bg-white border-r border-[#D3D8E0] flex flex-col overflow-y-auto">
        <div className="bg-[#EDEFF3] px-4 py-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">My subjects</span></div>
        {subjects.data.map(s => {
          const active = subject?.assignmentId === s.assignmentId;
          const t = todayCodes.get(s.code);
          return (
            <button key={s.assignmentId}
              onClick={() => { setAssignmentId(s.assignmentId); setSlotId(null); resetLocal(); setSearch(''); if (qrSession) void closeQr(); }}
              className={`w-full text-left px-4 py-3 border-b border-[#D3D8E0] cursor-pointer border-l-2 ${active ? 'border-l-[#E0952A] bg-[#FFFBF5]' : 'border-l-transparent hover:bg-[#EDEFF3]'}`}>
              <p className="text-[13px] font-semibold text-[#16264A] truncate">{s.name}</p>
              <p className="font-mono text-[11px] text-[#5A6577]">{s.code} · {s.totalStudents} students</p>
              <p className="text-[11px] text-[#5A6577] mt-0.5">{s.classLabel} · {s.room}</p>
              {t && (
                <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-[2px] ${t.cancelled ? 'bg-[#EDEFF3] text-[#5A6577]' : t.attendanceMarked ? 'bg-[#E8F5F1] text-[#0E7A5F]' : 'bg-[#FEF9EC] text-[#8A6D1F]'}`}>
                  Today {t.time} · {t.cancelled ? 'cancelled' : t.attendanceMarked ? `marked ${t.studentsPresent ?? 0}/${t.totalStudents}` : 'not marked'}
                </span>
              )}
            </button>
          );
        })}
        <div className="border-t border-[#D3D8E0] mt-auto">
          <div className="bg-[#EDEFF3] px-4 py-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Date</span></div>
          <div className="px-4 py-3 space-y-2">
            <input type="date" value={date} max={istToday()} onChange={e => { if (e.target.value) { setDate(e.target.value); setSlotId(null); resetLocal(); } }}
              className="w-full h-8 px-2 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]" />
            <p className="text-[11px] text-[#5A6577]">{dayLabel(date)}</p>
            {date !== istToday() && <Button size="sm" variant="secondary" className="w-full" onClick={() => { setDate(istToday()); setSlotId(null); resetLocal(); }}>Back to today</Button>}
          </div>
        </div>
      </div>

      {/* ── Right ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex border-b border-[#D3D8E0] bg-white px-4">
          {([['mark', 'Mark attendance'], ['register', 'Register'], ['corrections', `Correction requests${pendingCount ? ` (${pendingCount})` : ''}`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-4 py-3 text-[13px] font-medium border-b-2 cursor-pointer ${tab === id ? 'border-[#E0952A] text-[#16264A]' : 'border-transparent text-[#5A6577] hover:text-[#16264A]'}`}>{label}</button>
          ))}
        </div>

        {tab === 'mark' && (
          <>
            <div className="bg-white border-b border-[#D3D8E0] px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#16264A]">{subject?.name} <span className="font-mono text-[12px] text-[#5A6577]">{subject?.code}</span></p>
                  <p className="text-[12px] text-[#5A6577]">
                    {dayLabel(date)}{sh?.time ? ` · ${sh.time}` : ''}{sh?.room ? ` · ${sh.room}` : ''}
                    {sh?.markedAt ? ` · submitted ${new Date(sh.markedAt).toLocaleString('en-IN')}${sh.lockedAt && !sh.locked ? `, editable until ${new Date(sh.lockedAt).toLocaleString('en-IN')}` : ''}` : sh?.sessionId ? ' · draft, not submitted' : ''}
                  </p>
                </div>
                {sh && sh.daySlots.length > 1 && (
                  <select value={sh.slotId ?? ''} onChange={e => { setSlotId(e.target.value); resetLocal(); }} className="h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px] bg-white cursor-pointer">
                    {sh.daySlots.map(s => <option key={s.slotId} value={s.slotId}>{s.time} · {s.room}{s.cancelled ? ' (cancelled)' : ''}</option>)}
                  </select>
                )}
              </div>
              {blockReason && <InlineAlert type={sh?.locked ? 'error' : 'warning'}>{blockReason}</InlineAlert>}
              {!blocked && !sh!.today && <InlineAlert type="info">You are recording a past class ({dayLabel(date)}). It is saved with today's time and the audit log notes who marked it.</InlineAlert>}
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="secondary" disabled={blocked} onClick={() => setAll('P')}>All present</Button>
                <Button size="sm" variant="secondary" disabled={blocked} onClick={() => setAll('A')}>All absent</Button>
                <Button size="sm" variant="secondary" disabled={blocked || unmarked === 0} onClick={() => setAll('A', true)}>Unmarked → absent</Button>
                {sh?.today && !blocked && <Button size="sm" variant="secondary" loading={openQr.isPending} onClick={() => openQr.mutate()}>Show QR to class</Button>}
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or roll no…" className="h-8 px-3 text-[13px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] w-[200px]" />
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="secondary" disabled={blocked || counts.P + counts.A + counts.L + counts.E === 0} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>Save draft</Button>
                  <Button size="sm" disabled={blocked || unmarked > 0 || students.length === 0} onClick={() => setConfirm(true)}>{sh?.markedAt ? 'Resubmit' : 'Submit'}</Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sheet.isPending ? <div className="p-4"><SkeletonRow /><SkeletonRow /></div>
                : sheet.error ? <div className="p-4"><InlineAlert type="error">{errText(sheet.error)}</InlineAlert></div>
                : students.length === 0 ? <p className="p-8 text-center text-[14px] text-[#5A6577]">No students are enrolled in this subject.</p>
                : (
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-[#EDEFF3] z-10">
                      <tr className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">
                        <th className="px-4 py-2 text-left w-28">Roll no.</th><th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left w-36 hidden lg:table-cell">Attendance so far</th><th className="px-4 py-2 text-left w-24 hidden xl:table-cell">Recorded by</th>
                        <th className="px-4 py-2 text-center w-44">P / A / L / E</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D3D8E0]">
                      {shown.map(s => (
                        <tr key={s.id} className="bg-white hover:bg-[#FAFBFC]">
                          <td className="px-4 py-2.5 font-mono text-[13px] text-[#16264A]">{s.rollNo}</td>
                          <td className="px-4 py-2.5 text-[14px] text-[#16264A]">{s.name}</td>
                          <td className="px-4 py-2.5 hidden lg:table-cell">
                            {s.runningHeld === 0 ? <span className="text-[11px] text-[#5A6577]">No class yet</span> : (
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-[#D3D8E0] rounded-full overflow-hidden"><div className="h-full" style={{ width: `${Math.min(100, s.runningPercent ?? 0)}%`, background: pctTone(s.runningPercent ?? 0) }} /></div>
                                <span className="text-[11px] font-mono" style={{ color: pctTone(s.runningPercent ?? 0) }}>{s.runningPercent}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-[#5A6577] hidden xl:table-cell">{touched.current.has(s.id) ? 'You (unsaved)' : s.source ? SOURCE[s.source] ?? s.source : '—'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center">
                              {(['P', 'A', 'L', 'E'] as Mark[]).map((m, i) => (
                                <button key={m} disabled={blocked} title={MARK_STYLE[m].label} onClick={() => set(s.id, m)}
                                  className={`w-9 h-7 text-[12px] font-semibold border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${i === 0 ? 'rounded-l-[4px]' : ''} ${i === 3 ? 'rounded-r-[4px]' : 'border-r-0'} ${marks[s.id] === m ? MARK_STYLE[m].on : `bg-white text-[#5A6577] border-[#D3D8E0] ${MARK_STYLE[m].hover}`}`}>
                                  {m}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#5A6577] text-[14px]">No students match your search.</td></tr>}
                    </tbody>
                  </table>
                )}
            </div>

            <div className="bg-[#16264A] text-white px-6 py-2.5 flex items-center gap-6 flex-shrink-0 text-[13px]">
              <span className="font-semibold text-[#4ADE80]">Present {counts.P}</span>
              <span className="font-semibold text-[#F87171]">Absent {counts.A}</span>
              <span className="font-semibold text-[#FBD14B]">Late {counts.L}</span>
              <span className="font-semibold text-[#93C5FD]">Excused {counts.E}</span>
              <span className="text-white/70">of {students.length}</span>
              {unmarked > 0 && <span className="ml-auto text-[12px] text-white/60">{unmarked} not marked yet — mark everyone to submit</span>}
            </div>
          </>
        )}

        {tab === 'register' && (
          <div className="flex-1 overflow-y-auto bg-[#EDEFF3] p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] font-semibold text-[#16264A] mr-auto">{subject?.name} — classes held</p>
              <Button size="sm" variant="secondary" onClick={() => downloadRegister('csv')}>Download register (Excel/CSV)</Button>
              <Button size="sm" variant="secondary" onClick={() => downloadRegister('pdf')}>Download register (PDF)</Button>
            </div>
            <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
              {sessions.isPending ? <div className="p-4"><SkeletonRow /></div>
                : (sessions.data?.sessions ?? []).length === 0 ? <p className="p-6 text-center text-[13px] text-[#5A6577]">No class has been held yet.</p>
                : (
                  <table className="w-full text-left">
                    <thead className="bg-[#EDEFF3] text-[11px] uppercase tracking-wider text-[#5A6577]">
                      <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Time</th><th className="px-4 py-2">Present</th><th className="px-4 py-2">Marked by</th><th className="px-4 py-2">State</th><th className="px-4 py-2" /></tr>
                    </thead>
                    <tbody>
                      {sessions.data!.sessions.map(r => (
                        <tr key={r.sessionId} className="border-t border-[#EDEFF3] text-[13px]">
                          <td className="px-4 py-2 text-[#16264A]">{dayLabel(r.date)}</td>
                          <td className="px-4 py-2 text-[#5A6577]">{r.time} · {r.room}</td>
                          <td className="px-4 py-2 font-mono">{r.present}/{r.totalStudents}</td>
                          <td className="px-4 py-2 text-[#5A6577]">{r.markedBy ?? '—'}</td>
                          <td className="px-4 py-2 text-[12px]">{r.locked ? <span className="text-[#5A6577]">Locked</span> : r.markedAt ? <span className="text-[#0E7A5F]">Submitted, editable</span> : <span className="text-[#8A6D1F]">Draft — not submitted</span>}</td>
                          <td className="px-4 py-2 text-right"><button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => { setDate(r.date.slice(0, 10)); setSlotId(null); resetLocal(); setTab('mark'); }}>Open</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        )}

        {tab === 'corrections' && (
          <div className="flex-1 overflow-y-auto bg-[#EDEFF3] p-4 space-y-3">
            <div className="flex gap-2">
              {(['PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
                <button key={s} onClick={() => setCorrStatus(s)} className={`h-8 px-3 text-[13px] rounded-[4px] border cursor-pointer ${corrStatus === s ? 'bg-[#16264A] text-white border-[#16264A]' : 'bg-white text-[#16264A] border-[#D3D8E0]'}`}>{s === 'PENDING' ? 'Waiting' : s[0] + s.slice(1).toLowerCase()}</button>
              ))}
            </div>
            {corrections.isPending && <SkeletonRow />}
            {(corrections.data ?? []).length === 0 && !corrections.isPending && <div className="bg-white border border-[#D3D8E0] rounded-[2px] px-4 py-8 text-center text-[14px] text-[#5A6577]">No {corrStatus === 'PENDING' ? 'waiting' : corrStatus.toLowerCase()} requests for your subjects.</div>}
            {(corrections.data ?? []).map(c => (
              <div key={c.id} className="bg-white border border-[#D3D8E0] rounded-[2px] px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#16264A]">{c.studentName} <span className="font-mono text-[12px] text-[#5A6577]">{c.rollNo}</span></p>
                  <p className="text-[13px] text-[#5A6577] mt-1">{c.code} · {dayLabel(c.date)} {c.time} · marked <b className="text-[#A8242C]">{c.markedAs.toLowerCase()}</b> → asks <b className="text-[#0E7A5F]">{c.requestedStatus.toLowerCase()}</b></p>
                  <p className="text-[13px] text-[#16264A] mt-2">{c.reason}</p>
                  {c.attachmentFileId && <button onClick={() => downloadStoredFile(c.attachmentFileId!, `proof-${c.rollNo}`).catch(() => toast.error('Could not open the proof'))} className="text-[12px] text-[#E0952A] mt-1.5 cursor-pointer">📎 Open the student's proof</button>}
                  <p className="text-[11px] text-[#5A6577] mt-1.5">Raised {new Date(c.raisedAt).toLocaleString('en-IN')}{c.decisionNote ? ` · Your note: ${c.decisionNote}` : ''}</p>
                </div>
                {c.status === 'PENDING' && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" onClick={() => { setDeciding({ c, decision: 'APPROVE' }); setNote(''); }}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => { setDeciding({ c, decision: 'REJECT' }); setNote(''); }}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit attendance"
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(false)}>Submit</Button></>}>
        <p className="text-[14px] text-[#16264A]">The sheet stays editable for {sh?.lockHours ?? 24} hours after you submit, then locks. After that only an approved correction can change a mark.</p>
        <div className="mt-3 bg-[#EDEFF3] rounded-[2px] px-4 py-3 text-[13px] text-[#5A6577]">
          <p>Subject: <strong className="text-[#16264A]">{subject?.name}</strong> ({subject?.code})</p>
          <p className="mt-1">Class: {dayLabel(date)} {sh?.time}</p>
          <p className="mt-1">Present <strong>{counts.P}</strong> · Absent <strong>{counts.A}</strong> · Late <strong>{counts.L}</strong> · Excused <strong>{counts.E}</strong></p>
        </div>
      </Modal>

      {/* Live QR */}
      <Modal open={qrSession !== null} onClose={() => void closeQr()} title={`QR attendance — ${subject?.code ?? ''}`} width="560px"
        footer={<Button onClick={() => void closeQr()}>Stop QR and review the sheet</Button>}>
        <div className="flex flex-col items-center gap-3">
          {qr ? <img src={qr.image} alt="Attendance QR code" className="w-[320px] h-[320px]" /> : <div className="w-[320px] h-[320px] flex items-center justify-center text-[#5A6577]">Preparing code…</div>}
          {qr && <p className="font-mono text-[16px] text-[#16264A] select-all">{qr.token}</p>}
          {qr && <p className="text-[12px] text-[#5A6577]">New code in {Math.max(0, Math.ceil((qr.expiresAt - now) / 1000) - 5)} s — screenshots expire, so only students in the room can mark.</p>}
          <p className="text-[15px] font-semibold text-[#0E7A5F]">{students.filter(s => s.source === 'QR').length} of {students.length} have scanned</p>
          <p className="text-[12px] text-[#5A6577] text-center">Students scan in the app or the student portal (Attendance → Scan QR). When you stop, mark anyone left and submit.</p>
        </div>
      </Modal>

      {/* Decide a correction */}
      <Modal open={deciding !== null} onClose={() => setDeciding(null)} title={deciding?.decision === 'APPROVE' ? 'Approve correction' : 'Reject correction'}
        footer={<><Button variant="secondary" onClick={() => setDeciding(null)}>Cancel</Button><Button variant={deciding?.decision === 'REJECT' ? 'destructive' : 'primary'} loading={decide.isPending} disabled={deciding?.decision === 'REJECT' && !note.trim()} onClick={() => decide.mutate()}>{deciding?.decision === 'APPROVE' ? 'Approve and correct the record' : 'Reject'}</Button></>}>
        {deciding && (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-[#16264A]">{deciding.c.studentName} · {deciding.c.code} · {dayLabel(deciding.c.date)} — {deciding.c.markedAs.toLowerCase()} → {deciding.c.requestedStatus.toLowerCase()}</p>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">{deciding.decision === 'REJECT' ? 'Reason (required — the student sees it)' : 'Note (optional)'}</span>
              <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={500} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

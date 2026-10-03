import { useState, useMemo, useRef, useEffect } from 'react';
import { Button, Modal, toast } from '../../components/ui';
import {
  useCorrectionList,
  useDaySheet,
  useDecideCorrection,
  useMySubjects,
  useSaveDaySheet,
  type LegacyCorrection as CorrectionRequest,
  type LegacyFacultySubject as FacultySubject,
} from '../../lib/facultyqueries';

interface Props {
  onNavigate: (s: unknown) => void;
  onModule: (m: string) => void;
}

type AttStatus = 'P' | 'A' | 'L';

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {action}
    </div>
  );
}

function AttBar({ pct }: { pct: number }) {
  const color = pct < 65 ? '#A8242C' : pct < 75 ? '#8A6D1F' : '#0E7A5F';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-[#D3D8E0] rounded-full overflow-hidden">
        <div style={{ width: `${Math.min(pct, 100)}%`, background: color }} className="h-full rounded-full" />
      </div>
      <span className="text-[11px] font-mono" style={{ color }}>{pct}%</span>
    </div>
  );
}

const TODAY = '19-09-2024';

/** Today, as the date input wants it. */
const isoToday = () => new Date().toISOString().split('T')[0];

export default function AttendanceMarking({ }: Props) {
  const { data: MY_SUBJECTS } = useMySubjects();
  const [subjectCode, setSubjectCode] = useState<string | null>(null);
  const selectedSubject: FacultySubject | null =
    MY_SUBJECTS.find(s => s.code === subjectCode) ?? MY_SUBJECTS[0] ?? null;
  const setSelectedSubject = (s: FacultySubject | null) => setSubjectCode(s?.code ?? null);

  const [selectedDate, setSelectedDate] = useState(isoToday());

  const { data: sheet } = useDaySheet(selectedSubject?.assignmentId ?? null, selectedDate);
  const saveSheet = useSaveDaySheet();

  const [attendance, setAttendance] = useState<Record<string, AttStatus>>({});
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showCheckboxes, setShowCheckboxes] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [activeTab, setActiveTab] = useState<'mark' | 'corrections'>('mark');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  const { data: CORRECTION_REQUESTS } = useCorrectionList();
  const decideCorrection = useDecideCorrection();
  const [rejectCorrId, setRejectCorrId] = useState<string | null>(null);
  const [rejectCorrReason, setRejectCorrReason] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roster = useMemo(
    () =>
      (sheet?.students ?? []).map(s => ({
        id: s.id,
        rollNo: s.rollNo,
        name: s.name,
        attendance: undefined as number | undefined,
      })),
    [sheet],
  );

  // Whatever the server already has for this day is what the sheet opens on —
  // including rows a student marked themselves by scanning the QR code.
  useEffect(() => {
    if (!sheet) return;
    const existing: Record<string, AttStatus> = {};
    for (const s of sheet.students) {
      if (s.status === 'PRESENT') existing[s.rollNo] = 'P';
      else if (s.status === 'ABSENT') existing[s.rollNo] = 'A';
      else if (s.status === 'LATE' || s.status === 'EXCUSED') existing[s.rollNo] = 'L';
    }
    setAttendance(existing);
  }, [sheet]);

  const filteredRoster = useMemo(() => {
    if (!searchQuery.trim()) return roster;
    const q = searchQuery.toLowerCase();
    return roster.filter(
      (s) => s.name.toLowerCase().includes(q) || s.rollNo.includes(q)
    );
  }, [roster, searchQuery]);

  const isLocked = sheet?.locked ?? false;
  const lockWarning = isLocked || (sheet !== undefined && !sheet.scheduled);

  const allMarked = roster.length > 0 && roster.every((s) => attendance[s.rollNo] !== undefined);

  const summary = useMemo(() => {
    let P = 0, A = 0, L = 0;
    roster.forEach((s) => {
      const st = attendance[s.rollNo];
      if (st === 'P') P++;
      else if (st === 'A') A++;
      else if (st === 'L') L++;
    });
    return { P, A, L, total: roster.length };
  }, [attendance, roster]);

  function setStatus(rollNo: string, status: AttStatus) {
    setAttendance((prev) => ({ ...prev, [rollNo]: status }));
  }

  function markAll(status: AttStatus) {
    const next: Record<string, AttStatus> = {};
    roster.forEach((s) => { next[s.rollNo] = status; });
    setAttendance((prev) => ({ ...prev, ...next }));
  }

  function markBulk(status: AttStatus) {
    const next: Record<string, AttStatus> = {};
    bulkSelected.forEach((roll) => { next[roll] = status; });
    setAttendance((prev) => ({ ...prev, ...next }));
    setBulkSelected(new Set());
    setShowCheckboxes(false);
  }

  function toggleBulkSelect(rollNo: string) {
    setShowCheckboxes(true);
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rollNo)) next.delete(rollNo);
      else next.add(rollNo);
      return next;
    });
  }

  /** Turns the P/A/L grid into the records the API takes. */
  function records() {
    const STATUS = { P: 'PRESENT', A: 'ABSENT', L: 'LATE' } as const;
    return roster
      .filter(s => attendance[s.rollNo] !== undefined)
      .map(s => ({ studentId: s.id, status: STATUS[attendance[s.rollNo]!] }));
  }

  async function save(draft: boolean) {
    if (!selectedSubject) return;
    const payload = records();
    if (payload.length === 0) {
      toast.error('Mark at least one student first.');
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    try {
      await saveSheet.mutateAsync({
        assignmentId: selectedSubject.assignmentId,
        date: selectedDate,
        records: payload,
        draft,
      });
      setSaveState('saved');
      toast.success(draft ? 'Attendance draft saved' : 'Attendance submitted and locked');
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      setSaveState('idle');
      toast.error(err instanceof Error ? err.message : 'Could not save attendance.');
    }
  }

  function handleSaveDraft() {
    void save(true);
  }

  function handleSubmitConfirm() {
    setSubmitModalOpen(false);
    void save(false);
  }

  async function handleCorrectionApprove(req: CorrectionRequest) {
    try {
      await decideCorrection.mutateAsync({ id: req.id, decision: 'APPROVE' });
      toast.success(`Correction approved — ${req.studentName} notified`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve the correction.');
    }
  }

  async function handleCorrectionRejectConfirm() {
    if (!rejectCorrId || !rejectCorrReason.trim()) return;
    try {
      await decideCorrection.mutateAsync({
        id: rejectCorrId,
        decision: 'REJECT',
        note: rejectCorrReason.trim(),
      });
      toast.error('Correction rejected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject the correction.');
    } finally {
      setRejectCorrId(null);
      setRejectCorrReason('');
    }
  }

  const pendingCorrections = CORRECTION_REQUESTS.filter((r) => r.status === 'pending');

  function statusButtonClass(current: AttStatus | undefined, target: AttStatus) {
    const active = current === target;
    if (target === 'P') {
      return active
        ? 'bg-[#0E7A5F] text-white border-[#0E7A5F]'
        : 'bg-white text-[#5A6577] border-[#D3D8E0] hover:border-[#0E7A5F] hover:text-[#0E7A5F]';
    }
    if (target === 'A') {
      return active
        ? 'bg-[#A8242C] text-white border-[#A8242C]'
        : 'bg-white text-[#5A6577] border-[#D3D8E0] hover:border-[#A8242C] hover:text-[#A8242C]';
    }
    // L
    return active
      ? 'bg-[#8A6D1F] text-white border-[#8A6D1F]'
      : 'bg-white text-[#5A6577] border-[#D3D8E0] hover:border-[#8A6D1F] hover:text-[#8A6D1F]';
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel: Subject + Date selector ── */}
      <div className="w-64 flex-shrink-0 bg-white border-r border-[#D3D8E0] flex flex-col overflow-y-auto">
        <SectionLabel label="Select Subject" />
        <div className="flex-1">
          {MY_SUBJECTS.map((subj) => {
            const active = selectedSubject?.code === subj.code;
            const todayMarked = subj.code === 'BCA501'; // BCA501 has attendance marked per data
            return (
              <button
                key={subj.code}
                onClick={() => {
                  setSelectedSubject(subj);
                  setAttendance({});
                  setBulkSelected(new Set());
                  setShowCheckboxes(false);
                  setSaveState('idle');
                  setSearchQuery('');
                }}
                className={`w-full text-left px-4 py-3 border-b border-[#D3D8E0] transition-colors cursor-pointer
                  ${active
                    ? 'border-l-2 border-l-[#E0952A] bg-[#FFFBF5]'
                    : 'border-l-2 border-l-transparent hover:bg-[#EDEFF3]'
                  }`}
              >
                <p className={`text-[13px] font-semibold truncate ${active ? 'text-[#16264A]' : 'text-[#16264A]'}`}>
                  {subj.name}
                </p>
                <p className="font-mono text-[11px] text-[#5A6577]">{subj.code}</p>
                <p className="text-[11px] text-[#5A6577] mt-0.5">{subj.classLabel} · {subj.room}</p>
                {todayMarked && (
                  <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-[2px] bg-[#E8F5F1] text-[#0E7A5F]">
                    Marked today
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Date selector */}
        <div className="border-t border-[#D3D8E0]">
          <SectionLabel label="Date" />
          <div className="px-4 py-3 space-y-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-8 px-2 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
            />
            {lockWarning && (
              <p className="text-[11px] text-[#8A6D1F] bg-[#FFF7E6] px-2 py-1.5 rounded-[2px]">
                ⚠ Backdated entry. May require HOD approval.
              </p>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => setSelectedDate('2024-09-19')}
            >
              Mark Today ({TODAY})
            </Button>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Tab bar */}
        <div className="flex border-b border-[#D3D8E0] bg-white px-4 gap-0">
          {(['mark', 'corrections'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors cursor-pointer
                ${activeTab === tab
                  ? 'border-[#E0952A] text-[#16264A]'
                  : 'border-transparent text-[#5A6577] hover:text-[#16264A]'
                }`}
            >
              {tab === 'mark' ? 'Mark Attendance' : `Correction Requests${pendingCorrections.length > 0 ? ` (${pendingCorrections.length})` : ''}`}
            </button>
          ))}
        </div>

        {activeTab === 'mark' ? (
          <>
            {/* Toolbar */}
            <div className="bg-white border-b border-[#D3D8E0] px-4 py-2 flex items-center gap-2 flex-wrap">
              {isLocked && (
                <div className="w-full mb-1 px-3 py-1.5 bg-[#FFF0F0] text-[#A8242C] text-[12px] font-medium rounded-[2px]">
                  🔒 Locked — 24h window expired. Contact HOD for corrections.
                </div>
              )}
              <Button size="sm" variant="secondary" onClick={() => markAll('P')} disabled={isLocked}>
                Mark All Present
              </Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('A')} disabled={isLocked}>
                Mark All Absent
              </Button>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  placeholder="Search name or roll no…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full max-w-[220px] h-8 px-3 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] placeholder-[#5A6577]"
                />
              </div>
              {showCheckboxes && bulkSelected.size > 0 && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => markBulk('P')} disabled={isLocked}
                    className="text-[#0E7A5F] border-[#0E7A5F]">
                    Bulk Present ({bulkSelected.size})
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => markBulk('A')} disabled={isLocked}
                    className="text-[#A8242C] border-[#A8242C]">
                    Bulk Absent ({bulkSelected.size})
                  </Button>
                </>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={saveState === 'saving'}
                  disabled={isLocked || saveState === 'saving'}
                  onClick={handleSaveDraft}
                >
                  {saveState === 'saved' ? 'Saved ✓' : 'Save Draft'}
                </Button>
                <Button
                  size="sm"
                  disabled={!allMarked || isLocked}
                  onClick={() => setSubmitModalOpen(true)}
                >
                  Submit &amp; Lock
                </Button>
              </div>
            </div>

            {/* Roster table */}
            <div className="flex-1 overflow-y-auto">
              {!selectedSubject ? (
                <div className="flex items-center justify-center h-full text-[#5A6577] text-[14px]">
                  Select a subject to begin marking.
                </div>
              ) : roster.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[#5A6577] text-[14px]">
                  No students enrolled for this subject.
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-[#EDEFF3] z-10">
                    <tr>
                      {showCheckboxes && <th className="w-8 px-3 py-2" />}
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider w-24">Roll No.</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider w-32 hidden md:table-cell">Running %</th>
                      <th className="px-4 py-2 text-center text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider w-36">P / A / L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D3D8E0]">
                    {filteredRoster.map((student) => {
                      const status = attendance[student.rollNo];
                      const runningPct = student.attendance ?? 75;
                      const isChecked = bulkSelected.has(student.rollNo);
                      return (
                        <tr
                          key={student.rollNo}
                          className={`bg-white hover:bg-[#FAFBFC] transition-colors ${isChecked ? 'bg-[#FFFBF5]' : ''}`}
                        >
                          {showCheckboxes && (
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleBulkSelect(student.rollNo)}
                                className="cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {!showCheckboxes && (
                                <input
                                  type="checkbox"
                                  className="opacity-0 hover:opacity-100 cursor-pointer transition-opacity w-3 h-3"
                                  onChange={() => toggleBulkSelect(student.rollNo)}
                                />
                              )}
                              <span className="font-mono text-[13px] text-[#16264A]">{student.rollNo}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[14px] text-[#16264A]">{student.name}</td>
                          <td className="px-4 py-2.5 hidden md:table-cell">
                            <AttBar pct={runningPct} />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-0">
                              {(['P', 'A', 'L'] as AttStatus[]).map((s, idx) => (
                                <button
                                  key={s}
                                  disabled={isLocked}
                                  onClick={() => setStatus(student.rollNo, s)}
                                  className={`w-9 h-7 text-[12px] font-semibold border transition-colors cursor-pointer
                                    ${idx === 0 ? 'rounded-l-[4px]' : idx === 2 ? 'rounded-r-[4px]' : ''}
                                    border-r-0 last:border-r
                                    ${statusButtonClass(status, s)}
                                    disabled:opacity-40 disabled:cursor-not-allowed`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRoster.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[#5A6577] text-[14px]">
                          No students match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Summary bar */}
            <div className="bg-[#16264A] text-white px-6 py-2.5 flex items-center gap-6 flex-shrink-0">
              <span className="text-[13px]">
                <span className="font-semibold text-[#4ADE80]">Present: {summary.P}</span>
              </span>
              <span className="text-[13px]">
                <span className="font-semibold text-[#F87171]">Absent: {summary.A}</span>
              </span>
              <span className="text-[13px]">
                <span className="font-semibold text-[#FBD14B]">Late: {summary.L}</span>
              </span>
              <span className="text-white/50">|</span>
              <span className="text-[13px] text-white/70">Total: {summary.total}</span>
              {!allMarked && roster.length > 0 && (
                <span className="ml-auto text-[12px] text-white/50">
                  {roster.length - summary.P - summary.A - summary.L} students unmarked
                </span>
              )}
            </div>
          </>
        ) : (
          /* ── Corrections Tab ── */
          <div className="flex-1 overflow-y-auto bg-[#EDEFF3]">
            <div className="p-4 space-y-3">
              {CORRECTION_REQUESTS.map((req) => {
                const status = req.status;
                return (
                  <div key={req.id} className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-[14px] font-semibold text-[#16264A]">{req.studentName}</p>
                            <span className="font-mono text-[12px] text-[#5A6577]">Roll #{req.rollNo}</span>
                            <span className="font-mono text-[11px] text-[#5A6577]">{req.id}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 text-[13px] text-[#5A6577]">
                            <span>Date: <span className="font-mono">{req.date}</span></span>
                            <span>
                              Marked{' '}
                              <span className="font-mono font-bold text-[#A8242C]">{req.markedAs}</span>
                              {' → Requests '}
                              <span className="font-mono font-bold text-[#0E7A5F]">{req.requestedStatus}</span>
                            </span>
                          </div>
                          <p className="text-[13px] text-[#16264A] mt-2">{req.reason}</p>
                          {req.attachment && (
                            <p className="text-[12px] text-[#5A6577] mt-1.5">
                              📎{' '}
                              <span className="text-[#16264A] underline cursor-pointer hover:text-[#E0952A]">
                                {req.attachment}
                              </span>
                            </p>
                          )}
                          <p className="text-[11px] text-[#5A6577] mt-1.5">
                            Raised on: <span className="font-mono">{req.raisedOn}</span>
                          </p>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">
                          {status === 'pending' ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="text-[#0E7A5F] border-[#0E7A5F] hover:bg-[#E8F5F1]"
                                onClick={() => handleCorrectionApprove(req)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setRejectCorrId(req.id);
                                  setRejectCorrReason('');
                                }}
                              >
                                Reject
                              </Button>
                            </>
                          ) : status === 'approved' ? (
                            <span className="text-[12px] font-medium px-2 py-1 rounded-[2px] bg-[#E8F5F1] text-[#0E7A5F]">
                              Approved ✓
                            </span>
                          ) : (
                            <span className="text-[12px] font-medium px-2 py-1 rounded-[2px] bg-[#FFF0F0] text-[#A8242C]">
                              Rejected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {CORRECTION_REQUESTS.length === 0 && (
                <div className="bg-white border border-[#D3D8E0] rounded-[2px] px-4 py-8 text-center">
                  <p className="text-[14px] text-[#5A6577]">No correction requests for your subjects.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Submit confirmation modal */}
      <Modal
        open={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        title="Submit &amp; Lock Attendance"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setSubmitModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitConfirm}>
              Yes, Submit &amp; Lock
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-[#16264A]">
          Once submitted, this attendance record <strong>cannot be edited</strong> after 24 hours.
          Students with corrections will need to raise a request.
        </p>
        <div className="mt-3 bg-[#EDEFF3] rounded-[2px] px-4 py-3 text-[13px] text-[#5A6577]">
          <p>Subject: <strong className="text-[#16264A]">{selectedSubject?.name}</strong></p>
          <p className="mt-1">Date: <span className="font-mono">{TODAY}</span></p>
          <p className="mt-1">
            Present: <strong>{summary.P}</strong> · Absent: <strong>{summary.A}</strong> · Late: <strong>{summary.L}</strong>
          </p>
        </div>
      </Modal>

      {/* Correction reject modal */}
      <Modal
        open={rejectCorrId !== null}
        onClose={() => { setRejectCorrId(null); setRejectCorrReason(''); }}
        title="Reject Correction Request"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setRejectCorrId(null); setRejectCorrReason(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectCorrReason.trim()}
              onClick={handleCorrectionRejectConfirm}
            >
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-[#5A6577] mb-3">
          Provide a mandatory reason. The student will be notified of this rejection.
        </p>
        <label className="block text-[13px] font-medium text-[#16264A] mb-1">
          Rejection Reason <span className="text-[#A8242C]">*</span>
        </label>
        <textarea
          className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] text-[#16264A] placeholder-[#5A6577] outline-none focus:border-[#E0952A] resize-none"
          rows={3}
          placeholder="e.g., No supporting evidence provided…"
          value={rejectCorrReason}
          onChange={(e) => setRejectCorrReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

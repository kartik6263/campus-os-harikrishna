import { useState, useMemo } from 'react';
import { Button, Modal, toast } from '../../components/ui';
import {
  useCorrectionList,
  useDecideCorrection,
  useMenteeList,
  useMySubjects,
  useTodayClassList,
  type LegacyCorrection as CorrectionRequest,
} from '../../lib/facultyqueries';

interface Props {
  onNavigate: (s: unknown) => void;
  onModule: (m: string) => void;
}

// ─── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {action}
    </div>
  );
}

// ─── Attendance bar ────────────────────────────────────────────────────────────
function AttendanceBar({ pct }: { pct: number }) {
  const color = pct < 65 ? '#A8242C' : pct < 75 ? '#8A6D1F' : '#0E7A5F';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#D3D8E0] rounded-full overflow-hidden">
        <div style={{ width: `${pct}%`, background: color }} className="h-full rounded-full transition-all" />
      </div>
      <span className="text-[12px] font-mono font-medium" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ─── Stat Tile ─────────────────────────────────────────────────────────────────
function StatTile({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="border border-[#D3D8E0] bg-white rounded-[2px] px-5 py-4 flex flex-col gap-1">
      <span className="text-[28px] font-bold leading-none" style={{ color }}>{value}</span>
      <span className="text-[12px] text-[#5A6577]">{label}</span>
    </div>
  );
}

export default function FacultyDashboard({ onModule }: Props) {
  const { data: TODAY_CLASSES } = useTodayClassList();
  const { data: MY_SUBJECTS } = useMySubjects();
  const { data: CORRECTION_REQUESTS } = useCorrectionList();
  const { data: MENTEES } = useMenteeList();
  const decideCorrection = useDecideCorrection();

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pendingCorrections = useMemo(
    () => CORRECTION_REQUESTS.filter((r) => r.status === 'pending'),
    [CORRECTION_REQUESTS]
  );

  // The marks status rides along with the teaching load, so the dashboard
  // does not have to open every sheet to know which ones still need work.
  const pendingMarks = useMemo(
    () =>
      MY_SUBJECTS.filter(
        (s) =>
          s.marksStatus === 'not_started' ||
          s.marksStatus === 'draft' ||
          s.marksStatus === 'returned',
      ),
    [MY_SUBJECTS]
  );

  const atRiskMentees = useMemo(() => MENTEES.filter((m) => m.atRisk), [MENTEES]);

  const totalStudents = useMemo(
    () => Math.max(0, ...MY_SUBJECTS.map((s) => s.totalStudents)),
    [MY_SUBJECTS]
  );

  async function handleApprove(req: CorrectionRequest) {
    try {
      await decideCorrection.mutateAsync({ id: req.id, decision: 'APPROVE' });
      toast.success(`Correction approved — ${req.studentName} notified`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve the correction.');
    }
  }

  async function handleRejectConfirm() {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      await decideCorrection.mutateAsync({
        id: rejectId,
        decision: 'REJECT',
        note: rejectReason.trim(),
      });
      toast.error('Correction rejected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject the correction.');
    } finally {
      setRejectId(null);
      setRejectReason('');
    }
  }

  function marksStatusLabel(status: string) {
    if (status === 'draft') return { label: 'Draft', color: '#8A6D1F', bg: '#FFF7E6' };
    if (status === 'not_started') return { label: 'Not Started', color: '#5A6577', bg: '#EDEFF3' };
    if (status === 'returned') return { label: 'Returned', color: '#A8242C', bg: '#FFF0F0' };
    return { label: status, color: '#5A6577', bg: '#EDEFF3' };
  }

  const allMarksSubmitted = pendingMarks.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile value={totalStudents} label="Students Taught" color="#16264A" />
        <StatTile value={TODAY_CLASSES.length} label="Today's Classes" color="#0E7A5F" />
        <StatTile
          value={pendingMarks.length}
          label="Pending Marks"
          color={pendingMarks.length > 0 ? '#8A6D1F' : '#0E7A5F'}
        />
        <StatTile value={atRiskMentees.length} label="At-Risk Mentees" color="#A8242C" />
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Section 1: Today's Classes */}
        <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
          <SectionLabel label="Today's Classes" />
          <div className="divide-y divide-[#D3D8E0]">
            {TODAY_CLASSES.map((cls, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-[#5A6577]">{cls.time}</span>
                      {cls.cancelled && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-[2px] bg-[#FFF0F0] text-[#A8242C]">
                          CANCELLED
                        </span>
                      )}
                    </div>
                    <p className="text-[14px] font-semibold text-[#16264A] mt-0.5 truncate">{cls.subject}</p>
                    <p className="text-[11px] text-[#5A6577] font-mono">{cls.code}</p>
                    <p className="text-[12px] text-[#5A6577] mt-0.5">
                      {cls.classLabel} · {cls.room}
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    {!cls.cancelled && cls.attendanceMarked ? (
                      <>
                        <span className="text-[11px] font-medium text-[#0E7A5F] bg-[#E8F5F1] px-2 py-0.5 rounded-[2px]">
                          Marked ({cls.studentsPresent}/{cls.totalStudents})
                        </span>
                        <Button size="sm" variant="secondary" onClick={() => onModule('attendance')}>
                          Edit
                        </Button>
                      </>
                    ) : !cls.cancelled ? (
                      <Button size="sm" onClick={() => onModule('attendance')}>
                        Mark Now
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Pending Marks Entry */}
        <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
          <SectionLabel label="Pending Marks Entry" />
          {allMarksSubmitted ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[#0E7A5F] font-medium text-[14px]">All marks submitted ✓</p>
              <p className="text-[12px] text-[#5A6577] mt-1">No pending internal marks entry.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#D3D8E0]">
              {pendingMarks.map((subj) => {
                const { label, color, bg } = marksStatusLabel(subj.marksStatus);
                return (
                  <div key={subj.code} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#16264A] truncate">{subj.name}</p>
                      <p className="text-[12px] text-[#5A6577]">
                        {subj.classLabel} · <span className="font-mono">{subj.code}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-[2px]"
                        style={{ color, background: bg }}
                      >
                        {label}
                      </span>
                      <Button size="sm" onClick={() => onModule('marks')}>
                        Enter Marks
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Attendance Correction Requests */}
        <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
          <SectionLabel label="Attendance Correction Requests" />
          {pendingCorrections.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-[#5A6577]">No pending correction requests.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#D3D8E0]">
              {pendingCorrections.map((req) => (
                <div key={req.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-semibold text-[#16264A]">{req.studentName}</p>
                        <span className="font-mono text-[11px] text-[#5A6577]">#{req.rollNo}</span>
                      </div>
                      <p className="text-[12px] text-[#5A6577] mt-0.5">
                        {req.date} · Marked{' '}
                        <span className="font-mono font-semibold text-[#A8242C]">{req.markedAs}</span>
                        {' → Requests '}
                        <span className="font-mono font-semibold text-[#0E7A5F]">{req.requestedStatus}</span>
                      </p>
                      <p className="text-[12px] text-[#5A6577] mt-1 line-clamp-2">{req.reason}</p>
                      {req.attachment && (
                        <p className="text-[11px] text-[#16264A] mt-1">
                          📎 {req.attachment}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-[#0E7A5F] border-[#0E7A5F] hover:bg-[#E8F5F1]"
                        onClick={() => handleApprove(req)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setRejectId(req.id);
                          setRejectReason('');
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Attendance Shortage Alerts */}
        <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
          <SectionLabel label="Attendance Shortage Alerts" />
          {atRiskMentees.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-[#0E7A5F]">No students at risk currently.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#D3D8E0]">
              {atRiskMentees.map((m) => (
                <div key={m.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-semibold text-[#16264A]">{m.name}</p>
                        <span className="font-mono text-[11px] text-[#5A6577]">#{m.rollNo}</span>
                      </div>
                      <div className="mt-1.5">
                        <AttendanceBar pct={m.attendance} />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {m.alerts.map((alert, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-2 py-0.5 rounded-[2px] bg-[#FFF0F0] text-[#A8242C]"
                          >
                            {alert}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => onModule('mentoring')}>
                      View Mentee
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      <Modal
        open={rejectId !== null}
        onClose={() => { setRejectId(null); setRejectReason(''); }}
        title="Reject Correction Request"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => { setRejectId(null); setRejectReason(''); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={handleRejectConfirm}
            >
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-[#5A6577] mb-3">
          Please provide a reason for rejecting this correction request. The student will be notified.
        </p>
        <label className="block text-[13px] font-medium text-[#16264A] mb-1">Rejection Reason <span className="text-[#A8242C]">*</span></label>
        <textarea
          className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] text-[#16264A] placeholder-[#5A6577] outline-none focus:border-[#E0952A] resize-none"
          rows={3}
          placeholder="e.g., No supporting document provided…"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

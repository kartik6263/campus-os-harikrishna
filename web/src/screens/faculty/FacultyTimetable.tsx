import { useState, useMemo } from 'react';
import { Button, Modal, InlineAlert, Toggle, Tabs, toast } from '../../components/ui';
import { useCancelClass, useFacultyRecord, useFacultyTimetableGrid, useMySubjects } from '../../lib/facultyqueries';

interface Props {
  onNavigate: (s: any) => void;
  onModule: (m: string) => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type Day = typeof DAYS[number];

const TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  theory:  { bg: '#EFF6FF', color: '#1D4ED8', label: 'Theory' },
  lab:     { bg: '#D1FAE5', color: '#0E7A5F', label: 'Lab' },
  project: { bg: '#FEF9EC', color: '#8A6D1F', label: 'Project' },
};

interface CancelSlot {
  slotId: string;
  day: string;
  time: string;
  subject: string;
  code: string;
  classLabel: string;
  room: string;
}

export default function FacultyTimetable({ onNavigate, onModule }: Props) {
  const { data: faculty } = useFacultyRecord();
  const { data: timetable } = useFacultyTimetableGrid();
  const { data: mySubjects } = useMySubjects();
  const cancelClass = useCancelClass();

  const [selectedDay, setSelectedDay] = useState<Day>('Mon');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSlot, setCancelSlot] = useState<CancelSlot | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelledSlots, setCancelledSlots] = useState<Map<string, { reason: string; notified: boolean }>>(new Map());
  const [notifyStudents, setNotifyStudents] = useState(true);
  const [substituteNote, setSubstituteNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const slotKey = (day: string, time: string, code: string) => `${day}-${time}-${code}`;

  /** Cancelled on the server, or cancelled by us a moment ago. */
  const isCancelled = (day: string, slot: { time: string; code: string; cancelled: boolean }) =>
    slot.cancelled || cancelledSlots.has(slotKey(day, slot.time, slot.code));

  const slots = timetable[selectedDay] ?? [];

  // Weekly load stats
  const weeklyStats = useMemo(() => {
    const subjectHours: Record<string, { name: string; hours: number }> = {};
    let total = 0;
    for (const day of DAYS) {
      for (const slot of timetable[day] ?? []) {
        if (isCancelled(day, slot)) continue;
        // parse hours from time string like "09:00–10:00" or "02:00–04:00"
        const parts = slot.time.split('–');
        if (parts.length === 2) {
          const [sh, sm] = parts[0].split(':').map(Number);
          const [eh, em] = parts[1].split(':').map(Number);
          const hrs = (eh * 60 + em - sh * 60 - sm) / 60;
          total += hrs;
          if (!subjectHours[slot.code]) subjectHours[slot.code] = { name: slot.subject, hours: 0 };
          subjectHours[slot.code].hours += hrs;
        }
      }
    }
    return { total, subjectHours };
  }, [cancelledSlots, timetable]);

  const dayCounts = useMemo(() => {
    const counts: Record<string, { total: number; cancelled: number }> = {};
    for (const day of DAYS) {
      const daySlots = timetable[day] ?? [];
      const cancelled = daySlots.filter(s => isCancelled(day, s)).length;
      counts[day] = { total: daySlots.length, cancelled };
    }
    return counts;
  }, [cancelledSlots, timetable]);

  function openCancel(slot: typeof slots[0]) {
    setCancelSlot({ slotId: slot.slotId, day: selectedDay, time: slot.time, subject: slot.subject, code: slot.code, classLabel: slot.classLabel, room: slot.room });
    setCancelReason('');
    setSubstituteNote('');
    setNotifyStudents(true);
    setCancelOpen(true);
  }

  async function doCancel() {
    if (!cancelSlot) return;
    if (cancelReason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters.');
      return;
    }
    setCancelling(true);
    try {
      const result = await cancelClass.mutateAsync({
        slotId: cancelSlot.slotId,
        reason: cancelReason.trim(),
        notify: notifyStudents,
      });
      const key = slotKey(cancelSlot.day, cancelSlot.time, cancelSlot.code);
      setCancelledSlots(prev => {
        const next = new Map(prev);
        next.set(key, { reason: cancelReason.trim(), notified: notifyStudents });
        return next;
      });
      setCancelOpen(false);
      toast.success(
        notifyStudents
          ? `Class cancelled — ${result.notified} students notified.`
          : 'Class marked as cancelled.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel the class.');
    } finally {
      setCancelling(false);
    }
  }

  const MY_SUBJECTS_MAP: Record<string, { totalStudents: number }> = Object.fromEntries(
    mySubjects.map(s => [s.code, { totalStudents: s.totalStudents }]),
  );

  const maxLoad = faculty?.maxWeeklyLoad ?? 18;
  const overloaded = weeklyStats.total > maxLoad;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      {/* Weekly overview strip */}
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[16px] font-semibold text-[#16264A]">My Timetable</h2>
            <p className="text-[12px] text-[#5A6577]">Academic Year 2024–25 · Odd Semester</p>
          </div>
          <div className={`text-right`}>
            <p className="text-[12px] text-[#5A6577]">Weekly load</p>
            <p className={`text-[20px] font-bold font-mono ${overloaded ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>
              {weeklyStats.total.toFixed(0)}
              <span className="text-[14px] font-normal text-[#5A6577]">/{maxLoad} hrs</span>
            </p>
          </div>
        </div>
        {/* Day summary chips */}
        <div className="flex gap-3 flex-wrap">
          {DAYS.map(day => {
            const info = dayCounts[day] ?? { total: 0, cancelled: 0 };
            const isSelected = day === selectedDay;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-[4px] border cursor-pointer transition-colors text-[13px] font-medium
                  ${isSelected ? 'border-[#E0952A] bg-[#FEF9EC] text-[#8A6D1F]' : 'border-[#D3D8E0] bg-white text-[#16264A] hover:bg-[#EDEFF3]'}`}
              >
                <span>{day}</span>
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                  info.total === 0 ? 'bg-[#F1F5F9] text-[#94A3B8]' : 'bg-[#EDEFF3] text-[#5A6577]'
                }`}>
                  {info.total}
                </span>
                {info.cancelled > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#E0952A] shrink-0" title={`${info.cancelled} cancelled`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Main timetable */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between mb-0 rounded-t-[2px]">
            <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{selectedDay.toUpperCase()} — {slots.length} CLASS{slots.length !== 1 ? 'ES' : ''}</span>
          </div>
          <div className="bg-white border border-[#D3D8E0] rounded-b-[2px]">
            {slots.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[15px] font-medium text-[#16264A]">No classes</p>
                <p className="text-[13px] text-[#5A6577] mt-1">You have no scheduled classes on {selectedDay}.</p>
              </div>
            ) : (
              slots.map((slot, i) => {
                const key = slotKey(selectedDay, slot.time, slot.code);
                const cancelled = cancelledSlots.get(key);
                const badge = TYPE_BADGE[slot.type] ?? TYPE_BADGE.theory;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-4 px-5 py-4 border-b border-[#D3D8E0] last:border-b-0 ${cancelled ? 'bg-[#FEF2F2]' : 'hover:bg-[#EDEFF3]/40'} transition-colors`}
                  >
                    {/* Time */}
                    <div className="w-28 shrink-0">
                      <p className="font-mono text-[14px] font-semibold text-[#16264A]">{slot.time}</p>
                    </div>

                    {/* Subject info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[#16264A] text-[15px]">{slot.subject}</p>
                        <span className="font-mono text-[12px] text-[#5A6577]">{slot.code}</span>
                        {cancelled && (
                          <span className="px-2 py-0.5 bg-[#FEE2E2] text-[#A8242C] text-[11px] font-semibold rounded-[2px]">CANCELLED</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[13px] text-[#5A6577]">
                        <span>{slot.classLabel}</span>
                        <span className="text-[#D3D8E0]">·</span>
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                          {slot.room}
                        </span>
                      </div>
                      {cancelled && (
                        <p className="text-[12px] text-[#A8242C] mt-1">Reason: {cancelled.reason}</p>
                      )}
                    </div>

                    {/* Type badge */}
                    <div className="shrink-0">
                      <span
                        className="px-2.5 py-1 rounded-[2px] text-[12px] font-semibold"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0">
                      {!cancelled ? (
                        <Button variant="secondary" size="sm" onClick={() => openCancel(slot)}>
                          Cancel Class
                        </Button>
                      ) : (
                        <span className="text-[12px] text-[#5A6577]">{cancelled.notified ? 'Students notified' : 'Not notified'}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Load sidebar */}
        <div className="w-64 shrink-0 border-l border-[#D3D8E0] bg-white overflow-y-auto">
          <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">LOAD BREAKDOWN</span>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {/* Load bar */}
            <div>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-[#5A6577]">This week</span>
                <span className={`font-semibold font-mono ${overloaded ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>
                  {weeklyStats.total.toFixed(0)}/{maxLoad} hrs
                </span>
              </div>
              <div className="h-2 bg-[#EDEFF3] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${overloaded ? 'bg-[#A8242C]' : 'bg-[#0E7A5F]'}`}
                  style={{ width: `${Math.min((weeklyStats.total / maxLoad) * 100, 100)}%` }}
                />
              </div>
              {overloaded && (
                <p className="text-[11px] text-[#A8242C] mt-1">Exceeds maximum weekly load</p>
              )}
            </div>

            <div className="border-t border-[#D3D8E0] pt-3">
              <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">By Subject</p>
              {Object.entries(weeklyStats.subjectHours).map(([code, info]) => (
                <div key={code} className="flex justify-between items-center py-1.5 border-b border-[#EDEFF3] last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#16264A] truncate">{info.name}</p>
                    <p className="text-[11px] font-mono text-[#5A6577]">{code}</p>
                  </div>
                  <span className="font-mono text-[13px] font-semibold text-[#16264A] shrink-0 ml-2">{info.hours}h</span>
                </div>
              ))}
            </div>

            {cancelledSlots.size > 0 && (
              <div className="border-t border-[#D3D8E0] pt-3">
                <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">CANCELLED THIS WEEK</p>
                <p className="text-[24px] font-bold font-mono text-[#A8242C]">{cancelledSlots.size}</p>
                <p className="text-[12px] text-[#5A6577]">class{cancelledSlots.size !== 1 ? 'es' : ''} cancelled</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Class Modal */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel Class"
        width="500px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button variant="destructive" onClick={doCancel} loading={cancelling}>
              Cancel Class
            </Button>
          </>
        }
      >
        {cancelSlot && (
          <div className="flex flex-col gap-4">
            {/* Slot details */}
            <div className="bg-[#EDEFF3] rounded-[4px] px-4 py-3">
              <p className="font-semibold text-[#16264A]">{cancelSlot.subject}</p>
              <div className="flex gap-4 mt-1 text-[13px] text-[#5A6577]">
                <span className="font-mono">{cancelSlot.code}</span>
                <span>·</span>
                <span>{cancelSlot.classLabel}</span>
                <span>·</span>
                <span className="font-mono">{cancelSlot.time}</span>
                <span>·</span>
                <span>{cancelSlot.room}</span>
              </div>
            </div>

            <InlineAlert type="warning">
              Cancelling a class will be logged in your attendance record and may require HOD approval for repeated cancellations.
            </InlineAlert>

            {/* Reason */}
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">
                Reason for cancellation <span className="text-[#A8242C]">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Enter reason (min. 10 characters)…"
                className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] text-[#16264A] placeholder-[#5A6577] outline-none focus:border-[#E0952A] resize-none"
              />
              <span className={`text-[11px] ${cancelReason.trim().length < 10 && cancelReason.length > 0 ? 'text-[#A8242C]' : 'text-[#5A6577]'}`}>
                {cancelReason.trim().length}/10 min characters
              </span>
            </div>

            {/* Notify toggle */}
            <Toggle
              on={notifyStudents}
              onChange={setNotifyStudents}
              label="Notify students via portal"
            />

            {/* Substitute */}
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Substitute arrangement (optional)</label>
              <input
                type="text"
                value={substituteNote}
                onChange={e => setSubstituteNote(e.target.value)}
                placeholder="e.g. Dr. Sharma will cover the session"
                className="border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] text-[#16264A] placeholder-[#5A6577] outline-none focus:border-[#E0952A]"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

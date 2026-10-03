import { useState } from 'react';
import { useTimetable, DAYS, type LegacyDay, type LegacySlot as TimetableSlot } from '../../lib/queries';
import { SkeletonRow, InlineAlert } from '../../components/ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (m: any) => void }

// Today is Monday (for demo purposes — match the cancelled class notice)
const TODAY: LegacyDay = 'Mon';

function SlotRow({ slot }: { slot: TimetableSlot }) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-[#D3D8E0] ${slot.cancelled ? '' : 'bg-white'}`}
      style={slot.cancelled ? { background: '#FEF2F2' } : {}}
    >
      <div className="w-24 shrink-0 pt-0.5">
        <span className="font-mono text-[12px] text-[#5A6577]">{slot.time}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[13px] font-semibold text-[#16264A] leading-snug ${slot.cancelled ? 'line-through text-[#A8242C]' : ''}`}
          >
            {slot.subject}
          </span>
          {slot.cancelled && (
            <span
              className="text-[11px] font-semibold px-1.5 py-0.5 border border-[#A8242C] rounded-[2px]"
              style={{ color: '#A8242C' }}
            >
              Cancelled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="font-mono text-[11px] text-[#5A6577]">{slot.code}</span>
          <span className="text-[11px] text-[#5A6577]">· {slot.faculty}</span>
          <span className="text-[11px] border border-[#D3D8E0] px-1.5 py-0.5 rounded-[2px] text-[#5A6577]">{slot.room}</span>
        </div>
        {slot.cancelled && slot.cancelReason && (
          <div className="mt-1 text-[11px] text-[#A8242C]">
            {slot.cancelReason}
            {slot.cancelledAt && ` · Noticed at ${slot.cancelledAt}`}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TimetableModule({ onNavigate: _ }: Props) {
  const { data: TIMETABLE, isPending, error } = useTimetable();
  const [selectedDay, setSelectedDay] = useState<LegacyDay>(TODAY);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set([TODAY]));


  // Server state: show the loading and failure cases rather than an empty page.
  if (isPending) {
    return (
      <div className="bg-[#EDEFF3] min-h-screen p-4">
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EDEFF3] min-h-screen p-4">
        <InlineAlert type="error">
          Could not load the timetable: {(error as Error).message}
        </InlineAlert>
      </div>
    );
  }

  const todaySlots: TimetableSlot[] = TIMETABLE[TODAY] ?? [];
  const cancelledToday = todaySlots.filter(s => s.cancelled);

  function toggleDay(day: string) {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  }

  const daySlots: TimetableSlot[] = TIMETABLE[selectedDay] ?? [];

  return (
    <div className="bg-[#EDEFF3] min-h-screen">
      {/* Live cancellation notice */}
      {cancelledToday.length > 0 && (
        <div
          className="px-4 py-3 border-b-2 border-[#E0952A] bg-[#FEF9EC] flex items-start gap-3"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6D1F" strokeWidth="2" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div className="flex-1 min-w-0">
            {cancelledToday.map(slot => (
              <div key={slot.code} className="text-[12px] text-[#8A6D1F]">
                <span className="font-semibold">{slot.code}</span>
                {' '}({slot.time}) cancelled today — {slot.faculty}
                {slot.cancelReason ? ` (${slot.cancelReason})` : ''}.
                {slot.cancelledAt && <span className="text-[#8A6D1F]"> Noticed at {slot.cancelledAt}.</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-3 flex items-center gap-2">
        <div className="flex border border-[#D3D8E0] rounded-[2px] overflow-hidden">
          <button
            className="px-4 py-2 text-[13px] font-medium cursor-pointer transition-colors"
            style={view === 'day' ? { background: '#16264A', color: '#FFFFFF' } : { background: '#FFFFFF', color: '#16264A' }}
            onClick={() => setView('day')}
          >
            Day View
          </button>
          <button
            className="px-4 py-2 text-[13px] font-medium cursor-pointer transition-colors border-l border-[#D3D8E0]"
            style={view === 'week' ? { background: '#16264A', color: '#FFFFFF' } : { background: '#FFFFFF', color: '#16264A' }}
            onClick={() => setView('week')}
          >
            Week View
          </button>
        </div>
      </div>

      {/* Day selector (only in day view) */}
      {view === 'day' && (
        <div className="bg-white border-b border-[#D3D8E0] overflow-x-auto">
          <div className="flex min-w-max px-2">
            {DAYS.map(day => {
              const slots = TIMETABLE[day] ?? [];
              const hasCancelled = slots.some(s => s.cancelled);
              const isActive = selectedDay === day;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className="flex flex-col items-center px-4 py-2.5 cursor-pointer relative min-h-[44px] justify-center"
                  style={{ minWidth: 52 }}
                >
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: isActive ? '#16264A' : '#5A6577' }}
                  >
                    {day}
                  </span>
                  {hasCancelled && !isActive && (
                    <span className="w-1 h-1 rounded-full bg-[#A8242C] mt-0.5" />
                  )}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-[2px]"
                      style={{ background: '#E0952A' }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View content */}
      {view === 'day' && (
        <div className="mt-2">
          <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">
              {selectedDay} — {daySlots.length} {daySlots.length === 1 ? 'class' : 'classes'}
            </span>
          </div>
          {daySlots.length === 0 ? (
            <div className="bg-white px-4 py-10 text-center border-b border-[#D3D8E0]">
              <div className="text-[13px] text-[#5A6577]">No classes scheduled for {selectedDay}</div>
            </div>
          ) : (
            daySlots.map((slot, i) => (
              <SlotRow key={`${slot.code}-${i}`} slot={slot} />
            ))
          )}
        </div>
      )}

      {/* Week View content */}
      {view === 'week' && (
        <div className="mt-2">
          <div className="bg-[#EDEFF3] px-4 py-2">
            <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Weekly Schedule</span>
          </div>
          {DAYS.map(day => {
            const slots: TimetableSlot[] = TIMETABLE[day] ?? [];
            const hasCancelled = slots.some(s => s.cancelled);
            const isExpanded = expandedDays.has(day);
            return (
              <div key={day}>
                <button
                  className="w-full flex items-center justify-between bg-white px-4 border-b border-[#D3D8E0] cursor-pointer"
                  style={{ minHeight: 44 }}
                  onClick={() => toggleDay(day)}
                >
                  <div className="flex items-center gap-3 py-3">
                    <span className="text-[13px] font-semibold text-[#16264A] w-10">{day}</span>
                    <span className="text-[12px] text-[#5A6577]">
                      {slots.length} {slots.length === 1 ? 'class' : 'classes'}
                    </span>
                    {hasCancelled && (
                      <span
                        className="text-[11px] font-semibold px-1.5 py-0.5 border rounded-[2px]"
                        style={{ borderColor: '#A8242C', color: '#A8242C' }}
                      >
                        Cancellation
                      </span>
                    )}
                    {day === TODAY && (
                      <span
                        className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[2px]"
                        style={{ background: '#E0952A', color: '#FFFFFF' }}
                      >
                        Today
                      </span>
                    )}
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"
                    className={`transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {isExpanded && (
                  <div>
                    {slots.length === 0 ? (
                      <div className="bg-white px-4 py-6 text-center border-b border-[#D3D8E0]">
                        <span className="text-[12px] text-[#5A6577]">No classes scheduled</span>
                      </div>
                    ) : (
                      slots.map((slot, i) => (
                        <SlotRow key={`${slot.code}-${i}`} slot={slot} />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

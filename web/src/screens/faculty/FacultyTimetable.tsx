import { useMemo, useState } from 'react';
import { Button, EmptyState, InlineAlert, Spinner, toast } from '../../components/ui';
import WeekTimetable from '../../components/WeekTimetable';
import ClassChangeModal, { ExtraClassModal } from '../../components/ClassChangeModal';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFacultyRecord, useFacultyTimetableApi } from '../../lib/facultyqueries';
import { CHANGE_LABEL, addDays, shortDate, useChanges, useUndoChange, useWeek, type Occurrence } from '../../lib/timetable';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigate: (s: any) => void;
  onModule: (m: string) => void;
}

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const hrs = (a: string, b: string) => { const [ah, am] = a.split(':').map(Number); const [bh, bm] = b.split(':').map(Number); return ((bh ?? 0) * 60 + (bm ?? 0) - (ah ?? 0) * 60 - (am ?? 0)) / 60; };

/**
 * The lecturer's timetable: the dated week (classes they teach and classes
 * they cover for colleagues), and for any one class — cancel or reschedule
 * that date, move it, hand it to a substitute — plus extra classes and the
 * record of every change made.
 */
export default function FacultyTimetable({ onModule }: Props) {
  const { user } = useAuth();
  const me = user?.faculty?.id ?? null;
  const isHod = !!user?.faculty?.isHod;
  const { data: faculty } = useFacultyRecord();
  const grid = useFacultyTimetableApi();
  const week = useWeek({ scope: 'me' });
  const changes = useChanges();
  const undo = useUndoChange();
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [extra, setExtra] = useState(false);

  // Subjects this lecturer can add classes for: their own, from the weekly timetable.
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of week.data?.days ?? []) for (const c of d.classes) if (c.regularFacultyId === me && c.kind === 'REGULAR') m.set(c.subjectId, `${c.code} — ${c.subject}`);
    return [...m.entries()].map(([subjectId, label]) => ({ subjectId, label }));
  }, [week.data, me]);

  const bySubject = useMemo(() => {
    const m = new Map<string, { name: string; hours: number }>();
    for (const slots of Object.values(grid.data?.days ?? {})) for (const s of slots) {
      const x = m.get(s.code) ?? { name: s.subject, hours: 0 };
      x.hours += hrs(s.startTime, s.endTime);
      m.set(s.code, x);
    }
    return [...m.entries()];
  }, [grid.data]);

  const maxLoad = faculty?.maxWeeklyLoad ?? 18;
  const load = grid.data?.totalHours ?? 0;
  const over = load > maxLoad;
  const upcoming = (changes.data?.changes ?? []).filter((c) => !c.past);
  const today = week.data?.today ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#16264A]">My Timetable</h2>
          <p className="text-[12px] text-[#5A6577]">Term {grid.data?.term ?? week.data?.term ?? '…'} · click a class to cancel, reschedule, move it or arrange a substitute</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[12px] text-[#5A6577]">Weekly load</p>
            <p className={`text-[20px] font-bold font-mono ${over ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>{load}<span className="text-[14px] font-normal text-[#5A6577]">/{maxLoad} hrs</span></p>
          </div>
          <Button onClick={() => setExtra(true)} disabled={!subjects.length}>Add extra class</Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <WeekTimetable
            scope={{ scope: 'me' }}
            hideTitle
            onSelect={setSelected}
            extraLine={(c) => (c.facultyId === me && c.regularFacultyId !== me ? `You are covering for ${c.regularFaculty}` : c.regularFacultyId === me && c.facultyId !== me ? `${c.faculty} is covering this class` : null)}
          />
        </div>

        <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-[#D3D8E0] bg-white overflow-y-auto">
          <div className="bg-[#EDEFF3] px-4 py-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Load breakdown</span></div>
          <div className="p-4 flex flex-col gap-3">
            <div>
              <div className="flex justify-between text-[12px] mb-1"><span className="text-[#5A6577]">Weekly timetable</span><span className={`font-semibold font-mono ${over ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>{load}/{maxLoad} hrs</span></div>
              <div className="h-2 bg-[#EDEFF3] rounded-full overflow-hidden"><div className={`h-full rounded-full ${over ? 'bg-[#A8242C]' : 'bg-[#0E7A5F]'}`} style={{ width: `${Math.min((load / maxLoad) * 100, 100)}%` }} /></div>
              {over && <p className="text-[11px] text-[#A8242C] mt-1">Above your maximum weekly load — speak to your head of department.</p>}
            </div>
            {grid.isPending && <Spinner />}
            {bySubject.map(([code, info]) => (
              <div key={code} className="flex justify-between items-center py-1.5 border-b border-[#EDEFF3] last:border-b-0">
                <div className="min-w-0"><p className="text-[13px] font-medium text-[#16264A] truncate">{info.name}</p><p className="text-[11px] font-mono text-[#5A6577]">{code}</p></div>
                <span className="font-mono text-[13px] font-semibold text-[#16264A] shrink-0 ml-2">{info.hours}h</span>
              </div>
            ))}
          </div>

          <div className="bg-[#EDEFF3] px-4 py-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Changes coming up</span></div>
          <div className="p-4 flex flex-col gap-2">
            {changes.error && <InlineAlert type="error">{errText(changes.error)}</InlineAlert>}
            {changes.data && upcoming.length === 0 && <EmptyState title="No changes" description="Every class is as the weekly timetable has it." />}
            {upcoming.map((c) => (
              <div key={c.id} className="border border-[#EDEFF3] rounded-[4px] px-3 py-2">
                <p className="text-[12px] font-semibold text-[#16264A]">{CHANGE_LABEL[c.kind]} · {c.code}</p>
                <p className="text-[11px] text-[#5A6577]">{shortDate(c.date)} {c.startTime}–{c.endTime} · {c.kind === 'ROOM' ? `${c.usualRoom} → ${c.room}` : c.kind === 'SUBSTITUTE' ? `${c.faculty} covering` : c.room}</p>
                <p className="text-[11px] text-[#5A6577] truncate" title={c.reason}>{c.reason}</p>
                {!c.makeupForId && (
                  <button className="text-[12px] text-[#A8242C] cursor-pointer disabled:opacity-50 mt-0.5" disabled={undo.isPending}
                    onClick={() => undo.mutate(c.id, { onSuccess: (r) => toast.success(`Withdrawn — ${r.notified} students told`), onError: (e) => toast.error(errText(e)) })}>Undo</button>
                )}
              </div>
            ))}
            <button className="text-[12px] text-[#E0952A] cursor-pointer text-left mt-1" onClick={() => onModule('attendance')}>Go to attendance marking →</button>
          </div>
        </div>
      </div>

      <ClassChangeModal occ={selected} onClose={() => setSelected(null)} canChange={!!selected && (selected.regularFacultyId === me || isHod)} department={user?.faculty?.department} />
      <ExtraClassModal open={extra} onClose={() => setExtra(false)} subjects={subjects} defaultDate={addDays(today, 1)} />
    </div>
  );
}

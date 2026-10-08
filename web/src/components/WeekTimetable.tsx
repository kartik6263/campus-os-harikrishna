import { useState, type ReactNode } from 'react';
import { Button, InlineAlert, Spinner } from './ui';
import { ApiError } from '../lib/api';
import { downloadPdf } from '../lib/export';
import { DAY_NAME, addDays, downloadIcs, shortDate, useWeek, type Occurrence, type Scope, type Week } from '../lib/timetable';

/**
 * One dated week of classes — a student's, a lecturer's, a class's, a
 * teacher's or a room's — with holidays, cancellations, room changes,
 * substitutes and extra classes shown as they are. Moves week by week;
 * exports a PDF and a calendar (.ics) file.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

export function statusOf(c: Occurrence): { label: string; cls: string } | null {
  if (c.status === 'HOLIDAY') return { label: 'Holiday', cls: 'bg-[#EDEFF3] text-[#5A6577]' };
  if (c.status === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-[#FEE2E2] text-[#A8242C]' };
  if (c.kind === 'EXTRA') return { label: c.makeupFor ? 'Make-up' : 'Extra class', cls: 'bg-[#EFF6FF] text-[#1D4ED8]' };
  if (c.substitute) return { label: 'Substitute', cls: 'bg-[#FEF9EC] text-[#8A6D1F]' };
  if (c.roomChange) return { label: 'Room changed', cls: 'bg-[#FEF9EC] text-[#8A6D1F]' };
  return null;
}

export function weekPdf(week: Week) {
  void downloadPdf({
    title: `Timetable — ${week.title}`,
    subtitle: `Week of ${shortDate(week.weekOf)} to ${shortDate(addDays(week.weekOf, 5))} · Term ${week.term}`,
    sections: week.days.map((d) => ({
      heading: `${DAY_NAME[d.day]}, ${shortDate(d.date)}${d.holiday ? ` — Holiday: ${d.holiday}` : ''}`,
      table: {
        head: ['Time', 'Code', 'Subject', 'Room', 'Teacher', 'Status'],
        body: d.classes.length
          ? d.classes.map((c) => [`${c.startTime}–${c.endTime}`, c.code, c.subject, c.room, c.faculty, statusOf(c)?.label ?? 'As scheduled'])
          : [['—', '', 'No classes', '', '', '']],
      },
    })),
  });
}

interface Props {
  scope: Scope;
  /** Extra buttons in the header, given the loaded week. */
  actions?: (week: Week) => ReactNode;
  /** Clicking a class (staff use it to change one). */
  onSelect?: (c: Occurrence) => void;
  /** Whether a class can be clicked. */
  selectable?: (c: Occurrence) => boolean;
  /** Label of a class's extra line, e.g. who is covering. */
  extraLine?: (c: Occurrence) => string | null;
  hideTitle?: boolean;
}

export default function WeekTimetable({ scope, actions, onSelect, selectable, extraLine, hideTitle }: Props) {
  const [weekOf, setWeekOf] = useState<string | undefined>(undefined);
  const { data: week, isPending, error, isFetching } = useWeek(scope, weekOf);

  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !week) return <InlineAlert type="error">Could not load the timetable: {errText(error)}</InlineAlert>;
  const thisWeek = week.today >= week.weekOf && week.today <= addDays(week.weekOf, 6);
  const total = week.days.reduce((t, d) => t + d.classes.filter((c) => c.status === 'SCHEDULED').length, 0);
  const changed = week.days.reduce((t, d) => t + d.classes.filter((c) => statusOf(c)).length, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          {!hideTitle && <p className="text-[15px] font-semibold text-[#16264A]">{week.title}</p>}
          <p className="text-[12px] text-[#5A6577]">{shortDate(week.weekOf)} – {shortDate(addDays(week.weekOf, 5))} · Term {week.term} · {total} class{total === 1 ? '' : 'es'}{changed ? ` · ${changed} changed` : ''}{isFetching ? ' · updating…' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setWeekOf(addDays(week.weekOf, -7))}>← Previous</Button>
          <Button size="sm" variant="secondary" disabled={thisWeek} onClick={() => setWeekOf(undefined)}>This week</Button>
          <Button size="sm" variant="secondary" onClick={() => setWeekOf(addDays(week.weekOf, 7))}>Next →</Button>
          <Button size="sm" variant="secondary" onClick={() => weekPdf(week)}>PDF</Button>
          <Button size="sm" variant="secondary" onClick={() => downloadIcs(week, week.title)}>Add to calendar</Button>
          {actions?.(week)}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {week.days.map((d) => {
          const today = d.date === week.today;
          return (
            <div key={d.date} className={`bg-white border rounded-[4px] ${today ? 'border-[#E0952A]' : 'border-[#D3D8E0]'}`}>
              <div className={`px-3 py-2 flex items-center justify-between border-b ${today ? 'bg-[#FEF9EC] border-[#F3D9A4]' : 'bg-[#F7F8FA] border-[#EDEFF3]'}`}>
                <span className="text-[13px] font-semibold text-[#16264A]">{DAY_NAME[d.day]} <span className="font-normal text-[#5A6577]">{shortDate(d.date)}</span></span>
                {today ? <span className="text-[11px] font-semibold text-white bg-[#E0952A] px-1.5 py-0.5 rounded-[2px]">Today</span>
                  : d.holiday ? <span className="text-[11px] font-semibold text-[#5A6577]">Holiday</span> : null}
              </div>
              {d.holiday && <p className="px-3 py-2 text-[12px] text-[#5A6577] bg-[#FAFBFC] border-b border-[#EDEFF3]">{d.holiday} — no classes</p>}
              {d.classes.length === 0 && !d.holiday && <p className="px-3 py-6 text-center text-[12px] text-[#5A6577]">No classes</p>}
              {d.classes.map((c) => {
                const st = statusOf(c);
                const can = !!onSelect && (selectable ? selectable(c) : true);
                const off = c.status !== 'SCHEDULED';
                const line = extraLine?.(c);
                const Inner = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[12px] text-[#5A6577] whitespace-nowrap">{c.startTime}–{c.endTime}</span>
                      {st && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[2px] whitespace-nowrap ${st.cls}`}>{st.label}</span>}
                    </div>
                    <p className={`text-[13px] font-semibold mt-0.5 ${off ? 'line-through text-[#5A6577]' : 'text-[#16264A]'}`}>{c.subject} <span className="font-mono font-normal text-[11px] text-[#5A6577]">{c.code}</span></p>
                    <p className="text-[12px] text-[#5A6577]">
                      {c.room}{c.roomChange ? <span className="text-[#8A6D1F]"> (usually {c.roomChange.from})</span> : null} · {c.faculty}{c.substitute ? <span className="text-[#8A6D1F]"> for {c.regularFaculty}</span> : null}
                    </p>
                    {c.note && c.status !== 'HOLIDAY' && <p className={`text-[11px] mt-0.5 ${off ? 'text-[#A8242C]' : 'text-[#5A6577]'}`}>{c.makeupFor ? `Make-up for ${shortDate(c.makeupFor.date)} ${c.makeupFor.startTime} · ` : ''}{c.note}</p>}
                    {line && <p className="text-[11px] mt-0.5 text-[#1D4ED8]">{line}</p>}
                  </>
                );
                return can
                  ? <button key={`${c.id}-${c.date}`} onClick={() => onSelect!(c)} className="w-full text-left px-3 py-2.5 border-b border-[#EDEFF3] last:border-0 hover:bg-[#FEF9EC] cursor-pointer">{Inner}</button>
                  : <div key={`${c.id}-${c.date}`} className={`px-3 py-2.5 border-b border-[#EDEFF3] last:border-0 ${off ? 'bg-[#FEF2F2]/40' : ''}`}>{Inner}</div>;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

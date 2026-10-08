import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { inst } from './institution';
import { saveBlob } from './records';

/**
 * Timetable management (/api/timetable): the dated week for a student,
 * parent, lecturer, class, teacher or room; one-off changes to dated
 * classes; the free-room and free-teacher finders; rooms, the bell
 * schedule and the term's health check.
 */

export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DAY_NAME: Record<Weekday, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

export interface Occurrence {
  id: string; slotId: string | null; extraId: string | null; kind: 'REGULAR' | 'EXTRA';
  date: string; day: Weekday; startTime: string; endTime: string; room: string;
  subjectId: string; code: string; subject: string; programmeId: string; semester: number;
  facultyId: string | null; faculty: string; regularFacultyId: string | null; regularFaculty: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'HOLIDAY'; note: string | null; cancelId: string | null;
  roomChange: { id: string; from: string; reason: string } | null;
  substitute: { id: string; reason: string } | null;
  makeupFor: { date: string; startTime: string } | null;
}
export interface Period { id: string; label: string; startTime: string; endTime: string; isBreak: boolean }
export interface Week { term: string; title: string; weekOf: string; today: string; periods: Period[]; days: Array<{ date: string; day: Weekday; holiday: string | null; classes: Occurrence[] }> }
export interface PatternSlot { id: string; day: Weekday; startTime: string; endTime: string; room: string; faculty: string; code: string; subject: string; classLabel: string; suspended: boolean }
export interface Room { id: string; code: string; building: string; capacity: number; kind: 'CLASSROOM' | 'LAB' | 'HALL' | 'SEMINAR' | 'OTHER'; active: boolean; weeklyHours?: number }
export interface Options {
  term: string; today: string;
  programmes: Array<{ id: string; shortName: string; name: string; years: number }>;
  classes: Array<{ programmeId: string; semester: number }>;
  faculty: Array<{ id: string; name: string; department: string; designation: string }>;
  rooms: Room[]; periods: Period[];
}
export interface Change {
  id: string; kind: 'CANCEL' | 'ROOM' | 'SUBSTITUTE' | 'EXTRA'; date: string; startTime: string; endTime: string; room: string; usualRoom: string | null;
  faculty: string; usualFaculty: string | null; code: string; subject: string; classLabel: string; reason: string; makeupForId: string | null;
  createdBy: string; createdAt: string; past: boolean;
}
export interface HealthIssue { kind: string; severity: 'error' | 'warning'; text: string }

export type Scope = { scope: 'me' } | { scope: 'class'; programmeId: string; semester: number } | { scope: 'faculty'; facultyId: string } | { scope: 'room'; room: string };

const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};
const scopeQs = (s: Scope) => ({ ...s } as unknown as Record<string, string | number>);
const ready = (s: Scope) => s.scope === 'me' || (s.scope === 'class' ? !!s.programmeId && !!s.semester : s.scope === 'faculty' ? !!s.facultyId : !!s.room);

export const useWeek = (s: Scope, weekOf?: string) =>
  useQuery({ queryKey: ['timetable', 'week', s, weekOf ?? 'now'], queryFn: () => api<Week>(`/api/timetable/week${qs({ ...scopeQs(s), weekOf })}`), enabled: ready(s) });
export const usePattern = (s: Scope) =>
  useQuery({ queryKey: ['timetable', 'pattern', s], queryFn: () => api<{ term: string; periods: Period[]; slots: PatternSlot[] }>(`/api/timetable/pattern${qs(scopeQs(s))}`), enabled: s.scope !== 'me' && ready(s) });
export const useOptions = () => useQuery({ queryKey: ['timetable', 'options'], queryFn: () => api<Options>('/api/timetable/options') });
export const useChanges = (from?: string, to?: string) => useQuery({ queryKey: ['timetable', 'changes', from, to], queryFn: () => api<{ from: string; to: string; changes: Change[] }>(`/api/timetable/changes${qs({ from, to })}`) });
export const useRooms = () => useQuery({ queryKey: ['timetable', 'rooms'], queryFn: () => api<Room[]>('/api/timetable/rooms') });
export const usePeriods = () => useQuery({ queryKey: ['timetable', 'periods'], queryFn: () => api<Period[]>('/api/timetable/periods') });
export const useHealth = () => useQuery({ queryKey: ['timetable', 'health'], queryFn: () => api<{ term: string; slots: number; errors: number; warnings: number; issues: HealthIssue[] }>('/api/timetable/health') });
export const useFreeRooms = (p: { date: string; startTime: string; endTime: string; capacity?: number } | null) =>
  useQuery({ queryKey: ['timetable', 'free-rooms', p], queryFn: () => api<Room[]>(`/api/timetable/free-rooms${qs(p!)}`), enabled: !!p && !!p.date && p.startTime < p.endTime });
export const useFreeFaculty = (p: { date: string; startTime: string; endTime: string; department?: string } | null) =>
  useQuery({ queryKey: ['timetable', 'free-faculty', p], queryFn: () => api<Array<{ id: string; name: string; department: string; designation: string; classesThatDay: number; sameDepartment: boolean }>>(`/api/timetable/free-faculty${qs(p!)}`), enabled: !!p });

/** Every change moves timetables, today's classes, roll calls and the student's own view. */
function useTT<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export type ChangeInput =
  | { kind: 'CANCEL'; slotId: string; date: string; reason: string; notify?: boolean; makeup?: { date: string; startTime: string; endTime: string; room: string } }
  | { kind: 'ROOM'; slotId: string; date: string; room: string; reason: string }
  | { kind: 'SUBSTITUTE'; slotId: string; date: string; facultyId: string; reason: string }
  | { kind: 'EXTRA'; subjectId: string; date: string; startTime: string; endTime: string; room: string; reason: string };
export const useMakeChange = () => useTT((b: ChangeInput) => api<{ id: string; kind: string; notified: number }>('/api/timetable/changes', { method: 'POST', body: b }));
export const useUndoChange = () => useTT((id: string) => api<{ notified: number; kind: string }>(`/api/timetable/changes/${id}`, { method: 'DELETE' }));
export const useAddRoom = () => useTT((b: { code: string; building: string; capacity: number; kind: Room['kind'] }) => api<Room>('/api/timetable/rooms', { method: 'POST', body: b }));
export const useEditRoom = () => useTT((b: { id: string; building?: string; capacity?: number; kind?: Room['kind']; active?: boolean }) => { const { id, ...rest } = b; return api<Room>(`/api/timetable/rooms/${id}`, { method: 'PATCH', body: rest }); });
export const useSavePeriods = () => useTT((periods: Array<{ label: string; startTime: string; endTime: string; isBreak: boolean }>) => api<Period[]>('/api/timetable/periods', { method: 'PUT', body: { periods } }));

// ─── Formatting and files ─────────────────────────────────────────────────────

export const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
export const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const CHANGE_LABEL: Record<Change['kind'], string> = { CANCEL: 'Cancelled', ROOM: 'Room change', SUBSTITUTE: 'Substitute', EXTRA: 'Extra class' };

/** The dated week as an .ics calendar file: each class an event in Indian time, cancelled ones marked so. */
export function downloadIcs(week: Week, name: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const dt = (d: string, t: string) => `${d.replace(/-/g, '')}T${t.replace(':', '')}00`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${esc(inst().name)}//Timetable//EN`, 'CALSCALE:GREGORIAN', 'X-WR-TIMEZONE:Asia/Kolkata'];
  for (const d of week.days) for (const c of d.classes) {
    lines.push('BEGIN:VEVENT', `UID:${c.id}-${c.date}@campusos`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Kolkata:${dt(c.date, c.startTime)}`, `DTEND;TZID=Asia/Kolkata:${dt(c.date, c.endTime)}`,
      `SUMMARY:${esc(`${c.status !== 'SCHEDULED' ? 'CANCELLED: ' : ''}${c.code} ${c.subject}`)}`, `LOCATION:${esc(c.room)}`,
      `DESCRIPTION:${esc(`${c.faculty}${c.note ? ` — ${c.note}` : ''}`)}`, ...(c.status !== 'SCHEDULED' ? ['STATUS:CANCELLED'] : []), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  saveBlob(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), `${name.replace(/[^\w.-]+/g, '-')}-${week.weekOf}.ics`);
}

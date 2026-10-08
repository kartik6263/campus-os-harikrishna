import { useMemo, useState } from 'react';
import { Button, Checkbox, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import WeekTimetable from '../../components/WeekTimetable';
import ClassChangeModal, { ExtraClassModal } from '../../components/ClassChangeModal';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { downloadCSV, downloadPdf } from '../../lib/export';
import {
  CHANGE_LABEL, DAY_NAME, WEEKDAYS, addDays, shortDate,
  useAddRoom, useChanges, useEditRoom, useFreeRooms, useHealth, useOptions, usePattern, usePeriods, useRooms, useSavePeriods, useUndoChange, useWeek,
  type Change, type Occurrence, type Room, type Scope,
} from '../../lib/timetable';

/**
 * The timetable desk for staff: any class's, teacher's or room's week with
 * one-off changes, the weekly pattern to print, the log of every change,
 * the free-room finder, the room list, the bell schedule and a health
 * check of the term's timetable. The weekly pattern itself is set in
 * Subject Allocation.
 *
 * The office views, prints and keeps the room list; the principal,
 * registrar, administrator and heads of department also change classes;
 * the senior offices set the bell schedule.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const SENIOR = ['PRINCIPAL', 'REGISTRAR', 'ADMIN'];
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-[#D3D8E0] rounded-[4px] ${className}`}>{children}</div>;
}
function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}

export default function TimetableManagement() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const senior = SENIOR.includes(role);
  const isHod = !!user?.faculty?.isHod;
  const canChange = senior || isHod;
  const canRooms = senior || role === 'OFFICE';
  const health = useHealth();
  const tabs = [
    { id: 'week', label: 'Week view' },
    { id: 'changes', label: 'Changes' },
    { id: 'free', label: 'Free rooms' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'bells', label: 'Bell schedule' },
    { id: 'health', label: `Health check${health.data?.errors ? ` (${health.data.errors})` : ''}` },
  ];
  const [tab, setTab] = useState('week');

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Timetable</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Any class, teacher or room, week by week — with cancellations, make-up and extra classes, room changes and substitutes. The weekly pattern is set in Subject Allocation.</p>
      </div>
      <div className="bg-white px-4 overflow-x-auto"><Tabs tabs={tabs} activeId={tab} onChange={setTab} /></div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {tab === 'week' && <WeekTab canChange={canChange} department={user?.faculty?.department ?? null} />}
        {tab === 'changes' && <ChangesTab canChange={canChange} />}
        {tab === 'free' && <FreeTab />}
        {tab === 'rooms' && <RoomsTab canEdit={canRooms} />}
        {tab === 'bells' && <BellsTab canEdit={senior} />}
        {tab === 'health' && <HealthTab />}
      </div>
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekTab({ canChange, department }: { canChange: boolean; department: string | null }) {
  const { data: o, isPending, error } = useOptions();
  const [kind, setKind] = useState<'class' | 'faculty' | 'room'>('class');
  const [pick, setPick] = useState('');
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [extra, setExtra] = useState(false);

  const classes = useMemo(() => (o?.classes ?? []).map((c) => ({ ...c, label: `${o!.programmes.find((p) => p.id === c.programmeId)?.shortName ?? 'Programme'} · Semester ${c.semester}` })).sort((a, b) => a.label.localeCompare(b.label)), [o]);
  const scope: Scope = kind === 'class'
    ? { scope: 'class', programmeId: pick.split(':')[0] ?? '', semester: Number(pick.split(':')[1] ?? 0) }
    : kind === 'faculty' ? { scope: 'faculty', facultyId: pick } : { scope: 'room', room: pick };
  const ready = !!pick;
  const pattern = usePattern(scope);
  const week = useWeek(scope);
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of week.data?.days ?? []) for (const c of d.classes) if (c.kind === 'REGULAR') m.set(c.subjectId, `${c.code} — ${c.subject} (${c.regularFaculty})`);
    return [...m.entries()].map(([subjectId, label]) => ({ subjectId, label }));
  }, [week.data]);

  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !o) return <InlineAlert type="error">{errText(error)}</InlineAlert>;

  function printPattern() {
    const p = pattern.data;
    if (!p || !week.data) return;
    const title = week.data.title;
    void downloadPdf({
      title: `Weekly timetable — ${title}`,
      subtitle: `Term ${p.term}`,
      sections: WEEKDAYS.map((d) => ({
        heading: DAY_NAME[d],
        table: { head: ['Time', 'Code', 'Subject', 'Class', 'Room', 'Teacher'], body: p.slots.filter((s) => s.day === d).map((s) => [`${s.startTime}–${s.endTime}`, s.code, s.subject, s.classLabel, s.room, s.faculty]).concat(p.slots.some((s) => s.day === d) ? [] : [['—', '', 'No classes', '', '', '']]) },
      })),
    });
  }
  function exportPattern() {
    if (!pattern.data || !week.data) return;
    downloadCSV(`timetable-${week.data.title}`, pattern.data.slots, [
      { key: 'day', label: 'Day' }, { key: 'startTime', label: 'From' }, { key: 'endTime', label: 'To' }, { key: 'code', label: 'Code' }, { key: 'subject', label: 'Subject' },
      { key: 'classLabel', label: 'Class' }, { key: 'room', label: 'Room' }, { key: 'faculty', label: 'Teacher' },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <div className="md:w-48">
          <Select label="Show the timetable of" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setPick(''); }}>
            <option value="class">A class</option><option value="faculty">A teacher</option><option value="room">A room</option>
          </Select>
        </div>
        <div className="flex-1">
          <Select label={kind === 'class' ? 'Class' : kind === 'faculty' ? 'Teacher' : 'Room'} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose…</option>
            {kind === 'class' && classes.map((c) => <option key={`${c.programmeId}:${c.semester}`} value={`${c.programmeId}:${c.semester}`}>{c.label}</option>)}
            {kind === 'faculty' && o.faculty.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.department}</option>)}
            {kind === 'room' && o.rooms.map((r) => <option key={r.id} value={r.code}>{r.code}{r.building ? ` · ${r.building}` : ''}{r.active ? '' : ' (out of use)'}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!ready || !pattern.data} onClick={printPattern}>Print weekly pattern</Button>
          <Button variant="secondary" disabled={!ready || !pattern.data} onClick={exportPattern}>Export CSV</Button>
          {canChange && <Button disabled={!ready || !subjects.length} onClick={() => setExtra(true)}>Add extra class</Button>}
        </div>
      </Card>
      {!ready
        ? <Card><EmptyState title="Choose a class, teacher or room" description={classes.length ? 'Its week appears here, with every change for each date.' : 'No class has a timetable this term yet — allocate subjects first.'} /></Card>
        : <WeekTimetable scope={scope} onSelect={setSelected} />}
      <ClassChangeModal occ={selected} onClose={() => setSelected(null)} canChange={canChange} department={department} />
      <ExtraClassModal open={extra} onClose={() => setExtra(false)} subjects={subjects} defaultDate={addDays(o.today, 1)} />
    </div>
  );
}

// ─── Changes ──────────────────────────────────────────────────────────────────

function ChangesTab({ canChange }: { canChange: boolean }) {
  const today = istToday();
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(addDays(today, 30));
  const [range, setRange] = useState({ from: addDays(today, -7), to: addDays(today, 30) });
  const [kind, setKind] = useState<Change['kind'] | ''>('');
  const { data, isPending, error } = useChanges(range.from, range.to);
  const undo = useUndoChange();
  const rows = (data?.changes ?? []).filter((c) => !kind || c.kind === kind);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" disabled={!from || !to || from > to} onClick={() => setRange({ from, to })}>Show</Button>
        <div className="md:w-44">
          <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Change['kind'] | '')}>
            <option value="">All changes</option>
            {(Object.keys(CHANGE_LABEL) as Change['kind'][]).map((k) => <option key={k} value={k}>{CHANGE_LABEL[k]}</option>)}
          </Select>
        </div>
        <div className="flex-1" />
        <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCSV(`timetable-changes-${range.from}-to-${range.to}`, rows, [
          { key: 'date', label: 'Date' }, { key: 'startTime', label: 'From' }, { key: 'endTime', label: 'To' }, { key: 'kind', label: 'Change', value: (r: Change) => CHANGE_LABEL[r.kind] },
          { key: 'code', label: 'Code' }, { key: 'subject', label: 'Subject' }, { key: 'classLabel', label: 'Class' }, { key: 'room', label: 'Room' }, { key: 'usualRoom', label: 'Usual room' },
          { key: 'faculty', label: 'Teacher' }, { key: 'usualFaculty', label: 'Usual teacher' }, { key: 'reason', label: 'Reason' }, { key: 'createdBy', label: 'Changed by' },
        ])}>Export CSV</Button>
      </Card>
      {isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {data && rows.length === 0 && <Card><EmptyState title="No changes" description="No class in this period differs from the weekly timetable." /></Card>}
      {rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F7F8FA]"><tr><Th>Date</Th><Th>Class</Th><Th>Change</Th><Th>Details</Th><Th>Reason</Th><Th>By</Th><Th /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-[#EDEFF3] align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap">{shortDate(c.date)}<p className="text-[11px] font-mono text-[#5A6577]">{c.startTime}–{c.endTime}</p></td>
                  <td className="px-3 py-2.5"><span className="font-mono text-[12px] text-[#5A6577]">{c.code}</span> {c.subject}<p className="text-[11px] text-[#5A6577]">{c.classLabel}</p></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{CHANGE_LABEL[c.kind]}{c.makeupForId ? ' (make-up)' : ''}</td>
                  <td className="px-3 py-2.5 text-[12px] text-[#5A6577]">{c.kind === 'ROOM' ? `${c.usualRoom} → ${c.room}` : c.kind === 'SUBSTITUTE' ? `${c.usualFaculty} → ${c.faculty}` : c.kind === 'EXTRA' ? `${c.room} · ${c.faculty}` : c.room}</td>
                  <td className="px-3 py-2.5 text-[12px] text-[#5A6577] max-w-[260px]">{c.reason}</td>
                  <td className="px-3 py-2.5 text-[12px] text-[#5A6577] whitespace-nowrap">{c.createdBy}</td>
                  <td className="px-3 py-2.5 text-right">
                    {canChange && !c.past && !c.makeupForId && <button className="text-[12px] text-[#A8242C] cursor-pointer disabled:opacity-50" disabled={undo.isPending}
                      onClick={() => undo.mutate(c.id, { onSuccess: (r) => toast.success(`Withdrawn — ${r.notified} students told`), onError: (e) => toast.error(errText(e)) })}>Undo</button>}
                    {c.past && <span className="text-[11px] text-[#5A6577]">Past</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─── Free rooms ───────────────────────────────────────────────────────────────

function FreeTab() {
  const periods = usePeriods();
  const [q, setQ] = useState({ date: istToday(), startTime: '10:00', endTime: '11:00', capacity: '0' });
  const [ask, setAsk] = useState<typeof q | null>(null);
  const rooms = useFreeRooms(ask ? { ...ask, capacity: Number(ask.capacity) || 0 } : null);
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <Input label="Date" type="date" value={q.date} onChange={(e) => setQ({ ...q, date: e.target.value })} />
        <div className="md:w-48">
          <Select label="Period" value={`${q.startTime}-${q.endTime}`} onChange={(e) => { const [s, t] = e.target.value.split('-'); if (s && t) setQ({ ...q, startTime: s, endTime: t }); }}>
            <option value={`${q.startTime}-${q.endTime}`}>{q.startTime}–{q.endTime}</option>
            {(periods.data ?? []).filter((p) => !p.isBreak).map((p) => <option key={p.id} value={`${p.startTime}-${p.endTime}`}>{p.label} ({p.startTime}–{p.endTime})</option>)}
          </Select>
        </div>
        <Input label="From" type="time" value={q.startTime} onChange={(e) => setQ({ ...q, startTime: e.target.value })} />
        <Input label="To" type="time" value={q.endTime} onChange={(e) => setQ({ ...q, endTime: e.target.value })} />
        <Input label="Seats at least" inputMode="numeric" value={q.capacity} onChange={(e) => setQ({ ...q, capacity: e.target.value.replace(/\D/g, '') })} />
        <Button disabled={!q.date || q.startTime >= q.endTime} onClick={() => setAsk({ ...q })}>Find free rooms</Button>
      </Card>
      {rooms.isFetching && <div className="flex justify-center py-10"><Spinner /></div>}
      {rooms.error && <InlineAlert type="error">{errText(rooms.error)}</InlineAlert>}
      {ask && rooms.data && !rooms.isFetching && (
        rooms.data.length === 0 ? <Card><EmptyState title="No room is free" description="Every room big enough is in use for some of that time." /></Card> : (
          <Card>
            <p className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3]">{rooms.data.length} room{rooms.data.length === 1 ? '' : 's'} free on {shortDate(ask.date)}, {ask.startTime}–{ask.endTime} — smallest that fits first</p>
            {rooms.data.map((r) => (
              <div key={r.id} className="px-4 py-2.5 border-b border-[#EDEFF3] last:border-0 flex justify-between text-[13px]">
                <span className="font-semibold text-[#16264A]">{r.code} <span className="font-normal text-[#5A6577]">{r.building}</span></span>
                <span className="text-[#5A6577]">{r.kind.toLowerCase()} · {r.capacity} seats</span>
              </div>
            ))}
          </Card>
        )
      )}
    </div>
  );
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

const KINDS: Room['kind'][] = ['CLASSROOM', 'LAB', 'HALL', 'SEMINAR', 'OTHER'];

function RoomsTab({ canEdit }: { canEdit: boolean }) {
  const { data, isPending, error } = useRooms();
  const add = useAddRoom();
  const edit = useEditRoom();
  const [form, setForm] = useState<{ id?: string; code: string; building: string; capacity: string; kind: Room['kind'] } | null>(null);
  const ok = !!form && form.code.trim().length > 0 && Number(form.capacity) > 0;

  function save() {
    if (!form) return;
    const body = { building: form.building.trim(), capacity: Number(form.capacity), kind: form.kind };
    if (form.id) edit.mutate({ id: form.id, ...body }, { onSuccess: () => { toast.success('Room saved'); setForm(null); } });
    else add.mutate({ code: form.code.trim(), ...body }, { onSuccess: () => { toast.success('Room added'); setForm(null); } });
  }

  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !data) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-[#5A6577]">{data.length} rooms · weekly hours are this term's timetabled classes. A room still in use cannot be taken out of use.</p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!data.length} onClick={() => downloadCSV('rooms', data, [{ key: 'code', label: 'Room' }, { key: 'building', label: 'Building' }, { key: 'kind', label: 'Kind' }, { key: 'capacity', label: 'Seats' }, { key: 'weeklyHours', label: 'Weekly hours' }, { key: 'active', label: 'In use', value: (r: Room) => (r.active ? 'Yes' : 'No') }])}>Export CSV</Button>
          {canEdit && <Button onClick={() => { add.reset(); edit.reset(); setForm({ code: '', building: '', capacity: '60', kind: 'CLASSROOM' }); }}>Add room</Button>}
        </div>
      </div>
      {data.length === 0 ? <Card><EmptyState title="No rooms yet" description="Add the institution's classrooms, labs and halls." /></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F7F8FA]"><tr><Th>Room</Th><Th>Building</Th><Th>Kind</Th><Th right>Seats</Th><Th right>Weekly hours</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-[#EDEFF3]">
                  <td className="px-3 py-2.5 font-semibold text-[#16264A]">{r.code}</td>
                  <td className="px-3 py-2.5 text-[#5A6577]">{r.building || '—'}</td>
                  <td className="px-3 py-2.5 text-[#5A6577]">{r.kind.charAt(0) + r.kind.slice(1).toLowerCase()}</td>
                  <td className="px-3 py-2.5 text-right">{r.capacity}</td>
                  <td className="px-3 py-2.5 text-right">{r.weeklyHours ?? 0}</td>
                  <td className="px-3 py-2.5">{r.active ? <span className="text-[#0E7A5F] text-[12px] font-semibold">In use</span> : <span className="text-[#5A6577] text-[12px]">Out of use</span>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {canEdit && <>
                      <button className="text-[12px] text-[#E0952A] cursor-pointer mr-3" onClick={() => { add.reset(); edit.reset(); setForm({ id: r.id, code: r.code, building: r.building, capacity: String(r.capacity), kind: r.kind }); }}>Edit</button>
                      <button className="text-[12px] cursor-pointer disabled:opacity-50" style={{ color: r.active ? '#A8242C' : '#0E7A5F' }} disabled={edit.isPending}
                        onClick={() => edit.mutate({ id: r.id, active: !r.active }, { onSuccess: () => toast.success(r.active ? `${r.code} taken out of use` : `${r.code} back in use`), onError: (e) => toast.error(errText(e)) })}>{r.active ? 'Retire' : 'Reinstate'}</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : 'Add a room'}
        footer={<><Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancel</Button><Button size="sm" loading={add.isPending || edit.isPending} disabled={!ok} onClick={save}>Save</Button></>}>
        {form && (
          <div className="flex flex-col gap-3">
            {(add.isError || edit.isError) && <InlineAlert type="error">{errText(add.error ?? edit.error)}</InlineAlert>}
            <Input label="Room code" value={form.code} disabled={!!form.id} maxLength={40} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. CS-301" hint={form.id ? 'The code is what timetables refer to, so it cannot change.' : undefined} />
            <Input label="Building" value={form.building} maxLength={80} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="e.g. Main block" />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Room['kind'] })}>{KINDS.map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}</Select>
              <Input label="Seats" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, '') })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Bell schedule ────────────────────────────────────────────────────────────

function BellsTab({ canEdit }: { canEdit: boolean }) {
  const { data, isPending, error } = usePeriods();
  const save = useSavePeriods();
  const [rows, setRows] = useState<Array<{ label: string; startTime: string; endTime: string; isBreak: boolean }> | null>(null);
  const list = rows ?? (data ?? []).map(({ label, startTime, endTime, isBreak }) => ({ label, startTime, endTime, isBreak }));
  const problem = list.some((p) => !p.label.trim() || !p.startTime || !p.endTime || p.startTime >= p.endTime) ? 'Each period needs a name and must end after it starts' : null;
  const set = (i: number, patch: Partial<(typeof list)[number]>) => setRows(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  return (
    <Card className="p-4 flex flex-col gap-3 max-w-[720px]">
      <div>
        <p className="text-[15px] font-semibold text-[#16264A]">Bell schedule</p>
        <p className="text-[12px] text-[#5A6577]">The periods of the teaching day. The free-room finder offers them, and timetables are laid out by them.</p>
      </div>
      {!canEdit && <InlineAlert type="info">The principal, registrar or administrator sets the bell schedule.</InlineAlert>}
      {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
      {list.length === 0 && <p className="text-[13px] text-[#5A6577] py-4 text-center">No periods set.</p>}
      {list.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_110px_110px_auto_auto] gap-2 items-center">
          <input disabled={!canEdit} value={p.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} className="h-9 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px] disabled:bg-[#F7F8FA]" />
          <input disabled={!canEdit} type="time" value={p.startTime} onChange={(e) => set(i, { startTime: e.target.value })} className="h-9 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px] disabled:bg-[#F7F8FA]" />
          <input disabled={!canEdit} type="time" value={p.endTime} onChange={(e) => set(i, { endTime: e.target.value })} className="h-9 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px] disabled:bg-[#F7F8FA]" />
          <Checkbox label="Break" checked={p.isBreak} disabled={!canEdit} onChange={(v) => set(i, { isBreak: v })} />
          {canEdit ? <button className="text-[12px] text-[#A8242C] cursor-pointer" onClick={() => setRows(list.filter((_, j) => j !== i))}>Remove</button> : <span />}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={list.length >= 20} onClick={() => { const last = list[list.length - 1]; setRows([...list, { label: `Period ${list.filter((x) => !x.isBreak).length + 1}`, startTime: last?.endTime ?? '09:00', endTime: '', isBreak: false }]); }}>Add period</Button>
          <Button size="sm" disabled={!rows || !!problem} loading={save.isPending} onClick={() => save.mutate(list, { onSuccess: () => { toast.success('Bell schedule saved'); setRows(null); } })}>Save schedule</Button>
          {rows && <Button size="sm" variant="secondary" onClick={() => setRows(null)}>Discard</Button>}
          {rows && problem && <span className="text-[12px] text-[#A8242C]">{problem}</span>}
        </div>
      )}
    </Card>
  );
}

// ─── Health check ─────────────────────────────────────────────────────────────

const ISSUE_LABEL: Record<string, string> = { teacher: 'Teacher double-booked', room: 'Room double-booked', class: 'Class double-booked', capacity: 'Room too small', 'unknown-room': 'Room not on the list', overload: 'Teacher over the weekly limit', 'no-slots': 'Subject with no class time' };

function HealthTab() {
  const { data, isPending, error, refetch, isFetching } = useHealth();
  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !data) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#16264A]">Term {data.term}: {data.slots} weekly classes checked · <span className="text-[#A8242C] font-semibold">{data.errors} problem{data.errors === 1 ? '' : 's'}</span> · <span className="text-[#8A6D1F] font-semibold">{data.warnings} warning{data.warnings === 1 ? '' : 's'}</span></p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={!data.issues.length} onClick={() => downloadCSV(`timetable-health-${data.term}`, data.issues, [{ key: 'severity', label: 'Severity' }, { key: 'kind', label: 'Issue', value: (r) => ISSUE_LABEL[r.kind] ?? r.kind }, { key: 'text', label: 'Details' }])}>Export CSV</Button>
          <Button size="sm" loading={isFetching} onClick={() => void refetch()}>Check again</Button>
        </div>
      </div>
      {data.issues.length === 0
        ? <InlineAlert type="success">No clashes, no overloaded teacher, every room fits its class and every allocated subject has class time.</InlineAlert>
        : (
          <Card>
            {data.issues.map((i, n) => (
              <div key={n} className="px-4 py-2.5 border-b border-[#EDEFF3] last:border-0 flex gap-3 items-start">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[2px] whitespace-nowrap ${i.severity === 'error' ? 'bg-[#FEE2E2] text-[#A8242C]' : 'bg-[#FEF9EC] text-[#8A6D1F]'}`}>{ISSUE_LABEL[i.kind] ?? i.kind}</span>
                <span className="text-[13px] text-[#16264A]">{i.text}</span>
              </div>
            ))}
          </Card>
        )}
      <p className="text-[12px] text-[#5A6577]">Fix clashes and missing class times in Subject Allocation; one-off problems on a single date in the Week view.</p>
    </div>
  );
}

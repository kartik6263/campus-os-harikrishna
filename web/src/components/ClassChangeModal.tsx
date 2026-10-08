import { useEffect, useState } from 'react';
import { Button, Checkbox, InlineAlert, Input, Modal, Select, toast } from './ui';
import { ApiError } from '../lib/api';
import {
  longDate, shortDate, useFreeFaculty, useFreeRooms, useMakeChange, useUndoChange,
  type Occurrence, type Room,
} from '../lib/timetable';

/**
 * Changing one dated class: cancel it (and optionally put on a make-up
 * class), move it to a free room, hand it to a free colleague, or undo a
 * change already made. The class is told each time.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
type Mode = 'menu' | 'cancel' | 'room' | 'substitute';
const area = 'px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none';

export default function ClassChangeModal({ occ, onClose, canChange, department }: { occ: Occurrence | null; onClose: () => void; canChange: boolean; department?: string | null }) {
  const [mode, setMode] = useState<Mode>('menu');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [withMakeup, setWithMakeup] = useState(false);
  const [makeup, setMakeup] = useState({ date: '', startTime: '', endTime: '', room: '' });
  const [room, setRoom] = useState('');
  const [sub, setSub] = useState('');
  const make = useMakeChange();
  const undo = useUndoChange();

  useEffect(() => {
    if (!occ) return;
    setMode('menu'); setReason(''); setNotify(true); setWithMakeup(false); setRoom(''); setSub('');
    setMakeup({ date: '', startTime: occ.startTime, endTime: occ.endTime, room: occ.room });
    make.reset(); undo.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occ?.id, occ?.date]);

  const freeRooms = useFreeRooms(occ && mode === 'room' ? { date: occ.date, startTime: occ.startTime, endTime: occ.endTime } : null);
  const makeupRooms = useFreeRooms(occ && mode === 'cancel' && withMakeup && makeup.date ? { date: makeup.date, startTime: makeup.startTime, endTime: makeup.endTime } : null);
  const freeFaculty = useFreeFaculty(occ && mode === 'substitute' ? { date: occ.date, startTime: occ.startTime, endTime: occ.endTime, department: department ?? undefined } : null);

  if (!occ) return null;
  const changes: Array<{ id: string; label: string }> = [
    ...(occ.cancelId ? [{ id: occ.cancelId, label: 'Withdraw the cancellation (and any make-up class)' }] : []),
    ...(occ.roomChange ? [{ id: occ.roomChange.id, label: `Move it back to ${occ.roomChange.from}` }] : []),
    ...(occ.substitute ? [{ id: occ.substitute.id, label: `Withdraw the substitute (${occ.faculty})` }] : []),
    ...(occ.extraId ? [{ id: occ.extraId, label: occ.makeupFor ? 'Withdraw this make-up class' : 'Withdraw this extra class' }] : []),
  ];
  const scheduled = occ.status === 'SCHEDULED' && occ.kind === 'REGULAR';
  const done = (text: string) => { toast.success(text); onClose(); };
  const roomOptions = (rooms: Room[] | undefined, current?: string) => (rooms ?? []).filter((r) => r.code !== current);

  function submit() {
    if (!occ?.slotId) return;
    if (mode === 'cancel') make.mutate({ kind: 'CANCEL', slotId: occ.slotId, date: occ.date, reason: reason.trim(), notify, ...(withMakeup ? { makeup } : {}) }, { onSuccess: (r) => done(`Cancelled${withMakeup ? ' and rescheduled' : ''} — ${r.notified} students told`) });
    if (mode === 'room') make.mutate({ kind: 'ROOM', slotId: occ.slotId, date: occ.date, room, reason: reason.trim() }, { onSuccess: (r) => done(`Moved to ${room} — ${r.notified} students told`) });
    if (mode === 'substitute') make.mutate({ kind: 'SUBSTITUTE', slotId: occ.slotId, date: occ.date, facultyId: sub, reason: reason.trim() }, { onSuccess: (r) => done(`Substitute arranged — ${r.notified} students told`) });
  }
  const ok = mode === 'cancel' ? reason.trim().length >= 10 && (!withMakeup || (!!makeup.date && makeup.startTime < makeup.endTime && !!makeup.room))
    : mode === 'room' ? reason.trim().length >= 5 && !!room
    : mode === 'substitute' ? reason.trim().length >= 5 && !!sub : false;

  return (
    <Modal open onClose={onClose} title={mode === 'menu' ? `${occ.code} · ${shortDate(occ.date)} ${occ.startTime}` : mode === 'cancel' ? 'Cancel this class' : mode === 'room' ? 'Change the room' : 'Arrange a substitute'} width="520px"
      footer={mode === 'menu'
        ? <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        : <><Button variant="secondary" size="sm" onClick={() => setMode('menu')}>Back</Button><Button size="sm" variant={mode === 'cancel' ? 'destructive' : 'primary'} loading={make.isPending} disabled={!ok} onClick={submit}>{mode === 'cancel' ? (withMakeup ? 'Cancel and reschedule' : 'Cancel class') : mode === 'room' ? 'Move class' : 'Arrange substitute'}</Button></>}>
      <div className="flex flex-col gap-3">
        {(make.isError || undo.isError) && <InlineAlert type="error">{errText(make.error ?? undo.error)}</InlineAlert>}
        <div className="bg-[#EDEFF3] rounded-[4px] px-3 py-2">
          <p className="text-[14px] font-semibold text-[#16264A]">{occ.subject} <span className="font-mono text-[12px] font-normal text-[#5A6577]">{occ.code}</span></p>
          <p className="text-[12px] text-[#5A6577]">{longDate(occ.date)} · {occ.startTime}–{occ.endTime} · {occ.room} · {occ.faculty}</p>
          {occ.note && <p className="text-[12px] text-[#8A6D1F] mt-0.5">{occ.note}</p>}
        </div>

        {mode === 'menu' && (
          <>
            {!canChange && <InlineAlert type="info">Only this class’s own lecturer, their head of department or the principal can change it.</InlineAlert>}
            {canChange && occ.status === 'HOLIDAY' && <InlineAlert type="info">This day is a holiday; there is nothing to change.</InlineAlert>}
            {canChange && scheduled && (
              <div className="grid gap-2">
                <Button variant="secondary" onClick={() => setMode('cancel')}>Cancel or reschedule this class</Button>
                {!occ.roomChange && <Button variant="secondary" onClick={() => setMode('room')}>Move it to another room</Button>}
                {!occ.substitute && <Button variant="secondary" onClick={() => setMode('substitute')}>Arrange a substitute teacher</Button>}
              </div>
            )}
            {canChange && changes.length > 0 && (
              <div className="grid gap-2 pt-1">
                <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Undo</p>
                {changes.map((c) => (
                  <Button key={c.id} variant="secondary" loading={undo.isPending && undo.variables === c.id} onClick={() => undo.mutate(c.id, { onSuccess: (r) => done(`Done — ${r.notified} students told`) })}>{c.label}</Button>
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'cancel' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Reason — the class sees it</span>
              <textarea rows={3} maxLength={300} className={area} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called to the university for paper setting" />
              <span className="text-[11px] text-[#5A6577]">At least 10 characters. Only this date is cancelled; the class meets as usual the following week.</span>
            </label>
            <Checkbox label="Tell the students now" checked={notify} onChange={setNotify} />
            <Checkbox label="Hold a make-up class instead (reschedule)" checked={withMakeup} onChange={setWithMakeup} />
            {withMakeup && (
              <div className="grid grid-cols-3 gap-2">
                <Input label="Date" type="date" min={occ.date} value={makeup.date} onChange={(e) => setMakeup({ ...makeup, date: e.target.value, room: '' })} />
                <Input label="From" type="time" value={makeup.startTime} onChange={(e) => setMakeup({ ...makeup, startTime: e.target.value, room: '' })} />
                <Input label="To" type="time" value={makeup.endTime} onChange={(e) => setMakeup({ ...makeup, endTime: e.target.value, room: '' })} />
                <div className="col-span-3">
                  <Select label={makeupRooms.isFetching ? 'Room (checking…)' : 'Room free at that time'} value={makeup.room} onChange={(e) => setMakeup({ ...makeup, room: e.target.value })} disabled={!makeup.date}>
                    <option value="">{makeup.date ? 'Choose a room' : 'Pick the date first'}</option>
                    {(makeupRooms.data ?? []).map((r) => <option key={r.id} value={r.code}>{r.code} · {r.kind.toLowerCase()} · {r.capacity} seats{r.building ? ` · ${r.building}` : ''}</option>)}
                  </Select>
                  {makeup.date && makeupRooms.data && makeupRooms.data.length === 0 && <p className="text-[11px] text-[#A8242C] mt-1">No room is free then; pick another time.</p>}
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'room' && (
          <>
            <Select label={freeRooms.isFetching ? 'Free rooms (checking…)' : 'Rooms free for the whole class'} value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">Choose a room</option>
              {roomOptions(freeRooms.data, occ.room).map((r) => <option key={r.id} value={r.code}>{r.code} · {r.kind.toLowerCase()} · {r.capacity} seats{r.building ? ` · ${r.building}` : ''}</option>)}
            </Select>
            {freeRooms.data && roomOptions(freeRooms.data, occ.room).length === 0 && <InlineAlert type="warning">No other room is free at this time.</InlineAlert>}
            <Input label="Reason — the class sees it" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Projector not working in CS-201" />
          </>
        )}

        {mode === 'substitute' && (
          <>
            <Select label={freeFaculty.isFetching ? 'Free teachers (checking…)' : 'Teachers free at this time'} value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">Choose a colleague</option>
              {(freeFaculty.data ?? []).filter((f) => f.id !== occ.regularFacultyId).map((f) => <option key={f.id} value={f.id}>{f.name} · {f.department}{f.sameDepartment ? ' (same department)' : ''} · {f.classesThatDay} class{f.classesThatDay === 1 ? '' : 'es'} that day</option>)}
            </Select>
            {freeFaculty.data && freeFaculty.data.length === 0 && <InlineAlert type="warning">No colleague is free at this time.</InlineAlert>}
            <Input label="Reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. On examination duty" />
            <p className="text-[11px] text-[#5A6577]">The substitute sees the class on their own timetable and takes its roll call.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Adding an extra class for one of the subjects a person may schedule. */
export function ExtraClassModal({ open, onClose, subjects, defaultDate }: { open: boolean; onClose: () => void; subjects: Array<{ subjectId: string; label: string }>; defaultDate: string }) {
  const [f, setF] = useState({ subjectId: '', date: defaultDate, startTime: '15:00', endTime: '16:00', room: '', reason: '' });
  const make = useMakeChange();
  useEffect(() => { if (open) { setF({ subjectId: subjects[0]?.subjectId ?? '', date: defaultDate, startTime: '15:00', endTime: '16:00', room: '', reason: '' }); make.reset(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const rooms = useFreeRooms(open && f.date ? { date: f.date, startTime: f.startTime, endTime: f.endTime } : null);
  const ok = !!f.subjectId && !!f.date && f.startTime < f.endTime && !!f.room && f.reason.trim().length >= 5;
  return (
    <Modal open={open} onClose={onClose} title="Add an extra class" width="520px"
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={make.isPending} disabled={!ok}
        onClick={() => make.mutate({ kind: 'EXTRA', ...f, reason: f.reason.trim() }, { onSuccess: (r) => { toast.success(`Extra class added — ${r.notified} students told`); onClose(); } })}>Add class</Button></>}>
      <div className="flex flex-col gap-3">
        {make.isError && <InlineAlert type="error">{errText(make.error)}</InlineAlert>}
        {subjects.length === 0 && <InlineAlert type="info">You have no subject allocated this term.</InlineAlert>}
        <Select label="Subject" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
          {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.label}</option>)}
        </Select>
        <div className="grid grid-cols-3 gap-2">
          <Input label="Date" type="date" min={defaultDate} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, room: '' })} />
          <Input label="From" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value, room: '' })} />
          <Input label="To" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value, room: '' })} />
        </div>
        <Select label={rooms.isFetching ? 'Room (checking…)' : 'Room free at that time'} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}>
          <option value="">Choose a room</option>
          {(rooms.data ?? []).map((r) => <option key={r.id} value={r.code}>{r.code} · {r.kind.toLowerCase()} · {r.capacity} seats</option>)}
        </Select>
        <Input label="Purpose — the class sees it" value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Revision before the internal test" />
        <p className="text-[11px] text-[#5A6577]">Refused if the class, the teacher or the room is already busy then, or the day is a holiday or a Sunday.</p>
      </div>
    </Modal>
  );
}

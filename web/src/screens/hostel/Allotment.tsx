import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { api } from '../../lib/api';
import { downloadCSV } from '../../lib/export';
import {
  day, post, useApplications, useHostelAction, useOverview, useResidents, useRoomChanges, useVacancies,
  type Application, type Resident, type RoomChange,
} from '../../lib/hostel';
import type { RegisterRow } from '../../lib/lifecycle';
import { HostelPicker, Panel, Pill, Th, errText, useDebounced, useHostelRole } from './common';

/** Rooms with a free bed that fit this student; the server has already applied the gender rule. */
function RoomChooser({ studentId, value, onChange }: { studentId: string; value: { roomId: string; bed: string } | null; onChange: (v: { roomId: string; bed: string }) => void }) {
  const overview = useOverview();
  const [hostelId, setHostelId] = useState('');
  const v = useVacancies(studentId, hostelId || undefined);
  return (
    <div className="space-y-2">
      <HostelPicker hostels={(overview.data?.hostels ?? []).filter((h) => h.active)} value={hostelId} onChange={setHostelId} all label="Hostel" />
      {v.isLoading ? <Spinner /> : v.isError ? <InlineAlert type="error">{errText(v.error)}</InlineAlert> : (v.data ?? []).length === 0 ? <InlineAlert type="warning">No room with a free bed fits this student{hostelId ? ' in this hostel' : ''}.</InlineAlert> : (
        <div className="max-h-72 overflow-y-auto border border-[#D3D8E0] rounded-[4px] divide-y divide-[#EDEFF3]">
          {v.data!.map((r) => (
            <div key={r.id} className={`px-3 py-2 ${value?.roomId === r.id ? 'bg-[#FEF9EC]' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-[#16264A]"><span className="font-mono font-semibold">{r.hostel.code}/{r.roomNo}</span> · {r.capacity}-bed{r.ac ? ' · AC' : ''}{r.attachedBath ? ' · bath' : ''} · floor {r.floor === 0 ? 'G' : r.floor}</p>
                <div className="flex gap-1">
                  {r.freeBeds.map((b) => (
                    <button key={b} onClick={() => onChange({ roomId: r.id, bed: b })} className={`w-7 h-7 text-[12px] rounded-[4px] border cursor-pointer ${value?.roomId === r.id && value.bed === b ? 'bg-[#E0952A] text-white border-[#E0952A]' : 'border-[#D3D8E0] hover:border-[#E0952A]'}`}>{b}</button>
                  ))}
                </div>
              </div>
              {r.beds.some((b) => b.student) && <p className="text-[11px] text-[#5A6577]">With {r.beds.filter((b) => b.student).map((b) => b.student!.name).join(', ')}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Applications ────────────────────────────────────────────────────────────

const APP_STYLE: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-800', WAITLISTED: 'bg-violet-100 text-violet-700', ALLOTTED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-500' };

export function ApplicationsTab() {
  const { canOps } = useHostelRole();
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const apps = useApplications(status, search.length >= 2 ? search : undefined);
  const [open, setOpen] = useState<Application | null>(null);
  const [run, setRun] = useState(false);
  const rows = apps.data ?? [];
  return (
    <div className="space-y-3">
      <Panel action={
        <div className="flex flex-wrap items-end gap-3 w-full">
          <div className="w-44"><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['PENDING', 'WAITLISTED', 'ALLOTTED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select></div>
          <div className="w-64"><Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, enrolment or application no." /></div>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('hostel-applications', rows.map((a) => ({ application: a.applicationNo, student: a.student.name, enrolmentNo: a.student.enrolmentNo, gender: a.student.gender ?? '', category: a.student.category ?? '', distanceKm: a.distanceKm, specialNeeds: a.specialNeeds ?? '', preference: a.roomPreference, preferredHostel: a.preferredHostel?.name ?? '', score: a.priorityScore, status: a.status, allotted: a.allotment ? `${a.allotment.room.hostel.code}/${a.allotment.room.roomNo}-${a.allotment.bed}` : '' })))}>Export CSV</Button>
          {canOps && <Button size="sm" onClick={() => setRun(true)}>Allotment run…</Button>}
        </div>
      }>
        {apps.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : apps.isError ? <div className="p-4"><InlineAlert type="error">{errText(apps.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No applications" description="Students apply from Hostel in their portal." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Application</Th><Th>Student</Th><Th>Distance</Th><Th>Needs</Th><Th>Wants</Th><Th>Score</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-[#EDEFF3] align-top">
                    <td className="px-3 py-2.5 font-mono text-[12px]">{a.applicationNo}<p className="font-sans text-[11px] text-[#5A6577]">{day(a.createdAt)}</p></td>
                    <td className="px-3 py-2.5"><p className="text-[#16264A] font-medium">{a.student.name}</p><p className="text-[11px] text-[#5A6577]">{a.student.enrolmentNo} · {a.student.gender ?? 'gender not recorded'} · {a.student.category ?? '—'}</p></td>
                    <td className="px-3 py-2.5 tabular-nums">{a.distanceKm} km</td>
                    <td className="px-3 py-2.5 text-[12px] max-w-[180px]">{a.specialNeeds ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px]">{a.roomPreference.toLowerCase()}{a.preferredHostel ? <p className="text-[#5A6577]">{a.preferredHostel.name}</p> : null}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{a.priorityScore}</td>
                    <td className="px-3 py-2.5"><Pill className={APP_STYLE[a.status]!}>{a.status.toLowerCase()}</Pill>{a.allotment && <p className="text-[11px] font-mono mt-1">{a.allotment.room.hostel.code}/{a.allotment.room.roomNo}-{a.allotment.bed}</p>}{a.decisionNote && <p className="text-[11px] text-[#5A6577] mt-1">{a.decisionNote}</p>}</td>
                    <td className="px-3 py-2.5 text-right">{canOps && ['PENDING', 'WAITLISTED'].includes(a.status) && <Button size="sm" onClick={() => setOpen(a)}>Decide</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-[12px] text-[#5A6577]">Score = distance (10–40) + category (SC/ST 25, OBC/EWS 15) + medical or disability need (30) + first year (5). It is fixed when the student applies.</p>
      {open && <DecideApplication app={open} onClose={() => setOpen(null)} />}
      {run && <AllotmentRun onClose={() => setRun(false)} />}
    </div>
  );
}

function DecideApplication({ app, onClose }: { app: Application; onClose: () => void }) {
  const [choice, setChoice] = useState<{ roomId: string; bed: string } | null>(null);
  const [note, setNote] = useState('');
  const act = useHostelAction((body: { action: 'ALLOT' | 'WAITLIST' | 'REJECT'; roomId?: string; bed?: string; note?: string }) => post(`/applications/${app.id}/decide`, body));
  async function go(action: 'ALLOT' | 'WAITLIST' | 'REJECT') {
    if (action === 'REJECT' && note.trim().length < 5) { toast.error('Tell the student why'); return; }
    try {
      await act.mutateAsync({ action, ...(choice && action === 'ALLOT' ? choice : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success(action === 'ALLOT' ? `${app.student.name} allotted — they have been notified` : action === 'WAITLIST' ? 'Waitlisted' : 'Rejected');
      onClose();
    } catch (e) { toast.error(errText(e)); }
  }
  return (
    <Modal open onClose={onClose} title={`${app.applicationNo} — ${app.student.name}`} width="640px"
      footer={<><Button size="sm" variant="ghost" loading={act.isPending} onClick={() => void go('REJECT')}>Reject</Button>{app.status === 'PENDING' && <Button size="sm" variant="secondary" loading={act.isPending} onClick={() => void go('WAITLIST')}>Waitlist</Button>}<Button size="sm" loading={act.isPending} disabled={!choice} onClick={() => void go('ALLOT')}>Allot {choice ? `bed ${choice.bed}` : ''}</Button></>}>
      <div className="space-y-3 text-[13px]">
        <p className="text-[#5A6577]">{app.reason}</p>
        <p>{app.distanceKm} km from home · {app.student.programme.shortName} sem {app.student.semester} · wants {app.roomPreference.toLowerCase()}{app.preferredHostel ? ` in ${app.preferredHostel.name}` : ''} · score {app.priorityScore}</p>
        {app.specialNeeds && <InlineAlert type="warning">Special need: {app.specialNeeds}</InlineAlert>}
        <RoomChooser studentId={app.student.id} value={choice} onChange={setChoice} />
        <Input label="Note to the student (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

function AllotmentRun({ onClose }: { onClose: () => void }) {
  const overview = useOverview();
  const [hostelId, setHostelId] = useState('');
  type Plan = { applicationId: string; applicationNo: string; student: string; enrolmentNo: string; score: number; room: string | null; bed: string | null; why: string | null };
  const preview = useHostelAction(() => post<{ plan: Plan[] }>('/applications/auto-allot', { hostelId: hostelId || undefined, dryRun: true }));
  const commit = useHostelAction(() => post<{ allotted: number; failed: Array<{ student: string; reason: string }> }>('/applications/auto-allot', { hostelId: hostelId || undefined, dryRun: false }));
  const plan = preview.data?.plan;
  return (
    <Modal open onClose={onClose} title="Allotment run" width="720px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Close</Button><Button size="sm" variant="secondary" loading={preview.isPending} onClick={() => preview.mutate(undefined, { onError: (e) => toast.error(errText(e)) })}>{plan ? 'Preview again' : 'Preview'}</Button><Button size="sm" loading={commit.isPending} disabled={!plan || !plan.some((p) => p.room)} onClick={() => commit.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.allotted} allotted${r.failed.length ? `, ${r.failed.length} could not be` : ''}; the rest are waitlisted`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Confirm allotments</Button></>}>
      <div className="space-y-3">
        <p className="text-[13px] text-[#5A6577]">Fills free beds from the queue, highest score first. Each student gets their preferred hostel if a fitting bed is free there, otherwise the first fitting bed; a student with a medical need is placed on the ground floor where possible. Nothing is written until you confirm; whoever cannot be placed is waitlisted.</p>
        <HostelPicker hostels={(overview.data?.hostels ?? []).filter((h) => h.active)} value={hostelId} onChange={setHostelId} all label="Fill beds in" />
        {preview.isPending && <Spinner />}
        {plan && (plan.length === 0 ? <InlineAlert type="info">No one is waiting.</InlineAlert> : (
          <table className="w-full text-[13px]"><thead><tr className="border-b border-[#D3D8E0]"><Th>Student</Th><Th>Score</Th><Th>Gets</Th></tr></thead>
            <tbody>{plan.map((p) => <tr key={p.applicationId} className="border-b border-[#EDEFF3]"><td className="px-3 py-1.5">{p.student}<p className="text-[11px] text-[#5A6577]">{p.applicationNo}</p></td><td className="px-3 py-1.5 tabular-nums">{p.score}</td><td className="px-3 py-1.5">{p.room ? <span className="font-mono text-[#0E7A5F]">{p.room}-{p.bed}</span> : <span className="text-[#A8242C]">{p.why}</span>}</td></tr>)}</tbody></table>
        ))}
      </div>
    </Modal>
  );
}

// ─── Residents ───────────────────────────────────────────────────────────────

export function ResidentsTab() {
  const overview = useOverview();
  const { canOps } = useHostelRole();
  const [hostelId, setHostelId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const res = useResidents({ hostelId: hostelId || undefined, status, q: search.length >= 2 ? search : undefined });
  const [action, setAction] = useState<{ kind: 'move' | 'vacate'; r: Resident } | null>(null);
  const [adding, setAdding] = useState(false);
  const checkIn = useHostelAction((id: string) => post(`/allotments/${id}/check-in`));
  const rows = res.data ?? [];
  return (
    <div className="space-y-3">
      <Panel action={
        <div className="flex flex-wrap items-end gap-3 w-full">
          <HostelPicker hostels={overview.data?.hostels ?? []} value={hostelId} onChange={setHostelId} all />
          <div className="w-36"><Select label="Showing" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">Current</option><option value="VACATED">Former</option></Select></div>
          <div className="w-56"><Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number or room" /></div>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('hostel-residents', rows.map((r) => ({ allotment: r.allotmentNo, hostel: r.room.hostel.code, room: r.room.roomNo, bed: r.bed, student: r.student.name, enrolmentNo: r.student.enrolmentNo, programme: `${r.student.programme.shortName} ${r.student.semester}`, mobile: r.student.mobile ?? '', parent: r.student.guardian?.email ?? '', allotted: r.allottedAt.slice(0, 10), checkedIn: r.checkedInAt?.slice(0, 10) ?? '', vacated: r.vacatedAt?.slice(0, 10) ?? '', reason: r.vacateReason ?? '' })))}>Export CSV</Button>
          {canOps && <Button size="sm" onClick={() => setAdding(true)}>+ Allot directly</Button>}
        </div>
      }>
        {res.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : res.isError ? <div className="p-4"><InlineAlert type="error">{errText(res.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No residents match" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Resident</Th><Th>Room</Th><Th>Allotted</Th><Th>{status === 'ACTIVE' ? 'Checked in' : 'Left'}</Th><Th>Contact</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#EDEFF3]">
                    <td className="px-3 py-2.5"><p className="text-[#16264A] font-medium">{r.student.name}</p><p className="text-[11px] text-[#5A6577] font-mono">{r.student.enrolmentNo} · {r.allotmentNo}</p></td>
                    <td className="px-3 py-2.5 font-mono">{r.room.hostel.code}/{r.room.roomNo}-{r.bed}</td>
                    <td className="px-3 py-2.5 text-[12px]">{day(r.allottedAt)}<p className="text-[11px] text-[#5A6577]">{r.allottedBy}</p></td>
                    <td className="px-3 py-2.5 text-[12px]">{status === 'ACTIVE' ? (r.checkedInAt ? day(r.checkedInAt) : canOps ? <Button size="sm" variant="secondary" onClick={() => checkIn.mutate(r.id, { onSuccess: () => toast.success(`${r.student.name} checked in`), onError: (e) => toast.error(errText(e)) })}>Check in</Button> : 'Not yet') : <>{day(r.vacatedAt)}<p className="text-[11px] text-[#5A6577]">{r.vacateReason}</p></>}</td>
                    <td className="px-3 py-2.5 text-[12px]">{r.student.mobile ?? '—'}{r.student.guardian ? <p className="text-[11px] text-[#5A6577]">Parent: {r.student.guardian.email}</p> : null}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{canOps && status === 'ACTIVE' && <><Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'move', r })}>Move</Button><Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'vacate', r })}>Vacate</Button></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {action && <ResidentAction {...action} onClose={() => setAction(null)} />}
      {adding && <DirectAllot onClose={() => setAdding(false)} />}
    </div>
  );
}

function ResidentAction({ kind, r, onClose }: { kind: 'move' | 'vacate'; r: Resident; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState<{ roomId: string; bed: string } | null>(null);
  const act = useHostelAction(() => (kind === 'move' ? post(`/allotments/${r.id}/transfer`, { ...choice, reason: reason.trim() }) : post(`/allotments/${r.id}/vacate`, { reason: reason.trim() })));
  return (
    <Modal open onClose={onClose} title={`${kind === 'move' ? 'Move' : 'Vacate'} — ${r.student.name}, ${r.room.hostel.code}/${r.room.roomNo}-${r.bed}`} width={kind === 'move' ? '640px' : '480px'}
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" variant={kind === 'vacate' ? 'destructive' : 'primary'} loading={act.isPending} disabled={reason.trim().length < 5 || (kind === 'move' && !choice)} onClick={() => act.mutate(undefined, { onSuccess: () => { toast.success(kind === 'move' ? `${r.student.name} moved` : `${r.room.roomNo}-${r.bed} vacated`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>{kind === 'move' ? 'Move' : 'Vacate'}</Button></>}>
      <div className="space-y-3">
        {kind === 'move' ? <RoomChooser studentId={r.student.id} value={choice} onChange={setChoice} /> : <InlineAlert type="warning">The bed frees at once. Open leave requests and room-change requests are withdrawn. Hostel dues stay on the fee account.</InlineAlert>}
        <Input label="Reason (on the record)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'move' ? 'e.g. Medical — needs the ground floor' : 'e.g. End of the academic year'} />
      </div>
    </Modal>
  );
}

function DirectAllot({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [student, setStudent] = useState<RegisterRow | null>(null);
  const [choice, setChoice] = useState<{ roomId: string; bed: string } | null>(null);
  const [note, setNote] = useState('');
  const list = useQuery({ queryKey: ['hostel', 'pick-student', search], enabled: search.length >= 2, queryFn: () => api<{ students: RegisterRow[] }>(`/api/lifecycle/students?status=ACTIVE&q=${encodeURIComponent(search)}`) });
  const act = useHostelAction(() => post('/allotments', { studentId: student!.id, ...choice, ...(note.trim() ? { note: note.trim() } : {}) }));
  return (
    <Modal open onClose={onClose} title="Allot a bed directly" width="640px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={act.isPending} disabled={!student || !choice} onClick={() => act.mutate(undefined, { onSuccess: () => { toast.success(`${student!.name} allotted`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Allot</Button></>}>
      <div className="space-y-3">
        <p className="text-[12px] text-[#5A6577]">For a mid-year admission or an urgent case. If the student has an application in the queue, it is marked allotted.</p>
        {student ? (
          <div className="flex items-center justify-between border border-[#D3D8E0] rounded-[4px] px-3 py-2"><span className="text-[13px]"><b>{student.name}</b> <span className="font-mono text-[11px] text-[#5A6577]">{student.enrolmentNo}</span></span><button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => { setStudent(null); setChoice(null); }}>Change</button></div>
        ) : (
          <>
            <Input label="Student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or enrolment number" />
            {list.isLoading && <Spinner />}
            <div className="max-h-48 overflow-y-auto divide-y divide-[#EDEFF3]">{(list.data?.students ?? []).map((s) => <button key={s.id} onClick={() => setStudent(s)} className="w-full text-left px-2 py-1.5 hover:bg-[#FEF9EC] cursor-pointer text-[13px]">{s.name} <span className="font-mono text-[11px] text-[#5A6577]">{s.enrolmentNo} · {s.programme} sem {s.semester}</span></button>)}</div>
          </>
        )}
        {student && <RoomChooser studentId={student.id} value={choice} onChange={setChoice} />}
        {student && <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
      </div>
    </Modal>
  );
}

// ─── Room changes ────────────────────────────────────────────────────────────

export function RoomChangesTab() {
  const { canOps } = useHostelRole();
  const [status, setStatus] = useState('PENDING');
  const q = useRoomChanges(status);
  const [open, setOpen] = useState<RoomChange | null>(null);
  return (
    <Panel action={<div className="w-44"><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select></div>}>
      {q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : (q.data ?? []).length === 0 ? <div className="p-6"><EmptyState title="No requests" description="Residents ask to change rooms from their portal." /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Request</Th><Th>Resident</Th><Th>From</Th><Th>Wants</Th><Th>Reason</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>{q.data!.map((r) => (
            <tr key={r.id} className="border-b border-[#EDEFF3] align-top">
              <td className="px-3 py-2.5 font-mono text-[12px]">{r.requestNo}<p className="font-sans text-[11px] text-[#5A6577]">{day(r.createdAt)}</p></td>
              <td className="px-3 py-2.5">{r.student.name}<p className="text-[11px] text-[#5A6577] font-mono">{r.student.enrolmentNo}</p></td>
              <td className="px-3 py-2.5 font-mono">{r.allotment.room.hostel.code}/{r.allotment.room.roomNo}-{r.allotment.bed}</td>
              <td className="px-3 py-2.5 font-mono">{r.preferredRoom ? `${r.preferredRoom.hostel.code}/${r.preferredRoom.roomNo}` : 'any'}</td>
              <td className="px-3 py-2.5 text-[12px] text-[#5A6577] max-w-[260px]">{r.reason}</td>
              <td className="px-3 py-2.5 text-[12px]">{r.status.toLowerCase()}{r.decisionNote ? <p className="text-[#5A6577]">{r.decisionNote}</p> : null}</td>
              <td className="px-3 py-2.5 text-right">{canOps && r.status === 'PENDING' && <Button size="sm" onClick={() => setOpen(r)}>Decide</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {open && <DecideRoomChange rc={open} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

function DecideRoomChange({ rc, onClose }: { rc: RoomChange; onClose: () => void }) {
  const [choice, setChoice] = useState<{ roomId: string; bed: string } | null>(null);
  const [note, setNote] = useState('');
  const act = useHostelAction((approve: boolean) => post(`/room-changes/${rc.id}/decide`, { approve, note: note.trim(), ...(approve && choice ? choice : {}) }));
  const go = (approve: boolean) => act.mutate(approve, { onSuccess: () => { toast.success(approve ? `${rc.student.name} moved` : 'Request declined'); onClose(); }, onError: (e) => toast.error(errText(e)) });
  return (
    <Modal open onClose={onClose} title={`${rc.requestNo} — ${rc.student.name}`} width="640px"
      footer={<><Button size="sm" variant="ghost" loading={act.isPending} disabled={note.trim().length < 5} onClick={() => go(false)}>Decline</Button><Button size="sm" loading={act.isPending} disabled={note.trim().length < 5 || (!choice && !rc.preferredRoom)} onClick={() => go(true)}>Approve &amp; move</Button></>}>
      <div className="space-y-3 text-[13px]">
        <p className="text-[#5A6577]">{rc.reason}</p>
        <p>Asked for: <b>{rc.preferredRoom ? `${rc.preferredRoom.hostel.code}/${rc.preferredRoom.roomNo}` : 'any room'}</b>. Choose a bed below{rc.preferredRoom ? ', or leave it to use the requested room' : ''}.</p>
        <RoomChooser studentId={rc.student.id} value={choice} onChange={setChoice} />
        <Input label="Note to the student (required)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}


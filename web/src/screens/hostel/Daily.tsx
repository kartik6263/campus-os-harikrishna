import { useEffect, useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { downloadCSV } from '../../lib/export';
import {
  COMPLAINT_LABEL, COMPLAINT_STYLE, LEAVE_LABEL, LEAVE_STYLE, PRIORITY_STYLE, post, useComplaints, useHostelAction, useLeaves, useOverview,
  useResidents, useRollCall, useVisitors, when, type Complaint, type ComplaintStatus, type Leave, type Priority,
} from '../../lib/hostel';
import { api } from '../../lib/api';
import { HostelPicker, Panel, Pill, Th, errText, useDebounced, useHostelRole } from './common';

// ─── Complaints ──────────────────────────────────────────────────────────────

export function ComplaintsTab() {
  const overview = useOverview();
  const { canOps } = useHostelRole();
  const [hostelId, setHostelId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const q = useComplaints({ hostelId: hostelId || undefined, status: status || undefined });
  const [open, setOpen] = useState<Complaint | null>(null);
  const rows = q.data ?? [];
  const rated = rows.filter((c) => c.rating);
  return (
    <div className="space-y-3">
      <Panel action={
        <div className="flex flex-wrap items-end gap-3 w-full">
          <HostelPicker hostels={overview.data?.hostels ?? []} value={hostelId} onChange={setHostelId} all />
          <div className="w-44"><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">Not yet resolved</option><option value="RESOLVED">Resolved, awaiting student</option><option value="CLOSED">Closed</option><option value="">All</option></Select></div>
          <div className="flex-1" />
          {rated.length > 0 && <span className="text-[12px] text-[#5A6577]">Students' rating: {(rated.reduce((t, c) => t + c.rating!, 0) / rated.length).toFixed(1)} / 5 over {rated.length}</span>}
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('hostel-complaints', rows.map((c) => ({ ticket: c.ticketNo, hostel: c.hostel?.code ?? '', room: c.room?.roomNo ?? '', student: c.student?.name ?? '', category: c.category, priority: c.priority, status: c.status, raised: c.createdAt.slice(0, 16), dueBy: c.dueBy.slice(0, 16), overdue: c.overdue ? 'yes' : '', assignedTo: c.assignedTo ?? '', response: c.response ?? '', rating: c.rating ?? '', reopened: c.reopened })))}>Export CSV</Button>
        </div>
      }>
        {q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No complaints here" description="Residents raise complaints from Hostel in their portal." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Ticket</Th><Th>Raised by</Th><Th>What</Th><Th>Priority</Th><Th>Due</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{rows.map((c) => (
                <tr key={c.id} className={`border-b border-[#EDEFF3] align-top ${c.overdue ? 'bg-[#FFF5F5]' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[12px]">{c.ticketNo}<p className="font-sans text-[11px] text-[#5A6577]">{when(c.createdAt)}</p></td>
                  <td className="px-3 py-2.5">{c.student?.name}<p className="text-[11px] text-[#5A6577]">{c.hostel?.code}{c.room ? `/${c.room.roomNo}` : ' (common area)'}</p></td>
                  <td className="px-3 py-2.5 max-w-[320px]"><p className="font-medium text-[#16264A]">{c.category}</p><p className="text-[12px] text-[#5A6577]">{c.description}</p>{c.reopened > 0 && <p className="text-[11px] text-[#A8242C]">Reopened {c.reopened}× — {c.feedback}</p>}</td>
                  <td className={`px-3 py-2.5 text-[12px] ${PRIORITY_STYLE[c.priority]}`}>{c.priority.toLowerCase()}</td>
                  <td className={`px-3 py-2.5 text-[12px] whitespace-nowrap ${c.overdue ? 'text-[#A8242C] font-semibold' : ''}`}>{when(c.dueBy)}{c.overdue ? ' · overdue' : ''}</td>
                  <td className="px-3 py-2.5"><Pill className={COMPLAINT_STYLE[c.status]}>{COMPLAINT_LABEL[c.status]}</Pill>{c.assignedTo && <p className="text-[11px] text-[#5A6577] mt-1">{c.assignedTo}</p>}{c.rating && <p className="text-[11px] mt-1">{'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)}</p>}</td>
                  <td className="px-3 py-2.5 text-right">{canOps && c.status !== 'CLOSED' && <Button size="sm" onClick={() => setOpen(c)}>{c.status === 'RESOLVED' ? 'Close' : 'Update'}</Button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-[12px] text-[#5A6577]">Deadlines: urgent 24 h, high 48 h, normal 72 h, low 7 days. Ragging, security and medical complaints are always urgent. A student who is not satisfied can reopen a resolved complaint.</p>
      {open && <UpdateComplaint c={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function UpdateComplaint({ c, onClose }: { c: Complaint; onClose: () => void }) {
  const [assignedTo, setAssignedTo] = useState(c.assignedTo ?? '');
  const [response, setResponse] = useState(c.response ?? '');
  const [priority, setPriority] = useState<Priority>(c.priority);
  const act = useHostelAction((status: ComplaintStatus) => post(`/complaints/${c.id}/update`, { status, assignedTo: assignedTo.trim(), response: response.trim(), priority }));
  const go = (status: ComplaintStatus) => act.mutate(status, { onSuccess: () => { toast.success(`${c.ticketNo}: ${COMPLAINT_LABEL[status].toLowerCase()} — the student is told`); onClose(); }, onError: (e) => toast.error(errText(e)) });
  return (
    <Modal open onClose={onClose} title={`${c.ticketNo} — ${c.category}`} width="560px"
      footer={c.status === 'RESOLVED'
        ? <><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={act.isPending} onClick={() => go('CLOSED')}>Close without the student's rating</Button></>
        : <><Button size="sm" variant="secondary" loading={act.isPending} disabled={!assignedTo.trim()} onClick={() => go('ASSIGNED')}>Assign</Button><Button size="sm" variant="secondary" loading={act.isPending} onClick={() => go('IN_PROGRESS')}>In progress</Button><Button size="sm" loading={act.isPending} disabled={!response.trim()} onClick={() => go('RESOLVED')}>Resolve</Button></>}>
      <div className="space-y-3 text-[13px]">
        <p className="text-[#5A6577]">{c.description}</p>
        <p>Raised by {c.student?.name}, {c.hostel?.code}{c.room ? `/${c.room.roomNo}` : ''}, {when(c.createdAt)} · due {when(c.dueBy)}</p>
        {c.status !== 'RESOLVED' && <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Assigned to" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="e.g. Electrician — Mohan" />
            <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => <option key={p} value={p}>{p.toLowerCase()}</option>)}</Select>
          </div>
          <Input label="Note to the student (needed to resolve)" value={response} onChange={(e) => setResponse(e.target.value)} placeholder="What was done" />
        </>}
        {c.status === 'RESOLVED' && <InlineAlert type="info">Resolved {when(c.resolvedAt)}: {c.response}. The student is asked to rate it or reopen it; you can close it now if they have not.</InlineAlert>}
      </div>
    </Modal>
  );
}

// ─── Leave, gate passes and the gate ─────────────────────────────────────────

export function LeaveTab() {
  const overview = useOverview();
  const { canOps } = useHostelRole();
  const [hostelId, setHostelId] = useState('');
  const [status, setStatus] = useState('PENDING');
  const q = useLeaves({ hostelId: hostelId || undefined, status: status || undefined });
  const [open, setOpen] = useState<Leave | null>(null);
  const gate = useHostelAction(({ id, event }: { id: string; event: 'OUT' | 'IN' }) => post<{ late: boolean }>(`/leaves/${id}/gate`, { event }));
  const [passNo, setPassNo] = useState('');
  const [found, setFound] = useState<Leave | null>(null);
  const rows = q.data ?? [];

  async function lookup() {
    try { setFound(await api<Leave>(`/api/hostel/passes/${encodeURIComponent(passNo.trim().toUpperCase())}`)); } catch (e) { setFound(null); toast.error(errText(e)); }
  }
  function doGate(l: Leave, event: 'OUT' | 'IN') {
    gate.mutate({ id: l.id, event }, {
      onSuccess: (r) => { toast.success(event === 'OUT' ? `${l.student?.name ?? 'Student'} out on ${l.passNo}` : `${l.student?.name ?? 'Student'} back${r.late ? ' — LATE, recorded' : ''}`); setFound(null); setPassNo(''); },
      onError: (e) => toast.error(errText(e)),
    });
  }
  const where = (l: Leave) => l.student?.hostelAllotments[0] ? `${l.student.hostelAllotments[0].room.hostel.code}/${l.student.hostelAllotments[0].room.roomNo}` : '—';

  return (
    <div className="space-y-4">
      {canOps && (
        <Panel title="At the gate">
          <div className="p-4 flex flex-wrap items-end gap-3">
            <div className="w-56"><Input label="Pass number" value={passNo} onChange={(e) => setPassNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && passNo.trim() && void lookup()} placeholder="GP/2026/000012" /></div>
            <Button size="sm" disabled={!passNo.trim()} onClick={() => void lookup()}>Find pass</Button>
            {found && (
              <div className="flex-1 min-w-[280px] border border-[#D3D8E0] rounded-[4px] px-3 py-2 flex items-center justify-between gap-3">
                <div className="text-[13px]"><p><b>{found.student?.name}</b> · {where(found)} · <Pill className={LEAVE_STYLE[found.status]}>{LEAVE_LABEL[found.status]}</Pill></p><p className="text-[12px] text-[#5A6577]">{when(found.leaveFrom)} → {when(found.leaveTo)} · {found.destination}</p></div>
                {found.status === 'APPROVED' && <Button size="sm" loading={gate.isPending} onClick={() => doGate(found, 'OUT')}>Let out</Button>}
                {found.status === 'OUT' && <Button size="sm" loading={gate.isPending} onClick={() => doGate(found, 'IN')}>Mark back in</Button>}
              </div>
            )}
          </div>
        </Panel>
      )}
      <Panel action={
        <div className="flex flex-wrap items-end gap-3 w-full">
          <HostelPicker hostels={overview.data?.hostels ?? []} value={hostelId} onChange={setHostelId} all />
          <div className="w-52"><Select label="Showing" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">With the warden</option><option value="AWAITING_PARENT">Awaiting parent</option><option value="APPROVED">Approved, not yet out</option><option value="OUT">Out now</option><option value="OVERDUE">Overdue returns</option><option value="RETURNED">Returned</option><option value="">All</option>
          </Select></div>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('hostel-leave', rows.map((l) => ({ pass: l.passNo, kind: l.kind, student: l.student?.name ?? '', room: where(l), from: l.leaveFrom.slice(0, 16), to: l.leaveTo.slice(0, 16), destination: l.destination, status: l.status, parent: l.parentConsent, out: l.outAt?.slice(0, 16) ?? '', back: l.returnedAt?.slice(0, 16) ?? '', late: l.lateReturn ? 'yes' : '' })))}>Export CSV</Button>
        </div>
      }>
        {q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="Nothing here" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Pass</Th><Th>Student</Th><Th>When</Th><Th>Where &amp; why</Th><Th>Parent</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{rows.map((l) => (
                <tr key={l.id} className={`border-b border-[#EDEFF3] align-top ${l.overdue ? 'bg-[#FFF5F5]' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[12px]">{l.passNo}<p className="font-sans text-[11px] text-[#5A6577]">{l.kind === 'LEAVE' ? 'Leave' : 'Gate pass'}</p></td>
                  <td className="px-3 py-2.5">{l.student?.name}<p className="text-[11px] text-[#5A6577]">{where(l)}{l.student?.mobile ? ` · ${l.student.mobile}` : ''}</p></td>
                  <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">{when(l.leaveFrom)}<p>→ {when(l.leaveTo)}</p>{l.outAt && <p className="text-[#5A6577]">out {when(l.outAt)}</p>}{l.returnedAt && <p className={l.lateReturn ? 'text-[#A8242C]' : 'text-[#5A6577]'}>back {when(l.returnedAt)}{l.lateReturn ? ' (late)' : ''}</p>}</td>
                  <td className="px-3 py-2.5 text-[12px] max-w-[260px]">{l.destination}<p className="text-[#5A6577]">{l.reason}</p></td>
                  <td className="px-3 py-2.5 text-[12px]">{l.parentConsent === 'NOT_REQUIRED' ? '—' : l.parentConsent.toLowerCase()}{l.parentNote ? <p className="text-[#5A6577]">“{l.parentNote}”</p> : null}</td>
                  <td className="px-3 py-2.5"><Pill className={LEAVE_STYLE[l.status]}>{l.overdue ? 'Overdue' : LEAVE_LABEL[l.status]}</Pill></td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {canOps && l.status === 'PENDING' && <Button size="sm" onClick={() => setOpen(l)}>Decide</Button>}
                    {canOps && l.status === 'APPROVED' && <Button size="sm" variant="secondary" loading={gate.isPending} onClick={() => doGate(l, 'OUT')}>Let out</Button>}
                    {canOps && l.status === 'OUT' && <Button size="sm" variant="secondary" loading={gate.isPending} onClick={() => doGate(l, 'IN')}>Back in</Button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      {open && <DecideLeave l={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DecideLeave({ l, onClose }: { l: Leave; onClose: () => void }) {
  const [note, setNote] = useState('');
  const act = useHostelAction((approve: boolean) => post(`/leaves/${l.id}/decide`, { approve, ...(note.trim() ? { note: note.trim() } : {}) }));
  const go = (approve: boolean) => act.mutate(approve, { onSuccess: () => { toast.success(approve ? `${l.passNo} approved` : `${l.passNo} not approved`); onClose(); }, onError: (e) => toast.error(errText(e)) });
  return (
    <Modal open onClose={onClose} title={`${l.kind === 'LEAVE' ? 'Leave' : 'Gate pass'} ${l.passNo} — ${l.student?.name}`}
      footer={<><Button size="sm" variant="ghost" loading={act.isPending} disabled={note.trim().length < 5} onClick={() => go(false)}>Do not approve</Button><Button size="sm" loading={act.isPending} onClick={() => go(true)}>Approve</Button></>}>
      <div className="space-y-2 text-[13px]">
        <p>{when(l.leaveFrom)} → {when(l.leaveTo)}</p>
        <p>To <b>{l.destination}</b>: {l.reason}</p>
        {l.parentConsent === 'GIVEN' && <InlineAlert type="success">The parent consented{l.parentNote ? `: “${l.parentNote}”` : ''}.</InlineAlert>}
        <Input label="Note to the student (required if not approving)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Return by 8 pm" />
      </div>
    </Modal>
  );
}

// ─── Visitors ────────────────────────────────────────────────────────────────

const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export function VisitorsTab() {
  const overview = useOverview();
  const { canOps } = useHostelRole();
  const [hostelId, setHostelId] = useState('');
  const [view, setView] = useState<'inside' | 'day'>('inside');
  const [date, setDate] = useState(todayIst());
  const q = useVisitors({ hostelId: hostelId || undefined, ...(view === 'inside' ? { inside: 'true' } : { date }) });
  const out = useHostelAction((id: string) => post(`/visitors/${id}/out`));
  const [adding, setAdding] = useState(false);
  const rows = q.data ?? [];
  return (
    <Panel action={
      <div className="flex flex-wrap items-end gap-3 w-full">
        <HostelPicker hostels={overview.data?.hostels ?? []} value={hostelId} onChange={setHostelId} all />
        <div className="w-40"><Select label="Showing" value={view} onChange={(e) => setView(e.target.value as 'inside' | 'day')}><option value="inside">Inside now</option><option value="day">A day's register</option></Select></div>
        {view === 'day' && <div className="w-40"><Input label="Date" type="date" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} /></div>}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV(`visitors-${view === 'day' ? date : 'inside'}`, rows.map((v) => ({ hostel: v.hostel.code, visitor: v.visitorName, relation: v.relation, phone: v.phone, idProof: v.idProof ?? '', visiting: v.student.name, purpose: v.purpose, in: v.inAt.slice(0, 16), out: v.outAt?.slice(0, 16) ?? '', recordedBy: v.recordedBy })))}>Export CSV</Button>
        {canOps && <Button size="sm" onClick={() => setAdding(true)}>+ Sign in a visitor</Button>}
      </div>
    }>
      {q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title={view === 'inside' ? 'No visitor is inside' : 'No visitors that day'} /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Visitor</Th><Th>Visiting</Th><Th>Purpose</Th><Th>In</Th><Th>Out</Th></tr></thead>
          <tbody>{rows.map((v) => (
            <tr key={v.id} className="border-b border-[#EDEFF3]">
              <td className="px-3 py-2.5">{v.visitorName}<p className="text-[11px] text-[#5A6577]">{v.relation} · {v.phone}{v.idProof ? ` · ${v.idProof}` : ''}</p></td>
              <td className="px-3 py-2.5">{v.student.name}<p className="text-[11px] text-[#5A6577]">{v.hostel.code}</p></td>
              <td className="px-3 py-2.5 text-[12px]">{v.purpose}</td>
              <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">{when(v.inAt)}<p className="text-[11px] text-[#5A6577]">{v.recordedBy}</p></td>
              <td className="px-3 py-2.5 text-[12px]">{v.outAt ? when(v.outAt) : canOps ? <Button size="sm" variant="secondary" loading={out.isPending} onClick={() => out.mutate(v.id, { onSuccess: () => toast.success(`${v.visitorName} signed out`), onError: (e) => toast.error(errText(e)) })}>Sign out</Button> : 'Inside'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {adding && <AddVisitor onClose={() => setAdding(false)} />}
    </Panel>
  );
}

function AddVisitor({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const residents = useResidents({ q: search.length >= 2 ? search : undefined, status: 'ACTIVE' });
  const [studentId, setStudentId] = useState('');
  const [f, setF] = useState({ visitorName: '', relation: '', phone: '', idProof: '', purpose: '' });
  const add = useHostelAction(() => post('/visitors', { studentId, visitorName: f.visitorName.trim(), relation: f.relation.trim(), phone: f.phone.trim(), purpose: f.purpose.trim(), ...(f.idProof.trim() ? { idProof: f.idProof.trim() } : {}) }));
  const picked = residents.data?.find((r) => r.student.id === studentId);
  const valid = studentId && f.visitorName.trim().length >= 2 && f.relation.trim().length >= 2 && /^[0-9+\- ]{10,20}$/.test(f.phone.trim()) && f.purpose.trim().length >= 3;
  return (
    <Modal open onClose={onClose} title="Sign in a visitor" width="560px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={add.isPending} disabled={!valid} onClick={() => add.mutate(undefined, { onSuccess: () => { toast.success(`${f.visitorName} signed in`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Sign in</Button></>}>
      <div className="space-y-3">
        {picked ? (
          <div className="flex items-center justify-between border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px]"><span>Visiting <b>{picked.student.name}</b>, {picked.room.hostel.code}/{picked.room.roomNo}</span><button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => setStudentId('')}>Change</button></div>
        ) : (
          <>
            <Input label="Resident being visited" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number or room" />
            {search.length >= 2 && (residents.isLoading ? <Spinner /> : (
              <div className="max-h-40 overflow-y-auto divide-y divide-[#EDEFF3]">{(residents.data ?? []).map((r) => <button key={r.id} onClick={() => setStudentId(r.student.id)} className="w-full text-left px-2 py-1.5 hover:bg-[#FEF9EC] cursor-pointer text-[13px]">{r.student.name} <span className="text-[11px] text-[#5A6577]">{r.room.hostel.code}/{r.room.roomNo}</span></button>)}{(residents.data ?? []).length === 0 && <p className="text-[12px] text-[#5A6577] p-2">No resident matches.</p>}</div>
            ))}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Visitor's name" value={f.visitorName} onChange={(e) => setF({ ...f, visitorName: e.target.value })} />
          <Input label="Relation" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="Mother, brother, friend…" />
          <Input label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Input label="ID seen (optional)" value={f.idProof} onChange={(e) => setF({ ...f, idProof: e.target.value })} placeholder="e.g. Aadhaar, last 4: 4321" />
          <div className="col-span-2"><Input label="Purpose" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Night roll call ─────────────────────────────────────────────────────────

type Mark = 'PRESENT' | 'ABSENT' | 'ON_LEAVE';

export function RollCallTab() {
  const overview = useOverview();
  const { canOps } = useHostelRole();
  const hostels = (overview.data?.hostels ?? []).filter((h) => h.active);
  const [hostelId, setHostelId] = useState('');
  useEffect(() => { if (!hostelId && hostels[0]) setHostelId(hostels[0].id); }, [hostels, hostelId]);
  const [date, setDate] = useState(todayIst());
  const q = useRollCall(hostelId || null, date);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  useEffect(() => { setMarks(Object.fromEntries((q.data?.residents ?? []).filter((r) => r.status).map((r) => [r.id, r.status!]))); }, [q.data]);
  const save = useHostelAction(() => post<{ marked: number; absent: number }>('/rollcall', { hostelId, date, entries: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })) }));
  const residents = q.data?.residents ?? [];
  const unmarked = residents.filter((r) => !marks[r.id]).length;
  const count = (m: Mark) => Object.values(marks).filter((x) => x === m).length;
  return (
    <Panel action={
      <div className="flex flex-wrap items-end gap-3 w-full">
        <HostelPicker hostels={hostels} value={hostelId} onChange={setHostelId} />
        <div className="w-40"><Input label="Night of" type="date" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex-1" />
        <span className="text-[12px] text-[#5A6577]">{count('PRESENT')} present · {count('ABSENT')} absent · {count('ON_LEAVE')} on leave{unmarked ? ` · ${unmarked} not marked` : ''}</span>
        {canOps && <Button size="sm" variant="secondary" disabled={!residents.length} onClick={() => setMarks(Object.fromEntries(residents.map((r) => [r.id, marks[r.id] ?? (r.pass ? 'ON_LEAVE' : 'PRESENT')])))}>Mark the rest present</Button>}
        {canOps && <Button size="sm" loading={save.isPending} disabled={!residents.length || unmarked > 0} onClick={() => save.mutate(undefined, { onSuccess: (r) => toast.success(`Roll call saved: ${r.marked} marked${r.absent ? `, ${r.absent} absent — they have been notified` : ''}`), onError: (e) => toast.error(errText(e)) })}>Save roll call</Button>}
      </div>
    }>
      {!hostelId ? <div className="p-6"><EmptyState title="Add a hostel first" /></div> : q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : residents.length === 0 ? <div className="p-6"><EmptyState title="No residents that night" /></div> : (
        <>
          {q.data?.marked && <div className="px-4 pt-3"><InlineAlert type="info">This night has already been marked; saving again corrects it.</InlineAlert></div>}
          <div className="divide-y divide-[#EDEFF3]">
            {residents.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2">
                <span className="font-mono text-[12px] w-16 text-[#5A6577]">{r.room}-{r.bed}</span>
                <div className="flex-1 min-w-0"><p className="text-[13px] text-[#16264A]">{r.name}</p>{r.pass && <p className="text-[11px] text-blue-700">Away on {r.pass}</p>}</div>
                <div className="flex rounded-[4px] overflow-hidden border border-[#D3D8E0]">
                  {(['PRESENT', 'ABSENT', 'ON_LEAVE'] as const).map((m) => (
                    <button key={m} disabled={!canOps} onClick={() => setMarks({ ...marks, [r.id]: m })} className={`px-2.5 py-1 text-[11px] cursor-pointer disabled:cursor-default ${marks[r.id] === m ? (m === 'PRESENT' ? 'bg-[#0E7A5F] text-white' : m === 'ABSENT' ? 'bg-[#A8242C] text-white' : 'bg-blue-600 text-white') : 'text-[#5A6577] hover:bg-[#EDEFF3]'}`}>{m === 'ON_LEAVE' ? 'Leave' : m[0] + m.slice(1).toLowerCase()}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}


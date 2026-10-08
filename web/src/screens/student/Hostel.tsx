import { useState } from 'react';
import type { Module } from '../StudentPortal';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { downloadPdf } from '../../lib/export';
import {
  COMPLAINT_LABEL, COMPLAINT_STYLE, DAYS, GENDER_LABEL, LEAVE_LABEL, LEAVE_STYLE, day, fromLocal, localNow, post, rupees, useHostelAction, useMyHostel, when,
  type Complaint, type Leave, type MyHostel,
} from '../../lib/hostel';

interface Props { onNavigate: (m: Module | null) => void }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const TABS = [['room', 'My room'], ['mess', 'Mess'], ['leave', 'Leave / gate pass'], ['complaints', 'Complaints'], ['dues', 'Dues']] as const;
type Tab = (typeof TABS)[number][0];

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>{action}</div>
      <div className="bg-white border-t border-b border-[#D3D8E0]">{children}</div>
    </div>
  );
}

/**
 * The student's hostel: apply for a place, then — once allotted — the room,
 * roommates and rules, the mess menu, gate passes and leave (with the
 * parent's consent where it applies), complaints with a deadline and a
 * rating, a room change, and the hostel's charges on the fee account.
 */
export default function Hostel({ onNavigate }: Props) {
  const q = useMyHostel();
  const [tab, setTab] = useState<Tab>('room');
  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError || !q.data) return <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div>;
  const d = q.data;

  if (!d.allotment) return <NotResident d={d} />;
  const a = d.allotment;
  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-[#16264A] px-4 py-4 text-white">
        <p className="text-[12px] text-white/60">{a.hostel.name}</p>
        <p className="text-[20px] font-bold">Room {a.room.roomNo} · Bed {a.bed}</p>
        <p className="text-[12px] text-white/70 font-mono">{a.allotmentNo} · {a.academicYear}{a.checkedInAt ? ` · checked in ${day(a.checkedInAt)}` : ' · not yet checked in — report to the warden'}</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] flex overflow-x-auto">
        {TABS.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 px-4 py-3 text-[13px] font-medium cursor-pointer border-b-2 ${tab === id ? 'border-[#E0952A] text-[#16264A]' : 'border-transparent text-[#5A6577]'}`}>{label}</button>)}
      </div>
      {tab === 'room' && <RoomTab d={d} />}
      {tab === 'mess' && <MessTab d={d} />}
      {tab === 'leave' && <LeaveTab d={d} />}
      {tab === 'complaints' && <ComplaintsTab d={d} />}
      {tab === 'dues' && <DuesTab d={d} onFees={() => onNavigate('fee')} />}
    </div>
  );
}

// ─── Not yet a resident ──────────────────────────────────────────────────────

function NotResident({ d }: { d: MyHostel }) {
  const [applying, setApplying] = useState(false);
  const open = d.applications.find((x) => x.status === 'PENDING' || x.status === 'WAITLISTED');
  const cancel = useHostelAction((id: string) => post(`/me/applications/${id}/cancel`));
  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4">
        <h1 className="text-[18px] font-bold text-[#16264A]">Hostel</h1>
        <p className="text-[13px] text-[#5A6577] mt-0.5">You do not have a hostel room{open ? ' yet' : ''}.</p>
      </div>
      {open && (
        <Section label="Your application">
          <div className="px-4 py-3">
            <p className="text-[14px] font-semibold text-[#16264A]">{open.applicationNo} · {open.status === 'WAITLISTED' ? 'Waitlisted' : 'In the queue'}</p>
            <p className="text-[12px] text-[#5A6577]">Applied {day(open.createdAt)} · priority score {open.priorityScore}{open.preferredHostel ? ` · prefers ${open.preferredHostel.name}` : ''}</p>
            {open.decisionNote && <p className="text-[12px] text-[#5A6577] mt-1">Office: {open.decisionNote}</p>}
            <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(open.id, { onSuccess: () => toast.success('Application withdrawn'), onError: (e) => toast.error(errText(e)) })}>Withdraw application</Button>
          </div>
        </Section>
      )}
      <Section label="Hostels you can apply to">
        {d.hostels.length === 0 ? <div className="p-4"><EmptyState title="No hostel is open to you" /></div> : d.hostels.map((h) => (
          <div key={h.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold text-[#16264A]">{h.name}</p>
                <p className="text-[12px] text-[#5A6577]">{GENDER_LABEL[h.gender]} · {h.roomTypes.map((n) => `${n}-bed`).join(', ') || 'no rooms open'}{h.rentFrom !== null ? ` · rent ${rupees(h.rentFrom)}${h.rentTo !== h.rentFrom ? `–${rupees(h.rentTo!)}` : ''}/semester` : ''}{h.messRatePerMonth ? ` · mess ${rupees(h.messRatePerMonth)}/month` : ''}</p>
                {h.amenities.length > 0 && <p className="text-[11px] text-[#5A6577] mt-0.5">{h.amenities.join(' · ')}</p>}
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${h.vacantBeds ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{h.vacantBeds} free</span>
            </div>
          </div>
        ))}
      </Section>
      {!open && d.student.onRolls && <div className="px-4 mt-3"><Button onClick={() => setApplying(true)} disabled={d.hostels.length === 0}>Apply for a hostel room</Button></div>}
      {!d.student.onRolls && <div className="px-4 mt-3"><InlineAlert type="info">Only students on the rolls can apply.</InlineAlert></div>}
      {d.applications.filter((x) => x !== open).length > 0 && (
        <Section label="Past applications">
          {d.applications.filter((x) => x !== open).map((x) => <p key={x.id} className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3] last:border-0"><span className="font-mono">{x.applicationNo}</span> · {x.status.toLowerCase()} · {day(x.createdAt)}{x.decisionNote ? ` — ${x.decisionNote}` : ''}</p>)}
        </Section>
      )}
      {applying && <ApplyModal d={d} onClose={() => setApplying(false)} />}
    </div>
  );
}

function ApplyModal({ d, onClose }: { d: MyHostel; onClose: () => void }) {
  const [f, setF] = useState({ preferredHostelId: '', roomPreference: 'ANY', distanceKm: '', specialNeeds: '', reason: '' });
  const apply = useHostelAction(() => post<{ applicationNo: string }>('/me/applications', { ...(f.preferredHostelId ? { preferredHostelId: f.preferredHostelId } : {}), roomPreference: f.roomPreference, distanceKm: Number(f.distanceKm), ...(f.specialNeeds.trim() ? { specialNeeds: f.specialNeeds.trim() } : {}), reason: f.reason.trim() }));
  const valid = f.distanceKm !== '' && Number(f.distanceKm) >= 0 && f.reason.trim().length >= 10;
  return (
    <Modal open onClose={onClose} title="Apply for a hostel room"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={apply.isPending} disabled={!valid} onClick={() => apply.mutate(undefined, { onSuccess: (r) => { toast.success(`Application ${r.applicationNo} sent to the hostel office`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Apply</Button></>}>
      <div className="space-y-3">
        <Select label="Preferred hostel" value={f.preferredHostelId} onChange={(e) => setF({ ...f, preferredHostelId: e.target.value })}><option value="">No preference</option>{d.hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
        <Select label="Room" value={f.roomPreference} onChange={(e) => setF({ ...f, roomPreference: e.target.value })}><option value="ANY">Any</option><option value="SINGLE">Single</option><option value="DOUBLE">Double</option><option value="TRIPLE">Triple</option><option value="DORM">Dormitory</option></Select>
        <Input label="Distance from home (km)" type="number" min={0} value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value })} />
        <Input label="Medical or disability need (optional)" value={f.specialNeeds} onChange={(e) => setF({ ...f, specialNeeds: e.target.value })} placeholder="e.g. Needs a ground-floor room" />
        <Input label="Why you need a hostel room" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <p className="text-[12px] text-[#5A6577]">Places go by priority: distance from home, reserved category, and any medical or disability need.</p>
      </div>
    </Modal>
  );
}

// ─── Room ────────────────────────────────────────────────────────────────────

function RoomTab({ d }: { d: MyHostel }) {
  const a = d.allotment!;
  const [asking, setAsking] = useState(false);
  const openChange = d.roomChanges.find((r) => r.status === 'PENDING');
  const cancel = useHostelAction((id: string) => post(`/me/room-change/${id}/cancel`));
  return (
    <>
      <Section label="Room">
        <div className="px-4 py-3 grid grid-cols-2 gap-y-2 text-[13px]">
          {[['Hostel', a.hostel.name], ['Room / bed', `${a.room.roomNo} / ${a.bed}`], ['Floor', a.room.floor === 0 ? 'Ground' : String(a.room.floor)], ['Type', `${a.room.capacity}-bed${a.room.ac ? ', AC' : ''}${a.room.attachedBath ? ', attached bath' : ''}`], ['Rent', `${rupees(a.room.rentPerSemester)} / semester`], ['Allotted', day(a.allottedAt)]].map(([l, v]) => (
            <div key={l}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[#16264A]">{v}</p></div>
          ))}
        </div>
        {a.room.amenities.length > 0 && <p className="px-4 pb-3 text-[12px] text-[#5A6577]">In the room: {a.room.amenities.join(', ')}</p>}
      </Section>
      <Section label="Roommates">
        {a.roommates.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#5A6577]">No one else at the moment.</p> : a.roommates.map((m) => <p key={m.bed} className="px-4 py-2.5 text-[13px] border-b border-[#EDEFF3] last:border-0"><b>{m.name}</b> <span className="text-[#5A6577]">· bed {m.bed} · {m.programme}</span></p>)}
      </Section>
      <Section label="Warden & building">
        <div className="px-4 py-3 text-[13px] space-y-1">
          {a.hostel.wardenName && <p>Warden: <b>{a.hostel.wardenName}</b>{a.hostel.wardenPhone && <> · <a className="text-[#E0952A]" href={`tel:${a.hostel.wardenPhone.replace(/\s/g, '')}`}>{a.hostel.wardenPhone}</a></>}</p>}
          {a.hostel.address && <p className="text-[#5A6577]">{a.hostel.address}</p>}
          {a.hostel.amenities.length > 0 && <p className="text-[#5A6577]">Facilities: {a.hostel.amenities.join(', ')}</p>}
          {a.hostel.rules && <p className="text-[#16264A] whitespace-pre-line pt-1">{a.hostel.rules}</p>}
        </div>
      </Section>
      {d.absences.length > 0 && (
        <Section label="Marked absent at night roll call">
          {d.absences.map((x) => <p key={x.date} className="px-4 py-2 text-[12px] text-[#A8242C] border-b border-[#EDEFF3] last:border-0">{day(x.date)} · marked by {x.markedBy} — if you were out on a pass, ask the warden to correct it</p>)}
        </Section>
      )}
      <Section label="Room change" action={!openChange ? <button onClick={() => setAsking(true)} className="text-[12px] text-[#E0952A] font-medium cursor-pointer">Ask to move</button> : undefined}>
        {openChange ? (
          <div className="px-4 py-3">
            <p className="text-[13px] text-[#16264A]"><span className="font-mono">{openChange.requestNo}</span> · with the hostel office{openChange.preferredRoom ? ` · asked for room ${openChange.preferredRoom.roomNo}` : ''}</p>
            <p className="text-[12px] text-[#5A6577]">{openChange.reason}</p>
            <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(openChange.id, { onSuccess: () => toast.success('Request withdrawn'), onError: (e) => toast.error(errText(e)) })}>Withdraw request</Button>
          </div>
        ) : d.roomChanges.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#5A6577]">You can ask to move to another room in your hostel.</p>
          : d.roomChanges.map((r) => <p key={r.id} className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3] last:border-0"><span className="font-mono">{r.requestNo}</span> · {r.status.toLowerCase()}{r.decisionNote ? ` — ${r.decisionNote}` : ''}</p>)}
      </Section>
      {asking && <RoomChangeModal d={d} onClose={() => setAsking(false)} />}
    </>
  );
}

function RoomChangeModal({ d, onClose }: { d: MyHostel; onClose: () => void }) {
  const [roomId, setRoomId] = useState('');
  const [reason, setReason] = useState('');
  const ask = useHostelAction(() => post('/me/room-change', { ...(roomId ? { preferredRoomId: roomId } : {}), reason: reason.trim() }));
  return (
    <Modal open onClose={onClose} title="Ask to change your room"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={ask.isPending} disabled={reason.trim().length < 10} onClick={() => ask.mutate(undefined, { onSuccess: () => { toast.success('Request sent to the hostel office'); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Send request</Button></>}>
      <div className="space-y-3">
        <Select label="Room you would like (optional)" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">Any suitable room</option>
          {d.changeOptions.map((r) => <option key={r.id} value={r.id}>Room {r.roomNo} · floor {r.floor === 0 ? 'G' : r.floor} · {r.capacity}-bed{r.ac ? ', AC' : ''}{r.attachedBath ? ', bath' : ''} · {r.freeBeds} free</option>)}
        </Select>
        {d.changeOptions.length === 0 && <p className="text-[12px] text-[#5A6577]">No other room in your hostel has a free bed right now; the office can still move you when one frees.</p>}
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medical — need the ground floor" />
      </div>
    </Modal>
  );
}

// ─── Mess ────────────────────────────────────────────────────────────────────

function MessTab({ d }: { d: MyHostel }) {
  const today = new Date().getDay();
  const order = [...d.menu].sort((x, y) => ((x.day - today + 7) % 7) - ((y.day - today + 7) % 7));
  return (
    <Section label={`Mess menu — ${d.allotment!.hostel.name}${d.allotment!.hostel.messRatePerMonth ? ` · ${rupees(d.allotment!.hostel.messRatePerMonth)}/month` : ''}`}>
      {order.length === 0 ? <div className="p-4"><EmptyState title="The menu has not been published yet" /></div> : order.map((m) => (
        <div key={m.day} className={`px-4 py-3 border-b border-[#EDEFF3] last:border-0 ${m.day === today ? 'bg-[#FEF9EC]' : ''}`}>
          <p className="text-[13px] font-semibold text-[#16264A]">{DAYS[m.day]}{m.day === today ? ' · today' : ''}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[12px]">
            {([['Breakfast', m.breakfast], ['Lunch', m.lunch], ['Snacks', m.snacks], ['Dinner', m.dinner]] as const).filter(([, v]) => v).map(([l, v]) => <p key={l}><span className="text-[#5A6577]">{l}:</span> <span className="text-[#16264A]">{v}</span></p>)}
          </div>
        </div>
      ))}
    </Section>
  );
}

// ─── Leave and gate passes ───────────────────────────────────────────────────

function LeaveTab({ d }: { d: MyHostel }) {
  const [kind, setKind] = useState<'GATE_PASS' | 'LEAVE' | null>(null);
  const cancel = useHostelAction((id: string) => post(`/me/leaves/${id}/cancel`));

  async function pass(l: Leave) {
    await downloadPdf({
      title: l.kind === 'LEAVE' ? 'Hostel leave pass' : 'Hostel gate pass',
      subtitle: d.allotment!.hostel.name,
      reference: l.passNo,
      fileName: `pass-${l.passNo.replace(/\//g, '-')}`,
      qr: l.passNo,
      sections: [{ fields: [['Student', d.student.name], ['Room', `${d.allotment!.room.roomNo}-${d.allotment!.bed}`], ['Out', when(l.leaveFrom)], ['Back by', when(l.leaveTo)], ['Going to', l.destination], ['Approved by', l.decidedBy ?? '—']] }, { text: ['Show this pass at the gate. The guard looks the number up; it is valid only while the hostel office shows it approved.'] }],
    });
  }

  return (
    <>
      <div className="px-4 mt-3 flex gap-2">
        <Button size="sm" onClick={() => setKind('GATE_PASS')}>Gate pass (same day)</Button>
        <Button size="sm" variant="secondary" onClick={() => setKind('LEAVE')}>Leave (overnight)</Button>
      </div>
      {d.student.parentLinked && <p className="px-4 mt-2 text-[12px] text-[#5A6577]">Leave goes to your parent for consent first, then to the warden. A same-day gate pass goes straight to the warden.</p>}
      <Section label="Your passes">
        {d.leaves.length === 0 ? <div className="p-4"><EmptyState title="No passes yet" /></div> : d.leaves.map((l) => (
          <div key={l.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-[#16264A]">{l.kind === 'LEAVE' ? 'Leave' : 'Gate pass'} · {l.destination}</p>
                <p className="text-[12px] text-[#5A6577]">{when(l.leaveFrom)} → {when(l.leaveTo)}</p>
                <p className="font-mono text-[11px] text-[#5A6577]">{l.passNo}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${LEAVE_STYLE[l.status]}`}>{LEAVE_LABEL[l.status]}</span>
            </div>
            {l.parentNote && <p className="text-[12px] text-[#5A6577] mt-1">Parent: “{l.parentNote}”</p>}
            {l.decisionNote && <p className="text-[12px] text-[#5A6577] mt-1">Warden: {l.decisionNote}</p>}
            <div className="flex gap-2 mt-2">
              {['APPROVED', 'OUT'].includes(l.status) && <Button size="sm" variant="secondary" onClick={() => void pass(l)}>Download pass</Button>}
              {['AWAITING_PARENT', 'PENDING', 'APPROVED'].includes(l.status) && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(l.id, { onSuccess: () => toast.success('Withdrawn'), onError: (e) => toast.error(errText(e)) })}>Withdraw</Button>}
            </div>
          </div>
        ))}
      </Section>
      {kind && <LeaveModal kind={kind} onClose={() => setKind(null)} />}
    </>
  );
}

function LeaveModal({ kind, onClose }: { kind: 'GATE_PASS' | 'LEAVE'; onClose: () => void }) {
  const [from, setFrom] = useState(localNow(30));
  const [to, setTo] = useState(kind === 'GATE_PASS' ? localNow(240) : localNow(60 * 48));
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const apply = useHostelAction(() => post<{ passNo: string; status: string }>('/me/leaves', { kind, from: fromLocal(from), to: fromLocal(to), destination: destination.trim(), reason: reason.trim() }));
  const valid = from && to && new Date(to) > new Date(from) && destination.trim().length >= 2 && reason.trim().length >= 5 && (kind === 'LEAVE' || from.slice(0, 10) === to.slice(0, 10));
  return (
    <Modal open onClose={onClose} title={kind === 'LEAVE' ? 'Apply for leave' : 'Ask for a gate pass'}
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={apply.isPending} disabled={!valid} onClick={() => apply.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.passNo} sent ${r.status === 'AWAITING_PARENT' ? 'to your parent for consent' : 'to the warden'}`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Send</Button></>}>
      <div className="space-y-3">
        <Input label="Going out" type="datetime-local" value={from} min={localNow()} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Back by" type="datetime-local" value={to} min={from} onChange={(e) => setTo(e.target.value)} hint={kind === 'GATE_PASS' ? 'A gate pass is for the same day' : undefined} />
        <Input label="Going to" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={kind === 'LEAVE' ? 'e.g. Home, Indore' : 'e.g. City hospital'} />
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {kind === 'GATE_PASS' && from.slice(0, 10) !== to.slice(0, 10) && <InlineAlert type="warning">This crosses midnight — apply for leave instead.</InlineAlert>}
      </div>
    </Modal>
  );
}

// ─── Complaints ──────────────────────────────────────────────────────────────

function ComplaintsTab({ d }: { d: MyHostel }) {
  const [raising, setRaising] = useState(false);
  const [rating, setRating] = useState<Complaint | null>(null);
  return (
    <>
      <div className="px-4 mt-3"><Button size="sm" onClick={() => setRaising(true)}>Raise a complaint</Button></div>
      <Section label="Your complaints">
        {d.complaints.length === 0 ? <div className="p-4"><EmptyState title="No complaints" /></div> : d.complaints.map((c) => (
          <div key={c.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-[#16264A]">{c.category}{c.priority === 'URGENT' ? ' · urgent' : ''}</p>
                <p className="text-[12px] text-[#5A6577]">{c.description}</p>
                <p className="font-mono text-[11px] text-[#5A6577]">{c.ticketNo} · {when(c.createdAt)}{['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(c.status) ? ` · due ${when(c.dueBy)}` : ''}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${c.overdue ? 'bg-red-100 text-red-700' : COMPLAINT_STYLE[c.status]}`}>{c.overdue ? 'Overdue' : COMPLAINT_LABEL[c.status]}</span>
            </div>
            {c.assignedTo && <p className="text-[12px] text-[#5A6577] mt-1">With {c.assignedTo}</p>}
            {c.response && <p className="text-[12px] text-[#16264A] mt-1">Office: {c.response}</p>}
            {c.rating && <p className="text-[12px] mt-1">{'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)}{c.feedback ? ` — ${c.feedback}` : ''}</p>}
            {c.status === 'RESOLVED' && <Button size="sm" variant="secondary" onClick={() => setRating(c)}>Rate the fix or reopen</Button>}
          </div>
        ))}
      </Section>
      {raising && <RaiseModal categories={d.categories} onClose={() => setRaising(false)} />}
      {rating && <RateModal c={rating} onClose={() => setRating(null)} />}
    </>
  );
}

function RaiseModal({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const [category, setCategory] = useState(categories[0] ?? 'Other');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [inRoom, setInRoom] = useState(true);
  const raise = useHostelAction(() => post<{ ticketNo: string; dueBy: string }>('/me/complaints', { category, description: description.trim(), priority, inRoom }));
  const serious = ['Ragging', 'Security', 'Medical'].includes(category);
  return (
    <Modal open onClose={onClose} title="Raise a complaint"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={raise.isPending} disabled={description.trim().length < 10} onClick={() => raise.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.ticketNo} raised — due by ${when(r.dueBy)}`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Raise</Button></>}>
      <div className="space-y-3">
        <Select label="About" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
        {serious ? <InlineAlert type="warning">{category} complaints are always treated as urgent and reach the warden at once.{category === 'Ragging' ? ' You can also call the national anti-ragging helpline, 1800-180-5522.' : ''}</InlineAlert>
          : <Select label="How urgent" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="LOW">Low — within a week</option><option value="NORMAL">Normal — within 3 days</option><option value="HIGH">High — within 2 days</option><option value="URGENT">Urgent — within a day</option></Select>}
        <Select label="Where" value={inRoom ? 'room' : 'common'} onChange={(e) => setInRoom(e.target.value === 'room')}><option value="room">In my room</option><option value="common">Common area</option></Select>
        <Input label="What is wrong" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}

function RateModal({ c, onClose }: { c: Complaint; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const send = useHostelAction((reopen: boolean) => post(`/me/complaints/${c.id}/feedback`, { reopen, ...(reopen ? {} : { rating }), ...(feedback.trim() ? { feedback: feedback.trim() } : {}) }));
  const go = (reopen: boolean) => send.mutate(reopen, { onSuccess: () => { toast.success(reopen ? 'Reopened — the office has been told' : 'Thank you — complaint closed'); onClose(); }, onError: (e) => toast.error(errText(e)) });
  return (
    <Modal open onClose={onClose} title={`${c.ticketNo} — was it fixed?`}
      footer={<><Button size="sm" variant="ghost" loading={send.isPending} disabled={feedback.trim().length < 5} onClick={() => go(true)}>Not fixed — reopen</Button><Button size="sm" loading={send.isPending} disabled={!rating} onClick={() => go(false)}>Close with rating</Button></>}>
      <div className="space-y-3">
        <p className="text-[13px] text-[#5A6577]">Office: {c.response}</p>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`} className={`text-[28px] cursor-pointer ${n <= rating ? 'text-[#E0952A]' : 'text-[#D3D8E0]'}`}>★</button>)}</div>
        <Input label="Comment (needed to reopen)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
    </Modal>
  );
}

// ─── Dues ────────────────────────────────────────────────────────────────────

function DuesTab({ d, onFees }: { d: MyHostel; onFees: () => void }) {
  const owed = d.dues.reduce((t, x) => t + x.due, 0);
  return (
    <Section label="Hostel charges on your fee account" action={owed ? <button onClick={onFees} className="text-[12px] text-[#E0952A] font-medium cursor-pointer">Pay in Fees ›</button> : undefined}>
      {d.dues.length === 0 ? <div className="p-4"><EmptyState title="No hostel charges yet" description="Room rent is charged each term and the mess bill each month." /></div> : (
        <>
          {d.dues.map((x) => (
            <div key={x.head} className="px-4 py-2.5 border-b border-[#EDEFF3] flex items-center justify-between gap-2 text-[13px]">
              <div><p className="text-[#16264A]">{x.head}</p><p className="text-[11px] text-[#5A6577]">{x.dueDate ? `Due ${day(x.dueDate)}` : ''}</p></div>
              <p className={x.due ? 'text-[#A8242C] font-semibold' : 'text-[#0E7A5F]'}>{x.due ? `${rupees(x.due)} due` : 'Paid'}</p>
            </div>
          ))}
          <p className="px-4 py-2.5 text-[13px] font-semibold text-[#16264A]">{owed ? `${rupees(owed)} outstanding` : 'Nothing outstanding'}</p>
        </>
      )}
    </Section>
  );
}

import { useEffect, useState } from 'react';
import { Button, Checkbox, Drawer, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { downloadCSV } from '../../lib/export';
import {
  GENDER_LABEL, del, patch, post, rupees, useHostelAction, useOverview, useRooms,
  type HostelGender, type HostelSummary, type Room, type RoomStatus,
} from '../../lib/hostel';
import { HostelPicker, Panel, Pill, errText, listOf, useHostelRole } from './common';

// ─── Overview ────────────────────────────────────────────────────────────────

export function OverviewTab({ onGo }: { onGo: (tab: string) => void }) {
  const q = useOverview();
  const { canSetup } = useHostelRole();
  const [editing, setEditing] = useState<HostelSummary | 'new' | null>(null);
  if (q.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (q.isError || !q.data) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  const t = q.data.totals;
  const tiles: Array<[string, string | number, string, string?]> = [
    ['Beds occupied', `${t.occupied} / ${t.beds}`, t.beds ? `${Math.round((t.occupied / t.beds) * 100)}% full` : 'No beds yet', 'residents'],
    ['Applications waiting', t.pendingApplications, `${t.waitlisted} waitlisted`, 'applications'],
    ['Open complaints', t.openComplaints, `${t.overdueComplaints} past their deadline`, 'complaints'],
    ['Leave requests', t.leaveRequests, 'awaiting a decision', 'leave'],
    ['Students out now', t.studentsOut, `${t.overdueReturns} overdue`, 'leave'],
    ['Visitors inside', t.visitorsIn, 'signed in, not out', 'visitors'],
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {tiles.map(([l, v, sub, go]) => (
          <button key={l} onClick={() => go && onGo(go)} className="text-left bg-white border border-[#D3D8E0] rounded-[4px] p-3 hover:border-[#E0952A] cursor-pointer">
            <p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p>
            <p className="text-[22px] font-semibold text-[#16264A] tabular-nums">{v}</p>
            <p className={`text-[11px] ${/overdue|past/.test(sub) && !sub.startsWith('0') ? 'text-[#A8242C]' : 'text-[#5A6577]'}`}>{sub}</p>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[#16264A]">{q.data.hostels.length} hostel{q.data.hostels.length === 1 ? '' : 's'}</p>
        {canSetup && <Button size="sm" onClick={() => setEditing('new')}>+ Add hostel</Button>}
      </div>
      {q.data.hostels.length === 0 ? <EmptyState title="No hostels yet" description={canSetup ? 'Add your first hostel, then its rooms.' : 'The registrar adds hostels and their rooms.'} /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {q.data.hostels.map((h) => {
            const p = h.beds ? Math.round((h.occupied / h.beds) * 100) : 0;
            return (
              <div key={h.id} className={`bg-white border rounded-[4px] p-4 ${h.active ? 'border-[#D3D8E0]' : 'border-dashed border-[#A8242C]/50 opacity-80'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-[#16264A]">{h.name}</p>
                    <p className="text-[12px] text-[#5A6577]"><span className="font-mono">{h.code}</span>{h.wardenName ? ` · Warden ${h.wardenName}` : ''}{h.wardenPhone ? ` · ${h.wardenPhone}` : ''}</p>
                  </div>
                  <Pill className={h.gender === 'BOYS' ? 'bg-blue-100 text-blue-800' : h.gender === 'GIRLS' ? 'bg-pink-100 text-pink-800' : 'bg-violet-100 text-violet-800'}>{GENDER_LABEL[h.gender]}</Pill>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-[12px] mt-3">
                  {[['Rooms', h.rooms], ['Beds', h.beds], ['Vacant', h.vacant], ['Complaints', h.openComplaints]].map(([l, v]) => <div key={String(l)}><p className="text-[#5A6577]">{l}</p><p className="font-semibold text-[#16264A] tabular-nums">{v}</p></div>)}
                </div>
                <div className="h-2 bg-[#EDEFF3] rounded-full overflow-hidden mt-3"><div className="h-full rounded-full" style={{ width: `${p}%`, background: p > 90 ? '#A8242C' : p > 70 ? '#E0952A' : '#0E7A5F' }} /></div>
                <p className="text-[11px] text-[#5A6577] mt-1">{p}% occupied{h.outOfService ? ` · ${h.outOfService} room${h.outOfService === 1 ? '' : 's'} out of service` : ''}{h.messRatePerMonth ? ` · mess ${rupees(h.messRatePerMonth)}/month` : ''}{h.active ? '' : ' · closed'}</p>
                {h.amenities.length > 0 && <p className="text-[11px] text-[#5A6577] mt-2">{h.amenities.join(' · ')}</p>}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="secondary" onClick={() => onGo(`rooms:${h.id}`)}>Rooms</Button>
                  {canSetup && <Button size="sm" variant="ghost" onClick={() => setEditing(h)}>Edit</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <HostelForm hostel={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HostelForm({ hostel, onClose }: { hostel: HostelSummary | null; onClose: () => void }) {
  const [f, setF] = useState({
    code: hostel?.code ?? '', name: hostel?.name ?? '', gender: (hostel?.gender ?? 'BOYS') as HostelGender, address: hostel?.address ?? '',
    wardenName: hostel?.wardenName ?? '', wardenPhone: hostel?.wardenPhone ?? '', amenities: hostel?.amenities.join(', ') ?? '',
    rules: hostel?.rules ?? '', messRatePerMonth: String(hostel?.messRatePerMonth ?? 0), active: hostel?.active ?? true,
  });
  const save = useHostelAction(() => {
    const body = {
      name: f.name.trim(), gender: f.gender, address: f.address.trim() || null, wardenName: f.wardenName.trim() || null, wardenPhone: f.wardenPhone.trim() || '',
      amenities: listOf(f.amenities), rules: f.rules.trim() || null, messRatePerMonth: Number(f.messRatePerMonth) || 0,
    };
    return hostel ? patch(`/hostels/${hostel.id}`, { ...body, active: f.active }) : post('/hostels', { ...body, code: f.code.trim().toUpperCase() });
  });
  const valid = f.name.trim().length >= 3 && (hostel || /^[A-Za-z0-9-]{1,10}$/.test(f.code.trim())) && (!f.wardenPhone.trim() || /^[0-9+\- ]{10,20}$/.test(f.wardenPhone.trim())) && Number(f.messRatePerMonth) >= 0;
  async function submit() {
    try { await save.mutateAsync(undefined); toast.success(hostel ? `${f.name} updated` : `${f.name} added — now add its rooms`); onClose(); } catch (e) { toast.error(errText(e)); }
  }
  return (
    <Modal open onClose={onClose} title={hostel ? `Edit ${hostel.name}` : 'Add a hostel'} width="620px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={save.isPending} disabled={!valid} onClick={() => void submit()}>{hostel ? 'Save' : 'Add hostel'}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} disabled={!!hostel} placeholder="e.g. GH2" hint={hostel ? 'Fixed once created' : 'Prefixes allotment and complaint numbers'} />
        <Select label="For" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as HostelGender })}><option value="BOYS">Boys</option><option value="GIRLS">Girls</option><option value="CO_ED">Co-ed</option></Select>
        <div className="col-span-2"><Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="col-span-2"><Input label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <Input label="Warden" value={f.wardenName} onChange={(e) => setF({ ...f, wardenName: e.target.value })} />
        <Input label="Warden's phone" value={f.wardenPhone} onChange={(e) => setF({ ...f, wardenPhone: e.target.value })} />
        <div className="col-span-2"><Input label="Amenities (comma-separated)" value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} placeholder="Wi-Fi, Gym, Reading room, Laundry, RO water" /></div>
        <Input label="Mess charge per month (₹)" type="number" min={0} value={f.messRatePerMonth} onChange={(e) => setF({ ...f, messRatePerMonth: e.target.value })} />
        {hostel && <div className="flex items-end pb-2"><Checkbox label="Open for residents" checked={f.active} onChange={(v) => setF({ ...f, active: v })} /></div>}
        <label className="col-span-2 flex flex-col gap-1"><span className="text-[13px] font-medium text-[#16264A]">Rules shown to residents</span>
          <textarea rows={3} value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value })} className="px-3 py-2 text-[13px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]" /></label>
      </div>
    </Modal>
  );
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<RoomStatus, string> = { AVAILABLE: 'bg-green-100 text-green-700', MAINTENANCE: 'bg-amber-100 text-amber-800', BLOCKED: 'bg-gray-200 text-gray-600' };

export function RoomsTab({ initialHostel }: { initialHostel: string }) {
  const overview = useOverview();
  const hostels = overview.data?.hostels ?? [];
  const [hostelId, setHostelId] = useState(initialHostel);
  useEffect(() => { if (!hostelId && hostels[0]) setHostelId(hostels[0].id); }, [hostels, hostelId]);
  const rooms = useRooms(hostelId || null);
  const { canSetup } = useHostelRole();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<'one' | 'bulk' | null>(null);
  const [filter, setFilter] = useState<'all' | 'vacant' | 'full' | 'out'>('all');
  const list = (rooms.data ?? []).filter((r) => filter === 'all' || (filter === 'vacant' ? r.status === 'AVAILABLE' && r.occupied < r.capacity : filter === 'full' ? r.occupied >= r.capacity : r.status !== 'AVAILABLE'));
  const floors = [...new Set(list.map((r) => r.floor))].sort((a, b) => a - b);
  const hostel = hostels.find((h) => h.id === hostelId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <HostelPicker hostels={hostels} value={hostelId} onChange={setHostelId} />
        <div className="w-44"><Select label="Show" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All rooms</option><option value="vacant">With a free bed</option><option value="full">Full</option><option value="out">Out of service</option></Select></div>
        <div className="flex-1" />
        {rooms.data && rooms.data.length > 0 && <Button size="sm" variant="secondary" onClick={() => downloadCSV(`rooms-${hostel?.code ?? ''}`, rooms.data!.flatMap((r) => r.beds.map((b) => ({ room: r.roomNo, floor: r.floor, bed: b.bed, status: r.status, ac: r.ac ? 'yes' : '', attachedBath: r.attachedBath ? 'yes' : '', rent: r.rentPerSemester, resident: b.student?.name ?? '', enrolmentNo: b.student?.enrolmentNo ?? '' }))))}>Export beds</Button>}
        {canSetup && hostelId && <><Button size="sm" variant="secondary" onClick={() => setAdding('one')}>+ Room</Button><Button size="sm" onClick={() => setAdding('bulk')}>+ Floors of rooms</Button></>}
      </div>
      {!hostelId ? <EmptyState title="Add a hostel first" /> : rooms.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : rooms.isError ? <InlineAlert type="error">{errText(rooms.error)}</InlineAlert> : (rooms.data ?? []).length === 0 ? (
        <EmptyState title="No rooms yet" description={canSetup ? 'Add rooms one by one, or whole floors at once.' : 'The registrar adds rooms.'} />
      ) : (
        <div className="space-y-4">
          <p className="text-[12px] text-[#5A6577]">Each square is a bed: <span className="inline-block w-3 h-3 align-middle bg-[#0E7A5F] rounded-sm" /> occupied · <span className="inline-block w-3 h-3 align-middle border border-[#0E7A5F] rounded-sm" /> free. Click a room to see who lives there.</p>
          {floors.map((f) => (
            <Panel key={f} title={f === 0 ? 'Ground floor' : `Floor ${f}`}>
              <div className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {list.filter((r) => r.floor === f).map((r) => (
                  <button key={r.id} onClick={() => setOpen(r.id)} className={`text-left border rounded-[4px] p-2 cursor-pointer hover:border-[#E0952A] ${r.status !== 'AVAILABLE' ? 'bg-[#F7F8FA] border-dashed border-[#D3D8E0]' : 'border-[#D3D8E0]'}`}>
                    <div className="flex items-center justify-between"><span className="font-mono text-[13px] font-semibold text-[#16264A]">{r.roomNo}</span>{r.status !== 'AVAILABLE' && <span className="text-[9px] uppercase text-amber-700">{r.status.toLowerCase()}</span>}</div>
                    <div className="flex gap-1 mt-1.5">{r.beds.map((b) => <span key={b.bed} title={b.student ? `${b.bed}: ${b.student.name}` : `${b.bed}: free`} className={`w-3.5 h-3.5 rounded-sm ${b.student ? 'bg-[#0E7A5F]' : 'border border-[#0E7A5F]'}`} />)}</div>
                    <p className="text-[10px] text-[#5A6577] mt-1">{r.ac ? 'AC · ' : ''}{r.attachedBath ? 'Bath · ' : ''}{rupees(r.rentPerSemester)}</p>
                  </button>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {open && rooms.data && <RoomDrawer room={rooms.data.find((r) => r.id === open)!} onClose={() => setOpen(null)} />}
      {adding === 'one' && hostelId && <AddRoom hostelId={hostelId} onClose={() => setAdding(null)} />}
      {adding === 'bulk' && hostelId && <AddFloors hostelId={hostelId} onClose={() => setAdding(null)} />}
    </div>
  );
}

function RoomDrawer({ room, onClose }: { room: Room | undefined; onClose: () => void }) {
  const { canSetup, canOps } = useHostelRole();
  const [f, setF] = useState(() => ({ capacity: String(room?.capacity ?? 1), rent: String(room?.rentPerSemester ?? 0), amenities: room?.amenities.join(', ') ?? '', ac: room?.ac ?? false, bath: room?.attachedBath ?? false, notes: room?.notes ?? '' }));
  const save = useHostelAction((body: Record<string, unknown>) => patch(`/rooms/${room!.id}`, body));
  const remove = useHostelAction(() => del(`/rooms/${room!.id}`));
  const checkIn = useHostelAction((id: string) => post(`/allotments/${id}/check-in`));
  if (!room) return null;
  async function run(body: Record<string, unknown>, ok: string) {
    try { await save.mutateAsync(body); toast.success(ok); } catch (e) { toast.error(errText(e)); }
  }
  return (
    <Drawer open onClose={onClose} title={`Room ${room.roomNo}`}>
      <div className="space-y-4 text-[13px]">
        <div className="flex items-center gap-2"><Pill className={STATUS_STYLE[room.status]}>{room.status.toLowerCase()}</Pill><span className="text-[#5A6577]">{room.occupied} of {room.capacity} beds taken · floor {room.floor === 0 ? 'G' : room.floor}</span></div>
        <div className="space-y-2">
          {room.beds.map((b) => (
            <div key={b.bed} className="flex items-start justify-between gap-2 border border-[#EDEFF3] rounded-[4px] p-2">
              <div><p className="font-semibold text-[#16264A]">Bed {b.bed}</p>{b.student ? <><p className="text-[#16264A]">{b.student.name}</p><p className="text-[11px] text-[#5A6577] font-mono">{b.student.enrolmentNo} · {b.student.programme}</p><p className="text-[11px] text-[#5A6577]">{b.allotmentNo} · {b.checkedIn ? 'checked in' : 'not yet checked in'}</p></> : <p className="text-[#0E7A5F]">Free</p>}</div>
              {b.student && !b.checkedIn && canOps && <Button size="sm" variant="secondary" loading={checkIn.isPending} onClick={() => checkIn.mutate(b.allotmentId!, { onSuccess: () => toast.success(`${b.student!.name} checked in`), onError: (e) => toast.error(errText(e)) })}>Check in</Button>}
            </div>
          ))}
        </div>
        {canOps && (
          <div className="space-y-2 border-t border-[#EDEFF3] pt-3">
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Service</p>
            <div className="flex flex-wrap gap-2">
              {room.status !== 'AVAILABLE' && <Button size="sm" loading={save.isPending} onClick={() => void run({ status: 'AVAILABLE' }, `${room.roomNo} back in service`)}>Back in service</Button>}
              {room.status !== 'MAINTENANCE' && <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => void run({ status: 'MAINTENANCE' }, `${room.roomNo} under maintenance — no new allotments`)}>Under maintenance</Button>}
              {room.status !== 'BLOCKED' && <Button size="sm" variant="ghost" disabled={room.occupied > 0} loading={save.isPending} onClick={() => void run({ status: 'BLOCKED' }, `${room.roomNo} blocked`)}>Block{room.occupied > 0 ? ' (empty it first)' : ''}</Button>}
            </div>
            <Input label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Seepage in the ceiling; repair on 12 Oct" />
            <Button size="sm" variant="secondary" disabled={f.notes === (room.notes ?? '')} loading={save.isPending} onClick={() => void run({ notes: f.notes.trim() || null }, 'Notes saved')}>Save notes</Button>
          </div>
        )}
        {canSetup && (
          <div className="space-y-2 border-t border-[#EDEFF3] pt-3">
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Make-up</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Beds" type="number" min={Math.max(1, room.occupied)} max={20} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
              <Input label="Rent per semester (₹)" type="number" min={0} value={f.rent} onChange={(e) => setF({ ...f, rent: e.target.value })} />
            </div>
            <Input label="Furnishing (comma-separated)" value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} />
            <div className="flex gap-4"><Checkbox label="AC" checked={f.ac} onChange={(v) => setF({ ...f, ac: v })} /><Checkbox label="Attached bath" checked={f.bath} onChange={(v) => setF({ ...f, bath: v })} /></div>
            <div className="flex gap-2">
              <Button size="sm" loading={save.isPending} disabled={!(Number(f.capacity) >= 1) || Number(f.rent) < 0} onClick={() => void run({ capacity: Number(f.capacity), rentPerSemester: Number(f.rent), amenities: listOf(f.amenities), ac: f.ac, attachedBath: f.bath }, 'Room updated')}>Save room</Button>
              <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => { toast.success(`Room ${room.roomNo} deleted`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Delete room</Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function AddRoom({ hostelId, onClose }: { hostelId: string; onClose: () => void }) {
  const [f, setF] = useState({ roomNo: '', floor: '1', capacity: '2', rent: '0', amenities: 'Bed with mattress, Wardrobe, Study table and chair, Ceiling fan', ac: false, bath: false });
  const add = useHostelAction(() => post(`/hostels/${hostelId}/rooms`, { roomNo: f.roomNo.trim().toUpperCase(), floor: Number(f.floor), capacity: Number(f.capacity), rentPerSemester: Number(f.rent), amenities: listOf(f.amenities), ac: f.ac, attachedBath: f.bath }));
  const valid = f.roomNo.trim() && Number(f.capacity) >= 1 && Number(f.capacity) <= 20 && Number(f.rent) >= 0 && Number.isInteger(Number(f.floor));
  return (
    <Modal open onClose={onClose} title="Add a room"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={add.isPending} disabled={!valid} onClick={() => add.mutate(undefined, { onSuccess: () => { toast.success(`Room ${f.roomNo.toUpperCase()} added`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Add room</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Room number" value={f.roomNo} onChange={(e) => setF({ ...f, roomNo: e.target.value })} />
        <Input label="Floor (0 = ground)" type="number" value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} />
        <Input label="Beds" type="number" min={1} max={20} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        <Input label="Rent per semester (₹)" type="number" min={0} value={f.rent} onChange={(e) => setF({ ...f, rent: e.target.value })} />
        <div className="col-span-2"><Input label="Furnishing (comma-separated)" value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} /></div>
        <Checkbox label="AC" checked={f.ac} onChange={(v) => setF({ ...f, ac: v })} /><Checkbox label="Attached bath" checked={f.bath} onChange={(v) => setF({ ...f, bath: v })} />
      </div>
    </Modal>
  );
}

function AddFloors({ hostelId, onClose }: { hostelId: string; onClose: () => void }) {
  const [f, setF] = useState({ fromFloor: '1', toFloor: '3', roomsPerFloor: '10', prefix: '', capacity: '2', rent: '0', amenities: 'Bed with mattress, Wardrobe, Study table and chair, Ceiling fan', ac: false, bath: false });
  const n = (Number(f.toFloor) - Number(f.fromFloor) + 1) * Number(f.roomsPerFloor);
  const add = useHostelAction(() => post<{ added: number; skipped: number }>(`/hostels/${hostelId}/rooms/bulk`, { fromFloor: Number(f.fromFloor), toFloor: Number(f.toFloor), roomsPerFloor: Number(f.roomsPerFloor), prefix: f.prefix.trim(), capacity: Number(f.capacity), rentPerSemester: Number(f.rent), amenities: listOf(f.amenities), ac: f.ac, attachedBath: f.bath }));
  const valid = n > 0 && n <= 600 && Number(f.capacity) >= 1 && Number(f.rent) >= 0;
  const sample = `${f.prefix.toUpperCase()}${Number(f.fromFloor) === 0 ? 'G' : f.fromFloor}${'01'.padStart(Number(f.roomsPerFloor) >= 100 ? 3 : 2, '0')}`;
  return (
    <Modal open onClose={onClose} title="Add floors of rooms" width="560px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={add.isPending} disabled={!valid} onClick={() => add.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.added} rooms added${r.skipped ? `, ${r.skipped} already existed` : ''}`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Add {n > 0 ? n : ''} rooms</Button></>}>
      <div className="grid grid-cols-3 gap-3">
        <Input label="From floor" type="number" min={0} value={f.fromFloor} onChange={(e) => setF({ ...f, fromFloor: e.target.value })} />
        <Input label="To floor" type="number" min={0} value={f.toFloor} onChange={(e) => setF({ ...f, toFloor: e.target.value })} />
        <Input label="Rooms per floor" type="number" min={1} max={60} value={f.roomsPerFloor} onChange={(e) => setF({ ...f, roomsPerFloor: e.target.value })} />
        <Input label="Number prefix" value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} placeholder="optional, e.g. A" />
        <Input label="Beds per room" type="number" min={1} max={20} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        <Input label="Rent / semester (₹)" type="number" min={0} value={f.rent} onChange={(e) => setF({ ...f, rent: e.target.value })} />
        <div className="col-span-3"><Input label="Furnishing (comma-separated)" value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} /></div>
        <Checkbox label="AC" checked={f.ac} onChange={(v) => setF({ ...f, ac: v })} /><Checkbox label="Attached bath" checked={f.bath} onChange={(v) => setF({ ...f, bath: v })} />
      </div>
      <p className="text-[12px] text-[#5A6577] mt-3">Rooms are numbered by floor: {sample}, {sample.replace(/01$/, '02')}… Numbers that already exist are skipped. {n > 600 ? 'At most 600 at once.' : ''}</p>
    </Modal>
  );
}


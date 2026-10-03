import { useMemo, useState } from 'react';
import { Button, Input, Select, Modal, Tabs, DataTable, toast, ToastContainer, InlineAlert, Drawer, Spinner } from '../../../components/ui';
import { HOSTEL_BLOCKS, ROOMS, HOSTEL_ALLOTMENT_POLICY, HOSTEL_APPLICATIONS, VISITOR_LOG, type Room, type HostelApplication } from '../../../lib/campusservices';
import { MESS_MENU } from '../../../lib/studentdata';
import { instPlace } from '../../../lib/institution';
import { useAuth, displayName } from '../../../lib/auth';
import { useCollection, useDocument, type Stored } from '../../../lib/records';
import { api } from '../../../lib/api';
import { downloadCSV } from '../../../lib/export';
import { REQUEST_LABEL, fmtDate, refNo, type HostelComplaint, type HostelRequest, type MessMenu } from '../../../lib/hostel';

/**
 * The hostel office. Rooms, applications, room changes, visitors and mess
 * bills are its own registers; gate passes and complaints are the very rows
 * students file from their portal (and parents consent to), so a decision
 * here reaches the student at once.
 */

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));
const today = () => new Date().toISOString().slice(0, 10);

// ─── Demo registers ───────────────────────────────────────────────────────────

/** Every room of every block, filled to each block's stated occupancy. */
const SEED_ROOMS: Room[] = (() => {
  const named = new Map(ROOMS.map(r => [r.roomNo, r]));
  const out: Room[] = [];
  for (const b of HOSTEL_BLOCKS) {
    const perRoom = Math.round(b.capacity / b.totalRooms);
    let toFill = b.occupied;
    for (let i = 0; i < b.totalRooms; i++) {
      const floor = 1 + Math.floor(i / Math.ceil(b.totalRooms / b.floors));
      const roomNo = `${b.code}-${floor}${String((i % Math.ceil(b.totalRooms / b.floors)) + 1).padStart(2, '0')}`;
      const existing = named.get(roomNo);
      if (existing) { out.push(existing); toFill -= existing.occupied; continue; }
      const maintenance = i % 23 === 7;
      const occupied = maintenance ? 0 : Math.max(0, Math.min(perRoom, toFill - (b.totalRooms - i - 1) * (perRoom - 1) > 0 ? perRoom : Math.min(perRoom, toFill > perRoom * 2 ? perRoom : toFill)));
      toFill -= occupied;
      out.push({ id: `R-${roomNo}`, blockCode: b.code, roomNo, floor, type: perRoom === 1 ? 'Single' : perRoom === 2 ? 'Double' : 'Triple', capacity: perRoom, occupied, occupants: [], amenities: ['Fan', 'Wardrobe', 'Study Table'], status: maintenance ? 'maintenance' : occupied >= perRoom ? 'full' : 'available' });
    }
  }
  return out;
})();

const MORE_APPLICANTS: Array<[string, string, string, string, number]> = [
  ['Ritu Kushwaha', 'Female', 'SC', 'B.Sc.', 62], ['Amit Patel', 'Male', 'OBC', 'B.Com.', 38], ['Pooja Soni', 'Female', 'UR', 'BCA', 18],
  ['Sandeep Tomar', 'Male', 'ST', 'B.A.', 120], ['Neelam Rathore', 'Female', 'EWS', 'B.Sc.', 75], ['Vivek Dubey', 'Male', 'UR', 'BCA', 9],
  ['Ankita Saxena', 'Female', 'OBC', 'M.Sc. CS', 33], ['Ravi Bansal', 'Male', 'SC', 'B.Com.', 48],
];
const SEED_APPLICATIONS: HostelApplication[] = [
  ...HOSTEL_APPLICATIONS,
  ...MORE_APPLICANTS.map(([name, gender, category, programme, distanceKm], i) => ({
    id: `HA/2024/${String(344 + i).padStart(5, '0')}`, studentId: `RDU/2024/${programme.replace(/\W/g, '').toUpperCase()}/0${200 + i}`, name, programme, semester: 1, category, gender, distanceKm,
    status: 'pending' as const, appliedOn: `${String(10 + i).padStart(2, '0')}-09-2024`,
  })),
];

const SEED_PASSES: Array<HostelRequest & { studentName: string; room: string }> = [
  { id: 'GP/2024/000441', kind: 'gatepass', from: '2024-09-20', outTime: '10:00', returnTime: '18:00', reason: 'Medical appointment', status: 'approved', appliedAt: '2024-09-19T08:00:00.000Z', studentName: 'Neha Verma', room: 'C-214', decidedBy: 'Smt. Anita Rai', decidedAt: '2024-09-19T09:00:00.000Z' },
  { id: 'GP/2024/000442', kind: 'gatepass', from: '2024-09-20', outTime: '14:00', returnTime: '20:00', reason: 'Family visit', status: 'pending', appliedAt: '2024-09-20T07:30:00.000Z', studentName: 'Kavita Jain', room: 'C-215' },
  { id: 'LV/2024/000443', kind: 'leave', from: '2024-09-21', to: '2024-09-24', reason: 'Elder sister’s wedding', status: 'awaiting_parent', parentConsent: 'pending', appliedAt: '2024-09-20T06:30:00.000Z', studentName: 'Rahul Verma', room: 'A-104' },
];
const SEED_COMPLAINTS: Array<HostelComplaint & { studentName: string; room: string; assigned?: string }> = [
  { id: 'HC/2024/000081', category: 'Water/Electricity', description: 'Water leakage from the ceiling near the bathroom.', raisedOn: '2024-09-18', status: 'in_progress', studentName: 'Rahul Verma', room: 'A-104', assigned: 'Maintenance Team A', response: 'Plumber assigned; repair scheduled.' },
  { id: 'HC/2024/000083', category: 'Water/Electricity', description: 'Fuse blown — no power in the room.', raisedOn: '2024-09-15', status: 'resolved', studentName: 'Dinesh Yadav', room: 'A-301', assigned: 'Electrician Ram Singh', response: 'Fuse replaced and wiring checked.' },
];
interface RoomChange { id: string; student: string; from: string; to: string; reason: string; status: 'pending' | 'approved' | 'rejected'; date: string }
const SEED_CHANGES: RoomChange[] = [
  { id: 'RC/2024/0001', student: 'Rahul Verma', from: 'A-104', to: 'A-201', reason: 'Medical — needs ground floor', status: 'pending', date: '15-09-2024' },
  { id: 'RC/2024/0002', student: 'Dinesh Yadav', from: 'A-301', to: 'A-102', reason: 'Roommate conflict', status: 'approved', date: '10-09-2024' },
];
interface Visitor { id: string; date: string; time: string; studentName: string; room: string; visitorName: string; visitorMobile: string; purpose: string; exitTime: string }
const SEED_VISITORS: Visitor[] = VISITOR_LOG.map((v, i) => ({ id: `VS-${i + 1}`, ...v }));
interface BillRun { id: string; month: string; residents: number; rate: number; total: number; at: string; by: string }

const policyScore = (a: HostelApplication) => {
  const income = a.category === 'SC' || a.category === 'ST' ? 40 : a.category === 'OBC' || a.category === 'EWS' ? 20 : 0;
  const distance = a.distanceKm > 30 ? 30 : a.distanceKm > 15 ? 20 : 10;
  const category = a.category === 'SC' || a.category === 'ST' ? 20 : a.category === 'OBC' ? 10 : 5;
  return { income, distance, category, total: income + distance + category };
};
const blockFits = (code: string, gender: string) => HOSTEL_BLOCKS.find(b => b.code === code)?.gender === (gender === 'Female' ? 'Girls' : 'Boys');

function useHostelRegisters() {
  return {
    rooms: useCollection<Room>('acad:hostel-rooms', SEED_ROOMS),
    applications: useCollection<HostelApplication>('acad:hostel-applications', SEED_APPLICATIONS),
  };
}

// ─── Inventory ────────────────────────────────────────────────────────────────

function BlockInventory({ rooms }: { rooms: Stored<Room>[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [room, setRoom] = useState<Stored<Room> | null>(null);
  const beds = rooms.reduce((s, r) => s + r.capacity, 0);
  const filled = rooms.reduce((s, r) => s + r.occupied, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: 'Rooms', value: rooms.length }, { label: 'Beds occupied', value: `${filled} / ${beds}` }, { label: 'Beds vacant', value: beds - filled }, { label: 'Occupancy', value: `${pct(filled, beds)}%` }].map(s => (
          <div key={s.label} className="bg-white rounded-[4px] border border-[#D3D8E0] p-4">
            <p className="text-[12px] text-[#5A6577] uppercase tracking-wide">{s.label}</p>
            <p className="text-[26px] font-semibold mt-1 text-[#16264A] font-mono">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {HOSTEL_BLOCKS.map(block => {
          const own = rooms.filter(r => r.blockCode === block.code);
          const cap = own.reduce((s, r) => s + r.capacity, 0);
          const occ = own.reduce((s, r) => s + r.occupied, 0);
          const p = pct(occ, cap);
          return (
            <div key={block.id} className="bg-white rounded-[4px] border border-[#D3D8E0] overflow-hidden">
              <button className="w-full text-left p-4 hover:bg-[#FAFBFC] cursor-pointer" onClick={() => setExpanded(expanded === block.id ? null : block.id)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#16264A]">{block.name}</h3>
                    <p className="text-[12px] text-[#5A6577]">{block.floors} floors · Warden: {block.warden} · {block.wardenMobile}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${block.gender === 'Boys' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}`}>{block.gender}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-[12px] mb-3">
                  <div><p className="text-[#5A6577]">Rooms</p><p className="font-semibold text-[#16264A]">{own.length}</p></div>
                  <div><p className="text-[#5A6577]">Beds filled</p><p className="font-semibold text-[#16264A]">{occ} / {cap}</p></div>
                  <div><p className="text-[#5A6577]">Rooms with space</p><p className="font-semibold text-[#0E7A5F]">{own.filter(r => r.status === 'available').length}</p></div>
                </div>
                <div className="h-2 bg-[#EDEFF3] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, background: p > 90 ? '#A8242C' : p > 70 ? '#E0952A' : '#0E7A5F' }} /></div>
                <p className="text-[11px] text-[#5A6577] mt-1">{p}% occupancy · click for the room grid</p>
              </button>
              {expanded === block.id && (
                <div className="border-t border-[#D3D8E0] p-4 bg-[#FAFBFC]">
                  <div className="flex flex-wrap gap-1.5">
                    {own.map(r => (
                      <button key={r._rid ?? r.id} onClick={() => setRoom(r)} title={`${r.roomNo} · ${r.occupied}/${r.capacity}`}
                        className={`px-2 py-1 rounded-[2px] text-[11px] font-mono cursor-pointer border ${r.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : r.status === 'full' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-green-100 text-green-800 border-green-300'}`}>
                        {r.roomNo}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-3 text-[11px] text-[#5A6577]">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-200 border border-green-300 inline-block" /> Has space</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-200 border border-red-300 inline-block" /> Full</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-200 border border-yellow-300 inline-block" /> Maintenance</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <RoomDrawer room={room} onClose={() => setRoom(null)} />
    </div>
  );
}

function RoomDrawer({ room, onClose }: { room: Stored<Room> | null; onClose: () => void }) {
  const { rooms } = useHostelRegisters();
  const live = room ? rooms.items.find(r => r._rid === room._rid) ?? room : null;
  return (
    <Drawer open={!!live} onClose={onClose} title={live ? `Room ${live.roomNo}` : ''}>
      {live && (
        <div className="space-y-4 text-[13px]">
          <div className="bg-[#EDEFF3] rounded-[4px] p-4 space-y-1">
            <p><strong>{live.type}</strong> · Floor {live.floor} · {live.occupied}/{live.capacity} occupied</p>
            <p className="text-[#5A6577]">{live.amenities.join(' · ')}</p>
          </div>
          <div>
            <p className="font-semibold text-[#16264A] mb-1">Occupants</p>
            {live.occupants.length ? live.occupants.map(o => <p key={o}>• {o}</p>) : <p className="text-[#5A6577]">{live.occupied ? `${live.occupied} resident(s) on the register` : 'Empty'}</p>}
          </div>
          <div className="flex gap-2">
            {live.status !== 'maintenance'
              ? <Button size="sm" variant="secondary" onClick={() => { rooms.update(live._rid!, { status: 'maintenance' }); toast.success(`${live.roomNo} marked under maintenance`); }}>Mark under maintenance</Button>
              : <Button size="sm" onClick={() => { rooms.update(live._rid!, { status: live.occupied >= live.capacity ? 'full' : 'available' }); toast.success(`${live.roomNo} back in service`); }}>Back in service</Button>}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ─── Applications and the allotment run ──────────────────────────────────────

/** Where each resident's allotment is kept: written by this desk, read by the student. */
const ALLOTMENTS = 'desk:hostel-allotment';

/**
 * Files the allotment against the student's own record, so it appears in
 * their portal. The application carries the enrolment number; the student's
 * record is found by it (or, failing that, by name).
 */
async function publishAllotment(app: HostelApplication, room: Room, roommates: string[]): Promise<boolean> {
  const { hits } = await api<{ hits: Array<{ kind: string; id: string; title: string; subtitle: string }> }>(`/api/insights/search?q=${encodeURIComponent(app.studentId)}`);
  let s = hits.find(h => h.kind === 'Student' && h.subtitle.startsWith(app.studentId));
  if (!s) s = (await api<{ hits: typeof hits }>(`/api/insights/search?q=${encodeURIComponent(app.name)}`)).hits.find(h => h.kind === 'Student' && h.title === app.name);
  if (!s) return false;
  const year = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const data = { id: 'doc', block: `Block ${room.blockCode}`, room: room.roomNo, type: room.type, roommates: roommates.filter(n => n !== app.name), allotmentDate: fmtDate(new Date().toISOString()), validTill: `31-05-${year}`, messBalance: 0, messBill: 0 };
  const existing = await api<{ rows: Array<{ _rid: string }> }>(`/api/records/${ALLOTMENTS}?studentId=${s.id}`);
  if (existing.rows[0]) await api(`/api/records/${ALLOTMENTS}/${existing.rows[0]._rid}?studentId=${s.id}`, { method: 'PATCH', body: { data } });
  else await api(`/api/records/${ALLOTMENTS}`, { method: 'POST', body: { data, studentId: s.id } });
  return true;
}

function allot(roomsReg: ReturnType<typeof useHostelRegisters>['rooms'], appsReg: ReturnType<typeof useHostelRegisters>['applications'], app: Stored<HostelApplication>, roomNo: string) {
  const room = roomsReg.items.find(r => r.roomNo === roomNo);
  if (!room) return;
  const occupied = room.occupied + 1;
  const occupants = [...room.occupants, app.name];
  roomsReg.update(room._rid!, { occupied, occupants, status: occupied >= room.capacity ? 'full' : 'available' });
  appsReg.update(app._rid!, { status: 'allotted', allottedRoom: roomNo, allottedOn: fmtDate(new Date().toISOString()) });
  void publishAllotment(app, room, occupants)
    .then(ok => { if (!ok) toast.warning(`${app.name} has no student record matching ${app.studentId} — the allotment is not visible in their portal`); })
    .catch(() => toast.error(`Could not file the allotment for ${app.name} in their portal`));
}

function Applications() {
  const { rooms, applications } = useHostelRegisters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allotOpen, setAllotOpen] = useState(false);
  const [roomNo, setRoomNo] = useState<string | null>(null);
  const selected = applications.items.find(a => a._rid === selectedId) ?? null;
  const fitting = selected ? rooms.items.filter(r => r.status === 'available' && blockFits(r.blockCode, selected.gender)) : [];

  const columns = [
    { key: 'id', label: 'App No', mono: true },
    { key: 'name', label: 'Student' },
    { key: 'programme', label: 'Programme' },
    { key: 'category', label: 'Category' },
    { key: 'gender', label: 'Gender' },
    { key: 'distanceKm', label: 'Distance', render: (r: HostelApplication) => `${r.distanceKm} km` },
    { key: 'score', label: 'Score', render: (r: HostelApplication) => <span className="font-mono font-semibold text-[#E0952A]">{policyScore(r).total}</span> },
    { key: 'status', label: 'Status', render: (r: HostelApplication) => <span className="text-[12px] capitalize">{r.status}{r.allottedRoom ? ` · ${r.allottedRoom}` : ''}</span> },
    { key: 'actions', label: '', sortable: false, render: (r: Stored<HostelApplication>) => <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setSelectedId(r._rid!); }}>View</Button> },
  ];

  return (
    <div>
      <div className="flex justify-end mb-3"><Button size="sm" variant="secondary" onClick={() => downloadCSV('hostel-applications', applications.items, [{ key: 'id', label: 'Application' }, { key: 'name', label: 'Student' }, { key: 'studentId', label: 'Enrolment' }, { key: 'programme', label: 'Programme' }, { key: 'category', label: 'Category' }, { key: 'gender', label: 'Gender' }, { key: 'distanceKm', label: 'Distance km' }, { key: 'score', label: 'Score', value: r => policyScore(r).total }, { key: 'status', label: 'Status' }, { key: 'allottedRoom', label: 'Room' }])}>Export CSV</Button></div>
      <DataTable columns={columns} data={applications.items.map(a => ({ ...a, id: a.id }))} loading={applications.isLoading} onRowClick={r => setSelectedId((r as Stored<HostelApplication>)._rid!)} searchPlaceholder="Search applications…" emptyTitle="No applications" />

      <Drawer open={!!selected} onClose={() => setSelectedId(null)} title="Application">
        {selected && (() => {
          const s = policyScore(selected);
          return (
            <div className="space-y-5">
              <div className="bg-[#EDEFF3] rounded-[4px] p-4 space-y-1">
                <p className="text-[13px] font-semibold text-[#16264A]">{selected.name}</p>
                <p className="text-[12px] text-[#5A6577]">{selected.studentId} · {selected.programme} · Sem {selected.semester} · {selected.gender}</p>
                <p className="text-[12px] text-[#5A6577]">Category {selected.category} · Home {selected.distanceKm} km away · applied {selected.appliedOn}</p>
              </div>
              <table className="w-full text-[12px] border border-[#D3D8E0]">
                <tbody>
                  {[['Income / category', s.income], [`Distance (${selected.distanceKm} km)`, s.distance], ['Category priority', s.category]].map(([k, v]) => <tr key={k} className="border-b border-[#D3D8E0]"><td className="px-3 py-2">{k}</td><td className="px-3 py-2 text-right font-mono">{v}</td></tr>)}
                  <tr className="bg-[#FEF9EC]"><td className="px-3 py-2 font-semibold">Total score</td><td className="px-3 py-2 text-right font-mono font-semibold text-[#E0952A]">{s.total}</td></tr>
                </tbody>
              </table>
              {selected.allottedRoom && <InlineAlert type="success">Allotted room <strong>{selected.allottedRoom}</strong> on {selected.allottedOn}</InlineAlert>}
              {(selected.status === 'pending' || selected.status === 'waitlisted') && (
                <div className="flex gap-2">
                  <Button onClick={() => { setRoomNo(null); setAllotOpen(true); }}>Allot room</Button>
                  {selected.status === 'pending' && <Button variant="secondary" onClick={() => { applications.update(selected._rid!, { status: 'waitlisted' }); toast.info(`${selected.name} waitlisted`); }}>Waitlist</Button>}
                  <Button variant="destructive" onClick={() => { applications.update(selected._rid!, { status: 'rejected' }); toast.error(`Application ${selected.id} rejected`); }}>Reject</Button>
                </div>
              )}
            </div>
          );
        })()}
      </Drawer>

      <Modal open={allotOpen} onClose={() => setAllotOpen(false)} title="Allot room" width="520px"
        footer={<><Button variant="secondary" onClick={() => setAllotOpen(false)}>Cancel</Button><Button disabled={!roomNo} onClick={() => { if (selected && roomNo) { allot(rooms, applications, selected, roomNo); toast.success(`Room ${roomNo} allotted to ${selected.name}`); } setAllotOpen(false); }}>Confirm allotment</Button></>}>
        <p className="text-[13px] text-[#5A6577] mb-3">Rooms with space in a {selected?.gender === 'Female' ? 'girls' : 'boys'} block for <strong>{selected?.name}</strong>:</p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {fitting.length === 0 ? <InlineAlert type="warning">No suitable room has space.</InlineAlert> : fitting.slice(0, 40).map(r => (
            <button key={r._rid} onClick={() => setRoomNo(r.roomNo)} className={`w-full text-left border rounded-[4px] p-3 cursor-pointer ${roomNo === r.roomNo ? 'border-[#E0952A] bg-[#FEF9EC]' : 'border-[#D3D8E0] hover:bg-[#FAFBFC]'}`}>
              <p className="text-[14px] font-semibold text-[#16264A]">{r.roomNo}</p>
              <p className="text-[12px] text-[#5A6577]">{r.type} · Floor {r.floor} · {r.occupied}/{r.capacity} occupied</p>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function AllotmentRun() {
  const { rooms, applications } = useHostelRegisters();
  const [proposal, setProposal] = useState<Array<{ app: Stored<HostelApplication>; room: string | null; score: number }> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const waiting = applications.items.filter(a => a.status === 'pending' || a.status === 'waitlisted');

  /** The policy, run: highest score first, each to the first room in a matching block with a free bed. */
  function run() {
    const free = new Map(rooms.items.filter(r => r.status === 'available').map(r => [r.roomNo, r.capacity - r.occupied]));
    const ordered = [...waiting].sort((a, b) => policyScore(b).total - policyScore(a).total || a.appliedOn.localeCompare(b.appliedOn));
    setProposal(ordered.map(app => {
      const room = [...free.entries()].find(([no, beds]) => beds > 0 && blockFits(no.split('-')[0]!, app.gender) && (!app.preferredBlock || no.startsWith(app.preferredBlock)))?.[0] ?? null;
      if (room) free.set(room, free.get(room)! - 1);
      return { app, room, score: policyScore(app).total };
    }));
  }

  function confirm() {
    if (!proposal) return;
    let n = 0;
    for (const p of proposal) {
      if (p.room) { allot(rooms, applications, p.app, p.room); n++; }
      else applications.update(p.app._rid!, { status: 'waitlisted' });
    }
    toast.success(`${n} room${n === 1 ? '' : 's'} allotted; ${proposal.length - n} waitlisted`);
    setProposal(null);
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5">
        <h3 className="text-[15px] font-semibold text-[#16264A] mb-4">Allotment policy</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <ol className="space-y-1">
            {HOSTEL_ALLOTMENT_POLICY.priority.map((p, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-[#16264A]"><span className="w-5 h-5 rounded-full bg-[#E0952A] text-white text-[10px] flex items-center justify-center font-semibold shrink-0">{i + 1}</span>{p}</li>
            ))}
          </ol>
          <div>
            <table className="w-full text-[13px]">
              <thead><tr className="bg-[#EDEFF3]"><th className="text-left px-3 py-2 text-[#5A6577]">Room type</th><th className="text-right px-3 py-2 text-[#5A6577]">Monthly</th><th className="text-right px-3 py-2 text-[#5A6577]">Annual</th></tr></thead>
              <tbody>{HOSTEL_ALLOTMENT_POLICY.feeStructure.map(f => <tr key={f.type} className="border-t border-[#D3D8E0]"><td className="px-3 py-2">{f.type}</td><td className="px-3 py-2 text-right font-mono">₹{f.monthly.toLocaleString('en-IN')}</td><td className="px-3 py-2 text-right font-mono">₹{f.annual.toLocaleString('en-IN')}</td></tr>)}</tbody>
            </table>
            <p className="text-[12px] text-[#5A6577] mt-2">{HOSTEL_ALLOTMENT_POLICY.distanceCriteria}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#16264A]">Run automatic allotment</p>
            <p className="text-[13px] text-[#5A6577]">{waiting.length} application{waiting.length === 1 ? '' : 's'} waiting · {rooms.items.filter(r => r.status === 'available').reduce((s, r) => s + r.capacity - r.occupied, 0)} free beds. Highest policy score first, into a block of the right gender.</p>
          </div>
          <Button disabled={!waiting.length} onClick={run}>Run allotment</Button>
        </div>
        {proposal && (
          <div className="mt-4">
            <table className="w-full text-[13px] border border-[#D3D8E0]">
              <thead className="bg-[#EDEFF3]"><tr>{['Application', 'Student', 'Category', 'Score', 'Proposed room'].map(h => <th key={h} className="text-left px-3 py-2 text-[#5A6577]">{h}</th>)}</tr></thead>
              <tbody>
                {proposal.map(p => (
                  <tr key={p.app._rid} className="border-t border-[#D3D8E0]">
                    <td className="px-3 py-2 font-mono text-[12px]">{p.app.id}</td><td className="px-3 py-2">{p.app.name}</td><td className="px-3 py-2">{p.app.category}</td>
                    <td className="px-3 py-2 font-semibold text-[#E0952A] font-mono">{p.score}</td>
                    <td className="px-3 py-2 font-mono">{p.room ?? <span className="text-[#8A6D1F] font-sans">Waitlist — no bed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex gap-2"><Button onClick={() => setConfirmOpen(true)}>Confirm allotments</Button><Button variant="secondary" onClick={() => setProposal(null)}>Discard</Button></div>
          </div>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm allotments"
        footer={<><Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button onClick={confirm}>Confirm</Button></>}>
        <p className="text-[14px] text-[#16264A]">Allot <strong>{proposal?.filter(p => p.room).length}</strong> rooms and waitlist <strong>{proposal?.filter(p => !p.room).length}</strong>? The room register updates immediately.</p>
      </Modal>
    </div>
  );
}

// ─── Room changes ─────────────────────────────────────────────────────────────

function RoomChanges() {
  const changes = useCollection<RoomChange>('acad:hostel-room-changes', SEED_CHANGES);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ student: '', from: '', to: '', reason: '' });
  const badge = { pending: 'bg-yellow-100 text-yellow-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-700' } as const;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setOpen(true)}>Initiate room change</Button></div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-[#16264A] text-white"><tr>{['Request', 'Student', 'From', 'To', 'Reason', 'Date', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {changes.items.map(r => (
              <tr key={r._rid} className="border-t border-[#D3D8E0] hover:bg-[#FAFBFC]">
                <td className="px-4 py-3 font-mono text-[12px]">{r.id}</td><td className="px-4 py-3 font-medium text-[#16264A]">{r.student}</td><td className="px-4 py-3 font-mono">{r.from}</td><td className="px-4 py-3 font-mono">{r.to}</td>
                <td className="px-4 py-3 text-[#5A6577]">{r.reason}</td><td className="px-4 py-3 text-[#5A6577]">{r.date}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge[r.status]}`}>{r.status}</span></td>
                <td className="px-4 py-3">{r.status === 'pending' && <div className="flex gap-2"><Button size="sm" onClick={() => { changes.update(r._rid!, { status: 'approved' }); toast.success('Room change approved'); }}>Approve</Button><Button size="sm" variant="destructive" onClick={() => { changes.update(r._rid!, { status: 'rejected' }); toast.error('Room change rejected'); }}>Reject</Button></div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Initiate room change"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!f.student.trim() || !f.from.trim() || !f.to.trim() || !f.reason.trim()} onClick={() => { changes.add({ id: refNo('RC'), student: f.student.trim(), from: f.from.trim().toUpperCase(), to: f.to.trim().toUpperCase(), reason: f.reason.trim(), status: 'pending', date: fmtDate(new Date().toISOString()) }); setF({ student: '', from: '', to: '', reason: '' }); setOpen(false); toast.success('Room change request created'); }}>Submit request</Button></>}>
        <div className="space-y-4">
          <Input label="Student name" value={f.student} onChange={e => setF({ ...f, student: e.target.value })} />
          <div className="grid grid-cols-2 gap-4"><Input label="Current room" placeholder="A-104" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /><Input label="Requested room" placeholder="A-205" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><label className="text-[13px] font-medium text-[#16264A]">Reason</label><textarea rows={3} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} className="border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none" /></div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Mess ─────────────────────────────────────────────────────────────────────

const MENU_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MessBilling() {
  const { user } = useAuth();
  const { rooms } = useHostelRegisters();
  const menuDoc = useDocument<MessMenu>('campus:mess-menu', MESS_MENU as MessMenu, MESS_MENU as MessMenu);
  const runs = useCollection<BillRun>('acad:mess-bills', []);
  const allotted = useCollection<{ id: string; room: string }>(ALLOTMENTS, []);
  const [billing, setBilling] = useState(false);
  async function bill() {
    const ids = [...new Set(allotted.items.map(a => a._studentId).filter((x): x is string => !!x))];
    if (!ids.length) { toast.error('No resident has an allotment on record yet'); return; }
    setBilling(true);
    try {
      const due = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
      const r = await api<{ created: number; skipped: number; total: number }>('/api/office/finance/charge-students', { method: 'POST', body: { studentIds: ids, head: `Mess charges — ${month}`, category: 'OTHER', amount: Number(rate), term: `${new Date().toISOString().slice(0, 7)} mess`, dueDate: due } });
      runs.add({ id: refNo('MB'), month, residents: r.created, rate: Number(rate), total: r.total, at: new Date().toISOString(), by: displayName(user) });
      toast.success(`${month}: ₹${Number(rate).toLocaleString('en-IN')} charged to ${r.created} resident(s)' fee accounts${r.skipped ? `, ${r.skipped} already billed` : ''}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Billing failed'); } finally { setBilling(false); }
  }
  const [day, setDay] = useState('Mon');
  const [editing, setEditing] = useState<null | { breakfast: string; lunch: string; dinner: string }>(null);
  const [rate, setRate] = useState('2850');
  const residents = allotted.items.length || rooms.items.reduce((s, r) => s + r.occupied, 0);
  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const done = runs.items.some(r => r.month === month);
  const menu = menuDoc.value[day] ?? { breakfast: '', lunch: '', dinner: '' };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: 'Residents', value: residents }, { label: 'Monthly rate', value: `₹${Number(rate).toLocaleString('en-IN')}` }, { label: `Billed (${month})`, value: done ? `₹${runs.items.find(r => r.month === month)!.total.toLocaleString('en-IN')}` : 'Not yet' }, { label: 'Bill runs', value: runs.items.length }].map(s => (
          <div key={s.label} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4"><p className="text-[12px] text-[#5A6577]">{s.label}</p><p className="text-[20px] font-semibold text-[#16264A] mt-1 font-mono">{s.value}</p></div>
        ))}
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <div className="w-40"><Input label="Rate per resident (₹)" value={rate} onChange={e => setRate(e.target.value.replace(/\D/g, ''))} /></div>
        <Button loading={billing} disabled={done || !Number(rate)} onClick={() => void bill()}>{done ? `${month} already billed` : `Generate ${month} bills`}</Button>
        {runs.items.length > 0 && <Button variant="secondary" onClick={() => downloadCSV('mess-bill-runs', runs.items, [{ key: 'id', label: 'Run' }, { key: 'month', label: 'Month' }, { key: 'residents', label: 'Residents' }, { key: 'rate', label: 'Rate' }, { key: 'total', label: 'Total' }, { key: 'by', label: 'By' }, { key: 'at', label: 'At' }])}>Export bill runs</Button>}
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
          <p className="text-[14px] font-semibold text-[#16264A]">Weekly mess menu <span className="text-[12px] font-normal text-[#5A6577]">· students see changes at once</span></p>
          {!editing && <Button size="sm" variant="secondary" onClick={() => setEditing({ ...menu })}>Edit {day}</Button>}
        </div>
        <div className="flex border-b border-[#D3D8E0] overflow-x-auto">
          {MENU_DAYS.map(d => <button key={d} onClick={() => { setDay(d); setEditing(null); }} className={`px-4 py-2.5 text-[13px] font-medium cursor-pointer ${day === d ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>{d}</button>)}
        </div>
        <div className="p-4 space-y-3">
          {(['breakfast', 'lunch', 'dinner'] as const).map(meal => (
            <div key={meal} className="flex gap-4 items-center">
              <span className="text-[12px] font-semibold text-[#16264A] uppercase w-20 shrink-0">{meal}</span>
              {editing ? <input value={editing[meal]} onChange={e => setEditing({ ...editing, [meal]: e.target.value })} className="flex-1 h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none focus:border-[#E0952A]" /> : <p className="text-[13px] text-[#5A6577]">{menu[meal] || '—'}</p>}
            </div>
          ))}
          {editing && <div className="flex gap-2 justify-end"><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={() => { menuDoc.set({ [day]: editing } as Partial<MessMenu>); setEditing(null); toast.success(`${day} menu published`); }}>Publish</Button></div>}
        </div>
      </div>
    </div>
  );
}

// ─── Gate passes and visitors ─────────────────────────────────────────────────

type Pass = Stored<HostelRequest & { studentName?: string; room?: string }>;

function GatePassVisitors() {
  const { user } = useAuth();
  const me = displayName(user) || 'Warden';
  const passes = useCollection<HostelRequest & { studentName?: string; room?: string }>('student:hostel-requests', SEED_PASSES);
  const visitors = useCollection<Visitor>('acad:hostel-visitors', SEED_VISITORS);
  const [visitorOpen, setVisitorOpen] = useState(false);
  const [v, setV] = useState({ studentName: '', room: '', visitorName: '', visitorMobile: '', purpose: '', time: '' });
  const [filter, setFilter] = useState<'action' | 'all'>('action');
  const name = (p: Pass) => p._student?.name ?? p.studentName ?? 'Student';
  const shown = passes.items.filter(p => filter === 'all' || p.status === 'pending' || p.status === 'approved');
  const decide = (p: Pass, status: 'approved' | 'rejected') => {
    passes.update(p._rid!, { status, decidedBy: me, decidedAt: new Date().toISOString() });
    if (status === 'approved') toast.success(`${p.id} approved — the student now has a QR pass`); else toast.error(`${p.id} rejected`);
  };
  const badge: Record<string, string> = { awaiting_parent: 'bg-gray-100 text-gray-700', pending: 'bg-yellow-100 text-yellow-800', approved: 'bg-green-100 text-green-800', returned: 'bg-blue-100 text-blue-800', rejected: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500' };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
        <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-[#16264A]">Leave & gate-pass requests <span className="text-[12px] font-normal text-[#5A6577]">· filed by students in their portal</span></p>
          <div className="flex gap-2 items-center">
            <span className="text-[12px] text-[#5A6577]">{passes.items.filter(p => p.status === 'pending').length} awaiting you</span>
            <select value={filter} onChange={e => setFilter(e.target.value as 'action' | 'all')} className="h-8 px-2 text-[12px] border border-[#D3D8E0] rounded-[4px] cursor-pointer"><option value="action">Needs action / out now</option><option value="all">All</option></select>
          </div>
        </div>
        {passes.isLoading ? <div className="flex justify-center py-6"><Spinner /></div> : (
          <table className="w-full text-[13px]">
            <thead className="bg-[#EDEFF3]"><tr>{['Pass', 'Student', 'When', 'Purpose', 'Parent', 'Status', ''].map(h => <th key={h} className="text-left px-3 py-2 text-[#5A6577] font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-[#5A6577]">Nothing waiting.</td></tr>}
              {shown.map(p => (
                <tr key={p._rid} className="border-t border-[#D3D8E0] hover:bg-[#FAFBFC] align-top">
                  <td className="px-3 py-2 font-mono text-[12px]">{p.id}<div className="font-sans text-[11px] text-[#5A6577]">{p.kind === 'leave' ? 'Leave' : 'Gate pass'}</div></td>
                  <td className="px-3 py-2 font-medium text-[#16264A]">{name(p)}{p.room && <div className="text-[11px] text-[#5A6577] font-normal">{p.room}</div>}</td>
                  <td className="px-3 py-2 text-[#5A6577]">{p.kind === 'leave' ? `${fmtDate(p.from)} – ${fmtDate(p.to)}` : `${fmtDate(p.from)} · ${p.outTime}–${p.returnTime}`}</td>
                  <td className="px-3 py-2 text-[#5A6577]">{p.reason}</td>
                  <td className="px-3 py-2 text-[12px]">{p.kind === 'leave' ? (p.parentConsent === 'given' ? '✓ consented' : p.parentConsent === 'refused' ? '✗ refused' : 'awaiting') : '—'}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge[p.status]}`}>{REQUEST_LABEL[p.status]}</span></td>
                  <td className="px-3 py-2">
                    {p.status === 'pending' && <div className="flex gap-1"><Button size="sm" onClick={() => decide(p, 'approved')}>Approve</Button><Button size="sm" variant="destructive" onClick={() => decide(p, 'rejected')}>Reject</Button></div>}
                    {p.status === 'approved' && <Button size="sm" variant="secondary" onClick={() => { passes.update(p._rid!, { status: 'returned', returnedAt: new Date().toISOString() }); toast.success(`${name(p)} marked back in the hostel`); }}>Mark returned</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
        <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
          <p className="text-[14px] font-semibold text-[#16264A]">Visitor log</p>
          <Button size="sm" onClick={() => setVisitorOpen(true)}>Add visitor entry</Button>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-[#EDEFF3]"><tr>{['Date', 'Student', 'Room', 'Visitor', 'Mobile', 'Purpose', 'In', 'Out'].map(h => <th key={h} className="text-left px-3 py-2 text-[#5A6577] font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {visitors.items.map(x => (
              <tr key={x._rid} className="border-t border-[#D3D8E0] hover:bg-[#FAFBFC]">
                <td className="px-3 py-2 text-[#5A6577]">{x.date}</td><td className="px-3 py-2 font-medium text-[#16264A]">{x.studentName}</td><td className="px-3 py-2">{x.room}</td><td className="px-3 py-2">{x.visitorName}</td>
                <td className="px-3 py-2 font-mono text-[12px]">{x.visitorMobile}</td><td className="px-3 py-2 text-[#5A6577]">{x.purpose}</td><td className="px-3 py-2">{x.time}</td>
                <td className="px-3 py-2">{x.exitTime || <Button size="sm" variant="secondary" onClick={() => { visitors.update(x._rid!, { exitTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }); toast.success('Exit recorded'); }}>Record exit</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={visitorOpen} onClose={() => setVisitorOpen(false)} title="Add visitor entry"
        footer={<><Button variant="secondary" onClick={() => setVisitorOpen(false)}>Cancel</Button><Button disabled={!v.studentName.trim() || !v.visitorName.trim() || !/^[+\d\s-]{10,}$/.test(v.visitorMobile)} onClick={() => {
          visitors.add({ id: refNo('VS'), date: fmtDate(new Date().toISOString()), time: v.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), studentName: v.studentName.trim(), room: v.room.trim().toUpperCase(), visitorName: v.visitorName.trim(), visitorMobile: v.visitorMobile.trim(), purpose: v.purpose.trim(), exitTime: '' });
          setV({ studentName: '', room: '', visitorName: '', visitorMobile: '', purpose: '', time: '' }); setVisitorOpen(false); toast.success('Visitor entry recorded');
        }}>Save entry</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><Input label="Student" value={v.studentName} onChange={e => setV({ ...v, studentName: e.target.value })} /><Input label="Room" placeholder="C-214" value={v.room} onChange={e => setV({ ...v, room: e.target.value })} /></div>
          <Input label="Visitor name" value={v.visitorName} onChange={e => setV({ ...v, visitorName: e.target.value })} />
          <Input label="Visitor mobile" placeholder="+91 98765 43210" value={v.visitorMobile} onChange={e => setV({ ...v, visitorMobile: e.target.value })} />
          <Input label="Purpose" value={v.purpose} onChange={e => setV({ ...v, purpose: e.target.value })} />
          <Input label="Time in" type="time" value={v.time} onChange={e => setV({ ...v, time: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Complaints ───────────────────────────────────────────────────────────────

function Complaints() {
  const complaints = useCollection<HostelComplaint & { studentName?: string; room?: string; assigned?: string }>('student:hostel-complaints', SEED_COMPLAINTS);
  const [open, setOpen] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [assigned, setAssigned] = useState('Maintenance Team A');
  const current = complaints.items.find(c => c._rid === open) ?? null;
  const badge = { open: 'bg-gray-100 text-gray-700', in_progress: 'bg-yellow-100 text-yellow-800', resolved: 'bg-green-100 text-green-800' } as const;

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
      <div className="px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Complaints <span className="text-[12px] font-normal text-[#5A6577]">· raised by residents in their portal</span></p></div>
      <table className="w-full text-[13px]">
        <thead className="bg-[#EDEFF3]"><tr>{['Complaint', 'Student', 'Issue', 'Raised', 'Assigned', 'Status', ''].map(h => <th key={h} className="text-left px-3 py-2 text-[#5A6577] font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {complaints.items.map(c => (
            <tr key={c._rid} className="border-t border-[#D3D8E0] hover:bg-[#FAFBFC] align-top">
              <td className="px-3 py-2 font-mono text-[12px]">{c.id}{c.priority === 'critical' && <div className="font-sans text-[10px] font-bold text-[#A8242C]">CRITICAL</div>}</td>
              <td className="px-3 py-2 font-medium text-[#16264A]">{c._student?.name ?? c.studentName ?? 'Student'}{c.room && <div className="text-[11px] text-[#5A6577] font-normal">{c.room}</div>}</td>
              <td className="px-3 py-2"><span className="font-medium">{c.category}</span><div className="text-[12px] text-[#5A6577]">{c.description}</div></td>
              <td className="px-3 py-2 text-[#5A6577]">{fmtDate(c.raisedOn)}</td>
              <td className="px-3 py-2 text-[#5A6577]">{c.assigned ?? 'Unassigned'}</td>
              <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge[c.status]}`}>{c.status.replace('_', ' ')}</span></td>
              <td className="px-3 py-2">{c.status !== 'resolved' && <Button size="sm" variant="secondary" onClick={() => { setOpen(c._rid!); setResponse(c.response ?? ''); setAssigned(c.assigned ?? 'Maintenance Team A'); }}>Act</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={!!current} onClose={() => setOpen(null)} title={current ? `${current.id} · ${current.category}` : ''}
        footer={<><Button variant="secondary" onClick={() => { if (current) { complaints.update(current._rid!, { status: 'in_progress', assigned, response: response.trim() || current.response }); toast.success('Assigned and the student updated'); } setOpen(null); }}>Save as in progress</Button><Button disabled={!response.trim()} onClick={() => { if (current) { complaints.update(current._rid!, { status: 'resolved', assigned, response: response.trim() }); toast.success('Complaint resolved — the student sees your note'); } setOpen(null); }}>Resolve</Button></>}>
        {current && (
          <div className="space-y-4">
            <p className="text-[13px] text-[#16264A]">{current.description}</p>
            <Select label="Assign to" value={assigned} onChange={e => setAssigned(e.target.value)}>{['Maintenance Team A', 'Maintenance Team B', 'Electrician', 'Plumber', 'Mess Supervisor', 'Security', 'Anti-Ragging Committee'].map(a => <option key={a}>{a}</option>)}</Select>
            <div className="flex flex-col gap-1"><label className="text-[13px] font-medium text-[#16264A]">Note to the student</label><textarea rows={3} value={response} onChange={e => setResponse(e.target.value)} className="border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] outline-none focus:border-[#E0952A] resize-none" /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TAB_LIST = [
  { id: 'inventory', label: 'Blocks & Rooms' },
  { id: 'applications', label: 'Applications' },
  { id: 'allotment', label: 'Allotment Run' },
  { id: 'changes', label: 'Room Changes' },
  { id: 'mess', label: 'Mess & Billing' },
  { id: 'gate', label: 'Gate Pass & Visitors' },
  { id: 'complaints', label: 'Complaints' },
];

export default function HostelManagement() {
  const [tab, setTab] = useState('inventory');
  const { rooms } = useHostelRegisters();
  const year = useMemo(() => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}–${String(y + 1).slice(-2)}`; }, []);
  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <ToastContainer />
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[20px] font-semibold text-white">Hostel Management</h1>
        <p className="text-[13px] text-[#94A3B8] mt-0.5">{instPlace()} — Academic Year {year}</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6 overflow-x-auto"><Tabs tabs={TAB_LIST} activeId={tab} onChange={setTab} /></div>
      <div className="p-6">
        {tab === 'inventory' && (rooms.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : <BlockInventory rooms={rooms.items} />)}
        {tab === 'applications' && <Applications />}
        {tab === 'allotment' && <AllotmentRun />}
        {tab === 'changes' && <RoomChanges />}
        {tab === 'mess' && <MessBilling />}
        {tab === 'gate' && <GatePassVisitors />}
        {tab === 'complaints' && <Complaints />}
      </div>
    </div>
  );
}

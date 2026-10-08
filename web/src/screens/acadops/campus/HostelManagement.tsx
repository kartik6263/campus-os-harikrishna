import { useState } from 'react';
import { Tabs, ToastContainer } from '../../../components/ui';
import { useOverview } from '../../../lib/hostel';
import { OverviewTab, RoomsTab } from '../../hostel/Setup';
import { ApplicationsTab, ResidentsTab, RoomChangesTab } from '../../hostel/Allotment';
import { ComplaintsTab, LeaveTab, RollCallTab, VisitorsTab } from '../../hostel/Daily';
import { MessTab } from '../../hostel/Mess';

/**
 * Hostel management: any number of hostels and their rooms, applications and
 * allotment, residents, room changes, complaints, leave and the gate,
 * visitors, the night roll call, the mess and its billing. Every figure and
 * every action goes through /api/hostel.
 */
export default function HostelManagement() {
  const [tab, setTab] = useState('overview');
  const [roomsFor, setRoomsFor] = useState('');
  const o = useOverview().data?.totals;
  const n = (x: number | undefined) => (x ? ` (${x})` : '');

  function go(target: string) {
    if (target.startsWith('rooms:')) { setRoomsFor(target.slice(6)); setTab('rooms'); } else setTab(target);
  }

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <ToastContainer />
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Hostel Management</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Hostels, rooms and beds · allotment · residents · complaints · leave and the gate · visitors · roll call · mess and billing</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6 overflow-x-auto">
        <Tabs tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'rooms', label: 'Rooms' },
          { id: 'applications', label: `Applications${n(o?.pendingApplications)}` },
          { id: 'residents', label: 'Residents' },
          { id: 'changes', label: 'Room changes' },
          { id: 'complaints', label: `Complaints${n(o?.openComplaints)}` },
          { id: 'leave', label: `Leave & gate${n(o?.leaveRequests)}` },
          { id: 'visitors', label: 'Visitors' },
          { id: 'rollcall', label: 'Roll call' },
          { id: 'mess', label: 'Mess & billing' },
        ]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab onGo={go} />}
        {tab === 'rooms' && <RoomsTab key={roomsFor} initialHostel={roomsFor} />}
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'residents' && <ResidentsTab />}
        {tab === 'changes' && <RoomChangesTab />}
        {tab === 'complaints' && <ComplaintsTab />}
        {tab === 'leave' && <LeaveTab />}
        {tab === 'visitors' && <VisitorsTab />}
        {tab === 'rollcall' && <RollCallTab />}
        {tab === 'mess' && <MessTab />}
      </div>
    </div>
  );
}

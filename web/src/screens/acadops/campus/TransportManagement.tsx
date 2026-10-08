import { useState } from 'react';
import { Tabs, ToastContainer } from '../../../components/ui';
import { useOverview } from '../../../lib/transport';
import { CrewTab, FleetTab, OverviewTab, RoutesTab } from '../../transport/Setup';
import { IncidentsTab, PassesTab, TripsTab } from '../../transport/Ops';

/**
 * Transport management: the fleet and its papers, drivers and attendants,
 * routes with stop-wise fares, passes tied to the fee ledger, the day's runs
 * with real stop times and boarding, incidents, and alerts to riders.
 * Everything goes through /api/transport.
 */
export default function TransportManagement() {
  const [tab, setTab] = useState('overview');
  const t = useOverview().data?.totals;
  const n = (x: number | undefined) => (x ? ` (${x})` : '');
  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <ToastContainer />
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Transport Management</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Fleet · crew · routes and fares · passes · daily runs · incidents</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6 overflow-x-auto">
        <Tabs tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'trips', label: `Today's runs${n(t?.tripsRunning)}` },
          { id: 'passes', label: `Passes & requests${n(t?.pendingRequests)}` },
          { id: 'routes', label: 'Routes' },
          { id: 'fleet', label: `Fleet${n(t?.complianceIssues)}` },
          { id: 'crew', label: 'Crew' },
          { id: 'incidents', label: `Incidents${n(t?.openIncidents)}` },
        ]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab onGo={setTab} />}
        {tab === 'trips' && <TripsTab />}
        {tab === 'passes' && <PassesTab />}
        {tab === 'routes' && <RoutesTab />}
        {tab === 'fleet' && <FleetTab />}
        {tab === 'crew' && <CrewTab />}
        {tab === 'incidents' && <IncidentsTab />}
      </div>
    </div>
  );
}

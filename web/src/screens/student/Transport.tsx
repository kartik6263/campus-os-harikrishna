import { useState, useEffect } from 'react';
import type { Module } from '../StudentPortal';
import { Button, Modal, StatusPill, InlineAlert, SkeletonRow, toast } from '../../components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTransportRecord } from '../../lib/queries';
import { useCollection } from '../../lib/records';

/** A request to the transport desk to renew (or start) a bus pass. */
interface PassRequest { id: string; routeNo: string; requestedAt: string; note?: string; status: 'pending' | 'done' | 'declined' }

interface Props { onNavigate: (m: Module) => void }


function SectionHeader({ label }: { label: string }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function Transport({ onNavigate }: Props) {
  const { data: TRANSPORT, isPending, error } = useTransportRecord();

  const [renewOpen, setRenewOpen] = useState(false);
  const qc = useQueryClient();
  const requests = useCollection<PassRequest>('student:transport-requests', []);
  const pendingRequest = requests.items.find(r => r.status === 'pending');
  const [refreshed, setRefreshed] = useState(false);
  // Empty until the route arrives, then seeded from the server timestamp.
  const [lastUpdate, setLastUpdate] = useState('');

  useEffect(() => {
    if (TRANSPORT && !lastUpdate) setLastUpdate(TRANSPORT.lastUpdated);
  }, [TRANSPORT, lastUpdate]);

  // Every hook is declared above this point, so the early returns are safe.
  if (isPending) {
    return (
      <div className="bg-[#EDEFF3] min-h-screen p-4">
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EDEFF3] min-h-screen p-4">
        <InlineAlert type="error">Could not load transport: {(error as Error).message}</InlineAlert>
      </div>
    );
  }

  if (!TRANSPORT) {
    return (
      <div className="bg-[#EDEFF3] min-h-screen p-4">
        <InlineAlert type="info">
          No bus pass is on file for you. Apply at the college office to track a route here.
        </InlineAlert>
      </div>
    );
  }

  // Check if pass is expiring within 15 days
  const passDueParts = TRANSPORT.passDue.split('-');
  const passDueDate = new Date(`${passDueParts[2]}-${passDueParts[1]}-${passDueParts[0]}`);
  const today = new Date();
  const daysLeft = Math.ceil((passDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const expired = daysLeft < 0;
  const expiringSoon = daysLeft <= 15;

  async function handleRefresh() {
    setRefreshed(true);
    await qc.invalidateQueries({ queryKey: ['transport'] });
    setLastUpdate(`Today ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
    setRefreshed(false);
  }

  function handleRenew() {
    if (pendingRequest) { setRenewOpen(false); return; }
    requests.add({ id: `TR-${Date.now().toString(36).toUpperCase()}`, routeNo: TRANSPORT!.routeNo, requestedAt: new Date().toISOString(), status: 'pending' });
    setRenewOpen(false);
    toast.success('Renewal requested — pay the transport fee when it appears on your fee account; the desk then renews your pass');
  }

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      {/* Header */}
      <div className="bg-[#16264A] px-4 py-4">
        <button onClick={() => onNavigate(null as any)} className="flex items-center gap-2 text-white/60 hover:text-white mb-3 cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          <span className="text-[13px]">Student Portal</span>
        </button>
        <h1 className="text-[20px] font-semibold text-white">Transport</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Campus Bus Service</p>
      </div>

      {/* Pass Status Band */}
      <div className="bg-[#16264A] border-t border-white/10 px-4 py-4 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-white/50 uppercase tracking-wider mb-1">Route</p>
            <p className="text-[16px] font-semibold text-white">{TRANSPORT.routeNo} · {TRANSPORT.name}</p>
          </div>
          <StatusPill status={TRANSPORT.passValid ? 'valid' : 'overdue'} />
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-[11px] text-white/50 uppercase tracking-wider mb-0.5">Bus No.</p>
            <p className="text-[14px] font-mono text-white">{TRANSPORT.busNo}</p>
          </div>
          <div>
            <p className="text-[11px] text-white/50 uppercase tracking-wider mb-0.5">Pass Valid Till</p>
            <p className="text-[14px] font-medium text-white">{TRANSPORT.passDue}</p>
          </div>
        </div>
        {expiringSoon && (
          <div className="bg-[#E0952A]/20 border border-[#E0952A]/40 rounded-[4px] px-3 py-2">
            <p className="text-[12px] text-[#E0952A] font-medium">
              {expired
                ? `Pass expired ${Math.abs(daysLeft)} days ago — renew to travel`
                : daysLeft === 0
                  ? 'Pass expires today — renew to avoid disruption'
                  : `Pass expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — renew to avoid disruption`}
            </p>
          </div>
        )}
        {expiringSoon && (
          <Button variant="primary" size="md" onClick={() => setRenewOpen(true)}>
            Renew Pass
          </Button>
        )}
      </div>

      {/* Route & Stops */}
      <SectionHeader label={`Route stops — ${TRANSPORT.routeNo}`} />
      <div className="bg-white border-b border-[#D3D8E0]">
        {TRANSPORT.stops.map((stop, i) => {
          const isPast = i < TRANSPORT.currentStop;
          const isCurrent = i === TRANSPORT.currentStop;
          const isNext = i === TRANSPORT.currentStop + 1;
          const isLast = i === TRANSPORT.stops.length - 1;

          return (
            <div key={stop.name} className={`flex items-center px-4 py-3 gap-3 relative ${!isLast ? 'border-b border-[#D3D8E0]' : ''} ${isCurrent ? 'bg-[#FEF9EC]' : isNext ? 'bg-[#F0FDF4]' : ''}`}>
              {/* Stop indicator column */}
              <div className="flex flex-col items-center w-6 shrink-0 self-stretch">
                <div className={`w-3 h-3 rounded-full border-2 shrink-0 mt-2 ${
                  isPast ? 'border-[#0E7A5F] bg-[#0E7A5F]' :
                  isCurrent ? 'border-[#E0952A] bg-[#E0952A]' :
                  isNext ? 'border-[#0E7A5F] bg-white' :
                  'border-[#D3D8E0] bg-white'
                }`} />
                {!isLast && (
                  <div className={`w-px flex-1 mt-1 ${isPast ? 'bg-[#0E7A5F]' : 'bg-[#D3D8E0]'}`} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-[15px] font-medium ${isCurrent ? 'text-[#E0952A]' : isNext ? 'text-[#0E7A5F]' : isPast ? 'text-[#5A6577]' : 'text-[#16264A]'}`}>
                    {stop.name}
                  </p>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-[#E0952A] text-white rounded-[2px]">DEPARTED</span>
                  )}
                  {isNext && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-[#0E7A5F] text-white rounded-[2px]">NEXT</span>
                  )}
                </div>
                {isCurrent && (
                  <p className="text-[11px] text-[#E0952A]">Departed 08:14 AM</p>
                )}
                {isNext && (
                  <p className="text-[11px] text-[#0E7A5F]">Expected 08:21 AM</p>
                )}
              </div>
              <span className="text-[13px] font-mono text-[#5A6577] shrink-0">{stop.time}</span>
            </div>
          );
        })}
      </div>

      {/* Live Bus Location */}
      <SectionHeader label="Live Bus Location" />
      <div className="bg-white border-b border-[#D3D8E0]">
        <div className="mx-4 my-4 rounded-[4px] overflow-hidden bg-[#1E3A5F] relative" style={{ height: 180 }}>
          {/* Route line */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 360 180" preserveAspectRatio="none">
            <line x1="20" y1="90" x2="340" y2="90" stroke="#FFFFFF22" strokeWidth="3" />
            <line x1="20" y1="90" x2="180" y2="90" stroke="#E0952A" strokeWidth="3" />
            {/* Stop dots */}
            {[20, 90, 160, 250, 340].map((x, i) => (
              <circle key={i} cx={x} cy="90" r="6"
                fill={i < TRANSPORT.currentStop ? '#0E7A5F' : i === TRANSPORT.currentStop ? '#E0952A' : '#FFFFFF33'}
                stroke="white" strokeWidth="1.5"
              />
            ))}
            {/* Animated bus dot */}
            <circle cy="90" r="8" fill="#E0952A" stroke="white" strokeWidth="2">
              <animate attributeName="cx" values="90;160" dur="4s" repeatCount="indefinite" />
            </circle>
          </svg>
          {/* Stop labels */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-between px-3">
            {TRANSPORT.stops.map(s => (
              <span key={s.name} className="text-[8px] text-white/60 text-center w-12 leading-tight">{s.name.split(' ')[0]}</span>
            ))}
          </div>
          <div className="absolute top-3 left-3 right-3 flex justify-between">
            <span className="text-[11px] font-semibold text-white">{TRANSPORT.routeNo} live</span>
            <span className="text-[10px] text-white/50">Approximate tracking</span>
          </div>
        </div>
        <div className="px-4 pb-4 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-[#5A6577]">Last updated</p>
            <p className="text-[13px] font-mono text-[#16264A]">{lastUpdate}</p>
            <p className="text-[11px] text-[#5A6577] mt-0.5">Data from MPTRANSCO · Tracking is approximate</p>
          </div>
          <Button variant="secondary" size="sm" loading={refreshed} onClick={() => void handleRefresh()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Pass Renewal Section */}
      <SectionHeader label="Pass Renewal" />
      <div className="bg-white px-4 py-4 border-b border-[#D3D8E0]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[14px] font-semibold text-[#16264A]">Pass valid till {TRANSPORT.passDue}</p>
            <p className="text-[12px] text-[#5A6577]">Route {TRANSPORT.routeNo}</p>
          </div>
        </div>
        {pendingRequest
          ? <InlineAlert type="info">Renewal requested on {new Date(pendingRequest.requestedAt).toLocaleDateString('en-IN')}. The transport desk renews your pass once the fee is paid.</InlineAlert>
          : <Button variant="primary" size="lg" className="w-full" onClick={() => setRenewOpen(true)}>Request renewal</Button>}
      </div>

      {/* Renewal Modal */}
      <Modal open={renewOpen} onClose={() => setRenewOpen(false)} title="Renew Bus Pass"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleRenew}>Send request</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-[#EDEFF3] rounded-[4px] px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[#5A6577]">Route</span>
              <span className="text-[14px] font-medium text-[#16264A]">{TRANSPORT.routeNo} · {TRANSPORT.name}</span>
            </div>
          </div>
          <InlineAlert type="info">The transport desk adds the fee for the next period to your fee account. Pay it there (online or at the counter) and your pass is renewed.</InlineAlert>
        </div>
      </Modal>

      <div className="h-8" />
    </div>
  );
}

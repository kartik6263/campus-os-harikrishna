import { useState } from 'react';
import { Button, Checkbox, Drawer, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { downloadCSV } from '../../lib/export';
import { useAuth } from '../../lib/auth';
import {
  PAPER_STYLE, day, del, isoDay, patch, post, put, rupees, useCrew, useOverview, useRoutes, useTransportAction, useVehicleLogs, useVehicles,
  type Crew, type Route, type Vehicle,
} from '../../lib/transport';
import { Panel, Pill, Th, errText } from '../hostel/common';

export function useTransportRole() {
  const { user } = useAuth();
  const r = user?.role;
  return { canOps: r === 'OFFICE' || r === 'REGISTRAR' || r === 'ADMIN', senior: r === 'REGISTRAR' || r === 'ADMIN' };
}

// ─── Overview ────────────────────────────────────────────────────────────────

export function OverviewTab({ onGo }: { onGo: (t: string) => void }) {
  const q = useOverview();
  if (q.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (q.isError || !q.data) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  const t = q.data.totals;
  const tiles: Array<[string, string | number, string, string]> = [
    ['Riders', `${t.riders} / ${t.seats}`, 'active passes / seats', 'passes'],
    ['Requests', t.pendingRequests, 'waiting for the desk', 'passes'],
    ['Fee unpaid', t.unpaid, 'passes not yet active', 'passes'],
    ['Trips running', t.tripsRunning, 'right now', 'trips'],
    ['Open incidents', t.openIncidents, 'not yet closed', 'incidents'],
    ['Compliance', t.complianceIssues, 'papers expired or missing', 'fleet'],
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {tiles.map(([l, v, sub, go]) => (
          <button key={l} onClick={() => onGo(go)} className="text-left bg-white border border-[#D3D8E0] rounded-[4px] p-3 hover:border-[#E0952A] cursor-pointer">
            <p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p>
            <p className={`text-[22px] font-semibold tabular-nums ${l === 'Compliance' && t.complianceIssues ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>{v}</p>
            <p className="text-[11px] text-[#5A6577]">{sub}</p>
          </button>
        ))}
      </div>
      {q.data.compliance.length > 0 && (
        <Panel title="Papers and licences needing attention">
          <div className="divide-y divide-[#EDEFF3]">
            {q.data.compliance.map((c) => (
              <div key={c.what} className="px-4 py-2 flex items-center justify-between text-[13px]">
                <span className="text-[#16264A]">{c.what}</span>
                <span className={PAPER_STYLE[c.state]}>{c.state === 'missing' ? 'not on record' : `${c.state} ${day(c.till)}`}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Routes">
        {q.data.routes.length === 0 ? <div className="p-6"><EmptyState title="No routes yet" description="Add vehicles and crew, then routes with their stops and fares." /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Route</Th><Th>Bus</Th><Th>Driver</Th><Th>Seats</Th><Th>Today</Th></tr></thead>
            <tbody>{q.data.routes.map((r) => (
              <tr key={r.id} className={`border-b border-[#EDEFF3] align-top ${r.active ? '' : 'opacity-60'}`}>
                <td className="px-3 py-2.5"><p className="font-semibold text-[#16264A]">{r.routeNo} · {r.name}</p><p className="text-[11px] text-[#5A6577]">{r.stops} stops{r.first ? ` · first pickup ${r.first}` : ''}{r.active ? '' : ' · stopped'}</p>{r.blockers.map((b) => <p key={b} className="text-[11px] text-[#A8242C]">⚠ {b}</p>)}</td>
                <td className="px-3 py-2.5 font-mono text-[12px]">{r.vehicle?.regNo ?? '—'}</td>
                <td className="px-3 py-2.5 text-[12px]">{r.driver ? <>{r.driver.name}<p className="text-[#5A6577]">{r.driver.phone}</p></> : '—'}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.vehicle ? `${r.seatsTaken} / ${r.vehicle.capacity}` : '—'}</td>
                <td className="px-3 py-2.5 text-[12px]">{r.today.length === 0 ? <span className="text-[#5A6577]">No run yet</span> : r.today.map((t) => <p key={t.shift}>{t.shift.toLowerCase()}: {t.status.toLowerCase()}</p>)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export function RoutesTab() {
  const routes = useRoutes();
  const { canOps, senior } = useTransportRole();
  const [editing, setEditing] = useState<Route | 'new' | null>(null);
  const remove = useTransportAction((id: string) => del(`/routes/${id}`));
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {routes.data && routes.data.length > 0 && <Button size="sm" variant="secondary" onClick={() => downloadCSV('bus-routes', routes.data!.flatMap((r) => r.stops.map((s) => ({ route: r.routeNo, name: r.name, bus: r.vehicle?.regNo ?? '', driver: r.driver?.name ?? '', stop: s.name, order: s.order + 1, time: s.time, fare: s.fare, riders: s.riders ?? 0 }))))}>Export stops</Button>}
        {canOps && <Button size="sm" onClick={() => setEditing('new')}>+ Route</Button>}
      </div>
      {routes.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : routes.isError ? <InlineAlert type="error">{errText(routes.error)}</InlineAlert> : (routes.data ?? []).length === 0 ? <EmptyState title="No routes yet" /> : (
        <div className="grid lg:grid-cols-2 gap-4">
          {routes.data!.map((r) => (
            <Panel key={r.id} title={`${r.routeNo} · ${r.name}${r.active ? '' : ' (stopped)'}`} action={canOps ? <div className="flex gap-2">{senior && <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(r.id, { onSuccess: () => toast.success(`${r.routeNo} deleted`), onError: (e) => toast.error(errText(e)) })}>Delete</Button>}<Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Edit</Button></div> : undefined}>
              <div className="px-4 py-2 text-[12px] text-[#5A6577]">
                Bus <span className="font-mono text-[#16264A]">{r.vehicle?.regNo ?? 'not assigned'}</span>{r.vehicle ? ` (${r.seatsTaken}/${r.vehicle.capacity} seats)` : ''} · Driver {r.driver?.name ?? 'not assigned'} · Attendant {r.attendant?.name ?? 'none'}
              </div>
              <table className="w-full text-[13px]">
                <thead><tr className="border-y border-[#EDEFF3]"><Th>#</Th><Th>Stop</Th><Th>Pickup</Th><Th right>Fare / term</Th><Th right>Riders</Th></tr></thead>
                <tbody>{r.stops.map((s) => (
                  <tr key={s.id} className="border-b border-[#EDEFF3] last:border-0"><td className="px-3 py-1.5 text-[#5A6577]">{s.order + 1}</td><td className="px-3 py-1.5">{s.name}</td><td className="px-3 py-1.5 font-mono">{s.time}</td><td className="px-3 py-1.5 text-right tabular-nums">{s.fare ? rupees(s.fare) : '—'}</td><td className="px-3 py-1.5 text-right tabular-nums">{s.riders ?? 0}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
          ))}
        </div>
      )}
      {editing && <RouteForm route={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type StopRow = { id?: string; name: string; time: string; fare: string };

function RouteForm({ route, onClose }: { route: Route | null; onClose: () => void }) {
  const vehicles = useVehicles();
  const crew = useCrew();
  const [f, setF] = useState({ routeNo: route?.routeNo ?? '', name: route?.name ?? '', vehicleId: route?.vehicleId ?? '', driverId: route?.driverId ?? '', attendantId: route?.attendantId ?? '', active: route?.active ?? true });
  const [stops, setStops] = useState<StopRow[]>(route ? route.stops.map((s) => ({ id: s.id, name: s.name, time: s.time, fare: String(s.fare) })) : [{ name: '', time: '07:30', fare: '0' }, { name: '', time: '08:30', fare: '0' }]);
  const save = useTransportAction(() => {
    const body = { routeNo: f.routeNo.trim(), name: f.name.trim(), vehicleId: f.vehicleId || null, driverId: f.driverId || null, attendantId: f.attendantId || null, active: f.active, stops: stops.map((s) => ({ ...(s.id ? { id: s.id } : {}), name: s.name.trim(), time: s.time, fare: Number(s.fare) || 0 })) };
    return route ? put(`/routes/${route.id}`, body) : post('/routes', body);
  });
  const set = (i: number, patch_: Partial<StopRow>) => setStops((x) => x.map((s, j) => (j === i ? { ...s, ...patch_ } : s)));
  const move = (i: number, d: -1 | 1) => setStops((x) => { const y = [...x]; const [s] = y.splice(i, 1); y.splice(i + d, 0, s!); return y; });
  const valid = f.routeNo.trim() && f.name.trim().length >= 2 && stops.length >= 2 && stops.every((s) => s.name.trim().length >= 2 && /^\d{2}:\d{2}$/.test(s.time) && Number(s.fare) >= 0);
  return (
    <Modal open onClose={onClose} title={route ? `Edit route ${route.routeNo}` : 'Add a route'} width="760px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined, { onSuccess: () => { toast.success(route ? 'Route saved' : 'Route added'); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Save</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Input label="Route number" value={f.routeNo} onChange={(e) => setF({ ...f, routeNo: e.target.value })} placeholder="R-07" />
          <div className="col-span-2"><Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sector 4 — Model College" /></div>
          <Select label="Vehicle" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">Not assigned</option>{(vehicles.data ?? []).filter((v) => v.status !== 'RETIRED').map((v) => <option key={v.id} value={v.id}>{v.regNo} · {v.capacity} seats{v.status !== 'ACTIVE' ? ` (${v.status.toLowerCase()})` : ''}</option>)}</Select>
          <Select label="Driver" value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}><option value="">Not assigned</option>{(crew.data ?? []).filter((c) => c.role === 'DRIVER' && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="Attendant" value={f.attendantId} onChange={(e) => setF({ ...f, attendantId: e.target.value })}><option value="">None</option>{(crew.data ?? []).filter((c) => c.role === 'ATTENDANT' && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </div>
        {route && <Checkbox label="Running (untick to stop the route; only possible with no passes on it)" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        <div>
          <div className="flex items-center justify-between mb-1"><p className="text-[13px] font-medium text-[#16264A]">Stops, in the morning order, with the pickup time and the fare for a term</p><button onClick={() => setStops((x) => [...x, { name: '', time: '', fare: '0' }])} className="text-[12px] text-[#E0952A] cursor-pointer">+ Stop</button></div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {stops.map((s, i) => (
              <div key={s.id ?? `n${i}`} className="flex items-center gap-2">
                <span className="w-5 text-[12px] text-[#5A6577]">{i + 1}</span>
                <input value={s.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Stop name" className="flex-1 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
                <input type="time" value={s.time} onChange={(e) => set(i, { time: e.target.value })} className="w-28 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
                <input type="number" min={0} value={s.fare} onChange={(e) => set(i, { fare: e.target.value })} title="Fare per term (₹)" className="w-24 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
                <button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-[#5A6577] cursor-pointer disabled:opacity-30" aria-label="Up">↑</button>
                <button disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="px-1 text-[#5A6577] cursor-pointer disabled:opacity-30" aria-label="Down">↓</button>
                <button disabled={stops.length <= 2} onClick={() => setStops((x) => x.filter((_, j) => j !== i))} className="px-1 text-[#A8242C] cursor-pointer disabled:opacity-30" aria-label="Remove">✕</button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#5A6577] mt-1">Times must run in order. A stop students board at cannot be removed until they are moved; renaming or re-timing it keeps their passes.</p>
        </div>
      </div>
    </Modal>
  );
}

// ─── Fleet ───────────────────────────────────────────────────────────────────

export function FleetTab() {
  const v = useVehicles();
  const { canOps } = useTransportRole();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [logs, setLogs] = useState<Vehicle | null>(null);
  const rows = v.data ?? [];
  return (
    <Panel action={<div className="flex gap-2 w-full justify-end">
      {rows.length > 0 && <Button size="sm" variant="secondary" onClick={() => downloadCSV('fleet', rows.map((x) => ({ regNo: x.regNo, kind: x.kind, make: x.make ?? '', seats: x.capacity, ownership: x.ownership, operator: x.operator ?? '', fitness: isoDay(x.fitnessValidTill), insurance: isoDay(x.insuranceValidTill), permit: isoDay(x.permitValidTill), puc: isoDay(x.pucValidTill), odometer: x.odometer, status: x.status, routes: x.routes.join(' ') })))}>Export CSV</Button>}
      {canOps && <Button size="sm" onClick={() => setEditing('new')}>+ Vehicle</Button>}
    </div>}>
      {v.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : v.isError ? <div className="p-4"><InlineAlert type="error">{errText(v.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No vehicles yet" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Vehicle</Th><Th>Seats</Th><Th>Papers</Th><Th>Odometer</Th><Th>Routes</Th><Th /></tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.id} className={`border-b border-[#EDEFF3] align-top ${x.status === 'RETIRED' ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2.5"><p className="font-mono font-semibold text-[#16264A]">{x.regNo}</p><p className="text-[11px] text-[#5A6577]">{x.kind.toLowerCase()}{x.make ? ` · ${x.make}` : ''} · {x.ownership === 'HIRED' ? `hired${x.operator ? ` from ${x.operator}` : ''}` : 'owned'}</p>{x.status !== 'ACTIVE' && <Pill className="bg-amber-100 text-amber-800">{x.status.toLowerCase()}</Pill>}</td>
                <td className="px-3 py-2.5 tabular-nums">{x.capacity}</td>
                <td className="px-3 py-2.5 text-[12px]">{x.papers.map((p) => <p key={p.name} className={PAPER_STYLE[p.state]}>{p.name}: {p.till ? day(p.till) : 'not on record'}</p>)}</td>
                <td className="px-3 py-2.5 tabular-nums text-[12px]">{x.odometer.toLocaleString('en-IN')} km{x.lastLog ? <p className="text-[#5A6577]">last {x.lastLog.kind.toLowerCase()} {day(x.lastLog.date)}</p> : null}</td>
                <td className="px-3 py-2.5 text-[12px]">{x.routes.join(', ') || '—'}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => setLogs(x)}>Log book</Button>{canOps && <Button size="sm" variant="ghost" onClick={() => setEditing(x)}>Edit</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {editing && <VehicleForm vehicle={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {logs && <LogBook vehicle={logs} onClose={() => setLogs(null)} />}
    </Panel>
  );
}

function VehicleForm({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const [f, setF] = useState({
    regNo: vehicle?.regNo ?? '', kind: vehicle?.kind ?? 'BUS', make: vehicle?.make ?? '', capacity: String(vehicle?.capacity ?? 40), ownership: vehicle?.ownership ?? 'OWNED', operator: vehicle?.operator ?? '',
    fitness: isoDay(vehicle?.fitnessValidTill), insurance: isoDay(vehicle?.insuranceValidTill), permit: isoDay(vehicle?.permitValidTill), puc: isoDay(vehicle?.pucValidTill),
    gps: vehicle?.gpsDeviceId ?? '', odometer: String(vehicle?.odometer ?? 0), status: vehicle?.status ?? 'ACTIVE', notes: vehicle?.notes ?? '',
  });
  const save = useTransportAction(() => {
    const body = { kind: f.kind, make: f.make.trim() || null, capacity: Number(f.capacity), ownership: f.ownership, operator: f.operator.trim() || null, fitnessValidTill: f.fitness || null, insuranceValidTill: f.insurance || null, permitValidTill: f.permit || null, pucValidTill: f.puc || null, gpsDeviceId: f.gps.trim() || null, odometer: Number(f.odometer) || 0, notes: f.notes.trim() || null };
    return vehicle ? patch(`/vehicles/${vehicle.id}`, { ...body, status: f.status }) : post('/vehicles', { ...body, regNo: f.regNo.trim() });
  });
  const valid = (vehicle || f.regNo.trim().length >= 6) && Number(f.capacity) >= 4 && Number(f.capacity) <= 90 && Number(f.odometer) >= 0;
  return (
    <Modal open onClose={onClose} title={vehicle ? `Edit ${vehicle.regNo}` : 'Add a vehicle'} width="640px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined, { onSuccess: () => { toast.success('Vehicle saved'); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Save</Button></>}>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Registration" value={f.regNo} disabled={!!vehicle} onChange={(e) => setF({ ...f, regNo: e.target.value })} placeholder="MP07-GC-4892" />
        <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="BUS">Bus</option><option value="MINIBUS">Minibus</option><option value="VAN">Van</option></Select>
        <Input label="Seats for students" type="number" min={4} max={90} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        <Input label="Make / model" value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} />
        <Select label="Ownership" value={f.ownership} onChange={(e) => setF({ ...f, ownership: e.target.value })}><option value="OWNED">Owned</option><option value="HIRED">Hired</option></Select>
        <Input label="Operator (if hired)" value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })} />
        <Input label="Fitness valid till" type="date" value={f.fitness} onChange={(e) => setF({ ...f, fitness: e.target.value })} />
        <Input label="Insurance valid till" type="date" value={f.insurance} onChange={(e) => setF({ ...f, insurance: e.target.value })} />
        <Input label="Permit valid till" type="date" value={f.permit} onChange={(e) => setF({ ...f, permit: e.target.value })} />
        <Input label="PUC valid till" type="date" value={f.puc} onChange={(e) => setF({ ...f, puc: e.target.value })} />
        <Input label="Odometer (km)" type="number" min={0} value={f.odometer} onChange={(e) => setF({ ...f, odometer: e.target.value })} />
        <Input label="GPS device id (optional)" value={f.gps} onChange={(e) => setF({ ...f, gps: e.target.value })} />
        {vehicle && <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Vehicle['status'] })}><option value="ACTIVE">In service</option><option value="MAINTENANCE">Under maintenance</option><option value="RETIRED">Retired</option></Select>}
        <div className={vehicle ? 'col-span-2' : 'col-span-3'}><Input label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <p className="text-[12px] text-[#5A6577] mt-3">A bus with an expired fitness certificate, insurance, permit or PUC cannot start a trip.</p>
    </Modal>
  );
}

function LogBook({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const q = useVehicleLogs(vehicle.id);
  const { canOps } = useTransportRole();
  const [f, setF] = useState({ kind: 'FUEL', date: new Date().toISOString().slice(0, 10), odometer: '', litres: '', cost: '', vendor: '', notes: '' });
  const add = useTransportAction(() => post(`/vehicles/${vehicle.id}/logs`, { kind: f.kind, date: f.date, ...(f.odometer ? { odometer: Number(f.odometer) } : {}), ...(f.litres ? { litres: Number(f.litres) } : {}), cost: Number(f.cost) || 0, ...(f.vendor.trim() ? { vendor: f.vendor.trim() } : {}), ...(f.notes.trim() ? { notes: f.notes.trim() } : {}) }));
  const valid = f.date && Number(f.cost) >= 0 && f.cost !== '' && (f.kind !== 'FUEL' || Number(f.litres) > 0);
  return (
    <Drawer open onClose={onClose} title={`Log book — ${vehicle.regNo}`}>
      <div className="space-y-4 text-[13px]">
        {canOps && (
          <div className="space-y-2 border border-[#D3D8E0] rounded-[4px] p-3">
            <div className="grid grid-cols-2 gap-2">
              <Select label="Entry" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="FUEL">Fuel</option><option value="SERVICE">Service</option><option value="REPAIR">Repair</option><option value="INSPECTION">Inspection</option><option value="TYRE">Tyres</option></Select>
              <Input label="Date" type="date" value={f.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, date: e.target.value })} />
              <Input label="Odometer (km)" type="number" value={f.odometer} onChange={(e) => setF({ ...f, odometer: e.target.value })} />
              {f.kind === 'FUEL' ? <Input label="Litres" type="number" value={f.litres} onChange={(e) => setF({ ...f, litres: e.target.value })} /> : <Input label="Vendor" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />}
              <Input label="Cost (₹)" type="number" min={0} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
              <Input label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
            <Button size="sm" loading={add.isPending} disabled={!valid} onClick={() => add.mutate(undefined, { onSuccess: () => { toast.success('Entry added'); setF({ ...f, odometer: '', litres: '', cost: '', vendor: '', notes: '' }); }, onError: (e) => toast.error(errText(e)) })}>Add entry</Button>
          </div>
        )}
        {q.isLoading ? <Spinner /> : q.isError ? <InlineAlert type="error">{errText(q.error)}</InlineAlert> : (
          <>
            <p className="text-[#5A6577]">Spent so far: <b className="text-[#16264A]">{rupees(q.data!.spend)}</b> over {q.data!.logs.length} entries</p>
            {q.data!.logs.length === 0 ? <p className="text-[#5A6577]">No entries yet.</p> : q.data!.logs.map((l) => (
              <div key={l.id} className="border-b border-[#EDEFF3] pb-2">
                <p className="text-[#16264A]"><b>{l.kind.toLowerCase()}</b> · {day(l.date)} · {rupees(l.cost)}{l.litres ? ` · ${l.litres} L` : ''}{l.kmpl ? ` · ${l.kmpl} km/L` : ''}</p>
                <p className="text-[11px] text-[#5A6577]">{l.odometer ? `${l.odometer.toLocaleString('en-IN')} km · ` : ''}{l.vendor ? `${l.vendor} · ` : ''}{l.notes ? `${l.notes} · ` : ''}{l.by}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </Drawer>
  );
}

// ─── Crew ────────────────────────────────────────────────────────────────────

export function CrewTab() {
  const q = useCrew();
  const { canOps } = useTransportRole();
  const [editing, setEditing] = useState<Crew | 'new' | null>(null);
  const soon = Date.now() + 30 * 86_400_000;
  return (
    <Panel action={canOps ? <div className="w-full flex justify-end"><Button size="sm" onClick={() => setEditing('new')}>+ Driver or attendant</Button></div> : undefined}>
      {q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : (q.data ?? []).length === 0 ? <div className="p-6"><EmptyState title="No crew yet" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Name</Th><Th>Role</Th><Th>Licence</Th><Th>Police verification</Th><Th>Routes</Th><Th /></tr></thead>
          <tbody>{q.data!.map((c) => {
            const lic = c.licenceValidTill ? new Date(c.licenceValidTill).getTime() : null;
            return (
              <tr key={c.id} className={`border-b border-[#EDEFF3] ${c.active ? '' : 'opacity-60'}`}>
                <td className="px-3 py-2.5"><p className="text-[#16264A] font-medium">{c.name}{c.active ? '' : ' (off duty)'}</p><p className="text-[11px] text-[#5A6577]">{c.phone}</p></td>
                <td className="px-3 py-2.5 text-[12px]">{c.role.toLowerCase()}</td>
                <td className="px-3 py-2.5 text-[12px]">{c.role === 'DRIVER' ? <><span className="font-mono">{c.licenceNo ?? '—'}</span><p className={lic === null ? 'text-[#A8242C]' : lic < Date.now() ? 'text-[#A8242C] font-semibold' : lic < soon ? 'text-amber-700' : 'text-[#5A6577]'}>{lic === null ? 'not on record' : `valid till ${day(c.licenceValidTill)}`}</p></> : '—'}</td>
                <td className={`px-3 py-2.5 text-[12px] ${c.verifiedOn ? '' : 'text-[#A8242C]'}`}>{c.verifiedOn ? day(c.verifiedOn) : 'not done'}</td>
                <td className="px-3 py-2.5 text-[12px]">{c.routes.join(', ') || '—'}</td>
                <td className="px-3 py-2.5 text-right">{canOps && <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      {editing && <CrewForm person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function CrewForm({ person, onClose }: { person: Crew | null; onClose: () => void }) {
  const [f, setF] = useState({ name: person?.name ?? '', phone: person?.phone ?? '', role: person?.role ?? 'DRIVER', licenceNo: person?.licenceNo ?? '', licenceValidTill: isoDay(person?.licenceValidTill), verifiedOn: isoDay(person?.verifiedOn), active: person?.active ?? true });
  const save = useTransportAction(() => {
    const body = { name: f.name.trim(), phone: f.phone.trim(), licenceNo: f.licenceNo.trim() || null, licenceValidTill: f.licenceValidTill || null, verifiedOn: f.verifiedOn || null };
    return person ? patch(`/crew/${person.id}`, { ...body, active: f.active }) : post('/crew', { ...body, role: f.role });
  });
  const valid = f.name.trim().length >= 2 && /^[0-9+\- ]{10,20}$/.test(f.phone.trim()) && (f.role !== 'DRIVER' || (f.licenceNo.trim() && f.licenceValidTill));
  return (
    <Modal open onClose={onClose} title={person ? `Edit ${person.name}` : 'Add a driver or attendant'}
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined, { onSuccess: () => { toast.success('Saved'); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Select label="Role" value={f.role} disabled={!!person} onChange={(e) => setF({ ...f, role: e.target.value as Crew['role'] })}><option value="DRIVER">Driver</option><option value="ATTENDANT">Attendant</option></Select>
        <Input label="Police verification on" type="date" value={f.verifiedOn} onChange={(e) => setF({ ...f, verifiedOn: e.target.value })} />
        {f.role === 'DRIVER' && <><Input label="Licence number" value={f.licenceNo} onChange={(e) => setF({ ...f, licenceNo: e.target.value })} /><Input label="Licence valid till" type="date" value={f.licenceValidTill} onChange={(e) => setF({ ...f, licenceValidTill: e.target.value })} /></>}
        {person && <div className="col-span-2"><Checkbox label="On active duty" checked={f.active} onChange={(v) => setF({ ...f, active: v })} /></div>}
      </div>
    </Modal>
  );
}

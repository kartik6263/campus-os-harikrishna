import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { api } from '../../lib/api';
import { downloadCSV } from '../../lib/export';
import {
  PASS_LABEL, PASS_STYLE, day, delayText, post, rupees, time, todayIst, useIncidents, usePasses, useRequests, useRoutes, useTransportAction, useTrip, useTrips,
  type Pass, type Request, type Trip,
} from '../../lib/transport';
import type { RegisterRow } from '../../lib/lifecycle';
import { Panel, Pill, Th, errText, useDebounced } from '../hostel/common';
import { useTransportRole } from './Setup';

// ─── Passes and requests ─────────────────────────────────────────────────────

export function PassesTab() {
  const routes = useRoutes();
  const { canOps } = useTransportRole();
  const [routeId, setRouteId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const passes = usePasses({ routeId: routeId || undefined, status: status || undefined, q: search.length >= 2 ? search : undefined });
  const requests = useRequests('PENDING');
  const [deciding, setDeciding] = useState<Request | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState<Pass | null>(null);
  const rows = passes.data ?? [];
  return (
    <div className="space-y-4">
      {(requests.data ?? []).length > 0 && (
        <Panel title={`Requests waiting (${requests.data!.length})`}>
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Request</Th><Th>Student</Th><Th>Wants</Th><Th>Fare</Th><Th>Seats left</Th><Th /></tr></thead>
            <tbody>{requests.data!.map((r) => (
              <tr key={r.id} className="border-b border-[#EDEFF3]">
                <td className="px-3 py-2.5 font-mono text-[12px]">{r.requestNo}<p className="font-sans text-[11px] text-[#5A6577]">{r.kind === 'CHANGE' ? 'Move' : 'New pass'} · {day(r.createdAt)}</p></td>
                <td className="px-3 py-2.5">{r.student.name}<p className="text-[11px] text-[#5A6577] font-mono">{r.student.enrolmentNo}</p></td>
                <td className="px-3 py-2.5">{r.route.routeNo} / {r.stop.name}{r.note ? <p className="text-[11px] text-[#5A6577]">{r.note}</p> : null}</td>
                <td className="px-3 py-2.5 tabular-nums">{rupees(r.stop.fare)}</td>
                <td className={`px-3 py-2.5 tabular-nums ${r.seatsLeft <= 0 ? 'text-[#A8242C] font-semibold' : ''}`}>{r.seatsLeft}</td>
                <td className="px-3 py-2.5 text-right">{canOps && <Button size="sm" onClick={() => setDeciding(r)}>Decide</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </Panel>
      )}
      <Panel action={
        <div className="flex flex-wrap items-end gap-3 w-full">
          <div className="w-52"><Select label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">All routes</option>{(routes.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}</Select></div>
          <div className="w-40"><Select label="State" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="ACTIVE">Active</option><option value="PENDING_PAYMENT">Fee unpaid</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option></Select></div>
          <div className="w-56"><Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number or pass no." /></div>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('bus-passes', rows.map((p) => ({ pass: p.passNo, student: p.student.name, enrolmentNo: p.student.enrolmentNo, mobile: p.student.mobile ?? '', route: p.route.routeNo, stop: p.stop?.name ?? '', term: p.term ?? '', fee: p.fee, feeDue: p.feeDue, state: p.state, validTill: p.validTill.slice(0, 10) })))}>Export CSV</Button>
          {canOps && <Button size="sm" onClick={() => setIssuing(true)}>+ Issue at the desk</Button>}
        </div>
      }>
        {passes.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : passes.isError ? <div className="p-4"><InlineAlert type="error">{errText(passes.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No passes match" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Pass</Th><Th>Student</Th><Th>Route / stop</Th><Th>Fee</Th><Th>Valid till</Th><Th>State</Th><Th /></tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id} className="border-b border-[#EDEFF3]">
                  <td className="px-3 py-2.5 font-mono text-[12px]">{p.passNo}<p className="font-sans text-[11px] text-[#5A6577]">{p.term ?? ''}</p></td>
                  <td className="px-3 py-2.5">{p.student.name}<p className="text-[11px] text-[#5A6577]">{p.student.enrolmentNo} · {p.student.programme.shortName} {p.student.semester}</p></td>
                  <td className="px-3 py-2.5">{p.route.routeNo} / {p.stop?.name ?? '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{rupees(p.fee)}{p.feeDue ? <p className="text-[11px] text-[#A8242C]">{rupees(p.feeDue)} due</p> : null}</td>
                  <td className="px-3 py-2.5 text-[12px]">{day(p.validTill)}</td>
                  <td className="px-3 py-2.5"><Pill className={PASS_STYLE[p.state]}>{PASS_LABEL[p.state]}</Pill>{p.cancelledReason && <p className="text-[11px] text-[#5A6577] mt-1">{p.cancelledReason}</p>}</td>
                  <td className="px-3 py-2.5 text-right">{canOps && p.status !== 'CANCELLED' && <Button size="sm" variant="ghost" onClick={() => setCancelling(p)}>Cancel</Button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      {deciding && <DecideRequest r={deciding} onClose={() => setDeciding(null)} />}
      {issuing && <IssuePass onClose={() => setIssuing(false)} />}
      {cancelling && <CancelPass p={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}

function DecideRequest({ r, onClose }: { r: Request; onClose: () => void }) {
  const [note, setNote] = useState('');
  const act = useTransportAction((approve: boolean) => post<{ charged?: number; passNo?: string }>(`/requests/${r.id}/decide`, { approve, ...(note.trim() ? { note: note.trim() } : {}) }));
  const go = (approve: boolean) => act.mutate(approve, { onSuccess: (x) => { toast.success(approve ? `Pass ${x.passNo} issued${x.charged ? ` — ${rupees(x.charged)} charged; it activates when paid` : ''}` : 'Request declined'); onClose(); }, onError: (e) => toast.error(errText(e)) });
  return (
    <Modal open onClose={onClose} title={`${r.requestNo} — ${r.student.name}`}
      footer={<><Button size="sm" variant="ghost" loading={act.isPending} disabled={note.trim().length < 5} onClick={() => go(false)}>Decline</Button><Button size="sm" loading={act.isPending} disabled={r.seatsLeft <= 0 && r.kind === 'NEW'} onClick={() => go(true)}>Approve</Button></>}>
      <div className="space-y-3 text-[13px]">
        <p>{r.kind === 'CHANGE' ? 'Move to' : 'New pass on'} <b>{r.route.routeNo} · {r.route.name}</b>, boarding at <b>{r.stop.name}</b>, for {r.term}.</p>
        <p>Fare {rupees(r.stop.fare)} per term{r.kind === 'CHANGE' ? ' — only the difference is charged if it is more than what was paid' : ''}. The pass activates once the fee is paid.</p>
        {r.seatsLeft <= 0 && <InlineAlert type="warning">This route is full; it cannot take another rider until a seat frees.</InlineAlert>}
        <Input label="Note to the student (required to decline)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

function IssuePass({ onClose }: { onClose: () => void }) {
  const routes = useRoutes();
  const { senior } = useTransportRole();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [student, setStudent] = useState<RegisterRow | null>(null);
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');
  const [waive, setWaive] = useState(false);
  const [reason, setReason] = useState('');
  const list = useQuery({ queryKey: ['transport', 'pick', search], enabled: search.length >= 2, queryFn: () => api<{ students: RegisterRow[] }>(`/api/lifecycle/students?status=ACTIVE&q=${encodeURIComponent(search)}`) });
  const route = routes.data?.find((r) => r.id === routeId);
  const act = useTransportAction(() => post<{ passNo: string; charged: number }>('/passes', { studentId: student!.id, routeId, stopId, waiveFee: waive, ...(waive ? { reason: reason.trim() } : {}) }));
  const valid = student && routeId && stopId && (!waive || reason.trim().length >= 5);
  return (
    <Modal open onClose={onClose} title="Issue a pass at the desk" width="560px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={act.isPending} disabled={!valid} onClick={() => act.mutate(undefined, { onSuccess: (x) => { toast.success(`Pass ${x.passNo} issued${x.charged ? ` — ${rupees(x.charged)} charged` : ''}`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Issue</Button></>}>
      <div className="space-y-3">
        {student ? <div className="flex items-center justify-between border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px]"><span><b>{student.name}</b> <span className="font-mono text-[11px] text-[#5A6577]">{student.enrolmentNo}</span></span><button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => setStudent(null)}>Change</button></div> : (
          <>
            <Input label="Student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or enrolment number" />
            {list.isLoading && <Spinner />}
            <div className="max-h-40 overflow-y-auto divide-y divide-[#EDEFF3]">{(list.data?.students ?? []).map((s) => <button key={s.id} onClick={() => setStudent(s)} className="w-full text-left px-2 py-1.5 hover:bg-[#FEF9EC] cursor-pointer text-[13px]">{s.name} <span className="font-mono text-[11px] text-[#5A6577]">{s.enrolmentNo}</span></button>)}</div>
          </>
        )}
        <Select label="Route" value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(''); }}><option value="">Choose…</option>{(routes.data ?? []).filter((r) => r.active && r.vehicle).map((r) => <option key={r.id} value={r.id}>{r.routeNo} · {r.name} ({r.vehicle!.capacity - r.seatsTaken} seats left)</option>)}</Select>
        <Select label="Boards at" value={stopId} onChange={(e) => setStopId(e.target.value)} disabled={!route}><option value="">Choose…</option>{route?.stops.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.time} · {rupees(s.fare)}</option>)}</Select>
        {senior && <label className="flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive the fee (concession)</label>}
        {waive && <Input label="Reason and authority (required)" value={reason} onChange={(e) => setReason(e.target.value)} />}
      </div>
    </Modal>
  );
}

function CancelPass({ p, onClose }: { p: Pass; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const act = useTransportAction(() => post(`/passes/${p.id}/cancel`, { reason: reason.trim() }));
  return (
    <Modal open onClose={onClose} title={`Cancel ${p.passNo} — ${p.student.name}`}
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Back</Button><Button size="sm" variant="destructive" loading={act.isPending} disabled={reason.trim().length < 5} onClick={() => act.mutate(undefined, { onSuccess: () => { toast.success('Pass cancelled; the seat is free'); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Cancel pass</Button></>}>
      <div className="space-y-3">
        <InlineAlert type="warning">The seat frees at once. An unpaid fee for this pass is withdrawn; a paid one stays on the account (refunds go through accounts).</InlineAlert>
        <Input label="Reason (the student sees it)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

// ─── Trips ───────────────────────────────────────────────────────────────────

export function TripsTab() {
  const { canOps, senior } = useTransportRole();
  const [date, setDate] = useState(todayIst());
  const trips = useTrips(date);
  const routes = useRoutes();
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState<{ routeId: string; shift: 'MORNING' | 'EVENING' } | null>(null);
  const [alerting, setAlerting] = useState(false);
  const isToday = date === todayIst();
  const list = trips.data?.trips ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Input label="Day" type="date" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex-1" />
        {canOps && <Button size="sm" variant="secondary" onClick={() => setAlerting(true)}>Alert a route's riders</Button>}
      </div>
      {isToday && canOps && (
        <Panel title="Start a run">
          <div className="p-3 flex flex-wrap gap-2">
            {(routes.data ?? []).filter((r) => r.active).map((r) => (['MORNING', 'EVENING'] as const).map((shift) => {
              const done = list.some((t) => t.routeId === r.id && t.shift === shift);
              return <Button key={r.id + shift} size="sm" variant="secondary" disabled={done} onClick={() => setStarting({ routeId: r.id, shift })}>{r.routeNo} {shift.toLowerCase()}{done ? ' ✓' : ''}</Button>;
            }))}
          </div>
        </Panel>
      )}
      <Panel title={`Runs on ${day(date)}`}>
        {trips.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : trips.isError ? <div className="p-4"><InlineAlert type="error">{errText(trips.error)}</InlineAlert></div> : list.length === 0 ? <div className="p-6"><EmptyState title="No runs that day" /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Route</Th><Th>Run</Th><Th>Where</Th><Th>Boarded</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{list.map((t) => {
              const last = t.lastStop >= 0 ? t.stops[t.lastStop] : null;
              return (
                <tr key={t.id} className="border-b border-[#EDEFF3]">
                  <td className="px-3 py-2.5">{t.route.routeNo} · {t.route.name}<p className="text-[11px] text-[#5A6577]">{t.route.vehicle?.regNo ?? ''}</p></td>
                  <td className="px-3 py-2.5 text-[12px]">{t.shift.toLowerCase()}<p className="text-[#5A6577]">from {time(t.startedAt)}{t.endedAt ? ` to ${time(t.endedAt)}` : ''}</p></td>
                  <td className="px-3 py-2.5 text-[12px]">{last ? <>left {last.name} at {time(last.departedAt)}{last.delayMinutes !== null ? <p className={last.delayMinutes > 5 ? 'text-[#A8242C]' : 'text-[#5A6577]'}>{delayText(last.delayMinutes)}</p> : null}</> : 'Not yet left'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{t.boarded} / {typeof t.riders === 'number' ? t.riders : t.riders.length}</td>
                  <td className="px-3 py-2.5"><Pill className={t.status === 'RUNNING' ? 'bg-blue-100 text-blue-700' : t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{t.status.toLowerCase()}</Pill>{t.note && <p className="text-[11px] text-[#5A6577] mt-1">{t.note}</p>}</td>
                  <td className="px-3 py-2.5 text-right"><Button size="sm" variant={t.status === 'RUNNING' ? 'primary' : 'ghost'} onClick={() => setOpen(t.id)}>{t.status === 'RUNNING' && canOps ? 'Run it' : 'View'}</Button></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Panel>
      {open && <TripDrawer id={open} onClose={() => setOpen(null)} />}
      {starting && <StartTrip {...starting} senior={senior} onClose={() => setStarting(null)} />}
      {alerting && <AlertRiders onClose={() => setAlerting(false)} />}
    </div>
  );
}

function StartTrip({ routeId, shift, senior, onClose }: { routeId: string; shift: 'MORNING' | 'EVENING'; senior: boolean; onClose: () => void }) {
  const [odo, setOdo] = useState('');
  const [blocked, setBlocked] = useState<string | null>(null);
  const [override, setOverride] = useState('');
  const act = useTransportAction(() => post('/trips', { routeId, shift, ...(odo ? { odometerStart: Number(odo) } : {}), ...(override.trim() ? { override: override.trim() } : {}) }));
  return (
    <Modal open onClose={onClose} title={`Start the ${shift.toLowerCase()} run`}
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={act.isPending} disabled={!!blocked && (!senior || override.trim().length < 10)} onClick={() => act.mutate(undefined, { onSuccess: () => { toast.success('Run started — riders can follow it now'); onClose(); }, onError: (e) => { const m = errText(e); if (/cannot start/.test(m)) setBlocked(m); else toast.error(m); } })}>{blocked ? 'Start on record' : 'Start'}</Button></>}>
      <div className="space-y-3">
        <Input label="Odometer at start (km, optional)" type="number" min={0} value={odo} onChange={(e) => setOdo(e.target.value)} />
        {blocked && <InlineAlert type="error">{blocked}</InlineAlert>}
        {blocked && (senior ? <Input label="Reason for starting anyway (written to the audit trail)" value={override} onChange={(e) => setOverride(e.target.value)} /> : <p className="text-[12px] text-[#5A6577]">Fix the papers or assign another driver or vehicle under Routes. Only the registrar can start past these checks.</p>)}
      </div>
    </Modal>
  );
}

function TripDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useTrip(id);
  const { canOps } = useTransportRole();
  const [passNo, setPassNo] = useState('');
  const [odo, setOdo] = useState('');
  const [reason, setReason] = useState('');
  const depart = useTransportAction((index: number) => post<{ stop: string; delayMinutes: number | null }>(`/trips/${id}/depart`, { index }));
  const board = useTransportAction(() => post<{ student: string }>(`/trips/${id}/board`, { passNo: passNo.trim() }));
  const end = useTransportAction(() => post(`/trips/${id}/end`, odo ? { odometerEnd: Number(odo) } : {}));
  const cancel = useTransportAction(() => post<{ alerted: number }>(`/trips/${id}/cancel`, { reason: reason.trim() }));
  const t = q.data as Trip | undefined;
  const live = t?.status === 'RUNNING' && canOps;
  const riders = Array.isArray(t?.riders) ? t!.riders : [];
  return (
    <Drawer open onClose={onClose} title={t ? `${t.route.routeNo} · ${t.shift.toLowerCase()} run` : 'Run'}>
      {q.isLoading || !t ? <Spinner /> : (
        <div className="space-y-4 text-[13px]">
          <p className="text-[#5A6577]">{t.route.vehicle?.regNo} · started {time(t.startedAt)} by {t.startedBy}{t.note ? ` · ${t.note}` : ''}</p>
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Stops</p>
            {t.stops.map((s, i) => (
              <div key={s.stopId} className="flex items-center gap-2 py-1.5 border-b border-[#EDEFF3]">
                <span className={`w-2.5 h-2.5 rounded-full ${s.departedAt ? 'bg-[#0E7A5F]' : s.skipped ? 'bg-[#D3D8E0]' : 'border border-[#5A6577]'}`} />
                <div className="flex-1"><p className="text-[#16264A]">{s.name}</p><p className="text-[11px] text-[#5A6577]">{s.scheduled ? `due ${s.scheduled} · ` : ''}{s.departedAt ? `left ${time(s.departedAt)}${s.delayMinutes !== null ? ` (${delayText(s.delayMinutes)})` : ''}` : s.skipped ? 'passed over' : s.eta ? `expected ${s.eta}` : ''}</p></div>
                {live && !s.departedAt && i > t.lastStop && <Button size="sm" variant={i === t.lastStop + 1 ? 'primary' : 'ghost'} loading={depart.isPending} onClick={() => depart.mutate(i, { onSuccess: (r) => toast.success(`Left ${r.stop}${r.delayMinutes !== null ? ` — ${delayText(r.delayMinutes)}` : ''}`), onError: (e) => toast.error(errText(e)) })}>Left</Button>}
              </div>
            ))}
          </div>
          {live && (
            <div className="flex gap-2 items-end">
              <div className="flex-1"><Input label="Board by pass number" value={passNo} onChange={(e) => setPassNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && passNo.trim() && board.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.student} on board`); setPassNo(''); }, onError: (err) => toast.error(errText(err)) })} placeholder="BP/2026/000012" /></div>
              <Button size="sm" loading={board.isPending} disabled={!passNo.trim()} onClick={() => board.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.student} on board`); setPassNo(''); }, onError: (e) => toast.error(errText(e)) })}>Board</Button>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Riders ({t.boardings.length} of {riders.length} on board)</p>
            {riders.length === 0 ? <p className="text-[#5A6577]">No active passes on this route.</p> : riders.map((r) => (
              <p key={r.passNo} className="py-1 flex justify-between"><span>{r.student.name} <span className="text-[11px] text-[#5A6577]">· {r.stop ?? ''}</span></span><span className={r.boarded ? 'text-[#0E7A5F]' : 'text-[#5A6577]'}>{r.boarded ? '✓ on board' : '—'}</span></p>
            ))}
          </div>
          {live && (
            <div className="space-y-2 border-t border-[#EDEFF3] pt-3">
              <div className="flex gap-2 items-end"><div className="flex-1"><Input label="Odometer at end (optional)" type="number" value={odo} onChange={(e) => setOdo(e.target.value)} /></div><Button size="sm" loading={end.isPending} onClick={() => end.mutate(undefined, { onSuccess: () => { toast.success('Run completed'); onClose(); }, onError: (e) => toast.error(errText(e)) })}>End run</Button></div>
              <div className="flex gap-2 items-end"><div className="flex-1"><Input label="Cancel reason (riders are alerted)" value={reason} onChange={(e) => setReason(e.target.value)} /></div><Button size="sm" variant="destructive" loading={cancel.isPending} disabled={reason.trim().length < 5} onClick={() => cancel.mutate(undefined, { onSuccess: (r) => { toast.success(`Run cancelled; ${r.alerted} riders alerted`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Cancel run</Button></div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function AlertRiders({ onClose }: { onClose: () => void }) {
  const routes = useRoutes();
  const [routeId, setRouteId] = useState('');
  const [message, setMessage] = useState('');
  const act = useTransportAction(() => post<{ sent: number }>(`/routes/${routeId}/alert`, { message: message.trim() }));
  return (
    <Modal open onClose={onClose} title="Alert a route's riders"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={act.isPending} disabled={!routeId || message.trim().length < 5} onClick={() => act.mutate(undefined, { onSuccess: (r) => { toast.success(`Sent to ${r.sent} riders`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Send</Button></>}>
      <div className="space-y-3">
        <Select label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">Choose…</option>{(routes.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}</Select>
        <Input label="Message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. The bus is running 20 minutes late" />
      </div>
    </Modal>
  );
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export function IncidentsTab() {
  const { canOps } = useTransportRole();
  const [status, setStatus] = useState('OPEN');
  const q = useIncidents(status);
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const close = useTransportAction((id: string) => post(`/incidents/${id}/close`, { actionTaken: action.trim() }));
  const rows = q.data ?? [];
  return (
    <Panel action={<div className="flex flex-wrap items-end gap-3 w-full">
      <div className="w-36"><Select label="Showing" value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="">All</option></Select></div>
      <div className="flex-1" />
      <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('transport-incidents', rows.map((i) => ({ incident: i.incidentNo, kind: i.kind, severity: i.severity, route: i.route?.routeNo ?? '', vehicle: i.vehicle?.regNo ?? '', when: i.occurredAt.slice(0, 16), where: i.location ?? '', what: i.description, alerted: i.ridersAlerted, status: i.status, action: i.actionTaken ?? '' })))}>Export CSV</Button>
      {canOps && <Button size="sm" onClick={() => setAdding(true)}>+ Log incident</Button>}
    </div>}>
      {q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No incidents" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Incident</Th><Th>What</Th><Th>Severity</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>{rows.map((i) => (
            <tr key={i.id} className="border-b border-[#EDEFF3] align-top">
              <td className="px-3 py-2.5 font-mono text-[12px]">{i.incidentNo}<p className="font-sans text-[11px] text-[#5A6577]">{day(i.occurredAt)} {time(i.occurredAt)}</p></td>
              <td className="px-3 py-2.5 max-w-[360px]"><p className="font-medium text-[#16264A]">{i.kind.toLowerCase()}{i.route ? ` · ${i.route.routeNo}` : ''}{i.vehicle ? ` · ${i.vehicle.regNo}` : ''}</p><p className="text-[12px] text-[#5A6577]">{i.description}{i.location ? ` — ${i.location}` : ''}</p>{i.ridersAlerted ? <p className="text-[11px] text-[#5A6577]">{i.ridersAlerted} riders alerted</p> : null}{i.actionTaken && <p className="text-[12px] text-[#0E7A5F] mt-1">{i.actionTaken}</p>}</td>
              <td className={`px-3 py-2.5 text-[12px] ${['HIGH', 'CRITICAL'].includes(i.severity) ? 'text-[#A8242C] font-semibold' : ''}`}>{i.severity.toLowerCase()}</td>
              <td className="px-3 py-2.5 text-[12px]">{i.status.toLowerCase()}{i.closedBy ? <p className="text-[#5A6577]">{i.closedBy}</p> : null}</td>
              <td className="px-3 py-2.5 text-right">{canOps && i.status === 'OPEN' && (closing === i.id
                ? <div className="flex gap-1 items-center"><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action taken" className="h-8 px-2 text-[12px] border border-[#D3D8E0] rounded-[4px]" /><Button size="sm" loading={close.isPending} disabled={action.trim().length < 10} onClick={() => close.mutate(i.id, { onSuccess: () => { toast.success('Incident closed'); setClosing(null); setAction(''); }, onError: (e) => toast.error(errText(e)) })}>Close</Button></div>
                : <Button size="sm" variant="secondary" onClick={() => { setClosing(i.id); setAction(''); }}>Close…</Button>)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {adding && <AddIncident onClose={() => setAdding(false)} />}
    </Panel>
  );
}

function AddIncident({ onClose }: { onClose: () => void }) {
  const routes = useRoutes();
  const now = new Date(); now.setSeconds(0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [f, setF] = useState({ kind: 'BREAKDOWN', severity: 'MEDIUM', routeId: '', description: '', location: '', occurredAt: local, alert: '' });
  const route = routes.data?.find((r) => r.id === f.routeId);
  const act = useTransportAction(() => post<{ incidentNo: string; ridersAlerted: number }>('/incidents', {
    kind: f.kind, severity: f.severity, description: f.description.trim(), occurredAt: new Date(f.occurredAt).toISOString(),
    ...(f.routeId ? { routeId: f.routeId, ...(route?.vehicleId ? { vehicleId: route.vehicleId } : {}) } : {}), ...(f.location.trim() ? { location: f.location.trim() } : {}), ...(f.alert.trim() ? { alertRiders: f.alert.trim() } : {}),
  }));
  const valid = f.description.trim().length >= 10 && f.occurredAt && (!f.alert.trim() || (f.routeId && f.alert.trim().length >= 5));
  return (
    <Modal open onClose={onClose} title="Log an incident" width="560px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={act.isPending} disabled={!valid} onClick={() => act.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.incidentNo} logged${r.ridersAlerted ? `; ${r.ridersAlerted} riders alerted` : ''}`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Log</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['BREAKDOWN', 'ACCIDENT', 'DELAY', 'MISCONDUCT', 'MEDICAL', 'OTHER'].map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}</Select>
        <Select label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}</Select>
        <Select label="Route" value={f.routeId} onChange={(e) => setF({ ...f, routeId: e.target.value })}><option value="">Not on a route</option>{(routes.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}</Select>
        <Input label="When" type="datetime-local" value={f.occurredAt} max={local} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} />
        <div className="col-span-2"><Input label="What happened" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="col-span-2"><Input label="Where (optional)" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        <div className="col-span-2"><Input label="Message to the route's riders (optional)" value={f.alert} disabled={!f.routeId} onChange={(e) => setF({ ...f, alert: e.target.value })} placeholder="e.g. R-07 is delayed by 40 minutes; a relief bus is on the way" /></div>
      </div>
    </Modal>
  );
}

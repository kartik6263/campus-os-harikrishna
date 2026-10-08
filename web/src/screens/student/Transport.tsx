import { useState } from 'react';
import type { Module } from '../StudentPortal';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { downloadPdf } from '../../lib/export';
import { PASS_LABEL, PASS_STYLE, day, delayText, post, rupees, time, useMyTransport, useTransportAction, type MyTransport } from '../../lib/transport';

interface Props { onNavigate: (m: Module) => void }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>{action}</div>
      <div className="bg-white border-t border-b border-[#D3D8E0]">{children}</div>
    </div>
  );
}

/**
 * The student's bus: the pass and its fee, the route and crew, today's run
 * stop by stop with the times the bus actually left and the arrival it is
 * now expected at, whether they boarded, and asking for a pass or a move.
 */
export default function Transport({ onNavigate }: Props) {
  const q = useMyTransport();
  const [asking, setAsking] = useState(false);
  const cancel = useTransportAction((id: string) => post(`/me/requests/${id}/cancel`));
  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError || !q.data) return <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div>;
  const d = q.data;
  const p = d.pass;
  const open = d.requests.find((r) => r.status === 'PENDING');
  const usable = p && p.state === 'ACTIVE';

  async function passPdf() {
    if (!p) return;
    await downloadPdf({
      title: 'Bus pass', subtitle: `${p.route.routeNo} · ${p.route.name}`, reference: p.passNo, fileName: `bus-pass-${p.passNo.replace(/\//g, '-')}`, qr: p.passNo,
      sections: [{ fields: [['Student', d.student.name], ['Route', `${p.route.routeNo} · ${p.route.name}`], ['Boards at', p.stop ? `${p.stop.name} (${p.stop.time})` : '—'], ['Term', p.term ?? '—'], ['Valid till', day(p.validTill)], ['Bus', p.route.vehicle?.regNo ?? '—']] }, { text: ['Show this pass to the bus attendant. It is checked against the transport office records each time.'] }],
    });
  }

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-[#16264A] px-4 py-4 text-white">
        <h1 className="text-[20px] font-semibold">Transport</h1>
        {p ? <p className="text-[13px] text-white/70 mt-0.5">{p.route.routeNo} · {p.route.name}</p> : <p className="text-[13px] text-white/60 mt-0.5">You do not have a bus pass.</p>}
      </div>

      {p && (
        <Section label="Your pass">
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[14px] text-[#16264A] font-semibold">{p.passNo}</p>
                <p className="text-[12px] text-[#5A6577]">Boards at {p.stop?.name ?? '—'}{p.stop ? ` · ${p.stop.time}` : ''} · {p.term ?? ''} · valid till {day(p.validTill)}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${PASS_STYLE[p.state]}`}>{PASS_LABEL[p.state]}</span>
            </div>
            {p.state === 'PENDING_PAYMENT' && <InlineAlert type="warning">Pay {rupees(p.feeDue)}{p.feeDueDate ? ` by ${day(p.feeDueDate)}` : ''} to activate your pass. It activates as soon as the payment is received. <button className="underline cursor-pointer" onClick={() => onNavigate('fee')}>Go to Fees</button></InlineAlert>}
            {p.state === 'EXPIRED' && <InlineAlert type="info">Your pass has expired. Apply below for this term.</InlineAlert>}
            {p.state === 'CANCELLED' && <InlineAlert type="info">Cancelled{p.cancelledReason ? `: ${p.cancelledReason}` : ''}.</InlineAlert>}
            {usable && <Button size="sm" variant="secondary" onClick={() => void passPdf()}>Download pass</Button>}
          </div>
        </Section>
      )}

      {usable && <LiveSection d={d} />}

      {p && (
        <Section label="Bus and crew">
          <div className="px-4 py-3 text-[13px] space-y-1">
            <p>Bus <span className="font-mono">{p.route.vehicle?.regNo ?? 'not assigned'}</span>{p.route.vehicle?.make ? ` · ${p.route.vehicle.make}` : ''}</p>
            {p.route.driver && <p>Driver {p.route.driver.name} · <a className="text-[#E0952A]" href={`tel:${p.route.driver.phone.replace(/\s/g, '')}`}>{p.route.driver.phone}</a></p>}
            {p.route.attendant && <p>Attendant {p.route.attendant.name} · <a className="text-[#E0952A]" href={`tel:${p.route.attendant.phone.replace(/\s/g, '')}`}>{p.route.attendant.phone}</a></p>}
          </div>
        </Section>
      )}

      {d.boardings.length > 0 && (
        <Section label="Recent boardings">
          {d.boardings.map((b) => <p key={b.at} className="px-4 py-2 text-[12px] border-b border-[#EDEFF3] last:border-0">{day(b.at)} · {b.shift.toLowerCase()} · boarded {time(b.at)}</p>)}
        </Section>
      )}

      <Section label={p && usable ? 'Change route or stop' : 'Apply for a bus pass'} action={!open && d.student.onRolls ? <button onClick={() => setAsking(true)} className="text-[12px] text-[#E0952A] font-medium cursor-pointer">{p && usable ? 'Ask to move' : 'Apply'}</button> : undefined}>
        {open ? (
          <div className="px-4 py-3">
            <p className="text-[13px] text-[#16264A]"><span className="font-mono">{open.requestNo}</span> · with the transport desk</p>
            <p className="text-[12px] text-[#5A6577]">{open.route.routeNo} / {open.stop.name} · {rupees(open.stop.fare)}</p>
            <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(open.id, { onSuccess: () => toast.success('Request withdrawn'), onError: (e) => toast.error(errText(e)) })}>Withdraw</Button>
          </div>
        ) : !d.student.onRolls ? <p className="px-4 py-3 text-[13px] text-[#5A6577]">Only students on the rolls can apply.</p>
          : d.routes.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#5A6577]">No route is taking riders at the moment.</p>
          : d.routes.map((r) => (
            <div key={r.id} className="px-4 py-2.5 border-b border-[#EDEFF3] last:border-0">
              <p className="text-[13px] font-semibold text-[#16264A]">{r.routeNo} · {r.name} <span className={`font-normal text-[12px] ${r.seatsLeft ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>· {r.seatsLeft} seats left</span></p>
              <p className="text-[11px] text-[#5A6577]">{r.stops.filter((s) => s.fare > 0).map((s) => `${s.name} ${s.time} (${rupees(s.fare)})`).join(' · ')}</p>
            </div>
          ))}
        {d.requests.filter((r) => r.status !== 'PENDING').length > 0 && (
          <div className="px-4 py-2 border-t border-[#EDEFF3]">
            {d.requests.filter((r) => r.status !== 'PENDING').map((r) => <p key={r.id} className="text-[12px] text-[#5A6577] py-0.5"><span className="font-mono">{r.requestNo}</span> · {r.route.routeNo} / {r.stop.name} · {r.status.toLowerCase()}{r.decisionNote ? ` — ${r.decisionNote}` : ''}</p>)}
          </div>
        )}
      </Section>

      {asking && <ApplyModal d={d} onClose={() => setAsking(false)} />}
    </div>
  );
}

function LiveSection({ d }: { d: MyTransport }) {
  const live = d.live;
  const p = d.pass!;
  if (!live) {
    return (
      <Section label="Today">
        <div className="px-4 py-3"><EmptyState title="The bus has not started today's run" description={p.stop ? `Your pickup at ${p.stop.name} is scheduled for ${p.stop.time}. This page updates once the run begins.` : undefined} /></div>
      </Section>
    );
  }
  const mine = live.stops.find((s) => s.stopId === p.stop?.id);
  return (
    <Section label={`Today's ${live.shift.toLowerCase()} run — ${live.status.toLowerCase()}`}>
      <div className="px-4 pt-3 text-[12px] text-[#5A6577]">
        Updated {time(live.lastUpdated)}{live.delayMinutes !== null ? ` · ${delayText(live.delayMinutes)}` : ''}{live.boardedAt ? ` · you boarded at ${time(live.boardedAt)}` : ''}{live.note ? ` · ${live.note}` : ''}
        {mine && !mine.departedAt && mine.eta && <p className="text-[14px] text-[#16264A] font-semibold mt-1">Expected at {mine.name} around {mine.eta}</p>}
      </div>
      <div className="px-4 py-3">
        {live.stops.map((s, i) => {
          const passed = !!s.departedAt || s.skipped;
          const next = !passed && i === live.lastStop + 1 && live.status === 'RUNNING';
          return (
            <div key={s.stopId} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full mt-1 ${s.departedAt ? 'bg-[#0E7A5F]' : next ? 'bg-[#E0952A]' : 'border-2 border-[#D3D8E0] bg-white'}`} />
                {i < live.stops.length - 1 && <div className={`w-px flex-1 ${s.departedAt ? 'bg-[#0E7A5F]' : 'bg-[#D3D8E0]'}`} />}
              </div>
              <div className="pb-3 flex-1">
                <p className={`text-[14px] ${s.stopId === p.stop?.id ? 'font-bold' : 'font-medium'} ${passed ? 'text-[#5A6577]' : 'text-[#16264A]'}`}>{s.name}{s.stopId === p.stop?.id ? ' (your stop)' : ''}</p>
                <p className="text-[12px] text-[#5A6577]">
                  {s.scheduled ? `due ${s.scheduled}` : ''}
                  {s.departedAt ? ` · left ${time(s.departedAt)}${s.delayMinutes !== null ? ` (${delayText(s.delayMinutes)})` : ''}` : s.skipped ? ' · passed' : s.eta ? ` · expected ${s.eta}` : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-4 pb-3 text-[11px] text-[#5A6577]">Times are recorded by the bus attendant as the bus leaves each stop; expected times assume the bus keeps its present delay.</p>
    </Section>
  );
}

function ApplyModal({ d, onClose }: { d: MyTransport; onClose: () => void }) {
  const [routeId, setRouteId] = useState(d.pass?.route.id ?? '');
  const [stopId, setStopId] = useState('');
  const [note, setNote] = useState('');
  const route = d.routes.find((r) => r.id === routeId);
  const stop = route?.stops.find((s) => s.id === stopId);
  const apply = useTransportAction(() => post<{ requestNo: string }>('/me/requests', { routeId, stopId, ...(note.trim() ? { note: note.trim() } : {}) }));
  return (
    <Modal open onClose={onClose} title={d.pass?.state === 'ACTIVE' ? 'Ask to change your route or stop' : 'Apply for a bus pass'}
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={apply.isPending} disabled={!routeId || !stopId} onClick={() => apply.mutate(undefined, { onSuccess: (r) => { toast.success(`Request ${r.requestNo} sent to the transport desk`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Send</Button></>}>
      <div className="space-y-3">
        <Select label="Route" value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(''); }}><option value="">Choose…</option>{d.routes.map((r) => <option key={r.id} value={r.id} disabled={r.seatsLeft === 0 && r.id !== d.pass?.route.id}>{r.routeNo} · {r.name} ({r.seatsLeft} seats left)</option>)}</Select>
        <Select label="Board at" value={stopId} disabled={!route} onChange={(e) => setStopId(e.target.value)}><option value="">Choose…</option>{route?.stops.filter((s) => s.fare > 0).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.time} · {rupees(s.fare)} a term</option>)}</Select>
        {stop && <p className="text-[12px] text-[#5A6577]">Fare for {d.term}: {rupees(stop.fare)}{d.pass?.state === 'ACTIVE' ? '. If you already paid for this term, only any difference is charged.' : '. Once approved it appears on your fee account; the pass works as soon as it is paid.'}</p>}
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

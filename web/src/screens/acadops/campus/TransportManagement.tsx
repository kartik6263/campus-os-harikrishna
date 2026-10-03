import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { downloadCSV } from '../../../lib/export';
import { useCollection } from '../../../lib/records';

/**
 * The transport desk: routes, stops and buses; bus passes; where each bus is;
 * and incidents, with alerts to the students on a route. The student's own
 * Transport screen and bus tracker read the same records.
 */

interface RouteRow { id: string; routeNo: string; name: string; busNo: string; driver: string; driverPhone: string; currentStop: number; updatedAt: string; stops: Array<{ name: string; time: string }>; passes: number; activePasses: number }
interface PassRow { id: string; studentId: string; student: string; enrolmentNo: string; programme: string; routeId: string; routeNo: string; route: string; valid: boolean; validTill: string; state: 'active' | 'expiring' | 'expired' | 'cancelled' }
interface Incident { id: string; routeNo: string; date: string; kind: string; detail: string; status: 'open' | 'resolved'; resolvedOn?: string; notified?: number }
interface StudentHit { id: string; title: string; subtitle: string; kind: string }
interface PassRequest { id: string; routeNo: string; requestedAt: string; note?: string; status: 'pending' | 'done' | 'declined' }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATE_TONE: Record<PassRow['state'], string> = { active: 'bg-[#D1FAE5] text-[#0E7A5F]', expiring: 'bg-[#FEF9EC] text-[#8A6D1F]', expired: 'bg-[#FEE2E2] text-[#A8242C]', cancelled: 'bg-[#F1F5F9] text-[#5A6577]' };

export default function TransportManagement() {
  const [tab, setTab] = useState('routes');
  const routes = useQuery({ queryKey: ['transport', 'routes'], queryFn: () => api<RouteRow[]>('/api/office/transport/routes') });
  const passes = useQuery({ queryKey: ['transport', 'passes'], queryFn: () => api<PassRow[]>('/api/office/transport/passes') });
  const r = routes.data ?? [];
  const p = passes.data ?? [];

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Transport</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Routes, buses, passes, live position and incidents</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Routes', r.length], ['Active passes', p.filter(x => x.state === 'active' || x.state === 'expiring').length], ['Expiring in 30 days', p.filter(x => x.state === 'expiring').length], ['Expired', p.filter(x => x.state === 'expired').length]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'routes', label: 'Routes & Buses' }, { id: 'passes', label: 'Bus Passes' }, { id: 'live', label: 'Live Position' }, { id: 'incidents', label: 'Incidents' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {(routes.isError || passes.isError) && <InlineAlert type="error">{errText(routes.error ?? passes.error)}</InlineAlert>}
        {routes.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'routes' && <RoutesTab routes={r} />}
            {tab === 'passes' && <PassesTab routes={r} passes={p} />}
            {tab === 'live' && <LiveTab routes={r} />}
            {tab === 'incidents' && <IncidentsTab routes={r} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Routes ──────────────────────────────────────────────────────────────────

type RouteForm = { routeNo: string; name: string; busNo: string; driver: string; driverPhone: string; stops: Array<{ name: string; time: string }> };
const blankRoute = (): RouteForm => ({ routeNo: '', name: '', busNo: '', driver: '', driverPhone: '', stops: [{ name: '', time: '' }, { name: '', time: '' }] });

function RoutesTab({ routes }: { routes: RouteRow[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RouteRow | 'new' | null>(null);
  const [f, setF] = useState<RouteForm>(blankRoute);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, stops: f.stops.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), time: s.time.trim() })) };
      return editing === 'new' ? api('/api/office/transport/routes', { method: 'POST', body }) : api(`/api/office/transport/routes/${(editing as RouteRow).id}`, { method: 'PUT', body });
    },
    onSuccess: () => { toast.success('Route saved'); setEditing(null); void qc.invalidateQueries({ queryKey: ['transport'] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/office/transport/routes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Route removed'); void qc.invalidateQueries({ queryKey: ['transport'] }); },
    onError: e => toast.error(errText(e)),
  });

  function open(r: RouteRow | 'new') {
    setEditing(r);
    setF(r === 'new' ? blankRoute() : { routeNo: r.routeNo, name: r.name, busNo: r.busNo, driver: r.driver, driverPhone: r.driverPhone, stops: r.stops.map(s => ({ ...s })) });
    save.reset();
  }
  const setStop = (i: number, k: 'name' | 'time', v: string) => setF({ ...f, stops: f.stops.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const move = (i: number, d: -1 | 1) => { const s = [...f.stops]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j]!, s[i]!]; setF({ ...f, stops: s }); };

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Routes</p><Button size="sm" onClick={() => open('new')}>+ New route</Button></div>
      {routes.length === 0 ? <div className="p-6"><EmptyState title="No routes yet" description="Add each bus route with its stops and timings; students with a pass see it in their app." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[820px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Route', 'Bus', 'Driver', 'Stops', 'Passes', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{routes.map(r => (
              <tr key={r.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{r.routeNo} · {r.name}</p><p className="text-[11px] text-[#5A6577]">{r.stops[0]?.name} → {r.stops[r.stops.length - 1]?.name}</p></td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{r.busNo}</td>
                <td className="px-4 py-3 text-[#5A6577]">{r.driver}<p className="text-[11px]">{r.driverPhone}</p></td>
                <td className="px-4 py-3 tabular-nums">{r.stops.length}</td>
                <td className="px-4 py-3 tabular-nums">{r.activePasses}<span className="text-[#5A6577]">/{r.passes}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => open(r)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Remove route ${r.routeNo}?`)) remove.mutate(r.id); }}>Remove</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New route' : `Edit route ${typeof editing === 'object' && editing ? editing.routeNo : ''}`} width="640px"
        footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        <div className="space-y-4">
          {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Route no." value={f.routeNo} onChange={e => setF({ ...f, routeNo: e.target.value })} placeholder="R-04" />
            <Input label="Route name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Station Road – Campus" />
            <Input label="Bus registration" value={f.busNo} onChange={e => setF({ ...f, busNo: e.target.value.toUpperCase() })} placeholder="MP 04 AB 1234" />
            <Input label="Driver" value={f.driver} onChange={e => setF({ ...f, driver: e.target.value })} />
            <Input label="Driver phone" value={f.driverPhone} onChange={e => setF({ ...f, driverPhone: e.target.value })} />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Stops, in order</p>
            {f.stops.map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="w-6 text-[12px] text-[#5A6577] tabular-nums">{i + 1}</span>
                <Input value={s.name} onChange={e => setStop(i, 'name', e.target.value)} placeholder="Stop name" className="flex-1" />
                <Input value={s.time} onChange={e => setStop(i, 'time', e.target.value)} placeholder="07:45 AM" className="w-28" />
                <button onClick={() => move(i, -1)} aria-label="Move up" className="text-[#5A6577] cursor-pointer px-1">↑</button>
                <button onClick={() => move(i, 1)} aria-label="Move down" className="text-[#5A6577] cursor-pointer px-1">↓</button>
                <button onClick={() => setF({ ...f, stops: f.stops.filter((_, j) => j !== i) })} disabled={f.stops.length <= 2} className="text-[12px] text-[#A8242C] cursor-pointer disabled:opacity-30">✕</button>
              </div>
            ))}
            <button onClick={() => setF({ ...f, stops: [...f.stops, { name: '', time: '' }] })} className="text-[13px] text-[#E0952A] hover:underline cursor-pointer">+ Add stop</button>
          </div>
          {editing !== 'new' && <p className="text-[12px] text-[#5A6577]">Saving resets the bus's live position to the first stop.</p>}
        </div>
      </Modal>
    </div>
  );
}

// ─── Passes ──────────────────────────────────────────────────────────────────

function PassesTab({ routes, passes }: { routes: RouteRow[]; passes: PassRow[] }) {
  const qc = useQueryClient();
  const [route, setRoute] = useState('');
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const [issuing, setIssuing] = useState<{ student: StudentHit | null; routeId: string; validTill: string } | null>(null);
  const [q, setQ] = useState('');
  const requests = useCollection<PassRequest>('student:transport-requests', []);
  const pendingReqs = requests.items.filter(r => r.status === 'pending');
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  async function chargeFee(r: (typeof requests.items)[number]) {
    const amount = Number(window.prompt(`Transport fee to charge ${r._student?.name ?? 'the student'} (₹)`, '3000'));
    if (!amount || amount <= 0) return;
    try {
      await api('/api/office/finance/charge-students', { method: 'POST', body: { studentIds: [r._studentId], head: `Transport fee — ${r.routeNo} (${r.id})`, category: 'OTHER', amount, term: `transport ${r.id}`, dueDate: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10) } });
      toast.success('Fee added to the student\'s account');
    } catch (e) { toast.error(errText(e)); }
  }
  const hits = useQuery({
    queryKey: ['transport', 'student-search', q.trim()], enabled: q.trim().length >= 2,
    queryFn: () => api<{ hits: StudentHit[] }>(`/api/insights/search?q=${encodeURIComponent(q.trim())}`).then(r => r.hits.filter(h => h.kind === 'Student')),
  });
  const s = search.trim().toLowerCase();
  const rows = passes.filter(p => (!route || p.routeId === route) && (!state || p.state === state) && (!s || p.student.toLowerCase().includes(s) || p.enrolmentNo.toLowerCase().includes(s)));

  const issue = useMutation({
    mutationFn: () => api('/api/office/transport/passes', { method: 'POST', body: { studentId: issuing!.student!.id, routeId: issuing!.routeId, validTill: issuing!.validTill } }),
    onSuccess: () => {
      toast.success('Pass issued — it shows in the student\'s app now');
      if (fulfilling) { requests.update(fulfilling, { status: 'done' }); setFulfilling(null); }
      setIssuing(null); setQ(''); void qc.invalidateQueries({ queryKey: ['transport'] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/office/transport/passes/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => { toast.success('Pass cancelled'); void qc.invalidateQueries({ queryKey: ['transport'] }); },
    onError: e => toast.error(errText(e)),
  });
  const yearEnd = `${new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear()}-06-30`;

  return (
    <div className="space-y-4">
    {pendingReqs.length > 0 && (
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">Renewal requests from students ({pendingReqs.length})</p>
        {pendingReqs.map(r => (
          <div key={r._rid ?? r.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]"><p className="text-[13px] text-[#16264A] font-medium">{r._student?.name}</p><p className="text-[11px] text-[#5A6577]">{r._student?.enrolmentNo} · route {r.routeNo} · {day(r.requestedAt)}</p></div>
            <Button size="sm" variant="secondary" onClick={() => void chargeFee(r)}>Charge fee</Button>
            <Button size="sm" onClick={() => { setFulfilling(r._rid ?? r.id); setIssuing({ student: { id: r._studentId!, title: r._student?.name ?? '', subtitle: r._student?.enrolmentNo ?? '', kind: 'Student' }, routeId: routes.find(x => x.routeNo === r.routeNo)?.id ?? routes[0]?.id ?? '', validTill: yearEnd }); }}>Renew pass</Button>
            <Button size="sm" variant="ghost" onClick={() => { const why = window.prompt('Reason for declining (the student sees it)'); if (why) { requests.update(r._rid ?? r.id, { status: 'declined', note: why }); toast.success('Request declined'); } }}>Decline</Button>
          </div>
        ))}
      </div>
    )}
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Input placeholder="Search student or enrolment no." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={route} onChange={e => setRoute(e.target.value)} className="w-48"><option value="">All routes</option>{routes.map(r => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}</Select>
        <Select value={state} onChange={e => setState(e.target.value)} className="w-40"><option value="">Any state</option><option value="active">Active</option><option value="expiring">Expiring soon</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></Select>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('bus-passes', rows.map(p => ({ student: p.student, enrolmentNo: p.enrolmentNo, programme: p.programme, route: `${p.routeNo} ${p.route}`, validTill: p.validTill.slice(0, 10), state: p.state })))}>Export CSV</Button>
        <Button size="sm" disabled={!routes.length} onClick={() => setIssuing({ student: null, routeId: routes[0]?.id ?? '', validTill: yearEnd })}>+ Issue pass</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title={passes.length ? 'No passes match' : 'No passes issued yet'} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Student', 'Route', 'Valid till', 'State', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{rows.map(p => (
              <tr key={p.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{p.student}</p><p className="font-mono text-[11px] text-[#5A6577]">{p.enrolmentNo} · {p.programme}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{p.routeNo} · {p.route}</td>
                <td className="px-4 py-3 text-[#5A6577]">{day(p.validTill)}</td>
                <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STATE_TONE[p.state]}`}>{p.state[0]!.toUpperCase() + p.state.slice(1)}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setIssuing({ student: { id: p.studentId, title: p.student, subtitle: p.enrolmentNo, kind: 'Student' }, routeId: p.routeId, validTill: yearEnd })}>Renew / move</Button>
                  {p.valid && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Cancel ${p.student}'s pass?`)) cancel.mutate(p.id); }}>Cancel</Button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!issuing} onClose={() => setIssuing(null)} title="Issue bus pass" footer={<><Button size="sm" variant="secondary" onClick={() => setIssuing(null)}>Cancel</Button><Button size="sm" loading={issue.isPending} disabled={!issuing?.student || !issuing.routeId} onClick={() => issue.mutate()}>Issue</Button></>}>
        {issuing && (
          <div className="space-y-3">
            {issue.isError && <InlineAlert type="error">{errText(issue.error)}</InlineAlert>}
            {issuing.student ? (
              <div className="flex items-center justify-between bg-[#F7F8FA] border border-[#D3D8E0] rounded-[4px] px-3 py-2"><div><p className="text-[14px] text-[#16264A] font-medium">{issuing.student.title}</p><p className="text-[12px] text-[#5A6577]">{issuing.student.subtitle}</p></div><button onClick={() => setIssuing({ ...issuing, student: null })} className="text-[12px] text-[#5A6577] cursor-pointer">Change</button></div>
            ) : (
              <div>
                <Input label="Student" placeholder="Enrolment number or name" value={q} onChange={e => setQ(e.target.value)} />
                {q.trim().length >= 2 && (
                  <div className="mt-1 border border-[#D3D8E0] rounded-[4px] max-h-48 overflow-y-auto">
                    {hits.isLoading ? <p className="px-3 py-2 text-[12px] text-[#5A6577]">Searching…</p> : (hits.data ?? []).length === 0 ? <p className="px-3 py-2 text-[12px] text-[#5A6577]">No match.</p> : (hits.data ?? []).map(h => (
                      <button key={h.id} onClick={() => setIssuing({ ...issuing, student: h })} className="w-full text-left px-3 py-2 hover:bg-[#FEF9EC] border-b border-[#EDEFF3] last:border-0 cursor-pointer"><p className="text-[13px] text-[#16264A]">{h.title}</p><p className="text-[11px] text-[#5A6577]">{h.subtitle}</p></button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Select label="Route" value={issuing.routeId} onChange={e => setIssuing({ ...issuing, routeId: e.target.value })}>{routes.map(r => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}</Select>
            <Input label="Valid till" type="date" value={issuing.validTill} min={new Date().toISOString().slice(0, 10)} onChange={e => setIssuing({ ...issuing, validTill: e.target.value })} />
            <p className="text-[12px] text-[#5A6577]">Use "Charge fee" on a request, or the fee counter, to bill the transport fee.</p>
          </div>
        )}
      </Modal>
    </div>
    </div>
  );
}

// ─── Live position ───────────────────────────────────────────────────────────

function LiveTab({ routes }: { routes: RouteRow[] }) {
  const qc = useQueryClient();
  const [id, setId] = useState(routes[0]?.id ?? '');
  const [alertText, setAlertText] = useState('');
  const r = routes.find(x => x.id === id);
  const move = useMutation({
    mutationFn: (stop: number) => api(`/api/office/transport/routes/${id}/position`, { method: 'POST', body: { stop } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['transport', 'routes'] }),
    onError: e => toast.error(errText(e)),
  });
  const alert = useMutation({
    mutationFn: () => api<{ sent: number }>(`/api/office/transport/routes/${id}/alert`, { method: 'POST', body: { message: alertText.trim() } }),
    onSuccess: res => { toast.success(`Alert sent to ${res.sent} pass holder(s)`); setAlertText(''); },
    onError: e => toast.error(errText(e)),
  });
  if (!routes.length) return <EmptyState title="Add a route first" />;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px] p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Select value={id} onChange={e => setId(e.target.value)} className="w-72">{routes.map(x => <option key={x.id} value={x.id}>{x.routeNo} · {x.name}</option>)}</Select>
          {r && <span className="text-[12px] text-[#5A6577]">Updated {new Date(r.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {r.busNo} · {r.driver} ({r.driverPhone})</span>}
        </div>
        <p className="text-[12px] text-[#5A6577] mb-3">Tap the stop the bus has just cleared. Students tracking the bus see it move. (A GPS device can update this automatically.)</p>
        {r && (
          <ol className="relative border-l-2 border-[#D3D8E0] ml-3 space-y-3">
            {r.stops.map((s, i) => {
              const passed = i <= r.currentStop;
              return (
                <li key={i} className="pl-5 relative">
                  <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${i === r.currentStop ? 'bg-[#E0952A] border-[#E0952A]' : passed ? 'bg-[#0E7A5F] border-[#0E7A5F]' : 'bg-white border-[#D3D8E0]'}`} />
                  <button onClick={() => move.mutate(i)} disabled={move.isPending} className="text-left cursor-pointer hover:underline">
                    <span className={`text-[13px] ${i === r.currentStop ? 'font-semibold text-[#16264A]' : passed ? 'text-[#5A6577]' : 'text-[#16264A]'}`}>{s.name}</span>
                    <span className="text-[12px] text-[#5A6577] ml-2">{s.time}</span>
                    {i === r.currentStop && <span className="ml-2 text-[11px] font-semibold text-[#E0952A]">Bus here</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <p className="text-[14px] font-semibold text-[#16264A]">Alert this route</p>
        <p className="text-[12px] text-[#5A6577]">Sends an urgent in-app notification to the {r?.activePasses ?? 0} student(s) with a valid pass on this route.</p>
        <Input label="Message" value={alertText} onChange={e => setAlertText(e.target.value)} placeholder="Bus delayed by 20 minutes due to traffic at the bypass" maxLength={300} />
        <Button disabled={alertText.trim().length < 5} loading={alert.isPending} onClick={() => alert.mutate()}>Send alert</Button>
      </div>
    </div>
  );
}

// ─── Incidents ───────────────────────────────────────────────────────────────

function IncidentsTab({ routes }: { routes: RouteRow[] }) {
  const incidents = useCollection<Incident>('acad:transport-incidents', []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ routeId: routes[0]?.id ?? '', kind: 'Breakdown', detail: '', notify: true });
  const [busy, setBusy] = useState(false);

  async function log() {
    const r = routes.find(x => x.id === f.routeId);
    if (!r || f.detail.trim().length < 5) { toast.error('Pick the route and describe what happened'); return; }
    setBusy(true);
    let notified: number | undefined;
    try {
      if (f.notify) notified = (await api<{ sent: number }>(`/api/office/transport/routes/${r.id}/alert`, { method: 'POST', body: { message: `${f.kind}: ${f.detail.trim()}` } })).sent;
    } catch (e) { toast.error(`Logged, but the alert failed: ${errText(e)}`); }
    incidents.add({ id: `INC-${Date.now().toString(36).toUpperCase()}`, routeNo: r.routeNo, date: new Date().toISOString(), kind: f.kind, detail: f.detail.trim(), status: 'open', notified });
    toast.success(notified ? `Incident logged and ${notified} student(s) alerted` : 'Incident logged');
    setBusy(false); setOpen(false); setF({ ...f, detail: '' });
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Incident log</p><Button size="sm" disabled={!routes.length} onClick={() => setOpen(true)}>+ Log incident</Button></div>
      {incidents.items.length === 0 ? <div className="p-6"><EmptyState title="No incidents logged" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['When', 'Route', 'What happened', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{incidents.items.map(i => (
            <tr key={i.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3 text-[#5A6577]">{new Date(i.date).toLocaleString('en-IN')}</td>
              <td className="px-4 py-3 text-[#16264A]">{i.routeNo}</td>
              <td className="px-4 py-3 text-[#16264A]">{i.kind} — {i.detail}{i.notified ? <p className="text-[11px] text-[#5A6577]">{i.notified} student(s) alerted</p> : null}</td>
              <td className="px-4 py-3 text-[12px]">{i.status === 'open' ? <span className="font-semibold text-[#A8242C]">Open</span> : <span className="text-[#0E7A5F]">Resolved {day(i.resolvedOn)}</span>}</td>
              <td className="px-4 py-3 text-right">{i.status === 'open' && <Button size="sm" variant="ghost" onClick={() => { incidents.update(i.id, { status: 'resolved', resolvedOn: new Date().toISOString() }); toast.success('Marked resolved'); }}>Resolve</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Log incident" footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" loading={busy} onClick={() => void log()}>Log</Button></>}>
        <div className="space-y-3">
          <Select label="Route" value={f.routeId} onChange={e => setF({ ...f, routeId: e.target.value })}>{routes.map(r => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}</Select>
          <Select label="Kind" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{['Breakdown', 'Delay', 'Accident', 'Route change', 'Driver change', 'Other'].map(k => <option key={k}>{k}</option>)}</Select>
          <Input label="What happened" value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} />
          <label className="flex items-center gap-2 text-[13px] text-[#16264A] cursor-pointer"><input type="checkbox" checked={f.notify} onChange={e => setF({ ...f, notify: e.target.checked })} /> Alert students on this route</label>
        </div>
      </Modal>
    </div>
  );
}

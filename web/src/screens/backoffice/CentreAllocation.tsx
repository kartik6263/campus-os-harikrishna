import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { downloadCSV, downloadPdf } from '../../lib/export';
import {
  useAllocateCentre,
  useExamCentres,
  useExamSessions,
  useSetCentreCapacity,
  type ApiCentre,
} from '../../lib/examqueries';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/**
 * Examination centres for a sitting: seat the candidates the college office
 * cleared, relieve over-subscribed halls, print seat plans and hall tickets,
 * and tell the candidates where they sit. Every figure is the seat register's.
 */

interface Seat { id: string; seatNo: string | null; studentId: string; enrolmentNo: string; rollNo: string; name: string; programme: string; semester: number; centre: { code: string; name: string; city: string }; papers?: Array<{ code: string; name: string; date: string; time: string }> }
interface Seating { status: string; cleared: number; seated: number; waiting: Array<{ studentId: string; rollNo: string; name: string; programme: string; semester: number }> }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const n = (v: number) => v.toLocaleString('en-IN');
const seatsAt = (sessionId: string, code: string, withPapers = false) =>
  api<Seat[]>(`/api/exam/sessions/${sessionId}/allocations?centreCode=${encodeURIComponent(code)}${withPapers ? '&withPapers=1' : ''}`);

function utilBar(pct: number) {
  const color = pct >= 100 ? '#A8242C' : pct >= 90 ? '#E0952A' : '#0E7A5F';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#EDEFF3] rounded-sm overflow-hidden" style={{ minWidth: 60 }}><div style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color, height: '100%' }} /></div>
      <span className="text-[12px] font-medium tabular-nums" style={{ color }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

async function seatPlanPdf(session: { id: string; name: string; code: string }, c: ApiCentre) {
  const seats = await seatsAt(session.id, c.code);
  if (!seats.length) { toast.info(`Nobody is seated at ${c.code} yet.`); return; }
  await downloadPdf({
    title: `Seat Plan — ${c.code}`, subtitle: `${c.name}, ${c.city} · ${session.name}`, reference: session.code, fileName: `seat-plan-${c.code}`,
    sections: [
      { fields: [['Centre', `${c.name}, ${c.city}, ${c.district}`], ['Capacity', c.capacity], ['Seated', seats.length]] },
      { table: { head: ['Seat', 'Roll no.', 'Name', 'Programme', 'Sem'], body: seats.map(s => [s.seatNo ?? '—', s.rollNo, s.name, s.programme, s.semester]) } },
    ],
    signatory: 'Centre Superintendent',
  });
}

// ─── Centre map ──────────────────────────────────────────────────────────────

function CentreMapTab({ session, centres, seating }: { session: { id: string; name: string; code: string; status: string }; centres: ApiCentre[]; seating?: Seating }) {
  const allocate = useAllocateCentre();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seats = useQuery({ queryKey: ['exam', 'allocations', session.id, open], enabled: !!open, queryFn: () => seatsAt(session.id, open!) });
  const canSeat = session.status === 'FORM_WINDOW_CLOSED';

  const capacity = centres.reduce((a, c) => a + c.capacity, 0);
  const assigned = centres.reduce((a, c) => a + c.assigned, 0);
  const byProgramme = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of seats.data ?? []) m.set(`${s.programme} · Sem ${s.semester}`, (m.get(`${s.programme} · Sem ${s.semester}`) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [seats.data]);

  async function seatHere(code: string) {
    try {
      const r = await allocate.mutateAsync({ sessionId: session.id, centreCode: code });
      if (r.unseated > 0) toast.success(`${r.seated} seated at ${r.centre.code}; ${r.unseated} still need a hall.`);
      else toast.success(`${r.seated} seated at ${r.centre.code}. Everyone cleared now has a seat.`);
    } catch (e) { toast.error(errText(e)); }
  }

  async function plan(c: ApiCentre) {
    setBusy(c.code);
    try { await seatPlanPdf(session, c); } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border border-[#D3D8E0] mb-6">
        {[['Centres', n(centres.length)], ['Capacity', n(capacity)], ['Seated', n(assigned)], ['Utilisation', capacity ? `${((assigned / capacity) * 100).toFixed(1)}%` : '—'], ['Cleared, awaiting a seat', n(seating?.waiting.length ?? 0)]].map(([l, v], i) => (
          <div key={l} className={`p-4 ${i < 4 ? 'md:border-r border-[#D3D8E0]' : ''}`}><div className="text-[12px] text-[#5A6577] mb-1">{l}</div><div className="text-[22px] font-bold text-[#16264A] tabular-nums">{v}</div></div>
        ))}
      </div>
      {!canSeat && <div className="mb-4"><InlineAlert type="info">Candidates are seated after the form window closes and before the examination starts. This sitting is {session.status.toLowerCase().replace(/_/g, ' ')}.</InlineAlert></div>}
      {centres.length === 0 ? <EmptyState title="No examination centres registered" /> : (
        <div className="border border-[#D3D8E0] overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Code', 'Centre', 'City', 'Capacity', 'Seated', 'Utilisation', ''].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-[#16264A] text-[12px]">{h}</th>)}</tr></thead>
            <tbody>
              {centres.map(c => {
                const isOpen = open === c.code;
                return [
                  <tr key={c.code} className={`border-b border-[#D3D8E0] cursor-pointer hover:bg-[#EDEFF3] ${isOpen ? 'bg-[#EDEFF3]' : 'bg-white'}`} onClick={() => setOpen(isOpen ? null : c.code)}>
                    <td className="px-3 py-2.5 font-mono text-[13px] text-[#16264A]">{c.code}</td>
                    <td className="px-3 py-2.5 font-medium text-[#16264A]">{c.name}</td>
                    <td className="px-3 py-2.5 text-[#5A6577]">{c.city}</td>
                    <td className="px-3 py-2.5 tabular-nums">{n(c.capacity)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{n(c.assigned)}</td>
                    <td className="px-3 py-2.5" style={{ minWidth: 140 }}>{utilBar(c.utilisation)}</td>
                    <td className="px-3 py-2.5 text-right">{c.over ? <span className="text-[12px] font-medium text-[#A8242C] bg-[#FEE2E2] px-2 py-0.5 rounded-[2px]">Over by {c.assigned - c.capacity}</span> : <span className="text-[12px] text-[#5A6577]">{n(c.free)} free</span>}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${c.code}-x`} className="bg-[#F5F7FA]">
                      <td colSpan={7} className="px-4 py-4 border-b border-[#D3D8E0]">
                        <div className="flex flex-wrap gap-8">
                          <div className="min-w-[200px]"><div className="text-[12px] font-semibold text-[#5A6577] mb-1 uppercase tracking-wide">Address</div><div className="text-[14px] text-[#16264A]">{c.name}, {c.city}, {c.district}{c.pincode ? ` — ${c.pincode}` : ''}</div></div>
                          <div className="flex-1 min-w-[220px]">
                            <div className="text-[12px] font-semibold text-[#5A6577] mb-2 uppercase tracking-wide">Seated here</div>
                            {seats.isLoading ? <Spinner size={16} /> : byProgramme.length === 0 ? <div className="text-[13px] text-[#5A6577]">Nobody yet</div> : byProgramme.map(([k, v]) => <div key={k} className="flex justify-between text-[13px] max-w-xs"><span className="text-[#16264A]">{k}</span><span className="tabular-nums text-[#5A6577]">{v}</span></div>)}
                          </div>
                          <div className="flex flex-col gap-2 items-start">
                            <Button size="sm" disabled={!canSeat || c.free <= 0 || !seating?.waiting.length} loading={allocate.isPending} onClick={() => void seatHere(c.code)}>Seat waiting candidates here</Button>
                            <Button size="sm" variant="secondary" disabled={!c.assigned} loading={busy === c.code} onClick={() => void plan(c)}>Seat plan PDF</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Capacity & conflicts ────────────────────────────────────────────────────

function CapacityTab({ session, centres }: { session: { id: string; status: string }; centres: ApiCentre[] }) {
  const qc = useQueryClient();
  const setCapacity = useSetCentreCapacity();
  const move = useMutation({
    mutationFn: (b: { from: string; to: string; count: number }) => api<{ moved: number; from: string; to: string }>(`/api/exam/sessions/${session.id}/move`, { method: 'POST', body: b }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
  const [cap, setCap] = useState<{ code: string; value: string } | null>(null);
  const [mv, setMv] = useState<{ from: string; to: string; count: string } | null>(null);
  const conflicts = centres.filter(c => c.over);
  const nearlyFull = centres.filter(c => !c.over && c.utilisation >= 90);
  const canMove = session.status === 'FORM_WINDOW_CLOSED';

  async function saveCap() {
    if (!cap) return;
    const v = parseInt(cap.value, 10);
    if (!v || v < 1) { toast.error('Enter a capacity of at least 1.'); return; }
    try { const r = await setCapacity.mutateAsync({ code: cap.code, capacity: v }); toast.success(`${r.code} capacity is now ${n(r.capacity)}`); setCap(null); } catch (e) { toast.error(errText(e)); }
  }
  async function doMove() {
    if (!mv) return;
    const count = parseInt(mv.count, 10);
    if (!mv.to || !count || count < 1) { toast.error('Choose a centre and how many to move.'); return; }
    try { const r = await move.mutateAsync({ from: mv.from, to: mv.to, count }); toast.success(`${r.moved} candidate(s) moved from ${r.from} to ${r.to}. Their hall tickets show the new seat.`); setMv(null); } catch (e) { toast.error(errText(e)); }
  }

  const row = (c: ApiCentre) => (
    <div key={c.code} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#EDEFF3] last:border-0">
      <span className="font-mono text-[13px] text-[#16264A] w-20">{c.code}</span>
      <div className="flex-1 min-w-[180px]"><p className="text-[14px] text-[#16264A]">{c.name}</p><p className="text-[12px] text-[#5A6577] tabular-nums">{n(c.assigned)} seated / {n(c.capacity)} capacity</p></div>
      <div className="w-40">{utilBar(c.utilisation)}</div>
      <Button size="sm" variant="secondary" onClick={() => setCap({ code: c.code, value: String(Math.max(c.capacity, c.assigned)) })}>Change capacity</Button>
      <Button size="sm" variant="secondary" disabled={!canMove || !c.assigned} onClick={() => setMv({ from: c.code, to: '', count: String(Math.max(c.assigned - c.capacity, 1)) })}>Move candidates</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {!canMove && <InlineAlert type="info">Candidates can be moved between centres only before the examination starts.</InlineAlert>}
      <div className="border border-[#D3D8E0]"><p className="px-4 py-2.5 bg-[#EDEFF3] text-[13px] font-semibold text-[#16264A]">Over-subscribed ({conflicts.length})</p>{conflicts.length ? conflicts.map(row) : <p className="px-4 py-4 text-[13px] text-[#0E7A5F]">No centre holds more candidates than its capacity.</p>}</div>
      <div className="border border-[#D3D8E0]"><p className="px-4 py-2.5 bg-[#EDEFF3] text-[13px] font-semibold text-[#16264A]">90% full or more ({nearlyFull.length})</p>{nearlyFull.length ? nearlyFull.map(row) : <p className="px-4 py-4 text-[13px] text-[#5A6577]">None.</p>}</div>
      <div className="border border-[#D3D8E0]"><p className="px-4 py-2.5 bg-[#EDEFF3] text-[13px] font-semibold text-[#16264A]">All centres</p>{centres.map(row)}</div>

      <Modal open={!!cap} onClose={() => setCap(null)} title={`Sanctioned capacity — ${cap?.code ?? ''}`} footer={<><Button variant="secondary" onClick={() => setCap(null)}>Cancel</Button><Button loading={setCapacity.isPending} onClick={() => void saveCap()}>Save</Button></>}>
        <Input label="Capacity (seats)" type="number" value={cap?.value ?? ''} onChange={e => cap && setCap({ ...cap, value: e.target.value })} />
        <p className="text-[12px] text-[#5A6577] mt-2">It cannot be set below the number already seated there; move candidates out first.</p>
      </Modal>
      <Modal open={!!mv} onClose={() => setMv(null)} title={`Move candidates from ${mv?.from ?? ''}`} footer={<><Button variant="secondary" onClick={() => setMv(null)}>Cancel</Button><Button loading={move.isPending} onClick={() => void doMove()}>Move</Button></>}>
        <div className="space-y-3">
          <Select label="To centre" value={mv?.to ?? ''} onChange={e => mv && setMv({ ...mv, to: e.target.value })}>
            <option value="">Choose…</option>
            {centres.filter(c => c.code !== mv?.from && c.free > 0).map(c => <option key={c.code} value={c.code}>{c.code} — {c.name} ({n(c.free)} free)</option>)}
          </Select>
          <Input label="How many" type="number" value={mv?.count ?? ''} onChange={e => mv && setMv({ ...mv, count: e.target.value })} />
          <p className="text-[12px] text-[#5A6577]">The most recently seated candidates move first and get new seat numbers at the receiving centre.</p>
        </div>
      </Modal>
    </div>
  );
}

// ─── Hall tickets ────────────────────────────────────────────────────────────

function HallTicketTab({ session, centres, seating }: { session: { id: string; name: string; code: string }; centres: ApiCentre[]; seating?: Seating }) {
  const [centre, setCentre] = useState('');
  const [busy, setBusy] = useState(false);
  const notify = useMutation({ mutationFn: () => api<{ notified: number }>(`/api/exam/sessions/${session.id}/hall-tickets/notify`, { method: 'POST' }) });
  const seated = centres.filter(c => c.assigned > 0);
  const pick = centre || seated[0]?.code || '';

  async function tickets() {
    const c = centres.find(x => x.code === pick);
    if (!c) return;
    setBusy(true);
    try {
      const seats = await seatsAt(session.id, c.code, true);
      if (!seats.length) { toast.info(`Nobody is seated at ${c.code}.`); return; }
      await downloadPdf({
        title: 'Admit Card / Hall Ticket', subtitle: session.name, reference: session.code, fileName: `hall-tickets-${c.code}`,
        sections: seats.flatMap((s, i) => [
          { heading: `${s.name} — Roll no. ${s.rollNo}`, pageBreak: i > 0, fields: [['Enrolment no.', s.enrolmentNo], ['Programme', `${s.programme}, Semester ${s.semester}`], ['Centre', `${c.code} — ${c.name}, ${c.city}`], ['Seat', s.seatNo ?? '—']] as Array<[string, string]> },
          { table: { head: ['Paper', 'Subject', 'Date', 'Time'], body: (s.papers ?? []).map(p => [p.code, p.name, fmtDate(p.date), p.time]) } },
          { text: ['Carry this admit card and a photo identity card to every paper. Report 30 minutes before the start. Electronic devices are not allowed in the hall.'] },
        ]),
        signatory: 'Controller of Examinations',
      });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  async function send() {
    if (!window.confirm(`Notify all ${n(seating?.seated ?? 0)} seated candidates that their hall ticket is ready?`)) return;
    try { const r = await notify.mutateAsync(); toast.success(`${n(r.notified)} candidates notified on the app`); } catch (e) { toast.error(errText(e)); }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-0 border border-[#D3D8E0]">
        {[['Forms cleared', seating?.cleared ?? 0], ['Seated — hall ticket issued', seating?.seated ?? 0], ['Cleared, no seat yet', seating?.waiting.length ?? 0]].map(([l, v], i) => <div key={String(l)} className={`p-4 ${i < 2 ? 'border-r border-[#D3D8E0]' : ''}`}><div className="text-[12px] text-[#5A6577] mb-1">{l}</div><div className="text-[22px] font-bold text-[#16264A] tabular-nums">{n(Number(v))}</div></div>)}
      </div>
      <p className="text-[13px] text-[#5A6577]">A seat is the hall ticket: once a candidate is seated, they can download theirs from the student portal and app. Print a centre's set here for the superintendent's file.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Centre" value={pick} onChange={e => setCentre(e.target.value)} className="w-80">{seated.length ? seated.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name} ({n(c.assigned)})</option>) : <option value="">No candidate seated yet</option>}</Select>
        <Button variant="secondary" disabled={!pick} loading={busy} onClick={() => void tickets()}>Download hall tickets (PDF)</Button>
        <Button disabled={!seating?.seated} loading={notify.isPending} onClick={() => void send()}>Notify seated candidates</Button>
      </div>
      {!!seating?.waiting.length && (
        <div className="border border-[#D3D8E0]">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#FFF7E8]"><p className="text-[13px] font-semibold text-[#8A6D1F]">{seating.waiting.length} cleared candidate(s) have no seat — they have no hall ticket</p><Button size="sm" variant="secondary" onClick={() => downloadCSV('unseated-candidates', seating.waiting)}>Export CSV</Button></div>
          <div className="max-h-[300px] overflow-y-auto">{seating.waiting.slice(0, 200).map(w => <div key={w.studentId} className="flex gap-3 px-4 py-2 border-t border-[#EDEFF3] text-[13px]"><span className="font-mono text-[12px] text-[#5A6577] w-28">{w.rollNo}</span><span className="flex-1 text-[#16264A]">{w.name}</span><span className="text-[#5A6577]">{w.programme} · Sem {w.semester}</span></div>)}</div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'centre-map', label: 'Centre Map' },
  { id: 'capacity', label: 'Capacity & Conflicts' },
  { id: 'hall-ticket', label: 'Hall Tickets' },
];

export default function CentreAllocation({ onModule }: Props) {
  const [activeTab, setActiveTab] = useState('centre-map');
  const sessions = useExamSessions();
  const [sessionId, setSessionId] = useState('');
  const list = sessions.data ?? [];
  const session = list.find(s => s.id === sessionId) ?? list.find(s => s.status !== 'RESULT_PUBLISHED') ?? list[0];
  const centres = useExamCentres(session?.id ?? null);
  const seating = useQuery({ queryKey: ['exam', 'seating', session?.id], enabled: !!session, queryFn: () => api<Seating>(`/api/exam/sessions/${session!.id}/seating`) });

  return (
    <div className="flex flex-col min-h-full bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12px] text-[#5A6577] mb-1"><button className="hover:underline" onClick={() => onModule('exam-setup')}>Exam Setup</button><span className="mx-1">›</span>Centre Allocation</div>
            <h1 className="text-[20px] font-bold text-[#16264A]">Centre Allocation &amp; Hall Tickets</h1>
            {session && <div className="text-[13px] text-[#5A6577] mt-0.5">{session.name} · {session.status.toLowerCase().replace(/_/g, ' ')}</div>}
          </div>
          {list.length > 1 && <Select value={session?.id ?? ''} onChange={e => setSessionId(e.target.value)} className="w-80">{list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
        </div>
        <div className="mt-4"><Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} /></div>
      </div>
      <div className="flex-1 p-6">
        <div className="bg-white border border-[#D3D8E0] p-6">
          {sessions.isLoading || centres.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div>
            : !session ? <EmptyState title="No examination session" />
            : centres.isError ? <InlineAlert type="error">{errText(centres.error)}</InlineAlert>
            : <>
              {activeTab === 'centre-map' && <CentreMapTab session={session} centres={centres.data ?? []} seating={seating.data} />}
              {activeTab === 'capacity' && <CapacityTab session={session} centres={centres.data ?? []} />}
              {activeTab === 'hall-ticket' && <HallTicketTab session={session} centres={centres.data ?? []} seating={seating.data} />}
            </>}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth, displayName } from '../../lib/auth';
import { downloadCSV } from '../../lib/export';
import { useExamSessions } from '../../lib/examqueries';
import { useCollection, type Stored } from '../../lib/records';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/**
 * The confidential section: question papers scheduled for each sitting and
 * dispatched under seal, the seal register at each centre (received intact,
 * opened when, by whom, incidents), and the log of everyone who entered.
 * Entry needs the user's own password again, checked by the server.
 */

interface Paper { id: string; code: string; name: string; semester: number; examDate: string; examTime: string; maxExternal: number; maxInternal: number; dispatchedAt: string | null }
interface Centre { id: string; code: string; name: string; city: string }
interface Seal { id: string; paperId: string; paperCode: string; sessionCode: string; centreCode: string; sealNo: string; packets: number; sentAt: string; sentBy: string; receivedAt?: string; receivedBy?: string; intact?: boolean; openedAt?: string; openedBy?: string; incident?: string }
interface AuditRow { id: string; occurredAt: string; actor: string; actorRole: string; action: string; target: string; detail: string | null; outcome: string; ip: string | null }

const AREA = 'Confidential';
/** How long a confirmed password keeps the section open. */
const UNLOCK_MINUTES = 15;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
let unlockedUntil = 0;

export default function Confidential({ onModule }: Props) {
  const [open, setOpen] = useState(() => Date.now() < unlockedUntil);
  const [tab, setTab] = useState('papers');
  if (!open) return <Gate onModule={onModule} onOpen={() => { unlockedUntil = Date.now() + UNLOCK_MINUTES * 60_000; setOpen(true); }} />;
  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0]">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-1"><button onClick={() => onModule('')} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">Back Office</button><span className="text-[#D3D8E0]">/</span><span className="text-[13px] text-[#7F1D1D] font-medium">Confidential Section</span></div>
          <div className="flex items-center justify-between mb-3"><h1 className="text-[22px] font-bold text-[#16264A]">Confidential Section</h1><Button size="sm" variant="secondary" onClick={() => { unlockedUntil = 0; setOpen(false); }}>Lock now</Button></div>
          <Tabs tabs={[{ id: 'papers', label: 'Question Papers' }, { id: 'seals', label: 'Seal Register' }, { id: 'log', label: 'Access Log' }]} activeId={tab} onChange={setTab} />
        </div>
      </div>
      <div className="p-6">
        {tab === 'papers' && <Papers />}
        {tab === 'seals' && <Seals />}
        {tab === 'log' && <AccessLog />}
      </div>
    </div>
  );
}

function Gate({ onModule, onOpen }: { onModule: (m: string) => void; onOpen: () => void }) {
  const [password, setPassword] = useState('');
  const check = useMutation({
    mutationFn: () => api('/api/auth/confirm-password', { method: 'POST', body: { password, purpose: AREA } }),
    onSuccess: onOpen,
    onError: () => setPassword(''),
  });
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] w-full max-w-sm overflow-hidden">
        <div className="h-1 bg-[#7F1D1D]" />
        <form className="p-6 space-y-4" onSubmit={e => { e.preventDefault(); if (password) check.mutate(); }}>
          <div><p className="text-[16px] font-semibold text-[#16264A]">Confidential Section</p><p className="text-[13px] text-[#5A6577] mt-1">Confirm your password to enter. Every entry, and every failed attempt, is recorded on the audit chain.</p></div>
          {check.isError && <InlineAlert type="error">{errText(check.error)}</InlineAlert>}
          <Input label="Your password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => onModule('')}>Back</Button><Button type="submit" loading={check.isPending} disabled={!password} className="flex-1">Enter</Button></div>
        </form>
      </div>
    </div>
  );
}

function Papers() {
  const qc = useQueryClient();
  const sessions = useExamSessions();
  const [sessionId, setSessionId] = useState('');
  const sid = sessionId || sessions.data?.[0]?.id || '';
  const detail = useQuery({ queryKey: ['exam', 'session', sid], enabled: !!sid, queryFn: () => api<{ code: string; name: string; status: string; papers: Paper[] }>(`/api/exam/sessions/${sid}`) });
  const curriculum = useQuery({ queryKey: ['curriculum'], queryFn: () => api<Array<{ shortName: string; subjects: Array<{ code: string; name: string; semester: number }> }>>('/api/office/curriculum') });
  const [scheduling, setScheduling] = useState(false);
  const [f, setF] = useState({ subjectCode: '', examDate: '', examTime: '10:00–13:00', maxExternal: '70', maxInternal: '30' });
  const [dispatching, setDispatching] = useState<Paper | null>(null);
  const centres = useQuery({ queryKey: ['exam', 'centres'], queryFn: () => api<Centre[]>('/api/exam/centres') });
  const seals = useCollection<Seal>('acad:paper-seals', []);
  const { user } = useAuth();
  const [d, setD] = useState<Record<string, { sealNo: string; packets: string }>>({});

  const schedule = useMutation({
    mutationFn: () => api(`/api/exam/sessions/${sid}/papers`, { method: 'POST', body: { subjectCode: f.subjectCode, examDate: f.examDate, examTime: f.examTime, maxExternal: Number(f.maxExternal), maxInternal: Number(f.maxInternal) } }),
    onSuccess: () => { toast.success('Paper scheduled'); setScheduling(false); setF({ ...f, subjectCode: '', examDate: '' }); void qc.invalidateQueries({ queryKey: ['exam'] }); },
  });
  const dispatch = useMutation({
    mutationFn: async () => {
      const p = dispatching!;
      const rows = (centres.data ?? []).filter(c => d[c.code]?.sealNo?.trim());
      if (!rows.length) throw new ApiError(400, 'Enter the seal number for at least one centre');
      await api(`/api/exam/papers/${p.id}/dispatch`, { method: 'POST' });
      const now = new Date().toISOString();
      rows.forEach(c => seals.add({ id: `SEAL-${p.code}-${c.code}`, paperId: p.id, paperCode: p.code, sessionCode: detail.data!.code, centreCode: c.code, sealNo: d[c.code]!.sealNo.trim(), packets: Number(d[c.code]!.packets) || 1, sentAt: now, sentBy: displayName(user) }));
      return rows.length;
    },
    onSuccess: n => { toast.success(`Dispatched under seal to ${n} centre(s)`); setDispatching(null); setD({}); void qc.invalidateQueries({ queryKey: ['exam'] }); },
  });

  const scheduled = new Set((detail.data?.papers ?? []).map(p => p.code));
  const subjects = (curriculum.data ?? []).flatMap(p => p.subjects.map(s => ({ ...s, programme: p.shortName }))).filter(s => !scheduled.has(s.code));

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Select label="Examination session" value={sid} onChange={e => setSessionId(e.target.value)} className="w-80">{(sessions.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name} ({s.status.toLowerCase().replace(/_/g, ' ')})</option>)}</Select>
        <div className="flex-1" />
        <Button disabled={!sid} onClick={() => { setScheduling(true); schedule.reset(); }}>+ Schedule paper</Button>
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        {detail.isLoading ? <div className="p-6 flex justify-center"><Spinner /></div> : (detail.data?.papers ?? []).length === 0 ? <div className="p-6"><EmptyState title="No papers scheduled for this session" /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Paper', 'Date & time', 'Marks', 'Dispatch', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{[...detail.data!.papers].sort((a, b) => a.examDate.localeCompare(b.examDate)).map(p => (
              <tr key={p.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{p.code} · {p.name}</p><p className="text-[11px] text-[#5A6577]">Semester {p.semester}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{new Date(p.examDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {p.examTime}</td>
                <td className="px-4 py-3 tabular-nums text-[#5A6577]">{p.maxExternal} + {p.maxInternal}</td>
                <td className="px-4 py-3 text-[12px]">{p.dispatchedAt ? <span className="text-[#0E7A5F] font-semibold">Sent {when(p.dispatchedAt)}</span> : <span className="text-[#8A6D1F]">Not dispatched</span>}</td>
                <td className="px-4 py-3 text-right">{!p.dispatchedAt && <Button size="sm" disabled={!['FORM_WINDOW_CLOSED', 'IN_PROGRESS'].includes(detail.data!.status)} title="Papers go out once the form window has closed" onClick={() => { setDispatching(p); setD({}); dispatch.reset(); }}>Dispatch under seal</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <Modal open={scheduling} onClose={() => setScheduling(false)} title="Schedule a paper" footer={<><Button size="sm" variant="secondary" onClick={() => setScheduling(false)}>Cancel</Button><Button size="sm" loading={schedule.isPending} disabled={!f.subjectCode || !f.examDate} onClick={() => schedule.mutate()}>Schedule</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          {schedule.isError && <div className="col-span-2"><InlineAlert type="error">{errText(schedule.error)}</InlineAlert></div>}
          <div className="col-span-2"><Select label="Course" value={f.subjectCode} onChange={e => setF({ ...f, subjectCode: e.target.value })}><option value="">Choose…</option>{subjects.map(s => <option key={s.code} value={s.code}>{s.programme} sem {s.semester} · {s.code} {s.name}</option>)}</Select></div>
          <Input label="Date" type="date" value={f.examDate} onChange={e => setF({ ...f, examDate: e.target.value })} />
          <Select label="Time" value={f.examTime} onChange={e => setF({ ...f, examTime: e.target.value })}>{['10:00–13:00', '14:00–17:00', '09:00–12:00'].map(t => <option key={t}>{t}</option>)}</Select>
          <Input label="External marks" inputMode="numeric" value={f.maxExternal} onChange={e => setF({ ...f, maxExternal: e.target.value.replace(/\D/g, '') })} />
          <Input label="Internal marks" inputMode="numeric" value={f.maxInternal} onChange={e => setF({ ...f, maxInternal: e.target.value.replace(/\D/g, '') })} />
        </div>
      </Modal>
      <Modal open={!!dispatching} onClose={() => setDispatching(null)} title={dispatching ? `Dispatch ${dispatching.code} under seal` : ''} width="560px" footer={<><Button size="sm" variant="secondary" onClick={() => setDispatching(null)}>Cancel</Button><Button size="sm" loading={dispatch.isPending} onClick={() => dispatch.mutate()}>Record dispatch</Button></>}>
        <div className="space-y-3">
          {dispatch.isError && <InlineAlert type="error">{errText(dispatch.error)}</InlineAlert>}
          <p className="text-[13px] text-[#5A6577]">Enter the seal number and packet count for each centre receiving this paper. The centre superintendent confirms receipt in the seal register.</p>
          {(centres.data ?? []).map(c => (
            <div key={c.code} className="grid grid-cols-6 gap-2 items-end">
              <p className="col-span-3 text-[13px] text-[#16264A] pb-2">{c.code} · {c.name}, {c.city}</p>
              <div className="col-span-2"><Input label="Seal no." value={d[c.code]?.sealNo ?? ''} onChange={e => setD({ ...d, [c.code]: { sealNo: e.target.value, packets: d[c.code]?.packets ?? '1' } })} /></div>
              <Input label="Packets" inputMode="numeric" value={d[c.code]?.packets ?? '1'} onChange={e => setD({ ...d, [c.code]: { sealNo: d[c.code]?.sealNo ?? '', packets: e.target.value.replace(/\D/g, '') } })} />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Seals() {
  const seals = useCollection<Seal>('acad:paper-seals', []);
  const { user } = useAuth();
  const me = displayName(user) || 'Superintendent';
  const [acting, setActing] = useState<{ s: Stored<Seal>; kind: 'receive' | 'open' } | null>(null);
  const [intact, setIntact] = useState(true);
  const [incident, setIncident] = useState('');
  const rows = [...seals.items].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  function save() {
    if (!acting) return;
    const now = new Date().toISOString();
    if (acting.kind === 'receive') {
      if (!intact && !incident.trim()) { toast.error('Describe what was wrong with the seal'); return; }
      seals.update(acting.s.id, { receivedAt: now, receivedBy: me, intact, incident: intact ? undefined : incident.trim() });
      toast[intact ? 'success' : 'error'](intact ? 'Receipt recorded — seal intact' : 'Receipt recorded with a seal incident — the controller has been told');
    } else {
      seals.update(acting.s.id, { openedAt: now, openedBy: me });
      toast.success('Seal opening recorded');
    }
    setActing(null); setIntact(true); setIncident('');
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A]">Seal register · {rows.filter(r => r.incident).length} incident(s)</p>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('seal-register', rows.map(r => ({ session: r.sessionCode, paper: r.paperCode, centre: r.centreCode, seal: r.sealNo, packets: r.packets, sent: r.sentAt, sentBy: r.sentBy, received: r.receivedAt ?? '', receivedBy: r.receivedBy ?? '', intact: r.intact === undefined ? '' : r.intact ? 'yes' : 'NO', opened: r.openedAt ?? '', openedBy: r.openedBy ?? '', incident: r.incident ?? '' })))}>Export register</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="Nothing dispatched yet" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Paper', 'Centre', 'Seal', 'Sent', 'Received', 'Opened', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className={`border-b border-[#EDEFF3] ${r.incident ? 'bg-[#FEF2F2]' : ''}`}>
              <td className="px-4 py-3 text-[#16264A] font-medium">{r.paperCode}<p className="text-[11px] text-[#5A6577] font-normal">{r.sessionCode}</p></td>
              <td className="px-4 py-3 text-[#5A6577]">{r.centreCode}</td>
              <td className="px-4 py-3 font-mono text-[12px]">{r.sealNo} · {r.packets} pkt</td>
              <td className="px-4 py-3 text-[12px] text-[#5A6577]">{when(r.sentAt)}<br />{r.sentBy}</td>
              <td className="px-4 py-3 text-[12px]">{r.receivedAt ? <span className={r.intact ? 'text-[#0E7A5F]' : 'text-[#A8242C] font-semibold'}>{when(r.receivedAt)} · {r.intact ? 'intact' : 'NOT intact'}{r.incident ? <><br />{r.incident}</> : null}</span> : <span className="text-[#8A6D1F]">Awaited</span>}</td>
              <td className="px-4 py-3 text-[12px] text-[#5A6577]">{r.openedAt ? <>{when(r.openedAt)}<br />{r.openedBy}</> : '—'}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {!r.receivedAt && <Button size="sm" onClick={() => { setActing({ s: r, kind: 'receive' }); setIntact(true); setIncident(''); }}>Confirm receipt</Button>}
                {r.receivedAt && !r.openedAt && <Button size="sm" variant="secondary" onClick={() => setActing({ s: r, kind: 'open' })}>Record opening</Button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting ? `${acting.kind === 'receive' ? 'Confirm receipt' : 'Record seal opening'} — ${acting.s.paperCode} at ${acting.s.centreCode}` : ''} footer={<><Button size="sm" variant="secondary" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" variant={acting?.kind === 'receive' && !intact ? 'destructive' : 'primary'} onClick={save}>Confirm</Button></>}>
        {acting?.kind === 'receive' ? (
          <div className="space-y-3 text-[13px]">
            <p className="text-[#5A6577]">Seal {acting.s.sealNo} · {acting.s.packets} packet(s).</p>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={intact} onChange={() => setIntact(true)} /> Seal and packets intact</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={!intact} onChange={() => setIntact(false)} /> Seal broken, tampered or packets missing</label>
            {!intact && <Input label="What was found" value={incident} onChange={e => setIncident(e.target.value)} />}
          </div>
        ) : acting && <p className="text-[13px] text-[#5A6577]">Record that the seal was opened in the examination hall, in the presence of invigilators, now.</p>}
      </Modal>
    </div>
  );
}

function AccessLog() {
  const q = useQuery({ queryKey: ['it', 'audit', AREA], queryFn: () => api<{ entries: AuditRow[] }>(`/api/it/audit?module=${AREA}&limit=200`) });
  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  const rows = q.data?.entries ?? [];
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Entries to the confidential section</p><Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('confidential-access-log', rows.map(r => ({ when: r.occurredAt, who: r.actor, role: r.actorRole, action: r.action, outcome: r.outcome, ip: r.ip ?? '' })))}>Export</Button></div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No entries yet" /></div> : (
        <table className="w-full text-[13px]"><tbody>{rows.map(r => (
          <tr key={r.id} className={`border-b border-[#EDEFF3] ${r.outcome === 'DENIED' ? 'bg-[#FEF2F2]' : ''}`}><td className="px-4 py-2.5 text-[#5A6577] whitespace-nowrap">{when(r.occurredAt)}</td><td className="px-4 py-2.5 text-[#16264A]">{r.actor} <span className="text-[11px] text-[#5A6577]">({r.actorRole.toLowerCase()})</span></td><td className={`px-4 py-2.5 ${r.outcome === 'DENIED' ? 'text-[#A8242C] font-semibold' : 'text-[#0E7A5F]'}`}>{r.outcome === 'DENIED' ? 'Wrong password' : 'Entered'}</td><td className="px-4 py-2.5 text-[#5A6577] font-mono text-[12px]">{r.ip ?? ''}</td></tr>
        ))}</tbody></table>
      )}
    </div>
  );
}

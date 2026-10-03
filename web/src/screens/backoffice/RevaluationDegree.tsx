import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { downloadCSV } from '../../lib/export';
import { useDocument } from '../../lib/records';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/**
 * Revaluation and degrees: re-readings of published papers (the fee, then the
 * revised mark, which corrects the result itself), degree and provisional
 * certificates in the certificate queue, and the convocation.
 */

interface Reval { id: string; applicationNo: string; studentId: string; rollNo: string; name: string; code: string; subject: string; appliedAt: string; fee: number; feePaid: boolean; status: 'APPLIED' | 'UNDER_REVALUATION' | 'COMPLETED' | 'REJECTED'; originalMark: number | null; revisedMark: number | null; changed: boolean; completedAt: string | null; remarks: string | null }
interface Cert { id: string; requestNo: string; type: string; studentName: string; enrolmentNo: string; programme: string; purpose: string; stage: 'REQUESTED' | 'COLLEGE_OFFICE' | 'READY' | 'DISPATCHED' | 'REJECTED'; fee: number; feePaid: boolean; requestedOn: string; slaDeadline: string; overdue: boolean; issuedAt: string | null }
interface Convocation { id: string; title: string; date: string; venue: string; registrationCloses: string; chiefGuest?: string; notes?: string; announcedAt?: string }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUS: Record<Reval['status'], [string, string]> = {
  APPLIED: ['Fee awaited', 'bg-[#FEF9EC] text-[#8A6D1F]'], UNDER_REVALUATION: ['Being re-read', 'bg-[#EFF6FF] text-[#1D4ED8]'],
  COMPLETED: ['Completed', 'bg-[#D1FAE5] text-[#0E7A5F]'], REJECTED: ['Rejected', 'bg-[#FEE2E2] text-[#A8242C]'],
};
const NEXT_STAGE: Record<string, { to: Cert['stage']; label: string } | null> = {
  REQUESTED: { to: 'COLLEGE_OFFICE', label: 'Start preparing' }, COLLEGE_OFFICE: { to: 'READY', label: 'Mark printed & ready' },
  READY: { to: 'DISPATCHED', label: 'Mark dispatched / collected' }, DISPATCHED: null, REJECTED: null,
};

export default function RevaluationDegree({ onModule }: Props) {
  const [tab, setTab] = useState('rev');
  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0]">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => onModule('')} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">Back Office</button>
            <span className="text-[#D3D8E0]">/</span><span className="text-[13px] text-[#16264A] font-medium">Revaluation & Degrees</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#16264A] mb-3">Revaluation & Degrees</h1>
          <Tabs tabs={[{ id: 'rev', label: 'Revaluation' }, { id: 'deg', label: 'Degree Certificates' }, { id: 'conv', label: 'Convocation' }]} activeId={tab} onChange={setTab} />
        </div>
      </div>
      <div className="p-6">
        {tab === 'rev' && <Revaluations />}
        {tab === 'deg' && <Degrees />}
        {tab === 'conv' && <ConvocationTab />}
      </div>
    </div>
  );
}

function Revaluations() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [completing, setCompleting] = useState<Reval | null>(null);
  const [mark, setMark] = useState('');
  const [remarks, setRemarks] = useState('');
  const q = useQuery({ queryKey: ['exam', 'revaluations'], queryFn: () => api<Reval[]>('/api/exam/revaluations') });
  const fee = useMutation({
    mutationFn: (id: string) => api(`/api/exam/revaluations/${id}/fee`, { method: 'POST' }),
    onSuccess: () => { toast.success('Fee recorded — sent for re-reading'); void qc.invalidateQueries({ queryKey: ['exam'] }); },
    onError: e => toast.error(errText(e)),
  });
  const complete = useMutation({
    mutationFn: () => api<{ changed: boolean }>(`/api/exam/revaluations/${completing!.id}/complete`, { method: 'POST', body: { revisedMark: Number(mark), remarks: remarks.trim() || undefined } }),
    onSuccess: r => { toast.success(r.changed ? 'Mark revised — the result has been corrected' : 'Re-reading recorded — no change'); setCompleting(null); setMark(''); setRemarks(''); void qc.invalidateQueries({ queryKey: ['exam'] }); },
  });
  const rows = (q.data ?? []).filter(r => !status || r.status === status);
  const count = (s: Reval['status']) => (q.data ?? []).filter(r => r.status === s).length;

  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(STATUS) as Reval['status'][]).map(s => <div key={s} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4"><p className="text-[22px] font-semibold text-[#16264A] tabular-nums">{count(s)}</p><p className="text-[12px] text-[#5A6577]">{STATUS[s][0]}</p></div>)}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-48"><option value="">All applications</option>{(Object.keys(STATUS) as Reval['status'][]).map(s => <option key={s} value={s}>{STATUS[s][0]}</option>)}</Select>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('revaluations', rows.map(r => ({ application: r.applicationNo, roll: r.rollNo, name: r.name, paper: r.code, applied: r.appliedAt.slice(0, 10), feePaid: r.feePaid ? 'yes' : 'no', status: STATUS[r.status][0], original: r.originalMark ?? '', revised: r.revisedMark ?? '', changed: r.changed ? 'yes' : '' })))}>Export CSV</Button>
        </div>
        {rows.length === 0 ? <div className="p-6"><EmptyState title="No revaluation applications" description="Students apply from their portal after results are published." /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Application', 'Student', 'Paper', 'Marks', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{r.applicationNo}<p className="font-sans text-[11px]">{day(r.appliedAt)}</p></td>
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{r.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.rollNo}</p></td>
                <td className="px-4 py-3 text-[#16264A]">{r.code}<p className="text-[11px] text-[#5A6577]">{r.subject}</p></td>
                <td className="px-4 py-3 tabular-nums">{r.originalMark ?? '—'}{r.revisedMark != null && <span className={r.changed ? 'text-[#0E7A5F] font-semibold' : 'text-[#5A6577]'}> → {r.revisedMark}</span>}</td>
                <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {r.status === 'APPLIED' && !r.feePaid && <Button size="sm" variant="secondary" loading={fee.isPending && fee.variables === r.id} onClick={() => fee.mutate(r.id)}>Fee received</Button>}
                  {r.status === 'UNDER_REVALUATION' && <Button size="sm" onClick={() => { setCompleting(r); setMark(String(r.originalMark ?? '')); setRemarks(''); complete.reset(); }}>Enter revised mark</Button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <Modal open={!!completing} onClose={() => setCompleting(null)} title={completing ? `${completing.code} — ${completing.name}` : ''}
        footer={<><Button size="sm" variant="secondary" onClick={() => setCompleting(null)}>Cancel</Button><Button size="sm" loading={complete.isPending} disabled={mark === '' || Number.isNaN(Number(mark))} onClick={() => complete.mutate()}>Record</Button></>}>
        {completing && (
          <div className="space-y-3">
            {complete.isError && <InlineAlert type="error">{errText(complete.error)}</InlineAlert>}
            <p className="text-[13px] text-[#5A6577]">Original external mark: <b className="text-[#16264A]">{completing.originalMark ?? '—'}</b>. If the revised mark differs, the student's result for this paper is recomputed at once and they are told.</p>
            <Input label="Revised external mark" inputMode="numeric" value={mark} onChange={e => setMark(e.target.value.replace(/\D/g, ''))} />
            <Input label="Examiner's remarks (optional)" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Degrees() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['office', 'certificates', 'degrees'], queryFn: () => api<{ requests: Cert[] }>('/api/office/certificates') });
  const [stage, setStage] = useState('');
  const [rejecting, setRejecting] = useState<Cert | null>(null);
  const [reason, setReason] = useState('');
  const advance = useMutation({
    mutationFn: ({ id, to, why }: { id: string; to: Cert['stage']; why?: string }) => api(`/api/office/certificates/${id}/advance`, { method: 'POST', body: { stage: to, ...(why ? { reason: why } : {}) } }),
    onSuccess: () => { toast.success('Updated — the student has been told'); setRejecting(null); setReason(''); void qc.invalidateQueries({ queryKey: ['office'] }); },
    onError: e => toast.error(errText(e)),
  });
  const fee = useMutation({
    mutationFn: (id: string) => api(`/api/office/certificates/${id}/fee`, { method: 'POST' }),
    onSuccess: () => { toast.success('Fee recorded'); void qc.invalidateQueries({ queryKey: ['office'] }); },
    onError: e => toast.error(errText(e)),
  });
  const rows = (q.data?.requests ?? []).filter(r => (r.type === 'Degree Certificate' || r.type === 'Provisional Certificate') && (!stage || r.stage === stage));

  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Select value={stage} onChange={e => setStage(e.target.value)} className="w-48"><option value="">Any stage</option>{['REQUESTED', 'COLLEGE_OFFICE', 'READY', 'DISPATCHED', 'REJECTED'].map(s => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}</Select>
        <p className="text-[12px] text-[#5A6577] flex-1">Students request degree and provisional certificates from their portal. Each one issued carries a QR code anyone can verify.</p>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('degree-certificates', rows.map(r => ({ request: r.requestNo, type: r.type, student: r.studentName, enrolmentNo: r.enrolmentNo, programme: r.programme, stage: r.stage, fee: r.fee, feePaid: r.feePaid ? 'yes' : 'no', requested: r.requestedOn.slice(0, 10), issued: r.issuedAt?.slice(0, 10) ?? '' })))}>Dispatch list CSV</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No degree certificate requests" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Request', 'Student', 'Type', 'Stage', 'Promised by', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r => {
            const next = NEXT_STAGE[r.stage];
            const blockedByFee = next?.to === 'READY' && r.fee > 0 && !r.feePaid;
            return (
              <tr key={r.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{r.requestNo}</td>
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{r.studentName}</p><p className="text-[11px] text-[#5A6577]">{r.enrolmentNo} · {r.programme}</p></td>
                <td className="px-4 py-3 text-[#16264A]">{r.type}{r.fee > 0 && <p className={`text-[11px] ${r.feePaid ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>₹{r.fee} {r.feePaid ? 'paid' : 'unpaid'}</p>}</td>
                <td className="px-4 py-3 text-[12px] capitalize">{r.stage.replace('_', ' ').toLowerCase()}</td>
                <td className={`px-4 py-3 ${r.overdue ? 'text-[#A8242C] font-semibold' : 'text-[#5A6577]'}`}>{day(r.slaDeadline)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                  {blockedByFee && <Button size="sm" variant="secondary" loading={fee.isPending && fee.variables === r.id} onClick={() => fee.mutate(r.id)}>Fee received</Button>}
                  {next && !blockedByFee && <Button size="sm" loading={advance.isPending && advance.variables?.id === r.id} onClick={() => advance.mutate({ id: r.id, to: next.to })}>{next.label}</Button>}
                  {(r.stage === 'REQUESTED' || r.stage === 'COLLEGE_OFFICE') && <Button size="sm" variant="ghost" onClick={() => { setRejecting(r); setReason(''); }}>Reject</Button>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={rejecting ? `Reject ${rejecting.requestNo}` : ''}
        footer={<><Button size="sm" variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button><Button size="sm" variant="destructive" disabled={reason.trim().length < 5} loading={advance.isPending} onClick={() => rejecting && advance.mutate({ id: rejecting.id, to: 'REJECTED', why: reason.trim() })}>Reject</Button></>}>
        <Input label="Reason the student can act on" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Final semester result withheld — clear the backlog first" />
      </Modal>
    </div>
  );
}

function ConvocationTab() {
  const conv = useDocument<Convocation>('acad:convocation', null, { id: 'doc', title: '', date: '', venue: '', registrationCloses: '' });
  const [f, setF] = useState<Convocation | null>(null);
  const [busy, setBusy] = useState(false);
  const c = f ?? conv.value;
  const edit = (patch: Partial<Convocation>) => setF({ ...c, ...patch });
  const valid = c.title.trim() && c.date && c.venue.trim() && c.registrationCloses && c.registrationCloses <= c.date;

  async function announce() {
    if (!valid) return;
    setBusy(true);
    try {
      conv.set({ ...c, announcedAt: new Date().toISOString() });
      await api('/api/announcements', { method: 'POST', body: { title: `${c.title} — ${day(c.date)}`, body: `${c.title} will be held on ${day(c.date)} at ${c.venue}.${c.chiefGuest ? ` Chief guest: ${c.chiefGuest}.` : ''} Graduating students must register by ${day(c.registrationCloses)}.${c.notes ? ` ${c.notes}` : ''}`, scope: 'UNIVERSITY', urgent: false, notify: true } });
      toast.success('Convocation announced to all students');
      setF(null);
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  if (conv.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 max-w-2xl space-y-4">
      <p className="text-[14px] font-semibold text-[#16264A]">Convocation</p>
      {c.announcedAt && !f && <InlineAlert type="success">Announced on {day(c.announcedAt)}.</InlineAlert>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Input label="Title" value={c.title} onChange={e => edit({ title: e.target.value })} placeholder="12th Annual Convocation" /></div>
        <Input label="Date" type="date" value={c.date} onChange={e => edit({ date: e.target.value })} />
        <Input label="Registration closes" type="date" value={c.registrationCloses} max={c.date || undefined} onChange={e => edit({ registrationCloses: e.target.value })} />
        <div className="col-span-2"><Input label="Venue" value={c.venue} onChange={e => edit({ venue: e.target.value })} /></div>
        <Input label="Chief guest" value={c.chiefGuest ?? ''} onChange={e => edit({ chiefGuest: e.target.value })} />
        <Input label="Notes" value={c.notes ?? ''} onChange={e => edit({ notes: e.target.value })} placeholder="Dress code, reporting time…" />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!f} onClick={() => { conv.set(c); setF(null); toast.success('Saved'); }}>Save</Button>
        <Button loading={busy} disabled={!valid} onClick={() => void announce()}>Save & announce to students</Button>
      </div>
    </div>
  );
}

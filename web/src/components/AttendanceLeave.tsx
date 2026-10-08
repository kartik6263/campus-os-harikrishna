import { useState } from 'react';
import { Button, InlineAlert, Modal, SkeletonRow, toast } from './ui';
import { ApiError } from '../lib/api';
import { downloadStoredFile, pickAndUpload, type StoredFileInfo } from '../lib/records';
import {
  LEAVE_KIND, LEAVE_STATUS, ymd, useApplyLeave, useCancelLeave, useMyCondonation, useMyLeaves, useRequestCondonation,
  type LeaveKind, type LeaveStatus,
} from '../lib/attendanceadmin';

/**
 * A student's leave from classes and their condonation request — applied
 * for and tracked by the student, read by the parent. Approved leave turns
 * the absences in its dates into excused ones.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const span = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000) + 1;
const TONE: Record<LeaveStatus, string> = { PENDING: 'bg-[#FEF9EC] text-[#8A6D1F]', APPROVED: 'bg-[#D1FAE5] text-[#0E7A5F]', REJECTED: 'bg-[#FEE2E2] text-[#A8242C]', CANCELLED: 'bg-[#EDEFF3] text-[#5A6577]' };
const field = 'h-10 px-3 text-[14px] border border-[#D3D8E0] rounded-[4px] bg-white outline-none focus:border-[#E0952A]';

function Head({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#EDEFF3] px-4 py-2 mt-3"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{children}</span></div>;
}

export function LeaveSection({ readOnly = false }: { readOnly?: boolean }) {
  const { data, isPending, error } = useMyLeaves();
  const apply = useApplyLeave();
  const cancel = useCancelLeave();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ kind: LeaveKind; fromDate: string; toDate: string; reason: string }>({ kind: 'MEDICAL', fromDate: '', toDate: '', reason: '' });
  const [proof, setProof] = useState<StoredFileInfo | null>(null);

  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const days = form.fromDate && form.toDate && form.toDate >= form.fromDate ? span(form.fromDate, form.toDate) : 0;
  const proofNeeded = form.kind === 'ON_DUTY' || (form.kind === 'MEDICAL' && days > 2);
  const ready = days > 0 && days <= 31 && form.reason.trim().length >= 10 && (!proofNeeded || !!proof);

  function start() {
    setForm({ kind: 'MEDICAL', fromDate: today, toDate: today, reason: '' });
    setProof(null);
    apply.reset();
    setOpen(true);
  }

  return (
    <>
      <Head>{readOnly ? 'Leave from classes' : 'My leave from classes'}</Head>
      <div className="bg-white border-t border-b border-[#D3D8E0]">
        {!readOnly && (
          <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-[#EDEFF3]">
            <p className="text-[12px] text-[#5A6577]">Missed classes for illness or a college activity? Once approved by your mentor, those absences are excused.{data ? ` Apply within ${data.backdateDays} days.` : ''}</p>
            <Button size="sm" onClick={start} disabled={!data}>Apply for leave</Button>
          </div>
        )}
        {isPending && <div className="px-4 py-3"><SkeletonRow /></div>}
        {error && <div className="px-4 py-3"><InlineAlert type="error">{errText(error)}</InlineAlert></div>}
        {data && data.leaves.length === 0 && <p className="px-4 py-4 text-[13px] text-[#5A6577] text-center">No leave applied for.</p>}
        {data?.leaves.map((l) => (
          <div key={l.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-[#16264A]">{LEAVE_KIND[l.kind]} · {ymd(l.fromDate)}{l.toDate !== l.fromDate ? ` – ${ymd(l.toDate)}` : ''}</p>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${TONE[l.status]}`}>{LEAVE_STATUS[l.status]}</span>
            </div>
            <p className="text-[12px] text-[#5A6577] mt-0.5"><span className="font-mono">{l.leaveNo}</span> · {l.reason}</p>
            {(l.decidedBy || l.decisionNote || l.status === 'APPROVED') && (
              <p className="text-[12px] text-[#5A6577] mt-0.5">
                {l.status === 'APPROVED' && `${l.excused} absence${l.excused === 1 ? '' : 's'} excused · `}
                {l.decidedBy && `${l.decidedBy}`}{l.decisionNote ? ` — ${l.decisionNote}` : ''}
              </p>
            )}
            <div className="flex gap-3 mt-1">
              {l.proofFileId && <button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => downloadStoredFile(l.proofFileId!, `${l.leaveNo.replace(/\//g, '-')}-proof`).catch((e) => toast.error(errText(e)))}>View proof</button>}
              {!readOnly && l.status === 'PENDING' && (
                <button className="text-[12px] text-[#A8242C] cursor-pointer disabled:opacity-50" disabled={cancel.isPending}
                  onClick={() => cancel.mutate(l.id, { onSuccess: () => toast.success('Leave withdrawn'), onError: (e) => toast.error(errText(e)) })}>Withdraw</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Apply for leave from classes"
        footer={<><Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" loading={apply.isPending} disabled={!ready}
            onClick={() => apply.mutate({ ...form, reason: form.reason.trim(), ...(proof ? { proofFileId: proof.id } : {}) }, { onSuccess: (l) => { toast.success(`Leave ${l.leaveNo} sent to your mentor`); setOpen(false); } })}>Apply</Button></>}>
        <div className="flex flex-col gap-3">
          {apply.isError && <InlineAlert type="error">{errText(apply.error)}</InlineAlert>}
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#16264A]">Kind</span>
            <select className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LeaveKind })}>
              {(Object.keys(LEAVE_KIND) as LeaveKind[]).map((k) => <option key={k} value={k}>{LEAVE_KIND[k]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">From</span>
              <input type="date" className={field} value={form.fromDate} min={data ? shift(today, -data.backdateDays) : undefined} max={shift(today, 60)} onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: form.toDate < e.target.value ? e.target.value : form.toDate })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">To</span>
              <input type="date" className={field} value={form.toDate} min={form.fromDate || undefined} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
            </label>
          </div>
          {days > 0 && <p className="text-[12px] text-[#5A6577]">{days} day{days === 1 ? '' : 's'}{days > 31 ? ' — leave over 30 days is a break in study, not class leave' : ''}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#16264A]">Reason</span>
            <textarea rows={3} maxLength={600} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={form.kind === 'ON_DUTY' ? 'e.g. Represented the college at the inter-university debate, Bhopal' : 'e.g. Viral fever, advised rest by the doctor'} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
            <span className="text-[11px] text-[#5A6577]">At least 10 characters.</span>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#16264A]">{form.kind === 'ON_DUTY' ? 'Letter from the activity in-charge' : 'Medical certificate'} {proofNeeded ? '(required)' : '(optional)'}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={async () => { const f = await pickAndUpload('attendance:leave', 'image/*,application/pdf'); if (f) setProof(f); }}>{proof ? 'Replace file' : 'Attach file'}</Button>
              {proof && <span className="text-[12px] text-[#0E7A5F]">✓ {proof.name}</span>}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CondonationSection({ readOnly = false }: { readOnly?: boolean }) {
  const { data, error } = useMyCondonation();
  const ask = useRequestCondonation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ kind: 'MEDICAL' | 'OTHER'; reason: string }>({ kind: 'MEDICAL', reason: '' });
  const [proof, setProof] = useState<StoredFileInfo | null>(null);

  if (error) return <div className="px-4 mt-3"><InlineAlert type="error">{errText(error)}</InlineAlert></div>;
  // Nothing to show to a student who is not short and has never asked.
  if (!data || (!data.short.length && !data.request)) return null;
  const r = data.request;

  return (
    <>
      <Head>Condonation of shortage · {data.term}</Head>
      <div className="bg-white border-t border-b border-[#D3D8E0] px-4 py-3 flex flex-col gap-2">
        {data.short.length > 0 && (
          <p className="text-[13px] text-[#16264A]">
            Below {data.threshold}% in {data.short.map((s) => `${s.code} (${s.percent}%)`).join(', ')}. The principal can condone a shortage down to {data.floor}% for a genuine reason.
          </p>
        )}
        {r ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-[#16264A]">Request <span className="font-mono">{r.requestNo}</span> at {r.percent}%</p>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${TONE[r.status]}`}>{r.status === 'PENDING' ? 'With the principal' : r.status === 'APPROVED' ? 'Granted' : 'Refused'}</span>
            </div>
            {r.decisionNote && <p className="text-[12px] text-[#5A6577]">{r.decidedBy}: {r.decisionNote}</p>}
            {r.status === 'APPROVED' && r.fee > 0 && <p className="text-[12px] text-[#8A6D1F]">A condonation fee of ₹{r.fee.toLocaleString('en-IN')} is on the fee account; pay it before the exam form.</p>}
          </div>
        ) : data.eligible ? (
          !readOnly && <div><Button size="sm" onClick={() => { setForm({ kind: 'MEDICAL', reason: '' }); setProof(null); ask.reset(); setOpen(true); }}>Ask for condonation</Button></div>
        ) : (
          <InlineAlert type="error">{data.reason}{data.lowest !== null && data.lowest < data.floor ? '. Attend every remaining class to raise it.' : ''}</InlineAlert>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Ask for condonation of attendance"
        footer={<><Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" loading={ask.isPending} disabled={form.reason.trim().length < 20 || (form.kind === 'MEDICAL' && !proof)}
            onClick={() => ask.mutate({ ...form, reason: form.reason.trim(), ...(proof ? { proofFileId: proof.id } : {}) }, { onSuccess: (c) => { toast.success(`Request ${c.requestNo} sent to the principal`); setOpen(false); } })}>Send request</Button></>}>
        <div className="flex flex-col gap-3">
          {ask.isError && <InlineAlert type="error">{errText(ask.error)}</InlineAlert>}
          <InlineAlert type="info">One request per term. Your lowest subject is at {data.lowest}%.</InlineAlert>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#16264A]">Grounds</span>
            <select className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'MEDICAL' | 'OTHER' })}>
              <option value="MEDICAL">Medical (certificate required)</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#16264A]">Explain the shortage</span>
            <textarea rows={4} maxLength={1000} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
            <span className="text-[11px] text-[#5A6577]">At least 20 characters.</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={async () => { const f = await pickAndUpload('attendance:condonation', 'image/*,application/pdf'); if (f) setProof(f); }}>{proof ? 'Replace file' : 'Attach proof'}</Button>
            {proof && <span className="text-[12px] text-[#0E7A5F]">✓ {proof.name}</span>}
          </div>
        </div>
      </Modal>
    </>
  );
}

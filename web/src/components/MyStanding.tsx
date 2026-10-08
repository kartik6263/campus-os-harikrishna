import { useState } from 'react';
import { Button, InlineAlert, Input, Modal, Select, SkeletonRow, toast } from './ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  EVENT_LABEL, REQUEST_LABEL, STATUS_LABEL, STATUS_STYLE,
  applyForChange, cancelApplication, day, useLifecycleMutation, useMyLifecycle, type RequestKind,
} from '../lib/lifecycle';

/**
 * A student's standing on the rolls, its history, and their applications for
 * a break in study, to resume, to withdraw or to transfer. A parent sees the
 * same card for their ward, read-only.
 */
export default function MyStanding() {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const q = useMyLifecycle();
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [showAll, setShowAll] = useState(false);
  const cancel = useLifecycleMutation(cancelApplication);

  if (q.isLoading) return <div className="bg-white p-4"><SkeletonRow /><SkeletonRow /></div>;
  if (q.isError || !q.data) return <div className="p-4"><InlineAlert type="error">{q.error instanceof ApiError ? q.error.message : 'Could not load your standing.'}</InlineAlert></div>;
  const d = q.data;
  const open = d.requests.find((r) => r.status === 'PENDING');
  const leaving = open && (open.kind === 'WITHDRAWAL' || open.kind === 'TRANSFER');
  const finalSem = d.semester >= d.finalSemester && d.status === 'ACTIVE';
  const history = showAll ? d.history : d.history.slice(0, 4);

  return (
    <div className="bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <div>
          <span className={`inline-block text-[12px] font-semibold px-2 py-0.5 rounded-[2px] ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
          <p className="text-[12px] text-[#5A6577] mt-1">Since {day(d.statusSince)} · semester {d.semester} of {d.finalSemester}{d.graduatedOn ? ` · graduated ${day(d.graduatedOn)}` : ''}</p>
        </div>
      </div>

      {open && (
        <div className="px-4 py-3 border-b border-[#D3D8E0] bg-[#FEF9EC]">
          <p className="text-[13px] font-semibold text-[#16264A]">{REQUEST_LABEL[open.kind]} — with the registrar</p>
          <p className="text-[12px] text-[#5A6577] font-mono">{open.requestNo} · applied {day(open.createdAt)}</p>
          {isStudent && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(open.id, { onSuccess: () => toast.success('Application withdrawn'), onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not withdraw') })}>Withdraw application</Button>}
        </div>
      )}

      {(leaving || finalSem) && (
        <div className="px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[12px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">No-dues clearance {d.clearance.complete ? '— complete' : `— ${d.clearance.pending.length} pending`}</p>
          {d.clearance.items.filter((i) => i.applicable).map((i) => (
            <div key={i.department} className="flex items-start justify-between gap-3 py-1">
              <span className="text-[13px] text-[#16264A]">{i.department}</span>
              <span className={`text-[12px] text-right ${i.cleared ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>{i.cleared ? 'Clear' : i.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-b border-[#D3D8E0]">
        {history.map((e) => (
          <div key={e.id} className="py-1.5">
            <p className="text-[13px] text-[#16264A] font-medium">{EVENT_LABEL[e.kind] ?? e.kind}{e.kind === 'PROMOTED' && e.toSemester ? ` to semester ${e.toSemester}` : ''}</p>
            <p className="text-[12px] text-[#5A6577]">{day(e.effectiveOn)}{e.reference ? ` · Ref. ${e.reference}` : ''} — {e.reason}</p>
          </div>
        ))}
        {d.history.length > 4 && <button className="text-[12px] text-[#E0952A] font-medium cursor-pointer mt-1" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show less' : `Show all ${d.history.length}`}</button>}
      </div>

      {d.requests.filter((r) => r.status !== 'PENDING').length > 0 && (
        <div className="px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[12px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Past applications</p>
          {d.requests.filter((r) => r.status !== 'PENDING').map((r) => (
            <p key={r.id} className="text-[12px] text-[#5A6577] py-0.5"><span className="text-[#16264A]">{REQUEST_LABEL[r.kind]}</span> · {r.status.toLowerCase()} · {day(r.decidedAt ?? r.createdAt)}{r.decisionNote ? ` — ${r.decisionNote}` : ''}</p>
          ))}
        </div>
      )}

      {isStudent && d.canApply.length > 0 && (
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {d.canApply.map((k) => <Button key={k} size="sm" variant="secondary" onClick={() => setKind(k)}>Apply: {REQUEST_LABEL[k]}</Button>)}
        </div>
      )}

      {kind && <ApplyModal kind={kind} onClose={() => setKind(null)} />}
    </div>
  );
}

function ApplyModal({ kind, onClose }: { kind: RequestKind; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');
  const [returnBy, setReturnBy] = useState('');
  const [confirm, setConfirm] = useState('');
  const m = useLifecycleMutation(applyForChange);
  const leaving = kind === 'WITHDRAWAL' || kind === 'TRANSFER';

  async function submit() {
    if (reason.trim().length < 10) { toast.error('Explain your reason in a sentence or two'); return; }
    if (kind === 'TRANSFER' && destination.trim().length < 3) { toast.error('Name the institution you are moving to'); return; }
    if (kind === 'BREAK_OF_STUDY' && !returnBy) { toast.error('Say when you expect to return'); return; }
    if (leaving && confirm !== 'yes') { toast.error('Confirm that you understand'); return; }
    try {
      const r = await m.mutateAsync({ kind, reason: reason.trim(), destination: destination.trim() || undefined, returnBy: returnBy || undefined });
      toast.success(`Application ${r.requestNo} sent to the registrar`);
      onClose();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not send'); }
  }

  return (
    <Modal open onClose={onClose} title={`Apply: ${REQUEST_LABEL[kind]}`} width="520px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" variant={leaving ? 'destructive' : 'primary'} loading={m.isPending} onClick={() => void submit()}>Send application</Button></>}>
      <div className="space-y-3">
        {leaving && <InlineAlert type="warning">If approved, you leave the rolls and your sign-in closes. You will need no-dues clearance from accounts, library, transport, hostel, laboratory and your department first; your Transfer Certificate request is raised automatically.</InlineAlert>}
        {kind === 'BREAK_OF_STUDY' && <InlineAlert type="info">During a break you are off class rosters and cannot file examination forms. Apply to resume when you return.</InlineAlert>}
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {kind === 'TRANSFER' && <Input label="Institution you are moving to" value={destination} onChange={(e) => setDestination(e.target.value)} />}
        {kind === 'BREAK_OF_STUDY' && <Input label="Expected return" type="date" value={returnBy} onChange={(e) => setReturnBy(e.target.value)} />}
        {leaving && <Select label="I understand this ends my enrolment if approved" value={confirm} onChange={(e) => setConfirm(e.target.value)}><option value="">Choose…</option><option value="yes">Yes, I understand</option></Select>}
      </div>
    </Modal>
  );
}

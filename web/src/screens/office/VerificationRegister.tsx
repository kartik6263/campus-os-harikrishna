import { useState } from 'react';
import { Button, InlineAlert, Modal, SkeletonRow, toast } from '../../components/ui';
import { StatusBadge } from '../../components/IdentityVerification';
import { downloadStoredFile } from '../../lib/records';
import { showDlDate, useRegister, useReview, type RegisterFilter, type RegisterRow } from '../../lib/verification';
import { ApiError } from '../../lib/api';

const ROLES: Array<[string, string]> = [['', 'Everyone'], ['STUDENT', 'Students'], ['PARENT', 'Parents'], ['FACULTY', 'Faculty'], ['OFFICE', 'Office staff'], ['VENDOR', 'Vendors']];
const FILTERS: Array<[RegisterFilter, string]> = [['pending', 'Waiting for review'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['all', 'All']];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] px-4 py-3">
      <div className="text-[20px] font-semibold text-[#16264A]">{value}</div>
      <div className="text-[12px] text-[#5A6577]">{label}</div>
    </div>
  );
}

function Cmp({ label, record, claimed, match }: { label: string; record: string | null; claimed: string | null; match: boolean | null }) {
  return (
    <tr className="border-b border-[#EDEFF3]">
      <td className="py-1.5 pr-3 text-[12px] text-[#5A6577]">{label}</td>
      <td className="py-1.5 pr-3 text-[13px] text-[#16264A]">{record ?? '—'}</td>
      <td className="py-1.5 pr-3 text-[13px] text-[#16264A]">{claimed ?? '—'}</td>
      <td className="py-1.5 text-[12px]">{match === null ? '' : match ? <span className="text-[#0E7A5F]">✓ match</span> : <span className="text-[#A8242C]">✗ differs</span>}</td>
    </tr>
  );
}

/**
 * The records section's register of identity and ABC ID verifications:
 * everything DigiLocker could not settle, and every proof uploaded by hand,
 * waits here for a person to decide.
 */
export default function VerificationRegister() {
  const [status, setStatus] = useState<RegisterFilter>('pending');
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<RegisterRow | null>(null);
  const [decide, setDecide] = useState<{ target: 'identity' | 'abc'; decision: 'VERIFIED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const reg = useRegister(status, role, q);
  const review = useReview();

  async function submitDecision() {
    if (!open || !decide) return;
    if (decide.decision === 'REJECTED' && !note.trim()) { toast.error('Say why; the person sees this note'); return; }
    try {
      await review.mutateAsync({ userId: open.userId, ...decide, note: note.trim() || undefined });
      toast.success(`${decide.target === 'abc' ? 'ABC ID' : 'Identity'} ${decide.decision === 'VERIFIED' ? 'verified' : 'rejected'} for ${open.name}`);
      setDecide(null); setNote(''); setOpen(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record the decision');
    }
  }

  const s = reg.data?.summary;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[#16264A]">Identity & ABC ID verification</h1>
        <p className="text-[13px] text-[#5A6577]">DigiLocker matches are verified automatically. Mismatches and uploaded proofs wait here.</p>
      </div>

      {reg.data && !reg.data.digilockerEnabled && (
        <InlineAlert type="info">DigiLocker is not connected on this server, so every verification arrives as an uploaded proof. The IT Cell connects it under Platform Health.</InlineAlert>
      )}

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Waiting for review" value={s.pending} />
          <Stat label="Identities verified" value={s.identityVerified} />
          <Stat label="Students verified" value={`${s.studentsVerified} / ${s.students}`} />
          <Stat label="ABC IDs verified" value={s.abcVerified} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setStatus(id)} className={`h-8 px-3 text-[13px] rounded-[4px] border cursor-pointer ${status === id ? 'bg-[#16264A] text-white border-[#16264A]' : 'bg-white text-[#16264A] border-[#D3D8E0] hover:bg-[#EDEFF3]'}`}>{label}</button>
        ))}
        <select value={role} onChange={e => setRole(e.target.value)} className="h-8 px-2 text-[13px] bg-white border border-[#D3D8E0] rounded-[4px] cursor-pointer">
          {ROLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, enrolment, email" className="h-8 px-3 text-[13px] bg-white border border-[#D3D8E0] rounded-[4px] flex-1 min-w-[180px] outline-none focus:border-[#E0952A]" />
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
        {reg.isPending && <div className="p-4"><SkeletonRow /><SkeletonRow /></div>}
        {reg.error && <div className="p-4"><InlineAlert type="error">{(reg.error as Error).message}</InlineAlert></div>}
        {reg.data && reg.data.rows.length === 0 && <p className="p-6 text-center text-[13px] text-[#5A6577]">{status === 'pending' ? 'Nothing is waiting for review.' : 'No one matches.'}</p>}
        {reg.data && reg.data.rows.length > 0 && (
          <table className="w-full text-left">
            <thead className="bg-[#EDEFF3] text-[11px] uppercase tracking-wider text-[#5A6577]">
              <tr><th className="px-4 py-2">Person</th><th className="px-4 py-2">Identity</th><th className="px-4 py-2">ABC ID</th><th className="px-4 py-2">Updated</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {reg.data.rows.map(r => (
                <tr key={r.userId} className="border-t border-[#EDEFF3]">
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] font-medium text-[#16264A]">{r.name}</div>
                    <div className="text-[11px] text-[#5A6577]">{r.role.toLowerCase()} · {r.ref ?? r.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.identityStatus} />
                    <div className="text-[11px] text-[#5A6577] mt-0.5">{r.identitySource === 'DIGILOCKER' ? 'DigiLocker' : r.identitySource === 'DOCUMENT' ? r.identityDocType : ''}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.role === 'STUDENT' ? <><StatusBadge status={r.abcStatus} /><div className="font-mono text-[11px] text-[#5A6577] mt-0.5">{r.abcId ?? ''}</div></> : <span className="text-[12px] text-[#5A6577]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[#5A6577]">{new Date(r.updatedAt).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-right"><Button size="sm" variant="secondary" onClick={() => { setOpen(r); setDecide(null); setNote(''); }}>Open</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.name} — verification` : ''} width="620px">
        {open && (
          <div className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto">
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[14px] font-semibold text-[#16264A]">Identity</h3>
                <StatusBadge status={open.identityStatus} />
              </div>
              {open.identitySource === 'DIGILOCKER' && (
                <table className="w-full">
                  <thead><tr className="text-[11px] text-[#5A6577] uppercase"><th className="text-left pb-1" /><th className="text-left pb-1">Our record</th><th className="text-left pb-1">DigiLocker</th><th /></tr></thead>
                  <tbody>
                    <Cmp label="Name" record={open.name} claimed={open.dlName} match={open.nameMatch} />
                    <Cmp label="Date of birth" record={open.recordDob} claimed={open.dlDob ? showDlDate(open.dlDob) : null} match={open.dobMatch} />
                    <Cmp label="Aadhaar" record={null} claimed={open.aadhaarLast4 ? `XXXX XXXX ${open.aadhaarLast4}` : open.eaadhaar ? 'Linked' : 'Not linked'} match={null} />
                  </tbody>
                </table>
              )}
              {open.identitySource === 'DOCUMENT' && (
                <div className="flex items-center justify-between border border-[#D3D8E0] rounded-[4px] px-3 py-2">
                  <span className="text-[13px] text-[#16264A]">{open.identityDocType} · record name <b>{open.name}</b>{open.recordDob ? `, born ${open.recordDob}` : ''}</span>
                  {open.identityProofFileId && <Button size="sm" variant="secondary" onClick={() => downloadStoredFile(open.identityProofFileId!, `${open.name} - ${open.identityDocType}`).catch(() => toast.error('Could not open the proof'))}>View proof</Button>}
                </div>
              )}
              {open.identityNote && <div className="mt-2"><InlineAlert type="warning">{open.identityNote}</InlineAlert></div>}
              {open.documents.length > 0 && <p className="text-[12px] text-[#5A6577] mt-2">{open.documents.length} issued document(s) in DigiLocker: {open.documents.map(d => d.name).join(', ')}</p>}
              {open.identityStatus === 'PENDING_REVIEW' && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => setDecide({ target: 'identity', decision: 'VERIFIED' })}>Verify identity</Button>
                  <Button size="sm" variant="destructive" onClick={() => setDecide({ target: 'identity', decision: 'REJECTED' })}>Reject</Button>
                </div>
              )}
            </section>

            {open.role === 'STUDENT' && (
              <section className="border-t border-[#D3D8E0] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[14px] font-semibold text-[#16264A]">ABC ID</h3>
                  <StatusBadge status={open.abcStatus} />
                </div>
                <table className="w-full"><tbody>
                  <Cmp label="ABC ID" record={open.recordAbcId} claimed={open.abcId} match={open.abcId && open.recordAbcId ? open.abcId === open.recordAbcId : null} />
                </tbody></table>
                <p className="text-[12px] text-[#5A6577] mt-1">{open.abcSource === 'DIGILOCKER' ? 'Read from the ABC card in the student’s DigiLocker.' : open.abcSource === 'SELF' ? 'Typed in by the student, with the card attached.' : 'Nothing submitted.'}</p>
                {open.abcNote && <div className="mt-2"><InlineAlert type="warning">{open.abcNote}</InlineAlert></div>}
                {open.abcProofFileId && <Button size="sm" variant="secondary" className="mt-2" onClick={() => downloadStoredFile(open.abcProofFileId!, `${open.name} - ABC card`).catch(() => toast.error('Could not open the card'))}>View ABC card</Button>}
                {open.abcStatus === 'PENDING_REVIEW' && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => setDecide({ target: 'abc', decision: 'VERIFIED' })}>Verify ABC ID</Button>
                    <Button size="sm" variant="destructive" onClick={() => setDecide({ target: 'abc', decision: 'REJECTED' })}>Reject</Button>
                  </div>
                )}
              </section>
            )}

            {decide && (
              <section className="border border-[#D3D8E0] rounded-[4px] p-3 bg-[#FAFBFC]">
                <p className="text-[13px] text-[#16264A] font-medium">
                  {decide.decision === 'VERIFIED' ? 'Verify' : 'Reject'} the {decide.target === 'abc' ? 'ABC ID' : 'identity'} of {open.name}
                  {decide.target === 'abc' && decide.decision === 'VERIFIED' && ' — the student record will carry this ABC ID'}
                </p>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500}
                  placeholder={decide.decision === 'REJECTED' ? 'Reason (shown to the person) — required' : 'Note (optional), e.g. spelling differs, checked against admission papers'}
                  className="mt-2 w-full px-3 py-2 text-[13px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant={decide.decision === 'REJECTED' ? 'destructive' : 'primary'} loading={review.isPending} onClick={submitDecision}>Confirm</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDecide(null)}>Cancel</Button>
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

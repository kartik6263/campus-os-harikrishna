import { useState } from 'react';
import { Button, Modal, InlineAlert, SkeletonRow, toast } from '../../components/ui';
import { useResults, useStudentRecord } from '../../lib/queries';
import { useCollection, useFiles } from '../../lib/records';
import { FIELD_KEY, NEEDS_PROOF, correctionNo, type CorrectionField, type RecordCorrection } from '../../lib/corrections';
import IdentityVerification from '../../components/IdentityVerification';
import MyStanding from '../../components/MyStanding';
import { useMyVerification } from '../../lib/verification';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (m: any) => void }

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {action}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between px-4 py-3 border-b border-[#D3D8E0] bg-white">
      <span className="text-[12px] text-[#5A6577] w-28 shrink-0">{label}</span>
      <span className={`text-[13px] text-[#16264A] font-medium text-right flex-1 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function ProfileModule({ onNavigate: _ }: Props) {
  const { data: STUDENT, isPending, error } = useStudentRecord();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editField, setEditField] = useState('');
  const [editNewValue, setEditNewValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const corrections = useCollection<RecordCorrection>('student:record-corrections', []);
  const results = useResults();
  const [draftId, setDraftId] = useState(correctionNo);
  const proof = useFiles(`student:record-correction/${draftId}`);
  const verification = useMyVerification();
  const identity = verification.data?.identityStatus;

  if (isPending || !STUDENT) {
    return (
      <div className="bg-[#EDEFF3] min-h-screen p-4">
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EDEFF3] min-h-screen p-4">
        <InlineAlert type="error">Could not load your profile: {(error as Error).message}</InlineAlert>
      </div>
    );
  }

  const creditPct = Math.round((STUDENT.abcCredits / STUDENT.abcTarget) * 100);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    toast.success(`${label} copied!`);
  }

  function submitEditRequest() {
    const field = editField as CorrectionField;
    if (!editField || !editNewValue.trim() || editReason.trim().length < 5) { toast.error('Choose the field, give the correct value and a reason'); return; }
    if (NEEDS_PROOF[field] && proof.files.length === 0) { toast.error(`Upload proof: ${NEEDS_PROOF[field]}`); return; }
    if (corrections.items.some(c => c.field === field && c.status === 'pending')) { toast.error('You already have a pending request for this field'); return; }
    const current = String((STUDENT as unknown as Record<string, unknown>)[FIELD_KEY[field]] ?? '');
    corrections.add({ id: draftId, field, current, requested: editNewValue.trim(), reason: editReason.trim(), raisedAt: new Date().toISOString(), status: 'pending' });
    toast.success(`Request ${draftId} sent to the records section`);
    setEditModalOpen(false); setEditField(''); setEditNewValue(''); setEditReason(''); setDraftId(correctionNo());
  }

  return (
    <div className="bg-[#EDEFF3] min-h-screen">
      {/* Header band */}
      <div className="bg-[#16264A] text-white py-6 px-4">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-[#16264A] font-bold text-[20px] shrink-0"
            style={{ background: '#E0952A' }}
          >
            {STUDENT.name.split(/s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold text-white leading-tight">{STUDENT.name}</div>
            <div className="font-mono text-[12px] text-[#94A3B8] mt-0.5">{STUDENT.id}</div>
            <div className="text-[12px] text-[#94A3B8] mt-0.5 truncate">{STUDENT.college}</div>
            <div className="mt-2">
              {identity === 'VERIFIED' ? (
                <span className="inline-flex items-center gap-1 text-[11px] border border-[#0E7A5F] text-[#6EE7B7] px-2 py-0.5 rounded-[2px]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Verified profile{verification.data?.identitySource === 'DIGILOCKER' ? ' · DigiLocker' : ''}
                </span>
              ) : identity ? (
                <span className="inline-flex items-center gap-1 text-[11px] border border-[#8A6D1F] text-[#FDE68A] px-2 py-0.5 rounded-[2px]">
                  {identity === 'PENDING_REVIEW' ? 'Verification with the office' : identity === 'REJECTED' ? 'Verification rejected — see below' : 'Profile not verified'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Personal Details */}
      <div className="mt-2">
        <SectionLabel
          label="Personal Details"
          action={
            <button
              className="text-[12px] text-[#E0952A] font-medium cursor-pointer min-h-[44px] px-1 flex items-center"
              onClick={() => setEditModalOpen(true)}
            >
              Request Edit
            </button>
          }
        />
        <InfoRow label="Full Name (En)" value={STUDENT.name} />
        <InfoRow label="Full Name (Hi)" value={<span style={{ fontFamily: 'Noto Sans Devanagari, sans-serif' }}>{STUDENT.nameHi}</span>} />
        <InfoRow label="Date of Birth" value={STUDENT.dob} />
        <InfoRow label="Gender" value={STUDENT.gender} />
        <InfoRow label="Category" value={STUDENT.category} />
        <InfoRow label="Mobile" value={STUDENT.mobile} />
        <InfoRow label="Alt. Mobile" value={STUDENT.altMobile} />
        <InfoRow label="Email" value={STUDENT.email} />
        <InfoRow label="Address" value={STUDENT.address} />
        <InfoRow label="Programme" value={STUDENT.programme} />
        <InfoRow label="Batch" value={STUDENT.batch} />
        <InfoRow label="Semester" value={`Semester ${STUDENT.semester}`} />
        <InfoRow label="College" value={STUDENT.college} />
        <InfoRow label="Department" value={STUDENT.department} />
        <div className="px-4 py-3 bg-white">
          <Button variant="secondary" size="sm" onClick={() => setEditModalOpen(true)}>
            Request Edit
          </Button>
        </div>
      </div>

      {/* Standing on the rolls */}
      <div className="mt-2">
        <SectionLabel label="Academic standing & applications" />
        <MyStanding />
      </div>

      {/* Edit Request Trail */}
      {corrections.items.length > 0 && (
        <div className="mt-2">
          <SectionLabel label="My correction requests" />
          {corrections.items.map(req => (
            <div key={req.id} className="bg-white px-4 py-3 border-b border-[#D3D8E0]">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-[13px] font-semibold text-[#16264A]">{req.field}</div><div className="font-mono text-[11px] text-[#5A6577]">{req.id} · {new Date(req.raisedAt).toLocaleDateString('en-IN')}</div></div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[2px] ${req.status === 'approved' ? 'bg-[#D1FAE5] text-[#0E7A5F]' : req.status === 'pending' ? 'bg-[#FEF9EC] text-[#8A6D1F]' : 'bg-[#FEE2E2] text-[#A8242C]'}`}>{req.status === 'pending' ? 'With records section' : req.status === 'approved' ? 'Corrected' : req.status === 'returned' ? 'Returned' : 'Rejected'}</span>
              </div>
              <div className="text-[12px] mt-1"><span className="text-[#A8242C] line-through">{req.current || '—'}</span> → <span className="text-[#0E7A5F]">{req.requested}</span></div>
              {req.deskNote && <div className="text-[12px] text-[#5A6577] mt-1">Office: {req.deskNote}</div>}
            </div>
          ))}
        </div>
      )}

      {/* APAAR & ABC */}
      <div className="mt-2">
        <SectionLabel label="APAAR & Academic Bank of Credits (ABC)" action={<a href="#verification" className="text-[12px] text-[#E0952A] font-medium">ABC ID →</a>} />
        <div className="bg-white">
          {/* APAAR */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
            <div>
              <div className="text-[12px] text-[#5A6577]">APAAR ID</div>
              <div className="font-mono text-[13px] text-[#16264A] font-medium mt-0.5">{STUDENT.apaarId}</div>
            </div>
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#5A6577] hover:text-[#16264A] cursor-pointer"
              onClick={() => copyToClipboard(STUDENT.apaarId, 'APAAR ID')}
              disabled={STUDENT.apaarId === '—'}
              aria-label="Copy APAAR ID"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          {/* Credits bar */}
          <div className="px-4 py-3 border-b border-[#D3D8E0]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] text-[#5A6577]">Credits Earned</span>
              <span className="text-[13px] font-semibold text-[#16264A]">{STUDENT.abcCredits} / {STUDENT.abcTarget}</span>
            </div>
            <div className="h-2 bg-[#EDEFF3] rounded-[2px] overflow-hidden">
              <div
                className="h-full rounded-[2px] transition-all"
                style={{ width: `${creditPct}%`, background: '#0E7A5F' }}
              />
            </div>
            <div className="text-[11px] text-[#5A6577] mt-1">{creditPct}% of programme credits completed</div>
          </div>

          {/* Semester-wise */}
          <div className="px-4 pt-3 pb-3 border-b border-[#D3D8E0]">
            <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-3">Semester Breakdown</div>
            <div className="flex flex-col gap-2.5">
              {(results.data ?? []).length === 0 && <span className="text-[12px] text-[#5A6577]">No semester results declared yet.</span>}
              {[...(results.data ?? [])].sort((a, b) => a.semester - b.semester).map(r => ({ sem: `Sem ${r.semester}`, credits: r.totalCredits, max: Math.max(r.totalCredits, 1), done: true })).map(s => (
                <div key={s.sem} className="flex items-center gap-3">
                  <span className="text-[12px] text-[#5A6577] w-12 shrink-0">{s.sem}</span>
                  <div className="flex-1 h-2 bg-[#EDEFF3] rounded-[2px] overflow-hidden">
                    <div
                      className="h-full rounded-[2px]"
                      style={{
                        width: `${Math.round((s.credits / s.max) * 100)}%`,
                        background: s.done ? '#0E7A5F' : '#8A6D1F',
                      }}
                    />
                  </div>
                  <span className="text-[12px] text-[#16264A] font-medium w-20 text-right shrink-0">
                    {s.done ? `${s.credits} cr` : 'In Progress'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3">
            <a
              href="https://www.abc.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] text-[#E0952A] font-medium min-h-[44px]"
            >
              ABC Portal ↗
            </a>
          </div>
        </div>
      </div>

      {/* Identity & ABC verification */}
      <div className="mt-2" id="verification">
        <SectionLabel label="Identity & ABC ID verification" />
        <IdentityVerification />
      </div>

      {/* Edit Request Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Request Profile Edit"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submitEditRequest}>Submit Request</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <InlineAlert type="info">
            Corrections are verified by the records section, usually within 7 working days. Your sign-in email is changed by the IT Cell.
          </InlineAlert>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Field to Edit</label>
            <select
              className="h-9 px-3 text-[15px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none appearance-none cursor-pointer focus:border-[#E0952A]"
              value={editField}
              onChange={e => setEditField(e.target.value)}
            >
              <option value="">Select field…</option>
              {(Object.keys(FIELD_KEY) as CorrectionField[]).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">New Value</label>
            <input
              className="h-9 px-3 text-[15px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
              placeholder="Enter new value"
              value={editNewValue}
              onChange={e => setEditNewValue(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Reason</label>
            <textarea
              className="px-3 py-2 text-[15px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none"
              rows={3}
              placeholder="Briefly explain the reason for change"
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
            />
          </div>
          {editField && NEEDS_PROOF[editField as CorrectionField] && (
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Proof: {NEEDS_PROOF[editField as CorrectionField]}</label>
              {proof.files.map(f => <span key={f.id} className="text-[12px] text-[#0E7A5F]">✓ {f.name}</span>)}
              <Button variant="secondary" size="sm" onClick={() => void proof.upload('image/*,application/pdf')}>{proof.files.length ? 'Add another file' : 'Upload proof'}</Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

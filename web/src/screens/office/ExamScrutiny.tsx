import { Fragment, useState } from 'react';
import { Button, Modal, InlineAlert, Checkbox, toast } from '../../components/ui';
import {
  useDecideExamForm,
  useExamScrutiny,
  useReferExamForm,
  useRemindDues,
  type LegacyExamFormEntry as ExamFormEntry,
} from '../../lib/officequeries';

interface Props {
  onModule: (m: string) => void;
}

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {right}
    </div>
  );
}

function FeeStatusBadge({ status }: { status: ExamFormEntry['feeStatus'] }) {
  const cfg = {
    paid: { bg: '#D1FAE5', color: '#0E7A5F', label: 'Paid' },
    unpaid: { bg: '#FEE2E2', color: '#A8242C', label: 'Unpaid' },
    late_fee_pending: { bg: '#FEF9EC', color: '#8A6D1F', label: 'Late Fee Pending' },
  }[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-[3px]"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function EligibilityBadge({ status }: { status: ExamFormEntry['eligibilityStatus'] }) {
  const cfg = {
    eligible: { bg: '#D1FAE5', color: '#0E7A5F', label: 'Eligible' },
    shortage: { bg: '#FEE2E2', color: '#A8242C', label: 'Shortage' },
    fee_due: { bg: '#FEE2E2', color: '#A8242C', label: 'Fee Due' },
    cleared: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Cleared' },
  }[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-[3px]"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── Ex-Student Modal ─────────────────────────────────────────────────────────
function ExStudentModal({
  entry,
  onClose,
}: {
  entry: ExamFormEntry;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const refer = useReferExamForm();
  const submitting = refer.isPending;

  async function forward() {
    if (reason.trim().length < 10) {
      toast.error('Give the reason in a sentence or two (at least 10 characters)');
      return;
    }
    try {
      const r = await refer.mutateAsync({ id: entry.formId, reason: reason.trim() });
      toast.success(`Sent to the Principal's approval inbox — ${r.requestNo}. Approval clears the form.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send it to the Principal');
    }
  }

  return (
    <Modal
      open
      title="Refer to the Principal"
      onClose={onClose}
      width="500px"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={submitting} onClick={() => void forward()}>
            Forward to Principal
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert type="warning">
          A form short on the record can only be cleared on the Principal's waiver. This goes to the Principal's approval inbox; approving it there clears the form and tells the student.
        </InlineAlert>
        <div className="bg-[#EDEFF3] rounded-[4px] p-3 text-[13px]">
          <p className="font-semibold text-[#16264A]">{entry.studentName}</p>
          <p className="font-mono text-[12px] text-[#5A6577]">{entry.studentId}</p>
          <p className="text-[#5A6577] mt-1">{entry.remarks}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-medium text-[#16264A]">
            Reason for the waiver <span className="text-[#A8242C]">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            className="border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none"
            placeholder="Explain the circumstances and why the student should be granted ex-student status…"
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({
  entry,
  onClose,
  onConfirm,
}: {
  entry: ExamFormEntry;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      title="Reject Exam Form"
      onClose={onClose}
      width="460px"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" size="sm" disabled={!reason.trim()} onClick={onConfirm}>
            Confirm Rejection
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert type="error">
          Rejecting this form will prevent the student from appearing in the examination. This action is logged.
        </InlineAlert>
        <div className="text-[13px] text-[#16264A]">
          <span className="font-semibold">{entry.studentName}</span> — {entry.id}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-medium text-[#16264A]">Reason for rejection <span className="text-[#A8242C]">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none"
            placeholder="State the reason…"
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── Expanded Subject Row ─────────────────────────────────────────────────────
function SubjectTable({ entry }: { entry: ExamFormEntry }) {
  return (
    <tr className="bg-[#FAFAFA]">
      <td colSpan={8} className="px-0">
        <div className="mx-8 my-2 border border-[#D3D8E0] rounded-[4px] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#EDEFF3]">
                <th className="text-left px-3 py-1.5 font-semibold text-[#5A6577] text-[10px] uppercase tracking-wide">Code</th>
                <th className="text-left px-3 py-1.5 font-semibold text-[#5A6577] text-[10px] uppercase tracking-wide">Subject</th>
                <th className="text-left px-3 py-1.5 font-semibold text-[#5A6577] text-[10px] uppercase tracking-wide">Type</th>
                <th className="text-right px-3 py-1.5 font-semibold text-[#5A6577] text-[10px] uppercase tracking-wide">Attendance</th>
                <th className="text-left px-3 py-1.5 font-semibold text-[#5A6577] text-[10px] uppercase tracking-wide">Eligible</th>
              </tr>
            </thead>
            <tbody>
              {entry.subjects.map(sub => (
                <tr
                  key={sub.code}
                  className={`border-t border-[#D3D8E0] ${!sub.eligible ? 'bg-[#FEE2E2]/30' : ''}`}
                >
                  <td className="px-3 py-2 font-mono text-[#16264A]">{sub.code}</td>
                  <td className="px-3 py-2 text-[#16264A] font-medium">{sub.name}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium ${sub.type === 'backlog' ? 'bg-[#FEF9EC] text-[#8A6D1F]' : 'bg-[#EDEFF3] text-[#5A6577]'}`}>
                      {sub.type}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${sub.attendance < 60 ? 'text-[#A8242C]' : sub.attendance < 75 ? 'text-[#8A6D1F]' : 'text-[#0E7A5F]'}`}>
                    {sub.attendance}%
                  </td>
                  <td className="px-3 py-2">
                    {sub.eligible ? (
                      <span className="text-[#0E7A5F]">✓ Eligible</span>
                    ) : (
                      <span className="text-[#A8242C] font-semibold">✗ Ineligible</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ExamScrutiny({ onModule }: Props) {
  const { data: entries, totals } = useExamScrutiny();
  const decide = useDecideExamForm();
  const remind = useRemindDues();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exStudentId, setExStudentId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);

  // Read the open dialog back out of the live list, so a decision made
  // elsewhere is reflected rather than frozen at the moment it opened.
  const exStudentModal = entries.find(e => e.id === exStudentId) ?? null;
  const rejectModal = entries.find(e => e.id === rejectId) ?? null;
  const setExStudentModal = (e: ExamFormEntry | null) => setExStudentId(e?.id ?? null);
  const setRejectModal = (e: ExamFormEntry | null) => setRejectId(e?.id ?? null);

  const total = totals?.total ?? entries.length;
  const eligible = entries.filter(e => e.eligibilityStatus === 'eligible').length;
  const shortage = entries.filter(e => e.eligibilityStatus === 'shortage').length;
  const feeDue = entries.filter(e => e.eligibilityStatus === 'fee_due').length;
  const cleared = entries.filter(e => e.eligibilityStatus === 'cleared').length;

  const eligibleIds = entries
    .filter(e => e.eligibilityStatus === 'eligible' && e.feeStatus === 'paid')
    .map(e => e.id);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function grantClearance(id: string, remarks?: string) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    try {
      await decide.mutateAsync({ id: entry.formId, decision: 'CLEAR', ...(remarks ? { remarks } : {}) });
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      toast.success('Exam form cleared — hall ticket generation queued');
    } catch (err) {
      // The server refuses a short or unpaid form without a written reason,
      // and its message names which it is.
      toast.error(err instanceof Error ? err.message : 'Could not clear that form.');
    }
  }

  async function grantBulkClearance() {
    const ids = Array.from(selected).filter(id => eligibleIds.includes(id));
    if (ids.length === 0) {
      toast.error('No eligible students selected');
      return;
    }
    let done = 0;
    for (const id of ids) {
      const entry = entries.find(e => e.id === id);
      if (!entry) continue;
      try {
        await decide.mutateAsync({ id: entry.formId, decision: 'CLEAR' });
        done += 1;
      } catch {
        /* counted below; the list refetches either way */
      }
    }
    setSelected(new Set());
    if (done === 0) toast.error('None of those forms could be cleared');
    else toast.success(`${done} exam form${done > 1 ? 's' : ''} cleared — ready for centre allocation`);
  }

  /** Holds a form at scrutiny, which is what the reject dialog means here. */
  async function rejectEntry(id: string, remarks?: string) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    try {
      await decide.mutateAsync({
        id: entry.formId,
        decision: 'HOLD',
        ...(remarks ? { remarks } : {}),
      });
      toast.success('Exam form held at scrutiny and logged');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not hold that form.');
    } finally {
      setRejectModal(null);
    }
  }

  const selectedEligibleCount = Array.from(selected).filter(id => eligibleIds.includes(id)).length;

  return (
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="border-b border-[#D3D8E0] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[#16264A]">Exam Scrutiny — V Sem BCA</h1>
          <p className="text-[13px] text-[#5A6577]">Examination form eligibility verification for November 2024</p>
        </div>
        {selectedEligibleCount > 0 && (
          <Button onClick={grantBulkClearance}>
            Grant Clearance to Selected ({selectedEligibleCount})
          </Button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-5 border-b border-[#D3D8E0]">
        {[
          { label: 'Total Submitted', value: total, color: '#16264A', bg: '#EDEFF3' },
          { label: 'Eligible', value: eligible, color: '#0E7A5F', bg: '#D1FAE5' },
          { label: 'Shortage', value: shortage, color: '#A8242C', bg: '#FEE2E2' },
          { label: 'Fee Due', value: feeDue, color: '#A8242C', bg: '#FEE2E2' },
          { label: 'Cleared', value: cleared, color: '#1D4ED8', bg: '#EFF6FF' },
        ].map(stat => (
          <div key={stat.label} className="px-5 py-4 border-r border-[#D3D8E0] last:border-r-0">
            <p className="text-[11px] text-[#5A6577] uppercase tracking-wide mb-1">{stat.label}</p>
            <p className="text-[24px] font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#EDEFF3]">
              <th className="px-4 py-2 w-8" />
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide whitespace-nowrap">EF ID</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Student</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Roll</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Fee Status</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Eligibility</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Subjects</th>
              <th className="px-4 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <Fragment key={entry.id}>
                <tr
                  key={entry.id}
                  className={`border-b border-[#D3D8E0] hover:bg-[#FAFAFA] ${expanded.has(entry.id) ? 'bg-[#FAFAFA]' : ''}`}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    {(entry.eligibilityStatus === 'eligible' && entry.feeStatus === 'paid') && (
                      <Checkbox
                        checked={selected.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                      />
                    )}
                  </td>

                  {/* EF ID */}
                  <td className="px-4 py-3 font-mono text-[12px] text-[#16264A] whitespace-nowrap">{entry.id}</td>

                  {/* Student */}
                  <td className="px-4 py-3">
                    <div className="text-[#16264A] font-medium">{entry.studentName}</div>
                    <div className="font-mono text-[11px] text-[#5A6577]">{entry.studentId}</div>
                  </td>

                  {/* Roll */}
                  <td className="px-4 py-3 font-mono text-[12px] text-[#16264A]">{entry.rollNo}</td>

                  {/* Fee Status */}
                  <td className="px-4 py-3"><FeeStatusBadge status={entry.feeStatus} /></td>

                  {/* Eligibility */}
                  <td className="px-4 py-3"><EligibilityBadge status={entry.eligibilityStatus} /></td>

                  {/* Subjects */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleExpand(entry.id)}
                      className="text-[12px] text-[#16264A] underline cursor-pointer hover:text-[#E0952A] transition-colors"
                    >
                      {entry.subjects.length} subjects {expanded.has(entry.id) ? '▲' : '▼'}
                    </button>
                    {entry.remarks && (
                      <p className="text-[11px] text-[#5A6577] italic mt-0.5 max-w-[200px] truncate">{entry.remarks}</p>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center gap-2 justify-end">
                      {entry.eligibilityStatus === 'eligible' && entry.feeStatus === 'paid' && (
                        <Button size="sm" onClick={() => grantClearance(entry.id)}>
                          Grant Clearance
                        </Button>
                      )}

                      {entry.eligibilityStatus === 'cleared' && (
                        <span className="text-[12px] text-[#1D4ED8] font-medium">Cleared ✓</span>
                      )}

                      {entry.eligibilityStatus === 'fee_due' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#5A6577]">Clearance blocked</span>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={remind.isPending && remind.variables?.studentIds[0] === entry.studentRecordId}
                            onClick={() => remind.mutate({ studentIds: [entry.studentRecordId], note: 'Clear your dues so your examination form can be cleared.' }, { onSuccess: () => toast.success(`Fee reminder sent to ${entry.studentName}`), onError: e => toast.error(e instanceof Error ? e.message : 'Could not send the reminder') })}
                          >
                            Send Reminder
                          </Button>
                        </div>
                      )}

                      {entry.eligibilityStatus === 'shortage' && (
                        <div className="flex items-center gap-2">
                          {entry.waiver?.status === 'PENDING' ? (
                            <span className="text-[12px] text-[#8A6D1F]">With the Principal — {entry.waiver.requestNo}</span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setExStudentModal(entry)}
                            >
                              {entry.waiver?.status === 'REJECTED' ? 'Refer to Principal again' : 'Refer to Principal for waiver'}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setRejectModal(entry)}
                          >
                            Reject Form
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>

                {expanded.has(entry.id) && <SubjectTable key={`${entry.id}-sub`} entry={entry} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {exStudentModal && (
        <ExStudentModal
          entry={exStudentModal}
          onClose={() => setExStudentModal(null)}
        />
      )}

      {rejectModal && (
        <RejectModal
          entry={rejectModal}
          onClose={() => setRejectModal(null)}
          onConfirm={() => rejectEntry(rejectModal.id)}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { Button, Modal, toast } from '../../components/ui';
import {
  LEAVE_KIND_LABELS,
  LEAVE_LABEL_TO_KIND,
  useApplyLeave,
  useCancelLeave,
  useLeaveList,
} from '../../lib/facultyqueries';

interface Props {
  onNavigate: (s: unknown) => void;
  onModule: (m: string) => void;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
    </div>
  );
}

function statusStyle(status: string) {
  if (status === 'approved') return { label: 'Approved', color: '#0E7A5F', bg: '#E8F5F1' };
  if (status === 'rejected') return { label: 'Rejected', color: '#A8242C', bg: '#FFF0F0' };
  return { label: 'Pending', color: '#8A6D1F', bg: '#FFF7E6' };
}

const LEAVE_TYPES = Object.values(LEAVE_KIND_LABELS);

export default function LeaveApplication({ }: Props) {
  const { data: leaves, isPending } = useLeaveList();
  const applyLeave = useApplyLeave();
  const cancelLeave = useCancelLeave();

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [form, setForm] = useState({
    type: LEAVE_TYPES[0],
    from: '',
    to: '',
    reason: '',
    substitute: '',
  });
  const [formError, setFormError] = useState('');

  function calcDays(from: string, to: string) {
    if (!from || !to) return 0;
    const f = new Date(from);
    const t = new Date(to);
    const diff = Math.ceil((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  }

  async function handleApply() {
    if (!form.from || !form.to || !form.reason.trim()) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (new Date(form.to) < new Date(form.from)) {
      setFormError('End date cannot be before start date.');
      return;
    }
    setFormError('');
    setApplying(true);
    try {
      await applyLeave.mutateAsync({
        kind: LEAVE_LABEL_TO_KIND[form.type] ?? 'CASUAL',
        from: form.from,
        to: form.to,
        reason: form.reason.trim(),
        ...(form.substitute ? { substitute: form.substitute } : {}),
      });
      setApplyModalOpen(false);
      setForm({ type: LEAVE_TYPES[0], from: '', to: '', reason: '', substitute: '' });
      toast.success('Leave application submitted successfully.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit the application.');
    } finally {
      setApplying(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawId) return;
    try {
      await cancelLeave.mutateAsync(withdrawId);
      toast.success('Leave application withdrawn.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not withdraw the application.');
    } finally {
      setWithdrawId(null);
    }
  }

  const pending = leaves.filter((l) => l.status === 'pending');
  const history = leaves.filter((l) => l.status !== 'pending');

  const days = calcDays(form.from, form.to);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-[#16264A]">Leave Application</h2>
          <p className="text-[13px] text-[#5A6577] mt-0.5">Apply for and track your leave requests.</p>
        </div>
        <Button onClick={() => setApplyModalOpen(true)}>Apply for Leave</Button>
      </div>

      {/* Leave balance summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Casual Leave', total: 12, used: 5 },
          { label: 'Medical Leave', total: 20, used: 0 },
          { label: 'Earned Leave', total: 30, used: 8 },
        ].map((b) => (
          <div key={b.label} className="bg-white border border-[#D3D8E0] rounded-[2px] px-4 py-3">
            <p className="text-[12px] text-[#5A6577]">{b.label}</p>
            <p className="text-[24px] font-bold text-[#16264A] mt-1">{b.total - b.used}</p>
            <p className="text-[11px] text-[#5A6577]">{b.used} used of {b.total}</p>
            <div className="mt-2 h-1.5 bg-[#D3D8E0] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#E0952A] rounded-full"
                style={{ width: `${(b.used / b.total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pending applications */}
      {pending.length > 0 && (
        <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
          <SectionLabel label={`Pending Applications (${pending.length})`} />
          <div className="divide-y divide-[#D3D8E0]">
            {pending.map((leave) => (
              <div key={leave.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="text-[14px] font-semibold text-[#16264A]">{leave.type}</p>
                      <span className="font-mono text-[11px] text-[#5A6577]">{leave.id}</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-[2px] bg-[#FFF7E6] text-[#8A6D1F]">
                        Pending
                      </span>
                    </div>
                    <p className="text-[13px] text-[#5A6577] mt-1">
                      {leave.from} to {leave.to} · {leave.days} day{leave.days !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[13px] text-[#16264A] mt-1">{leave.reason}</p>
                    {leave.substituteArranged && (
                      <p className="text-[12px] text-[#5A6577] mt-1">
                        Substitute: {leave.substituteArranged}
                      </p>
                    )}
                    <p className="text-[11px] text-[#5A6577] mt-1">Applied on: {leave.appliedOn}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-[#A8242C] border-[#A8242C] hover:bg-[#FFF0F0] flex-shrink-0"
                    onClick={() => setWithdrawId(leave.id)}
                  >
                    Withdraw
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leave history */}
      <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
        <SectionLabel label="Leave History" />
        {history.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#5A6577] text-[14px]">No leave history yet.</div>
        ) : (
          <div className="divide-y divide-[#D3D8E0]">
            {history.map((leave) => {
              const { label, color, bg } = statusStyle(leave.status);
              return (
                <div key={leave.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-[14px] font-semibold text-[#16264A]">{leave.type}</p>
                        <span className="font-mono text-[11px] text-[#5A6577]">{leave.id}</span>
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-[2px]"
                          style={{ color, background: bg }}
                        >
                          {label}
                        </span>
                      </div>
                      <p className="text-[13px] text-[#5A6577] mt-1">
                        {leave.from} to {leave.to} · {leave.days} day{leave.days !== 1 ? 's' : ''}
                      </p>
                      <p className="text-[13px] text-[#16264A] mt-1">{leave.reason}</p>
                      {leave.approvedBy && (
                        <p className="text-[12px] text-[#0E7A5F] mt-1">✓ Approved by {leave.approvedBy}</p>
                      )}
                      {leave.rejectReason && (
                        <p className="text-[12px] text-[#A8242C] mt-1">Reason: {leave.rejectReason}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Apply modal */}
      <Modal
        open={applyModalOpen}
        onClose={() => { setApplyModalOpen(false); setFormError(''); }}
        title="Apply for Leave"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setApplyModalOpen(false); setFormError(''); }}>Cancel</Button>
            <Button onClick={handleApply}>Submit Application</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p className="text-[13px] text-[#A8242C] bg-[#FFF0F0] px-3 py-2 rounded-[2px]">{formError}</p>
          )}
          <div>
            <label className="block text-[13px] font-medium text-[#16264A] mb-1">Leave Type <span className="text-[#A8242C]">*</span></label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="w-full h-9 px-3 text-[14px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] bg-white"
            >
              {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-[#16264A] mb-1">From <span className="text-[#A8242C]">*</span></label>
              <input
                type="date"
                value={form.from}
                onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))}
                className="w-full h-9 px-3 text-[14px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#16264A] mb-1">To <span className="text-[#A8242C]">*</span></label>
              <input
                type="date"
                value={form.to}
                onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))}
                className="w-full h-9 px-3 text-[14px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
              />
            </div>
          </div>
          {days > 0 && (
            <p className="text-[13px] text-[#5A6577] -mt-1">
              Duration: <strong>{days} day{days !== 1 ? 's' : ''}</strong>
            </p>
          )}
          <div>
            <label className="block text-[13px] font-medium text-[#16264A] mb-1">Reason <span className="text-[#A8242C]">*</span></label>
            <textarea
              rows={3}
              className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] text-[#16264A] placeholder-[#5A6577] outline-none focus:border-[#E0952A] resize-none"
              placeholder="Briefly describe the reason for leave…"
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#16264A] mb-1">Substitute Arranged (optional)</label>
            <input
              className="w-full h-9 px-3 text-[14px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] placeholder-[#5A6577]"
              placeholder="e.g., Dr. Sharma will cover my classes"
              value={form.substitute}
              onChange={(e) => setForm((p) => ({ ...p, substitute: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* Withdraw confirm modal */}
      <Modal
        open={withdrawId !== null}
        onClose={() => setWithdrawId(null)}
        title="Withdraw Leave Application"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setWithdrawId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleWithdraw}>Withdraw Application</Button>
          </div>
        }
      >
        <p className="text-[14px] text-[#16264A]">
          Are you sure you want to withdraw this leave application? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

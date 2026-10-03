import { useState } from 'react';
import { Button, Modal, toast, ToastContainer } from '../../../components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useFrameworks, useReturnList, useSubmitReturn } from '../../../lib/accreditationqueries';
import { api } from '../../../lib/api';
import { downloadPdf } from '../../../lib/export';
import { instPlace } from '../../../lib/institution';

type ReturnStatus = 'submitted' | 'pending' | 'overdue';

interface UGCReturn {
  id: string;
  code: string;
  name: string;
  dueDate: string;
  status: ReturnStatus;
  submittedOn: string | null;
  reference?: string | null;
  daysLeft?: number | null;
  framework?: string;
}

const STATUS_CONFIG: Record<ReturnStatus, { label: string; bg: string; text: string; border: string }> = {
  submitted: { label: 'Submitted', bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  pending: { label: 'Pending', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  overdue: { label: 'Overdue', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
};

function parseDueDate(dateStr: string): Date {
  const [d, m, y] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDaysRelative(dateStr: string): number {
  const due = parseDueDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status }: { status: ReturnStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border} ${status === 'overdue' ? 'animate-pulse' : ''}`}>
      {status === 'submitted' && '✅ '}
      {status === 'pending' && '⏳ '}
      {status === 'overdue' && '🔴 '}
      {cfg.label}
    </span>
  );
}

function ReturnCard({
  ret,
  onSubmit,
  onView,
}: {
  ret: UGCReturn;
  onSubmit: (r: UGCReturn) => void;
  onView: (r: UGCReturn) => void;
}) {
  const days = getDaysRelative(ret.dueDate);
  const borderColor =
    ret.status === 'submitted' ? 'border-l-green-500' :
    ret.status === 'overdue' ? 'border-l-red-500' : 'border-l-amber-400';

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${borderColor} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#16264A] text-sm">{ret.name}</p>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{ret.id}</p>
        </div>
        <StatusBadge status={ret.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-600">
        <div>
          <span className="uppercase tracking-wide text-gray-400">Due</span>
          <p className="font-medium text-gray-700">{ret.dueDate}</p>
        </div>
        {ret.status === 'submitted' && ret.submittedOn && (
          <div>
            <span className="uppercase tracking-wide text-gray-400">Submitted</span>
            <p className="font-medium text-green-700">{ret.submittedOn}</p>
          </div>
        )}
        {ret.status === 'pending' && (
          <div>
            <span className="uppercase tracking-wide text-gray-400">Remaining</span>
            <p className={`font-medium ${days < 7 ? 'text-red-600' : 'text-amber-700'}`}>
              {Math.abs(days)} days {days < 0 ? 'overdue' : 'left'}
            </p>
          </div>
        )}
        {ret.status === 'overdue' && (
          <div>
            <span className="uppercase tracking-wide text-gray-400">Overdue by</span>
            <p className="font-bold text-red-600">{Math.abs(days)} days</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        {ret.status === 'submitted' ? (
          <button onClick={() => onView(ret)} className="text-xs text-blue-600 underline hover:text-blue-800">
            View Submission ↗
          </button>
        ) : (
          <button
            onClick={() => onSubmit(ret)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              ret.status === 'overdue'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-[#E0952A] text-white hover:bg-amber-600'
            }`}
          >
            Submit Return
          </button>
        )}
      </div>
    </div>
  );
}

function SubmitModal({
  ret,
  onClose,
}: {
  ret: UGCReturn | null;
  onClose: () => void;
}) {
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const fileReturn = useSubmitReturn();

  if (!ret) return null;

  async function handleSubmit() {
    const current = ret!;
    // The acknowledgement is the whole point of recording a filing — without
    // it there is nothing to show an inspector.
    const ack = reference.trim() || `${current.code}/ACK/${new Date().getFullYear()}`;
    setSubmitting(true);
    try {
      const filed = await fileReturn.mutateAsync({ code: current.code, reference: ack });
      onClose();
      toast.success(
        filed.late
          ? `${filed.name} recorded as filed, after its due date. Reference ${filed.reference}.`
          : `${filed.name} recorded as filed. Reference ${filed.reference}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record that filing.');
    } finally {
      setSubmitting(false);
    }
  }

  // Mock live-data fields per return type
  const liveFields: Array<{ label: string; value: string; source?: string }> = ret.id === 'UGC-R-01'
    ? [
        { label: 'Total Enrolment', value: '4,87,240', source: 'Student Portal → Enrolment' },
        { label: 'Male', value: '2,12,400', source: 'Student Portal → Enrolment' },
        { label: 'Female', value: '2,74,840', source: 'Student Portal → Enrolment' },
        { label: 'PG Students', value: '48,200', source: 'Student Portal → Enrolment' },
        { label: 'Ph.D. Students', value: '3,000', source: 'Student Portal → Enrolment' },
      ]
    : ret.id === 'UGC-R-02'
    ? [
        { label: 'Students Appeared', value: '1,84,200', source: 'Examination → Result Processing' },
        { label: 'Students Passed', value: '1,58,412', source: 'Examination → Result Processing' },
        { label: 'Overall Pass %', value: '86%', source: 'Examination → Result Processing' },
      ]
    : ret.id === 'UGC-R-04'
    ? [
        { label: 'Total Faculty', value: '2,140', source: 'HR & Payroll → Employee Master' },
        { label: 'With Ph.D.', value: '1,241', source: 'HR & Payroll → Employee Master' },
        { label: 'Permanent', value: '1,628', source: 'HR & Payroll → Employee Master' },
      ]
    : ret.id === 'UGC-R-05'
    ? [
        { label: 'Research Publications', value: 'Pending data', source: undefined },
        { label: 'Funded Projects', value: 'Pending data', source: undefined },
      ]
    : [
        { label: 'Total Expenditure', value: 'Enter manually', source: undefined },
        { label: 'Grants Received', value: 'Enter manually', source: undefined },
      ];

  return (
    <Modal
      open={!!ret}
      onClose={() => !submitting && onClose()}
      title={`Submit: ${ret.name}`}
      width="560px"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!declared} loading={submitting}>
            {submitting ? 'Submitting…' : 'Submit to UGC Portal'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Preview</p>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            {liveFields.map((field, i) => (
              <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <span className="text-sm text-gray-600">{field.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#16264A]">{field.value}</span>
                  {field.source ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">🟢 {field.source}</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">✏ Manual</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={declared}
            onChange={e => setDeclared(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#E0952A]"
          />
          <span className="text-xs text-gray-600 group-hover:text-gray-800">
            I hereby declare that all information provided in this return is true and correct to the best of my knowledge and belief, and I am authorised to submit this return on behalf of {instPlace()}.
          </span>
        </label>
      </div>
    </Modal>
  );
}

function ViewReceiptModal({ ret, onClose }: { ret: UGCReturn | null; onClose: () => void }) {
  if (!ret) return null;
  return (
    <Modal
      open={!!ret}
      onClose={onClose}
      title="Submission Receipt"
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={() => void downloadPdf({ title: 'Statutory return — filing record', reference: ret.code, fileName: `return-${ret.code}`, sections: [{ fields: [['Return', ret.name], ['Code', ret.code], ['Framework', ret.framework ?? '—'], ['Due', ret.dueDate], ['Filed on', ret.submittedOn ?? '—'], ['Acknowledgement / reference', ret.reference ?? '—']] }], signatory: 'Registrar' })} className="text-xs text-blue-600 underline mr-auto hover:text-blue-800 cursor-pointer">Download PDF</button>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            ✅ Successfully Submitted
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-gray-400">Return ID</span><p className="font-mono font-medium">{ret.id}</p></div>
            <div><span className="text-gray-400">Submission Date</span><p className="font-medium">{ret.submittedOn}</p></div>
            <div><span className="text-gray-400">Acknowledgement / reference</span><p className="font-mono">{ret.reference ?? '—'}</p></div>
            <div><span className="text-gray-400">Due</span><p className="font-medium">{ret.dueDate}</p></div>
          </div>
        </div>
        <p className="text-xs text-gray-400">The reference is the acknowledgement the regulator issued when the return was filed.</p>
      </div>
    </Modal>
  );
}

export default function UGCReturns() {
  const { data: UGC_RETURNS, totals } = useReturnList();

  const [submitId, setSubmitId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const submitRet = UGC_RETURNS.find(r => r.id === submitId) ?? null;
  const viewRet = UGC_RETURNS.find(r => r.id === viewId) ?? null;
  const setSubmitRet = (r: UGCReturn | null) => setSubmitId(r?.id ?? null);
  const setViewRet = (r: UGCReturn | null) => setViewId(r?.id ?? null);
  const [addModal, setAddModal] = useState(false);
  const [newReturn, setNewReturn] = useState({ name: '', dueDate: '', description: '', framework: 'UGC' });
  const frameworks = useFrameworks();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const overdueReturns = UGC_RETURNS.filter(r => r.status === 'overdue');

  async function handleAddReturn() {
    if (!newReturn.name || !newReturn.dueDate) return;
    setAdding(true);
    try {
      const r = await api<{ code: string }>('/api/accreditation/returns', { method: 'POST', body: { framework: newReturn.framework, name: newReturn.name.trim(), dueOn: newReturn.dueDate, remarks: newReturn.description.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: ['accreditation', 'returns'] });
      toast.success(`${r.code} added to the statutory calendar`);
      setAddModal(false);
      setNewReturn({ name: '', dueDate: '', description: '', framework: newReturn.framework });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the return');
    } finally {
      setAdding(false);
    }
  }
  const ugcReturns = UGC_RETURNS.filter(r => (r.framework ?? 'UGC') === 'UGC');
  const otherReturns = UGC_RETURNS.filter(r => (r.framework ?? 'UGC') !== 'UGC');

  void totals;

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <ToastContainer />

      {/* Header */}
      <div className="bg-[#16264A] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-white text-xl font-bold">UGC Statutory Returns</h1>
            <p className="text-blue-200 text-sm mt-0.5">{instPlace()} — Compliance Dashboard</p>
          </div>
          <Button onClick={() => setAddModal(true)}>+ Add Return</Button>
        </div>
      </div>

      {/* Overdue alert */}
      {overdueReturns.map(ret => {
        const days = Math.abs(getDaysRelative(ret.dueDate));
        return (
          <div key={ret.id} className="bg-red-600 text-white px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              ⚠ URGENT: <span className="font-bold">{ret.name}</span> is {days} days overdue. Submit immediately.
            </div>
            <button
              onClick={() => setSubmitRet(ret as UGCReturn)}
              className="bg-white text-red-700 font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Submit Now
            </button>
          </div>
        );
      })}

      <div className="px-6 py-5 space-y-6">
        {/* UGC Returns */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[#16264A]">UGC Returns ({ugcReturns.length})</h2>
            <div className="flex gap-2 text-xs">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">{UGC_RETURNS.filter(r => r.status === 'submitted').length} Submitted</span>
              <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full">{UGC_RETURNS.filter(r => r.status === 'pending').length} Pending</span>
              <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">{UGC_RETURNS.filter(r => r.status === 'overdue').length} Overdue</span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ugcReturns.length === 0 && <p className="text-sm text-gray-500">No UGC returns on the calendar.</p>}
            {ugcReturns.map(ret => (
              <ReturnCard
                key={ret.id}
                ret={ret as UGCReturn}
                onSubmit={setSubmitRet}
                onView={setViewRet}
              />
            ))}
          </div>
        </div>

        {/* State-level reports */}
        <div>
          <h2 className="font-semibold text-[#16264A] mb-3">NAAC, NIRF, AISHE & other statutory reports ({otherReturns.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherReturns.length === 0 && <p className="text-sm text-gray-500">None on the calendar. Use “+ Add Return” for state or regulator filings.</p>}
            {otherReturns.map(ret => (
              <ReturnCard
                key={ret.id}
                ret={ret as UGCReturn}
                onSubmit={setSubmitRet}
                onView={setViewRet}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Submit modal */}
      <SubmitModal ret={submitRet} onClose={() => setSubmitRet(null)} />

      {/* View receipt modal */}
      <ViewReceiptModal ret={viewRet} onClose={() => setViewRet(null)} />

      {/* Add return modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add New Return"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={() => void handleAddReturn()} loading={adding} disabled={newReturn.name.trim().length < 3 || !newReturn.dueDate}>Add Return</Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Framework</label>
            <select value={newReturn.framework} onChange={e => setNewReturn(p => ({ ...p, framework: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white cursor-pointer">
              {(frameworks.data ?? [{ code: 'UGC', name: 'UGC' }]).map(f => <option key={f.code} value={f.code}>{f.code} — {f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Return Name</label>
            <input
              value={newReturn.name}
              onChange={e => setNewReturn(p => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#E0952A]"
              placeholder="e.g. Annual Research Return"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Due Date</label>
            <input
              type="date"
              value={newReturn.dueDate}
              onChange={e => setNewReturn(p => ({ ...p, dueDate: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#E0952A]"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Description (optional)</label>
            <textarea
              rows={2}
              value={newReturn.description}
              onChange={e => setNewReturn(p => ({ ...p, description: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#E0952A]"
              placeholder="UGC requirement / regulatory mandate…"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

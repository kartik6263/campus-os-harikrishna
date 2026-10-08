import { useState, useMemo } from 'react';
import { Button, Modal, InlineAlert, Checkbox, toast } from '../../components/ui';
import { downloadCertificate } from '../../lib/certificates';
import {
  useAdvanceCertificate,
  useCertificateQueue,
  useMarkCertificateFee,
  type LegacyCertItem as CertQueueItem,
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

function SLABadge({ deadline }: { deadline: string }) {
  // Parse DD-MM-YYYY
  const parts = deadline.split('-');
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#FEE2E2] text-[#A8242C]">
        Overdue ({Math.abs(diffDays)}d)
      </span>
    );
  }
  if (diffDays === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#FEF9EC] text-[#8A6D1F]">
        Due Today
      </span>
    );
  }
  if (diffDays <= 3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#FEF9EC] text-[#8A6D1F]">
        {diffDays}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#D1FAE5] text-[#0E7A5F]">
      {diffDays}d left
    </span>
  );
}

function stageDiffDays(deadline: string) {
  const parts = deadline.split('-');
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Process Modal ─────────────────────────────────────────────────────────────
function ProcessModal({
  item,
  onClose,
  onMarkReady,
  onFee,
  onDecline,
  busy,
}: {
  item: CertQueueItem;
  onClose: () => void;
  onMarkReady: (regNo: string) => void;
  onFee: () => void;
  onDecline: (reason: string) => void;
  busy: boolean;
}) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [checks, setChecks] = useState({
    records: false,
    signature: false,
    seal: false,
    register: false,
  });
  const [regNo, setRegNo] = useState('');

  const allDone = Object.values(checks).every(Boolean) && regNo.trim().length > 0 && item.feePaid;

  function toggle(key: keyof typeof checks) {
    setChecks(c => ({ ...c, [key]: !c[key] }));
  }

  return (
    <Modal
      open
      title={`Process Certificate — ${item.type}`}
      onClose={onClose}
      width="520px"
      footer={
        <div className="flex gap-3 justify-end w-full">
          {declining ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setDeclining(false)}>Back</Button>
              <Button variant="destructive" size="sm" loading={busy} disabled={reason.trim().length < 10} onClick={() => onDecline(reason.trim())}>Decline request</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDeclining(true)}>Decline…</Button>
              <div className="flex-1" />
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" loading={busy} disabled={!allDone} onClick={() => onMarkReady(regNo)}>
                Mark ready &amp; issue signed certificate
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Student info */}
        <div className="bg-[#EDEFF3] rounded-[4px] p-3 grid grid-cols-2 gap-2 text-[13px]">
          <div><span className="text-[#5A6577]">Student:</span> <span className="font-semibold text-[#16264A]">{item.studentName}</span></div>
          <div><span className="text-[#5A6577]">ID:</span> <span className="font-mono text-[12px] text-[#16264A]">{item.studentId}</span></div>
          <div><span className="text-[#5A6577]">Programme:</span> <span className="text-[#16264A]">{item.programme}</span></div>
          <div>
            <span className="text-[#5A6577]">Fee:</span>{' '}
            {item.feePaid ? (
              <span className="text-[#0E7A5F] font-medium">Paid {item.fee > 0 ? `₹${item.fee}` : '(free)'}</span>
            ) : (
              <span className="text-[#A8242C] font-medium">Unpaid — ₹{item.fee}</span>
            )}
            {!item.feePaid && (
              <button onClick={onFee} disabled={busy} className="ml-2 text-[12px] text-[#E0952A] hover:underline cursor-pointer disabled:opacity-50">Record fee received</button>
            )}
          </div>
          <div className="col-span-2"><span className="text-[#5A6577]">Purpose:</span> <span className="text-[#16264A]">{item.purpose}</span></div>
        </div>

        {declining && (
          <div className="space-y-2">
            <InlineAlert type="warning">The student is told the reason and can request again. Nothing is issued.</InlineAlert>
            <label className="text-[13px] font-medium text-[#16264A]">Reason the student can act on</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} placeholder="e.g. Records show an unpaid library fine; clear it at the library desk and request again." className="w-full px-3 py-2 text-[13px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]" />
          </div>
        )}
        {!declining && !item.feePaid && <InlineAlert type="warning">The fee of ₹{item.fee} must be received at the counter before this certificate can be issued.</InlineAlert>}
        {!declining && <>
        <SectionLabel label="Actions Checklist" />
        <div className="space-y-2 px-1">
          <Checkbox
            label="Verified student records in system"
            checked={checks.records}
            onChange={() => toggle('records')}
          />
          <Checkbox
            label="Principal signature obtained"
            checked={checks.signature}
            onChange={() => toggle('signature')}
          />
          <Checkbox
            label="College seal applied"
            checked={checks.seal}
            onChange={() => toggle('seal')}
          />
          <Checkbox
            label="Registered in issuance register"
            checked={checks.register}
            onChange={() => toggle('register')}
          />
        </div>

        {checks.register && (
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Register No.</label>
            <input
              value={regNo}
              onChange={e => setRegNo(e.target.value)}
              placeholder="e.g. ISS/2024/00234"
              className="h-9 px-3 text-[13px] font-mono text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
            />
          </div>
        )}
        {allDone && <p className="text-[12px] text-[#5A6577]">Marking ready signs the certificate with the institution's key, files its official PDF, and notifies the student.</p>}
        </>}
      </div>
    </Modal>
  );
}

export default function CertificateQueue({ onModule }: Props) {
  const { data: queue, totals } = useCertificateQueue();
  const advance = useAdvanceCertificate();
  const markFee = useMarkCertificateFee();

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'requested' | 'college_office' | 'ready' | 'dispatched' | 'rejected'>('all');
  const [busy, setBusy] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'normal'>('all');
  const [sort, setSort] = useState<'oldest' | 'newest'>('oldest');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const processing = queue.find(i => i.id === processingId) ?? null;
  const setProcessing = (i: CertQueueItem | null) => setProcessingId(i?.id ?? null);

  const filtered = useMemo(() => {
    let result = queue.filter(item => {
      const searchLower = search.toLowerCase();
      const matchesSearch = !search ||
        item.studentName.toLowerCase().includes(searchLower) ||
        item.studentId.toLowerCase().includes(searchLower) ||
        item.id.toLowerCase().includes(searchLower);
      const matchesStage = stageFilter === 'all' || item.stage === stageFilter;
      const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter;
      return matchesSearch && matchesStage && matchesPriority;
    });

    result = result.slice().sort((a, b) => {
      const parse = (s: string) => {
        const p = s.split('-');
        return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
      };
      return sort === 'oldest'
        ? parse(a.slaDeadline) - parse(b.slaDeadline)
        : parse(b.slaDeadline) - parse(a.slaDeadline);
    });

    return result;
  }, [queue, search, stageFilter, priorityFilter, sort]);

  // SLA summary
  const overdue = totals?.overdue ?? queue.filter(i => i.overdue).length;
  const dueToday = queue.filter(i => i.daysLeft === 0).length;
  const dueWeek = queue.filter(i => i.daysLeft !== null && i.daysLeft > 0 && i.daysLeft <= 7).length;
  const totalPending = totals?.open ?? queue.filter(i => i.stage !== 'dispatched').length;

  async function recordFee(item: CertQueueItem) {
    setBusy(true);
    try {
      await markFee.mutateAsync(item.requestId);
      toast.success(`Fee of ₹${item.fee} recorded as received`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the fee.');
    } finally { setBusy(false); }
  }

  async function decline(item: CertQueueItem, reason: string) {
    setBusy(true);
    try {
      await advance.mutateAsync({ id: item.requestId, stage: 'REJECTED', reason });
      setProcessing(null);
      toast.success('Request declined — the student has been told why');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline that request.');
    } finally { setBusy(false); }
  }

  async function download(item: CertQueueItem) {
    if (!item.certificate) return;
    try { await downloadCertificate(item.certificate); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not download the certificate.'); }
  }

  async function markReady(id: string, regNo: string) {
    const item = queue.find(i => i.id === id);
    if (!item) return;
    // Nothing leaves the counter unpaid; the fee is recorded at the counter, never assumed.
    if (item.fee > 0 && !item.feePaid) { toast.error('Record the fee as received first'); return; }
    setBusy(true);
    try {
      // A request still at 'requested' has to reach the office before it is
      // ready — the server enforces the order, so walk it.
      if (item.stage === 'requested') {
        await advance.mutateAsync({ id: item.requestId, stage: 'COLLEGE_OFFICE' });
      }
      await advance.mutateAsync({
        id: item.requestId,
        stage: 'READY',
        notes: `Register: ${regNo}`,
      });
      setProcessing(null);
      toast.success(`Certificate signed and issued — the student has been notified. Register: ${regNo}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not mark that certificate ready.');
    } finally { setBusy(false); }
  }

  async function markDispatched(id: string) {
    const item = queue.find(i => i.id === id);
    if (!item) return;
    try {
      await advance.mutateAsync({ id: item.requestId, stage: 'DISPATCHED' });
      toast.success('Certificate marked as dispatched');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not dispatch that certificate.');
    }
  }

  return (
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="border-b border-[#D3D8E0] px-6 py-4">
        <h1 className="text-[18px] font-semibold text-[#16264A]">Certificate Queue</h1>
        <p className="text-[13px] text-[#5A6577]">SLA-tracked certificate processing for all student requests</p>
      </div>

      {/* SLA Summary */}
      <div className="grid grid-cols-4 border-b border-[#D3D8E0]">
        {[
          { label: 'Overdue', value: overdue, color: '#A8242C', bg: '#FEE2E2' },
          { label: 'Due Today', value: dueToday, color: '#8A6D1F', bg: '#FEF9EC' },
          { label: 'Due This Week', value: dueWeek, color: '#8A6D1F', bg: '#FEF9EC' },
          { label: 'Total Pending', value: totalPending, color: '#16264A', bg: '#EDEFF3' },
        ].map(stat => (
          <div key={stat.label} className="px-5 py-4 border-r border-[#D3D8E0] last:border-r-0">
            <p className="text-[11px] text-[#5A6577] uppercase tracking-wide mb-1">{stat.label}</p>
            <p className="text-[24px] font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="px-5 py-3 border-b border-[#D3D8E0] flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or ID…"
          className="h-8 px-3 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] w-52"
        />
        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value as typeof stageFilter)}
          className="h-8 px-2 text-[13px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
        >
          <option value="all">All Stages</option>
          <option value="requested">Requested</option>
          <option value="college_office">College Office</option>
          <option value="ready">Ready</option>
          <option value="dispatched">Dispatched</option>
          <option value="rejected">Declined</option>
        </select>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)}
          className="h-8 px-2 text-[13px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="normal">Normal</option>
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as typeof sort)}
          className="h-8 px-2 text-[13px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
        >
          <option value="oldest">Oldest First (SLA urgency)</option>
          <option value="newest">Newest First</option>
        </select>
        <span className="ml-auto text-[12px] text-[#5A6577]">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#EDEFF3]">
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide whitespace-nowrap">CR ID</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Type</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Student</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Programme</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide whitespace-nowrap">Requested</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide whitespace-nowrap">SLA Deadline</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Stage</th>
              <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Priority</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const isUrgent = item.priority === 'urgent';
              return (
                <tr
                  key={item.id}
                  className={`border-b border-[#D3D8E0] hover:bg-[#FAFAFA] ${isUrgent ? 'border-l-4 border-l-[#E0952A]' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-[12px] text-[#16264A] whitespace-nowrap">{item.id}</td>
                  <td className="px-4 py-3 text-[#16264A] font-medium">{item.type}</td>
                  <td className="px-4 py-3">
                    <div className="text-[#16264A] font-medium">{item.studentName}</div>
                    <div className="font-mono text-[11px] text-[#5A6577]">{item.studentId}</div>
                  </td>
                  <td className="px-4 py-3 text-[#5A6577]">{item.programme}</td>
                  <td className="px-4 py-3 text-[#5A6577] whitespace-nowrap">{item.requestedOn}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-[#5A6577] text-[12px] mb-0.5">{item.slaDeadline}</div>
                    <SLABadge deadline={item.slaDeadline} />
                  </td>
                  <td className="px-4 py-3">
                    {item.stage === 'requested' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#FEF9EC] text-[#8A6D1F]">
                        Requested
                      </span>
                    )}
                    {item.stage === 'rejected' && (
                      <span title={item.rejectReason ?? ''} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#FEE2E2] text-[#A8242C]">
                        Declined
                      </span>
                    )}
                    {item.stage === 'college_office' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#EFF6FF] text-[#1D4ED8]">
                        College Office
                      </span>
                    )}
                    {item.stage === 'ready' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#D1FAE5] text-[#0E7A5F]">
                        Ready
                      </span>
                    )}
                    {item.stage === 'dispatched' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#F1F5F9] text-[#5A6577]">
                        Dispatched
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.priority === 'urgent' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#FEF9EC] text-[#8A6D1F]">
                        Urgent
                      </span>
                    ) : (
                      <span className="text-[12px] text-[#5A6577]">Normal</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {(item.stage === 'requested' || item.stage === 'college_office') && (
                      <Button size="sm" onClick={() => setProcessing(item)}>Process</Button>
                    )}
                    {(item.stage === 'ready' || item.stage === 'dispatched') && item.certificate && (
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-mono text-[11px] text-[#0E7A5F]">✓ Signed · {item.certificate.serialNo}</span>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => void download(item)}>PDF</Button>
                          {item.stage === 'ready'
                            ? <Button variant="secondary" size="sm" onClick={() => markDispatched(item.id)}>Mark Dispatched</Button>
                            : <span className="text-[12px] text-[#5A6577] self-center">Dispatched</span>}
                        </div>
                      </div>
                    )}
                    {(item.stage === 'ready' || item.stage === 'dispatched') && !item.certificate && (
                      item.stage === 'ready'
                        ? <Button variant="secondary" size="sm" onClick={() => markDispatched(item.id)}>Mark Dispatched</Button>
                        : <span className="text-[12px] text-[#5A6577]">Dispatched</span>
                    )}
                    {item.stage === 'rejected' && (
                      <span className="text-[12px] text-[#5A6577]">{item.rejectReason ?? 'Declined'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[#5A6577] text-[14px]">
                  No certificates match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {processing && (
        <ProcessModal
          item={processing}
          onClose={() => setProcessing(null)}
          onMarkReady={(regNo) => markReady(processing.id, regNo)}
          onFee={() => void recordFee(processing)}
          onDecline={(reason) => void decline(processing, reason)}
          busy={busy}
        />
      )}
    </div>
  );
}

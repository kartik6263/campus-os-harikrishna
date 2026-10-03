import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useFiles, moveStoredFile, pickAndUpload, type StoredFileInfo } from '../../../lib/records';
import { downloadPdf } from '../../../lib/export';
import {
  useAwardTender,
  useCreateTender,
  useIssueCorrigendum,
  useOpenFinancials,
  usePublishTender,
  useScoreBid,
  useTenderList,
  type LegacyTender as Tender,
  type LegacyTenderBid as TenderBid,
  type TenderStatus,
} from '../../../lib/procurementqueries';
import {
  Button, Input, Modal, Tabs, DataTable, toast, ToastContainer,
} from '../../../components/ui';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<TenderStatus, { label: string; color: string }> = {
  draft:       { label: 'Draft',       color: 'bg-gray-100 text-gray-600 border-gray-300' },
  published:   { label: 'Published',   color: 'bg-blue-100 text-blue-700 border-blue-300' },
  corrigendum: { label: 'Corrigendum', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  bid_open:    { label: 'Bids Open',   color: 'bg-amber-100 text-amber-700 border-amber-300' },
  evaluation:  { label: 'Evaluation',  color: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  awarded:     { label: 'Awarded',     color: 'bg-green-100 text-green-700 border-green-300' },
  cancelled:   { label: 'Cancelled',   color: 'bg-red-100 text-red-600 border-red-300' },
};

function TenderStatusBadge({ status }: { status: TenderStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border uppercase tracking-wide ${m.color}`}>
      {m.label}
    </span>
  );
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

const FLOW_STEPS: { key: TenderStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'published', label: 'Published' },
  { key: 'bid_open', label: 'Bid Open' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'awarded', label: 'Awarded' },
];

function StatusStepper({ status }: { status: TenderStatus }) {
  const idx = FLOW_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-0 my-3">
      {FLOW_STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step.key} className="flex items-center">
            <div className={`flex flex-col items-center`}>
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition-colors
                ${active ? 'bg-[#E0952A] border-[#E0952A] text-white'
                  : done ? 'bg-[#16264A] border-[#16264A] text-white'
                  : 'bg-white border-[#D3D8E0] text-[#5A6577]'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${active ? 'text-[#E0952A] font-bold' : done ? 'text-[#16264A]' : 'text-[#5A6577]'}`}>
                {step.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`h-0.5 w-10 mb-4 ${done ? 'bg-[#16264A]' : 'bg-[#D3D8E0]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Summary Band ─────────────────────────────────────────────────────────────

function SummaryBand() {
  const stats = [
    { label: 'Active Tenders', value: 2 },
    { label: 'Bids Open', value: 1 },
    { label: 'Under Evaluation', value: 1 },
    { label: 'Awarded', value: 8 },
    { label: 'Cancelled', value: 1 },
  ];
  return (
    <div className="grid grid-cols-5 gap-4 mb-5">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-lg border border-[#D3D8E0] p-4">
          <div className="text-[24px] font-bold text-[#16264A]">{s.value}</div>
          <div className="text-[12px] text-[#5A6577] mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Comparative Statement Modal ───────────────────────────────────────────────

function ComparativeModal({ open, onClose, bids, tender }: { open: boolean; onClose: () => void; bids: TenderBid[]; tender: Tender }) {
  const qualified = bids.filter(b => b.technicalQualified);
  const priced = qualified.filter((b): b is TenderBid & { financialQuote: number } => b.financialQuote !== null);
  const sorted = [...priced].sort((a, b) => a.financialQuote - b.financialQuote);

  // Until the technical stage closes the server discloses no quote at all,
  // which is the point of a two-envelope tender.
  if (!tender.financialsDisclosed) {
    return (
      <Modal open={open} onClose={onClose} title="Comparative Statement of Bids" width="640px">
        <div className="text-[13px] text-[#5A6577]">
          <p className="mb-2">
            <strong>{tender.refNo}</strong> — {tender.title}
          </p>
          <div className="p-3 bg-[#FEF9EC] border border-[#E0952A]/30 rounded text-[#8A6D1F]">
            The financial envelopes are still sealed. Quotes are disclosed only once
            every bid has been scored technically and the stage is closed — so that
            whoever scores a bid cannot know what it would cost.
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Comparative Statement of Bids" width="640px">
      <div className="text-[12px] text-[#5A6577] mb-3">
        <strong>Tender:</strong> {tender.refNo} — {tender.title}
      </div>
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="bg-[#16264A] text-white">
            <th className="px-3 py-2 text-left">Rank</th>
            <th className="px-3 py-2 text-left">Vendor</th>
            <th className="px-3 py-2 text-right">Tech Score</th>
            <th className="px-3 py-2 text-right">Quote Amount</th>
            <th className="px-3 py-2 text-center">Diff from L1</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((bid, i) => {
            const isL1 = i === 0;
            const l1Val = sorted[0]!.financialQuote;
            return (
              <tr key={bid.vendorId} className={isL1 ? 'bg-green-50 font-semibold' : 'bg-white'}>
                <td className="px-3 py-2 border-b border-[#D3D8E0]">
                  {isL1 ? <span className="text-green-700 font-bold">L1 ★</span> : `L${i + 1}`}
                </td>
                <td className="px-3 py-2 border-b border-[#D3D8E0]">{bid.vendorName}</td>
                <td className="px-3 py-2 border-b border-[#D3D8E0] text-right">{bid.technicalScore ?? '—'}</td>
                <td className={`px-3 py-2 border-b border-[#D3D8E0] text-right ${isL1 ? 'text-green-700' : ''}`}>
                  {fmt(bid.financialQuote)}
                </td>
                <td className="px-3 py-2 border-b border-[#D3D8E0] text-center text-[#5A6577]">
                  {isL1 ? '—' : `+${fmt(bid.financialQuote - l1Val)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-[13px] text-green-800">
        <strong>Recommendation:</strong> {sorted[0]?.vendorName} is L1 at {fmt(sorted[0]?.financialQuote ?? 0)} and is recommended for award.
      </div>
    </Modal>
  );
}

// ── Tender Detail View ────────────────────────────────────────────────────────

function TenderDetail({ tender, onClose, onCreatePO }: { tender: Tender; onClose: () => void; onCreatePO: (t: Tender) => void }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [corrigendumModal, setCorrigendumModal] = useState(false);
  const [corrigDesc, setCorrigDesc] = useState('');
  const [corrigDeadline, setCorrigDeadline] = useState('');
  const [compareModal, setCompareModal] = useState(false);
  const [awardModal, setAwardModal] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents' },
    ...(tender.bids?.length ? [{ id: 'bids', label: 'Bids' }] : []),
    ...(tender.status === 'awarded' ? [{ id: 'award', label: 'Award' }] : []),
  ];

  const scoreBid = useScoreBid();
  const openFinancials = useOpenFinancials();

  const issueCorrigendum = useIssueCorrigendum();
  const award = useAwardTender();
  const publish = usePublishTender();
  const docs = useFiles(`procurement:tender/${tender.tenderId}`);
  const [evalBid, setEvalBid] = useState<TenderBid | null>(null);
  const [evalScore, setEvalScore] = useState('');
  const [evalQualified, setEvalQualified] = useState(true);
  const [awardForm, setAwardForm] = useState({ delivery: '', justification: '', items: [{ description: '', unit: 'Lot', quantity: 1, unitRate: 0 }] });

  async function handleAddCorrigendum() {
    if (corrigDesc.trim().length < 10) { toast.error('Describe the change in at least 10 characters'); return; }
    try {
      const r = await issueCorrigendum.mutateAsync({ id: tender.tenderId, description: corrigDesc.trim(), newDeadline: corrigDeadline || undefined });
      toast.success(`Corrigendum issued for ${r.tenderRef}${corrigDeadline ? ` — deadline now ${corrigDeadline}` : ''}`);
      setCorrigendumModal(false);
      setCorrigDesc('');
      setCorrigDeadline('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not issue the corrigendum');
    }
  }

  function openAward() {
    if (!l1Bid) return;
    setAwardForm({ delivery: '', justification: '', items: [{ description: tender.title, unit: 'Lot', quantity: 1, unitRate: l1Bid.financialQuote }] });
    setAwardModal(true);
  }

  async function handleAwardOrder() {
    if (!l1Bid) return;
    const items = awardForm.items.filter(i => i.description.trim() && i.quantity > 0 && i.unitRate > 0);
    if (!items.length) { toast.error('Add at least one purchase-order line'); return; }
    if (!awardForm.delivery) { toast.error('Set the delivery deadline'); return; }
    try {
      const r = await award.mutateAsync({ id: tender.tenderId, bidId: l1Bid.id, deliveryDeadline: awardForm.delivery, justification: awardForm.justification.trim() || undefined, items: items.map(i => ({ ...i, description: i.description.trim() })) });
      toast.success(`Awarded to ${r.awardedTo} — purchase order ${r.purchaseOrder.poNo} raised for ${fmt(r.purchaseOrder.totalAmount)}`);
      setAwardModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not award the tender');
    }
  }

  async function saveEval() {
    if (!evalBid) return;
    const score = Number(evalScore);
    if (!(score >= 0 && score <= 100)) { toast.error('Score must be between 0 and 100'); return; }
    try {
      await scoreBid.mutateAsync({ id: evalBid.id, score, qualified: evalQualified });
      toast.success(`${evalBid.vendorName}: ${score}/100, ${evalQualified ? 'technically qualified' : 'rejected'}`);
      setEvalBid(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the evaluation');
    }
  }

  async function handlePublish() {
    try {
      const r = await publish.mutateAsync(tender.tenderId);
      toast.success(`${r.refNo} published against sanction ${r.sanctionedBy}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish');
    }
  }

  function tenderPack() {
    return downloadPdf({
      title: 'Notice Inviting Tender',
      reference: tender.refNo,
      fileName: `NIT-${tender.refNo}`,
      sections: [
        { fields: [['Tender', tender.title], ['Department', tender.department], ['Category', tender.category], ['Estimated value', fmt(tender.estimatedValue)], ['Published', tender.publishedOn], ['Last date for bids', tender.submissionDeadline], ['Bid opening', tender.openingDate], ['Sanction', tender.sanction?.requestNo ?? '—']] },
        { heading: 'Scope', text: [tender.description] },
        ...(tender.corrigendum?.length ? [{ heading: 'Corrigenda', table: { head: ['Date', 'Change'], body: tender.corrigendum.map(c => [c.date, c.description]) } }] : []),
        { heading: 'Bidding conditions', text: ['Two-envelope system as per GFR 2017: the technical bid is evaluated first; financial bids of technically qualified bidders alone are opened.', 'Only vendors empanelled with the institution may bid. Bids received after the last date are not considered.'] },
        ...(docs.files.length ? [{ heading: 'Attached documents', table: { head: ['Document', 'Size'], body: docs.files.map(f => [f.name, `${(f.size / 1024).toFixed(0)} KB`]) } }] : []),
      ],
      qr: tender.refNo,
      signatory: 'Purchase Officer',
    });
  }

  /** Closes the technical stage and opens the price envelopes of the qualified bids. */
  async function handleOpenFinancials() {
    const unscored = (tender.bids ?? []).filter(b => b.technicalQualified === undefined);
    if (unscored.length) { toast.error(`Evaluate every bid first — ${unscored.length} still unscored`); return; }
    try {
      const r = await openFinancials.mutateAsync(tender.tenderId);
      toast.success(
        r.lowest
          ? `Envelopes opened. ${r.qualified} qualified; ${r.lowest.vendor} is L1 at ${fmt(r.lowest.quote)}.`
          : `Envelopes opened. ${r.qualified} qualified.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the financial envelopes.');
    }
  }

  const qualifiedBids = tender.bids?.filter(b => b.technicalQualified) ?? [];
  const l1Bid = [...qualifiedBids]
    .filter((b): b is TenderBid & { financialQuote: number } => b.financialQuote !== null)
    .sort((a, b) => a.financialQuote - b.financialQuote)[0];

  return (
    <div className="bg-white rounded-lg border border-[#D3D8E0] mt-4">
      {/* Header */}
      <div className="bg-[#16264A] px-5 py-4 text-white flex items-start justify-between rounded-t-lg">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-blue-200 font-mono mb-1">{tender.refNo}</div>
          <div className="font-bold text-[16px] leading-snug">{tender.title}</div>
          <div className="flex items-center gap-3 mt-2">
            <TenderStatusBadge status={tender.status} />
            <span className="text-[12px] text-blue-200">{tender.department}</span>
            <span className="text-[12px] text-blue-200 font-semibold">{fmt(tender.estimatedValue)}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-blue-200 hover:text-white ml-4 text-lg shrink-0">✕</button>
      </div>

      <div className="border-b border-[#D3D8E0] px-5">
        <StatusStepper status={tender.status} />
        <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} />
      </div>

      <div className="p-5">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-6 text-[13px]">
            <div className="space-y-3">
              <DetailRow label="Tender Ref No." value={tender.refNo} mono />
              <DetailRow label="Department" value={tender.department} />
              <DetailRow label="Category" value={tender.category} />
              <DetailRow label="Estimated Value" value={fmt(tender.estimatedValue)} />
              <DetailRow label="Published On" value={tender.publishedOn} />
              <DetailRow label="Submission Deadline" value={tender.submissionDeadline} />
              <DetailRow label="Bid Opening Date" value={tender.openingDate} />
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#5A6577] uppercase tracking-widest mb-2">Description</div>
              <p className="text-[#16264A] leading-relaxed">{tender.description}</p>

              {tender.corrigendum && tender.corrigendum.length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] font-bold text-[#5A6577] uppercase tracking-widest mb-2">Corrigendum History</div>
                  <div className="space-y-2">
                    {tender.corrigendum.map((c, i) => (
                      <div key={i} className="bg-purple-50 border border-purple-200 rounded p-3">
                        <div className="text-[11px] text-purple-600 font-semibold">Corrigendum {i + 1} — {c.date}</div>
                        <div className="text-[13px] text-[#16264A] mt-1">{c.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {tender.status === 'draft' && <Button size="sm" loading={publish.isPending} onClick={() => void handlePublish()}>Publish tender</Button>}
                {(tender.status === 'published' || tender.status === 'corrigendum') && <Button size="sm" variant="ghost" onClick={() => setCorrigendumModal(true)}>+ Add Corrigendum</Button>}
              </div>
              {tender.status === 'draft' && <p className="text-[12px] text-[#5A6577] mt-2">{tender.sanction ? `Sanction ${tender.sanction.requestNo}: ${tender.sanction.status.toLowerCase()}. Publishing needs it approved for at least the estimate.` : 'No sanction is linked; it cannot be published.'}</p>}
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-3 border border-[#D3D8E0] rounded-lg bg-[#F7F8FA]">
              <div className="text-[24px]">📄</div>
              <div className="flex-1">
                <div className="font-medium text-[#16264A] text-[13px]">Notice Inviting Tender (NIT) — generated</div>
                <div className="text-[11px] text-[#5A6577]">From the tender record, with any corrigenda and the attached documents listed</div>
              </div>
              <button onClick={() => void tenderPack()} className="text-[12px] text-[#E0952A] font-semibold hover:underline cursor-pointer">Download</button>
            </div>
            {docs.isLoading && <p className="text-[12px] text-[#5A6577]">Loading documents…</p>}
            {docs.files.map(doc => (
              <div key={doc.id} className="flex items-center gap-4 p-3 border border-[#D3D8E0] rounded-lg">
                <div className="text-[24px]">📎</div>
                <div className="flex-1">
                  <div className="font-medium text-[#16264A] text-[13px]">{doc.name}</div>
                  <div className="text-[11px] text-[#5A6577]">Uploaded {new Date(doc.createdAt).toLocaleDateString('en-IN')} · {(doc.size / 1024).toFixed(0)} KB</div>
                </div>
                <button onClick={() => void docs.download(doc)} className="text-[12px] text-[#E0952A] font-semibold hover:underline cursor-pointer">Download</button>
                <button onClick={() => void docs.remove(doc.id)} className="text-[12px] text-[#A8242C] hover:underline cursor-pointer">Remove</button>
              </div>
            ))}
            {!docs.isLoading && docs.files.length === 0 && <p className="text-[12px] text-[#5A6577]">No documents attached yet — add the tender form, BOQ and specifications.</p>}
            <div className="flex items-center gap-3 mt-3">
              <Button size="sm" variant="ghost" onClick={() => void docs.upload('.pdf,.doc,.docx,.xls,.xlsx,image/*')}>+ Add Document</Button>
              <Button size="sm" onClick={() => void tenderPack()}>Download Tender Pack</Button>
            </div>
          </div>
        )}

        {activeTab === 'bids' && tender.bids && (
          <div className="space-y-6">
            {/* Technical Evaluation */}
            <div>
              <div className="text-[13px] font-bold text-[#16264A] mb-3">Technical Evaluation</div>
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-[#EDEFF3]">
                    <th className="px-3 py-2 text-left text-[#5A6577] font-semibold border-b border-[#D3D8E0]">Vendor</th>
                    <th className="px-3 py-2 text-right text-[#5A6577] font-semibold border-b border-[#D3D8E0]">Technical Score</th>
                    <th className="px-3 py-2 text-center text-[#5A6577] font-semibold border-b border-[#D3D8E0]">Qualified?</th>
                    <th className="px-3 py-2 text-center text-[#5A6577] font-semibold border-b border-[#D3D8E0]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tender.bids.map(bid => (
                    <tr key={bid.vendorId} className="border-b border-[#D3D8E0]">
                      <td className="px-3 py-2 text-[#16264A]">{bid.vendorName}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#16264A]">{bid.technicalScore ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {bid.technicalQualified === undefined ? <span className="text-[#5A6577]">—</span>
                          : bid.technicalQualified
                            ? <span className="text-green-600 font-semibold">✔ Qualified</span>
                            : <span className="text-red-500 font-semibold">✗ Rejected</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!tender.financialsDisclosed
                          ? <button onClick={() => { setEvalBid(bid); setEvalScore(bid.technicalScore !== undefined ? String(bid.technicalScore) : ''); setEvalQualified(bid.technicalQualified ?? true); }} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">{bid.technicalQualified === undefined ? 'Evaluate' : 'Revise'}</button>
                          : <span className="text-[11px] text-[#5A6577]">Closed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!tender.financialsDisclosed && (tender.bids?.length ?? 0) > 0 && (
              <div className="p-3 bg-[#FEF9EC] border border-[#E0952A]/40 rounded text-[13px] text-[#16264A] flex items-center justify-between gap-3">
                <span>Financial envelopes stay sealed until every bid is evaluated and the technical stage is closed.</span>
                <Button size="sm" loading={openFinancials.isPending || scoreBid.isPending} onClick={() => void handleOpenFinancials()}>Close technical stage &amp; open quotes</Button>
              </div>
            )}

            {/* Financial Evaluation */}
            {qualifiedBids.length > 0 && tender.financialsDisclosed && (
              <div>
                <div className="text-[13px] font-bold text-[#16264A] mb-3">Financial Evaluation (Technically Qualified Bidders)</div>
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-[#EDEFF3]">
                      <th className="px-3 py-2 text-left text-[#5A6577] font-semibold border-b border-[#D3D8E0]">Vendor</th>
                      <th className="px-3 py-2 text-right text-[#5A6577] font-semibold border-b border-[#D3D8E0]">Quote Amount</th>
                      <th className="px-3 py-2 text-center text-[#5A6577] font-semibold border-b border-[#D3D8E0]">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...qualifiedBids]
                      .filter((b): b is TenderBid & { financialQuote: number } => b.financialQuote !== null)
                      .sort((a, b) => a.financialQuote - b.financialQuote).map((bid, i) => (
                      <tr key={bid.vendorId} className={`border-b border-[#D3D8E0] ${i === 0 ? 'bg-green-50' : ''}`}>
                        <td className="px-3 py-2 text-[#16264A] font-medium">{bid.vendorName}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${i === 0 ? 'text-green-700' : 'text-[#16264A]'}`}>
                          {fmt(bid.financialQuote)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {i === 0
                            ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[11px] font-bold">L1</span>
                            : <span className="text-[#5A6577]">L{i + 1}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center gap-3">
                  <Button size="sm" variant="ghost" onClick={() => setCompareModal(true)}>Generate Comparative Statement</Button>
                  {tender.status !== 'awarded' && l1Bid && (
                    <Button size="sm" onClick={openAward}>Create Award Order</Button>
                  )}
                </div>
                {l1Bid && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-[13px] text-blue-800">
                    <strong>Recommendation:</strong> {l1Bid.vendorName} (L1, {fmt(l1Bid.financialQuote)})
                    {tender.status !== 'awarded' && (
                      <Button size="sm" className="ml-3" onClick={openAward}>Create Award Order</Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'award' && tender.status === 'awarded' && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <DetailRow label="Awarded To" value={tender.awardedTo ?? '—'} />
                <DetailRow label="PO Number" value={tender.poNo ?? '—'} mono />
                <DetailRow label="Final Value" value={tender.bids?.[0] ? fmt(tender.bids.find(b => b.l1)?.financialQuote ?? 0) : '—'} />
              </div>
              <div>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-green-700 font-bold text-[15px]">Tender Awarded</div>
                  <div className="text-green-600 text-[12px] mt-1">Work order / PO has been issued to the successful bidder.</div>
                  <Button size="sm" className="mt-3" onClick={() => window.dispatchEvent(new CustomEvent('procurement:open-orders', { detail: tender.poNo }))}>
                    View Purchase Order {tender.poNo}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal open={corrigendumModal} onClose={() => setCorrigendumModal(false)} title="Add Corrigendum"
        footer={<>
          <Button variant="ghost" onClick={() => setCorrigendumModal(false)}>Cancel</Button>
          <Button loading={issueCorrigendum.isPending} disabled={corrigDesc.trim().length < 10} onClick={() => void handleAddCorrigendum()}>Issue Corrigendum</Button>
        </>}>
        <div className="space-y-3">
          <Input label="Description of Changes" value={corrigDesc} onChange={e => setCorrigDesc(e.target.value)} />
          <Input label="Extended Submission Deadline" type="date" value={corrigDeadline} onChange={e => setCorrigDeadline(e.target.value)} />
        </div>
      </Modal>

      {tender.bids && (
        <ComparativeModal open={compareModal} onClose={() => setCompareModal(false)} bids={tender.bids} tender={tender} />
      )}

      <Modal open={awardModal} onClose={() => setAwardModal(false)} title="Award and raise purchase order" width="640px"
        footer={<>
          <Button variant="ghost" onClick={() => setAwardModal(false)}>Cancel</Button>
          <Button loading={award.isPending} onClick={() => void handleAwardOrder()}>Confirm award</Button>
        </>}>
        <div className="space-y-3 text-[13px]">
          <div className="p-3 bg-[#EDEFF3] rounded grid grid-cols-2 gap-2">
            <DetailRow label="Lowest qualified (L1)" value={l1Bid?.vendorName ?? '—'} />
            <DetailRow label="L1 quote" value={l1Bid ? fmt(l1Bid.financialQuote) : '—'} />
          </div>
          <p className="font-semibold text-[#16264A]">Purchase-order lines</p>
          {awardForm.items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6"><Input label={i === 0 ? 'Description' : undefined} value={it.description} onChange={e => setAwardForm(f => ({ ...f, items: f.items.map((x, j) => j === i ? { ...x, description: e.target.value } : x) }))} /></div>
              <div className="col-span-2"><Input label={i === 0 ? 'Unit' : undefined} value={it.unit} onChange={e => setAwardForm(f => ({ ...f, items: f.items.map((x, j) => j === i ? { ...x, unit: e.target.value } : x) }))} /></div>
              <div className="col-span-1"><Input label={i === 0 ? 'Qty' : undefined} type="number" value={String(it.quantity)} onChange={e => setAwardForm(f => ({ ...f, items: f.items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x) }))} /></div>
              <div className="col-span-3"><Input label={i === 0 ? 'Unit rate (₹)' : undefined} type="number" value={String(it.unitRate)} onChange={e => setAwardForm(f => ({ ...f, items: f.items.map((x, j) => j === i ? { ...x, unitRate: Number(e.target.value) } : x) }))} /></div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={() => setAwardForm(f => ({ ...f, items: [...f.items, { description: '', unit: 'Nos', quantity: 1, unitRate: 0 }] }))} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">+ Add line</button>
            <span className="text-[#16264A]">PO total: <strong>{fmt(awardForm.items.reduce((s, i) => s + i.quantity * i.unitRate, 0))}</strong></span>
          </div>
          <Input label="Delivery deadline" type="date" value={awardForm.delivery} onChange={e => setAwardForm(f => ({ ...f, delivery: e.target.value }))} />
          <Input label="Justification (needed if the order exceeds the L1 quote)" value={awardForm.justification} onChange={e => setAwardForm(f => ({ ...f, justification: e.target.value }))} />
        </div>
      </Modal>

      <Modal open={!!evalBid} onClose={() => setEvalBid(null)} title={`Technical evaluation — ${evalBid?.vendorName ?? ''}`}
        footer={<><Button variant="ghost" onClick={() => setEvalBid(null)}>Cancel</Button><Button loading={scoreBid.isPending} onClick={() => void saveEval()}>Record evaluation</Button></>}>
        <div className="space-y-3 text-[13px]">
          <Input label="Technical score (0–100)" type="number" value={evalScore} onChange={e => setEvalScore(e.target.value)} />
          <div className="flex gap-2">
            {[true, false].map(q => (
              <button key={String(q)} onClick={() => setEvalQualified(q)} className={`flex-1 py-2 rounded border text-[13px] font-semibold cursor-pointer ${evalQualified === q ? (q ? 'bg-green-50 border-green-400 text-green-700' : 'bg-red-50 border-red-400 text-red-600') : 'border-[#D3D8E0] text-[#5A6577]'}`}>{q ? '✔ Technically qualified' : '✗ Reject'}</button>
            ))}
          </div>
          <p className="text-[12px] text-[#5A6577]">The financial quote stays sealed: it is disclosed only for qualified bids, when the technical stage is closed.</p>
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#5A6577] shrink-0">{label}</span>
      <span className={`text-[#16264A] font-medium text-right ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
    </div>
  );
}

// ── Create Tender Modal ───────────────────────────────────────────────────────

interface Sanction { requestNo: string; subject: string; amount: number | null; inUse: boolean }

function CreateTenderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: '', dept: '', category: '', value: '', description: '',
    publishDate: '', deadline: '', openingDate: '', completionDate: '', requestNo: '',
  });
  const [attached, setAttached] = useState<Record<string, StoredFileInfo>>({});
  const [draftKey] = useState(() => `draft-${Date.now().toString(36)}`);
  const createTender = useCreateTender();
  const publishTender = usePublishTender();
  const sanctions = useQuery({ queryKey: ['procurement', 'sanctions'], queryFn: () => api<{ sanctions: Sanction[] }>('/api/procurement/sanctions').then(r => r.sanctions), enabled: open });
  const [raising, setRaising] = useState(false);

  async function raiseSanction() {
    if (!form.title.trim() || !Number(form.value)) { toast.error('Give the tender a title and estimate first (step 1)'); return; }
    setRaising(true);
    try {
      const r = await api<{ requestNo: string }>('/api/governance/requests', { method: 'POST', body: { kind: 'PROCUREMENT', subject: `Procurement sanction: ${form.title.trim()}`, details: form.description.trim() || form.title.trim(), amount: Math.round(Number(form.value)), priority: 'NORMAL', slaDays: 7 } });
      setForm(f => ({ ...f, requestNo: r.requestNo }));
      toast.success(`Sanction request ${r.requestNo} sent to the principal's approval inbox`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not raise the sanction request');
    } finally {
      setRaising(false);
    }
  }

  const stepValid = step === 1 ? form.title.trim().length >= 5 && form.dept.trim().length >= 2 && form.category.trim().length >= 2 && Number(form.value) > 0 && form.description.trim().length >= 10
    : step === 2 ? Boolean(form.deadline && form.openingDate && form.openingDate >= form.deadline)
    : true;

  function set(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function handlePublish() {
    try {
      const t = await createTender.mutateAsync({ title: form.title.trim(), description: form.description.trim(), department: form.dept.trim(), category: form.category.trim(), estimatedValue: Math.round(Number(form.value)), submissionDeadline: form.deadline, openingDate: form.openingDate, requestNo: form.requestNo || undefined });
      await Promise.all(Object.values(attached).map(f => moveStoredFile(f.id, `procurement:tender/${t.id}`)));
      try {
        await publishTender.mutateAsync(t.id);
        toast.success(`Tender ${t.refNo} published`);
      } catch (err) {
        toast.info(`Tender ${t.refNo} saved as a draft — ${err instanceof Error ? err.message : 'it cannot be published yet'}. Publish it from the tender once the sanction is approved.`);
      }
      onClose();
      setStep(1);
      setAttached({});
      setForm({ title: '', dept: '', category: '', value: '', description: '', publishDate: '', deadline: '', openingDate: '', completionDate: '', requestNo: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the tender');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Create New Tender — Step ${step} of 4`} width="600px"
      footer={<>
        {step > 1 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}>Back</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {step < 4
          ? <Button disabled={!stepValid} onClick={() => setStep(s => s + 1)}>Next</Button>
          : <Button loading={createTender.isPending || publishTender.isPending} onClick={() => void handlePublish()}>{form.requestNo ? 'Create & Publish' : 'Save as Draft'}</Button>}
      </>}>
      {step === 1 && (
        <div className="space-y-3">
          <Input label="Tender Title" value={form.title} onChange={set('title')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Department" value={form.dept} onChange={set('dept')} />
            <Input label="Category" value={form.category} onChange={set('category')} />
          </div>
          <Input label="Estimated Value (₹)" type="number" value={form.value} onChange={set('value')} />
          <div>
            <label className="block text-[12px] text-[#5A6577] mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={set('description')}
              className="w-full border border-[#D3D8E0] rounded px-3 py-2 text-[13px] text-[#16264A] outline-none focus:border-[#16264A] resize-none" />
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] text-[#5A6577] mb-1">Procurement sanction (approved request)</label>
            <select value={form.requestNo} onChange={set('requestNo')} className="w-full h-9 px-3 border border-[#D3D8E0] rounded text-[13px] bg-white cursor-pointer">
              <option value="">None yet</option>
              {(sanctions.data ?? []).filter(s => !s.inUse).map(s => <option key={s.requestNo} value={s.requestNo}>{s.requestNo} — {s.subject}{s.amount ? ` (${fmt(s.amount)})` : ''}</option>)}
              {form.requestNo && !(sanctions.data ?? []).some(s => s.requestNo === form.requestNo) && <option value={form.requestNo}>{form.requestNo} — awaiting the principal</option>}
            </select>
            {!form.requestNo && <button onClick={() => void raiseSanction()} disabled={raising} className="mt-1 text-[12px] text-[#E0952A] hover:underline cursor-pointer disabled:opacity-50">{raising ? 'Raising…' : `+ Raise a sanction request for ${form.value ? fmt(Number(form.value)) : 'the estimate'}`}</button>}
          </div>
          <Input label="Publication Date" type="date" value={form.publishDate} onChange={set('publishDate')} />
          <Input label="Bid Submission Deadline" type="date" value={form.deadline} onChange={set('deadline')} />
          <Input label="Bid Opening Date" type="date" value={form.openingDate} onChange={set('openingDate')} />
          <Input label="Completion Date" type="date" value={form.completionDate} onChange={set('completionDate')} />
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-[13px] text-[#5A6577]">Upload tender documents before publishing:</p>
          {['Notice Inviting Tender (NIT)', 'Tender Form / Terms & Conditions', 'Bill of Quantities (BOQ)', 'Technical Drawings / Specifications'].map(doc => (
            <div key={doc} className="border-2 border-dashed border-[#D3D8E0] rounded-lg p-3 flex items-center gap-3">
              <div className="text-[20px]">📄</div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-[#16264A]">{doc}</div>
                <div className="text-[11px] text-[#5A6577]">PDF — max 10 MB</div>
              </div>
              {attached[doc]
                ? <span className="text-[12px] text-[#0E7A5F] font-semibold">✓ {attached[doc]!.name}</span>
                : <button onClick={() => void pickAndUpload(`procurement:${draftKey}`, '.pdf,.doc,.docx,.xls,.xlsx').then(f => { if (f) setAttached(a => ({ ...a, [doc]: f })); })} className="text-[12px] text-[#E0952A] font-semibold hover:underline cursor-pointer">Upload</button>}
            </div>
          ))}
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3 text-[13px]">
          <div className="bg-[#EDEFF3] rounded-lg p-4 space-y-2">
            <DetailRow label="Title" value={form.title || 'Not provided'} />
            <DetailRow label="Department" value={form.dept || '—'} />
            <DetailRow label="Category" value={form.category || '—'} />
            <DetailRow label="Estimated Value" value={form.value ? fmt(Number(form.value)) : '—'} />
            <DetailRow label="Publication Date" value={form.publishDate || '—'} />
            <DetailRow label="Submission Deadline" value={form.deadline || '—'} />
            <DetailRow label="Opening Date" value={form.openingDate || '—'} />
            <DetailRow label="Sanction" value={form.requestNo || 'None — will be saved as a draft'} />
            <DetailRow label="Documents" value={`${Object.keys(attached).length} attached`} />
          </div>
          <p className="text-[#5A6577]">{form.requestNo ? 'The tender is created and published if its sanction is approved for at least the estimate; otherwise it is kept as a draft to publish once approved.' : 'Without a sanction the tender is saved as a draft.'}</p>
        </div>
      )}
    </Modal>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TenderManagement() {
  const { data: tenders, totals } = useTenderList();
  const publishTender = usePublishTender();

  // Read the open tender back out of the live list, so a bid scored or an
  // envelope opened is reflected in the panel that did it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTender = tenders.find(t => t.id === selectedId) ?? null;
  const setSelectedTender = (t: Tender | null) => setSelectedId(t?.id ?? null);
  void totals;
  void publishTender;
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = tenders.filter(t => statusFilter === 'all' || t.status === statusFilter);

  const columns = [
    { key: 'refNo', label: 'Ref No.', width: 170, mono: true },
    { key: 'title', label: 'Title', width: 280 },
    { key: 'department', label: 'Department' },
    { key: 'estimatedValue', label: 'Est. Value', align: 'right' as const,
      render: (t: Tender) => fmt(t.estimatedValue) },
    { key: 'submissionDeadline', label: 'Deadline' },
    { key: 'status', label: 'Status', sortable: false,
      render: (t: Tender) => <TenderStatusBadge status={t.status} /> },
    { key: '_actions', label: 'Actions', sortable: false,
      render: (t: Tender) => (
        <button className="text-[12px] text-[#E0952A] font-semibold hover:underline"
          onClick={e => { e.stopPropagation(); setSelectedTender(t); }}>
          Open
        </button>
      ),
    },
  ] as Parameters<typeof DataTable<Tender>>[0]['columns'];

  return (
    <div className="min-h-screen bg-[#EDEFF3] p-6">
      <ToastContainer />

      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] text-[#5A6577] uppercase tracking-widest mb-1">Governance → Procurement</div>
          <h1 className="text-[22px] font-bold text-[#16264A]">Tender Management</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Create New Tender</Button>
      </div>

      <SummaryBand />

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="text-[13px] text-[#5A6577] font-medium">Filter by Status:</div>
        {(['all', 'draft', 'published', 'bid_open', 'evaluation', 'awarded', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-[12px] font-semibold border transition-colors ${statusFilter === s ? 'bg-[#16264A] text-white border-[#16264A]' : 'bg-white text-[#5A6577] border-[#D3D8E0] hover:border-[#16264A]'}`}>
            {s === 'all' ? 'All' : STATUS_META[s].label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-[#D3D8E0] overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={t => setSelectedTender(t)}
          searchPlaceholder="Search tenders…"
          emptyTitle="No tenders found"
        />
      </div>

      {selectedTender && (
        <TenderDetail
          tender={selectedTender}
          onClose={() => setSelectedTender(null)}
          onCreatePO={() => {}}
        />
      )}

      <CreateTenderModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

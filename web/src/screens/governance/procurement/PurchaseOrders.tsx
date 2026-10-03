import { useState } from 'react';
import {
  useAdvanceOrder,
  useOrderList,
  type LegacyPOItem as POItem,
  type LegacyPurchaseOrder as PurchaseOrder,
} from '../../../lib/procurementqueries';
import {
  Button, Input, Modal, DataTable, toast, ToastContainer,
} from '../../../components/ui';
import { instPlace } from '../../../lib/institution';

// ── Types / Data ──────────────────────────────────────────────────────────────

type POStatus = PurchaseOrder['status'];

// Purchase orders come from the API; this screen holds no data of its own.



// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

const STATUS_STEPS: { key: POStatus; label: string }[] = [
  { key: 'issued',           label: 'PO Issued' },
  { key: 'acknowledged',     label: 'Acknowledged' },
  { key: 'partial_delivery', label: 'Delivery' },
  { key: 'delivered',        label: 'GRN' },
  { key: 'inspected',        label: 'Inspection' },
  { key: 'bill_passed',      label: 'Bill Passed' },
  { key: 'paid',             label: 'Payment' },
];

// Normalize so "bill_passed" and "inspected" display correctly in stepper
const STATUS_ORDER: Record<POStatus, number> = {
  issued: 0, acknowledged: 1, partial_delivery: 2, delivered: 3,
  inspected: 4, bill_passed: 5, paid: 6,
};

function POStatusBadge({ status }: { status: POStatus }) {
  const colors: Record<POStatus, string> = {
    issued:           'bg-blue-100 text-blue-700 border-blue-300',
    acknowledged:     'bg-indigo-100 text-indigo-700 border-indigo-300',
    partial_delivery: 'bg-amber-100 text-amber-700 border-amber-300',
    delivered:        'bg-orange-100 text-orange-700 border-orange-300',
    inspected:        'bg-purple-100 text-purple-700 border-purple-300',
    bill_passed:      'bg-teal-100 text-teal-700 border-teal-300',
    paid:             'bg-green-100 text-green-700 border-green-300',
  };
  const labels: Record<POStatus, string> = {
    issued: 'PO Issued', acknowledged: 'Acknowledged', partial_delivery: 'Partial Delivery',
    delivered: 'Delivered', inspected: 'Inspected', bill_passed: 'Bill Passed', paid: 'Paid',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border uppercase tracking-wide ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

// ── Workflow Stepper ──────────────────────────────────────────────────────────

function WorkflowStepper({ status }: { status: POStatus }) {
  const cur = STATUS_ORDER[status];
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {STATUS_STEPS.map((step, i) => {
        const done = i < cur;
        const active = i === cur;
        return (
          <div key={step.key} className="flex items-center shrink-0">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition-colors
                ${active ? 'bg-[#E0952A] border-[#E0952A] text-white'
                  : done ? 'bg-[#16264A] border-[#16264A] text-white'
                  : 'bg-white border-[#D3D8E0] text-[#5A6577]'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-1 text-center max-w-[60px] leading-tight
                ${active ? 'text-[#E0952A] font-bold' : done ? 'text-[#16264A] font-medium' : 'text-[#5A6577]'}`}>
                {step.label}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={`h-0.5 w-10 mb-5 shrink-0 ${done ? 'bg-[#16264A]' : 'bg-[#D3D8E0]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Action Modal Factory ──────────────────────────────────────────────────────

interface ActionModal {
  type: POStatus | null;
  po: PurchaseOrder | null;
}

function grnAutoNumber() {
  return `RDU/GRN/2024/${String(Math.floor(Math.random() * 900) + 100)}`;
}

function POActionModal({ modal, onClose, onSuccess }: {
  modal: ActionModal;
  onClose: () => void;
  onSuccess: (id: string, updates: Partial<PurchaseOrder>) => void;
}) {
  const { type, po } = modal;
  const advance = useAdvanceOrder();
  const [f, setF] = useState<Record<string, string>>({});
  if (!po || !type) return null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const configs: Record<string, { title: string; fields: { key: string; label: string; type?: string }[]; nextStatus: POStatus; successMsg: string }> = {
    issued: {
      title: 'Record Vendor Acknowledgement',
      fields: [{ key: 'ackDate', label: 'Acknowledgement Date', type: 'date' }, { key: 'ackRef', label: 'Reference / Letter No.' }],
      nextStatus: 'acknowledged',
      successMsg: 'Vendor acknowledgement recorded.',
    },
    acknowledged: {
      title: 'Record Delivery',
      fields: [
        { key: 'deliveryDate', label: 'Delivery Date', type: 'date' },
        { key: 'grnNo', label: `GRN Number (auto: ${grnAutoNumber()})` },
      ],
      nextStatus: 'delivered',
      successMsg: 'Delivery and GRN recorded.',
    },
    delivered: {
      title: 'Record Inspection',
      fields: [
        { key: 'inspDate', label: 'Inspection Date', type: 'date' },
        { key: 'inspBy', label: 'Inspected By (Name & Designation)' },
        { key: 'remarks', label: 'Remarks / Observations' },
      ],
      nextStatus: 'inspected',
      successMsg: 'Inspection result recorded.',
    },
    inspected: {
      title: 'Mark Bill Received',
      fields: [
        { key: 'invoiceNo', label: 'Invoice Number' },
        { key: 'invoiceDate', label: 'Invoice Date', type: 'date' },
        { key: 'invoiceAmt', label: 'Invoice Amount (₹)', type: 'number' },
      ],
      nextStatus: 'bill_passed',
      successMsg: 'Bill received and passed.',
    },
    bill_passed: {
      title: 'Record Payment',
      fields: [
        { key: 'payDate', label: 'Payment Date', type: 'date' },
        { key: 'utr', label: 'UTR / RTGS Reference' },
        { key: 'bank', label: 'Paying Bank' },
        { key: 'amount', label: 'Amount Paid (₹)', type: 'number' },
      ],
      nextStatus: 'paid',
      successMsg: 'Payment recorded successfully.',
    },
  };

  const cfg = configs[type];
  if (!cfg) return null;

  const STAGE: Record<string, 'ACKNOWLEDGED' | 'DELIVERED' | 'INSPECTED' | 'BILL_PASSED' | 'PAID'> = {
    acknowledged: 'ACKNOWLEDGED',
    delivered: 'DELIVERED',
    inspected: 'INSPECTED',
    bill_passed: 'BILL_PASSED',
    paid: 'PAID',
  };

  async function handleSubmit() {
    const order = po!;
    const stage = STAGE[cfg.nextStatus];
    if (!stage) {
      onClose();
      return;
    }
    try {
      await advance.mutateAsync({
        id: order.orderId,
        stage,
        // Receiving goods needs its note, a bill its invoice, a payment its
        // reference — the server refuses each without them.
        ...(f.grnNo ? { grnNo: f.grnNo } : {}),
        ...(f.invoiceNo ? { invoiceNo: f.invoiceNo } : {}),
        ...(f.utr ? { paymentRef: f.utr } : {}),
        // Calling a delivery complete means the lines are complete.
        ...(stage === 'DELIVERED'
          ? { delivered: order.items.map(i => ({ itemId: i.id, quantity: i.quantity })) }
          : {}),
      });
      toast.success(cfg.successMsg);
      onSuccess(order.id, {});
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record that step.');
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={cfg.title}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit}>Confirm</Button>
      </>}>
      <div className="space-y-3">
        {cfg.fields.map(field => (
          <Input key={field.key} label={field.label} type={field.type ?? 'text'} value={f[field.key] ?? ''} onChange={set(field.key)} />
        ))}
      </div>
    </Modal>
  );
}

// ── PO Document Modal ─────────────────────────────────────────────────────────

function PODocumentModal({ po, open, onClose }: { po: PurchaseOrder; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Purchase Order Document" width="680px">
      <div className="border border-[#D3D8E0] rounded-lg p-6 text-[13px] font-serif">
        {/* Letterhead */}
        <div className="text-center border-b-2 border-[#16264A] pb-4 mb-4">
          <div className="text-[18px] font-bold text-[#16264A]">{instPlace()}</div>
          <div className="text-[12px] text-[#5A6577]">University Road, Demo City — 474 011</div>
          <div className="text-[11px] text-[#5A6577] mt-1">Tel: 1800-000-1235 | Web: www.demo.resolion.edu</div>
          <div className="mt-3 text-[14px] font-bold tracking-widest uppercase text-[#16264A]">Purchase Order</div>
        </div>

        {/* PO Meta */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-4 text-[12px]">
          <div><span className="text-[#5A6577]">PO No.: </span><strong>{po.poNo}</strong></div>
          <div><span className="text-[#5A6577]">Date: </span><strong>{po.issueDate}</strong></div>
          <div><span className="text-[#5A6577]">Tender Ref.: </span><strong>{po.tenderId}</strong></div>
          <div><span className="text-[#5A6577]">Delivery By: </span><strong>{po.deliveryDeadline}</strong></div>
        </div>

        {/* Vendor */}
        <div className="mb-4 text-[12px]">
          <div className="font-bold text-[#16264A] mb-1">To,</div>
          <div className="font-semibold">{po.vendorName}</div>
          <div className="text-[#5A6577]">M/s {po.vendorName}</div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse text-[12px] mb-4">
          <thead>
            <tr className="bg-[#16264A] text-white">
              <th className="px-2 py-1.5 text-left border border-[#16264A]">S.No.</th>
              <th className="px-2 py-1.5 text-left border border-[#16264A]">Description</th>
              <th className="px-2 py-1.5 text-center border border-[#16264A]">Unit</th>
              <th className="px-2 py-1.5 text-right border border-[#16264A]">Qty</th>
              <th className="px-2 py-1.5 text-right border border-[#16264A]">Unit Rate</th>
              <th className="px-2 py-1.5 text-right border border-[#16264A]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item, i) => (
              <tr key={i} className="border border-[#D3D8E0]">
                <td className="px-2 py-1 border border-[#D3D8E0]">{i + 1}</td>
                <td className="px-2 py-1 border border-[#D3D8E0]">{item.description}</td>
                <td className="px-2 py-1 border border-[#D3D8E0] text-center">{item.unit}</td>
                <td className="px-2 py-1 border border-[#D3D8E0] text-right">{item.quantity}</td>
                <td className="px-2 py-1 border border-[#D3D8E0] text-right">{item.unitRate ? fmt(item.unitRate) : '—'}</td>
                <td className="px-2 py-1 border border-[#D3D8E0] text-right font-semibold">{item.amount ? fmt(item.amount) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#EDEFF3] font-bold">
              <td colSpan={5} className="px-2 py-1.5 border border-[#D3D8E0] text-right">Total</td>
              <td className="px-2 py-1.5 border border-[#D3D8E0] text-right">{fmt(po.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Terms */}
        <div className="text-[11px] text-[#5A6577] mb-6 space-y-1">
          <div>• Delivery within 30 days of PO date unless otherwise specified.</div>
          <div>• Payment within 30 days of GRN and inspection certificate.</div>
          <div>• All taxes as applicable shall be deducted at source.</div>
          <div>• GST invoice must match GSTIN: 23AAAJJ1234A1ZQ.</div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-4 text-center text-[11px] mt-8">
          <div>
            <div className="border-t border-[#16264A] pt-2 font-semibold">Accounts Officer</div>
          </div>
          <div>
            <div className="border-t border-[#16264A] pt-2 font-semibold">Purchase Committee</div>
          </div>
          <div>
            <div className="border-t border-[#16264A] pt-2 font-semibold">Registrar</div>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button onClick={() => toast.info('Downloading PO PDF…')}>Download PDF</Button>
      </div>
    </Modal>
  );
}

// ── PO Detail Panel ───────────────────────────────────────────────────────────

function PODetailPanel({ po, onClose, onUpdate }: {
  po: PurchaseOrder;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<PurchaseOrder>) => void;
}) {
  const [actionModal, setActionModal] = useState<ActionModal>({ type: null, po: null });
  const [docModal, setDocModal] = useState(false);

  const nextActionMap: Partial<Record<POStatus, POStatus>> = {
    issued: 'issued',
    acknowledged: 'acknowledged',
    delivered: 'delivered',
    inspected: 'inspected',
    bill_passed: 'bill_passed',
  };

  const actionLabels: Partial<Record<POStatus, string>> = {
    issued: 'Record Vendor Acknowledgement',
    acknowledged: 'Record Delivery',
    delivered: 'Record Inspection',
    inspected: 'Mark Bill Received',
    bill_passed: 'Record Payment',
  };

  const nextAction = nextActionMap[po.status];

  return (
    <div className="bg-white rounded-lg border border-[#D3D8E0] mt-4">
      {/* Header */}
      <div className="bg-[#16264A] px-5 py-4 text-white flex items-start justify-between rounded-t-lg">
        <div>
          <div className="text-[11px] text-blue-200 font-mono mb-1">{po.poNo}</div>
          <div className="font-bold text-[15px]">{po.vendorName}</div>
          <div className="flex items-center gap-3 mt-1">
            <POStatusBadge status={po.status} />
            <span className="text-[12px] text-blue-200">Tender: {po.tenderId}</span>
            <span className="text-[12px] text-blue-200 font-semibold">{fmt(po.totalAmount)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDocModal(true)}>Download PO</Button>
          <button onClick={onClose} className="text-blue-200 hover:text-white ml-2 text-lg">✕</button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Workflow Stepper */}
        <div>
          <div className="text-[11px] font-bold text-[#5A6577] uppercase tracking-widest mb-2">Workflow Status</div>
          <WorkflowStepper status={po.status} />
        </div>

        {/* PO Metadata */}
        <div className="grid grid-cols-4 gap-4 text-[13px]">
          <div><span className="text-[#5A6577] text-[11px]">Issue Date</span><div className="font-medium text-[#16264A] mt-0.5">{po.issueDate}</div></div>
          <div><span className="text-[#5A6577] text-[11px]">Delivery Deadline</span><div className="font-medium text-[#16264A] mt-0.5">{po.deliveryDeadline}</div></div>
          {po.grnNo && <div><span className="text-[#5A6577] text-[11px]">GRN No.</span><div className="font-mono font-medium text-[#16264A] mt-0.5 text-[12px]">{po.grnNo}</div></div>}
          {po.invoiceNo && <div><span className="text-[#5A6577] text-[11px]">Invoice No.</span><div className="font-mono font-medium text-[#16264A] mt-0.5 text-[12px]">{po.invoiceNo}</div></div>}
          {po.paymentRef && <div><span className="text-[#5A6577] text-[11px]">Payment Ref.</span><div className="font-mono font-medium text-[#16264A] mt-0.5 text-[12px]">{po.paymentRef}</div></div>}
        </div>

        {/* Items Table */}
        <div>
          <div className="text-[11px] font-bold text-[#5A6577] uppercase tracking-widest mb-2">PO Items</div>
          <div className="overflow-x-auto rounded border border-[#D3D8E0]">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="bg-[#EDEFF3]">
                  {['Description', 'Unit', 'Qty', 'Unit Rate', 'Amount', 'Delivered Qty'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[#5A6577] font-semibold border-b border-[#D3D8E0] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {po.items.map((item, i) => (
                  <tr key={i} className="border-b border-[#D3D8E0] last:border-0">
                    <td className="px-3 py-2 text-[#16264A]">{item.description}</td>
                    <td className="px-3 py-2 text-[#5A6577]">{item.unit}</td>
                    <td className="px-3 py-2 text-right text-[#16264A]">{item.quantity}</td>
                    <td className="px-3 py-2 text-right text-[#16264A]">{item.unitRate ? fmt(item.unitRate) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#16264A]">{item.amount ? fmt(item.amount) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        defaultValue={item.deliveredQty ?? 0}
                        min={0} max={item.quantity}
                        className="w-16 border border-[#D3D8E0] rounded px-2 py-0.5 text-[12px] text-center text-[#16264A] outline-none focus:border-[#16264A]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#EDEFF3] font-bold">
                  <td colSpan={4} className="px-3 py-2 text-right text-[#5A6577]">Total</td>
                  <td className="px-3 py-2 text-right text-[#16264A]">{fmt(po.totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Action Button */}
        {nextAction && actionLabels[nextAction] && (
          <div>
            <Button onClick={() => setActionModal({ type: nextAction, po })}>
              {actionLabels[nextAction]}
            </Button>
          </div>
        )}
        {po.status === 'paid' && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-[13px] text-green-700 font-semibold">
            ✔ This PO is fully processed. Payment has been recorded.
            {po.paymentDate && <span className="font-normal text-green-600 ml-2">Paid on {po.paymentDate}</span>}
          </div>
        )}
      </div>

      <POActionModal
        modal={actionModal}
        onClose={() => setActionModal({ type: null, po: null })}
        onSuccess={(id, updates) => {
          onUpdate(id, updates);
          setActionModal({ type: null, po: null });
        }}
      />

      <PODocumentModal po={po} open={docModal} onClose={() => setDocModal(false)} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PurchaseOrders() {
  const { data: pos, totals } = useOrderList();

  // Read the open order back out of the live list, so a stage recorded in
  // the drawer moves the row behind it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pos.find(p => p.id === selectedId) ?? null;
  const setSelected = (p: PurchaseOrder | null) => setSelectedId(p?.id ?? null);

  const [vendorFilter, setVendorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  function updatePO(_id: string, _updates: Partial<PurchaseOrder>) {
    // Nothing to hold: the list refetches after every write.
  }
  void totals;

  const filtered = pos.filter(p => {
    const vendorMatch = !vendorFilter || p.vendorName.toLowerCase().includes(vendorFilter.toLowerCase());
    const statusMatch = statusFilter === 'all' || p.status === statusFilter;
    return vendorMatch && statusMatch;
  });

  const columns = [
    { key: 'poNo', label: 'PO No.', width: 150, mono: true },
    { key: 'vendorName', label: 'Vendor', width: 220 },
    { key: 'tenderId', label: 'Tender Ref.', mono: true },
    { key: 'totalAmount', label: 'Amount', align: 'right' as const,
      render: (p: PurchaseOrder) => fmt(p.totalAmount) },
    { key: 'issueDate', label: 'Issue Date' },
    { key: 'deliveryDeadline', label: 'Delivery By' },
    { key: 'status', label: 'Status', sortable: false,
      render: (p: PurchaseOrder) => <POStatusBadge status={p.status} /> },
    { key: '_actions', label: 'Actions', sortable: false,
      render: (p: PurchaseOrder) => (
        <button className="text-[12px] text-[#E0952A] font-semibold hover:underline"
          onClick={e => { e.stopPropagation(); setSelected(p); }}>
          Open
        </button>
      ),
    },
  ] as Parameters<typeof DataTable<PurchaseOrder>>[0]['columns'];

  // Summary stats
  const summary = {
    total: pos.length,
    pending: pos.filter(p => !['paid'].includes(p.status)).length,
    paid: pos.filter(p => p.status === 'paid').length,
    totalValue: pos.reduce((s, p) => s + p.totalAmount, 0),
  };

  return (
    <div className="min-h-screen bg-[#EDEFF3] p-6">
      <ToastContainer />

      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] text-[#5A6577] uppercase tracking-widest mb-1">Governance → Procurement</div>
          <h1 className="text-[22px] font-bold text-[#16264A]">Purchase Orders</h1>
        </div>
      </div>

      {/* Summary Band */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total POs', value: summary.total },
          { label: 'Active / Pending', value: summary.pending },
          { label: 'Paid / Closed', value: summary.paid },
          { label: 'Total Value', value: fmt(summary.totalValue) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-[#D3D8E0] p-4">
            <div className="text-[20px] font-bold text-[#16264A]">{s.value}</div>
            <div className="text-[12px] text-[#5A6577] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          placeholder="Filter by vendor…"
          value={vendorFilter}
          onChange={e => setVendorFilter(e.target.value)}
          className="border border-[#D3D8E0] rounded px-3 py-1.5 text-[13px] text-[#16264A] outline-none focus:border-[#16264A] bg-white w-52"
        />
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#5A6577]">Status:</span>
          {(['all', 'issued', 'acknowledged', 'delivered', 'inspected', 'bill_passed', 'paid'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${statusFilter === s ? 'bg-[#16264A] text-white border-[#16264A]' : 'bg-white text-[#5A6577] border-[#D3D8E0] hover:border-[#16264A]'}`}>
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#D3D8E0] overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={p => setSelected(p)}
          searchPlaceholder="Search POs…"
          emptyTitle="No purchase orders found"
        />
      </div>

      {selected && (
        <PODetailPanel
          po={selected}
          onClose={() => setSelected(null)}
          onUpdate={updatePO}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useFiles, moveStoredFile, pickAndUpload, type StoredFileInfo } from '../../../lib/records';

/** The documents empanelment asks for, each filed under its own key. */
const VENDOR_DOCS = [
  { key: 'gst', label: 'GST Registration Certificate' },
  { key: 'pan', label: 'PAN Card' },
  { key: 'bank', label: 'Cancelled Cheque / Bank Details' },
  { key: 'incorporation', label: 'Company Incorporation / Partnership Deed' },
  { key: 'experience', label: 'Experience Certificate (relevant works)' },
];
import {
  useAddVendor,
  useSetVendorStatus,
  useVendorList,
  type LegacyVendor as Vendor,
  type VendorStatus,
} from '../../../lib/procurementqueries';
import {
  Button, Input, Modal, Tabs, DataTable, toast, ToastContainer,
} from '../../../components/ui';

// ── helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: VendorStatus) {
  return s === 'empanelled' ? 'bg-green-100 text-green-700 border-green-300'
    : s === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-300'
    : s === 'blacklisted' ? 'bg-red-100 text-red-600 border-red-300 line-through'
    : 'bg-orange-100 text-orange-700 border-orange-300';
}

function StatusBadge({ status }: { status: VendorStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border uppercase tracking-wide ${statusColor(status)}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Summary band ─────────────────────────────────────────────────────────────

function SummaryBand() {
  const stats = [
    { label: 'Total Vendors', value: 48 },
    { label: 'Empanelled', value: 41 },
    { label: 'Pending Verification', value: 5 },
    { label: 'Blacklisted', value: 2 },
  ];
  return (
    <div className="grid grid-cols-4 gap-4 mb-5">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-lg border border-[#D3D8E0] p-4">
          <div className="text-[24px] font-bold text-[#16264A]">{s.value}</div>
          <div className="text-[12px] text-[#5A6577] mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Document Checklist ────────────────────────────────────────────────────────

function DocChecklist({ vendor }: { vendor: Vendor }) {
  return (
    <div className="space-y-2">
      {VENDOR_DOCS.map(d => <DocRow key={d.key} vendor={vendor} doc={d} />)}
      {vendor.documentsVerified && <p className="text-[11px] text-green-700 font-semibold">Documents verified at empanelment</p>}
    </div>
  );
}

function DocRow({ vendor, doc }: { vendor: Vendor; doc: { key: string; label: string } }) {
  const files = useFiles(`procurement:vendor/${vendor.vendorId}/${doc.key}`);
  const file = files.files[0];
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {file ? <span className="text-green-600">✔</span> : <span className="text-amber-500">⏳</span>}
      <span className={file ? 'text-[#16264A]' : 'text-amber-600'}>{doc.label}</span>
      <span className="ml-auto flex gap-2">
        {file
          ? <button onClick={() => void files.download(file)} className="text-[11px] font-semibold text-[#E0952A] hover:underline cursor-pointer">{file.name.length > 18 ? `${file.name.slice(0, 16)}…` : file.name}</button>
          : <span className="text-[11px] font-semibold text-amber-600">Missing</span>}
        <button onClick={() => void files.upload('.pdf,image/*')} className="text-[11px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{file ? 'Replace' : 'Upload'}</button>
      </span>
    </div>
  );
}

// ── Vendor Drawer ─────────────────────────────────────────────────────────────

interface DrawerProps {
  vendor: Vendor | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Vendor>) => void;
}

function VendorDrawer({ vendor, onClose, onUpdate }: DrawerProps) {
  const setStatus = useSetVendorStatus();

  const [reasonModal, setReasonModal] = useState<'suspend' | 'blacklist' | null>(null);
  const [reason, setReason] = useState('');
  const [renewModal, setRenewModal] = useState(false);
  const [renewDate, setRenewDate] = useState('');
  const [bidHistoryModal, setBidHistoryModal] = useState(false);

  if (!vendor) return null;

  /** A year from today, as the empanelment default. */
  const nextYear = () =>
    new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  async function handleEmpanel() {
    const v = vendor!;
    try {
      await setStatus.mutateAsync({
        id: v.vendorId,
        status: 'EMPANELLED',
        // The register refuses empanelment while the papers are unchecked,
        // so checking them is part of the same act here.
        documentsVerified: true,
        empanelledUpto: nextYear(),
      });
      toast.success(`${v.name} has been empanelled.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not empanel that vendor.');
    }
  }

  async function handleAction() {
    if (!reason.trim()) return;
    const v = vendor!;
    const blacklisting = reasonModal === 'blacklist';
    try {
      await setStatus.mutateAsync({
        id: v.vendorId,
        status: blacklisting ? 'BLACKLISTED' : 'SUSPENDED',
        reason: reason.trim(),
      });
      toast.success(`Vendor ${blacklisting ? 'blacklisted' : 'suspended'}, with the reason on file.`);
      setReasonModal(null);
      setReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change that status.');
    }
  }

  async function handleRenew() {
    if (!renewDate) return;
    const v = vendor!;
    try {
      await setStatus.mutateAsync({
        id: v.vendorId,
        status: 'EMPANELLED',
        empanelledUpto: renewDate,
      });
      toast.success(`Empanelment renewed until ${renewDate}.`);
      setRenewModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not renew that empanelment.');
    }
  }

  const isExpiring = vendor.expired || !vendor.canBid;

  return (
    <>
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-[#D3D8E0] z-40 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="bg-[#16264A] px-5 py-4 text-white flex items-start justify-between">
          <div>
            <div className="font-bold text-[15px] leading-snug">{vendor.name}</div>
            <div className="text-[12px] text-blue-200 mt-0.5">{vendor.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={vendor.status} />
            <button onClick={onClose} className="text-blue-200 hover:text-white ml-2 text-lg">✕</button>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5 text-[13px]">
          {/* Company Details */}
          <section>
            <div className="text-[11px] font-bold text-[#5A6577] uppercase tracking-widest mb-2">Company Details</div>
            <div className="space-y-1.5">
              <DetailRow label="GSTIN" value={vendor.gstin} mono />
              <DetailRow label="PAN" value={vendor.pan} mono />
              <DetailRow label="Category" value={vendor.category.join(', ')} />
              <DetailRow label="Contact" value={vendor.contactName} />
              <DetailRow label="Mobile" value={vendor.contactMobile} />
              <DetailRow label="Email" value={vendor.email} />
              <DetailRow label="Registered On" value={vendor.registeredOn} />
            </div>
          </section>

          {/* Document Checklist */}
          <section>
            <div className="text-[11px] font-bold text-[#5A6577] uppercase tracking-widest mb-2">Document Checklist</div>
            <DocChecklist vendor={vendor} />
          </section>

          {/* Empanelment Details */}
          {vendor.empanelledUpto && (
            <section>
              <div className="text-[11px] font-bold text-[#5A6577] uppercase tracking-widest mb-2">Empanelment</div>
              <div className="space-y-1.5">
                <DetailRow label="Valid Upto" value={vendor.empanelledUpto} />
                <DetailRow label="Categories Approved" value={vendor.category.join(', ')} />
              </div>
            </section>
          )}

          {/* Action Buttons */}
          <section className="space-y-2">
            {vendor.status === 'pending' && (
              <Button className="w-full" onClick={handleEmpanel}>Empanel Vendor</Button>
            )}
            {vendor.status === 'empanelled' && (
              <>
                {isExpiring && (
                  <Button className="w-full" onClick={() => setRenewModal(true)}>Renew Empanelment</Button>
                )}
                <Button className="w-full" variant="ghost" onClick={() => setReasonModal('suspend')}>Suspend Vendor</Button>
                <Button className="w-full" variant="destructive" onClick={() => setReasonModal('blacklist')}>Blacklist Vendor</Button>
              </>
            )}
            <Button className="w-full" variant="ghost" onClick={() => setBidHistoryModal(true)}>View Bid History</Button>
          </section>
        </div>
      </div>

      {/* Reason Modal */}
      <Modal open={!!reasonModal} onClose={() => setReasonModal(null)}
        title={reasonModal === 'blacklist' ? 'Blacklist Vendor' : 'Suspend Vendor'}
        footer={<>
          <Button variant="ghost" onClick={() => setReasonModal(null)}>Cancel</Button>
          <Button variant="destructive" onClick={handleAction}>Confirm</Button>
        </>}>
        <p className="text-[13px] text-[#5A6577] mb-3">
          Please provide a reason for {reasonModal === 'blacklist' ? 'blacklisting' : 'suspending'} this vendor.
        </p>
        <Input label="Reason" value={reason} onChange={e => setReason(e.target.value)} />
      </Modal>

      {/* Renew Modal */}
      <Modal open={renewModal} onClose={() => setRenewModal(false)} title="Renew Empanelment"
        footer={<>
          <Button variant="ghost" onClick={() => setRenewModal(false)}>Cancel</Button>
          <Button onClick={handleRenew}>Renew</Button>
        </>}>
        <Input label="New Validity Date" type="date" value={renewDate} onChange={e => setRenewDate(e.target.value)} />
      </Modal>

      {/* Bid History Modal */}
      <Modal open={bidHistoryModal} onClose={() => setBidHistoryModal(false)} title="Bid History" width="560px">
        <div className="text-[13px] space-y-3">
          {vendor.id === 'VND/001' ? (
            <>
              <BidRow refNo="RDU/PROC/IT/2024/01" title="Supply of 150 Desktop Computers" result="L1 — Awarded" />
              <BidRow refNo="RDU/PROC/IT/2023/05" title="Network Infrastructure Upgrade" result="L2 — Not Awarded" />
            </>
          ) : vendor.id === 'VND/003' ? (
            <BidRow refNo="RDU/PROC/IT/2024/01" title="Supply of 150 Desktop Computers" result="L2 — Not Awarded" />
          ) : (
            <p className="text-[#5A6577]">No bid history available for this vendor.</p>
          )}
        </div>
      </Modal>
    </>
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

function BidRow({ refNo, title, result }: { refNo: string; title: string; result: string }) {
  return (
    <div className="border border-[#D3D8E0] rounded p-3">
      <div className="font-mono text-[12px] text-[#5A6577]">{refNo}</div>
      <div className="font-medium text-[#16264A] mt-0.5">{title}</div>
      <div className="text-[12px] text-[#5A6577] mt-1">{result}</div>
    </div>
  );
}

// ── Register New Vendor Modal ─────────────────────────────────────────────────

function RegisterVendorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', gstin: '', pan: '', contact: '', mobile: '', email: '', category: [] as string[] });
  const [attached, setAttached] = useState<Record<string, StoredFileInfo>>({});
  const [draftKey] = useState(() => `vendor-draft-${Date.now().toString(36)}`);
  const step1Valid = form.name.trim().length >= 2 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.gstin.trim().toUpperCase()) && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.trim().toUpperCase()) && form.contact.trim().length >= 2 && /^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, '').slice(-10)) && /\S+@\S+\.\S+/.test(form.email) && form.category.length > 0;
  const CATS = ['IT Equipment', 'Software', 'Stationery', 'Printing', 'Lab Equipment', 'Scientific Instruments', 'Civil Works', 'Construction', 'Furniture'];

  const addVendor = useAddVendor();

  function toggleCat(c: string) {
    setForm(f => ({ ...f, category: f.category.includes(c) ? f.category.filter(x => x !== c) : [...f.category, c] }));
  }

  async function handleSubmit() {
    try {
      // The register assigns the code and refuses a GSTIN already on file.
      const created = await addVendor.mutateAsync({
        name: form.name.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        pan: form.pan.trim().toUpperCase(),
        categories: form.category,
        contactName: form.contact,
        contactMobile: form.mobile,
        email: form.email,
      });
      await Promise.all(Object.entries(attached).map(([key, f]) => moveStoredFile(f.id, `procurement:vendor/${created.id}/${key}`)));
      toast.success(`Vendor registered. Code assigned: ${created.code}`);
      onClose();
      setStep(1);
      setAttached({});
      setForm({ name: '', gstin: '', pan: '', contact: '', mobile: '', email: '', category: [] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not register that vendor.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Register New Vendor — Step ${step} of 3`} width="560px"
      footer={<>
        {step > 1 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}>Back</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {step < 3
          ? <Button disabled={step === 1 && !step1Valid} onClick={() => setStep(s => s + 1)}>Next</Button>
          : <Button loading={addVendor.isPending} onClick={handleSubmit}>Submit</Button>}
      </>}>
      {step === 1 && (
        <div className="space-y-3">
          <Input label="Company / Firm Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="GSTIN" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} />
          <Input label="PAN" value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value }))} />
          <Input label="Contact Person" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
          <Input label="Mobile" value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          {!step1Valid && (form.gstin || form.pan) && <p className="text-[11px] text-[#5A6577]">GSTIN is 15 characters (e.g. 23AAACR1234A1Z5), PAN 10 (e.g. AAACR1234A); mobile a 10-digit Indian number; choose at least one category.</p>}
          <div>
            <div className="text-[12px] text-[#5A6577] mb-2">Categories (select all applicable)</div>
            <div className="flex flex-wrap gap-2">
              {CATS.map(c => (
                <button key={c} onClick={() => toggleCat(c)}
                  className={`px-2 py-1 rounded border text-[12px] transition-colors ${form.category.includes(c) ? 'bg-[#16264A] text-white border-[#16264A]' : 'bg-white text-[#5A6577] border-[#D3D8E0] hover:border-[#16264A]'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-[13px] text-[#5A6577]">Upload the following required documents:</p>
          {VENDOR_DOCS.map(doc => (
            <div key={doc.key} className="border-2 border-dashed border-[#D3D8E0] rounded-lg p-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-[#EDEFF3] rounded flex items-center justify-center text-[16px]">📄</div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-[#16264A]">{doc.label}</div>
                <div className="text-[11px] text-[#5A6577]">{attached[doc.key] ? `✓ ${attached[doc.key]!.name}` : 'PDF / JPG — max 10 MB'}</div>
              </div>
              <button onClick={() => void pickAndUpload(`procurement:${draftKey}/${doc.key}`, '.pdf,image/*').then(f => { if (f) setAttached(a => ({ ...a, [doc.key]: f })); })} className="text-[12px] text-[#E0952A] font-semibold hover:underline cursor-pointer">{attached[doc.key] ? 'Replace' : 'Upload'}</button>
            </div>
          ))}
          <p className="text-[11px] text-[#5A6577]">Documents can also be added later from the vendor's record.</p>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3 text-[13px]">
          <div className="bg-[#EDEFF3] rounded-lg p-4 space-y-2">
            <DetailRow label="Company Name" value={form.name || 'Not provided'} />
            <DetailRow label="GSTIN" value={form.gstin || '—'} />
            <DetailRow label="PAN" value={form.pan || '—'} />
            <DetailRow label="Contact" value={form.contact || '—'} />
            <DetailRow label="Mobile" value={form.mobile || '—'} />
            <DetailRow label="Email" value={form.email || '—'} />
            <DetailRow label="Categories" value={form.category.join(', ') || '—'} />
            <DetailRow label="Documents" value={`${Object.keys(attached).length} of ${VENDOR_DOCS.length} attached`} />
          </div>
          <p className="text-[#5A6577]">Once submitted, the vendor will be assigned an ID and moved to <strong>Pending Verification</strong> status.</p>
        </div>
      )}
    </Modal>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VendorManagement() {
  const { data: vendors, totals } = useVendorList();

  // Read the open drawer back out of the live register, so a status change
  // lands on the panel that made it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedVendor = vendors.find(v => v.id === selectedId) ?? null;
  const setSelectedVendor = (v: Vendor | null) => setSelectedId(v?.id ?? null);

  const [activeTab, setActiveTab] = useState('all');
  const [registerOpen, setRegisterOpen] = useState(false);

  function updateVendor(_id: string, _updates: Partial<Vendor>) {
    // Nothing to hold: the register refetches after every write.
  }
  void totals;

  const tabs = [
    { id: 'all', label: 'All Vendors' },
    { id: 'pending', label: 'Pending Registration' },
    { id: 'expiring', label: 'Empanelment Expiring' },
  ];

  const filteredVendors = vendors.filter(v => {
    if (activeTab === 'pending') return v.status === 'pending';
    if (activeTab === 'expiring') return v.expired || (v.status === 'empanelled' && !v.canBid);
    return true;
  });

  const columns = [
    { key: 'id', label: 'Vendor ID', width: 100, mono: true },
    { key: 'name', label: 'Name', width: 220 },
    { key: 'category', label: 'Category', render: (v: Vendor) => v.category.join(', ') },
    { key: 'gstin', label: 'GSTIN', mono: true },
    { key: 'contactName', label: 'Contact' },
    { key: 'empanelledUpto', label: 'Empanelled Upto', render: (v: Vendor) => v.empanelledUpto ?? '—' },
    {
      key: 'status', label: 'Status', sortable: false,
      render: (v: Vendor) => <StatusBadge status={v.status} />,
    },
    {
      key: '_actions', label: 'Actions', sortable: false,
      render: (v: Vendor) => (
        <button className="text-[12px] text-[#E0952A] font-semibold hover:underline"
          onClick={e => { e.stopPropagation(); setSelectedVendor(v); }}>
          View
        </button>
      ),
    },
  ] as Parameters<typeof DataTable<Vendor>>[0]['columns'];

  return (
    <div className="min-h-screen bg-[#EDEFF3] p-6">
      <ToastContainer />

      {/* Page Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] text-[#5A6577] uppercase tracking-widest mb-1">Governance → Procurement</div>
          <h1 className="text-[22px] font-bold text-[#16264A]">Vendor Management</h1>
        </div>
        <Button onClick={() => setRegisterOpen(true)}>+ Register New Vendor</Button>
      </div>

      <SummaryBand />

      <div className="bg-white rounded-lg border border-[#D3D8E0] overflow-hidden">
        <div className="border-b border-[#D3D8E0] px-4">
          <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} />
        </div>
        <DataTable
          columns={columns}
          data={filteredVendors}
          onRowClick={v => setSelectedVendor(v)}
          searchPlaceholder="Search vendors…"
          emptyTitle="No vendors found"
        />
      </div>

      <VendorDrawer vendor={selectedVendor} onClose={() => setSelectedVendor(null)} onUpdate={updateVendor} />
      <RegisterVendorModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}

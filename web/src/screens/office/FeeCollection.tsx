import { useState } from 'react';
import { Button, Input, Modal, toast } from '../../components/ui';
import {
  MODE_TO_API,
  receiptToLegacy,
  useCounterLookup,
  useCounterTransactions,
  useTakePayment,
  type LegacyCounterTransaction as CounterTransaction,
} from '../../lib/officequeries';
import { inst, instPlace } from '../../lib/institution';

interface Props {
  onModule: (m: string) => void;
}

const FEE_HEADS = [
  'Semester Fee', 'Examination Fee', 'Hostel Fee',
  'Library Fine', 'Miscellaneous', 'Late Fee Penalty',
];


function genReceiptNo() {
  return `CNT/RDU/2024/${String(Math.floor(Math.random() * 900000) + 100000)}`;
}

function nowStr() {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = String(h % 12 || 12).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm} ${ampm}`;
  return { date, time };
}

type Mode = 'Cash' | 'Cheque' | 'UPI' | 'DD';

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {right}
    </div>
  );
}

function ModeTab({ mode, active, onClick }: { mode: Mode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${active ? 'text-[#E0952A] border-[#E0952A]' : 'text-[#5A6577] border-transparent hover:text-[#16264A]'}`}
    >
      {mode}
    </button>
  );
}

// ─── Receipt Modal ─────────────────────────────────────────────────────────────
function ReceiptModal({
  receipt,
  onPrint,
  onNew,
}: {
  receipt: CounterTransaction;
  onPrint: () => void;
  onNew: () => void;
}) {
  return (
    <Modal open title="Payment Receipt" onClose={onNew} width="520px"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onNew}>New Collection</Button>
          <Button size="sm" onClick={onPrint}>Print Receipt</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Letterhead */}
        <div className="text-center border-b border-[#D3D8E0] pb-4">
          <div className="w-10 h-10 bg-[#16264A] rounded-[2px] flex items-center justify-center mx-auto mb-2">
            <span className="text-white font-bold text-[14px]">{inst().shortCode}</span>
          </div>
          <p className="text-[13px] font-semibold text-[#16264A]">{instPlace()}</p>
          <p className="text-[11px] text-[#5A6577]">Fee Collection Counter</p>
          <p className="text-[22px] font-bold text-[#16264A] mt-2 tracking-widest">RECEIPT</p>
        </div>

        {/* Receipt details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <span className="text-[#5A6577]">Receipt No.</span>
            <p className="font-mono font-semibold text-[#16264A] text-[12px]">{receipt.receiptNo}</p>
          </div>
          <div>
            <span className="text-[#5A6577]">Date & Time</span>
            <p className="font-medium text-[#16264A]">{receipt.date} · {receipt.time}</p>
          </div>
          <div>
            <span className="text-[#5A6577]">Student Name</span>
            <p className="font-semibold text-[#16264A]">{receipt.studentName}</p>
          </div>
          <div>
            <span className="text-[#5A6577]">Student ID</span>
            <p className="font-mono text-[12px] text-[#16264A]">{receipt.studentId}</p>
          </div>
          <div>
            <span className="text-[#5A6577]">Programme</span>
            <p className="font-medium text-[#16264A]">{receipt.programme}</p>
          </div>
          <div>
            <span className="text-[#5A6577]">Mode of Payment</span>
            <p className="font-medium text-[#16264A]">
              {receipt.mode}
              {receipt.chequeNo && ` · Cheque #${receipt.chequeNo}`}
              {receipt.upiRef && ` · ${receipt.upiRef.slice(0, 14)}…`}
              {receipt.ddNo && ` · DD #${receipt.ddNo}`}
            </p>
          </div>
        </div>

        <div className="border border-[#D3D8E0] rounded-[4px] p-4 text-center">
          <p className="text-[12px] text-[#5A6577] uppercase tracking-wide mb-1">{receipt.head}</p>
          <p className="text-[32px] font-bold text-[#16264A]">₹{receipt.amount.toLocaleString('en-IN')}</p>
        </div>

        <p className="text-[12px] text-[#5A6577] text-center">Received by: {receipt.receivedBy}</p>
        <p className="text-[11px] text-[#5A6577] text-center italic">This is a computer-generated receipt and does not require a signature.</p>
      </div>
    </Modal>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function FeeCollection({ onModule }: Props) {
  const { data: transactions, totals } = useCounterTransactions();
  const lookup = useCounterLookup();
  const takePayment = useTakePayment();

  const [studentId, setStudentId] = useState('');
  const [studentInfo, setStudentInfo] = useState<
    { id: string; name: string; programme: string; dues: number } | null
  >(null);
  const [head, setHead] = useState(FEE_HEADS[0]);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<Mode>('Cash');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [ddNo, setDdNo] = useState('');
  const [ddBank, setDdBank] = useState('');
  const [ddDate, setDdDate] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<CounterTransaction | null>(null);

  async function lookupStudent() {
    const q = studentId.trim();
    if (q.length < 2) return;
    try {
      const s = await lookup.mutateAsync(q);
      setStudentInfo({
        id: s.id,
        name: s.name,
        programme: `${s.programme.shortName} ${s.semester}`,
        dues: s.totals.due,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Student not found — check the ID and try again');
      setStudentInfo(null);
    }
  }

  function resetForm() {
    setStudentId('');
    setStudentInfo(null);
    setHead(FEE_HEADS[0]);
    setAmount('');
    setMode('Cash');
    setChequeNo('');
    setBankName('');
    setUpiRef('');
    setDdNo('');
    setDdBank('');
    setDdDate('');
    setReceiptOpen(false);
  }

  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    if (!studentInfo) return;
    setProcessing(true);
    try {
      const instrument =
        mode === 'Cheque' ? chequeNo : mode === 'DD' ? ddNo : mode === 'UPI' ? upiRef : undefined;

      const created = await takePayment.mutateAsync({
        studentId: studentInfo.id,
        head,
        amount: Number(amount),
        mode: MODE_TO_API[mode] ?? 'CASH',
        ...(instrument ? { instrument } : {}),
        ...(bankName || ddBank ? { remarks: [bankName, ddBank, ddDate].filter(Boolean).join(' · ') } : {}),
      });

      setLastReceipt(
        receiptToLegacy({
          id: created.id,
          receiptNo: created.receiptNo,
          studentId: studentInfo.id,
          enrolmentNo: created.enrolmentNo,
          studentName: created.studentName,
          programme: studentInfo.programme,
          head: created.head,
          amount: created.amount,
          mode: created.mode,
          instrument: created.instrument,
          receivedBy: 'Counter',
          receivedAt: created.receivedAt,
          status: created.status,
          remarks: null,
        }),
      );
      setReceiptOpen(true);

      // Read the balance back so the clerk sees what the student now owes.
      const refreshed = await lookup.mutateAsync(studentInfo.id);
      setStudentInfo(prev => (prev ? { ...prev, dues: refreshed.totals.due } : prev));

      if (created.status === 'PENDING_CLEARANCE') {
        toast.info('Recorded as pending clearance — the balance moves when it clears.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the payment.');
    } finally {
      setProcessing(false);
    }
  }

  // Only settled money counts towards the day's takings.
  const todayTotal = totals?.collected ?? 0;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Left: Entry Form */}
      <div className="w-[400px] flex-shrink-0 border-r border-[#D3D8E0] flex flex-col bg-white overflow-y-auto">
        <div className="border-b border-[#D3D8E0] px-5 py-4">
          <h2 className="text-[16px] font-semibold text-[#16264A]">Counter Payment Entry</h2>
          <p className="text-[12px] text-[#5A6577]">Record cash, cheque, UPI, or DD payments</p>
        </div>

        <form onSubmit={handleCollect} className="flex-1 flex flex-col">
          <div className="p-5 space-y-4">
            {/* Student lookup */}
            <SectionLabel label="Student Lookup" />
            <div className="flex gap-2">
              <input
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                placeholder="RDU/20XX/PROG/XXXX"
                className="flex-1 h-9 px-3 text-[13px] font-mono text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] placeholder-[#5A6577]/60"
              />
              <Button type="button" variant="secondary" size="sm" onClick={lookupStudent}>Look Up</Button>
            </div>

            {studentInfo && (
              <div className="bg-[#EDEFF3] border border-[#D3D8E0] rounded-[4px] p-3 text-[13px]">
                <p className="font-semibold text-[#16264A]">{studentInfo.name}</p>
                <p className="text-[#5A6577]">{studentInfo.programme}</p>
                {studentInfo.dues > 0 && (
                  <p className="text-[#A8242C] font-medium mt-1">Outstanding dues: ₹{studentInfo.dues.toLocaleString('en-IN')}</p>
                )}
                {studentInfo.dues === 0 && (
                  <p className="text-[#0E7A5F] text-[12px] mt-1">No outstanding dues</p>
                )}
              </div>
            )}

            {/* Fee Head */}
            <SectionLabel label="Payment Details" />
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Fee Head</label>
              <select
                value={head}
                onChange={e => setHead(e.target.value)}
                className="h-9 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
              >
                {FEE_HEADS.map(h => <option key={h}>{h}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min={1}
                required
                className="h-9 px-3 text-[14px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
              />
            </div>

            {/* Mode */}
            <SectionLabel label="Mode of Payment" />
            <div className="flex border-b border-[#D3D8E0]">
              {(['Cash', 'Cheque', 'UPI', 'DD'] as Mode[]).map(m => (
                <ModeTab key={m} mode={m} active={mode === m} onClick={() => setMode(m)} />
              ))}
            </div>

            {mode === 'Cheque' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-[#16264A]">Cheque No.</label>
                  <input
                    value={chequeNo}
                    onChange={e => setChequeNo(e.target.value)}
                    placeholder="Cheque number"
                    className="h-9 px-3 text-[13px] font-mono text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-[#16264A]">Bank Name</label>
                  <input
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    placeholder="Bank name"
                    className="h-9 px-3 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
                  />
                </div>
              </div>
            )}

            {mode === 'UPI' && (
              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-medium text-[#16264A]">UPI Reference No.</label>
                <input
                  value={upiRef}
                  onChange={e => setUpiRef(e.target.value)}
                  placeholder="UPI transaction reference"
                  className="h-9 px-3 text-[13px] font-mono text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
                />
              </div>
            )}

            {mode === 'DD' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-[#16264A]">DD No.</label>
                  <input
                    value={ddNo}
                    onChange={e => setDdNo(e.target.value)}
                    placeholder="DD number"
                    className="h-9 px-3 text-[13px] font-mono text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-[#16264A]">Bank</label>
                  <input
                    value={ddBank}
                    onChange={e => setDdBank(e.target.value)}
                    placeholder="Issuing bank"
                    className="h-9 px-3 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-[#16264A]">DD Date</label>
                  <input
                    type="date"
                    value={ddDate}
                    onChange={e => setDdDate(e.target.value)}
                    className="h-9 px-3 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="px-5 pb-5 mt-auto">
            <Button
              type="submit"
              className="w-full"
              loading={processing}
              disabled={!studentInfo || !amount}
            >
              Collect Payment
            </Button>
          </div>
        </form>
      </div>

      {/* Right: Transaction History */}
      <div className="flex-1 flex flex-col bg-[#EDEFF3] overflow-hidden">
        <div className="bg-white border-b border-[#D3D8E0] px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-[#16264A]">Transaction History</p>
            <p className="text-[12px] text-[#5A6577]">
              Today's collections: <span className="font-semibold text-[#0E7A5F]">₹{todayTotal.toLocaleString('en-IN')}</span> across {transactions.length} transactions
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[13px] bg-white">
            <thead className="sticky top-0">
              <tr className="bg-[#EDEFF3]">
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Date / Time</th>
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Student Name</th>
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Head</th>
                <th className="text-right px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Mode</th>
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Receipt No.</th>
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr
                  key={t.id}
                  className="border-b border-[#D3D8E0] hover:bg-[#FAFAFA] cursor-pointer"
                  onClick={() => toast.info(`Printing receipt ${t.receiptNo}…`)}
                >
                  <td className="px-4 py-3 text-[#5A6577] text-[12px]">
                    <div>{t.date}</div>
                    <div className="text-[11px]">{t.time}</div>
                  </td>
                  <td className="px-4 py-3 text-[#16264A] font-medium">{t.studentName}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{t.head}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#16264A]">₹{t.amount.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{t.mode}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[#16264A]">{t.receiptNo}</td>
                  <td className="px-4 py-3">
                    {t.status === 'complete' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#D1FAE5] text-[#0E7A5F]">
                        Cleared
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px] bg-[#FEF9EC] text-[#8A6D1F]">
                        Awaiting clearance
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptOpen && lastReceipt && (
        <ReceiptModal
          receipt={lastReceipt}
          onPrint={() => toast.success('Printing…')}
          onNew={resetForm}
        />
      )}
    </div>
  );
}

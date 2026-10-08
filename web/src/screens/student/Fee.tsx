import { useState } from 'react';
import { Button, EmptyState, InlineAlert, Modal, Spinner, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { downloadPdf } from '../../lib/export';
import { inst } from '../../lib/institution';
import { useFees, usePayFeeItem, usePayInstalment, useProfile, type Fees } from '../../lib/queries';
import { statementPdf, useMyStatement } from '../../lib/feeadmin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (m: any) => void }

const TABS = ['Dues', 'Payments & Receipts', 'Instalments'] as const;
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const CATEGORY: Record<string, string> = { TUITION: 'Tuition', DEVELOPMENT: 'Development', EXAM: 'Examination', OTHER: 'Other' };

type Paying = { kind: 'instalment'; id: string; label: string; amount: number } | { kind: 'item'; id: string; label: string; amount: number };

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>{right}</div>;
}

/**
 * The student's fee account: every charge on the ledger, what is owed, online
 * payment (through the institution's gateway) for an instalment or any single
 * fee head, and a receipt for every payment — counter or online.
 */
export default function Fee({ onNavigate }: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>('Dues');
  const { data: f, isLoading, error } = useFees();
  const { data: s } = useProfile();
  const payInst = usePayInstalment();
  const payItem = usePayFeeItem();
  const [paying, setPaying] = useState<Paying | null>(null);
  const statement = useMyStatement();

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error || !f) return <div className="p-4"><InlineAlert type="error">{error instanceof ApiError ? error.message : 'Could not load your fee account.'}</InlineAlert></div>;

  const busy = payInst.isPending || payItem.isPending;
  async function confirm() {
    if (!paying) return;
    try {
      const r = paying.kind === 'instalment' ? await payInst.mutateAsync(paying.id) : await payItem.mutateAsync(paying.id);
      toast.success(`Paid ${inr(r.amount)} — receipt ${r.receipt}`);
      setPaying(null);
      setTab('Payments & Receipts');
    } catch (err) {
      // Closing the payment window is not an error worth shouting about.
      if (err instanceof ApiError && err.code === 'cancelled') { setPaying(null); return; }
      toast.error(err instanceof ApiError ? err.message : 'Payment failed. Try again.');
    }
  }

  const receipt = (p: Fees['payments'][number]) => downloadPdf({
    title: 'Fee Receipt', subtitle: inst().name, reference: p.receipt ?? p.txnId, fileName: `receipt-${(p.receipt ?? p.txnId).replace(/\//g, '-')}`,
    sections: [
      { fields: [['Student', s?.name], ['Enrolment number', s?.enrolmentNo], ['Programme', s ? `${s.programme.name}, semester ${s.semester}` : ''], ['Towards', p.head], ['Amount', inr(Math.abs(p.amount))], ['Mode', p.mode], ['Transaction', p.txnId], ['Date', new Date(p.date).toLocaleString('en-IN')], ['Status', p.status === 'SUCCESS' ? (p.kind === 'CONCESSION' ? 'Concession credited' : p.kind === 'REFUND' ? 'Refunded to you' : 'Received') : p.status === 'PENDING' ? 'Awaiting clearance' : p.status === 'CANCELLED' ? `Cancelled — ${p.cancelReason ?? ''}` : 'Failed']] },
      ...(p.appliedTo?.length ? [{ heading: 'Applied to', table: { head: ['Fee head', 'Amount'], body: p.appliedTo.map((a) => [a.head, inr(a.amount)]) } }] : []),
    ],
    qr: `${p.receipt ?? p.txnId}|${s?.enrolmentNo ?? ''}|${p.amount}`, signatory: 'Accounts Officer',
  });

  const owing = f.items.filter(i => i.outstanding > 0).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));
  const now = Date.now();

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-[#16264A] text-white px-4 py-5">
        <p className="text-[12px] text-white/60">Outstanding</p>
        <p className={`text-[34px] font-bold leading-tight ${f.summary.due > 0 ? 'text-[#FCA5A5]' : 'text-[#6EE7B7]'}`}>{inr(f.summary.due)}</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-white/60">{inr(f.summary.paid)} paid of {inr(f.summary.total)} charged</p>
          <button disabled={!statement.data} onClick={() => statement.data && statementPdf(statement.data)} className="text-[12px] border border-white/30 rounded-[4px] px-3 py-1.5 hover:bg-white/10 cursor-pointer disabled:opacity-50">Statement PDF</button>
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] flex overflow-x-auto">
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={{ minHeight: 44 }} className={`px-4 py-3 text-[13px] font-medium whitespace-nowrap cursor-pointer ${tab === t ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>{t}</button>)}
      </div>

      {tab === 'Dues' && (
        <div className="mt-3">
          {owing.length > 0 && (
            <>
              <SectionHeader label="To pay" />
              <div className="bg-white border-b border-[#D3D8E0]">
                {owing.map(i => {
                  const late = i.dueDate && new Date(i.dueDate).getTime() < now;
                  return (
                    <div key={i.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[#16264A]">{i.head}</p>
                        <p className={`text-[12px] ${late ? 'text-[#A8242C] font-semibold' : 'text-[#5A6577]'}`}>{CATEGORY[i.category]} · {i.dueDate ? `${late ? 'was due' : 'due'} ${day(i.dueDate)}` : 'no due date'}{i.paid > 0 ? ` · ${inr(i.paid)} paid` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[14px] font-semibold text-[#A8242C]">{inr(i.outstanding)}</p>
                        <Button size="sm" className="mt-1" onClick={() => setPaying({ kind: 'item', id: i.id, label: i.head, amount: i.outstanding })}>Pay</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {owing.length === 0 && <div className="p-4"><InlineAlert type="success">Nothing is due. Your fee account is clear.</InlineAlert></div>}
          <SectionHeader label="All charges" />
          <div className="bg-white border-b border-[#D3D8E0]">
            {f.items.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#5A6577]">No charges yet.</p> : f.items.map(i => (
              <div key={i.id} className="px-4 py-2.5 border-b border-[#EDEFF3] last:border-0 flex justify-between text-[13px]">
                <span className="text-[#16264A]">{i.head}</span>
                <span className={i.outstanding > 0 ? 'text-[#A8242C]' : 'text-[#0E7A5F]'}>{inr(i.amount)}{i.outstanding === 0 ? ' ✓' : ''}</span>
              </div>
            ))}
          </div>
          {(f.concessions ?? []).length > 0 && (
            <>
              <SectionHeader label="Concessions" />
              <div className="bg-white border-b border-[#D3D8E0]">
                {f.concessions!.map(c => <div key={c.id} className="px-4 py-2.5 border-b border-[#EDEFF3] last:border-0 text-[13px]"><div className="flex justify-between"><span className="text-[#16264A]">{c.head}</span><span className={c.status === 'APPROVED' ? 'text-[#0E7A5F]' : c.status === 'REJECTED' ? 'text-[#A8242C]' : 'text-[#8A6D1F]'}>−{inr(c.amount)} · {c.status === 'PENDING' ? 'under consideration' : c.status.toLowerCase()}</span></div>{c.note && <p className="text-[11px] text-[#5A6577]">{c.note}</p>}</div>)}
              </div>
            </>
          )}
          {(f.refunds ?? []).length > 0 && (
            <>
              <SectionHeader label="Refunds" />
              <div className="bg-white border-b border-[#D3D8E0]">
                {f.refunds!.map(r => <div key={r.id} className="px-4 py-2.5 border-b border-[#EDEFF3] last:border-0 text-[13px]"><div className="flex justify-between"><span className="text-[#16264A]">{r.head} <span className="font-mono text-[11px] text-[#5A6577]">{r.no}</span></span><span className={r.status === 'PAID' ? 'text-[#0E7A5F]' : r.status === 'REJECTED' ? 'text-[#A8242C]' : 'text-[#8A6D1F]'}>{inr(r.amount)} · {r.status === 'PAID' ? `paid ${day(r.paidAt)} (${r.payoutMode} ${r.payoutRef})` : r.status === 'REQUESTED' ? 'awaiting approval' : r.status.toLowerCase()}</span></div>{r.note && <p className="text-[11px] text-[#5A6577]">{r.note}</p>}</div>)}
              </div>
            </>
          )}
          {f.scholarships.length > 0 && (
            <>
              <SectionHeader label="Scholarships adjusted" right={<button onClick={() => onNavigate('scholarship')} className="text-[12px] text-[#E0952A] cursor-pointer">Scholarships →</button>} />
              <div className="bg-white border-b border-[#D3D8E0]">
                {f.scholarships.map(sc => <div key={sc.id} className="px-4 py-2.5 flex justify-between text-[13px]"><span className="text-[#16264A]">{sc.name}</span><span className="text-[#0E7A5F]">−{inr(sc.amount)}{sc.adjusted ? ` · ${day(sc.adjustedAt)}` : ' · pending'}</span></div>)}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'Payments & Receipts' && (
        <div className="mt-3">
          {f.payments.length === 0 ? <div className="px-4"><EmptyState title="No payments yet" /></div> : (
            <div className="bg-white border-t border-b border-[#D3D8E0]">
              {f.payments.map(p => (
                <div key={p.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-[#16264A] font-medium">{p.head} · <span className={p.amount < 0 ? 'text-[#0E7A5F]' : ''}>{inr(p.amount)}</span></p>
                    <p className="text-[11px] text-[#5A6577]">{day(p.date)} · {p.mode} · <span className="font-mono">{p.receipt ?? p.txnId}</span></p>
                  </div>
                  {p.status === 'SUCCESS' || p.status === 'CANCELLED' ? <button onClick={() => void receipt(p)} className="text-[12px] font-semibold text-[#E0952A] cursor-pointer shrink-0">{p.status === 'CANCELLED' ? 'Cancelled ↓' : 'Receipt ↓'}</button>
                    : <span className={`text-[11px] font-semibold shrink-0 ${p.status === 'PENDING' ? 'text-[#8A6D1F]' : 'text-[#A8242C]'}`}>{p.status === 'PENDING' ? 'Awaiting clearance' : 'Failed'}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'Instalments' && (
        <div className="mt-3">
          {f.instalments.length === 0 ? <div className="px-4"><EmptyState title="No instalment plan" description="Pay each fee head from the Dues tab." /></div> : (
            <div className="bg-white border-t border-b border-[#D3D8E0]">
              {f.instalments.map(i => (
                <div key={i.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0 flex items-center justify-between gap-3">
                  <div><p className="text-[14px] font-medium text-[#16264A]">Instalment {i.number} · {inr(i.amount)}</p><p className="text-[12px] text-[#5A6577]">{i.paid ? `Paid ${day(i.paidAt)}` : `Due ${day(i.dueDate)}`}</p></div>
                  {i.paid ? <span className="text-[12px] font-semibold text-[#0E7A5F]">✓ Paid</span> : <Button size="sm" onClick={() => setPaying({ kind: 'instalment', id: i.id, label: `Instalment ${i.number}`, amount: i.amount })}>Pay</Button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={!!paying} onClose={() => !busy && setPaying(null)} title="Confirm payment"
        footer={<><Button variant="secondary" size="sm" disabled={busy} onClick={() => setPaying(null)}>Cancel</Button><Button size="sm" loading={busy} onClick={() => void confirm()}>Pay {paying ? inr(paying.amount) : ''}</Button></>}>
        {paying && (
          <div className="space-y-3 text-[13px]">
            <p className="text-[#16264A]">{paying.label}</p>
            <p className="text-[28px] font-bold text-[#16264A]">{inr(paying.amount)}</p>
            <p className="text-[#5A6577]">You will be taken to the secure payment page (UPI, card or net banking). The receipt is issued as soon as the payment is confirmed, and the college office sees it at once. You can also pay at the college fee counter.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

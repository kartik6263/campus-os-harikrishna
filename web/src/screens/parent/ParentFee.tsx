import { useState } from 'react';
import { Spinner, toast } from '../../components/ui';
import { useFees, usePayFeeItem, usePayInstalment, useProfile } from '../../lib/queries';
import { ApiError } from '../../lib/api';
import { downloadPdf } from '../../lib/export';

interface Props { lang: 'hi' | 'en' }

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** The ward's fee ledger — the same one the college counter and the student see. */
export default function ParentFee({ lang }: Props) {
  const { data: f, isLoading } = useFees();
  const { data: s } = useProfile();
  const pay = usePayInstalment();
  const payItem = usePayFeeItem();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [payingItem, setPayingItem] = useState<string | null>(null);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (!f) return <p className="p-6 text-center text-[14px] text-[#5A6577]">{t(lang, 'No fee records yet.', 'अभी कोई शुल्क विवरण नहीं।')}</p>;

  const instalment = f.instalments.find(i => i.id === confirming);
  const receipt = (p: (typeof f.payments)[number]) => downloadPdf({
    title: 'Fee receipt',
    reference: p.receipt ?? p.txnId,
    fileName: `receipt-${p.receipt ?? p.txnId}`,
    sections: [{ fields: [['Student', s?.name], ['Enrolment', s?.enrolmentNo], ['Programme', s ? `${s.programme.name}, Sem ${s.semester}` : ''], ['Head', p.head], ['Amount', inr(p.amount)], ['Mode', p.mode], ['Transaction', p.txnId], ['Date', new Date(p.date).toLocaleString('en-IN')], ['Status', p.status]] }],
    qr: `${p.receipt ?? p.txnId}|${s?.enrolmentNo ?? ''}|${p.amount}`,
    signatory: 'Accounts Officer',
  });

  async function confirmItem() {
    if (!payingItem) return;
    try {
      const r = await payItem.mutateAsync(payingItem);
      toast.success(t(lang, `Paid ${inr(r.amount)} — receipt ${r.receipt}`, `${inr(r.amount)} भुगतान सफल — रसीद ${r.receipt}`));
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'cancelled')) toast.error(err instanceof ApiError ? err.message : t(lang, 'Payment failed. Try again.', 'भुगतान असफल।'));
    } finally {
      setPayingItem(null);
    }
  }

  async function confirmPay() {
    if (!instalment) return;
    try {
      const r = await pay.mutateAsync(instalment.id);
      toast.success(t(lang, `Paid ${inr(r.amount)} — receipt ${r.receipt}`, `${inr(r.amount)} भुगतान सफल — रसीद ${r.receipt}`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(lang, 'Payment failed. Try again.', 'भुगतान असफल।'));
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{t(lang, 'Fee', 'फीस विवरण')}</p>
        <p className="text-white/60 text-xs">{s ? `${s.name} — ${s.programme.shortName} Sem ${s.semester}` : ''}</p>
      </div>

      <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm text-center">
        <p className="text-gray-500 text-xs mb-1">{t(lang, 'Outstanding amount', 'बकाया राशि')}</p>
        <p className={`text-5xl font-bold ${f.summary.due > 0 ? 'text-red-600' : 'text-[#0E7A5F]'}`}>{inr(f.summary.due)}</p>
        <p className="text-gray-400 text-xs mt-1">{inr(f.summary.paid)} {t(lang, 'paid of', 'भुगतान, कुल')} {inr(f.summary.total)}</p>
      </div>

      {f.instalments.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-[#16264A] font-semibold text-sm mb-3">{t(lang, 'Instalments', 'किस्तें')}</p>
          <div className="flex flex-col gap-3">
            {f.instalments.map(i => (
              <div key={i.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between gap-3">
                <div>
                  <p className="text-[#16264A] font-semibold text-sm">{t(lang, `Instalment ${i.number}`, `किस्त ${i.number}`)} · {inr(i.amount)}</p>
                  <p className="text-gray-400 text-xs">{i.paid ? `${t(lang, 'Paid', 'भुगतान')} ${i.paidAt ? new Date(i.paidAt).toLocaleDateString('en-IN') : ''}` : `${t(lang, 'Due', 'देय')} ${new Date(i.dueDate).toLocaleDateString('en-IN')}`}</p>
                </div>
                {i.paid
                  ? <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">✓ {t(lang, 'Paid', 'भुगतान')}</span>
                  : <button onClick={() => setConfirming(i.id)} className="bg-[#E0952A] text-white text-xs font-semibold px-4 py-2 rounded-lg min-h-[40px] cursor-pointer">{t(lang, 'Pay', 'भुगतान करें')}</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-4 mt-4">
        <p className="text-[#16264A] font-semibold text-sm mb-3">{t(lang, 'Fee heads', 'शुल्क मद')}</p>
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {f.items.map(item => (
            <div key={item.id} className="px-4 py-2.5 flex justify-between text-sm">
              <span className="text-[#16264A]">{item.head}</span>
              <span className="flex items-center gap-2">
                <span className={item.outstanding > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>{item.outstanding > 0 ? `${inr(item.outstanding)} ${t(lang, 'due', 'बकाया')}` : inr(item.amount)}</span>
                {item.outstanding > 0 && <button onClick={() => setPayingItem(item.id)} disabled={payItem.isPending} className="bg-[#E0952A] text-white text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-60">{payItem.isPending && payingItem === item.id ? '…' : t(lang, 'Pay', 'भुगतान')}</button>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {f.payments.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-[#16264A] font-semibold text-sm mb-3">{t(lang, 'Payments & receipts', 'भुगतान एवं रसीदें')}</p>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {f.payments.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-[#16264A] font-medium">{p.head} · {inr(p.amount)}</p>
                  <p className="text-xs text-gray-400">{new Date(p.date).toLocaleDateString('en-IN')} · {p.mode} · <span className="font-mono">{p.receipt ?? p.txnId}</span></p>
                </div>
                <button onClick={() => void receipt(p)} className="text-xs text-[#E0952A] font-semibold cursor-pointer shrink-0">{t(lang, 'Receipt', 'रसीद')} ↓</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {payingItem && (() => {
        const it = f.items.find(i => i.id === payingItem);
        if (!it) return null;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50">
            <div className="bg-white w-full max-w-sm rounded-t-2xl p-5 pb-8">
              <p className="text-[#16264A] font-bold text-base text-center mb-1">{t(lang, 'Confirm payment', 'भुगतान की पुष्टि करें')}</p>
              <p className="text-center text-gray-500 text-xs">{it.head}</p>
              <p className="text-center text-[#16264A] font-bold text-3xl my-3">{inr(it.outstanding)}</p>
              <button onClick={() => void confirmItem()} disabled={payItem.isPending} className="w-full bg-[#0E7A5F] text-white font-bold py-3 rounded-xl text-sm mb-3 min-h-[48px] cursor-pointer disabled:opacity-60">{payItem.isPending ? t(lang, 'Processing…', 'प्रक्रिया में…') : t(lang, `Pay ${inr(it.outstanding)}`, `${inr(it.outstanding)} भुगतान करें`)}</button>
              <button onClick={() => setPayingItem(null)} className="w-full text-gray-500 text-sm py-2 min-h-[44px] cursor-pointer">{t(lang, 'Cancel', 'रद्द करें')}</button>
            </div>
          </div>
        );
      })()}

      {instalment && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50">
          <div className="bg-white w-full max-w-sm rounded-t-2xl p-5 pb-8">
            <p className="text-[#16264A] font-bold text-base text-center mb-1">{t(lang, 'Confirm payment', 'भुगतान की पुष्टि करें')}</p>
            <p className="text-center text-[#16264A] font-bold text-3xl my-3">{inr(instalment.amount)}</p>
            <p className="text-center text-gray-500 text-xs mb-5">{t(lang, `Instalment ${instalment.number} for ${s?.name ?? 'your ward'}. A receipt is issued at once and appears for the college office too.`, `${s?.name ?? ''} की किस्त ${instalment.number}। रसीद तुरंत जारी होगी।`)}</p>
            <button onClick={() => void confirmPay()} disabled={pay.isPending} className="w-full bg-[#0E7A5F] text-white font-bold py-3 rounded-xl text-sm mb-3 min-h-[48px] cursor-pointer disabled:opacity-60">{pay.isPending ? t(lang, 'Processing…', 'प्रक्रिया में…') : t(lang, `Pay ${inr(instalment.amount)} by UPI`, `UPI से ${inr(instalment.amount)} भुगतान करें`)}</button>
            <button onClick={() => setConfirming(null)} className="w-full text-gray-500 text-sm py-2 min-h-[44px] cursor-pointer">{t(lang, 'Cancel', 'रद्द करें')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/language';
import { PRODUCT_NAME, useInstitution } from '../lib/institution';
import { Button, EmptyState, InlineAlert, Input, Modal, Spinner, toast } from '../components/ui';
import type { Screen } from '../lib/data';
import IdentityVerification from '../components/IdentityVerification';

/**
 * The vendor portal — a supplier's own side of procurement, over
 * `/api/vendor`. A vendor sees its standing with the purchase desk, bids on
 * open tenders in sealed envelopes, and works its purchase orders through to
 * the invoice. Rival bidders and their quotes are never shown.
 */

interface Props { onNavigate: (s: Screen) => void }

interface Me {
  id: string; code: string; name: string; gstin: string; pan: string; categories: string[];
  contactName: string; contactMobile: string; email: string;
  status: 'PENDING' | 'EMPANELLED' | 'SUSPENDED' | 'BLACKLISTED' | string;
  statusReason: string | null; documentsVerified: boolean; registeredOn: string; empanelledUpto: string | null;
  biddingBlockedReason: string | null;
  totals: { openTendersInMyCategories: number; bids: number; won: number; ordersOpen: number; orderValue: number; paid: number };
}

interface Tender {
  id: string; refNo: string; title: string; description: string | null; department: string; category: string;
  inMyCategories: boolean; estimatedValue: number; status: string; publishedOn: string | null;
  submissionDeadline: string; openingDate: string | null; open: boolean; canBid: boolean;
  corrigenda: Array<{ description: string; newDeadline: string | null; issuedAt: string }>;
  myBid: null | { id: string; financialQuote: number; status: string; canWithdraw: boolean; rankedL1: boolean; awarded: boolean };
  outcome: 'WON' | 'NOT_AWARDED' | 'CANCELLED' | null;
}

interface Order {
  id: string; poNo: string; tenderRef: string; title: string; department: string; totalAmount: number;
  issueDate: string; deliveryDeadline: string; status: string; acknowledgedAt: string | null;
  grnNo: string | null; invoiceNo: string | null; invoiceAmount: number | null; invoiceDate: string | null;
  billPassedOn: string | null; paymentDate: string | null; paymentRef: string | null;
  overdue: boolean; canAcknowledge: boolean; canInvoice: boolean;
  items: Array<{ id: string; description: string; unit: string; quantity: number; unitRate: number; amount: number; deliveredQty: number }>;
}

type Tab = 'overview' | 'tenders' | 'orders' | 'profile';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server. Please try again.');

const STATUS_TONE: Record<string, string> = {
  EMPANELLED: 'bg-[#E7F4EF] text-[#0E7A5F]',
  PENDING: 'bg-[#FEF3DC] text-[#9A5B00]',
  SUSPENDED: 'bg-[#FDECEC] text-[#A8242C]',
  BLACKLISTED: 'bg-[#FDECEC] text-[#A8242C]',
  // Purchase orders
  ISSUED: 'bg-[#FEF3DC] text-[#9A5B00]',
  ACKNOWLEDGED: 'bg-[#E8EEF8] text-[#16264A]',
  PARTIAL_DELIVERY: 'bg-[#E8EEF8] text-[#16264A]',
  DELIVERED: 'bg-[#E8EEF8] text-[#16264A]',
  INSPECTED: 'bg-[#E8EEF8] text-[#16264A]',
  BILL_PASSED: 'bg-[#E7F4EF] text-[#0E7A5F]',
  PAID: 'bg-[#E7F4EF] text-[#0E7A5F]',
  // Bids
  SUBMITTED: 'bg-[#E8EEF8] text-[#16264A]',
  TECHNICAL_QUALIFIED: 'bg-[#E7F4EF] text-[#0E7A5F]',
  TECHNICAL_REJECTED: 'bg-[#FDECEC] text-[#A8242C]',
};

function Pill({ value }: { value: string }) {
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-[3px] whitespace-nowrap ${STATUS_TONE[value] ?? 'bg-[#EDEFF3] text-[#5A6577]'}`}>
      {value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}
    </span>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <h2 className="text-[14px] font-semibold text-[#16264A]">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function VendorPortal({ onNavigate }: Props) {
  const { t, lang, toggle } = useLang();
  const { signOut } = useAuth();
  const inst = useInstitution();
  const [tab, setTab] = useState<Tab>('overview');

  const me = useQuery({ queryKey: ['vendor', 'me'], queryFn: () => api<Me>('/api/vendor/me') });

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: t('Overview', 'अवलोकन') },
    { id: 'tenders', label: t('Tenders & Bids', 'निविदाएं एवं बोलियां') },
    { id: 'orders', label: t('Purchase Orders', 'क्रय आदेश') },
    { id: 'profile', label: t('Firm Profile', 'फर्म प्रोफ़ाइल') },
  ];

  return (
    <div className="min-h-screen bg-[#EDEFF3] flex flex-col">
      <header className="bg-[#16264A] text-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#E0952A] rounded-[4px] flex items-center justify-center font-bold text-[12px]">{inst.shortCode}</div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-tight truncate">{t('Vendor Portal', 'विक्रेता पोर्टल')} · {inst.name}</p>
            <p className="text-[11px] text-white/60 leading-tight truncate">{me.data ? `${me.data.name} · ${me.data.code}` : PRODUCT_NAME}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="text-[12px] font-semibold border border-white/30 rounded-[4px] px-2 py-1 hover:bg-white/10 cursor-pointer">{lang === 'en' ? 'हिं' : 'EN'}</button>
            <button onClick={async () => { await signOut(); onNavigate('landing'); }} className="text-[12px] border border-white/30 rounded-[4px] px-3 py-1 hover:bg-white/10 cursor-pointer">{t('Sign out', 'साइन आउट')}</button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(x => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={`px-3 py-2.5 text-[13px] whitespace-nowrap border-b-2 cursor-pointer ${tab === x.id ? 'border-[#E0952A] text-white font-semibold' : 'border-transparent text-white/60 hover:text-white'}`}>
              {x.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {me.isLoading && <div className="flex justify-center py-20"><Spinner size={24} /></div>}
        {me.isError && <InlineAlert type="error">{errText(me.error)}</InlineAlert>}
        {me.data && (
          <>
            {me.data.biddingBlockedReason && (
              <div className="mb-4"><InlineAlert type={me.data.status === 'PENDING' ? 'warning' : 'error'}>{me.data.biddingBlockedReason}</InlineAlert></div>
            )}
            {tab === 'overview' && <Overview me={me.data} go={setTab} />}
            {tab === 'tenders' && <Tenders />}
            {tab === 'orders' && <Orders />}
            {tab === 'profile' && <Profile me={me.data} />}
          </>
        )}
      </main>

      <footer className="border-t border-[#D3D8E0] bg-white px-4 py-3 text-[11px] text-[#5A6577] text-center">
        {t('Bids are sealed: other bidders and their quotes are never shown to you, and yours is never shown to them.', 'बोलियां सीलबंद हैं: अन्य बोलीदाता और उनके मूल्य आपको नहीं दिखाए जाते।')}
        {inst.helpLine && <> · {t('Purchase desk', 'क्रय विभाग')}: {inst.helpLine}</>}
      </footer>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ me, go }: { me: Me; go: (t: Tab) => void }) {
  const { t } = useLang();
  const tiles: Array<{ label: string; value: string; onClick?: () => void }> = [
    { label: t('Open tenders in your categories', 'आपकी श्रेणियों में खुली निविदाएं'), value: String(me.totals.openTendersInMyCategories), onClick: () => go('tenders') },
    { label: t('Bids lodged', 'जमा बोलियां'), value: String(me.totals.bids), onClick: () => go('tenders') },
    { label: t('Tenders won', 'जीती गई निविदाएं'), value: String(me.totals.won) },
    { label: t('Orders in progress', 'प्रगति में आदेश'), value: String(me.totals.ordersOpen), onClick: () => go('orders') },
    { label: t('Total order value', 'कुल आदेश मूल्य'), value: inr(me.totals.orderValue) },
    { label: t('Received so far', 'अब तक प्राप्त'), value: inr(me.totals.paid) },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-[18px] font-semibold text-[#16264A]">{me.name}</p>
          <p className="text-[12px] text-[#5A6577] font-mono">{me.code} · GSTIN {me.gstin}</p>
        </div>
        <div className="flex items-center gap-2"><span className="text-[12px] text-[#5A6577]">{t('Status', 'स्थिति')}</span><Pill value={me.status} /></div>
        <div className="text-[12px] text-[#5A6577]">{t('Documents', 'दस्तावेज़')}: <b className={me.documentsVerified ? 'text-[#0E7A5F]' : 'text-[#9A5B00]'}>{me.documentsVerified ? t('Verified', 'सत्यापित') : t('Awaiting verification', 'सत्यापन लंबित')}</b></div>
        <div className="text-[12px] text-[#5A6577]">{t('Empanelled until', 'सूचीबद्ध तक')}: <b className="text-[#16264A]">{day(me.empanelledUpto)}</b></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map(x => (
          <button key={x.label} onClick={x.onClick} disabled={!x.onClick}
            className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 text-left enabled:hover:border-[#E0952A] enabled:cursor-pointer disabled:cursor-default">
            <p className="text-[22px] font-semibold text-[#16264A] tabular-nums">{x.value}</p>
            <p className="text-[12px] text-[#5A6577] mt-1">{x.label}</p>
          </button>
        ))}
      </div>
      <Panel title={t('How bidding works here', 'यहां बोली कैसे लगती है')}>
        <ol className="list-decimal pl-5 space-y-1 text-[13px] text-[#5A6577]">
          <li>{t('Register your firm; the purchase desk verifies your GST and PAN documents and empanels you.', 'अपनी फर्म पंजीकृत करें; क्रय विभाग दस्तावेज़ सत्यापित कर आपको सूचीबद्ध करता है।')}</li>
          <li>{t('Bid on published tenders before the deadline. You may withdraw and re-bid until the deadline.', 'समय-सीमा से पहले प्रकाशित निविदाओं पर बोली लगाएं। समय-सीमा तक वापस लेकर पुनः बोली लगा सकते हैं।')}</li>
          <li>{t('After opening you see only whether you were lowest (L1) and whether you won.', 'खुलने के बाद आप केवल यह देखते हैं कि आप L1 थे या नहीं और जीते या नहीं।')}</li>
          <li>{t('Accept the purchase order, deliver, then raise your invoice here. Payment status updates automatically.', 'क्रय आदेश स्वीकार करें, आपूर्ति करें, फिर यहां बीजक जमा करें। भुगतान स्थिति स्वतः अपडेट होती है।')}</li>
        </ol>
      </Panel>
    </div>
  );
}

// ─── Tenders ─────────────────────────────────────────────────────────────────

function Tenders() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'mine' | 'all'>('open');
  const [bidding, setBidding] = useState<Tender | null>(null);
  const q = useQuery({ queryKey: ['vendor', 'tenders'], queryFn: () => api<{ biddingBlockedReason: string | null; tenders: Tender[] }>('/api/vendor/tenders') });

  const withdraw = useMutation({
    mutationFn: (bidId: string) => api(`/api/vendor/bids/${bidId}/withdraw`, { method: 'POST' }),
    onSuccess: () => { toast.success(t('Bid withdrawn', 'बोली वापस ली गई')); void qc.invalidateQueries({ queryKey: ['vendor'] }); },
    onError: e => toast.error(errText(e)),
  });

  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner size={24} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;

  const all = q.data!.tenders;
  const rows = all.filter(x => (filter === 'open' ? x.open : filter === 'mine' ? !!x.myBid : true));

  return (
    <Panel
      title={t('Tenders', 'निविदाएं')}
      action={
        <div className="flex gap-1">
          {(['open', 'mine', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[12px] px-2.5 py-1 rounded-[4px] border cursor-pointer ${filter === f ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577] hover:border-[#16264A]'}`}>
              {f === 'open' ? t('Open now', 'अभी खुली') : f === 'mine' ? t('My bids', 'मेरी बोलियां') : t('All', 'सभी')}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={filter === 'mine' ? t('You have not bid on any tender yet', 'आपने अभी तक कोई बोली नहीं लगाई') : t('No tenders open right now', 'अभी कोई निविदा खुली नहीं है')} description={t('New tenders appear here as soon as the purchase desk publishes them.', 'क्रय विभाग द्वारा प्रकाशित होते ही नई निविदाएं यहां दिखेंगी।')} />
      ) : (
        <div className="divide-y divide-[#EDEFF3]">
          {rows.map(x => {
            const left = Math.ceil((new Date(x.submissionDeadline).getTime() - Date.now()) / 86_400_000);
            return (
              <div key={x.id} className="py-3 flex flex-col md:flex-row md:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-[#5A6577]">{x.refNo}</span>
                    <Pill value={x.status} />
                    {!x.inMyCategories && <span className="text-[11px] text-[#9A5B00]">{t('Outside your categories', 'आपकी श्रेणी से बाहर')}</span>}
                  </div>
                  <p className="text-[14px] font-semibold text-[#16264A] mt-1">{x.title}</p>
                  <p className="text-[12px] text-[#5A6577]">{x.department} · {x.category} · {t('Est.', 'अनु.')} {inr(x.estimatedValue)}</p>
                  {x.description && <p className="text-[12px] text-[#5A6577] mt-1 line-clamp-2">{x.description}</p>}
                  {x.corrigenda.length > 0 && (
                    <p className="text-[12px] text-[#9A5B00] mt-1">⚠ {t('Corrigendum', 'शुद्धिपत्र')}: {x.corrigenda[0]!.description}{x.corrigenda[0]!.newDeadline ? ` (${t('new deadline', 'नई समय-सीमा')} ${day(x.corrigenda[0]!.newDeadline)})` : ''}</p>
                  )}
                  {x.myBid && (
                    <p className="text-[12px] mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[#5A6577]">{t('Your sealed bid', 'आपकी सीलबंद बोली')}: <b className="text-[#16264A]">{inr(x.myBid.financialQuote)}</b></span>
                      <Pill value={x.myBid.status} />
                      {x.myBid.rankedL1 && <span className="text-[11px] font-semibold text-[#0E7A5F]">L1</span>}
                      {x.outcome === 'WON' && <span className="text-[11px] font-semibold text-[#0E7A5F]">🏆 {t('Awarded to you', 'आपको आवंटित')}</span>}
                      {x.outcome === 'NOT_AWARDED' && <span className="text-[11px] text-[#5A6577]">{t('Awarded to another bidder', 'अन्य बोलीदाता को आवंटित')}</span>}
                    </p>
                  )}
                </div>
                <div className="md:text-right shrink-0 flex md:flex-col items-center md:items-end gap-2">
                  <p className="text-[12px] text-[#5A6577]">{t('Closes', 'बंद')} {day(x.submissionDeadline)}{x.open && left >= 0 && <span className={left <= 3 ? ' text-[#A8242C] font-semibold' : ''}> · {left === 0 ? t('today', 'आज') : `${left} ${t('days left', 'दिन शेष')}`}</span>}</p>
                  {x.canBid && <Button size="sm" onClick={() => setBidding(x)}>{t('Submit bid', 'बोली जमा करें')}</Button>}
                  {x.myBid?.canWithdraw && (
                    <Button size="sm" variant="secondary" loading={withdraw.isPending && withdraw.variables === x.myBid.id}
                      onClick={() => { if (window.confirm(t('Withdraw this bid? You can bid again before the deadline.', 'यह बोली वापस लें? समय-सीमा से पहले फिर बोली लगा सकते हैं।'))) withdraw.mutate(x.myBid!.id); }}>
                      {t('Withdraw', 'वापस लें')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <BidModal tender={bidding} onClose={() => setBidding(null)} />
    </Panel>
  );
}

function BidModal({ tender, onClose }: { tender: Tender | null; onClose: () => void }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [proposal, setProposal] = useState('');
  const [quote, setQuote] = useState('');
  const [declared, setDeclared] = useState(false);
  const amount = Number(quote.replace(/[,\s]/g, ''));
  const valid = proposal.trim().length >= 30 && Number.isInteger(amount) && amount > 0 && declared;

  const submit = useMutation({
    mutationFn: () => api(`/api/vendor/tenders/${tender!.id}/bid`, { method: 'POST', body: { technicalProposal: proposal.trim(), financialQuote: amount, declaration: true } }),
    onSuccess: () => {
      toast.success(t('Sealed bid submitted', 'सीलबंद बोली जमा हुई'));
      void qc.invalidateQueries({ queryKey: ['vendor'] });
      setProposal(''); setQuote(''); setDeclared(false);
      onClose();
    },
  });

  return (
    <Modal open={!!tender} onClose={onClose} title={tender ? `${t('Bid on', 'बोली')} ${tender.refNo}` : ''} width="560px"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Cancel', 'रद्द करें')}</Button>
        <Button loading={submit.isPending} disabled={!valid} onClick={() => submit.mutate()}>{t('Submit sealed bid', 'सीलबंद बोली जमा करें')}</Button>
      </>}>
      {tender && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-[#5A6577]">{tender.title} · {t('estimated', 'अनुमानित')} {inr(tender.estimatedValue)}</p>
          {submit.isError && <InlineAlert type="error">{errText(submit.error)}</InlineAlert>}
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#16264A]">{t('Technical proposal', 'तकनीकी प्रस्ताव')}</span>
            <textarea rows={5} value={proposal} onChange={e => setProposal(e.target.value)} maxLength={5000}
              placeholder={t('Make, model, specifications, warranty, delivery schedule, after-sales support…', 'मेक, मॉडल, विनिर्देश, वारंटी, आपूर्ति अनुसूची…')}
              className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#16264A] resize-y" />
            <span className="text-[11px] text-[#5A6577]">{proposal.trim().length < 30 ? t(`At least 30 characters (${proposal.trim().length}/30)`, `कम से कम 30 अक्षर (${proposal.trim().length}/30)`) : `${proposal.length}/5000`}</span>
          </label>
          <Input label={t('Financial quote (₹, all taxes included)', 'वित्तीय मूल्य (₹, सभी कर सहित)')} inputMode="numeric" value={quote} onChange={e => setQuote(e.target.value.replace(/[^0-9,]/g, ''))}
            hint={amount > 0 ? inr(amount) : undefined} />
          <label className="flex items-start gap-2 text-[12px] text-[#5A6577] cursor-pointer">
            <input type="checkbox" checked={declared} onChange={e => setDeclared(e.target.checked)} className="mt-0.5" />
            <span>{t('I declare that this bid is genuine, that my firm is not blacklisted by any government body, and that the quote is valid for 90 days.', 'मैं घोषणा करता हूँ कि यह बोली वास्तविक है, मेरी फर्म किसी सरकारी निकाय द्वारा काली सूची में नहीं है, और मूल्य 90 दिनों तक मान्य है।')}</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

// ─── Purchase orders ─────────────────────────────────────────────────────────

const PO_STEPS = ['ISSUED', 'ACKNOWLEDGED', 'DELIVERED', 'INSPECTED', 'BILL_PASSED', 'PAID'];

function Orders() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState<Order | null>(null);
  const q = useQuery({ queryKey: ['vendor', 'orders'], queryFn: () => api<{ orders: Order[] }>('/api/vendor/orders') });

  const ack = useMutation({
    mutationFn: (id: string) => api(`/api/vendor/orders/${id}/acknowledge`, { method: 'POST' }),
    onSuccess: () => { toast.success(t('Order accepted', 'आदेश स्वीकार किया')); void qc.invalidateQueries({ queryKey: ['vendor'] }); },
    onError: e => toast.error(errText(e)),
  });

  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner size={24} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  const orders = q.data!.orders;

  return (
    <Panel title={t('Purchase orders', 'क्रय आदेश')}>
      {orders.length === 0 ? (
        <EmptyState title={t('No purchase orders yet', 'अभी कोई क्रय आदेश नहीं')} description={t('When you win a tender, its purchase order appears here.', 'निविदा जीतने पर उसका क्रय आदेश यहां दिखेगा।')} />
      ) : (
        <div className="divide-y divide-[#EDEFF3]">
          {orders.map(o => {
            const step = Math.max(0, PO_STEPS.indexOf(o.status === 'PARTIAL_DELIVERY' ? 'ACKNOWLEDGED' : o.status));
            return (
              <div key={o.id} className="py-3">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-[#5A6577]">{o.poNo}</span>
                      <Pill value={o.status} />
                      {o.overdue && <span className="text-[11px] font-semibold text-[#A8242C]">{t('Delivery overdue', 'आपूर्ति विलंबित')}</span>}
                    </div>
                    <p className="text-[14px] font-semibold text-[#16264A] mt-0.5">{o.title}</p>
                    <p className="text-[12px] text-[#5A6577]">{o.department} · {inr(o.totalAmount)} · {t('deliver by', 'आपूर्ति तक')} {day(o.deliveryDeadline)}</p>
                  </button>
                  <div className="flex gap-2 shrink-0">
                    {o.canAcknowledge && <Button size="sm" loading={ack.isPending && ack.variables === o.id} onClick={() => ack.mutate(o.id)}>{t('Accept order', 'आदेश स्वीकारें')}</Button>}
                    {o.canInvoice && <Button size="sm" onClick={() => setInvoicing(o)}>{t('Raise invoice', 'बीजक जमा करें')}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? t('Hide', 'छुपाएं') : t('Details', 'विवरण')}</Button>
                  </div>
                </div>
                <ol className="flex mt-2 gap-1" aria-label={t('Order progress', 'आदेश प्रगति')}>
                  {PO_STEPS.map((s, i) => (
                    <li key={s} title={s.replace(/_/g, ' ').toLowerCase()} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-[#0E7A5F]' : 'bg-[#EDEFF3]'}`} />
                  ))}
                </ol>
                {open === o.id && (
                  <div className="mt-3 bg-[#F7F8FA] border border-[#EDEFF3] rounded-[4px] p-3 text-[12px]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px]">
                        <thead><tr className="text-left text-[#5A6577]"><th className="py-1 font-medium">{t('Item', 'मद')}</th><th className="font-medium text-right">{t('Qty', 'मात्रा')}</th><th className="font-medium text-right">{t('Delivered', 'आपूर्त')}</th><th className="font-medium text-right">{t('Rate', 'दर')}</th><th className="font-medium text-right">{t('Amount', 'राशि')}</th></tr></thead>
                        <tbody>
                          {o.items.map(i => (
                            <tr key={i.id} className="border-t border-[#EDEFF3] text-[#16264A]">
                              <td className="py-1.5">{i.description}</td>
                              <td className="text-right tabular-nums">{i.quantity} {i.unit}</td>
                              <td className="text-right tabular-nums">{i.deliveredQty}</td>
                              <td className="text-right tabular-nums">{inr(i.unitRate)}</td>
                              <td className="text-right tabular-nums">{inr(i.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-3 text-[#5A6577]">
                      <div><dt>{t('Tender', 'निविदा')}</dt><dd className="text-[#16264A] font-mono">{o.tenderRef}</dd></div>
                      <div><dt>{t('Issued', 'जारी')}</dt><dd className="text-[#16264A]">{day(o.issueDate)}</dd></div>
                      <div><dt>{t('Accepted', 'स्वीकृत')}</dt><dd className="text-[#16264A]">{day(o.acknowledgedAt)}</dd></div>
                      <div><dt>GRN</dt><dd className="text-[#16264A]">{o.grnNo ?? '—'}</dd></div>
                      <div><dt>{t('Invoice', 'बीजक')}</dt><dd className="text-[#16264A]">{o.invoiceNo ? `${o.invoiceNo} · ${inr(o.invoiceAmount ?? 0)}` : '—'}</dd></div>
                      <div><dt>{t('Bill passed', 'बिल पास')}</dt><dd className="text-[#16264A]">{day(o.billPassedOn)}</dd></div>
                      <div><dt>{t('Paid', 'भुगतान')}</dt><dd className="text-[#16264A]">{day(o.paymentDate)}</dd></div>
                      <div><dt>{t('Payment ref', 'भुगतान संदर्भ')}</dt><dd className="text-[#16264A] font-mono">{o.paymentRef ?? '—'}</dd></div>
                    </dl>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <InvoiceModal order={invoicing} onClose={() => setInvoicing(null)} />
    </Panel>
  );
}

function InvoiceModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [no, setNo] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState(today);
  const amount = Number(amt.replace(/[,\s]/g, ''));
  const over = order ? amount > order.totalAmount : false;
  const valid = !!order && no.trim().length > 0 && amount > 0 && !over && !!date && date <= today;

  const submit = useMutation({
    mutationFn: () => api(`/api/vendor/orders/${order!.id}/invoice`, { method: 'POST', body: { invoiceNo: no.trim(), invoiceAmount: amount, invoiceDate: date } }),
    onSuccess: () => {
      toast.success(t('Invoice submitted to accounts', 'बीजक लेखा विभाग को भेजा गया'));
      void qc.invalidateQueries({ queryKey: ['vendor'] });
      setNo(''); setAmt(''); setDate(today);
      onClose();
    },
  });

  return (
    <Modal open={!!order} onClose={onClose} title={order ? `${t('Invoice for', 'बीजक')} ${order.poNo}` : ''}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Cancel', 'रद्द करें')}</Button>
        <Button loading={submit.isPending} disabled={!valid} onClick={() => submit.mutate()}>{t('Submit invoice', 'बीजक जमा करें')}</Button>
      </>}>
      {order && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-[#5A6577]">{t('Order value', 'आदेश मूल्य')}: <b className="text-[#16264A]">{inr(order.totalAmount)}</b></p>
          {submit.isError && <InlineAlert type="error">{errText(submit.error)}</InlineAlert>}
          <Input label={t('Invoice number', 'बीजक संख्या')} value={no} onChange={e => setNo(e.target.value)} maxLength={60} />
          <Input label={t('Invoice amount (₹)', 'बीजक राशि (₹)')} inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value.replace(/[^0-9,]/g, ''))}
            error={over ? t('Cannot exceed the order value', 'आदेश मूल्य से अधिक नहीं हो सकता') : undefined} hint={amount > 0 && !over ? inr(amount) : undefined} />
          <Input label={t('Invoice date', 'बीजक तिथि')} type="date" value={date} max={today} onChange={e => setDate(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

function Profile({ me }: { me: Me }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [contactName, setContactName] = useState(me.contactName);
  const [contactMobile, setContactMobile] = useState(me.contactMobile);
  const [cats, setCats] = useState(me.categories.join(', '));
  const canEditCats = me.status === 'PENDING';
  const categories = cats.split(',').map(s => s.trim()).filter(Boolean);
  const dirty = contactName !== me.contactName || contactMobile !== me.contactMobile || (canEditCats && categories.join('|') !== me.categories.join('|'));

  const save = useMutation({
    mutationFn: () => api('/api/vendor/me', { method: 'PATCH', body: { contactName: contactName.trim(), contactMobile: contactMobile.trim(), ...(canEditCats ? { categories } : {}) } }),
    onSuccess: () => { toast.success(t('Profile saved', 'प्रोफ़ाइल सहेजी गई')); void qc.invalidateQueries({ queryKey: ['vendor', 'me'] }); },
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Panel title={t('Registered details', 'पंजीकृत विवरण')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-[#5A6577]">{t('Firm', 'फर्म')}</dt><dd className="text-[#16264A] font-medium">{me.name}</dd>
          <dt className="text-[#5A6577]">{t('Vendor code', 'विक्रेता कोड')}</dt><dd className="font-mono">{me.code}</dd>
          <dt className="text-[#5A6577]">GSTIN</dt><dd className="font-mono">{me.gstin}</dd>
          <dt className="text-[#5A6577]">PAN</dt><dd className="font-mono">{me.pan}</dd>
          <dt className="text-[#5A6577]">{t('Email', 'ईमेल')}</dt><dd>{me.email}</dd>
          <dt className="text-[#5A6577]">{t('Registered', 'पंजीकृत')}</dt><dd>{day(me.registeredOn)}</dd>
          <dt className="text-[#5A6577]">{t('Status', 'स्थिति')}</dt><dd><Pill value={me.status} />{me.statusReason && <span className="block text-[12px] text-[#5A6577] mt-1">{me.statusReason}</span>}</dd>
        </dl>
        <p className="text-[12px] text-[#5A6577] mt-4">{t('GSTIN, PAN and firm name were verified by the purchase desk; ask them to change these.', 'GSTIN, PAN और फर्म का नाम क्रय विभाग द्वारा सत्यापित हैं; इन्हें बदलने के लिए उनसे संपर्क करें।')}</p>
      </Panel>
      <Panel title={t('Contact & categories', 'संपर्क एवं श्रेणियां')}>
        <div className="flex flex-col gap-4">
          {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
          <Input label={t('Contact person', 'संपर्क व्यक्ति')} value={contactName} onChange={e => setContactName(e.target.value)} maxLength={120} />
          <Input label={t('Contact mobile', 'संपर्क मोबाइल')} value={contactMobile} onChange={e => setContactMobile(e.target.value)} maxLength={20} />
          <Input label={t('Supply categories (comma-separated)', 'आपूर्ति श्रेणियां (अल्पविराम से अलग)')} value={cats} onChange={e => setCats(e.target.value)} disabled={!canEditCats}
            hint={canEditCats ? undefined : t('Fixed once empanelled', 'सूचीबद्ध होने के बाद स्थिर')} />
          <div><Button loading={save.isPending} disabled={!dirty || contactName.trim().length < 2 || categories.length === 0} onClick={() => save.mutate()}>{t('Save changes', 'परिवर्तन सहेजें')}</Button></div>
        </div>
      </Panel>
      <div className="md:col-span-2">
        <Panel title={t('Contact person — DigiLocker verification', 'संपर्क व्यक्ति — डिजीलॉकर सत्यापन')}>
          <p className="text-[12px] text-[#5A6577] mb-3">{t('The contact person proves who they are with their own DigiLocker; the name is matched with the contact person above.', 'संपर्क व्यक्ति अपने डिजीलॉकर से पहचान सिद्ध करते हैं; नाम ऊपर दिए संपर्क व्यक्ति से मिलाया जाता है।')}</p>
          <div className="-mx-4 -mb-4 border-t border-[#D3D8E0]"><IdentityVerification allowDocuments={false} /></div>
        </Panel>
      </div>
    </div>
  );
}

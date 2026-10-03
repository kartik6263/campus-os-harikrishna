import { useEffect, useState } from 'react';
import VendorManagement from '../procurement/VendorManagement';
import TenderManagement from '../procurement/TenderManagement';
import PurchaseOrders from '../procurement/PurchaseOrders';
import { inst } from '../../../lib/institution';

const TABS = [
  { id: 'tenders', label: 'Tenders', sub: 'Two-envelope bidding and award' },
  { id: 'vendors', label: 'Vendors', sub: 'Empanelment register' },
  { id: 'orders', label: 'Purchase orders', sub: 'Order to payment' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Procurement (Phase 7): vendors, tenders and purchase orders. */
export default function ProcurementHub() {
  const [tab, setTab] = useState<TabId>('tenders');
  // An awarded tender's 'View purchase order' brings its order up here.
  useEffect(() => {
    const open = () => setTab('orders');
    window.addEventListener('procurement:open-orders', open);
    return () => window.removeEventListener('procurement:open-orders', open);
  }, []);
  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 pt-5">
        <h1 className="text-xl font-bold text-white">Procurement</h1>
        <p className="text-blue-200 text-sm mt-0.5">{inst().name} — GFR 2017 compliant purchasing, with financial bids sealed until technical evaluation closes</p>
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-left rounded-t-[4px] cursor-pointer shrink-0 ${tab === t.id ? 'bg-[#EDEFF3] text-[#16264A]' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
              <span className="block text-[13px] font-semibold">{t.label}</span>
              <span className={`block text-[11px] ${tab === t.id ? 'text-[#5A6577]' : 'text-white/50'}`}>{t.sub}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === 'tenders' && <TenderManagement />}
      {tab === 'vendors' && <VendorManagement />}
      {tab === 'orders' && <PurchaseOrders />}
    </div>
  );
}

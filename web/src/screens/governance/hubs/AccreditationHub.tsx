import { useState } from 'react';
import AccreditationNAAC from '../accreditation/AccreditationNAAC';
import AccreditationNIRF from '../accreditation/AccreditationNIRF';
import AccreditationAISHE from '../accreditation/AccreditationAISHE';
import UGCReturns from '../accreditation/UGCReturns';
import { inst } from '../../../lib/institution';

const TABS = [
  { id: 'naac', label: 'NAAC', sub: 'Self-study report metrics' },
  { id: 'nirf', label: 'NIRF', sub: 'Ranking parameters' },
  { id: 'aishe', label: 'AISHE', sub: 'Annual survey sections' },
  { id: 'ugc', label: 'Statutory returns', sub: 'UGC and regulator calendar' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** The accreditation register (Phase 6), one framework per tab. */
export default function AccreditationHub() {
  const [tab, setTab] = useState<TabId>('naac');
  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 pt-5">
        <h1 className="text-xl font-bold text-white">Accreditation & Compliance</h1>
        <p className="text-blue-200 text-sm mt-0.5">{inst().name} — each metric says whether it is computed from the records or entered by hand</p>
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
      {tab === 'naac' && <AccreditationNAAC />}
      {tab === 'nirf' && <AccreditationNIRF />}
      {tab === 'aishe' && <AccreditationAISHE />}
      {tab === 'ugc' && <UGCReturns />}
    </div>
  );
}

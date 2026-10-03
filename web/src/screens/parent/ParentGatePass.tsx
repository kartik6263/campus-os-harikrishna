import { useState } from 'react';
import { Spinner, toast } from '../../components/ui';
import { useProfile } from '../../lib/queries';
import { useCollection } from '../../lib/records';
import { DEMO_REQUESTS, REQUEST_LABEL, fmtDate, type HostelRequest } from '../../lib/hostel';

interface Props { lang: 'hi' | 'en' }

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);

const statusStyle: Record<string, string> = {
  awaiting_parent: 'bg-purple-100 text-purple-700',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  returned: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

/**
 * The parent's half of hostel leave: the ward applies in their portal, the
 * parent consents (or not) here, and only then does it reach the warden.
 */
export default function ParentGatePass({ lang }: Props) {
  const { data: s } = useProfile();
  const requests = useCollection<HostelRequest>('student:hostel-requests', DEMO_REQUESTS);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function decide(r: HostelRequest, consent: 'given' | 'refused') {
    requests.update(r.id, { parentConsent: consent, parentNote: notes[r.id]?.trim() || undefined, status: consent === 'given' ? 'pending' : 'rejected' });
    toast.success(consent === 'given'
      ? t(lang, 'Consent given — the request has gone to the warden', 'सहमति दी गई — अनुरोध वार्डन को भेजा गया')
      : t(lang, 'Request declined — your ward has been told', 'अनुरोध अस्वीकार — आपके बच्चे को सूचित किया गया'));
  }

  const waiting = requests.items.filter(r => r.status === 'awaiting_parent');
  const rest = requests.items.filter(r => r.status !== 'awaiting_parent');

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{t(lang, 'Hostel Leave / Gate Pass', 'छात्रावास अवकाश / गेट पास')}</p>
        <p className="text-white/60 text-xs">{s?.name}</p>
      </div>

      {requests.isLoading && <div className="flex justify-center py-10"><Spinner /></div>}

      {waiting.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'Waiting for your consent', 'आपकी सहमति की प्रतीक्षा')}</p>
          {waiting.map(r => (
            <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm border-2 border-purple-200 mb-3">
              <p className="text-sm font-semibold text-[#16264A]">{r.kind === 'leave' ? t(lang, 'Leave', 'अवकाश') : t(lang, 'Gate pass', 'गेट पास')}: {fmtDate(r.from)}{r.to ? ` – ${fmtDate(r.to)}` : ''}</p>
              <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 font-mono">{r.id} · {t(lang, 'applied', 'आवेदन')} {fmtDate(r.appliedAt)}</p>
              <textarea rows={2} value={notes[r.id] ?? ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={t(lang, 'Note for the warden (optional) — e.g. who will receive your ward', 'वार्डन के लिए टिप्पणी (वैकल्पिक)')} className="w-full mt-3 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-purple-400 resize-none" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => decide(r, 'refused')} className="flex-1 py-2.5 rounded-lg border border-red-300 text-red-600 text-sm font-semibold min-h-[44px] cursor-pointer">{t(lang, 'Decline', 'अस्वीकार')}</button>
                <button onClick={() => decide(r, 'given')} className="flex-1 py-2.5 rounded-lg bg-[#0E7A5F] text-white text-sm font-semibold min-h-[44px] cursor-pointer">{t(lang, 'I consent', 'मैं सहमत हूँ')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mx-4 mt-4">
        <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'All requests', 'सभी अनुरोध')}</p>
        {!requests.isLoading && requests.items.length === 0 && <p className="text-xs text-gray-500">{t(lang, 'Your ward has not applied for leave or a gate pass.', 'आपके बच्चे ने कोई अवकाश या गेट पास नहीं मांगा है।')}</p>}
        <div className="flex flex-col gap-2">
          {rest.map(r => (
            <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#16264A]">{r.kind === 'leave' ? t(lang, 'Leave', 'अवकाश') : t(lang, 'Gate pass', 'गेट पास')}: {fmtDate(r.from)}{r.to ? ` – ${fmtDate(r.to)}` : r.outTime ? `, ${r.outTime}–${r.returnTime}` : ''}</p>
                  <p className="text-xs text-gray-500">{r.reason}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${statusStyle[r.status]}`}>{REQUEST_LABEL[r.status]}</span>
              </div>
              {r.wardenNote && <p className="text-xs text-gray-600 mt-1">{t(lang, 'Warden', 'वार्डन')}: {r.wardenNote}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

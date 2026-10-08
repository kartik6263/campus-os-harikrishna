import { useState } from 'react';
import { Spinner, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { LEAVE_LABEL, LEAVE_STYLE, day, post, useHostelAction, useMyHostel, when, type Leave } from '../../lib/hostel';

interface Props { lang: 'hi' | 'en' }

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);

/**
 * The parent's half of hostel life: the ward's room and warden, leave the
 * ward has asked for (which waits for the parent's consent before it
 * reaches the warden), and every pass with what happened at the gate.
 */
export default function ParentGatePass({ lang }: Props) {
  const q = useMyHostel();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const consent = useHostelAction(({ id, ok }: { id: string; ok: boolean }) => post(`/me/leaves/${id}/consent`, { consent: ok, ...(notes[id]?.trim() ? { note: notes[id]!.trim() } : {}) }));

  function decide(l: Leave, ok: boolean) {
    consent.mutate({ id: l.id, ok }, {
      onSuccess: () => toast.success(ok ? t(lang, 'Consent given — the request has gone to the warden', 'सहमति दी गई — अनुरोध वार्डन को भेजा गया') : t(lang, 'Declined — your ward has been told', 'अस्वीकार — आपके बच्चे को सूचित किया गया')),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not send'),
    });
  }

  if (q.isLoading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (q.isError || !q.data) return <p className="p-4 text-sm text-red-600">{q.error instanceof ApiError ? q.error.message : 'Could not load.'}</p>;
  const d = q.data;
  const a = d.allotment;
  const waiting = d.leaves.filter((l) => l.status === 'AWAITING_PARENT');
  const rest = d.leaves.filter((l) => l.status !== 'AWAITING_PARENT');

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{t(lang, 'Hostel', 'छात्रावास')}</p>
        <p className="text-white/60 text-xs">{d.student.name}</p>
      </div>

      <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm">
        {a ? (
          <>
            <p className="text-sm font-semibold text-[#16264A]">{a.hostel.name} · {t(lang, 'Room', 'कमरा')} {a.room.roomNo}, {t(lang, 'bed', 'बिस्तर')} {a.bed}</p>
            {a.hostel.wardenName && <p className="text-xs text-gray-600 mt-1">{t(lang, 'Warden', 'वार्डन')}: {a.hostel.wardenName}{a.hostel.wardenPhone && <> · <a className="text-[#E0952A]" href={`tel:${a.hostel.wardenPhone.replace(/\s/g, '')}`}>{a.hostel.wardenPhone}</a></>}</p>}
            {a.roommates.length > 0 && <p className="text-xs text-gray-500 mt-1">{t(lang, 'Roommates', 'सहपाठी')}: {a.roommates.map((m) => m.name).join(', ')}</p>}
            {d.absences.length > 0 && <p className="text-xs text-red-600 mt-2">{t(lang, 'Marked absent at night roll call', 'रात्रि हाज़िरी में अनुपस्थित')}: {d.absences.map((x) => day(x.date)).join(', ')}</p>}
          </>
        ) : <p className="text-sm text-gray-500">{t(lang, 'Your ward does not live in a hostel.', 'आपका बच्चा छात्रावास में नहीं रहता।')}</p>}
      </div>

      {waiting.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'Waiting for your consent', 'आपकी सहमति की प्रतीक्षा')}</p>
          {waiting.map((l) => (
            <div key={l.id} className="bg-white rounded-xl p-4 shadow-sm border-2 border-purple-200 mb-3">
              <p className="text-sm font-semibold text-[#16264A]">{t(lang, 'Leave', 'अवकाश')}: {when(l.leaveFrom)} – {when(l.leaveTo)}</p>
              <p className="text-xs text-gray-600 mt-0.5">{t(lang, 'Going to', 'जा रहे हैं')} {l.destination} — {l.reason}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 font-mono">{l.passNo}</p>
              <textarea rows={2} value={notes[l.id] ?? ''} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} maxLength={300} placeholder={t(lang, 'Note for the warden (optional) — e.g. who will receive your ward', 'वार्डन के लिए टिप्पणी (वैकल्पिक)')} className="w-full mt-3 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-purple-400 resize-none" />
              <div className="flex gap-2 mt-2">
                <button disabled={consent.isPending} onClick={() => decide(l, false)} className="flex-1 py-2.5 rounded-lg border border-red-300 text-red-600 text-sm font-semibold min-h-[44px] cursor-pointer disabled:opacity-50">{t(lang, 'Decline', 'अस्वीकार')}</button>
                <button disabled={consent.isPending} onClick={() => decide(l, true)} className="flex-1 py-2.5 rounded-lg bg-[#0E7A5F] text-white text-sm font-semibold min-h-[44px] cursor-pointer disabled:opacity-50">{t(lang, 'I consent', 'मैं सहमत हूँ')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mx-4 mt-4">
        <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'All leave and gate passes', 'सभी अवकाश और गेट पास')}</p>
        {rest.length === 0 && <p className="text-xs text-gray-500">{t(lang, 'Nothing else yet.', 'अभी कुछ नहीं।')}</p>}
        <div className="flex flex-col gap-2">
          {rest.map((l) => (
            <div key={l.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#16264A]">{l.kind === 'LEAVE' ? t(lang, 'Leave', 'अवकाश') : t(lang, 'Gate pass', 'गेट पास')} · {l.destination}</p>
                  <p className="text-xs text-gray-500">{when(l.leaveFrom)} – {when(l.leaveTo)}</p>
                  {l.outAt && <p className="text-xs text-gray-500">{t(lang, 'Left', 'निकले')} {when(l.outAt)}{l.returnedAt ? ` · ${t(lang, 'back', 'लौटे')} ${when(l.returnedAt)}` : ''}</p>}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${LEAVE_STYLE[l.status]}`}>{LEAVE_LABEL[l.status]}</span>
              </div>
              {l.decisionNote && <p className="text-xs text-gray-600 mt-1">{t(lang, 'Warden', 'वार्डन')}: {l.decisionNote}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

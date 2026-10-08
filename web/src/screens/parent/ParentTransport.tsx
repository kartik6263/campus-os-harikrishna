import { Spinner } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { PASS_LABEL, PASS_STYLE, day, delayText, rupees, time, useMyTransport } from '../../lib/transport';

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);

/**
 * The parent's view of the ward's bus: the pass and whether its fee is paid,
 * the driver and attendant to call, today's run with the real times the bus
 * left each stop, and whether the ward got on.
 */
export default function ParentTransport({ lang }: { lang: 'hi' | 'en' }) {
  const q = useMyTransport();
  if (q.isLoading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (q.isError || !q.data) return <p className="p-4 text-sm text-red-600">{q.error instanceof ApiError ? q.error.message : 'Could not load.'}</p>;
  const { pass: p, live, boardings, student } = q.data;
  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{t(lang, 'School bus', 'बस')}</p>
        <p className="text-white/60 text-xs">{student.name}</p>
      </div>
      {!p ? <p className="mx-4 mt-4 text-sm text-gray-500">{t(lang, 'Your ward does not travel by the college bus.', 'आपका बच्चा कॉलेज बस से नहीं आता।')}</p> : (
        <>
          <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#16264A]">{p.route.routeNo} · {p.route.name}</p>
                <p className="text-xs text-gray-500">{t(lang, 'Boards at', 'चढ़ने का स्थान')} {p.stop?.name ?? '—'}{p.stop ? ` · ${p.stop.time}` : ''} · {t(lang, 'valid till', 'वैधता')} {day(p.validTill)}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${PASS_STYLE[p.state]}`}>{PASS_LABEL[p.state]}</span>
            </div>
            {p.state === 'PENDING_PAYMENT' && <p className="text-xs text-amber-700 mt-2">{t(lang, `${rupees(p.feeDue)} transport fee is unpaid; the pass works once it is paid.`, `${rupees(p.feeDue)} परिवहन शुल्क बकाया है।`)}</p>}
            {p.route.driver && <p className="text-xs text-gray-600 mt-2">{t(lang, 'Driver', 'चालक')}: {p.route.driver.name} · <a className="text-[#E0952A]" href={`tel:${p.route.driver.phone.replace(/\s/g, '')}`}>{p.route.driver.phone}</a></p>}
            {p.route.attendant && <p className="text-xs text-gray-600">{t(lang, 'Attendant', 'सहायक')}: {p.route.attendant.name} · <a className="text-[#E0952A]" href={`tel:${p.route.attendant.phone.replace(/\s/g, '')}`}>{p.route.attendant.phone}</a></p>}
          </div>
          <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-[#16264A] mb-2">{t(lang, 'Today', 'आज')}</p>
            {!live ? <p className="text-xs text-gray-500">{t(lang, 'The bus has not started today\'s run yet.', 'बस ने आज का सफ़र अभी शुरू नहीं किया है।')}</p> : (
              <>
                <p className="text-xs text-gray-600 mb-2">{live.shift === 'MORNING' ? t(lang, 'Morning run', 'सुबह') : t(lang, 'Evening run', 'शाम')} · {live.status.toLowerCase()}{live.delayMinutes !== null ? ` · ${delayText(live.delayMinutes)}` : ''} · {t(lang, 'updated', 'अद्यतन')} {time(live.lastUpdated)}</p>
                <p className={`text-sm font-medium mb-2 ${live.boardedAt ? 'text-[#0E7A5F]' : 'text-gray-500'}`}>{live.boardedAt ? t(lang, `Boarded at ${time(live.boardedAt)}`, `${time(live.boardedAt)} पर बस में चढ़े`) : t(lang, 'Not yet marked on board', 'अभी बस में दर्ज नहीं')}</p>
                {live.stops.map((s) => (
                  <p key={s.stopId} className={`text-xs py-0.5 ${s.stopId === p.stop?.id ? 'font-semibold text-[#16264A]' : 'text-gray-600'}`}>{s.name}: {s.departedAt ? `${t(lang, 'left', 'निकली')} ${time(s.departedAt)}` : s.skipped ? t(lang, 'passed', 'निकल गई') : s.eta ? `${t(lang, 'expected', 'अपेक्षित')} ${s.eta}` : s.scheduled ?? ''}</p>
                ))}
              </>
            )}
          </div>
          {boardings.length > 0 && (
            <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#16264A] mb-1">{t(lang, 'Recent boardings', 'हाल में')}</p>
              {boardings.map((b) => <p key={b.at} className="text-xs text-gray-600 py-0.5">{day(b.at)} · {b.shift === 'MORNING' ? t(lang, 'morning', 'सुबह') : t(lang, 'evening', 'शाम')} · {time(b.at)}</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

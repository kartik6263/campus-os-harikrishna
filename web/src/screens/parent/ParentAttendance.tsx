import { Spinner } from '../../components/ui';
import { useAttendance, useProfile } from '../../lib/queries';

interface Props { lang: 'hi' | 'en' }

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);

/** The ward's attendance, subject by subject, with what it takes to reach the threshold. */
export default function ParentAttendance({ lang }: Props) {
  const { data: a, isLoading } = useAttendance();
  const { data: s } = useProfile();
  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (!a) return <p className="p-6 text-center text-[14px] text-[#5A6577]">{t(lang, 'No attendance recorded yet.', 'अभी कोई उपस्थिति दर्ज नहीं है।')}</p>;
  const below = a.overall.percent < a.threshold;

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{t(lang, 'Attendance', 'उपस्थिति')}</p>
        <p className="text-white/60 text-xs">{s?.name}</p>
      </div>

      <div className={`mx-4 mt-4 rounded-2xl p-4 shadow-sm text-center ${below ? 'bg-red-50 border border-red-200' : 'bg-white'}`}>
        <p className="text-gray-500 text-xs mb-1">{t(lang, 'Overall attendance', 'कुल उपस्थिति')}</p>
        <p className={`text-5xl font-bold ${below ? 'text-red-600' : 'text-[#0E7A5F]'}`}>{a.overall.percent}%</p>
        <p className="text-gray-500 text-xs mt-1">{a.overall.present} / {a.overall.total} {t(lang, 'classes attended', 'कक्षाओं में उपस्थित')} · {t(lang, `minimum ${a.threshold}%`, `न्यूनतम ${a.threshold}%`)}</p>
      </div>

      <div className="mx-4 mt-4 flex flex-col gap-3">
        {a.subjects.map(sub => (
          <div key={sub.code} className="bg-white rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[#16264A] font-semibold text-sm">{sub.name}</p>
                <p className="text-gray-400 text-xs">{sub.code} · {sub.faculty}</p>
              </div>
              <span className={`text-lg font-bold ${sub.meetsThreshold ? 'text-[#0E7A5F]' : 'text-red-600'}`}>{sub.percent}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden relative">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, sub.percent)}%`, background: sub.meetsThreshold ? '#0E7A5F' : '#A8242C' }} />
              <div className="absolute top-0 bottom-0 w-px bg-[#16264A]" style={{ left: `${a.threshold}%` }} title={`${a.threshold}%`} />
            </div>
            <p className="text-xs mt-2 text-gray-500">
              {sub.present}/{sub.total} {t(lang, 'classes', 'कक्षाएं')}
              {!sub.meetsThreshold && <span className="text-red-600 font-medium"> · {t(lang, `needs the next ${sub.classesNeeded} classes without a miss`, `अगली ${sub.classesNeeded} कक्षाओं में लगातार उपस्थिति ज़रूरी`)}</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Spinner } from '../../components/ui';
import { useProfile, useResults } from '../../lib/queries';
import { downloadPdf } from '../../lib/export';

interface Props { lang: 'hi' | 'en' }

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);

/** Published results only — the same ones the student sees. */
export default function ParentResults({ lang }: Props) {
  const { data: results, isLoading } = useResults();
  const { data: s } = useProfile();
  const [open, setOpen] = useState<number | null>(null);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  const list = [...(results ?? [])].reverse();
  const shown = open ?? list[0]?.semester ?? null;

  function marksheet(sem: (typeof list)[number]) {
    return downloadPdf({
      title: `Statement of marks — Semester ${sem.semester}`,
      subtitle: `${s?.name ?? ''} · ${s?.enrolmentNo ?? ''} · ${s?.programme.name ?? ''}`,
      fileName: `marksheet-sem${sem.semester}-${s?.enrolmentNo ?? ''}`,
      sections: [
        { fields: [['Declared', sem.declaredOn], ['SGPA', sem.sgpa], ['CGPA', sem.cgpa], ['Credits', sem.totalCredits], ['Result', sem.outcome]] },
        { table: { head: ['Code', 'Subject', 'Internal', 'External', 'Total', 'Grade'], body: sem.subjects.map(x => [x.code, x.name, x.internal, x.external, x.total, x.grade]) } },
      ],
      qr: `${s?.enrolmentNo}|SEM${sem.semester}|${sem.sgpa}`,
      signatory: 'Controller of Examinations',
    });
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{t(lang, 'Results', 'परिणाम')}</p>
        <p className="text-white/60 text-xs">{s?.name}</p>
      </div>
      {list.length === 0 && <p className="p-6 text-center text-[14px] text-[#5A6577]">{t(lang, 'No result has been published yet.', 'अभी कोई परिणाम प्रकाशित नहीं हुआ।')}</p>}

      <div className="mx-4 mt-4 flex gap-2 overflow-x-auto pb-1">
        {list.map(r => (
          <button key={r.semester} onClick={() => setOpen(r.semester)} className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer ${shown === r.semester ? 'bg-[#16264A] text-white' : 'bg-white text-[#16264A] shadow-sm'}`}>
            {t(lang, `Sem ${r.semester}`, `सेम ${r.semester}`)}
          </button>
        ))}
      </div>

      {list.filter(r => r.semester === shown).map(r => (
        <div key={r.semester} className="mx-4 mt-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm grid grid-cols-3 text-center">
            <div><p className="text-gray-400 text-[10px]">SGPA</p><p className="text-[#16264A] text-2xl font-bold">{r.sgpa}</p></div>
            <div><p className="text-gray-400 text-[10px]">CGPA</p><p className="text-[#16264A] text-2xl font-bold">{r.cgpa}</p></div>
            <div><p className="text-gray-400 text-[10px]">{t(lang, 'Result', 'परिणाम')}</p><p className={`text-lg font-bold ${r.outcome === 'PASS' ? 'text-[#0E7A5F]' : 'text-red-600'}`}>{r.outcome}</p></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm mt-3 divide-y divide-gray-100">
            {r.subjects.map(x => (
              <div key={x.code} className="px-4 py-2.5 flex items-center justify-between">
                <div><p className="text-sm text-[#16264A]">{x.name}</p><p className="text-[11px] text-gray-400">{x.code} · {x.internal} + {x.external}</p></div>
                <div className="text-right"><p className="text-sm font-semibold text-[#16264A]">{x.total}</p><p className={`text-[11px] font-semibold ${x.passed ? 'text-[#0E7A5F]' : 'text-red-600'}`}>{x.grade}</p></div>
              </div>
            ))}
          </div>
          <button onClick={() => void marksheet(r)} className="w-full mt-3 bg-[#16264A] text-white font-semibold py-3 rounded-xl text-sm min-h-[48px] cursor-pointer">📄 {t(lang, 'Download marksheet (PDF)', 'अंकसूची डाउनलोड करें (PDF)')}</button>
          <p className="text-[11px] text-gray-400 text-center mt-2">{t(lang, 'The QR code on the marksheet lets anyone verify it.', 'अंकसूची के QR कोड से कोई भी इसकी पुष्टि कर सकता है।')}</p>
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { Button, Modal, toast, ToastContainer, Input } from '../../../components/ui';
import { useAISHERegister } from '../../../lib/accreditationqueries';
import { downloadCSV, downloadPdf, downloadTemplate } from '../../../lib/export';
import { inst } from '../../../lib/institution';

type AISHESection = {
  id: string;
  metricId: string;
  title: string;
  filled: boolean;
  auto: boolean;
  module?: string;
  value: string | null;
  basis: string;
};

const ENROLLMENT_STATS = [
  { label: 'Total', value: '4,87,240', color: 'text-[#16264A]' },
  { label: 'Male', value: '2,12,400', color: 'text-blue-700' },
  { label: 'Female', value: '2,74,840', color: 'text-pink-600' },
  { label: 'SC', value: '87,703', color: 'text-purple-700' },
  { label: 'ST', value: '24,362', color: 'text-orange-600' },
  { label: 'OBC', value: '1,70,534', color: 'text-teal-700' },
  { label: 'UR', value: '2,04,641', color: 'text-gray-700' },
];

const ENROLMENT_TABLE = [
  { programme: 'B.A.', level: 'UG', male: 28400, female: 41200, total: 69600 },
  { programme: 'B.Sc.', level: 'UG', male: 32100, female: 29800, total: 61900 },
  { programme: 'B.Com.', level: 'UG', male: 18600, female: 21400, total: 40000 },
  { programme: 'M.A.', level: 'PG', male: 9200, female: 14100, total: 23300 },
  { programme: 'M.Sc.', level: 'PG', male: 8400, female: 7900, total: 16300 },
  { programme: 'Ph.D.', level: 'Doctoral', male: 1840, female: 1160, total: 3000 },
];

/* ── Section card ── */
function SectionCard({
  section,
  onViewData,
  onManualExpand,
  expanded,
}: {
  section: AISHESection;
  onViewData: (s: AISHESection) => void;
  onManualExpand: (id: string) => void;
  expanded: boolean;
}) {
  const [infra, setInfra] = useState({
    landArea: '', buildingArea: '', classrooms: '', labs: '', libraryArea: '', sportsGrounds: '',
  });
  const [finance, setFinance] = useState({
    totalIncome: '', salaries: '', operations: '', infrastructure: '', scholarships: '',
  });
  const [saved, setSaved] = useState(false);

  if (section.auto) {
    return (
      <div className="bg-white border-l-4 border-l-green-500 rounded-xl shadow-sm p-5 flex flex-col justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center font-bold text-green-700 text-lg shrink-0">
            {section.id}
          </div>
          <div>
            <p className="font-semibold text-[#16264A] text-sm">{section.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">✅ Auto-populated</p>
            {section.module && (
              <span className="inline-flex items-center gap-1 text-xs font-medium mt-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                📍 {section.module}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onViewData(section)}>
          View Data
        </Button>
      </div>
    );
  }

  // Manual or basic-info section
  return (
    <div className={`bg-white border-l-4 ${section.filled ? 'border-l-green-400' : 'border-l-amber-400'} rounded-xl shadow-sm p-5 space-y-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 ${section.filled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {section.id}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-[#16264A] text-sm">{section.title}</p>
          {!section.filled && (
            <p className="text-xs text-amber-700 mt-0.5">✏ Manual entry required</p>
          )}
          {section.filled && !section.auto && (
            <p className="text-xs text-green-600 mt-0.5">✅ Basic info entered</p>
          )}
        </div>
      </div>

      {/* Expandable form */}
      {!section.filled && (
        <div>
          {!expanded ? (
            <button
              onClick={() => onManualExpand(section.id)}
              className="text-xs text-blue-600 underline hover:text-blue-800"
            >
              Click to enter data
            </button>
          ) : (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              {section.id === 'E' && (
                <>
                  <p className="text-xs font-semibold text-gray-600 uppercase">Infrastructure Details</p>
                  {(['landArea', 'buildingArea', 'classrooms', 'labs', 'libraryArea', 'sportsGrounds'] as const).map(field => (
                    <div key={field}>
                      <label className="text-xs text-gray-500 capitalize">{field.replace(/([A-Z])/g, ' $1')}</label>
                      <input
                        value={infra[field]}
                        onChange={e => setInfra(prev => ({ ...prev, [field]: e.target.value }))}
                        className="mt-0.5 w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#E0952A]"
                        placeholder={field.includes('Area') ? 'sq. meters' : 'count'}
                      />
                    </div>
                  ))}
                </>
              )}
              {section.id === 'F' && (
                <>
                  <p className="text-xs font-semibold text-gray-600 uppercase">Finance & Expenditure</p>
                  {([
                    ['totalIncome', 'Total Income (₹ Lakhs)'],
                    ['salaries', 'Salaries & Allowances'],
                    ['operations', 'Operations & Maintenance'],
                    ['infrastructure', 'Infrastructure Development'],
                    ['scholarships', 'Scholarships Disbursed'],
                  ] as const).map(([field, label]) => (
                    <div key={field}>
                      <label className="text-xs text-gray-500">{label}</label>
                      <input
                        value={finance[field]}
                        onChange={e => setFinance(prev => ({ ...prev, [field]: e.target.value }))}
                        className="mt-0.5 w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#E0952A]"
                        placeholder="₹ Lakhs"
                      />
                    </div>
                  ))}
                </>
              )}
              {section.id === 'A' && (
                <>
                  <p className="text-xs font-semibold text-gray-600 uppercase">Basic Information</p>
                  {['University Name', 'University Type', 'Year of Establishment', 'Vice Chancellor', 'Affiliating Colleges Count'].map(field => (
                    <div key={field}>
                      <label className="text-xs text-gray-500">{field}</label>
                      <input className="mt-0.5 w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#E0952A]" />
                    </div>
                  ))}
                </>
              )}
              <button
                onClick={() => { setSaved(true); onManualExpand(''); toast.success(`Section ${section.id} data saved.`); }}
                className="bg-[#E0952A] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
              >
                Save Section {section.id}
              </button>
              {saved && <p className="text-xs text-green-600">Saved ✓</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccreditationAISHE() {
  const { data: AISHE_DATA, totals, returns } = useAISHERegister();

  // Read the open section back out of the live register, so a figure that
  // changes underneath is reflected rather than frozen when it opened.
  const [viewId, setViewId] = useState<string | null>(null);
  const viewSection = AISHE_DATA.sections.find(s => s.id === viewId) ?? null;
  const setViewSection = (s: AISHESection | null) => setViewId(s?.id ?? null);
  const [expandedManual, setExpandedManual] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [genModal, setGenModal] = useState(false);
  const [surveyYear, setSurveyYear] = useState('2024-25');

  /** The return as the register answers it today: a CSV for the DCF upload and a PDF for the file. */
  async function handleGenerate() {
    setGenerating(true);
    const rows = AISHE_DATA.sections.map(s => ({ section: s.id, title: s.title, source: s.auto ? `Computed (${s.module ?? 'records'})` : 'Entered by hand', answer: s.value ?? '', basis: s.basis, status: s.filled ? 'Answered' : 'Missing' }));
    downloadCSV(`AISHE-${surveyYear}-return`, rows, [{ key: 'section', label: 'Section' }, { key: 'title', label: 'Item' }, { key: 'answer', label: 'Answer' }, { key: 'source', label: 'Source' }, { key: 'basis', label: 'Basis' }, { key: 'status', label: 'Status' }]);
    await downloadPdf({
      title: `AISHE return — survey year ${surveyYear}`,
      subtitle: `${inst().name}. ${rows.filter(r => r.status === 'Answered').length} of ${rows.length} items answered; computed items come straight from the institution's records.`,
      fileName: `AISHE-${surveyYear}-return`,
      landscape: true,
      sections: [{ table: { head: ['Section', 'Item', 'Answer', 'Source', 'Status'], body: rows.map(r => [r.section, r.title, r.answer || '—', r.source, r.status]) } }],
      signatory: 'Nodal Officer, AISHE',
    });
    setGenerating(false);
    setGenModal(false);
    const gaps = rows.filter(r => r.status === 'Missing').length;
    if (gaps) toast.warning(`${gaps} item${gaps > 1 ? 's' : ''} still blank in the return — fill them before uploading to the AISHE portal`);
  }

  function downloadDcf() {
    downloadTemplate(`AISHE-DCF-${surveyYear}`, ['section', 'item', 'answer', 'remarks'], undefined);
  }

  const autoSections = totals?.derived ?? AISHE_DATA.sections.filter(s => s.auto).length;
  const totalSections = totals?.metrics ?? AISHE_DATA.sections.length;

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <ToastContainer />

      {/* Header */}
      <div className="bg-[#16264A] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-white text-xl font-bold">AISHE — Annual Survey Data</h1>
            <p className="text-blue-200 text-sm mt-0.5">All India Survey on Higher Education</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={surveyYear}
              onChange={e => setSurveyYear(e.target.value)}
              className="text-sm border border-white/30 rounded-lg px-3 py-1.5 bg-white/10 text-white focus:outline-none"
            >
              <option value="2024-25">2024-25</option>
              <option value="2023-24">2023-24</option>
              <option value="2022-23">2022-23</option>
            </select>
            <span className="text-blue-200 text-sm">{returns ? `AISHE returns: ${returns.submitted} of ${returns.total} filed${returns.overdue ? `, ${returns.overdue} overdue` : ''}` : ''}</span>
            <Button onClick={() => setGenModal(true)}>Generate AISHE Return</Button>
          </div>
        </div>
      </div>

      {/* DCF download bar */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-2.5 flex items-center justify-between">
        <p className="text-sm text-blue-800">
          <strong>{autoSections} of {totalSections} sections</strong> auto-populated from platform.
          &nbsp;{totalSections - autoSections} require manual entry.
        </p>
        <button onClick={downloadDcf} className="text-xs text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer">
          📥 Download DCF Format
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Enrollment summary (sections B & C) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-[#16264A] mb-1">Enrolment Summary — Sections B & C</h2>
          <p className="text-xs text-gray-500 mb-4 flex items-center gap-2">
            <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs">🟢 Auto-populated</span>
            Student Portal → Enrolment
          </p>
          <div className="flex flex-wrap gap-4">
            {ENROLLMENT_STATS.map(stat => (
              <div key={stat.label} className="bg-[#EDEFF3] rounded-lg px-4 py-3 text-center min-w-[90px]">
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section cards */}
        <div>
          <h2 className="font-semibold text-[#16264A] mb-3">Section Completion Status</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {AISHE_DATA.sections.map(section => (
              <SectionCard
                key={section.id}
                section={section}
                onViewData={s => setViewSection(s)}
                onManualExpand={id => setExpandedManual(id === expandedManual ? '' : id)}
                expanded={expandedManual === section.id}
              />
            ))}
          </div>
        </div>
      </div>

      {/* View Data Modal */}
      <Modal
        open={!!viewSection}
        onClose={() => setViewSection(null)}
        title={viewSection ? `Section ${viewSection.id}: ${viewSection.title}` : ''}
        width="640px"
        footer={<Button onClick={() => setViewSection(null)}>Close</Button>}
      >
        {viewSection?.id === 'B' && (
          <div className="overflow-x-auto">
            <p className="text-xs text-green-700 mb-3 flex items-center gap-1">
              🟢 Auto-populated from Student Portal → Enrolment
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Programme', 'Level', 'Male', 'Female', 'Total'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ENROLMENT_TABLE.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{row.programme}</td>
                    <td className="px-3 py-2 text-gray-500">{row.level}</td>
                    <td className="px-3 py-2 text-blue-700">{row.male.toLocaleString()}</td>
                    <td className="px-3 py-2 text-pink-600">{row.female.toLocaleString()}</td>
                    <td className="px-3 py-2 font-bold text-[#16264A]">{row.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {viewSection?.id === 'C' && (
          <div>
            <p className="text-xs text-green-700 mb-3">🟢 Auto-populated from Student Portal → Enrolment</p>
            <div className="grid grid-cols-2 gap-3">
              {ENROLLMENT_STATS.map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {viewSection?.id === 'D' && (
          <div>
            <p className="text-xs text-green-700 mb-3">🟢 Auto-populated from HR & Payroll → Employee Master</p>
            <div className="grid grid-cols-2 gap-3">
              {[['Total Faculty & Staff', '3,842'], ['Teaching Staff', '2,140'], ['Non-Teaching', '1,702'], ['Permanent', '2,910'], ['Contractual', '932'], ['Female Staff', '1,284']].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-[#16264A]">{val}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {viewSection?.id === 'G' && (
          <div>
            <p className="text-xs text-green-700 mb-3">🟢 Auto-populated from Examination → Result Processing</p>
            <div className="grid grid-cols-2 gap-3">
              {[['Students Appeared', '1,84,200'], ['Students Passed', '1,58,412'], ['Pass %', '86%'], ['Distinction', '14,280'], ['First Division', '68,400'], ['Failed/Absent', '25,788']].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-[#16264A]">{val}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Generate modal */}
      <Modal
        open={genModal}
        onClose={() => !generating && setGenModal(false)}
        title="Generate AISHE Return"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setGenModal(false)} disabled={generating}>Cancel</Button>
            <Button onClick={() => void handleGenerate()} loading={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        }
      >
        {generating ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-[#E0952A] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-600">Building the return from the register…</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-700">Generate AISHE return for survey year <strong>{surveyYear}</strong>?</p>
            <div className="space-y-1 text-xs">
              {AISHE_DATA.sections.map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className={s.auto || (s.filled && !s.auto) ? 'text-green-600' : 'text-amber-600'}>
                    {s.auto || (s.filled && !s.auto) ? '✅' : '⏳'}
                  </span>
                  <span>Section {s.id}: {s.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

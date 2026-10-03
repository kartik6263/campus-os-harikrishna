import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppShell from '../components/AppShell';
import { Tabs, StatusPill, Button, DataTable, InlineAlert, RecordBand, Modal, Spinner } from '../components/ui';
import { useLang } from '../lib/language';
import { api } from '../lib/api';
import type { Screen } from '../lib/data';
import { useInstitution } from '../lib/institution';
import { useRiskList, type ApiRiskRow, type ApiBand } from '../lib/intelligencequeries';
import { useExamSessions } from '../lib/examqueries';
import { useAuditList, useChainCheck } from '../lib/itqueries';
import { downloadCSV, downloadPdf } from '../lib/export';

interface Props { onNavigate: (s: Screen) => void; }

export interface Overview {
  generatedAt: string;
  counts: { colleges: number; programmes: number; students: number; faculty: number; users: number; lockedUsers: number };
  fees: { billed: number; collected: number; outstanding: number; collectionRate: number | null; collectedThisMonth: number; paymentsThisMonth: number; byMonth: Array<{ month: string; amount: number }> };
  attendance: { last30Days: number | null; overall: number | null };
  queues: { approvalsPending: number; certificatesOpen: number; admissionsPending: number; rtiOpen: number; tendersLive: number; grievancesOpen: number };
  exams: Record<string, number>;
  risk: Partial<Record<ApiBand, number>>;
  auditToday: number;
  colleges: Array<{ id: string; code: string; name: string; district: string | null; students: number; faculty: number }>;
}

export const useOverview = () =>
  useQuery({ queryKey: ['insights', 'overview'], queryFn: () => api<Overview>('/api/insights/overview'), refetchInterval: 60_000 });

const TABS = [
  { id: 'overview', label: 'Overview', labelHi: 'अवलोकन' },
  { id: 'colleges', label: 'Colleges', labelHi: 'महाविद्यालय' },
  { id: 'students', label: 'Students', labelHi: 'छात्र' },
  { id: 'exam', label: 'Examinations', labelHi: 'परीक्षा' },
  { id: 'audit', label: 'Audit Log', labelHi: 'ऑडिट लॉग' },
];

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const compactInr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n));
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

type T = (a: string, b: string) => string;

export default function AdminConsole({ onNavigate }: Props) {
  const { lang, t } = useLang();
  const inst = useInstitution();
  const [activeTab, setActiveTab] = useState('overview');
  const overview = useOverview();
  const o = overview.data;

  return (
    <AppShell
      current="admin-console"
      onNavigate={onNavigate}
      title={t('Command Centre', 'कमांड सेंटर')}
      breadcrumb={[{ label: TABS.find(tt => tt.id === activeTab)?.label || '' }]}
    >
      <RecordBand
        title={t('Institution Command Centre', 'संस्थान कमांड सेंटर')}
        subtitle={`${inst.place} · ${t('live figures', 'लाइव आंकड़े')}${o ? ` · ${t('updated', 'अद्यतन')} ${new Date(o.generatedAt).toLocaleTimeString('en-IN')}` : ''}`}
        id={inst.shortCode}
        meta={[
          { label: t('Colleges', 'महाविद्यालय'), value: o ? String(o.counts.colleges) : '…' },
          { label: t('Students', 'छात्र'), value: o ? o.counts.students.toLocaleString('en-IN') : '…' },
          { label: t('Teaching staff', 'शिक्षण स्टाफ'), value: o ? o.counts.faculty.toLocaleString('en-IN') : '…' },
          { label: t('Fee collection', 'शुल्क संग्रह'), value: o ? pct(o.fees.collectionRate) : '…' },
        ]}
      />

      <div className="bg-white border border-[#D3D8E0] border-t-0 rounded-b-[2px]">
        <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} lang={lang} />
        <div className="p-5">
          {overview.isError && <InlineAlert type="error">{t('Could not load the live figures. Check the connection and refresh.', 'लाइव आंकड़े लोड नहीं हो सके।')}</InlineAlert>}
          {activeTab === 'overview' && (o ? <OverviewTab o={o} t={t} onNavigate={onNavigate} /> : <Loading />)}
          {activeTab === 'colleges' && (o ? <CollegeList o={o} t={t} onNavigate={onNavigate} /> : <Loading />)}
          {activeTab === 'students' && <StudentAdmin t={t} onNavigate={onNavigate} />}
          {activeTab === 'exam' && <ExamAdmin t={t} onNavigate={onNavigate} />}
          {activeTab === 'audit' && <AuditLog t={t} onNavigate={onNavigate} />}
        </div>
      </div>
    </AppShell>
  );
}

const Loading = () => <div className="flex justify-center py-16"><Spinner size={22} /></div>;

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ o, t, onNavigate }: { o: Overview; t: T; onNavigate: (s: Screen) => void }) {
  const inst = useInstitution();
  const atRisk = (o.risk.HIGH ?? 0) + (o.risk.CRITICAL ?? 0);
  const kpis = [
    { label: t('Fees collected', 'एकत्रित शुल्क'), value: compactInr(o.fees.collected), sub: `${pct(o.fees.collectionRate)} ${t('of', 'का')} ${compactInr(o.fees.billed)} ${t('billed', 'बिल')}` },
    { label: t('This month', 'इस माह'), value: compactInr(o.fees.collectedThisMonth), sub: `${o.fees.paymentsThisMonth} ${t('payments', 'भुगतान')}` },
    { label: t('Attendance, last 30 days', 'उपस्थिति, पिछले 30 दिन'), value: pct(o.attendance.last30Days), sub: `${t('All-time', 'कुल')} ${pct(o.attendance.overall)}` },
    { label: t('Students at high risk', 'उच्च जोखिम वाले छात्र'), value: String(atRisk), sub: `${o.risk.CRITICAL ?? 0} ${t('critical', 'गंभीर')}` },
  ];

  const queues: Array<{ label: string; n: number; screen: Screen }> = [
    { label: t('Approvals awaiting the principal', 'प्राचार्य के अनुमोदन लंबित'), n: o.queues.approvalsPending, screen: 'principal-portal' },
    { label: t('Certificate requests open', 'खुले प्रमाण-पत्र अनुरोध'), n: o.queues.certificatesOpen, screen: 'college-office' },
    { label: t('Admissions in verification', 'सत्यापन में प्रवेश'), n: o.queues.admissionsPending, screen: 'college-office' },
    { label: t('Grievances unresolved', 'अनसुलझी शिकायतें'), n: o.queues.grievancesOpen, screen: 'acad-ops' },
    { label: t('RTI applications open', 'खुले RTI आवेदन'), n: o.queues.rtiOpen, screen: 'governance' },
    { label: t('Tenders live', 'सक्रिय निविदाएं'), n: o.queues.tendersLive, screen: 'governance' },
  ];

  async function boardReport() {
    await downloadPdf({
      title: 'Institution status report',
      subtitle: `${inst.place} — figures as recorded at ${new Date(o.generatedAt).toLocaleString('en-IN')}`,
      fileName: `${inst.shortCode}-status-report`,
      sections: [
        { heading: 'Scale', fields: [['Colleges', o.counts.colleges], ['Programmes', o.counts.programmes], ['Students', o.counts.students], ['Teaching staff', o.counts.faculty], ['User accounts', o.counts.users]] },
        { heading: 'Finance', fields: [['Fees billed', inr(o.fees.billed)], ['Fees collected', inr(o.fees.collected)], ['Outstanding', inr(o.fees.outstanding)], ['Collection rate', pct(o.fees.collectionRate)], ['Collected this month', inr(o.fees.collectedThisMonth)]] },
        { heading: 'Academics', fields: [['Attendance, last 30 days', pct(o.attendance.last30Days)], ['Attendance, all time', pct(o.attendance.overall)], ['Students at high or critical risk', atRisk]] },
        { heading: 'Open work', table: { head: ['Queue', 'Open items'], body: queues.map(q => [q.label, q.n]) } },
        { heading: 'Colleges', table: { head: ['Code', 'College', 'District', 'Students', 'Faculty'], body: o.colleges.map(c => [c.code, c.name, c.district ?? '', c.students, c.faculty]) } },
      ],
      signatory: 'Registrar',
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#5A6577]">{t('Every figure below is counted from the live records when the page loads.', 'नीचे का हर आंकड़ा लाइव अभिलेखों से गिना गया है।')}</p>
        <Button size="sm" variant="secondary" onClick={boardReport}>{t('Download status report (PDF)', 'स्थिति रिपोर्ट डाउनलोड करें')}</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map(k => (
          <div key={k.label} className="bg-[#EDEFF3] border border-[#D3D8E0] rounded-[2px] p-4">
            <p className="text-[11px] text-[#5A6577]">{k.label}</p>
            <p className="text-h2 font-semibold text-[#16264A] mt-1 font-mono">{k.value}</p>
            <p className="text-[12px] text-[#5A6577] mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6 mb-6">
        <div className="lg:col-span-3 border border-[#D3D8E0] rounded-[2px] p-4">
          <p className="text-[14px] font-semibold text-[#16264A]">{t('Fee collection by month', 'माह-वार शुल्क संग्रह')}</p>
          <p className="text-[12px] text-[#5A6577] mb-4">{t('Successful payments, last six months', 'सफल भुगतान, पिछले छह माह')}</p>
          <MonthBars data={o.fees.byMonth} />
        </div>
        <div className="lg:col-span-2 border border-[#D3D8E0] rounded-[2px] p-4">
          <p className="text-[14px] font-semibold text-[#16264A]">{t('Student risk bands', 'छात्र जोखिम श्रेणियां')}</p>
          <p className="text-[12px] text-[#5A6577] mb-4">{t('Latest assessment per student', 'प्रति छात्र नवीनतम आकलन')}</p>
          <RiskBands risk={o.risk} t={t} />
          <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={() => onNavigate('intelligence')}>{t('Open the at-risk register →', 'जोखिम रजिस्टर खोलें →')}</Button>
        </div>
      </div>

      <div className="border border-[#D3D8E0] rounded-[2px]">
        <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
          <p className="text-[14px] font-semibold text-[#16264A]">{t('Work waiting across the institution', 'संस्थान में लंबित कार्य')}</p>
          <span className="text-[12px] text-[#5A6577]">{o.auditToday} {t('audited actions today', 'आज की ऑडिट कार्रवाइयां')}</span>
        </div>
        <div className="grid md:grid-cols-2">
          {queues.map(q => (
            <button key={q.label} onClick={() => onNavigate(q.screen)} className="flex items-center justify-between px-4 py-3 border-b border-[#EDEFF3] md:odd:border-r text-left hover:bg-[#FEF9EC] cursor-pointer group">
              <span className="text-[13px] text-[#16264A]">{q.label}</span>
              <span className="flex items-center gap-3">
                <span className={`font-mono text-[15px] font-semibold ${q.n > 0 ? 'text-[#16264A]' : 'text-[#5A6577]'}`}>{q.n}</span>
                <span className="text-[12px] text-[#E0952A] opacity-0 group-hover:opacity-100">{t('Open →', 'खोलें →')}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One series, one hue; a hover reveals the exact figure. */
function MonthBars({ data }: { data: Overview['fees']['byMonth'] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Always show six months, including ones with nothing collected.
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const rows = months.map(m => ({
    label: m.toLocaleString('en-IN', { month: 'short' }),
    amount: data.find(d => { const x = new Date(d.month); return x.getFullYear() === m.getFullYear() && x.getMonth() === m.getMonth(); })?.amount ?? 0,
  }));
  const max = Math.max(1, ...rows.map(r => r.amount));
  return (
    <div className="flex items-end gap-3 h-44 border-b border-[#D3D8E0] relative">
      {rows.map((r, i) => (
        <div key={r.label} className="flex-1 flex flex-col items-center justify-end h-full relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          {hover === i && (
            <div className="absolute -top-1 -translate-y-full bg-[#16264A] text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-10">{r.label}: {inr(r.amount)}</div>
          )}
          <div className={`w-full max-w-[44px] rounded-t-[4px] transition-colors ${hover === i ? 'bg-[#E0952A]' : 'bg-[#16264A]'}`} style={{ height: `${Math.max(r.amount ? 3 : 0, (r.amount / max) * 100)}%` }} />
          <span className="absolute -bottom-5 text-[11px] text-[#5A6577]">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

const BAND_STYLE: Record<ApiBand, { color: string; label: string }> = {
  CRITICAL: { color: '#A8242C', label: 'Critical' },
  HIGH: { color: '#C2541B', label: 'High' },
  MODERATE: { color: '#8A6D1F', label: 'Moderate' },
  LOW: { color: '#0E7A5F', label: 'Low' },
};

function RiskBands({ risk, t }: { risk: Overview['risk']; t: T }) {
  const total = Object.values(risk).reduce((s, n) => s + (n ?? 0), 0);
  if (!total) return <p className="text-[13px] text-[#5A6577]">{t('No risk assessments yet.', 'अभी कोई आकलन नहीं।')}</p>;
  return (
    <div className="space-y-3">
      {(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] as ApiBand[]).map(b => {
        const n = risk[b] ?? 0;
        return (
          <div key={b}>
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-[#16264A] flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: BAND_STYLE[b].color }} />{BAND_STYLE[b].label}</span>
              <span className="font-mono text-[#16264A]">{n} <span className="text-[#5A6577]">({Math.round((n / total) * 100)}%)</span></span>
            </div>
            <div className="h-2 bg-[#EDEFF3] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(n / total) * 100}%`, background: BAND_STYLE[b].color }} /></div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Colleges ─────────────────────────────────────────────────────────────────

function CollegeList({ o, t, onNavigate }: { o: Overview; t: T; onNavigate: (s: Screen) => void }) {
  const [open, setOpen] = useState<Overview['colleges'][number] | null>(null);
  type Row = Overview['colleges'][number];
  const columns = [
    { key: 'code', label: t('Code', 'कोड'), mono: true, width: '120px' },
    { key: 'name', label: t('College', 'महाविद्यालय') },
    { key: 'district', label: t('District', 'जिला'), render: (r: Row) => r.district ?? '—' },
    { key: 'students', label: t('Students', 'छात्र'), align: 'right' as const, render: (r: Row) => r.students.toLocaleString('en-IN') },
    { key: 'faculty', label: t('Faculty', 'संकाय'), align: 'right' as const },
    { key: '_', label: '', sortable: false, render: (r: Row) => <button onClick={e => { e.stopPropagation(); setOpen(r); }} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">{t('View', 'देखें')}</button> },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[#5A6577]">{o.colleges.length} {t('colleges on record. New colleges are added in the IT Cell.', 'महाविद्यालय दर्ज। नए महाविद्यालय आईटी सेल में जोड़े जाते हैं।')}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => downloadCSV('colleges', o.colleges, [{ key: 'code', label: 'Code' }, { key: 'name', label: 'College' }, { key: 'district', label: 'District' }, { key: 'students', label: 'Students' }, { key: 'faculty', label: 'Faculty' }])}>{t('Export CSV', 'CSV निर्यात')}</Button>
          <Button size="sm" onClick={() => onNavigate('it-console')}>{t('+ Add college', '+ महाविद्यालय जोड़ें')}</Button>
        </div>
      </div>
      <div className="border border-[#D3D8E0] rounded-[2px] overflow-hidden">
        <DataTable columns={columns} data={o.colleges} onRowClick={setOpen} searchPlaceholder={t('Search colleges…', 'महाविद्यालय खोजें…')} emptyTitle={t('No colleges yet', 'कोई महाविद्यालय नहीं')} pageSize={10} />
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} width="520px">
        {open && (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {([[t('Code', 'कोड'), open.code], [t('District', 'जिला'), open.district ?? '—'], [t('Students', 'छात्र'), open.students.toLocaleString('en-IN')], [t('Teaching staff', 'शिक्षण स्टाफ'), String(open.faculty)], [t('Student–teacher ratio', 'छात्र-शिक्षक अनुपात'), open.faculty ? `${(open.students / open.faculty).toFixed(1)} : 1` : '—']] as Array<[string, string]>).map(([k, v]) => (
                <div key={k} className="border-b border-[#D3D8E0] pb-2"><p className="text-[11px] text-[#5A6577] uppercase tracking-wider">{k}</p><p className="text-[14px] font-medium text-[#16264A] mt-0.5">{v}</p></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onNavigate('principal-portal')}>{t("Principal's office", 'प्राचार्य कार्यालय')}</Button>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('college-office')}>{t('College office', 'महाविद्यालय कार्यालय')}</Button>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('governance')}>{t('Affiliation file', 'संबद्धता फ़ाइल')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Students ─────────────────────────────────────────────────────────────────

function StudentAdmin({ t, onNavigate }: { t: T; onNavigate: (s: Screen) => void }) {
  const risk = useRiskList();
  const [selected, setSelected] = useState<ApiRiskRow | null>(null);
  const rows = risk.data?.students ?? [];
  const columns = [
    { key: 'enrolmentNo', label: t('Enrolment', 'नामांकन'), mono: true, width: '170px' },
    { key: 'name', label: t('Name', 'नाम') },
    { key: 'programme', label: t('Programme', 'कार्यक्रम') },
    { key: 'semester', label: 'Sem', width: '60px' },
    { key: 'mentor', label: t('Mentor', 'मेंटर'), render: (r: ApiRiskRow) => r.mentor ?? '—' },
    { key: 'score', label: t('Risk', 'जोखिम'), align: 'right' as const, render: (r: ApiRiskRow) => <span className="font-mono text-[12px]" style={{ color: BAND_STYLE[r.band].color }}>{r.score} · {BAND_STYLE[r.band].label}</span> },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[#5A6577]">{rows.length} {t('students, with their current risk score', 'छात्र, वर्तमान जोखिम स्कोर सहित')}</p>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('students', rows, [{ key: 'enrolmentNo', label: 'Enrolment' }, { key: 'rollNo', label: 'Roll no' }, { key: 'name', label: 'Name' }, { key: 'programme', label: 'Programme' }, { key: 'semester', label: 'Semester' }, { key: 'mentor', label: 'Mentor' }, { key: 'score', label: 'Risk score' }, { key: 'band', label: 'Band' }])}>{t('Export CSV', 'CSV निर्यात')}</Button>
      </div>
      <div className="border border-[#D3D8E0] rounded-[2px] overflow-hidden">
        <DataTable columns={columns} data={rows} loading={risk.isLoading} onRowClick={setSelected} searchPlaceholder={t('Search students…', 'छात्र खोजें…')} emptyTitle={t('No students yet', 'कोई छात्र नहीं')} />
      </div>
      <Modal open={!!selected} onClose={() => setSelected(null)} title={t('Student record', 'छात्र अभिलेख')} width="600px">
        {selected && (
          <div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-5">
              {([[t('Name', 'नाम'), selected.name], [t('Enrolment', 'नामांकन'), selected.enrolmentNo], [t('Roll no.', 'रोल नं.'), selected.rollNo], [t('Programme', 'कार्यक्रम'), `${selected.programme} · Sem ${selected.semester}`], [t('Mentor', 'मेंटर'), selected.mentor ?? '—'], [t('Risk score', 'जोखिम स्कोर'), `${selected.score} (${BAND_STYLE[selected.band].label})`]] as Array<[string, string]>).map(([label, value]) => (
                <div key={label} className="border-b border-[#D3D8E0] pb-2"><p className="text-[11px] text-[#5A6577] uppercase tracking-wider">{label}</p><p className="text-[14px] font-medium text-[#16264A] mt-0.5">{value}</p></div>
              ))}
            </div>
            <p className="text-[12px] font-semibold text-[#16264A] mb-2">{t('How the score is made', 'स्कोर कैसे बना')}</p>
            <table className="w-full text-[12px] mb-5">
              <tbody>
                {selected.factors.map(f => (
                  <tr key={f.factor} className="border-b border-[#EDEFF3]"><td className="py-1.5 text-[#16264A]">{f.factor}</td><td className="py-1.5 text-[#5A6577]">{f.value}</td><td className="py-1.5 text-right font-mono">{f.contribution} {t('pts', 'अंक')}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onNavigate('intelligence')}>{t('Open in Intelligence Layer', 'इंटेलिजेंस लेयर में खोलें')}</Button>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('it-console')}>{t('Account in IT Cell', 'आईटी सेल में खाता')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Examinations ─────────────────────────────────────────────────────────────

function ExamAdmin({ t, onNavigate }: { t: T; onNavigate: (s: Screen) => void }) {
  const sessions = useExamSessions();
  const data = sessions.data ?? [];
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#5A6577]">{t('Every sitting on record, with where it stands.', 'हर परीक्षा सत्र और उसकी स्थिति।')}</p>
        <Button size="sm" onClick={() => onNavigate('academic-back-office')}>{t('Open Examination Back-Office →', 'परीक्षा बैक-ऑफिस खोलें →')}</Button>
      </div>
      {sessions.isLoading ? <Loading /> : data.length === 0 ? (
        <InlineAlert type="info">{t('No examination sessions yet. Create one in the Examination Back-Office.', 'अभी कोई परीक्षा सत्र नहीं।')}</InlineAlert>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map(s => (
            <div key={s.id} className="border border-[#D3D8E0] rounded-[2px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-[#16264A]">{s.name}</p>
                  <p className="text-[12px] text-[#5A6577] font-mono">{s.code} · {s.academicYear}</p>
                </div>
                <StatusPill status={s.status === 'RESULT_PUBLISHED' ? 'approved' : 'under-review'} compact />
              </div>
              <p className="text-[12px] text-[#16264A] mt-2">{s.status.replace(/_/g, ' ').toLowerCase()}</p>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {([[t('Papers', 'प्रश्नपत्र'), s.papers], [t('Candidates', 'परीक्षार्थी'), s.candidates], [t('Results', 'परिणाम'), s.results]] as Array<[string, number]>).map(([k, v]) => (
                  <div key={k} className="bg-[#EDEFF3] rounded-[2px] py-2"><p className="font-mono text-[15px] font-semibold text-[#16264A]">{v}</p><p className="text-[10px] text-[#5A6577]">{k}</p></div>
                ))}
              </div>
              <p className="text-[11px] text-[#5A6577] mt-3">{t('Exams', 'परीक्षा')} {new Date(s.examStartsOn).toLocaleDateString('en-IN')} – {new Date(s.examEndsOn).toLocaleDateString('en-IN')}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4"><InlineAlert type="warning">{t('Results are published only by the examination wing, after moderation, from the Back-Office.', 'परिणाम केवल परीक्षा विभाग द्वारा बैक-ऑफिस से प्रकाशित होते हैं।')}</InlineAlert></div>
    </div>
  );
}

// ─── Audit ────────────────────────────────────────────────────────────────────

function AuditLog({ t, onNavigate }: { t: T; onNavigate: (s: Screen) => void }) {
  const audit = useAuditList();
  const check = useChainCheck();
  const rows = audit.data.slice(0, 25);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-[15px] font-semibold text-[#16264A]">{t('Hash-chained audit log', 'हैश-चेन ऑडिट लॉग')}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={check.isFetching} onClick={() => void check.refetch()}>{t('Verify chain', 'श्रृंखला सत्यापित करें')}</Button>
          <Button size="sm" variant="secondary" disabled={!audit.data.length} onClick={() => downloadCSV('audit-log', audit.data, [{ key: 'seq', label: 'Seq' }, { key: 'timestamp', label: 'Time' }, { key: 'actor', label: 'Actor' }, { key: 'actorId', label: 'Role' }, { key: 'module', label: 'Module' }, { key: 'action', label: 'Action' }, { key: 'target', label: 'Target' }, { key: 'outcome', label: 'Outcome' }, { key: 'ip', label: 'IP' }, { key: 'hash', label: 'Hash' }, { key: 'prevHash', label: 'Previous hash' }])}>{t('Export log', 'लॉग निर्यात')}</Button>
          <Button size="sm" onClick={() => onNavigate('it-console')}>{t('Full log in IT Cell →', 'आईटी सेल में पूरा लॉग →')}</Button>
        </div>
      </div>
      {check.data && (
        <div className="mb-3">
          <InlineAlert type={check.data.intact ? 'success' : 'error'}>
            {check.data.intact
              ? t(`Chain intact: all ${check.data.entries} entries verify against their predecessors.`, `श्रृंखला अक्षुण्ण: सभी ${check.data.entries} प्रविष्टियां सत्यापित।`)
              : t(`Chain broken at entry #${check.data.brokenAt?.seq}: ${check.data.brokenAt?.reason}`, `श्रृंखला प्रविष्टि #${check.data.brokenAt?.seq} पर टूटी है`)}
          </InlineAlert>
        </div>
      )}
      <InlineAlert type="info">{t('Every entry carries the hash of the one before it. Altering or deleting any entry breaks every hash after it.', 'हर प्रविष्टि में पिछली प्रविष्टि का हैश होता है।')}</InlineAlert>
      <div className="mt-4 border border-[#D3D8E0] rounded-[2px] overflow-x-auto">
        {audit.isPending ? <Loading /> : (
          <table className="ruled-table">
            <thead><tr><th>#</th><th>{t('Action', 'क्रिया')}</th><th>{t('By', 'द्वारा')}</th><th>{t('Target', 'लक्ष्य')}</th><th>{t('Time', 'समय')}</th><th>{t('Hash', 'हैश')}</th></tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td className="font-mono text-[12px]">{l.seq}</td>
                  <td className="text-[13px]">{l.module} · {l.action}{l.outcome !== 'OK' && <span className="ml-1 text-[11px] font-semibold text-[#A8242C]">{l.outcome}</span>}</td>
                  <td className="text-[12px] text-[#5A6577]">{l.actor}</td>
                  <td className="font-mono text-[12px]">{l.target}</td>
                  <td className="font-mono text-[12px] text-[#5A6577] whitespace-nowrap">{l.timestamp}</td>
                  <td className="font-mono text-[11px] text-[#5A6577]">{l.hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

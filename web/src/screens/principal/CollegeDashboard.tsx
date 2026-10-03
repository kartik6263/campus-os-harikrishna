import { useApprovalQueue, useCollegeStats } from '../../lib/governancequeries';
import { Button, InlineAlert, toast } from '../../components/ui';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

const fmtLakh = (n: number) => `₹${(n / 100000).toFixed(1)}L`;

const SectionLabel = ({ children, right }: { children: string; right?: React.ReactNode }) => (
  <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between border-b border-[#D3D8E0]">
    <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{children}</span>
    {right}
  </div>
);

function KpiTile({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-[#D3D8E0] bg-white p-4 ${className}`}>
      <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">{label}</div>
      {children}
    </div>
  );
}

/** Shown until the first load lands, so the panels have shapes to fill. */
const EMPTY_STATS = {
  totalStudents: 0, totalFaculty: 0, programmes: 0, currentSemester: '—',
  averageAttendance: 0, atRiskStudents: 0, feeCollectedThisMonth: 0,
  feeTarget: 0, pendingFees: 0, examFormsSubmitted: 0, examFormsTotal: 0,
  resultPerformance: { passPercent: 0, distinctions: 0, firstClass: 0 },
  affiliationStatus: 'unknown' as string,
  college: { code: '—', name: 'Loading…', district: null as string | null },
};

export default function CollegeDashboard({ onModule }: Props) {
  const { data: stats } = useCollegeStats();
  const { data: approvals } = useApprovalQueue();

  const COLLEGE_STATS = stats ?? EMPTY_STATS;
  const pending = approvals.filter(a => a.status === 'pending');

  // approval summary by type
  const byType = pending.reduce<Record<string, number>>((acc, a) => {
    acc[a.typeLabel] = (acc[a.typeLabel] || 0) + 1;
    return acc;
  }, {});

  const today = new Date();
  const oldestApproval = pending.reduce<number>((max, a) => {
    const parts = a.raisedOn.split('-').map(Number);
    const d = new Date(parts[2], parts[1] - 1, parts[0]);
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    return Math.max(max, diff);
  }, 0);

  const semData = [
    { label: 'Sem I', pct: 88 },
    { label: 'Sem II', pct: 84 },
    { label: 'Sem III', pct: 79 },
    { label: 'Sem IV', pct: 86 },
  ];

  const feeCollected = COLLEGE_STATS.feeCollectedThisMonth;
  const feeTarget = COLLEGE_STATS.feeTarget;
  const feePct = Math.round((feeCollected / feeTarget) * 100);
  const examPct = Math.round((COLLEGE_STATS.examFormsSubmitted / COLLEGE_STATS.examFormsTotal) * 100);

  return (
    <div className="flex flex-col bg-[#EDEFF3] min-h-full">
      {/* Page header */}
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-3">
        <h1 className="text-[17px] font-semibold text-[#16264A]">College Dashboard</h1>
        <p className="text-[12px] text-[#5A6577]">Model College, Demo City — {COLLEGE_STATS.currentSemester}</p>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* KPI grid */}
        <section>
          <div className="grid grid-cols-4 gap-0 border border-[#D3D8E0] bg-white divide-x divide-[#D3D8E0]">
            {/* Row 1 */}
            <KpiTile label="Total Students">
              <div className="text-[32px] font-bold text-[#16264A] leading-none">1,842</div>
              <div className="text-[12px] text-[#5A6577] mt-1">{COLLEGE_STATS.programmes} programmes</div>
            </KpiTile>

            <KpiTile label="Average Attendance">
              <div className="text-[32px] font-bold text-[#E0952A] leading-none">72.4%</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] text-[#A8242C] font-semibold">↓ Below 75% threshold</span>
              </div>
            </KpiTile>

            <KpiTile label="Fee Collection">
              <div className="text-[24px] font-bold text-[#16264A] leading-none">
                {fmtLakh(feeCollected)}
                <span className="text-[14px] font-normal text-[#5A6577]"> / {fmtLakh(feeTarget)}</span>
              </div>
              <div className="mt-2 h-1.5 bg-[#EDEFF3] rounded-[2px] overflow-hidden">
                <div
                  className="h-full bg-[#0E7A5F]"
                  style={{ width: `${feePct}%` }}
                />
              </div>
              <div className="text-[11px] text-[#5A6577] mt-1">{feePct}% collected · {fmtLakh(COLLEGE_STATS.pendingFees)} pending</div>
            </KpiTile>

            <KpiTile label="At-Risk Students">
              <div className="text-[32px] font-bold text-[#A8242C] leading-none">143</div>
              <div className="text-[12px] text-[#5A6577] mt-1">3 critical (&lt;50% attendance)</div>
            </KpiTile>
          </div>

          <div className="grid grid-cols-4 gap-0 border-x border-b border-[#D3D8E0] bg-white divide-x divide-[#D3D8E0]">
            <KpiTile label="Exam Forms">
              <div className="text-[24px] font-bold text-[#0E7A5F] leading-none">
                {COLLEGE_STATS.examFormsSubmitted.toLocaleString()}
                <span className="text-[14px] font-normal text-[#5A6577]"> / {COLLEGE_STATS.examFormsTotal.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-1.5 bg-[#EDEFF3] rounded-[2px] overflow-hidden">
                <div className="h-full bg-[#0E7A5F]" style={{ width: `${examPct}%` }} />
              </div>
              <div className="text-[11px] text-[#5A6577] mt-1">{examPct}% submitted</div>
            </KpiTile>

            <KpiTile label="Result Performance">
              <div className="text-[24px] font-bold text-[#16264A] leading-none">
                {COLLEGE_STATS.resultPerformance.passPercent}%
                <span className="text-[13px] font-normal text-[#5A6577]"> pass</span>
              </div>
              <div className="text-[12px] text-[#5A6577] mt-1">
                {COLLEGE_STATS.resultPerformance.distinctions} distinctions · {COLLEGE_STATS.resultPerformance.firstClass} first class
              </div>
            </KpiTile>

            <KpiTile label="Faculty">
              <div className="text-[24px] font-bold text-[#16264A] leading-none">67</div>
              <div className="text-[12px] mt-1">
                <span className="text-[#A8242C] font-semibold">1 overloaded</span>
                <span className="text-[#5A6577]"> · 2 vacancies</span>
              </div>
            </KpiTile>

            <KpiTile label="Pending Approvals">
              <div className="text-[32px] font-bold text-[#E0952A] leading-none">{pending.length}</div>
              <div className="text-[12px] text-[#5A6577] mt-1">
                {pending.filter(a => a.priority === 'high').length} high priority
              </div>
            </KpiTile>
          </div>
        </section>

        {/* Attendance alert */}
        <section className="bg-white border border-[#D3D8E0]">
          <SectionLabel>Attendance Alert</SectionLabel>
          <div className="p-4 flex flex-col gap-3">
            <InlineAlert type="warning">
              Average attendance is <strong>72.4%</strong> — below the 75% minimum threshold. Immediate action required.
            </InlineAlert>
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-[#5A6577]">
                <strong className="text-[#16264A]">143 students</strong> at risk of attendance shortage —
                {' '}<span className="text-[#A8242C] font-semibold">3 in critical (&lt;50%) range</span>
              </p>
              <Button size="sm" variant="secondary" onClick={() => toast.info('Navigating to at-risk student report…')}>
                View At-Risk Students
              </Button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-6">
          {/* Fee collection */}
          <section className="bg-white border border-[#D3D8E0]">
            <SectionLabel>Fee Collection</SectionLabel>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <div className="flex items-end justify-between mb-1">
                  <span className="text-[13px] text-[#5A6577]">Collected vs Target</span>
                  <span className="text-[13px] font-semibold text-[#16264A]">{feePct}%</span>
                </div>
                <div className="h-2 bg-[#EDEFF3] border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                  <div className="h-full bg-[#0E7A5F] transition-all" style={{ width: `${feePct}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[11px] text-[#5A6577]">₹32.4L collected</span>
                  <span className="text-[11px] text-[#A8242C]">₹15.6L pending</span>
                </div>
              </div>
              <div className="border-t border-[#D3D8E0] pt-3">
                <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Breakdown</div>
                {[
                  { head: 'Tuition Fee', amount: '₹28.0L' },
                  { head: 'Exam Fee', amount: '₹2.1L' },
                  { head: 'Others', amount: '₹2.3L' },
                ].map(r => (
                  <div key={r.head} className="flex justify-between py-1 border-b border-[#EDEFF3]">
                    <span className="text-[13px] text-[#5A6577]">{r.head}</span>
                    <span className="text-[13px] font-medium text-[#16264A]">{r.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Exam forms */}
          <section className="bg-white border border-[#D3D8E0]">
            <SectionLabel>Exam Form Submission</SectionLabel>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <div className="text-[32px] font-bold text-[#0E7A5F]">92.2%</div>
                <div>
                  <div className="text-[13px] text-[#16264A] font-medium">1,698 of 1,842 submitted</div>
                  <div className="text-[12px] text-[#5A6577]">144 students yet to submit</div>
                </div>
              </div>
              <div className="h-2 bg-[#EDEFF3] border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                <div className="h-full bg-[#0E7A5F]" style={{ width: '92.2%' }} />
              </div>
              <div className="flex items-center gap-2 p-2 bg-[#FFF7ED] border border-[#E0952A] rounded-[2px]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E0952A" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-[12px] text-[#8A6D1F] font-medium">Deadline: 30-09-2024</span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => toast.info('Viewing pending exam form list…')}
              >
                View 144 Pending Students
              </Button>
            </div>
          </section>
        </div>

        {/* Result performance (CSS bar chart) */}
        <section className="bg-white border border-[#D3D8E0]">
          <SectionLabel>Semester-wise Pass Percentage (Previous Exams)</SectionLabel>
          <div className="p-4">
            <div className="flex flex-col gap-3">
              {semData.map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="text-[12px] text-[#5A6577] w-12 shrink-0">{s.label}</span>
                  <div className="flex-1 h-6 bg-[#EDEFF3] border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                    <div
                      className="h-full flex items-center pl-2 text-[11px] font-semibold text-white transition-all"
                      style={{
                        width: `${s.pct}%`,
                        backgroundColor: s.pct >= 85 ? '#0E7A5F' : s.pct >= 80 ? '#16264A' : '#8A6D1F',
                      }}
                    >
                      {s.pct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pending approvals summary */}
        <section className="bg-white border border-[#D3D8E0]">
          <SectionLabel
            right={
              <Button size="sm" onClick={() => onModule('inbox')}>
                Go to Approval Inbox
              </Button>
            }
          >
            Pending Approvals Summary
          </SectionLabel>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Type</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Count</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Oldest (days)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D3D8E0]">
              {Object.entries(byType).map(([type, count]) => (
                <tr key={type} className="hover:bg-[#F7F8FA]">
                  <td className="px-4 py-2.5 text-[#16264A]">{type}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[#16264A]">{count}</td>
                  <td className="px-4 py-2.5 text-right text-[#5A6577]">{oldestApproval}d</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => onModule('inbox')}
                      className="text-[#E0952A] text-[12px] font-semibold hover:underline"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

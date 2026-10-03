import { useState } from 'react';
import { ToastContainer } from '../../components/ui';
import {
  useCohort,
  useProjection,
  type ApiProjectionRow,
} from '../../lib/intelligencequeries';

type Band = 'distinction' | 'first_class' | 'second_class' | 'pass' | 'below_pass';
type View = 'students' | 'cohort';
type SortKey = 'projected' | 'assessed' | 'risk';

const BAND_CONFIG: Record<Band, { label: string; color: string; bg: string; border: string; bar: string }> = {
  distinction:  { label: 'Distinction',   color: '#A78BFA', bg: 'bg-purple-900/40', border: 'border-purple-700', bar: 'bg-purple-500' },
  first_class:  { label: 'First Class',   color: '#34D399', bg: 'bg-green-900/30',  border: 'border-green-700',  bar: 'bg-green-500' },
  second_class: { label: 'Second Class',  color: '#60A5FA', bg: 'bg-blue-900/30',   border: 'border-blue-700',   bar: 'bg-blue-500' },
  pass:         { label: 'Pass',          color: '#FCD34D', bg: 'bg-yellow-900/30', border: 'border-yellow-700', bar: 'bg-yellow-500' },
  below_pass:   { label: 'Below Pass',    color: '#F87171', bg: 'bg-red-900/30',    border: 'border-red-700',    bar: 'bg-red-500' },
};

const BAND_ORDER: Band[] = ['below_pass', 'pass', 'second_class', 'first_class', 'distinction'];

function BandBadge({ band }: { band: Band | null }) {
  if (!band) return <span className="text-[11px] text-gray-500">not yet assessable</span>;
  const cfg = BAND_CONFIG[band];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cfg.bg} border ${cfg.border}`} style={{ color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

/**
 * How much of the term the figure rests on.
 *
 * This is the honest substitute for a confidence percentage: a projection off
 * one approved sheet and one off a full set are not the same claim, and the
 * screen has to show which it is looking at.
 */
function AssessedBar({ share }: { share: number }) {
  const thin = share < 50;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-[#1E3A5F]">
        <div
          className={`h-1.5 rounded-full ${thin ? 'bg-amber-500/80' : 'bg-[#7C3AED]/70'}`}
          style={{ width: `${share}%` }}
        />
      </div>
      <span className={`text-[12px] ${thin ? 'text-amber-400' : 'text-gray-400'}`}>{share}%</span>
    </div>
  );
}

function StudentDetailPanel({ student, onClose }: { student: ApiProjectionRow; onClose: () => void }) {
  const band = student.band as Band | null;
  const cfg = band ? BAND_CONFIG[band] : null;

  // "Weak" and "strong" are read off the same marks, not asserted separately.
  const ranked = [...student.subjects].sort((a, b) => a.percent - b.percent);
  const weak = ranked.filter(s => s.percent < 45);
  const strong = ranked.filter(s => s.percent >= 60);

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[#0A1428] border-l border-[#1E3A5F] z-20 flex flex-col shadow-2xl overflow-y-auto">
      <div className="px-5 py-4 border-b border-[#1E3A5F] flex items-center justify-between sticky top-0 bg-[#0A1428] z-10 shrink-0">
        <span className="text-[14px] font-semibold text-white">Term so far</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer text-lg">✕</button>
      </div>

      <div className="p-5 flex flex-col gap-5">
        <div>
          <div className="text-[18px] font-bold text-white">{student.name}</div>
          <div className="text-[12px] text-gray-400">{student.programme} · Semester {student.semester} · {student.enrolmentNo}</div>
          <div className="mt-3 flex items-center gap-2">
            <BandBadge band={band} />
            <span className="text-[12px] text-gray-500">on {student.assessedShare}% of their subjects</span>
          </div>
        </div>

        {/* The projection itself */}
        <div className="bg-[#0D1B35] rounded-xl p-4 border border-[#1E3A5F]">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-3 font-medium">Internal marks approved so far</div>
          <div className="flex items-end gap-3 mb-4">
            <div className="text-[36px] font-bold leading-none" style={{ color: cfg?.color ?? '#9CA3AF' }}>
              {student.projectedPercent ?? '—'}%
            </div>
            <div className="text-[12px] text-gray-400 pb-1">
              {student.internalScored} of {student.internalMax} marks
            </div>
          </div>
          <div className="relative h-3 rounded-full bg-[#1E3A5F]">
            <div
              className="absolute top-0 left-0 h-3 rounded-full"
              style={{ width: `${student.projectedPercent ?? 0}%`, background: cfg?.color ?? '#6B7280', opacity: 0.6 }}
            />
          </div>
        </div>

        {/* What the figure is, and what it is not. There is no model behind
            this beyond arithmetic on approved marks, so the panel says so
            rather than showing invented contribution weights. */}
        <div className="bg-[#0D1B35] rounded-xl p-4 border border-[#1E3A5F]">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-2">What this rests on</div>
          <div className="text-[12px] text-gray-400 leading-relaxed">
            Internal marks a head of department has <strong className="text-gray-200">approved</strong> — a
            sheet still in draft is nobody's signed number and is left out.
            This covers {student.assessedShare}% of the subjects this student is
            enrolled in, and nothing here accounts for the external paper.
          </div>
          <div className="text-[10px] text-gray-600 mt-2 italic">
            Not a prediction of the examination. For guidance in a conversation, not an assessment.
          </div>
        </div>

        {/* Every subject with an approved sheet */}
        <div>
          <div className="text-[12px] text-gray-400 font-medium uppercase tracking-wide mb-2">Subjects assessed</div>
          <div className="flex flex-col gap-2">
            {ranked.map(sub => {
              const weakOne = sub.percent < 45;
              return (
                <div
                  key={sub.code}
                  className={`rounded-lg p-3 border ${weakOne ? 'bg-red-900/20 border-red-800/50' : 'bg-[#0D1B35] border-[#1E3A5F]'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[13px] font-medium ${weakOne ? 'text-red-200' : 'text-gray-200'}`}>
                      {sub.code} — {sub.name}
                    </span>
                    <span className={`text-[12px] font-bold ${weakOne ? 'text-red-400' : 'text-gray-300'}`}>
                      {sub.scored}/{sub.max}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[#1E3A5F]">
                    <div
                      className={`h-1.5 rounded-full ${weakOne ? 'bg-red-500' : sub.percent >= 60 ? 'bg-green-500/70' : 'bg-amber-500'}`}
                      style={{ width: `${sub.percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {ranked.length === 0 && (
              <div className="text-[13px] text-gray-500 italic">No approved sheet yet.</div>
            )}
          </div>
        </div>

        {strong.length > 0 && (
          <div>
            <div className="text-[12px] text-gray-400 font-medium uppercase tracking-wide mb-2">Holding up</div>
            <div className="flex flex-wrap gap-2">
              {strong.map(s => (
                <span key={s.code} className="px-3 py-1 rounded-full bg-green-900/30 border border-green-800 text-green-400 text-[12px]">
                  ✓ {s.name} · {s.percent}%
                </span>
              ))}
            </div>
          </div>
        )}

        {weak.length > 0 && (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
            <div className="text-[12px] text-amber-400 font-semibold mb-1">Worth a conversation</div>
            <div className="text-[13px] text-amber-100/80">
              {weak.map(s => `${s.name} (${s.percent}%)`).join(', ')} —
              below the pass line on what has been marked so far.
            </div>
            {/* Recording an intervention belongs to the mentor's own screen,
                where their words go on the record. A button here that only
                raised a toast would be claiming an act that never happened. */}
            <div className="text-[11px] text-amber-200/60 mt-2">
              Record what you do about it against the student on the At-Risk screen.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── COHORT VIEW ──────────────────────────────────────────────────────────────

function CohortView({ rows, notProjected }: { rows: ApiProjectionRow[]; notProjected: number }) {
  const cohort = useCohort();

  const bandCounts = BAND_ORDER.map(b => ({
    band: b,
    count: rows.filter(s => s.band === b).length,
  }));
  const total = rows.length;
  const belowPass = rows.filter(s => s.band === 'below_pass').length;
  const average = total === 0
    ? 0
    : Number((rows.reduce((s, x) => s + (x.projectedPercent ?? 0), 0) / total).toFixed(1));
  // A cohort figure built mostly from one sheet each deserves the caveat.
  const averageShare = total === 0
    ? 0
    : Math.round(rows.reduce((s, x) => s + x.assessedShare, 0) / total);

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Students projected', value: String(total), sub: `${notProjected} not yet assessable` },
          { label: 'Average so far', value: `${average}%`, sub: 'of approved internal marks' },
          { label: 'Assessment covered', value: `${averageShare}%`, sub: 'of subjects, on average' },
          { label: 'Below the pass line', value: String(belowPass), sub: 'on what is marked', alert: belowPass > 0 },
        ].map(kpi => (
          <div key={kpi.label} className={`bg-[#0A1428] rounded-xl p-4 border ${kpi.alert ? 'border-red-700/60' : 'border-[#1E3A5F]'}`}>
            <div className={`text-[28px] font-bold ${kpi.alert ? 'text-red-400' : 'text-white'}`}>{kpi.value}</div>
            <div className="text-[11px] text-gray-400 mt-1">{kpi.label}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Band distribution bar */}
      <div className="bg-[#0A1428] border border-[#1E3A5F] rounded-xl p-5">
        <div className="text-[13px] font-semibold text-white mb-4">Where the class stands on approved internals</div>
        {total === 0 ? (
          <div className="text-[13px] text-gray-500 italic">Nothing approved yet to divide up.</div>
        ) : (
          <>
            <div className="flex h-10 rounded-lg overflow-hidden gap-0.5 mb-3">
              {bandCounts.filter(b => b.count > 0).map(({ band, count }) => {
                const cfg = BAND_CONFIG[band];
                const width = (count / total) * 100;
                return (
                  <div
                    key={band}
                    className={`${cfg.bar} flex items-center justify-center transition-all cursor-pointer hover:opacity-80`}
                    style={{ width: `${width}%` }}
                    title={`${cfg.label}: ${count} students`}
                  >
                    {width > 8 && <span className="text-white text-[11px] font-bold">{count}</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 flex-wrap">
              {bandCounts.filter(b => b.count > 0).map(({ band, count }) => {
                const cfg = BAND_CONFIG[band];
                return (
                  <div key={band} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-sm ${cfg.bar}`} />
                    <span className="text-[11px] text-gray-400">{cfg.label}</span>
                    <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>{count}</span>
                    <span className="text-[10px] text-gray-600">({Math.round((count / total) * 100)}%)</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Subject pass rates — declared results, not projections */}
      <div className="bg-[#0A1428] border border-[#1E3A5F] rounded-xl p-5">
        <div className="text-[13px] font-semibold text-white mb-1">Subject pass rates</div>
        <div className="text-[12px] text-gray-500 mb-4">
          From results already declared, worst first — the papers this cohort has historically struggled with
        </div>
        <div className="flex flex-col gap-3">
          {(cohort.data?.subjectPassRates ?? []).map(sub => {
            const poor = sub.passPercent < 60;
            return (
              <div key={sub.code} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {poor && <span className="text-red-400 text-[11px]">⚠</span>}
                    <span className={`text-[13px] font-medium ${poor ? 'text-red-200' : 'text-gray-200'}`}>
                      {sub.code} — {sub.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px]">
                    <span className="text-gray-400">{sub.passed} of {sub.sat} passed</span>
                    <span className={poor ? 'text-red-400 font-semibold' : 'text-gray-400'}>
                      {sub.passPercent}%
                    </span>
                  </div>
                </div>
                <div className="flex-1 h-2 rounded-full bg-[#1E3A5F]">
                  <div
                    className={`h-2 rounded-full ${poor ? 'bg-red-500' : sub.passPercent < 80 ? 'bg-amber-500' : 'bg-green-500/70'}`}
                    style={{ width: `${sub.passPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
          {cohort.data && cohort.data.subjectPassRates.length === 0 && (
            <div className="text-[13px] text-gray-500 italic">No results declared yet.</div>
          )}
        </div>
      </div>

      {/* Attendance shape, in ten-point bands */}
      <div className="bg-[#0A1428] border border-[#1E3A5F] rounded-xl p-5">
        <div className="text-[13px] font-semibold text-white mb-1">Attendance across the cohort</div>
        <div className="text-[12px] text-gray-500 mb-4">Students per ten-point band · the bar left of 75% is the debarment side</div>
        <div className="flex items-end gap-1 h-32">
          {(cohort.data?.attendanceDistribution ?? []).map(b => {
            const max = Math.max(1, ...(cohort.data?.attendanceDistribution ?? []).map(x => x.students));
            const short = b.to < 75;
            return (
              <div key={b.from} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                {b.students > 0 && <span className="text-[10px] text-gray-400">{b.students}</span>}
                <div
                  className={`w-full rounded-t ${short ? 'bg-red-500/70' : 'bg-green-500/60'}`}
                  style={{ height: `${(b.students / max) * 100}%`, minHeight: b.students > 0 ? 4 : 0 }}
                />
                <span className="text-[9px] text-gray-600">{b.from}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* The projection's own caveat, from the server */}
      <div className="text-[11px] text-gray-600 italic">
        Every figure above is counted from rows this system holds. Nothing here
        is exported or referred anywhere — there is no report generator behind
        this screen, and a button claiming otherwise would be a lie.
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function PredictivePerformance() {
  const projection = useProjection();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('projected');
  const [programme, setProgramme] = useState('');
  const [semester, setSemester] = useState('');
  const [view, setView] = useState<View>('students');

  const all = projection.data?.students ?? [];
  const programmes = [...new Set(all.map(s => s.programme))].sort();
  const semesters = [...new Set(all.map(s => s.semester))].sort((a, b) => a - b);

  const rows = all.filter(s => {
    if (programme && s.programme !== programme) return false;
    if (semester && String(s.semester) !== semester) return false;
    return true;
  });

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'projected') return (b.projectedPercent ?? 0) - (a.projectedPercent ?? 0);
    if (sortKey === 'assessed') return b.assessedShare - a.assessedShare;
    return BAND_ORDER.indexOf(a.band as Band) - BAND_ORDER.indexOf(b.band as Band);
  });

  const selectedStudent = rows.find(s => s.studentId === selectedId) ?? null;

  const total = sorted.length;
  const distinctions = sorted.filter(s => s.band === 'distinction').length;
  const belowPass = sorted.filter(s => s.band === 'below_pass').length;

  return (
    <div className="flex flex-col h-full bg-[#0D1B35] text-white overflow-hidden">
      <ToastContainer />

      {/* Top bar */}
      <div className="bg-[#0A1428] border-b border-[#1E3A5F] px-5 py-3 flex items-center gap-4 shrink-0 flex-wrap">
        <div className="text-[15px] font-semibold text-white">Term Projection</div>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-[#1E3A5F]">
          <button
            onClick={() => setView('students')}
            className={`px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${view === 'students' ? 'bg-[#7C3AED] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Per Student
          </button>
          <button
            onClick={() => setView('cohort')}
            className={`px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${view === 'cohort' ? 'bg-[#7C3AED] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Class / Cohort
          </button>
        </div>

        <div className="flex gap-3 items-center ml-auto">
          <select
            value={programme}
            onChange={e => setProgramme(e.target.value)}
            className="px-3 py-1.5 rounded bg-[#0D1B35] border border-[#1E3A5F] text-gray-200 text-[13px] outline-none cursor-pointer"
          >
            <option value="">All programmes</option>
            {programmes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={semester}
            onChange={e => setSemester(e.target.value)}
            className="px-3 py-1.5 rounded bg-[#0D1B35] border border-[#1E3A5F] text-gray-200 text-[13px] outline-none cursor-pointer"
          >
            <option value="">All semesters</option>
            {semesters.map(s => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>
        </div>
      </div>

      {/* The server's own caveat, carried rather than rewritten */}
      {projection.data && (
        <div className="bg-amber-900/20 border-b border-amber-800/50 px-5 py-2 text-[12px] text-amber-200/80 shrink-0">
          {projection.data.note}
        </div>
      )}

      {/* Summary strip — students view only */}
      {view === 'students' && (
        <div className="bg-[#0A1428] border-b border-[#1E3A5F] px-5 py-2.5 flex items-center gap-6 shrink-0 flex-wrap">
          <div className="text-[12px] text-gray-400">
            <span className="text-white font-semibold">{total}</span> projected
            {projection.data ? ` · ${projection.data.totals.notYetAssessable} not yet assessable` : ''}
          </div>
          <div className="text-[12px] text-gray-400">
            <span className="text-purple-400 font-semibold">{distinctions}</span> at distinction so far
          </div>
          <div className="text-[12px] text-gray-400">
            <span className="text-red-400 font-semibold">{belowPass}</span> below the pass line
          </div>
          <div className="ml-auto flex items-center gap-2 text-[12px] text-gray-400">
            Sort by:
            {(['projected', 'assessed', 'risk'] as SortKey[]).map(k => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${sortKey === k ? 'bg-[#7C3AED] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {k === 'projected' ? 'Marks' : k === 'assessed' ? 'How much assessed' : 'Weakest first'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {view === 'cohort' ? (
        <CohortView rows={rows} notProjected={projection.data?.totals.notYetAssessable ?? 0} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {projection.isLoading && (
            <div className="p-5 text-[13px] text-gray-500">Loading…</div>
          )}
          {projection.error && (
            <div className="p-5 text-[13px] text-red-400">
              {projection.error instanceof Error ? projection.error.message : 'Could not load the projection.'}
            </div>
          )}
          {projection.data && total === 0 && (
            <div className="p-5 text-[13px] text-gray-500 italic">
              Nothing to project yet — no internal marks sheet has been approved.
            </div>
          )}
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0A1428] border-b border-[#1E3A5F] z-10">
              <tr>
                {['Student', 'Marks so far', 'Standing', 'Weakest paper', 'Assessed'].map(col => (
                  <th key={col} className="px-4 py-3 text-left text-[11px] text-gray-400 font-medium uppercase tracking-wide">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr
                  key={s.studentId}
                  onClick={() => setSelectedId(s.studentId)}
                  className={`border-b border-[#1E3A5F] cursor-pointer transition-colors hover:bg-[#0A1428]/60 ${
                    i % 2 === 0 ? 'bg-transparent' : 'bg-[#0A1428]/20'
                  } ${selectedId === s.studentId ? 'bg-[#7C3AED]/10 border-l-2 border-l-[#7C3AED]' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="text-[14px] font-medium text-white">{s.name}</div>
                    <div className="text-[11px] text-gray-500">{s.enrolmentNo} · {s.programme} Sem {s.semester}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[20px] font-bold" style={{ color: s.band ? BAND_CONFIG[s.band as Band].color : '#9CA3AF' }}>
                      {s.projectedPercent ?? '—'}%
                    </span>
                    <span className="text-[11px] text-gray-500 ml-2">{s.internalScored}/{s.internalMax}</span>
                  </td>
                  <td className="px-4 py-3">
                    <BandBadge band={s.band as Band | null} />
                  </td>
                  <td className="px-4 py-3">
                    {s.weakest ? (
                      <span className="text-[12px] text-gray-300">
                        {s.weakest.code}
                        <span className="text-gray-500"> · {s.weakest.percent}%</span>
                      </span>
                    ) : <span className="text-[12px] text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <AssessedBar share={s.assessedShare} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedStudent && view === 'students' && (
        <StudentDetailPanel student={selectedStudent} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

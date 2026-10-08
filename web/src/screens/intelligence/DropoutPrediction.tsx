import { useState } from 'react';
import { toast, ToastContainer } from '../../components/ui';
import { copyText, dueIn, sourceLabel, useRiskBrief, type RiskBrief } from '../../lib/ai';
import {
  INTERVENTION_KINDS,
  OUTCOMES,
  kindLabel,
  shortDate,
  useAtRiskStudents,
  useCloseIntervention,
  useRaiseIntervention,
  useRiskDetail,
  useTakeSnapshot,
  type ApiIntervention,
  type LegacyAtRiskStudent as AtRiskStudent,
  type RiskLevel,
} from '../../lib/intelligencequeries';

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; border: string; dot: string }> = {
  critical: { bg: 'bg-red-900/40', text: 'text-red-400', border: 'border-red-700', dot: '#EF4444' },
  high:     { bg: 'bg-orange-900/30', text: 'text-orange-400', border: 'border-orange-700', dot: '#F97316' },
  moderate: { bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-700', dot: '#F59E0B' },
  low:      { bg: 'bg-gray-800/40', text: 'text-gray-400', border: 'border-gray-700', dot: '#9CA3AF' },
};

const RISK_LABEL: Record<RiskLevel, string> = {
  critical: 'CRITICAL', high: 'HIGH', moderate: 'MODERATE', low: 'LOW',
};

interface Distribution {
  critical: number; high: number; moderate: number; low: number; total: number;
}

// Simple donut ring SVG
function DonutRing({ distribution }: { distribution: Distribution }) {
  const total = distribution.total;
  const slices = [
    { count: distribution.critical, color: '#EF4444' },
    { count: distribution.high,     color: '#F97316' },
    { count: distribution.moderate, color: '#F59E0B' },
    { count: distribution.low,      color: '#374151' },
  ];

  const r = 36;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24">
      {total > 0 && slices.map((s, i) => {
        const dash = (s.count / total) * circumference;
        const gap = circumference - dash;
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 50 50)"
          />
        );
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r="22" fill="#0A1428" />
      <text x="50" y="47" textAnchor="middle" fill="#9CA3AF" fontSize="7">Scored</text>
      <text x="50" y="57" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">
        {total}
      </text>
    </svg>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const c = RISK_COLORS[level];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide ${c.bg} ${c.text} border ${c.border}`}>
      {RISK_LABEL[level]}
    </span>
  );
}

// Raising an intervention against a student
function LogInterventionForm({ studentId, onClose, initial }: { studentId: string; onClose: () => void; initial?: { kind: ApiIntervention['kind']; note: string; dueOn: string } }) {
  const raise = useRaiseIntervention();
  const [kind, setKind] = useState<ApiIntervention['kind']>(initial?.kind ?? 'COUNSELLING');
  const [notes, setNotes] = useState(initial?.note ?? '');
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? '');

  async function handleSubmit() {
    try {
      const r = await raise.mutateAsync({
        studentId,
        kind,
        note: notes.trim(),
        ...(dueOn ? { dueOn } : {}),
      });
      // The score is kept as it stood, which is what makes the outcome
      // readable later rather than a matter of recollection.
      toast.success(
        r.scoreAtRaise === null
          ? 'Recorded.'
          : `Recorded against a score of ${r.scoreAtRaise}.`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record that.');
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-[#0D1B35] border border-[#1E3A5F] rounded-xl">
      <h4 className="text-[14px] font-semibold text-white">Record an intervention</h4>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] text-gray-400">What was done</label>
        <select
          value={kind}
          onChange={e => setKind(e.target.value as ApiIntervention['kind'])}
          className="px-3 py-2 rounded-lg bg-[#0A1428] border border-[#1E3A5F] text-white text-[13px] outline-none cursor-pointer"
        >
          {INTERVENTION_KINDS.map(k => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] text-gray-400">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="What was said, and what was agreed..."
          className="px-3 py-2 rounded-lg bg-[#0A1428] border border-[#1E3A5F] text-white text-[13px] outline-none resize-none placeholder-gray-600"
          rows={3}
        />
        <span className="text-[11px] text-gray-600">At least ten characters — this is the record of what happened.</span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] text-gray-400">Follow up by (optional)</label>
        <input
          type="date"
          value={dueOn}
          onChange={e => setDueOn(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#0A1428] border border-[#1E3A5F] text-white text-[13px] outline-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-lg border border-[#1E3A5F] text-gray-400 text-[13px] hover:bg-[#1E3A5F]/30 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={notes.trim().length < 10 || raise.isPending}
          className="flex-1 py-2 rounded-lg bg-[#7C3AED] text-white text-[13px] font-medium hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {raise.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// Closing one that is already open
function CloseInterventionForm({
  intervention, studentId, onClose,
}: { intervention: ApiIntervention; studentId: string; onClose: () => void }) {
  const close = useCloseIntervention();
  const [outcome, setOutcome] = useState<'IMPROVED' | 'NO_CHANGE' | 'WORSENED' | 'WITHDRAWN'>('IMPROVED');
  const [note, setNote] = useState('');

  async function handleSubmit() {
    try {
      const r = await close.mutateAsync({ id: intervention.id, studentId, outcome, outcomeNote: note.trim() });
      // The claim in the note can be checked against the two scores.
      toast.success(
        r.change === null
          ? 'Closed.'
          : `Closed. The score went from ${r.scoreAtRaise} to ${r.scoreNow}.`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close that.');
    }
  }

  return (
    <div className="flex flex-col gap-3 mt-2 p-3 bg-[#0D1B35] border border-[#1E3A5F] rounded-lg">
      <div className="text-[12px] text-gray-400">Close this {kindLabel(intervention.kind).toLowerCase()}</div>
      <select
        value={outcome}
        onChange={e => setOutcome(e.target.value as typeof outcome)}
        className="px-3 py-2 rounded-lg bg-[#0A1428] border border-[#1E3A5F] text-white text-[13px] outline-none cursor-pointer"
      >
        {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="What actually happened..."
        className="px-3 py-2 rounded-lg bg-[#0A1428] border border-[#1E3A5F] text-white text-[13px] outline-none resize-none placeholder-gray-600"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 rounded-lg border border-[#1E3A5F] text-gray-400 text-[12px] hover:bg-[#1E3A5F]/30 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={note.trim().length < 5 || close.isPending}
          className="flex-1 py-1.5 rounded-lg bg-[#7C3AED] text-white text-[12px] font-medium hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {close.isPending ? 'Saving…' : 'Close it'}
        </button>
      </div>
    </div>
  );
}

// Detail panel for a student
/** Gemini's reading of the score: why, what to do, and what to say. */
function AiBrief({ studentId, onUse }: { studentId: string; onUse: (a: RiskBrief['actions'][number]) => void }) {
  const brief = useRiskBrief(studentId);
  const [hindi, setHindi] = useState(false);
  const d = brief.data;
  async function copy(text: string) {
    if (await copyText(text)) toast.success('Copied');
    else toast.error('Could not copy — select the text instead');
  }
  const run = (refresh: boolean) => brief.mutate(refresh, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not draft the brief') });
  return (
    <div className="rounded-xl p-4 border border-[#7C3AED]/50 bg-gradient-to-br from-[#1E1050]/60 to-[#0D1B35]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[12px] font-semibold text-purple-200">✦ AI counselling brief</div>
        {d && <span className="text-[10px] text-purple-300/70">{sourceLabel(d)}</span>}
      </div>
      {!d && !brief.isPending && (
        <>
          <p className="text-[12px] text-gray-400 mb-3">Explains this score in plain words and drafts the interventions, a way to open the conversation, and a message to the parent. The student's name is not sent.</p>
          <button onClick={() => run(false)} className="w-full py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[13px] font-medium cursor-pointer">Draft the brief</button>
        </>
      )}
      {brief.isPending && <div className="text-[13px] text-purple-200 flex items-center gap-2 py-2"><span className="w-4 h-4 border-2 border-purple-300/30 border-t-purple-200 rounded-full animate-spin" /> Reading the record…</div>}
      {brief.isError && !brief.isPending && <p className="text-[12px] text-red-300 mt-2">{brief.error instanceof Error ? brief.error.message : 'Failed'}</p>}
      {d && !brief.isPending && (
        <div className="flex flex-col gap-3 text-[13px]">
          {d.notice && <p className="text-[11px] text-amber-300/90">{d.notice}</p>}
          <p className="text-gray-100">{d.data.summary}</p>
          <div className="flex flex-col gap-1.5">
            {d.data.drivers.map((x, i) => <p key={i} className="text-[12px] text-gray-300"><span className="text-purple-200 font-medium">{x.factor}:</span> {x.explanation}</p>)}
          </div>
          <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">Suggested interventions</div>
            {d.data.actions.length === 0 && <p className="text-[12px] text-gray-400">Every suggested kind is already open for this student.</p>}
            <div className="flex flex-col gap-2">
              {d.data.actions.map((a, i) => (
                <div key={i} className="bg-[#0A1428] border border-[#1E3A5F] rounded-lg p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[13px] text-white font-medium">{a.title}</div>
                      <div className="text-[11px] text-gray-500">{kindLabel(a.kind)} · {a.owner} · within {a.dueInDays} day{a.dueInDays > 1 ? 's' : ''}</div>
                    </div>
                    <button onClick={() => onUse(a)} className="text-[11px] px-2 py-1 rounded bg-[#7C3AED]/30 text-purple-100 hover:bg-[#7C3AED]/60 cursor-pointer shrink-0">Use this</button>
                  </div>
                  <p className="text-[12px] text-gray-300 mt-1">{a.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-gray-500 uppercase tracking-wide">Opening the conversation</span><button onClick={() => void copy(d.data.mentorOpener)} className="text-[11px] text-purple-300 hover:text-white cursor-pointer">Copy</button></div>
            <p className="text-[12px] text-gray-300 italic">“{d.data.mentorOpener}”</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500 uppercase tracking-wide">Message to the parent</span>
              <span className="flex gap-2">
                <button onClick={() => setHindi(h => !h)} className="text-[11px] text-purple-300 hover:text-white cursor-pointer">{hindi ? 'English' : 'हिंदी'}</button>
                <button onClick={() => void copy(hindi ? d.data.parentMessageHi : d.data.parentMessage)} className="text-[11px] text-purple-300 hover:text-white cursor-pointer">Copy</button>
              </span>
            </div>
            <p className="text-[12px] text-gray-300" style={hindi ? { fontFamily: 'Noto Sans Devanagari, sans-serif' } : undefined}>{hindi ? d.data.parentMessageHi : d.data.parentMessage}</p>
          </div>
          <button onClick={() => run(true)} className="self-start text-[11px] text-purple-300 hover:text-white cursor-pointer">↻ Draft again</button>
        </div>
      )}
    </div>
  );
}

function StudentDetailPanel({ student, onClose }: { student: AtRiskStudent; onClose: () => void }) {
  const detail = useRiskDetail(student.id);
  const [showLogForm, setShowLogForm] = useState(false);
  const [prefill, setPrefill] = useState<{ kind: ApiIntervention['kind']; note: string; dueOn: string } | undefined>(undefined);
  const [closing, setClosing] = useState<string | null>(null);

  const current = detail.data?.current;
  const factors = current?.factors ?? student.riskFactors;
  const negFactors = factors.filter(f => f.direction === 'negative');
  const posFactors = factors.filter(f => f.direction !== 'negative');
  const score = current?.score ?? student.riskScore;
  const movement = detail.data?.movement;
  const projection = detail.data?.projection;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[#0A1428] border-l border-[#1E3A5F] z-20 flex flex-col shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1E3A5F] flex items-center justify-between shrink-0 sticky top-0 bg-[#0A1428] z-10">
        <span className="text-[14px] font-semibold text-white">Student Detail</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer text-lg">✕</button>
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* Student header */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] flex items-center justify-center text-white font-bold text-[16px] shrink-0">
            {student.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div className="text-[16px] font-semibold text-white">{student.name}</div>
            <div className="text-[12px] text-gray-400">{student.enrolmentNo}</div>
            <div className="text-[12px] text-gray-400 mt-0.5">{student.programme} · Sem {student.semester} · {student.college}</div>
            <div className="text-[12px] text-gray-500 mt-0.5">Mentor: {student.mentorName}</div>
          </div>
        </div>

        {/* Signal disclaimer */}
        <div className="text-[11px] text-amber-400/80 italic border-l-2 border-amber-600 pl-2">
          This is a signal, not a verdict. A score can be wrong.
        </div>

        {/* Risk score */}
        <div className="bg-[#0D1B35] rounded-xl p-4 border border-[#1E3A5F]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[40px] font-bold text-white leading-none">{score}</div>
              <div className="text-[11px] text-gray-400 mt-1">Risk Score /100</div>
            </div>
            <div className="text-right">
              <RiskBadge level={student.riskLevel} />
              {/* Not a confidence figure: how much record the score rests on. */}
              <div className="text-[11px] text-gray-400 mt-2">
                {(current?.dataPoints ?? student.dataPoints).toLocaleString()} records behind it
              </div>
              {movement && (
                <div className={`text-[10px] mt-1 ${
                  movement.direction === 'improved' ? 'text-green-400'
                  : movement.direction === 'worsened' ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {movement.direction === 'unchanged'
                    ? `unchanged since ${shortDate(movement.since)}`
                    : `${movement.change > 0 ? '+' : ''}${movement.change} since ${shortDate(movement.since)}`}
                </div>
              )}
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="flex flex-col gap-2 mt-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium mb-1">
              Risk Factors — the points below add up to {score}
            </div>
            {[...negFactors, ...posFactors].map((f, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-300 flex items-center gap-1">
                    {f.direction === 'negative' ? <span className="text-red-400">↓</span> : f.direction === 'positive' ? <span className="text-green-400">↑</span> : <span className="text-gray-400">→</span>}
                    {f.factor}
                  </span>
                  <span className={f.direction === 'negative' ? 'text-red-400' : f.direction === 'positive' ? 'text-green-400' : 'text-gray-400'}>
                    +{f.contribution} of {Math.round(f.weight * 100)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">{f.value}</div>
                <div className="h-1 rounded-full bg-[#1E3A5F]">
                  <div
                    className={`h-1 rounded-full ${f.direction === 'negative' ? 'bg-red-500' : f.direction === 'positive' ? 'bg-green-500' : 'bg-gray-500'}`}
                    style={{ width: `${Math.round(f.weight * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How to disagree with it. There is no appeal queue behind this
            screen, and inventing one would be worse than saying plainly what
            actually overrides a score. */}
        <div className="text-[11px] text-gray-500 border border-[#1E3A5F] rounded-lg p-3 leading-relaxed">
          Disagree with this score? It is only the four figures above, weighted
          and added — nothing is hidden behind it. Talk to the student, and
          record what you find below. A mentor's note outranks the arithmetic.
        </div>

        {/* What the record itself suggests */}
        {negFactors.length > 0 && (
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4">
            <div className="text-[12px] text-amber-400 font-semibold mb-1">What is pulling the score up</div>
            <ul className="text-[13px] text-amber-100/80 flex flex-col gap-1">
              {negFactors.map((f, i) => (
                <li key={i}>· {f.factor}: {f.value}</li>
              ))}
            </ul>
          </div>
        )}

        <AiBrief key={student.id} studentId={student.id} onUse={(a) => { setPrefill({ kind: a.kind, note: `${a.title}. ${a.detail} (Owner: ${a.owner}.)`, dueOn: dueIn(a.dueInDays) }); setShowLogForm(true); }} />

        {/* Projection, if there is anything approved to project from */}
        {projection && projection.projectedPercent !== null && (
          <div className="bg-[#0D1B35] border border-[#1E3A5F] rounded-xl p-4">
            <div className="text-[12px] text-gray-400 font-medium uppercase tracking-wide mb-2">Term so far</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-bold text-white">{projection.projectedPercent}%</span>
              <span className="text-[12px] text-gray-400">
                {projection.internalScored} of {projection.internalMax} internal marks
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              From {projection.assessedShare}% of their subjects — only approved sheets count.
            </div>
          </div>
        )}

        {/* Intervention log */}
        <div>
          <div className="text-[12px] text-gray-400 font-medium uppercase tracking-wide mb-3">Intervention Log</div>
          {detail.isLoading && <div className="text-[13px] text-gray-500 italic">Loading…</div>}
          {detail.data && detail.data.interventions.length === 0 && (
            <div className="text-[13px] text-gray-500 italic">Nothing recorded yet.</div>
          )}
          <div className="flex flex-col gap-3">
            {(detail.data?.interventions ?? []).map(inv => (
              <div key={inv.id} className="relative pl-4 border-l-2 border-[#1E3A5F]">
                <div className="text-[12px] text-gray-400">
                  {shortDate(inv.raisedAt)} · {inv.raisedBy} · {kindLabel(inv.kind)}
                </div>
                <div className="text-[13px] text-gray-200 mt-0.5">{inv.note}</div>
                {inv.dueOn && inv.outcome === 'OPEN' && (
                  <div className="text-[11px] text-amber-400 mt-0.5">Follow up by {shortDate(inv.dueOn)}</div>
                )}
                {inv.outcome === 'OPEN' ? (
                  <>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Raised at {inv.scoreAtRaise ?? '—'}
                      {inv.scoreSince !== null && (
                        <span className={inv.scoreSince < 0 ? ' text-green-400' : inv.scoreSince > 0 ? ' text-red-400' : ''}>
                          {' '}· {inv.scoreSince > 0 ? '+' : ''}{inv.scoreSince} since
                        </span>
                      )}
                    </div>
                    {closing === inv.id ? (
                      <CloseInterventionForm
                        intervention={inv}
                        studentId={student.id}
                        onClose={() => setClosing(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setClosing(inv.id)}
                        className="text-[11px] text-[#7C3AED] hover:text-[#A78BFA] mt-1 cursor-pointer"
                      >
                        Close this →
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-[12px] text-green-400 mt-0.5">
                    → {inv.outcome.toLowerCase().replace(/_/g, ' ')}
                    {inv.outcomeNote ? `: ${inv.outcomeNote}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Record an intervention */}
        {showLogForm ? (
          <LogInterventionForm key={prefill ? prefill.note : 'blank'} studentId={student.id} initial={prefill} onClose={() => { setShowLogForm(false); setPrefill(undefined); }} />
        ) : (
          <button
            onClick={() => setShowLogForm(true)}
            className="w-full py-2.5 rounded-lg bg-[#7C3AED] text-white text-[14px] font-medium hover:bg-[#6D28D9] transition-colors cursor-pointer"
          >
            + Record an intervention
          </button>
        )}
      </div>
    </div>
  );
}

export default function DropoutPrediction() {
  const { students, distribution, scope, model, isLoading, error } = useAtRiskStudents();
  const snapshot = useTakeSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<RiskLevel | 'all'>('all');
  const [programme, setProgramme] = useState('');

  // Read the open record back out of the live list, so an intervention
  // recorded in the panel is reflected by the panel that recorded it.
  const selectedStudent = students.find(s => s.id === selectedId) ?? null;

  const programmes = [...new Set(students.map(s => s.programme))].sort();

  const filtered = students.filter(s => {
    if (filterLevel !== 'all' && s.riskLevel !== filterLevel) return false;
    if (programme && s.programme !== programme) return false;
    return true;
  });

  async function takeSnapshot() {
    try {
      const r = await snapshot.mutateAsync();
      toast.success(`Snapshot taken — ${r.assessed} students, ${r.critical} critical.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not take a snapshot.');
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0D1B35] text-white overflow-hidden">
      <ToastContainer />

      {/* Disclaimer banner */}
      <div className="bg-amber-900/30 border-b border-amber-700 px-5 py-3 shrink-0">
        <div className="flex items-start gap-2 text-[13px] text-amber-200">
          <span className="text-amber-400 shrink-0 text-[15px]">⚠</span>
          <span>
            <strong>यह एक संकेत है, निर्णय नहीं</strong> — These risk scores are signals to prompt conversation, not automated judgements. Always talk to the student before taking any action. A score can be wrong.
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-72 shrink-0 bg-[#0A1428] border-r border-[#1E3A5F] flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-[#1E3A5F]">
            <div className="text-[14px] font-semibold text-white mb-3">Risk Distribution</div>

            {/* Donut */}
            <div className="flex items-center gap-4 mb-4">
              <DonutRing distribution={distribution} />
              <div className="flex flex-col gap-1.5">
                {(['critical', 'high', 'moderate', 'low'] as RiskLevel[]).map(level => (
                  <div key={level} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: RISK_COLORS[level].dot }} />
                    <span className="text-gray-400 capitalize">{level}:</span>
                    <span className="text-white font-medium">{distribution[level].toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk tiles */}
            <div className="grid grid-cols-2 gap-2">
              {(['critical', 'high', 'moderate', 'low'] as RiskLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setFilterLevel(filterLevel === level ? 'all' : level)}
                  className={`flex flex-col items-center py-2 px-1 rounded-lg border transition-all cursor-pointer ${
                    filterLevel === level
                      ? `${RISK_COLORS[level].bg} ${RISK_COLORS[level].border}`
                      : 'border-[#1E3A5F] hover:border-[#2A4A6F]'
                  }`}
                >
                  <span className={`text-[18px] font-bold ${RISK_COLORS[level].text}`}>{distribution[level].toLocaleString()}</span>
                  <span className="text-[10px] text-gray-400 capitalize">{level}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 flex flex-col gap-3">
            <div className="text-[12px] text-gray-400 font-medium uppercase tracking-wide">Filters</div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500">Programme</label>
              <select
                value={programme}
                onChange={e => setProgramme(e.target.value)}
                className="px-2 py-1.5 rounded bg-[#0D1B35] border border-[#1E3A5F] text-gray-200 text-[12px] outline-none cursor-pointer"
              >
                <option value="">All Programmes</option>
                {programmes.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* The server scopes the list by who is signed in; there is no
                toggle, because a lecturer cannot see past their mentees. */}
            <div className="text-[11px] text-gray-500 border border-[#1E3A5F] rounded-lg p-2 leading-relaxed">
              {scope === 'mentees'
                ? 'Showing the students you mentor. A lecturer cannot open a student they do not.'
                : 'Showing every student on the roll.'}
            </div>

            {scope === 'college' && (
              <button
                onClick={takeSnapshot}
                disabled={snapshot.isPending}
                className="w-full py-2 rounded-lg border border-[#7C3AED] text-[#A78BFA] text-[12px] hover:bg-[#7C3AED]/10 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {snapshot.isPending ? 'Recording…' : 'Record today’s scores'}
              </button>
            )}

            {model && (
              <div className="text-[10px] text-gray-600 leading-relaxed">
                {model.note}
              </div>
            )}
          </div>
        </div>

        {/* Main list */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-[13px] text-gray-400 mb-3">
            {isLoading
              ? 'Scoring…'
              : `Showing ${filtered.length} students · sorted by risk score`}
          </div>
          {error && (
            <div className="text-[13px] text-red-400 mb-3">
              {error instanceof Error ? error.message : 'Could not load the scores.'}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {filtered.map(student => {
              const c = RISK_COLORS[student.riskLevel];
              const topFactors = student.riskFactors.filter(f => f.direction === 'negative').slice(0, 2);

              return (
                <div
                  key={student.id}
                  onClick={() => setSelectedId(student.id)}
                  className={`bg-[#0A1428] border rounded-xl p-4 cursor-pointer transition-all hover:border-[#7C3AED]/50 ${
                    selectedId === student.id ? 'border-[#7C3AED]' : 'border-[#1E3A5F]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C3AED]/60 to-[#4C1D95]/60 flex items-center justify-center text-white font-bold text-[13px] shrink-0">
                        {student.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-white">{student.name}</div>
                        <div className="text-[12px] text-gray-400">{student.programme} · Sem {student.semester}</div>
                        <div className="text-[11px] text-gray-500">{student.enrolmentNo}</div>
                      </div>
                    </div>

                    {/* Risk score */}
                    <div className="text-right shrink-0">
                      <div className={`text-[28px] font-bold leading-none ${c.text}`}>{student.riskScore}</div>
                      <div className="mt-1">
                        <RiskBadge level={student.riskLevel} />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        {student.dataPoints.toLocaleString()} records
                      </div>
                    </div>
                  </div>

                  {/* Risk factor pills */}
                  {topFactors.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {topFactors.map((f, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-red-900/30 border border-red-800 text-red-300 text-[11px]">
                          ↓ {f.factor}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    {student.openInterventions > 0 ? (
                      <span className="text-[11px] text-amber-400">
                        {student.openInterventions} open intervention{student.openInterventions === 1 ? '' : 's'}
                      </span>
                    ) : <span />}
                    <span className="text-[12px] text-[#7C3AED] hover:text-[#A78BFA]">Open →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedStudent && (
        <StudentDetailPanel student={selectedStudent} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

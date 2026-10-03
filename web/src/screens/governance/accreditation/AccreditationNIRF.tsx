import { useState } from 'react';
import { Button, Modal, toast, ToastContainer } from '../../../components/ui';
import {
  useNIRFRegister,
  useUpdateMetric,
  type DataSource,
  type LegacyNIRFParameter as NIRFParameter,
} from '../../../lib/accreditationqueries';
import { inst } from '../../../lib/institution';

const CATEGORIES = [
  'Teaching, Learning & Resources',
  'Research and Professional Practice',
  'Graduation Outcomes',
  'Outreach and Inclusivity',
  'Peer Perception',
];

const CAT_SHORT: Record<string, string> = {
  'Teaching, Learning & Resources': 'TLR',
  'Research and Professional Practice': 'RPC',
  'Graduation Outcomes': 'GO',
  'Outreach and Inclusivity': 'OI',
  'Peer Perception': 'PR',
};

function scoreColor(source: DataSource) {
  if (source === 'live') return 'text-green-700';
  if (source === 'manual') return 'text-amber-700';
  return 'text-red-500';
}

function ParameterCard({
  param,
  onScoreChange,
}: {
  param: NIRFParameter;
  onScoreChange: (id: string, val: number) => void;
}) {
  const [note, setNote] = useState(param.notes ?? '');
  const [showNote, setShowNote] = useState(false);
  const [manualScore, setManualScore] = useState<string>(
    param.achievedScore != null ? String(param.achievedScore) : ''
  );
  const pct = param.achievedScore != null ? (param.achievedScore / param.maxScore) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs font-bold bg-[#16264A] text-white px-2 py-0.5 rounded">
            {param.id}
          </span>
          <p className="mt-1 text-sm font-semibold text-[#16264A]">{param.name}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs text-gray-400">Max</span>
          <p className="font-bold text-gray-600">{param.maxScore}</p>
        </div>
      </div>

      {/* Score display */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                param.source === 'live' ? 'bg-green-500' : param.source === 'manual' ? 'bg-amber-400' : 'bg-gray-300'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="text-sm font-bold w-24 text-right">
          {param.source === 'live' && param.achievedScore != null && (
            <span className="text-green-700">{param.achievedScore} / {param.maxScore}</span>
          )}
          {param.source === 'manual' && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={manualScore}
                min={0}
                max={param.maxScore}
                onChange={e => {
                  setManualScore(e.target.value);
                  onScoreChange(param.id, Number(e.target.value));
                }}
                className="border border-amber-300 rounded px-1.5 py-0.5 text-xs w-14 text-amber-700 bg-amber-50"
                placeholder="0"
              />
              <span className="text-gray-400">/ {param.maxScore}</span>
            </div>
          )}
          {param.source === 'missing' && (
            <span className="text-red-500 text-xs">No data</span>
          )}
        </div>
      </div>

      {/* Source tag */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          {param.source === 'live' && param.liveSourceModule && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
              🟢 Live: {param.liveSourceModule}
            </span>
          )}
          {param.source === 'manual' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              ✏ Manual
            </span>
          )}
          {param.source === 'missing' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              ❌ No data
            </span>
          )}
        </div>
        <button
          onClick={() => setShowNote(n => !n)}
          className="text-xs text-blue-600 underline hover:text-blue-800"
        >
          {showNote ? 'Hide note' : 'Add Supporting Note'}
        </button>
      </div>

      {showNote && (
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          className="w-full border border-gray-200 rounded-lg text-xs p-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#E0952A]"
          placeholder="Add supporting note for this parameter…"
        />
      )}
    </div>
  );
}

function ScoreSummary({ scores }: { scores: Record<string, { achieved: number; max: number }> }) {
  const totalAchieved = Object.values(scores).reduce((s, v) => s + v.achieved, 0);
  const totalMax = Object.values(scores).reduce((s, v) => s + v.max, 0);

  return (
    <div className="bg-[#16264A] text-white rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-sm">Score Summary</h3>
      <div className="text-center py-2">
        <p className="text-3xl font-bold text-[#E0952A]">{totalAchieved.toFixed(1)}</p>
        <p className="text-blue-200 text-xs">out of {totalMax} points</p>
        <p className="text-xs text-blue-300 mt-1">Rank estimate: ~150–200</p>
      </div>
      <div className="space-y-2">
        {Object.entries(scores).map(([cat, { achieved, max }]) => {
          const pct = max > 0 ? (achieved / max) * 100 : 0;
          return (
            <div key={cat}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-blue-200">{CAT_SHORT[cat] ?? cat}</span>
                <span className="text-white font-medium">{achieved.toFixed(1)}/{max}</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div className="bg-[#E0952A] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AccreditationNIRF() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [submitModal, setSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: NIRF_PARAMETERS, totals } = useNIRFRegister();
  const updateMetric = useUpdateMetric();

  // Typed scores live here until they are pushed; the server is the record.
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const paramScores: Record<string, number> = Object.fromEntries(
    NIRF_PARAMETERS.map(p => [p.id, draftScores[p.id] ?? p.achievedScore ?? 0]),
  );

  function handleScoreChange(id: string, val: number) {
    setDraftScores(prev => ({ ...prev, [id]: val }));
  }

  /** Pushes a typed score. The server bounds it by the parameter's maximum. */
  async function saveScore(param: NIRFParameter) {
    const value = draftScores[param.id];
    if (value === undefined) return;
    try {
      await updateMetric.mutateAsync({ id: param.metricId, score: value });
      setDraftScores(prev => {
        const next = { ...prev };
        delete next[param.id];
        return next;
      });
      toast.success(`${param.id} recorded at ${value} of ${param.maxScore}.`);
    } catch (err) {
      // A parameter the system computes refuses a typed score, and says which
      // computation answers it.
      toast.error(err instanceof Error ? err.message : 'Could not record that score.');
    }
  }

  // Build category scores
  const categoryScores: Record<string, { achieved: number; max: number }> = {};
  for (const cat of CATEGORIES) {
    const params = NIRF_PARAMETERS.filter(p => p.category === cat);
    categoryScores[cat] = {
      achieved: params.reduce((s, p) => s + (paramScores[p.id] ?? 0), 0),
      max: params.reduce((s, p) => s + p.maxScore, 0),
    };
  }

  const missing = totals?.unavailable ?? NIRF_PARAMETERS.filter(p => p.source === 'missing').length;
  const filteredParams = NIRF_PARAMETERS.filter(p => p.category === activeCategory);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Push whatever has been typed but not yet recorded.
      for (const param of NIRF_PARAMETERS) {
        if (draftScores[param.id] !== undefined) await saveScore(param);
      }
      setSubmitModal(false);
      // Filing the submission with the ranking agency is a separate return.
      toast.info(
        `Scores recorded. Filing the NIRF return is tracked on the returns calendar.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <ToastContainer />

      {/* Header */}
      <div className="bg-[#16264A] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-white text-xl font-bold">NIRF Rankings — Data Submission</h1>
            <p className="text-blue-200 text-sm mt-0.5">{inst().name} · 2024-25 · University Category</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-bold text-[#E0952A]">47.2 <span className="text-base text-blue-200 font-normal">/ 100</span></p>
              <p className="text-xs text-blue-300">Rank estimate: ~150–200</p>
            </div>
            <Button onClick={() => setSubmitModal(true)}>Submit to NIRF Portal</Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col lg:flex-row gap-5">
        {/* Left: params */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Category tabs */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat
                      ? 'bg-[#16264A] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {CAT_SHORT[cat]}: {cat.slice(0, 22)}{cat.length > 22 ? '…' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-600 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Auto-populated from live platform</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Manual entry required</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300 inline-block" /> No data available</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filteredParams.map(param => (
              <ParameterCard key={param.id} param={param} onScoreChange={handleScoreChange} />
            ))}
          </div>
        </div>

        {/* Right: score summary */}
        <div className="lg:w-56 shrink-0">
          <div className="sticky top-4">
            <ScoreSummary scores={categoryScores} />
          </div>
        </div>
      </div>

      {/* Submit modal */}
      <Modal
        open={submitModal}
        onClose={() => !submitting && setSubmitModal(false)}
        title="Submit NIRF Data"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setSubmitModal(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {submitting ? 'Submitting…' : 'Confirm Submit'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-700">Submit NIRF data for 2024-25?</p>
          {missing > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              ⚠ {missing} parameters are missing scores. Overall score will be lower than potential.
            </div>
          )}
          <p className="text-xs text-gray-500">Current total score: {Object.values(categoryScores).reduce((s, v) => s + v.achieved, 0).toFixed(1)} / 100</p>
        </div>
      </Modal>
    </div>
  );
}

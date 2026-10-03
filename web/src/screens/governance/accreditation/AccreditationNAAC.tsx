import { useState, useRef } from 'react';
import { Button, Modal, toast, ToastContainer, Tabs } from '../../../components/ui';
import {
  useNAACRegister,
  type DataSource,
  type LegacyNAACMetric as NAACMetric,
} from '../../../lib/accreditationqueries';
import { instPlace } from '../../../lib/institution';

/* ── helpers ── */
const borderColor: Record<DataSource, string> = {
  live: 'border-l-green-500',
  manual: 'border-l-amber-400',
  missing: 'border-l-red-500',
};

const rowBg: Record<DataSource, string> = {
  live: 'bg-green-50',
  manual: 'bg-amber-50',
  missing: 'bg-red-50',
};

function SourceTag({ module }: { module: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
      📍 {module}
    </span>
  );
}

function GapReport({ metrics, onJump }: { metrics: NAACMetric[]; onJump: (code: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const missing = metrics.filter(m => m.source === 'missing');
  const evidence = metrics.filter(m => !m.evidenceAttached && m.source !== 'missing');
  const manual = metrics.filter(m => m.source === 'manual' && m.currentValue === null);
  const total = missing.length + evidence.length + manual.length;

  return (
    <div className="border border-red-200 rounded-xl bg-white shadow-sm overflow-hidden w-full md:w-80">
      <div
        className="flex items-center justify-between px-4 py-3 bg-red-50 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className="font-semibold text-red-700 text-sm">Data Gap Report — {total} metrics need attention</span>
        <span className="text-red-500 text-lg">{collapsed ? '▼' : '▲'}</span>
      </div>
      {!collapsed && (
        <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
          {missing.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase mb-1">{missing.length} Missing</p>
              {missing.map(m => (
                <button key={m.code} onClick={() => onJump(m.code)}
                  className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-red-100 text-red-700">
                  {m.code} — {m.title}
                </button>
              ))}
            </div>
          )}
          {evidence.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase mb-1">{evidence.length} Need Evidence</p>
              {evidence.map(m => (
                <button key={m.code} onClick={() => onJump(m.code)}
                  className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-amber-100 text-amber-700">
                  {m.code} — {m.title}
                </button>
              ))}
            </div>
          )}
          {manual.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase mb-1">{manual.length} Need Manual Input</p>
              {manual.map(m => (
                <button key={m.code} onClick={() => onJump(m.code)}
                  className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-100 text-blue-700">
                  {m.code} — {m.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricRow({ metric, id }: { metric: NAACMetric; id: string }) {
  const [overrideValue, setOverrideValue] = useState(metric.currentValue ?? '');
  const [editing, setEditing] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [evidenceAttached, setEvidenceAttached] = useState(metric.evidenceAttached);
  const [fileCount, setFileCount] = useState(metric.evidenceAttached ? 1 : 0);

  return (
    <div
      id={id}
      className={`border-l-4 ${borderColor[metric.source]} ${rowBg[metric.source]} rounded-r-xl px-4 py-3 space-y-2 scroll-mt-24`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-[#16264A] bg-white border border-gray-200 px-2 py-0.5 rounded">
              {metric.code}
            </span>
            <span className="text-sm font-semibold text-[#16264A]">{metric.title}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{metric.description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {metric.source === 'live' && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-blue-600 underline hover:text-blue-800"
            >
              Override
            </button>
          )}
          {metric.source !== 'missing' && (
            <label className="cursor-pointer">
              <input type="file" className="hidden" onChange={() => { setEvidenceAttached(true); setFileCount(c => c + 1); }} />
              <span className={`text-xs px-2 py-1 rounded border ${evidenceAttached ? 'bg-green-100 border-green-400 text-green-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {evidenceAttached ? `✅ ${fileCount} file${fileCount > 1 ? 's' : ''} attached` : '📎 Attach Evidence'}
              </span>
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 text-sm">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Target</span>
          <p className="font-medium text-gray-700">{metric.targetValue}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Current</span>
          {metric.source === 'live' && !editing && (
            <p className="font-bold text-green-700">{metric.currentValue}</p>
          )}
          {metric.source === 'live' && editing && (
            <div className="flex flex-col gap-1">
              <input
                value={overrideValue}
                onChange={e => setOverrideValue(e.target.value)}
                className="border rounded px-2 py-0.5 text-sm w-40"
                placeholder="Override value"
              />
              <input
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                className="border rounded px-2 py-0.5 text-xs w-40"
                placeholder="Reason for override"
              />
              <div className="flex gap-1">
                <button onClick={() => setEditing(false)} className="text-xs text-green-700 font-semibold">Save</button>
                <button onClick={() => { setEditing(false); setOverrideValue(metric.currentValue ?? ''); }} className="text-xs text-gray-500">Cancel</button>
              </div>
            </div>
          )}
          {metric.source === 'manual' && (
            <input
              value={overrideValue}
              onChange={e => setOverrideValue(e.target.value)}
              className="border border-amber-300 rounded px-2 py-0.5 text-sm w-40 bg-white"
              placeholder="Enter value…"
            />
          )}
          {metric.source === 'missing' && (
            <p className="text-red-500 text-xs">❌ No data — source module may not have records yet</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {metric.source === 'live' && metric.liveSourceModule && (
          <SourceTag module={metric.liveSourceModule} />
        )}
        {metric.source === 'manual' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
            ✏ Manual entry required
          </span>
        )}
        {metric.source === 'missing' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            ❌ No data — source module may not have relevant records yet
          </span>
        )}
        {metric.remarks && (
          <span className="text-xs text-gray-500 italic">{metric.remarks}</span>
        )}
      </div>
    </div>
  );
}

export default function AccreditationNAAC() {
  const { data: NAAC_METRICS, criteria: NAAC_CRITERIA, totals } = useNAACRegister();

  const [activeCriteria, setActiveCriteria] = useState<number | 'all'>('all');
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const metricRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const populated = totals?.answered ?? NAAC_METRICS.filter(m => m.answered).length;
  const total = totals?.metrics ?? NAAC_METRICS.length;
  const pct = Math.round(totals?.readiness ?? (total === 0 ? 0 : (populated / total) * 100));

  const filtered = activeCriteria === 'all'
    ? NAAC_METRICS
    : NAAC_METRICS.filter(m => m.criteria === activeCriteria);

  function scrollToMetric(code: string) {
    const el = document.getElementById(`metric-${code}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleExport() {
    setExportModal(false);
    // Generating the report itself is not wired; what the register can say is
    // exactly how much of it would be answerable today.
    toast.info(
      `${populated} of ${total} metrics are answerable (${pct}%). ` +
        `Generating the SSR document is not wired yet.`,
    );
  }

  const criteriaTabItems = [
    { id: 'all', label: 'All' },
    ...NAAC_CRITERIA.map((t, i) => ({ id: String(i + 1), label: `C${i + 1}: ${t.slice(0, 18)}…` })),
  ];

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <ToastContainer />

      {/* Header */}
      <div className="bg-[#16264A] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-white text-xl font-bold">NAAC SSR — Self-Study Report</h1>
            <p className="text-blue-200 text-sm mt-0.5">{instPlace()} · 2024-25</p>
          </div>
          <Button onClick={() => setExportModal(true)}>
            Generate SSR Draft
          </Button>
        </div>
      </div>

      {/* Status banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-semibold text-[#16264A]">NAAC SSR 2024-25 — Preparation in Progress</span>
          <span className="text-gray-600">Submission deadline: <strong>31-March-2025</strong></span>
          <span className="text-gray-600">
            Overall completion:{' '}
            <strong className="text-[#E0952A]">{pct}% ({populated} of {total} metrics populated)</strong>
          </span>
        </div>
        <div className="w-48 bg-gray-200 rounded-full h-2">
          <div className="bg-[#E0952A] h-2 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col md:flex-row gap-5">
        {/* Left: main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Criteria filter tabs */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {criteriaTabItems.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveCriteria(tab.id === 'all' ? 'all' : Number(tab.id))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    (tab.id === 'all' && activeCriteria === 'all') ||
                    (tab.id !== 'all' && activeCriteria === Number(tab.id))
                      ? 'bg-[#16264A] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-600 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Auto-populated from live platform</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Manual entry required</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> No data available</span>
          </div>

          {/* Metrics */}
          <div className="space-y-3">
            {filtered.map(metric => (
              <div key={metric.code} id={`metric-${metric.code}`}>
                <MetricRow metric={metric} id={`metric-inner-${metric.code}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Right: gap report */}
        <div className="md:w-80 shrink-0">
          <GapReport metrics={NAAC_METRICS} onJump={scrollToMetric} />
        </div>
      </div>

      {/* Export modal */}
      <Modal
        open={exportModal}
        onClose={() => !exporting && setExportModal(false)}
        title="Generate SSR Draft"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setExportModal(false)} disabled={exporting}>Cancel</Button>
            <Button onClick={handleExport} loading={exporting}>
              {exporting ? 'Compiling…' : 'Generate'}
            </Button>
          </div>
        }
      >
        {exporting ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-[#E0952A] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-600">Compiling data from {populated} populated metrics…</p>
            <p className="text-xs text-gray-400">Generating Word + PDF formats</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-700">
              This will compile all {populated} populated metrics into an SSR draft document.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              ⚠ {total - populated} metrics still require data. They will be marked as pending in the draft.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

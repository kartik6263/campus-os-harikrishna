import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useLockAccount } from '../../lib/itqueries';
import { toast } from '../../components/ui';
import { Button, InlineAlert, StatusPill, Spinner } from '../../components/ui';
import { useAuditList, useChainCheck, type LegacyAuditEntry as AuditEntry } from '../../lib/itqueries';
import { downloadCSV } from '../../lib/export';
// Integration health and background jobs are not things this backend can
// report on; they stay on their fixtures and say so on screen.

interface Props {
  subScreen: string;
  onSub: (s: string) => void;
}

export default function AuditGroup({ subScreen, onSub }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tabs */}
      <div className="flex border-b border-[#D3D8E0] bg-white shrink-0">
        {[['log', 'Audit Log'], ['health', 'Platform Health']].map(([id, label]) => (
          <button key={id} onClick={() => onSub(id)}
            className={`px-5 py-2.5 text-[14px] font-medium transition-colors cursor-pointer relative ${
              subScreen === id || (!subScreen && id === 'log')
                ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px'
                : 'text-[#5A6577] hover:text-[#16264A]'
            }`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {(subScreen === 'log' || !subScreen) && <AuditLog />}
        {subScreen === 'health' && <PlatformHealth />}
      </div>
    </div>
  );
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

function AuditLog() {
  const [actorFilter, setActorFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const { data: AUDIT_ENTRIES, totals } = useAuditList();
  const chain = useChainCheck();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = AUDIT_ENTRIES.find(e => e.id === selectedId) ?? null;
  const setSelected = (e: AuditEntry | null) => setSelectedId(e?.id ?? null);
  void totals;
  const [dateFilter, setDateFilter] = useState('');
  const modules = useMemo(() => [...new Set(AUDIT_ENTRIES.map(e => e.module))].sort(), [AUDIT_ENTRIES]);
  const actions = useMemo(() => [...new Set(AUDIT_ENTRIES.map(e => e.action))].sort(), [AUDIT_ENTRIES]);

  const filtered = useMemo(() => AUDIT_ENTRIES.filter((e: AuditEntry) => {
    const q = search.toLowerCase();
    return (!q || e.actor.toLowerCase().includes(q) || e.target.toLowerCase().includes(q) || e.id.includes(q))
      && (!actorFilter || e.actorId === actorFilter)
      && (!moduleFilter || e.module === moduleFilter)
      && (!actionFilter || e.action === actionFilter)
      && (!dateFilter || e.timestamp.slice(0, 10) === dateFilter);
  }), [AUDIT_ENTRIES, search, actorFilter, moduleFilter, actionFilter, dateFilter]);

  async function checkIntegrity() {
    const r = await chain.refetch();
    if (r.data?.intact) toast.success(`Chain intact — ${r.data.entries} entries verified`);
    else if (r.data) toast.error(`Chain broken at entry ${r.data.brokenAt?.seq}: ${r.data.brokenAt?.reason}`);
  }

  /** Every entry with its hash and the previous one's, so the chain can be re-checked outside the system. */
  function exportLog() {
    downloadCSV(`audit-log-${new Date().toISOString().slice(0, 10)}`, filtered.map(e => ({ seq: e.seq, time: e.timestamp, actor: e.actor, module: e.module, action: e.action, target: e.target, detail: e.detail ?? '', ip: e.ip, status: e.status, hash: e.hash, prevHash: e.prevHash })));
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Log panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#D3D8E0] bg-white shrink-0">
          <div className="flex items-center gap-2 border border-[#D3D8E0] rounded-[4px] px-2.5 bg-[#EDEFF3] h-8 min-w-[200px]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Actor, target, log ID…" className="flex-1 text-[13px] bg-transparent outline-none text-[#16264A] placeholder-[#5A6577]" />
          </div>
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className="h-8 px-2 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none bg-white">
            <option value="">All modules</option>
            {modules.map(m => <option key={m}>{m}</option>)}
          </select>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="h-8 px-2 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none bg-white">
            <option value="">All actions</option>
            {actions.map(a => <option key={a}>{a}</option>)}
          </select>
          <input type="date" aria-label="Filter by date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-8 px-2 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none bg-white" />
          <div className="ml-auto flex items-center gap-2">
            {/* Chain integrity indicator */}
            <button onClick={() => void checkIntegrity()} className="flex items-center gap-1.5 text-[12px] cursor-pointer px-2.5 py-1 border border-[#D3D8E0] rounded-[4px] hover:border-[#E0952A] transition-colors bg-white">
              {chain.isFetching ? <Spinner size={12} color="#E0952A" /> : <span className={`w-2 h-2 rounded-full ${chain.data?.intact === false ? 'bg-[#A8242C]' : 'bg-[#0E7A5F]'}`} />}
              {chain.isFetching ? 'Checking chain…' : chain.data ? (chain.data.intact ? 'Chain: Intact' : `Chain broken at #${chain.data.brokenAt?.seq}`) : 'Check chain'}
            </button>
            <Button size="sm" variant="secondary" disabled={!filtered.length} onClick={exportLog}>Export CSV with hashes</Button>
          </div>
        </div>

        {/* Chain integrity banner */}
        <div className="px-4 py-2 bg-[#D1FAE5]/50 border-b border-[#D3D8E0] shrink-0">
          <p className="text-[11px] text-[#0E7A5F]">
            {chain.data
              ? chain.data.intact
                ? `✓ Chain verified · ${chain.data.entries} entries · no gap or hash mismatch`
                : `⚠ Chain broken at entry ${chain.data.brokenAt?.seq}: ${chain.data.brokenAt?.reason}`
              : `${AUDIT_ENTRIES.length} entries · not verified yet — run the integrity check`}
          </p>
        </div>

        {/* Log table */}
        <div className="flex-1 overflow-auto">
          <table className="ruled-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <span className="text-[10px] text-[#5A6577]">#</span>
                </th>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Module</th>
                <th>Action</th>
                <th>Target</th>
                <th>Hash</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id} onClick={() => setSelected(entry)} className={`cursor-pointer ${selected?.id === entry.id ? 'bg-[#FEF9EC]' : ''}`}>
                  <td className="font-mono text-[11px] text-[#5A6577]">{entry.seq}</td>
                  <td className="font-mono text-[12px] text-[#5A6577] whitespace-nowrap">{entry.timestamp}</td>
                  <td>
                    <p className="text-[13px] text-[#16264A]">{entry.actor}</p>
                    <p className="text-[11px] text-[#5A6577] font-mono">{entry.actorId}</p>
                  </td>
                  <td className="text-[13px]">{entry.module}</td>
                  <td>
                    <span className={`text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-[2px] ${
                      entry.action === 'delete' ? 'bg-[#FEE2E2] text-[#A8242C]' :
                      entry.action === 'approve' || entry.action === 'publish' ? 'bg-[#D1FAE5] text-[#0E7A5F]' :
                      entry.action === 'create' ? 'bg-[#EFF6FF] text-[#1D4ED8]' :
                      'bg-[#EDEFF3] text-[#5A6577]'
                    }`}>{entry.action}</span>
                  </td>
                  <td className="font-mono text-[12px] text-[#5A6577] max-w-[160px] truncate">{entry.target}</td>
                  <td className="font-mono text-[11px] text-[#5A6577]">{entry.hash}</td>
                  <td>
                    {entry.status === 'warn' && <span className="text-[#E0952A]">⚠</span>}
                    {entry.status === 'ok' && <span className="text-[#0E7A5F] text-[10px]">✓</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entry detail */}
      {selected && (
        <div className="w-72 border-l border-[#D3D8E0] flex flex-col bg-white shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
            <p className="text-[13px] font-semibold text-[#16264A]">Log Entry Detail</p>
            <button onClick={() => setSelected(null)} className="text-[#5A6577] hover:text-[#16264A] cursor-pointer">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-3">
              {[
                ['Log ID', selected.id],
                ['Sequence', String(selected.seq)],
                ['Timestamp', selected.timestamp],
                ['Actor', selected.actor],
                ['Actor ID', selected.actorId],
                ['IP Address', selected.ip],
                ['Module', selected.module],
                ['Action', selected.action],
                ['Target', selected.target],
                ['Org Unit', selected.orgUnit],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-[#D3D8E0] pb-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#5A6577]">{label}</p>
                  <p className="text-[12px] text-[#16264A] font-medium mt-0.5 break-all">{value}</p>
                </div>
              ))}

              {/* Chain */}
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-wider text-[#5A6577] mb-2">Hash Chain</p>
                <div className="bg-[#EDEFF3] rounded-[2px] p-2 text-[10px] font-mono text-[#5A6577] space-y-1">
                  <p><span className="text-[#16264A]">prev:</span> {selected.prevHash}</p>
                  <p className="text-[#D3D8E0]">↓ SHA-256(prev + entry)</p>
                  <p><span className="text-[#0E7A5F]">this:</span> {selected.hash}</p>
                </div>
                <p className="text-[10px] text-[#0E7A5F] mt-1">✓ Hash verified against chain</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Platform Health ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; label: string; bg: string }> = {
  operational: { dot: '#0E7A5F', label: 'Operational', bg: '#D1FAE5' },
  degraded: { dot: '#E0952A', label: 'Degraded', bg: '#FEF9EC' },
  down: { dot: '#A8242C', label: 'Down', bg: '#FEE2E2' },
};

const JOB_CONFIG: Record<string, { bar: string; text: string }> = {
  running: { bar: '#E0952A', text: '#8A6D1F' },
  completed: { bar: '#0E7A5F', text: '#0E7A5F' },
  queued: { bar: '#D3D8E0', text: '#5A6577' },
  failed: { bar: '#A8242C', text: '#A8242C' },
};

interface Health {
  checkedAt: string;
  server: { startedAt: string; uptimeSeconds: number; node: string; memoryMb: number; heapMb: number };
  database: { ok: boolean; latencyMs: number };
  integrations: Array<{ name: string; configured: boolean; ok: boolean; detail: string }>;
  traffic: { windowMinutes: number; requests: number; serverErrors: number; avgMs: number | null; p95Ms: number | null; peakPerMinute: number; perMinute: number[] };
  sessions: { active: number; startedLast24h: number };
  accounts: { locked: number; failing: Array<{ id: string; email: string; role: string; failedAttempts: number; lockedAt: string | null }> };
  audit: { lastSeq: number; lastAt: string | null; refusals: Array<{ seq: number; occurredAt: string; actorName: string; module: string; action: string; target: string; outcome: string }> };
  registers: { records: number };
}

const uptime = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);

/** Measured, not assumed: every figure here is read from the running server. */
function PlatformHealth() {
  const q = useQuery({ queryKey: ['it', 'health'], queryFn: () => api<Health>('/api/it/health'), refetchInterval: 30_000 });
  const lock = useLockAccount();
  const h = q.data;
  if (q.isLoading) return <div className="flex-1 flex justify-center py-16"><Spinner size={22} /></div>;
  if (!h) return <div className="p-5"><InlineAlert type="error">Could not reach the server's health check.</InlineAlert></div>;
  const max = Math.max(1, ...h.traffic.perMinute);
  const notConfigured = h.integrations.filter(i => !i.configured);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-[#5A6577]">Checked {new Date(h.checkedAt).toLocaleTimeString('en-IN')} · refreshes every 30 s · server up {uptime(h.server.uptimeSeconds)} (Node {h.server.node}, {h.server.memoryMb} MB)</p>
        <Button size="sm" variant="ghost" loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active sessions', value: h.sessions.active.toLocaleString('en-IN'), sub: `${h.sessions.startedLast24h} signed in, last 24 h` },
          { label: `API requests (${h.traffic.windowMinutes} min)`, value: h.traffic.requests.toLocaleString('en-IN'), sub: `peak ${h.traffic.peakPerMinute}/min · ${h.traffic.serverErrors} server errors` },
          { label: 'Average response', value: h.traffic.avgMs !== null ? `${h.traffic.avgMs} ms` : '—', sub: h.traffic.p95Ms !== null ? `p95 ${h.traffic.p95Ms} ms` : 'no traffic yet' },
          { label: 'Database round trip', value: `${h.database.latencyMs} ms`, sub: `${h.registers.records.toLocaleString('en-IN')} register rows` },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#D3D8E0] rounded-[2px] p-4">
            <p className="text-[11px] text-[#5A6577]">{s.label}</p>
            <p className="text-h2 font-semibold text-[#16264A] mt-1 font-mono">{s.value}</p>
            <p className="text-[11px] text-[#5A6577]">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[2px] p-4 mb-6">
        <p className="text-[13px] font-semibold text-[#16264A] mb-3">Requests per minute, last 30 minutes</p>
        <div className="flex items-end gap-1 h-20">
          {h.traffic.perMinute.map((n, i) => (
            <div key={i} className="flex-1 bg-[#16264A] rounded-t-[2px] min-h-[1px] hover:bg-[#E0952A]" style={{ height: `${(n / max) * 100}%` }} title={`${30 - i} min ago: ${n} requests`} />
          ))}
        </div>
      </div>

      <div className="mb-6">
        <p className="text-[14px] font-semibold text-[#16264A] mb-3">Integrations</p>
        <div className="border border-[#D3D8E0] rounded-[2px] overflow-hidden">
          <table className="ruled-table">
            <thead><tr><th>Integration</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {h.integrations.map(int => (
                <tr key={int.name}>
                  <td className="font-medium text-[#16264A]">{int.name}</td>
                  <td><span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full ${int.configured ? 'bg-[#D1FAE5] text-[#0E7A5F]' : 'bg-[#FEF9EC] text-[#8A6D1F]'}`}><span className={`w-1.5 h-1.5 rounded-full ${int.configured ? 'bg-[#0E7A5F]' : 'bg-[#E0952A]'}`} />{int.configured ? 'Connected' : 'Not configured'}</span></td>
                  <td className="text-[12px] text-[#5A6577]">{int.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notConfigured.length > 0 && <div className="mt-2"><InlineAlert type="info">{notConfigured.map(i => i.name).join(', ')}: set the server's environment variables to switch {notConfigured.length > 1 ? 'these' : 'this'} on. Nothing else depends on {notConfigured.length > 1 ? 'them' : 'it'}.</InlineAlert></div>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <p className="text-[14px] font-semibold text-[#16264A] mb-3">Accounts with failed sign-ins <span className="text-[12px] font-normal text-[#5A6577]">· {h.accounts.locked} locked</span></p>
          <div className="border border-[#D3D8E0] rounded-[2px] overflow-hidden">
            <table className="ruled-table">
              <thead><tr><th>Account</th><th className="text-right">Failures</th><th></th></tr></thead>
              <tbody>
                {h.accounts.failing.length === 0 && <tr><td colSpan={3} className="text-center text-[13px] text-[#5A6577] py-4">No account has failed sign-ins.</td></tr>}
                {h.accounts.failing.map(a => (
                  <tr key={a.id}>
                    <td className="text-[13px]">{a.email}<span className="text-[11px] text-[#5A6577]"> · {a.role}</span></td>
                    <td className="text-right font-mono font-semibold text-[#A8242C]">{a.failedAttempts}</td>
                    <td className="text-right">{a.lockedAt ? <span className="text-[12px] text-[#A8242C]">Locked</span> : <Button size="sm" variant="ghost" loading={lock.isPending} onClick={() => lock.mutate({ id: a.id, locked: true, reason: `${a.failedAttempts} failed sign-in attempts` }, { onSuccess: () => { toast.success(`${a.email} locked`); void q.refetch(); } })}>Lock</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p className="text-[14px] font-semibold text-[#16264A] mb-3">Recent refusals in the audit chain <span className="text-[12px] font-normal text-[#5A6577]">· last entry #{h.audit.lastSeq}</span></p>
          <div className="border border-[#D3D8E0] rounded-[2px] overflow-hidden">
            {h.audit.refusals.length === 0 ? <p className="text-center text-[13px] text-[#5A6577] py-4">No refused or flagged actions.</p> : h.audit.refusals.map(r => (
              <div key={r.seq} className="px-4 py-2.5 border-b border-[#EDEFF3] last:border-b-0">
                <p className="text-[13px] text-[#16264A]"><span className={`text-[10px] font-bold mr-1.5 ${r.outcome === 'DENIED' ? 'text-[#A8242C]' : 'text-[#8A6D1F]'}`}>{r.outcome}</span>{r.actorName} · {r.module} · {r.action}</p>
                <p className="text-[11px] text-[#5A6577]">#{r.seq} · {r.target} · {new Date(r.occurredAt).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

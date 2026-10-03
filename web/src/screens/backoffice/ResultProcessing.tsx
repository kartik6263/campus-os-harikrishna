import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, Toggle, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth, displayName } from '../../lib/auth';
import { downloadCSV, downloadPdf } from '../../lib/export';
import { inst } from '../../lib/institution';
import { useAdvanceSession, useExamSessions, useProcessResults } from '../../lib/examqueries';
import { useCollection } from '../../lib/records';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/**
 * Result processing for a sitting: is evaluation complete, compute the results
 * (with the grace rule), read the provisional list, record the controller's,
 * committee's and Vice-Chancellor's approvals, publish, and print the gazette.
 * Every figure comes from the examination records.
 */

interface Paper { id: string; code: string; name: string; scripts: number; settled: number; flagged: number }
interface ResultRow { id: string; rollNo: string; enrolmentNo: string; name: string; programme: string; college: string; semester: number; sgpa: number; cgpa: number; outcome: 'PASS' | 'FAIL' | 'WITHHELD'; division: string | null; graceMarks: number; published: boolean; subjects: Array<{ code: string; name: string; internal: number; external: number; total: number; grade: string; graceGiven: number; passed: boolean }> }
interface Approval { id: string; controller?: { by: string; at: string; note?: string }; committee?: { date: string; minutes: string; by: string; at: string }; vc?: { name: string; ref: string; by: string; at: string } }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function ResultProcessing({ onModule }: Props) {
  const sessions = useExamSessions();
  const [sessionId, setSessionId] = useState('');
  const [tab, setTab] = useState('computation');
  const s = (sessions.data ?? []).find(x => x.id === sessionId) ?? (sessions.data ?? []).find(x => x.status === 'RESULT_PROCESSING') ?? sessions.data?.[0];
  const detail = useQuery({ queryKey: ['exam', 'session', s?.id], enabled: !!s, queryFn: () => api<{ papers: Paper[] }>(`/api/exam/sessions/${s!.id}`) });
  const results = useQuery({ queryKey: ['exam', 'results', s?.id], enabled: !!s, queryFn: () => api<{ published: boolean; totals: { total: number; passed: number; graced: number }; results: ResultRow[] }>(`/api/exam/sessions/${s!.id}/results`) });
  const approvals = useCollection<Approval>('acad:result-approvals', []);
  const approval = approvals.items.find(a => a.id === s?.id);

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0]">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-1"><button onClick={() => onModule('')} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">Back Office</button><span className="text-[#D3D8E0]">/</span><span className="text-[13px] text-[#16264A] font-medium">Result Processing</span></div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div><h1 className="text-[22px] font-bold text-[#16264A]">Result Processing</h1>{s && <p className="text-[13px] text-[#5A6577]">{s.name} · {s.status.toLowerCase().replace(/_/g, ' ')} · {results.data?.totals.total ?? 0} results</p>}</div>
            <Select value={s?.id ?? ''} onChange={e => setSessionId(e.target.value)} className="w-80">{(sessions.data ?? []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          </div>
          <Tabs tabs={[{ id: 'computation', label: 'Computation' }, { id: 'results', label: 'Provisional Results' }, { id: 'approval', label: 'Approvals & Publication' }, { id: 'gazette', label: 'Gazette' }]} activeId={tab} onChange={setTab} />
        </div>
      </div>
      <div className="p-6">
        {sessions.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : !s ? <EmptyState title="No examination sessions" /> : (
          <>
            {tab === 'computation' && <Computation sessionId={s.id} status={s.status} papers={detail.data?.papers ?? []} loading={detail.isLoading} totals={results.data?.totals} />}
            {tab === 'results' && <Provisional q={results} />}
            {tab === 'approval' && <Approvals sessionId={s.id} status={s.status} approvals={approvals} approval={approval} hasResults={(results.data?.totals.total ?? 0) > 0} />}
            {tab === 'gazette' && <Gazette name={s.name} code={s.code} q={results} approval={approval} />}
          </>
        )}
      </div>
    </div>
  );
}

function Computation({ sessionId, status, papers, loading, totals }: { sessionId: string; status: string; papers: Paper[]; loading: boolean; totals?: { total: number; passed: number; graced: number } }) {
  const process = useProcessResults();
  const [grace, setGrace] = useState(true);
  const [last, setLast] = useState<{ processed: number; passed: number; failed: number; graced: number; passPercent: number } | null>(null);
  const unsettled = papers.reduce((n, p) => n + (p.scripts - p.settled), 0);
  const flagged = papers.reduce((n, p) => n + p.flagged, 0);
  const checks: Array<[string, boolean, string]> = [
    ['Papers scheduled and evaluated', papers.length > 0 && papers.every(p => p.scripts > 0), `${papers.length} paper(s)`],
    ['Every script has a final mark', unsettled === 0, unsettled ? `${unsettled} script(s) unsettled` : 'All settled'],
    ['No script awaiting moderation', flagged === 0, flagged ? `${flagged} flagged` : 'None'],
    ['Session is in result processing', status === 'RESULT_PROCESSING', status.toLowerCase().replace(/_/g, ' ')],
  ];
  const ready = checks.every(c => c[1]);

  async function run() {
    try {
      const r = await process.mutateAsync({ sessionId, applyGrace: grace });
      setLast(r);
      toast.success(`Results computed for ${r.processed} students — ${r.passPercent}% pass. Under embargo until published.`);
    } catch (e) { toast.error(errText(e)); }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">Readiness</p>
        {checks.map(([label, ok, detail]) => <div key={label} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#EDEFF3] last:border-0 text-[13px]"><span className={ok ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}>{ok ? '✓' : '✗'}</span><span className="flex-1 text-[#16264A]">{label}</span><span className="text-[#5A6577]">{detail}</span></div>)}
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-3">
        <Toggle on={grace} onChange={setGrace} label="Apply grace marks" />
        <p className="text-[12px] text-[#5A6577]">Grace rule: a candidate short of a pass by 4 marks or less gets up to 5 in a subject and 10 in all. Processing replaces any earlier computation for this sitting, so it can be re-run after a late moderation.</p>
        <Button loading={process.isPending} disabled={!ready} onClick={() => void run()}>{totals?.total ? 'Re-compute results' : 'Compute results'}</Button>
      </div>
      {(last || (totals && totals.total > 0)) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(last ? [['Processed', last.processed], ['Passed', last.passed], ['Failed', last.failed], ['Passed with grace', last.graced]] : [['Results', totals!.total], ['Passed', totals!.passed], ['Failed', totals!.total - totals!.passed], ['With grace', totals!.graced]]).map(([l, v]) => (
            <div key={String(l)} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4"><p className="text-[22px] font-semibold text-[#16264A] tabular-nums">{Number(v).toLocaleString('en-IN')}</p><p className="text-[12px] text-[#5A6577]">{l}</p></div>
          ))}
        </div>
      )}
    </div>
  );
}

function Provisional({ q }: { q: ReturnType<typeof useQuery<{ published: boolean; totals: { total: number; passed: number; graced: number }; results: ResultRow[] }>> }) {
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ResultRow | null>(null);
  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  const s = search.trim().toLowerCase();
  const rows = (q.data?.results ?? []).filter(r => (!outcome || r.outcome === outcome) && (!s || r.name.toLowerCase().includes(s) || r.rollNo.toLowerCase().includes(s)));
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <Input placeholder="Search name or roll no." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={outcome} onChange={e => setOutcome(e.target.value)} className="w-36"><option value="">All</option><option value="PASS">Pass</option><option value="FAIL">Fail</option></Select>
        {q.data?.published ? <span className="text-[12px] font-semibold text-[#0E7A5F]">Published</span> : <span className="text-[12px] font-semibold text-[#8A6D1F]">Under embargo</span>}
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('provisional-results', rows.map(r => ({ roll: r.rollNo, enrolment: r.enrolmentNo, name: r.name, programme: r.programme, semester: r.semester, sgpa: r.sgpa, cgpa: r.cgpa, outcome: r.outcome, division: r.division ?? '', grace: r.graceMarks })))}>Export CSV</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No results computed yet" /></div> : (
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-[#EDEFF3]"><tr>{['Roll', 'Name', 'Programme', 'SGPA', 'CGPA', 'Grace', 'Result'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => <tr key={r.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA] cursor-pointer tabular-nums" onClick={() => setOpen(r)}><td className="px-4 py-2 font-mono text-[12px] text-[#5A6577]">{r.rollNo}</td><td className="px-4 py-2 text-[#16264A]">{r.name}</td><td className="px-4 py-2 text-[#5A6577]">{r.programme} {r.semester}</td><td className="px-4 py-2">{r.sgpa.toFixed(2)}</td><td className="px-4 py-2">{r.cgpa.toFixed(2)}</td><td className="px-4 py-2">{r.graceMarks || '—'}</td><td className={`px-4 py-2 font-semibold ${r.outcome === 'PASS' ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>{r.outcome}{r.division ? ` · ${r.division}` : ''}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.name} — ${open.rollNo}` : ''} width="620px" footer={<Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
        {open && <table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] text-[#5A6577] uppercase"><th className="py-1">Paper</th><th>Int</th><th>Ext</th><th>Grace</th><th>Total</th><th>Grade</th></tr></thead><tbody>{open.subjects.map(x => <tr key={x.code} className="border-t border-[#EDEFF3] tabular-nums"><td className="py-1.5 text-[#16264A]">{x.code} {x.name}</td><td>{x.internal}</td><td>{x.external}</td><td>{x.graceGiven || ''}</td><td className="font-semibold">{x.total}</td><td className={x.passed ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}>{x.grade}</td></tr>)}</tbody></table>}
      </Modal>
    </div>
  );
}

function Approvals({ sessionId, status, approvals, approval, hasResults }: { sessionId: string; status: string; approvals: ReturnType<typeof useCollection<Approval>>; approval?: Approval; hasResults: boolean }) {
  const { user } = useAuth();
  const me = displayName(user) || 'Controller';
  const advance = useAdvanceSession();
  const [form, setForm] = useState({ note: '', date: new Date().toISOString().slice(0, 10), minutes: '', vcName: '', vcRef: '' });
  const put = (patch: Partial<Approval>) => (approval ? approvals.update(sessionId, patch) : approvals.add({ id: sessionId, ...patch }));
  const now = () => new Date().toISOString();
  const allApproved = !!(approval?.controller && approval.committee && approval.vc);
  const published = status === 'RESULT_PUBLISHED';

  async function publish() {
    if (!window.confirm('Publish the results? Every student sees theirs at once, and it cannot be undone.')) return;
    try { await advance.mutateAsync({ id: sessionId, status: 'RESULT_PUBLISHED' }); toast.success('Results published'); } catch (e) { toast.error(errText(e)); }
  }

  const Step = ({ n, title, done, children }: { n: number; title: string; done?: string; children: React.ReactNode }) => (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
      <div className="flex items-center gap-3 mb-2"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${done ? 'bg-[#0E7A5F] text-white' : 'bg-[#EDEFF3] text-[#5A6577]'}`}>{done ? '✓' : n}</span><p className="text-[14px] font-semibold text-[#16264A]">{title}</p></div>
      {done ? <p className="text-[13px] text-[#0E7A5F] ml-9">{done}</p> : <div className="ml-9">{children}</div>}
    </div>
  );

  if (!hasResults) return <InlineAlert type="info">Compute the results first.</InlineAlert>;
  return (
    <div className="space-y-3 max-w-3xl">
      <Step n={1} title="Controller of Examinations — review and certify" done={approval?.controller && `Certified by ${approval.controller.by} on ${when(approval.controller.at)}${approval.controller.note ? ` — ${approval.controller.note}` : ''}`}>
        <div className="flex gap-2 items-end"><Input label="Note (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="flex-1" /><Button size="sm" onClick={() => { put({ controller: { by: me, at: now(), note: form.note.trim() || undefined } }); toast.success('Certified'); }}>Certify</Button></div>
      </Step>
      <Step n={2} title="Results Committee" done={approval?.committee && `Approved on ${approval.committee.date}, minutes ${approval.committee.minutes} (recorded by ${approval.committee.by})`}>
        {!approval?.controller ? <p className="text-[12px] text-[#5A6577]">After the controller certifies.</p> : <div className="flex gap-2 items-end"><Input label="Meeting date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /><Input label="Minutes ref." value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value })} /><Button size="sm" disabled={!form.minutes.trim()} onClick={() => { put({ committee: { date: form.date, minutes: form.minutes.trim(), by: me, at: now() } }); toast.success('Committee approval recorded'); }}>Record</Button></div>}
      </Step>
      <Step n={3} title="Vice-Chancellor's sign-off" done={approval?.vc && `Signed by ${approval.vc.name}, ref. ${approval.vc.ref}`}>
        {!approval?.committee ? <p className="text-[12px] text-[#5A6577]">After the committee approves.</p> : <div className="flex gap-2 items-end"><Input label="Name" value={form.vcName} onChange={e => setForm({ ...form, vcName: e.target.value })} /><Input label="Signature / file ref." value={form.vcRef} onChange={e => setForm({ ...form, vcRef: e.target.value })} /><Button size="sm" disabled={!form.vcName.trim() || !form.vcRef.trim()} onClick={() => { put({ vc: { name: form.vcName.trim(), ref: form.vcRef.trim(), by: me, at: now() } }); toast.success('Sign-off recorded'); }}>Record</Button></div>}
      </Step>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex items-center gap-3">
        {published ? <InlineAlert type="success">Published. Students and parents can see their results.</InlineAlert> : <>
          <p className="flex-1 text-[13px] text-[#5A6577]">{allApproved ? 'All approvals are in. Publishing lifts the embargo for every student at once.' : 'Publication unlocks once all three approvals are recorded.'}</p>
          <Button loading={advance.isPending} disabled={!allApproved || status !== 'RESULT_PROCESSING'} onClick={() => void publish()}>Publish results</Button>
        </>}
      </div>
    </div>
  );
}

function Gazette({ name, code, q, approval }: { name: string; code: string; q: ReturnType<typeof useQuery<{ published: boolean; totals: { total: number; passed: number; graced: number }; results: ResultRow[] }>>; approval?: Approval }) {
  const data = q.data;
  async function generate() {
    if (!data) return;
    const rows = [...data.results].sort((a, b) => a.rollNo.localeCompare(b.rollNo));
    await downloadPdf({
      title: `Result Gazette — ${name}`, subtitle: inst().name, reference: code, landscape: true, fileName: `gazette-${code.replace(/\//g, '-')}`,
      sections: [
        { fields: [['Candidates', data.totals.total], ['Passed', data.totals.passed], ['Pass percentage', data.totals.total ? `${((data.totals.passed / data.totals.total) * 100).toFixed(1)}%` : '—'], ['Passed with grace', data.totals.graced], ['Approved', approval?.vc ? `${approval.vc.name} (${approval.vc.ref})` : '—']] },
        { table: { head: ['Roll no.', 'Name', 'Programme', 'SGPA', 'CGPA', 'Result'], body: rows.map(r => [r.rollNo, r.name, `${r.programme} ${r.semester}`, r.sgpa.toFixed(2), r.cgpa.toFixed(2), `${r.outcome}${r.graceMarks ? ' (G)' : ''}${r.division ? ` — ${r.division}` : ''}`]) } },
        { text: ['(G) passed with grace marks under the grace rule. This gazette is generated from the examination records and is subject to revaluation.'] },
      ],
      signatory: 'Controller of Examinations',
    });
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 max-w-2xl space-y-3">
      <p className="text-[14px] font-semibold text-[#16264A]">Official result gazette</p>
      <p className="text-[13px] text-[#5A6577]">The gazette lists every candidate's result for {name}, generated from the records as they stand.</p>
      {!data?.published && <InlineAlert type="warning">The results are still under embargo. Publish them before issuing the gazette.</InlineAlert>}
      <Button disabled={!data?.published || !data.results.length} onClick={() => void generate()}>Generate gazette PDF</Button>
    </div>
  );
}

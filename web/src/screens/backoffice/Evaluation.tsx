import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { downloadCSV } from '../../lib/export';
import { useBundle, useEnterMarks, useExamCentres, useExamSession, useExamSessions, useFlaggedScripts, useModerateScript } from '../../lib/examqueries';
import { useExaminers, useNewBundle, useSaveExaminer, useSessionBundles, useToggleExaminer, type BundleRow, type Examiner } from '../../lib/examconduct';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/**
 * Evaluation: answer-script bundles made up from the seating list and given
 * to examiners on the panel, every examiner's marks entered against the
 * foil, scripts where two examiners disagree sent to a moderator, and the
 * panel itself. Every figure is the server's.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const STATUS: Record<BundleRow['status'], { label: string; cls: string }> = {
  UNASSIGNED: { label: 'Unassigned', cls: 'bg-[#EDEFF3] text-[#5A6577]' },
  RECEIVED: { label: 'Received', cls: 'bg-[#EFF6FF] text-[#1D4ED8]' },
  UNDER_EVALUATION: { label: 'With examiner', cls: 'bg-[#FEF9EC] text-[#8A6D1F]' },
  SUBMITTED: { label: 'Marks submitted', cls: 'bg-[#D1FAE5] text-[#0E7A5F]' },
  MODERATED: { label: 'Moderated', cls: 'bg-[#D1FAE5] text-[#0E7A5F]' },
};
const ROLE: Record<string, string> = { E1: 'First examiner', E2: 'Second examiner', MODERATOR: 'Moderator' };

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-[#D3D8E0] rounded-[4px] ${className}`}>{children}</div>;
}

export default function Evaluation(_props: Props) {
  const sessions = useExamSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tab, setTab] = useState('bundles');
  useEffect(() => {
    if (sessionId || !sessions.data?.length) return;
    setSessionId((sessions.data.find((s) => s.status === 'EVALUATION' || s.status === 'IN_PROGRESS') ?? sessions.data[0]!).id);
  }, [sessions.data, sessionId]);
  const flagged = useFlaggedScripts(sessionId);

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-3 flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-[#16264A]">Evaluation & moderation</h2>
          <p className="text-[12px] text-[#5A6577]">Bundles, examiners’ marks, double valuation and the examiner panel</p>
        </div>
        <div className="w-80">
          <Select label="Sitting" value={sessionId ?? ''} onChange={(e) => setSessionId(e.target.value)}>
            {(sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.status.replace(/_/g, ' ').toLowerCase()}</option>)}
          </Select>
        </div>
      </div>
      <div className="bg-white px-4"><Tabs tabs={[{ id: 'bundles', label: 'Bundles & marks' }, { id: 'moderation', label: `Double valuation${flagged.data?.length ? ` (${flagged.data.length})` : ''}` }, { id: 'panel', label: 'Examiner panel' }]} activeId={tab} onChange={setTab} /></div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {sessions.isPending && <div className="flex justify-center py-16"><Spinner /></div>}
        {sessions.error && <InlineAlert type="error">{errText(sessions.error)}</InlineAlert>}
        {sessionId && tab === 'bundles' && <BundlesTab sessionId={sessionId} />}
        {sessionId && tab === 'moderation' && <ModerationTab sessionId={sessionId} />}
        {tab === 'panel' && <PanelTab />}
      </div>
    </div>
  );
}

// ─── Bundles ──────────────────────────────────────────────────────────────────

function BundlesTab({ sessionId }: { sessionId: string }) {
  const session = useExamSession(sessionId);
  const bundles = useSessionBundles(sessionId);
  const centres = useExamCentres(sessionId);
  const examiners = useExaminers();
  const create = useNewBundle();
  const [making, setMaking] = useState(false);
  const [f, setF] = useState({ paperId: '', centreCode: '', examinerId: '', examinerRole: 'E1' as 'E1' | 'E2' | 'MODERATOR' });
  const [open, setOpen] = useState<string | null>(null);
  const [paper, setPaper] = useState('');
  const status = session.data?.status;
  const canWork = status === 'IN_PROGRESS' || status === 'EVALUATION';
  const rows = (bundles.data ?? []).filter((b) => !paper || b.paper.id === paper);
  const seatedCentres = (centres.data ?? []).filter((c) => c.assigned > 0);
  const active = (examiners.data ?? []).filter((e) => e.active);
  const totals = useMemo(() => ({ scripts: rows.reduce((t, b) => t + b.scripts, 0), marked: rows.reduce((t, b) => t + b.marked, 0), flagged: rows.reduce((t, b) => t + b.flagged, 0) }), [rows]);

  return (
    <div className="flex flex-col gap-4">
      {!canWork && status && <InlineAlert type="info">This sitting is at “{status.replace(/_/g, ' ').toLowerCase()}”. Bundles are made up and marked while it is in progress or under evaluation.</InlineAlert>}
      <Card className="p-4 flex flex-wrap gap-3 items-end justify-between">
        <div className="w-64">
          <Select label="Paper" value={paper} onChange={(e) => setPaper(e.target.value)}>
            <option value="">All papers</option>
            {(session.data?.papers ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </div>
        <p className="text-[12px] text-[#5A6577] flex-1">{rows.length} bundles · {totals.marked} of {totals.scripts} scripts marked{totals.flagged ? ` · ${totals.flagged} need a moderator` : ''}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={!rows.length} onClick={() => downloadCSV(`bundles-${session.data?.code ?? 'sitting'}`, rows, [{ key: 'bundleNo', label: 'Bundle' }, { key: 'paper', label: 'Paper', value: (r) => r.paper.code }, { key: 'centre', label: 'Centre', value: (r) => r.centre.code }, { key: 'examinerName', label: 'Examiner' }, { key: 'examinerRole', label: 'Role' }, { key: 'scripts', label: 'Scripts' }, { key: 'marked', label: 'Marked' }, { key: 'flagged', label: 'Flagged' }, { key: 'status', label: 'Status' }])}>Export CSV</Button>
          <Button size="sm" disabled={!canWork} onClick={() => { create.reset(); setF({ paperId: paper || session.data?.papers[0]?.id || '', centreCode: seatedCentres[0]?.code ?? '', examinerId: active[0]?.id ?? '', examinerRole: 'E1' }); setMaking(true); }}>Make up a bundle</Button>
        </div>
      </Card>
      {bundles.isPending && <div className="flex justify-center py-12"><Spinner /></div>}
      {bundles.error && <InlineAlert type="error">{errText(bundles.error)}</InlineAlert>}
      {bundles.data && rows.length === 0 && <Card><EmptyState title="No bundles yet" description="Make up a bundle of a paper’s scripts at a centre and give it to an examiner on the panel." /></Card>}
      {rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F7F8FA]"><tr>{['Bundle', 'Paper', 'Centre', 'Examiner', 'Progress', 'Status', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t border-[#EDEFF3]">
                  <td className="px-3 py-2 font-mono text-[11px]">{b.bundleNo}</td>
                  <td className="px-3 py-2">{b.paper.code}</td>
                  <td className="px-3 py-2 text-[#5A6577]">{b.centre.code}</td>
                  <td className="px-3 py-2">{b.examinerName}<p className="text-[11px] text-[#5A6577]">{ROLE[b.examinerRole]}</p></td>
                  <td className="px-3 py-2">
                    <div className="w-28 h-1.5 bg-[#EDEFF3] rounded-full overflow-hidden"><div className="h-full bg-[#0E7A5F]" style={{ width: `${b.scripts ? (b.marked / b.scripts) * 100 : 0}%` }} /></div>
                    <p className="text-[11px] text-[#5A6577] mt-0.5">{b.marked}/{b.scripts}{b.flagged ? <span className="text-[#A8242C]"> · {b.flagged} flagged</span> : null}</p>
                  </td>
                  <td className="px-3 py-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[2px] ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span></td>
                  <td className="px-3 py-2 text-right"><button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => setOpen(b.id)}>{b.status === 'SUBMITTED' || b.status === 'MODERATED' ? 'View foil' : 'Enter marks'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={making} onClose={() => setMaking(false)} title="Make up a bundle"
        footer={<><Button variant="secondary" size="sm" onClick={() => setMaking(false)}>Cancel</Button><Button size="sm" disabled={!f.paperId || !f.centreCode || !f.examinerId} loading={create.isPending} onClick={() => create.mutate(f, { onSuccess: (r) => { toast.success(`${r.bundleNo}: ${r.scripts} scripts`); setMaking(false); } })}>Make up bundle</Button></>}>
        <div className="flex flex-col gap-3">
          {create.isError && <InlineAlert type="error">{errText(create.error)}</InlineAlert>}
          <Select label="Paper" value={f.paperId} onChange={(e) => setF({ ...f, paperId: e.target.value })}>{(session.data?.papers ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</Select>
          <Select label="Centre" value={f.centreCode} onChange={(e) => setF({ ...f, centreCode: e.target.value })}>
            {seatedCentres.length === 0 && <option value="">No centre has candidates seated</option>}
            {seatedCentres.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.assigned} seated)</option>)}
          </Select>
          <Select label="Examiner" value={f.examinerId} onChange={(e) => setF({ ...f, examinerId: e.target.value })}>
            {active.length === 0 && <option value="">Add examiners to the panel first</option>}
            {active.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.institution}{x.subjects ? ` · ${x.subjects}` : ''}</option>)}
          </Select>
          <Select label="Reading" value={f.examinerRole} onChange={(e) => setF({ ...f, examinerRole: e.target.value as typeof f.examinerRole })}>
            <option value="E1">First examiner</option><option value="E2">Second examiner (double valuation)</option><option value="MODERATOR">Moderator</option>
          </Select>
          <p className="text-[11px] text-[#5A6577]">Scripts come from the candidates seated at the centre for the paper; absentees are left out.</p>
        </div>
      </Modal>
      {open && <FoilModal bundleId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FoilModal({ bundleId, onClose }: { bundleId: string; onClose: () => void }) {
  const { data: b, isPending, error } = useBundle(bundleId);
  const save = useEnterMarks();
  const [marks, setMarks] = useState<Record<string, string>>({});
  const col = b?.examinerRole === 'E1' ? 'e1' : b?.examinerRole === 'E2' ? 'e2' : 'moderatorMark';
  useEffect(() => {
    if (b) setMarks(Object.fromEntries(b.scripts.map((s) => [s.studentId, s[col as 'e1'] === null ? '' : String(s[col as 'e1'])])));
  }, [b, col]);
  const locked = b?.status === 'SUBMITTED' || b?.status === 'MODERATED';
  const max = b?.paper.maxExternal ?? 0;
  const bad = Object.values(marks).some((v) => v !== '' && (!/^\d+$/.test(v) || Number(v) > max));
  const blank = b ? b.scripts.filter((s) => !s.absent && (marks[s.studentId] ?? '') === '').length : 0;
  function push(submit: boolean) {
    if (!b) return;
    save.mutate({ bundleId, submit, marks: b.scripts.filter((s) => !s.absent).map((s) => ({ studentId: s.studentId, mark: marks[s.studentId] === '' || marks[s.studentId] === undefined ? null : Number(marks[s.studentId]) })) },
      { onSuccess: (r) => { toast.success(submit ? `Submitted — ${r.settled} settled, ${r.flagged} for moderation` : 'Draft saved'); if (submit) onClose(); } });
  }
  return (
    <Modal open onClose={onClose} title={b ? `${b.bundleNo} · ${b.paper.code} out of ${b.paper.maxExternal}` : 'Bundle'} width="720px"
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Close</Button>{!locked && b && <><Button variant="secondary" size="sm" disabled={bad} loading={save.isPending} onClick={() => push(false)}>Save draft</Button><Button size="sm" disabled={bad || blank > 0} loading={save.isPending} onClick={() => push(true)}>Submit marks</Button></>}</>}>
      {isPending && <Spinner />}
      {error && <InlineAlert type="error">{errText(error)}</InlineAlert>}
      {b && (
        <div className="flex flex-col gap-3">
          {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
          <p className="text-[12px] text-[#5A6577]">{b.examinerName} · {ROLE[b.examinerRole]} · {b.centre.code}. Two readings differing by more than {b.tolerance} marks go to a moderator.{!locked && blank ? ` ${blank} still blank.` : ''}</p>
          <div className="max-h-[55vh] overflow-y-auto border border-[#EDEFF3] rounded-[4px]">
            <table className="w-full text-[13px]">
              <thead className="bg-[#F7F8FA] sticky top-0"><tr>{['Roll', 'Candidate', 'E1', 'E2', 'Moderator', 'Final', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase">{h}</th>)}</tr></thead>
              <tbody>
                {b.scripts.map((s) => {
                  const cell = (c: 'e1' | 'e2' | 'moderatorMark') => (c === col && !locked && !s.absent
                    ? <input value={marks[s.studentId] ?? ''} onChange={(e) => setMarks({ ...marks, [s.studentId]: e.target.value.replace(/\D/g, '') })} className={`w-16 h-8 px-2 border rounded-[4px] text-[13px] ${marks[s.studentId] && Number(marks[s.studentId]) > max ? 'border-[#A8242C]' : 'border-[#D3D8E0]'}`} />
                    : <span className="text-[#5A6577]">{s[c] ?? '—'}</span>);
                  return (
                    <tr key={s.id} className="border-t border-[#EDEFF3]">
                      <td className="px-3 py-1.5 font-mono text-[11px]">{s.rollNo}</td>
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5">{cell('e1')}</td>
                      <td className="px-3 py-1.5">{cell('e2')}</td>
                      <td className="px-3 py-1.5">{cell('moderatorMark')}</td>
                      <td className="px-3 py-1.5 font-semibold">{s.absent ? 'AB' : s.finalMark ?? '—'}</td>
                      <td className="px-3 py-1.5 text-[11px]">{s.absent ? <span className="text-[#5A6577]">Absent</span> : s.flagged ? <span className="text-[#A8242C]">Needs moderator</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Double valuation ─────────────────────────────────────────────────────────

function ModerationTab({ sessionId }: { sessionId: string }) {
  const { data, isPending, error } = useFlaggedScripts(sessionId);
  const moderate = useModerateScript();
  const [marks, setMarks] = useState<Record<string, string>>({});
  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !data) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  if (data.length === 0) return <Card><EmptyState title="Nothing to moderate" description="Every script whose two readings were compared agreed within the tolerance." /></Card>;
  return (
    <Card className="overflow-x-auto">
      <p className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3]">The two examiners differ by more than the tolerance. A moderator’s reading stands on its own.</p>
      <table className="w-full text-[13px]">
        <thead className="bg-[#F7F8FA]"><tr>{['Candidate', 'Paper', 'E1', 'E2', 'Gap', 'Moderator mark', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase">{h}</th>)}</tr></thead>
        <tbody>
          {data.map((s) => {
            const v = marks[s.id] ?? '';
            const ok = /^\d+$/.test(v) && Number(v) <= s.maxExternal;
            return (
              <tr key={s.id} className="border-t border-[#EDEFF3]">
                <td className="px-3 py-2">{s.name}<p className="font-mono text-[11px] text-[#5A6577]">{s.rollNo}</p></td>
                <td className="px-3 py-2">{s.code}<p className="text-[11px] text-[#5A6577]">out of {s.maxExternal}</p></td>
                <td className="px-3 py-2">{s.e1}</td>
                <td className="px-3 py-2">{s.e2}</td>
                <td className="px-3 py-2 text-[#A8242C] font-semibold">{s.gap} <span className="text-[11px] font-normal text-[#5A6577]">(tolerance {s.tolerance})</span></td>
                <td className="px-3 py-2"><input value={v} onChange={(e) => setMarks({ ...marks, [s.id]: e.target.value.replace(/\D/g, '') })} className="w-16 h-8 px-2 border border-[#D3D8E0] rounded-[4px]" /></td>
                <td className="px-3 py-2 text-right"><Button size="sm" disabled={!ok} loading={moderate.isPending && moderate.variables?.scriptId === s.id} onClick={() => moderate.mutate({ scriptId: s.id, mark: Number(v) }, { onSuccess: () => toast.success(`${s.code} for ${s.name} settled at ${v}`), onError: (e) => toast.error(errText(e)) })}>Settle</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Examiner panel ───────────────────────────────────────────────────────────

function PanelTab() {
  const { data, isPending, error } = useExaminers();
  const save = useSaveExaminer();
  const toggle = useToggleExaminer();
  const [form, setForm] = useState<(Omit<Examiner, 'id' | 'active' | 'bundles' | 'pending' | 'mobile' | 'email'> & { id?: string; mobile: string; email: string }) | null>(null);
  const ok = !!form && form.name.trim().length >= 3 && form.designation.trim().length >= 2 && form.institution.trim().length >= 2;
  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !data) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <p className="text-[12px] text-[#5A6577]">{data.filter((e) => e.active).length} active examiners. Bundles are given only to examiners on the active panel.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={!data.length} onClick={() => downloadCSV('examiner-panel', data, [{ key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'institution', label: 'Institution' }, { key: 'subjects', label: 'Subjects' }, { key: 'mobile', label: 'Mobile' }, { key: 'email', label: 'Email' }, { key: 'bundles', label: 'Bundles' }, { key: 'active', label: 'Active', value: (r) => (r.active ? 'Yes' : 'No') }])}>Export CSV</Button>
          <Button size="sm" onClick={() => { save.reset(); setForm({ name: '', designation: '', institution: '', subjects: '', mobile: '', email: '' }); }}>Add examiner</Button>
        </div>
      </div>
      {data.length === 0 && <Card><EmptyState title="No examiners" description="Add the evaluation panel before bundles go out." /></Card>}
      {data.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F7F8FA]"><tr>{['Examiner', 'Institution', 'Subjects', 'Contact', 'Bundles', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className={`border-t border-[#EDEFF3] ${e.active ? '' : 'opacity-60'}`}>
                  <td className="px-3 py-2 font-medium text-[#16264A]">{e.name}<p className="text-[11px] font-normal text-[#5A6577]">{e.designation}</p></td>
                  <td className="px-3 py-2 text-[#5A6577]">{e.institution}</td>
                  <td className="px-3 py-2 text-[#5A6577]">{e.subjects || '—'}</td>
                  <td className="px-3 py-2 text-[12px] text-[#5A6577]">{e.mobile ?? ''}{e.email ? <span className="block">{e.email}</span> : null}</td>
                  <td className="px-3 py-2">{e.bundles}{e.pending ? <span className="text-[11px] text-[#8A6D1F]"> ({e.pending} pending)</span> : null}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className="text-[12px] text-[#E0952A] cursor-pointer mr-3" onClick={() => { save.reset(); setForm({ id: e.id, name: e.name, designation: e.designation, institution: e.institution, subjects: e.subjects, mobile: e.mobile ?? '', email: e.email ?? '' }); }}>Edit</button>
                    <button className="text-[12px] cursor-pointer disabled:opacity-50" style={{ color: e.active ? '#A8242C' : '#0E7A5F' }} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: e.id, active: !e.active }, { onSuccess: () => toast.success(e.active ? `${e.name} taken off the panel` : `${e.name} back on the panel`), onError: (x) => toast.error(errText(x)) })}>{e.active ? 'Remove from panel' : 'Restore'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit examiner' : 'Add examiner'}
        footer={<><Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancel</Button><Button size="sm" disabled={!ok} loading={save.isPending} onClick={() => save.mutate(form!, { onSuccess: () => { toast.success('Examiner saved'); setForm(null); } })}>Save</Button></>}>
        {form && (
          <div className="flex flex-col gap-3">
            {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
            <Input label="Name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Designation" value={form.designation} maxLength={80} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              <Input label="Subjects (codes)" value={form.subjects} maxLength={300} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="BCA501, BCA502" />
            </div>
            <Input label="Institution" value={form.institution} maxLength={160} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Mobile" value={form.mobile} maxLength={16} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
              <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

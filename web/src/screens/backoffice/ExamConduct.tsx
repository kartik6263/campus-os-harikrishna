import { useEffect, useState } from 'react';
import { Button, Checkbox, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { downloadCSV, downloadPdf } from '../../lib/export';
import { downloadStoredFile, pickAndUpload, type StoredFileInfo } from '../../lib/records';
import { useExamSession, useExamSessions } from '../../lib/examqueries';
import { UFM_DECISION, useDecideUfm, useHallSheet, useReportUfm, useSaveAttendance, useUfmCases, type UfmCase } from '../../lib/examconduct';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/**
 * Conduct of the examination: the invigilator's attendance sheet for each
 * paper (absentees are settled at zero and left out of the bundles) and the
 * unfair-means register — reported from the hall, decided by the committee,
 * and applied when results are processed. Results cannot be processed while
 * a case is undecided.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ExamConduct(_props: Props) {
  const sessions = useExamSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tab, setTab] = useState('attendance');
  useEffect(() => {
    if (sessionId || !sessions.data?.length) return;
    setSessionId((sessions.data.find((s) => s.status === 'IN_PROGRESS' || s.status === 'EVALUATION') ?? sessions.data[0]!).id);
  }, [sessions.data, sessionId]);
  const cases = useUfmCases(sessionId);
  const open = (cases.data ?? []).filter((c) => c.status === 'REPORTED').length;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-3 flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-[#16264A]">Conduct of examination</h2>
          <p className="text-[12px] text-[#5A6577]">Hall attendance for each paper, and unfair-means cases</p>
        </div>
        <div className="w-80"><Select label="Sitting" value={sessionId ?? ''} onChange={(e) => setSessionId(e.target.value)}>{(sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.status.replace(/_/g, ' ').toLowerCase()}</option>)}</Select></div>
      </div>
      <div className="bg-white px-4"><Tabs tabs={[{ id: 'attendance', label: 'Hall attendance' }, { id: 'ufm', label: `Unfair means${open ? ` (${open} open)` : ''}` }]} activeId={tab} onChange={setTab} /></div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {sessions.isPending && <div className="flex justify-center py-16"><Spinner /></div>}
        {sessionId && tab === 'attendance' && <AttendanceTab sessionId={sessionId} />}
        {sessionId && tab === 'ufm' && <UfmTab sessionId={sessionId} cases={cases.data} loading={cases.isPending} error={cases.error} />}
      </div>
    </div>
  );
}

function AttendanceTab({ sessionId }: { sessionId: string }) {
  const session = useExamSession(sessionId);
  const [paperId, setPaperId] = useState<string | null>(null);
  useEffect(() => { setPaperId(session.data?.papers[0]?.id ?? null); }, [session.data?.id]);
  const sheet = useHallSheet(paperId);
  const save = useSaveAttendance();
  const report = useReportUfm();
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [ufmFor, setUfmFor] = useState<{ studentId: string; name: string } | null>(null);
  const [ufm, setUfm] = useState({ description: '', reportedBy: '' });
  const [proof, setProof] = useState<StoredFileInfo | null>(null);
  useEffect(() => { if (sheet.data) setAbsent(new Set(sheet.data.candidates.filter((c) => c.absent).map((c) => c.studentId))); }, [sheet.data]);
  const status = session.data?.status;
  const live = status === 'IN_PROGRESS' || status === 'EVALUATION';
  const list = (sheet.data?.candidates ?? []).filter((c) => !q || `${c.name} ${c.rollNo} ${c.enrolmentNo}`.toLowerCase().includes(q.toLowerCase()));
  const changed = sheet.data ? sheet.data.candidates.some((c) => c.absent !== absent.has(c.studentId)) : false;

  function printSheet() {
    if (!sheet.data) return;
    const p = sheet.data.paper;
    void downloadPdf({
      title: `Attendance sheet — ${p.code} ${p.name}`,
      subtitle: `${p.session.code} · ${day(p.examDate)} · ${p.examTime}`,
      sections: [{ table: { head: ['Seat', 'Roll no.', 'Candidate', 'Centre', 'Paper', 'Present / absent', 'Signature'], body: sheet.data.candidates.map((c) => [c.seatNo ?? '', c.rollNo ?? '', c.name, c.centre, c.kind === 'BACKLOG' ? 'Backlog' : 'Regular', absent.has(c.studentId) ? 'Absent' : '', '']) } }],
      signatory: 'Superintendent of the centre',
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {!live && status && <InlineAlert type="info">Attendance and cases are recorded while the sitting is in progress or under evaluation; this one is at “{status.replace(/_/g, ' ').toLowerCase()}”.</InlineAlert>}
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap gap-3 items-end">
        <div className="w-72"><Select label="Paper" value={paperId ?? ''} onChange={(e) => setPaperId(e.target.value)}>{(session.data?.papers ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name} · {day(p.examDate)}</option>)}</Select></div>
        <div className="flex-1 min-w-[180px]"><Input label="Find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or roll no." /></div>
        <Button variant="secondary" disabled={!sheet.data?.candidates.length} onClick={printSheet}>Print sheet</Button>
        <Button variant="secondary" disabled={!sheet.data?.candidates.length} onClick={() => downloadCSV(`attendance-${sheet.data!.paper.code}`, sheet.data!.candidates, [{ key: 'seatNo', label: 'Seat' }, { key: 'rollNo', label: 'Roll' }, { key: 'name', label: 'Candidate' }, { key: 'centre', label: 'Centre' }, { key: 'kind', label: 'Paper' }, { key: 'absent', label: 'Absent', value: (r) => (absent.has(r.studentId) ? 'Yes' : 'No') }])}>Export CSV</Button>
        <Button disabled={!live || !changed} loading={save.isPending} onClick={() => save.mutate({ paperId: paperId!, absent: [...absent] }, { onSuccess: (r) => toast.success(`${r.present} present, ${r.absent} absent`), onError: (e) => toast.error(errText(e)) })}>Save attendance</Button>
      </div>
      {sheet.isPending && paperId && <div className="flex justify-center py-12"><Spinner /></div>}
      {sheet.error && <InlineAlert type="error">{errText(sheet.error)}</InlineAlert>}
      {sheet.data && sheet.data.candidates.length === 0 && <div className="bg-white border border-[#D3D8E0] rounded-[4px]"><EmptyState title="No candidates" description="Nobody is seated for this paper yet — allocate centres first." /></div>}
      {list.length > 0 && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
          <p className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3]">{sheet.data!.candidates.length} candidates · {absent.size} marked absent. Tick those who did not sit the paper.</p>
          <table className="w-full text-[13px]">
            <thead className="bg-[#F7F8FA]"><tr>{['Absent', 'Seat', 'Roll', 'Candidate', 'Centre', 'Paper', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A6577] uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.studentId} className={`border-t border-[#EDEFF3] ${absent.has(c.studentId) ? 'bg-[#FEF2F2]' : ''}`}>
                  <td className="px-3 py-1.5"><Checkbox checked={absent.has(c.studentId)} disabled={!live || c.marked} onChange={(v) => { const n = new Set(absent); if (v) n.add(c.studentId); else n.delete(c.studentId); setAbsent(n); }} /></td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{c.seatNo}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{c.rollNo}</td>
                  <td className="px-3 py-1.5">{c.name}{c.marked && <span className="text-[11px] text-[#5A6577]"> · marked</span>}</td>
                  <td className="px-3 py-1.5 text-[#5A6577]">{c.centre}</td>
                  <td className="px-3 py-1.5">{c.kind === 'BACKLOG' ? <span className="text-[11px] font-semibold text-[#8A6D1F]">Backlog</span> : 'Regular'}</td>
                  <td className="px-3 py-1.5 text-right">{c.ufm ? <span className="text-[11px] font-semibold text-[#A8242C]">{c.ufm.caseNo}</span> : live && <button className="text-[12px] text-[#A8242C] cursor-pointer" onClick={() => { report.reset(); setUfm({ description: '', reportedBy: '' }); setProof(null); setUfmFor({ studentId: c.studentId, name: c.name }); }}>Report unfair means</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!ufmFor} onClose={() => setUfmFor(null)} title={`Unfair means — ${ufmFor?.name ?? ''}`}
        footer={<><Button variant="secondary" size="sm" onClick={() => setUfmFor(null)}>Cancel</Button><Button size="sm" variant="destructive" disabled={ufm.description.trim().length < 15 || ufm.reportedBy.trim().length < 3} loading={report.isPending}
          onClick={() => report.mutate({ paperId: paperId!, studentId: ufmFor!.studentId, description: ufm.description.trim(), reportedBy: ufm.reportedBy.trim(), ...(proof ? { evidenceFileId: proof.id } : {}) }, { onSuccess: (r) => { toast.success(`Case ${r.caseNo} registered; the result in this paper is withheld until it is decided`); setUfmFor(null); } })}>Register case</Button></>}>
        <div className="flex flex-col gap-3">
          {report.isError && <InlineAlert type="error">{errText(report.error)}</InlineAlert>}
          <label className="flex flex-col gap-1"><span className="text-[13px] font-medium text-[#16264A]">What happened</span><textarea rows={4} maxLength={1000} value={ufm.description} onChange={(e) => setUfm({ ...ufm, description: e.target.value })} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" placeholder="e.g. Found with handwritten notes inside the calculator cover at 11:20" /><span className="text-[11px] text-[#5A6577]">At least 15 characters.</span></label>
          <Input label="Reported by" value={ufm.reportedBy} maxLength={120} onChange={(e) => setUfm({ ...ufm, reportedBy: e.target.value })} placeholder="e.g. Invigilator, Hall 3 — Dr. A. Verma" />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={async () => { const f = await pickAndUpload('exam:ufm', 'image/*,application/pdf'); if (f) setProof(f); }}>{proof ? 'Replace evidence' : 'Attach evidence (photo / memo)'}</Button>
            {proof && <span className="text-[12px] text-[#0E7A5F]">✓ {proof.name}</span>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function UfmTab({ cases, loading, error }: { sessionId: string; cases: UfmCase[] | undefined; loading: boolean; error: unknown }) {
  const decide = useDecideUfm();
  const [acting, setActing] = useState<UfmCase | null>(null);
  const [decision, setDecision] = useState('PAPER_CANCELLED');
  const [note, setNote] = useState('');
  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <InlineAlert type="error">{errText(error)}</InlineAlert>;
  if (!cases?.length) return <div className="bg-white border border-[#D3D8E0] rounded-[4px]"><EmptyState title="No cases" description="Cases are reported from a paper’s hall attendance sheet." /></div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={() => downloadCSV('unfair-means-register', cases, [{ key: 'caseNo', label: 'Case' }, { key: 'student', label: 'Candidate', value: (r) => `${r.student.name} (${r.student.enrolmentNo})` }, { key: 'paper', label: 'Paper', value: (r) => r.paper.code }, { key: 'description', label: 'Report' }, { key: 'reportedBy', label: 'Reported by' }, { key: 'status', label: 'Status' }, { key: 'decision', label: 'Decision', value: (r) => (r.decision ? UFM_DECISION[r.decision] : '') }, { key: 'decisionNote', label: 'Note' }])}>Export register</Button></div>
      {cases.map((c) => (
        <div key={c.id} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-[14px] font-semibold text-[#16264A]">{c.student.name} <span className="text-[12px] font-normal text-[#5A6577]">{c.student.rollNo} · {c.student.enrolmentNo}</span></p>
              <p className="text-[13px]">{c.paper.code} — {c.paper.name} <span className="font-mono text-[11px] text-[#5A6577]">{c.caseNo}</span></p>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[2px] h-fit ${c.status === 'REPORTED' ? 'bg-[#FEE2E2] text-[#A8242C]' : 'bg-[#EDEFF3] text-[#16264A]'}`}>{c.status === 'REPORTED' ? 'Awaiting committee' : UFM_DECISION[c.decision!]}</span>
          </div>
          <p className="text-[13px] text-[#5A6577] mt-1">{c.description}</p>
          <p className="text-[11px] text-[#5A6577] mt-1">Reported by {c.reportedBy} on {day(c.createdAt)}{c.decidedBy ? ` · decided by ${c.decidedBy}: ${c.decisionNote}` : ''}</p>
          <div className="flex gap-3 mt-2 items-center">
            {c.evidence && <button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => downloadStoredFile(c.evidence!.id, c.evidence!.name).catch((e) => toast.error(errText(e)))}>Evidence: {c.evidence.name}</button>}
            {c.status === 'REPORTED' && <Button size="sm" onClick={() => { decide.reset(); setDecision('PAPER_CANCELLED'); setNote(''); setActing(c); }}>Record decision</Button>}
          </div>
        </div>
      ))}
      <Modal open={!!acting} onClose={() => setActing(null)} title={`Decision on ${acting?.caseNo ?? ''}`}
        footer={<><Button variant="secondary" size="sm" onClick={() => setActing(null)}>Cancel</Button><Button size="sm" disabled={note.trim().length < 10} loading={decide.isPending} onClick={() => decide.mutate({ id: acting!.id, decision, note: note.trim() }, { onSuccess: () => { toast.success('Decision recorded; the candidate is told'); setActing(null); } })}>Record</Button></>}>
        <div className="flex flex-col gap-3">
          {decide.isError && <InlineAlert type="error">{errText(decide.error)}</InlineAlert>}
          <Select label="Decision of the committee" value={decision} onChange={(e) => setDecision(e.target.value)}>{Object.entries(UFM_DECISION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Input label="Note — the candidate sees it" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <p className="text-[11px] text-[#5A6577]">Applied when results are processed: a cancelled paper is failed with no marks; a cancelled sitting fails every paper of it; debarment also stops the next sitting’s form.</p>
        </div>
      </Modal>
    </div>
  );
}

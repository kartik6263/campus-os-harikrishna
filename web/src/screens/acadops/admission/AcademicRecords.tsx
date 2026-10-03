import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { useAuth, displayName } from '../../../lib/auth';
import { downloadCSV, downloadPdf } from '../../../lib/export';
import { inst } from '../../../lib/institution';
import type { Profile, SemResult } from '../../../lib/queries';
import { formatBytes, useCollection, useFiles, type Stored } from '../../../lib/records';
import { FIELD_KEY, type RecordCorrection } from '../../../lib/corrections';

/**
 * The records section: any student's record and transcript, students'
 * requests to correct their particulars (approved here, which changes the
 * record itself), and the record certificates — TC, migration, duplicate
 * marksheet — in the college certificate queue.
 */

interface Hit { kind: string; id: string; title: string; subtitle: string }
interface CertRow { id: string; requestNo: string; type: string; studentName: string; enrolmentNo: string; programme: string; stage: string; requestedOn: string; slaDeadline: string; overdue: boolean; feePaid: boolean; fee: number }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const RECORD_CERTS = ['Transfer Certificate', 'Migration Certificate', 'Duplicate Marksheet', 'Provisional Certificate', 'Degree Certificate'];

export default function AcademicRecords() {
  const [tab, setTab] = useState('lookup');
  const corrections = useCollection<RecordCorrection>('student:record-corrections', []);
  const pending = corrections.items.filter(c => c.status === 'pending').length;
  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Academic Records</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Student records, transcripts, corrections and record certificates</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'lookup', label: 'Student Record & Transcript' }, { id: 'corrections', label: `Corrections${pending ? ` (${pending})` : ''}` }, { id: 'certs', label: 'Record Certificates' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'lookup' && <Lookup />}
        {tab === 'corrections' && <Corrections corrections={corrections} />}
        {tab === 'certs' && <RecordCerts />}
      </div>
    </div>
  );
}

// ─── Lookup & transcript ─────────────────────────────────────────────────────

function Lookup() {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Hit | null>(null);
  const hits = useQuery({
    queryKey: ['records', 'search', q.trim()], enabled: q.trim().length >= 2,
    queryFn: () => api<{ hits: Hit[] }>(`/api/insights/search?q=${encodeURIComponent(q.trim())}`).then(r => r.hits.filter(h => h.kind === 'Student')),
  });
  const profile = useQuery({ queryKey: ['records', 'profile', picked?.id], enabled: !!picked, queryFn: () => api<Profile>(`/api/student/profile?studentId=${picked!.id}`) });
  const results = useQuery({ queryKey: ['records', 'results', picked?.id], enabled: !!picked, queryFn: () => api<SemResult[]>(`/api/student/results?studentId=${picked!.id}`) });

  async function transcript() {
    const p = profile.data!; const r = [...(results.data ?? [])].sort((a, b) => a.semester - b.semester);
    const last = r[r.length - 1];
    await downloadPdf({
      title: 'Transcript of Academic Record', subtitle: inst().name, reference: p.enrolmentNo, fileName: `transcript-${p.enrolmentNo.replace(/\//g, '-')}`,
      sections: [
        { fields: [['Name', p.name], ['Enrolment number', p.enrolmentNo], ['Roll number', p.rollNo], ['Programme', p.programme.name], ['College', p.college.name], ['Date of birth', day(p.dob)], ['CGPA', last ? last.cgpa.toFixed(2) : '—']] },
        ...r.map(sem => ({ heading: `Semester ${sem.semester} — SGPA ${sem.sgpa.toFixed(2)} · ${sem.outcome}`, table: { head: ['Code', 'Subject', 'Internal', 'External', 'Total', 'Grade'], body: sem.subjects.map(s => [s.code, s.name, s.internal, s.external, s.total, s.grade]) } })),
        { text: [`Issued on ${new Date().toLocaleDateString('en-IN')}. This transcript is computed from the examination records of the institution.`] },
      ],
      signatory: 'Controller of Examinations',
    });
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 space-y-3">
        <Input label="Find a student" placeholder="Enrolment number or name" value={q} onChange={e => setQ(e.target.value)} />
        {hits.isLoading && <Spinner />}
        <div className="divide-y divide-[#EDEFF3]">
          {(hits.data ?? []).map(h => (
            <button key={h.id} onClick={() => setPicked(h)} className={`w-full text-left py-2 px-1 cursor-pointer hover:bg-[#FEF9EC] ${picked?.id === h.id ? 'bg-[#FEF9EC]' : ''}`}>
              <p className="text-[13px] text-[#16264A] font-medium">{h.title}</p><p className="text-[11px] text-[#5A6577]">{h.subtitle}</p>
            </button>
          ))}
          {q.trim().length >= 2 && !hits.isLoading && (hits.data ?? []).length === 0 && <p className="text-[12px] text-[#5A6577] py-2">No student matches.</p>}
        </div>
      </div>
      <div className="lg:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px] p-5">
        {!picked ? <EmptyState title="Search for a student" description="Their record, results and transcript appear here." /> : profile.isLoading ? <Spinner /> : profile.isError ? <InlineAlert type="error">{errText(profile.error)}</InlineAlert> : profile.data && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[16px] font-semibold text-[#16264A]">{profile.data.name}</p><p className="text-[12px] text-[#5A6577] font-mono">{profile.data.enrolmentNo} · roll {profile.data.rollNo}</p></div>
              <Button size="sm" disabled={!(results.data ?? []).length} onClick={() => void transcript()}>Download transcript</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-[13px]">
              {[['Programme', profile.data.programme.name], ['Semester', profile.data.semester], ['College', profile.data.college.name], ['Date of birth', day(profile.data.dob)], ['Gender', profile.data.gender ?? '—'], ['Category', profile.data.category ?? '—'], ['Mobile', profile.data.mobile ?? '—'], ['Email', profile.data.email], ['APAAR', profile.data.apaarId ?? '—']].map(([l, v]) => (
                <div key={String(l)}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[#16264A]">{v}</p></div>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Results</p>
              {results.isLoading ? <Spinner /> : (results.data ?? []).length === 0 ? <p className="text-[13px] text-[#5A6577]">No results declared.</p> : (
                <table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] text-[#5A6577] uppercase"><th className="py-1">Semester</th><th>SGPA</th><th>CGPA</th><th>Credits</th><th>Outcome</th></tr></thead>
                  <tbody>{[...results.data!].sort((a, b) => a.semester - b.semester).map(r => <tr key={r.semester} className="border-t border-[#EDEFF3] tabular-nums"><td className="py-1.5">{r.semester}</td><td>{r.sgpa.toFixed(2)}</td><td>{r.cgpa.toFixed(2)}</td><td>{r.totalCredits}</td><td className={r.outcome === 'PASS' ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}>{r.outcome}</td></tr>)}</tbody></table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Corrections ─────────────────────────────────────────────────────────────

function Corrections({ corrections }: { corrections: ReturnType<typeof useCollection<RecordCorrection>> }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const [open, setOpen] = useState<Stored<RecordCorrection> | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = corrections.items.filter(c => view === 'all' || c.status === 'pending');

  async function decide(status: RecordCorrection['status']) {
    if (!open) return;
    if (status !== 'approved' && !note.trim()) { toast.error('Tell the student why'); return; }
    setBusy(true);
    try {
      if (status === 'approved') {
        // The record itself changes; the request only records that it did.
        const key = FIELD_KEY[open.field];
        let value: string = open.requested;
        if (key === 'dob') {
          const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
          value = m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { toast.error('Date of birth must be dd-mm-yyyy'); setBusy(false); return; }
        }
        await api(`/api/office/students/${open._studentId}`, { method: 'PATCH', body: { [key]: value, reason: `${open.id}: ${open.reason}` } });
      }
      corrections.update(open._rid ?? open.id, { status, deskNote: note.trim() || undefined, decidedAt: new Date().toISOString(), decidedBy: displayName(user) });
      toast.success(status === 'approved' ? 'Record corrected — the student can see it' : status === 'returned' ? 'Returned to the student' : 'Request rejected');
      void qc.invalidateQueries({ queryKey: ['records'] });
      setOpen(null); setNote('');
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#D3D8E0]">
        {(['pending', 'all'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{v === 'pending' ? 'To verify' : 'All'}</button>)}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('record-corrections', rows.map(c => ({ request: c.id, student: c._student?.name ?? '', enrolmentNo: c._student?.enrolmentNo ?? '', field: c.field, from: c.current, to: c.requested, reason: c.reason, raised: c.raisedAt.slice(0, 10), status: c.status, decidedBy: c.decidedBy ?? '' })))}>Export CSV</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No correction requests" description="Students request corrections from their profile; they arrive here." /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Request', 'Student', 'Field', 'Change', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{rows.map(c => (
            <tr key={c._rid ?? c.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{c.id}<p className="font-sans text-[11px]">{day(c.raisedAt)}</p></td>
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{c._student?.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{c._student?.enrolmentNo}</p></td>
              <td className="px-4 py-3 text-[#16264A]">{c.field}</td>
              <td className="px-4 py-3 text-[12px]"><span className="text-[#A8242C] line-through">{c.current || '—'}</span> → <span className="text-[#0E7A5F]">{c.requested}</span></td>
              <td className="px-4 py-3 text-[12px] capitalize">{c.status}</td>
              <td className="px-4 py-3 text-right">{c.status === 'pending' ? <Button size="sm" onClick={() => { setOpen(c); setNote(''); }}>Verify</Button> : <Button size="sm" variant="ghost" onClick={() => setOpen(c)}>View</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <CorrectionModal row={open} note={note} setNote={setNote} busy={busy} onClose={() => setOpen(null)} decide={decide} />
    </div>
  );
}

function CorrectionModal({ row, note, setNote, busy, onClose, decide }: { row: Stored<RecordCorrection> | null; note: string; setNote: (s: string) => void; busy: boolean; onClose: () => void; decide: (s: RecordCorrection['status']) => void }) {
  const proof = useFiles(row ? `student:record-correction/${row.id}` : null);
  const pending = row?.status === 'pending';
  return (
    <Modal open={!!row} onClose={onClose} title={row ? `${row.field} — ${row._student?.name ?? ''}` : ''} width="560px"
      footer={pending ? <>
        <Button size="sm" variant="destructive" loading={busy} onClick={() => decide('rejected')}>Reject</Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => decide('returned')}>Return</Button>
        <Button size="sm" loading={busy} onClick={() => decide('approved')}>Approve & correct record</Button>
      </> : <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>}>
      {row && (
        <div className="space-y-3 text-[13px]">
          <p><span className="text-[#5A6577]">On record:</span> <span className="text-[#A8242C]">{row.current || '—'}</span></p>
          <p><span className="text-[#5A6577]">Requested:</span> <span className="text-[#0E7A5F] font-medium">{row.requested}</span></p>
          <p><span className="text-[#5A6577]">Reason:</span> {row.reason}</p>
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Proof submitted</p>
            {proof.isLoading ? <Spinner /> : proof.files.length === 0 ? <p className="text-[#5A6577]">None.</p> : proof.files.map(f => <div key={f.id} className="flex justify-between py-1"><span className="text-[#16264A]">{f.name} <span className="text-[#5A6577]">{formatBytes(f.size)}</span></span><button onClick={() => void proof.download(f)} className="text-[#E0952A] hover:underline cursor-pointer">Open</button></div>)}
          </div>
          {pending ? <Input label="Note to the student (required to return or reject)" value={note} onChange={e => setNote(e.target.value)} /> : row.deskNote && <p className="text-[#5A6577]">Note: {row.deskNote} · {row.decidedBy} · {day(row.decidedAt)}</p>}
          {pending && <InlineAlert type="info">Approving changes the student's record at once and writes the change, with this request number, to the audit trail.</InlineAlert>}
        </div>
      )}
    </Modal>
  );
}

// ─── Record certificates ─────────────────────────────────────────────────────

function RecordCerts() {
  const [type, setType] = useState('');
  const q = useQuery({ queryKey: ['records', 'certs'], queryFn: () => api<{ requests: CertRow[] }>('/api/office/certificates') });
  const rows = (q.data?.requests ?? []).filter(r => RECORD_CERTS.includes(r.type) && (!type || r.type === type));
  return (
    <div className="space-y-3">
      <InlineAlert type="info">These are processed in the College Office certificate queue (fee, preparation, issue, dispatch). This view tracks them across colleges.</InlineAlert>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
          <Select value={type} onChange={e => setType(e.target.value)} className="w-60"><option value="">All record certificates</option>{RECORD_CERTS.map(t => <option key={t}>{t}</option>)}</Select>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('record-certificates', rows.map(r => ({ request: r.requestNo, type: r.type, student: r.studentName, enrolmentNo: r.enrolmentNo, stage: r.stage, requested: r.requestedOn.slice(0, 10), promised: r.slaDeadline.slice(0, 10), overdue: r.overdue ? 'yes' : '', feePaid: r.fee ? (r.feePaid ? 'yes' : 'no') : 'free' })))}>Export CSV</Button>
        </div>
        {q.isLoading ? <div className="p-6 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No requests" /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Request', 'Type', 'Student', 'Stage', 'Promised by'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} className="border-b border-[#EDEFF3]">
                <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{r.requestNo}</td>
                <td className="px-4 py-3 text-[#16264A]">{r.type}</td>
                <td className="px-4 py-3"><p className="text-[#16264A]">{r.studentName}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.enrolmentNo}</p></td>
                <td className="px-4 py-3 text-[12px] capitalize">{r.stage.replace('_', ' ').toLowerCase()}{r.fee > 0 && !r.feePaid ? ' · fee unpaid' : ''}</td>
                <td className={`px-4 py-3 ${r.overdue ? 'text-[#A8242C] font-semibold' : 'text-[#5A6577]'}`}>{day(r.slaDeadline)}{r.overdue ? ' · overdue' : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

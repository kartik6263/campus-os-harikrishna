import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { downloadTemplate, readCSV } from '../../lib/export';
import { pickFiles } from '../../lib/records';
import { Button, Input, Modal, InlineAlert, Tabs, toast } from '../../components/ui';
import {
  useAdmissionQueue,
  useEnrolCandidate,
  useUpdateAdmissionDocument,
  type LegacyAdmissionStudent as AdmissionStudent,
} from '../../lib/officequeries';

interface Props {
  onModule: (m: string) => void;
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {right}
    </div>
  );
}

// ─── Fee Status Badge ─────────────────────────────────────────────────────────
function FeeStatusBadge({ status }: { status: 'unpaid' | 'partial' | 'paid' }) {
  const cfg = {
    paid: { bg: '#D1FAE5', color: '#0E7A5F', label: 'Paid' },
    partial: { bg: '#FEF9EC', color: '#8A6D1F', label: 'Partial' },
    unpaid: { bg: '#FEE2E2', color: '#A8242C', label: 'Unpaid' },
  }[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px]"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function AdmStatusBadge({ status }: { status: AdmissionStudent['status'] }) {
  const cfg = {
    pending_docs: { bg: '#FEF9EC', color: '#8A6D1F', label: 'Pending Docs' },
    verified: { bg: '#D1FAE5', color: '#0E7A5F', label: 'Verified' },
    enrolled: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Enrolled' },
    rejected: { bg: '#FEE2E2', color: '#A8242C', label: 'Rejected' },
  }[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[3px]"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── Document Verification Panel ──────────────────────────────────────────────
function DocVerificationPanel({
  student,
  onClose,
  onStudentUpdate,
}: {
  student: AdmissionStudent;
  onClose: () => void;
  onStudentUpdate: (updated: AdmissionStudent) => void;
}) {
  const updateDocument = useUpdateAdmissionDocument();
  const enrolCandidate = useEnrolCandidate();

  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);

  const docs = student.documents;
  const requiredDocs = docs.filter(d => d.required);
  const totalDocs = docs.length;
  const verifiedCount = docs.filter(d => d.verified).length;
  // The server decides this: every required paper produced and signed off.
  const allRequiredVerified = student.readyToEnrol;

  async function verifyDoc(doc: { id: string; name: string }) {
    try {
      await updateDocument.mutateAsync({
        applicationId: student.applicationId,
        documentId: doc.id,
        verified: true,
        ...(remarks[doc.name] ? { remarks: remarks[doc.name] } : {}),
      });
      toast.success(`${doc.name} verified`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not verify that document.');
    }
  }

  /** Records a paper the candidate has now produced. */
  async function receiveDoc(doc: { id: string; name: string }) {
    try {
      await updateDocument.mutateAsync({
        applicationId: student.applicationId,
        documentId: doc.id,
        uploaded: true,
        ...(remarks[doc.name] ? { remarks: remarks[doc.name] } : {}),
      });
      toast.success(`${doc.name} received`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record that document.');
    }
  }

  function completeVerification() {
    // The application's own status follows its checklist server-side, so
    // there is nothing to set here — it is already Verified.
    onStudentUpdate(student);
    toast.success('Verification complete — status updated to Verified');
  }

  async function issueEnrollmentId() {
    try {
      const result = await enrolCandidate.mutateAsync(student.applicationId);
      setEnrollmentId(result.enrolmentNo);
      toast.success(
        `Enrolled as ${result.enrolmentNo} — ${result.subjectsEnrolled} subject(s), sign-in ${result.email}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not enrol this candidate.');
    }
  }

  const pct = Math.round((verifiedCount / totalDocs) * 100);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[4px] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-[#D3D8E0]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#D3D8E0] flex-shrink-0">
          <div>
            <h2 className="text-[16px] font-semibold text-[#16264A]">{student.name}</h2>
            <p className="text-[12px] text-[#5A6577] font-mono">{student.id}</p>
          </div>
          <button onClick={onClose} className="text-[#5A6577] hover:text-[#16264A] cursor-pointer text-[20px] leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Student info band */}
          <div className="bg-[#EDEFF3] px-5 py-3 grid grid-cols-3 gap-4 text-[13px]">
            <div><span className="text-[#5A6577]">DOB:</span> <span className="text-[#16264A] font-medium">{student.dob}</span></div>
            <div><span className="text-[#5A6577]">Category:</span> <span className="text-[#16264A] font-medium">{student.category}</span></div>
            <div><span className="text-[#5A6577]">Gender:</span> <span className="text-[#16264A] font-medium">{student.gender}</span></div>
            <div><span className="text-[#5A6577]">Mobile:</span> <span className="text-[#16264A] font-medium">{student.mobile}</span></div>
            <div><span className="text-[#5A6577]">Email:</span> <span className="text-[#16264A] font-medium truncate">{student.email}</span></div>
            <div><span className="text-[#5A6577]">Programme:</span> <span className="text-[#16264A] font-medium">{student.programme}</span></div>
            <div>
              <span className="text-[#5A6577]">Fee:</span>{' '}
              <FeeStatusBadge status={student.feeStatus} />
            </div>
          </div>

          {/* Completion bar */}
          <div className="px-5 py-3 border-b border-[#D3D8E0]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] text-[#5A6577]">{verifiedCount} of {totalDocs} documents verified</span>
              <span className="text-[12px] font-medium text-[#16264A]">{pct}%</span>
            </div>
            <div className="h-1.5 bg-[#EDEFF3] rounded-full overflow-hidden">
              <div className="h-full bg-[#0E7A5F] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Document table */}
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#EDEFF3]">
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Document</th>
                <th className="text-center px-3 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Required</th>
                <th className="text-center px-3 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Uploaded</th>
                <th className="text-center px-3 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Verified</th>
                <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-[#D3D8E0] hover:bg-[#FAFAFA]">
                  <td className="px-4 py-2.5 text-[#16264A] font-medium">{doc.name}</td>
                  <td className="px-3 py-2.5 text-center">
                    {doc.required ? (
                      <span className="text-[#A8242C] font-bold text-[12px]">✓ Required</span>
                    ) : (
                      <span className="text-[12px] px-1.5 py-0.5 bg-[#F1F5F9] text-[#5A6577] rounded-[3px]">Optional</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {doc.uploaded ? (
                      <span className="text-[#0E7A5F]">✓</span>
                    ) : (
                      <span className="text-[#A8242C] text-[12px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {doc.verified ? (
                      <span className="text-[#0E7A5F]">✓</span>
                    ) : (
                      <span className="text-[#D3D8E0]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {doc.uploaded && !doc.verified && (
                      <button
                        onClick={() => void verifyDoc(doc)}
                        className="text-[12px] px-2.5 py-1 bg-[#D1FAE5] text-[#0E7A5F] border border-[#0E7A5F]/20 rounded-[3px] font-medium hover:bg-[#A7F3D0] cursor-pointer transition-colors"
                      >
                        Verify ✓
                      </button>
                    )}
                    {doc.uploaded && doc.verified && (
                      <span className="text-[12px] text-[#0E7A5F]">
                        {doc.verifiedBy} · {doc.verifiedOn}
                      </span>
                    )}
                    {!doc.uploaded && doc.required && (
                      <div className="flex flex-col gap-1 items-start">
                        <span className="text-[11px] px-1.5 py-0.5 bg-[#FEF9EC] text-[#8A6D1F] rounded-[3px] inline-block">Not submitted</span>
                        <input
                          type="text"
                          placeholder="Add remark…"
                          value={remarks[doc.name] ?? doc.remarks ?? ''}
                          onChange={e => setRemarks(r => ({ ...r, [doc.name]: e.target.value }))}
                          className="border border-[#D3D8E0] rounded-[3px] px-2 py-0.5 text-[11px] text-[#16264A] outline-none focus:border-[#E0952A] w-40"
                        />
                        <button
                          onClick={() => void receiveDoc(doc)}
                          className="text-[11px] px-2 py-0.5 bg-[#EFF6FF] text-[#1D4ED8] border border-[#1D4ED8]/20 rounded-[3px] font-medium hover:bg-[#DBEAFE] cursor-pointer transition-colors"
                        >
                          Mark received
                        </button>
                      </div>
                    )}
                    {!doc.uploaded && !doc.required && (
                      <span className="text-[12px] text-[#5A6577]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-[#D3D8E0] flex items-center gap-3 flex-shrink-0">
          {enrollmentId && (
            <span className="text-[12px] font-mono bg-[#D1FAE5] text-[#0E7A5F] px-3 py-1 rounded-[3px] border border-[#0E7A5F]/20">
              Enrolment ID: {enrollmentId}
            </span>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          {student.status === 'verified' && !enrollmentId && (
            <Button variant="secondary" size="sm" onClick={issueEnrollmentId}>
              Issue Enrolment ID
            </Button>
          )}
          {student.status !== 'verified' && (
            <Button
              variant="primary"
              size="sm"
              disabled={!allRequiredVerified}
              onClick={completeVerification}
            >
              Complete Verification
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 1: Verification Queue ────────────────────────────────────────────────
function VerificationQueue() {
  const { data: queue } = useAdmissionQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = queue.find(s => s.id === selectedId) ?? null;
  const setSelected = (s: AdmissionStudent | null) => setSelectedId(s?.id ?? null);

  const pendingCount = queue.filter(s => s.status === 'pending_docs').length;
  const verifiedCount = queue.filter(s => s.status === 'verified').length;
  const enrolledCount = queue.filter(s => s.status === 'enrolled').length;

  function handleUpdate(_updated: AdmissionStudent) {
    // Nothing to hold: the queue refetches after every write.
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 border-b border-[#D3D8E0]">
        {[
          { label: 'Total Pending', value: pendingCount, color: '#8A6D1F', bg: '#FEF9EC' },
          { label: 'Verified Today', value: verifiedCount, color: '#0E7A5F', bg: '#D1FAE5' },
          { label: 'Enrolled', value: enrolledCount, color: '#1D4ED8', bg: '#EFF6FF' },
        ].map(stat => (
          <div key={stat.label} className="px-6 py-4 border-r border-[#D3D8E0] last:border-r-0">
            <p className="text-[11px] text-[#5A6577] uppercase tracking-wide mb-1">{stat.label}</p>
            <p className="text-[24px] font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <SectionLabel label="Admission Queue" />

      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#EDEFF3]">
            <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Admission ID</th>
            <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Name</th>
            <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Programme</th>
            <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Fee Status</th>
            <th className="text-left px-4 py-2 font-semibold text-[#5A6577] text-[11px] uppercase tracking-wide">Doc Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {queue.map(student => {
            const uploaded = student.documents.filter(d => d.uploaded).length;
            const verified = student.documents.filter(d => d.verified).length;
            const total = student.documents.length;
            return (
              <tr key={student.id} className="border-b border-[#D3D8E0] hover:bg-[#FAFAFA]">
                <td className="px-4 py-3 font-mono text-[12px] text-[#16264A]">{student.id}</td>
                <td className="px-4 py-3 text-[#16264A] font-medium">{student.name}</td>
                <td className="px-4 py-3 text-[#5A6577]">{student.programme}</td>
                <td className="px-4 py-3"><FeeStatusBadge status={student.feeStatus} /></td>
                <td className="px-4 py-3">
                  <AdmStatusBadge status={student.status} />
                  <span className="ml-2 text-[11px] text-[#5A6577]">{verified}/{total} verified</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" size="sm" onClick={() => setSelected(student)}>
                    Review
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selected && (
        <DocVerificationPanel
          student={selected}
          onClose={() => setSelected(null)}
          onStudentUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

// ─── Tab 2: New Entry ─────────────────────────────────────────────────────────

/** The programmes candidates can apply to, as the system holds them. */
function usePrograms() {
  return useQuery({ queryKey: ['office', 'programmes'], queryFn: () => api<Array<{ code: string; name: string; shortName: string }>>('/api/office/curriculum') });
}

interface NewApplication { name: string; dob: string; gender?: string; category?: string; mobile?: string; email?: string; programmeCode: string; meritRank?: number }

function NewEntry() {
  const qc = useQueryClient();
  const programmes = usePrograms();
  const blank = { name: '', dob: '', gender: 'Male', category: 'General', mobile: '', email: '', programmeCode: '', meritRank: '' };
  const [form, setForm] = useState(blank);
  const set = (key: keyof typeof blank, val: string) => setForm(f => ({ ...f, [key]: val }));
  const programmeCode = form.programmeCode || programmes.data?.[0]?.code || '';

  const create = useMutation({
    mutationFn: () => api<{ applicationNo: string }>('/api/office/admissions', {
      method: 'POST',
      body: {
        name: form.name.trim(), dob: form.dob, gender: form.gender, category: form.category, programmeCode,
        ...(form.mobile.trim() ? { mobile: form.mobile.trim() } : {}), ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.meritRank ? { meritRank: Number(form.meritRank) } : {}),
      } satisfies NewApplication,
    }),
    onSuccess: r => { toast.success(`Application ${r.applicationNo} opened — verify the documents in the queue`); setForm(blank); void qc.invalidateQueries({ queryKey: ['office'] }); },
  });

  return (
    <form onSubmit={e => { e.preventDefault(); create.mutate(); }} className="max-w-3xl mx-auto py-6 px-6 space-y-6">
      {create.isError && <InlineAlert type="error">{create.error instanceof ApiError ? create.error.message : 'Could not save the application.'}</InlineAlert>}
      <SectionLabel label="Candidate" />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Full name (as on documents)" value={form.name} onChange={e => set('name', e.target.value)} required />
        <Input label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={e => set('dob', e.target.value)} required />
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-medium text-[#16264A]">Gender</label>
          <div className="flex gap-4 py-2">{['Male', 'Female', 'Other'].map(g => <label key={g} className="flex items-center gap-2 cursor-pointer text-[13px] text-[#16264A]"><input type="radio" name="gender" checked={form.gender === g} onChange={() => set('gender', g)} />{g}</label>)}</div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-medium text-[#16264A]">Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)} className="h-9 px-3 text-[15px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px]">{['General', 'OBC', 'SC', 'ST', 'EWS'].map(c => <option key={c}>{c}</option>)}</select>
        </div>
        <Input label="Mobile" value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="10-digit mobile" />
        <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-medium text-[#16264A]">Programme</label>
          <select value={programmeCode} onChange={e => set('programmeCode', e.target.value)} className="h-9 px-3 text-[15px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px]">{(programmes.data ?? []).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        </div>
        <Input label="Merit rank (optional)" inputMode="numeric" value={form.meritRank} onChange={e => set('meritRank', e.target.value.replace(/\D/g, ''))} />
      </div>
      <p className="text-[12px] text-[#5A6577]">The document checklist (marksheets, transfer certificate, and the caste certificate for reserved categories) is opened with the application. Verify each paper in the queue; the candidate becomes a student when all required papers are verified and the fee is paid.</p>
      <div className="flex justify-end pt-2"><Button type="submit" loading={create.isPending} disabled={!form.name.trim() || !form.dob || !programmeCode}>Open application</Button></div>
    </form>
  );
}

// ─── Tab 3: Bulk Import ───────────────────────────────────────────────────────

const FIELDS: Array<{ key: keyof NewApplication; label: string; required: boolean; guess: RegExp }> = [
  { key: 'name', label: 'Name', required: true, guess: /name/i },
  { key: 'dob', label: 'Date of birth', required: true, guess: /dob|birth/i },
  { key: 'programmeCode', label: 'Programme code', required: true, guess: /programme|program|course/i },
  { key: 'gender', label: 'Gender', required: false, guess: /gender|sex/i },
  { key: 'category', label: 'Category', required: false, guess: /categ|caste/i },
  { key: 'mobile', label: 'Mobile', required: false, guess: /mobile|phone/i },
  { key: 'email', label: 'Email', required: false, guess: /mail/i },
  { key: 'meritRank', label: 'Merit rank', required: false, guess: /rank|merit/i },
];

/** dd-mm-yyyy, dd/mm/yyyy or yyyy-mm-dd → yyyy-mm-dd, or null. */
function normDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
}
const normGender = (s: string) => { const t = s.trim().toLowerCase(); return t.startsWith('m') ? 'Male' : t.startsWith('f') ? 'Female' : t ? 'Other' : undefined; };

function BulkImport() {
  const qc = useQueryClient();
  const programmes = usePrograms();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [filename, setFilename] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Array<{ row: number; ok: boolean; message: string }>>([]);
  const [running, setRunning] = useState(false);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const codes = new Set((programmes.data ?? []).map(p => p.code.toUpperCase()));

  async function choose() {
    const [file] = await pickFiles('.csv,text/csv');
    if (!file) return;
    try {
      const parsed = await readCSV(file);
      if (!parsed.length) { toast.error('That file has no rows'); return; }
      setRows(parsed); setFilename(file.name); setResults([]);
      const cols = Object.keys(parsed[0]!);
      setMapping(Object.fromEntries(FIELDS.map(f => [f.key, cols.find(c => f.guess.test(c)) ?? ''])));
    } catch { toast.error('Could not read that CSV file'); }
  }

  /** One row as the API wants it, or the reason it cannot be. */
  function build(r: Record<string, string>): NewApplication | string {
    const get = (k: keyof NewApplication) => (mapping[k] ? (r[mapping[k]!] ?? '').trim() : '');
    const name = get('name'), dob = normDate(get('dob')), programmeCode = get('programmeCode').toUpperCase();
    if (name.length < 2) return 'Name missing';
    if (!dob) return 'Date of birth not understood (use dd-mm-yyyy)';
    if (!codes.has(programmeCode)) return `Unknown programme code "${programmeCode}"`;
    const email = get('email'), rank = get('meritRank');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return 'Invalid email';
    return { name, dob, programmeCode, gender: normGender(get('gender')), category: get('category') || undefined, mobile: get('mobile') || undefined, email: email || undefined, meritRank: /^\d+$/.test(rank) ? Number(rank) : undefined };
  }

  const checked = rows.map(build);
  const valid = checked.filter(c => typeof c !== 'string').length;
  const missing = FIELDS.filter(f => f.required && !mapping[f.key]);

  async function commit() {
    setRunning(true);
    const out: typeof results = [];
    for (let i = 0; i < checked.length; i++) {
      const c = checked[i]!;
      if (typeof c === 'string') { out.push({ row: i + 2, ok: false, message: c }); continue; }
      try {
        const r = await api<{ applicationNo: string }>('/api/office/admissions', { method: 'POST', body: Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) });
        out.push({ row: i + 2, ok: true, message: r.applicationNo });
      } catch (e) { out.push({ row: i + 2, ok: false, message: e instanceof ApiError ? e.message : 'Failed' }); }
      setResults([...out]);
    }
    setRunning(false);
    void qc.invalidateQueries({ queryKey: ['office'] });
    toast.success(`${out.filter(o => o.ok).length} application(s) opened`);
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-6 space-y-5">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <p className="text-[14px] font-semibold text-[#16264A]">{filename || 'Upload a CSV of candidates'}</p>
          <p className="text-[12px] text-[#5A6577]">One row per candidate: name, date of birth, programme code (e.g. {(programmes.data ?? []).slice(0, 3).map(p => p.code).join(', ')}), and optionally gender, category, mobile, email, merit rank.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => downloadTemplate('admission-import', ['Name', 'Date of Birth', 'Programme Code', 'Gender', 'Category', 'Mobile', 'Email', 'Merit Rank'], ['Asha Verma', '14-08-2007', (programmes.data?.[0]?.code ?? 'BCA'), 'Female', 'OBC', '9876543210', 'asha@example.com', '12'])}>Download template</Button>
        <Button size="sm" onClick={() => void choose()}>{filename ? 'Choose another file' : 'Choose CSV'}</Button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5">
            <p className="text-[13px] font-semibold text-[#16264A] mb-3">Match your columns</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {FIELDS.map(f => (
                <label key={f.key} className="flex flex-col gap-1 text-[12px] text-[#5A6577]">{f.label}{f.required ? ' *' : ''}
                  <select value={mapping[f.key] ?? ''} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })} className="h-9 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px] bg-white text-[#16264A]"><option value="">— not in file —</option>{columns.map(c => <option key={c}>{c}</option>)}</select>
                </label>
              ))}
            </div>
          </div>
          <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
              <p className="text-[13px] text-[#16264A]">{rows.length} rows · <span className="text-[#0E7A5F]">{valid} ready</span>{rows.length - valid ? <span className="text-[#A8242C]"> · {rows.length - valid} with problems</span> : ''}</p>
              <Button size="sm" loading={running} disabled={missing.length > 0 || valid === 0 || results.length > 0} onClick={() => void commit()}>Open {valid} application(s)</Button>
            </div>
            {missing.length > 0 && <div className="p-3"><InlineAlert type="warning">Match a column for: {missing.map(m => m.label).join(', ')}.</InlineAlert></div>}
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <tbody>{rows.map((r, i) => { const c = checked[i]!; const res = results.find(x => x.row === i + 2); return (
                  <tr key={i} className={`border-b border-[#EDEFF3] ${typeof c === 'string' ? 'bg-[#FEF2F2]' : ''}`}>
                    <td className="px-3 py-1.5 text-[#5A6577] tabular-nums">{i + 2}</td>
                    <td className="px-3 py-1.5 text-[#16264A]">{mapping.name ? r[mapping.name] : ''}</td>
                    <td className="px-3 py-1.5 text-[#5A6577]">{mapping.programmeCode ? r[mapping.programmeCode] : ''}</td>
                    <td className={`px-3 py-1.5 ${res ? (res.ok ? 'text-[#0E7A5F]' : 'text-[#A8242C]') : typeof c === 'string' ? 'text-[#A8242C]' : 'text-[#0E7A5F]'}`}>{res ? (res.ok ? `✓ ${res.message}` : `✗ ${res.message}`) : typeof c === 'string' ? c : 'Ready'}</td>
                  </tr>
                ); })}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdmissionEntry({ onModule }: Props) {
  const [tab, setTab] = useState('queue');

  const tabs = [
    { id: 'queue', label: 'Verification Queue' },
    { id: 'new', label: 'New Entry' },
    { id: 'bulk', label: 'Bulk Import' },
  ];

  return (
    <div className="bg-white min-h-full">
      {/* Page header */}
      <div className="border-b border-[#D3D8E0] px-6 py-4">
        <h1 className="text-[18px] font-semibold text-[#16264A]">Admission Entry</h1>
        <p className="text-[13px] text-[#5A6577]">Manage student admissions, document verification, and enrolment</p>
      </div>

      <Tabs tabs={tabs} activeId={tab} onChange={setTab} />

      {tab === 'queue' && <VerificationQueue />}
      {tab === 'new' && <NewEntry />}
      {tab === 'bulk' && <BulkImport />}
    </div>
  );
}

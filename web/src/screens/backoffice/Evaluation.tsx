import { useState, useRef } from 'react';
import {
  Button, Input, Modal, InlineAlert, Spinner, StatusPill, Tabs, Toggle, toast,
} from '../../components/ui';
import {
  useCreateBundle,
  useEnterMarks,
  useExamSession,
  useMarksFoil,
  useSessionList,
} from '../../lib/examqueries';
import { inst } from '../../lib/institution';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

// ─── Types ────────────────────────────────────────────────────────────────────
type BundleStatus = 'unassigned' | 'received' | 'under_eval' | 'submitted' | 'double_val' | 'moderated';

interface BundleRow {
  bundleId: string;
  centreCode: string;
  subject: string;
  subjectCode: string;
  examinerName: string;
  examinerType: 'E1' | 'E2' | 'moderator';
  status: BundleStatus;
  studentCount: number;
  hasFlagged: boolean;
}

interface DVPair {
  rollNo: string;
  name: string;
  subjectCode: string;
  subjectName: string;
  E1: number;
  E2: number;
  gap: number;
  flagged: boolean;
  resolved: boolean;
  finalMark?: number;
  resolution?: string;
}

interface ExaminerAssignment {
  name: string;
  type: 'E1' | 'E2' | 'moderator';
  phone: string;
}

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INITIAL_BUNDLES: BundleRow[] = [
  { bundleId: 'BDL/GWL04/BCA501/001', centreCode: 'DC-04', subject: 'Software Engineering', subjectCode: 'BCA501', examinerName: 'Dr. S.K. Pandey', examinerType: 'E1', status: 'submitted', studentCount: 42, hasFlagged: true },
  { bundleId: 'BDL/GWL04/BCA501/002', centreCode: 'DC-04', subject: 'Software Engineering', subjectCode: 'BCA501', examinerName: 'Dr. R. Mishra', examinerType: 'E2', status: 'under_eval', studentCount: 38, hasFlagged: false },
  { bundleId: 'BDL/GWL01/BCA502/001', centreCode: 'DC-01', subject: 'Database Management', subjectCode: 'BCA502', examinerName: 'Dr. P. Gupta', examinerType: 'E1', status: 'received', studentCount: 55, hasFlagged: false },
  { bundleId: 'BDL/GWL01/BCA502/002', centreCode: 'DC-01', subject: 'Database Management', subjectCode: 'BCA502', examinerName: '', examinerType: 'E2', status: 'unassigned', studentCount: 55, hasFlagged: false },
  { bundleId: 'BDL/GWL02/BCA503/001', centreCode: 'DC-02', subject: 'Computer Networks', subjectCode: 'BCA503', examinerName: 'Dr. A. Verma', examinerType: 'E1', status: 'submitted', studentCount: 48, hasFlagged: false },
  { bundleId: 'BDL/GWL02/BCA503/002', centreCode: 'DC-02', subject: 'Computer Networks', subjectCode: 'BCA503', examinerName: '', examinerType: 'E2', status: 'unassigned', studentCount: 48, hasFlagged: false },
  { bundleId: 'BDL/MRN01/BCA501/001', centreCode: 'MRN-01', subject: 'Software Engineering', subjectCode: 'BCA501', examinerName: 'Prof. K. Tiwari', examinerType: 'E1', status: 'under_eval', studentCount: 31, hasFlagged: false },
  { bundleId: 'BDL/MRN01/BCA502/001', centreCode: 'MRN-01', subject: 'Database Management', subjectCode: 'BCA502', examinerName: 'Dr. S. Joshi', examinerType: 'E1', status: 'double_val', studentCount: 28, hasFlagged: true },
];

const INITIAL_DV_PAIRS: DVPair[] = [
  { rollNo: '0342', name: 'Priya Sharma', subjectCode: 'BCA501', subjectName: 'Software Engineering', E1: 52, E2: 38, gap: 14, flagged: true, resolved: false },
  { rollNo: '0357', name: 'Rahul Verma', subjectCode: 'BCA502', subjectName: 'Database Management', E1: 45, E2: 28, gap: 17, flagged: true, resolved: false },
  { rollNo: '0364', name: 'Anjali Patel', subjectCode: 'BCA503', subjectName: 'Computer Networks', E1: 62, E2: 40, gap: 22, flagged: true, resolved: false },
  { rollNo: '0371', name: 'Deepak Singh', subjectCode: 'BCA501', subjectName: 'Software Engineering', E1: 48, E2: 42, gap: 6, flagged: false, resolved: false },
  { rollNo: '0385', name: 'Sunita Rao', subjectCode: 'BCA502', subjectName: 'Database Management', E1: 55, E2: 49, gap: 6, flagged: false, resolved: false },
];

const EXAMINERS = [
  { name: 'Dr. S.K. Pandey', designation: 'Associate Professor', college: 'Model College, Demo City', subjects: 'BCA501, BCA504', bundlesAssigned: 2, status: 'Active' },
  { name: 'Dr. R. Mishra', designation: 'Assistant Professor', college: 'Govt. Science College', subjects: 'BCA501, BCA502', bundlesAssigned: 1, status: 'Active' },
  { name: 'Dr. P. Gupta', designation: 'Professor', college: 'Saraswati College, Demo City', subjects: 'BCA502, BCA503', bundlesAssigned: 1, status: 'Active' },
  { name: 'Dr. A. Verma', designation: 'Associate Professor', college: 'Rani Durgavati PG College', subjects: 'BCA503, BCA505', bundlesAssigned: 1, status: 'Active' },
  { name: 'Prof. K. Tiwari', designation: 'Professor', college: 'Govt. Degree College, Northfield', subjects: 'BCA501', bundlesAssigned: 1, status: 'Active' },
  { name: 'Dr. S. Joshi', designation: 'Senior Examiner', college: 'JU Department of CS', subjects: 'BCA502, BCA506', bundlesAssigned: 1, status: 'Active' },
];

const MODERATION_CASES = [
  { rollNo: '0357', name: 'Rahul Verma', subjectCode: 'BCA502', subjectName: 'Database Management', E1: 45, E2: 28, gap: 17, moderator: 'Dr. V.K. Srivastava', moderatorMark: null as number | null },
  { rollNo: '0364', name: 'Anjali Patel', subjectCode: 'BCA503', subjectName: 'Computer Networks', E1: 62, E2: 40, gap: 22, moderator: null as string | null, moderatorMark: null as number | null },
];

const DV_THRESHOLD = 14;

// ─── Status pill helper ────────────────────────────────────────────────────────
function BundleStatusPill({ status }: { status: BundleStatus }) {
  const cfg: Record<BundleStatus, { label: string; cls: string }> = {
    unassigned: { label: 'Unassigned', cls: 'bg-[#F0F1F3] text-[#5A6577] border border-[#D3D8E0]' },
    received: { label: 'Received', cls: 'bg-[#EBF3FF] text-[#1A56B0] border border-[#B3CCEE]' },
    under_eval: { label: 'Under Evaluation', cls: 'bg-[#FDF3DF] text-[#8A6D1F] border border-[#E0C97A]' },
    submitted: { label: 'Marks Submitted ✓', cls: 'bg-[#E8F6F2] text-[#0E7A5F] border border-[#9DD5C0]' },
    double_val: { label: 'Pending Double Val.', cls: 'bg-[#FDF3DF] text-[#8A6D1F] border border-[#E0C97A]' },
    moderated: { label: 'Moderated ✓', cls: 'bg-[#E8F6F2] text-[#0E7A5F] border border-[#9DD5C0]' },
  };
  const { label, cls } = cfg[status];
  return <span className={`inline-flex items-center px-2 py-0.5 text-[12px] font-medium rounded-[2px] ${cls}`}>{label}</span>;
}

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between border-b border-[#D3D8E0]">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {action}
    </div>
  );
}

// ─── Tab 1: Bundle Tracking ───────────────────────────────────────────────────
function BundleTracking() {
  const [bundles, setBundles] = useState<BundleRow[]>(INITIAL_BUNDLES);

  const counts = {
    total: 36,
    received: 28,
    under_eval: 14,
    submitted: 8,
    pending: 6,
  };

  function advanceStatus(bundleId: string) {
    setBundles(prev => prev.map(b => {
      if (b.bundleId !== bundleId) return b;
      const next: Record<BundleStatus, BundleStatus> = {
        unassigned: 'received',
        received: 'under_eval',
        under_eval: 'submitted',
        submitted: 'double_val',
        double_val: 'moderated',
        moderated: 'moderated',
      };
      return { ...b, status: next[b.status] };
    }));
  }

  function markGWL04Received() {
    setBundles(prev => prev.map(b =>
      b.centreCode === 'DC-04' && b.subjectCode === 'BCA501' && b.status === 'unassigned'
        ? { ...b, status: 'received' }
        : b
    ));
    toast.success('All DC-04 BCA501 bundles marked as received.');
  }

  const actionLabel: Partial<Record<BundleStatus, string>> = {
    unassigned: 'Assign Examiner',
    received: 'Start Evaluation',
    under_eval: 'Submit Marks',
  };

  return (
    <div>
      {/* Overview strip */}
      <div className="flex gap-0 border-b border-[#D3D8E0]">
        {[
          { label: 'Total Bundles', value: counts.total, cls: '' },
          { label: 'Received', value: counts.received, cls: 'text-[#1A56B0]' },
          { label: 'Under Evaluation', value: counts.under_eval, cls: 'text-[#8A6D1F]' },
          { label: 'Submitted', value: counts.submitted, cls: 'text-[#0E7A5F]' },
          { label: 'Pending', value: counts.pending, cls: 'text-[#A8242C]' },
        ].map((s, i) => (
          <div key={i} className={`flex-1 px-4 py-3 ${i > 0 ? 'border-l border-[#D3D8E0]' : ''}`}>
            <div className={`text-[22px] font-semibold ${s.cls || 'text-[#16264A]'}`}>{s.value}</div>
            <div className="text-[11px] text-[#5A6577]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bulk action */}
      <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
        <span className="text-[13px] text-[#5A6577]">Bulk action for DC-04 / BCA501 bundles</span>
        <Button variant="secondary" size="sm" onClick={markGWL04Received}>Mark Received</Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Bundle ID</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Centre</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Subject</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Examiner</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((b, i) => (
              <tr key={b.bundleId} className={`border-b border-[#D3D8E0] ${i % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}>
                <td className="px-4 py-3 font-mono text-[12px] text-[#16264A]">{b.bundleId}</td>
                <td className="px-4 py-3 text-[#5A6577]">{b.centreCode}</td>
                <td className="px-4 py-3 text-[#16264A]">
                  <div>{b.subject}</div>
                  <div className="text-[11px] font-mono text-[#5A6577]">{b.subjectCode}</div>
                </td>
                <td className="px-4 py-3 text-[#16264A]">
                  {b.examinerName || <span className="text-[#5A6577] italic">Unassigned</span>}
                  {b.examinerName && <span className="ml-1.5 text-[11px] text-[#5A6577]">({b.examinerType})</span>}
                </td>
                <td className="px-4 py-3"><BundleStatusPill status={b.status} /></td>
                <td className="px-4 py-3">
                  {actionLabel[b.status] && (
                    <Button size="sm" variant="secondary" onClick={() => advanceStatus(b.bundleId)}>
                      {actionLabel[b.status]}
                    </Button>
                  )}
                  {b.status === 'submitted' && b.hasFlagged && (
                    <Button size="sm" variant="secondary" onClick={() => { advanceStatus(b.bundleId); toast.success('Bundle sent for double valuation.'); }}>
                      Send for Double Val.
                    </Button>
                  )}
                  {b.status === 'double_val' && (
                    <Button size="sm" variant="secondary" onClick={() => { advanceStatus(b.bundleId); toast.success('Bundle sent to Moderation.'); }}>
                      Send to Moderation
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 2: Examiner Allocation ───────────────────────────────────────────────
function ExaminerAllocation() {
  const [assignments, setAssignments] = useState<Record<string, ExaminerAssignment>>({});
  const [modalBundle, setModalBundle] = useState<BundleRow | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', type: 'E1' as 'E1' | 'E2' | 'moderator', confirmed: false });

  const unassigned = INITIAL_BUNDLES.filter(b => b.status === 'unassigned');

  function assignExaminer() {
    if (!modalBundle || !form.name || !form.phone || !form.confirmed) return;
    setAssignments(prev => ({ ...prev, [modalBundle.bundleId]: { name: form.name, type: form.type, phone: form.phone } }));
    toast.success(`Dr. ${form.name} assigned as ${form.type} for ${modalBundle.bundleId}`);
    setModalBundle(null);
    setForm({ name: '', phone: '', type: 'E1', confirmed: false });
  }

  return (
    <div>
      <SectionLabel label="Unassigned Bundles" />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Bundle ID</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Centre</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Subject</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Students</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Assignment</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {unassigned.map((b, i) => {
              const asgn = assignments[b.bundleId];
              return (
                <tr key={b.bundleId} className={`border-b border-[#D3D8E0] ${i % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#16264A]">{b.bundleId}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{b.centreCode}</td>
                  <td className="px-4 py-3 text-[#16264A]">
                    <div>{b.subject}</div>
                    <div className="text-[11px] font-mono text-[#5A6577]">{b.subjectCode}</div>
                  </td>
                  <td className="px-4 py-3 text-[#16264A]">{b.studentCount}</td>
                  <td className="px-4 py-3">
                    {asgn
                      ? <span className="text-[#0E7A5F] font-medium">{asgn.name} ({asgn.type})</span>
                      : <span className="text-[#5A6577] italic">Not assigned</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="secondary" onClick={() => setModalBundle(b)}>Assign Examiner</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Examiner Directory */}
      <SectionLabel label="Examiner Directory" />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              {['Name', 'Designation', 'College', 'Subjects', 'Bundles Assigned', 'Status'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAMINERS.map((e, i) => (
              <tr key={e.name} className={`border-b border-[#D3D8E0] ${i % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}>
                <td className="px-4 py-3 font-medium text-[#16264A]">{e.name}</td>
                <td className="px-4 py-3 text-[#5A6577]">{e.designation}</td>
                <td className="px-4 py-3 text-[#5A6577]">{e.college}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#16264A]">{e.subjects}</td>
                <td className="px-4 py-3 text-center text-[#16264A]">{e.bundlesAssigned}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[#E8F6F2] text-[#0E7A5F] border border-[#9DD5C0]">{e.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assign Modal */}
      <Modal open={!!modalBundle} onClose={() => setModalBundle(null)} title="Assign Examiner"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalBundle(null)}>Cancel</Button>
            <Button variant="primary" onClick={assignExaminer} disabled={!form.name || !form.phone || !form.confirmed}>Assign</Button>
          </div>
        }
      >
        {modalBundle && (
          <div className="space-y-4">
            <div className="p-3 bg-[#EDEFF3] rounded-[2px] border border-[#D3D8E0] text-[12px]">
              <div className="font-mono text-[#16264A]">{modalBundle.bundleId}</div>
              <div className="text-[#5A6577]">{modalBundle.subject} — {modalBundle.centreCode}</div>
            </div>
            <Input label="Examiner Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Mobile Number" className="font-mono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <div>
              <label className="block text-[13px] font-medium text-[#16264A] mb-1.5">Examiner Type</label>
              <div className="flex gap-3">
                {(['E1', 'E2', 'moderator'] as const).map(t => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer text-[13px] text-[#16264A]">
                    <input type="radio" name="examType" checked={form.type === t} onChange={() => setForm(f => ({ ...f, type: t }))} className="accent-[#E0952A]" />
                    {t === 'E1' ? 'First Examiner' : t === 'E2' ? 'Second Examiner' : 'Moderator'}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.confirmed} onChange={e => setForm(f => ({ ...f, confirmed: e.target.checked }))} className="mt-0.5 accent-[#E0952A]" />
              <span className="text-[13px] text-[#16264A]">I confirm this examiner has the required subject specialisation for {modalBundle.subject}.</span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Tab 3: Marks Foil Entry ──────────────────────────────────────────────────
function MarksEntry() {
  const { current } = useSessionList();
  const sessionId = current?.sessionId ?? null;
  const session = useExamSession(sessionId);

  const [bundleId, setBundleId] = useState<string | null>(null);
  const { data: MARKS_FOIL, tolerance } = useMarksFoil(sessionId, bundleId);

  const createBundle = useCreateBundle();
  const enterMarks = useEnterMarks();

  const [subject, setSubject] = useState<string | null>(null);
  const selectedSubject = subject ?? MARKS_FOIL[0]?.subjectCode ?? '';
  const setSelectedSubject = setSubject;

  const [entryMode, setEntryMode] = useState<'E1' | 'E2'>('E1');
  const [marksInput, setMarksInput] = useState<Record<string, number | null>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const foil = MARKS_FOIL.find(f => f.subjectCode === selectedSubject) ?? MARKS_FOIL[0];
  const students = foil?.bundles.flatMap(b => b.students) ?? [];
  const maxExternal = foil?.maxExternal ?? 70;
  const openBundle = foil?.bundles[0] ?? null;

  /**
   * Draws the scripts for this paper as a bundle for the chosen examiner.
   *
   * A bundle is made up from the seating list, so only candidates who
   * actually sat at that centre get a script.
   */
  async function drawBundle() {
    if (!foil) return;
    try {
      const b = await createBundle.mutateAsync({
        paperId: foil.paperId,
        centreCode: 'DC-04',
        examinerName: `Examiner (${entryMode})`,
        examinerRole: entryMode,
      });
      setBundleId(b.id);
      setMarksInput({});
      toast.success(`${b.bundleNo} drawn — ${b.scripts} script(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not draw a bundle.');
    }
  }
  void session;

  function setMark(rollNo: string, val: string) {
    const n = val === '' ? null : Number(val);
    setMarksInput(prev => ({ ...prev, [rollNo]: n }));
  }

  function handleKeyDown(e: React.KeyboardEvent, rollNo: string, idx: number) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const next = students[idx + 1];
      if (next) inputRefs.current[next.rollNo]?.focus();
    }
  }

  /** The readings typed so far, against the candidates they belong to. */
  function pending() {
    return students
      .filter(s => marksInput[s.rollNo] !== undefined)
      .map(s => ({ studentId: s.studentId, mark: marksInput[s.rollNo] ?? null }));
  }

  async function push(submit: boolean) {
    if (!openBundle) {
      toast.error('Draw a bundle first.');
      return;
    }
    const marks = pending();
    if (marks.length === 0) {
      toast.error('Enter at least one mark.');
      return;
    }
    setSaveState('saving');
    try {
      const r = await enterMarks.mutateAsync({ bundleId: openBundle.id, marks, submit });
      setSaveState('saved');
      if (submit && r.flagged > 0) {
        toast.info(
          `Submitted. ${r.flagged} script(s) differ by more than ${r.tolerance} marks and need a moderator.`,
        );
      } else {
        toast.success(submit ? 'Marks submitted for double-valuation check.' : 'Draft saved.');
      }
    } catch (err) {
      setSaveState('idle');
      toast.error(err instanceof Error ? err.message : 'Could not save those marks.');
    }
  }

  function saveDraft() {
    void push(false);
  }

  function submitFinal() {
    setConfirmOpen(false);
    void push(true);
  }
  void tolerance;
  void drawBundle;

  const allFilled = students.every(s => marksInput[s.rollNo] !== undefined && marksInput[s.rollNo] !== null);

  return (
    <div>
      {/* Controls */}
      <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center gap-6">
        <div>
          <label className="block text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Subject</label>
          <select
            value={selectedSubject}
            onChange={e => { setSelectedSubject(e.target.value); setMarksInput({}); }}
            className="border border-[#D3D8E0] rounded-[4px] px-3 py-1.5 text-[13px] text-[#16264A] bg-white focus:outline-none focus:border-[#16264A]"
          >
            {MARKS_FOIL.map(f => (
              <option key={f.subjectCode} value={f.subjectCode}>{f.subjectCode} — {f.subjectName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Examiner</label>
          <div className="flex items-center gap-2">
            <span className={`text-[13px] ${entryMode === 'E1' ? 'font-semibold text-[#16264A]' : 'text-[#5A6577]'}`}>First Examiner (E1)</span>
            <Toggle on={entryMode === 'E2'} onChange={v => setEntryMode(v ? 'E2' : 'E1')} />
            <span className={`text-[13px] ${entryMode === 'E2' ? 'font-semibold text-[#16264A]' : 'text-[#5A6577]'}`}>Second Examiner (E2)</span>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={saveDraft} loading={saveState === 'saving'}>Save as Draft</Button>
          <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={!allFilled || saveState === 'saving'}>Submit Final Marks</Button>
        </div>
      </div>

      {saveState === 'saved' && (
        <div className="px-4 py-2 bg-[#E8F6F2] border-b border-[#9DD5C0] text-[13px] text-[#0E7A5F]">Marks saved successfully.</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Roll No</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Name</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Max External</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Enter Marks ({entryMode})</th>
              {entryMode === 'E2' && <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">E1 Score</th>}
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Validation</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, idx) => {
              const val = marksInput[s.rollNo];
              const isOver = val !== null && val !== undefined && val > maxExternal;
              const isNeg = val !== null && val !== undefined && val < 0;
              const hasError = isOver || isNeg;
              const internal = 24; // sample internal
              const total = val !== null && val !== undefined && !hasError ? internal + val : null;
              return (
                <tr key={s.rollNo} className={`border-b border-[#D3D8E0] ${idx % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#16264A]">{s.rollNo}</td>
                  <td className="px-4 py-3 text-[#16264A]">{s.name}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{maxExternal}</td>
                  <td className="px-4 py-3">
                    <input
                      ref={el => { inputRefs.current[s.rollNo] = el; }}
                      type="number"
                      min={0}
                      max={maxExternal}
                      value={val ?? ''}
                      onChange={e => setMark(s.rollNo, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, s.rollNo, idx)}
                      className={`w-24 border rounded-[4px] px-2 py-1 text-[13px] font-mono focus:outline-none ${hasError ? 'border-[#A8242C] text-[#A8242C]' : 'border-[#D3D8E0] text-[#16264A] focus:border-[#16264A]'}`}
                    />
                  </td>
                  {entryMode === 'E2' && (
                    <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{s.E1 ?? '—'}</td>
                  )}
                  <td className="px-4 py-3 text-[12px]">
                    {hasError
                      ? <span className="text-[#A8242C]">{isOver ? `Exceeds max (${maxExternal})` : 'Cannot be negative'}</span>
                      : total !== null
                        ? <span className="text-[#5A6577]">Total: <span className="font-semibold text-[#16264A]">{total}</span> / {foil.maxExternal + foil.maxInternal}</span>
                        : <span className="text-[#5A6577]">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm Modal */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Submit Final Marks"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submitFinal}>Confirm & Submit</Button>
          </div>
        }
      >
        <p className="text-[14px] text-[#16264A]">
          Once submitted, marks are <strong>locked</strong> for double-valuation check. This action cannot be undone by examiners. Only the Exam Controller can recall submitted marks.
        </p>
        <div className="mt-3 p-3 bg-[#FDF3DF] border border-[#E0C97A] rounded-[2px] text-[13px] text-[#8A6D1F]">
          {students.length} student records will be locked for {foil.subjectCode} ({entryMode}).
        </div>
      </Modal>
    </div>
  );
}

// ─── Tab 4: Double Valuation ──────────────────────────────────────────────────
function DoubleValuation() {
  const [dvPairs, setDvPairs] = useState<DVPair[]>(INITIAL_DV_PAIRS);
  const [resolveStudent, setResolveStudent] = useState<string | null>(null);
  const [resolutionMode, setResolutionMode] = useState<'average' | 'higher' | 'moderator' | 'manual'>('average');
  const [manualMark, setManualMark] = useState<number | null>(null);

  const resolving = resolveStudent ? dvPairs.find(d => d.rollNo === resolveStudent) : null;

  function computeFinal(): number | null {
    if (!resolving) return null;
    if (resolutionMode === 'average') return Math.round((resolving.E1 + resolving.E2) / 2);
    if (resolutionMode === 'higher') return Math.max(resolving.E1, resolving.E2);
    if (resolutionMode === 'manual') return manualMark;
    return null;
  }

  function applyResolution() {
    if (!resolveStudent) return;
    const finalMark = resolutionMode === 'moderator' ? undefined : (computeFinal() ?? undefined);
    setDvPairs(prev => prev.map(d =>
      d.rollNo === resolveStudent
        ? { ...d, resolved: true, finalMark, resolution: resolutionMode }
        : d
    ));
    toast.success(resolutionMode === 'moderator'
      ? `${resolving?.name} sent to Moderator.`
      : `Resolution applied: Final mark ${finalMark} for ${resolving?.name}.`
    );
    setResolveStudent(null);
    setResolutionMode('average');
    setManualMark(null);
  }

  function sendAllToModeration() {
    setDvPairs(prev => prev.map(d => d.flagged && !d.resolved ? { ...d, resolved: true, resolution: 'moderator' } : d));
    toast.info('All flagged cases sent to Moderation.');
  }

  function gapColor(gap: number, flagged: boolean): string {
    if (!flagged) return 'text-[#0E7A5F]';
    if (gap === DV_THRESHOLD) return 'text-[#8A6D1F]';
    return 'text-[#A8242C]';
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
        <div className="text-[13px] text-[#5A6577]">
          Double valuation threshold: gap &gt; <strong className="text-[#16264A]">{DV_THRESHOLD} marks</strong> (20% of 70) triggers mandatory review.
        </div>
        <Button variant="secondary" size="sm" onClick={sendAllToModeration}>Send all flagged to Moderation</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              {['Roll No', 'Name', 'Subject', 'E1 Score', 'E2 Score', 'Gap', 'Flag', 'Action'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dvPairs.map((d, i) => (
              <tr key={d.rollNo} className={`border-b border-[#D3D8E0] ${i % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}>
                <td className="px-4 py-3 font-mono text-[12px] text-[#16264A]">{d.rollNo}</td>
                <td className="px-4 py-3 text-[#16264A]">{d.name}</td>
                <td className="px-4 py-3 text-[#5A6577]">
                  <div className="font-mono text-[12px] text-[#16264A]">{d.subjectCode}</div>
                  <div className="text-[11px]">{d.subjectName}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[#16264A]">{d.E1}</td>
                <td className="px-4 py-3 font-mono text-[#16264A]">{d.E2}</td>
                <td className={`px-4 py-3 font-mono font-semibold ${gapColor(d.gap, d.flagged)}`}>{d.gap}</td>
                <td className="px-4 py-3">
                  {d.flagged
                    ? d.resolved
                      ? <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[#E8F6F2] text-[#0E7A5F] border border-[#9DD5C0]">
                          Resolved{d.resolution === 'moderator' ? ' → Moderator' : d.finalMark !== undefined ? ` (Final: ${d.finalMark})` : ''}
                        </span>
                      : <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[#FDECEA] text-[#A8242C] border border-[#E8A8AB]">Flagged — requires resolution</span>
                    : <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[#F0F1F3] text-[#5A6577] border border-[#D3D8E0]">Within tolerance</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {d.flagged && !d.resolved && (
                    <Button size="sm" variant="secondary" onClick={() => setResolveStudent(d.rollNo)}>Resolve</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resolve Modal */}
      <Modal open={!!resolveStudent} onClose={() => setResolveStudent(null)} title="Resolve Double Valuation Discrepancy"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setResolveStudent(null)}>Cancel</Button>
            <Button variant="primary" onClick={applyResolution}
              disabled={resolutionMode === 'manual' && (manualMark === null || manualMark < 0 || manualMark > 70)}>
              Apply Resolution
            </Button>
          </div>
        }
      >
        {resolving && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-[#D3D8E0] rounded-[2px] p-3 text-center">
                <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">E1 Score</div>
                <div className="text-[28px] font-semibold font-mono text-[#16264A]">{resolving.E1}</div>
              </div>
              <div className="border border-[#D3D8E0] rounded-[2px] p-3 text-center">
                <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">E2 Score</div>
                <div className="text-[28px] font-semibold font-mono text-[#16264A]">{resolving.E2}</div>
              </div>
            </div>
            <div className="text-center text-[13px] text-[#5A6577]">
              Gap: <span className={`font-semibold font-mono ${resolving.gap > DV_THRESHOLD ? 'text-[#A8242C]' : 'text-[#8A6D1F]'}`}>{resolving.gap} marks</span> — {resolving.subjectCode}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#16264A] mb-2">Resolution Method</label>
              <div className="space-y-2">
                {[
                  { id: 'average', label: `Average of E1 & E2`, detail: `→ ${Math.round((resolving.E1 + resolving.E2) / 2)} marks` },
                  { id: 'higher', label: `Higher of E1 & E2`, detail: `→ ${Math.max(resolving.E1, resolving.E2)} marks (${resolving.E1 >= resolving.E2 ? 'E1' : 'E2'} wins)` },
                  { id: 'moderator', label: 'Send to Moderator', detail: 'Assigns 3rd examiner for re-evaluation' },
                  { id: 'manual', label: 'Enter Manual Mark', detail: 'Exam Controller override' },
                ].map(opt => (
                  <label key={opt.id} className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="resolution" value={opt.id} checked={resolutionMode === opt.id as any} onChange={() => setResolutionMode(opt.id as any)} className="mt-0.5 accent-[#E0952A]" />
                    <span>
                      <span className="text-[13px] text-[#16264A]">{opt.label}</span>
                      <span className="ml-2 text-[12px] text-[#5A6577]">{opt.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {resolutionMode === 'manual' && (
              <div>
                <label className="block text-[13px] font-medium text-[#16264A] mb-1">Manual Mark (0–70)</label>
                <input
                  type="number" min={0} max={70}
                  value={manualMark ?? ''}
                  onChange={e => setManualMark(e.target.value === '' ? null : Number(e.target.value))}
                  className="border border-[#D3D8E0] rounded-[4px] px-3 py-1.5 text-[13px] font-mono text-[#16264A] w-28 focus:outline-none focus:border-[#16264A]"
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Tab 5: Moderation ────────────────────────────────────────────────────────
function Moderation() {
  const [cases, setCases] = useState(MODERATION_CASES.map(c => ({ ...c })));
  const [markInputs, setMarkInputs] = useState<Record<string, string>>({});

  function applyModeratorDecision(rollNo: string) {
    const val = Number(markInputs[rollNo]);
    if (isNaN(val) || val < 0 || val > 70) return;
    setCases(prev => prev.map(c => c.rollNo === rollNo ? { ...c, moderatorMark: val } : c));
    toast.success(`Moderator decision applied: Final mark ${val} for roll no. ${rollNo}.`);
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-[#D3D8E0] text-[13px] text-[#5A6577]">
        {cases.length} case(s) sent to moderation. Moderator marks finalize the result.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              {['Student', 'Subject', 'E1', 'E2', 'Gap', 'Moderator', 'Moderator Mark', 'Action'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.map((c, i) => (
              <tr key={c.rollNo} className={`border-b border-[#D3D8E0] ${i % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}>
                <td className="px-4 py-3">
                  <div className="text-[#16264A] font-medium">{c.name}</div>
                  <div className="font-mono text-[11px] text-[#5A6577]">{c.rollNo}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-[12px] text-[#16264A]">{c.subjectCode}</div>
                  <div className="text-[11px] text-[#5A6577]">{c.subjectName}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[#16264A]">{c.E1}</td>
                <td className="px-4 py-3 font-mono text-[#16264A]">{c.E2}</td>
                <td className="px-4 py-3 font-mono font-semibold text-[#A8242C]">{c.gap}</td>
                <td className="px-4 py-3 text-[#16264A]">
                  {c.moderator ?? <span className="text-[#5A6577] italic">To be assigned</span>}
                </td>
                <td className="px-4 py-3">
                  {c.moderatorMark !== null
                    ? <span className="font-mono font-semibold text-[#0E7A5F]">{c.moderatorMark}</span>
                    : (
                      <input
                        type="number" min={0} max={70}
                        value={markInputs[c.rollNo] ?? ''}
                        onChange={e => setMarkInputs(prev => ({ ...prev, [c.rollNo]: e.target.value }))}
                        placeholder="0–70"
                        className="border border-[#D3D8E0] rounded-[4px] px-2 py-1 text-[13px] font-mono text-[#16264A] w-20 focus:outline-none focus:border-[#16264A]"
                      />
                    )
                  }
                </td>
                <td className="px-4 py-3">
                  {c.moderatorMark !== null
                    ? <span className="text-[11px] text-[#0E7A5F]">Decision Applied ✓</span>
                    : (
                      <Button size="sm" variant="secondary"
                        disabled={!markInputs[c.rollNo]}
                        onClick={() => applyModeratorDecision(c.rollNo)}>
                        Apply Decision
                      </Button>
                    )
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Evaluation({ onNavigate, onModule }: Props) {
  const [activeTab, setActiveTab] = useState('bundle-tracking');

  const tabs = [
    { id: 'bundle-tracking', label: 'Bundle Tracking' },
    { id: 'examiner-allocation', label: 'Examiner Allocation' },
    { id: 'marks-entry', label: 'Marks Foil Entry' },
    { id: 'double-valuation', label: 'Double Valuation' },
    { id: 'moderation', label: 'Moderation' },
  ];

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      {/* Page header */}
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-4">
        <div className="text-[11px] text-[#5A6577] mb-0.5">Resolion Campus OS — {inst().name} / Evaluation</div>
        <h1 className="text-[20px] font-semibold text-[#16264A]">Evaluation Management</h1>
        <div className="text-[13px] text-[#5A6577] mt-0.5">Nov–Dec 2024 (Odd Semester) · BCA / MCA / B.Sc.</div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'border-[#16264A] text-[#16264A]'
                  : 'border-transparent text-[#5A6577] hover:text-[#16264A]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white border border-[#D3D8E0] m-4 rounded-[2px] overflow-hidden">
        {activeTab === 'bundle-tracking' && <BundleTracking />}
        {activeTab === 'examiner-allocation' && <ExaminerAllocation />}
        {activeTab === 'marks-entry' && <MarksEntry />}
        {activeTab === 'double-valuation' && <DoubleValuation />}
        {activeTab === 'moderation' && <Moderation />}
      </div>
    </div>
  );
}

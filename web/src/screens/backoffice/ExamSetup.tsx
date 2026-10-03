import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, InlineAlert, Spinner, Tabs, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAdvanceSession, useExamSessions, type ApiExamSession } from '../../lib/examqueries';
// Programmes are a prospectus, not a record the API keeps yet.
import { PROGRAMMES } from '../../lib/examdata';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/** Mirrors ATTENDANCE_THRESHOLD in the API's student module, which exam-form eligibility applies. */
const ATTENDANCE_THRESHOLD = 75;

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const iso = (d: string) => d.slice(0, 10);
const show = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  FORM_WINDOW_OPEN: 'Form Window Open',
  FORM_WINDOW_CLOSED: 'Form Window Closed',
  IN_PROGRESS: 'Examinations In Progress',
  EVALUATION: 'Evaluation',
  RESULT_PROCESSING: 'Result Processing',
  RESULT_PUBLISHED: 'Result Published',
};
const STATUS_TONE: Record<string, string> = {
  PLANNED: 'bg-[#F1F5F9] text-[#5A6577]',
  FORM_WINDOW_OPEN: 'bg-[#FEF9EC] text-[#8A6D1F]',
  FORM_WINDOW_CLOSED: 'bg-[#EFF6FF] text-[#1D4ED8]',
  IN_PROGRESS: 'bg-[#EFF6FF] text-[#1D4ED8]',
  EVALUATION: 'bg-[#F5F3FF] text-[#6D28D9]',
  RESULT_PROCESSING: 'bg-[#F5F3FF] text-[#6D28D9]',
  RESULT_PUBLISHED: 'bg-[#D1FAE5] text-[#0E7A5F]',
};
/** What the button that moves a sitting into each status says. */
const ADVANCE_LABEL: Record<string, string> = {
  FORM_WINDOW_OPEN: 'Open Form Window',
  FORM_WINDOW_CLOSED: 'Close Form Window',
  IN_PROGRESS: 'Start Examinations',
  EVALUATION: 'Move to Evaluation',
  RESULT_PROCESSING: 'Begin Result Processing',
  RESULT_PUBLISHED: 'Publish Results',
};

function SessionPill({ status }: { status: string }) {
  return <span className={`inline-flex px-2.5 py-1 text-[12px] font-medium rounded-[4px] ${STATUS_TONE[status] ?? 'bg-[#F1F5F9] text-[#5A6577]'}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between border-b border-[#D3D8E0]">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {action}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-[#D3D8E0] last:border-b-0">
      <span className="text-[11px] text-[#5A6577] uppercase tracking-wide font-medium">{label}</span>
      <span className={`text-[15px] text-[#16264A] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Session form (create, clone, edit) ──────────────────────────────────────

interface SessionForm {
  code: string; name: string; academicYear: string;
  formOpensOn: string; formClosesOn: string; lateClosesOn: string;
  examStartsOn: string; examEndsOn: string; resultTargetOn: string;
  regularFee: string; lateFee: string; backlogFee: string;
}

const DATE_FIELDS: Array<[keyof SessionForm, string]> = [
  ['formOpensOn', 'Form window opens'],
  ['formClosesOn', 'Form window closes'],
  ['lateClosesOn', 'Late window closes'],
  ['examStartsOn', 'Examinations start'],
  ['examEndsOn', 'Examinations end'],
  ['resultTargetOn', 'Result target'],
];

const blankForm = (): SessionForm => ({ code: '', name: '', academicYear: '', formOpensOn: '', formClosesOn: '', lateClosesOn: '', examStartsOn: '', examEndsOn: '', resultTargetOn: '', regularFee: '', lateFee: '', backlogFee: '' });

function formFrom(s: ApiExamSession, clone: boolean): SessionForm {
  // A clone keeps the fees and the shape of the calendar, a year on.
  const shift = (d: string) => {
    if (!clone) return iso(d);
    const t = new Date(d);
    t.setUTCFullYear(t.getUTCFullYear() + 1);
    return t.toISOString().slice(0, 10);
  };
  return {
    code: clone ? '' : s.code,
    name: clone ? '' : s.name,
    academicYear: clone ? s.academicYear.replace(/^(\d{4})-(\d{2})$/, (_, a: string, b: string) => `${+a + 1}-${String(+b + 1).padStart(2, '0')}`) : s.academicYear,
    formOpensOn: shift(s.formOpensOn), formClosesOn: shift(s.formClosesOn), lateClosesOn: shift(s.lateClosesOn),
    examStartsOn: shift(s.examStartsOn), examEndsOn: shift(s.examEndsOn), resultTargetOn: shift(s.resultTargetOn),
    regularFee: String(s.fees.regular), lateFee: String(s.fees.late), backlogFee: String(s.fees.backlog),
  };
}

function SessionModal({ mode, session, onClose }: { mode: 'create' | 'clone' | 'edit' | null; session: ApiExamSession | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SessionForm>(blankForm);
  const [opened, setOpened] = useState<string | null>(null);

  // Fill the form once per opening.
  const openKey = mode ? `${mode}:${session?.id ?? ''}` : null;
  if (openKey !== opened) {
    setOpened(openKey);
    if (mode) setForm(session && mode !== 'create' ? formFrom(session, mode === 'clone') : blankForm());
  }

  const editing = mode === 'edit' && session;
  const feesLocked = editing && session.status !== 'PLANNED';
  const set = (k: keyof SessionForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const fees = {
        ...(form.regularFee !== '' ? { regularFee: Number(form.regularFee) } : {}),
        ...(form.lateFee !== '' ? { lateFee: Number(form.lateFee) } : {}),
        ...(form.backlogFee !== '' ? { backlogFee: Number(form.backlogFee) } : {}),
      };
      const dates = Object.fromEntries(DATE_FIELDS.map(([k]) => [k, form[k]]));
      if (editing) {
        const { formOpensOn, ...rest } = dates;
        const body = session.status === 'PLANNED' ? { name: form.name.trim(), ...dates, ...fees } : { name: form.name.trim(), ...rest };
        void formOpensOn;
        return api(`/api/exam/sessions/${session.id}`, { method: 'PATCH', body });
      }
      return api('/api/exam/sessions', { method: 'POST', body: { code: form.code.trim(), name: form.name.trim(), academicYear: form.academicYear.trim(), ...dates, ...fees } });
    },
    onSuccess: () => {
      toast.success(editing ? 'Session updated' : 'Session created — it starts as Planned');
      void qc.invalidateQueries({ queryKey: ['exam'] });
      onClose();
    },
  });

  const missing = DATE_FIELDS.some(([k]) => !form[k]) || !form.name.trim() || (!editing && (!form.code.trim() || !/^\d{4}-\d{2}$/.test(form.academicYear.trim())));

  return (
    <Modal open={!!mode} onClose={onClose} width="620px"
      title={mode === 'edit' ? `Edit ${session?.code}` : mode === 'clone' ? `New session from ${session?.code}` : 'Create Exam Session'}
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={save.isPending} disabled={missing} onClick={() => save.mutate()}>{editing ? 'Save Changes' : 'Create Session'}</Button>
      </div>}>
      <div className="flex flex-col gap-4">
        {save.isError && <InlineAlert type="error">{errText(save.error)}</InlineAlert>}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Session code" value={form.code} onChange={set('code')} placeholder="e.g. EXAM/2026/ODD" disabled={!!editing} />
          <Input label="Academic year" value={form.academicYear} onChange={set('academicYear')} placeholder="2026-27" disabled={!!editing} />
          <div className="col-span-2"><Input label="Session name" value={form.name} onChange={set('name')} placeholder="e.g. Nov–Dec 2026 (Odd Semester)" /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {DATE_FIELDS.map(([k, label]) => (
            <Input key={k} label={label} type="date" value={form[k]} onChange={set(k)} disabled={!!editing && session.status !== 'PLANNED' && k === 'formOpensOn'} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Regular fee (₹)" inputMode="numeric" value={form.regularFee} onChange={e => setForm(f => ({ ...f, regularFee: e.target.value.replace(/\D/g, '') }))} disabled={!!feesLocked} placeholder={mode === 'create' ? 'Same as last' : undefined} />
          <Input label="Late fee (₹)" inputMode="numeric" value={form.lateFee} onChange={e => setForm(f => ({ ...f, lateFee: e.target.value.replace(/\D/g, '') }))} disabled={!!feesLocked} placeholder={mode === 'create' ? 'Same as last' : undefined} />
          <Input label="Backlog fee / paper (₹)" inputMode="numeric" value={form.backlogFee} onChange={e => setForm(f => ({ ...f, backlogFee: e.target.value.replace(/\D/g, '') }))} disabled={!!feesLocked} placeholder={mode === 'create' ? 'Same as last' : undefined} />
        </div>
        <InlineAlert type="info">
          {feesLocked
            ? 'Forms are being filled against these fees and the opening date, so they are fixed. Closing dates can still be extended.'
            : 'The calendar must run in order: form window, late window, examinations, then results. Dates and fees are fixed once the form window closes.'}
        </InlineAlert>
      </div>
    </Modal>
  );
}

// ─── Tab 1: Current session ──────────────────────────────────────────────────

function CurrentSessionTab({ sessions, loading }: { sessions: ApiExamSession[]; loading: boolean }) {
  const advance = useAdvanceSession();
  const [editing, setEditing] = useState(false);
  // The live sitting is the one whose results are not yet out.
  const s = sessions.find(x => x.status !== 'RESULT_PUBLISHED') ?? sessions[0] ?? null;

  if (loading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (!s) return <div className="p-8"><InlineAlert type="info">No examination session yet. Create one under the Sessions tab.</InlineAlert></div>;

  async function advanceTo(status: string) {
    if (!s) return;
    if (!window.confirm(`${ADVANCE_LABEL[status] ?? status} for ${s.name}? This cannot be undone.`)) return;
    try {
      await advance.mutateAsync({ id: s.id, status: status as 'IN_PROGRESS' });
      toast.success(`${s.name}: ${STATUS_LABEL[status]?.toLowerCase() ?? status}`);
    } catch (err) {
      toast.error(errText(err));
    }
  }

  const editable = ['PLANNED', 'FORM_WINDOW_OPEN'].includes(s.status);

  return (
    <div>
      <div className="bg-[#16264A] text-white px-6 py-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <div className="text-[20px] font-bold leading-tight">{s.name}</div>
          <div className="text-[14px] text-[#A0AABB] mt-1">Academic Year: {s.academicYear}</div>
          <div className="flex items-center gap-2 mt-2"><SessionPill status={s.status} /><span className="text-[13px] text-[#A0AABB]">Forms {show(s.formOpensOn)} – {show(s.formClosesOn)}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <button onClick={() => setEditing(true)} className="h-8 px-3 text-[13px] font-medium border border-white/30 text-white rounded-[4px] hover:bg-white/10 transition-colors cursor-pointer">Edit Session</button>
          )}
          {s.nextStatus.map(step => (
            <button key={step} disabled={advance.isPending} onClick={() => void advanceTo(step)}
              className="h-8 px-3 text-[13px] font-medium bg-[#E0952A] text-white rounded-[4px] hover:bg-[#C47E1E] transition-colors cursor-pointer disabled:opacity-50">
              {ADVANCE_LABEL[step] ?? step}
            </button>
          ))}
        </div>
      </div>

      <SectionLabel label="Session Details" />
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#D3D8E0]">
        <div className="px-6">
          <InfoRow label="Session code" value={s.code} mono />
          <InfoRow label="Form window" value={<span>{show(s.formOpensOn)} – {show(s.formClosesOn)} <span className="text-[12px] text-[#8A6D1F] ml-1">(late fee until {show(s.lateClosesOn)})</span></span>} />
          <InfoRow label="Examinations" value={`${show(s.examStartsOn)} – ${show(s.examEndsOn)}`} />
          <InfoRow label="Result target" value={show(s.resultTargetOn)} />
        </div>
        <div className="px-6">
          <InfoRow label="Regular exam fee" value={inr(s.fees.regular)} />
          <InfoRow label="Late fee" value={`${inr(s.fees.late)} additional`} />
          <InfoRow label="Backlog fee" value={`${inr(s.fees.backlog)} per paper`} />
          <InfoRow label="Papers · candidates seated · results" value={`${s.papers} · ${s.candidates} · ${s.results}`} />
        </div>
      </div>
      {s.nextStatus.includes('IN_PROGRESS') && (s.papers === 0 || s.candidates === 0) && (
        <div className="px-6 py-4"><InlineAlert type="warning">Before examinations can start, schedule papers and allocate candidates to centres.</InlineAlert></div>
      )}
      <SessionModal mode={editing ? 'edit' : null} session={s} onClose={() => setEditing(false)} />
    </div>
  );
}

// ─── Tab 2: Sessions ─────────────────────────────────────────────────────────

function SessionsTab({ sessions, loading }: { sessions: ApiExamSession[]; loading: boolean }) {
  const [modal, setModal] = useState<{ mode: 'create' | 'clone' | 'edit'; session: ApiExamSession | null } | null>(null);
  const [viewing, setViewing] = useState<ApiExamSession | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <span className="text-[14px] text-[#5A6577]">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
        <Button size="sm" onClick={() => setModal({ mode: 'create', session: null })}>+ New Session</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] min-w-[720px]">
            <thead>
              <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
                {['Session', 'Academic Year', 'Status', 'Examinations', 'Code', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wide">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sessions.map(sess => (
                <tr key={sess.id} className="border-b border-[#D3D8E0] hover:bg-[#EDEFF3]/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#16264A]">{sess.name}</td>
                  <td className="px-4 py-3 text-[#5A6577]">{sess.academicYear}</td>
                  <td className="px-4 py-3"><SessionPill status={sess.status} /></td>
                  <td className="px-4 py-3 text-[13px] text-[#5A6577]">{show(sess.examStartsOn)} – {show(sess.examEndsOn)}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-[#5A6577]">{sess.code}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setViewing(sess)} className="text-[12px] font-medium text-[#5A6577] hover:text-[#16264A] cursor-pointer mr-3">View</button>
                    {['PLANNED', 'FORM_WINDOW_OPEN'].includes(sess.status) && <button onClick={() => setModal({ mode: 'edit', session: sess })} className="text-[12px] font-medium text-[#5A6577] hover:text-[#16264A] cursor-pointer mr-3">Edit</button>}
                    <button onClick={() => setModal({ mode: 'clone', session: sess })} className="text-[12px] font-medium text-[#5A6577] hover:text-[#16264A] cursor-pointer">Clone</button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#5A6577]">No sessions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <SessionModal mode={modal?.mode ?? null} session={modal?.session ?? null} onClose={() => setModal(null)} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ''} width="560px"
        footer={<Button size="sm" variant="secondary" onClick={() => setViewing(null)}>Close</Button>}>
        {viewing && (
          <div className="grid grid-cols-2 gap-x-6">
            <InfoRow label="Code" value={viewing.code} mono />
            <InfoRow label="Status" value={<SessionPill status={viewing.status} />} />
            <InfoRow label="Form window" value={`${show(viewing.formOpensOn)} – ${show(viewing.formClosesOn)}`} />
            <InfoRow label="Late window closes" value={show(viewing.lateClosesOn)} />
            <InfoRow label="Examinations" value={`${show(viewing.examStartsOn)} – ${show(viewing.examEndsOn)}`} />
            <InfoRow label="Result target" value={show(viewing.resultTargetOn)} />
            <InfoRow label="Fees (regular / late / backlog)" value={`${inr(viewing.fees.regular)} / ${inr(viewing.fees.late)} / ${inr(viewing.fees.backlog)}`} />
            <InfoRow label="Results published" value={show(viewing.publishedAt)} />
            <InfoRow label="Papers" value={viewing.papers} />
            <InfoRow label="Candidates seated" value={viewing.candidates} />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Tab 3: Eligibility rules ────────────────────────────────────────────────

/** The rules exam-form eligibility actually applies, so the office sees what students will be held to. */
function EligibilityRulesTab() {
  return (
    <div>
      <div className="px-4 py-4 border-b border-[#D3D8E0]">
        <InlineAlert type="info">
          These are the rules the system applies when it checks each examination form: at least {ATTENDANCE_THRESHOLD}% attendance in every subject
          (backlog papers are exempt), and no fees outstanding. Individual exceptions are granted from the Eligibility Engine.
        </InlineAlert>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] min-w-[640px]">
          <thead>
            <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
              {['Programme', 'Code', 'Type', 'Min. attendance / subject', 'Fee clearance'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#5A6577] uppercase tracking-wide">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {PROGRAMMES.map(prog => (
              <tr key={prog.code} className="border-b border-[#D3D8E0]">
                <td className="px-4 py-3 text-[#16264A]"><div className="font-medium">{prog.name}</div><div className="text-[12px] text-[#5A6577]">{prog.duration} · {prog.semesters} semesters</div></td>
                <td className="px-4 py-3 font-mono text-[13px] text-[#5A6577]">{prog.code}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-[11px] font-semibold rounded-[2px] ${prog.type === 'UG' ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#F5F3FF] text-[#6D28D9]'}`}>{prog.type}</span></td>
                <td className="px-4 py-3 text-[#16264A]">{ATTENDANCE_THRESHOLD}%</td>
                <td className="px-4 py-3 text-[12px] text-[#0E7A5F] font-medium">Required</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'current', label: 'Current Session' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'programmes', label: 'Eligibility Rules' },
];

export default function ExamSetup({ onModule }: Props) {
  const [activeTab, setActiveTab] = useState('current');
  const q = useExamSessions();
  const sessions = q.data ?? [];

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0]">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => onModule('')} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">Back Office</button>
            <span className="text-[#D3D8E0]">/</span>
            <span className="text-[13px] text-[#16264A] font-medium">Exam Setup</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#16264A]">Examination Setup</h1>
          <p className="text-[14px] text-[#5A6577] mb-4">Create and run examination sessions: calendar, fees and lifecycle.</p>
          <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
        </div>
      </div>
      {q.isError && <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div>}
      <div className="bg-white mx-0 border-x-0 border-[#D3D8E0]">
        {activeTab === 'current' && <CurrentSessionTab sessions={sessions} loading={q.isPending} />}
        {activeTab === 'sessions' && <SessionsTab sessions={sessions} loading={q.isPending} />}
        {activeTab === 'programmes' && <EligibilityRulesTab />}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { downloadCSV } from '../../lib/export';
import { useDecideExamForm, useExamForms, type ApiExamForm } from '../../lib/officequeries';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

/**
 * Examination eligibility, over every examination form: what the record says
 * (attendance per subject against the threshold, fees outstanding), the
 * decision on each form, and the exceptions — forms cleared although the
 * record said otherwise, each with its written reason.
 */

const COMPUTED_LABEL: Record<ApiExamForm['computedEligibility'], string> = { ELIGIBLE: 'Eligible', SHORTAGE: 'Attendance short', FEE_DUE: 'Fee due' };
const COMPUTED_TONE: Record<ApiExamForm['computedEligibility'], string> = { ELIGIBLE: 'bg-[#D1FAE5] text-[#0E7A5F]', SHORTAGE: 'bg-[#FEE2E2] text-[#A8242C]', FEE_DUE: 'bg-[#FEF9EC] text-[#8A6D1F]' };
const DECISION_LABEL: Record<string, string> = { PENDING: 'Not decided', CLEARED: 'Cleared', ELIGIBLE: 'Held (eligible)', SHORTAGE: 'Held — shortage', FEE_DUE: 'Held — fee due' };
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function EligibilityEngine({ onModule }: Props) {
  const [tab, setTab] = useState('queue');
  const q = useExamForms();
  const forms = q.data?.forms ?? [];
  const t = q.data?.totals;
  const exceptions = forms.filter(f => f.eligibility === 'CLEARED' && f.computedEligibility !== 'ELIGIBLE');

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-white border-b border-[#D3D8E0]">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => onModule('')} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">Back Office</button>
            <span className="text-[#D3D8E0]">/</span><span className="text-[13px] text-[#16264A] font-medium">Eligibility & Scrutiny</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#16264A]">Eligibility & Scrutiny</h1>
          <p className="text-[14px] text-[#5A6577] mb-3">Every examination form checked against attendance (≥ {q.data?.threshold ?? 75}% per subject, backlog papers exempt) and fees.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {[['Forms', t?.total], ['Eligible', t?.eligible], ['Attendance short', t?.shortage], ['Fee due', t?.feeDue], ['Decision out of date', t?.stale]].map(([l, v]) => (
              <div key={String(l)} className="border border-[#D3D8E0] rounded-[4px] px-3 py-2"><p className="text-[20px] font-semibold text-[#16264A] tabular-nums">{v ?? '—'}</p><p className="text-[12px] text-[#5A6577]">{l}</p></div>
            ))}
          </div>
          <Tabs tabs={[{ id: 'queue', label: 'Scrutiny Queue' }, { id: 'programmes', label: 'By Programme' }, { id: 'exceptions', label: `Exceptions${exceptions.length ? ` (${exceptions.length})` : ''}` }]} activeId={tab} onChange={setTab} />
        </div>
      </div>
      <div className="p-6">
        {q.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : q.isError ? <InlineAlert type="error">{errText(q.error)}</InlineAlert> : (
          <>
            {tab === 'queue' && <Queue forms={forms} />}
            {tab === 'programmes' && <ByProgramme forms={forms} />}
            {tab === 'exceptions' && <Exceptions forms={exceptions} />}
          </>
        )}
      </div>
    </div>
  );
}

function Queue({ forms }: { forms: ApiExamForm[] }) {
  const [view, setView] = useState<'pending' | 'stale' | 'all'>('pending');
  const [computed, setComputed] = useState('');
  const [prog, setProg] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ApiExamForm | null>(null);
  const [remarks, setRemarks] = useState('');
  const decide = useDecideExamForm();
  const progs = [...new Set(forms.map(f => f.programme))].sort();
  const s = search.trim().toLowerCase();
  const rows = forms.filter(f => (view === 'all' || (view === 'pending' ? f.eligibility === 'PENDING' : f.stale)) && (!computed || f.computedEligibility === computed) && (!prog || f.programme === prog) &&
    (!s || f.studentName.toLowerCase().includes(s) || f.enrolmentNo.toLowerCase().includes(s) || f.formNo.toLowerCase().includes(s)));
  const current = open ? forms.find(f => f.id === open.id) ?? open : null;

  async function act(decision: 'CLEAR' | 'HOLD') {
    if (!current) return;
    try {
      await decide.mutateAsync({ id: current.id, decision, remarks: remarks.trim() || undefined });
      toast.success(decision === 'CLEAR' ? 'Form cleared — the student has been told' : 'Form held — the student has been told');
      setOpen(null); setRemarks('');
    } catch (e) { toast.error(errText(e)); }
  }
  async function clearAllEligible() {
    const ready = rows.filter(f => f.eligibility === 'PENDING' && f.computedEligibility === 'ELIGIBLE');
    if (!ready.length || !window.confirm(`Clear all ${ready.length} eligible form(s) in this view?`)) return;
    let n = 0;
    for (const f of ready) { try { await decide.mutateAsync({ id: f.id, decision: 'CLEAR' }); n++; } catch { break; } }
    toast.success(`${n} form(s) cleared`);
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        {(['pending', 'stale', 'all'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{v === 'pending' ? 'To decide' : v === 'stale' ? 'Out of date' : 'All'}</button>)}
        <Input placeholder="Search student, enrolment or form no." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={prog} onChange={e => setProg(e.target.value)} className="w-32"><option value="">All programmes</option>{progs.map(p => <option key={p}>{p}</option>)}</Select>
        <Select value={computed} onChange={e => setComputed(e.target.value)} className="w-44"><option value="">Any status</option>{Object.entries(COMPUTED_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('exam-eligibility', rows.map(f => ({ formNo: f.formNo, enrolmentNo: f.enrolmentNo, name: f.studentName, programme: f.programme, semester: f.semester, record: COMPUTED_LABEL[f.computedEligibility], subjectsShort: f.shortfalls, feeDue: f.feeDue, decision: DECISION_LABEL[f.eligibility] ?? f.eligibility, remarks: f.remarks ?? '' })))}>Export CSV</Button>
        <Button size="sm" loading={decide.isPending} disabled={!rows.some(f => f.eligibility === 'PENDING' && f.computedEligibility === 'ELIGIBLE')} onClick={() => void clearAllEligible()}>Clear all eligible</Button>
      </div>
      {view === 'stale' && <p className="px-4 py-2 text-[12px] text-[#9A5B00] border-b border-[#EDEFF3]">These forms were decided before the attendance or fee record changed. Review each again.</p>}
      {rows.length === 0 ? <div className="p-6"><EmptyState title="Nothing in this view" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Form', 'Student', 'Programme', 'Record says', 'Short / due', 'Decision', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{rows.map(f => (
              <tr key={f.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA]">
                <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{f.formNo}<p className="font-sans text-[11px]">{day(f.submittedOn)}</p></td>
                <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{f.studentName}</p><p className="font-mono text-[11px] text-[#5A6577]">{f.enrolmentNo}</p></td>
                <td className="px-4 py-3 text-[#5A6577]">{f.programme} Sem {f.semester}</td>
                <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${COMPUTED_TONE[f.computedEligibility]}`}>{COMPUTED_LABEL[f.computedEligibility]}</span></td>
                <td className="px-4 py-3 text-[12px] text-[#5A6577]">{f.shortfalls ? `${f.shortfalls} subject(s)` : ''}{f.shortfalls && f.feeDue ? ' · ' : ''}{f.feeDue ? `₹${f.feeDue.toLocaleString('en-IN')}` : ''}{!f.shortfalls && !f.feeDue ? '—' : ''}</td>
                <td className="px-4 py-3 text-[12px]">{DECISION_LABEL[f.eligibility] ?? f.eligibility}{f.stale && <span className="ml-1 text-[#9A5B00] font-semibold">· out of date</span>}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant={f.eligibility === 'PENDING' ? 'primary' : 'ghost'} onClick={() => { setOpen(f); setRemarks(f.remarks ?? ''); }}>{f.eligibility === 'PENDING' ? 'Scrutinise' : 'Review'}</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!current} onClose={() => setOpen(null)} title={current ? `${current.studentName} — ${current.formNo}` : ''} width="640px"
        footer={<><Button size="sm" variant="secondary" loading={decide.isPending} onClick={() => void act('HOLD')}>Hold</Button><Button size="sm" loading={decide.isPending} onClick={() => void act('CLEAR')}>Clear</Button></>}>
        {current && (
          <div className="space-y-4 text-[13px]">
            <p className="text-[#5A6577]">{current.programme} Semester {current.semester} · record says <b className="text-[#16264A]">{COMPUTED_LABEL[current.computedEligibility]}</b>{current.feeDue ? ` · ₹${current.feeDue.toLocaleString('en-IN')} outstanding` : ''}</p>
            <table className="w-full">
              <thead><tr className="text-left text-[11px] text-[#5A6577] uppercase"><th className="py-1">Subject</th><th>Kind</th><th className="text-right">Attended</th><th className="text-right">%</th></tr></thead>
              <tbody>{current.subjects.map(sub => (
                <tr key={sub.code} className="border-t border-[#EDEFF3]"><td className="py-1.5 text-[#16264A]">{sub.code} · {sub.name}</td><td className="text-[#5A6577] capitalize">{sub.kind.toLowerCase()}</td><td className="text-right tabular-nums">{sub.present}/{sub.held}</td><td className={`text-right tabular-nums font-medium ${sub.eligible ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>{sub.attendance.toFixed(1)}</td></tr>
              ))}</tbody>
            </table>
            {current.computedEligibility !== 'ELIGIBLE' && <InlineAlert type="warning">Clearing this form overrides the record. Write the reason — e.g. medical leave with certificate, sanctioned sports or NCC duty, or fee waiver order.</InlineAlert>}
            <Input label={current.computedEligibility !== 'ELIGIBLE' ? 'Reason (required to clear)' : 'Remarks (optional)'} value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={500} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function ByProgramme({ forms }: { forms: ApiExamForm[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, ApiExamForm[]>();
    for (const f of forms) { const k = `${f.programme}|${f.semester}`; m.set(k, [...(m.get(k) ?? []), f]); }
    return [...m.entries()].map(([k, list]) => ({ k, programme: k.split('|')[0]!, semester: Number(k.split('|')[1]), list })).sort((a, b) => a.programme.localeCompare(b.programme) || a.semester - b.semester);
  }, [forms]);
  if (!groups.length) return <EmptyState title="No examination forms yet" />;
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
      <table className="w-full text-[13px] min-w-[720px]">
        <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Programme', 'Forms', 'Eligible', 'Attendance short', 'Fee due', 'Decided', 'Cleared'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
        <tbody>{groups.map(g => {
          const c = (k: ApiExamForm['computedEligibility']) => g.list.filter(f => f.computedEligibility === k).length;
          const decided = g.list.filter(f => f.eligibility !== 'PENDING').length;
          return (
            <tr key={g.k} className="border-b border-[#EDEFF3] tabular-nums">
              <td className="px-4 py-3 text-[#16264A] font-medium">{g.programme} · Semester {g.semester}</td>
              <td className="px-4 py-3">{g.list.length}</td>
              <td className="px-4 py-3 text-[#0E7A5F]">{c('ELIGIBLE')}</td>
              <td className="px-4 py-3 text-[#A8242C]">{c('SHORTAGE')}</td>
              <td className="px-4 py-3 text-[#8A6D1F]">{c('FEE_DUE')}</td>
              <td className="px-4 py-3">{decided}/{g.list.length}<div className="h-1.5 bg-[#EDEFF3] rounded-full mt-1 w-24"><div className="h-full bg-[#0E7A5F] rounded-full" style={{ width: `${(decided / g.list.length) * 100}%` }} /></div></td>
              <td className="px-4 py-3">{g.list.filter(f => f.eligibility === 'CLEARED').length}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function Exceptions({ forms }: { forms: ApiExamForm[] }) {
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] text-[#5A6577]">Forms cleared although the record said otherwise, with the reason given. Auditors ask for this list.</p>
        <Button size="sm" variant="secondary" disabled={!forms.length} onClick={() => downloadCSV('eligibility-exceptions', forms.map(f => ({ formNo: f.formNo, enrolmentNo: f.enrolmentNo, name: f.studentName, programme: `${f.programme} Sem ${f.semester}`, record: COMPUTED_LABEL[f.computedEligibility], subjectsShort: f.shortfalls, feeDue: f.feeDue, reason: f.remarks ?? '', clearedBy: f.scrutinisedBy ?? '', clearedOn: f.scrutinisedAt?.slice(0, 10) ?? '' })))}>Export CSV</Button>
      </div>
      {forms.length === 0 ? <div className="p-6"><EmptyState title="No exceptions granted" /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Student', 'Record said', 'Reason', 'Cleared by'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{forms.map(f => (
            <tr key={f.id} className="border-b border-[#EDEFF3]">
              <td className="px-4 py-3"><p className="text-[#16264A] font-medium">{f.studentName}</p><p className="font-mono text-[11px] text-[#5A6577]">{f.enrolmentNo} · {f.programme} {f.semester}</p></td>
              <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${COMPUTED_TONE[f.computedEligibility]}`}>{COMPUTED_LABEL[f.computedEligibility]}</span></td>
              <td className="px-4 py-3 text-[#16264A]">{f.remarks}</td>
              <td className="px-4 py-3 text-[#5A6577]">{f.scrutinisedBy ?? '—'}<p className="text-[11px]">{day(f.scrutinisedAt)}</p></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

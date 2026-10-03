import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Modal, Spinner, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { downloadPdf } from '../../lib/export';
import { inst } from '../../lib/institution';
import { useResultsRecord } from '../../lib/queries';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (m: any) => void }

interface ExamState {
  student: { name: string; enrolmentNo: string; rollNo: string; semester: number; programme: string; college: string };
  session: null | { id: string; code: string; name: string; status: string; formOpensOn: string; formClosesOn: string; lateClosesOn: string; examStartsOn: string; examEndsOn: string; fees: { regular: number; late: number; backlog: number } };
  window: { open: boolean; late: boolean };
  term: string | null;
  subjects: Array<{ code: string; name: string }>;
  form: null | {
    id: string; formNo: string; submittedAt: string; eligibility: 'PENDING' | 'ELIGIBLE' | 'SHORTAGE' | 'FEE_DUE' | 'CLEARED';
    computed: 'ELIGIBLE' | 'SHORTAGE' | 'FEE_DUE' | null; shortfalls: number; remarks: string | null; scrutinisedBy: string | null; scrutinisedAt: string | null;
    subjects: Array<{ code: string; name: string; kind: string; attendance: number; present: number; held: number; eligible: boolean }>;
  };
  fee: { charged: number; paid: number };
  hallTicket: null | { rollNo: string; seatNo: string | null; centre: { code: string; name: string; city: string; district: string }; papers: Array<{ code: string; name: string; date: string; time: string }> };
  seated: boolean;
  revaluations: Array<{ id: string; applicationNo: string; code: string; subject: string; appliedAt: string; fee: number; feePaid: boolean; status: string; originalMark: number | null; revisedMark: number | null; changed: boolean; remarks: string | null }>;
}

const TABS = ['Exam Form', 'Hall Ticket', 'Results', 'Revaluation'] as const;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const DECISION: Record<string, { text: string; tone: string }> = {
  PENDING: { text: 'Submitted — awaiting scrutiny by the college office', tone: 'text-[#8A6D1F]' },
  CLEARED: { text: 'Cleared — you may sit the examination', tone: 'text-[#0E7A5F]' },
  ELIGIBLE: { text: 'Held by the college office', tone: 'text-[#A8242C]' },
  SHORTAGE: { text: 'Held — attendance shortage', tone: 'text-[#A8242C]' },
  FEE_DUE: { text: 'Held — fees outstanding', tone: 'text-[#A8242C]' },
};

function SectionHeader({ label }: { label: string }) {
  return <div className="bg-[#EDEFF3] px-4 py-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span></div>;
}

/**
 * The student's examinations: the form for the sitting taking forms (its fee
 * goes on the fee account), the hall ticket once seated, results, and
 * revaluation applications — all from the examination records.
 */
export default function Examination({ onNavigate }: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>('Exam Form');
  const q = useQuery({ queryKey: ['student', 'exam'], queryFn: () => api<ExamState>('/api/student/exam') });

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4">
        <h1 className="text-[18px] font-bold text-[#16264A]">Examinations</h1>
        <p className="text-[13px] text-[#5A6577] mt-0.5">{q.data?.session ? q.data.session.name : 'Forms, hall ticket, results and revaluation'}</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] overflow-x-auto"><div className="flex min-w-max">
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={{ minHeight: 44 }} className={`px-4 py-3 text-[13px] font-medium whitespace-nowrap cursor-pointer ${tab === t ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>{t}</button>)}
      </div></div>
      {tab === 'Results' ? <Results /> : q.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : (
        <div className="mt-3">
          {tab === 'Exam Form' && <ExamForm s={q.data!} onFees={() => onNavigate('fee')} />}
          {tab === 'Hall Ticket' && <HallTicket s={q.data!} />}
          {tab === 'Revaluation' && <Revaluation s={q.data!} onFees={() => onNavigate('fee')} />}
        </div>
      )}
    </div>
  );
}

function ExamForm({ s, onFees }: { s: ExamState; onFees: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [agree, setAgree] = useState(false);
  const submit = useMutation({
    mutationFn: () => api<{ formNo: string; fee: number; late: boolean }>('/api/student/exam/form', { method: 'POST', body: { declaration: true } }),
    onSuccess: r => { toast.success(`Form ${r.formNo} submitted — ${inr(r.fee)} added to your fee account`); setConfirm(false); void qc.invalidateQueries({ queryKey: ['student'] }); void qc.invalidateQueries({ queryKey: ['fees'] }); },
  });

  if (!s.session) return <div className="px-4"><EmptyState title="No examination scheduled yet" /></div>;
  const ses = s.session;
  const due = s.fee.charged - s.fee.paid;

  if (s.form) {
    const d = DECISION[s.form.eligibility] ?? DECISION.PENDING!;
    return (
      <div>
        <SectionHeader label="Your examination form" />
        <div className="bg-white px-4 py-4 border-b border-[#D3D8E0] space-y-2">
          <div className="flex justify-between"><span className="font-mono text-[13px] text-[#16264A]">{s.form.formNo}</span><span className="text-[12px] text-[#5A6577]">submitted {day(s.form.submittedAt)}</span></div>
          <p className={`text-[14px] font-semibold ${d.tone}`}>{d.text}</p>
          {s.form.remarks && <p className="text-[12px] text-[#5A6577]">Office remarks: {s.form.remarks}</p>}
          {s.form.eligibility === 'PENDING' && s.form.computed && s.form.computed !== 'ELIGIBLE' && (
            <InlineAlert type="warning">{s.form.computed === 'FEE_DUE' ? 'Your fee account shows dues. Clear them before scrutiny, or your form may be held.' : `Attendance is below the requirement in ${s.form.shortfalls} subject(s). Speak to your college office if you have a medical or duty leave certificate.`}</InlineAlert>
          )}
        </div>
        {s.fee.charged > 0 && <>
        <SectionHeader label="Examination fee" />
        <div className="bg-white px-4 py-4 border-b border-[#D3D8E0] flex items-center justify-between">
          <div><p className="text-[13px] text-[#16264A]">{inr(s.fee.charged)} charged · {inr(s.fee.paid)} paid</p>{due > 0 && <p className="text-[12px] text-[#A8242C]">{inr(due)} to pay by {day(ses.lateClosesOn)}</p>}</div>
          {due > 0 ? <Button size="sm" onClick={onFees}>Pay in Fees</Button> : <span className="text-[12px] font-semibold text-[#0E7A5F]">Paid</span>}
        </div>
        </>}
        <SectionHeader label="Subjects" />
        <div className="bg-white border-b border-[#D3D8E0]">
          {s.form.subjects.map(sub => (
            <div key={sub.code} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0 flex justify-between">
              <span className="text-[13px] text-[#16264A]"><span className="font-mono text-[#5A6577]">{sub.code}</span> {sub.name}</span>
              {sub.held > 0 && <span className={`text-[12px] font-medium ${sub.eligible ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>{sub.attendance.toFixed(0)}%</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader label={ses.name} />
      <div className="bg-white px-4 py-4 border-b border-[#D3D8E0] space-y-1 text-[13px]">
        <p className="text-[#16264A]">Forms: {day(ses.formOpensOn)} – {day(ses.formClosesOn)} <span className="text-[#5A6577]">(with late fee until {day(ses.lateClosesOn)})</span></p>
        <p className="text-[#16264A]">Examinations: {day(ses.examStartsOn)} – {day(ses.examEndsOn)}</p>
        <p className="text-[#16264A]">Fee: {inr(ses.fees.regular)}{s.window.late ? ` + late fee ${inr(ses.fees.late)}` : ''}</p>
      </div>
      {!s.window.open ? (
        <div className="p-4"><InlineAlert type="info">{ses.status === 'PLANNED' ? `Forms open on ${day(ses.formOpensOn)}.` : 'Examination forms are not being accepted now.'}</InlineAlert></div>
      ) : (
        <>
          <SectionHeader label={`Subjects for semester ${s.student.semester}`} />
          <div className="bg-white border-b border-[#D3D8E0]">
            {s.subjects.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#A8242C]">You are not enrolled in any subject this term. Contact your college office.</p> : s.subjects.map(sub => <div key={sub.code} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0 text-[13px] text-[#16264A]"><span className="font-mono text-[#5A6577]">{sub.code}</span> {sub.name}</div>)}
          </div>
          <div className="p-4">
            {s.window.late && <InlineAlert type="warning">The regular window has closed. A late fee of {inr(ses.fees.late)} applies.</InlineAlert>}
            <Button className="w-full mt-3" disabled={!s.subjects.length} onClick={() => setConfirm(true)}>Submit examination form</Button>
          </div>
        </>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit examination form"
        footer={<><Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button size="sm" loading={submit.isPending} disabled={!agree} onClick={() => submit.mutate()}>Submit</Button></>}>
        <div className="space-y-3 text-[13px]">
          {submit.isError && <InlineAlert type="error">{errText(submit.error)}</InlineAlert>}
          <p className="text-[#16264A]">{s.student.name} · {s.student.enrolmentNo} · {s.student.programme}, semester {s.student.semester}</p>
          <p className="text-[#5A6577]">{inr(ses.fees.regular + (s.window.late ? ses.fees.late : 0))} will be added to your fee account. Pay it online or at the counter before {day(ses.lateClosesOn)}.</p>
          <label className="flex items-start gap-2 cursor-pointer"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5" /><span className="text-[#5A6577]">I declare that the particulars are correct and that I will abide by the examination rules. I understand that my form is subject to attendance and fee scrutiny.</span></label>
        </div>
      </Modal>
    </div>
  );
}

function HallTicket({ s }: { s: ExamState }) {
  const t = s.hallTicket;
  if (!t) {
    return <div className="px-4"><EmptyState title="Hall ticket not issued yet" description={!s.form ? 'Submit your examination form first.' : s.form.eligibility !== 'CLEARED' ? 'Your form has to be cleared at scrutiny, and your fees paid, before you are seated.' : 'You will be seated at a centre shortly; your hall ticket appears here then.'} /></div>;
  }
  async function download() {
    await downloadPdf({
      title: 'Admit Card / Hall Ticket', subtitle: `${inst().name} · ${s.session?.name ?? ''}`, reference: `${t!.rollNo}${t!.seatNo ? ` · Seat ${t!.seatNo}` : ''}`,
      fileName: `hall-ticket-${s.student.rollNo}`,
      sections: [
        { fields: [['Name', s.student.name], ['Roll number', t!.rollNo], ['Enrolment number', s.student.enrolmentNo], ['Programme', `${s.student.programme}, semester ${s.student.semester}`], ['College', s.student.college], ['Centre', `${t!.centre.code} — ${t!.centre.name}, ${t!.centre.city}`], ['Seat', t!.seatNo ?? 'Displayed at the centre']] },
        { heading: 'Papers', table: { head: ['Date', 'Time', 'Code', 'Paper'], body: t!.papers.map(p => [day(p.date), p.time, p.code, p.name]) } },
        { text: ['Bring this hall ticket and a photo ID to every paper. Report 30 minutes before the start. Mobile phones and electronic devices are not allowed in the hall.'] },
      ],
      qr: `${t!.rollNo}|${s.student.enrolmentNo}|${s.session?.code ?? ''}`, signatory: 'Controller of Examinations',
    });
  }
  return (
    <div>
      <SectionHeader label="Hall ticket" />
      <div className="bg-white px-4 py-4 border-b border-[#D3D8E0] space-y-1 text-[13px]">
        <p className="text-[#16264A]"><b>Roll no.</b> {t.rollNo}{t.seatNo ? ` · Seat ${t.seatNo}` : ''}</p>
        <p className="text-[#16264A]"><b>Centre</b> {t.centre.code} — {t.centre.name}, {t.centre.city}</p>
      </div>
      <SectionHeader label="Timetable" />
      <div className="bg-white border-b border-[#D3D8E0]">
        {t.papers.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#5A6577]">The paper schedule is not published yet.</p> : t.papers.map(p => (
          <div key={p.code} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0 flex justify-between gap-2 text-[13px]"><span className="text-[#16264A]"><span className="font-mono text-[#5A6577]">{p.code}</span> {p.name}</span><span className="text-[#5A6577] shrink-0">{day(p.date)} · {p.time}</span></div>
        ))}
      </div>
      <div className="p-4"><Button className="w-full" onClick={() => void download()}>Download hall ticket (PDF)</Button></div>
    </div>
  );
}

function Results() {
  const { data: results, isPending, error } = useResultsRecord();
  const [open, setOpen] = useState<number | null>(null);
  if (isPending) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error) return <div className="p-4"><InlineAlert type="error">{errText(error)}</InlineAlert></div>;
  if (!results.length) return <div className="px-4 mt-3"><EmptyState title="No results declared yet" /></div>;
  const latest = [...results].sort((a, b) => b.sem - a.sem)[0]!;
  return (
    <div className="mt-3">
      <div className="bg-white px-4 py-4 border-b border-[#D3D8E0]">
        <p className="text-[13px] text-[#5A6577]">CGPA</p>
        <p className="text-[24px] font-bold text-[#16264A]">{latest.cgpa.toFixed(2)}</p>
        <p className="text-[12px] text-[#5A6577]">up to semester {latest.sem} · {results.reduce((n, r) => n + r.totalCredits, 0)} credits</p>
      </div>
      {[...results].sort((a, b) => b.sem - a.sem).map(r => (
        <div key={r.sem} className="bg-white border-b border-[#D3D8E0]">
          <button onClick={() => setOpen(open === r.sem ? null : r.sem)} className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer min-h-[52px]">
            <span className="text-[14px] font-semibold text-[#16264A]">Semester {r.sem} <span className="font-normal text-[12px] text-[#5A6577]">· declared {day(r.year)}</span></span>
            <span className="text-[13px] text-[#16264A]">SGPA {r.sgpa.toFixed(2)} · <span className={r.result === 'Pass' ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}>{r.result}</span></span>
          </button>
          {open === r.sem && (
            <div className="overflow-x-auto bg-[#FAFBFC] border-t border-[#D3D8E0]">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-[#EDEFF3]">{['Code', 'Subject', 'Int.', 'Ext.', 'Total', 'Grade'].map(h => <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-[#5A6577] uppercase">{h}</th>)}</tr></thead>
                <tbody>{r.subjects.map(sub => <tr key={sub.code} className="border-b border-[#EDEFF3]"><td className="px-3 py-2 font-mono text-[#5A6577]">{sub.code}</td><td className="px-3 py-2 text-[#16264A]">{sub.name}</td><td className="px-3 py-2 tabular-nums">{sub.internal}</td><td className="px-3 py-2 tabular-nums">{sub.external}</td><td className="px-3 py-2 tabular-nums font-semibold">{sub.total}</td><td className={`px-3 py-2 font-semibold ${sub.status === 'pass' ? 'text-[#0E7A5F]' : 'text-[#A8242C]'}`}>{sub.grade}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Revaluation({ s, onFees }: { s: ExamState; onFees: () => void }) {
  const qc = useQueryClient();
  const { data: results } = useResultsRecord();
  const [code, setCode] = useState('');
  const apply = useMutation({
    mutationFn: () => api<{ applicationNo: string; fee: number }>('/api/student/revaluations', { method: 'POST', body: { subjectCode: code } }),
    onSuccess: r => { toast.success(`Revaluation ${r.applicationNo} filed — ${inr(r.fee)} added to your fee account`); setCode(''); void qc.invalidateQueries({ queryKey: ['student', 'exam'] }); },
  });
  const latest = [...results].sort((a, b) => b.sem - a.sem)[0];
  const applied = new Set(s.revaluations.map(r => r.code));
  const choices = (latest?.subjects ?? []).filter(x => !applied.has(x.code));

  return (
    <div>
      <SectionHeader label="Apply" />
      <div className="bg-white px-4 py-4 border-b border-[#D3D8E0] space-y-3">
        <p className="text-[13px] text-[#5A6577]">Ask for a re-reading of a paper from your latest published result. ₹500 per paper, added to your fee account; the re-reading starts once it is paid. If your mark changes, your result is corrected automatically.</p>
        {apply.isError && <InlineAlert type="error">{errText(apply.error)}</InlineAlert>}
        {!latest ? <p className="text-[13px] text-[#5A6577]">No published result yet.</p> : (
          <div className="flex gap-2">
            <select value={code} onChange={e => setCode(e.target.value)} className="flex-1 h-10 px-3 text-[14px] border border-[#D3D8E0] rounded-[4px] bg-white">
              <option value="">Semester {latest.sem} — choose a paper…</option>
              {choices.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name} ({x.total})</option>)}
            </select>
            <Button disabled={!code} loading={apply.isPending} onClick={() => apply.mutate()}>Apply</Button>
          </div>
        )}
      </div>
      <SectionHeader label="My applications" />
      {s.revaluations.length === 0 ? <div className="px-4 py-3 bg-white text-[13px] text-[#5A6577]">None.</div> : (
        <div className="bg-white border-b border-[#D3D8E0]">
          {s.revaluations.map(r => (
            <div key={r.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0">
              <div className="flex justify-between gap-2"><span className="text-[13px] font-medium text-[#16264A]">{r.code} · {r.subject}</span><span className="text-[12px] font-semibold text-[#16264A]">{r.status === 'COMPLETED' ? (r.changed ? `Mark changed: ${r.originalMark} → ${r.revisedMark}` : 'No change') : r.status === 'UNDER_REVALUATION' ? 'Being re-read' : r.status === 'REJECTED' ? 'Rejected' : 'Applied'}</span></div>
              <p className="text-[11px] text-[#5A6577] font-mono">{r.applicationNo} · {day(r.appliedAt)}</p>
              {!r.feePaid && r.status === 'APPLIED' && <button onClick={onFees} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer mt-1">Pay ₹{r.fee} in Fees →</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

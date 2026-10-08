import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { downloadCSV } from '../../lib/export';
import {
  EVENT_LABEL, REQUEST_LABEL, STATUS_LABEL, STATUS_STYLE,
  commitGraduation, commitPromotion, day, decideRequest, rupees, signClearance, surrenderPass, transitionStudent,
  useGraduationSheet, useLifecycleMutation, useLifecycleOverview, usePromotionSheet, useRegister, useRequestQueue, useStudentLifecycle,
  type ClearanceItem, type HistoryEntry, type LifecycleAction, type ProgrammeCohorts, type QueueRow, type StudentLifecycle as Detail, type StudentStatus,
} from '../../lib/lifecycle';

/**
 * Student lifecycle management: the register of every student's standing,
 * the promotion sheet, graduation, students' own applications (break in
 * study, withdrawal, transfer) and the no-dues clearance a leaver needs.
 *
 * The registrar and administrator decide; the college office reads every
 * record and signs departmental no-dues. The server enforces the same split.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const STATUSES = Object.keys(STATUS_LABEL) as StudentStatus[];

function StatusBadge({ status }: { status: StudentStatus }) {
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-[2px] whitespace-nowrap ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#D3D8E0] bg-[#F7F8FA]">
        <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{title}</p>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider whitespace-nowrap">{children}</th>;
}

export default function StudentLifecycle() {
  const { user } = useAuth();
  const canDecide = user?.role === 'REGISTRAR' || user?.role === 'ADMIN';
  const [tab, setTab] = useState('overview');
  const [openId, setOpenId] = useState<string | null>(null);
  const [cohort, setCohort] = useState<{ programmeId: string; semester: string }>({ programmeId: '', semester: '' });
  const overview = useLifecycleOverview();
  const pending = overview.data?.pendingRequests ?? 0;

  const open = (id: string) => { setOpenId(id); setTab('register'); };

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Student Lifecycle</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Admission to alumni — standing, promotion, breaks, exits, no-dues and graduation</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'register', label: 'Register' },
            { id: 'promotion', label: 'Promotion' },
            { id: 'graduation', label: 'Graduation' },
            { id: 'requests', label: `Applications${pending ? ` (${pending})` : ''}` },
          ]}
          activeId={tab}
          onChange={(t) => { setTab(t); if (t !== 'register') setOpenId(null); }}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {!canDecide && <div className="mb-4"><InlineAlert type="info">You can read every record and sign departmental no-dues. Promotion, detention, exits and graduation are decided by the registrar.</InlineAlert></div>}
        {tab === 'overview' && <OverviewTab onOpen={open} onCohort={(programmeId, semester, final) => { setCohort({ programmeId, semester: String(semester) }); setTab(final ? 'graduation' : 'promotion'); }} />}
        {tab === 'register' && (openId ? <StudentRecord id={openId} canDecide={canDecide} onBack={() => setOpenId(null)} /> : <Register onOpen={setOpenId} />)}
        {tab === 'promotion' && <Promotion canDecide={canDecide} initial={cohort} programmes={overview.data?.programmes ?? []} onOpen={open} />}
        {tab === 'graduation' && <Graduation canDecide={canDecide} initial={cohort.programmeId} programmes={overview.data?.programmes ?? []} onOpen={open} />}
        {tab === 'requests' && <Applications canDecide={canDecide} onOpen={open} />}
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ onOpen, onCohort }: { onOpen: (id: string) => void; onCohort: (programmeId: string, semester: number, final: boolean) => void }) {
  const q = useLifecycleOverview();
  if (q.isLoading) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (q.isError || !q.data) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {STATUSES.map((s) => (
          <div key={s} className="bg-white border border-[#D3D8E0] rounded-[4px] px-3 py-3">
            <p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{STATUS_LABEL[s]}</p>
            <p className="text-[22px] font-semibold text-[#16264A] tabular-nums">{d.counts[s]}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-[#5A6577]">Current term: <span className="font-mono text-[#16264A]">{d.term}</span>{d.pendingRequests ? ` · ${d.pendingRequests} application${d.pendingRequests > 1 ? 's' : ''} awaiting a decision` : ''}</p>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Classes on the rolls">
          {d.programmes.length === 0 ? <EmptyState title="No programmes yet" description="Add programmes in the IT Cell console." /> : (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0]"><Th>Programme</Th><Th>Semester</Th><Th>Active / total</Th><Th /></tr></thead>
              <tbody>
                {d.programmes.flatMap((p) => p.semesters.map((s) => (
                  <tr key={`${p.id}-${s.semester}`} className="border-b border-[#EDEFF3]">
                    <td className="px-3 py-2 text-[#16264A]">{p.shortName}</td>
                    <td className="px-3 py-2 tabular-nums">{s.semester}{s.semester >= p.finalSemester ? ' (final)' : ''}</td>
                    <td className="px-3 py-2 tabular-nums">{s.active} / {s.total}</td>
                    <td className="px-3 py-2 text-right">{s.active > 0 && <Button size="sm" variant="secondary" onClick={() => onCohort(p.id, s.semester, s.semester >= p.finalSemester)}>{s.semester >= p.finalSemester ? 'Graduation' : 'Promotion sheet'}</Button>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Recent changes">
          {d.recent.length === 0 ? <EmptyState title="No changes recorded yet" description="Promotions, breaks, exits and graduations appear here." /> : (
            <div className="divide-y divide-[#EDEFF3]">
              {d.recent.map((e) => (
                <button key={e.id} onClick={() => onOpen(e.student.id)} className="w-full text-left py-2 cursor-pointer hover:bg-[#FEF9EC] px-1">
                  <p className="text-[13px] text-[#16264A]"><span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span> — {e.student.name} <span className="font-mono text-[11px] text-[#5A6577]">{e.student.enrolmentNo}</span></p>
                  <p className="text-[11px] text-[#5A6577]">{e.reason} · {e.by} · {day(e.at)}</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Register ────────────────────────────────────────────────────────────────

function Register({ onOpen }: { onOpen: (id: string) => void }) {
  const overview = useLifecycleOverview();
  const [status, setStatus] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [semester, setSemester] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const reg = useRegister({ status, programmeId, semester, q: search.length >= 2 ? search : undefined });
  const programme = overview.data?.programmes.find((p) => p.id === programmeId);
  const rows = reg.data?.students ?? [];

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-[#D3D8E0]">
        <div className="w-64"><Input label="Search" placeholder="Name, enrolment or roll number" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="w-44"><Select label="Standing" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></div>
        <div className="w-52"><Select label="Programme" value={programmeId} onChange={(e) => { setProgrammeId(e.target.value); setSemester(''); }}><option value="">All programmes</option>{(overview.data?.programmes ?? []).map((p) => <option key={p.id} value={p.id}>{p.shortName} — {p.name}</option>)}</Select></div>
        <div className="w-32"><Select label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)} disabled={!programme}><option value="">All</option>{programme && Array.from({ length: programme.finalSemester }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select></div>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('student-register', rows.map((r) => ({ enrolmentNo: r.enrolmentNo, rollNo: r.rollNo, name: r.name, programme: r.programme, semester: r.semester, batch: r.batch, standing: STATUS_LABEL[r.status], since: r.statusSince.slice(0, 10), feeDue: r.feeDue })))}>Export CSV</Button>
      </div>
      {reg.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : reg.isError ? <div className="p-4"><InlineAlert type="error">{errText(reg.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No students match" description="Change the filters or search." /></div> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Student</Th><Th>Programme</Th><Th>Sem</Th><Th>Batch</Th><Th>Standing</Th><Th>Since</Th><Th>Fee due</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#EDEFF3] hover:bg-[#FEF9EC] cursor-pointer" onClick={() => onOpen(r.id)}>
                    <td className="px-3 py-2.5"><p className="text-[#16264A] font-medium">{r.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.enrolmentNo}</p></td>
                    <td className="px-3 py-2.5">{r.programme}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.semester}/{r.finalSemester}</td>
                    <td className="px-3 py-2.5 text-[12px]">{r.batch}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2.5 text-[12px] text-[#5A6577]">{day(r.statusSince)}</td>
                    <td className={`px-3 py-2.5 tabular-nums ${r.feeDue ? 'text-[#A8242C]' : 'text-[#5A6577]'}`}>{r.feeDue ? rupees(r.feeDue) : '—'}</td>
                    <td className="px-3 py-2.5 text-right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[12px] text-[#5A6577]">Showing {reg.data!.shown} of {reg.data!.total}{reg.data!.total > reg.data!.shown ? ' — narrow the filters to see the rest' : ''}.</p>
        </>
      )}
    </div>
  );
}

// ─── One student's record ────────────────────────────────────────────────────

const ACTION_HELP: Record<LifecycleAction, string> = {
  SUSPEND: 'The student is taken off class rosters until reinstated. Their sign-in stays open.',
  REINSTATE: 'The student returns to their class rosters.',
  LEAVE: 'A sanctioned break in study. The student leaves the rosters and resumes later.',
  RESUME: 'The student returns from a break. Give a semester and term to enrol them in that semester\'s subjects, or leave blank to keep their current enrolment.',
  DETAIN: 'Year back: the student is taken off the rosters and readmitted later to repeat.',
  WITHDRAW: 'The student leaves the institution. Sign-in closes and a Transfer Certificate request is raised.',
  TRANSFER: 'The student moves to another institution. Sign-in closes; Transfer and Migration Certificate requests are raised.',
  RUSTICATE: 'Expulsion under the disciplinary rules. Sign-in closes at once. Quote the disciplinary order.',
  READMIT: 'The student returns to the rolls in the semester and term given and is enrolled in its subjects.',
  GRADUATE: 'Certifies the degree requirements complete. Provisional and Degree Certificate requests are raised.',
};

function StudentRecord({ id, canDecide, onBack }: { id: string; canDecide: boolean; onBack: () => void }) {
  const q = useStudentLifecycle(id);
  const [action, setAction] = useState<Detail['actions'][number] | null>(null);
  if (q.isLoading) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (q.isError || !q.data) return <div className="space-y-3"><Button size="sm" variant="secondary" onClick={onBack}>← Register</Button><InlineAlert type="error">{errText(q.error)}</InlineAlert></div>;
  const s = q.data;
  const blockedBy = (a: Detail['actions'][number]) =>
    a.action === 'GRADUATE' ? (s.graduation.eligible ? null : s.graduation.blockers.join('; '))
      : a.needsClearance && !s.clearance.complete ? `No-dues pending: ${s.clearance.pending.join(', ')}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={onBack}>← Register</Button>
        <div className="flex-1" />
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 flex flex-wrap items-start gap-6">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-3"><p className="text-[18px] font-semibold text-[#16264A]">{s.name}</p><StatusBadge status={s.status} /></div>
          <p className="font-mono text-[12px] text-[#5A6577] mt-0.5">{s.enrolmentNo} · roll {s.rollNo}</p>
          <p className="text-[13px] text-[#16264A] mt-2">{s.programme.name} · semester {s.semester} of {s.programme.finalSemester} · batch {s.batch}</p>
          <p className="text-[12px] text-[#5A6577]">{s.college} · {s.email}{s.mobile ? ` · ${s.mobile}` : ''}</p>
          <p className="text-[12px] text-[#5A6577] mt-1">{STATUS_LABEL[s.status]} since {day(s.statusSince)}{s.graduatedOn ? ` · graduated ${day(s.graduatedOn)}` : ''} · sign-in {s.signInOpen ? 'open' : 'closed'}{s.currentTerm ? ` · enrolled for ${s.currentTerm}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          {[
            ['CGPA', s.standing.cgpa !== null ? s.standing.cgpa.toFixed(2) : '—'],
            ['Credits earned', String(s.standing.creditsEarned)],
            ['Backlogs', String(s.standing.backlogs.length)],
            ['Attendance', s.standing.attendance !== null ? `${s.standing.attendance}%` : '—'],
          ].map(([l, v]) => <div key={l}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[18px] font-semibold text-[#16264A] tabular-nums">{v}</p></div>)}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Change standing">
            {!canDecide ? <p className="text-[13px] text-[#5A6577]">Standing is changed by the registrar.</p> : s.actions.length === 0 ? <p className="text-[13px] text-[#5A6577]">No change of standing is possible from {STATUS_LABEL[s.status].toLowerCase()}.</p> : (
              <div className="space-y-2">
                {s.actions.map((a) => {
                  const blocked = blockedBy(a);
                  return (
                    <div key={a.action} className="flex items-start gap-3 py-1.5 border-b border-[#EDEFF3] last:border-0">
                      <div className="flex-1">
                        <p className="text-[13px] font-medium text-[#16264A]">{a.label}</p>
                        <p className="text-[12px] text-[#5A6577]">{ACTION_HELP[a.action]}</p>
                        {blocked && <p className="text-[12px] text-[#A8242C] mt-0.5">Blocked — {blocked}</p>}
                      </div>
                      <Button size="sm" variant={['RUSTICATE', 'SUSPEND', 'WITHDRAW'].includes(a.action) ? 'destructive' : a.action === 'GRADUATE' ? 'primary' : 'secondary'} disabled={!!blocked} onClick={() => setAction(a)}>{a.label}</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <ClearancePanel student={s} canDecide={canDecide} />
          {s.standing.backlogs.length > 0 && (
            <Card title={`Subjects not cleared (${s.standing.backlogs.length})`}>
              <table className="w-full text-[13px]"><tbody>{s.standing.backlogs.map((b) => <tr key={b.code} className="border-b border-[#EDEFF3]"><td className="py-1.5 font-mono text-[12px]">{b.code}</td><td>{b.name}</td><td className="text-right text-[#5A6577]">Sem {b.semester}</td></tr>)}</tbody></table>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="History on the rolls"><History items={s.history} /></Card>
          {s.requests.length > 0 && (
            <Card title="Applications">
              <div className="space-y-2">
                {s.requests.map((r) => (
                  <div key={r.id} className="text-[13px] border-b border-[#EDEFF3] pb-2 last:border-0">
                    <p className="text-[#16264A] font-medium">{REQUEST_LABEL[r.kind]} <span className="font-mono text-[11px] text-[#5A6577]">{r.requestNo}</span></p>
                    <p className="text-[12px] text-[#5A6577]">{r.status.toLowerCase()} · {day(r.createdAt)}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      {action && <ActionModal student={s} action={action} onClose={() => setAction(null)} />}
    </div>
  );
}

function History({ items }: { items: HistoryEntry[] }) {
  if (items.length === 0) return <p className="text-[13px] text-[#5A6577]">Nothing recorded.</p>;
  return (
    <div className="flex flex-col">
      {items.map((e, i) => (
        <div key={e.id} className="flex gap-3 pb-3">
          <div className="flex flex-col items-center">
            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${i === 0 ? 'bg-[#E0952A]' : 'bg-[#0E7A5F]'}`} />
            {i < items.length - 1 && <div className="w-px flex-1 bg-[#D3D8E0] mt-1" />}
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#16264A]">{EVENT_LABEL[e.kind] ?? e.kind}{e.kind === 'PROMOTED' && e.toSemester ? ` to semester ${e.toSemester}` : ''}{e.term ? <span className="font-mono text-[11px] text-[#5A6577]"> · {e.term}</span> : null}</p>
            <p className="text-[12px] text-[#5A6577]">{day(e.effectiveOn)} · {e.by}{e.reference ? ` · Ref. ${e.reference}` : ''}</p>
            <p className="text-[12px] text-[#5A6577]">{e.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionModal({ student, action, onClose }: { student: Detail; action: Detail['actions'][number]; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [effectiveOn, setEffectiveOn] = useState(new Date().toISOString().slice(0, 10));
  const [semester, setSemester] = useState(action.reenrol === 'required' ? String(student.semester) : '');
  const [term, setTerm] = useState(action.reenrol ? student.suggestedTerm : '');
  const m = useLifecycleMutation(() => transitionStudent(student.id, {
    action: action.action, reason: reason.trim(), reference: reference.trim() || undefined, effectiveOn,
    ...(semester ? { semester: Number(semester), term: term.trim() } : {}),
  }));
  const needsRef = action.action === 'RUSTICATE' || action.action === 'GRADUATE';

  async function submit() {
    if (reason.trim().length < 5) { toast.error('Give a reason of at least five characters'); return; }
    if (needsRef && !reference.trim()) { toast.error('Quote the order or resolution number'); return; }
    if (action.reenrol === 'required' && (!semester || !term.trim())) { toast.error('Give the semester and term'); return; }
    if (semester && !term.trim()) { toast.error('Give the term for that semester'); return; }
    try {
      const r = await m.mutateAsync(undefined);
      toast.success(`${student.name}: now ${STATUS_LABEL[r.to].toLowerCase()}${r.enrolled ? ` · enrolled in ${r.enrolled} subjects` : ''}${r.certificates.length ? ` · raised ${r.certificates.join(', ')}` : ''}`);
      onClose();
    } catch (e) { toast.error(errText(e)); }
  }

  return (
    <Modal open onClose={onClose} title={`${action.label} — ${student.name}`} width="560px"
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" variant={['RUSTICATE', 'SUSPEND', 'WITHDRAW'].includes(action.action) ? 'destructive' : 'primary'} loading={m.isPending} onClick={() => void submit()}>Confirm {action.label.toLowerCase()}</Button></>}>
      <div className="space-y-3">
        <InlineAlert type={['RUSTICATE', 'WITHDRAW', 'TRANSFER'].includes(action.action) ? 'warning' : 'info'}>{ACTION_HELP[action.action]}</InlineAlert>
        <Input label="Reason (the student will read this)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={needsRef ? 'Order / resolution no. (required)' : 'Order / letter no.'} value={reference} onChange={(e) => setReference(e.target.value)} />
          <Input label="Effective from" type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
        </div>
        {action.reenrol && (
          <div className="grid grid-cols-2 gap-3">
            <Select label={action.reenrol === 'required' ? 'Rejoins in semester' : 'Rejoin in semester (optional)'} value={semester} onChange={(e) => setSemester(e.target.value)}>
              {action.reenrol === 'optional' && <option value="">Keep current enrolment</option>}
              {Array.from({ length: student.programme.finalSemester }, (_, i) => <option key={i + 1} value={i + 1}>Semester {i + 1}</option>)}
            </Select>
            <Input label="Term" placeholder="2026-27-ODD" value={term} onChange={(e) => setTerm(e.target.value)} disabled={!semester} hint="Odd semesters run in the ODD term" />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── No-dues ─────────────────────────────────────────────────────────────────

const WHERE_TO_CLEAR: Record<string, string> = {
  Accounts: 'Clears itself once the dues are paid at the fee counter.',
  Library: 'Clears itself once the library desk records the books returned and fines paid.',
  Transport: 'Take the bus pass back to clear transport.',
  Hostel: 'Clears itself once the hostel office vacates the room (Hostel → Residents); mess and rent dues show under Accounts.',
};

function ClearancePanel({ student, canDecide }: { student: Detail; canDecide: boolean }) {
  const [sign, setSign] = useState<{ item: ClearanceItem; cleared: boolean } | null>(null);
  const [remarks, setRemarks] = useState('');
  const m = useLifecycleMutation((v: { department: string; cleared: boolean; remarks?: string }) => signClearance(student.id, v));
  const pass = useLifecycleMutation(() => surrenderPass(student.id));
  const c = student.clearance;

  async function confirm() {
    if (!sign) return;
    const waiver = sign.item.automatic && sign.cleared;
    if (waiver && remarks.trim().length < 5) { toast.error('Give the reason and authority for the waiver'); return; }
    try {
      await m.mutateAsync({ department: sign.item.department, cleared: sign.cleared, remarks: remarks.trim() || undefined });
      toast.success(sign.cleared ? `${sign.item.department} ${waiver ? 'waived' : 'signed off'}` : `${sign.item.department} sign-off revoked`);
      setSign(null); setRemarks('');
    } catch (e) { toast.error(errText(e)); }
  }

  return (
    <Card title="No-dues clearance" action={<span className={`text-[11px] font-semibold ${c.complete ? 'text-[#0E7A5F]' : 'text-[#8A6D1F]'}`}>{c.complete ? 'Complete' : `${c.pending.length} pending`}</span>}>
      <p className="text-[12px] text-[#5A6577] mb-2">Needed before withdrawal, transfer or graduation.</p>
      <table className="w-full text-[13px]">
        <tbody>
          {c.items.map((i) => (
            <tr key={i.department} className="border-b border-[#EDEFF3] last:border-0 align-top">
              <td className="py-2 pr-3 w-28 font-medium text-[#16264A]">{i.department}</td>
              <td className="py-2 pr-3">
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-[2px] ${!i.applicable ? 'bg-[#EDEFF3] text-[#5A6577]' : i.cleared ? 'bg-[#D1FAE5] text-[#0E7A5F]' : 'bg-[#FEE2E2] text-[#A8242C]'}`}>{!i.applicable ? 'N/A' : i.waived ? 'Waived' : i.cleared ? 'Clear' : 'Due'}</span>
                <p className="text-[12px] text-[#5A6577] mt-0.5">{i.detail}</p>
                {i.signedBy && <p className="text-[11px] text-[#5A6577]">{i.signedBy} · {day(i.signedAt)}{i.remarks ? ` · ${i.remarks}` : ''}</p>}
                {i.automatic && !i.cleared && i.department !== 'Transport' && <p className="text-[11px] text-[#5A6577]">{WHERE_TO_CLEAR[i.department]}</p>}
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                {i.applicable && !i.automatic && (i.cleared
                  ? <Button size="sm" variant="ghost" onClick={() => { setSign({ item: i, cleared: false }); setRemarks(''); }}>Revoke</Button>
                  : <Button size="sm" variant="secondary" onClick={() => { setSign({ item: i, cleared: true }); setRemarks(''); }}>Sign off</Button>)}
                {i.department === 'Transport' && !i.cleared && <Button size="sm" variant="secondary" loading={pass.isPending} onClick={() => pass.mutate(undefined, { onSuccess: () => toast.success('Bus pass taken back'), onError: (e) => toast.error(errText(e)) })}>Take back pass</Button>}
                {i.automatic && canDecide && !i.cleared && i.department !== 'Transport' && <Button size="sm" variant="ghost" onClick={() => { setSign({ item: i, cleared: true }); setRemarks(''); }}>Waive…</Button>}
                {i.automatic && canDecide && i.waived && <Button size="sm" variant="ghost" onClick={() => { setSign({ item: i, cleared: false }); setRemarks(''); }}>Revoke waiver</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sign && (
        <Modal open onClose={() => setSign(null)} title={`${sign.item.department} — ${sign.cleared ? (sign.item.automatic ? 'waive' : 'sign off') : 'revoke'}`}
          footer={<><Button size="sm" variant="secondary" onClick={() => setSign(null)}>Cancel</Button><Button size="sm" loading={m.isPending} onClick={() => void confirm()}>Confirm</Button></>}>
          <div className="space-y-3">
            {sign.item.automatic && sign.cleared && <InlineAlert type="warning">This overrides the ledger: {sign.item.detail}. The waiver is written to the audit trail under your name.</InlineAlert>}
            <Input label={sign.item.automatic && sign.cleared ? 'Reason and authority (required)' : 'Remarks'} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ─── Promotion ───────────────────────────────────────────────────────────────

type Decision = 'PROMOTE' | 'DETAIN' | 'HOLD';

function CohortPicker({ programmes, programmeId, semester, onChange, finalOnly }: { programmes: ProgrammeCohorts[]; programmeId: string; semester?: string; onChange: (p: string, s: string) => void; finalOnly?: boolean }) {
  const p = programmes.find((x) => x.id === programmeId);
  return (
    <>
      <div className="w-64"><Select label="Programme" value={programmeId} onChange={(e) => onChange(e.target.value, '')}><option value="">Choose…</option>{programmes.map((x) => <option key={x.id} value={x.id}>{x.shortName} — {x.name}</option>)}</Select></div>
      {!finalOnly && (
        <div className="w-40"><Select label="From semester" value={semester} onChange={(e) => onChange(programmeId, e.target.value)} disabled={!p}>
          <option value="">Choose…</option>
          {p?.semesters.filter((s) => s.semester < p.finalSemester).map((s) => <option key={s.semester} value={s.semester}>Semester {s.semester} ({s.active})</option>)}
        </Select></div>
      )}
    </>
  );
}

function Promotion({ canDecide, initial, programmes, onOpen }: { canDecide: boolean; initial: { programmeId: string; semester: string }; programmes: ProgrammeCohorts[]; onOpen: (id: string) => void }) {
  const [programmeId, setProgrammeId] = useState(initial.programmeId);
  const [semester, setSemester] = useState(initial.semester);
  const [requireResult, setRequireResult] = useState('');
  const [maxBacklogs, setMaxBacklogs] = useState('');
  const [minAttendance, setMinAttendance] = useState('');
  const sheet = usePromotionSheet({ programmeId, semester, requireResult: requireResult || undefined, maxBacklogs: maxBacklogs || undefined, minAttendance: minAttendance || undefined });
  const [decisions, setDecisions] = useState<Record<string, { decision: Decision; reason: string }>>({});
  const [term, setTerm] = useState('');
  const [reference, setReference] = useState('');
  const [confirming, setConfirming] = useState(false);
  const commit = useLifecycleMutation(commitPromotion);

  // A fresh sheet resets the decisions to what the rules suggest.
  useEffect(() => {
    if (!sheet.data) return;
    setDecisions(Object.fromEntries(sheet.data.students.map((s) => [s.id, { decision: s.suggestion, reason: s.flags.join('; ') }])));
    setTerm(sheet.data.suggestedTerm);
  }, [sheet.data]);

  const counts = useMemo(() => {
    const v = Object.values(decisions);
    return { PROMOTE: v.filter((d) => d.decision === 'PROMOTE').length, DETAIN: v.filter((d) => d.decision === 'DETAIN').length, HOLD: v.filter((d) => d.decision === 'HOLD').length };
  }, [decisions]);

  async function submit() {
    if (!sheet.data) return;
    const rows = Object.entries(decisions).map(([studentId, d]) => ({ studentId, decision: d.decision, reason: d.reason.trim() || undefined }));
    if (rows.some((r) => r.decision === 'DETAIN' && (!r.reason || r.reason.length < 5))) { toast.error('Every detention needs a reason'); setConfirming(false); return; }
    try {
      const r = await commit.mutateAsync({ programmeId, semester: Number(semester), term: term.trim(), reference: reference.trim() || undefined, decisions: rows });
      toast.success(`${r.promoted} promoted to semester ${r.toSemester} (${r.term}, ${r.subjects} subjects), ${r.detained} detained${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`);
      if (r.skipped.length) toast.error(r.skipped.slice(0, 3).map((s) => `${s.name}: ${s.reason}`).join(' · '));
      setConfirming(false);
    } catch (e) { toast.error(errText(e)); setConfirming(false); }
  }

  const d = sheet.data;
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <CohortPicker programmes={programmes} programmeId={programmeId} semester={semester} onChange={(p, s) => { setProgrammeId(p); setSemester(s); }} />
        <div className="w-48"><Select label="Result must be published" value={requireResult} onChange={(e) => setRequireResult(e.target.value)}><option value="">Default (year change only)</option><option value="true">Yes</option><option value="false">No</option></Select></div>
        <div className="w-36"><Input label="Max backlogs" type="number" min={0} placeholder="No limit" value={maxBacklogs} onChange={(e) => setMaxBacklogs(e.target.value)} /></div>
        <div className="w-36"><Input label="Min attendance %" type="number" min={0} max={100} placeholder="No minimum" value={minAttendance} onChange={(e) => setMinAttendance(e.target.value)} /></div>
      </div>

      {!programmeId || !semester ? <EmptyState title="Choose a class" description="Pick a programme and the semester to promote from. The final semester graduates instead." /> :
        sheet.isLoading ? <div className="flex justify-center p-8"><Spinner /></div> :
        sheet.isError || !d ? <InlineAlert type="error">{errText(sheet.error)}</InlineAlert> :
        d.students.length === 0 ? <EmptyState title="No active students in this semester" /> : (
          <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
            <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-[#D3D8E0]">
              <p className="text-[13px] text-[#16264A] flex-1 min-w-[220px]"><span className="font-semibold">{d.programme.shortName}</span> semester {d.semester} → {d.toSemester} · {d.students.length} students · <span className="text-[#0E7A5F]">{counts.PROMOTE} promote</span> · <span className="text-[#A8242C]">{counts.DETAIN} detain</span> · {counts.HOLD} hold</p>
              <div className="w-40"><Input label="Into term" value={term} onChange={(e) => setTerm(e.target.value)} hint={`Semester ${d.toSemester} runs in ${d.toSemester % 2 ? 'ODD' : 'EVEN'}`} /></div>
              <div className="w-48"><Input label="Resolution / order no." value={reference} onChange={(e) => setReference(e.target.value)} /></div>
              <Button size="sm" variant="secondary" onClick={() => downloadCSV(`promotion-${d.programme.shortName}-sem${d.semester}`, d.students.map((s) => ({ rollNo: s.rollNo, enrolmentNo: s.enrolmentNo, name: s.name, resultPublished: s.resultDeclared ? 'yes' : 'no', cgpa: s.cgpa ?? '', backlogs: s.backlogs, attendance: s.attendance ?? '', feeDue: s.feeDue, decision: decisions[s.id]?.decision ?? '', reason: decisions[s.id]?.reason ?? '' })))}>Export</Button>
              {canDecide && <Button size="sm" disabled={counts.PROMOTE + counts.DETAIN === 0 || (counts.PROMOTE > 0 && d.nextSemesterSubjects === 0)} onClick={() => setConfirming(true)}>Commit decisions</Button>}
            </div>
            {d.nextSemesterSubjects === 0 && <div className="px-4 pt-3"><InlineAlert type="warning">Semester {d.toSemester} has no subjects in the curriculum yet. Add them under Syllabus & Curriculum before promoting — you can still detain or hold.</InlineAlert></div>}
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Student</Th><Th>Result</Th><Th>CGPA</Th><Th>Backlogs</Th><Th>Attendance</Th><Th>Fee due</Th><Th>Decision</Th><Th>Reason</Th></tr></thead>
                <tbody>
                  {d.students.map((s) => {
                    const dec = decisions[s.id] ?? { decision: s.suggestion, reason: '' };
                    const set = (patch: Partial<typeof dec>) => setDecisions((x) => ({ ...x, [s.id]: { ...dec, ...patch } }));
                    return (
                      <tr key={s.id} className={`border-b border-[#EDEFF3] ${s.flags.length ? 'bg-[#FFFBF2]' : ''}`}>
                        <td className="px-3 py-2"><button onClick={() => onOpen(s.id)} className="text-left cursor-pointer hover:underline"><p className="text-[#16264A] font-medium">{s.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{s.rollNo}</p></button></td>
                        <td className="px-3 py-2 text-[12px]">{s.resultDeclared ? 'Published' : <span className="text-[#8A6D1F]">Awaited</span>}</td>
                        <td className="px-3 py-2 tabular-nums">{s.cgpa !== null ? s.cgpa.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2 tabular-nums" title={s.backlogCodes.join(', ')}>{s.backlogs || '—'}</td>
                        <td className="px-3 py-2 tabular-nums">{s.attendance !== null ? `${s.attendance}%` : '—'}</td>
                        <td className={`px-3 py-2 tabular-nums ${s.feeDue ? 'text-[#A8242C]' : ''}`}>{s.feeDue ? rupees(s.feeDue) : '—'}</td>
                        <td className="px-3 py-2"><Select value={dec.decision} onChange={(e) => set({ decision: e.target.value as Decision })} disabled={!canDecide} className="w-32"><option value="PROMOTE">Promote</option><option value="DETAIN">Detain</option><option value="HOLD">Hold</option></Select></td>
                        <td className="px-3 py-2 min-w-[220px]"><input value={dec.reason} onChange={(e) => set({ reason: e.target.value })} disabled={!canDecide} placeholder={dec.decision === 'DETAIN' ? 'Required' : 'Optional'} className="w-full h-8 px-2 text-[12px] border border-[#D3D8E0] rounded-[4px] disabled:bg-[#F7F8FA]" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[12px] text-[#5A6577]">Rows tinted amber break a rule above. Hold leaves a student where they are for now. Promoting enrols each student in semester {d.toSemester}'s subjects for the term given, with the lecturer and room wherever the subject is already allocated.</p>
          </div>
        )}
      {confirming && d && (
        <Modal open onClose={() => setConfirming(false)} title="Commit the promotion sheet"
          footer={<><Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button><Button size="sm" loading={commit.isPending} onClick={() => void submit()}>Commit</Button></>}>
          <div className="space-y-2 text-[13px]">
            <p><b>{counts.PROMOTE}</b> students move to semester {d.toSemester} and are enrolled for <span className="font-mono">{term}</span>.</p>
            <p><b>{counts.DETAIN}</b> students are detained and leave the class rosters.</p>
            <InlineAlert type="warning">Once a new term has enrolments it becomes the current term for timetables and roll calls. Commit when the semester has ended.</InlineAlert>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Graduation ──────────────────────────────────────────────────────────────

function Graduation({ canDecide, initial, programmes, onOpen }: { canDecide: boolean; initial: string; programmes: ProgrammeCohorts[]; onOpen: (id: string) => void }) {
  const [programmeId, setProgrammeId] = useState(initial);
  const sheet = useGraduationSheet(programmeId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState('');
  const [effectiveOn, setEffectiveOn] = useState(new Date().toISOString().slice(0, 10));
  const commit = useLifecycleMutation(commitGraduation);
  useEffect(() => { setPicked(new Set((sheet.data?.students ?? []).filter((s) => s.eligible).map((s) => s.id))); }, [sheet.data]);

  async function submit() {
    if (reference.trim().length < 2) { toast.error('Quote the academic council / notification number'); return; }
    try {
      const r = await commit.mutateAsync({ studentIds: [...picked], reference: reference.trim(), effectiveOn });
      toast.success(`${r.graduated} graduated — provisional and degree certificate requests raised`);
      if (r.skipped.length) toast.error(`${r.skipped.length} skipped: ${r.skipped[0]!.reason}`);
    } catch (e) { toast.error(errText(e)); }
  }

  const d = sheet.data;
  const eligible = d?.students.filter((s) => s.eligible) ?? [];
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <CohortPicker programmes={programmes} programmeId={programmeId} onChange={(p) => setProgrammeId(p)} finalOnly />
        {d && <p className="text-[13px] text-[#5A6577] pb-2">Final semester {d.programme.finalSemester} · {d.students.length} on the rolls · {eligible.length} eligible · {d.graduated} graduated so far</p>}
      </div>
      {!programmeId ? <EmptyState title="Choose a programme" description="Its final-semester students and their eligibility appear here." /> :
        sheet.isLoading ? <div className="flex justify-center p-8"><Spinner /></div> :
        sheet.isError || !d ? <InlineAlert type="error">{errText(sheet.error)}</InlineAlert> :
        d.students.length === 0 ? <EmptyState title="No active students in the final semester" /> : (
          <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
            {canDecide && (
              <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-[#D3D8E0]">
                <div className="w-64"><Input label="Academic council / notification no." value={reference} onChange={(e) => setReference(e.target.value)} /></div>
                <div className="w-40"><Input label="Date of graduation" type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} /></div>
                <div className="flex-1" />
                <Button size="sm" disabled={picked.size === 0} loading={commit.isPending} onClick={() => void submit()}>Graduate {picked.size} selected</Button>
              </div>
            )}
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th /><Th>Student</Th><Th>CGPA</Th><Th>Credits</Th><Th>Eligibility</Th></tr></thead>
              <tbody>
                {d.students.map((s) => (
                  <tr key={s.id} className="border-b border-[#EDEFF3] align-top">
                    <td className="px-3 py-2">{s.eligible && canDecide && <Checkbox checked={picked.has(s.id)} onChange={(v) => setPicked((p) => { const n = new Set(p); if (v) n.add(s.id); else n.delete(s.id); return n; })} />}</td>
                    <td className="px-3 py-2"><button onClick={() => onOpen(s.id)} className="text-left cursor-pointer hover:underline"><p className="text-[#16264A] font-medium">{s.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{s.enrolmentNo}</p></button></td>
                    <td className="px-3 py-2 tabular-nums">{s.cgpa !== null ? s.cgpa.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{s.creditsEarned}</td>
                    <td className="px-3 py-2">{s.eligible ? <span className="text-[#0E7A5F] font-medium">Eligible</span> : <ul className="text-[12px] text-[#A8242C] list-disc pl-4">{s.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ─── Applications ────────────────────────────────────────────────────────────

function Applications({ canDecide, onOpen }: { canDecide: boolean; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState('PENDING');
  const q = useRequestQueue(status);
  const [open, setOpen] = useState<QueueRow | null>(null);
  const rows = q.data ?? [];
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#D3D8E0]">
        {[['PENDING', 'Awaiting decision'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Withdrawn'], ['', 'All']].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v!)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${status === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{l}</button>
        ))}
      </div>
      {q.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : q.isError ? <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No applications" description="Students apply for a break in study, to resume, to withdraw or to transfer from their profile." /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Application</Th><Th>Student</Th><Th>Kind</Th><Th>Reason</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#EDEFF3] align-top">
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#5A6577]">{r.requestNo}<p className="font-sans text-[11px]">{day(r.createdAt)}</p></td>
                <td className="px-3 py-2.5"><button onClick={() => onOpen(r.student.id)} className="text-left cursor-pointer hover:underline"><p className="text-[#16264A] font-medium">{r.student.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.student.enrolmentNo} · {r.student.programme} sem {r.student.semester}</p></button></td>
                <td className="px-3 py-2.5">{REQUEST_LABEL[r.kind]}{r.destination ? <p className="text-[11px] text-[#5A6577]">to {r.destination}</p> : null}{r.returnBy ? <p className="text-[11px] text-[#5A6577]">return by {day(r.returnBy)}</p> : null}</td>
                <td className="px-3 py-2.5 text-[12px] text-[#5A6577] max-w-[280px]">{r.reason}</td>
                <td className="px-3 py-2.5 text-[12px]">{r.status.toLowerCase()}{r.decisionNote ? <p className="text-[11px] text-[#5A6577]">{r.decisionNote}</p> : null}</td>
                <td className="px-3 py-2.5 text-right">{r.status === 'PENDING' && canDecide ? <Button size="sm" onClick={() => setOpen(r)}>Decide</Button> : <Button size="sm" variant="ghost" onClick={() => onOpen(r.student.id)}>Record</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && <DecideModal row={open} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </div>
  );
}

function DecideModal({ row, onClose, onOpen }: { row: QueueRow; onClose: () => void; onOpen: (id: string) => void }) {
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [semester, setSemester] = useState('');
  const [term, setTerm] = useState('');
  const detail = useStudentLifecycle(row.student.id);
  const m = useLifecycleMutation((approve: boolean) => decideRequest(row.id, { approve, note: note.trim(), reference: reference.trim() || undefined, ...(semester ? { semester: Number(semester), term: term.trim() } : {}) }));
  const exit = row.kind === 'WITHDRAWAL' || row.kind === 'TRANSFER';
  const clearance = detail.data?.clearance;

  async function decide(approve: boolean) {
    if (note.trim().length < 5) { toast.error('Write a note for the student'); return; }
    if (semester && !term.trim()) { toast.error('Give the term for that semester'); return; }
    try {
      await m.mutateAsync(approve);
      toast.success(approve ? 'Approved — the student\'s standing has changed' : 'Application rejected');
      onClose();
    } catch (e) { toast.error(errText(e)); }
  }

  return (
    <Modal open onClose={onClose} title={`${REQUEST_LABEL[row.kind]} — ${row.student.name}`} width="580px"
      footer={<><Button size="sm" variant="destructive" loading={m.isPending} onClick={() => void decide(false)}>Reject</Button><Button size="sm" loading={m.isPending} disabled={exit && clearance !== undefined && !clearance.complete} onClick={() => void decide(true)}>Approve</Button></>}>
      <div className="space-y-3 text-[13px]">
        <p className="text-[#5A6577]">{row.reason}</p>
        {row.destination && <p>Transferring to <b>{row.destination}</b></p>}
        {row.returnBy && <p>Expects to return by <b>{day(row.returnBy)}</b></p>}
        {exit && (detail.isLoading ? <Spinner /> : clearance && (clearance.complete
          ? <InlineAlert type="success">No-dues clearance is complete.</InlineAlert>
          : <InlineAlert type="warning">No-dues pending: {clearance.pending.join(', ')}. <button className="underline cursor-pointer" onClick={() => { onClose(); onOpen(row.student.id); }}>Open the record</button> to clear them before approving.</InlineAlert>))}
        <Input label="Note to the student (required)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Input label="Order / letter no." value={reference} onChange={(e) => setReference(e.target.value)} hint={`Defaults to ${row.requestNo}`} />
        {row.kind === 'RESUME' && detail.data && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Rejoin in semester" value={semester} onChange={(e) => { setSemester(e.target.value); if (!term) setTerm(detail.data!.suggestedTerm); }}>
              <option value="">Keep current enrolment</option>
              {Array.from({ length: detail.data.programme.finalSemester }, (_, i) => <option key={i + 1} value={i + 1}>Semester {i + 1}</option>)}
            </Select>
            <Input label="Term" value={term} onChange={(e) => setTerm(e.target.value)} disabled={!semester} placeholder="2026-27-ODD" />
          </div>
        )}
      </div>
    </Modal>
  );
}

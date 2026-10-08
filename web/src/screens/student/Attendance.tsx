import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, InlineAlert, Modal, SkeletonRow, toast } from '../../components/ui';
import QrScanner, { canScanQr } from '../../components/QrScanner';
import { api, ApiError } from '../../lib/api';
import { useAttendance, useStudentRecord, type AttendanceSubject } from '../../lib/queries';
import { downloadStoredFile, pickAndUpload, type StoredFileInfo } from '../../lib/records';
import { downloadPdf } from '../../lib/export';
import { CondonationSection, LeaveSection } from '../../components/AttendanceLeave';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (m: any) => void }

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
type Recent = { sessionId: string; date: string; status: Status };
type Subject = AttendanceSubject & { recent?: Recent[] };
interface Correction { id: string; code: string; subject: string; date: string; time: string; markedAs: string; requestedStatus: string; reason: string; attachment: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'; raisedAt: string; decidedAt: string | null; decisionNote: string | null }
interface ActiveClass { sessionId: string; code: string; subject: string; faculty: string; room: string; slot: string; expiresAt: string; alreadyMarked: boolean; markedAt: string | null }
interface HistoryRow { sessionId: string; date: string; time: string; room: string; faculty: string; status: Status; source: string | null; registerClosed: boolean; dispute: 'PENDING' | 'APPROVED' | 'REJECTED' | null }
interface History { code: string; subject: string; faculty: string; classes: HistoryRow[] }

const MARK: Record<Status, { letter: string; bg: string; fg: string; label: string }> = {
  PRESENT: { letter: 'P', bg: '#D1FAE5', fg: '#0E7A5F', label: 'Present' },
  ABSENT: { letter: 'A', bg: '#FEE2E2', fg: '#A8242C', label: 'Absent' },
  LATE: { letter: 'L', bg: '#FEF9EC', fg: '#8A6D1F', label: 'Late' },
  EXCUSED: { letter: 'E', bg: '#EFF6FF', fg: '#1D4ED8', label: 'Excused (leave)' },
};
const SOURCE: Record<string, string> = { QR: 'QR scan', MANUAL: 'Roll call', CORRECTION: 'Correction', SEED: 'Imported record' };
const pctColor = (p: number, t: number) => (p >= t ? '#0E7A5F' : p >= t - 10 ? '#8A6D1F' : '#A8242C');
const short = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const long = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

/**
 * With `present` of `held` and a bar of `t` per cent: how many more classes can
 * be missed and stay at or above it, or how many must be attended in a row to get there.
 */
function margin(present: number, held: number, t: number) {
  const f = t / 100;
  if (held > 0 && present / held >= f) return { canMiss: Math.max(0, Math.floor(present / f - held)), mustAttend: 0 };
  return { canMiss: 0, mustAttend: Math.max(0, Math.ceil((f * held - present) / (1 - f))) };
}

/**
 * The student's attendance, all of it real: marking oneself present by
 * scanning the lecturer's code, the percentage overall and per subject, the
 * full register of every class, and disputes — with proof — that the
 * lecturer decides.
 */
export default function AttendanceModule(_props: Props) {
  const qc = useQueryClient();
  const { data, isPending, error } = useAttendance();
  const { data: me } = useStudentRecord();
  const corrections = useQuery({ queryKey: ['attendance', 'corrections'], queryFn: () => api<Correction[]>('/api/attendance/corrections') });
  const active = useQuery({ queryKey: ['attendance', 'active'], queryFn: () => api<ActiveClass | null>('/api/attendance/session/active'), refetchInterval: 15_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const history = useQuery({ queryKey: ['attendance', 'history', historyOf], queryFn: () => api<History>(`/api/attendance/history/${encodeURIComponent(historyOf!)}`), enabled: Boolean(historyOf) });
  const [dispute, setDispute] = useState<{ code: string; name: string; options: Array<{ sessionId: string; label: string; status: Status }> } | null>(null);
  const [form, setForm] = useState({ sessionId: '', requestedStatus: 'PRESENT', reason: '' });
  const [proof, setProof] = useState<StoredFileInfo | null>(null);
  const [scan, setScan] = useState<'camera' | 'type' | null>(null);
  const [typed, setTyped] = useState('');

  // Percentages, the dashboard and disputes all move together.
  const refresh = () => void qc.invalidateQueries();

  const mark = useMutation({
    mutationFn: (token: string) => api<{ subject: string; slot: string }>('/api/attendance/mark', { method: 'POST', body: { token: token.trim() } }),
    onSuccess: r => { toast.success(`Marked present — ${r.subject} (${r.slot})`); setScan(null); setTyped(''); refresh(); },
    onError: e => toast.error(errText(e)),
  });
  const onRead = useCallback((text: string) => mark.mutate(text), [mark]);

  const raise = useMutation({
    mutationFn: () => api('/api/attendance/corrections', { method: 'POST', body: { sessionId: form.sessionId, requestedStatus: form.requestedStatus, reason: form.reason.trim(), ...(proof ? { attachment: proof.id } : {}) } }),
    onSuccess: () => { toast.success('Dispute sent to your lecturer'); setDispute(null); setProof(null); refresh(); },
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api(`/api/attendance/corrections/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Dispute withdrawn'); refresh(); },
    onError: e => toast.error(errText(e)),
  });

  if (isPending) return <div className="bg-[#EDEFF3] min-h-screen p-4"><div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div></div>;
  if (error || !data) return <div className="bg-[#EDEFF3] min-h-screen p-4"><InlineAlert type="error">Could not load attendance: {errText(error)}</InlineAlert></div>;

  const t = data.threshold;
  const overall = data.overall.percent;
  const subjects = data.subjects as Subject[];
  const disputed = new Set((corrections.data ?? []).map(c => `${c.code}|${new Date(c.date).toDateString()}`));
  const overallMargin = margin(data.overall.present, data.overall.total, t);

  function openDispute(code: string, name: string, options: Array<{ sessionId: string; label: string; status: Status }>) {
    if (options.length === 0) { toast.error('There is no absent or late class to dispute in this subject'); return; }
    setDispute({ code, name, options });
    setForm({ sessionId: options[0]!.sessionId, requestedStatus: 'PRESENT', reason: '' });
    setProof(null);
    raise.reset();
  }

  function report() {
    if (!me) return;
    void downloadPdf({
      title: 'Attendance statement',
      subtitle: `${me.name} · ${me.id} · ${me.programme} · Semester ${me.semester}`,
      sections: [
        { heading: `Overall ${overall.toFixed(1)}% — ${data!.overall.present} of ${data!.overall.total} classes (minimum ${t}%)` },
        {
          table: {
            head: ['Code', 'Subject', 'Teacher', 'Attended', 'Held', '%', 'Status'],
            body: subjects.map(s => [s.code, s.name, s.faculty, String(s.present), String(s.total), `${s.percent}%`, s.meetsThreshold ? 'Eligible' : `Short — attend next ${s.classesNeeded}`]),
          },
        },
      ],
    });
  }

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-8">
      <div className="bg-[#16264A] text-white px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[36px] font-bold leading-none" style={{ color: overall < t ? '#FCA5A5' : '#6EE7B7' }}>{overall.toFixed(1)}%</div>
            <div className="text-[12px] text-[#94A3B8] mt-1">{data.overall.present} of {data.overall.total} classes attended</div>
          </div>
          <button onClick={report} className="text-[12px] border border-white/30 rounded-[4px] px-3 py-1.5 hover:bg-white/10 cursor-pointer">Download statement</button>
        </div>
        <div className="mt-3 h-2 bg-white/20 rounded-[2px] relative">
          <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, overall)}%`, background: overall < t ? '#FCA5A5' : '#6EE7B7' }} />
          <div className="absolute top-0 h-full w-px bg-[#FDE68A]" style={{ left: `${t}%` }} />
        </div>
        <p className="text-[11px] text-[#FDE68A] mt-1.5">
          {data.overall.total === 0 ? `${t}% needed to sit the examination` : overallMargin.mustAttend > 0
            ? `Below ${t}%: attend the next ${overallMargin.mustAttend} classes without a miss to reach it`
            : `Above ${t}%: you can miss ${overallMargin.canMiss} more class${overallMargin.canMiss === 1 ? '' : 'es'} and stay eligible`}
        </p>
      </div>

      {/* Mark yourself present */}
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-3">
        {active.data ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-[#0E7A5F] uppercase tracking-wider">Attendance open now</p>
                <p className="text-[14px] font-semibold text-[#16264A]">{active.data.subject} <span className="font-mono text-[12px] text-[#5A6577]">{active.data.code}</span></p>
                <p className="text-[12px] text-[#5A6577]">{active.data.slot} · {active.data.room} · {active.data.faculty}</p>
              </div>
              {active.data.alreadyMarked
                ? <span className="text-[12px] font-semibold text-[#0E7A5F]">✓ Marked</span>
                : <div className="flex flex-col gap-1.5">
                    {canScanQr() && <Button size="sm" onClick={() => setScan('camera')}>Scan QR</Button>}
                    <Button size="sm" variant="secondary" onClick={() => setScan('type')}>Enter code</Button>
                  </div>}
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-[#5A6577]">No class is taking QR attendance for you right now. When your lecturer shows the code in class, it appears here.</p>
        )}
      </div>

      <div className="bg-[#EDEFF3] px-4 py-2 mt-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Subject-wise attendance</span></div>
      {subjects.length === 0 && <p className="bg-white px-4 py-6 text-center text-[13px] text-[#5A6577]">You are not enrolled in any subject yet.</p>}
      {subjects.map(s => {
        const isOpen = open === s.code;
        const m = margin(s.present, s.total, t);
        const disputable = (s.missed ?? []).filter(x => !disputed.has(`${s.code}|${new Date(x.date).toDateString()}`));
        return (
          <div key={s.code}>
            <button onClick={() => setOpen(isOpen ? null : s.code)} className="w-full text-left bg-white border-b border-[#D3D8E0] cursor-pointer px-4 pt-3 pb-3" style={{ minHeight: 44 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#16264A]">{s.name}</span>
                <span className="text-[12px] font-bold" style={{ color: pctColor(s.percent, t) }}>{s.total === 0 ? '—' : `${s.percent}%`}</span>
              </div>
              <p className="text-[11px] text-[#5A6577] mt-0.5"><span className="font-mono">{s.code}</span> · {s.faculty} · {s.present}/{s.total} classes{s.excused ? ` · ${s.excused} excused` : ''}{s.late ? ` · ${s.late} late` : ''}</p>
              <div className="h-1.5 mt-2 bg-[#EDEFF3] rounded-[2px] overflow-hidden"><div className="h-full" style={{ width: `${s.percent}%`, background: pctColor(s.percent, t) }} /></div>
            </button>
            {isOpen && (
              <div className="bg-[#FAFBFC] border-b border-[#D3D8E0] px-4 py-3 space-y-3">
                {s.warning && <InlineAlert type="warning">Close to the line: below {data.policy?.warnBelow ?? t}% in this subject. A few more absences and you fall under {t}%.</InlineAlert>}
                {s.total === 0
                  ? <InlineAlert type="info">No class has been held in this subject yet.</InlineAlert>
                  : m.mustAttend > 0
                    ? <InlineAlert type="error">Attend the next {m.mustAttend} class(es) of this subject without a miss to reach {t}%.</InlineAlert>
                    : <InlineAlert type="success">You can miss {m.canMiss} more class{m.canMiss === 1 ? '' : 'es'} here and stay at {t}% or above.</InlineAlert>}
                <div>
                  <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Last {s.recent?.length ?? 0} classes</p>
                  {(s.recent ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {s.recent!.map(r => (
                        <div key={r.sessionId} className="flex flex-col items-center gap-1" title={MARK[r.status].label}>
                          <span className="w-8 h-8 flex items-center justify-center rounded-[2px] text-[11px] font-bold" style={{ background: MARK[r.status].bg, color: MARK[r.status].fg }}>{MARK[r.status].letter}</span>
                          <span className="text-[10px] text-[#5A6577]">{short(r.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-[#5A6577] mt-2">P present · A absent · L late{data.policy && !data.policy.lateCountsAsPresent ? ' (not counted as attended)' : ''} · E excused (approved leave)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" disabled={s.total === 0} onClick={() => setHistoryOf(s.code)}>Full register</Button>
                  <Button variant="secondary" size="sm" disabled={disputable.length === 0} onClick={() => openDispute(s.code, s.name, disputable.map(x => ({ sessionId: x.sessionId, label: `${long(x.date)} · ${x.time}`, status: 'ABSENT' })))}>
                    {disputable.length ? 'Dispute a mark' : 'Nothing to dispute'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <CondonationSection />
      <LeaveSection />

      {(corrections.data ?? []).length > 0 && (
        <>
          <div className="bg-[#EDEFF3] px-4 py-2 mt-3"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">My disputes</span></div>
          <div className="bg-white border-t border-b border-[#D3D8E0]">
            {corrections.data!.map(c => (
              <div key={c.id} className="px-4 py-3 border-b border-[#EDEFF3] last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] text-[#16264A] font-medium">{c.subject} · {short(c.date)} {c.time}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${c.status === 'APPROVED' ? 'bg-[#D1FAE5] text-[#0E7A5F]' : c.status === 'REJECTED' ? 'bg-[#FEE2E2] text-[#A8242C]' : 'bg-[#FEF9EC] text-[#8A6D1F]'}`}>{c.status === 'PENDING' ? 'With lecturer' : c.status[0] + c.status.slice(1).toLowerCase()}</span>
                </div>
                <p className="text-[12px] text-[#5A6577]">Marked {c.markedAs.toLowerCase()}, asked for {c.requestedStatus.toLowerCase()}{c.decisionNote ? ` · Lecturer: ${c.decisionNote}` : ''}</p>
                <div className="flex gap-3 mt-1">
                  {c.attachment && <button onClick={() => downloadStoredFile(c.attachment!, `proof-${c.code}`).catch(() => toast.error('Could not open the proof'))} className="text-[12px] text-[#E0952A] cursor-pointer">View proof</button>}
                  {c.status === 'PENDING' && <button onClick={() => withdraw.mutate(c.id)} disabled={withdraw.isPending} className="text-[12px] text-[#A8242C] cursor-pointer disabled:opacity-50">Withdraw</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Scan / type the lecturer's code */}
      <Modal open={scan !== null} onClose={() => setScan(null)} title={scan === 'camera' ? 'Scan the code on the screen' : 'Enter the attendance code'}
        footer={scan === 'type' ? <><Button variant="secondary" size="sm" onClick={() => setScan(null)}>Cancel</Button><Button size="sm" loading={mark.isPending} disabled={typed.trim().length < 8} onClick={() => mark.mutate(typed)}>Mark me present</Button></> : undefined}>
        {scan === 'camera' && (
          <div className="flex flex-col gap-3">
            <QrScanner onRead={onRead} />
            {mark.isPending && <p className="text-[13px] text-[#5A6577] text-center">Checking the code…</p>}
            <button onClick={() => setScan('type')} className="text-[12px] text-[#E0952A] cursor-pointer">Type the code instead</button>
          </div>
        )}
        {scan === 'type' && (
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-[#5A6577]">The code is printed under the QR on your lecturer's screen and changes every 30 seconds.</span>
            <input autoFocus value={typed} onChange={e => setTyped(e.target.value)} placeholder="ATT-…" className="h-10 px-3 font-mono text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]" />
          </label>
        )}
      </Modal>

      {/* Full register of one subject */}
      <Modal open={historyOf !== null} onClose={() => setHistoryOf(null)} title={history.data ? `${history.data.subject} — every class` : 'Attendance register'} width="640px">
        {history.isPending && <SkeletonRow />}
        {history.error && <InlineAlert type="error">{errText(history.error)}</InlineAlert>}
        {history.data && (
          <div className="max-h-[60vh] overflow-y-auto -mx-6 -mt-2">
            <table className="w-full text-left">
              <thead className="bg-[#EDEFF3] text-[11px] uppercase tracking-wider text-[#5A6577] sticky top-0">
                <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Time</th><th className="px-4 py-2">Mark</th><th className="px-4 py-2">Recorded by</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody>
                {history.data.classes.map(r => (
                  <tr key={r.sessionId} className="border-t border-[#EDEFF3] text-[13px]">
                    <td className="px-4 py-2 text-[#16264A]">{long(r.date)}</td>
                    <td className="px-4 py-2 text-[#5A6577]">{r.time}</td>
                    <td className="px-4 py-2"><span className="px-2 py-0.5 rounded-[2px] text-[11px] font-semibold" style={{ background: MARK[r.status].bg, color: MARK[r.status].fg }}>{MARK[r.status].label}</span></td>
                    <td className="px-4 py-2 text-[12px] text-[#5A6577]">{r.source ? (r.source.startsWith('LEAVE:') ? `Leave ${r.source.slice(6)}` : SOURCE[r.source] ?? r.source) : 'Not marked'}</td>
                    <td className="px-4 py-2 text-right">
                      {r.dispute
                        ? <span className="text-[11px] text-[#5A6577]">Dispute {r.dispute.toLowerCase()}</span>
                        : (r.status === 'ABSENT' || r.status === 'LATE') && (
                          <button className="text-[12px] text-[#E0952A] cursor-pointer" onClick={() => { const h = history.data!; setHistoryOf(null); openDispute(h.code, h.subject, [{ sessionId: r.sessionId, label: `${long(r.date)} · ${r.time}`, status: r.status }]); }}>Dispute</button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Dispute */}
      <Modal open={!!dispute} onClose={() => setDispute(null)} title="Dispute an attendance mark"
        footer={<><Button variant="secondary" size="sm" onClick={() => setDispute(null)}>Cancel</Button><Button size="sm" loading={raise.isPending} disabled={!form.sessionId || form.reason.trim().length < 10} onClick={() => raise.mutate()}>Send to lecturer</Button></>}>
        {dispute && (
          <div className="flex flex-col gap-4">
            {raise.isError && <InlineAlert type="error">{errText(raise.error)}</InlineAlert>}
            <p className="text-[13px] text-[#16264A]"><span className="font-mono text-[#5A6577]">{dispute.code}</span> {dispute.name}</p>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Class</span>
              <select value={form.sessionId} onChange={e => setForm({ ...form, sessionId: e.target.value })} className="h-10 px-3 text-[14px] border border-[#D3D8E0] rounded-[4px] bg-white">
                {dispute.options.map(o => <option key={o.sessionId} value={o.sessionId}>{o.label} ({MARK[o.status].label.toLowerCase()})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">I should be marked</span>
              <select value={form.requestedStatus} onChange={e => setForm({ ...form, requestedStatus: e.target.value })} className="h-10 px-3 text-[14px] border border-[#D3D8E0] rounded-[4px] bg-white">
                <option value="PRESENT">Present — I attended</option>
                <option value="LATE">Late — I came late</option>
                <option value="EXCUSED">Excused — on approved leave / duty</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Reason</span>
              <textarea rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} maxLength={1000} placeholder="e.g. I was present and signed the register; the QR scan failed" className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
              <span className="text-[11px] text-[#5A6577]">At least 10 characters. Your lecturer decides; you are told the outcome.</span>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Proof (optional)</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={async () => { const f = await pickAndUpload('attendance:dispute', 'image/*,application/pdf'); if (f) setProof(f); }}>{proof ? 'Replace file' : 'Attach medical note / duty letter'}</Button>
                {proof && <span className="text-[12px] text-[#0E7A5F]">✓ {proof.name}</span>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

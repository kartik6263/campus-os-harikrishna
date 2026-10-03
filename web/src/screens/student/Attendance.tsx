import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, InlineAlert, Modal, SkeletonRow, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAttendance, type AttendanceSubject } from '../../lib/queries';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (m: any) => void }

type Recent = { sessionId: string; date: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' };
type Subject = AttendanceSubject & { recent?: Recent[] };
interface Correction { id: string; code: string; subject: string; date: string; time: string; markedAs: string; requestedStatus: string; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; raisedAt: string; decidedAt: string | null; decisionNote: string | null }

const MARK: Record<Recent['status'], { letter: string; bg: string; fg: string; label: string }> = {
  PRESENT: { letter: 'P', bg: '#D1FAE5', fg: '#0E7A5F', label: 'Present' },
  ABSENT: { letter: 'A', bg: '#FEE2E2', fg: '#A8242C', label: 'Absent' },
  LATE: { letter: 'L', bg: '#FEF9EC', fg: '#8A6D1F', label: 'Late' },
  EXCUSED: { letter: 'E', bg: '#EFF6FF', fg: '#1D4ED8', label: 'Excused (leave)' },
};
const pctColor = (p: number, t: number) => (p >= t ? '#0E7A5F' : p >= t - 10 ? '#8A6D1F' : '#A8242C');
const short = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

/**
 * The student's attendance: overall and per subject, the actual mark for each
 * recent class, and disputes — raised against the exact class, decided by the
 * lecturer, and followed here.
 */
export default function AttendanceModule(_props: Props) {
  const qc = useQueryClient();
  const { data, isPending, error } = useAttendance();
  const corrections = useQuery({ queryKey: ['attendance', 'corrections'], queryFn: () => api<Correction[]>('/api/attendance/corrections') });
  const [open, setOpen] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<Subject | null>(null);
  const [form, setForm] = useState({ sessionId: '', requestedStatus: 'PRESENT', reason: '' });

  const raise = useMutation({
    mutationFn: () => api('/api/attendance/corrections', { method: 'POST', body: { sessionId: form.sessionId, requestedStatus: form.requestedStatus, reason: form.reason.trim() } }),
    onSuccess: () => { toast.success('Dispute sent to your lecturer'); setDisputing(null); void qc.invalidateQueries({ queryKey: ['attendance', 'corrections'] }); },
  });

  if (isPending) return <div className="bg-[#EDEFF3] min-h-screen p-4"><div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div></div>;
  if (error || !data) return <div className="bg-[#EDEFF3] min-h-screen p-4"><InlineAlert type="error">Could not load attendance: {errText(error)}</InlineAlert></div>;

  const t = data.threshold;
  const overall = data.overall.percent;
  const subjects = data.subjects as Subject[];
  /** A class already disputed and awaiting the lecturer cannot be disputed again. */
  const pendingFor = (code: string, date: string) => (corrections.data ?? []).some(c => c.status === 'PENDING' && c.code === code && c.date === date);

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-8">
      <div className="bg-[#16264A] text-white px-4 py-4">
        <div className="text-[36px] font-bold leading-none" style={{ color: overall < t ? '#FCA5A5' : '#6EE7B7' }}>{overall.toFixed(1)}%</div>
        <div className="text-[12px] text-[#94A3B8] mt-1">{data.overall.present} of {data.overall.total} classes attended</div>
        <div className="mt-3 h-2 bg-white/20 rounded-[2px] relative">
          <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, overall)}%`, background: overall < t ? '#FCA5A5' : '#6EE7B7' }} />
          <div className="absolute top-0 h-full w-px bg-[#FDE68A]" style={{ left: `${t}%` }} />
        </div>
        <p className="text-[10px] text-[#FDE68A] text-right mt-1">{t}% needed to sit the examination</p>
      </div>

      <div className="bg-[#EDEFF3] px-4 py-2 mt-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Subject-wise attendance</span></div>
      {subjects.map(s => {
        const isOpen = open === s.code;
        return (
          <div key={s.code}>
            <button onClick={() => setOpen(isOpen ? null : s.code)} className="w-full text-left bg-white border-b border-[#D3D8E0] cursor-pointer px-4 pt-3 pb-3" style={{ minHeight: 44 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#16264A]">{s.name}</span>
                <span className="text-[12px] font-bold" style={{ color: pctColor(s.percent, t) }}>{s.percent}%</span>
              </div>
              <p className="text-[11px] text-[#5A6577] mt-0.5"><span className="font-mono">{s.code}</span> · {s.faculty} · {s.present}/{s.total} classes</p>
              <div className="h-1.5 mt-2 bg-[#EDEFF3] rounded-[2px] overflow-hidden"><div className="h-full" style={{ width: `${s.percent}%`, background: pctColor(s.percent, t) }} /></div>
            </button>
            {isOpen && (
              <div className="bg-[#FAFBFC] border-b border-[#D3D8E0] px-4 py-3 space-y-3">
                {!s.meetsThreshold && s.classesNeeded > 0 && <InlineAlert type="error">Attend the next {s.classesNeeded} class(es) of this subject without a miss to reach {t}%.</InlineAlert>}
                <div>
                  <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Last {s.recent?.length ?? 0} classes</p>
                  {(s.recent ?? []).length === 0 ? <p className="text-[12px] text-[#5A6577]">No classes held yet.</p> : (
                    <div className="flex flex-wrap gap-2">
                      {s.recent!.map(r => (
                        <div key={r.sessionId} className="flex flex-col items-center gap-1" title={MARK[r.status].label}>
                          <span className="w-8 h-8 flex items-center justify-center rounded-[2px] text-[11px] font-bold" style={{ background: MARK[r.status].bg, color: MARK[r.status].fg }}>{MARK[r.status].letter}</span>
                          <span className="text-[10px] text-[#5A6577]">{short(r.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-[#5A6577] mt-2">P present · A absent · L late · E excused</p>
                </div>
                <Button variant="secondary" size="sm" disabled={!s.missed?.length} onClick={() => { setDisputing(s); setForm({ sessionId: s.missed?.[0]?.sessionId ?? '', requestedStatus: 'PRESENT', reason: '' }); raise.reset(); }}>
                  {s.missed?.length ? 'Dispute a mark' : 'No absences to dispute'}
                </Button>
              </div>
            )}
          </div>
        );
      })}

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
                <p className="text-[12px] text-[#5A6577]">Marked {c.markedAs.toLowerCase()}, asked for {c.requestedStatus.toLowerCase()}{c.decisionNote ? ` · ${c.decisionNote}` : ''}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={!!disputing} onClose={() => setDisputing(null)} title="Dispute an attendance mark"
        footer={<><Button variant="secondary" size="sm" onClick={() => setDisputing(null)}>Cancel</Button><Button size="sm" loading={raise.isPending} disabled={!form.sessionId || form.reason.trim().length < 10} onClick={() => raise.mutate()}>Send to lecturer</Button></>}>
        {disputing && (
          <div className="flex flex-col gap-4">
            {raise.isError && <InlineAlert type="error">{errText(raise.error)}</InlineAlert>}
            <p className="text-[13px] text-[#16264A]"><span className="font-mono text-[#5A6577]">{disputing.code}</span> {disputing.name}</p>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Class</span>
              <select value={form.sessionId} onChange={e => setForm({ ...form, sessionId: e.target.value })} className="h-10 px-3 text-[14px] border border-[#D3D8E0] rounded-[4px] bg-white">
                {(disputing.missed ?? []).map(m => <option key={m.sessionId} value={m.sessionId} disabled={pendingFor(disputing.code, m.date)}>{new Date(m.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })} · {m.time}</option>)}
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
          </div>
        )}
      </Modal>
    </div>
  );
}

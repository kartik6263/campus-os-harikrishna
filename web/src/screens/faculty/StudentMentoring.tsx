import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { Button, Modal, InlineAlert, Avatar, Timeline, toast } from '../../components/ui';
import { useFacultyProfile, useAddMentorNote, useMenteeList, type LegacyMentee as Mentee } from '../../lib/facultyqueries';

interface Props {
  onNavigate: (s: any) => void;
  onModule: (m: string) => void;
}

const INTERACTION_MODES = ['In-person', 'Phone', 'Written'] as const;
const INTERACTION_OUTCOMES = [
  'Discussed attendance',
  'Shared study plan',
  'Contacted parent',
  'Issued warning',
  'Referred to counsellor',
  'Other',
] as const;


function AttendanceBar({ pct, threshold = 75 }: { pct: number; threshold?: number }) {
  const color = pct < 60 ? '#A8242C' : pct < 75 ? '#E0952A' : '#0E7A5F';
  return (
    <div className="relative h-2 bg-[#EDEFF3] rounded-full w-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      {/* Threshold marker is outside overflow:hidden so we position on parent */}
    </div>
  );
}

function cgpaColor(cgpa: number): string {
  if (cgpa < 5) return '#A8242C';
  if (cgpa < 7) return '#8A6D1F';
  return '#0E7A5F';
}

function attStatusLabel(pct: number): { label: string; color: string } {
  if (pct < 60) return { label: 'Critical', color: '#A8242C' };
  if (pct < 75) return { label: 'Shortage', color: '#8A6D1F' };
  return { label: 'OK', color: '#0E7A5F' };
}

export default function StudentMentoring({ onNavigate, onModule }: Props) {
  const termLabel = useFacultyProfile().data?.term ?? '…';
  const { data: mentees } = useMenteeList();
  const addNote = useAddMentorNote();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Read the selection back out of the live list, so an at-risk flag or a
  // percentage that changes server-side is reflected in the open pane too.
  const selectedMentee = mentees.find(m => m.id === selectedId) ?? null;
  const setSelectedMentee = (m: Mentee | null) => setSelectedId(m?.id ?? null);
  const qc = useQueryClient();
  // The mentee's own record of interactions, newest first.
  const detail = useQuery({
    queryKey: ['faculty', 'mentee', selectedId],
    enabled: !!selectedId,
    queryFn: () => api<{ notes: Array<{ id: string; note: string; createdAt: string; author?: string | null }> }>(`/api/faculty/mentees/${selectedId}`),
  });
  const [notify, setNotify] = useState<null | 'notice' | 'referral'>(null);
  const [notifyText, setNotifyText] = useState('');
  const send = useMutation({
    mutationFn: () => api(`/api/faculty/mentees/${selectedId}/notify`, { method: 'POST', body: { kind: notify, message: notifyText.trim() } }),
    onSuccess: () => {
      toast.success(notify === 'notice' ? 'Notice sent — the student and their parent can see it' : 'Referral recorded and the student told');
      setNotify(null); setNotifyText('');
      void qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: e => toast.error(e instanceof ApiError ? e.message : 'Could not send'),
  });
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionNote, setInteractionNote] = useState('');
  const [interactionMode, setInteractionMode] = useState<typeof INTERACTION_MODES[number]>('In-person');
  const [interactionOutcome, setInteractionOutcome] = useState<typeof INTERACTION_OUTCOMES[number]>('Discussed attendance');
  const [interactionDate, setInteractionDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const sortedMentees = useMemo(
    () => [...mentees].sort((a, b) => (b.atRisk ? 1 : 0) - (a.atRisk ? 1 : 0)),
    [mentees]
  );

  const summary = useMemo(() => {
    const atRisk = mentees.filter(m => m.atRisk).length;
    const avgAtt = Math.round(mentees.reduce((s, m) => s + m.attendance, 0) / (mentees.length || 1));
    return { total: mentees.length, atRisk, avgAtt };
  }, [mentees]);

  function openInteraction() {
    setInteractionNote('');
    setInteractionMode('In-person');
    setInteractionOutcome('Discussed attendance');
    setInteractionDate(new Date().toISOString().split('T')[0]);
    setInteractionOpen(true);
  }

  async function saveInteraction() {
    if (!interactionNote.trim()) { toast.error('Please enter interaction notes.'); return; }
    if (!selectedMentee) return;
    setSaving(true);
    try {
      await addNote.mutateAsync({
        studentId: selectedMentee.id,
        note: `[${interactionDate} · ${interactionMode} · ${interactionOutcome}] ${interactionNote.trim()}`,
      });
      setInteractionOpen(false);
      toast.success('Interaction logged successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not log the interaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      {/* Header */}
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-4 shrink-0">
        <h2 className="text-[16px] font-semibold text-[#16264A]">Student Mentoring</h2>
        <p className="text-[12px] text-[#5A6577]">Term {termLabel}</p>
      </div>

      {/* Dashboard summary strip */}
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-4 shrink-0">
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: 'Total Mentees', value: String(summary.total), color: '#16264A', note: 'Assigned this semester' },
            { label: 'At-Risk', value: String(summary.atRisk), color: '#A8242C', note: 'Needs immediate attention' },
            { label: 'Avg Attendance', value: `${summary.avgAtt}%`, color: summary.avgAtt < 75 ? '#8A6D1F' : '#0E7A5F', note: 'Across all mentees' },
            { label: 'Meeting Pending', value: '2', color: '#8A6D1F', note: 'Scheduled this week' },
          ].map(stat => (
            <div key={stat.label}>
              <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{stat.label}</p>
              <p className="text-[28px] font-bold font-mono mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[11px] text-[#5A6577] mt-0.5">{stat.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Mentee list */}
        <div className="w-72 shrink-0 border-r border-[#D3D8E0] bg-white flex flex-col overflow-hidden">
          <div className="bg-[#EDEFF3] px-4 py-2 shrink-0">
            <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">MENTEES ({sortedMentees.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sortedMentees.map(m => {
              const active = selectedMentee?.id === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMentee(m)}
                  className={`w-full text-left px-4 py-3.5 border-b border-[#D3D8E0] transition-colors cursor-pointer
                    ${active ? 'bg-[#FEF9EC] border-l-2 border-l-[#E0952A]' : 'hover:bg-[#EDEFF3]'}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={m.name} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-[#16264A] truncate">{m.name}</p>
                        {m.atRisk && <span className="text-[#A8242C] text-[13px] shrink-0">⚑</span>}
                      </div>
                      <p className="text-[11px] font-mono text-[#5A6577]">{m.rollNo}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1">
                          <AttendanceBar pct={m.attendance} />
                        </div>
                        <span className="text-[11px] font-mono font-semibold shrink-0" style={{
                          color: m.attendance < 60 ? '#A8242C' : m.attendance < 75 ? '#8A6D1F' : '#0E7A5F'
                        }}>
                          {m.attendance}%
                        </span>
                      </div>
                      <div className="flex justify-between mt-1 text-[11px] text-[#5A6577]">
                        <span>Sem {m.semester}</span>
                        <span className="font-mono font-semibold" style={{ color: cgpaColor(m.cgpa) }}>
                          {m.cgpa.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedMentee ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-full bg-[#EDEFF3] flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <p className="text-[15px] font-medium text-[#16264A]">Select a mentee</p>
              <p className="text-[13px] text-[#5A6577] mt-1">Click on a student from the list to view their academic details.</p>
            </div>
          ) : (
            <div className="p-6 flex flex-col gap-5">
              {/* Mentee header card */}
              <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                <div className="bg-[#16264A] px-6 py-5">
                  <div className="flex items-start gap-4">
                    <Avatar name={selectedMentee.name} size={52} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-[18px] font-semibold text-white">{selectedMentee.name}</h3>
                        {selectedMentee.atRisk && (
                          <span className="px-2 py-0.5 bg-[#A8242C] text-white text-[11px] font-semibold rounded-[2px]">AT RISK</span>
                        )}
                      </div>
                      <p className="text-[13px] font-mono text-[#94A3B8] mt-0.5">{selectedMentee.rollNo}</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[13px] text-[#94A3B8]">
                        <span>{selectedMentee.programme} · Semester {selectedMentee.semester}</span>
                        <span>Last interaction: {selectedMentee.lastInteraction}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button variant="primary" size="sm" onClick={openInteraction}>
                        Log Interaction
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setNotify('notice'); setNotifyText(''); }}
                      >
                        Send Notice
                      </Button>
                      <button
                        onClick={() => { setNotify('referral'); setNotifyText(''); }}
                        className="text-[12px] text-[#94A3B8] hover:text-white transition-colors cursor-pointer text-left"
                      >
                        → Refer to counsellor
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 divide-x divide-[#D3D8E0] border-t border-[#D3D8E0]">
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">CGPA</p>
                    <p className="text-[28px] font-bold font-mono" style={{ color: cgpaColor(selectedMentee.cgpa) }}>
                      {selectedMentee.cgpa.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-[#5A6577] mt-0.5">
                      {selectedMentee.cgpa < 5 ? 'Below threshold' : selectedMentee.cgpa < 7 ? 'Average' : 'Good standing'}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">OVERALL ATTENDANCE</p>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-[28px] font-bold font-mono" style={{
                        color: selectedMentee.attendance < 60 ? '#A8242C' : selectedMentee.attendance < 75 ? '#8A6D1F' : '#0E7A5F'
                      }}>
                        {selectedMentee.attendance}%
                      </span>
                    </div>
                    <AttendanceBar pct={selectedMentee.attendance} />
                    <p className="text-[10px] text-[#5A6577] mt-1">75% threshold</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">PROGRAMME</p>
                    <p className="text-[16px] font-semibold text-[#16264A]">{selectedMentee.programme}</p>
                    <p className="text-[13px] text-[#5A6577]">Semester {selectedMentee.semester}</p>
                  </div>
                </div>
              </div>

              {/* At-risk alerts */}
              {selectedMentee.atRisk && selectedMentee.alerts.length > 0 && (
                <InlineAlert type="error">
                  <strong>At-Risk Alerts:</strong>
                  <ul className="mt-1.5 list-disc list-inside space-y-0.5">
                    {selectedMentee.alerts.map((alert, i) => (
                      <li key={i} className="text-[13px]">{alert}</li>
                    ))}
                  </ul>
                </InlineAlert>
              )}

              {/* Subject-wise table */}
              <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">SUBJECT-WISE ACADEMIC STATUS</span>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#D3D8E0]">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase">Code</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase">Subject</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase w-40">Attendance</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase">Internal</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMentee.subjects.map(sub => {
                      const st = attStatusLabel(sub.attendance);
                      const marksPct = Math.round((sub.internalMarks / sub.maxInternal) * 100);
                      return (
                        <tr key={sub.code} className="border-b border-[#D3D8E0] last:border-b-0">
                          <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{sub.code}</td>
                          <td className="px-4 py-3 font-medium text-[#16264A]">{sub.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 shrink-0">
                                <AttendanceBar pct={sub.attendance} />
                              </div>
                              <span className="font-mono text-[12px] font-semibold" style={{ color: st.color }}>
                                {sub.attendance}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[13px] text-[#16264A]">
                            {sub.internalMarks}/{sub.maxInternal}
                            <span className="text-[11px] text-[#5A6577] ml-1">({marksPct}%)</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2 py-0.5 rounded-[2px] text-[11px] font-semibold"
                              style={{ background: st.color + '18', color: st.color }}
                            >
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Interaction history */}
              <div className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                <div className="bg-[#EDEFF3] px-4 py-2">
                  <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">INTERACTION HISTORY</span>
                </div>
                <div className="px-5 py-4">
                  {detail.isLoading ? <p className="text-[13px] text-[#5A6577]">Loading…</p>
                    : (detail.data?.notes ?? []).length === 0 ? <p className="text-[13px] text-[#5A6577]">No interactions logged yet.</p>
                      : <Timeline items={detail.data!.notes.map((n, i) => ({ label: n.note, date: new Date(n.createdAt).toLocaleDateString('en-IN'), by: n.author ?? 'Mentor', status: (i === 0 ? 'current' : 'done') as 'current' | 'done' }))} />}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!notify} onClose={() => setNotify(null)} title={notify === 'notice' ? `Notice to ${selectedMentee?.name ?? ''}` : `Refer ${selectedMentee?.name ?? ''} to the counsellor`}
        footer={<><Button variant="secondary" size="sm" onClick={() => setNotify(null)}>Cancel</Button><Button size="sm" loading={send.isPending} disabled={notifyText.trim().length < 5} onClick={() => send.mutate()}>Send</Button></>}>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-[#5A6577]">{notify === 'notice' ? 'Sent to the student as an urgent notification; their parent sees it on the ward\'s account.' : 'The student is told they have been referred; the referral is kept on the mentoring record.'}</p>
          <textarea rows={4} value={notifyText} onChange={e => setNotifyText(e.target.value)} maxLength={1000} placeholder={notify === 'notice' ? 'e.g. Your attendance in BCA502 is below 75%. Meet me on Monday at 11.' : 'e.g. Signs of exam stress; please schedule a session this week.'} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] resize-none" />
        </div>
      </Modal>

      {/* Log Interaction Modal */}
      <Modal
        open={interactionOpen}
        onClose={() => setInteractionOpen(false)}
        title="Log Interaction"
        width="520px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInteractionOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveInteraction} loading={saving}>Save Interaction</Button>
          </>
        }
      >
        {selectedMentee && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 bg-[#EDEFF3] rounded-[4px] px-4 py-3">
              <Avatar name={selectedMentee.name} size={36} />
              <div>
                <p className="font-semibold text-[#16264A] text-[14px]">{selectedMentee.name}</p>
                <p className="text-[12px] font-mono text-[#5A6577]">{selectedMentee.rollNo}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Date</label>
              <input
                type="date"
                value={interactionDate}
                onChange={e => setInteractionDate(e.target.value)}
                className="h-9 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Mode</label>
              <div className="flex gap-2">
                {INTERACTION_MODES.map(mode => (
                  <button
                    key={mode}
                    onClick={() => setInteractionMode(mode)}
                    className={`px-3 py-1.5 rounded-[4px] text-[13px] font-medium border cursor-pointer transition-colors
                      ${interactionMode === mode
                        ? 'border-[#E0952A] bg-[#FEF9EC] text-[#8A6D1F]'
                        : 'border-[#D3D8E0] bg-white text-[#5A6577] hover:bg-[#EDEFF3]'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Notes <span className="text-[#A8242C]">*</span></label>
              <textarea
                value={interactionNote}
                onChange={e => setInteractionNote(e.target.value)}
                rows={4}
                placeholder="Describe what was discussed, commitments made, student's response…"
                className="w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[14px] text-[#16264A] placeholder-[#5A6577] outline-none focus:border-[#E0952A] resize-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Outcome</label>
              <div className="flex flex-wrap gap-2">
                {INTERACTION_OUTCOMES.map(outcome => (
                  <button
                    key={outcome}
                    onClick={() => setInteractionOutcome(outcome)}
                    className={`px-2.5 py-1 rounded-[4px] text-[12px] font-medium border cursor-pointer transition-colors
                      ${interactionOutcome === outcome
                        ? 'border-[#E0952A] bg-[#FEF9EC] text-[#8A6D1F]'
                        : 'border-[#D3D8E0] bg-white text-[#5A6577] hover:bg-[#EDEFF3]'}`}
                  >
                    {outcome}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

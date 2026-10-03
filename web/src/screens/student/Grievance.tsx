import { useState } from 'react';
import { Button, Modal, InlineAlert, StatusPill, Timeline, toast, Spinner } from '../../components/ui';
import { GRIEVANCES } from '../../lib/studentdata';
import { useStudentRecord } from '../../lib/queries';
import { useCollection, pickAndUpload, downloadStoredFile, formatBytes, type Stored } from '../../lib/records';
import {
  GRIEVANCE_CATEGORIES, SLA_DAYS, NEXT_LEVEL, addDays, daysSince, daysUntil, dmy, grievanceNumber, pillFor,
  type GrievanceDoc,
} from '../../lib/grievances';
import type { StoredFileInfo } from '../../lib/records';

interface Props { onNavigate: (m: any) => void }

function slaBarColor(remaining: number): string {
  if (remaining < 0) return '#A8242C';
  if (remaining <= 2) return '#8A6D1F';
  return '#0E7A5F';
}

function GrvDetail({ grv, studentName, onClose, onEscalate, onReopen, onComment, onAttach, onRate }: {
  grv: Stored<GrievanceDoc>;
  studentName: string;
  onClose: () => void;
  onEscalate: () => void;
  onReopen: () => void;
  onComment: (text: string) => void;
  onAttach: () => void;
  onRate: (stars: number) => void;
}) {
  const [comment, setComment] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);

  const elapsed = daysSince(grv.raisedOn);
  const remaining = daysUntil(grv.slaDeadline);
  const slaDays = elapsed + Math.max(0, remaining);
  const barFill = Math.min(100, (elapsed / (slaDays || 1)) * 100);
  const barColor = slaBarColor(remaining);
  const settled = grv.status === 'resolved' || grv.status === 'closed';
  const isOverdue = remaining < 0 && !settled;
  const level = grv.level ?? 'College grievance officer';
  // A student may take an unresolved grievance up a level once it has run past its SLA, or after five days.
  const canEscalate = !settled && Boolean(NEXT_LEVEL[level]) && (isOverdue || elapsed > 5);

  const timelineItems = grv.trail.map((t, i) => ({
    label: t.action,
    date: t.date,
    by: t.actor,
    status: (i < grv.trail.length - 1 || settled ? 'done' : 'current') as 'done' | 'current' | 'pending',
    note: t.note,
  }));

  return (
    <div className="bg-white border-t border-b border-[#D3D8E0]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <div>
          <span className="font-mono text-[12px] text-[#5A6577]">{grv.id}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusPill status={pillFor(grv.status)} compact />
            <span className="text-[12px] text-[#5A6577]">Raised {grv.raisedOn} · {level}</span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-[#5A6577] hover:text-[#16264A] p-2 cursor-pointer" style={{ minWidth: 44, minHeight: 44 }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        <div>
          <span className="inline-block bg-[#EDEFF3] text-[#5A6577] text-[11px] font-semibold px-2 py-0.5 rounded-[2px] uppercase tracking-wide mb-2">{grv.category}</span>
          <p className="text-[15px] font-semibold text-[#16264A]">{grv.subject}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wide mb-1">Description</p>
          <p className="text-[13px] text-[#16264A] leading-relaxed">{grv.description}</p>
        </div>

        {grv.resolution && (
          <InlineAlert type="success"><strong>Resolution:</strong> {grv.resolution}</InlineAlert>
        )}

        {!settled && (
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wide mb-2">SLA Status</p>
            <div className="flex justify-between text-[12px] mb-1">
              <span style={{ color: barColor }}>
                {isOverdue ? `Overdue by ${Math.abs(remaining)} day${Math.abs(remaining) !== 1 ? 's' : ''}` : `${remaining} day${remaining !== 1 ? 's' : ''} remaining`}
              </span>
              <span className="text-[#5A6577]">{elapsed} of {slaDays} days elapsed</span>
            </div>
            <div className="h-2 bg-[#EDEFF3] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${barFill}%`, backgroundColor: barColor }} />
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wide mb-2">Trail</p>
          <Timeline items={timelineItems} />
        </div>

        {(grv.attachments?.length ?? 0) > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wide mb-2">Attachments</p>
            <div className="flex flex-col gap-1.5">
              {grv.attachments!.map(f => (
                <button key={f.id} onClick={() => void downloadStoredFile(f.id, f.name).catch(() => toast.error('Could not download'))} className="flex items-center gap-2 text-[13px] text-[#16264A] hover:text-[#E0952A] cursor-pointer text-left">
                  📎 {f.name} <span className="text-[11px] text-[#5A6577]">{formatBytes(f.size)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(grv.comments?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wide">Conversation</p>
            {grv.comments!.map((c, i) => (
              <div key={i} className={`rounded-[2px] px-3 py-2 text-[13px] text-[#16264A] ${c.role === 'staff' ? 'bg-[#FEF9EC] border-l-2 border-[#E0952A]' : 'bg-[#EDEFF3]'}`}>
                <span className="text-[11px] text-[#5A6577] block mb-0.5">{c.role === 'student' ? studentName : c.by} · {new Date(c.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {c.text}
              </div>
            ))}
          </div>
        )}

        {settled && !grv.rating && (
          <div className="border border-[#D3D8E0] rounded-[4px] p-3">
            <p className="text-[13px] text-[#16264A] mb-2">How satisfied are you with the resolution?</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => onRate(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="text-[24px] text-[#D3D8E0] hover:text-[#E0952A] cursor-pointer">★</button>
              ))}
            </div>
          </div>
        )}
        {grv.rating && <p className="text-[12px] text-[#5A6577]">You rated this resolution {'★'.repeat(grv.rating)}{'☆'.repeat(5 - grv.rating)}</p>}

        <div className="flex flex-col gap-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="md" onClick={() => setCommentOpen(v => !v)}>Add Comment</Button>
            <Button variant="secondary" size="md" onClick={onAttach}>Attach File</Button>
          </div>
          {commentOpen && (
            <div className="flex flex-col gap-2">
              <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Type your comment…"
                className="w-full px-3 py-2 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] bg-white outline-none focus:border-[#E0952A] resize-none placeholder-[#5A6577]" />
              <Button variant="primary" size="sm" disabled={!comment.trim()} onClick={() => { onComment(comment.trim()); setComment(''); setCommentOpen(false); }}>Post Comment</Button>
            </div>
          )}
          {settled && <Button variant="secondary" size="md" onClick={onReopen}>Not satisfied — reopen</Button>}
          {canEscalate && <Button variant="destructive" size="md" onClick={onEscalate}>Escalate to {NEXT_LEVEL[level]}</Button>}
        </div>
      </div>
    </div>
  );
}

export default function GrievanceScreen(_props: Props) {
  const { data: STUDENT_RECORD } = useStudentRecord();
  const studentName = STUDENT_RECORD?.name ?? 'Student';
  const register = useCollection<GrievanceDoc>('student:grievance', GRIEVANCES as GrievanceDoc[]);
  const grievances = register.items;
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeGrv = grievances.find(g => g.id === activeId) ?? null;
  const [newOpen, setNewOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<StoredFileInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newStep, setNewStep] = useState<'form' | 'submitted'>('form');
  const [newGrvId, setNewGrvId] = useState('');

  function resetNewForm() {
    setCategory(''); setSubject(''); setDescription(''); setAttachments([]); setNewStep('form'); setNewGrvId('');
  }

  const update = (id: string, patch: Partial<GrievanceDoc>) => register.update(id, patch);
  const trail = (g: GrievanceDoc, action: string, note?: string) => [...g.trail, { actor: studentName, action, date: dmy(), ...(note ? { note } : {}) }];

  async function attachTo(context: string, onDone: (f: StoredFileInfo) => void) {
    setUploading(true);
    const f = await pickAndUpload(`student:grievance/${context}`, 'image/*,application/pdf,.doc,.docx');
    setUploading(false);
    if (f) onDone(f);
  }

  function submitNewGrievance() {
    if (!category || !subject.trim() || !description.trim()) return;
    const id = grievanceNumber();
    const level = 'College grievance officer' as const;
    register.add({
      id, category, subject: subject.trim(), description: description.trim(),
      raisedOn: dmy(), status: 'open', level, slaDeadline: dmy(addDays(SLA_DAYS[level])),
      trail: [{ actor: studentName, action: 'Grievance registered', date: dmy() }],
      comments: [], attachments, priority: category === 'Ragging / Harassment' ? 'critical' : 'normal',
    });
    setNewGrvId(id);
    setNewStep('submitted');
  }

  function handleEscalate() {
    if (!activeGrv || !escalateReason.trim()) return;
    const from = activeGrv.level ?? 'College grievance officer';
    const to = NEXT_LEVEL[from];
    if (!to) return;
    update(activeGrv.id, {
      status: 'escalated', level: to, slaDeadline: dmy(addDays(SLA_DAYS[to])),
      trail: trail(activeGrv, `Escalated to the ${to}`, escalateReason.trim()),
    });
    toast.success(`Escalated to the ${to}. A response is due within ${SLA_DAYS[to]} days.`);
    setEscalateOpen(false);
    setEscalateReason('');
  }

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-[#16264A]">Grievances</h1>
          <p className="text-[13px] text-[#5A6577] mt-0.5">Raise and track grievances</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { resetNewForm(); setNewOpen(true); }}>+ Raise New</Button>
      </div>

      <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between mt-3">
        <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">My Grievances</span>
        <span className="text-[12px] text-[#5A6577]">{grievances.length} grievance{grievances.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white border-t border-b border-[#D3D8E0]">
        {register.isLoading && <div className="flex justify-center py-8"><Spinner /></div>}
        {!register.isLoading && grievances.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-[#5A6577]">You have not raised any grievances. Use “Raise New” if something needs the college's attention.</p>
        )}
        {grievances.map((grv, idx) => {
          const remaining = daysUntil(grv.slaDeadline);
          const settled = grv.status === 'resolved' || grv.status === 'closed';
          const isOverdue = remaining < 0 && !settled;
          const isActive = activeId === grv.id;
          return (
            <div key={grv._rid ?? grv.id}>
              <button
                onClick={() => setActiveId(isActive ? null : grv.id)}
                className={`w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 cursor-pointer transition-colors hover:bg-[#EDEFF3] ${idx < grievances.length - 1 && !isActive ? 'border-b border-[#D3D8E0]' : ''}`}
                style={{ minHeight: 44 }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-[12px] text-[#5A6577]">{grv.id}</span>
                    <span className="bg-[#EDEFF3] text-[#5A6577] text-[10px] font-semibold px-1.5 py-0.5 rounded-[2px] uppercase">{grv.category}</span>
                    <StatusPill status={pillFor(grv.status)} compact />
                  </div>
                  <p className="text-[13px] text-[#16264A] font-medium line-clamp-2">{grv.subject}</p>
                  <p className="text-[12px] mt-0.5" style={{ color: settled ? '#0E7A5F' : isOverdue ? '#A8242C' : remaining <= 2 ? '#8A6D1F' : '#0E7A5F' }}>
                    {settled ? `Resolved` : `SLA: ${grv.slaDeadline} ${isOverdue ? `· Overdue ${Math.abs(remaining)}d` : `· ${remaining}d remaining`}`}
                    {(grv.comments?.some(c => c.role === 'staff')) && <span className="ml-2 text-[#E0952A]">· reply from staff</span>}
                  </p>
                </div>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth={2} className={`shrink-0 mt-1 transition-transform ${isActive ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6"/></svg>
              </button>

              {isActive && (
                <GrvDetail
                  grv={grv}
                  studentName={studentName}
                  onClose={() => setActiveId(null)}
                  onEscalate={() => setEscalateOpen(true)}
                  onReopen={() => { update(grv.id, { status: 'open', rating: undefined, slaDeadline: dmy(addDays(SLA_DAYS[grv.level ?? 'College grievance officer'])), trail: trail(grv, 'Reopened by the student') }); toast.success(`Grievance ${grv.id} reopened`); }}
                  onComment={text => { update(grv.id, { comments: [...(grv.comments ?? []), { by: studentName, role: 'student', at: new Date().toISOString(), text }] }); toast.success('Comment added — the grievance officer can see it now'); }}
                  onAttach={() => void attachTo(grv.id, f => update(grv.id, { attachments: [...(grv.attachments ?? []), f], trail: trail(grv, `Attached ${f.name}`) }))}
                  onRate={n => { update(grv.id, { rating: n, status: 'closed', trail: trail(grv, `Closed by the student — rated ${n}/5`) }); toast.success('Thank you for the feedback'); }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Raise New Grievance" width="480px">
        {newStep === 'form' ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[13px] font-medium text-[#16264A] mb-1">Category <span className="text-[#A8242C]">*</span></p>
              <select className="w-full h-10 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] cursor-pointer" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Select category…</option>
                {GRIEVANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {category === 'Ragging / Harassment' && <p className="text-[12px] text-[#A8242C] mt-1">Marked critical and routed to the anti-ragging committee. In an emergency call the National Anti-Ragging Helpline 1800-180-5522.</p>}
            </div>
            <div>
              <p className="text-[13px] font-medium text-[#16264A] mb-1">Subject <span className="text-[#A8242C]">*</span></p>
              <input className="w-full h-10 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] placeholder-[#5A6577]" placeholder="Brief subject of the grievance" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-[#16264A] mb-1">Description <span className="text-[#A8242C]">*</span></p>
              <textarea rows={4} className="w-full px-3 py-2 text-[14px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] bg-white outline-none focus:border-[#E0952A] resize-none placeholder-[#5A6577]" placeholder="Describe the issue in detail…" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-[#16264A] mb-1">Attachments (optional)</p>
              <button onClick={() => void attachTo('new', f => setAttachments(a => [...a, f]))} disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 border border-[#D3D8E0] rounded-[4px] bg-white text-[13px] text-[#5A6577] hover:bg-[#EDEFF3] transition-colors cursor-pointer disabled:opacity-50" style={{ minHeight: 44 }}>
                {uploading ? <Spinner size={14} /> : <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>}
                {uploading ? 'Uploading…' : 'Attach photo or document'}
              </button>
              {attachments.map(f => <p key={f.id} className="text-[12px] text-[#16264A] mt-1">📎 {f.name} · {formatBytes(f.size)}</p>)}
            </div>
            <div className="flex gap-3 mt-1">
              <Button variant="secondary" size="md" className="flex-1" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button variant="primary" size="md" className="flex-1" disabled={!category || !subject.trim() || !description.trim() || uploading} onClick={submitNewGrievance}>Submit Grievance</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-12 h-12 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#0E7A5F" strokeWidth={2.5}><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <p className="text-[15px] font-semibold text-[#16264A]">Grievance Registered</p>
            </div>
            <div className="border border-[#D3D8E0] rounded-[4px] p-4 bg-[#EDEFF3]">
              <p className="text-[11px] text-[#5A6577] uppercase tracking-wide mb-1">Grievance ID</p>
              <p className="font-mono text-[14px] text-[#16264A] font-semibold">{newGrvId}</p>
            </div>
            <InlineAlert type="success">
              It is now with the college grievance officer, who must respond within <strong>{SLA_DAYS['College grievance officer']} days</strong> (by {dmy(addDays(SLA_DAYS['College grievance officer']))}). You will see every step here.
            </InlineAlert>
            <Button variant="primary" size="md" onClick={() => setNewOpen(false)}>Done</Button>
          </div>
        )}
      </Modal>

      <Modal open={escalateOpen} onClose={() => setEscalateOpen(false)} title={`Escalate to ${activeGrv ? NEXT_LEVEL[activeGrv.level ?? 'College grievance officer'] : ''}`} width="480px">
        <div className="flex flex-col gap-4">
          <InlineAlert type="warning">
            Escalation sends grievance <span className="font-mono">{activeGrv?.id}</span> to the next authority under the UGC grievance regulations. It is recorded on the grievance and cannot be undone.
          </InlineAlert>
          <div>
            <p className="text-[13px] font-medium text-[#16264A] mb-1">Reason for Escalation <span className="text-[#A8242C]">*</span></p>
            <textarea rows={3} value={escalateReason} onChange={e => setEscalateReason(e.target.value)} placeholder="State why you are escalating this grievance…"
              className="w-full px-3 py-2 text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] bg-white outline-none focus:border-[#A8242C] resize-none placeholder-[#5A6577]" />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setEscalateOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="md" className="flex-1" disabled={!escalateReason.trim()} onClick={handleEscalate}>Escalate Now</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

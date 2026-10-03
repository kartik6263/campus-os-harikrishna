import { useState } from 'react';
import { Button, Spinner, toast } from '../../components/ui';
import { useCollection, type Stored } from '../../lib/records';
import { useFacultyAssignments, useFacultyRecord, useMenteesApi } from '../../lib/facultyqueries';
import type { MessageThread } from '../../lib/messages';

/**
 * Messages parents have sent this teacher: about a subject they teach, or —
 * addressed to the class mentor — about one of their mentees.
 */
export default function ParentMessages() {
  const { data: me } = useFacultyRecord();
  const subjects = useFacultyAssignments();
  const mentees = useMenteesApi();
  const threads = useCollection<MessageThread>('parent:messages', []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [show, setShow] = useState<'waiting' | 'all'>('waiting');

  const myCodes = new Set((subjects.data ?? []).map(s => s.code));
  const myMentees = new Set((mentees.data ?? []).map(m => m.id));
  const surname = (me?.name ?? '').split(' ').pop()?.toLowerCase() ?? '';
  const mine = threads.items.filter(t =>
    (t.subjectCode && myCodes.has(t.subjectCode)) ||
    (t.to === 'Class mentor' && t._studentId && myMentees.has(t._studentId)) ||
    (surname.length > 2 && t.to.toLowerCase().includes(surname)),
  );
  const waiting = mine.filter(t => t.status === 'open');
  const list = show === 'waiting' ? waiting : mine;
  const open = mine.find(t => t._rid === openId) ?? null;

  function send(t: Stored<MessageThread>) {
    if (!reply.trim()) return;
    threads.update(t._rid!, { status: 'answered', messages: [...t.messages, { from: 'staff', by: me?.name ?? 'Teacher', text: reply.trim(), at: new Date().toISOString() }] });
    setReply('');
    toast.success('Reply sent — the parent sees it in the parent portal');
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[#16264A]">Parent messages</h1>
          <p className="text-[13px] text-[#5A6577]">{waiting.length} waiting for a reply · about your subjects and your mentees</p>
        </div>
        <select value={show} onChange={e => setShow(e.target.value as 'waiting' | 'all')} className="h-9 px-3 text-[13px] border border-[#D3D8E0] rounded-[4px] bg-white cursor-pointer">
          <option value="waiting">Waiting for reply</option>
          <option value="all">All conversations</option>
        </select>
      </div>

      {threads.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px] divide-y divide-[#EDEFF3]">
            {list.length === 0 && <p className="p-6 text-center text-[13px] text-[#5A6577]">{show === 'waiting' ? 'Nothing waiting — every parent has an answer.' : 'No parent has written to you yet.'}</p>}
            {list.map(t => {
              const last = t.messages[t.messages.length - 1]!;
              return (
                <button key={t._rid} onClick={() => setOpenId(t._rid!)} className={`w-full text-left px-4 py-3 cursor-pointer ${openId === t._rid ? 'bg-[#FEF9EC]' : 'hover:bg-[#F7F8FA]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[#16264A] truncate">{t.topic}</p>
                    {t.status === 'open' && <span className="w-2 h-2 rounded-full bg-[#E0952A] shrink-0" />}
                  </div>
                  <p className="text-[12px] text-[#5A6577]">Parent of {t._student?.name ?? 'a student'}{t.subjectCode ? ` · ${t.subjectCode}` : ''}</p>
                  <p className="text-[12px] text-[#5A6577] truncate">{last.text}</p>
                </button>
              );
            })}
          </div>
          <div className="lg:col-span-3 bg-white border border-[#D3D8E0] rounded-[4px] min-h-[320px] flex flex-col">
            {!open ? <p className="m-auto text-[13px] text-[#5A6577]">Choose a conversation.</p> : (
              <>
                <div className="px-4 py-3 border-b border-[#D3D8E0]">
                  <p className="text-[14px] font-semibold text-[#16264A]">{open.topic}</p>
                  <p className="text-[12px] text-[#5A6577]">Parent of {open._student?.name} ({open._student?.enrolmentNo}) · <span className="font-mono">{open.id}</span></p>
                </div>
                <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                  {open.messages.map((m, i) => (
                    <div key={i} className={`flex ${m.from === 'staff' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] ${m.from === 'staff' ? 'bg-[#16264A] text-white' : 'bg-[#EDEFF3] text-[#16264A]'}`}>
                        <p className={`text-[11px] font-semibold mb-0.5 ${m.from === 'staff' ? 'text-white/70' : 'text-[#5A6577]'}`}>{m.from === 'staff' ? m.by : 'Parent'}</p>
                        {m.text}
                        <p className={`text-[10px] mt-1 ${m.from === 'staff' ? 'text-white/50' : 'text-[#5A6577]'}`}>{new Date(m.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#D3D8E0] p-3 flex gap-2">
                  <textarea rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply to the parent…" className="flex-1 px-3 py-2 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none focus:border-[#E0952A] resize-none" />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" disabled={!reply.trim()} onClick={() => send(open)}>Send</Button>
                    {open.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => { threads.update(open._rid!, { status: 'closed' }); toast.info('Conversation closed'); }}>Close</Button>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Spinner, toast } from '../../components/ui';
import { useAttendance, useProfile } from '../../lib/queries';
import { useCollection } from '../../lib/records';
import { useAuth } from '../../lib/auth';
import { threadNo, type MessageThread } from '../../lib/messages';

interface Props { lang: 'hi' | 'en' }

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);

/** Parent ↔ teacher messages, answered by the teacher from their own workspace. */
export default function ParentMessaging({ lang }: Props) {
  const { user } = useAuth();
  const { data: s } = useProfile();
  const { data: attendance } = useAttendance();
  const threads = useCollection<MessageThread>('parent:messages', []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState('');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');

  const teachers = [
    { label: t(lang, 'Class mentor', 'कक्षा मार्गदर्शक'), value: 'Class mentor', code: undefined as string | undefined },
    ...(attendance?.subjects ?? []).map(x => ({ label: `${x.faculty} — ${x.name}`, value: x.faculty, code: x.code })),
  ];
  const open = threads.items.find(th => th.id === openId) ?? null;
  const me = user?.email ?? 'Parent';

  function send() {
    const target = teachers.find(x => x.value === to);
    if (!target || !text.trim()) return;
    const id = threadNo();
    threads.add({ id, to: target.value, subjectCode: target.code, topic: topic.trim() || t(lang, 'Question about my ward', 'मेरे बच्चे के बारे में प्रश्न'), status: 'open', messages: [{ from: 'parent', by: me, text: text.trim(), at: new Date().toISOString() }] });
    setComposing(false); setTo(''); setTopic(''); setText('');
    setOpenId(id);
    toast.success(t(lang, `Sent to ${target.value}`, `${target.value} को भेजा गया`));
  }

  function sendReply() {
    if (!open || !reply.trim()) return;
    threads.update(open.id, { status: 'open', messages: [...open.messages, { from: 'parent', by: me, text: reply.trim(), at: new Date().toISOString() }] });
    setReply('');
  }

  if (open) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] pb-24 flex flex-col">
        <div className="bg-[#16264A] px-4 py-3">
          <button onClick={() => setOpenId(null)} className="text-white/70 text-xs cursor-pointer">← {t(lang, 'All messages', 'सभी संदेश')}</button>
          <p className="text-white font-semibold text-sm mt-1">{open.topic}</p>
          <p className="text-white/60 text-xs">{t(lang, 'To', 'प्रति')}: {open.to}{open.subjectCode ? ` · ${open.subjectCode}` : ''}</p>
        </div>
        <div className="flex-1 px-4 py-4 space-y-3">
          {open.messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'parent' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === 'parent' ? 'bg-[#16264A] text-white rounded-br-sm' : 'bg-white border border-gray-200 text-[#16264A] rounded-bl-sm'}`}>
                {m.from === 'staff' && <p className="text-[11px] font-semibold text-[#E0952A] mb-0.5">{m.by}</p>}
                {m.text}
                <p className={`text-[10px] mt-1 ${m.from === 'parent' ? 'text-white/50' : 'text-gray-400'}`}>{new Date(m.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
            </div>
          ))}
          {open.status !== 'answered' && <p className="text-[11px] text-gray-400 text-center">{t(lang, 'The teacher sees this in their workspace and replies here.', 'शिक्षक इसे अपने कार्यक्षेत्र में देखकर यहीं उत्तर देंगे।')}</p>}
        </div>
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 p-3 flex gap-2">
          <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()} placeholder={t(lang, 'Write a reply…', 'उत्तर लिखें…')} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E0952A]" />
          <button onClick={sendReply} disabled={!reply.trim()} className="px-4 rounded-lg bg-[#E0952A] text-white text-sm font-semibold disabled:opacity-40 cursor-pointer">{t(lang, 'Send', 'भेजें')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{t(lang, 'Message a teacher', 'शिक्षक से संपर्क')}</p>
        <p className="text-white/60 text-xs">{s?.name}</p>
      </div>

      {!composing ? (
        <div className="mx-4 mt-4">
          <button onClick={() => setComposing(true)} className="w-full bg-[#E0952A] text-white font-semibold py-3 rounded-xl text-sm min-h-[48px] cursor-pointer">+ {t(lang, 'New message', 'नया संदेश')}</button>
        </div>
      ) : (
        <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <select value={to} onChange={e => setTo(e.target.value)} className="w-full h-11 px-3 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer">
            <option value="">{t(lang, 'Choose the teacher…', 'शिक्षक चुनें…')}</option>
            {teachers.map(x => <option key={`${x.value}-${x.code ?? ''}`} value={x.value}>{x.label}</option>)}
          </select>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder={t(lang, 'Topic (e.g. attendance in Computer Networks)', 'विषय')} className="w-full h-11 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E0952A]" />
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder={t(lang, 'Your message…', 'आपका संदेश…')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E0952A] resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setComposing(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm cursor-pointer">{t(lang, 'Cancel', 'रद्द करें')}</button>
            <button onClick={send} disabled={!to || !text.trim()} className="flex-1 py-2.5 rounded-lg bg-[#16264A] text-white text-sm font-semibold disabled:opacity-40 cursor-pointer">{t(lang, 'Send', 'भेजें')}</button>
          </div>
        </div>
      )}

      <div className="mx-4 mt-5">
        <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'Conversations', 'बातचीत')}</p>
        {threads.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {!threads.isLoading && threads.items.length === 0 && <p className="text-xs text-gray-500">{t(lang, 'No messages yet.', 'अभी कोई संदेश नहीं।')}</p>}
        <div className="flex flex-col gap-2">
          {threads.items.map(th => {
            const last = th.messages[th.messages.length - 1]!;
            return (
              <button key={th.id} onClick={() => setOpenId(th.id)} className="bg-white rounded-xl px-4 py-3 shadow-sm text-left cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#16264A] truncate">{th.topic}</p>
                  {th.status === 'answered' && last.from === 'staff' && <span className="text-[10px] font-bold text-white bg-[#0E7A5F] px-2 py-0.5 rounded-full shrink-0">{t(lang, 'Reply', 'उत्तर')}</span>}
                </div>
                <p className="text-xs text-gray-500">{th.to} · {th.messages.length} {t(lang, 'messages', 'संदेश')}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{last.from === 'staff' ? `${last.by}: ` : ''}{last.text}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

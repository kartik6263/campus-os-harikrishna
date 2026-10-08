import { useEffect, useRef, useState } from 'react';
import { ToastContainer } from '../../components/ui';
import Markdown from '../../components/Markdown';
import { LOOKUP_LABELS, MODE_LABEL, speak, stopSpeaking, useAssistant, useAssistantStatus, useSpeechInput } from '../../lib/assistant';
import { downloadPdf } from '../../lib/export';

type Lang = 'en' | 'hi';

const SUGGESTIONS: Record<Lang, string[]> = {
  en: [
    'Which students are at risk of dropping out?',
    'Who owes the most in fees?',
    'Compare colleges on attendance and fee collection',
    'List students below 75% attendance',
    'How is the institution doing this month?',
  ],
  hi: [
    'किन छात्रों के पढ़ाई छोड़ने का जोखिम है?',
    'सबसे ज़्यादा फीस किसकी बकाया है?',
    'महाविद्यालयों की उपस्थिति और फीस संग्रह की तुलना करें',
    '75% से कम उपस्थिति वाले छात्र',
  ],
};

/** The campus assistant: questions in English or Hindi, answered from the live records. */
export default function AIChatAssistant() {
  const [lang, setLang] = useState<Lang>('en');
  const [input, setInput] = useState('');
  const [readAloud, setReadAloud] = useState(false);
  const { turns, ask, busy, reset } = useAssistant();
  const status = useAssistantStatus();
  const bottomRef = useRef<HTMLDivElement>(null);

  const voice = useSpeechInput(lang, text => { void send(text); });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);
  useEffect(() => () => stopSpeaking(), []);

  async function send(text = input) {
    if (!text.trim()) return;
    setInput('');
    const answer = await ask(text);
    if (answer && readAloud && !answer.error) speak(answer.content, lang);
  }

  function exportThread() {
    void downloadPdf({
      title: 'Campus assistant — conversation',
      subtitle: `${turns.filter(t => t.role === 'user').length} questions, answered from the live records`,
      sections: turns.map(t => ({ heading: t.role === 'user' ? 'Question' : 'Answer', text: [t.content.replace(/\*\*/g, '')] })),
    });
  }

  const mode = status.data?.mode;

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-56px)] bg-[#0D1B35] text-white">
      <ToastContainer />

      <div className="bg-[#0A1428] border-b border-[#1E3A5F] px-4 py-2 flex flex-wrap items-center gap-3 text-[12px] shrink-0">
        <span className="text-blue-300">🔒 Answers come only from records your role may see, and every question is written to the audit log.</span>
        <span className="ml-auto flex items-center gap-2">
          {mode && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${mode !== 'builtin' ? 'bg-purple-600/40 text-purple-100' : 'bg-white/10 text-white/70'}`}
              title={mode !== 'builtin' ? `${mode === 'gemini' ? 'Google Gemini' : 'Claude'} (${status.data?.model}) chooses the lookups and writes the answer` : 'Built-in reports — add a Gemini API key on the server to enable the AI model'}>
              {MODE_LABEL[mode]}
            </span>
          )}
          <button onClick={() => setReadAloud(r => !r)} className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${readAloud ? 'bg-[#E0952A] text-white' : 'bg-white/10 text-white/70 hover:text-white'}`}>
            🔊 {readAloud ? 'Reading aloud' : 'Read aloud'}
          </button>
          {turns.length > 0 && (
            <>
              <button onClick={exportThread} className="px-2 py-0.5 rounded text-[11px] bg-white/10 text-white/70 hover:text-white cursor-pointer">Export PDF</button>
              <button onClick={() => { stopSpeaking(); reset(); }} className="px-2 py-0.5 rounded text-[11px] bg-white/10 text-white/70 hover:text-white cursor-pointer">New chat</button>
            </>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {turns.length === 0 && (
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl mb-4" style={{ background: 'linear-gradient(135deg, #6C47FF, #A855F7)' }}>✦</div>
              <h2 className="text-[20px] font-semibold">Ask about your institution</h2>
              <p className="text-[13px] text-white/60 mt-1 max-w-md mx-auto">Students at risk, fee dues, attendance, college comparisons, or any student by name — in English or हिंदी. Type, or press the microphone and speak.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {SUGGESTIONS[lang].map(s => (
                  <button key={s} onClick={() => void send(s)} className="text-[13px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-purple-400 hover:bg-white/10 cursor-pointer text-left">{s}</button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14px] ${t.role === 'user' ? 'bg-[#E0952A] text-white rounded-br-sm' : t.error ? 'bg-[#A8242C]/30 border border-[#A8242C]/50 rounded-bl-sm' : 'bg-white/5 border border-white/10 rounded-bl-sm'}`}>
                {t.role === 'user' ? t.content : <Markdown text={t.content} dark />}
                {t.role === 'assistant' && t.notice && <p className="mt-2 text-[11px] text-amber-200/80">{t.notice}</p>}
                {t.role === 'assistant' && !t.error && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-white/10 text-[11px] text-white/50">
                    {(t.lookups ?? []).map(l => <span key={l} className="bg-white/10 rounded px-1.5 py-0.5">{LOOKUP_LABELS[l] ?? l}</span>)}
                    {t.ms !== undefined && <span>· {(t.ms / 1000).toFixed(1)}s</span>}
                    <button onClick={() => speak(t.content, lang)} className="ml-auto hover:text-white cursor-pointer" title="Read aloud">🔊</button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] text-white/60 flex items-center gap-2">
                <span className="flex gap-1"><span className="w-1.5 h-1.5 bg-purple-300 rounded-full animate-bounce" /><span className="w-1.5 h-1.5 bg-purple-300 rounded-full animate-bounce [animation-delay:120ms]" /><span className="w-1.5 h-1.5 bg-purple-300 rounded-full animate-bounce [animation-delay:240ms]" /></span>
                Looking through the records…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-white/10 bg-[#0A1428] px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          {(voice.listening || voice.transcribing || voice.error) && (
            <p className={`text-[12px] mb-2 ${voice.error ? 'text-red-300' : 'text-purple-200'}`}>{voice.error ?? (voice.engine === 'gemini' ? voice.interim : `Listening… ${voice.interim}`)}</p>
          )}
          {voice.canChoose && (
            <div className="flex items-center gap-2 mb-2 text-[11px] text-white/50">
              <span>Voice input:</span>
              {(['browser', 'gemini'] as const).map(e => (
                <button key={e} onClick={() => voice.setEngine(e)} className={`px-2 py-0.5 rounded cursor-pointer ${voice.engine === e ? 'bg-white/15 text-white' : 'hover:text-white'}`}>{e === 'browser' ? 'Browser (live words)' : '✦ Gemini (better Hindi)'}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-white/15 shrink-0">
              {(['en', 'hi'] as Lang[]).map(l => (
                <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-2 text-[12px] cursor-pointer ${lang === l ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>{l === 'en' ? 'EN' : 'हिं'}</button>
              ))}
            </div>
            <input
              value={voice.listening && voice.engine === 'browser' ? voice.interim : input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send(); }}
              placeholder={lang === 'hi' ? 'अपना प्रश्न लिखें…' : 'Ask a question…'}
              disabled={busy}
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-purple-400 placeholder-white/30 disabled:opacity-60"
            />
            <button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              disabled={busy || voice.transcribing || !voice.supported}
              title={voice.supported ? (voice.listening ? 'Stop listening' : 'Speak your question') : 'Voice input needs Chrome or Edge, or a Gemini key on the server'}
              className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${voice.listening ? 'bg-red-500 animate-pulse' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>
            </button>
            <button onClick={() => void send()} disabled={busy || !input.trim()} className="h-10 px-4 rounded-lg bg-[#E0952A] hover:bg-[#C47E1E] text-[14px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

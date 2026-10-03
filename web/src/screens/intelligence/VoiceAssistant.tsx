import { useEffect, useState } from 'react';
import { ToastContainer } from '../../components/ui';
import Markdown from '../../components/Markdown';
import { LOOKUP_LABELS, speak, stopSpeaking, useAssistant, useSpeechInput, type ChatTurn } from '../../lib/assistant';

type Lang = 'hi' | 'en';
type Stage = 'idle' | 'listening' | 'review' | 'thinking' | 'answer';

/**
 * Voice-first: speak a question in Hindi or English, check what was heard,
 * and hear the answer — drawn from the same live records as the chat.
 */
export default function VoiceAssistant() {
  const [lang, setLang] = useState<Lang>('hi');
  const [stage, setStage] = useState<Stage>('idle');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState<ChatTurn | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const { ask } = useAssistant();

  const voice = useSpeechInput(lang, text => { setHeard(text); setStage('review'); });

  useEffect(() => { if (voice.listening) setStage('listening'); }, [voice.listening]);
  useEffect(() => { if (!voice.listening && stage === 'listening' && !heard) setStage('idle'); }, [voice.listening, stage, heard]);
  useEffect(() => () => stopSpeaking(), []);

  async function submit(text: string) {
    if (!text.trim()) return;
    setStage('thinking');
    const turn = await ask(text);
    setAnswer(turn);
    setStage('answer');
    if (turn && !turn.error) {
      setSpeaking(true);
      speak(turn.content, lang, () => setSpeaking(false));
    }
  }

  function again() {
    stopSpeaking();
    setSpeaking(false);
    setHeard('');
    setAnswer(null);
    setStage('idle');
  }

  const t = (en: string, hi: string) => (lang === 'hi' ? hi : en);

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-56px)] bg-gradient-to-b from-[#0D1B35] to-[#1A0D35] text-white">
      <ToastContainer />

      {!voice.supported && (
        <div className="bg-orange-900/60 border-b border-orange-700 px-4 py-2.5 text-[13px] text-orange-200 shrink-0">
          {t('This browser has no speech recognition — open the campus app in Chrome or Edge, or type below.', 'इस ब्राउज़र में आवाज़ पहचान नहीं है — Chrome या Edge में खोलें, या नीचे लिखें।')}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="flex rounded-full overflow-hidden border border-[#4C1D95] mb-8">
          <button onClick={() => setLang('hi')} className={`px-5 py-2 text-[14px] font-medium cursor-pointer ${lang === 'hi' ? 'bg-[#7C3AED] text-white' : 'text-gray-400 hover:text-white'}`}>हिंदी</button>
          <button onClick={() => setLang('en')} className={`px-5 py-2 text-[14px] font-medium cursor-pointer ${lang === 'en' ? 'bg-[#7C3AED] text-white' : 'text-gray-400 hover:text-white'}`}>English</button>
        </div>

        {(stage === 'idle' || stage === 'listening') && (
          <div className="flex flex-col items-center gap-5">
            <button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              disabled={!voice.supported}
              className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${voice.listening ? 'bg-red-500 shadow-red-900/50 animate-pulse' : 'bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] shadow-purple-900/50 hover:from-[#8B5CF6]'}`}
              aria-label={voice.listening ? 'Stop listening' : 'Start speaking'}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>
            </button>
            <p className="text-[16px] font-medium">{voice.listening ? t('Listening… tap to stop', 'सुन रहा हूँ… रोकने के लिए टैप करें') : t('Tap and ask your question', 'टैप करें और अपना प्रश्न पूछें')}</p>
            {voice.listening && <p className="text-[15px] text-purple-200 min-h-6 max-w-lg text-center">{voice.interim}</p>}
            {voice.error && <p className="text-[13px] text-red-300 max-w-md text-center">{voice.error}</p>}
            <p className="text-[12px] text-white/40 max-w-sm text-center">{t('Try: "How many students owe fees?" or "Which college has the lowest attendance?"', 'उदाहरण: "कितने छात्रों की फीस बकाया है?" या "किस कॉलेज की उपस्थिति सबसे कम है?"')}</p>
          </div>
        )}

        {stage === 'review' && (
          <div className="w-full max-w-lg flex flex-col gap-4">
            <p className="text-[13px] text-white/60">{t('I heard — correct it if needed:', 'मैंने सुना — ज़रूरत हो तो सुधारें:')}</p>
            <textarea value={heard} onChange={e => setHeard(e.target.value)} rows={3} className="bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-[16px] outline-none focus:border-purple-400 resize-none" />
            <div className="flex gap-3">
              <button onClick={() => { setHeard(''); voice.start(); }} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-[14px] cursor-pointer">{t('Speak again', 'फिर से बोलें')}</button>
              <button onClick={() => void submit(heard)} disabled={!heard.trim()} className="flex-1 py-3 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-[14px] font-medium cursor-pointer disabled:opacity-40">{t('Ask', 'पूछें')}</button>
            </div>
          </div>
        )}

        {stage === 'thinking' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-purple-400/30 border-t-purple-300 animate-spin" />
            <p className="text-[15px] text-white/70">{t('Looking through the records…', 'अभिलेख देख रहा हूँ…')}</p>
            <p className="text-[13px] text-white/40 max-w-md text-center">“{heard}”</p>
          </div>
        )}

        {stage === 'answer' && answer && (
          <div className="w-full max-w-2xl flex flex-col gap-4">
            <p className="text-[13px] text-white/50">“{heard}”</p>
            <div className={`rounded-2xl px-5 py-4 text-[15px] ${answer.error ? 'bg-[#A8242C]/30 border border-[#A8242C]/60' : 'bg-white/5 border border-white/10'}`}>
              <Markdown text={answer.content} dark />
              {!answer.error && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/10 text-[11px] text-white/50">
                  {(answer.lookups ?? []).map(l => <span key={l} className="bg-white/10 rounded px-1.5 py-0.5">{LOOKUP_LABELS[l] ?? l}</span>)}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { if (speaking) { stopSpeaking(); setSpeaking(false); } else { setSpeaking(true); speak(answer.content, lang, () => setSpeaking(false)); } }}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-[14px] cursor-pointer">{speaking ? t('■ Stop reading', '■ रोकें') : t('🔊 Read again', '🔊 फिर सुनें')}</button>
              <button onClick={again} className="flex-1 py-3 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-[14px] font-medium cursor-pointer">{t('Ask another', 'दूसरा प्रश्न')}</button>
            </div>
          </div>
        )}
      </div>

      {(stage === 'idle' || stage === 'listening') && (
        <div className="border-t border-white/10 px-4 py-3 shrink-0">
          <form className="max-w-lg mx-auto flex gap-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const q = String(f.get('q') ?? ''); setHeard(q); void submit(q); }}>
            <input name="q" placeholder={t('Or type your question…', 'या अपना प्रश्न लिखें…')} className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-purple-400 placeholder-white/30" />
            <button type="submit" className="px-4 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-[14px] cursor-pointer">{t('Ask', 'पूछें')}</button>
          </form>
        </div>
      )}
    </div>
  );
}

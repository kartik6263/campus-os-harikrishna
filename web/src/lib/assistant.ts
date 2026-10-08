/**
 * The campus assistant (POST /api/assistant/chat), plus the browser's own
 * speech recognition and synthesis for the voice screens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Which record lookups the answer drew on. */
  lookups?: string[];
  mode?: AssistantMode;
  /** Set when the model failed and the built-in reports answered instead. */
  notice?: string | null;
  ms?: number;
  error?: boolean;
}

export type AssistantMode = 'gemini' | 'claude' | 'builtin';

interface ChatResponse { reply: string; mode: AssistantMode; model: string | null; notice: string | null; lookups: string[]; scope: string; ms: number }

export interface AssistantStatus { mode: AssistantMode; model: string | null; transcription: boolean; insights: 'gemini' | 'builtin'; insightsModel: string | null }

export const MODE_LABEL: Record<AssistantMode, string> = { gemini: '✦ Gemini', claude: '✦ Claude', builtin: 'Built-in reports' };

export const LOOKUP_LABELS: Record<string, string> = {
  institution_overview: 'Institution overview',
  find_students: 'Student records',
  at_risk_students: 'Risk register',
  fee_defaulters: 'Fee ledger',
  low_attendance: 'Attendance register',
  compare: 'College comparison',
  my_attendance: 'Attendance',
  my_fees: 'Fee ledger',
  my_results: 'Results',
  my_timetable: 'Timetable',
  my_learning_plan: 'Learning plan',
  my_standing: 'Standing on the rolls',
};

const KEY = 'resolion.assistant.thread';

function load(): ChatTurn[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as ChatTurn[]; } catch { return []; }
}

export const useAssistantStatus = () =>
  useQuery({ queryKey: ['assistant', 'status'], queryFn: () => api<AssistantStatus>('/api/assistant/status'), staleTime: 300_000 });

/** A conversation with the assistant, kept for the browser session. */
export function useAssistant() {
  const [turns, setTurns] = useState<ChatTurn[]>(load);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-40))); } catch { /* storage blocked */ }
  }, [turns]);

  const ask = useCallback(async (question: string): Promise<ChatTurn | null> => {
    const q = question.trim();
    if (!q || busy) return null;
    const history = [...turns.filter(t => !t.error), { role: 'user' as const, content: q }];
    setTurns(t => [...t, { role: 'user', content: q }]);
    setBusy(true);
    try {
      const res = await api<ChatResponse>('/api/assistant/chat', {
        method: 'POST',
        body: { messages: history.slice(-20).map(({ role, content }) => ({ role, content })) },
      });
      const turn: ChatTurn = { role: 'assistant', content: res.reply, lookups: res.lookups, mode: res.mode, notice: res.notice, ms: res.ms };
      setTurns(t => [...t, turn]);
      return turn;
    } catch (err) {
      const turn: ChatTurn = { role: 'assistant', content: err instanceof ApiError ? err.message : 'The assistant could not be reached. Check your connection and try again.', error: true };
      setTurns(t => [...t, turn]);
      return turn;
    } finally {
      setBusy(false);
    }
  }, [turns, busy]);

  const reset = useCallback(() => setTurns([]), []);

  return { turns, ask, busy, reset };
}

// ─── Speech ───────────────────────────────────────────────────────────────────

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

const Recognizer = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechSupported = () => Boolean(Recognizer());
export const recorderSupported = () => typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

export type VoiceEngine = 'browser' | 'gemini';

/** Longest clip sent for transcription; a spoken question is a few seconds. */
const MAX_CLIP_MS = 45_000;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Listens once and reports the transcript as it forms; `onFinal` gets the
 * finished sentence.
 *
 * Two engines. The browser's own recognition (Chrome, Edge) shows words as
 * they are spoken. Where the browser has none (Firefox, Safari), or when
 * chosen for better Hindi, the clip is recorded and Gemini writes it down on
 * the server. `supported` is true when either is available.
 */
export function useSpeechInput(lang: 'en' | 'hi', onFinal: (text: string) => void) {
  const status = useAssistantStatus();
  const canBrowser = speechSupported();
  const canGemini = recorderSupported() && !!status.data?.transcription;
  const [choice, setChoice] = useState<VoiceEngine | null>(null);
  const engine: VoiceEngine | null = choice === 'gemini' && canGemini ? 'gemini' : choice === 'browser' && canBrowser ? 'browser' : canBrowser ? 'browser' : canGemini ? 'gemini' : null;

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const media = useRef<{ recorder: MediaRecorder; stream: MediaStream; timer: number } | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const startBrowser = useCallback(() => {
    const R = Recognizer()!;
    const r = new R();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0]!.transcript;
        else text += res[0]!.transcript;
      }
      setInterim(finalText + text);
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone access was refused. Allow it in the browser to speak.' : e.error === 'no-speech' ? 'Nothing was heard. Tap the microphone and speak again.' : `Speech recognition stopped (${e.error}).`);
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) finalRef.current(finalText.trim());
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, [lang]);

  const startGemini = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access was refused. Allow it in the browser to speak.');
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      window.clearTimeout(media.current?.timer);
      stream.getTracks().forEach((t) => t.stop());
      media.current = null;
      setListening(false);
      const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
      if (blob.size < 1500) { setError('Nothing was heard. Tap the microphone and speak again.'); return; }
      setTranscribing(true);
      setInterim('Writing down what you said…');
      try {
        const { text } = await api<{ text: string }>('/api/assistant/transcribe', { method: 'POST', body: { audio: await toBase64(blob), mimeType: blob.type, lang } });
        setInterim(text);
        if (text.trim()) finalRef.current(text.trim());
        else setError('Nothing intelligible was heard. Try again a little closer to the microphone.');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The voice clip could not be sent. Check your connection.');
        setInterim('');
      } finally {
        setTranscribing(false);
      }
    };
    recorder.start();
    media.current = { recorder, stream, timer: window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_CLIP_MS) };
    setInterim('Recording… tap again when you have finished');
    setListening(true);
  }, [lang]);

  const start = useCallback(() => {
    if (!engine) { setError('This browser cannot take voice input. Use Chrome or Edge, or type the question.'); return; }
    setError(null);
    setInterim('');
    if (engine === 'browser') startBrowser();
    else void startGemini();
  }, [engine, startBrowser, startGemini]);

  const stop = useCallback(() => {
    rec.current?.stop();
    if (media.current?.recorder.state === 'recording') media.current.recorder.stop();
  }, []);

  useEffect(() => () => {
    rec.current?.stop();
    if (media.current) { media.current.recorder.state === 'recording' && media.current.recorder.stop(); media.current.stream.getTracks().forEach((t) => t.stop()); }
  }, []);

  return {
    listening, transcribing, interim, error, start, stop,
    supported: engine !== null,
    engine,
    /** Both engines are available, so the person may choose. */
    canChoose: canBrowser && canGemini,
    setEngine: setChoice,
  };
}


/** Reads text aloud in Hindi or Indian English, without the markdown. */
export function speak(text: string, lang: 'en' | 'hi', onEnd?: () => void) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const plain = text
    .replace(/\|[^\n]*\|/g, ' ')
    .replace(/[*_#`>-]/g, ' ')
    .replace(/₹/g, lang === 'hi' ? ' रुपये ' : ' rupees ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  const u = new SpeechSynthesisUtterance(plain);
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const voice = window.speechSynthesis.getVoices().find(v => v.lang === u.lang);
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export const stopSpeaking = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };

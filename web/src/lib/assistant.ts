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
  mode?: 'claude' | 'builtin';
  ms?: number;
  error?: boolean;
}

interface ChatResponse { reply: string; mode: 'claude' | 'builtin'; lookups: string[]; scope: string; ms: number }

export const LOOKUP_LABELS: Record<string, string> = {
  institution_overview: 'Institution overview',
  find_students: 'Student records',
  at_risk_students: 'Risk register',
  fee_defaulters: 'Fee ledger',
  low_attendance: 'Attendance register',
  compare: 'College comparison',
};

const KEY = 'resolion.assistant.thread';

function load(): ChatTurn[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as ChatTurn[]; } catch { return []; }
}

export const useAssistantStatus = () =>
  useQuery({ queryKey: ['assistant', 'status'], queryFn: () => api<{ mode: 'claude' | 'builtin'; model: string | null }>('/api/assistant/status'), staleTime: 300_000 });

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
      const turn: ChatTurn = { role: 'assistant', content: res.reply, lookups: res.lookups, mode: res.mode, ms: res.ms };
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

/** Listens once and reports the transcript as it forms; `onFinal` gets the finished sentence. */
export function useSpeechInput(lang: 'en' | 'hi', onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const start = useCallback(() => {
    const R = Recognizer();
    if (!R) { setError('This browser has no speech recognition. Use Chrome or Edge.'); return; }
    setError(null);
    setInterim('');
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
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone access was refused. Allow it in the browser to speak.' : `Speech recognition stopped (${e.error}).`);
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) finalRef.current(finalText.trim());
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => rec.current?.stop(), []);

  useEffect(() => () => rec.current?.stop(), []);

  return { listening, interim, error, start, stop, supported: speechSupported() };
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

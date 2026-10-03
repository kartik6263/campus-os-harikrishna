import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'hi';

interface LangCtx {
  lang: Lang;
  toggle: () => void;
  t: (en: string, hi: string) => string;
}

const LangContext = createContext<LangCtx>({ lang: 'en', toggle: () => {}, t: (en) => en });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  const toggle = () => setLang(l => l === 'en' ? 'hi' : 'en');
  const t = (en: string, hi: string) => lang === 'en' ? en : hi;
  return <LangContext.Provider value={{ lang, toggle, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'hi';

interface LangCtx {
  lang: Lang;
  toggle: () => void;
  /** t('English copy', 'हिन्दी प्रति') */
  t: (en: string, hi: string) => string;
}

const LangContext = createContext<LangCtx>({ lang: 'en', toggle: () => {}, t: (en) => en });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'hi' : 'en')), []);
  const t = useCallback((en: string, hi: string) => (lang === 'en' ? en : hi), [lang]);

  const value = useMemo(() => ({ lang, toggle, t }), [lang, toggle, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

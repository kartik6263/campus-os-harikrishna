import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Cloudflare Turnstile.
 *
 * Falls back to Cloudflare's always-pass test key in development so the form
 * works out of the box; production builds must set VITE_TURNSTILE_SITE_KEY.
 * Set it to an empty string to turn the widget off.
 */
const envKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const TURNSTILE_SITE_KEY = envKey ?? (import.meta.env.DEV ? '1x00000000000000000000AA' : '');

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing')));
    s.onerror = () => {
      loader = null;
      reject(new Error('Could not load Turnstile'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

export interface TurnstileHandle {
  /** Tokens are single-use: reset after every submit, pass or fail. */
  reset: () => void;
}

interface Props {
  onToken: (token: string | null) => void;
  lang?: string;
}

export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile({ onToken, lang = 'en' }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }), []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    loadTurnstile()
      .then(ts => {
        if (cancelled || !box.current) return;
        widgetId.current = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: lang === 'hi' ? 'hi' : 'en',
          theme: 'light',
          callback: (t: string) => onTokenRef.current(t),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [lang]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
});

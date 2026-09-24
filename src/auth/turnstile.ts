import type { Request } from 'express';
import { env } from '../env.js';
import { ApiError } from '../lib/http.js';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Whether this request must carry a Cloudflare Turnstile token.
 *
 * The widget only exists in the browser app, so only requests from the
 * configured browser origins are held to it. The native app sends no Origin
 * and has no widget; it is exempt until it gets one.
 */
export function captchaRequired(req: Request): boolean {
  if (!env.TURNSTILE_SECRET_KEY) return false;
  const origin = req.headers.origin;
  return !!origin && env.turnstileOrigins.includes(origin);
}

/** Throws unless Cloudflare confirms the token. A token is good once. */
export async function verifyTurnstile(req: Request, token: string | undefined): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (!token) throw new ApiError(400, 'Complete the security check first', 'captcha_required');

  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (req.ip) form.set('remoteip', req.ip);

  let result: { success: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    result = (await res.json()) as typeof result;
  } catch {
    throw new ApiError(503, 'Could not reach the security check service. Try again.', 'captcha_unavailable');
  }

  if (!result.success) {
    throw new ApiError(400, 'Security check failed or expired. Please try again.', 'captcha_failed', result['error-codes']);
  }
}

import type { Request } from 'express';
import { ApiError } from './http.js';
import { hit } from './ratelimit.js';

/**
 * A per-account allowance on calls that reach an AI model, so one account
 * cannot run up the institute's model bill. Counted per signed-in user, not
 * per address, so a whole hostel behind one IP is not throttled together.
 */
export function aiQuota(req: Request, name: string, limit: number, windowMinutes: number) {
  const wait = hit(`ai:${name}:${req.auth!.sub}`, limit, windowMinutes * 60_000);
  if (wait) {
    const minutes = Math.ceil(wait / 60);
    throw new ApiError(429, `You have asked a lot in a short while. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 'rate_limited');
  }
}

import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './http.js';
import { env } from '../env.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * A fixed-window request limiter, held in memory.
 *
 * Enough for one API process, which is how an institute's server runs. A
 * deployment that runs several processes behind a balancer should put the
 * same limits at the proxy (or swap this store for Redis): each process here
 * only counts what it sees.
 */
interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

// Forget windows that have closed, so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of buckets) if (w.resetAt <= now) buckets.delete(key);
}, 60_000).unref();

/** Counts one hit against `key`; returns the seconds to wait if the limit is exceeded, else 0. */
export function hit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  w.count += 1;
  return w.count > limit ? Math.ceil((w.resetAt - now) / 1000) : 0;
}

function tooMany(res: Response, retryAfter: number): ApiError {
  res.setHeader('Retry-After', String(retryAfter));
  const minutes = Math.ceil(retryAfter / 60);
  return new ApiError(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 'rate_limited');
}

/**
 * Limits a route per client address and, when the body names an account,
 * per account too — so one address cannot hammer many accounts, and many
 * addresses cannot hammer one.
 */
export function rateLimit(name: string, opts: { perIp: number; perAccount?: number; windowMinutes: number }) {
  const windowMs = opts.windowMinutes * 60_000;
  return (req: Request, res: Response, next: NextFunction) => {
    // The smoke suites sign in hundreds of times from this machine; a real
    // deployment (NODE_ENV=production) is always limited.
    if (!env.isProd && LOOPBACK.has(req.ip ?? '')) return next();
    const wait = hit(`${name}:ip:${req.ip ?? 'unknown'}`, opts.perIp, windowMs);
    if (wait) return next(tooMany(res, wait));

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;
    if (opts.perAccount && email) {
      const waitAccount = hit(`${name}:acct:${email}`, opts.perAccount, windowMs);
      if (waitAccount) return next(tooMany(res, waitAccount));
    }
    next();
  };
}

import type { NextFunction, Request, Response } from 'express';

/**
 * Request counts and timings for the last hour, kept in memory per process.
 *
 * One bucket per minute: enough for the IT console's health page to report
 * real traffic and latency without a metrics service. A restart starts the
 * window afresh, which the page says.
 */
interface Bucket { minute: number; count: number; errors: number; totalMs: number; samples: number[] }

const WINDOW_MINUTES = 60;
const buckets: Bucket[] = [];
export const startedAt = new Date();

function bucketFor(minute: number): Bucket {
  let b = buckets[buckets.length - 1];
  if (!b || b.minute !== minute) {
    b = { minute, count: 0, errors: 0, totalMs: 0, samples: [] };
    buckets.push(b);
    while (buckets.length && buckets[0]!.minute <= minute - WINDOW_MINUTES) buckets.shift();
  }
  return b;
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const b = bucketFor(Math.floor(Date.now() / 60_000));
    b.count++;
    if (res.statusCode >= 500) b.errors++;
    b.totalMs += ms;
    // A sample of timings per minute is enough for a percentile.
    if (b.samples.length < 200) b.samples.push(ms);
  });
  next();
}

export function metricsSnapshot() {
  const now = Math.floor(Date.now() / 60_000);
  const live = buckets.filter((b) => b.minute > now - WINDOW_MINUTES);
  const count = live.reduce((s, b) => s + b.count, 0);
  const errors = live.reduce((s, b) => s + b.errors, 0);
  const totalMs = live.reduce((s, b) => s + b.totalMs, 0);
  const samples = live.flatMap((b) => b.samples).sort((a, b) => a - b);
  const pct = (p: number) => (samples.length ? Math.round(samples[Math.min(samples.length - 1, Math.floor(p * samples.length))]!) : null);
  const peak = live.reduce((m, b) => Math.max(m, b.count), 0);
  return {
    windowMinutes: Math.min(WINDOW_MINUTES, Math.ceil((Date.now() - startedAt.getTime()) / 60_000)),
    requests: count,
    serverErrors: errors,
    avgMs: count ? Math.round(totalMs / count) : null,
    p95Ms: pct(0.95),
    peakPerMinute: peak,
    perMinute: Array.from({ length: 30 }, (_, i) => buckets.find((b) => b.minute === now - 29 + i)?.count ?? 0),
  };
}

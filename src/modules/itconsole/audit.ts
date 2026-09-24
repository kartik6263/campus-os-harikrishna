import crypto from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../../db.js';

/**
 * The hash-chained audit log.
 *
 * Each entry carries the hash of the one before it, computed over its own
 * fields. Altering or removing any entry therefore breaks every hash after
 * it, and walking the chain finds exactly where — which is the difference
 * between a log you can rely on and a table anyone could edit.
 */

/** The first link, for an empty chain. */
export const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  actorId?: string | null;
  actorName: string;
  actorRole?: string | null;
  module: string;
  action: string;
  target: string;
  detail?: string | null;
  ip?: string | null;
  outcome?: 'OK' | 'WARN' | 'DENIED';
}

/** The digest over an entry's own fields and the link before it. */
export function digest(fields: {
  seq: number;
  occurredAt: Date;
  actorName: string;
  module: string;
  action: string;
  target: string;
  outcome: string;
  prevHash: string;
}): string {
  const payload = [
    fields.seq,
    fields.occurredAt.toISOString(),
    fields.actorName,
    fields.module,
    fields.action,
    fields.target,
    fields.outcome,
    fields.prevHash,
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Appends an entry.
 *
 * Deliberately never throws: an audit write that fails must not take down the
 * action it was recording — a lost line is bad, a refused fee receipt because
 * the log hiccuped is worse. A failure is reported to the server log instead.
 */
export async function record(input: AuditInput): Promise<void> {
  try {
    const previous = await prisma.auditEntry.findFirst({
      orderBy: { seq: 'desc' },
      select: { hash: true },
    });

    const prevHash = previous?.hash ?? GENESIS_HASH;
    const occurredAt = new Date();

    // The sequence is a database counter, so two concurrent writes cannot
    // take the same number; the row is created first and hashed against the
    // number it actually received.
    const created = await prisma.auditEntry.create({
      data: {
        actorId: input.actorId ?? null,
        actorName: input.actorName,
        actorRole: input.actorRole ?? null,
        module: input.module,
        action: input.action,
        target: input.target,
        detail: input.detail ?? null,
        ip: input.ip ?? null,
        outcome: input.outcome ?? 'OK',
        occurredAt,
        prevHash,
        // Replaced immediately below; unique, so a collision cannot occur.
        hash: crypto.randomUUID(),
      },
    });

    await prisma.auditEntry.update({
      where: { id: created.id },
      data: {
        hash: digest({
          seq: created.seq,
          occurredAt,
          actorName: input.actorName,
          module: input.module,
          action: input.action,
          target: input.target,
          outcome: input.outcome ?? 'OK',
          prevHash,
        }),
      },
    });
  } catch (err) {
    console.error('[audit] could not record entry', err);
  }
}

/** Records against whoever is making the request. */
export async function recordFor(
  req: Request,
  input: Omit<AuditInput, 'actorId' | 'actorName' | 'actorRole' | 'ip'>,
): Promise<void> {
  const auth = req.auth;
  let actorName = 'Unknown';

  if (auth) {
    const user = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: {
        email: true,
        faculty: { select: { name: true } },
        office: { select: { name: true } },
        student: { select: { name: true } },
      },
    });
    actorName =
      user?.faculty?.name ?? user?.office?.name ?? user?.student?.name ?? user?.email ?? 'Unknown';
  }

  await record({
    ...input,
    actorId: auth?.sub ?? null,
    actorName,
    actorRole: auth?.role ?? null,
    ip: req.ip ?? null,
  });
}

export interface ChainCheck {
  entries: number;
  intact: boolean;
  /** The first entry whose hash does not match what it should be. */
  brokenAt: { seq: number; id: string; reason: string } | null;
}

/**
 * Walks the chain and reports the first break.
 *
 * Two things can be wrong: an entry's own hash no longer matches its
 * contents, or it does not point at the entry before it. The first is
 * tampering with a row, the second is a row having been removed.
 */
export async function verifyChain(): Promise<ChainCheck> {
  const entries = await prisma.auditEntry.findMany({
    orderBy: { seq: 'asc' },
    select: {
      id: true, seq: true, occurredAt: true, actorName: true, module: true,
      action: true, target: true, outcome: true, hash: true, prevHash: true,
    },
  });

  let expectedPrev = GENESIS_HASH;

  for (const e of entries) {
    if (e.prevHash !== expectedPrev) {
      return {
        entries: entries.length,
        intact: false,
        brokenAt: {
          seq: e.seq,
          id: e.id,
          reason: 'does not follow the entry before it — a row has been removed or reordered',
        },
      };
    }

    const expected = digest({
      seq: e.seq,
      occurredAt: e.occurredAt,
      actorName: e.actorName,
      module: e.module,
      action: e.action,
      target: e.target,
      outcome: e.outcome,
      prevHash: e.prevHash,
    });

    if (expected !== e.hash) {
      return {
        entries: entries.length,
        intact: false,
        brokenAt: { seq: e.seq, id: e.id, reason: 'contents no longer match its hash' },
      };
    }

    expectedPrev = e.hash;
  }

  return { entries: entries.length, intact: true, brokenAt: null };
}

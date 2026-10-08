import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireAuth, requireRole, resolveStudentId } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { TEMPLATES, ensureForRequest, issueCertificate, verifyUrl } from './issue.js';
import { publicKeys, rotateKey } from './signing.js';

/**
 * The register of digital certificates (/api/certificates): issuing directly
 * — a convocation's degrees, a seminar's participation certificates, merit
 * awards — revoking with a reason, the official PDF, and the signing keys.
 *
 * Certificates a student requests still go through the college office queue;
 * marking one ready issues it here, the same way.
 */
export const certificatesRouter = Router();
certificatesRouter.use(requireAuth);

const STAFF = ['OFFICE', 'REGISTRAR', 'ADMIN', 'PRINCIPAL'] as const;
const ISSUERS = ['REGISTRAR', 'ADMIN', 'PRINCIPAL'] as const;

type Row = Prisma.DigitalCertificateGetPayload<{ include: { key: { select: { retiredAt: true } } } }>;

function present(c: Row) {
  return {
    id: c.id,
    serialNo: c.serialNo,
    type: c.type,
    title: c.title,
    statement: c.statement,
    recipientName: c.recipientName,
    recipientRef: c.recipientRef,
    recipientEmail: c.recipientEmail,
    studentId: c.studentId,
    requestId: c.requestId,
    fields: c.fields as Array<[string, string]>,
    issuedAt: c.issuedAt,
    validUntil: c.validUntil,
    expired: !!c.validUntil && c.validUntil < new Date(),
    issuer: { name: c.issuerName, title: c.issuerTitle },
    status: c.status,
    revokedAt: c.revokedAt,
    revokedReason: c.revokedReason,
    revokedBy: c.revokedBy,
    batchRef: c.batchRef,
    keyId: c.keyId,
    keyRetired: !!c.key.retiredAt,
    payloadHash: c.payloadHash,
    pdfHash: c.pdfHash,
    hasPdf: !!c.fileId,
    verifications: c.verifications,
    lastVerifiedAt: c.lastVerifiedAt,
    verifyUrl: verifyUrl(c.serialNo, c.signature),
  };
}

const INCLUDE = { key: { select: { retiredAt: true } } } as const;

async function actorOf(req: Request) {
  const u = await prisma.user.findUnique({
    where: { id: req.auth!.sub },
    select: { email: true, office: { select: { name: true, designation: true } }, faculty: { select: { name: true, designation: true } } },
  });
  const person = u?.office ?? u?.faculty;
  const fallback: Record<string, string> = { REGISTRAR: 'Registrar', PRINCIPAL: 'Principal', ADMIN: 'Administrator' };
  return { name: person?.name ?? u?.email.split('@')[0] ?? 'Registrar', title: person?.designation ?? fallback[req.auth!.role] ?? 'Authorised signatory' };
}

// ─── GET /api/certificates ────────────────────────────────────────────────────

certificatesRouter.get(
  '/',
  requireRole(...STAFF),
  validate('query', z.object({
    q: z.string().trim().max(80).optional(),
    type: z.string().max(60).optional(),
    status: z.enum(['VALID', 'REVOKED', 'EXPIRED']).optional(),
    batch: z.string().max(80).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { q, type, status, batch } = validQuery<{ q?: string; type?: string; status?: 'VALID' | 'REVOKED' | 'EXPIRED'; batch?: string }>(req);
    const now = new Date();
    const where: Prisma.DigitalCertificateWhereInput = {
      ...(type ? { type } : {}),
      ...(batch ? { batchRef: batch } : {}),
      ...(status === 'REVOKED' ? { status: 'REVOKED' } : status === 'EXPIRED' ? { status: 'VALID', validUntil: { lt: now } } : status === 'VALID' ? { status: 'VALID', OR: [{ validUntil: null }, { validUntil: { gte: now } }] } : {}),
      ...(q ? { AND: [{ OR: [{ serialNo: { contains: q, mode: 'insensitive' } }, { recipientName: { contains: q, mode: 'insensitive' } }, { recipientRef: { contains: q, mode: 'insensitive' } }, { batchRef: { contains: q, mode: 'insensitive' } }] }] } : {}),
    };
    const [rows, total, byStatus, batches] = await Promise.all([
      prisma.digitalCertificate.findMany({ where, include: INCLUDE, orderBy: { issuedAt: 'desc' }, take: 500 }),
      prisma.digitalCertificate.count({ where }),
      prisma.digitalCertificate.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.digitalCertificate.groupBy({ by: ['batchRef'], where: { batchRef: { not: null } }, _count: { _all: true }, orderBy: { batchRef: 'desc' }, take: 50 }),
    ]);
    const expired = await prisma.digitalCertificate.count({ where: { status: 'VALID', validUntil: { lt: now } } });
    res.json({
      total,
      shown: rows.length,
      counts: { valid: (byStatus.find((b) => b.status === 'VALID')?._count._all ?? 0) - expired, revoked: byStatus.find((b) => b.status === 'REVOKED')?._count._all ?? 0, expired },
      batches: batches.map((b) => ({ batchRef: b.batchRef!, count: b._count._all })),
      certificates: rows.map(present),
    });
  }),
);

// ─── GET /api/certificates/templates ──────────────────────────────────────────

certificatesRouter.get(
  '/templates',
  requireRole(...STAFF),
  asyncHandler(async (_req, res) => {
    res.json(Object.entries(TEMPLATES).map(([type, t]) => ({ type, title: t.title, statement: t.statement })));
  }),
);

// ─── POST /api/certificates/issue ─────────────────────────────────────────────

const recipient = z.union([
  z.object({ studentId: z.string().min(1), fields: z.array(z.tuple([z.string().max(40), z.string().max(160)])).max(4).optional() }),
  z.object({
    name: z.string().trim().min(2).max(120),
    ref: z.string().trim().max(60).optional(),
    email: z.string().trim().email().optional(),
    fields: z.array(z.tuple([z.string().max(40), z.string().max(160)])).max(4).optional(),
  }),
]);

const issueBody = z.object({
  type: z.string().trim().min(3).max(60),
  title: z.string().trim().min(3).max(80),
  /** `{name}` and `{programme}` are filled per recipient. */
  statement: z.string().trim().min(10).max(600),
  fields: z.array(z.tuple([z.string().trim().min(1).max(40), z.string().trim().min(1).max(160)])).max(6).default([]),
  validUntil: z.string().date().optional(),
  batchRef: z.string().trim().max(80).optional(),
  issuer: z.object({ name: z.string().trim().min(2).max(80), title: z.string().trim().min(2).max(80) }).optional(),
  recipients: z.array(recipient).min(1).max(500),
});

/**
 * Issues certificates directly: one, or a batch for a whole event or
 * convocation. Students named are checked to exist; each certificate is its
 * own transaction, so one bad row does not undo the rest, and each failure
 * is reported against its row.
 */
certificatesRouter.post(
  '/issue',
  requireRole(...ISSUERS),
  validate('body', issueBody),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof issueBody>;
    if (body.validUntil && new Date(`${body.validUntil}T23:59:59.999Z`) <= new Date()) throw ApiError.badRequest('"Valid until" must be in the future');
    const actor = await actorOf(req);
    const issuer = body.issuer ?? actor;
    const studentIds = body.recipients.flatMap((r) => ('studentId' in r ? [r.studentId] : []));
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, enrolmentNo: true, status: true, user: { select: { email: true } }, programme: { select: { name: true } } },
    });
    const byId = new Map(students.map((s) => [s.id, s]));
    const batchRef = body.batchRef || (body.recipients.length > 1 ? `B/${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(3).toString('hex').toUpperCase()}` : null);
    const issued: Array<{ id: string; serialNo: string; recipientName: string }> = [];
    const failed: Array<{ row: number; recipient: string; reason: string }> = [];

    for (const [i, r] of body.recipients.entries()) {
      const s = 'studentId' in r ? byId.get(r.studentId) : null;
      const label = s?.name ?? ('name' in r ? r.name : 'studentId' in r ? r.studentId : '?');
      if ('studentId' in r && !s) { failed.push({ row: i + 1, recipient: label, reason: 'No such student' }); continue; }
      if (s && ['RUSTICATED'].includes(s.status)) { failed.push({ row: i + 1, recipient: label, reason: 'The student was rusticated' }); continue; }
      const name = s?.name ?? (r as { name: string }).name;
      const programme = s?.programme.name ?? '';
      const fill = (t: string) => t.replace(/\{name\}/g, name).replace(/\{programme\}/g, programme || 'the programme');
      try {
        const c = await prisma.$transaction((tx) => issueCertificate({
          type: body.type, title: fill(body.title), statement: fill(body.statement),
          recipientName: name, recipientRef: s?.enrolmentNo ?? (r as { ref?: string }).ref ?? null,
          recipientEmail: s?.user.email ?? (r as { email?: string }).email ?? null,
          studentId: s?.id ?? null,
          fields: [...(s ? [['Enrolment No.', s.enrolmentNo] as [string, string], ['Programme', s.programme.name] as [string, string]] : []), ...body.fields.map(([l, v]) => [l, fill(v)] as [string, string]), ...(r.fields ?? [])],
          validUntil: body.validUntil ? new Date(`${body.validUntil}T23:59:59.999Z`) : null,
          issuerName: issuer.name, issuerTitle: issuer.title, issuedById: req.auth!.sub, batchRef,
        }, tx), { timeout: 20_000 });
        issued.push({ id: c.id, serialNo: c.serialNo, recipientName: c.recipientName });
      } catch (err) {
        failed.push({ row: i + 1, recipient: label, reason: err instanceof Error ? err.message : 'Could not issue' });
      }
    }

    await recordFor(req, {
      module: 'Certificates', action: 'issue', target: batchRef ?? issued[0]?.serialNo ?? body.type,
      detail: `${body.type}: ${issued.length} issued, ${failed.length} failed; signed as ${issuer.name}, ${issuer.title}`,
      outcome: failed.length ? 'WARN' : 'OK',
    });
    if (!issued.length) throw ApiError.badRequest('None of the certificates could be issued', { batchRef: null, issued, failed });
    res.status(201).json({ batchRef, issued, failed });
  }),
);

// ─── POST /api/certificates/:id/revoke ────────────────────────────────────────

certificatesRouter.post(
  '/:id/revoke',
  requireRole('REGISTRAR', 'ADMIN'),
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ reason: z.string().trim().min(10).max(500) })),
  asyncHandler(async (req, res) => {
    const c = await prisma.digitalCertificate.findUnique({ where: { id: String(req.params.id) } });
    if (!c) throw ApiError.notFound('No such certificate');
    if (c.status === 'REVOKED') throw ApiError.conflict('This certificate is already revoked');
    const { reason } = req.body as { reason: string };
    const actor = await actorOf(req);
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.digitalCertificate.update({
        where: { id: c.id },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason, revokedBy: `${actor.name}, ${actor.title}` },
        include: INCLUDE,
      });
      if (c.studentId) {
        await tx.notification.create({ data: { studentId: c.studentId, kind: 'GENERAL', urgent: true, title: `${c.title} revoked`, body: `Certificate ${c.serialNo} was revoked: ${reason}`, href: '/certificates' } });
      }
      return u;
    });
    await recordFor(req, { module: 'Certificates', action: 'revoke', target: c.serialNo, detail: reason, outcome: 'WARN' });
    res.json(present(updated));
  }),
);

// ─── The official PDF ─────────────────────────────────────────────────────────

/** Staff, the holder, or the holder's parent; nobody else. */
async function mayRead(req: Request, studentId: string | null) {
  const role = req.auth!.role;
  if ((STAFF as readonly string[]).includes(role)) return true;
  if (!studentId) return false;
  if (role === 'STUDENT') return req.auth!.studentId === studentId;
  if (role === 'PARENT') return !!(await prisma.student.findFirst({ where: { id: studentId, guardianId: req.auth!.sub }, select: { id: true } }));
  return false;
}

certificatesRouter.get(
  '/:id/pdf',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const c = await prisma.digitalCertificate.findUnique({ where: { id: String(req.params.id) }, select: { serialNo: true, studentId: true, fileId: true } });
    if (!c || !(await mayRead(req, c.studentId))) throw ApiError.notFound('No such certificate');
    if (!c.fileId) throw ApiError.notFound('This certificate has no PDF on file');
    const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: c.fileId }, select: { name: true, bytes: true } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(Buffer.from(file.bytes));
  }),
);

// ─── A holder's own certificates ──────────────────────────────────────────────

certificatesRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    // Office-issued requests from before digital signing are signed on first look.
    const legacy = await prisma.certificateRequest.findMany({ where: { studentId, stage: { in: ['READY', 'DISPATCHED'] }, issuedAt: { not: null }, digital: null }, select: { id: true } });
    for (const l of legacy) await prisma.$transaction((tx) => ensureForRequest(l.id, tx), { timeout: 20_000 });
    const rows = await prisma.digitalCertificate.findMany({ where: { studentId }, include: INCLUDE, orderBy: { issuedAt: 'desc' } });
    res.json(rows.map(present));
  }),
);

// ─── Signing keys ─────────────────────────────────────────────────────────────

certificatesRouter.get(
  '/keys',
  requireRole('REGISTRAR', 'ADMIN'),
  asyncHandler(async (_req, res) => {
    const [keys, counts] = await Promise.all([publicKeys(), prisma.digitalCertificate.groupBy({ by: ['keyId'], _count: { _all: true } })]);
    res.json({ heldOutside: Boolean(process.env.CERT_SIGNING_KEY), keys: keys.map((k) => ({ ...k, certificates: counts.find((c) => c.keyId === k.kid)?._count._all ?? 0 })) });
  }),
);

certificatesRouter.post(
  '/keys/rotate',
  requireRole('ADMIN'),
  validate('body', z.object({ reason: z.string().trim().min(10).max(300) })),
  asyncHandler(async (req, res) => {
    let row;
    try { row = await rotateKey(); } catch (err) { throw ApiError.conflict(err instanceof Error ? err.message : 'Could not rotate'); }
    await recordFor(req, { module: 'Certificates', action: 'rotate signing key', target: row.id, detail: (req.body as { reason: string }).reason, outcome: 'WARN' });
    res.status(201).json({ kid: row.id, createdAt: row.createdAt });
  }),
);

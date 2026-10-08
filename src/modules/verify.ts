import crypto from 'node:crypto';
import express, { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { asyncHandler, validQuery, validate } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { record } from './itconsole/audit.js';
import { check, ensureForRequest } from './certificates/issue.js';
import { publicKeys, sha256 } from './certificates/signing.js';

/**
 * Public certificate verification — no sign-in, for employers, universities
 * and embassies.
 *
 * Three ways to check:
 *  - the number (and, from the QR code, the start of the signature);
 *  - the PDF itself, uploaded: its SHA-256 is matched against the hash filed
 *    at issue, so an edited copy is caught even if its number is real;
 *  - independently: /keys publishes the institution's public keys, and every
 *    answer carries the signed payload and its Ed25519 signature.
 *
 * Every certificate's signature is re-checked against its key on each
 * verification, so a row altered in the database is reported as tampered.
 * Someone holding only a number sees a masked name; whoever holds the QR
 * code or the file sees the certificate in full.
 */
export const verifyRouter = Router();

const limiter = rateLimit('verify', { perIp: 120, windowMinutes: 10 });

/** The keyed hash printed in QR codes before Ed25519 signing; old paper copies still carry it. */
export function certificateSignature(c: { requestNo: string; enrolmentNo: string; type: string; issuedAt: Date }): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(`cert|${c.requestNo}|${c.enrolmentNo}|${c.type}|${c.issuedAt.toISOString()}`).digest('hex').slice(0, 20);
}

/** Shows enough of a name to match the paper, not enough to harvest. */
const maskName = (name: string) =>
  name.split(' ').map((w, i) => (i === 0 ? w : `${w[0]}${'•'.repeat(Math.max(1, w.length - 1))}`)).join(' ');

type Status = 'valid' | 'revoked' | 'expired' | 'tampered' | 'not_found' | 'not_issued' | 'unmatched';
type Cert = Prisma.DigitalCertificateGetPayload<{ include: { key: { select: { publicKey: true; retiredAt: true } } } }>;

const newRef = () => `VR/${new Date().getFullYear()}/${crypto.randomInt(100000, 999999)}`;

async function log(req: Request, target: string, status: Status, ref: string, how: string) {
  await record({ actorName: 'Public verification', module: 'Certificates', action: `Verified (${how}): ${status}`, target, detail: ref, ip: req.ip ?? null, outcome: status === 'valid' ? 'OK' : 'WARN' });
}

/** The answer for one certificate; `full` when the asker holds the QR code or the file. */
function answer(c: Cert, status: Status, full: boolean, signatureOk: boolean, payload: unknown) {
  return {
    serialNo: c.serialNo,
    type: c.type,
    title: c.title,
    statement: c.statement,
    recipient: { name: full ? c.recipientName : maskName(c.recipientName), ref: c.recipientRef },
    fields: full ? (c.fields as Array<[string, string]>) : (c.fields as Array<[string, string]>).filter(([l]) => !/mobile|email|address|dob|birth/i.test(l)),
    institution: { name: c.institutionName, code: c.institutionCode },
    issuedAt: c.issuedAt,
    validUntil: c.validUntil,
    issuer: `${c.issuerName}, ${c.issuerTitle}`,
    revokedAt: status === 'revoked' ? c.revokedAt : null,
    revokedReason: status === 'revoked' ? c.revokedReason : null,
    verifications: c.verifications,
    cryptography: {
      algorithm: 'Ed25519',
      keyId: c.keyId,
      keyRetired: !!c.key.retiredAt,
      signatureValid: signatureOk,
      payloadHash: c.payloadHash,
      pdfHash: c.pdfHash,
      // Enough to check the signature without trusting this server: the exact bytes signed, and the signature.
      ...(full ? { payload, signature: c.signature } : {}),
    },
  };
}

async function counted(c: Cert) {
  await prisma.digitalCertificate.update({ where: { id: c.id }, data: { verifications: { increment: 1 }, lastVerifiedAt: new Date() } });
  return { ...c, verifications: c.verifications + 1 };
}

const INCLUDE = { key: { select: { publicKey: true, retiredAt: true } } } as const;

// ─── GET /api/verify/certificate?no=&sig= ─────────────────────────────────────

const query = z.object({ no: z.string().trim().min(3).max(60), sig: z.string().trim().max(128).optional() });

verifyRouter.get(
  '/certificate',
  limiter,
  validate('query', query),
  asyncHandler(async (req, res) => {
    const { no, sig } = validQuery<z.infer<typeof query>>(req);
    const serial = no.toUpperCase();
    const ref = newRef();
    let cert: Cert | null = await prisma.digitalCertificate.findUnique({ where: { serialNo: serial }, include: INCLUDE });
    let legacySig: string | null = null;

    // A number from the office queue: issued before digital signing, it is signed now; not yet issued, it says so.
    if (!cert) {
      const request = await prisma.certificateRequest.findUnique({ where: { requestNo: serial }, include: { student: { select: { enrolmentNo: true } } } });
      if (request) {
        if (!request.issuedAt || !['READY', 'DISPATCHED'].includes(request.stage)) {
          await log(req, serial, 'not_issued', ref, 'number');
          return void res.json({ status: 'not_issued', reference: ref, checkedAt: new Date(), signatureChecked: false, certificate: null });
        }
        legacySig = certificateSignature({ requestNo: request.requestNo, enrolmentNo: request.student.enrolmentNo, type: request.type, issuedAt: request.issuedAt });
        await prisma.$transaction((tx) => ensureForRequest(request.id, tx), { timeout: 20_000 });
        cert = await prisma.digitalCertificate.findUnique({ where: { serialNo: serial }, include: INCLUDE });
      }
    }
    if (!cert) {
      await log(req, serial, 'not_found', ref, 'number');
      return void res.json({ status: 'not_found', reference: ref, checkedAt: new Date(), signatureChecked: false, certificate: null });
    }

    const result = check(cert);
    // The QR code carries the start of the signature; a code that does not match it was not printed by us.
    const sigMatches = !sig || cert.signature.startsWith(sig) || (legacySig !== null && sig === legacySig) || sig === certificateSignature({ requestNo: cert.serialNo, enrolmentNo: cert.recipientRef ?? '', type: cert.type, issuedAt: cert.issuedAt });
    const status: Status = sig && !sigMatches ? 'tampered' : result.status;
    const full = !!sig && sigMatches;
    const counted_ = await counted(cert);
    await log(req, serial, status, ref, sig ? 'QR' : 'number');
    res.json({ status, reference: ref, checkedAt: new Date(), signatureChecked: !!sig, certificate: status === 'tampered' && !result.signatureOk ? null : answer(counted_, status, full, result.signatureOk, result.payload) });
  }),
);

// ─── POST /api/verify/document ────────────────────────────────────────────────

/**
 * Checks a PDF someone was handed. Its SHA-256 must equal the hash filed when
 * the certificate was issued: a single changed byte — a name, a grade, a
 * date — and it does not match.
 */
verifyRouter.post(
  '/document',
  limiter,
  express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '15mb' }),
  asyncHandler(async (req, res) => {
    const bytes = req.body as Buffer;
    const ref = newRef();
    if (!Buffer.isBuffer(bytes) || bytes.length < 100) {
      return void res.status(400).json({ error: { message: 'Upload the certificate as a PDF file', code: 'bad_request' } });
    }
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return void res.status(400).json({ error: { message: 'That file is not a PDF', code: 'bad_request' } });
    }
    const hash = sha256(bytes);
    const cert = await prisma.digitalCertificate.findUnique({ where: { pdfHash: hash }, include: INCLUDE });
    if (!cert) {
      // Not ours, or ours and altered. If it names a serial we know, say which — the holder can be asked for the original.
      const text = bytes.toString('latin1');
      const named = /Certificate No\. ([A-Z0-9/]+)/.exec(text)?.[1] ?? null;
      const known = named ? await prisma.digitalCertificate.findUnique({ where: { serialNo: named }, select: { serialNo: true } }) : null;
      await log(req, named ?? hash.slice(0, 16), 'unmatched', ref, 'document');
      return void res.json({ status: 'unmatched', reference: ref, checkedAt: new Date(), documentHash: hash, claimsSerial: known?.serialNo ?? null, certificate: null });
    }
    const result = check(cert);
    const c = await counted(cert);
    await log(req, cert.serialNo, result.status, ref, 'document');
    res.json({ status: result.status, reference: ref, checkedAt: new Date(), documentHash: hash, signatureChecked: true, certificate: answer(c, result.status, true, result.signatureOk, result.payload) });
  }),
);

// ─── GET /api/verify/keys ─────────────────────────────────────────────────────

/** The institution's public signing keys, for checking a signature independently. */
verifyRouter.get(
  '/keys',
  limiter,
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      algorithm: 'Ed25519 (EdDSA, RFC 8032)',
      howToVerify: 'The signature (base64url) is over the UTF-8 bytes of the payload serialised as JSON with object keys sorted at every level and no whitespace. Verify with the key whose kid matches the certificate.',
      keys: await publicKeys(),
    });
  }),
);

// ─── POST /api/verify/report ──────────────────────────────────────────────────

const reportBody = z.object({
  no: z.string().trim().min(3).max(60),
  reference: z.string().trim().max(40),
  status: z.string().max(20),
  note: z.string().trim().max(1000).optional(),
  contact: z.string().trim().max(160).optional(),
});

/** A suspected forgery, reported by whoever was presented with it; filed for the examination office. */
verifyRouter.post(
  '/report',
  limiter,
  validate('body', reportBody),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof reportBody>;
    const key = `FR/${new Date().getFullYear()}/${crypto.randomInt(100000, 999999)}`;
    await prisma.workspaceRecord.create({
      data: {
        collection: 'acad:forgery-reports',
        key,
        data: { id: key, certificate: body.no.toUpperCase(), verification: body.reference, result: body.status, note: body.note ?? '', contact: body.contact ?? '', reportedAt: new Date().toISOString(), ip: req.ip ?? null, status: 'open' },
      },
    });
    await record({ actorName: 'Public verification', module: 'Certificates', action: 'Suspected forgery reported', target: body.no.toUpperCase(), detail: key, ip: req.ip ?? null, outcome: 'WARN' });
    res.status(201).json({ report: key });
  }),
);

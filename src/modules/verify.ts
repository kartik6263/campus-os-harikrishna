import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { asyncHandler, validQuery, validate } from '../lib/http.js';
import { record } from './itconsole/audit.js';

/**
 * Phase 11 — public certificate verification.
 *
 * Anyone (an employer, another university) can check a certificate number
 * without signing in. An issued certificate carries a signature — an HMAC of
 * its number, holder, type and date of issue under a key only the server
 * knows — printed in its QR code. A number that exists but arrives with the
 * wrong signature is reported as tampered, not merely unknown.
 */
export const verifyRouter = Router();

export function certificateSignature(c: { requestNo: string; enrolmentNo: string; type: string; issuedAt: Date }): string {
  return crypto
    .createHmac('sha256', env.JWT_REFRESH_SECRET)
    .update(`cert|${c.requestNo}|${c.enrolmentNo}|${c.type}|${c.issuedAt.toISOString()}`)
    .digest('hex')
    .slice(0, 20);
}

/** Shows enough of a name to match the paper, not enough to harvest. */
const maskName = (name: string) =>
  name.split(' ').map((w, i) => (i === 0 ? w : `${w[0]}${'•'.repeat(Math.max(1, w.length - 1))}`)).join(' ');

const query = z.object({ no: z.string().trim().min(3).max(60), sig: z.string().trim().max(64).optional() });

verifyRouter.get(
  '/certificate',
  validate('query', query),
  asyncHandler(async (req, res) => {
    const { no, sig } = validQuery<z.infer<typeof query>>(req);
    const cert = await prisma.certificateRequest.findUnique({
      where: { requestNo: no.toUpperCase() },
      include: {
        student: { select: { name: true, enrolmentNo: true, year: true, programme: { select: { name: true } }, college: { select: { name: true } } } },
        issuedBy: { select: { name: true, designation: true } },
      },
    });

    let status: 'valid' | 'not_found' | 'not_issued' | 'revoked' | 'tampered';
    if (!cert) status = 'not_found';
    else if (cert.stage === 'REJECTED') status = 'revoked';
    else if (!cert.issuedAt || !['READY', 'DISPATCHED'].includes(cert.stage)) status = 'not_issued';
    else if (sig && sig !== certificateSignature({ requestNo: cert.requestNo, enrolmentNo: cert.student.enrolmentNo, type: cert.type, issuedAt: cert.issuedAt })) status = 'tampered';
    else status = 'valid';

    // Every check is logged: who asked about what, and the answer they got.
    const ref = `VR/${new Date().getFullYear()}/${crypto.randomInt(100000, 999999)}`;
    await record({ actorName: 'Public verification', module: 'Certificates', action: `Verified: ${status}`, target: no.toUpperCase(), detail: ref, ip: req.ip ?? null, outcome: status === 'valid' ? 'OK' : 'WARN' });

    res.json({
      status,
      reference: ref,
      checkedAt: new Date(),
      signatureChecked: Boolean(sig),
      certificate: cert && (status === 'valid' || status === 'revoked')
        ? {
            number: cert.requestNo,
            type: cert.type,
            purpose: cert.purpose,
            issuedAt: cert.issuedAt,
            issuedBy: cert.issuedBy ? `${cert.issuedBy.name}, ${cert.issuedBy.designation}` : null,
            holder: {
              name: maskName(cert.student.name),
              enrolmentNo: cert.student.enrolmentNo,
              programme: cert.student.programme.name,
              college: cert.student.college.name,
              yearOfEnrolment: cert.student.year,
            },
          }
        : null,
    });
  }),
);

const reportBody = z.object({
  no: z.string().trim().min(3).max(60),
  reference: z.string().trim().max(40),
  status: z.string().max(20),
  note: z.string().trim().max(1000).optional(),
  contact: z.string().trim().max(160).optional(),
});

/** A suspected forgery, reported by whoever presented with it; filed for the examination office. */
verifyRouter.post(
  '/report',
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

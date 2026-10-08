import type { DigitalCertificate, Prisma } from '@prisma/client';
import { currentTenant, prisma } from '../../db.js';
import { env } from '../../env.js';
import { getInstitution } from '../institution.js';
import { renderCertificatePdf } from './pdf.js';
import { sha256, sign, signingKey, verifySignature, type CertificatePayload } from './signing.js';

/**
 * Issuing a certificate: number it, sign it, render the official PDF, file
 * the PDF and its hash, and tell the holder — in one place, so a certificate
 * from the office queue and one issued directly at a convocation are made
 * the same way and verify the same way.
 */

/** Certificate kinds the institution issues directly, with the sentence each certifies. */
export const TEMPLATES: Record<string, { title: string; statement: string; prefix: string }> = {
  'Degree Certificate': { title: 'Degree Certificate', statement: 'has been admitted to the degree of {programme}, having fulfilled all the requirements prescribed for it.', prefix: 'DEG' },
  'Provisional Certificate': { title: 'Provisional Degree Certificate', statement: 'has passed the examinations for the degree of {programme} and is eligible for the award of the degree at the next convocation.', prefix: 'PDC' },
  'Merit Certificate': { title: 'Certificate of Merit', statement: 'is awarded this certificate of merit in recognition of outstanding academic performance.', prefix: 'MER' },
  'Achievement Certificate': { title: 'Certificate of Achievement', statement: 'is awarded this certificate in recognition of the achievement described below.', prefix: 'ACH' },
  'Participation Certificate': { title: 'Certificate of Participation', statement: 'participated in the event described below.', prefix: 'PAR' },
  'Course Completion Certificate': { title: 'Certificate of Completion', statement: 'has successfully completed the course described below.', prefix: 'CRS' },
  'Internship Certificate': { title: 'Internship Certificate', statement: 'has completed the internship described below.', prefix: 'INT' },
  'Character Certificate': { title: 'Character Certificate', statement: 'was a student of this institution and, to the best of our knowledge, bears a good moral character.', prefix: 'CHR' },
  'Bonafide Certificate': { title: 'Bonafide Certificate', statement: 'is a bonafide student of this institution.', prefix: 'BON' },
  'Transfer Certificate': { title: 'Transfer Certificate', statement: 'was a student of this institution and has been permitted to leave it, all dues having been cleared.', prefix: 'TC' },
  'Migration Certificate': { title: 'Migration Certificate', statement: 'is permitted to migrate to another university or institution; this institution has no objection.', prefix: 'MIG' },
  'Duplicate Marksheet': { title: 'Duplicate Statement of Marks', statement: 'is issued this duplicate statement of marks, which carries the same authority as the original.', prefix: 'DMS' },
};

/** Where an institute's users open the app; the verifier lives there. */
export function appUrl(): string {
  const tenant = currentTenant();
  return tenant && env.APP_URL_TEMPLATE ? env.APP_URL_TEMPLATE.replace('{slug}', tenant.slug) : env.APP_URL;
}

/** The link printed in the QR code: the verifier, the number, and the signature to check it against. */
export function verifyUrl(serialNo: string, signature: string): string {
  const u = new URL(appUrl());
  u.searchParams.set('verify', serialNo);
  u.searchParams.set('sig', signature.slice(0, 24));
  return u.toString();
}

/** The payload exactly as it was signed, rebuilt from the stored record. */
export function payloadOf(c: Pick<DigitalCertificate, 'serialNo' | 'type' | 'title' | 'statement' | 'recipientName' | 'recipientRef' | 'fields' | 'issuedAt' | 'validUntil' | 'issuerName' | 'issuerTitle' | 'institutionName' | 'institutionCode'>): CertificatePayload {
  return {
    v: 1,
    institution: { name: c.institutionName, code: c.institutionCode },
    serialNo: c.serialNo,
    type: c.type,
    title: c.title,
    statement: c.statement,
    recipient: { name: c.recipientName, ref: c.recipientRef },
    fields: (c.fields as Array<[string, string]>) ?? [],
    issuedAt: c.issuedAt.toISOString(),
    validUntil: c.validUntil ? c.validUntil.toISOString() : null,
    issuer: { name: c.issuerName, title: c.issuerTitle },
  };
}

/** The institution as it is printed now; each certificate keeps the name it was issued under. */
async function institutionFor() {
  const i = await getInstitution();
  return { name: i.name, code: i.shortCode };
}

/** The next serial in a series like RDU/MER/2026/000042. Read from the highest, never counted. */
async function nextSerial(tx: Prisma.TransactionClient, prefix: string) {
  const rows = await tx.digitalCertificate.findMany({ where: { serialNo: { startsWith: prefix } }, select: { serialNo: true } });
  const highest = rows.reduce((m, r) => Math.max(m, Number(r.serialNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(highest + 1).padStart(6, '0')}`;
}

export interface IssueInput {
  type: string;
  title: string;
  statement: string;
  recipientName: string;
  recipientRef?: string | null;
  recipientEmail?: string | null;
  studentId?: string | null;
  requestId?: string | null;
  fields: Array<[string, string]>;
  validUntil?: Date | null;
  issuedAt?: Date;
  issuerName: string;
  issuerTitle: string;
  issuedById?: string | null;
  batchRef?: string | null;
  /** Use this number (a queue request keeps its own); otherwise one is drawn from the series. */
  serialNo?: string;
}

/**
 * Issues one certificate. Run inside the caller's transaction when there is
 * one, so the certificate exists if and only if what caused it does.
 */
export async function issueCertificate(input: IssueInput, tx: Prisma.TransactionClient = prisma) {
  const [key, institution] = await Promise.all([signingKey(), institutionFor()]);
  const year = (input.issuedAt ?? new Date()).getFullYear();
  const prefix = `${institution.code}/${TEMPLATES[input.type]?.prefix ?? 'CERT'}/${year}/`;
  const serialNo = input.serialNo ?? (await nextSerial(tx, prefix));
  // Stored to the millisecond the payload carries, so the rebuilt payload matches.
  const issuedAt = new Date(Math.floor((input.issuedAt ?? new Date()).getTime()));

  const record = {
    serialNo, type: input.type, title: input.title, statement: input.statement,
    recipientName: input.recipientName.trim(), recipientRef: input.recipientRef?.trim() || null,
    fields: input.fields.map(([l, v]) => [l.trim(), String(v).trim()] as [string, string]).filter(([l, v]) => l && v),
    issuedAt, validUntil: input.validUntil ?? null, issuerName: input.issuerName, issuerTitle: input.issuerTitle,
    institutionName: institution.name, institutionCode: institution.code,
  };
  const payload = payloadOf(record);
  const { payloadHash, signature } = sign(payload, key);
  const url = verifyUrl(serialNo, signature);
  const pdf = await renderCertificatePdf(payload, { verifyUrl: url, keyId: key.id, payloadHash });
  const pdfHash = sha256(pdf);

  const file = await tx.storedFile.create({
    data: { name: `${serialNo.replace(/\//g, '-')}.pdf`, mime: 'application/pdf', size: pdf.length, bytes: new Uint8Array(pdf), context: `cert:${serialNo}`, uploadedById: input.issuedById ?? null },
    select: { id: true },
  });
  const created = await tx.digitalCertificate.create({
    data: {
      ...record,
      fields: record.fields,
      recipientEmail: input.recipientEmail?.trim() || null,
      studentId: input.studentId ?? null,
      requestId: input.requestId ?? null,
      issuedById: input.issuedById ?? null,
      batchRef: input.batchRef ?? null,
      payloadHash, signature, keyId: key.id, fileId: file.id, pdfHash,
    },
  });
  if (input.studentId) {
    await tx.notification.create({
      data: { studentId: input.studentId, kind: 'GENERAL', title: `${input.title} issued`, body: `Certificate ${serialNo} is signed and ready to download from Certificates.`, href: '/certificates' },
    });
  }
  return created;
}

/**
 * The digital certificate for a request the office has marked ready.
 * Requests issued before digital signing existed get theirs on first ask,
 * dated when they were actually issued and signed in the issuer's name.
 */
export async function ensureForRequest(requestId: string, tx: Prisma.TransactionClient = prisma) {
  const existing = await tx.digitalCertificate.findUnique({ where: { requestId } });
  if (existing) return existing;
  const r = await tx.certificateRequest.findUnique({
    where: { id: requestId },
    include: {
      student: { select: { id: true, name: true, enrolmentNo: true, rollNo: true, semester: true, batch: true, user: { select: { email: true } }, programme: { select: { name: true } }, college: { select: { name: true } } } },
      issuedBy: { select: { name: true, designation: true } },
    },
  });
  if (!r || !r.issuedAt || !['READY', 'DISPATCHED'].includes(r.stage)) return null;
  const t = TEMPLATES[r.type];
  return issueCertificate({
    serialNo: r.requestNo,
    type: r.type,
    title: t?.title ?? r.type,
    statement: (t?.statement ?? 'is issued this certificate by the institution.').replace('{programme}', r.student.programme.name),
    recipientName: r.student.name,
    recipientRef: r.student.enrolmentNo,
    recipientEmail: r.student.user.email,
    studentId: r.student.id,
    requestId: r.id,
    fields: [
      ['Enrolment No.', r.student.enrolmentNo], ['Roll No.', r.student.rollNo], ['Programme', r.student.programme.name],
      ['College', r.student.college.name], ['Batch', r.student.batch], ['Purpose', r.purpose],
    ],
    issuedAt: r.issuedAt,
    issuerName: r.issuedBy?.name ?? 'College Office',
    issuerTitle: r.issuedBy?.designation ?? 'For the Principal',
  }, tx);
}

// ─── Checking ─────────────────────────────────────────────────────────────────

export type CheckStatus = 'valid' | 'revoked' | 'expired' | 'tampered';

/** Rebuilds the payload and checks the stored signature against the key that made it. */
export function check(c: DigitalCertificate & { key: { publicKey: string } }) {
  const payload = payloadOf(c);
  const signatureOk = verifySignature(payload, c.signature, c.key.publicKey);
  const status: CheckStatus = !signatureOk ? 'tampered' : c.status === 'REVOKED' ? 'revoked' : c.validUntil && c.validUntil < new Date() ? 'expired' : 'valid';
  return { status, signatureOk, payload };
}

import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, Role, VerificationStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../lib/http.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { recordFor } from './itconsole/audit.js';
import {
  ABC_ID, abcIdFrom, authorizeUrl, cleanAbcId, digilockerEnabled, dobMatches, exchangeCode, fetchEaadhaar,
  fetchIssued, fetchUser, isAbcCard, istDate, namesMatch, pkce, redirectUri,
} from '../lib/digilocker.js';

/**
 * Identity verification, for every portal.
 *
 * Anyone signed in may prove who they are through DigiLocker: the name and
 * date of birth DigiLocker holds are compared with the institution's record,
 * and a match is verified on the spot. A student's ABC ID is read off the
 * ABC/APAAR card in their DigiLocker, or typed in with the card attached.
 * Anything DigiLocker disagrees with, and every typed-in ABC ID, goes to the
 * office's register, where a person decides.
 */
export const verificationRouter = Router();
verificationRouter.use(requireAuth);

/** Who decides what DigiLocker could not settle. */
const REVIEWERS: Role[] = ['OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'];

/** A DigiLocker trip must be finished within this. */
const SESSION_MS = 10 * 60_000;

/** An app's deep-link scheme, for the trip that started in the mobile app. */
const APP_SCHEME = /^campusos(-[a-z0-9]+)?$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The institution's own record of a person: what DigiLocker is compared with. */
async function recordOf(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      student: { select: { id: true, name: true, dob: true, enrolmentNo: true, abcId: true, apaarId: true } },
      faculty: { select: { name: true, employeeId: true, designation: true } },
      office: { select: { name: true, employeeId: true, designation: true } },
      vendor: { select: { name: true, code: true, contactName: true } },
    },
  });
  const name = user.student?.name ?? user.faculty?.name ?? user.office?.name ?? user.vendor?.contactName ?? null;
  const ref = user.student?.enrolmentNo ?? user.faculty?.employeeId ?? user.office?.employeeId ?? user.vendor?.code ?? user.email;
  return { user, name, dob: user.student?.dob ?? null, ref };
}

type Row = Prisma.IdentityVerificationGetPayload<object>;

/** The parts of a verification a person (or a reviewer) is shown. */
function view(v: Row | null) {
  return {
    identityStatus: (v?.identityStatus ?? 'UNVERIFIED') as VerificationStatus,
    identitySource: v?.identitySource ?? null,
    identityDocType: v?.identityDocType ?? null,
    identityProofFileId: v?.identityProofFileId ?? null,
    linked: Boolean(v?.digilockerId),
    dlName: v?.dlName ?? null,
    dlDob: v?.dlDob ?? null,
    dlGender: v?.dlGender ?? null,
    eaadhaar: v?.eaadhaar ?? false,
    aadhaarLast4: v?.aadhaarLast4 ?? null,
    nameMatch: v?.nameMatch ?? null,
    dobMatch: v?.dobMatch ?? null,
    identityNote: v?.identityNote ?? null,
    verifiedAt: v?.verifiedAt ?? null,
    documents: (v?.documents as unknown[] | null) ?? [],
    abcId: v?.abcId ?? null,
    abcSource: v?.abcSource ?? null,
    abcStatus: (v?.abcStatus ?? 'UNVERIFIED') as VerificationStatus,
    abcNote: v?.abcNote ?? null,
    abcProofFileId: v?.abcProofFileId ?? null,
    abcVerifiedAt: v?.abcVerifiedAt ?? null,
    reviewedAt: v?.reviewedAt ?? null,
  };
}

/** Whether a twelve-digit ABC ID already belongs to someone else here. */
async function abcTakenElsewhere(abcId: string, userId: string): Promise<boolean> {
  const [student, verified] = await Promise.all([
    prisma.student.findFirst({ where: { abcId, userId: { not: userId } }, select: { id: true } }),
    prisma.identityVerification.findFirst({ where: { abcId, abcStatus: 'VERIFIED', userId: { not: userId } }, select: { id: true } }),
  ]);
  return Boolean(student || verified);
}

const ddmmyyyy = (d: Date) => istDate(d).replace(/^(\d\d)(\d\d)/, '$1-$2-');

// ─── GET /api/verification/me ─────────────────────────────────────────────────

verificationRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { user, name, dob, ref } = await recordOf(req.auth!.sub);
    const v = await prisma.identityVerification.findUnique({ where: { userId: user.id } });
    res.json({
      digilockerEnabled: digilockerEnabled(),
      role: user.role,
      record: { name, dob: dob ? ddmmyyyy(dob) : null, ref, abcId: user.student?.abcId ?? null, apaarId: user.student?.apaarId ?? null },
      // Only a student has an Academic Bank of Credits account to verify.
      abcApplies: Boolean(user.student),
      ...view(v),
    });
  }),
);

// ─── POST /api/verification/digilocker/start ──────────────────────────────────

const startBody = z.object({
  /** "mobile" sends the person back into the app rather than the web page. */
  client: z.enum(['web', 'mobile']).default('web'),
  appScheme: z.string().regex(APP_SCHEME).optional(),
});

verificationRouter.post(
  '/digilocker/start',
  validate('body', startBody),
  asyncHandler(async (req, res) => {
    if (!digilockerEnabled()) {
      throw ApiError.badRequest('DigiLocker is not connected for this institute yet. Ask your IT Cell, or submit your documents for office verification.');
    }
    const { client, appScheme } = req.body as z.infer<typeof startBody>;
    if (client === 'mobile' && !appScheme) throw ApiError.badRequest('The app must say which scheme to return to');

    const { verifier, challenge } = pkce();
    // The web page reads the prefix to know where the code goes next.
    const nonce = crypto.randomBytes(18).toString('base64url');
    const state = client === 'mobile' ? `dl.m.${appScheme}.${nonce}` : `dl.w.${nonce}`;
    const redirect = redirectUri();

    await prisma.digilockerSession.deleteMany({ where: { userId: req.auth!.sub, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }] } });
    await prisma.digilockerSession.create({
      data: { state, codeVerifier: verifier, redirectUri: redirect, userId: req.auth!.sub, expiresAt: new Date(Date.now() + SESSION_MS) },
    });
    res.json({ url: authorizeUrl(state, challenge, redirect) });
  }),
);

// ─── POST /api/verification/digilocker/complete ───────────────────────────────

const completeBody = z.object({
  state: z.string().min(8).max(200),
  code: z.string().min(1).max(500).optional(),
  /** DigiLocker's error, when the person declined or something failed there. */
  error: z.string().max(200).optional(),
  errorDescription: z.string().max(500).optional(),
});

verificationRouter.post(
  '/digilocker/complete',
  validate('body', completeBody),
  asyncHandler(async (req, res) => {
    const { state, code, error, errorDescription } = req.body as z.infer<typeof completeBody>;
    const userId = req.auth!.sub;

    const session = await prisma.digilockerSession.findUnique({ where: { state } });
    if (!session || session.userId !== userId) throw ApiError.badRequest('This DigiLocker sign-in was not started from your account. Please start again.');
    // Claimed atomically, so a code can never be spent twice.
    const claimed = await prisma.digilockerSession.updateMany({
      where: { id: session.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw ApiError.badRequest('This DigiLocker sign-in has expired or was already used. Please start again.');

    if (error || !code) {
      const declined = error === 'access_denied';
      throw ApiError.badRequest(declined
        ? 'You did not give consent on DigiLocker, so nothing was verified.'
        : `DigiLocker reported a problem: ${errorDescription ?? error ?? 'no code returned'}.`);
    }
    if (!digilockerEnabled()) throw ApiError.badRequest('DigiLocker is no longer connected for this institute.');

    const token = await exchangeCode(code, session.codeVerifier, session.redirectUri);
    const account = token.digilockerid && token.name ? token : { ...token, ...(await fetchUser(token.access_token)) };
    if (!account.digilockerid) throw new ApiError(502, 'DigiLocker did not say which account signed in. Please try again.');

    const owner = await prisma.identityVerification.findUnique({ where: { digilockerId: account.digilockerid }, select: { userId: true } });
    if (owner && owner.userId !== userId) {
      await recordFor(req, { module: 'Verification', action: 'DigiLocker reuse refused', target: account.digilockerid, outcome: 'DENIED' });
      throw ApiError.conflict('This DigiLocker account has already verified a different account here. Each person verifies with their own DigiLocker.');
    }

    const [aadhaar, issued] = await Promise.all([
      account.eaadhaar === 'Y' ? fetchEaadhaar(token.access_token).catch(() => null) : Promise.resolve(null),
      fetchIssued(token.access_token).catch(() => []),
    ]);

    const { user, name: recordName, dob: recordDob } = await recordOf(userId);
    const dlName = account.name ?? aadhaar?.name ?? null;
    const dlDob = (account.dob ?? aadhaar?.dob ?? '').replace(/\D/g, '') || null;

    const nameMatch = recordName && dlName ? namesMatch(recordName, dlName) || Boolean(aadhaar?.name && namesMatch(recordName, aadhaar.name)) : null;
    const dobMatch = recordDob && dlDob ? dobMatches(dlDob, recordDob) : null;
    const problems = [
      nameMatch === false && `Name on DigiLocker (${dlName}) differs from the record (${recordName})`,
      dobMatch === false && `Date of birth on DigiLocker differs from the record`,
    ].filter(Boolean) as string[];
    const identityStatus: VerificationStatus = problems.length ? 'PENDING_REVIEW' : 'VERIFIED';

    const existing = await prisma.identityVerification.findUnique({ where: { userId } });
    const data: Prisma.IdentityVerificationUncheckedUpdateInput = {
      digilockerId: account.digilockerid,
      dlName,
      dlDob,
      dlGender: account.gender ?? null,
      eaadhaar: account.eaadhaar === 'Y',
      aadhaarLast4: aadhaar?.last4 ?? null,
      nameMatch,
      dobMatch,
      identityStatus,
      identitySource: 'DIGILOCKER',
      identityDocType: null,
      identityProofFileId: null,
      identityNote: problems.length ? problems.join('. ') : null,
      verifiedAt: identityStatus === 'VERIFIED' ? new Date() : null,
      documents: issued.map((d) => ({ name: d.name || d.description, doctype: d.doctype, issuer: d.issuer, date: d.date })),
    };

    // The ABC ID, for a student, straight off the card ABC issued.
    let abcFound: string | null = null;
    if (user.student) {
      const card = issued.find(isAbcCard);
      abcFound = card ? await abcIdFrom(token.access_token, card).catch(() => null) : null;
      if (abcFound) {
        const onRecord = user.student.abcId;
        const clash = await abcTakenElsewhere(abcFound, userId);
        const differs = Boolean(onRecord && onRecord !== abcFound);
        const settled = identityStatus === 'VERIFIED' && !clash && !differs;
        Object.assign(data, {
          abcId: abcFound,
          abcSource: 'DIGILOCKER',
          abcStatus: settled ? 'VERIFIED' : 'PENDING_REVIEW',
          abcVerifiedAt: settled ? new Date() : null,
          abcProofFileId: null,
          abcNote: clash
            ? 'This ABC ID is already on another student’s record'
            : differs
              ? `The record has ABC ID ${onRecord}; DigiLocker has ${abcFound}`
              : identityStatus !== 'VERIFIED'
                ? 'Read from DigiLocker; waits on the identity review'
                : null,
        });
        if (settled) await prisma.student.update({ where: { id: user.student.id }, data: { abcId: abcFound } });
      }
      await prisma.student.update({ where: { id: user.student.id }, data: { digilockerLinked: true } });
    }

    const saved = existing
      ? await prisma.identityVerification.update({ where: { userId }, data })
      : await prisma.identityVerification.create({ data: { ...(data as Prisma.IdentityVerificationUncheckedCreateInput), userId } });

    await recordFor(req, {
      module: 'Verification',
      action: identityStatus === 'VERIFIED' ? 'Verified through DigiLocker' : 'DigiLocker mismatch sent for review',
      target: recordName ?? user.email,
      detail: [problems.join('; '), abcFound ? `ABC ID ${abcFound} read from DigiLocker` : null].filter(Boolean).join(' · ') || null,
    });

    res.json({ ...view(saved), abcFound: Boolean(abcFound), abcApplies: Boolean(user.student) });
  }),
);

// ─── POST /api/verification/identity-proof ────────────────────────────────────

/** ID proofs the office accepts when DigiLocker is not used. */
export const ID_DOCUMENTS = ['Masked Aadhaar', 'PAN card', 'Passport', 'Voter ID', 'Driving licence', 'Class 10 marksheet'] as const;

const proofBody = z.object({
  docType: z.enum(ID_DOCUMENTS),
  proofFileId: z.string().min(1),
});

/**
 * The way to be verified without DigiLocker: an ID proof, checked by a person
 * in the office against the record. DigiLocker, once used, supersedes it.
 */
verificationRouter.post(
  '/identity-proof',
  validate('body', proofBody),
  asyncHandler(async (req, res) => {
    const userId = req.auth!.sub;
    const { docType, proofFileId } = req.body as z.infer<typeof proofBody>;
    const existing = await prisma.identityVerification.findUnique({ where: { userId } });
    if (existing?.identityStatus === 'VERIFIED') throw ApiError.conflict('Your identity is already verified');
    if (existing?.identityStatus === 'PENDING_REVIEW') throw ApiError.conflict('Your verification is already with the office');

    const proof = await prisma.storedFile.findUnique({ where: { id: proofFileId }, select: { uploadedById: true } });
    if (!proof || proof.uploadedById !== userId) throw ApiError.badRequest('Attach your ID proof again');

    const data = { identityStatus: 'PENDING_REVIEW' as const, identitySource: 'DOCUMENT', identityDocType: docType, identityProofFileId: proofFileId, identityNote: null, verifiedAt: null };
    const saved = existing
      ? await prisma.identityVerification.update({ where: { userId }, data })
      : await prisma.identityVerification.create({ data: { ...data, userId } });
    const { name, user } = await recordOf(userId);
    await recordFor(req, { module: 'Verification', action: 'ID proof submitted for review', target: name ?? user.email, detail: docType });
    res.status(201).json(view(saved));
  }),
);

// ─── POST /api/verification/abc ───────────────────────────────────────────────

const abcBody = z.object({
  abcId: z.string().min(12).max(20),
  /** The ABC / APAAR card (PDF or image) the student uploaded. */
  proofFileId: z.string().min(1),
});

verificationRouter.post(
  '/abc',
  requireRole('STUDENT'),
  validate('body', abcBody),
  asyncHandler(async (req, res) => {
    const userId = req.auth!.sub;
    const body = req.body as z.infer<typeof abcBody>;
    const abcId = cleanAbcId(body.abcId);
    if (!ABC_ID.test(abcId)) throw ApiError.badRequest('An ABC ID is 12 digits, as printed on your ABC / APAAR card');

    const existing = await prisma.identityVerification.findUnique({ where: { userId } });
    if (existing?.abcStatus === 'VERIFIED') {
      throw ApiError.conflict('Your ABC ID is already verified. To change it, verify again through DigiLocker or raise a correction with the records section.');
    }
    if (existing?.abcStatus === 'PENDING_REVIEW' && existing.abcSource === 'DIGILOCKER') {
      throw ApiError.conflict('The ABC ID from your DigiLocker is with the office for review.');
    }
    const proof = await prisma.storedFile.findUnique({ where: { id: body.proofFileId }, select: { uploadedById: true, name: true } });
    if (!proof || proof.uploadedById !== userId) throw ApiError.badRequest('Attach your ABC / APAAR card again');
    if (await abcTakenElsewhere(abcId, userId)) throw ApiError.conflict('This ABC ID is already on another student’s record. Check the number, or contact the records section.');

    const data = { abcId, abcSource: 'SELF', abcStatus: 'PENDING_REVIEW' as const, abcNote: null, abcProofFileId: body.proofFileId, abcVerifiedAt: null };
    const saved = existing
      ? await prisma.identityVerification.update({ where: { userId }, data })
      : await prisma.identityVerification.create({ data: { ...data, userId } });

    await recordFor(req, { module: 'Verification', action: 'ABC ID submitted for review', target: abcId });
    res.status(201).json(view(saved));
  }),
);

// ─── GET /api/verification/wards — a parent's children ────────────────────────

verificationRouter.get(
  '/wards',
  requireRole('PARENT'),
  asyncHandler(async (req, res) => {
    const wards = await prisma.student.findMany({
      where: { guardianId: req.auth!.sub },
      select: { name: true, enrolmentNo: true, abcId: true, user: { select: { identity: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({
      wards: wards.map((w) => {
        const v = view(w.user.identity);
        return {
          name: w.name,
          enrolmentNo: w.enrolmentNo,
          identityStatus: v.identityStatus,
          verifiedAt: v.verifiedAt,
          abcId: w.abcId,
          abcStatus: v.abcStatus,
          abcVerifiedAt: v.abcVerifiedAt,
        };
      }),
    });
  }),
);

// ─── The office's register ────────────────────────────────────────────────────

const registerQuery = z.object({
  /** "pending": anything waiting on a person. */
  status: z.enum(['pending', 'verified', 'rejected', 'all']).default('pending'),
  role: z.enum(['STUDENT', 'PARENT', 'FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN', 'VENDOR']).optional(),
  q: z.string().max(100).optional(),
});

function statusWhere(status: z.infer<typeof registerQuery>['status']): Prisma.IdentityVerificationWhereInput {
  if (status === 'pending') return { OR: [{ identityStatus: 'PENDING_REVIEW' }, { abcStatus: 'PENDING_REVIEW' }] };
  if (status === 'verified') return { OR: [{ identityStatus: 'VERIFIED' }, { abcStatus: 'VERIFIED' }] };
  if (status === 'rejected') return { OR: [{ identityStatus: 'REJECTED' }, { abcStatus: 'REJECTED' }] };
  return {};
}

verificationRouter.get(
  '/register',
  requireRole(...REVIEWERS),
  validate('query', registerQuery),
  asyncHandler(async (req, res) => {
    const { status, role, q } = validQuery<z.infer<typeof registerQuery>>(req);
    const search = q?.trim();
    const userWhere: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { student: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { enrolmentNo: { contains: search, mode: 'insensitive' } }] } },
              { faculty: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { employeeId: { contains: search, mode: 'insensitive' } }] } },
              { office: { name: { contains: search, mode: 'insensitive' } } },
              { vendor: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, counts, students, studentsVerified, abcVerified] = await Promise.all([
      prisma.identityVerification.findMany({
        where: { ...statusWhere(status), user: userWhere },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        include: {
          user: {
            select: {
              id: true, email: true, role: true,
              student: { select: { name: true, enrolmentNo: true, dob: true, abcId: true } },
              faculty: { select: { name: true, employeeId: true } },
              office: { select: { name: true, employeeId: true } },
              vendor: { select: { name: true, code: true, contactName: true } },
            },
          },
        },
      }),
      prisma.identityVerification.groupBy({ by: ['identityStatus'], _count: { _all: true } }),
      prisma.student.count(),
      prisma.identityVerification.count({ where: { identityStatus: 'VERIFIED', user: { role: 'STUDENT' } } }),
      prisma.identityVerification.count({ where: { abcStatus: 'VERIFIED' } }),
    ]);
    const pending = await prisma.identityVerification.count({ where: statusWhere('pending') });

    res.json({
      digilockerEnabled: digilockerEnabled(),
      summary: {
        pending,
        identityVerified: counts.find((c) => c.identityStatus === 'VERIFIED')?._count._all ?? 0,
        students,
        studentsVerified,
        abcVerified,
      },
      rows: rows.map((r) => {
        const u = r.user;
        return {
          userId: u.id,
          role: u.role,
          email: u.email,
          name: u.student?.name ?? u.faculty?.name ?? u.office?.name ?? u.vendor?.contactName ?? u.email,
          ref: u.student?.enrolmentNo ?? u.faculty?.employeeId ?? u.office?.employeeId ?? (u.vendor ? `${u.vendor.code} · ${u.vendor.name}` : null),
          recordDob: u.student?.dob ? ddmmyyyy(u.student.dob) : null,
          recordAbcId: u.student?.abcId ?? null,
          updatedAt: r.updatedAt,
          ...view(r),
        };
      }),
    });
  }),
);

const reviewBody = z.object({
  target: z.enum(['identity', 'abc']),
  decision: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
});

verificationRouter.post(
  '/register/:userId/review',
  requireRole(...REVIEWERS),
  validate('body', reviewBody),
  asyncHandler(async (req: Request, res) => {
    const userId = String(req.params.userId);
    const { target, decision, note } = req.body as z.infer<typeof reviewBody>;
    if (userId === req.auth!.sub) throw ApiError.forbidden('Your own verification is decided by a colleague');
    if (decision === 'REJECTED' && !note) throw ApiError.badRequest('Say why it is rejected; the person sees this note');

    const v = await prisma.identityVerification.findUnique({ where: { userId } });
    if (!v) throw ApiError.notFound('Nothing has been submitted for this person');
    const { user, name } = await recordOf(userId);
    const now = new Date();
    let saved: Row;

    if (target === 'identity') {
      if (v.identityStatus !== 'PENDING_REVIEW') throw ApiError.conflict('This identity is not waiting for review');
      saved = await prisma.identityVerification.update({
        where: { userId },
        data: { identityStatus: decision, identityNote: note ?? v.identityNote, verifiedAt: decision === 'VERIFIED' ? now : null, reviewedById: req.auth!.sub, reviewedAt: now },
      });
    } else {
      if (v.abcStatus !== 'PENDING_REVIEW' || !v.abcId) throw ApiError.conflict('No ABC ID is waiting for review');
      if (decision === 'VERIFIED') {
        if (!user.student) throw ApiError.badRequest('Only a student has an ABC ID');
        if (v.abcSource === 'DIGILOCKER' && v.identityStatus !== 'VERIFIED') throw ApiError.conflict('Settle the identity first: this ABC ID came from the same DigiLocker');
        if (await abcTakenElsewhere(v.abcId, userId)) throw ApiError.conflict('This ABC ID is already on another student’s record');
        await prisma.student.update({ where: { id: user.student.id }, data: { abcId: v.abcId } });
      }
      saved = await prisma.identityVerification.update({
        where: { userId },
        data: { abcStatus: decision, abcNote: note ?? null, abcVerifiedAt: decision === 'VERIFIED' ? now : null, reviewedById: req.auth!.sub, reviewedAt: now },
      });
    }

    await recordFor(req, {
      module: 'Verification',
      action: `${target === 'abc' ? 'ABC ID' : 'Identity'} ${decision === 'VERIFIED' ? 'verified' : 'rejected'}`,
      target: name ?? user.email,
      detail: note ?? null,
    });
    res.json(view(saved));
  }),
);

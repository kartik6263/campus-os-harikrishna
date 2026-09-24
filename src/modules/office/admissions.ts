import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { REQUIRED_DOCUMENTS, nextInSeries, resolveStaffId } from './shared.js';

export const admissionsRouter = Router();

const STATUS = z.enum(['PENDING_DOCS', 'VERIFIED', 'ENROLLED', 'REJECTED']);

/** The shape every admission route returns, so the counter never re-derives it. */
function present(app: {
  id: string;
  applicationNo: string;
  name: string;
  nameHi: string | null;
  dob: Date;
  gender: string | null;
  category: string | null;
  mobile: string | null;
  email: string | null;
  meritRank: number | null;
  admissionDate: Date;
  status: string;
  rejectReason: string | null;
  studentId: string | null;
  programme: { code: string; shortName: string; name: string };
  documents: Array<{
    id: string;
    name: string;
    required: boolean;
    uploaded: boolean;
    verified: boolean;
    verifiedAt: Date | null;
    remarks: string | null;
    verifiedBy: { name: string } | null;
  }>;
}) {
  const required = app.documents.filter((d) => d.required);

  return {
    id: app.id,
    applicationNo: app.applicationNo,
    name: app.name,
    nameHi: app.nameHi,
    dob: app.dob,
    gender: app.gender,
    category: app.category,
    mobile: app.mobile,
    email: app.email,
    meritRank: app.meritRank,
    admissionDate: app.admissionDate,
    status: app.status,
    rejectReason: app.rejectReason,
    studentId: app.studentId,
    programme: app.programme,
    // What the counter actually needs to know at a glance.
    documentsVerified: required.filter((d) => d.verified).length,
    documentsRequired: required.length,
    readyToEnrol: required.length > 0 && required.every((d) => d.verified),
    documents: app.documents.map((d) => ({
      id: d.id,
      name: d.name,
      required: d.required,
      uploaded: d.uploaded,
      verified: d.verified,
      verifiedBy: d.verifiedBy?.name ?? null,
      verifiedOn: d.verifiedAt,
      remarks: d.remarks,
    })),
  };
}

const INCLUDE = {
  programme: { select: { code: true, shortName: true, name: true } },
  documents: {
    orderBy: { name: 'asc' as const },
    include: { verifiedBy: { select: { name: true } } },
  },
};

// ─── GET /api/office/admissions ───────────────────────────────────────────────

admissionsRouter.get(
  '/admissions',
  validate('query', z.object({ status: STATUS.optional(), q: z.string().optional() })),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const applications = await prisma.admissionApplication.findMany({
      where: {
        ...(status ? { status: status as 'PENDING_DOCS' } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { applicationNo: { contains: q, mode: 'insensitive' as const } },
                { mobile: { contains: q } },
              ],
            }
          : {}),
      },
      include: INCLUDE,
      orderBy: { admissionDate: 'desc' },
    });

    res.json(applications.map(present));
  }),
);

// ─── GET /api/office/admissions/:id ───────────────────────────────────────────

admissionsRouter.get(
  '/admissions/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const application = await prisma.admissionApplication.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: INCLUDE,
    });
    if (!application) throw ApiError.notFound('No such application');
    res.json(present(application));
  }),
);

// ─── POST /api/office/admissions ──────────────────────────────────────────────

/**
 * Opens an application at the counter.
 *
 * The document checklist is written now rather than derived on read, because
 * which papers *this* candidate owes is a decision taken at intake and must
 * not silently change if the standard list is edited later.
 */
admissionsRouter.post(
  '/admissions',
  validate(
    'body',
    z.object({
      name: z.string().min(2).max(120),
      nameHi: z.string().max(120).optional(),
      dob: z.string().date(),
      gender: z.enum(['Male', 'Female', 'Other']).optional(),
      category: z.string().max(40).optional(),
      mobile: z.string().max(20).optional(),
      email: z.string().email().optional(),
      programmeCode: z.string().min(1),
      meritRank: z.number().int().positive().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const body = req.body as {
      name: string;
      nameHi?: string;
      dob: string;
      gender?: string;
      category?: string;
      mobile?: string;
      email?: string;
      programmeCode: string;
      meritRank?: number;
    };

    const programme = await prisma.programme.findUnique({
      where: { code: body.programmeCode },
      select: { id: true, code: true, collegeId: true },
    });
    if (!programme) throw ApiError.notFound(`No programme with code ${body.programmeCode}`);
    if (!programme.collegeId) throw ApiError.badRequest('That programme is not attached to a college');

    const year = new Date().getFullYear();
    const prefix = `ADM/${year}/${programme.code}/`;
    const existing = await prisma.admissionApplication.findMany({
      where: { applicationNo: { startsWith: prefix } },
      select: { applicationNo: true },
    });

    // A caste certificate is only required of a candidate claiming a category.
    const claimsCategory = !!body.category && body.category.toLowerCase() !== 'general';

    const application = await prisma.admissionApplication.create({
      data: {
        applicationNo: nextInSeries(prefix, existing.map((a) => a.applicationNo), 4),
        name: body.name,
        nameHi: body.nameHi ?? null,
        dob: new Date(`${body.dob}T00:00:00.000Z`),
        gender: body.gender ?? null,
        category: body.category ?? null,
        mobile: body.mobile ?? null,
        email: body.email ?? null,
        meritRank: body.meritRank ?? null,
        collegeId: programme.collegeId,
        programmeId: programme.id,
        documents: {
          create: REQUIRED_DOCUMENTS.map((d) => ({
            name: d.name,
            required: d.name.startsWith('Caste Certificate') ? claimsCategory : d.required,
          })),
        },
      },
      include: INCLUDE,
    });

    res.status(201).json(present(application));
  }),
);

// ─── PATCH /api/office/admissions/:id/documents/:docId ────────────────────────

/**
 * Records a document as received, verified, or queried.
 *
 * Verifying carries the clerk's name and the time, because this is the row a
 * later audit asks about. A document that has not been produced cannot be
 * verified — that is the whole point of the checklist.
 */
admissionsRouter.patch(
  '/admissions/:id/documents/:docId',
  validate('params', z.object({ id: z.string().min(1), docId: z.string().min(1) })),
  validate(
    'body',
    z
      .object({
        uploaded: z.boolean().optional(),
        verified: z.boolean().optional(),
        remarks: z.string().max(300).nullable().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' }),
  ),
  asyncHandler(async (req, res) => {
    const staffId = await resolveStaffId(req);
    const { id, docId } = req.params as { id: string; docId: string };
    const body = req.body as { uploaded?: boolean; verified?: boolean; remarks?: string | null };

    const document = await prisma.admissionDocument.findUnique({
      where: { id: docId },
      include: { application: { select: { id: true, status: true } } },
    });

    if (!document || document.applicationId !== id) throw ApiError.notFound('No such document');
    if (document.application.status === 'ENROLLED') {
      throw ApiError.conflict('This candidate is already enrolled');
    }

    const uploaded = body.uploaded ?? document.uploaded;
    if (body.verified === true && !uploaded) {
      throw ApiError.badRequest('That document has not been produced yet');
    }

    await prisma.admissionDocument.update({
      where: { id: docId },
      data: {
        ...(body.uploaded !== undefined ? { uploaded: body.uploaded } : {}),
        ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
        ...(body.verified !== undefined
          ? body.verified
            ? { verified: true, verifiedById: staffId, verifiedAt: new Date() }
            : { verified: false, verifiedById: null, verifiedAt: null }
          : {}),
      },
    });

    // The application's own status follows the checklist, so the queue filter
    // and the checklist can never tell different stories.
    const after = await prisma.admissionApplication.findUniqueOrThrow({
      where: { id },
      include: INCLUDE,
    });

    const required = after.documents.filter((d) => d.required);
    const allVerified = required.length > 0 && required.every((d) => d.verified);
    const target = allVerified ? 'VERIFIED' : 'PENDING_DOCS';

    if (after.status !== target && after.status !== 'REJECTED') {
      const updated = await prisma.admissionApplication.update({
        where: { id },
        data: { status: target },
        include: INCLUDE,
      });
      res.json(present(updated));
      return;
    }

    res.json(present(after));
  }),
);

// ─── POST /api/office/admissions/:id/enrol ────────────────────────────────────

/**
 * Turns a verified application into a student.
 *
 * This is the point the rest of the system starts caring about the person: it
 * creates their sign-in, their record, and their enrolment in the first
 * semester's subjects, all in one transaction. Doing it twice is refused.
 */
admissionsRouter.post(
  '/admissions/:id/enrol',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ term: z.string().min(1).optional() }).default({})),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const { id } = req.params as { id: string };
    const { term } = req.body as { term?: string };

    const application = await prisma.admissionApplication.findUnique({
      where: { id },
      include: { documents: true, programme: { select: { id: true, code: true } } },
    });

    if (!application) throw ApiError.notFound('No such application');
    if (application.status === 'ENROLLED') {
      throw ApiError.conflict('This candidate is already enrolled', {
        studentId: application.studentId,
      });
    }
    if (application.status === 'REJECTED') {
      throw ApiError.conflict('This application was rejected');
    }

    const outstanding = application.documents.filter((d) => d.required && !d.verified);
    if (outstanding.length > 0) {
      throw ApiError.badRequest('Every required document must be verified before enrolling', {
        missing: outstanding.map((d) => d.name),
      });
    }

    if (!application.email) {
      throw ApiError.badRequest('An email address is needed to create the sign-in');
    }

    const taken = await prisma.user.findUnique({
      where: { email: application.email.toLowerCase() },
      select: { id: true },
    });
    if (taken) throw ApiError.conflict('An account already exists for that email address');

    const year = new Date().getFullYear();
    const enrolPrefix = `JU/${year}/${application.programme.code}/`;
    const existing = await prisma.student.findMany({
      where: { enrolmentNo: { startsWith: enrolPrefix } },
      select: { enrolmentNo: true },
    });
    const enrolmentNo = nextInSeries(enrolPrefix, existing.map((s) => s.enrolmentNo), 4);
    const serial = enrolmentNo.slice(enrolPrefix.length);

    // A fresh admission is a first-semester student until an exam says otherwise.
    const subjects = await prisma.subject.findMany({
      where: { programmeId: application.programmeId, semester: 1 },
      select: { id: true },
    });

    const passwordHash = await bcrypt.hash('campus123', 10);
    const activeTerm = term ?? `${year}-${String((year + 1) % 100).padStart(2, '0')}-ODD`;

    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: application.email!.toLowerCase(), passwordHash, role: 'STUDENT' },
      });

      const created = await tx.student.create({
        data: {
          enrolmentNo,
          rollNo: `MVM/${application.programme.code}/${year}/${serial}`,
          name: application.name,
          nameHi: application.nameHi,
          dob: application.dob,
          gender: application.gender,
          category: application.category,
          semester: 1,
          year: 1,
          batch: `${year}–${year + 3}`,
          mobile: application.mobile,
          userId: user.id,
          collegeId: application.collegeId,
          programmeId: application.programmeId,
        },
      });

      if (subjects.length > 0) {
        await tx.enrolment.createMany({
          data: subjects.map((s) => ({
            studentId: created.id,
            subjectId: s.id,
            faculty: 'To be allotted',
            room: 'To be allotted',
            term: activeTerm,
          })),
        });
      }

      await tx.admissionApplication.update({
        where: { id },
        data: { status: 'ENROLLED', studentId: created.id },
      });

      return created;
    });

    res.status(201).json({
      studentId: student.id,
      enrolmentNo: student.enrolmentNo,
      rollNo: student.rollNo,
      name: student.name,
      email: application.email.toLowerCase(),
      subjectsEnrolled: subjects.length,
      term: activeTerm,
    });
  }),
);

// ─── POST /api/office/admissions/:id/reject ───────────────────────────────────

admissionsRouter.post(
  '/admissions/:id/reject',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ reason: z.string().min(5).max(500) })),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };

    const application = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!application) throw ApiError.notFound('No such application');
    if (application.status === 'ENROLLED') {
      throw ApiError.conflict('That candidate is already enrolled');
    }

    const updated = await prisma.admissionApplication.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason },
      include: INCLUDE,
    });

    res.json(present(updated));
  }),
);

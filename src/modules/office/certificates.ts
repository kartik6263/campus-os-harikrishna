import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, resolveStudentId } from '../../auth/middleware.js';
import { CERTIFICATE_SLA, nextInSeries, resolveStaffId, slaDeadline } from './shared.js';

export const certificatesRouter = Router();

/** Where a request can go from where it is. */
const NEXT_STAGE: Record<string, string[]> = {
  REQUESTED: ['COLLEGE_OFFICE', 'REJECTED'],
  COLLEGE_OFFICE: ['READY', 'REJECTED'],
  READY: ['DISPATCHED'],
  DISPATCHED: [],
  REJECTED: [],
};

function present(c: {
  id: string;
  requestNo: string;
  type: string;
  purpose: string;
  priority: string;
  stage: string;
  fee: number;
  feePaid: boolean;
  requestedAt: Date;
  slaDeadline: Date;
  notes: string | null;
  issuedAt: Date | null;
  rejectReason: string | null;
  student: {
    id: string;
    enrolmentNo: string;
    rollNo: string;
    name: string;
    semester: number;
    programme: { shortName: string };
  };
  issuedBy: { name: string } | null;
}) {
  const daysLeft = Math.ceil((c.slaDeadline.getTime() - Date.now()) / 86_400_000);
  const open = c.stage !== 'DISPATCHED' && c.stage !== 'REJECTED';

  return {
    id: c.id,
    requestNo: c.requestNo,
    type: c.type,
    studentId: c.student.id,
    studentName: c.student.name,
    enrolmentNo: c.student.enrolmentNo,
    rollNo: c.student.rollNo,
    programme: `${c.student.programme.shortName} ${c.student.semester}`,
    purpose: c.purpose,
    priority: c.priority,
    stage: c.stage,
    fee: c.fee,
    feePaid: c.feePaid,
    requestedOn: c.requestedAt,
    slaDeadline: c.slaDeadline,
    // The two numbers the queue is actually sorted and coloured by.
    daysLeft: open ? daysLeft : null,
    overdue: open && daysLeft < 0,
    notes: c.notes,
    issuedBy: c.issuedBy?.name ?? null,
    issuedAt: c.issuedAt,
    rejectReason: c.rejectReason,
  };
}

const INCLUDE = {
  student: {
    select: {
      id: true,
      enrolmentNo: true,
      rollNo: true,
      name: true,
      semester: true,
      programme: { select: { shortName: true } },
    },
  },
  issuedBy: { select: { name: true } },
};

// ─── GET /api/office/certificates ─────────────────────────────────────────────

/** The queue, most urgent first: overdue, then nearest deadline. */
certificatesRouter.get(
  '/certificates',
  validate(
    'query',
    z.object({
      stage: z.enum(['REQUESTED', 'COLLEGE_OFFICE', 'READY', 'DISPATCHED', 'REJECTED']).optional(),
      open: z.coerce.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined;
    const openOnly = req.query.open === 'true';

    const requests = await prisma.certificateRequest.findMany({
      where: {
        ...(stage ? { stage: stage as 'REQUESTED' } : {}),
        ...(openOnly ? { stage: { notIn: ['DISPATCHED', 'REJECTED'] } } : {}),
      },
      include: INCLUDE,
      orderBy: [{ priority: 'desc' }, { slaDeadline: 'asc' }],
    });

    const rows = requests.map(present);

    res.json({
      totals: {
        open: rows.filter((r) => r.stage !== 'DISPATCHED' && r.stage !== 'REJECTED').length,
        overdue: rows.filter((r) => r.overdue).length,
        ready: rows.filter((r) => r.stage === 'READY').length,
      },
      types: Object.entries(CERTIFICATE_SLA).map(([type, v]) => ({
        type,
        slaDays: v.days,
        fee: v.fee,
      })),
      requests: rows,
    });
  }),
);

// ─── POST /api/office/certificates/:id/advance ────────────────────────────────

/**
 * Moves a request along, or rejects it.
 *
 * Only the transitions the process actually allows: a request cannot skip
 * from requested straight to dispatched, and nothing leaves the counter with
 * its fee unpaid.
 */
certificatesRouter.post(
  '/certificates/:id/advance',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      stage: z.enum(['COLLEGE_OFFICE', 'READY', 'DISPATCHED', 'REJECTED']),
      notes: z.string().max(500).optional(),
      reason: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const staffId = await resolveStaffId(req);
    const { id } = req.params as { id: string };
    const { stage, notes, reason } = req.body as { stage: string; notes?: string; reason?: string };

    const request = await prisma.certificateRequest.findUnique({ where: { id } });
    if (!request) throw ApiError.notFound('No such certificate request');

    const allowed = NEXT_STAGE[request.stage] ?? [];
    if (!allowed.includes(stage)) {
      throw ApiError.conflict(
        `A request at ${request.stage.toLowerCase()} cannot move to ${stage.toLowerCase()}`,
        { allowed },
      );
    }
    if (stage === 'REJECTED' && !reason) {
      throw ApiError.badRequest('A rejection needs a reason the student can act on');
    }
    if (stage === 'READY' && request.fee > 0 && !request.feePaid) {
      throw ApiError.badRequest('The fee for this certificate has not been paid');
    }

    const now = new Date();

    const [updated] = await prisma.$transaction([
      prisma.certificateRequest.update({
        where: { id },
        data: {
          stage: stage as 'READY',
          notes: notes ?? request.notes,
          rejectReason: stage === 'REJECTED' ? reason : null,
          ...(stage === 'READY' ? { issuedById: staffId, issuedAt: now } : {}),
        },
        include: INCLUDE,
      }),
      prisma.notification.create({
        data: {
          studentId: request.studentId,
          kind: 'GENERAL',
          title:
            stage === 'READY'
              ? `${request.type} is ready to collect`
              : stage === 'DISPATCHED'
                ? `${request.type} has been dispatched`
                : stage === 'REJECTED'
                  ? `${request.type} request declined`
                  : `${request.type} is being processed`,
          body:
            stage === 'REJECTED'
              ? (reason ?? '')
              : `Request ${request.requestNo} — ${request.type}.`,
          urgent: stage === 'REJECTED',
          href: '/certificates',
        },
      }),
    ]);

    res.json(present(updated));
  }),
);

// ─── POST /api/office/certificates/:id/fee ────────────────────────────────────

/** Marks the certificate fee as received. */
certificatesRouter.post(
  '/certificates/:id/fee',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const { id } = req.params as { id: string };

    const request = await prisma.certificateRequest.findUnique({ where: { id } });
    if (!request) throw ApiError.notFound('No such certificate request');
    if (request.feePaid) throw ApiError.conflict('That fee is already marked paid');

    const updated = await prisma.certificateRequest.update({
      where: { id },
      data: { feePaid: true },
      include: INCLUDE,
    });

    res.json(present(updated));
  }),
);

// ═══ The student's own side ══════════════════════════════════════════════════

export const studentCertificatesRouter = Router();
studentCertificatesRouter.use(requireAuth);

// ─── GET /api/student/certificates ────────────────────────────────────────────

studentCertificatesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);

    const requests = await prisma.certificateRequest.findMany({
      where: { studentId },
      include: INCLUDE,
      orderBy: { requestedAt: 'desc' },
    });

    res.json({
      types: Object.entries(CERTIFICATE_SLA).map(([type, v]) => ({
        type,
        slaDays: v.days,
        fee: v.fee,
      })),
      requests: requests.map(present),
    });
  }),
);

// ─── POST /api/student/certificates ───────────────────────────────────────────

/**
 * Asks for a certificate.
 *
 * The deadline is fixed here, from the service standard in force today, and
 * stored — so a request keeps the promise it was made under even if the
 * standard changes later.
 */
studentCertificatesRouter.post(
  '/',
  validate(
    'body',
    z.object({
      type: z.string().min(2),
      purpose: z.string().min(5).max(300),
      priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const { type, purpose, priority } = req.body as {
      type: string;
      purpose: string;
      priority: 'NORMAL' | 'URGENT';
    };

    const standard = CERTIFICATE_SLA[type];
    if (!standard) {
      throw ApiError.badRequest(`The college does not issue "${type}"`, {
        types: Object.keys(CERTIFICATE_SLA),
      });
    }

    const duplicate = await prisma.certificateRequest.findFirst({
      where: { studentId, type, stage: { notIn: ['DISPATCHED', 'REJECTED'] } },
      select: { id: true, requestNo: true },
    });
    if (duplicate) {
      throw ApiError.conflict(`You already have an open request for a ${type}`, duplicate);
    }

    const year = new Date().getFullYear();
    const prefix = `CR/${year}/`;
    const existing = await prisma.certificateRequest.findMany({
      where: { requestNo: { startsWith: prefix } },
      select: { requestNo: true },
    });

    const created = await prisma.certificateRequest.create({
      data: {
        requestNo: nextInSeries(prefix, existing.map((r) => r.requestNo), 5),
        studentId,
        type,
        purpose,
        priority,
        fee: standard.fee,
        feePaid: standard.fee === 0,
        slaDeadline: slaDeadline(type, priority),
        stage: 'REQUESTED',
      },
      include: INCLUDE,
    });

    res.status(201).json(present(created));
  }),
);

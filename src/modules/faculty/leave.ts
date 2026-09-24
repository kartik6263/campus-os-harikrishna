import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireHod, resolveFacultyId } from '../../auth/middleware.js';

export const leaveRouter = Router();

const KIND = z.enum(['CASUAL', 'MEDICAL', 'EARNED', 'STUDY', 'DUTY', 'MATERNITY', 'UNPAID']);

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Inclusive span, so a single-day leave is one day rather than zero. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

// ─── GET /api/faculty/leaves ──────────────────────────────────────────────────

leaveRouter.get(
  '/leaves',
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);

    const leaves = await prisma.facultyLeave.findMany({
      where: { facultyId },
      include: { decidedBy: { select: { name: true, designation: true } } },
      orderBy: { appliedAt: 'desc' },
    });

    const taken = leaves
      .filter((l) => l.status === 'APPROVED')
      .reduce((sum, l) => sum + l.days, 0);

    res.json({
      daysTakenThisYear: taken,
      pending: leaves.filter((l) => l.status === 'PENDING').length,
      leaves: leaves.map((l) => ({
        id: l.id,
        kind: l.kind,
        from: l.fromDate,
        to: l.toDate,
        days: l.days,
        reason: l.reason,
        substitute: l.substitute,
        status: l.status,
        appliedAt: l.appliedAt,
        decidedAt: l.decidedAt,
        decidedBy: l.decidedBy ? `${l.decidedBy.name} (${l.decidedBy.designation})` : null,
        decisionNote: l.decisionNote,
      })),
    });
  }),
);

// ─── POST /api/faculty/leaves ─────────────────────────────────────────────────

/**
 * Applies for leave.
 *
 * Overlapping a live application is refused rather than merged: two pending
 * requests for the same week is the kind of thing that gets approved twice.
 */
leaveRouter.post(
  '/leaves',
  validate(
    'body',
    z
      .object({
        kind: KIND,
        from: z.string().date(),
        to: z.string().date(),
        reason: z.string().min(3).max(1000),
        substitute: z.string().max(200).optional(),
      })
      .refine((v) => day(v.to) >= day(v.from), {
        message: 'The end date cannot be before the start date',
        path: ['to'],
      }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const body = req.body as {
      kind: z.infer<typeof KIND>;
      from: string;
      to: string;
      reason: string;
      substitute?: string;
    };

    const fromDate = day(body.from);
    const toDate = day(body.to);

    const clash = await prisma.facultyLeave.findFirst({
      where: {
        facultyId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
      select: { id: true, fromDate: true, toDate: true, status: true },
    });

    if (clash) {
      throw ApiError.conflict('You already have leave covering those dates', {
        leaveId: clash.id,
        from: clash.fromDate,
        to: clash.toDate,
        status: clash.status,
      });
    }

    const leave = await prisma.facultyLeave.create({
      data: {
        facultyId,
        kind: body.kind,
        fromDate,
        toDate,
        days: daysBetween(fromDate, toDate),
        reason: body.reason,
        substitute: body.substitute ?? null,
      },
    });

    res.status(201).json({
      id: leave.id,
      kind: leave.kind,
      from: leave.fromDate,
      to: leave.toDate,
      days: leave.days,
      status: leave.status,
      appliedAt: leave.appliedAt,
    });
  }),
);

// ─── POST /api/faculty/leaves/:id/cancel ──────────────────────────────────────

/** Withdraws an application. Only the applicant, and only while pending. */
leaveRouter.post(
  '/leaves/:id/cancel',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { id } = req.params as { id: string };

    const leave = await prisma.facultyLeave.findUnique({ where: { id } });
    if (!leave || leave.facultyId !== facultyId) throw ApiError.notFound('No such leave application');
    if (leave.status !== 'PENDING') {
      throw ApiError.conflict(`This application is already ${leave.status.toLowerCase()}`);
    }

    const updated = await prisma.facultyLeave.update({
      where: { id },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });

    res.json({ id: updated.id, status: updated.status });
  }),
);

// ─── GET /api/faculty/leaves-pending ──────────────────────────────────────────

/** What the head of department has to decide on, department-scoped. */
leaveRouter.get(
  '/leaves-pending',
  requireHod,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const department =
      auth.role === 'ADMIN'
        ? null
        : (
            await prisma.faculty.findUniqueOrThrow({
              where: { id: auth.facultyId! },
              select: { department: true },
            })
          ).department;

    const leaves = await prisma.facultyLeave.findMany({
      where: {
        status: 'PENDING',
        ...(department ? { faculty: { department } } : {}),
      },
      include: {
        faculty: { select: { id: true, name: true, employeeId: true, designation: true } },
      },
      orderBy: { appliedAt: 'asc' },
    });

    res.json(
      leaves.map((l) => ({
        id: l.id,
        facultyId: l.faculty.id,
        applicant: l.faculty.name,
        employeeId: l.faculty.employeeId,
        designation: l.faculty.designation,
        kind: l.kind,
        from: l.fromDate,
        to: l.toDate,
        days: l.days,
        reason: l.reason,
        substitute: l.substitute,
        appliedAt: l.appliedAt,
      })),
    );
  }),
);

// ─── POST /api/faculty/leaves/:id/decide ──────────────────────────────────────

leaveRouter.post(
  '/leaves/:id/decide',
  requireHod,
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      decision: z.enum(['APPROVE', 'REJECT']),
      note: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { decision, note } = req.body as { decision: 'APPROVE' | 'REJECT'; note?: string };

    if (decision === 'REJECT' && !note) {
      throw ApiError.badRequest('A rejection needs a reason');
    }

    const leave = await prisma.facultyLeave.findUnique({
      where: { id },
      include: { faculty: { select: { id: true, department: true } } },
    });

    if (!leave) throw ApiError.notFound('No such leave application');
    if (leave.status !== 'PENDING') {
      throw ApiError.conflict(`This application is already ${leave.status.toLowerCase()}`);
    }

    if (auth.role !== 'ADMIN') {
      const hod = await prisma.faculty.findUniqueOrThrow({
        where: { id: auth.facultyId! },
        select: { id: true, department: true },
      });
      if (hod.department !== leave.faculty.department) {
        throw ApiError.forbidden('That application is from another department');
      }
      if (hod.id === leave.faculty.id) {
        throw ApiError.forbidden('You cannot decide your own leave application');
      }
    }

    const updated = await prisma.facultyLeave.update({
      where: { id },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decidedAt: new Date(),
        decidedById: auth.facultyId ?? null,
        decisionNote: note ?? null,
      },
    });

    res.json({
      id: updated.id,
      status: updated.status,
      decidedAt: updated.decidedAt,
      decisionNote: updated.decisionNote,
    });
  }),
);

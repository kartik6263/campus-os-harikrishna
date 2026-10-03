import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, validate } from '../../lib/http.js';

/**
 * The HR section's read of the people the system already knows: every
 * teacher and office staff member with a sign-in, and every leave they have
 * applied for. Pay, service book and recruitment are HR's own registers on
 * the screen; these are the facts it builds them on.
 */
export const hrRouter = Router();

// ─── GET /api/governance/hr/staff ─────────────────────────────────────────────

hrRouter.get(
  '/hr/staff',
  asyncHandler(async (_req, res) => {
    const [faculty, office] = await Promise.all([
      prisma.faculty.findMany({
        select: { id: true, employeeId: true, name: true, designation: true, department: true, mobile: true, joinDate: true, isHod: true, user: { select: { email: true, isActive: true } }, college: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.officeStaff.findMany({
        select: { id: true, employeeId: true, name: true, designation: true, mobile: true, createdAt: true, user: { select: { email: true, isActive: true, role: true } }, college: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);
    res.json([
      ...faculty.map((f) => ({
        id: f.id, employeeId: f.employeeId, name: f.name, designation: f.designation, department: f.department,
        type: 'teaching' as const, mobile: f.mobile, email: f.user.email, active: f.user.isActive,
        joinedOn: f.joinDate, college: f.college.name, isHod: f.isHod,
      })),
      ...office.map((o) => ({
        id: o.id, employeeId: o.employeeId, name: o.name, designation: o.designation, department: o.user.role === 'REGISTRAR' ? 'Registry' : 'Administration',
        type: 'non_teaching' as const, mobile: o.mobile, email: o.user.email, active: o.user.isActive,
        joinedOn: o.createdAt, college: o.college.name, isHod: false,
      })),
    ]);
  }),
);

// ─── GET /api/governance/hr/leaves ────────────────────────────────────────────

/** Every teacher's leave, as decided by their head of department. */
hrRouter.get(
  '/hr/leaves',
  validate('query', z.object({ from: z.string().date().optional() })),
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date(Date.now() - 365 * 86_400_000);
    const leaves = await prisma.facultyLeave.findMany({
      where: { toDate: { gte: from } },
      include: { faculty: { select: { name: true, employeeId: true, department: true } }, decidedBy: { select: { name: true } } },
      orderBy: { appliedAt: 'desc' },
      take: 2000,
    });
    res.json(leaves.map((l) => ({
      id: l.id, kind: l.kind, fromDate: l.fromDate, toDate: l.toDate, days: l.days, reason: l.reason, substitute: l.substitute,
      status: l.status, appliedAt: l.appliedAt, decidedAt: l.decidedAt, decidedBy: l.decidedBy?.name ?? null, decisionNote: l.decisionNote,
      employee: l.faculty.name, employeeId: l.faculty.employeeId, department: l.faculty.department,
    })));
  }),
);

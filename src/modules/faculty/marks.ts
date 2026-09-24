import { Router } from 'express';
import { z } from 'zod';
import type { SubjectKind } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireHod, resolveFacultyId } from '../../auth/middleware.js';
import { ownedAssignment } from './shared.js';

export const marksRouter = Router();

/**
 * The default scoring scheme per kind of subject. A lecturer's components are
 * copied from here the first time a sheet is opened, so changing the template
 * later cannot silently rescale marks already entered.
 */
export const COMPONENT_TEMPLATES: Record<
  SubjectKind,
  Array<{ key: string; label: string; maxMarks: number; description: string }>
> = {
  THEORY: [
    { key: 'assignment1', label: 'Assignment 1', maxMarks: 10, description: 'First assignment (Unit 1–2)' },
    { key: 'assignment2', label: 'Assignment 2', maxMarks: 10, description: 'Second assignment (Unit 3–4)' },
    { key: 'quiz1', label: 'Quiz 1', maxMarks: 10, description: 'Class quiz after Unit 2' },
    { key: 'quiz2', label: 'Quiz 2', maxMarks: 10, description: 'Class quiz after Unit 4' },
    { key: 'midterm', label: 'Mid-term Exam', maxMarks: 30, description: 'Internal mid-semester examination' },
  ],
  LAB: [
    { key: 'lab_record', label: 'Lab Record', maxMarks: 20, description: 'Practical record book' },
    { key: 'viva', label: 'Viva Voce', maxMarks: 20, description: 'Oral examination' },
    { key: 'lab_test', label: 'Lab Test', maxMarks: 10, description: 'Practical examination' },
  ],
  PROJECT: [
    { key: 'synopsis', label: 'Synopsis / Proposal', maxMarks: 20, description: 'Project proposal submission' },
    { key: 'progress', label: 'Progress Presentation', maxMarks: 20, description: 'Mid-project review' },
    { key: 'final_viva', label: 'Final Viva', maxMarks: 60, description: 'Final presentation and viva' },
  ],
};

/** Statuses a lecturer may still type into. */
const EDITABLE = new Set(['NOT_STARTED', 'DRAFT', 'RETURNED']);

/**
 * Loads the sheet for an assignment, creating it and its components on first
 * open. Doing it lazily means an untouched class costs no rows.
 */
async function sheetFor(assignmentId: string, facultyId: string) {
  const assignment = await ownedAssignment(assignmentId, facultyId);

  if (assignment.components.length === 0) {
    await prisma.marksComponent.createMany({
      data: COMPONENT_TEMPLATES[assignment.kind].map((c, order) => ({
        assignmentId: assignment.id,
        key: c.key,
        label: c.label,
        maxMarks: c.maxMarks,
        description: c.description,
        order,
      })),
    });
  }

  const sheet = await prisma.marksSheet.upsert({
    where: { assignmentId: assignment.id },
    create: { assignmentId: assignment.id, status: 'NOT_STARTED' },
    update: {},
    include: { decidedBy: { select: { name: true, designation: true } } },
  });

  const components = await prisma.marksComponent.findMany({
    where: { assignmentId: assignment.id },
    orderBy: { order: 'asc' },
  });

  return { assignment, sheet, components };
}

// ─── GET /api/faculty/marks/:assignmentId ─────────────────────────────────────

marksRouter.get(
  '/marks/:assignmentId',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { assignmentId } = req.params as { assignmentId: string };
    const { assignment, sheet, components } = await sheetFor(assignmentId, facultyId);

    const [enrolments, entries] = await Promise.all([
      prisma.enrolment.findMany({
        where: { subjectId: assignment.subjectId, term: assignment.term },
        include: { student: { select: { id: true, rollNo: true, enrolmentNo: true, name: true } } },
        orderBy: { student: { rollNo: 'asc' } },
      }),
      prisma.markEntry.findMany({
        where: { sheetId: sheet.id },
        select: { studentId: true, componentId: true, value: true },
      }),
    ]);

    const keyOf = new Map(components.map((c) => [c.id, c.key]));
    const byStudent = new Map<string, Record<string, number | null>>();
    for (const e of entries) {
      const key = keyOf.get(e.componentId);
      if (!key) continue;
      const row = byStudent.get(e.studentId) ?? {};
      row[key] = e.value;
      byStudent.set(e.studentId, row);
    }

    const maxTotal = components.reduce((sum, c) => sum + c.maxMarks, 0);

    res.json({
      assignmentId: assignment.id,
      sheetId: sheet.id,
      code: assignment.subject.code,
      subject: assignment.subject.name,
      classLabel: assignment.classLabel,
      kind: assignment.kind,
      status: sheet.status,
      submittedAt: sheet.submittedAt,
      decidedAt: sheet.decidedAt,
      decidedBy: sheet.decidedBy
        ? `${sheet.decidedBy.name} (${sheet.decidedBy.designation})`
        : null,
      returnReason: sheet.returnReason,
      editable: EDITABLE.has(sheet.status),
      maxTotal,
      components: components.map((c) => ({
        key: c.key,
        label: c.label,
        maxMarks: c.maxMarks,
        description: c.description,
      })),
      students: enrolments.map((e) => {
        const marks = byStudent.get(e.studentId) ?? {};
        const scored = components
          .map((c) => marks[c.key])
          .filter((v): v is number => typeof v === 'number');
        return {
          studentId: e.student.id,
          rollNo: e.student.rollNo,
          enrolmentNo: e.student.enrolmentNo,
          name: e.student.name,
          marks: Object.fromEntries(components.map((c) => [c.key, marks[c.key] ?? null])),
          total: scored.reduce((a, b) => a + b, 0),
          complete: scored.length === components.length,
        };
      }),
    });
  }),
);

// ─── PUT /api/faculty/marks/:assignmentId/entries ─────────────────────────────

/**
 * Saves marks. Partial by design — a lecturer fills one column at a time — so
 * only the cells sent are written, and a null clears one back to unscored.
 */
marksRouter.put(
  '/marks/:assignmentId/entries',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  validate(
    'body',
    z.object({
      entries: z
        .array(
          z.object({
            studentId: z.string().min(1),
            component: z.string().min(1),
            value: z.number().int().min(0).nullable(),
          }),
        )
        .min(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { assignmentId } = req.params as { assignmentId: string };
    const { entries } = req.body as {
      entries: Array<{ studentId: string; component: string; value: number | null }>;
    };

    const { assignment, sheet, components } = await sheetFor(assignmentId, facultyId);

    if (!EDITABLE.has(sheet.status)) {
      throw ApiError.conflict(
        `This sheet is ${sheet.status.toLowerCase()} and can no longer be edited`,
      );
    }

    const byKey = new Map(components.map((c) => [c.key, c]));

    // Validate the whole batch before writing any of it.
    for (const e of entries) {
      const component = byKey.get(e.component);
      if (!component) throw ApiError.badRequest(`Unknown component "${e.component}"`);
      if (e.value !== null && e.value > component.maxMarks) {
        throw ApiError.badRequest(
          `${component.label} is out of ${component.maxMarks}; got ${e.value}`,
          { studentId: e.studentId, component: e.component },
        );
      }
    }

    const enrolled = await prisma.enrolment.findMany({
      where: {
        subjectId: assignment.subjectId,
        term: assignment.term,
        studentId: { in: [...new Set(entries.map((e) => e.studentId))] },
      },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolled.map((e) => e.studentId));
    const strangers = entries.filter((e) => !enrolledIds.has(e.studentId));
    if (strangers.length > 0) {
      throw ApiError.badRequest('Some students are not enrolled in this subject', {
        studentIds: [...new Set(strangers.map((s) => s.studentId))],
      });
    }

    await prisma.$transaction([
      ...entries.map((e) => {
        const componentId = byKey.get(e.component)!.id;
        return prisma.markEntry.upsert({
          where: {
            sheetId_studentId_componentId: { sheetId: sheet.id, studentId: e.studentId, componentId },
          },
          create: { sheetId: sheet.id, studentId: e.studentId, componentId, value: e.value },
          update: { value: e.value },
        });
      }),
      prisma.marksSheet.update({
        where: { id: sheet.id },
        // Typing into a returned sheet puts it back in the lecturer's hands.
        data: { status: 'DRAFT', returnReason: null },
      }),
    ]);

    res.json({ sheetId: sheet.id, saved: entries.length, status: 'DRAFT' });
  }),
);

// ─── POST /api/faculty/marks/:assignmentId/submit ─────────────────────────────

/** Sends the sheet to the head of department. Incomplete sheets are refused. */
marksRouter.post(
  '/marks/:assignmentId/submit',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { assignmentId } = req.params as { assignmentId: string };
    const { assignment, sheet, components } = await sheetFor(assignmentId, facultyId);

    if (!EDITABLE.has(sheet.status)) {
      throw ApiError.conflict(`This sheet is already ${sheet.status.toLowerCase()}`);
    }

    const [enrolments, entries] = await Promise.all([
      prisma.enrolment.findMany({
        where: { subjectId: assignment.subjectId, term: assignment.term },
        include: { student: { select: { rollNo: true, name: true } } },
      }),
      prisma.markEntry.findMany({
        where: { sheetId: sheet.id, value: { not: null } },
        select: { studentId: true },
      }),
    ]);

    if (enrolments.length === 0) throw ApiError.badRequest('This class has no students enrolled');

    const scored = new Map<string, number>();
    for (const e of entries) scored.set(e.studentId, (scored.get(e.studentId) ?? 0) + 1);

    const incomplete = enrolments.filter((e) => (scored.get(e.studentId) ?? 0) < components.length);

    if (incomplete.length > 0) {
      throw ApiError.badRequest('Every student needs a mark in every component before submitting', {
        missing: incomplete.slice(0, 20).map((e) => ({
          rollNo: e.student.rollNo,
          name: e.student.name,
        })),
        missingCount: incomplete.length,
      });
    }

    const updated = await prisma.marksSheet.update({
      where: { id: sheet.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), returnReason: null },
    });

    res.json({
      sheetId: updated.id,
      status: updated.status,
      submittedAt: updated.submittedAt,
      students: enrolments.length,
    });
  }),
);

// ─── POST /api/faculty/marks/:assignmentId/decide ─────────────────────────────

/**
 * The head of department approves the sheet or returns it with a reason.
 *
 * Scoped to their own department, and a lecturer cannot approve their own
 * sheet even if they hold the HOD flag — that is the whole point of the step.
 */
marksRouter.post(
  '/marks/:assignmentId/decide',
  requireHod,
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  validate(
    'body',
    z.object({
      decision: z.enum(['APPROVE', 'RETURN']),
      reason: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { assignmentId } = req.params as { assignmentId: string };
    const { decision, reason } = req.body as { decision: 'APPROVE' | 'RETURN'; reason?: string };

    if (decision === 'RETURN' && !reason) {
      throw ApiError.badRequest('A returned sheet needs a reason the lecturer can act on');
    }

    const assignment = await prisma.subjectAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        faculty: { select: { id: true, department: true } },
        marksSheet: true,
      },
    });

    if (!assignment) throw ApiError.notFound('No such class');
    if (!assignment.marksSheet || assignment.marksSheet.status !== 'SUBMITTED') {
      throw ApiError.conflict('Only a submitted sheet can be approved or returned');
    }

    if (auth.role !== 'ADMIN') {
      const hod = await prisma.faculty.findUniqueOrThrow({
        where: { id: auth.facultyId! },
        select: { id: true, department: true },
      });
      if (hod.department !== assignment.faculty.department) {
        throw ApiError.forbidden('That class is in another department');
      }
      if (hod.id === assignment.faculty.id) {
        throw ApiError.forbidden('You cannot approve your own marks sheet');
      }
    }

    const updated = await prisma.marksSheet.update({
      where: { id: assignment.marksSheet.id },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'RETURNED',
        decidedAt: new Date(),
        decidedById: auth.facultyId ?? null,
        returnReason: decision === 'RETURN' ? reason : null,
      },
    });

    res.json({
      sheetId: updated.id,
      status: updated.status,
      decidedAt: updated.decidedAt,
      returnReason: updated.returnReason,
    });
  }),
);

// ─── GET /api/faculty/marks/pending/approval ──────────────────────────────────

/** Sheets waiting on this head of department. */
marksRouter.get(
  '/marks-pending',
  requireHod,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const where =
      auth.role === 'ADMIN'
        ? {}
        : {
            faculty: {
              department: (
                await prisma.faculty.findUniqueOrThrow({
                  where: { id: auth.facultyId! },
                  select: { department: true },
                })
              ).department,
            },
          };

    const assignments = await prisma.subjectAssignment.findMany({
      where: { ...where, marksSheet: { status: 'SUBMITTED' } },
      include: {
        subject: { select: { code: true, name: true } },
        faculty: { select: { id: true, name: true, employeeId: true } },
        marksSheet: { select: { id: true, submittedAt: true } },
      },
      orderBy: { marksSheet: { submittedAt: 'asc' } },
    });

    res.json(
      assignments.map((a) => ({
        assignmentId: a.id,
        sheetId: a.marksSheet!.id,
        code: a.subject.code,
        subject: a.subject.name,
        classLabel: a.classLabel,
        lecturer: a.faculty.name,
        employeeId: a.faculty.employeeId,
        submittedAt: a.marksSheet!.submittedAt,
      })),
    );
  }),
);

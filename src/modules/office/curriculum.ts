import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';

/**
 * The curriculum as the system holds it: every programme and the subjects of
 * each semester. Adding a course here adds the subject itself, so it can be
 * enrolled in, timetabled, attended and examined.
 */
export const curriculumRouter = Router();

curriculumRouter.get(
  '/curriculum',
  asyncHandler(async (_req, res) => {
    const programmes = await prisma.programme.findMany({
      include: { subjects: { orderBy: [{ semester: 'asc' }, { code: 'asc' }], include: { _count: { select: { enrolments: true } } } }, _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(programmes.map((p) => ({
      id: p.id, code: p.code, name: p.name, shortName: p.shortName, years: p.years, students: p._count.students,
      subjects: p.subjects.map((s) => ({ id: s.id, code: s.code, name: s.name, credits: s.credits, semester: s.semester, enrolled: s._count.enrolments })),
    })));
  }),
);

curriculumRouter.post(
  '/curriculum/subjects',
  requireRole('REGISTRAR', 'ADMIN'),
  validate('body', z.object({
    programmeId: z.string().min(1),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,15}$/, 'Codes are 3–15 letters, digits or hyphens'),
    name: z.string().trim().min(3).max(120),
    credits: z.number().int().min(0).max(30),
    semester: z.number().int().min(1).max(12),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { programmeId: string; code: string; name: string; credits: number; semester: number };
    const programme = await prisma.programme.findUnique({ where: { id: b.programmeId }, select: { shortName: true, years: true } });
    if (!programme) throw ApiError.notFound('No such programme');
    if (b.semester > programme.years * 2) throw ApiError.badRequest(`${programme.shortName} has ${programme.years * 2} semesters`);
    if (await prisma.subject.findUnique({ where: { code: b.code }, select: { id: true } })) throw ApiError.conflict(`Subject ${b.code} already exists`);
    const s = await prisma.subject.create({ data: b });
    await recordFor(req, { module: 'Curriculum', action: 'add-course', target: s.code, detail: `${programme.shortName} sem ${s.semester}: ${s.name} (${s.credits} cr)` });
    res.status(201).json(s);
  }),
);

/** Renames a course or changes its credits; the code and semester stay as enrolled. */
curriculumRouter.patch(
  '/curriculum/subjects/:id',
  requireRole('REGISTRAR', 'ADMIN'),
  validate('body', z.object({ name: z.string().trim().min(3).max(120).optional(), credits: z.number().int().min(0).max(30).optional() })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const before = await prisma.subject.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('No such subject');
    const s = await prisma.subject.update({ where: { id }, data: req.body as { name?: string; credits?: number } });
    await recordFor(req, { module: 'Curriculum', action: 'edit-course', target: s.code, detail: `${before.name} (${before.credits}) → ${s.name} (${s.credits})` });
    res.json(s);
  }),
);

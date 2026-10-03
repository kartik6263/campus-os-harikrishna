import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { recordFor } from '../itconsole/audit.js';

/**
 * Corrections to a student's own particulars — name, date of birth, category,
 * contact details — made by the records section once a request is verified.
 * Every change is written to the audit chain with what it was and what it became.
 */
export const studentsAdminRouter = Router();

const body = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  nameHi: z.string().trim().max(120).optional(),
  dob: z.string().date().optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  category: z.string().trim().min(2).max(20).optional(),
  mobile: z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid mobile number').optional(),
  address: z.string().trim().min(5).max(400).optional(),
  reason: z.string().trim().min(5).max(300),
});

studentsAdminRouter.patch(
  '/students/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', body),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { reason, dob, ...rest } = req.body as z.infer<typeof body>;
    const before = await prisma.student.findUnique({ where: { id }, select: { enrolmentNo: true, name: true, nameHi: true, dob: true, gender: true, category: true, mobile: true, address: true } });
    if (!before) throw ApiError.notFound('No such student');
    const data = { ...rest, ...(dob ? { dob: new Date(`${dob}T00:00:00.000Z`) } : {}) };
    if (Object.keys(data).length === 0) throw ApiError.badRequest('Nothing to change');
    const after = await prisma.student.update({ where: { id }, data, select: { name: true, nameHi: true, dob: true, gender: true, category: true, mobile: true, address: true } });
    const show = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '—'));
    const changes = Object.keys(data).map((k) => `${k}: ${show(before[k as keyof typeof before])} → ${show(after[k as keyof typeof after])}`).join('; ');
    await recordFor(req, { module: 'Student Records', action: 'correct', target: before.enrolmentNo, detail: `${changes} (${reason})` });
    res.json({ id, ...after });
  }),
);

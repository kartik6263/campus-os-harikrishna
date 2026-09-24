import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveFacultyId } from '../../auth/middleware.js';

export const materialsRouter = Router();

const TYPE = z.enum(['PDF', 'PPT', 'VIDEO', 'LINK']);

/** Proves the lecturer teaches the subject a material is being filed under. */
async function teachesSubject(facultyId: string, subjectId: string) {
  const assignment = await prisma.subjectAssignment.findFirst({
    where: { facultyId, subjectId },
    select: { id: true },
  });
  if (!assignment) throw ApiError.forbidden('You do not teach this subject');
}

// ─── GET /api/faculty/materials ───────────────────────────────────────────────

materialsRouter.get(
  '/materials',
  validate('query', z.object({ code: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;

    const materials = await prisma.studyMaterial.findMany({
      where: { facultyId, ...(code ? { subject: { code } } : {}) },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: [{ subject: { code: 'asc' } }, { unit: 'asc' }, { uploadedAt: 'desc' }],
    });

    res.json(
      materials.map((m) => ({
        id: m.id,
        code: m.subject.code,
        subject: m.subject.name,
        unit: m.unit,
        unitTitle: m.unitTitle,
        filename: m.filename,
        url: m.url,
        type: m.type,
        size: m.sizeLabel,
        visibleToStudents: m.visibleToStudents,
        uploadedAt: m.uploadedAt,
      })),
    );
  }),
);

// ─── POST /api/faculty/materials ──────────────────────────────────────────────

/**
 * Files a study material.
 *
 * This phase stores metadata only — the bytes live wherever `url` points — so
 * the client uploads elsewhere and records the result here.
 */
materialsRouter.post(
  '/materials',
  validate(
    'body',
    z.object({
      code: z.string().min(1),
      unit: z.number().int().min(1).max(20),
      unitTitle: z.string().min(1).max(200),
      filename: z.string().min(1).max(200),
      url: z.string().url().optional(),
      type: TYPE,
      size: z.string().max(20).optional(),
      visibleToStudents: z.boolean().default(true),
    }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const body = req.body as {
      code: string;
      unit: number;
      unitTitle: string;
      filename: string;
      url?: string;
      type: z.infer<typeof TYPE>;
      size?: string;
      visibleToStudents: boolean;
    };

    const subject = await prisma.subject.findUnique({
      where: { code: body.code },
      select: { id: true },
    });
    if (!subject) throw ApiError.notFound(`No subject with code ${body.code}`);

    await teachesSubject(facultyId, subject.id);

    if (body.type === 'LINK' && !body.url) {
      throw ApiError.badRequest('A link needs a url');
    }

    const material = await prisma.studyMaterial.create({
      data: {
        facultyId,
        subjectId: subject.id,
        unit: body.unit,
        unitTitle: body.unitTitle,
        filename: body.filename,
        url: body.url ?? null,
        type: body.type,
        sizeLabel: body.size ?? null,
        visibleToStudents: body.visibleToStudents,
      },
    });

    res.status(201).json({
      id: material.id,
      code: body.code,
      unit: material.unit,
      filename: material.filename,
      type: material.type,
      visibleToStudents: material.visibleToStudents,
      uploadedAt: material.uploadedAt,
    });
  }),
);

// ─── PATCH /api/faculty/materials/:id ─────────────────────────────────────────

/** Renames a material or pulls it back from students. */
materialsRouter.patch(
  '/materials/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z
      .object({
        unitTitle: z.string().min(1).max(200).optional(),
        visibleToStudents: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { unitTitle?: string; visibleToStudents?: boolean };

    const existing = await prisma.studyMaterial.findUnique({ where: { id } });
    if (!existing || existing.facultyId !== facultyId) {
      throw ApiError.notFound('No such material');
    }

    const material = await prisma.studyMaterial.update({ where: { id }, data: body });

    res.json({
      id: material.id,
      unitTitle: material.unitTitle,
      visibleToStudents: material.visibleToStudents,
    });
  }),
);

// ─── DELETE /api/faculty/materials/:id ────────────────────────────────────────

materialsRouter.delete(
  '/materials/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.studyMaterial.findUnique({ where: { id } });
    if (!existing || existing.facultyId !== facultyId) {
      throw ApiError.notFound('No such material');
    }

    await prisma.studyMaterial.delete({ where: { id } });
    res.status(204).end();
  }),
);

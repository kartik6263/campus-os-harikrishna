import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate, validQuery } from '../lib/http.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { recordFor } from './itconsole/audit.js';

export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

announcementsRouter.get(
  '/',
  validate('query', z.object({
    scope: z.enum(['UNIVERSITY', 'COLLEGE', 'DEPARTMENT', 'BATCH']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  })),
  asyncHandler(async (req, res) => {
    const { scope, limit } = validQuery<{ scope?: string; limit: number }>(req);
    const items = await prisma.announcement.findMany({
      where: scope ? { scope: scope as never } : {},
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
    res.json(items);
  }),
);

// ─── Publishing ───────────────────────────────────────────────────────────────

/** Who an announcement's notification reaches: every student, or some programmes and semesters. */
const audience = z.object({
  programmeCodes: z.array(z.string().min(1)).max(50).default([]),
  semesters: z.array(z.number().int().min(1).max(12)).max(12).default([]),
});

function studentsWhere(a: z.infer<typeof audience>): Prisma.StudentWhereInput {
  return {
    ...(a.programmeCodes.length ? { programme: { code: { in: a.programmeCodes } } } : {}),
    ...(a.semesters.length ? { semester: { in: a.semesters } } : {}),
  };
}

/** The notification link that ties each student's copy back to its announcement. */
// A route the mobile app can open; the id lets the read count find every copy.
const hrefFor = (id: string) => `/notifications?announcement=${id}`;

const PUBLISHERS = ['OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'] as const;

/** The programmes and semesters an audience can be drawn from. */
announcementsRouter.get(
  '/programmes',
  requireRole(...PUBLISHERS),
  asyncHandler(async (_req, res) => {
    const programmes = await prisma.programme.findMany({ select: { code: true, shortName: true, name: true }, orderBy: { name: 'asc' } });
    res.json(programmes);
  }),
);

/** How many students an audience reaches, before sending. */
announcementsRouter.post(
  '/audience',
  requireRole(...PUBLISHERS),
  validate('body', audience),
  asyncHandler(async (req, res) => {
    res.json({ students: await prisma.student.count({ where: studentsWhere(req.body as z.infer<typeof audience>) }) });
  }),
);

/**
 * Publishes an announcement to every portal. With `notify`, each student in
 * the audience also gets it as a notification (and so do their parents, who
 * read their ward's notifications), and the read count can be followed.
 */
announcementsRouter.post(
  '/',
  requireRole(...PUBLISHERS),
  validate('body', z.object({
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(3).max(4000),
    scope: z.enum(['UNIVERSITY', 'COLLEGE', 'DEPARTMENT', 'BATCH']).default('UNIVERSITY'),
    urgent: z.boolean().default(false),
    notify: z.boolean().default(true),
    audience: audience.default({ programmeCodes: [], semesters: [] }),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { title: string; body: string; scope: 'UNIVERSITY'; urgent: boolean; notify: boolean; audience: z.infer<typeof audience> };
    const a = await prisma.announcement.create({ data: { title: b.title, body: b.body, scope: b.scope, urgent: b.urgent } });
    let notified = 0;
    if (b.notify) {
      const students = await prisma.student.findMany({ where: studentsWhere(b.audience), select: { id: true } });
      // In batches, so a whole university's roll does not go in one statement.
      for (let i = 0; i < students.length; i += 1000) {
        const chunk = students.slice(i, i + 1000);
        await prisma.notification.createMany({
          data: chunk.map((s) => ({ studentId: s.id, kind: 'GENERAL' as const, title: b.title, body: b.body.length > 280 ? `${b.body.slice(0, 277)}…` : b.body, urgent: b.urgent, href: hrefFor(a.id) })),
        });
      }
      notified = students.length;
    }
    await recordFor(req, { module: 'Communication', action: 'announce', target: a.title, detail: b.notify ? `notified ${notified} student(s)` : 'notice board only' });
    res.status(201).json({ id: a.id, notified });
  }),
);

/** Reach and reads of one announcement's notifications. */
announcementsRouter.get(
  '/:id/stats',
  requireRole(...PUBLISHERS),
  asyncHandler(async (req, res) => {
    const href = hrefFor(String(req.params.id));
    const [targeted, read] = await Promise.all([
      prisma.notification.count({ where: { href } }),
      prisma.notification.count({ where: { href, readAt: { not: null } } }),
    ]);
    res.json({ targeted, read });
  }),
);

/** Withdraws an announcement and the notifications it sent. */
announcementsRouter.delete(
  '/:id',
  requireRole('PRINCIPAL', 'REGISTRAR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const a = await prisma.announcement.findUnique({ where: { id } });
    if (!a) throw ApiError.notFound('No such announcement');
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { href: hrefFor(id) } }),
      prisma.announcement.delete({ where: { id } }),
    ]);
    await recordFor(req, { module: 'Communication', action: 'withdraw', target: a.title, outcome: 'WARN' });
    res.status(204).end();
  }),
);

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, validate, validQuery } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';

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

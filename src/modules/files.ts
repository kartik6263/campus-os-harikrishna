import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { recordFor } from './itconsole/audit.js';

/**
 * Phase 11 — attachments.
 *
 * A file arrives as the raw request body, its name and where it belongs in
 * the query string, and is kept in the database alongside the record it
 * documents — so a backup of the database is a backup of the files.
 */
export const filesRouter = Router();

/** Large enough for a scanned document or a tender pack; small enough for a database row. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

filesRouter.use(requireAuth);

/** Staff may open any attachment; they are the ones who act on them. */
const STAFF_ROLES = ['FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'];
/** Contexts every signed-in user may read: catalogues and notices meant for all. */
const OPEN_PREFIXES = ['campus:', 'public:'];

/**
 * Which uploaders' files this caller may read. `null` means any. A student
 * reads what they uploaded; a parent what they or their ward uploaded — so one
 * student can never open another's Aadhaar card or income certificate.
 */
async function readableUploaders(req: express.Request): Promise<string[] | null> {
  const auth = req.auth!;
  if (STAFF_ROLES.includes(auth.role)) return null;
  if (auth.role === 'PARENT') {
    const wards = await prisma.student.findMany({ where: { guardianId: auth.sub }, select: { userId: true } });
    return [auth.sub, ...wards.map((w) => w.userId).filter((id): id is string => Boolean(id))];
  }
  return [auth.sub];
}

const openContext = (context: string | null) => Boolean(context && OPEN_PREFIXES.some((p) => context.startsWith(p)));

const uploadQuery = z.object({
  name: z.string().min(1).max(200),
  context: z.string().max(200).optional(),
});

filesRouter.post(
  '/',
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  validate('query', uploadQuery),
  asyncHandler(async (req, res) => {
    const { name, context } = validQuery<z.infer<typeof uploadQuery>>(req);
    const bytes = req.body as Buffer;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw ApiError.badRequest('The file is empty');

    const file = await prisma.storedFile.create({
      data: {
        name,
        mime: req.headers['content-type']?.split(';')[0] || 'application/octet-stream',
        size: bytes.length,
        bytes: new Uint8Array(bytes),
        context: context ?? null,
        uploadedById: req.auth!.sub,
      },
      select: { id: true, name: true, mime: true, size: true, context: true, createdAt: true },
    });
    await recordFor(req, { module: 'Files', action: 'Uploaded', target: name, detail: context ?? null });
    res.status(201).json(file);
  }),
);

const listQuery = z.object({ context: z.string().max(200) });

filesRouter.get(
  '/',
  validate('query', listQuery),
  asyncHandler(async (req, res) => {
    const { context } = validQuery<z.infer<typeof listQuery>>(req);
    const uploaders = openContext(context) ? null : await readableUploaders(req);
    const files = await prisma.storedFile.findMany({
      where: { context, ...(uploaders ? { uploadedById: { in: uploaders } } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, mime: true, size: true, context: true, createdAt: true },
    });
    res.json({ files });
  }),
);

filesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await prisma.storedFile.findUnique({ where: { id: String(req.params.id) } });
    if (!file) throw ApiError.notFound('No such file');
    const uploaders = openContext(file.context) ? null : await readableUploaders(req);
    // Not found rather than forbidden, so file ids cannot be probed.
    if (uploaders && !uploaders.includes(file.uploadedById ?? '')) throw ApiError.notFound('No such file');
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.end(Buffer.from(file.bytes));
  }),
);

filesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await prisma.storedFile.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true, uploadedById: true } });
    if (!file) throw ApiError.notFound('No such file');
    const auth = req.auth!;
    if (file.uploadedById !== auth.sub && !['ADMIN', 'REGISTRAR', 'PRINCIPAL'].includes(auth.role)) {
      throw ApiError.forbidden('Only the uploader or an administrator can remove this file');
    }
    await prisma.storedFile.delete({ where: { id: file.id } });
    await recordFor(req, { module: 'Files', action: 'Removed', target: file.name });
    res.status(204).end();
  }),
);

const moveBody = z.object({ context: z.string().min(1).max(200) });

/** Re-files an upload, e.g. a document attached while drafting, once its record exists. */
filesRouter.patch(
  '/:id',
  express.json(),
  validate('body', moveBody),
  asyncHandler(async (req, res) => {
    const file = await prisma.storedFile.findUnique({ where: { id: String(req.params.id) }, select: { id: true, uploadedById: true } });
    if (!file) throw ApiError.notFound('No such file');
    if (file.uploadedById !== req.auth!.sub && !['ADMIN', 'REGISTRAR', 'PRINCIPAL'].includes(req.auth!.role)) {
      throw ApiError.forbidden('Only the uploader or an administrator can move this file');
    }
    const updated = await prisma.storedFile.update({
      where: { id: file.id },
      data: { context: (req.body as z.infer<typeof moveBody>).context },
      select: { id: true, name: true, mime: true, size: true, context: true, createdAt: true },
    });
    res.json(updated);
  }),
);

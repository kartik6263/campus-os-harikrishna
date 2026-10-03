import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, resolveStudentId } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { policyFor, type CollectionPolicy } from './policy.js';

/**
 * Phase 11 — workspace registers.
 *
 * The departmental registers that have no table of their own (hostel,
 * library, grievances, placement, HR, assets, alumni and the rest) are kept
 * here as JSON documents, one collection per register. Access is decided by
 * the collection's namespace (see policy.ts); a student's rows are scoped to
 * that student by the server, whatever the request says.
 *
 * On the demo deployment a register can be filled once with sample rows the
 * screen supplies. Everywhere else that call only marks the register as
 * started, so a real institute's registers begin empty.
 */
export const recordsRouter = Router();

recordsRouter.use(requireAuth);

interface Scope {
  collection: string;
  policy: CollectionPolicy;
  /** The one student this request is confined to, if any. */
  studentId: string | null;
  /** Staff reading every student's rows of a student-scoped register. */
  allStudents: boolean;
  /** Students and parents never see, nor set, a document's `internal…` fields (staff notes). */
  hideInternal: boolean;
}

/** Fields only staff may read or write: any whose name starts with "internal". */
const isInternal = (k: string) => /^internal/.test(k);
function withoutInternal(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !isInternal(k)));
}
function internalOf(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([k]) => isInternal(k)));
}

/** Works out what this caller may do with the named register. */
async function scopeFor(req: Request, mode: 'read' | 'write'): Promise<Scope> {
  const auth = req.auth!;
  const collection = String(req.params.collection);
  const policy = policyFor(collection);
  if (!policy) throw ApiError.notFound(`No register called "${collection}"`);
  if (!policy[mode].includes(auth.role)) {
    throw ApiError.forbidden(`Your role cannot ${mode} the ${collection} register`);
  }

  const hideInternal = auth.role === 'STUDENT' || auth.role === 'PARENT';
  if (!policy.studentScoped) return { collection, policy, studentId: null, allStudents: false, hideInternal };

  if (auth.role === 'STUDENT' || auth.role === 'PARENT') {
    // A parent with one ward needs no ?studentId; resolveStudentId checks guardianship otherwise.
    if (auth.role === 'PARENT' && !req.query.studentId) {
      const ward = await prisma.student.findFirst({ where: { guardianId: auth.sub }, select: { id: true } });
      if (!ward) throw ApiError.forbidden('No student is linked to this parent account');
      return { collection, policy, studentId: ward.id, allStudents: false, hideInternal };
    }
    return { collection, policy, studentId: await resolveStudentId(req), allStudents: false, hideInternal };
  }

  const requested = typeof req.query.studentId === 'string' ? req.query.studentId : null;
  return { collection, policy, studentId: requested, allStudents: !requested, hideInternal };
}

type Row = Awaited<ReturnType<typeof prisma.workspaceRecord.findFirst>> & {};

/** A row as the screens see it: the document, plus a few underscored facts about it. */
async function present(rows: Row[], withStudents: boolean, hideInternal = false) {
  const names = new Map<string, { name: string; enrolmentNo: string }>();
  if (withStudents) {
    const ids = [...new Set(rows.map((r) => r.studentId).filter(Boolean))];
    if (ids.length) {
      const students = await prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, enrolmentNo: true },
      });
      for (const s of students) names.set(s.id, { name: s.name, enrolmentNo: s.enrolmentNo });
    }
  }
  return rows.map((r) => ({
    ...(hideInternal ? withoutInternal(r.data as Record<string, unknown>) : (r.data as Record<string, unknown>)),
    _rid: r.id,
    _key: r.key,
    _studentId: r.studentId || null,
    _student: names.get(r.studentId) ?? null,
    _createdAt: r.createdAt,
    _updatedAt: r.updatedAt,
  }));
}

function whereFor(scope: Scope): Prisma.WorkspaceRecordWhereInput {
  return {
    collection: scope.collection,
    ...(scope.policy.studentScoped && !scope.allStudents ? { studentId: scope.studentId ?? '' } : {}),
  };
}

/** The register-wide or per-student marker that the register has been started. */
const markerFor = (scope: Scope) =>
  scope.policy.studentScoped && scope.studentId ? `${scope.collection}|${scope.studentId}` : scope.collection;

async function list(scope: Scope) {
  const [rows, marker] = await Promise.all([
    prisma.workspaceRecord.findMany({ where: whereFor(scope), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.workspaceCollection.findUnique({ where: { id: markerFor(scope) } }),
  ]);
  return { rows: await present(rows, scope.policy.studentScoped, scope.hideInternal), initialized: Boolean(marker) };
}

/** Strips the underscored, server-owned fields a client may echo back. */
function cleanData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!k.startsWith('_')) out[k] = v;
  return out as Prisma.InputJsonObject;
}

const keyOf = (data: Record<string, unknown>, explicit?: string) => {
  if (explicit) return explicit;
  const id = data.id;
  if (typeof id === 'string' && id) return id;
  if (typeof id === 'number') return String(id);
  return crypto.randomUUID();
};

const label = (collection: string) => collection.replace(/^[a-z]+:/, '').replace(/[._-]/g, ' ');

// ─── Routes ───────────────────────────────────────────────────────────────────

recordsRouter.get(
  '/:collection',
  asyncHandler(async (req, res) => {
    res.json(await list(await scopeFor(req, 'read')));
  }),
);

const initBody = z.object({
  rows: z.array(z.object({ key: z.string().max(200).optional(), data: z.record(z.string(), z.unknown()) })).max(500),
});

recordsRouter.post(
  '/:collection/init',
  validate('body', initBody),
  asyncHandler(async (req, res) => {
    const scope = await scopeFor(req, 'read');
    const { rows } = req.body as z.infer<typeof initBody>;
    const canWrite = scope.policy.write.includes(req.auth!.role);

    // Staff opening every student's view of a student register start it register-wide.
    const marker = markerFor(scope);
    const existing = await prisma.workspaceCollection.findUnique({ where: { id: marker } });

    // On the demo, a reader may start a catalogue too (a student opening the
    // library first); elsewhere only a writer can, and no rows are added.
    if (!existing && (canWrite || env.SEED_DEMO)) {
      await prisma.$transaction(async (tx) => {
        // A unique marker id: of two first visits at once, only one inserts rows.
        const claimed = await tx.workspaceCollection.createMany({ data: [{ id: marker }], skipDuplicates: true });
        if (claimed.count === 0 || !env.SEED_DEMO || rows.length === 0) return;
        // Newest first is how registers read, so the sample rows are dated a
        // millisecond apart to keep the order they were given in.
        const base = Date.now();
        await tx.workspaceRecord.createMany({
          data: rows.map((r, i) => ({
            createdAt: new Date(base - i),
            collection: scope.collection,
            key: keyOf(r.data, r.key),
            studentId: scope.policy.studentScoped ? (scope.studentId ?? '') : '',
            data: cleanData(r.data),
            createdById: req.auth!.sub,
          })),
          skipDuplicates: true,
        });
      });
    }

    res.json(await list(scope));
  }),
);

const createBody = z.object({
  key: z.string().min(1).max(200).optional(),
  data: z.record(z.string(), z.unknown()),
  /** Staff filing on a student's behalf. */
  studentId: z.string().optional(),
});

recordsRouter.post(
  '/:collection',
  validate('body', createBody),
  asyncHandler(async (req, res) => {
    const scope = await scopeFor(req, 'write');
    const body = req.body as z.infer<typeof createBody>;
    let studentId = '';
    if (scope.policy.studentScoped) {
      studentId = scope.studentId ?? body.studentId ?? '';
      if (body.studentId && scope.studentId && body.studentId !== scope.studentId) {
        throw ApiError.forbidden('You can only file records for yourself');
      }
    }
    const key = keyOf(body.data, body.key);
    const data = cleanData(scope.hideInternal ? withoutInternal(body.data) : body.data);

    const clash = await prisma.workspaceRecord.findUnique({
      where: { collection_studentId_key: { collection: scope.collection, studentId, key } },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict(`"${key}" already exists in this register`);

    const row = await prisma.workspaceRecord.create({
      data: { collection: scope.collection, key, studentId, data, createdById: req.auth!.sub },
    });
    await recordFor(req, { module: 'Records', action: `Added to ${label(scope.collection)}`, target: key });
    const [out] = await present([row], scope.policy.studentScoped, scope.hideInternal);
    res.status(201).json(out);
  }),
);

/** The row, provided this caller's scope reaches it. */
async function rowInScope(scope: Scope, id: string) {
  const row = await prisma.workspaceRecord.findFirst({ where: { id, ...whereFor(scope) } });
  if (!row) throw ApiError.notFound('No such record in this register');
  return row;
}

const updateBody = z.object({
  data: z.record(z.string(), z.unknown()),
  /** true: the fields given are merged over the stored document rather than replacing it. */
  merge: z.boolean().optional(),
});

recordsRouter.patch(
  '/:collection/:id',
  validate('body', updateBody),
  asyncHandler(async (req, res) => {
    const scope = await scopeFor(req, 'write');
    const row = await rowInScope(scope, String(req.params.id));
    const body = req.body as z.infer<typeof updateBody>;
    const stored = row.data as Record<string, unknown>;
    // A student's edit can neither see nor overwrite staff-only fields; they are carried over as stored.
    const given = scope.hideInternal ? { ...withoutInternal(body.data), ...internalOf(stored) } : body.data;
    const data = body.merge ? cleanData({ ...stored, ...given }) : cleanData(given);

    const updated = await prisma.workspaceRecord.update({ where: { id: row.id }, data: { data } });
    await recordFor(req, { module: 'Records', action: `Updated in ${label(scope.collection)}`, target: row.key });
    const [out] = await present([updated], scope.policy.studentScoped, scope.hideInternal);
    res.json(out);
  }),
);

recordsRouter.delete(
  '/:collection/:id',
  asyncHandler(async (req, res) => {
    const scope = await scopeFor(req, 'write');
    const row = await rowInScope(scope, String(req.params.id));
    await prisma.workspaceRecord.delete({ where: { id: row.id } });
    await recordFor(req, { module: 'Records', action: `Removed from ${label(scope.collection)}`, target: row.key });
    res.status(204).end();
  }),
);

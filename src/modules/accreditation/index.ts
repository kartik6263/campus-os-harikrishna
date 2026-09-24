import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { requirePermission } from '../itconsole/permissions.js';
import { DERIVATIONS, isKnownDerivation, runDerivations } from './derivations.js';

/**
 * Phase 6 — accreditation.
 *
 * A register of what NAAC, NIRF, AISHE and the UGC ask, where every metric
 * says where its answer comes from: computed from the college's own records,
 * typed in because the system does not hold it, or not answerable at all.
 * The third of those is the useful one — a readiness figure that counts the
 * gaps is worth more than a file that hides them.
 */
export const accreditationRouter = Router();

accreditationRouter.use(requireAuth);
accreditationRouter.use(requireRole('PRINCIPAL', 'REGISTRAR', 'ADMIN'));
accreditationRouter.use(requirePermission('Accreditation'));

async function resolveCollegeId(req: Request): Promise<string> {
  const auth = req.auth!;
  const faculty = await prisma.faculty.findUnique({
    where: { userId: auth.sub },
    select: { collegeId: true },
  });
  if (faculty) return faculty.collegeId;

  const staff = await prisma.officeStaff.findUnique({
    where: { userId: auth.sub },
    select: { collegeId: true },
  });
  if (staff) return staff.collegeId;

  const first = await prisma.college.findFirst({ select: { id: true } });
  if (!first) throw ApiError.notFound('No college on record');
  return first.id;
}

/** Who a hand-entered figure is recorded against. */
async function resolveSignatoryId(req: Request): Promise<string | null> {
  const faculty = await prisma.faculty.findUnique({
    where: { userId: req.auth!.sub },
    select: { id: true },
  });
  return faculty?.id ?? null;
}

// ─── GET /api/accreditation/frameworks ────────────────────────────────────────

accreditationRouter.get(
  '/frameworks',
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);

    const frameworks = await prisma.accreditationFramework.findMany({
      include: { metrics: { select: { source: true, maxScore: true, enteredScore: true } } },
      orderBy: { code: 'asc' },
    });

    const returns = await prisma.statutoryReturn.findMany({
      where: { collegeId },
      select: { frameworkId: true, dueOn: true, submittedOn: true },
    });

    res.json(
      frameworks.map((f) => {
        const answerable = f.metrics.filter((m) => m.source !== 'UNAVAILABLE').length;
        const own = returns.filter((r) => r.frameworkId === f.id);
        return {
          id: f.id,
          code: f.code,
          name: f.name,
          description: f.description,
          maxScore: f.maxScore,
          metrics: f.metrics.length,
          derived: f.metrics.filter((m) => m.source === 'DERIVED').length,
          entered: f.metrics.filter((m) => m.source === 'ENTERED').length,
          unavailable: f.metrics.filter((m) => m.source === 'UNAVAILABLE').length,
          // Null, not zero, for a framework that asks no metrics — UGC is a
          // returns calendar, and drawing it as 0% ready misreads it.
          readiness:
            f.metrics.length === 0
              ? null
              : Number(((answerable / f.metrics.length) * 100).toFixed(1)),
          returns: {
            total: own.length,
            submitted: own.filter((r) => r.submittedOn).length,
            overdue: own.filter((r) => !r.submittedOn && r.dueOn.getTime() < Date.now()).length,
          },
        };
      }),
    );
  }),
);

// ─── GET /api/accreditation/:code/metrics ─────────────────────────────────────

/**
 * The register for one framework, with every derived answer computed now.
 *
 * A derived metric carries the basis it was computed from, because the first
 * question an assessor asks is never the number — it is where the number came
 * from.
 */
accreditationRouter.get(
  '/:code/metrics',
  validate('params', z.object({ code: z.string().min(1) })),
  validate('query', z.object({ criterion: z.coerce.number().int().optional() })),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const { code } = req.params as { code: string };
    const criterion = typeof req.query.criterion === 'string' ? Number(req.query.criterion) : undefined;

    const framework = await prisma.accreditationFramework.findUnique({
      where: { code },
      include: {
        metrics: {
          where: criterion ? { criterion } : {},
          include: { updatedBy: { select: { name: true } } },
          orderBy: [{ criterion: 'asc' }, { code: 'asc' }],
        },
      },
    });

    if (!framework) throw ApiError.notFound(`No framework with code ${code}`);

    const derived = await runDerivations(
      framework.metrics.map((m) => m.derivedFrom ?? ''),
      collegeId,
    );

    const rows = framework.metrics.map((m) => {
      const computed = m.source === 'DERIVED' ? derived.get(m.derivedFrom ?? '') : undefined;

      return {
        id: m.id,
        code: m.code,
        criterion: m.criterion,
        criterionTitle: m.criterionTitle,
        title: m.title,
        description: m.description,
        target: m.target,
        maxScore: m.maxScore,
        source: m.source,
        derivedFrom: m.derivedFrom,
        // One field the screen reads, whichever way the answer was reached.
        value: m.source === 'DERIVED' ? (computed?.value ?? '—') : m.enteredValue,
        numeric: m.source === 'DERIVED' ? (computed?.numeric ?? null) : null,
        score: m.enteredScore,
        basis:
          m.source === 'DERIVED'
            ? (computed?.basis ?? 'No computation is registered under that name')
            : m.source === 'ENTERED'
              ? `Entered by ${m.updatedBy?.name ?? 'staff'}`
              : 'Nothing in the system answers this yet',
        evidence: m.evidence,
        remarks: m.remarks,
        updatedBy: m.updatedBy?.name ?? null,
        updatedAt: m.updatedAt,
        // A derived metric with no answer is a gap the register should show.
        answered:
          m.source === 'DERIVED'
            ? (computed?.value ?? '—') !== '—'
            : m.source === 'ENTERED'
              ? !!m.enteredValue
              : false,
      };
    });

    const criteria = [...new Set(rows.map((r) => r.criterion).filter((c): c is number => c !== null))]
      .sort((a, b) => a - b)
      .map((n) => ({
        criterion: n,
        title: rows.find((r) => r.criterion === n)?.criterionTitle ?? '',
        metrics: rows.filter((r) => r.criterion === n).length,
        answered: rows.filter((r) => r.criterion === n && r.answered).length,
      }));

    res.json({
      framework: {
        id: framework.id,
        code: framework.code,
        name: framework.name,
        description: framework.description,
        maxScore: framework.maxScore,
      },
      totals: {
        metrics: rows.length,
        answered: rows.filter((r) => r.answered).length,
        derived: rows.filter((r) => r.source === 'DERIVED').length,
        entered: rows.filter((r) => r.source === 'ENTERED').length,
        unavailable: rows.filter((r) => r.source === 'UNAVAILABLE').length,
        withEvidence: rows.filter((r) => !!r.evidence).length,
        readiness:
          rows.length === 0
            ? null
            : Number(((rows.filter((r) => r.answered).length / rows.length) * 100).toFixed(1)),
        score: rows.reduce((sum, r) => sum + (r.score ?? 0), 0),
      },
      criteria,
      metrics: rows,
    });
  }),
);

// ─── PATCH /api/accreditation/metrics/:id ─────────────────────────────────────

/**
 * Records an answer, or attaches the evidence for one.
 *
 * A derived metric cannot be hand-entered: typing over a figure the system
 * computes is exactly how a file stops matching the records behind it. Its
 * evidence and remarks can still be attached, because those are the things
 * the computation cannot supply.
 */
accreditationRouter.patch(
  '/metrics/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z
      .object({
        value: z.string().max(200).optional(),
        score: z.number().min(0).optional(),
        evidence: z.string().max(300).optional(),
        remarks: z.string().max(500).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' }),
  ),
  asyncHandler(async (req, res) => {
    const updatedById = await resolveSignatoryId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { value?: string; score?: number; evidence?: string; remarks?: string };

    const metric = await prisma.accreditationMetric.findUnique({ where: { id } });
    if (!metric) throw ApiError.notFound('No such metric');

    if (metric.source === 'DERIVED' && (body.value !== undefined || body.score !== undefined)) {
      throw ApiError.badRequest(
        `${metric.code} is computed from the records (${metric.derivedFrom}); its value cannot be typed in`,
        { derivedFrom: metric.derivedFrom },
      );
    }

    if (metric.maxScore !== null && body.score !== undefined && body.score > metric.maxScore) {
      throw ApiError.badRequest(`${metric.code} is out of ${metric.maxScore}`);
    }

    const updated = await prisma.accreditationMetric.update({
      where: { id },
      data: {
        ...(body.value !== undefined ? { enteredValue: body.value, source: 'ENTERED' as const } : {}),
        ...(body.score !== undefined ? { enteredScore: body.score } : {}),
        ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
        ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
        updatedById,
      },
      include: { updatedBy: { select: { name: true } } },
    });

    res.json({
      id: updated.id,
      code: updated.code,
      source: updated.source,
      value: updated.source === 'DERIVED' ? null : updated.enteredValue,
      score: updated.enteredScore,
      evidence: updated.evidence,
      remarks: updated.remarks,
      updatedBy: updated.updatedBy?.name ?? null,
      updatedAt: updated.updatedAt,
    });
  }),
);

// ─── GET /api/accreditation/derivations ───────────────────────────────────────

/** What the register knows how to compute, and what currently uses each one. */
accreditationRouter.get(
  '/derivations',
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const keys = Object.keys(DERIVATIONS);
    const results = await runDerivations(keys, collegeId);

    const used = await prisma.accreditationMetric.findMany({
      where: { derivedFrom: { in: keys } },
      select: { derivedFrom: true, code: true, framework: { select: { code: true } } },
    });

    res.json(
      keys.map((key) => ({
        key,
        value: results.get(key)?.value ?? '—',
        numeric: results.get(key)?.numeric ?? null,
        basis: results.get(key)?.basis ?? '',
        usedBy: used
          .filter((u) => u.derivedFrom === key)
          .map((u) => `${u.framework.code} ${u.code}`),
      })),
    );
  }),
);

// ─── GET /api/accreditation/returns ───────────────────────────────────────────

/** The statutory calendar. Overdue is read off the date, never stored. */
accreditationRouter.get(
  '/returns',
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);

    const returns = await prisma.statutoryReturn.findMany({
      where: { collegeId },
      include: { framework: { select: { code: true, name: true } } },
      orderBy: { dueOn: 'asc' },
    });

    const rows = returns.map((r) => {
      const daysLeft = Math.ceil((r.dueOn.getTime() - Date.now()) / 86_400_000);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        framework: r.framework.code,
        dueOn: r.dueOn,
        submittedOn: r.submittedOn,
        reference: r.reference,
        remarks: r.remarks,
        status: r.submittedOn ? 'submitted' : daysLeft < 0 ? 'overdue' : 'pending',
        daysLeft: r.submittedOn ? null : daysLeft,
      };
    });

    res.json({
      totals: {
        total: rows.length,
        submitted: rows.filter((r) => r.status === 'submitted').length,
        pending: rows.filter((r) => r.status === 'pending').length,
        overdue: rows.filter((r) => r.status === 'overdue').length,
      },
      returns: rows,
    });
  }),
);

// ─── POST /api/accreditation/returns/:code/submit ─────────────────────────────

/** Records a return as filed, against the acknowledgement it came back with. */
accreditationRouter.post(
  '/returns/:code/submit',
  validate('params', z.object({ code: z.string().min(1) })),
  validate(
    'body',
    z.object({
      reference: z.string().min(3).max(120),
      submittedOn: z.string().date().optional(),
      remarks: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { code } = req.params as { code: string };
    const body = req.body as { reference: string; submittedOn?: string; remarks?: string };

    const existing = await prisma.statutoryReturn.findUnique({ where: { code } });
    if (!existing) throw ApiError.notFound(`No return with code ${code}`);
    if (existing.submittedOn) {
      throw ApiError.conflict(`${code} was already filed on ${existing.submittedOn.toDateString()}`, {
        reference: existing.reference,
      });
    }

    const submittedOn = body.submittedOn
      ? new Date(`${body.submittedOn}T00:00:00.000Z`)
      : new Date();

    const updated = await prisma.statutoryReturn.update({
      where: { code },
      data: { submittedOn, reference: body.reference, remarks: body.remarks ?? existing.remarks },
    });

    res.json({
      code: updated.code,
      name: updated.name,
      submittedOn: updated.submittedOn,
      reference: updated.reference,
      // Filed after the date is still filed, and the file should say so.
      late: updated.submittedOn! > updated.dueOn,
      status: 'submitted',
    });
  }),
);

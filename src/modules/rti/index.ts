import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { requirePermission } from '../itconsole/permissions.js';
import { recordFor } from '../itconsole/audit.js';

/**
 * Phase 8 — right to information.
 *
 * The Act sets the shape of this, not the office: thirty days to reply, five
 * to transfer an application held elsewhere, thirty to appeal. Those clocks
 * are computed from the dates on every read, never stored, so a row cannot
 * claim to be on time after it has run out. Information may be refused only
 * on a clause of Section 8, cited by name.
 */
export const rtiRouter = Router();

rtiRouter.use(requireAuth);
rtiRouter.use(requireRole('PRINCIPAL', 'REGISTRAR', 'ADMIN'));
rtiRouter.use(requirePermission('RTI'));

/** Days the Act allows, from the date of receipt. */
export const STATUTORY_DAYS = 30;
/** Days to pass an application to the authority that actually holds it. */
export const TRANSFER_DAYS = 5;
/** Days after a decision — or a deemed refusal — in which an appeal lies. */
export const APPEAL_DAYS = 30;

/**
 * The exemptions of Section 8(1), which are the only grounds for refusing.
 *
 * Quoting the clause is the requirement: a refusal that does not say which
 * exemption it rests on is not a refusal the Act recognises.
 */
export const EXEMPTIONS: Record<string, string> = {
  '8(1)(a)': 'Prejudicial to the sovereignty and integrity of India, security, or foreign relations',
  '8(1)(b)': 'Expressly forbidden to be published by a court or tribunal',
  '8(1)(c)': 'Would cause a breach of privilege of Parliament or a State Legislature',
  '8(1)(d)': 'Commercial confidence, trade secrets or intellectual property',
  '8(1)(e)': 'Available to a person in their fiduciary relationship',
  '8(1)(f)': 'Received in confidence from a foreign government',
  '8(1)(g)': 'Would endanger the life or physical safety of any person',
  '8(1)(h)': 'Would impede the process of investigation or prosecution',
  '8(1)(i)': 'Cabinet papers, including deliberations of Council of Ministers',
  '8(1)(j)': 'Personal information with no relationship to any public activity',
};

async function resolveCollegeId(req: Request): Promise<string> {
  const faculty = await prisma.faculty.findUnique({
    where: { userId: req.auth!.sub },
    select: { collegeId: true },
  });
  if (faculty) return faculty.collegeId;

  const staff = await prisma.officeStaff.findUnique({
    where: { userId: req.auth!.sub },
    select: { collegeId: true },
  });
  if (staff) return staff.collegeId;

  const first = await prisma.college.findFirst({ select: { id: true } });
  if (!first) throw ApiError.notFound('No college on record');
  return first.id;
}

async function resolveStaffId(req: Request): Promise<string | null> {
  const staff = await prisma.officeStaff.findUnique({
    where: { userId: req.auth!.sub },
    select: { id: true },
  });
  return staff?.id ?? null;
}

const addDays = (from: Date, n: number) => new Date(from.getTime() + n * 86_400_000);
const daysUntil = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86_400_000);

/** Which statuses mean the office has answered, one way or the other. */
const ANSWERED = new Set(['REPLIED', 'REJECTED', 'TRANSFERRED', 'CLOSED']);

/**
 * Works out where an application stands against the Act's clock.
 *
 * A lapsed period with no answer is a *deemed refusal* — the Act treats
 * silence as a decision, and an appeal lies against it — so the register says
 * so rather than leaving the row looking merely late.
 */
function clock(app: {
  receivedOn: Date;
  status: string;
  repliedOn: Date | null;
  rejectedOn: Date | null;
}) {
  const deadline = addDays(app.receivedOn, STATUTORY_DAYS);
  const answered = ANSWERED.has(app.status) || app.status.endsWith('APPEAL');
  const answeredOn = app.repliedOn ?? app.rejectedOn;
  const daysRemaining = daysUntil(deadline);

  return {
    deadline,
    daysRemaining: answered ? 0 : daysRemaining,
    overdue: !answered && daysRemaining < 0,
    // Silence past the period is a refusal in law, not merely a delay.
    deemedRefusal: !answered && daysRemaining < 0,
    answeredLate: !!answeredOn && answeredOn > deadline,
    transferWindowClosed: daysUntil(addDays(app.receivedOn, TRANSFER_DAYS)) < 0,
  };
}

const INCLUDE = {
  pio: { select: { id: true, name: true, designation: true } },
  appeals: {
    include: { decidedBy: { select: { name: true } } },
    orderBy: { filedOn: 'asc' as const },
  },
};

function present(app: Parameters<typeof clock>[0] & {
  id: string;
  applicationNo: string;
  applicantName: string;
  applicantAddress: string | null;
  applicantEmail: string | null;
  subject: string;
  particulars: string;
  category: string;
  bplExempt: boolean;
  feePaid: boolean;
  assignedAt: Date | null;
  replyText: string | null;
  pagesSupplied: number | null;
  additionalFee: number | null;
  rejectionGrounds: string[];
  rejectionReason: string | null;
  transferredTo: string | null;
  transferredOn: Date | null;
  pio: { id: string; name: string; designation: string } | null;
  appeals: Array<{
    id: string; appealNo: string; tier: string; filedOn: Date; deemedRefusal: boolean;
    grounds: string; outcome: string; decidedOn: Date | null; decision: string | null;
    decidedBy: { name: string } | null;
  }>;
}) {
  const c = clock(app);

  return {
    id: app.id,
    applicationNo: app.applicationNo,
    applicantName: app.applicantName,
    applicantAddress: app.applicantAddress,
    applicantEmail: app.applicantEmail,
    subject: app.subject,
    particulars: app.particulars,
    category: app.category,
    receivedOn: app.receivedOn,
    bplExempt: app.bplExempt,
    feePaid: app.feePaid,
    status: app.status,
    pio: app.pio,
    assignedAt: app.assignedAt,
    repliedOn: app.repliedOn,
    replyText: app.replyText,
    pagesSupplied: app.pagesSupplied,
    additionalFee: app.additionalFee,
    rejectedOn: app.rejectedOn,
    rejectionGrounds: app.rejectionGrounds.map((g) => ({ clause: g, text: EXEMPTIONS[g] ?? null })),
    rejectionReason: app.rejectionReason,
    transferredTo: app.transferredTo,
    transferredOn: app.transferredOn,
    ...c,
    appeals: app.appeals.map((a) => ({
      id: a.id,
      appealNo: a.appealNo,
      tier: a.tier,
      filedOn: a.filedOn,
      deemedRefusal: a.deemedRefusal,
      grounds: a.grounds,
      outcome: a.outcome,
      decidedOn: a.decidedOn,
      decision: a.decision,
      decidedBy: a.decidedBy?.name ?? null,
    })),
  };
}

// ─── GET /api/rti/exemptions ──────────────────────────────────────────────────

/** The clauses a refusal may rest on. */
rtiRouter.get(
  '/exemptions',
  asyncHandler(async (_req, res) => {
    res.json({
      statutoryDays: STATUTORY_DAYS,
      transferDays: TRANSFER_DAYS,
      appealDays: APPEAL_DAYS,
      exemptions: Object.entries(EXEMPTIONS).map(([clause, text]) => ({ clause, text })),
    });
  }),
);

// ─── GET /api/rti/applications ────────────────────────────────────────────────

rtiRouter.get(
  '/applications',
  validate(
    'query',
    z.object({
      status: z
        .enum(['RECEIVED', 'ASSIGNED', 'UNDER_PROCESS', 'REPLIED', 'REJECTED', 'TRANSFERRED', 'FIRST_APPEAL', 'CIC_APPEAL', 'CLOSED'])
        .optional(),
      overdue: z.coerce.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const overdueOnly = req.query.overdue === 'true';

    const apps = await prisma.rtiApplication.findMany({
      where: { collegeId, ...(status ? { status: status as 'RECEIVED' } : {}) },
      include: INCLUDE,
      orderBy: { receivedOn: 'asc' },
    });

    const rows = apps.map(present).filter((r) => (overdueOnly ? r.overdue : true));

    res.json({
      statutoryDays: STATUTORY_DAYS,
      totals: {
        total: rows.length,
        open: rows.filter((r) => !ANSWERED.has(r.status)).length,
        overdue: rows.filter((r) => r.overdue).length,
        deemedRefusals: rows.filter((r) => r.deemedRefusal).length,
        underAppeal: rows.filter((r) => r.status.endsWith('APPEAL')).length,
        answeredLate: rows.filter((r) => r.answeredLate).length,
      },
      applications: rows,
    });
  }),
);

// ─── POST /api/rti/applications ───────────────────────────────────────────────

/**
 * Registers an application.
 *
 * The fee is ten rupees unless the applicant is below the poverty line, in
 * which case the Act exempts them — so a paid flag and an exemption are two
 * different things and the register keeps both.
 */
rtiRouter.post(
  '/applications',
  validate(
    'body',
    z
      .object({
        applicantName: z.string().min(2).max(160),
        applicantAddress: z.string().max(400).optional(),
        applicantEmail: z.string().email().optional(),
        subject: z.string().min(5).max(300),
        particulars: z.string().min(10).max(4000),
        category: z.string().min(2).max(60),
        bplExempt: z.boolean().default(false),
        feePaid: z.boolean().default(false),
        receivedOn: z.string().date().optional(),
      })
      .refine((v) => v.bplExempt || v.feePaid, {
        message: 'An application needs the fee paid, or the exemption claimed',
        path: ['feePaid'],
      }),
  ),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const body = req.body as {
      applicantName: string; applicantAddress?: string; applicantEmail?: string;
      subject: string; particulars: string; category: string;
      bplExempt: boolean; feePaid: boolean; receivedOn?: string;
    };

    const year = new Date().getFullYear();
    const prefix = `RTI/${year}/`;
    const existing = await prisma.rtiApplication.findMany({
      where: { applicationNo: { startsWith: prefix } },
      select: { applicationNo: true },
    });
    const highest = existing.reduce((max, a) => {
      const tail = Number(a.applicationNo.slice(prefix.length));
      return Number.isFinite(tail) && tail > max ? tail : max;
    }, 0);

    const receivedOn = body.receivedOn
      ? new Date(`${body.receivedOn}T00:00:00.000Z`)
      : new Date();

    const created = await prisma.rtiApplication.create({
      data: {
        applicationNo: `${prefix}${String(highest + 1).padStart(4, '0')}`,
        applicantName: body.applicantName,
        applicantAddress: body.applicantAddress ?? null,
        applicantEmail: body.applicantEmail ?? null,
        subject: body.subject,
        particulars: body.particulars,
        category: body.category,
        bplExempt: body.bplExempt,
        feePaid: body.feePaid,
        receivedOn,
        collegeId,
      },
      include: INCLUDE,
    });

    res.status(201).json(present(created));
  }),
);

// ─── POST /api/rti/applications/:id/assign ────────────────────────────────────

/** Puts the application on a named public information officer. */
rtiRouter.post(
  '/applications/:id/assign',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ pioEmployeeId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { pioEmployeeId } = req.body as { pioEmployeeId: string };

    const app = await prisma.rtiApplication.findUnique({ where: { id } });
    if (!app) throw ApiError.notFound('No such application');
    if (ANSWERED.has(app.status)) {
      throw ApiError.conflict(`That application is already ${app.status.toLowerCase()}`);
    }

    const pio = await prisma.officeStaff.findUnique({ where: { employeeId: pioEmployeeId } });
    if (!pio) throw ApiError.notFound(`No staff member with employee id ${pioEmployeeId}`);

    const updated = await prisma.rtiApplication.update({
      where: { id },
      data: { pioId: pio.id, assignedAt: new Date(), status: 'ASSIGNED' },
      include: INCLUDE,
    });

    res.json(present(updated));
  }),
);

// ─── POST /api/rti/applications/:id/reply ─────────────────────────────────────

/**
 * Supplies the information.
 *
 * Replying after the period has run is still a reply — the Act does not let
 * an authority off, but it does not stop them answering either — so it is
 * recorded, and the row says it was late.
 */
rtiRouter.post(
  '/applications/:id/reply',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      replyText: z.string().min(10).max(8000),
      pagesSupplied: z.number().int().min(0).max(10000).default(0),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { replyText: string; pagesSupplied: number };

    const app = await prisma.rtiApplication.findUnique({ where: { id } });
    if (!app) throw ApiError.notFound('No such application');
    if (ANSWERED.has(app.status)) {
      throw ApiError.conflict(`That application is already ${app.status.toLowerCase()}`);
    }
    if (!app.pioId) {
      throw ApiError.badRequest('Assign a public information officer before replying');
    }

    // Two rupees a page beyond the first, as the rules prescribe; a person
    // below the poverty line pays nothing.
    const additionalFee = app.bplExempt ? 0 : Math.max(0, body.pagesSupplied) * 2;

    const updated = await prisma.rtiApplication.update({
      where: { id },
      data: {
        status: 'REPLIED',
        repliedOn: new Date(),
        replyText: body.replyText,
        pagesSupplied: body.pagesSupplied,
        additionalFee,
      },
      include: INCLUDE,
    });

    res.json(present(updated));
  }),
);

// ─── POST /api/rti/applications/:id/reject ────────────────────────────────────

/**
 * Refuses the information.
 *
 * Only on a clause of Section 8, and the clause must be one the Act actually
 * contains — a refusal resting on nothing is not a refusal the Act
 * recognises, and the applicant cannot appeal what was never stated.
 */
rtiRouter.post(
  '/applications/:id/reject',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      grounds: z.array(z.string().min(3)).min(1, 'Cite at least one clause of Section 8'),
      reason: z.string().min(10).max(2000),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { grounds: string[]; reason: string };

    const app = await prisma.rtiApplication.findUnique({ where: { id } });
    if (!app) throw ApiError.notFound('No such application');
    if (ANSWERED.has(app.status)) {
      throw ApiError.conflict(`That application is already ${app.status.toLowerCase()}`);
    }

    const unknown = body.grounds.filter((g) => !(g in EXEMPTIONS));
    if (unknown.length > 0) {
      throw ApiError.badRequest('Those are not exemptions the Act contains', {
        unknown,
        valid: Object.keys(EXEMPTIONS),
      });
    }

    const updated = await prisma.rtiApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedOn: new Date(),
        rejectionGrounds: body.grounds,
        rejectionReason: body.reason,
      },
      include: INCLUDE,
    });

    // Withholding information is exactly what a citizen may later ask about.
    await recordFor(req, {
      module: 'RTI',
      action: 'edit',
      target: updated.applicationNo,
      detail: `Refused under ${body.grounds.join(', ')}`,
      outcome: 'WARN',
    });

    res.json(present(updated));
  }),
);

// ─── POST /api/rti/applications/:id/transfer ──────────────────────────────────

/**
 * Passes an application to the authority that holds the information.
 *
 * Section 6(3) allows five days for this, and the register refuses it after
 * that — a transfer made late is the applicant's time spent for nothing.
 */
rtiRouter.post(
  '/applications/:id/transfer',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ authority: z.string().min(3).max(200), reason: z.string().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { authority: string; reason?: string };

    const app = await prisma.rtiApplication.findUnique({ where: { id } });
    if (!app) throw ApiError.notFound('No such application');
    if (ANSWERED.has(app.status)) {
      throw ApiError.conflict(`That application is already ${app.status.toLowerCase()}`);
    }

    const c = clock(app);
    if (c.transferWindowClosed) {
      throw ApiError.badRequest(
        `Section 6(3) allows ${TRANSFER_DAYS} days to transfer an application; that window has closed`,
      );
    }

    const updated = await prisma.rtiApplication.update({
      where: { id },
      data: {
        status: 'TRANSFERRED',
        transferredTo: body.authority,
        transferredOn: new Date(),
        rejectionReason: body.reason ?? null,
      },
      include: INCLUDE,
    });

    res.json(present(updated));
  }),
);

// ─── POST /api/rti/applications/:id/appeals ───────────────────────────────────

/**
 * Files an appeal.
 *
 * A first appeal lies against a decision *or* against silence past the
 * statutory period — the Act treats that silence as a refusal, so an
 * applicant is not left without a remedy when nobody answers. A second appeal
 * to the Commission lies only once the first has been decided.
 */
rtiRouter.post(
  '/applications/:id/appeals',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      tier: z.enum(['FIRST', 'CIC']),
      grounds: z.string().min(10).max(2000),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { tier: 'FIRST' | 'CIC'; grounds: string };

    const app = await prisma.rtiApplication.findUnique({
      where: { id },
      include: { appeals: true },
    });
    if (!app) throw ApiError.notFound('No such application');

    // Asked and answered first: once an appeal of this tier exists, "you
    // already filed one" is the true answer, and telling the applicant no
    // appeal lies would be plainly wrong.
    const existing = app.appeals.find((a) => a.tier === body.tier);
    if (existing) {
      throw ApiError.conflict(`A ${body.tier.toLowerCase()} appeal has already been filed`, {
        appealNo: existing.appealNo,
      });
    }

    const c = clock(app);
    const decided = app.status === 'REPLIED' || app.status === 'REJECTED';

    if (body.tier === 'FIRST') {
      if (!decided && !c.deemedRefusal) {
        throw ApiError.badRequest(
          `An appeal lies against a decision, or against silence past ${STATUTORY_DAYS} days. This application is neither yet.`,
          { daysRemaining: c.daysRemaining },
        );
      }
    } else {
      const first = app.appeals.find((a) => a.tier === 'FIRST');
      if (!first) throw ApiError.badRequest('A second appeal lies only after a first appeal');
      if (first.outcome === 'PENDING') {
        throw ApiError.badRequest('The first appeal has not been decided yet');
      }
    }

    const year = new Date().getFullYear();
    const prefix = `${body.tier === 'FIRST' ? 'FA' : 'CIC'}/${year}/`;
    const all = await prisma.rtiAppeal.findMany({
      where: { appealNo: { startsWith: prefix } },
      select: { appealNo: true },
    });
    const highest = all.reduce((max, a) => {
      const tail = Number(a.appealNo.slice(prefix.length));
      return Number.isFinite(tail) && tail > max ? tail : max;
    }, 0);

    const [appeal] = await prisma.$transaction([
      prisma.rtiAppeal.create({
        data: {
          appealNo: `${prefix}${String(highest + 1).padStart(4, '0')}`,
          applicationId: id,
          tier: body.tier,
          grounds: body.grounds,
          // Recorded on the appeal, because it is the ground it rests on.
          deemedRefusal: body.tier === 'FIRST' && !decided && c.deemedRefusal,
        },
      }),
      prisma.rtiApplication.update({
        where: { id },
        data: { status: body.tier === 'FIRST' ? 'FIRST_APPEAL' : 'CIC_APPEAL' },
      }),
    ]);

    res.status(201).json({
      id: appeal.id,
      appealNo: appeal.appealNo,
      applicationNo: app.applicationNo,
      tier: appeal.tier,
      filedOn: appeal.filedOn,
      deemedRefusal: appeal.deemedRefusal,
      outcome: appeal.outcome,
    });
  }),
);

// ─── POST /api/rti/appeals/:id/decide ─────────────────────────────────────────

rtiRouter.post(
  '/appeals/:id/decide',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      outcome: z.enum(['UPHELD', 'ALLOWED', 'PARTIALLY_ALLOWED']),
      decision: z.string().min(10).max(4000),
    }),
  ),
  asyncHandler(async (req, res) => {
    const decidedById = await resolveStaffId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { outcome: 'UPHELD' | 'ALLOWED' | 'PARTIALLY_ALLOWED'; decision: string };

    const appeal = await prisma.rtiAppeal.findUnique({
      where: { id },
      include: { application: { select: { id: true, applicationNo: true } } },
    });
    if (!appeal) throw ApiError.notFound('No such appeal');
    if (appeal.outcome !== 'PENDING') {
      throw ApiError.conflict(`That appeal was already ${appeal.outcome.toLowerCase()}`);
    }

    const [updated] = await prisma.$transaction([
      prisma.rtiAppeal.update({
        where: { id },
        data: {
          outcome: body.outcome,
          decision: body.decision,
          decidedOn: new Date(),
          decidedById,
        },
        include: { decidedBy: { select: { name: true } } },
      }),
      // An appeal that succeeds puts the application back on the officer; one
      // that fails closes it.
      prisma.rtiApplication.update({
        where: { id: appeal.applicationId },
        data: {
          status: body.outcome === 'UPHELD' ? 'CLOSED' : 'UNDER_PROCESS',
          ...(body.outcome !== 'UPHELD'
            ? { repliedOn: null, rejectedOn: null, rejectionGrounds: [], rejectionReason: null }
            : {}),
        },
      }),
    ]);

    res.json({
      id: updated.id,
      appealNo: updated.appealNo,
      applicationNo: appeal.application.applicationNo,
      tier: updated.tier,
      outcome: updated.outcome,
      decision: updated.decision,
      decidedOn: updated.decidedOn,
      decidedBy: updated.decidedBy?.name ?? null,
      // What the application now needs, in plain terms.
      applicationStatus: body.outcome === 'UPHELD' ? 'CLOSED' : 'UNDER_PROCESS',
    });
  }),
);

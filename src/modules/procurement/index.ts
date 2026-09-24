import { Router } from 'express';
import { institutionCode } from '../institution.js';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { requirePermission } from '../itconsole/permissions.js';
import { recordFor } from '../itconsole/audit.js';

/**
 * Phase 7 — procurement.
 *
 * Vendor empanelment, two-envelope tendering, award, and the purchase order
 * through to payment. The stages run one way and each is gated on the one
 * before, because that order is the control: a tender floated without
 * sanction, a financial envelope opened before the technical stage closes, or
 * a bill passed on goods nobody inspected are each a way money leaves without
 * anyone having decided it should.
 */
export const procurementRouter = Router();

procurementRouter.use(requireAuth);
procurementRouter.use(requireRole('PRINCIPAL', 'REGISTRAR', 'ADMIN'));
procurementRouter.use(requirePermission('Procurement'));

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

async function resolveSignatoryId(req: Request): Promise<string> {
  const faculty = await prisma.faculty.findUnique({
    where: { userId: req.auth!.sub },
    select: { id: true },
  });
  if (faculty) return faculty.id;

  const requested = typeof req.query.facultyId === 'string' ? req.query.facultyId : undefined;
  if (req.auth!.role === 'ADMIN' && requested) {
    const exists = await prisma.faculty.findUnique({ where: { id: requested }, select: { id: true } });
    if (exists) return exists.id;
  }
  throw ApiError.forbidden('This account has no faculty record to sign as');
}

/** Next number in a series. */
function nextInSeries(prefix: string, existing: string[], width = 3): string {
  const highest = existing.reduce((max, no) => {
    const tail = Number(no.slice(prefix.length));
    return Number.isFinite(tail) && tail > max ? tail : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}

// ═══ Vendors ═════════════════════════════════════════════════════════════════

const VENDOR_STATUS = z.enum(['PENDING', 'EMPANELLED', 'BLACKLISTED', 'SUSPENDED']);

// ─── GET /api/procurement/vendors ─────────────────────────────────────────────

procurementRouter.get(
  '/vendors',
  validate('query', z.object({ status: VENDOR_STATUS.optional(), category: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;

    const vendors = await prisma.vendor.findMany({
      where: {
        collegeId,
        ...(status ? { status: status as 'PENDING' } : {}),
        ...(category ? { categories: { has: category } } : {}),
      },
      include: { _count: { select: { bids: true, orders: true } } },
      orderBy: { name: 'asc' },
    });

    const now = Date.now();

    res.json({
      totals: {
        total: vendors.length,
        empanelled: vendors.filter((v) => v.status === 'EMPANELLED').length,
        pending: vendors.filter((v) => v.status === 'PENDING').length,
        blacklisted: vendors.filter((v) => v.status === 'BLACKLISTED').length,
      },
      vendors: vendors.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        gstin: v.gstin,
        pan: v.pan,
        categories: v.categories,
        contactName: v.contactName,
        contactMobile: v.contactMobile,
        email: v.email,
        status: v.status,
        documentsVerified: v.documentsVerified,
        registeredOn: v.registeredOn,
        empanelledUpto: v.empanelledUpto,
        statusReason: v.statusReason,
        // Empanelment that has run out is as good as none, and the register
        // should say so rather than leaving a stale tick.
        expired: !!v.empanelledUpto && v.empanelledUpto.getTime() < now,
        canBid:
          v.status === 'EMPANELLED' &&
          (!v.empanelledUpto || v.empanelledUpto.getTime() >= now),
        bids: v._count.bids,
        orders: v._count.orders,
      })),
    });
  }),
);

// ─── POST /api/procurement/vendors ────────────────────────────────────────────

procurementRouter.post(
  '/vendors',
  validate(
    'body',
    z.object({
      name: z.string().min(3).max(200),
      gstin: z.string().length(15, 'A GSTIN is fifteen characters'),
      pan: z.string().length(10, 'A PAN is ten characters'),
      categories: z.array(z.string().min(1)).min(1, 'Name at least one supply category'),
      contactName: z.string().min(2).max(120),
      contactMobile: z.string().min(6).max(20),
      email: z.string().email(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const body = req.body as {
      name: string; gstin: string; pan: string; categories: string[];
      contactName: string; contactMobile: string; email: string;
    };

    const clash = await prisma.vendor.findUnique({ where: { gstin: body.gstin } });
    if (clash) {
      throw ApiError.conflict(`${body.gstin} is already registered to ${clash.name}`, {
        vendorId: clash.id,
      });
    }

    const existing = await prisma.vendor.findMany({ select: { code: true } });

    const vendor = await prisma.vendor.create({
      data: {
        code: nextInSeries('VND/', existing.map((v) => v.code)),
        name: body.name,
        gstin: body.gstin,
        pan: body.pan,
        categories: body.categories,
        contactName: body.contactName,
        contactMobile: body.contactMobile,
        email: body.email,
        collegeId,
      },
    });

    res.status(201).json({
      id: vendor.id,
      code: vendor.code,
      name: vendor.name,
      status: vendor.status,
      documentsVerified: vendor.documentsVerified,
    });
  }),
);

// ─── POST /api/procurement/vendors/:id/status ─────────────────────────────────

/**
 * Empanels, suspends or blacklists a vendor.
 *
 * Empanelment needs the documents checked first — the whole point of the
 * register is that an empanelled supplier has been looked at — and removing
 * one needs a reason on file.
 */
procurementRouter.post(
  '/vendors/:id/status',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      status: VENDOR_STATUS,
      reason: z.string().max(500).optional(),
      empanelledUpto: z.string().date().optional(),
      documentsVerified: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      status: z.infer<typeof VENDOR_STATUS>;
      reason?: string;
      empanelledUpto?: string;
      documentsVerified?: boolean;
    };

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw ApiError.notFound('No such vendor');

    const verified = body.documentsVerified ?? vendor.documentsVerified;

    if (body.status === 'EMPANELLED' && !verified) {
      throw ApiError.badRequest(
        'A vendor cannot be empanelled before their documents are verified',
      );
    }
    if ((body.status === 'BLACKLISTED' || body.status === 'SUSPENDED') && !body.reason) {
      throw ApiError.badRequest(`A ${body.status.toLowerCase()} vendor needs a reason on file`);
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        status: body.status,
        statusReason: body.reason ?? null,
        ...(body.documentsVerified !== undefined ? { documentsVerified: body.documentsVerified } : {}),
        ...(body.empanelledUpto
          ? { empanelledUpto: new Date(`${body.empanelledUpto}T00:00:00.000Z`) }
          : {}),
      },
    });

    if (body.status === 'BLACKLISTED' || body.status === 'SUSPENDED') {
      await recordFor(req, {
        module: 'Procurement',
        action: 'edit',
        target: updated.name,
        detail: `${body.status}: ${body.reason ?? ''}`,
        outcome: 'WARN',
      });
    }

    res.json({
      id: updated.id,
      code: updated.code,
      name: updated.name,
      status: updated.status,
      documentsVerified: updated.documentsVerified,
      empanelledUpto: updated.empanelledUpto,
      statusReason: updated.statusReason,
    });
  }),
);

// ═══ Tenders ═════════════════════════════════════════════════════════════════

/**
 * Presents a tender's bids under the two-envelope rule.
 *
 * Until the technical stage closes, a financial quote is not disclosed by any
 * read — not hidden in the client, withheld by the server. Whoever scores the
 * technical bid must not know what it would cost.
 */
function presentBids(
  tender: { technicalClosedAt: Date | null; status: string; awardedBidId: string | null },
  bids: Array<{
    id: string;
    vendorId: string;
    submittedAt: Date;
    technicalScore: number | null;
    technicalRemarks: string | null;
    financialQuote: number;
    financialOpenedAt: Date | null;
    status: string;
    vendor: { code: string; name: string; status: string };
  }>,
) {
  const disclosed = tender.technicalClosedAt !== null;

  const qualified = bids.filter((b) => b.status !== 'TECHNICAL_REJECTED');
  const lowest = disclosed
    ? qualified.reduce<number | null>(
        (min, b) => (min === null || b.financialQuote < min ? b.financialQuote : min),
        null,
      )
    : null;

  return {
    financialsDisclosed: disclosed,
    bids: bids.map((b) => ({
      id: b.id,
      vendorId: b.vendorId,
      vendorCode: b.vendor.code,
      vendorName: b.vendor.name,
      submittedAt: b.submittedAt,
      technicalScore: b.technicalScore,
      technicalRemarks: b.technicalRemarks,
      status: b.status,
      // Null, and plainly so, until the technical stage is decided.
      financialQuote: disclosed ? b.financialQuote : null,
      financialOpenedAt: b.financialOpenedAt,
      l1: disclosed && lowest !== null && b.financialQuote === lowest && b.status !== 'TECHNICAL_REJECTED',
      awarded: tender.awardedBidId === b.id,
    })),
  };
}

const TENDER_INCLUDE = {
  bids: { include: { vendor: { select: { code: true, name: true, status: true } } } },
  corrigenda: { orderBy: { issuedAt: 'desc' as const } },
  createdBy: { select: { name: true } },
  request: { select: { requestNo: true, subject: true, status: true, amount: true } },
  order: { select: { poNo: true, status: true } },
};

// ─── GET /api/procurement/tenders ─────────────────────────────────────────────

procurementRouter.get(
  '/tenders',
  validate(
    'query',
    z.object({
      status: z
        .enum(['DRAFT', 'PUBLISHED', 'CORRIGENDUM', 'BID_OPEN', 'EVALUATION', 'AWARDED', 'CANCELLED'])
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const tenders = await prisma.tender.findMany({
      where: { collegeId, ...(status ? { status: status as 'DRAFT' } : {}) },
      include: TENDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      totals: {
        total: tenders.length,
        live: tenders.filter((t) => ['PUBLISHED', 'CORRIGENDUM', 'BID_OPEN'].includes(t.status)).length,
        evaluating: tenders.filter((t) => t.status === 'EVALUATION').length,
        awarded: tenders.filter((t) => t.status === 'AWARDED').length,
      },
      tenders: tenders.map((t) => {
        const { financialsDisclosed, bids } = presentBids(t, t.bids);
        return {
          id: t.id,
          refNo: t.refNo,
          title: t.title,
          description: t.description,
          department: t.department,
          category: t.category,
          estimatedValue: t.estimatedValue,
          status: t.status,
          publishedOn: t.publishedOn,
          submissionDeadline: t.submissionDeadline,
          openingDate: t.openingDate,
          technicalClosedAt: t.technicalClosedAt,
          cancelReason: t.cancelReason,
          createdBy: t.createdBy.name,
          sanction: t.request,
          purchaseOrder: t.order,
          closed: t.submissionDeadline.getTime() < Date.now(),
          financialsDisclosed,
          bidCount: t.bids.length,
          bids,
          corrigenda: t.corrigenda,
        };
      }),
    });
  }),
);

// ─── POST /api/procurement/tenders ────────────────────────────────────────────

procurementRouter.post(
  '/tenders',
  validate(
    'body',
    z
      .object({
        title: z.string().min(5).max(200),
        description: z.string().min(10).max(2000),
        department: z.string().min(2).max(120),
        category: z.string().min(2).max(80),
        estimatedValue: z.number().int().positive(),
        submissionDeadline: z.string().date(),
        openingDate: z.string().date(),
        requestNo: z.string().optional(),
      })
      .refine((v) => new Date(v.openingDate) >= new Date(v.submissionDeadline), {
        message: 'Bids cannot be opened before the deadline to submit them',
        path: ['openingDate'],
      }),
  ),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const createdById = await resolveSignatoryId(req);
    const body = req.body as {
      title: string; description: string; department: string; category: string;
      estimatedValue: number; submissionDeadline: string; openingDate: string; requestNo?: string;
    };

    let requestId: string | null = null;
    if (body.requestNo) {
      const request = await prisma.governanceRequest.findUnique({
        where: { requestNo: body.requestNo },
      });
      if (!request) throw ApiError.notFound(`No request numbered ${body.requestNo}`);
      requestId = request.id;
    }

    const year = new Date().getFullYear();
    const prefix = `${await institutionCode()}/PROC/${year}/`;
    const existing = await prisma.tender.findMany({
      where: { refNo: { startsWith: prefix } },
      select: { refNo: true },
    });

    const tender = await prisma.tender.create({
      data: {
        refNo: nextInSeries(prefix, existing.map((t) => t.refNo)),
        title: body.title,
        description: body.description,
        department: body.department,
        category: body.category,
        estimatedValue: body.estimatedValue,
        submissionDeadline: new Date(`${body.submissionDeadline}T00:00:00.000Z`),
        openingDate: new Date(`${body.openingDate}T00:00:00.000Z`),
        collegeId,
        createdById,
        requestId,
      },
    });

    res.status(201).json({
      id: tender.id,
      refNo: tender.refNo,
      title: tender.title,
      status: tender.status,
      estimatedValue: tender.estimatedValue,
    });
  }),
);

// ─── POST /api/procurement/tenders/:id/publish ────────────────────────────────

/**
 * Floats the tender.
 *
 * It must be backed by an approved procurement request, and the sanctioned
 * amount must cover the estimate — publishing a tender for more than anyone
 * agreed to spend is how a commitment outruns its sanction.
 */
procurementRouter.post(
  '/tenders/:id/publish',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };

    const tender = await prisma.tender.findUnique({
      where: { id },
      include: { request: true },
    });
    if (!tender) throw ApiError.notFound('No such tender');
    if (tender.status !== 'DRAFT') {
      throw ApiError.conflict(`That tender is already ${tender.status.toLowerCase()}`);
    }
    if (!tender.request) {
      throw ApiError.badRequest(
        'A tender needs the approved request that sanctions the spend before it can be published',
      );
    }
    if (tender.request.status !== 'APPROVED') {
      throw ApiError.badRequest(
        `${tender.request.requestNo} is ${tender.request.status.toLowerCase()}, not approved`,
      );
    }
    if (tender.request.amount !== null && tender.estimatedValue > tender.request.amount) {
      throw ApiError.badRequest(
        `The estimate exceeds the sanctioned amount of Rs ${tender.request.amount.toLocaleString('en-IN')}`,
        { sanctioned: tender.request.amount, estimated: tender.estimatedValue },
      );
    }

    const updated = await prisma.tender.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedOn: new Date() },
    });

    res.json({
      id: updated.id,
      refNo: updated.refNo,
      status: updated.status,
      publishedOn: updated.publishedOn,
      sanctionedBy: tender.request.requestNo,
    });
  }),
);

// ─── POST /api/procurement/tenders/:id/corrigendum ────────────────────────────

/** Amends a published tender, which is a public act and dated as one. */
procurementRouter.post(
  '/tenders/:id/corrigendum',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      description: z.string().min(10).max(1000),
      newDeadline: z.string().date().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { description: string; newDeadline?: string };

    const tender = await prisma.tender.findUnique({ where: { id } });
    if (!tender) throw ApiError.notFound('No such tender');
    if (!['PUBLISHED', 'CORRIGENDUM'].includes(tender.status)) {
      throw ApiError.conflict('Only a live tender can be amended');
    }

    const newDeadline = body.newDeadline
      ? new Date(`${body.newDeadline}T00:00:00.000Z`)
      : null;

    if (newDeadline && newDeadline < tender.submissionDeadline) {
      throw ApiError.badRequest('A corrigendum may extend the deadline, not shorten it');
    }

    const [corrigendum] = await prisma.$transaction([
      prisma.tenderCorrigendum.create({
        data: { tenderId: id, description: body.description, newDeadline },
      }),
      prisma.tender.update({
        where: { id },
        data: {
          status: 'CORRIGENDUM',
          ...(newDeadline ? { submissionDeadline: newDeadline } : {}),
        },
      }),
    ]);

    res.status(201).json({
      id: corrigendum.id,
      tenderRef: tender.refNo,
      description: corrigendum.description,
      newDeadline: corrigendum.newDeadline,
      issuedAt: corrigendum.issuedAt,
    });
  }),
);

// ─── POST /api/procurement/tenders/:id/bids ───────────────────────────────────

/**
 * Lodges a bid.
 *
 * Only a currently empanelled vendor may bid, and only while the tender is
 * open. The financial quote is stored now and disclosed later — see
 * `presentBids`.
 */
procurementRouter.post(
  '/tenders/:id/bids',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      vendorCode: z.string().min(1),
      financialQuote: z.number().int().positive(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { vendorCode: string; financialQuote: number };

    const tender = await prisma.tender.findUnique({ where: { id } });
    if (!tender) throw ApiError.notFound('No such tender');
    if (!['PUBLISHED', 'CORRIGENDUM'].includes(tender.status)) {
      throw ApiError.conflict(`Bidding is not open: the tender is ${tender.status.toLowerCase()}`);
    }
    if (tender.submissionDeadline.getTime() < Date.now()) {
      throw ApiError.conflict('The deadline to submit bids has passed');
    }

    const vendor = await prisma.vendor.findUnique({ where: { code: body.vendorCode } });
    if (!vendor) throw ApiError.notFound(`No vendor with code ${body.vendorCode}`);

    if (vendor.status !== 'EMPANELLED') {
      // ApiError.forbidden takes no details, so build it directly — the
      // reason a vendor is barred is the useful half of the refusal.
      throw new ApiError(
        403,
        `${vendor.name} is ${vendor.status.toLowerCase()} and may not bid`,
        'forbidden',
        { status: vendor.status, reason: vendor.statusReason },
      );
    }
    if (vendor.empanelledUpto && vendor.empanelledUpto.getTime() < Date.now()) {
      throw ApiError.forbidden(`${vendor.name}'s empanelment has expired`);
    }

    const existing = await prisma.tenderBid.findUnique({
      where: { tenderId_vendorId: { tenderId: id, vendorId: vendor.id } },
    });
    if (existing) throw ApiError.conflict(`${vendor.name} has already bid on this tender`);

    const bid = await prisma.tenderBid.create({
      data: { tenderId: id, vendorId: vendor.id, financialQuote: body.financialQuote },
    });

    res.status(201).json({
      id: bid.id,
      tenderRef: tender.refNo,
      vendor: vendor.name,
      status: bid.status,
      submittedAt: bid.submittedAt,
      // Deliberately not echoed: the quote is sealed until the technical
      // stage closes, including from whoever lodged it here.
      financialQuote: null,
    });
  }),
);

// ─── POST /api/procurement/bids/:id/technical ─────────────────────────────────

/** Scores a bid's technical envelope. */
procurementRouter.post(
  '/bids/:id/technical',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      score: z.number().int().min(0).max(100),
      qualified: z.boolean(),
      remarks: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { score: number; qualified: boolean; remarks?: string };

    const bid = await prisma.tenderBid.findUnique({
      where: { id },
      include: { tender: true, vendor: { select: { name: true } } },
    });
    if (!bid) throw ApiError.notFound('No such bid');

    if (bid.tender.technicalClosedAt) {
      throw ApiError.conflict('The technical stage is closed for this tender');
    }
    if (bid.tender.submissionDeadline.getTime() > Date.now()) {
      throw ApiError.conflict('Bids cannot be evaluated before the deadline to submit them');
    }
    if (!body.qualified && !body.remarks) {
      throw ApiError.badRequest('Rejecting a technical bid needs a reason on file');
    }

    const updated = await prisma.tenderBid.update({
      where: { id },
      data: {
        technicalScore: body.score,
        technicalRemarks: body.remarks ?? null,
        status: body.qualified ? 'TECHNICAL_QUALIFIED' : 'TECHNICAL_REJECTED',
      },
    });

    // The tender moves into evaluation on the first score entered.
    if (bid.tender.status !== 'EVALUATION') {
      await prisma.tender.update({ where: { id: bid.tenderId }, data: { status: 'EVALUATION' } });
    }

    res.json({
      id: updated.id,
      vendor: bid.vendor.name,
      technicalScore: updated.technicalScore,
      status: updated.status,
    });
  }),
);

// ─── POST /api/procurement/tenders/:id/open-financials ────────────────────────

/**
 * Closes the technical stage and opens the financial envelopes.
 *
 * This is the moment the quotes become readable, and it cannot be taken until
 * every bid has been scored — otherwise a bid could be judged technically
 * while its price was already on the table.
 */
procurementRouter.post(
  '/tenders/:id/open-financials',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };

    const tender = await prisma.tender.findUnique({
      where: { id },
      include: { bids: { include: { vendor: { select: { code: true, name: true, status: true } } } } },
    });
    if (!tender) throw ApiError.notFound('No such tender');
    if (tender.technicalClosedAt) {
      throw ApiError.conflict('The financial envelopes are already open');
    }
    if (tender.bids.length === 0) throw ApiError.badRequest('No bids were received');

    const unscored = tender.bids.filter((b) => b.status === 'SUBMITTED');
    if (unscored.length > 0) {
      throw ApiError.badRequest(
        `${unscored.length} bid(s) have not been technically evaluated yet`,
        { vendors: unscored.map((b) => b.vendor.name) },
      );
    }

    const qualified = tender.bids.filter((b) => b.status === 'TECHNICAL_QUALIFIED');
    if (qualified.length === 0) {
      throw ApiError.badRequest('No bid qualified technically; the tender cannot proceed');
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.tender.update({ where: { id }, data: { technicalClosedAt: now } }),
      prisma.tenderBid.updateMany({
        where: { tenderId: id, status: 'TECHNICAL_QUALIFIED' },
        data: { status: 'FINANCIAL_OPENED', financialOpenedAt: now },
      }),
    ]);

    const after = await prisma.tender.findUniqueOrThrow({
      where: { id },
      include: { bids: { include: { vendor: { select: { code: true, name: true, status: true } } } } },
    });

    const { bids } = presentBids(after, after.bids);
    const l1 = bids.find((b) => b.l1);

    res.json({
      id: after.id,
      refNo: after.refNo,
      technicalClosedAt: now,
      financialsDisclosed: true,
      qualified: qualified.length,
      rejected: tender.bids.length - qualified.length,
      lowest: l1 ? { vendor: l1.vendorName, quote: l1.financialQuote, bidId: l1.id } : null,
      bids,
    });
  }),
);

// ─── POST /api/procurement/tenders/:id/award ──────────────────────────────────

/**
 * Awards the tender and raises the purchase order.
 *
 * Awarding anything but the lowest qualified bid is allowed — there are real
 * reasons to — but it demands a written justification, because that is the
 * decision an auditor will ask about.
 */
procurementRouter.post(
  '/tenders/:id/award',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      bidId: z.string().min(1),
      justification: z.string().max(1000).optional(),
      deliveryDeadline: z.string().date(),
      items: z
        .array(
          z.object({
            description: z.string().min(2).max(200),
            unit: z.string().min(1).max(20),
            quantity: z.number().int().positive(),
            unitRate: z.number().int().positive(),
          }),
        )
        .min(1, 'A purchase order needs at least one line'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      bidId: string;
      justification?: string;
      deliveryDeadline: string;
      items: Array<{ description: string; unit: string; quantity: number; unitRate: number }>;
    };

    const tender = await prisma.tender.findUnique({
      where: { id },
      include: { bids: { include: { vendor: true } } },
    });
    if (!tender) throw ApiError.notFound('No such tender');
    if (tender.status === 'AWARDED') throw ApiError.conflict('That tender is already awarded');
    if (!tender.technicalClosedAt) {
      throw ApiError.conflict('The financial envelopes have not been opened yet');
    }

    const bid = tender.bids.find((b) => b.id === body.bidId);
    if (!bid) throw ApiError.notFound('No such bid on this tender');
    if (bid.status === 'TECHNICAL_REJECTED') {
      throw ApiError.badRequest('That bid was rejected at the technical stage');
    }

    const qualified = tender.bids.filter((b) => b.status !== 'TECHNICAL_REJECTED');
    const lowest = Math.min(...qualified.map((b) => b.financialQuote));

    if (bid.financialQuote > lowest && !body.justification) {
      const l1 = qualified.find((b) => b.financialQuote === lowest)!;
      throw ApiError.badRequest(
        `${l1.vendor.name} quoted lower at Rs ${lowest.toLocaleString('en-IN')}; awarding above L1 needs a written justification`,
        { l1Vendor: l1.vendor.name, l1Quote: lowest, thisQuote: bid.financialQuote },
      );
    }

    const total = body.items.reduce((sum, i) => sum + i.quantity * i.unitRate, 0);
    const year = new Date().getFullYear();
    const prefix = `PO/${await institutionCode()}/${year}/`;
    const existing = await prisma.purchaseOrder.findMany({
      where: { poNo: { startsWith: prefix } },
      select: { poNo: true },
    });

    const order = await prisma.$transaction(async (tx) => {
      await tx.tenderBid.update({ where: { id: bid.id }, data: { status: 'RECOMMENDED' } });
      await tx.tender.update({
        where: { id },
        data: { status: 'AWARDED', awardedBidId: bid.id, cancelReason: null },
      });

      return tx.purchaseOrder.create({
        data: {
          poNo: nextInSeries(prefix, existing.map((o) => o.poNo), 4),
          tenderId: id,
          vendorId: bid.vendorId,
          totalAmount: total,
          deliveryDeadline: new Date(`${body.deliveryDeadline}T00:00:00.000Z`),
          items: {
            create: body.items.map((i) => ({
              description: i.description,
              unit: i.unit,
              quantity: i.quantity,
              unitRate: i.unitRate,
              amount: i.quantity * i.unitRate,
            })),
          },
        },
        include: { items: true },
      });
    });

    // Who a tender went to, and whether it went to the lowest bid, is the
    // question an auditor asks first.
    await recordFor(req, {
      module: 'Procurement',
      action: 'approve',
      target: tender.refNo,
      detail: `Awarded to ${bid.vendor.name} at Rs ${bid.financialQuote}${bid.financialQuote > lowest ? ' (above L1)' : ' (L1)'}`,
      outcome: bid.financialQuote > lowest ? 'WARN' : 'OK',
    });

    res.status(201).json({
      tenderRef: tender.refNo,
      awardedTo: bid.vendor.name,
      quote: bid.financialQuote,
      aboveL1: bid.financialQuote > lowest,
      justification: body.justification ?? null,
      purchaseOrder: {
        id: order.id,
        poNo: order.poNo,
        totalAmount: order.totalAmount,
        status: order.status,
        items: order.items.length,
      },
    });
  }),
);

// ═══ Purchase orders ═════════════════════════════════════════════════════════

/** Where an order can go from where it is. The stages run one way. */
const NEXT_PO_STAGE: Record<string, string[]> = {
  ISSUED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['PARTIAL_DELIVERY', 'DELIVERED'],
  PARTIAL_DELIVERY: ['PARTIAL_DELIVERY', 'DELIVERED'],
  DELIVERED: ['INSPECTED'],
  INSPECTED: ['BILL_PASSED'],
  BILL_PASSED: ['PAID'],
  PAID: [],
};

// ─── GET /api/procurement/orders ──────────────────────────────────────────────

procurementRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);

    const orders = await prisma.purchaseOrder.findMany({
      where: { tender: { collegeId } },
      include: {
        items: true,
        vendor: { select: { code: true, name: true } },
        tender: { select: { refNo: true, title: true } },
      },
      orderBy: { issueDate: 'desc' },
    });

    res.json({
      totals: {
        total: orders.length,
        open: orders.filter((o) => o.status !== 'PAID').length,
        overdue: orders.filter(
          (o) => !['DELIVERED', 'INSPECTED', 'BILL_PASSED', 'PAID'].includes(o.status) &&
            o.deliveryDeadline.getTime() < Date.now(),
        ).length,
        committed: orders.reduce((sum, o) => sum + o.totalAmount, 0),
        paid: orders.filter((o) => o.status === 'PAID').reduce((sum, o) => sum + o.totalAmount, 0),
      },
      orders: orders.map((o) => ({
        id: o.id,
        poNo: o.poNo,
        tenderRef: o.tender.refNo,
        title: o.tender.title,
        vendorCode: o.vendor.code,
        vendorName: o.vendor.name,
        totalAmount: o.totalAmount,
        issueDate: o.issueDate,
        deliveryDeadline: o.deliveryDeadline,
        status: o.status,
        nextStages: NEXT_PO_STAGE[o.status] ?? [],
        grnNo: o.grnNo,
        invoiceNo: o.invoiceNo,
        billPassedOn: o.billPassedOn,
        paymentDate: o.paymentDate,
        paymentRef: o.paymentRef,
        overdue:
          !['DELIVERED', 'INSPECTED', 'BILL_PASSED', 'PAID'].includes(o.status) &&
          o.deliveryDeadline.getTime() < Date.now(),
        items: o.items.map((i) => ({
          id: i.id,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          unitRate: i.unitRate,
          amount: i.amount,
          deliveredQty: i.deliveredQty,
          outstanding: i.quantity - i.deliveredQty,
        })),
        delivered: o.items.every((i) => i.deliveredQty >= i.quantity),
      })),
    });
  }),
);

// ─── POST /api/procurement/orders/:id/advance ─────────────────────────────────

/**
 * Moves an order along.
 *
 * Nothing is inspected before it is delivered, no bill is passed before
 * inspection, and nothing is paid before its bill — each of those is a way
 * money leaves without anyone having checked what came back for it.
 */
procurementRouter.post(
  '/orders/:id/advance',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      stage: z.enum(['ACKNOWLEDGED', 'PARTIAL_DELIVERY', 'DELIVERED', 'INSPECTED', 'BILL_PASSED', 'PAID']),
      grnNo: z.string().max(60).optional(),
      invoiceNo: z.string().max(60).optional(),
      paymentRef: z.string().max(60).optional(),
      delivered: z
        .array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0) }))
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      stage: string;
      grnNo?: string;
      invoiceNo?: string;
      paymentRef?: string;
      delivered?: Array<{ itemId: string; quantity: number }>;
    };

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true, vendor: { select: { name: true } } },
    });
    if (!order) throw ApiError.notFound('No such purchase order');

    const allowed = NEXT_PO_STAGE[order.status] ?? [];
    if (!allowed.includes(body.stage)) {
      throw ApiError.conflict(
        `An order at ${order.status.toLowerCase().replace(/_/g, ' ')} cannot move to ${body.stage
          .toLowerCase()
          .replace(/_/g, ' ')}`,
        { allowed },
      );
    }

    // Receiving goods needs the note they came in on.
    if (['PARTIAL_DELIVERY', 'DELIVERED'].includes(body.stage) && !body.grnNo && !order.grnNo) {
      throw ApiError.badRequest('Receiving goods needs the goods receipt note number');
    }
    if (body.stage === 'BILL_PASSED' && !body.invoiceNo && !order.invoiceNo) {
      throw ApiError.badRequest('Passing a bill needs the invoice number');
    }
    if (body.stage === 'PAID' && !body.paymentRef) {
      throw ApiError.badRequest('Recording a payment needs its reference');
    }

    // Quantities received against each line.
    if (body.delivered) {
      for (const d of body.delivered) {
        const item = order.items.find((i) => i.id === d.itemId);
        if (!item) throw ApiError.badRequest('That line is not on this order');
        if (d.quantity > item.quantity) {
          throw ApiError.badRequest(
            `${item.description}: ${d.quantity} received against ${item.quantity} ordered`,
          );
        }
      }
      await prisma.$transaction(
        body.delivered.map((d) =>
          prisma.pOItem.update({ where: { id: d.itemId }, data: { deliveredQty: d.quantity } }),
        ),
      );
    }

    const after = await prisma.pOItem.findMany({ where: { orderId: id } });
    const complete = after.every((i) => i.deliveredQty >= i.quantity);

    if (body.stage === 'DELIVERED' && !complete) {
      const short = after.filter((i) => i.deliveredQty < i.quantity);
      throw ApiError.badRequest('Some lines are still short of the quantity ordered', {
        outstanding: short.map((i) => ({
          description: i.description,
          ordered: i.quantity,
          received: i.deliveredQty,
        })),
      });
    }

    const now = new Date();

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: body.stage as 'DELIVERED',
        ...(body.grnNo ? { grnNo: body.grnNo } : {}),
        ...(body.invoiceNo ? { invoiceNo: body.invoiceNo } : {}),
        ...(body.stage === 'BILL_PASSED' ? { billPassedOn: now } : {}),
        ...(body.stage === 'PAID' ? { paymentDate: now, paymentRef: body.paymentRef } : {}),
      },
    });

    res.json({
      id: updated.id,
      poNo: updated.poNo,
      vendor: order.vendor.name,
      status: updated.status,
      nextStages: NEXT_PO_STAGE[updated.status] ?? [],
      grnNo: updated.grnNo,
      invoiceNo: updated.invoiceNo,
      billPassedOn: updated.billPassedOn,
      paymentDate: updated.paymentDate,
      paymentRef: updated.paymentRef,
      fullyDelivered: complete,
    });
  }),
);

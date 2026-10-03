import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate } from '../lib/http.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { captchaRequired, verifyTurnstile } from '../auth/turnstile.js';
import { startSession } from '../auth/routes.js';
import { record, recordFor } from './itconsole/audit.js';
import { rateLimit } from '../lib/ratelimit.js';

/**
 * The vendor portal — a supplier's own side of procurement.
 *
 * A vendor registers itself (or claims the register entry the college already
 * made for it), waits to be empanelled, and then bids on open tenders and
 * works its purchase orders from here instead of through the purchase desk.
 *
 * Everything a vendor reads is its own: other bidders are never named, and a
 * rival's quote is never disclosed. The rules on what may be bid, and when,
 * are the same ones the purchase desk is held to in `procurement/index.ts`.
 */
export const vendorRouter = Router();

/** A GSTIN: two-digit state, PAN, entity number, Z, checksum. */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[0-9]/, 'Password needs a number');

function nextInSeries(prefix: string, existing: string[], width = 3): string {
  const highest = existing.reduce((max, no) => {
    const tail = Number(no.slice(prefix.length));
    return Number.isFinite(tail) && tail > max ? tail : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}

// ─── POST /api/vendor/register ────────────────────────────────────────────────

/**
 * Opens a vendor account.
 *
 * A GSTIN the college has already put on its register is claimed rather than
 * duplicated — but only with the email the college has on file for it, so a
 * stranger who knows a supplier's GSTIN cannot take over its bids.
 * Either way the account can sign in at once, and sees that it may not bid
 * until the purchase desk verifies its documents and empanels it.
 */
vendorRouter.post(
  '/register',
  rateLimit('vendor-register', { perIp: 5, windowMinutes: 60 }),
  validate('body', z.object({
    name: z.string().trim().min(3).max(200),
    gstin: z.string().trim().toUpperCase().regex(GSTIN, 'That is not a valid GSTIN'),
    pan: z.string().trim().toUpperCase().regex(PAN, 'That is not a valid PAN'),
    categories: z.array(z.string().trim().min(1).max(80)).min(1, 'Name at least one supply category').max(20),
    contactName: z.string().trim().min(2).max(120),
    contactMobile: z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid mobile number'),
    email: z.string().email(),
    password: strongPassword,
    turnstileToken: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      name: string; gstin: string; pan: string; categories: string[];
      contactName: string; contactMobile: string; email: string; password: string; turnstileToken?: string;
    };
    if (captchaRequired(req)) await verifyTurnstile(req, body.turnstileToken);

    if (body.gstin.slice(2, 12) !== body.pan) {
      throw ApiError.badRequest('The PAN does not match the one inside the GSTIN');
    }

    const email = body.email.toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, 10);

    const { userId, vendor, claimed } = await prisma.$transaction(
      async (tx) => {
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
          throw ApiError.conflict('An account with that email already exists. Sign in instead.');
        }

        const existing = await tx.vendor.findUnique({ where: { gstin: body.gstin } });
        if (existing) {
          if (existing.userId) throw ApiError.conflict('That GSTIN already has a vendor account. Sign in instead.');
          if (existing.email.toLowerCase() !== email) {
            throw ApiError.conflict(
              'That GSTIN is already on the register under a different email. Register with the email the purchase desk has on file, or ask them to update it.',
            );
          }
          const user = await tx.user.create({ data: { email, passwordHash, role: 'VENDOR', isActive: true } });
          const vendor = await tx.vendor.update({ where: { id: existing.id }, data: { userId: user.id } });
          return { userId: user.id, vendor, claimed: true };
        }

        const college = await tx.college.findFirst({ select: { id: true }, orderBy: { name: 'asc' } });
        if (!college) throw ApiError.notFound('This institution has no college set up yet');

        const codes = await tx.vendor.findMany({ select: { code: true } });
        const user = await tx.user.create({ data: { email, passwordHash, role: 'VENDOR', isActive: true } });
        const vendor = await tx.vendor.create({
          data: {
            code: nextInSeries('VND/', codes.map((v) => v.code)),
            name: body.name,
            gstin: body.gstin,
            pan: body.pan,
            categories: body.categories,
            contactName: body.contactName,
            contactMobile: body.contactMobile,
            email,
            collegeId: college.id,
            userId: user.id,
          },
        });
        return { userId: user.id, vendor, claimed: false };
      },
      { isolationLevel: 'Serializable' },
    );

    await record({
      actorId: userId,
      actorName: vendor.name,
      actorRole: 'VENDOR',
      module: 'Procurement',
      action: claimed ? 'vendor-claim' : 'vendor-register',
      target: vendor.code,
      detail: `${vendor.gstin} · ${claimed ? 'claimed the existing register entry' : 'self-registered, awaiting empanelment'}`,
      ip: req.ip ?? null,
    });

    await startSession(req, res, userId, 201);
  }),
);

// Everything below is the signed-in vendor's own.
vendorRouter.use(requireAuth, requireRole('VENDOR'));

async function myVendor(req: Request) {
  const id = req.auth!.vendorId;
  if (!id) throw ApiError.forbidden('This account is not linked to a vendor');
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw ApiError.forbidden('This account is not linked to a vendor');
  return vendor;
}

/** Whether a vendor may lodge a bid today, and if not, why not. */
function biddingBlock(v: { status: string; documentsVerified: boolean; empanelledUpto: Date | null; statusReason: string | null }): string | null {
  if (v.status === 'PENDING') {
    return v.documentsVerified
      ? 'Your documents are verified; empanelment is awaiting the purchase desk.'
      : 'Your registration is awaiting document verification by the purchase desk.';
  }
  if (v.status !== 'EMPANELLED') return `Your firm is ${v.status.toLowerCase()}${v.statusReason ? `: ${v.statusReason}` : ''}.`;
  if (v.empanelledUpto && v.empanelledUpto.getTime() < Date.now()) return 'Your empanelment has expired. Ask the purchase desk to renew it.';
  return null;
}

const OPEN = ['PUBLISHED', 'CORRIGENDUM'] as const;

// ─── GET /api/vendor/me ───────────────────────────────────────────────────────

vendorRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const v = await myVendor(req);
    const [bids, orders, openTenders] = await Promise.all([
      prisma.tenderBid.findMany({ where: { vendorId: v.id }, select: { status: true, tender: { select: { awardedBidId: true } }, id: true } }),
      prisma.purchaseOrder.findMany({ where: { vendorId: v.id }, select: { status: true, totalAmount: true } }),
      prisma.tender.count({
        where: { collegeId: v.collegeId, status: { in: [...OPEN] }, submissionDeadline: { gt: new Date() }, category: { in: v.categories } },
      }),
    ]);
    res.json({
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
      statusReason: v.statusReason,
      documentsVerified: v.documentsVerified,
      registeredOn: v.registeredOn,
      empanelledUpto: v.empanelledUpto,
      biddingBlockedReason: biddingBlock(v),
      totals: {
        openTendersInMyCategories: openTenders,
        bids: bids.length,
        won: bids.filter((b) => b.tender.awardedBidId === b.id).length,
        ordersOpen: orders.filter((o) => o.status !== 'PAID').length,
        orderValue: orders.reduce((s, o) => s + o.totalAmount, 0),
        paid: orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.totalAmount, 0),
      },
    });
  }),
);

// ─── PATCH /api/vendor/me ─────────────────────────────────────────────────────

/** Contact details are the vendor's to keep current; categories only until empanelled, since they were what got checked. */
vendorRouter.patch(
  '/me',
  validate('body', z.object({
    contactName: z.string().trim().min(2).max(120).optional(),
    contactMobile: z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid mobile number').optional(),
    categories: z.array(z.string().trim().min(1).max(80)).min(1).max(20).optional(),
  })),
  asyncHandler(async (req, res) => {
    const v = await myVendor(req);
    const body = req.body as { contactName?: string; contactMobile?: string; categories?: string[] };
    if (body.categories && v.status !== 'PENDING') {
      throw ApiError.badRequest('Supply categories are fixed once empanelled. Ask the purchase desk to change them.');
    }
    const updated = await prisma.vendor.update({ where: { id: v.id }, data: body });
    res.json({ id: updated.id, contactName: updated.contactName, contactMobile: updated.contactMobile, categories: updated.categories });
  }),
);

// ─── GET /api/vendor/tenders ──────────────────────────────────────────────────

/**
 * Tenders open for bidding, plus every tender this vendor has bid on.
 *
 * A vendor sees its own bid in full — it typed the quote — and, once the
 * financial envelopes are open, only whether it ranked lowest and whether it
 * won. Who else bid, and at what price, is not this portal's to say.
 */
vendorRouter.get(
  '/tenders',
  asyncHandler(async (req, res) => {
    const v = await myVendor(req);
    const tenders = await prisma.tender.findMany({
      where: {
        collegeId: v.collegeId,
        OR: [{ status: { in: [...OPEN] } }, { bids: { some: { vendorId: v.id } } }],
      },
      include: {
        corrigenda: { orderBy: { issuedAt: 'desc' } },
        bids: { select: { id: true, vendorId: true, financialQuote: true, status: true } },
      },
      orderBy: { submissionDeadline: 'asc' },
    });

    const block = biddingBlock(v);
    const now = Date.now();

    res.json({
      biddingBlockedReason: block,
      tenders: tenders.map((t) => {
        const mine = t.bids.find((b) => b.vendorId === v.id) ?? null;
        const disclosed = t.technicalClosedAt !== null;
        const qualified = t.bids.filter((b) => b.status !== 'TECHNICAL_REJECTED');
        const lowest = qualified.length ? Math.min(...qualified.map((b) => b.financialQuote)) : null;
        const open = (OPEN as readonly string[]).includes(t.status) && t.submissionDeadline.getTime() > now;
        return {
          id: t.id,
          refNo: t.refNo,
          title: t.title,
          description: t.description,
          department: t.department,
          category: t.category,
          inMyCategories: v.categories.includes(t.category),
          estimatedValue: t.estimatedValue,
          status: t.status,
          publishedOn: t.publishedOn,
          submissionDeadline: t.submissionDeadline,
          openingDate: t.openingDate,
          open,
          canBid: open && !mine && block === null,
          corrigenda: t.corrigenda.map((c) => ({ description: c.description, newDeadline: c.newDeadline, issuedAt: c.issuedAt })),
          myBid: mine && {
            id: mine.id,
            financialQuote: mine.financialQuote,
            status: mine.status,
            canWithdraw: open && mine.status === 'SUBMITTED',
            rankedL1: disclosed && mine.status !== 'TECHNICAL_REJECTED' && lowest !== null && mine.financialQuote === lowest,
            awarded: t.awardedBidId === mine.id,
          },
          outcome:
            t.status === 'AWARDED'
              ? (t.awardedBidId === mine?.id ? 'WON' : 'NOT_AWARDED')
              : t.status === 'CANCELLED' ? 'CANCELLED' : null,
        };
      }),
    });
  }),
);

// ─── POST /api/vendor/tenders/:id/bid ─────────────────────────────────────────

vendorRouter.post(
  '/tenders/:id/bid',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({
    technicalProposal: z.string().trim().min(30, 'Describe your technical offer in at least 30 characters').max(5000),
    financialQuote: z.number().int().positive(),
    declaration: z.literal(true, { message: 'Accept the bid declaration to submit' }),
  })),
  asyncHandler(async (req, res) => {
    const v = await myVendor(req);
    const { id } = req.params as { id: string };
    const body = req.body as { technicalProposal: string; financialQuote: number };

    const block = biddingBlock(v);
    if (block) throw ApiError.forbidden(block);

    const tender = await prisma.tender.findUnique({ where: { id } });
    if (!tender || tender.collegeId !== v.collegeId) throw ApiError.notFound('No such tender');
    if (!(OPEN as readonly string[]).includes(tender.status)) {
      throw ApiError.conflict(`Bidding is not open: the tender is ${tender.status.toLowerCase()}`);
    }
    if (tender.submissionDeadline.getTime() < Date.now()) throw ApiError.conflict('The deadline to submit bids has passed');

    const existing = await prisma.tenderBid.findUnique({ where: { tenderId_vendorId: { tenderId: id, vendorId: v.id } } });
    if (existing) throw ApiError.conflict('You have already bid on this tender. Withdraw it first to bid again.');

    const bid = await prisma.tenderBid.create({
      data: { tenderId: id, vendorId: v.id, financialQuote: body.financialQuote, technicalProposal: body.technicalProposal },
    });

    await recordFor(req, { module: 'Procurement', action: 'bid', target: tender.refNo, detail: `${v.code} lodged a sealed bid` });

    res.status(201).json({ id: bid.id, tenderRef: tender.refNo, status: bid.status, submittedAt: bid.submittedAt });
  }),
);

// ─── POST /api/vendor/bids/:id/withdraw ───────────────────────────────────────

/** A sealed bid may be withdrawn while bidding is still open — never once evaluation could have seen it. */
vendorRouter.post(
  '/bids/:id/withdraw',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const v = await myVendor(req);
    const { id } = req.params as { id: string };
    const bid = await prisma.tenderBid.findUnique({ where: { id }, include: { tender: true } });
    if (!bid || bid.vendorId !== v.id) throw ApiError.notFound('No such bid');
    if (bid.status !== 'SUBMITTED' || bid.tender.submissionDeadline.getTime() < Date.now() ||
        !(OPEN as readonly string[]).includes(bid.tender.status)) {
      throw ApiError.conflict('Bids can only be withdrawn before the submission deadline');
    }
    await prisma.tenderBid.delete({ where: { id } });
    await recordFor(req, { module: 'Procurement', action: 'bid-withdraw', target: bid.tender.refNo, detail: `${v.code} withdrew its bid`, outcome: 'WARN' });
    res.status(204).end();
  }),
);

// ─── GET /api/vendor/orders ───────────────────────────────────────────────────

vendorRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const v = await myVendor(req);
    const orders = await prisma.purchaseOrder.findMany({
      where: { vendorId: v.id },
      include: { items: true, tender: { select: { refNo: true, title: true, department: true } } },
      orderBy: { issueDate: 'desc' },
    });
    res.json({
      orders: orders.map((o) => ({
        id: o.id,
        poNo: o.poNo,
        tenderRef: o.tender.refNo,
        title: o.tender.title,
        department: o.tender.department,
        totalAmount: o.totalAmount,
        issueDate: o.issueDate,
        deliveryDeadline: o.deliveryDeadline,
        status: o.status,
        acknowledgedAt: o.acknowledgedAt,
        grnNo: o.grnNo,
        invoiceNo: o.invoiceNo,
        invoiceAmount: o.invoiceAmount,
        invoiceDate: o.invoiceDate,
        billPassedOn: o.billPassedOn,
        paymentDate: o.paymentDate,
        paymentRef: o.paymentRef,
        overdue: ['ISSUED', 'ACKNOWLEDGED', 'PARTIAL_DELIVERY'].includes(o.status) && o.deliveryDeadline.getTime() < Date.now(),
        canAcknowledge: o.status === 'ISSUED',
        canInvoice: ['DELIVERED', 'INSPECTED'].includes(o.status) && !o.invoiceNo,
        items: o.items.map((i) => ({
          id: i.id, description: i.description, unit: i.unit, quantity: i.quantity,
          unitRate: i.unitRate, amount: i.amount, deliveredQty: i.deliveredQty,
        })),
      })),
    });
  }),
);

async function myOrder(req: Request) {
  const v = await myVendor(req);
  const order = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id as string } });
  if (!order || order.vendorId !== v.id) throw ApiError.notFound('No such purchase order');
  return { v, order };
}

// ─── POST /api/vendor/orders/:id/acknowledge ──────────────────────────────────

vendorRouter.post(
  '/orders/:id/acknowledge',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { v, order } = await myOrder(req);
    if (order.status !== 'ISSUED') throw ApiError.conflict('This order has already been acknowledged');
    const updated = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    await recordFor(req, { module: 'Procurement', action: 'po-acknowledge', target: order.poNo, detail: `${v.code} accepted the order` });
    res.json({ id: updated.id, status: updated.status, acknowledgedAt: updated.acknowledgedAt });
  }),
);

// ─── POST /api/vendor/orders/:id/invoice ──────────────────────────────────────

/**
 * Raises the invoice against delivered goods. Passing the bill and paying it
 * stay with the college: the vendor states what it is owed, not what it gets.
 */
vendorRouter.post(
  '/orders/:id/invoice',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({
    invoiceNo: z.string().trim().min(1).max(60),
    invoiceAmount: z.number().int().positive(),
    invoiceDate: z.string().date(),
  })),
  asyncHandler(async (req, res) => {
    const { v, order } = await myOrder(req);
    const body = req.body as { invoiceNo: string; invoiceAmount: number; invoiceDate: string };
    if (!['DELIVERED', 'INSPECTED'].includes(order.status)) {
      throw ApiError.conflict('An invoice can be raised once the goods are delivered');
    }
    if (order.invoiceNo) throw ApiError.conflict(`Invoice ${order.invoiceNo} is already on this order`);
    if (body.invoiceAmount > order.totalAmount) {
      throw ApiError.badRequest(`The invoice exceeds the order value of Rs ${order.totalAmount.toLocaleString('en-IN')}`);
    }
    const date = new Date(`${body.invoiceDate}T00:00:00.000Z`);
    if (date.getTime() > Date.now() + 86_400_000) throw ApiError.badRequest('An invoice cannot be dated in the future');

    const updated = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { invoiceNo: body.invoiceNo, invoiceAmount: body.invoiceAmount, invoiceDate: date },
    });
    await recordFor(req, {
      module: 'Procurement', action: 'invoice', target: order.poNo,
      detail: `${v.code} invoiced Rs ${body.invoiceAmount} (${body.invoiceNo})`,
    });
    res.json({ id: updated.id, invoiceNo: updated.invoiceNo, invoiceAmount: updated.invoiceAmount, invoiceDate: updated.invoiceDate });
  }),
);

/**
 * End-to-end test of the vendor portal against a running, freshly seeded API.
 *
 *   npm run db:seed && npm run dev
 *   node scripts/smoke-vendor.mjs
 *
 * Covers registration (new and claiming an existing register entry), the
 * refusals that keep a supplier inside its own records, the sealed bid, and
 * a purchase order worked from acknowledgement to invoice.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, json };
}
const login = async (email) => (await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } })).json?.accessToken;
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

console.log('\nVendor portal');

// ── Registration ──
const stamp = Date.now().toString().slice(-4);
const gstin = `27ABCDE${stamp}F1Z5`;
const reg = await call('/api/vendor/register', {
  method: 'POST',
  body: {
    name: 'Test Furnishers LLP', gstin, pan: `ABCDE${stamp}F`, categories: ['Furniture'],
    contactName: 'Test Person', contactMobile: '9876543210', email: `vendor${stamp}@example.com`, password: 'Vendor123',
  },
});
check('a supplier can register itself', reg.status === 201 && reg.json?.user?.role === 'VENDOR', JSON.stringify(reg.json));
const newToken = reg.json?.accessToken;
const me = await call('/api/vendor/me', { token: newToken });
check('a new vendor is pending and told why it cannot bid', me.json?.status === 'PENDING' && !!me.json?.biddingBlockedReason);

const badPan = await call('/api/vendor/register', {
  method: 'POST',
  body: { name: 'Mismatch Co', gstin: `27ABCDE${stamp}F1Z5`.replace('ABCDE', 'ZZZZZ'), pan: 'ABCDE1234F', categories: ['X'], contactName: 'A B', contactMobile: '9876543210', email: `m${stamp}@example.com`, password: 'Vendor123' },
});
check('a PAN that does not match the GSTIN is refused', badPan.status === 400);

const dupGst = await call('/api/vendor/register', {
  method: 'POST',
  body: { name: 'Thief Co', gstin: '23AAQPS5678E1ZR', pan: 'AAQPS5678E', categories: ['Stationery'], contactName: 'A B', contactMobile: '9876543210', email: `thief${stamp}@example.com`, password: 'Vendor123' },
});
check("an existing supplier's GSTIN cannot be claimed with another email", dupGst.status === 409);

const claim = await call('/api/vendor/register', {
  method: 'POST',
  body: { name: 'Shree Stationers & Publishers', gstin: '23AAQPS5678E1ZR', pan: 'AAQPS5678E', categories: ['Stationery'], contactName: 'Pradeep Sharma', contactMobile: '9425034512', email: 'pradeep@shreestationer.co.in', password: 'Vendor123' },
});
check('an existing register entry is claimed with the email on file', claim.status === 201 && claim.json?.user?.vendor?.code === 'VND/002', JSON.stringify(claim.json));

// ── Access boundaries ──
const student = await login('priya.sharma.2021@demo.resolion.edu');
check('a student cannot open the vendor portal', (await call('/api/vendor/me', { token: student })).status === 403);
const vendor = await login('ajay@technocraft.in');
check('the seeded vendor signs in', !!vendor);
check('a vendor cannot reach the purchase desk', (await call('/api/procurement/vendors', { token: vendor })).status === 403);
const anyStudent = (await call('/api/auth/me', { token: student })).json?.student?.id;
check('a vendor cannot read student records', (await call(`/api/student/profile?studentId=${anyStudent}`, { token: vendor })).status === 403);
check('a vendor cannot read fees', (await call(`/api/student/fees?studentId=${anyStudent}`, { token: vendor })).status === 403);
check('a vendor cannot read internal announcements', (await call('/api/announcements', { token: vendor })).status === 403);

const pending = await login('sunrise.furniture@gmail.com');

// ── A tender to bid on, floated by the desk ──
// A tender is signed by a faculty member and needs an approved sanction, so
// the principal raises one, approves it, and floats the tender on it.
const desk = await login('principal@demo.resolion.edu');
const sanction = await call('/api/governance/requests', {
  method: 'POST', token: desk,
  body: { kind: 'PROCUREMENT', subject: 'Data centre servers', details: 'Ten servers for the data centre.', amount: 100000 },
});
const decided = await call(`/api/governance/approvals/request/${sanction.json?.id}/decide`, { method: 'POST', token: desk, body: { decision: 'APPROVE' } });
check('the test sanction is raised and approved', decided.json?.status === 'APPROVED', JSON.stringify(sanction.json ?? decided.json));
const tender = await call('/api/procurement/tenders', {
  method: 'POST', token: desk,
  body: { title: 'Vendor portal test tender', description: 'Ten servers for the data centre, installed.', department: 'IT Cell', category: 'IT Equipment', estimatedValue: 100000, submissionDeadline: day(10), openingDate: day(11), requestNo: sanction.json?.requestNo },
});
const tenderId = tender.json?.id;
const pub = tenderId ? await call(`/api/procurement/tenders/${tenderId}/publish`, { method: 'POST', token: desk }) : { status: 0 };
check('the desk floats a tender for the test', pub.status === 200, JSON.stringify(tender.json ?? pub.json));

const list = await call('/api/vendor/tenders', { token: vendor });
const seen = list.json?.tenders?.find((t) => t.id === tenderId);
check('the open tender is listed, in the vendor\'s category, and biddable', seen?.canBid === true && seen?.inMyCategories === true);

const blocked = await call(`/api/vendor/tenders/${tenderId}/bid`, { method: 'POST', token: pending, body: { technicalProposal: 'x'.repeat(40), financialQuote: 5000, declaration: true } });
check('a pending vendor may not bid', blocked.status === 403);

const noDecl = await call(`/api/vendor/tenders/${tenderId}/bid`, { method: 'POST', token: vendor, body: { technicalProposal: 'x'.repeat(40), financialQuote: 90000 } });
check('a bid without the declaration is refused', noDecl.status === 400);

const bid = await call(`/api/vendor/tenders/${tenderId}/bid`, { method: 'POST', token: vendor, body: { technicalProposal: 'Ten 2U rack servers, 3-year onsite warranty, installed and commissioned.', financialQuote: 90000, declaration: true } });
check('an empanelled vendor lodges a sealed bid', bid.status === 201);
check('a second bid on the same tender is refused', (await call(`/api/vendor/tenders/${tenderId}/bid`, { method: 'POST', token: vendor, body: { technicalProposal: 'x'.repeat(40), financialQuote: 1, declaration: true } })).status === 409);

const deskView = await call('/api/procurement/tenders', { token: desk });
const deskBid = deskView.json?.tenders?.find((t) => t.id === tenderId)?.bids?.[0];
check('the desk reads the technical proposal but not the sealed price', !!deskBid?.technicalProposal && deskBid?.financialQuote === null);

const mine = (await call('/api/vendor/tenders', { token: vendor })).json?.tenders?.find((t) => t.id === tenderId)?.myBid;
check('the vendor sees its own bid and may withdraw it', mine?.financialQuote === 90000 && mine?.canWithdraw === true);

const otherVendor = claim.json?.accessToken;
check("another vendor cannot withdraw this vendor's bid", (await call(`/api/vendor/bids/${mine?.id}/withdraw`, { method: 'POST', token: otherVendor })).status === 404);
check('the vendor withdraws its bid before the deadline', (await call(`/api/vendor/bids/${mine?.id}/withdraw`, { method: 'POST', token: vendor })).status === 204);

// ── Purchase orders — VND/002 holds the seeded order ──
const supplier = otherVendor;
check('a vendor with no orders sees none', ((await call('/api/vendor/orders', { token: vendor })).json?.orders ?? []).length === 0);
const orders = (await call('/api/vendor/orders', { token: supplier })).json?.orders ?? [];
check('the supplier sees its own order', orders.length === 1);
const order = orders[0];
check("another vendor cannot act on this vendor's order", (await call(`/api/vendor/orders/${order?.id}/acknowledge`, { method: 'POST', token: vendor })).status === 404);
check('an acknowledged order cannot be acknowledged again', (await call(`/api/vendor/orders/${order?.id}/acknowledge`, { method: 'POST', token: supplier })).status === 409);
check('no invoice before delivery', (await call(`/api/vendor/orders/${order?.id}/invoice`, { method: 'POST', token: supplier, body: { invoiceNo: 'INV-1', invoiceAmount: 10, invoiceDate: day(0) } })).status === 409);

const recv = await call(`/api/procurement/orders/${order?.id}/advance`, {
  method: 'POST', token: desk,
  body: { stage: 'DELIVERED', grnNo: 'GRN/TEST/1', delivered: (order?.items ?? []).map((i) => ({ itemId: i.id, quantity: i.quantity })) },
});
check('the desk receives the goods', recv.status === 200, JSON.stringify(recv.json));
check('an invoice above the order value is refused', (await call(`/api/vendor/orders/${order?.id}/invoice`, { method: 'POST', token: supplier, body: { invoiceNo: 'INV-9', invoiceAmount: order.totalAmount + 1, invoiceDate: day(0) } })).status === 400);
check('an invoice dated in the future is refused', (await call(`/api/vendor/orders/${order?.id}/invoice`, { method: 'POST', token: supplier, body: { invoiceNo: 'INV-9', invoiceAmount: order.totalAmount, invoiceDate: day(5) } })).status === 400);
check('the supplier invoices delivered goods', (await call(`/api/vendor/orders/${order?.id}/invoice`, { method: 'POST', token: supplier, body: { invoiceNo: 'INV-9', invoiceAmount: order.totalAmount, invoiceDate: day(0) } })).status === 200);
const deskOrder = ((await call('/api/procurement/orders', { token: desk })).json?.orders ?? []).find((o) => o.id === order?.id);
check('the desk sees the invoice and can pass the bill on it', deskOrder?.invoiceNo === 'INV-9' && deskOrder?.invoiceAmount === order.totalAmount);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

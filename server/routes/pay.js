// Payments core routes (docs/PAYMENTS_CORE.md §3.2).
// Public: the Bizpole Pay payment pages (/pay/<token>, /pay/l/<slug>), the provider return URL and webhooks.
// Merchant: create an order (POST /orders) and check a payment's status with the gateway.
// Public pages answer with HTML and never name the provider; callbacks are verified by the provider's signature.
const db = require("../db");
const { HttpError } = require("../http");
const { audit, clientIp } = require("../auth");
const core = require("../payments-core");
const pages = require("../pay-pages");

const WRITE = ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT"];
const fromError = (e) => (e instanceof HttpError || (e && e.status && e.status < 500) ? e : null);
const UI = { SUCCESS: "success", AUTHORIZED: "pending", PENDING: "pending", INITIATED: "pending" };

/* ---------- order page ---------- */
async function orderGet(ctx) {
  const o = await core.orderByToken(ctx.params.token);
  if (!o) return pages.statePage("notfound");
  const closed = core.orderClosed(o);
  if (closed) return pages.statePage(closed, o);
  if (o.lastStatus === "PENDING" || o.lastStatus === "AUTHORIZED") return pages.statePage("pending", o);
  try { await core.readyFor(o.merchantId, o.mode); }
  catch (e) { if (!fromError(e)) throw e; return pages.statePage("unavailable", o, { message: e.message }); }
  const failed = o.lastStatus && !["INITIATED", "SUCCESS"].includes(o.lastStatus);
  return pages.orderPage(o, { error: failed ? "Your last attempt didn't go through. You can try again." : null });
}

async function orderStart(ctx) {
  const o = await core.orderByToken(ctx.params.token);
  if (!o) return pages.statePage("notfound");
  const input = ctx.body || {};
  try {
    const form = await core.startAttempt(o, { name: input.name, email: input.email, phone: input.phone }, ctx.req);
    return pages.handoff(form, { name: o.brandName || o.merchantName, logo: o.logoData, color: o.primaryColor }, o.mode);
  } catch (e) {
    const err = fromError(e);
    if (!err) throw e;
    if (err.status === 400) return pages.orderPage({ ...o, customerName: input.name, customerEmail: input.email, customerPhone: input.phone }, { error: err.message });
    const closed = core.orderClosed(o);
    return closed ? pages.statePage(closed, o) : pages.statePage("unavailable", o, { message: err.message });
  }
}

/* ---------- provider return and webhooks ---------- */
async function callback(ctx) {
  const b = ctx.body || {};
  if (String(b.txnid || "") !== ctx.params.txnid) return pages.statePage("notfound");
  const src = String(b.status || "").toLowerCase() === "success" ? "SURL" : "FURL";
  const r = await core.handleCallback(src, b);
  if (!r.attempt) return pages.statePage("notfound");
  const t = r.attempt, status = r.invalid ? t.status : r.status;
  if (t.returnUrl) {
    const u = new URL(t.returnUrl);
    u.searchParams.set("order_id", t.orderId); u.searchParams.set("txnid", t.txnid); u.searchParams.set("status", UI[status] || "failed");
    return { __raw: true, status: 303, headers: { location: u.toString() }, body: "" };
  }
  return { __raw: true, status: 303, headers: { location: `/pay/${t.payToken}` }, body: "" };
}

// Always 200 once read, so the provider doesn't retry forever; problems are recorded on the InboundEvent.
async function webhook(ctx) {
  const id = String(ctx.params.connectionId || "").slice(0, 40);
  try { await core.handleCallback("PAYMENT_WEBHOOK", ctx.body || {}, { connectionId: (await db.one(`SELECT id FROM "ProviderConnection" WHERE id=$1`, [id]).catch(() => null)) ? id : null }); }
  catch (e) { console.error("[webhook]", id, e.message); }
  return { ok: true };
}

/* ---------- payment links ---------- */
async function linkBySlug(slug) {
  if (!/^[a-f0-9]{16,64}$/i.test(String(slug || ""))) return null;
  return db.one(
    `SELECT l.*, m."displayName" AS "merchantName", ct."displayName" AS "brandName", ct."logoData", ct."primaryColor",
            (SELECT COALESCE(sum(t."amountPaise"),0) FROM "Order" o JOIN "Transaction" t ON t."orderId"=o.id WHERE o."paymentLinkId"=l.id AND t.status='SUCCESS') AS paid,
            (SELECT count(*)::int FROM "Order" o JOIN "Transaction" t ON t."orderId"=o.id WHERE o."paymentLinkId"=l.id AND t.status='SUCCESS') AS payments
       FROM "PaymentLink" l JOIN "Merchant" m ON m.id = l."merchantId"
       LEFT JOIN "CheckoutTheme" ct ON ct."merchantId" = l."merchantId" AND ct.mode = l.mode
      WHERE l.slug = $1`, [slug]);
}
function linkClosed(l) {
  if (l.status === "INACTIVE") return "cancelled";
  const full = l.status === "PAID" || (l.maxPaymentsAllowed && l.payments >= l.maxPaymentsAllowed)
    || (!l.isAmountFilledByCustomer && l.amountPaise && Number(l.paid) >= Number(l.amountPaise));
  if (full) return "paid";
  if (l.status === "EXPIRED" || (l.expiresAt && l.expiresAt < new Date())) return "expired";
  return null;
}
const linkAsOrder = (l) => ({ ...l, productInfo: l.description, amountPaise: l.amountPaise || 0 });

async function linkGet(ctx) {
  const l = await linkBySlug(ctx.params.slug);
  if (!l) return pages.statePage("notfound");
  const closed = linkClosed(l);
  if (closed) return pages.statePage(closed, linkAsOrder(l));
  try { await core.readyFor(l.merchantId, l.mode); }
  catch (e) { if (!fromError(e)) throw e; return pages.statePage("unavailable", linkAsOrder(l), { message: e.message }); }
  return pages.linkPage(l);
}

async function linkPay(ctx) {
  const l = await linkBySlug(ctx.params.slug);
  if (!l) return pages.statePage("notfound");
  const closed = linkClosed(l);
  if (closed) return pages.statePage(closed, linkAsOrder(l));
  const b = ctx.body || {};
  try {
    let amount = Number(l.amountPaise);
    if (l.isAmountFilledByCustomer || l.isPartialPaymentAllowed) {
      amount = Math.round(Number(String(b.amount || "").replace(/[,₹\s]/g, "")) * 100);
      const remaining = l.amountPaise ? Number(l.amountPaise) - Number(l.paid) : core.MAX_PAISE;
      const min = l.isPartialPaymentAllowed ? Number(l.minAmountForCustomerPaise || 100) : 100;
      if (!Number.isInteger(amount) || amount < Math.min(min, remaining)) throw new HttpError(400, `Enter at least ₹${(Math.min(min, remaining) / 100).toFixed(2)}.`);
      if (amount > remaining) throw new HttpError(400, `Enter at most ₹${(remaining / 100).toFixed(2)}.`);
    }
    const cust = core.cleanCustomer(b, true);
    const o = await core.createOrder({ merchantId: l.merchantId, mode: l.mode, amountPaise: amount, description: String(l.description).slice(0, 100),
      customer: cust, receipt: l.invoiceNumber, paymentLinkId: l.id });
    const full = await core.orderByToken(o.payToken);
    const form = await core.startAttempt(full, cust, ctx.req);
    return pages.handoff(form, { name: l.brandName || l.merchantName, logo: l.logoData, color: l.primaryColor }, l.mode);
  } catch (e) {
    const err = fromError(e);
    if (!err) throw e;
    if (err.status === 400) return pages.linkPage(l, { error: err.message, values: b });
    return pages.statePage("unavailable", linkAsOrder(l), { message: err.message });
  }
}

/* ---------- merchant ---------- */
async function createOrder(ctx) {
  const { auth, mode, body } = ctx;
  const b = body || {};
  const o = await core.createOrder({ merchantId: auth.merchantId, mode, amountPaise: b.amount, description: b.description,
    customer: { name: b.name, email: b.email, phone: b.phone }, receipt: b.receipt, returnUrl: b.returnUrl });
  await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "order.created", entity: "Order", entityId: o.id,
    ip: clientIp(ctx.req), meta: { amount: Math.round(Number(b.amount)) } });
  return { orderId: o.id, checkoutUrl: `${core.baseUrl(ctx.req)}/pay/${o.payToken}` };
}

async function verifyTxn(ctx) {
  const r = await core.verify(ctx.auth.merchantId, ctx.mode, ctx.params.txnid);
  await audit(db, { merchantId: ctx.auth.merchantId, userId: ctx.auth.user.id, mode: ctx.mode, action: "transaction.status_checked", entity: "Transaction",
    entityId: r.txnid, ip: clientIp(ctx.req), meta: { status: r.status, found: r.found } });
  return r;
}

module.exports = [
  ["GET", "/pay/l/:slug", linkGet, { public: true }],
  ["POST", "/pay/l/:slug", linkPay, { public: true, form: true }],
  ["POST", "/pay/callback/:txnid", callback, { public: true, form: true }],
  ["GET", "/pay/:token", orderGet, { public: true }],
  ["POST", "/pay/:token/start", orderStart, { public: true, form: true }],
  ["POST", "/webhooks/:connectionId", webhook, { public: true, form: true }],
  ["POST", "/orders", createOrder, { roles: WRITE }],
  ["POST", "/transactions/:txnid/verify", verifyTxn, { roles: WRITE }],
];

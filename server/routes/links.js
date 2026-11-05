// Payment links. Rows live in "PaymentLink"; payments against a link are Orders with paymentLinkId
// whose Transactions reached SUCCESS. Each link is a Bizpole Pay page, /pay/l/<slug> (server/routes/pay.js), so it
// works with whichever provider connection is active. No messaging provider exists, so there is no send route;
// the page disables SMS / email / WhatsApp sending.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { methodLabel, num } = require("../shape");
const crypto = require("node:crypto");
const core = require("../payments-core");

const MAX_PAISE = 50000000; // ₹5,00,000
const INVOICE = /^[A-Za-z0-9\-_/]{1,30}$/;
const NAME = /^[\p{L} .'-]{2,60}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Status shown in the UI: INACTIVE → DEACTIVATED; otherwise derived from successful payments and expiry.
function uiStatus(l, paid, count) {
  if (l.status === "INACTIVE") return "DEACTIVATED";
  const fullyPaid = l.status === "PAID"
    || (!l.isAmountFilledByCustomer && l.amountPaise && paid >= l.amountPaise)
    || (l.maxPaymentsAllowed && count >= l.maxPaymentsAllowed);
  if (fullyPaid) return "PAID";
  if (l.status === "EXPIRED" || (l.expiresAt && l.expiresAt < new Date())) return "EXPIRED";
  return paid > 0 || l.status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "ACTIVE";
}

// base = public site address (core.baseUrl); the link URL is built from it, never stored.
async function list(merchantId, mode, id = null, base = "") {
  const links = await db.query(
    `SELECT id, "invoiceNumber", url, description, "amountPaise", "isAmountFilledByCustomer", "isPartialPaymentAllowed",
            "minAmountForCustomerPaise", "maxPaymentsAllowed", "customerName", "customerEmail", "customerPhone",
            status, "payuActive", slug, "expiresAt", "createdAt"
       FROM "PaymentLink" WHERE "merchantId"=$1 AND mode=$2 ${id ? "AND id=$3" : ""}
      ORDER BY "createdAt" DESC LIMIT 5000`,
    id ? [merchantId, mode, id] : [merchantId, mode]
  );
  if (!links.length) return [];
  const pays = await db.query(
    `SELECT o."paymentLinkId" AS lid, t.txnid, t.mihpayid, t."amountPaise", t.method, COALESCE(t."completedAt", t."createdAt") AS at
       FROM "Order" o JOIN "Transaction" t ON t."orderId" = o.id
      WHERE o."merchantId"=$1 AND o.mode=$2 AND o."paymentLinkId" = ANY($3) AND t.status='SUCCESS'
      ORDER BY at DESC`,
    [merchantId, mode, links.map((l) => l.id)]
  );
  return links.map((l) => {
    const payments = pays.filter((p) => p.lid === l.id).map((p) => ({
      id: p.txnid, mihpayid: p.mihpayid || "—", amount: num(p.amountPaise), mode: methodLabel(p.method), date: p.at,
    }));
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    return {
      id: l.id, invoiceNumber: l.invoiceNumber, url: l.slug ? `${base}/pay/l/${l.slug}` : l.url || null, desc: l.description,
      amount: l.isAmountFilledByCustomer ? null : num(l.amountPaise), customerAmount: l.isAmountFilledByCustomer,
      partial: l.isPartialPaymentAllowed, minAmount: num(l.minAmountForCustomerPaise), maxPayments: l.maxPaymentsAllowed,
      customer: l.customerName || "—", email: l.customerEmail || "", phone: l.customerPhone || "",
      status: uiStatus(l, paid, payments.length), payuActive: l.payuActive, expiresAt: l.expiresAt, created: l.createdAt, payments,
    };
  });
}

async function owned(ctx) {
  const l = await db.one(`SELECT id, status, "expiresAt" FROM "PaymentLink" WHERE id=$1 AND "merchantId"=$2 AND mode=$3`,
    [ctx.params.id, ctx.auth.merchantId, ctx.mode]);
  if (!l) fail(404, "Payment link not found.");
  return l;
}

function expiryFrom(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (isNaN(d)) fail(400, "Expiry date is not valid.");
  if (d < new Date()) fail(400, "Expiry date can’t be in the past.");
  return d;
}

module.exports = [
  ["GET", "/links", async (ctx) => ({ links: await list(ctx.auth.merchantId, ctx.mode, null, core.baseUrl(ctx.req)) })],

  ["POST", "/links", async (ctx) => {
    const { auth, mode, body } = ctx;
    const desc = String(body.desc || "").trim();
    if (!desc) fail(400, "Add a description so the customer knows what they’re paying for.");
    if (desc.length > 120) fail(400, "Description is too long (120 characters max).");
    const customerAmount = !!body.customerAmount;
    let amount = null, minAmount = null, partial = false;
    if (!customerAmount) {
      amount = Math.round(Number(body.amount));
      if (!Number.isInteger(amount) || amount < 100) fail(400, "Enter an amount of at least ₹1.00.");
      if (amount > MAX_PAISE) fail(400, "Payment links accept up to ₹5,00,000.");
      if (body.partial) {
        partial = true;
        minAmount = Math.round(Number(body.minAmount));
        if (!Number.isInteger(minAmount) || minAmount < 100) fail(400, "Enter a minimum of at least ₹1.00.");
        if (minAmount >= amount) fail(400, "Minimum must be less than the full amount.");
      }
    }
    const max = Number(body.maxPayments);
    if (!Number.isInteger(max) || max < 1 || max > 1000) fail(400, "Max payments must be a whole number from 1 to 1000.");
    if (partial && max < 2) fail(400, "Partial payments need at least 2 payments.");
    const expiresAt = expiryFrom(body.expiresAt);
    const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").replace(/[\s-]/g, "").replace(/^(\+91|0)/, "");
    if (name && !NAME.test(name)) fail(400, "Customer name: use letters, spaces, . ' or - only.");
    if (phone && !/^[6-9]\d{9}$/.test(phone)) fail(400, "Enter a valid 10-digit Indian mobile number.");
    if (email && !EMAIL.test(email)) fail(400, "Enter a valid email address.");
    let invoice = String(body.invoiceNumber || "").trim();
    if (invoice && !INVOICE.test(invoice)) fail(400, "Invoice number: use letters, numbers, - _ or / only.");

    const cred = (await core.readyFor(auth.merchantId, mode)).account; // 409 with a readable message when payments can't be taken
    if (!invoice) invoice = ("PL-" + Date.now().toString(36) + db.id().slice(-4)).toUpperCase().slice(0, 30);
    const dup = await db.one(`SELECT 1 FROM "PaymentLink" WHERE "credentialId"=$1 AND "invoiceNumber"=$2`, [cred.id, invoice]);
    if (dup) fail(409, "This invoice number is already used by another link.");

    const id = db.id();
    await db.query(
      `INSERT INTO "PaymentLink" (id,"merchantId",mode,"credentialId","invoiceNumber",url,description,"amountPaise","isAmountFilledByCustomer",
         "isPartialPaymentAllowed","minAmountForCustomerPaise","maxPaymentsAllowed","customerName","customerEmail","customerPhone",
         status,"payuActive",slug,"expiresAt","createdBy","updatedAt")
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,'ACTIVE',NULL,$17,$15,$16,now())`,
      [id, auth.merchantId, mode, cred.id, invoice, desc, amount, customerAmount, partial, minAmount, max,
        name || null, email || null, phone || null, expiresAt, auth.user.id, crypto.randomBytes(16).toString("hex")]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "payment_link.created", entity: "PaymentLink", entityId: id,
      ip: clientIp(ctx.req), meta: { invoiceNumber: invoice, amount, customerAmount } });
    return (await list(auth.merchantId, mode, id, core.baseUrl(ctx.req)))[0];
  }, { roles: ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT"] }], // docs/MODULES.md: create payment link

  // Extend (or set) expiry. An EXPIRED link becomes ACTIVE again; deactivated links stay deactivated.
  ["PATCH", "/links/:id", async (ctx) => {
    const l = await owned(ctx);
    if (l.status === "INACTIVE") fail(409, "This link is deactivated and can’t be changed.");
    if (l.status === "PAID") fail(409, "This link is already paid.");
    const expiresAt = expiryFrom(ctx.body.expiresAt);
    if (!expiresAt) fail(400, "Choose a new expiry date.");
    await db.query(
      `UPDATE "PaymentLink" SET "expiresAt"=$2, status=CASE WHEN status='EXPIRED' THEN 'ACTIVE'::"PaymentLinkStatus" ELSE status END, "updatedAt"=now()
        WHERE id=$1`,
      [l.id, expiresAt]
    );
    await audit(db, { merchantId: ctx.auth.merchantId, userId: ctx.auth.user.id, mode: ctx.mode, action: "payment_link.expiry_changed", entity: "PaymentLink",
      entityId: l.id, ip: clientIp(ctx.req), meta: { from: l.expiresAt, to: expiresAt } });
    return (await list(ctx.auth.merchantId, ctx.mode, l.id, core.baseUrl(ctx.req)))[0];
  }],

  ["POST", "/links/:id/deactivate", async (ctx) => {
    const l = await owned(ctx);
    if (l.status === "INACTIVE") fail(409, "This link is already deactivated.");
    await db.query(`UPDATE "PaymentLink" SET status='INACTIVE', "updatedAt"=now() WHERE id=$1`, [l.id]);
    await audit(db, { merchantId: ctx.auth.merchantId, userId: ctx.auth.user.id, mode: ctx.mode, action: "payment_link.deactivated", entity: "PaymentLink",
      entityId: l.id, ip: clientIp(ctx.req) });
    return (await list(ctx.auth.merchantId, ctx.mode, l.id, core.baseUrl(ctx.req)))[0];
  }],

];

module.exports.list = list;

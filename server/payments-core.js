// Payments core (docs/PAYMENTS_CORE.md): orders, payment attempts, provider returns and webhooks, status checks.
// Provider-neutral: the provider comes from the connection active in the mode (server/providers/config.js) and its
// definition's `gateway` (server/providers/<type>.js). An attempt keeps the connection and account it started with,
// so switching the active connection only affects new attempts.
const crypto = require("node:crypto");
const db = require("./db");
const { fail } = require("./http");
const { decrypt } = require("./secrets");
const registry = require("./providers");
const config = require("./providers/config");

const MAX_PAISE = 50000000; // ₹5,00,000 per payment
const FINAL = ["SUCCESS", "FAILED", "USER_CANCELLED", "BOUNCED", "DROPPED", "AUTO_REFUNDED"];
const token = () => crypto.randomBytes(16).toString("base64url");
// txnid: unique, ≤25 chars, letters and digits only.
const newTxnid = () => ("BP" + Date.now().toString(36) + crypto.randomBytes(6).toString("hex")).toUpperCase().slice(0, 25);

// Public base URL for links and provider return URLs: APP_URL, else the request's own host.
function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = (req && req.headers) || {};
  const proto = String(h["x-forwarded-proto"] || "").split(",")[0] || (h.host && /^(localhost|127\.0\.0\.1)/.test(h.host) ? "http" : "https");
  return `${proto}://${h["x-forwarded-host"] || h.host || "localhost"}`;
}

/* ---------- the account and settings a new payment uses ---------- */
// Active connection for the mode, switched on, with a gateway, and the organisation's account for that provider.
// Messages never name the provider (test/white-label.test.js).
async function readyFor(merchantId, mode, c = db) {
  const cfg = await config.resolve(mode);
  const paused = mode === "LIVE" ? "Live payments are paused on Bizpole Pay right now. Contact Bizpole support." : "Test payments are paused on Bizpole Pay right now. Contact Bizpole support.";
  if (!cfg || !cfg.enabled) fail(409, paused);
  const p = registry.get(cfg.provider);
  if (!p.gateway) fail(409, "Payments are not available right now. Contact Bizpole support.");
  const acc = await (c.one || db.one).call(c,
    `SELECT id, "merchantKey", "saltEnc", "saltVersion" FROM "PayuCredential"
      WHERE "merchantId"=$1 AND mode=$2 AND provider=$3 AND "isDefault" AND status='ACTIVE' LIMIT 1`, [merchantId, mode, p.id]);
  if (!acc) fail(409, mode === "LIVE" ? "Live mode is not active yet. Finish onboarding to go live." : "No test payment account is set up for your business yet. Contact Bizpole support.");
  const account = { id: acc.id, key: acc.merchantKey, salt: decrypt(acc.saltEnc), saltVersion: acc.saltVersion };
  if (p.gateway.supportsAccount && !p.gateway.supportsAccount(account)) fail(409, "This payment account can't take payments here yet. Contact Bizpole support.");
  return { cfg, p, account };
}

/* ---------- orders ---------- */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME = /^[\p{L} .'-]{2,60}$/u;
function cleanCustomer(x = {}, required = false) {
  const name = String(x.name || "").trim().replace(/\s+/g, " ");
  const email = String(x.email || "").trim().toLowerCase();
  const phone = String(x.phone || "").replace(/[\s-]/g, "").replace(/^(\+91|0)/, "");
  if (name && !NAME.test(name)) fail(400, "Name: use letters, spaces, . ' or - only.", { field: "name" });
  if (email && !EMAIL.test(email)) fail(400, "Enter a valid email address.", { field: "email" });
  if (phone && !/^[6-9]\d{9}$/.test(phone)) fail(400, "Enter a valid 10-digit mobile number.", { field: "phone" });
  if (required) {
    if (!name) fail(400, "Enter your name.", { field: "name" });
    if (!email) fail(400, "Enter your email address.", { field: "email" });
    if (!phone) fail(400, "Enter your mobile number.", { field: "phone" });
  }
  return { name, email, phone };
}
function cleanReturnUrl(v, mode) {
  const s = String(v || "").trim();
  if (!s) return null;
  let u; try { u = new URL(s); } catch { fail(400, "Return URL must be a full https:// address.", { field: "returnUrl" }); }
  const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  if (!(u.protocol === "https:" || (mode === "TEST" && local && u.protocol === "http:"))) fail(400, "Return URL must use https.", { field: "returnUrl" });
  if (u.username || u.password) fail(400, "Return URL can't contain a user name or password.", { field: "returnUrl" });
  return u.toString().slice(0, 500);
}

// Creates an order the customer pays on /pay/<token>. Checks the mode can take payments first.
async function createOrder({ merchantId, mode, amountPaise, description, customer, receipt, returnUrl, paymentLinkId = null, expiresAt = null }, c = db) {
  const amount = Math.round(Number(amountPaise));
  if (!Number.isInteger(amount) || amount < 100) fail(400, "Enter an amount of at least ₹1.00.", { field: "amount" });
  if (amount > MAX_PAISE) fail(400, "A single payment can be up to ₹5,00,000.", { field: "amount" });
  const desc = String(description || "").trim();
  if (!desc) fail(400, "Add a description so the customer knows what they're paying for.", { field: "description" });
  if (desc.length > 100) fail(400, "Description is too long (100 characters max).", { field: "description" });
  const cust = cleanCustomer(customer);
  const rec = receipt ? String(receipt).trim().slice(0, 40) : null;
  const ret = cleanReturnUrl(returnUrl, mode);
  await readyFor(merchantId, mode, c);

  let customerId = null;
  if (cust.name) {
    customerId = db.id();
    await (c.q || c.query).call(c, `INSERT INTO "Customer" (id,"merchantId",mode,name,email,phone) VALUES ($1,$2,$3,$4,$5,$6)`,
      [customerId, merchantId, mode, cust.name, cust.email || null, cust.phone || null]);
  }
  const id = db.id(), payToken = token();
  await (c.q || c.query).call(c,
    `INSERT INTO "Order" (id,"merchantId",mode,"customerId","paymentLinkId",receipt,"amountPaise","productInfo","returnUrl","payToken","expiresAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
    [id, merchantId, mode, customerId, paymentLinkId, rec, amount, desc, ret, payToken, expiresAt]);
  return { id, payToken };
}

// Order + merchant branding for the public pages. Null when the token is unknown.
async function orderByToken(payToken) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(payToken || ""))) return null;
  return db.one(
    `SELECT o.*, m."displayName" AS "merchantName", ct."displayName" AS "brandName", ct."logoData", ct."primaryColor",
            cu.name AS "customerName", cu.email AS "customerEmail", cu.phone AS "customerPhone",
            (SELECT t.status FROM "Transaction" t WHERE t."orderId" = o.id ORDER BY t."createdAt" DESC LIMIT 1) AS "lastStatus",
            (SELECT t.txnid FROM "Transaction" t WHERE t."orderId" = o.id ORDER BY t."createdAt" DESC LIMIT 1) AS "lastTxnid"
       FROM "Order" o JOIN "Merchant" m ON m.id = o."merchantId"
       LEFT JOIN "CheckoutTheme" ct ON ct."merchantId" = o."merchantId" AND ct.mode = o.mode
       LEFT JOIN "Customer" cu ON cu.id = o."customerId"
      WHERE o."payToken" = $1`, [payToken]);
}
const orderClosed = (o) => (o.status === "PAID" || o.status === "PARTIALLY_REFUNDED" || o.status === "REFUNDED" ? "paid"
  : o.status === "CANCELLED" ? "cancelled" : o.status === "EXPIRED" || (o.expiresAt && o.expiresAt < new Date()) ? "expired" : null);

/* ---------- attempts ---------- */
// Starts a payment attempt for an order and returns the provider's hosted-page form.
async function startAttempt(order, customerInput, req) {
  const closed = orderClosed(order);
  if (closed) fail(409, closed === "paid" ? "This payment is already complete." : closed === "expired" ? "This payment request has expired." : "This payment request was cancelled.");
  const cust = cleanCustomer({ name: customerInput.name || order.customerName, email: customerInput.email || order.customerEmail, phone: customerInput.phone || order.customerPhone }, true);
  const { cfg, p, account } = await readyFor(order.merchantId, order.mode);
  const txnid = newTxnid(), amount = p.gateway.amount(order.amountPaise);
  const returnUrl = `${baseUrl(req)}/api/pay/callback/${txnid}`;
  await db.tx(async (c) => {
    let customerId = order.customerId;
    if (customerId) await c.q(`UPDATE "Customer" SET name=$2, email=$3, phone=$4 WHERE id=$1`, [customerId, cust.name, cust.email, cust.phone]);
    else {
      customerId = db.id();
      await c.q(`INSERT INTO "Customer" (id,"merchantId",mode,name,email,phone) VALUES ($1,$2,$3,$4,$5,$6)`, [customerId, order.merchantId, order.mode, cust.name, cust.email, cust.phone]);
    }
    await c.q(`UPDATE "Order" SET status='ATTEMPTED', "customerId"=$2, "updatedAt"=now() WHERE id=$1 AND status IN ('CREATED','ATTEMPTED')`, [order.id, customerId]);
    const id = db.id();
    await c.q(
      `INSERT INTO "Transaction" (id,"merchantId",mode,"orderId","credentialId","connectionId",provider,txnid,"amountPaise","payuAmount",status,"updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INITIATED',now())`,
      [id, order.merchantId, order.mode, order.id, account.id, cfg.connection.virtual ? null : cfg.connection.id, p.id, txnid, order.amountPaise, amount]);
    await c.q(`INSERT INTO "TransactionEvent" (id,"transactionId","toStatus",note) VALUES ($1,$2,'INITIATED','Customer sent to the payment page')`, [db.id(), id]);
  });
  return p.gateway.checkoutForm(cfg, account, {
    txnid, amount, productInfo: order.productInfo, firstName: cust.name, email: cust.email, phone: cust.phone, returnUrl,
    udf1: order.udf1, udf2: order.udf2, udf3: order.udf3, udf4: order.udf4, udf5: order.udf5,
  });
}

/* ---------- returns, webhooks and status checks ---------- */
async function attemptByTxnid(txnid, c = db) {
  return (c.one || db.one).call(c,
    `SELECT t.*, cr."merchantKey", cr."saltEnc", cr."saltVersion", o."payToken", o."returnUrl", o.id AS "orderId"
       FROM "Transaction" t JOIN "PayuCredential" cr ON cr.id = t."credentialId" JOIN "Order" o ON o.id = t."orderId"
      WHERE t.txnid = $1`, [txnid]);
}
// Settings for follow-ups on an attempt: its own connection when known, else any connection of its provider type.
async function settingsFor(t) {
  if (t.connectionId) { try { return await config.resolve(t.mode, t.connectionId); } catch {} }
  return config.resolveType(t.mode, t.provider);
}
const accountOf = (t) => ({ id: t.credentialId, key: t.merchantKey, salt: decrypt(t.saltEnc), saltVersion: t.saltVersion });

// Fields stored with an inbound event: no hash, no full card number, nothing secret.
const STRIP = /^(hash|cardnum|card_no|cardhash|card_token|key|salt|.*cvv.*|.*expiry.*)$/i;
const cleanPayload = (b) => Object.fromEntries(Object.entries(b || {}).filter(([k]) => !STRIP.test(k)).map(([k, v]) => [k, String(v).slice(0, 500)]));

async function recordEvent({ source, mode, merchantId, connectionId, signatureValid, payload, dedupe }) {
  const id = db.id();
  const key = crypto.createHash("sha256").update(dedupe).digest("hex");
  const row = await db.one(
    `INSERT INTO "InboundEvent" (id,source,mode,"dedupeKey","merchantId","connectionId","signatureValid",payload,processing)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'RECEIVED') ON CONFLICT ("dedupeKey") DO NOTHING RETURNING id`,
    [id, source, mode, key, merchantId, connectionId, signatureValid, JSON.stringify(payload)]);
  return row ? row.id : null;
}
const finishEvent = (id, processing, error = null) =>
  id && db.query(`UPDATE "InboundEvent" SET processing=$2, error=$3, "processedAt"=now() WHERE id=$1`, [id, processing, error]);

// Applies a parsed provider result to an attempt and its order. Returns the attempt's status afterwards.
async function apply(txnid, r, { eventId = null, verified = false, note = null } = {}) {
  return db.tx(async (c) => {
    const t = await c.one(`SELECT * FROM "Transaction" WHERE txnid=$1 FOR UPDATE`, [txnid]);
    if (!t) return null;
    let next = r.status;
    // A successful payment only moves on to an automatic refund; late failure notices don't undo it.
    if (t.status === "SUCCESS" && next !== "SUCCESS" && next !== "AUTO_REFUNDED") next = t.status;
    const changed = next !== t.status;
    const done = FINAL.includes(next);
    await c.q(
      `UPDATE "Transaction" SET status=$2, mihpayid=COALESCE($3, mihpayid), "payuStatus"=COALESCE($4,"payuStatus"), "unmappedStatus"=COALESCE($5,"unmappedStatus"),
              method=COALESCE($6::"PaymentMethod", method), "payuMode"=COALESCE($7,"payuMode"), bankcode=COALESCE($8,bankcode), "pgType"=COALESCE($9,"pgType"),
              "bankRefNum"=COALESCE($10,"bankRefNum"), "errorCode"=$11, "errorMessage"=$12, "cardMasked"=COALESCE($13,"cardMasked"), "vpaMasked"=COALESCE($14,"vpaMasked"),
              "additionalChargesPaise"=COALESCE($15,"additionalChargesPaise"), "netAmountDebitPaise"=COALESCE($16,"netAmountDebitPaise"), "discountPaise"=COALESCE($17,"discountPaise"),
              "completedAt"=CASE WHEN $18 AND "completedAt" IS NULL THEN now() ELSE "completedAt" END,
              "verifiedAt"=CASE WHEN $19 THEN now() ELSE "verifiedAt" END, "updatedAt"=now()
        WHERE id=$1`,
      [t.id, next, r.providerPaymentId, r.rawStatus, r.unmappedStatus, r.method, r.providerMode, r.bankcode, r.pgType, r.bankRefNum,
        next === "SUCCESS" ? null : r.errorCode, next === "SUCCESS" ? null : r.errorMessage, r.cardMasked, r.vpaMasked,
        r.additionalChargesPaise, r.netAmountDebitPaise, r.discountPaise, done, verified]);
    if (changed)
      await c.q(`INSERT INTO "TransactionEvent" (id,"transactionId","fromStatus","toStatus","payuStatus","unmappedStatus","inboundEventId",note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [db.id(), t.id, t.status, next, r.rawStatus, r.unmappedStatus, eventId, note]);
    if (next === "SUCCESS") await c.q(`UPDATE "Order" SET status='PAID', "updatedAt"=now() WHERE id=$1 AND status IN ('CREATED','ATTEMPTED')`, [t.orderId]);
    return next;
  });
}

// A provider return (customer's browser) or webhook. Returns { attempt, status } or { attempt: null } when unknown.
async function handleCallback(source, body, { connectionId = null } = {}) {
  const txnid = String((body && body.txnid) || "").slice(0, 25);
  const t = txnid ? await attemptByTxnid(txnid) : null;
  const status = String((body && body.status) || ""), pid = String((body && body.mihpayid) || "");
  const dedupe = `${source}|${txnid}|${pid}|${status}|${(body && body.unmappedstatus) || ""}`;
  if (!t) {
    const ev = await recordEvent({ source, mode: "TEST", merchantId: null, connectionId, signatureValid: null, payload: cleanPayload(body), dedupe });
    await finishEvent(ev, "FAILED", "Unknown transaction");
    return { attempt: null };
  }
  const p = registry.get(t.provider), account = accountOf(t);
  const sigOk = p.gateway.verifyCallback(body, account);
  const ev = await recordEvent({ source, mode: t.mode, merchantId: t.merchantId, connectionId: connectionId || t.connectionId, signatureValid: sigOk, payload: cleanPayload(body), dedupe });
  if (!ev) return { attempt: t, status: t.status, duplicate: true };
  if (!sigOk) { await finishEvent(ev, "SIGNATURE_INVALID"); return { attempt: t, status: t.status, invalid: true }; }

  let r = p.gateway.parseCallback(body);
  if (r.amount == null || Math.round(Number(r.amount) * 100) !== Number(t.amountPaise)) {
    await finishEvent(ev, "FAILED", `Amount mismatch: expected ${t.payuAmount}, got ${r.amount}`);
    return { attempt: t, status: t.status, invalid: true };
  }
  // Confirm a reported success with the provider before marking the order paid; fall back to the signed callback.
  let verified = false;
  if (r.status === "SUCCESS" || r.status === "PENDING") {
    try {
      const cfg = await settingsFor(t);
      const s = cfg ? await p.gateway.fetchStatus(cfg, account, t.txnid) : null;
      if (s && Math.round(Number(s.amount) * 100) === Number(t.amountPaise)) { r = { ...r, ...s }; verified = true; }
    } catch (e) { console.error("[payments] status check failed", t.txnid, e.message); }
  }
  const next = await apply(t.txnid, r, { eventId: ev, verified, note: source === "PAYMENT_WEBHOOK" ? "Webhook" : "Customer returned" });
  await finishEvent(ev, "PROCESSED");
  return { attempt: t, status: next };
}

// "Check status with gateway" and automatic re-checks.
async function verify(merchantId, mode, txnid) {
  const t = await attemptByTxnid(String(txnid || ""));
  if (!t || t.merchantId !== merchantId || t.mode !== mode) fail(404, "Payment not found.");
  const p = registry.get(t.provider);
  if (!p.gateway) fail(409, "Status checks are not available for this payment.");
  const cfg = await settingsFor(t);
  if (!cfg) fail(409, "Payments are not available right now. Contact Bizpole support.");
  let s;
  try { s = await p.gateway.fetchStatus(cfg, accountOf(t), t.txnid); }
  catch { fail(502, "Couldn't reach the payment gateway. Try again in a minute."); }
  const ev = await recordEvent({ source: "POLL", mode: t.mode, merchantId, connectionId: t.connectionId, signatureValid: null,
    payload: s ? { status: s.rawStatus, unmappedstatus: s.unmappedStatus, txnid: t.txnid } : { txnid: t.txnid, notFound: "1" }, dedupe: `POLL|${t.txnid}|${Date.now()}` });
  if (!s) {
    // The gateway has no record: the customer never completed the payment page.
    const next = ["INITIATED", "PENDING"].includes(t.status) && Date.now() - new Date(t.createdAt) > 30 * 60000
      ? await apply(t.txnid, { status: "DROPPED", errorMessage: "No payment was made on the payment page." }, { eventId: ev, verified: true, note: "Status check" })
      : t.status;
    await finishEvent(ev, "PROCESSED");
    return { txnid: t.txnid, status: next, found: false };
  }
  if (Math.round(Number(s.amount) * 100) !== Number(t.amountPaise)) {
    await finishEvent(ev, "FAILED", "Amount mismatch");
    fail(409, "The gateway reports a different amount for this payment. Contact Bizpole support.");
  }
  const next = await apply(t.txnid, s, { eventId: ev, verified: true, note: "Status check" });
  await finishEvent(ev, "PROCESSED");
  return { txnid: t.txnid, status: next, found: true };
}

module.exports = { baseUrl, readyFor, createOrder, orderByToken, orderClosed, startAttempt, handleCallback, verify, cleanCustomer, attemptByTxnid, MAX_PAISE };

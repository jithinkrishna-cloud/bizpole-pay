// Subscriptions: plans, mandates (UPI Autopay / card SI / net-banking e-mandate), pre-debit notices and recurring debits.
// Plans are ours. Mandates exist only after a PayU registration payment; registration, pre-debit notices and
// revocation all go through PayU's recurring APIs, which are not connected yet, so those calls fail clearly.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { num } = require("../shape");
const payu = require("../payu");

const CYCLES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "ADHOC"];

async function plans(merchantId, mode) {
  const rows = await db.query(
    `SELECT id, name, "amountPaise", "billingCycle", "billingInterval", "totalCycles", active, "createdAt"
       FROM "SubscriptionPlan" WHERE "merchantId"=$1 AND mode=$2 ORDER BY "createdAt"`,
    [merchantId, mode]
  );
  return rows.map((p) => ({ id: p.id, name: p.name, amount: num(p.amountPaise), cycle: p.billingCycle, interval: p.billingInterval, totalCycles: p.totalCycles, active: p.active, createdAt: p.createdAt }));
}

async function mandates(merchantId, mode) {
  const [ms, notices, debits] = await Promise.all([
    db.query(
      `SELECT m.id, m."planId", m."registrationTxnId", rt.txnid AS "regTxnid", m."authPayuId", m.method, m."maxAmountPaise", m."billingCycle", m."billingInterval",
              m."billingRule", m."billingLimit", to_char(m."startDate",'YYYY-MM-DD') AS "startDate", to_char(m."endDate",'YYYY-MM-DD') AS "endDate", m.status, m."payuStatus", m."nextDebitAt", m."createdAt",
              cu.name, cu.email, cu.phone
         FROM "Mandate" m JOIN "Customer" cu ON cu.id = m."customerId" JOIN "Transaction" rt ON rt.id = m."registrationTxnId"
        WHERE m."merchantId"=$1 AND m.mode=$2 ORDER BY m."createdAt" DESC LIMIT 5000`,
      [merchantId, mode]
    ),
    db.query(
      `SELECT n.id, n."mandateId", n."requestId", to_char(n."debitDate",'YYYY-MM-DD') AS "debitDate", n."amountPaise", n."mandateSeqNo", n."payuStatus", n."invoiceStatus", n."sentAt",
              (d.id IS NOT NULL) AS "hasDebit"
         FROM "PreDebitNotification" n JOIN "Mandate" m ON m.id = n."mandateId" LEFT JOIN "RecurringDebit" d ON d."preDebitId" = n.id
        WHERE m."merchantId"=$1 AND m.mode=$2 ORDER BY n."debitDate"`,
      [merchantId, mode]
    ),
    db.query(
      `SELECT d."mandateId", d."cycleNumber", d."createdAt", t.txnid, t."amountPaise", t.status, t."errorMessage", t."completedAt", n."requestId"
         FROM "RecurringDebit" d JOIN "Mandate" m ON m.id = d."mandateId" JOIN "Transaction" t ON t.id = d."transactionId"
         JOIN "PreDebitNotification" n ON n.id = d."preDebitId"
        WHERE m."merchantId"=$1 AND m.mode=$2 ORDER BY d."cycleNumber"`,
      [merchantId, mode]
    ),
  ]);
  return ms.map((m) => ({
    id: m.id, planId: m.planId, name: m.name, email: m.email || "", phone: m.phone || "", method: m.method, maxAmount: num(m.maxAmountPaise),
    cycle: m.billingCycle, interval: m.billingInterval, billingRule: m.billingRule, billingLimit: m.billingLimit, status: m.status, payuStatus: m.payuStatus,
    createdAt: m.createdAt, startDate: m.startDate, endDate: m.endDate, registrationTxnId: m.regTxnid, authPayuId: m.authPayuId, nextDebitAt: m.nextDebitAt,
    notices: notices.filter((n) => n.mandateId === m.id).map((n) => ({
      requestId: n.requestId, debitDate: n.debitDate, amount: num(n.amountPaise), seq: n.mandateSeqNo, payuStatus: n.payuStatus, invoiceStatus: n.invoiceStatus,
      sentAt: n.sentAt, hasDebit: n.hasDebit,
    })),
    debits: debits.filter((d) => d.mandateId === m.id).map((d) => ({
      cycle: d.cycleNumber, date: d.completedAt || d.createdAt, amount: num(d.amountPaise), status: d.status, txnid: d.txnid, requestId: d.requestId, reason: d.errorMessage || "",
    })),
  }));
}

async function ownMandate(auth, mode, id) {
  const m = await db.one(`SELECT id, status FROM "Mandate" WHERE id=$1 AND "merchantId"=$2 AND mode=$3`, [id, auth.merchantId, mode]);
  if (!m) fail(404, "Mandate not found.");
  return m;
}

module.exports = [
  ["GET", "/subscriptions", async ({ auth, mode }) => {
    const [ps, ms] = await Promise.all([plans(auth.merchantId, mode), mandates(auth.merchantId, mode)]);
    return { plans: ps, mandates: ms };
  }],

  ["POST", "/subscriptions/plans", async (ctx) => {
    const { auth, mode, body } = ctx;
    const name = String(body.name || "").trim().slice(0, 60);
    const amount = Math.round(Number(body.amount));
    const cycle = String(body.cycle || "");
    const interval = cycle === "ADHOC" ? 1 : Number(body.interval);
    const tot = body.totalCycles == null || body.totalCycles === "" ? null : Number(body.totalCycles);
    if (!name) fail(400, "Enter a plan name.");
    if (!CYCLES.includes(cycle)) fail(400, "Choose a billing cycle.");
    if (!(Number.isInteger(amount) && amount >= 100)) fail(400, "Amount must be at least ₹1.00.");
    if (amount > 1500000000) fail(400, "Amount is above the mandate limit.");
    if (!(Number.isInteger(interval) && interval >= 1 && interval <= 365)) fail(400, "Interval must be a whole number from 1 to 365.");
    if (tot !== null && !(Number.isInteger(tot) && tot >= 1 && tot <= 999)) fail(400, "Total cycles must be a whole number from 1 to 999, or blank.");
    const dup = await db.one(`SELECT 1 FROM "SubscriptionPlan" WHERE "merchantId"=$1 AND mode=$2 AND lower(name)=lower($3)`, [auth.merchantId, mode, name]);
    if (dup) fail(409, "A plan with this name already exists.");
    const id = db.id();
    await db.query(
      `INSERT INTO "SubscriptionPlan" (id,"merchantId",mode,name,"amountPaise","billingCycle","billingInterval","totalCycles",active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [id, auth.merchantId, mode, name, amount, cycle, interval, tot]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "subscription.plan_created", entity: "SubscriptionPlan", entityId: id, ip: clientIp(ctx.req), meta: { amount, cycle, interval } });
    return (await plans(auth.merchantId, mode)).find((p) => p.id === id);
  }],

  // Activate / deactivate a plan (stops new sign-ups; existing mandates are untouched).
  ["PATCH", "/subscriptions/plans/:id", async (ctx) => {
    const { auth, mode, params, body } = ctx;
    if (typeof body.active !== "boolean") fail(400, "Send active: true or false.");
    const row = await db.one(
      `UPDATE "SubscriptionPlan" SET active=$4 WHERE id=$1 AND "merchantId"=$2 AND mode=$3 RETURNING id`,
      [params.id, auth.merchantId, mode, body.active]
    );
    if (!row) fail(404, "Plan not found.");
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: body.active ? "subscription.plan_activated" : "subscription.plan_deactivated", entity: "SubscriptionPlan", entityId: row.id, ip: clientIp(ctx.req) });
    return (await plans(auth.merchantId, mode)).find((p) => p.id === row.id);
  }],

  // A mandate is created from a PayU SI registration payment (si=1). That flow is not connected yet.
  ["POST", "/subscriptions/mandates", async ({ auth, mode }) => {
    await payu.requireCredential(auth.merchantId, mode);
    fail(501, "Mandate registration isn't connected yet. Customers can't register a mandate until it is.");
  }],

  // Pause / resume: our own scheduling switch. No pre-debit notice or debit is raised for a paused mandate.
  ["POST", "/subscriptions/mandates/:id/pause", async (ctx) => {
    const { auth, mode, params } = ctx;
    const m = await ownMandate(auth, mode, params.id);
    if (m.status !== "ACTIVE") fail(409, "Only an active mandate can be paused.");
    await db.query(`UPDATE "Mandate" SET status='PAUSED', "updatedAt"=now() WHERE id=$1`, [m.id]);
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "mandate.paused", entity: "Mandate", entityId: m.id, ip: clientIp(ctx.req) });
    return { ok: true };
  }],
  ["POST", "/subscriptions/mandates/:id/resume", async (ctx) => {
    const { auth, mode, params } = ctx;
    const m = await ownMandate(auth, mode, params.id);
    if (m.status !== "PAUSED") fail(409, "Only a paused mandate can be resumed.");
    await db.query(`UPDATE "Mandate" SET status='ACTIVE', "updatedAt"=now() WHERE id=$1`, [m.id]);
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "mandate.resumed", entity: "Mandate", entityId: m.id, ip: clientIp(ctx.req) });
    return { ok: true };
  }],

  // Cancelling revokes the mandate at PayU (mandate_revoke). Not connected yet.
  ["POST", "/subscriptions/mandates/:id/cancel", async ({ auth, mode, params }) => {
    const m = await ownMandate(auth, mode, params.id);
    if (!["ACTIVE", "PAUSED", "PENDING_REGISTRATION"].includes(m.status)) fail(409, "This mandate is already closed.");
    await payu.requireCredential(auth.merchantId, mode);
    fail(501, "Revoking mandates isn't connected yet. The mandate is unchanged.");
  }],

  // Pre-debit notice for the next debit (pre_debit_SI). Not connected yet.
  ["POST", "/subscriptions/mandates/:id/pre-debit", async ({ auth, mode, params }) => {
    const m = await ownMandate(auth, mode, params.id);
    if (m.status !== "ACTIVE") fail(409, "Pre-debit notices can only be sent for an active mandate.");
    await payu.requireCredential(auth.merchantId, mode);
    fail(501, "Sending pre-debit notices isn't connected yet. No notice was sent.");
  }],
];

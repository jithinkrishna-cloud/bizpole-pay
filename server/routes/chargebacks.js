// Chargebacks (disputes) raised against this merchant's payments. Rows arrive from PayU
// reconciliation into "Chargeback"; the dashboard reads them and records merchant actions.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { methodLabel, num } = require("../shape");

// Statuses where the merchant still has to respond (accept or contest).
const ACTIONABLE = ["NEW", "PENDING_RESPONSE", "INSUFFICIENT_DOCUMENT"];
const CLOSED = ["WON", "LOST", "FRAUD_LIABILITY", "ACCEPTED"];

const AUDIT_LABEL = {
  "chargeback.accepted": "Accepted by you",
};

async function list(merchantId, mode, { id = null, from = null, to = null } = {}) {
  const params = [merchantId, mode];
  let where = `c."merchantId"=$1 AND c.mode=$2`;
  if (id) { params.push(id); where += ` AND c.id=$${params.length}`; }
  if (from) { params.push(from); where += ` AND COALESCE(c."raisedAt", c."createdAt") >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND COALESCE(c."raisedAt", c."createdAt") <= $${params.length}`; }
  const rows = await db.query(
    `SELECT c.id, c."payuChargebackId", c."cbType", c."reasonCode", c.reason, c."amountPaise", c.status, c."payuStatus",
            c."bankCaseNo", c."debitStatus", c."replyBefore", c."evidenceKeys", c."raisedAt", c."createdAt", c."updatedAt",
            t.txnid, t.mihpayid, t.method, t."amountPaise" AS "txnAmount", t."createdAt" AS "txnDate", cu.name AS "custName"
       FROM "Chargeback" c JOIN "Transaction" t ON t.id = c."transactionId"
       JOIN "Order" o ON o.id = t."orderId" LEFT JOIN "Customer" cu ON cu.id = o."customerId"
      WHERE ${where}
      ORDER BY COALESCE(c."raisedAt", c."createdAt") DESC LIMIT 5000`,
    params
  );
  if (!rows.length) return [];
  // Merchant actions recorded on each case (accept, …) feed the timeline.
  const logs = await db.query(
    `SELECT "entityId", action, meta, "createdAt" FROM "AuditLog"
      WHERE "merchantId"=$1 AND mode=$2 AND entity='Chargeback' AND "entityId" = ANY($3) ORDER BY "createdAt"`,
    [merchantId, mode, rows.map((r) => r.id)]
  );
  return rows.map((c) => {
    const raised = c.raisedAt || c.createdAt;
    const timeline = [];
    if (c.raisedAt) timeline.push([c.raisedAt, "Chargeback raised by issuing bank", [c.reason, c.reasonCode && `code ${c.reasonCode}`].filter(Boolean).join(" · ")]);
    timeline.push([c.createdAt, "Case received from the payment network", c.payuStatus ? `Network status: ${c.payuStatus}` : ""]);
    logs.filter((l) => l.entityId === c.id).forEach((l) => timeline.push([l.createdAt, AUDIT_LABEL[l.action] || l.action, (l.meta && l.meta.note) || ""]));
    timeline.sort((a, b) => a[0] - b[0]);
    return {
      id: c.id, caseId: c.payuChargebackId, txnid: c.txnid, mihpayid: c.mihpayid || "—", name: c.custName || "—",
      mode: methodLabel(c.method), amount: num(c.amountPaise), txnAmount: num(c.txnAmount), txnDate: c.txnDate,
      code: c.reasonCode || "", reason: c.reason || "Reason not provided", type: c.cbType || "", status: c.status, payuStatus: c.payuStatus,
      bankCaseNo: c.bankCaseNo || "", debitStatus: c.debitStatus || "", raised, respondBy: c.replyBefore,
      evidence: (c.evidenceKeys || []).map((k) => ({ name: String(k).split("/").pop(), key: k })),
      timeline, updatedAt: c.updatedAt,
    };
  });
}

async function findCase(ctx) {
  const c = await db.one(`SELECT id, status FROM "Chargeback" WHERE "merchantId"=$1 AND mode=$2 AND id=$3`, [ctx.auth.merchantId, ctx.mode, ctx.params.id]);
  if (!c) fail(404, "Chargeback not found.");
  return c;
}

module.exports = [
  ["GET", "/chargebacks", async ({ auth, mode }) => list(auth.merchantId, mode)],

  ["GET", "/chargebacks/:id", async ({ auth, mode, params }) => {
    const [c] = await list(auth.merchantId, mode, { id: params.id });
    if (!c) fail(404, "Chargeback not found.");
    return c;
  }],

  // Accept = merchant won't contest. Recorded here; PayU's dispute API is not wired yet, so
  // the merchant must also accept it with PayU — the response says so.
  ["POST", "/chargebacks/:id/accept", async (ctx) => {
    const { auth, mode } = ctx;
    const c = await findCase(ctx);
    if (!ACTIONABLE.includes(c.status)) fail(409, CLOSED.includes(c.status) ? "This chargeback is already closed." : "This chargeback is with the payment network or the bank and can't be accepted now.");
    await db.tx(async (t) => {
      const upd = await t.q(
        `UPDATE "Chargeback" SET status='ACCEPTED', "updatedAt"=now() WHERE id=$1 AND "merchantId"=$2 AND mode=$3 AND status = ANY($4) RETURNING id`,
        [c.id, auth.merchantId, mode, ACTIONABLE]
      );
      if (!upd.length) fail(409, "This chargeback changed meanwhile. Refresh and try again.");
      await audit(t, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "chargeback.accepted", entity: "Chargeback", entityId: c.id, ip: clientIp(ctx.req),
        meta: { previousStatus: c.status, payuSynced: false, note: "Recorded in Bizpole Pay · not yet sent to the payment network" } });
    });
    const [out] = await list(auth.merchantId, mode, { id: c.id });
    return { ...out, payuSynced: false };
  }],

  // Evidence needs file storage, which isn't configured. Refuse clearly instead of pretending.
  ["POST", "/chargebacks/:id/evidence", async (ctx) => {
    const c = await findCase(ctx);
    if (!ACTIONABLE.includes(c.status)) fail(409, "This chargeback isn't waiting for evidence.");
    // The router replaces 5xx messages with a generic one; `extra.error` keeps this one visible.
    const msg = "Evidence upload isn't available yet: document storage and the dispute service are not connected. Contact Bizpole support with your documents before the deadline.";
    fail(501, msg, { error: msg, code: "NOT_CONFIGURED" });
  }],
];

module.exports.list = list;
module.exports.CLOSED = CLOSED;

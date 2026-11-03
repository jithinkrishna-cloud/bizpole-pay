// Super Admin: transactions, attempts, refunds, settlements, chargebacks and reconciliation. Read-only.
// No refund execution and no reconciliation decisions here (not approved).
const db = require("../../db");
const { fail } = require("../../http");
const { num, methodLabel, txnStatus, LABEL_METHOD, METHOD_LABEL } = require("../../shape");
const { paging, dateRange, where, enumList, orderBy, like, text, maskKey, pageOut } = require("../../platform");
const { transactionDetail } = require("../payments");

const TXN_STATUS = ["INITIATED", "PENDING", "AUTHORIZED", "SUCCESS", "FAILED", "USER_CANCELLED", "BOUNCED", "DROPPED", "AUTO_REFUNDED"];
const REFUND_STATUS = ["REQUESTED", "QUEUED", "IN_PROGRESS", "SUCCESS", "FAILED"];
const SETTLEMENT_STATUS = ["PENDING", "PROCESSED", "FAILED", "ON_HOLD"];
const CB_STATUS = ["NEW", "PENDING_RESPONSE", "PENDING_DOC_REVIEW", "SUBMITTED_TO_BANK", "INSUFFICIENT_DOCUMENT", "WON", "LOST", "FRAUD_LIABILITY", "ACCEPTED", "OTHER"];
const RESOLUTION = ["OPEN", "AUTO_FIXED", "MANUALLY_FIXED", "IGNORED"];
const RECON_KIND = ["VERIFY_PAYMENTS", "REFUND_STATUS", "SETTLEMENT_SYNC", "CHARGEBACK_SYNC", "PAYOUT_STATUS", "MANDATE_STATUS"];

const org = (x) => (x.merchantId ? { id: x.merchantId, name: x.orgName } : null);
const total = (rows) => (rows.length ? Number(rows[0].total) : 0);
// The UI says FAILURE where the schema says FAILED; accept both.
const txnStatuses = (v) => enumList(v && String(v).toUpperCase().replace(/\bFAILURE\b/g, "FAILED"), TXN_STATUS, "status");
const methods = (v) => {
  if (!v) return null;
  const list = String(v).split(",").map((s) => s.trim()).filter(Boolean).map((s) => LABEL_METHOD[s] || s.toUpperCase());
  const bad = list.filter((m) => !METHOD_LABEL[m]);
  if (bad.length) fail(400, `Unknown method: ${bad.join(", ")}.`);
  return list;
};
const paise = (v, label) => {
  if (v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) fail(400, `${label} must be an amount in paise.`);
  return n;
};

// ── Transactions (one row per PayU attempt) ──
function txnFilter(ctx) {
  const q = ctx.query, r = dateRange(q, "all");
  return where()
    .add(`NOT t."isMandateRegistration"`)
    .add(`t.mode = ?::"Mode"`, ctx.mode)
    .add(`t.status = ANY(?::"TransactionStatus"[])`, txnStatuses(q.status))
    .add(`t.method = ANY(?::"PaymentMethod"[])`, methods(q.method))
    .add(`t."merchantId" = ?`, text(q.orgId))
    .add(`t."orderId" = ?`, text(q.orderId))
    .add(`t."amountPaise" >= ?`, paise(q.min, "min"))
    .add(`t."amountPaise" <= ?`, paise(q.max, "max"))
    .add(`(t.txnid ILIKE ? OR t.mihpayid ILIKE ? OR cu.email ILIKE ? OR cu.phone ILIKE ? OR t."bankRefNum" ILIKE ?)`, like(q.q), like(q.q), like(q.q), like(q.q), like(q.q))
    .range(`t."createdAt"`, r);
}
const TXN_FROM = `FROM "Transaction" t JOIN "Order" o ON o.id = t."orderId" JOIN "Merchant" m ON m.id = t."merchantId"
                  LEFT JOIN "Customer" cu ON cu.id = o."customerId"`;
const TXN_COLS = `t.id, t.txnid, t.mihpayid, t."amountPaise", t.status, t.method, t.bankcode, t."errorCode", t."errorMessage", t.mode, t."createdAt",
                  t."orderId", o.currency, cu.name AS "custName", cu.email AS "custEmail", t."merchantId", m."displayName" AS "orgName"`;
const txnRow = (t) => ({
  id: t.id, txnid: t.txnid, mihpayid: t.mihpayid, orderId: t.orderId, org: org(t), customer: { name: t.custName, email: t.custEmail },
  provider: "PayU", amount: num(t.amountPaise), currency: t.currency, method: methodLabel(t.method), bank: t.bankcode,
  status: txnStatus(t.status), error: t.errorMessage ? { code: t.errorCode, message: t.errorMessage } : null, mode: t.mode, date: t.createdAt,
});

async function transactions(ctx) {
  const p = paging(ctx.query), w = txnFilter(ctx);
  const sort = orderBy(ctx.query, { createdAt: `t."createdAt"`, amount: `t."amountPaise"` }, "createdAt");
  const [rows, sums] = await Promise.all([
    db.query(`SELECT ${TXN_COLS}, count(*) OVER() AS total ${TXN_FROM} ${w.sql} ${sort} LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params),
    (() => { const s = txnFilter(ctx); return db.one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE t.status = 'SUCCESS')::int AS ok,
        COALESCE(sum(t."amountPaise") FILTER (WHERE t.status = 'SUCCESS'), 0) AS volume ${TXN_FROM} ${s.sql}`, s.params); })(),
  ]);
  return { ...pageOut(rows.map(txnRow), total(rows), p), summary: { count: sums.n, successful: sums.ok, volume: num(sums.volume) } };
}

async function transaction(ctx) {
  const h = await db.one(
    `SELECT t."merchantId", t.mode, t."orderId", t."credentialId", m."displayName", m.status AS "orgStatus"
       FROM "Transaction" t JOIN "Merchant" m ON m.id = t."merchantId" WHERE t.txnid = $1`, [ctx.params.txnid]);
  if (!h) fail(404, "Transaction not found.");
  const [base, attempts, cred, inbound] = await Promise.all([
    transactionDetail(h.merchantId, h.mode, ctx.params.txnid), // same shape as the merchant drawer
    db.query(`SELECT txnid, status, method, "amountPaise", "errorMessage", "createdAt" FROM "Transaction" WHERE "orderId" = $1 ORDER BY "createdAt"`, [h.orderId]),
    db.one(`SELECT "payuMid", "merchantKey", status, label FROM "PayuCredential" WHERE id = $1`, [h.credentialId]),
    // Inbound PayU messages that moved this transaction. Payload is not returned.
    db.query(`SELECT DISTINCT e.id, e.source, e.processing, e."signatureValid", e.error, e."receivedAt", e."processedAt"
                FROM "TransactionEvent" te JOIN "InboundEvent" e ON e.id = te."inboundEventId"
                JOIN "Transaction" t ON t.id = te."transactionId" WHERE t.txnid = $1 ORDER BY e."receivedAt"`, [ctx.params.txnid]),
  ]);
  return {
    ...base, mode: h.mode, method: base.mode, // base.mode is the payment-method label in the merchant shape
    org: { id: h.merchantId, name: h.displayName, status: h.orgStatus },
    provider: { name: "PayU", mid: cred && cred.payuMid, merchantKey: cred && maskKey(cred.merchantKey), credentialStatus: cred && cred.status, label: cred && cred.label },
    attempts: attempts.map((a) => ({ txnid: a.txnid, status: txnStatus(a.status), method: methodLabel(a.method), amount: num(a.amountPaise), error: a.errorMessage, date: a.createdAt })),
    inboundEvents: inbound,
  };
}

// ── Refunds ──
function refundFilter(ctx) {
  const q = ctx.query;
  return where()
    .add(`r.mode = ?::"Mode"`, ctx.mode)
    .add(`r.status = ANY(?::"RefundStatus"[])`, enumList(q.status, REFUND_STATUS, "status"))
    .add(`r."merchantId" = ?`, text(q.orgId))
    .add(`(t.txnid ILIKE ? OR r."payuRequestId" ILIKE ? OR r.token ILIKE ? OR r."bankArn" ILIKE ?)`, like(q.q), like(q.q), like(q.q), like(q.q))
    .range(`r."createdAt"`, dateRange(q, "all"));
}
async function refunds(ctx) {
  const p = paging(ctx.query), w = refundFilter(ctx), s = refundFilter(ctx);
  const sort = orderBy(ctx.query, { createdAt: `r."createdAt"`, amount: `r."amountPaise"` }, "createdAt");
  const FROM = `FROM "Refund" r JOIN "Transaction" t ON t.id = r."transactionId" JOIN "Merchant" m ON m.id = r."merchantId"`;
  const [rows, sums] = await Promise.all([
    db.query(`SELECT r.id, r."amountPaise", r.status, r."payuStatus", r."errorCode", r.reason, r."payuRequestId", r."bankArn", r.mode, r."createdAt", r."updatedAt",
                     t.txnid, t."amountPaise" AS captured, r."merchantId", m."displayName" AS "orgName", count(*) OVER() AS total
                ${FROM} ${w.sql} ${sort} LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params),
    db.one(`SELECT count(*)::int AS n, COALESCE(sum(r."amountPaise") FILTER (WHERE r.status <> 'FAILED'), 0) AS amount ${FROM} ${s.sql}`, s.params),
  ]);
  return {
    ...pageOut(rows.map((r) => ({
      id: r.id, txnid: r.txnid, org: org(r), amount: num(r.amountPaise), captured: num(r.captured), status: r.status,
      provider: { status: r.payuStatus, errorCode: r.errorCode, requestId: r.payuRequestId, arn: r.bankArn },
      reason: r.reason, mode: r.mode, date: r.createdAt, updatedAt: r.updatedAt,
    })), total(rows), p),
    summary: { count: sums.n, amount: num(sums.amount) },
  };
}
async function refund(ctx) {
  const r = await db.one(
    `SELECT r.id, r.mode, r."amountPaise", r.status, r."payuStatus", r."errorCode", r.reason, r."payuRequestId", r."bankArn", r."bankRefNum",
            r."refundMode", r."splitBreakdown", r."createdAt", r."updatedAt", r."requestedBy", u.name AS "requestedByName",
            t.txnid, t."amountPaise" AS captured, t.status AS "txnStatus", t.method, r."merchantId", m."displayName" AS "orgName"
       FROM "Refund" r JOIN "Transaction" t ON t.id = r."transactionId" JOIN "Merchant" m ON m.id = r."merchantId"
       LEFT JOIN "User" u ON u.id = r."requestedBy" WHERE r.id = $1`, [ctx.params.id]);
  if (!r) fail(404, "Refund not found.");
  const [timeline, lines] = await Promise.all([
    db.query(`SELECT a.action, a.meta, a."createdAt", u.name FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."userId"
               WHERE a.entity = 'Refund' AND a."entityId" = $1 ORDER BY a."createdAt"`, [r.id]),
    db.query(`SELECT l."netPaise", s.id AS "settlementId", s."payuSettlementId", s.utr, COALESCE(s."completedAt", s."fetchedAt") AS date
                FROM "SettlementLine" l JOIN "Settlement" s ON s.id = l."settlementId" WHERE l."refundId" = $1`, [r.id]),
  ]);
  return {
    id: r.id, mode: r.mode, org: org(r), amount: num(r.amountPaise), status: r.status, reason: r.reason,
    provider: { status: r.payuStatus, errorCode: r.errorCode, requestId: r.payuRequestId, arn: r.bankArn, bankRefNum: r.bankRefNum, refundMode: r.refundMode },
    splitBreakdown: r.splitBreakdown, requestedBy: r.requestedBy ? { id: r.requestedBy, name: r.requestedByName } : null,
    transaction: { txnid: r.txnid, amount: num(r.captured), status: txnStatus(r.txnStatus), method: methodLabel(r.method) },
    timeline: [
      { event: "created", status: "REQUESTED", date: r.createdAt },
      ...timeline.map((a) => ({ event: a.action, by: a.name, meta: a.meta, date: a.createdAt })),
      ...(r.updatedAt > r.createdAt ? [{ event: "last update", status: r.status, date: r.updatedAt }] : []),
    ],
    settlements: lines.map((l) => ({ id: l.settlementId, payuSettlementId: l.payuSettlementId, utr: l.utr, net: num(l.netPaise), date: l.date })),
  };
}

// ── Settlements ──
function settlementFilter(ctx) {
  const q = ctx.query;
  return where()
    .add(`s.mode = ?::"Mode"`, ctx.mode)
    .add(`s.status = ANY(?::"SettlementStatus"[])`, enumList(q.status, SETTLEMENT_STATUS, "status"))
    .add(`s."merchantId" = ?`, text(q.orgId))
    .add(`(s.utr ILIKE ? OR s."payuSettlementId" ILIKE ?)`, like(q.q), like(q.q))
    .range(`COALESCE(s."completedAt", s."fetchedAt")`, dateRange(q, "all"));
}
// Discrepancy = PayU's net differs from gross − refunds − chargebacks − fees − tax, or from the sum of its lines.
const SETTLE_COLS = `s.id, s."payuSettlementId", s.utr, s.mode, s.status, s."transactionAmtPaise", s."refundAmtPaise", s."chargebackAmtPaise",
  s."serviceFeePaise", s."serviceTaxPaise", s."netAmountPaise", s."completedAt", s."fetchedAt", s."merchantId", m."displayName" AS "orgName",
  (SELECT count(*)::int FROM "SettlementLine" l WHERE l."settlementId" = s.id) AS lines,
  (SELECT COALESCE(sum(l."netPaise"), 0) FROM "SettlementLine" l WHERE l."settlementId" = s.id) AS "linesNet"`;
const settleRow = (s) => {
  const expected = num(s.transactionAmtPaise) - num(s.refundAmtPaise) - num(s.chargebackAmtPaise) - num(s.serviceFeePaise) - num(s.serviceTaxPaise);
  const net = num(s.netAmountPaise), linesNet = num(s.linesNet);
  return {
    id: s.id, payuSettlementId: s.payuSettlementId, utr: s.utr, org: org(s), provider: "PayU", mode: s.mode, status: s.status,
    gross: num(s.transactionAmtPaise), refunds: num(s.refundAmtPaise), chargebacks: num(s.chargebackAmtPaise), fee: num(s.serviceFeePaise), tax: num(s.serviceTaxPaise),
    net, date: s.completedAt || s.fetchedAt, completedAt: s.completedAt, fetchedAt: s.fetchedAt, lineCount: s.lines,
    discrepancy: { formula: net - expected, lines: s.lines ? net - linesNet : null },
  };
};
async function settlements(ctx) {
  const p = paging(ctx.query), w = settlementFilter(ctx), s = settlementFilter(ctx);
  const sort = orderBy(ctx.query, { date: `COALESCE(s."completedAt", s."fetchedAt")`, net: `s."netAmountPaise"` }, "date");
  const FROM = `FROM "Settlement" s JOIN "Merchant" m ON m.id = s."merchantId"`;
  const [rows, sums] = await Promise.all([
    db.query(`SELECT ${SETTLE_COLS}, count(*) OVER() AS total ${FROM} ${w.sql} ${sort} LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params),
    db.one(`SELECT count(*)::int AS n, COALESCE(sum(s."netAmountPaise"), 0) AS net, count(*) FILTER (WHERE s.status = 'PENDING')::int AS pending ${FROM} ${s.sql}`, s.params),
  ]);
  return { ...pageOut(rows.map(settleRow), total(rows), p), summary: { count: sums.n, net: num(sums.net), pending: sums.pending } };
}
async function settlement(ctx) {
  const s = await db.one(`SELECT ${SETTLE_COLS}, b."accountLast4", b."bankName", b.ifsc
                            FROM "Settlement" s JOIN "Merchant" m ON m.id = s."merchantId" LEFT JOIN "BankAccount" b ON b.id = s."bankAccountId"
                           WHERE s.id = $1`, [ctx.params.id]);
  if (!s) fail(404, "Settlement not found.");
  const lines = await db.query(
    `SELECT l.action, l."payuId", l."payuRequestId", l."merchantTransactionId", l."grossPaise", l."feePaise", l."taxPaise", l."netPaise", l."payuMode",
            l."refundId", t.txnid, t.method, (l."transactionId" IS NULL AND l.action = 'CAPTURE') AS unmatched
       FROM "SettlementLine" l LEFT JOIN "Transaction" t ON t.id = l."transactionId"
      WHERE l."settlementId" = $1 ORDER BY l.action, l."grossPaise" DESC`, [s.id]);
  return {
    ...settleRow(s),
    account: s.accountLast4 ? { last4: s.accountLast4, bankName: s.bankName, ifsc: s.ifsc } : null,
    lines: lines.map((l) => ({
      action: l.action, payuId: l.payuId, requestId: l.payuRequestId, txnid: l.txnid || l.merchantTransactionId, refundId: l.refundId, unmatched: l.unmatched,
      method: l.method ? methodLabel(l.method) : l.payuMode, gross: num(l.grossPaise), fee: num(l.feePaise), tax: num(l.taxPaise), net: num(l.netPaise),
    })),
  };
}

// ── Chargebacks ──
async function chargebacks(ctx) {
  const q = ctx.query, p = paging(q);
  const w = where()
    .add(`c.mode = ?::"Mode"`, ctx.mode)
    .add(`c.status = ANY(?::"ChargebackStatus"[])`, enumList(q.status, CB_STATUS, "status"))
    .add(`c."merchantId" = ?`, text(q.orgId))
    .add(`(t.txnid ILIKE ? OR c."payuChargebackId" ILIKE ? OR c."bankCaseNo" ILIKE ?)`, like(q.q), like(q.q), like(q.q))
    .range(`c."createdAt"`, dateRange(q, "all"));
  const rows = await db.query(
    `SELECT c.id, c."payuChargebackId", c."cbType", c."reasonCode", c.reason, c."amountPaise", c.status, c."payuStatus", c."replyBefore", c."raisedAt",
            c.mode, c."createdAt", t.txnid, c."merchantId", m."displayName" AS "orgName", count(*) OVER() AS total
       FROM "Chargeback" c JOIN "Transaction" t ON t.id = c."transactionId" JOIN "Merchant" m ON m.id = c."merchantId"
       ${w.sql} ${orderBy(q, { createdAt: `c."createdAt"`, replyBefore: `c."replyBefore"`, amount: `c."amountPaise"` }, "createdAt")}
       LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map((c) => ({
    id: c.id, payuChargebackId: c.payuChargebackId, txnid: c.txnid, org: org(c), type: c.cbType, reasonCode: c.reasonCode, reason: c.reason,
    amount: num(c.amountPaise), status: c.status, payuStatus: c.payuStatus, replyBefore: c.replyBefore, raisedAt: c.raisedAt, mode: c.mode, date: c.createdAt,
  })), total(rows), p);
}

// ── Reconciliation ──
// category: amount (field mentions amount), missing (one side has no value), other.
const CATEGORY = {
  amount: `x.field ILIKE '%amount%'`,
  missing: `(x."localValue" IS NULL OR x."payuValue" IS NULL)`,
  other: `NOT (x.field ILIKE '%amount%' OR x."localValue" IS NULL OR x."payuValue" IS NULL)`,
};
async function reconSummary(ctx) {
  const rw = where().add(`run.mode = ?::"Mode"`, ctx.mode).range(`run."startedAt"`, dateRange(ctx.query, "all"));
  const xw = where().add(`run.mode = ?::"Mode"`, ctx.mode);
  const [runs, latest, byRes, byCat] = await Promise.all([
    db.one(`SELECT count(*)::int AS runs, COALESCE(sum(checked), 0)::int AS checked, COALESCE(sum(updated), 0)::int AS updated,
                   COALESCE(sum(mismatches), 0)::int AS mismatches, count(*) FILTER (WHERE status = 'FAILED')::int AS failed FROM "ReconRun" run ${rw.sql}`, rw.params),
    db.query(`SELECT DISTINCT ON (run.kind, run.mode) run.id, run.kind, run.mode, run.status, run.checked, run.mismatches, run."startedAt", run."finishedAt", run.error
                FROM "ReconRun" run ${xw.sql} ORDER BY run.kind, run.mode, run."startedAt" DESC`, xw.params),
    db.query(`SELECT x.resolution, count(*)::int AS n FROM "ReconMismatch" x JOIN "ReconRun" run ON run.id = x."runId" ${xw.sql} GROUP BY 1`, xw.params),
    db.query(`SELECT ${Object.entries(CATEGORY).map(([k, sql]) => `count(*) FILTER (WHERE ${sql})::int AS ${k}`).join(", ")}
                FROM "ReconMismatch" x JOIN "ReconRun" run ON run.id = x."runId" ${xw.sql}${xw.sql ? " AND" : " WHERE"} x.resolution = 'OPEN'`, xw.params),
  ]);
  return {
    totals: { ...runs, matched: Math.max(0, runs.checked - runs.mismatches) },
    latestRuns: latest,
    byResolution: Object.fromEntries(RESOLUTION.map((r) => [r, (byRes.find((x) => x.resolution === r) || {}).n || 0])),
    openByCategory: byCat[0],
  };
}
async function reconRuns(ctx) {
  const q = ctx.query, p = paging(q);
  const w = where().add(`run.mode = ?::"Mode"`, ctx.mode).add(`run.kind = ANY(?::"ReconKind"[])`, enumList(q.kind, RECON_KIND, "kind"))
    .add(`run.status = ANY(?::"ReconRunStatus"[])`, enumList(q.status, ["RUNNING", "COMPLETED", "FAILED"], "status"))
    .range(`run."startedAt"`, dateRange(q, "all"));
  const rows = await db.query(
    `SELECT run.*, m."displayName" AS "orgName", count(*) OVER() AS total FROM "ReconRun" run LEFT JOIN "Merchant" m ON m.id = run."merchantId"
      ${w.sql} ORDER BY run."startedAt" DESC LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map(({ total, orgName, ...r }) => ({ ...r, org: r.merchantId ? { id: r.merchantId, name: orgName } : null })), total(rows), p);
}
async function reconMismatches(ctx) {
  const q = ctx.query, p = paging(q);
  const cat = q.category ? CATEGORY[q.category] || fail(400, "category must be amount, missing or other.") : null;
  const w = where().add(`run.mode = ?::"Mode"`, ctx.mode)
    .add(`x.resolution = ANY(?::"MismatchResolution"[])`, enumList(q.resolution, RESOLUTION, "resolution"))
    .add(`run.kind = ANY(?::"ReconKind"[])`, enumList(q.kind, RECON_KIND, "kind"))
    .add(`x."entityType" = ?`, text(q.entityType))
    .add(`x."merchantId" = ?`, text(q.orgId))
    .add(`x."runId" = ?`, text(q.runId))
    .add(cat || `true`)
    .range(`x."createdAt"`, dateRange(q, "all"));
  const rows = await db.query(
    `SELECT x.*, run.kind, run.mode, m."displayName" AS "orgName", ru.name AS "resolvedByName", count(*) OVER() AS total
       FROM "ReconMismatch" x JOIN "ReconRun" run ON run.id = x."runId" LEFT JOIN "Merchant" m ON m.id = x."merchantId"
       LEFT JOIN "User" ru ON ru.id = x."resolvedBy"
      ${w.sql} ORDER BY x."createdAt" DESC LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map((x) => ({
    id: x.id, runId: x.runId, kind: x.kind, mode: x.mode, org: org({ merchantId: x.merchantId, orgName: x.orgName }), entityType: x.entityType, entityId: x.entityId,
    payuRef: x.payuRef, field: x.field, local: x.localValue, payu: x.payuValue, resolution: x.resolution,
    resolvedBy: x.resolvedBy ? { id: x.resolvedBy, name: x.resolvedByName } : null, resolvedAt: x.resolvedAt, date: x.createdAt,
  })), total(rows), p);
}
async function reconMismatch(ctx) {
  const x = await db.one(
    `SELECT x.*, run.kind, run.mode, run."windowFrom", run."windowTo", run.status AS "runStatus", m."displayName" AS "orgName", ru.name AS "resolvedByName"
       FROM "ReconMismatch" x JOIN "ReconRun" run ON run.id = x."runId" LEFT JOIN "Merchant" m ON m.id = x."merchantId"
       LEFT JOIN "User" ru ON ru.id = x."resolvedBy" WHERE x.id = $1`, [ctx.params.id]);
  if (!x) fail(404, "Exception not found.");
  const history = await db.query(
    `SELECT a.action, a.meta, a."createdAt", u.name FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."userId"
      WHERE a.entity = 'ReconMismatch' AND a."entityId" = $1 ORDER BY a."createdAt"`, [x.id]);
  return {
    id: x.id, org: org({ merchantId: x.merchantId, orgName: x.orgName }), entityType: x.entityType, entityId: x.entityId, payuRef: x.payuRef,
    field: x.field, local: x.localValue, payu: x.payuValue, resolution: x.resolution,
    resolvedBy: x.resolvedBy ? { id: x.resolvedBy, name: x.resolvedByName } : null, resolvedAt: x.resolvedAt, date: x.createdAt,
    run: { id: x.runId, kind: x.kind, mode: x.mode, status: x.runStatus, windowFrom: x.windowFrom, windowTo: x.windowTo },
    history: history.map((h) => ({ action: h.action, by: h.name, meta: h.meta, date: h.createdAt })),
  };
}

module.exports = [
  ["GET", "/super/transactions", transactions, { platform: true }],
  ["GET", "/super/transactions/:txnid", transaction, { platform: true }],
  ["GET", "/super/refunds", refunds, { platform: true }],
  ["GET", "/super/refunds/:id", refund, { platform: true }],
  ["GET", "/super/settlements", settlements, { platform: true }],
  ["GET", "/super/settlements/:id", settlement, { platform: true }],
  ["GET", "/super/chargebacks", chargebacks, { platform: true }],
  ["GET", "/super/recon", reconSummary, { platform: true }],
  ["GET", "/super/recon/runs", reconRuns, { platform: true }],
  ["GET", "/super/recon/mismatches", reconMismatches, { platform: true }],
  ["GET", "/super/recon/mismatches/:id", reconMismatch, { platform: true }],
];
module.exports.txnFilter = txnFilter;
module.exports.TXN_FROM = TXN_FROM;
module.exports.TXN_COLS = TXN_COLS;
module.exports.txnRow = txnRow;

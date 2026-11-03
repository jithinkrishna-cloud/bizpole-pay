// Super Admin: platform KPIs, analytics series and recent activity. Read-only; every number is a live query.
const db = require("../../db");
const { num, methodLabel, txnStatus } = require("../../shape");
const { dateRange, where } = require("../../platform");

// Definitions used across the control centre (keep in sync with the UI legend).
const INACTIVE_ORG = ["REJECTED", "SUSPENDED", "DEACTIVATED"];
const PENDING_ORG = ["SUBMITTED", "UNDER_REVIEW", "ACTION_REQUIRED"];
const FAILED_TXN = ["FAILED", "BOUNCED", "DROPPED"]; // USER_CANCELLED is reported separately

async function overview(ctx) {
  const r = dateRange(ctx.query, "all"), mode = ctx.mode;
  const tx = where().add(`NOT t."isMandateRegistration"`).add(`t.mode = ?`, mode).range(`t."createdAt"`, r);
  const rf = where().add(`r.mode = ?`, mode).range(`r."createdAt"`, r);
  const st = where().add(`s.status = 'PENDING'`).add(`s.mode = ?`, mode);
  const rc = where().add(`m.resolution = 'OPEN'`).add(`run.mode = ?`, mode);
  const cr = where().add(`c.mode = ?`, mode);
  const ie = where().add(`e.mode = ?`, mode).range(`e."receivedAt"`, r);
  const wd = where().add(`ep.mode = ?`, mode).range(`d."createdAt"`, r);

  const [orgs, users, txns, refunds, pendingSt, recon, creds, inbound, outbound] = await Promise.all([
    db.one(`SELECT count(*)::int AS total,
                   count(*) FILTER (WHERE status <> ALL($1::"MerchantStatus"[]))::int AS active,
                   count(*) FILTER (WHERE status = 'LIVE')::int AS live,
                   count(*) FILTER (WHERE status = ANY($2::"MerchantStatus"[]))::int AS pending
              FROM "Merchant"`, [INACTIVE_ORG, PENDING_ORG]),
    db.one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
                   count(*) FILTER (WHERE "platformRole" IS NOT NULL)::int AS operators FROM "User"`),
    db.query(`SELECT t.status, count(*)::int AS n, COALESCE(sum(t."amountPaise"), 0) AS amount FROM "Transaction" t ${tx.sql} GROUP BY t.status`, tx.params),
    db.one(`SELECT count(*)::int AS n, COALESCE(sum(r."amountPaise") FILTER (WHERE r.status <> 'FAILED'), 0) AS amount,
                   count(*) FILTER (WHERE r.status IN ('REQUESTED','QUEUED','IN_PROGRESS'))::int AS open
              FROM "Refund" r ${rf.sql}`, rf.params),
    db.one(`SELECT count(*)::int AS n, COALESCE(sum(s."netAmountPaise"), 0) AS amount FROM "Settlement" s ${st.sql}`, st.params),
    db.one(`SELECT count(*)::int AS n FROM "ReconMismatch" m JOIN "ReconRun" run ON run.id = m."runId" ${rc.sql}`, rc.params),
    db.one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE c.status = 'ACTIVE')::int AS active FROM "PayuCredential" c ${cr.sql}`, cr.params),
    db.one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE e.processing IN ('FAILED','SIGNATURE_INVALID'))::int AS failed FROM "InboundEvent" e ${ie.sql}`, ie.params),
    db.one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE d.status = 'FAILED')::int AS failed
              FROM "WebhookDelivery" d JOIN "WebhookEndpoint" ep ON ep.id = d."endpointId" ${wd.sql}`, wd.params),
  ]);

  const byStatus = Object.fromEntries(txns.map((t) => [txnStatus(t.status), t.n]));
  const sum = (pred, f) => txns.filter((t) => pred(t.status)).reduce((a, t) => a + f(t), 0);
  return {
    range: { key: r.key, from: r.from, to: r.to }, mode: mode || "ALL",
    organizations: { total: orgs.total, active: orgs.active, live: orgs.live, pendingVerification: orgs.pending },
    users: { total: users.total, active: users.active, superAdmins: users.operators },
    transactions: {
      total: sum(() => true, (t) => t.n),
      successful: sum((s) => s === "SUCCESS", (t) => t.n),
      failed: sum((s) => FAILED_TXN.includes(s), (t) => t.n),
      cancelled: sum((s) => s === "USER_CANCELLED", (t) => t.n),
      volume: sum((s) => s === "SUCCESS", (t) => num(t.amount)),
      byStatus,
    },
    refunds: { total: refunds.n, amount: num(refunds.amount), open: refunds.open },
    settlements: { pending: pendingSt.n, pendingAmount: num(pendingSt.amount) },
    reconciliation: { openExceptions: recon.n },
    providerAccounts: { total: creds.total, active: creds.active },
    webhooks: { inbound: inbound.n, inboundFailed: inbound.failed, outbound: outbound.n, outboundFailed: outbound.failed },
  };
}

// Continuous buckets so charts have no gaps.
function buckets(from, unit) {
  const out = [], now = new Date();
  let d = unit === "month" ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)) : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (d <= now && out.length < 400) {
    out.push(d.toISOString().slice(0, unit === "month" ? 7 : 10));
    d = unit === "month" ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + 86400000);
  }
  return out;
}
const keyOf = (unit) => (unit === "month" ? `to_char(date_trunc('month', X), 'YYYY-MM')` : `to_char(date_trunc('day', X), 'YYYY-MM-DD')`);

const AMOUNT_BANDS = [[0, 50000, "< ₹500"], [50000, 200000, "₹500–2k"], [200000, 1000000, "₹2k–10k"], [1000000, 5000000, "₹10k–50k"], [5000000, null, "₹50k+"]];

async function analytics(ctx) {
  const r = dateRange(ctx.query, "30d"), mode = ctx.mode;
  const spanDays = r.from ? ((r.to || new Date()) - r.from) / 86400000 : Infinity;
  const unit = spanDays > 92 ? "month" : "day";
  const k = (col) => keyOf(unit).replace("X", col);

  const tx = () => where().add(`NOT t."isMandateRegistration"`).add(`t.mode = ?`, mode).range(`t."createdAt"`, r);
  const t1 = tx(), t2 = tx(), t3 = tx();
  const rf = where().add(`r.mode = ?`, mode).range(`r."createdAt"`, r);
  const st = where().add(`s.mode = ?`, mode).range(`COALESCE(s."completedAt", s."fetchedAt")`, r);
  const mg = where().range(`m."createdAt"`, r), ug = where().range(`u."createdAt"`, r);
  const bandSql = AMOUNT_BANDS.map(([lo, hi], i) => `WHEN t."amountPaise" >= ${lo}${hi ? ` AND t."amountPaise" < ${hi}` : ""} THEN ${i}`).join(" ");

  const [txSeries, bands, methods, refunds, settlements, orgs, users, orgBase, first] = await Promise.all([
    db.query(`SELECT ${k(`t."createdAt"`)} AS b, count(*)::int AS n,
                     count(*) FILTER (WHERE t.status = 'SUCCESS')::int AS ok,
                     count(*) FILTER (WHERE t.status = ANY($${t1.params.length + 1}::"TransactionStatus"[]))::int AS failed,
                     COALESCE(sum(t."amountPaise") FILTER (WHERE t.status = 'SUCCESS'), 0) AS volume
                FROM "Transaction" t ${t1.sql} GROUP BY 1`, [...t1.params, FAILED_TXN]),
    db.query(`SELECT CASE ${bandSql} END AS band, count(*)::int AS n, COALESCE(sum(t."amountPaise"), 0) AS amount
                FROM "Transaction" t ${t2.sql} GROUP BY 1`, t2.params),
    db.query(`SELECT t.method, count(*)::int AS n, count(*) FILTER (WHERE t.status = 'SUCCESS')::int AS ok,
                     COALESCE(sum(t."amountPaise") FILTER (WHERE t.status = 'SUCCESS'), 0) AS volume
                FROM "Transaction" t ${t3.sql} GROUP BY 1 ORDER BY 2 DESC`, t3.params),
    db.query(`SELECT ${k(`r."createdAt"`)} AS b, count(*)::int AS n, COALESCE(sum(r."amountPaise") FILTER (WHERE r.status <> 'FAILED'), 0) AS amount
                FROM "Refund" r ${rf.sql} GROUP BY 1`, rf.params),
    db.query(`SELECT ${k(`COALESCE(s."completedAt", s."fetchedAt")`)} AS b, count(*)::int AS n, COALESCE(sum(s."netAmountPaise"), 0) AS net,
                     COALESCE(sum(s."serviceFeePaise" + s."serviceTaxPaise"), 0) AS fees
                FROM "Settlement" s ${st.sql} GROUP BY 1`, st.params),
    db.query(`SELECT ${k(`m."createdAt"`)} AS b, count(*)::int AS n FROM "Merchant" m ${mg.sql} GROUP BY 1`, mg.params),
    db.query(`SELECT ${k(`u."createdAt"`)} AS b, count(*)::int AS n FROM "User" u ${ug.sql} GROUP BY 1`, ug.params),
    r.from ? db.one(`SELECT count(*)::int AS n FROM "Merchant" WHERE "createdAt" < $1`, [r.from]) : { n: 0 },
    r.from ? null : db.one(`SELECT LEAST((SELECT min("createdAt") FROM "Merchant"), (SELECT min("createdAt") FROM "Transaction")) AS d`),
  ]);

  const start = r.from || (first && first.d) || new Date();
  const keys = buckets(start, unit);
  const map = (rows) => Object.fromEntries(rows.map((x) => [x.b, x]));
  const T = map(txSeries), R = map(refunds), S = map(settlements), O = map(orgs), U = map(users);
  let running = orgBase.n;
  return {
    range: { key: r.key, from: r.from, to: r.to }, mode: mode || "ALL", unit,
    transactions: keys.map((b) => ({ bucket: b, total: T[b]?.n || 0, successful: T[b]?.ok || 0, failed: T[b]?.failed || 0, volume: num(T[b]?.volume) || 0 })),
    amountDistribution: AMOUNT_BANDS.map(([, , label], i) => {
      const x = bands.find((y) => y.band === i);
      return { band: label, count: x ? x.n : 0, amount: x ? num(x.amount) : 0 };
    }),
    methodPerformance: methods.map((m) => ({ method: methodLabel(m.method), total: m.n, successful: m.ok, successRate: m.n ? m.ok / m.n : null, volume: num(m.volume) })),
    refunds: keys.map((b) => ({ bucket: b, count: R[b]?.n || 0, amount: num(R[b]?.amount) || 0 })),
    settlements: keys.map((b) => ({ bucket: b, count: S[b]?.n || 0, net: num(S[b]?.net) || 0, fees: num(S[b]?.fees) || 0 })),
    organizations: keys.map((b) => ({ bucket: b, new: O[b]?.n || 0, total: (running += O[b]?.n || 0) })),
    userRegistrations: keys.map((b) => ({ bucket: b, new: U[b]?.n || 0 })),
  };
}

async function activity(ctx) {
  const n = Math.min(25, Math.max(1, Number(ctx.query.limit) || 8)), mode = ctx.mode;
  const m = (alias) => `AND ($2::"Mode" IS NULL OR ${alias}.mode = $2::"Mode")`; // bound; null = every mode
  const nm = [n, mode];
  const [orgs, txns, refunds, decisions, failures, recon, operators] = await Promise.all([
    db.query(`SELECT id, "displayName", email, status, "createdAt" FROM "Merchant" ORDER BY "createdAt" DESC LIMIT $1`, [n]),
    db.query(`SELECT t.txnid, t."amountPaise", t.status, t.method, t.mode, t."createdAt", mc.id AS "merchantId", mc."displayName"
                FROM "Transaction" t JOIN "Merchant" mc ON mc.id = t."merchantId"
               WHERE NOT t."isMandateRegistration" ${m("t")} ORDER BY t."createdAt" DESC LIMIT $1`, nm),
    db.query(`SELECT r.id, r."amountPaise", r.status, r.mode, r."createdAt", t.txnid, mc.id AS "merchantId", mc."displayName"
                FROM "Refund" r JOIN "Transaction" t ON t.id = r."transactionId" JOIN "Merchant" mc ON mc.id = r."merchantId"
               WHERE true ${m("r")} ORDER BY r."createdAt" DESC LIMIT $1`, nm),
    db.query(`SELECT ev."eventName", ev."previousStatus", ev."currentStatus", ev.remarks, ev."changedAt", s.area, mc.id AS "merchantId", mc."displayName"
                FROM "PayuOnboardingEvent" ev JOIN "PayuOnboardingStatus" s ON s.id = ev."statusId" JOIN "Merchant" mc ON mc.id = s."merchantId"
               ORDER BY ev."changedAt" DESC LIMIT $1`, [n]),
    db.query(`SELECT e.id, e.source, e.mode, e.processing, e.error, e."receivedAt", mc.id AS "merchantId", mc."displayName"
                FROM "InboundEvent" e LEFT JOIN "Merchant" mc ON mc.id = e."merchantId"
               WHERE e.processing IN ('FAILED','SIGNATURE_INVALID') ${m("e")} ORDER BY e."receivedAt" DESC LIMIT $1`, nm),
    db.query(`SELECT x.id, x."entityType", x.field, x."localValue", x."payuValue", x."createdAt", run.kind, run.mode, mc.id AS "merchantId", mc."displayName"
                FROM "ReconMismatch" x JOIN "ReconRun" run ON run.id = x."runId" LEFT JOIN "Merchant" mc ON mc.id = x."merchantId"
               WHERE x.resolution = 'OPEN' ${m("run")} ORDER BY x."createdAt" DESC LIMIT $1`, nm),
    db.query(`SELECT a.id, a.action, a.entity, a."entityId", a."createdAt", u.name, u.email
                FROM "AuditLog" a JOIN "User" u ON u.id = a."userId"
               WHERE u."platformRole" IS NOT NULL ORDER BY a."createdAt" DESC LIMIT $1`, [n]),
  ]);
  const org = (x) => (x.merchantId ? { id: x.merchantId, name: x.displayName } : null);
  return {
    organizations: orgs.map((o) => ({ id: o.id, name: o.displayName, email: o.email, status: o.status, date: o.createdAt })),
    transactions: txns.map((t) => ({ txnid: t.txnid, amount: num(t.amountPaise), status: txnStatus(t.status), method: methodLabel(t.method), mode: t.mode, date: t.createdAt, org: org(t) })),
    refunds: refunds.map((r) => ({ id: r.id, txnid: r.txnid, amount: num(r.amountPaise), status: r.status, mode: r.mode, date: r.createdAt, org: org(r) })),
    verificationDecisions: decisions.map((d) => ({ area: d.area, event: d.eventName, from: d.previousStatus, to: d.currentStatus, remarks: d.remarks, date: d.changedAt, org: org(d) })),
    providerFailures: failures.map((f) => ({ id: f.id, source: f.source, mode: f.mode, processing: f.processing, error: f.error, date: f.receivedAt, org: org(f) })),
    reconExceptions: recon.map((x) => ({ id: x.id, kind: x.kind, mode: x.mode, entityType: x.entityType, field: x.field, local: x.localValue, payu: x.payuValue, date: x.createdAt, org: org(x) })),
    superAdminActions: operators.map((a) => ({ id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, date: a.createdAt, actor: { name: a.name, email: a.email } })),
  };
}

module.exports = [
  ["GET", "/super/overview", overview, { platform: true }],
  ["GET", "/super/analytics", analytics, { platform: true }],
  ["GET", "/super/activity", activity, { platform: true }],
];
module.exports.FAILED_TXN = FAILED_TXN;
module.exports.PENDING_ORG = PENDING_ORG;
module.exports.INACTIVE_ORG = INACTIVE_ORG;

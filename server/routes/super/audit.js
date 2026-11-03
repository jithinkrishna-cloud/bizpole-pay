// Super Admin: platform-wide audit log (read-only) and global search.
// AuditLog has no "role" or "result" column: role is the actor's role *now* (platform role, else membership in that org),
// and result is meta.result when the writer recorded one. Exports are themselves audited.
const db = require("../../db");
const { fail } = require("../../http");
const { audit: writeAudit, clientIp } = require("../../auth");
const { num, txnStatus } = require("../../shape");
const { paging, dateRange, where, like, text, csvFile, pageOut, EXPORT_MAX } = require("../../platform");

function filter(ctx) {
  const q = ctx.query;
  const action = text(q.action, 80);
  return where()
    .add(`a."userId" = ?`, text(q.actorId))
    .add(`(u.email ILIKE ? OR u.name ILIKE ?)`, like(q.actor), like(q.actor))
    .add(`a.action LIKE ?`, action && action.replace(/[\\%_]/g, (c) => "\\" + c) + "%") // prefix: "refund." matches refund.*
    .add(`a.entity = ?`, text(q.entity, 60))
    .add(`a."entityId" = ?`, text(q.entityId))
    .add(`a."merchantId" = ?`, text(q.orgId))
    .add(`a.mode = ?::"Mode"`, ctx.mode)
    .add(q.platform === "1" ? `u."platformRole" IS NOT NULL` : `true`)
    .add(q.result === "success" ? `COALESCE(a.meta->>'result', 'success') = 'success'` : q.result === "failure" ? `a.meta->>'result' = 'failure'` : `true`)
    .range(`a."createdAt"`, dateRange(q, "all"));
}
const SELECT = `SELECT a.id, a."createdAt", a.action, a.entity, a."entityId", a.mode, a.ip, a.meta, a."userId", a."merchantId",
                       u.name AS "actorName", u.email AS "actorEmail", u."platformRole", ms.role AS "memberRole", m."displayName" AS "orgName"
                  FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."userId" LEFT JOIN "Merchant" m ON m.id = a."merchantId"
                  LEFT JOIN "Membership" ms ON ms."userId" = a."userId" AND ms."merchantId" = a."merchantId"`;
const shape = (a) => ({
  id: a.id, date: a.createdAt, action: a.action, entity: a.entity, entityId: a.entityId, mode: a.mode, ip: a.ip,
  actor: a.userId ? { id: a.userId, name: a.actorName, email: a.actorEmail } : null,
  role: a.platformRole || a.memberRole || null,
  org: a.merchantId ? { id: a.merchantId, name: a.orgName } : null,
  result: (a.meta && a.meta.result) || "success", details: a.meta,
});

async function list(ctx) {
  const p = paging(ctx.query), w = filter(ctx);
  const rows = await db.query(`${SELECT.replace("SELECT ", "SELECT count(*) OVER() AS total, ")} ${w.sql}
                               ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map(shape), rows.length ? Number(rows[0].total) : 0, p);
}

async function exportCsv(ctx) {
  const w = filter(ctx);
  const rows = (await db.query(`${SELECT} ${w.sql} ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${w.next(EXPORT_MAX + 1)}`, w.params)).map(shape);
  if (rows.length > EXPORT_MAX) fail(413, `More than ${EXPORT_MAX.toLocaleString("en-IN")} rows match. Narrow the date range or filters.`);
  await writeAudit(db, { userId: ctx.auth.user.id, action: "super.export", entity: "AuditLog", ip: clientIp(ctx.req),
    meta: { resource: "audit", filters: { ...ctx.query }, rows: rows.length, platformRole: ctx.auth.platformRole } });
  const stamp = new Date().toISOString().slice(0, 10);
  return csvFile(`paynest-audit-${stamp}.csv`,
    ["Audit ID", "Timestamp (UTC)", "Actor", "Actor email", "Role", "Action", "Entity", "Entity ID", "Organization", "Mode", "IP", "Result", "Details"],
    rows.map((a) => [a.id, a.date, a.actor && a.actor.name, a.actor && a.actor.email, a.role, a.action, a.entity, a.entityId,
      a.org && a.org.name, a.mode, a.ip, a.result, a.details]));
}

// Global search across organizations, users, transactions, refunds and settlements (5 each).
async function search(ctx) {
  const raw = text(ctx.query.q, 100);
  if (!raw || raw.length < 2) fail(400, "Type at least 2 characters.");
  const l = like(raw), mode = ctx.mode;
  const [orgs, users, txns, refunds, settlements] = await Promise.all([
    db.query(`SELECT id, "displayName", email, status FROM "Merchant" WHERE id = $1 OR "displayName" ILIKE $2 OR "legalName" ILIKE $2 OR email ILIKE $2
               ORDER BY "createdAt" DESC LIMIT 5`, [raw, l]),
    db.query(`SELECT id, name, email, status, "platformRole" FROM "User" WHERE id = $1 OR name ILIKE $2 OR email ILIKE $2 OR mobile ILIKE $2
               ORDER BY "createdAt" DESC LIMIT 5`, [raw, l]),
    db.query(`SELECT t.txnid, t."amountPaise", t.status, t.mode, m."displayName" FROM "Transaction" t JOIN "Merchant" m ON m.id = t."merchantId"
               WHERE (t.txnid ILIKE $1 OR t.mihpayid = $2 OR t."bankRefNum" = $2) AND ($3::"Mode" IS NULL OR t.mode = $3::"Mode")
               ORDER BY t."createdAt" DESC LIMIT 5`, [l, raw, mode]),
    db.query(`SELECT r.id, r."amountPaise", r.status, r.mode, t.txnid FROM "Refund" r JOIN "Transaction" t ON t.id = r."transactionId"
               WHERE (r.id = $1 OR r."payuRequestId" = $1 OR r."bankArn" = $1 OR r.token = $1) AND ($2::"Mode" IS NULL OR r.mode = $2::"Mode")
               ORDER BY r."createdAt" DESC LIMIT 5`, [raw, mode]),
    db.query(`SELECT s.id, s."payuSettlementId", s.utr, s."netAmountPaise", s.status, s.mode FROM "Settlement" s
               WHERE (s.utr = $1 OR s."payuSettlementId" = $1 OR s.id = $1) AND ($2::"Mode" IS NULL OR s.mode = $2::"Mode")
               ORDER BY s."fetchedAt" DESC LIMIT 5`, [raw, mode]),
  ]);
  return {
    q: raw,
    organizations: orgs.map((o) => ({ id: o.id, name: o.displayName, email: o.email, status: o.status })),
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, platformRole: u.platformRole })),
    transactions: txns.map((t) => ({ txnid: t.txnid, amount: num(t.amountPaise), status: txnStatus(t.status), mode: t.mode, org: t.displayName })),
    refunds: refunds.map((r) => ({ id: r.id, txnid: r.txnid, amount: num(r.amountPaise), status: r.status, mode: r.mode })),
    settlements: settlements.map((s) => ({ id: s.id, payuSettlementId: s.payuSettlementId, utr: s.utr, net: num(s.netAmountPaise), status: s.status, mode: s.mode })),
  };
}

module.exports = [
  ["GET", "/super/audit", list, { platform: true }],
  ["GET", "/super/audit/export", exportCsv, { platform: true }],
  ["GET", "/super/search", search, { platform: true }],
];

// Super Admin: organizations (Merchant) list and profile. Read-only: PayU owns verification and activation.
const db = require("../../db");
const { fail } = require("../../http");
const { num } = require("../../shape");
const { paging, dateRange, where, enumList, orderBy, like, text, maskKey, pageOut } = require("../../platform");
const { PENDING_ORG, INACTIVE_ORG } = require("./overview");

const STATUSES = ["TEST_ONLY", "ONBOARDING", "SUBMITTED", "UNDER_REVIEW", "ACTION_REQUIRED", "LIVE", "REJECTED", "SUSPENDED", "DEACTIVATED"];
// UI filter groups → MerchantStatus values.
const GROUPS = { active: STATUSES.filter((s) => !INACTIVE_ORG.includes(s)), pending: PENDING_ORG, verified: ["LIVE"], rejected: ["REJECTED"], suspended: ["SUSPENDED", "DEACTIVATED"] };

async function list(ctx) {
  const q = ctx.query, p = paging(q), r = dateRange(q, "all");
  const group = q.group ? GROUPS[String(q.group).toLowerCase()] || fail(400, "group must be active, pending, verified, rejected or suspended.") : null;
  const w = where()
    .add(`m.status = ANY(?::"MerchantStatus"[])`, enumList(q.status, STATUSES, "status"))
    .add(`m.status = ANY(?::"MerchantStatus"[])`, group)
    .add(`(m.id = ? OR m."displayName" ILIKE ? OR m."legalName" ILIKE ? OR m.email ILIKE ? OR m.mobile ILIKE ?)`, text(q.q), like(q.q), like(q.q), like(q.q), like(q.q))
    .range(`m."createdAt"`, r);
  // Transaction stats respect the mode selector; ? = every mode.
  const modeParam = w.next(ctx.mode);
  const sort = orderBy(q, { createdAt: `m."createdAt"`, name: `m."displayName"`, volume: `st.volume`, txnCount: `st.n`, status: `m.status` }, "createdAt");
  const rows = await db.query(
    `SELECT m.id, m."displayName", m."legalName", m.email, m.mobile, m.status, m."createdAt", m."activatedAt", m."payuMid",
            st.n AS "txnCount", st.volume, ps.status AS "payuAccountStatus", count(*) OVER() AS total
       FROM "Merchant" m
       LEFT JOIN LATERAL (SELECT count(*)::int AS n, COALESCE(sum(t."amountPaise") FILTER (WHERE t.status = 'SUCCESS'), 0) AS volume
                            FROM "Transaction" t WHERE t."merchantId" = m.id AND NOT t."isMandateRegistration"
                             AND (${modeParam}::"Mode" IS NULL OR t.mode = ${modeParam}::"Mode")) st ON true
       LEFT JOIN "PayuOnboardingStatus" ps ON ps."merchantId" = m.id AND ps.area = 'account'
       ${w.sql} ${sort} LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`,
    w.params
  );
  return pageOut(rows.map((m) => ({
    id: m.id, name: m.displayName, legalName: m.legalName, email: m.email, mobile: m.mobile, status: m.status,
    payuAccountStatus: m.payuAccountStatus, payuMid: m.payuMid, createdAt: m.createdAt, activatedAt: m.activatedAt,
    txnCount: m.txnCount, volume: num(m.volume),
  })), rows.length ? Number(rows[0].total) : 0, p);
}

async function detail(ctx) {
  const id = ctx.params.id;
  const m = await db.one(
    `SELECT id, "displayName", "legalName", email, mobile, "entityType", category, "subCategory", "panLast4", gstin, "websiteUrl", "appUrl",
            status, "integrationType", "activatedAt", "deactivatedAt", "createdAt", "updatedAt", "payuMid", "payuMerchantUuid"
       FROM "Merchant" WHERE id = $1`, [id]);
  if (!m) fail(404, "Organization not found.");

  const [addresses, steps, payu, docs, banks, members, creds, keys, hooks, stats] = await Promise.all([
    db.query(`SELECT kind, line1, line2, city, state, pincode FROM "MerchantAddress" WHERE "merchantId" = $1 ORDER BY kind`, [id]),
    // Step `data` is not returned: it is the merchant's form input; the profile fields above are the reviewed result.
    db.query(`SELECT key, status, remarks, "submittedAt", "verifiedAt", "updatedAt" FROM "OnboardingStep" WHERE "merchantId" = $1 ORDER BY key`, [id]),
    db.query(`SELECT area, status, remarks, "changedAt" FROM "PayuOnboardingStatus" WHERE "merchantId" = $1 ORDER BY area`, [id]),
    db.query(`SELECT id, type, "numberMasked", status, remarks, "uploadedAt", "reviewedAt", "payuDocumentId" IS NOT NULL AS "sentToPayu"
                FROM "KycDocument" WHERE "merchantId" = $1 ORDER BY "uploadedAt" DESC`, [id]),
    db.query(`SELECT id, "accountHolder", "accountLast4", ifsc, "bankName", "nameAtBank", "pennyDropVerified", "isPrimary", "createdAt", "retiredAt"
                FROM "BankAccount" WHERE "merchantId" = $1 ORDER BY "isPrimary" DESC, "createdAt" DESC`, [id]),
    db.query(`SELECT ms.id, ms.role, ms."createdAt", u.id AS "userId", u.name, u.email, u.status, u."lastLoginAt", u."platformRole"
                FROM "Membership" ms JOIN "User" u ON u.id = ms."userId" WHERE ms."merchantId" = $1 ORDER BY ms."createdAt"`, [id]),
    db.query(`SELECT id, mode, "payuMid", "merchantKey", "saltVersion", status, "isDefault", label, "issuedAt", "revokedAt"
                FROM "PayuCredential" WHERE "merchantId" = $1 ORDER BY mode, "isDefault" DESC, "issuedAt" DESC`, [id]),
    db.query(`SELECT id, mode, name, prefix, "lastUsedAt", "revokedAt", "createdAt" FROM "ApiKey" WHERE "merchantId" = $1 ORDER BY "createdAt" DESC`, [id]),
    db.query(`SELECT e.id, e.mode, e.url, e.events, e.active, e."createdAt",
                     count(d.id)::int AS deliveries, count(d.id) FILTER (WHERE d.status = 'FAILED')::int AS failed, max(d."createdAt") AS "lastDeliveryAt"
                FROM "WebhookEndpoint" e LEFT JOIN "WebhookDelivery" d ON d."endpointId" = e.id
               WHERE e."merchantId" = $1 GROUP BY e.id ORDER BY e."createdAt" DESC`, [id]),
    db.query(`SELECT t.mode, count(*)::int AS n, count(*) FILTER (WHERE t.status = 'SUCCESS')::int AS ok,
                     COALESCE(sum(t."amountPaise") FILTER (WHERE t.status = 'SUCCESS'), 0) AS volume,
                     (SELECT COALESCE(sum(r."amountPaise"), 0) FROM "Refund" r WHERE r."merchantId" = $1 AND r.mode = t.mode AND r.status <> 'FAILED') AS refunded,
                     (SELECT COALESCE(sum(s."netAmountPaise"), 0) FROM "Settlement" s WHERE s."merchantId" = $1 AND s.mode = t.mode AND s.status = 'PROCESSED') AS settled
                FROM "Transaction" t WHERE t."merchantId" = $1 AND NOT t."isMandateRegistration" GROUP BY t.mode`, [id]),
  ]);

  return {
    id: m.id, name: m.displayName, legalName: m.legalName, email: m.email, mobile: m.mobile, status: m.status,
    business: { entityType: m.entityType, category: m.category, subCategory: m.subCategory, panLast4: m.panLast4, gstin: m.gstin,
      websiteUrl: m.websiteUrl, appUrl: m.appUrl, integrationType: m.integrationType, addresses },
    payu: { mid: m.payuMid, merchantUuid: m.payuMerchantUuid, statuses: payu },
    dates: { createdAt: m.createdAt, updatedAt: m.updatedAt, activatedAt: m.activatedAt, deactivatedAt: m.deactivatedAt },
    onboarding: steps,
    documents: docs,
    bankAccounts: banks.map((b) => ({ id: b.id, holder: b.accountHolder, last4: b.accountLast4, ifsc: b.ifsc, bankName: b.bankName, nameAtBank: b.nameAtBank,
      verified: b.pennyDropVerified, primary: b.isPrimary, createdAt: b.createdAt, retiredAt: b.retiredAt })),
    users: members.map((x) => ({ membershipId: x.id, userId: x.userId, name: x.name, email: x.email, role: x.role, status: x.status,
      platformRole: x.platformRole, lastLoginAt: x.lastLoginAt, since: x.createdAt })),
    integrations: {
      credentials: creds.map((c) => ({ id: c.id, mode: c.mode, payuMid: c.payuMid, merchantKey: maskKey(c.merchantKey), saltVersion: c.saltVersion,
        status: c.status, isDefault: c.isDefault, label: c.label, issuedAt: c.issuedAt, revokedAt: c.revokedAt })),
      apiKeys: keys,
      webhooks: hooks,
    },
    stats: Object.fromEntries(stats.map((s) => [s.mode, { transactions: s.n, successful: s.ok, volume: num(s.volume), refunded: num(s.refunded), settled: num(s.settled) }])),
  };
}

module.exports = [
  ["GET", "/super/orgs", list, { platform: true }],
  ["GET", "/super/orgs/:id", detail, { platform: true }],
];
module.exports.STATUSES = STATUSES;

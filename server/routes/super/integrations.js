// Super Admin: PayU provider accounts, inbound/outbound webhooks, integration health and API key activity. Read-only.
// Never selected: PayuCredential.saltEnc, WebhookEndpoint.secretEnc, ApiKey.secretHash, InboundEvent.payload.
const db = require("../../db");
const { num, methodLabel } = require("../../shape");
const { paging, dateRange, where, enumList, like, text, maskKey, pageOut } = require("../../platform");

const SOURCES = ["SURL", "FURL", "PAYMENT_WEBHOOK", "REFUND_WEBHOOK", "DISPUTE_WEBHOOK", "ONBOARDING_WEBHOOK", "PAYMENT_LINK_WEBHOOK", "PAYOUT_WEBHOOK", "POLL"];
const PROCESSING = ["RECEIVED", "SIGNATURE_INVALID", "PROCESSED", "DUPLICATE", "FAILED"];
const DELIVERY = ["PENDING", "DELIVERED", "FAILED"];
const total = (rows) => (rows.length ? Number(rows[0].total) : 0);
const org = (x) => (x.merchantId ? { id: x.merchantId, name: x.orgName } : null);

// The only provider in this codebase is PayU (server/payu.js). Summary per mode from real rows.
async function providers(ctx) {
  const w = where().add(`c.mode = ?::"Mode"`, ctx.mode);
  const tw = where().add(`t.mode = ?::"Mode"`, ctx.mode);
  const [creds, txn] = await Promise.all([
    db.query(`SELECT c.mode, count(*)::int AS total, count(*) FILTER (WHERE c.status = 'ACTIVE')::int AS active,
                     count(DISTINCT c."merchantId")::int AS orgs FROM "PayuCredential" c ${w.sql} GROUP BY c.mode`, w.params),
    db.one(`SELECT max(t."completedAt") FILTER (WHERE t.status = 'SUCCESS') AS "lastSuccessAt",
                   max(t."updatedAt") FILTER (WHERE t."errorMessage" IS NOT NULL) AS "lastErrorAt",
                   count(*) FILTER (WHERE t."createdAt" > (now() AT TIME ZONE 'UTC') - interval '24 hours')::int AS "last24h",
                   count(*) FILTER (WHERE t."createdAt" > (now() AT TIME ZONE 'UTC') - interval '24 hours' AND t.status = 'SUCCESS')::int AS "ok24h"
              FROM "Transaction" t ${tw.sql}`, tw.params),
  ]);
  return [{ name: "PayU", accounts: creds, ...txn }];
}

async function accounts(ctx) {
  const q = ctx.query, p = paging(q);
  const w = where().add(`c.mode = ?::"Mode"`, ctx.mode)
    .add(`c.status = ANY(?::"CredentialStatus"[])`, enumList(q.status, ["ACTIVE", "ROTATING", "REVOKED"], "status"))
    .add(`c."merchantId" = ?`, text(q.orgId))
    .add(`(m."displayName" ILIKE ? OR c."payuMid"::text = ? OR c.label ILIKE ?)`, like(q.q), text(q.q), like(q.q));
  const rows = await db.query(
    `SELECT c.id, c.mode, c."payuMid", c."merchantKey", c."saltVersion", c.status, c."isDefault", c.label, c."issuedAt", c."revokedAt",
            c."merchantId", m."displayName" AS "orgName", ok.at AS "lastSuccessAt", er.at AS "lastErrorAt", er.code AS "lastErrorCode", er.message AS "lastError",
            count(*) OVER() AS total
       FROM "PayuCredential" c JOIN "Merchant" m ON m.id = c."merchantId"
       LEFT JOIN LATERAL (SELECT t."completedAt" AS at FROM "Transaction" t WHERE t."credentialId" = c.id AND t.status = 'SUCCESS'
                           ORDER BY t."completedAt" DESC NULLS LAST LIMIT 1) ok ON true
       LEFT JOIN LATERAL (SELECT t."updatedAt" AS at, t."errorCode" AS code, t."errorMessage" AS message FROM "Transaction" t
                           WHERE t."credentialId" = c.id AND t."errorMessage" IS NOT NULL ORDER BY t."updatedAt" DESC LIMIT 1) er ON true
      ${w.sql} ORDER BY c."issuedAt" DESC LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map((c) => ({
    id: c.id, provider: "PayU", accountId: c.payuMid, merchantKey: maskKey(c.merchantKey), saltVersion: c.saltVersion, org: org(c), mode: c.mode,
    status: c.status, isDefault: c.isDefault, label: c.label, issuedAt: c.issuedAt, revokedAt: c.revokedAt,
    lastSuccessAt: c.lastSuccessAt, lastError: c.lastErrorAt ? { at: c.lastErrorAt, code: c.lastErrorCode, message: c.lastError } : null,
  })), total(rows), p);
}

function inboundFilter(ctx) {
  const q = ctx.query;
  return where().add(`e.mode = ?::"Mode"`, ctx.mode)
    .add(`e.source = ANY(?::"InboundSource"[])`, enumList(q.source, SOURCES, "source"))
    .add(`e.processing = ANY(?::"EventProcessing"[])`, enumList(q.processing, PROCESSING, "processing"))
    .add(q.failed === "1" ? `e.processing IN ('FAILED','SIGNATURE_INVALID')` : `true`)
    .add(`e."merchantId" = ?`, text(q.orgId))
    .add(`(e.id = ? OR EXISTS (SELECT 1 FROM "TransactionEvent" te JOIN "Transaction" t ON t.id = te."transactionId" WHERE te."inboundEventId" = e.id AND t.txnid ILIKE ?))`, text(q.q), like(q.q))
    .range(`e."receivedAt"`, dateRange(q, "all"));
}
async function inbound(ctx) {
  const p = paging(ctx.query), w = inboundFilter(ctx);
  const rows = await db.query(
    `SELECT e.id, e.source, e.mode, e."signatureValid", e.processing, e.error, e."receivedAt", e."processedAt", e."merchantId", m."displayName" AS "orgName",
            (SELECT t.txnid FROM "TransactionEvent" te JOIN "Transaction" t ON t.id = te."transactionId" WHERE te."inboundEventId" = e.id LIMIT 1) AS txnid,
            count(*) OVER() AS total
       FROM "InboundEvent" e LEFT JOIN "Merchant" m ON m.id = e."merchantId"
      ${w.sql} ORDER BY e."receivedAt" DESC LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map((e) => ({
    id: e.id, provider: "PayU", source: e.source, mode: e.mode, org: org(e), txnid: e.txnid,
    signature: e.signatureValid === null ? "NOT_PROVIDED" : e.signatureValid ? "VALID" : "INVALID",
    processing: e.processing, error: e.error, receivedAt: e.receivedAt, processedAt: e.processedAt,
  })), total(rows), p);
}

async function outbound(ctx) {
  const q = ctx.query, p = paging(q);
  const w = where().add(`ep.mode = ?::"Mode"`, ctx.mode)
    .add(`d.status = ANY(?::"DeliveryStatus"[])`, enumList(q.status, DELIVERY, "status"))
    .add(`ep."merchantId" = ?`, text(q.orgId))
    .add(`(d."eventId" ILIKE ? OR d.event ILIKE ? OR ep.url ILIKE ?)`, like(q.q), like(q.q), like(q.q))
    .range(`d."createdAt"`, dateRange(q, "all"));
  const rows = await db.query(
    `SELECT d.id, d."eventId", d.event, d.status, d.attempts, d."responseCode", d."nextRetryAt", d."createdAt",
            ep.id AS "endpointId", ep.url, ep.mode, ep.active, ep."merchantId", m."displayName" AS "orgName", count(*) OVER() AS total
       FROM "WebhookDelivery" d JOIN "WebhookEndpoint" ep ON ep.id = d."endpointId" JOIN "Merchant" m ON m.id = ep."merchantId"
      ${w.sql} ORDER BY d."createdAt" DESC LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map((d) => ({
    id: d.id, eventId: d.eventId, event: d.event, status: d.status, attempts: d.attempts, responseCode: d.responseCode,
    retry: d.status === "DELIVERED" ? "NONE" : d.nextRetryAt ? "SCHEDULED" : d.status === "FAILED" ? "EXHAUSTED_OR_MANUAL" : "PENDING",
    nextRetryAt: d.nextRetryAt, date: d.createdAt, endpoint: { id: d.endpointId, url: d.url, active: d.active }, mode: d.mode, org: org(d),
  })), total(rows), p);
}

async function health(ctx) {
  const mode = ctx.mode, mw = (a) => where().add(`${a}.mode = ?::"Mode"`, mode);
  const e1 = mw("e"), d1 = mw("ep"), t1 = mw("t");
  const [down, inb, out, methods] = await Promise.all([
    db.query(`SELECT id, method, "bankCode", severity, message, "startedAt", "endedAt", source FROM "GatewayDowntime"
               WHERE "endedAt" IS NULL OR "endedAt" >= (now() AT TIME ZONE 'UTC') - interval '7 days' ORDER BY ("endedAt" IS NULL) DESC, "startedAt" DESC LIMIT 100`),
    db.one(`SELECT count(*) FILTER (WHERE e."receivedAt" > (now() AT TIME ZONE 'UTC') - interval '24 hours')::int AS "received24h",
                   count(*) FILTER (WHERE e.processing IN ('FAILED','SIGNATURE_INVALID') AND e."receivedAt" > (now() AT TIME ZONE 'UTC') - interval '24 hours')::int AS "failed24h",
                   count(*) FILTER (WHERE e.processing = 'SIGNATURE_INVALID')::int AS "signatureInvalid",
                   max(e."processedAt") FILTER (WHERE e.processing = 'PROCESSED') AS "lastSuccessAt",
                   max(e."receivedAt") FILTER (WHERE e.processing IN ('FAILED','SIGNATURE_INVALID')) AS "lastErrorAt"
              FROM "InboundEvent" e ${e1.sql}`, e1.params),
    db.one(`SELECT count(*) FILTER (WHERE d.status = 'PENDING')::int AS pending, count(*) FILTER (WHERE d.status = 'FAILED')::int AS failed,
                   count(*) FILTER (WHERE d.status = 'DELIVERED')::int AS delivered,
                   max(d."createdAt") FILTER (WHERE d.status = 'DELIVERED') AS "lastDeliveredAt",
                   max(d."createdAt") FILTER (WHERE d.status = 'FAILED') AS "lastFailedAt"
              FROM "WebhookDelivery" d JOIN "WebhookEndpoint" ep ON ep.id = d."endpointId" ${d1.sql}`, d1.params),
    db.query(`SELECT t.method, count(*)::int AS n, count(*) FILTER (WHERE t.status = 'SUCCESS')::int AS ok
                FROM "Transaction" t ${t1.sql}${t1.sql ? " AND" : " WHERE"} t."createdAt" > (now() AT TIME ZONE 'UTC') - interval '24 hours'
               GROUP BY 1 ORDER BY 2 DESC`, t1.params),
  ]);
  const shape = (d) => ({ id: d.id, method: methodLabel(d.method), bank: d.bankCode, severity: d.severity, message: d.message, source: d.source, startedAt: d.startedAt, endedAt: d.endedAt });
  return {
    checkedAt: new Date(),
    gateway: { active: down.filter((d) => !d.endedAt).map(shape), recent: down.filter((d) => d.endedAt).map(shape) },
    inbound: inb, outbound: out,
    methods24h: methods.map((m) => ({ method: methodLabel(m.method), total: m.n, successful: m.ok, successRate: m.n ? m.ok / m.n : null })),
  };
}

// API activity: only ApiKey.lastUsedAt is recorded (no per-request log exists).
async function apiKeys(ctx) {
  const q = ctx.query, p = paging(q);
  const w = where().add(`k.mode = ?::"Mode"`, ctx.mode).add(`k."merchantId" = ?`, text(q.orgId))
    .add(q.state === "active" ? `k."revokedAt" IS NULL` : q.state === "revoked" ? `k."revokedAt" IS NOT NULL` : `true`)
    .add(`(k.name ILIKE ? OR k.prefix ILIKE ? OR m."displayName" ILIKE ?)`, like(q.q), like(q.q), like(q.q));
  const rows = await db.query(
    `SELECT k.id, k.name, k.prefix, k.mode, k."lastUsedAt", k."revokedAt", k."createdAt", k."merchantId", m."displayName" AS "orgName", count(*) OVER() AS total
       FROM "ApiKey" k JOIN "Merchant" m ON m.id = k."merchantId"
      ${w.sql} ORDER BY k."lastUsedAt" DESC NULLS LAST, k."createdAt" DESC LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`, w.params);
  return pageOut(rows.map(({ total, orgName, merchantId, ...k }) => ({ ...k, org: { id: merchantId, name: orgName } })), total(rows), p);
}

module.exports = [
  ["GET", "/super/providers", providers, { platform: true }],
  ["GET", "/super/provider-accounts", accounts, { platform: true }],
  ["GET", "/super/webhooks/inbound", inbound, { platform: true }],
  ["GET", "/super/webhooks/outbound", outbound, { platform: true }],
  ["GET", "/super/integration-health", health, { platform: true }],
  ["GET", "/super/api-keys", apiKeys, { platform: true }],
];

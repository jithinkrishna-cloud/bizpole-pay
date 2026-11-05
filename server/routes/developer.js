// Developer page: PayU credentials (read-only; managed by Bizpole), Paynest API keys, webhook endpoints and their deliveries.
const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { encrypt, decrypt, sha256, token } = require("../secrets");

const DEV_ROLES = ["OWNER", "ADMIN", "DEVELOPER"];
const requireDev = (ctx) => {
  if (!DEV_ROLES.includes(ctx.auth.role)) fail(403, "Only the owner, an admin or a developer can change developer settings.");
};
const EVENTS = ["payment.success", "payment.failed", "payment.pending", "refund.processed", "settlement.processed", "link.paid", "chargeback.created"];
const log = (ctx, action, entity, entityId, meta) =>
  audit(db, { merchantId: ctx.auth.merchantId, userId: ctx.auth.user.id, mode: ctx.mode, action, entity, entityId, ip: clientIp(ctx.req), meta });

/* ---------- outbound HTTP to merchant-supplied URLs (webhooks, website checks) ---------- */
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}
// Fetch a public URL. Refuses private/loopback hosts and does not follow redirects.
async function safeFetch(url, opts = {}, { httpsOnly = false, timeoutMs = 10000 } = {}) {
  let u;
  try { u = new URL(url); } catch { const e = new Error("Not a valid URL"); e.code = "BAD_URL"; throw e; }
  if (!(u.protocol === "https:" || (!httpsOnly && u.protocol === "http:"))) { const e = new Error(httpsOnly ? "Only https:// URLs are allowed" : "Only http(s) URLs are allowed"); e.code = "BAD_URL"; throw e; }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) { const e = new Error(`Couldn't resolve ${host}`); e.code = "DNS"; throw e; }
  if (addrs.some(privateIp)) { const e = new Error(`${host} points to a private network address`); e.code = "PRIVATE"; throw e; }
  const t0 = Date.now();
  const res = await fetch(u, { ...opts, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  return { res, ms: Date.now() - t0 };
}
const httpsUrl = (v) => /^https:\/\/[^\s/?#]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(v);

/* ---------- reads ---------- */
const maskKey = (k) => (k.length <= 4 ? "••••" : k.slice(0, 2) + "•".repeat(Math.min(8, k.length - 4)) + k.slice(-2));

async function credentials(merchantId, mode) {
  const rows = await db.query(
    `SELECT id, "payuMid", "merchantKey", "saltVersion", status, "isDefault", label, source, "issuedAt", "revokedAt"
       FROM "PayuCredential" WHERE "merchantId"=$1 AND mode=$2 ORDER BY "isDefault" DESC, "issuedAt" DESC`,
    [merchantId, mode]
  );
  return rows.map((c) => ({
    id: c.id, mid: String(c.payuMid), key: maskKey(c.merchantKey), saltVersion: c.saltVersion, status: c.status,
    isDefault: c.isDefault, label: c.label || "", source: c.source, issuedAt: c.issuedAt, revokedAt: c.revokedAt,
  }));
}
async function apiKeys(merchantId, mode) {
  const rows = await db.query(
    `SELECT id, name, prefix, "lastUsedAt", "createdAt" FROM "ApiKey"
      WHERE "merchantId"=$1 AND mode=$2 AND "revokedAt" IS NULL ORDER BY "createdAt" DESC`,
    [merchantId, mode]
  );
  return rows.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, created: k.createdAt, lastUsed: k.lastUsedAt }));
}
async function webhooks(merchantId, mode) {
  const rows = await db.query(
    `SELECT id, url, events, active, "createdAt" FROM "WebhookEndpoint" WHERE "merchantId"=$1 AND mode=$2 ORDER BY "createdAt"`,
    [merchantId, mode]
  );
  return rows.map((w) => ({ id: w.id, url: w.url, events: w.events, active: w.active, created: w.createdAt }));
}
async function deliveries(merchantId, mode) {
  const rows = await db.query(
    `SELECT d.id, d."eventId", d.event, d.payload, d.status, d.attempts, d."responseCode", d."createdAt", e.url, e.id AS "endpointId"
       FROM "WebhookDelivery" d JOIN "WebhookEndpoint" e ON e.id = d."endpointId"
      WHERE e."merchantId"=$1 AND e.mode=$2 ORDER BY d."createdAt" DESC LIMIT 500`,
    [merchantId, mode]
  );
  return rows.map((d) => ({
    id: d.id, eventId: d.eventId, event: d.event, payload: d.payload, status: d.status, attempts: d.attempts,
    code: d.responseCode, at: d.createdAt, url: d.url, endpointId: d.endpointId,
  }));
}
async function endpointOf(ctx, id) {
  const w = await db.one(
    `SELECT id, url, "secretEnc", events, active FROM "WebhookEndpoint" WHERE id=$1 AND "merchantId"=$2 AND mode=$3`,
    [id, ctx.auth.merchantId, ctx.mode]
  );
  if (!w) fail(404, "Webhook endpoint not found.");
  return w;
}

// POST the payload to the endpoint with a "t=<unix>,v1=<hmac>" signature and record the outcome on the delivery row.
async function deliver(endpoint, deliveryId, payload) {
  const body = JSON.stringify(payload), t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", decrypt(endpoint.secretEnc)).update(`${t}.${body}`).digest("hex");
  let code = null, ms = null, text = "", error = null;
  try {
    const out = await safeFetch(endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "BizpolePay-Webhooks/1.0", "bizpolepay-signature": `t=${t},v1=${sig}` },
      body,
    }, { httpsOnly: true });
    code = out.res.status; ms = out.ms;
    text = (await out.res.text().catch(() => "")).slice(0, 2000);
  } catch (e) {
    error = e.name === "TimeoutError" ? "Timed out after 10 s" : e.code === "PRIVATE" || e.code === "DNS" || e.code === "BAD_URL" ? e.message : "Connection failed: " + (e.cause?.code || e.message);
  }
  const ok = code != null && code >= 200 && code < 300;
  await db.query(
    `UPDATE "WebhookDelivery" SET status=$2, attempts=attempts+1, "responseCode"=$3, "nextRetryAt"=NULL WHERE id=$1`,
    [deliveryId, ok ? "DELIVERED" : "FAILED", code]
  );
  return { ok, code, ms, body: text, error, signature: `t=${t},v1=${sig}` };
}

/* ---------- routes ---------- */
module.exports = [
  ["GET", "/developer", async ({ auth, mode }) => {
    const [c, k, w, d] = await Promise.all([
      credentials(auth.merchantId, mode), apiKeys(auth.merchantId, mode), webhooks(auth.merchantId, mode), deliveries(auth.merchantId, mode),
    ]);
    return { credentials: c, apiKeys: k, webhooks: w, deliveries: d, events: EVENTS };
  }],

  // PayU credentials are managed by Bizpole (Super Admin → organisation → provider accounts). This endpoint stays so older
  // clients get a clear answer, and each attempt is recorded (docs/PAYMENT_PROVIDER_CONFIG.md §5.4).
  ["POST", "/developer/credentials", async (ctx) => {
    await log(ctx, "developer.credential_write_blocked", "PayuCredential", null, { mode: ctx.mode });
    fail(403, "Payment provider credentials are managed by Bizpole. Contact Bizpole support to add or change them.", { code: "MANAGED_BY_PLATFORM" });
  }, { anyRole: true }],

  ["POST", "/developer/keys", async (ctx) => {
    requireDev(ctx);
    const name = String(ctx.body.name || "").trim();
    if (name.length < 3 || name.length > 60) fail(400, "Give the key a name (3 to 60 characters).");
    const count = await db.one(`SELECT COUNT(*)::int AS n FROM "ApiKey" WHERE "merchantId"=$1 AND mode=$2 AND "revokedAt" IS NULL`, [ctx.auth.merchantId, ctx.mode]);
    if (count.n >= 20) fail(409, "You already have 20 active keys in this mode. Revoke one first.");
    const prefix = `pn_${ctx.mode.toLowerCase()}_${crypto.randomBytes(5).toString("hex")}`;
    const secret = `${prefix}_${token(24)}`;
    const id = db.id();
    await db.query(
      `INSERT INTO "ApiKey" (id,"merchantId",mode,name,prefix,"secretHash") VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, ctx.auth.merchantId, ctx.mode, name, prefix, sha256(secret)]
    );
    await log(ctx, "api_key.created", "ApiKey", id, { name, prefix });
    return { key: (await apiKeys(ctx.auth.merchantId, ctx.mode)).find((k) => k.id === id), secret };
  }],

  ["DELETE", "/developer/keys/:id", async (ctx) => {
    requireDev(ctx);
    const k = await db.one(
      `UPDATE "ApiKey" SET "revokedAt"=now() WHERE id=$1 AND "merchantId"=$2 AND mode=$3 AND "revokedAt" IS NULL RETURNING id, prefix`,
      [ctx.params.id, ctx.auth.merchantId, ctx.mode]
    );
    if (!k) fail(404, "API key not found.");
    await log(ctx, "api_key.revoked", "ApiKey", k.id, { prefix: k.prefix });
    return { ok: true };
  }],

  ["POST", "/developer/webhooks", async (ctx) => {
    requireDev(ctx);
    const { url, events, active } = cleanHook(ctx.body);
    const n = await db.one(`SELECT COUNT(*)::int AS n FROM "WebhookEndpoint" WHERE "merchantId"=$1 AND mode=$2`, [ctx.auth.merchantId, ctx.mode]);
    if (n.n >= 10) fail(409, "You can have up to 10 endpoints per mode.");
    const id = db.id(), secret = "whsec_" + token(24);
    await db.query(
      `INSERT INTO "WebhookEndpoint" (id,"merchantId",mode,url,"secretEnc",events,active) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, ctx.auth.merchantId, ctx.mode, url, encrypt(secret), events, active]
    );
    await log(ctx, "webhook.created", "WebhookEndpoint", id, { url, events });
    return { webhook: (await webhooks(ctx.auth.merchantId, ctx.mode)).find((w) => w.id === id), secret };
  }],

  ["PATCH", "/developer/webhooks/:id", async (ctx) => {
    requireDev(ctx);
    await endpointOf(ctx, ctx.params.id);
    const { url, events, active } = cleanHook(ctx.body);
    await db.query(`UPDATE "WebhookEndpoint" SET url=$2, events=$3, active=$4 WHERE id=$1`, [ctx.params.id, url, events, active]);
    await log(ctx, "webhook.updated", "WebhookEndpoint", ctx.params.id, { url, events, active });
    return { webhook: (await webhooks(ctx.auth.merchantId, ctx.mode)).find((w) => w.id === ctx.params.id) };
  }],

  ["DELETE", "/developer/webhooks/:id", async (ctx) => {
    requireDev(ctx);
    const w = await endpointOf(ctx, ctx.params.id);
    await db.query(`DELETE FROM "WebhookEndpoint" WHERE id=$1`, [w.id]);
    await log(ctx, "webhook.deleted", "WebhookEndpoint", w.id, { url: w.url });
    return { ok: true };
  }],

  // Real signed POST of a "webhook.test" event to the endpoint. The response code is whatever the merchant's server returned.
  ["POST", "/developer/webhooks/:id/test", async (ctx) => {
    requireDev(ctx);
    const w = await endpointOf(ctx, ctx.params.id);
    const eventId = "evt_test_" + crypto.randomBytes(8).toString("hex");
    const payload = { id: eventId, type: "webhook.test", mode: ctx.mode.toLowerCase(), created: new Date().toISOString(),
      data: { message: "Test event from Bizpole Pay. No payment was made." } };
    const did = db.id();
    await db.query(
      `INSERT INTO "WebhookDelivery" (id,"endpointId","eventId",event,payload,status) VALUES ($1,$2,$3,'webhook.test',$4,'PENDING')`,
      [did, w.id, eventId, JSON.stringify(payload)]
    );
    const out = await deliver(w, did, payload);
    await log(ctx, "webhook.test_sent", "WebhookEndpoint", w.id, { deliveryId: did, responseCode: out.code });
    return { ...out, url: w.url, payload, deliveryId: did };
  }],

  ["POST", "/developer/deliveries/:id/redeliver", async (ctx) => {
    requireDev(ctx);
    const d = await db.one(
      `SELECT d.id, d.payload, e.id AS "endpointId" FROM "WebhookDelivery" d JOIN "WebhookEndpoint" e ON e.id = d."endpointId"
        WHERE d.id=$1 AND e."merchantId"=$2 AND e.mode=$3`,
      [ctx.params.id, ctx.auth.merchantId, ctx.mode]
    );
    if (!d) fail(404, "Delivery not found.");
    const w = await endpointOf(ctx, d.endpointId);
    const out = await deliver(w, d.id, d.payload);
    await log(ctx, "webhook.redelivered", "WebhookDelivery", d.id, { responseCode: out.code });
    return { ...out, url: w.url };
  }],
];

function cleanHook(b) {
  const url = String(b.url || "").trim();
  if (!httpsUrl(url) || url.length > 500) fail(400, "Use a public https:// URL.");
  const events = [...new Set((Array.isArray(b.events) ? b.events : []).map(String))].filter((e) => EVENTS.includes(e));
  if (!events.length) fail(400, "Pick at least one event.");
  return { url, events, active: b.active !== false };
}

module.exports.safeFetch = safeFetch;
module.exports.privateIp = privateIp;

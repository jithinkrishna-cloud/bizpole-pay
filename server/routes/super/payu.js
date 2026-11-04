// Super Admin: PayU provider settings (Test / Live) and each organisation's PayU accounts.
// docs/PAYU_PROVIDER_CONFIG.md. Every write is audited; Live writes need the operator's password again.
// Secrets are write-only: responses carry masked keys and { set, last4 } for the partner secret, never salts.
const db = require("../../db");
const { fail } = require("../../http");
const { audit, clientIp, confirmPassword } = require("../../auth");
const { encrypt } = require("../../secrets");
const { maskKey, text } = require("../../platform");
const config = require("../../payu-config");

const modeParam = (ctx) => db.dbMode(ctx.params.mode);
const log = (ctx, { merchantId = null, mode = null, action, entity, entityId, meta }) =>
  audit(db, { merchantId, userId: ctx.auth.user.id, mode, action, entity, entityId, ip: clientIp(ctx.req), meta });
const liveCheck = (ctx, mode, action) => (mode === "LIVE" ? confirmPassword(ctx, ctx.body.password, action) : null);

/* ---------- provider settings ---------- */
async function getConfig() {
  const [test, live] = await Promise.all(config.MODES.map(async (m) => { config.clearCache(); return config.publicView(await config.resolve(m)); }));
  return { test, live };
}

async function putConfig(ctx) {
  const mode = modeParam(ctx);
  await liveCheck(ctx, mode, "platform.payu_config.updated");
  const b = ctx.body || {};
  const patch = {
    version: b.version, enabled: b.enabled, partnerClientId: b.partnerClientId, partnerClientSecret: b.partnerClientSecret,
    clearPartner: b.clearPartner === true, defaultCredential: b.defaultCredential || undefined, clearDefault: b.clearDefault === true,
  };
  for (const f of config.URL_FIELDS) if (b[f] !== undefined) patch[f] = b[f];
  const r = await config.save(mode, patch, ctx.auth.user.id);
  if (r.changed.length)
    await log(ctx, { mode, action: "platform.payu_config.updated", entity: "PayuProviderConfig", entityId: mode, meta: {
      changed: r.changed, enabledBefore: r.enabledBefore, enabledAfter: r.enabledAfter,
      secretChanged: r.changed.includes("partnerClientSecret"), defaultCredentialChanged: r.changed.includes("defaultCredential"), version: r.version,
    } });
  return { changed: r.changed, config: config.publicView(await config.resolve(mode)) };
}

async function testConfig(ctx) {
  const mode = modeParam(ctx);
  config.clearCache();
  const r = await config.testConnection(mode, { scope: text(ctx.body.scope, 200) });
  await log(ctx, { mode, action: "platform.payu_config.tested", entity: "PayuProviderConfig", entityId: mode, meta: { ok: r.ok, code: r.code, status: r.status || null } });
  return r;
}

/* ---------- organisation PayU accounts ---------- */
async function org(id) {
  const m = await db.one(`SELECT id, "displayName" FROM "Merchant" WHERE id = $1`, [id]);
  if (!m) fail(404, "Organization not found.");
  return m;
}
async function accounts(merchantId) {
  const rows = await db.query(
    `SELECT c.id, c.mode, c."payuMid", c."merchantKey", c."saltVersion", c.status, c."isDefault", c.label, c.source, c."issuedAt", c."revokedAt",
            cu.name AS "createdByName", ru.name AS "revokedByName"
       FROM "PayuCredential" c LEFT JOIN "User" cu ON cu.id = c."createdById" LEFT JOIN "User" ru ON ru.id = c."revokedById"
      WHERE c."merchantId" = $1 ORDER BY c.mode, c."isDefault" DESC, c."issuedAt" DESC`, [merchantId]);
  return rows.map((c) => ({
    id: c.id, mode: c.mode, payuMid: String(c.payuMid), merchantKey: maskKey(c.merchantKey), saltVersion: c.saltVersion, status: c.status,
    isDefault: c.isDefault, label: c.label, source: c.source, issuedAt: c.issuedAt, revokedAt: c.revokedAt,
    createdBy: c.createdByName || null, revokedBy: c.revokedByName || null,
  }));
}

async function listAccounts(ctx) {
  const m = await org(ctx.params.id);
  const [test, live] = await Promise.all(config.MODES.map((x) => config.resolve(x)));
  return { org: { id: m.id, name: m.displayName }, modes: { test: { enabled: test.enabled }, live: { enabled: live.enabled } }, accounts: await accounts(m.id) };
}

// Assign or replace the organisation's default credential for a mode.
async function assign(ctx) {
  const m = await org(ctx.params.id);
  const b = ctx.body || {};
  const mode = db.dbMode(b.mode);
  await liveCheck(ctx, mode, "platform.payu_credential.assigned");
  const cred = config.cleanMerchantCredential(b);
  const label = String(b.label || "").trim().slice(0, 60) || (mode === "LIVE" ? "Live MID" : "Test MID");
  const revokePrevious = b.revokePrevious === true;

  const out = await db.tx(async (c) => {
    const same = await c.one(
      `SELECT c.id, c."merchantId", m."displayName" FROM "PayuCredential" c JOIN "Merchant" m ON m.id = c."merchantId"
        WHERE c.mode = $1 AND c."merchantKey" = $2 AND c."saltVersion" = $3`, [mode, cred.key, cred.saltVersion]);
    if (same && same.merchantId !== m.id)
      fail(409, `This PayU key is already linked to another organization (${same.displayName}). Revoke it there first.`, { field: "key" });
    const prev = await c.one(`SELECT id FROM "PayuCredential" WHERE "merchantId"=$1 AND mode=$2 AND "isDefault" AND status='ACTIVE'`, [m.id, mode]);
    // Only one ACTIVE default per (merchant, mode) – partial unique index. Step the old one down first.
    if (prev && (!same || prev.id !== same.id))
      await c.q(
        revokePrevious
          ? `UPDATE "PayuCredential" SET "isDefault"=false, status='REVOKED', "revokedAt"=now(), "revokedById"=$2 WHERE id=$1`
          : `UPDATE "PayuCredential" SET "isDefault"=false WHERE id=$1`,
        revokePrevious ? [prev.id, ctx.auth.user.id] : [prev.id]);
    let id;
    if (same) {
      // Same key and salt version on this organisation: replace the stored salt and make it the default again.
      id = same.id;
      await c.q(
        `UPDATE "PayuCredential" SET "payuMid"=$2, "saltEnc"=$3, status='ACTIVE', "isDefault"=true, label=$4, "revokedAt"=NULL, "revokedById"=NULL,
                source='PLATFORM', "createdById"=$5 WHERE id=$1`,
        [id, cred.mid, encrypt(cred.salt), label, ctx.auth.user.id]);
    } else {
      id = db.id();
      await c.q(
        `INSERT INTO "PayuCredential" (id,"merchantId",mode,"payuMid","merchantKey","saltVersion","saltEnc",status,"isDefault",label,source,"createdById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',true,$8,'PLATFORM',$9)`,
        [id, m.id, mode, cred.mid, cred.key, cred.saltVersion, encrypt(cred.salt), label, ctx.auth.user.id]);
    }
    await audit(c, { merchantId: m.id, userId: ctx.auth.user.id, mode, action: "platform.payu_credential.assigned", entity: "PayuCredential", entityId: id,
      ip: clientIp(ctx.req), meta: { payuMid: String(cred.mid), merchantKey: maskKey(cred.key), saltVersion: cred.saltVersion,
        replacedCredentialId: prev && prev.id !== id ? prev.id : null, previousRevoked: !!(prev && prev.id !== id && revokePrevious), label } });
    return id;
  });
  return { id: out, accounts: await accounts(m.id) };
}

async function revoke(ctx) {
  const m = await org(ctx.params.id);
  const c0 = await db.one(`SELECT id, mode, "payuMid", "merchantKey", status FROM "PayuCredential" WHERE id=$1 AND "merchantId"=$2`, [ctx.params.credId, m.id]);
  if (!c0) fail(404, "PayU account not found on this organization.");
  if (c0.status === "REVOKED") fail(409, "This PayU account is already revoked.");
  await liveCheck(ctx, c0.mode, "platform.payu_credential.revoked");
  const reason = text(ctx.body.reason, 200);
  await db.tx(async (c) => {
    await c.q(`UPDATE "PayuCredential" SET status='REVOKED', "isDefault"=false, "revokedAt"=now(), "revokedById"=$2 WHERE id=$1`, [c0.id, ctx.auth.user.id]);
    await audit(c, { merchantId: m.id, userId: ctx.auth.user.id, mode: c0.mode, action: "platform.payu_credential.revoked", entity: "PayuCredential", entityId: c0.id,
      ip: clientIp(ctx.req), meta: { payuMid: String(c0.payuMid), merchantKey: maskKey(c0.merchantKey), reason } });
  });
  return { accounts: await accounts(m.id) };
}

module.exports = [
  ["GET", "/super/payu/config", getConfig, { platform: true }],
  ["PUT", "/super/payu/config/:mode", putConfig, { platform: true }],
  ["POST", "/super/payu/config/:mode/test", testConfig, { platform: true }],
  ["GET", "/super/orgs/:id/payu-accounts", listAccounts, { platform: true }],
  ["POST", "/super/orgs/:id/payu-accounts", assign, { platform: true }],
  ["POST", "/super/orgs/:id/payu-accounts/:credId/revoke", revoke, { platform: true }],
];

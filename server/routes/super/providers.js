// Super Admin: payment provider connections (added from the UI, each an instance of a provider type), their settings
// per mode (Test / Live), which connection is active in each mode, and each organisation's provider accounts. Fields come from the provider definitions (server/providers/*.js); nothing here is provider-specific.
// Every write is audited; Live writes need the operator's password again. Secrets are write-only.
const db = require("../../db");
const { fail } = require("../../http");
const { audit, clientIp, confirmPassword } = require("../../auth");
const { encrypt } = require("../../secrets");
const { text } = require("../../platform");
const registry = require("../../providers");
const config = require("../../providers/config");

const modeParam = (ctx) => db.dbMode(ctx.params.mode);
const log = (ctx, { merchantId = null, mode = null, action, entity, entityId, meta }) =>
  audit(db, { merchantId, userId: ctx.auth.user.id, mode, action, entity, entityId, ip: clientIp(ctx.req), meta });
const liveCheck = (ctx, mode, action) => (mode === "LIVE" ? confirmPassword(ctx, ctx.body.password, action) : null);

/* ---------- provider connections ---------- */
const getSettings = () => config.overview();

async function createConnection(ctx) {
  const b = ctx.body || {};
  const c = await config.createConnection(b.type, b.name, ctx.auth.user.id);
  await log(ctx, { action: "platform.provider_connection.created", entity: "ProviderConnection", entityId: c.id, meta: { provider: c.provider, name: c.name } });
  return { id: c.id };
}

async function renameConnection(ctx) {
  const r = await config.renameConnection(ctx.params.id, (ctx.body || {}).name);
  if (r.before !== r.after)
    await log(ctx, { action: "platform.provider_connection.renamed", entity: "ProviderConnection", entityId: ctx.params.id, meta: { before: r.before, after: r.after } });
  return { ok: true };
}

async function archiveConnection(ctx) {
  const r = await config.archiveConnection(ctx.params.id);
  await log(ctx, { action: "platform.provider_connection.archived", entity: "ProviderConnection", entityId: r.id, meta: { provider: r.provider, name: r.name, reason: text((ctx.body || {}).reason, 200) } });
  return { ok: true };
}

/* ---------- connection settings per mode ---------- */
async function putSettings(ctx) {
  const mode = modeParam(ctx), id = ctx.params.id;
  await liveCheck(ctx, mode, "platform.provider_config.updated");
  const b = ctx.body || {};
  const r = await config.save(id, mode, {
    version: b.version, enabled: b.enabled, activate: b.activate === true, values: b.values && typeof b.values === "object" ? b.values : undefined,
    clearGroups: b.clearGroups, sharedAccount: b.sharedAccount || undefined, clearSharedAccount: b.clearSharedAccount === true,
  }, ctx.auth.user.id);
  const p = registry.get(r.provider);
  const secretKeys = p.settings.filter((f) => f.type === "secret").map((f) => f.key);
  if (r.changed.length)
    await log(ctx, { mode, action: r.activated ? "platform.provider_config.activated" : "platform.provider_config.updated", entity: "ProviderConnection",
      entityId: id, meta: {
        provider: p.id, changed: r.changed, enabledBefore: r.enabledBefore, enabledAfter: r.enabledAfter, activated: r.activated,
        replacedConnection: r.replaced, secretsChanged: r.changed.filter((k) => secretKeys.includes(k)),
        sharedAccountChanged: r.changed.includes("sharedAccount"), version: r.version,
      } });
  return { changed: r.changed, config: config.publicView(await config.resolve(mode, id)) };
}

async function testSettings(ctx) {
  const mode = modeParam(ctx), id = ctx.params.id;
  const r = await config.testConnection(mode, id, { scope: text(ctx.body.scope, 200) });
  await log(ctx, { mode, action: "platform.provider_config.tested", entity: "ProviderConnection", entityId: id, meta: { ok: r.ok, code: r.code, status: r.status || null } });
  return r;
}

/* ---------- organisation provider accounts ---------- */
async function org(id) {
  const m = await db.one(`SELECT id, "displayName" FROM "Merchant" WHERE id = $1`, [id]);
  if (!m) fail(404, "Organization not found.");
  return m;
}
async function accounts(merchantId) {
  const rows = await db.query(
    `SELECT c.id, c.provider, c.mode, c."payuMid", c."merchantKey", c."saltVersion", c.status, c."isDefault", c.label, c.source, c."issuedAt", c."revokedAt",
            cu.name AS "createdByName", ru.name AS "revokedByName"
       FROM "PayuCredential" c LEFT JOIN "User" cu ON cu.id = c."createdById" LEFT JOIN "User" ru ON ru.id = c."revokedById"
      WHERE c."merchantId" = $1 ORDER BY c.mode, c."isDefault" DESC, c."issuedAt" DESC`, [merchantId]);
  return rows.map(config.accountView);
}

async function listAccounts(ctx) {
  const m = await org(ctx.params.id);
  return { org: { id: m.id, name: m.displayName }, forms: await config.accountForms(), accounts: await accounts(m.id) };
}

// Assign or replace the organisation's default account for a mode, with the provider active in that mode.
async function assign(ctx) {
  const m = await org(ctx.params.id);
  const b = ctx.body || {};
  const mode = db.dbMode(b.mode);
  const p = b.provider ? registry.get(b.provider) : await config.activeType(mode);
  await liveCheck(ctx, mode, "platform.provider_account.assigned");
  const a = p.account.clean(b.fields || b);
  const col = p.account.toColumns(a);
  const label = String(b.label || "").trim().slice(0, 60) || (mode === "LIVE" ? `Live ${p.name}` : `Test ${p.name}`);
  const revokePrevious = b.revokePrevious === true;

  const out = await db.tx(async (c) => {
    const same = await c.one(
      `SELECT c.id, c."merchantId", m."displayName" FROM "PayuCredential" c JOIN "Merchant" m ON m.id = c."merchantId"
        WHERE c.mode = $1 AND c."merchantKey" = $2 AND c."saltVersion" = $3`, [mode, col.merchantKey, col.saltVersion]);
    if (same && same.merchantId !== m.id)
      fail(409, `This ${p.name} account is already linked to another organization (${same.displayName}). Revoke it there first.`, { field: "key" });
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
      id = same.id;
      await c.q(
        `UPDATE "PayuCredential" SET provider=$2, "payuMid"=$3, "saltEnc"=$4, status='ACTIVE', "isDefault"=true, label=$5, "revokedAt"=NULL, "revokedById"=NULL,
                source='PLATFORM', "createdById"=$6 WHERE id=$1`,
        [id, p.id, col.payuMid, encrypt(col.secret), label, ctx.auth.user.id]);
    } else {
      id = db.id();
      await c.q(
        `INSERT INTO "PayuCredential" (id,"merchantId",provider,mode,"payuMid","merchantKey","saltVersion","saltEnc",status,"isDefault",label,source,"createdById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',true,$9,'PLATFORM',$10)`,
        [id, m.id, p.id, mode, col.payuMid, col.merchantKey, col.saltVersion, encrypt(col.secret), label, ctx.auth.user.id]);
    }
    const shown = p.account.display({ ...col, provider: p.id });
    await audit(c, { merchantId: m.id, userId: ctx.auth.user.id, mode, action: "platform.provider_account.assigned", entity: "PayuCredential", entityId: id,
      ip: clientIp(ctx.req), meta: { provider: p.id, account: p.account.reference(col), fields: shown,
        replacedCredentialId: prev && prev.id !== id ? prev.id : null, previousRevoked: !!(prev && prev.id !== id && revokePrevious), label } });
    return id;
  });
  return { id: out, accounts: await accounts(m.id) };
}

async function revoke(ctx) {
  const m = await org(ctx.params.id);
  const c0 = await db.one(`SELECT id, provider, mode, "payuMid", "merchantKey", "saltVersion", status FROM "PayuCredential" WHERE id=$1 AND "merchantId"=$2`,
    [ctx.params.credId, m.id]);
  if (!c0) fail(404, "Provider account not found on this organization.");
  const p = registry.get(c0.provider);
  if (c0.status === "REVOKED") fail(409, `This ${p.name} account is already revoked.`);
  await liveCheck(ctx, c0.mode, "platform.provider_account.revoked");
  const reason = text(ctx.body.reason, 200);
  await db.tx(async (c) => {
    await c.q(`UPDATE "PayuCredential" SET status='REVOKED', "isDefault"=false, "revokedAt"=now(), "revokedById"=$2 WHERE id=$1`, [c0.id, ctx.auth.user.id]);
    await audit(c, { merchantId: m.id, userId: ctx.auth.user.id, mode: c0.mode, action: "platform.provider_account.revoked", entity: "PayuCredential", entityId: c0.id,
      ip: clientIp(ctx.req), meta: { provider: p.id, account: p.account.reference(c0), reason } });
  });
  return { accounts: await accounts(m.id) };
}

module.exports = [
  ["GET", "/super/provider-settings", getSettings, { platform: true }],
  ["POST", "/super/provider-connections", createConnection, { platform: true }],
  ["POST", "/super/provider-connections/:id/rename", renameConnection, { platform: true }],
  ["POST", "/super/provider-connections/:id/archive", archiveConnection, { platform: true }],
  ["PUT", "/super/provider-connections/:id/:mode", putSettings, { platform: true }],
  ["POST", "/super/provider-connections/:id/:mode/test", testSettings, { platform: true }],
  ["GET", "/super/orgs/:id/provider-accounts", listAccounts, { platform: true }],
  ["POST", "/super/orgs/:id/provider-accounts", assign, { platform: true }],
  ["POST", "/super/orgs/:id/provider-accounts/:credId/revoke", revoke, { platform: true }],
];

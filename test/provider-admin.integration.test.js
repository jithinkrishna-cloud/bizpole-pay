// Integration: Super Admin payment provider settings (Test / Live) and organisation provider accounts, over real
// HTTP against a disposable Neon branch with migrations up to 20261106000000 applied. Runs only when TEST_DATABASE_URL is
// set and refuses the app's own database (test/_harness.js). "PaymentProvider" is platform-wide, so its rows are
// snapshotted first and restored afterwards. No request is sent to a provider (the connection test isn't exercised).
//   TEST_DATABASE_URL=postgres://...branch... npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { skip, start, tag: mkTag, mobile } = require("./_harness");

const SECRET_KEYS = ["saltEnc", "salt", "secretsEnc", "partnerClientSecret", "clientSecret", "passwordHash", "extraEnc"];
function leaks(value, secrets, path = "$", found = []) {
  if (Array.isArray(value)) value.forEach((v, i) => leaks(v, secrets, `${path}[${i}]`, found));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      // Field descriptors (key: "salt") are labels, not values; flag only real secret-bearing properties.
      if (SECRET_KEYS.includes(k)) found.push(`${path}.${k}`);
      leaks(v, secrets, `${path}.${k}`, found);
    }
  else if (typeof value === "string") for (const s of secrets) if (value.includes(s)) found.push(`${path} contains a secret value`);
  return found;
}

test("Super Admin provider settings and organisation provider accounts", { skip }, async (t) => {
  const { db, call, stop } = await start();
  const { hashPassword } = require("../server/secrets");
  const payu = require("../server/payu");
  const cfg = require("../server/providers/config");
  const tag = mkTag(), pw = "Test-" + crypto.randomBytes(8).toString("hex");
  const users = [], merchants = [];
  const PARTNER_SECRET = "psec-" + crypto.randomBytes(16).toString("hex");
  const SALT1 = "salt1-" + crypto.randomBytes(16).toString("hex"), SALT2 = "salt2-" + crypto.randomBytes(16).toString("hex");
  const KEY1 = "K1" + tag.toUpperCase(), KEY2 = "K2" + tag.toUpperCase(), LKEY = "L1" + tag.toUpperCase();
  const SECRETS = [PARTNER_SECRET, SALT1, SALT2];
  const BASE = "/super/provider-settings";

  const snapConns = await db.query(`SELECT * FROM "ProviderConnection"`), snapRows = await db.query(`SELECT * FROM "PaymentProvider"`);
  const reinsert = async (table, rows) => { for (const r of rows) {
    const cols = Object.keys(r);
    await db.query(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")})`, cols.map((c) => r[c]));
  } };
  t.after(async () => {
    await db.query(`DELETE FROM "PaymentProvider"`);
    await db.query(`DELETE FROM "ProviderConnection"`);
    await reinsert("ProviderConnection", snapConns);
    await reinsert("PaymentProvider", snapRows);
    cfg.clearCache();
    await db.query(`DELETE FROM "AuditLog" WHERE "userId" = ANY($1) OR "merchantId" = ANY($2)`, [users, merchants]);
    await db.query(`DELETE FROM "PayuCredential" WHERE "merchantId" = ANY($1)`, [merchants]);
    await db.query(`DELETE FROM "Merchant" WHERE id = ANY($1)`, [merchants]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1)`, [users]);
    await stop();
  });

  // Two merchant owners through real signup; one Super Admin.
  const owners = [];
  for (const n of [1, 2]) {
    const email = `prov-owner${n}-${tag}@example.test`;
    const r = await call("/auth/signup", { method: "POST", body: { name: "Owner " + n, email, mobile: mobile(), password: pw, businessName: `Provider Test ${n} ${tag}` } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await db.one(`SELECT u.id, ms."merchantId" FROM "User" u JOIN "Membership" ms ON ms."userId"=u.id WHERE u.email=$1`, [email]);
    users.push(row.id); merchants.push(row.merchantId);
    owners.push({ ...row, cookie: r.cookie });
  }
  const opId = db.id(), opEmail = `prov-op-${tag}@example.test`;
  await db.query(`INSERT INTO "User" (id,email,mobile,name,"passwordHash","platformRole","updatedAt") VALUES ($1,$2,$3,'Operator',$4,'SUPER_ADMIN',now())`, [opId, opEmail, mobile(), hashPassword(pw)]);
  users.push(opId);
  const op = (await call("/auth/login", { method: "POST", body: { email: opEmail, password: pw } })).cookie;
  const [m1, m2] = owners;
  const audits = async (action) => db.query(`SELECT * FROM "AuditLog" WHERE action=$1 AND ("userId"=ANY($2) OR "merchantId"=ANY($3)) ORDER BY "createdAt"`, [action, users, merchants]);
  const settings = async () => (await call(BASE, { cookie: op })).body;
  // The connection active in a mode, and its settings view for that mode.
  const view = async (env) => { const b = await settings(); return b.connections.find((c) => c.id === b.active[env])[env]; };
  const CONN = "/super/provider-connections";
  const field = (v, key) => v.groups.flatMap((g) => g.fields).find((f) => f.key === key);

  await t.test("merchants can't write provider credentials; the attempt is audited", async () => {
    const r = await call("/developer/credentials?mode=test", { method: "POST", cookie: m1.cookie, body: { payuMid: "123456", merchantKey: "Abcd12", salt: "x".repeat(32) } });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "MANAGED_BY_PLATFORM");
    assert.equal((await audits("developer.credential_write_blocked")).filter((a) => a.merchantId === m1.merchantId).length, 1);
  });

  await t.test("merchants can't reach the Super Admin provider routes", async () => {
    assert.equal((await call(BASE, { cookie: m1.cookie })).status, 403);
    assert.equal((await call(`${CONN}/${(await settings()).active.test}/test`, { method: "PUT", cookie: m1.cookie, body: { version: 0, enabled: true } })).status, 403);
    assert.equal((await call(`/super/orgs/${m1.merchantId}/provider-accounts`, { method: "POST", cookie: m1.cookie, body: { mode: "test" } })).status, 403);
  });

  await t.test("settings list provider types, connections and the active one per mode", async () => {
    const r = await call(BASE, { cookie: op });
    assert.equal(r.status, 200);
    assert.ok(r.body.types.some((p) => p.id === "payu"));
    for (const env of ["test", "live"]) assert.ok(r.body.connections.some((c) => c.id === r.body.active[env]));
    assert.equal((await call(`${CONN}/nope/test`, { method: "PUT", cookie: op, body: { version: 0 } })).status, 404, "unknown connection");
  });

  let backupId;
  await t.test("add, rename and refuse duplicate connection names; every change is audited", async () => {
    assert.equal((await call(CONN, { method: "POST", cookie: m1.cookie, body: { type: "payu", name: "Nope" } })).status, 403, "merchants can't add");
    assert.equal((await call(CONN, { method: "POST", cookie: op, body: { type: "nope", name: "Backup " + tag } })).status, 400, "unknown type");
    const r = await call(CONN, { method: "POST", cookie: op, body: { type: "payu", name: "Backup " + tag } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    backupId = r.body.id;
    const dup = await call(CONN, { method: "POST", cookie: op, body: { type: "payu", name: "BACKUP " + tag } });
    assert.equal(dup.status, 409); assert.equal(dup.body.field, "name");
    assert.equal((await call(`${CONN}/${backupId}/rename`, { method: "POST", cookie: op, body: { name: "Spare " + tag } })).status, 200);
    const c = (await settings()).connections.find((x) => x.id === backupId);
    assert.equal(c.name, "Spare " + tag); assert.equal(c.test.active, false); assert.equal(c.envFallback, false);
    assert.equal((await audits("platform.provider_connection.created")).at(-1).entityId, backupId);
    assert.equal((await audits("platform.provider_connection.renamed")).at(-1).meta.after, "Spare " + tag);
  });

  await t.test("switch Test to the new connection and back; the active one can't be removed", async () => {
    const before = await view("test");
    const spare = (await settings()).connections.find((x) => x.id === backupId).test;
    const sw = await call(`${CONN}/${backupId}/test`, { method: "PUT", cookie: op, body: { version: spare.version, activate: true } });
    assert.equal(sw.status, 200, JSON.stringify(sw.body));
    assert.equal(sw.body.config.active, true); assert.equal(sw.body.config.enabled, true, "made active means switched on");
    assert.equal((await settings()).active.test, backupId);
    assert.equal((await db.one(`SELECT count(*)::int AS n FROM "PaymentProvider" WHERE mode='TEST' AND "isActive"`)).n, 1);
    const a = (await audits("platform.provider_config.activated")).at(-1);
    assert.equal(a.entityId, backupId); assert.equal(a.meta.replacedConnection.id, before.connection.id);
    const ar = await call(`${CONN}/${backupId}/archive`, { method: "POST", cookie: op, body: {} });
    assert.equal(ar.status, 409); assert.equal(ar.body.code, "CONNECTION_ACTIVE");
    const prev = (await settings()).connections.find((x) => x.id === before.connection.id).test;
    const back = await call(`${CONN}/${before.connection.id}/test`, { method: "PUT", cookie: op, body: { version: prev.version, activate: true } });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal((await call(`${CONN}/${backupId}/archive`, { method: "POST", cookie: op, body: { reason: "test" } })).status, 200);
    assert.ok(!(await settings()).connections.some((x) => x.id === backupId), "archived connections are hidden");
    assert.equal((await audits("platform.provider_connection.archived")).at(-1).entityId, backupId);
  });

  let testVersion;
  await t.test("Test settings: save the partner client; the secret is write-only and encrypted", async () => {
    const before = await view("test");
    const r = await call(`${CONN}/${(await settings()).active.test}/test`, { method: "PUT", cookie: op, body: { version: before.version, enabled: true,
      values: { partnerClientId: "client-" + tag, partnerClientSecret: PARTNER_SECRET } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.changed.includes("partnerClientSecret"));
    assert.deepEqual(field(r.body.config, "partnerClientSecret").secret, { set: true, last4: PARTNER_SECRET.slice(-4) });
    assert.equal(r.body.config.groups.find((g) => g.id === "partner").source, "database");
    testVersion = r.body.config.version;
    const row = await db.one(`SELECT "secretsEnc"->>'partnerClientSecret' AS s FROM "PaymentProvider" WHERE "connectionId"=$1 AND mode='TEST'`, [before.connection.id]);
    assert.ok(row.s.startsWith("v1:") && !row.s.includes(PARTNER_SECRET), "stored encrypted");
    const a = (await audits("platform.provider_config.updated")).at(-1);
    assert.equal(a.mode, "TEST");
    assert.equal(a.meta.provider, "payu");
    assert.deepEqual(a.meta.secretsChanged, ["partnerClientSecret"]);
    assert.ok(!JSON.stringify(a.meta).includes(PARTNER_SECRET), "audit meta has no secret");
  });

  await t.test("half a partner client is refused", async () => {
    const r = await call(`${CONN}/${(await settings()).active.test}/test`, { method: "PUT", cookie: op, body: { version: testVersion, values: { partnerClientId: "" } } });
    assert.equal(r.status, 400);
    assert.equal(r.body.field, "partnerClientId");
  });

  await t.test("stale version is refused", async () => {
    const r = await call(`${CONN}/${(await settings()).active.test}/test`, { method: "PUT", cookie: op, body: { version: testVersion - 1, enabled: false } });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "VERSION_CONFLICT");
  });

  await t.test("address overrides must be https hosts the provider allows; database keeps one active provider per mode", async () => {
    const r = await call(`${CONN}/${(await settings()).active.test}/test`, { method: "PUT", cookie: op, body: { version: testVersion, values: { oauthUrl: "https://evil.example.com/token" } } });
    assert.equal(r.status, 400);
    assert.equal(r.body.field, "oauthUrl");
    // Database guards: one active connection per mode, provider type format.
    const cid = db.id();
    await db.query(`INSERT INTO "ProviderConnection" (id,provider,name,"updatedAt") VALUES ($1,'payu',$2,now())`, [cid, "Raw " + tag]);
    await assert.rejects(db.query(`INSERT INTO "PaymentProvider" (id,"connectionId",provider,mode,"isActive","updatedAt") VALUES ($1,$2,'payu','TEST',true,now())`, [db.id(), cid]),
      (e) => e.code === "23505", "one active connection per mode");
    await assert.rejects(db.query(`INSERT INTO "ProviderConnection" (id,provider,name,"updatedAt") VALUES ($1,'Bad Name','x y',now())`, [db.id()]),
      (e) => e.code === "23514", "provider type format");
    await db.query(`DELETE FROM "ProviderConnection" WHERE id=$1`, [cid]);
  });

  await t.test("Live writes need the operator's password; failures are audited", async () => {
    const live = await view("live");
    const sp = await call(CONN, { method: "POST", cookie: op, body: { type: "payu", name: "Live spare " + tag } });
    assert.equal((await call(`${CONN}/${sp.body.id}/live`, { method: "PUT", cookie: op, body: { version: 0, activate: true } })).status, 403, "switching Live needs the password");
    await call(`${CONN}/${sp.body.id}/archive`, { method: "POST", cookie: op, body: {} });
    const none = await call(`${CONN}/${live.connection.id}/live`, { method: "PUT", cookie: op, body: { version: live.version, enabled: false } });
    assert.equal(none.status, 403); assert.equal(none.body.code, "PASSWORD_REQUIRED");
    const wrong = await call(`${CONN}/${live.connection.id}/live`, { method: "PUT", cookie: op, body: { version: live.version, enabled: false, password: "nope-nope" } });
    assert.equal(wrong.status, 403); assert.equal(wrong.body.code, "PASSWORD_WRONG");
    assert.ok((await audits("platform.reauth_failed")).some((a) => a.userId === opId));
    const ok = await call(`${CONN}/${live.connection.id}/live`, { method: "PUT", cookie: op, body: { version: live.version, enabled: false, password: pw } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.config.enabled, false);
    assert.equal((await db.one(`SELECT "failedLogins" FROM "User" WHERE id=$1`, [opId])).failedLogins, 0, "success resets the counter");
  });

  await t.test("paused Live mode refuses every organisation's Live use", async () => {
    await assert.rejects(payu.requireCredential(m1.merchantId, "LIVE"), (e) => e.status === 409 && /paused/.test(e.message));
  });

  let firstId;
  await t.test("assign a test account to an organisation, with the fields the active provider defines", async () => {
    const list = await call(`/super/orgs/${m1.merchantId}/provider-accounts`, { cookie: op });
    assert.deepEqual(list.body.forms.TEST.fields.map((f) => f.key), ["mid", "key", "salt"]);
    const r = await call(`/super/orgs/${m1.merchantId}/provider-accounts`, { method: "POST", cookie: op,
      body: { mode: "test", provider: "payu", fields: { mid: "5596765", key: KEY1, salt: SALT1 }, label: "Assigned" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    firstId = r.body.id;
    const a = r.body.accounts.find((x) => x.id === firstId);
    assert.equal(a.source, "PLATFORM"); assert.equal(a.isDefault, true); assert.equal(a.status, "ACTIVE");
    assert.deepEqual(a.provider, { id: "payu", name: "PayU" });
    assert.ok(!JSON.stringify(a).includes(KEY1), "key is masked");
    assert.equal((await db.one(`SELECT provider FROM "PayuCredential" WHERE id=$1`, [firstId])).provider, "payu");
    const cred = await payu.requireCredential(m1.merchantId, "TEST");
    assert.equal(cred.id, firstId, "backend resolves the assigned account");
    const au = (await audits("platform.provider_account.assigned")).at(-1);
    assert.equal(au.merchantId, m1.merchantId); assert.equal(au.userId, opId); assert.equal(au.meta.provider, "payu");
    assert.ok(!JSON.stringify(au.meta).includes(SALT1) && !JSON.stringify(au.meta).includes(KEY1));
  });

  await t.test("replace with revoke: one active default remains", async () => {
    const r = await call(`/super/orgs/${m1.merchantId}/provider-accounts`, { method: "POST", cookie: op,
      body: { mode: "test", fields: { mid: "5596766", key: KEY2, salt: SALT2 }, revokePrevious: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const rows = await db.query(`SELECT id, status, "isDefault", "revokedById" FROM "PayuCredential" WHERE "merchantId"=$1 AND mode='TEST'`, [m1.merchantId]);
    assert.equal(rows.filter((x) => x.isDefault && x.status === "ACTIVE").length, 1);
    const old = rows.find((x) => x.id === firstId);
    assert.equal(old.status, "REVOKED"); assert.equal(old.revokedById, opId);
  });

  await t.test("an account key can't belong to two organisations", async () => {
    const r = await call(`/super/orgs/${m2.merchantId}/provider-accounts`, { method: "POST", cookie: op, body: { mode: "test", fields: { mid: "5596767", key: KEY2, salt: SALT2 } } });
    assert.equal(r.status, 409);
    assert.equal(r.body.field, "key");
  });

  await t.test("Live account assignment and revoke need the password", async () => {
    const body = { mode: "live", fields: { mid: "7000001", key: LKEY, salt: SALT1 } };
    assert.equal((await call(`/super/orgs/${m2.merchantId}/provider-accounts`, { method: "POST", cookie: op, body })).status, 403);
    const ok = await call(`/super/orgs/${m2.merchantId}/provider-accounts`, { method: "POST", cookie: op, body: { ...body, password: pw } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const lr = await call(`/super/orgs/${m2.merchantId}/provider-accounts/${ok.body.id}/revoke`, { method: "POST", cookie: op, body: { reason: "test" } });
    assert.equal(lr.status, 403);
    const lr2 = await call(`/super/orgs/${m2.merchantId}/provider-accounts/${ok.body.id}/revoke`, { method: "POST", cookie: op, body: { reason: "test", password: pw } });
    assert.equal(lr2.status, 200);
  });

  await t.test("revoke a test account; revoking twice is refused", async () => {
    const cur = await db.one(`SELECT id FROM "PayuCredential" WHERE "merchantId"=$1 AND mode='TEST' AND "isDefault"`, [m1.merchantId]);
    const r = await call(`/super/orgs/${m1.merchantId}/provider-accounts/${cur.id}/revoke`, { method: "POST", cookie: op, body: { reason: "rotated" } });
    assert.equal(r.status, 200);
    assert.equal((await call(`/super/orgs/${m1.merchantId}/provider-accounts/${cur.id}/revoke`, { method: "POST", cookie: op, body: {} })).status, 409);
    await assert.rejects(payu.requireCredential(m1.merchantId, "TEST"), (e) => e.status === 409 && /Contact Bizpole support/.test(e.message));
    const au = (await audits("platform.provider_account.revoked")).filter((a) => a.merchantId === m1.merchantId);
    assert.ok(au.length >= 1 && au.at(-1).meta.reason === "rotated");
  });

  await t.test("no Super Admin or merchant response carries a secret", async () => {
    const responses = [
      (await call(BASE, { cookie: op })).body,
      (await call(`/super/orgs/${m1.merchantId}/provider-accounts`, { cookie: op })).body,
      (await call(`/super/orgs/${m1.merchantId}`, { cookie: op })).body,
      (await call("/developer?mode=test", { cookie: m1.cookie })).body,
    ];
    for (const r of responses) assert.deepEqual(leaks(r, SECRETS), []);
  });
});

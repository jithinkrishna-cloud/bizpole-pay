// Integration: Super Admin PayU settings (Test / Live) and organisation PayU accounts, over real HTTP against a
// disposable Neon branch with migration 20261104000000 applied. Runs only when TEST_DATABASE_URL is set and refuses
// the app's own database (test/_harness.js). PayuProviderConfig is platform-wide, so the rows are snapshotted first
// and restored afterwards. No request is sent to PayU (the connection test is not exercised here).
//   TEST_DATABASE_URL=postgres://...branch... npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { skip, start, tag: mkTag, mobile } = require("./_harness");

const SECRET_KEYS = ["saltEnc", "salt", "partnerClientSecret", "partnerClientSecretEnc", "defaultSaltEnc", "clientSecret", "passwordHash"];
function leaks(value, secrets, path = "$", found = []) {
  if (Array.isArray(value)) value.forEach((v, i) => leaks(v, secrets, `${path}[${i}]`, found));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) { if (SECRET_KEYS.includes(k)) found.push(`${path}.${k}`); leaks(v, secrets, `${path}.${k}`, found); }
  else if (typeof value === "string") for (const s of secrets) if (value.includes(s)) found.push(`${path} contains a secret value`);
  return found;
}

test("Super Admin PayU settings and organisation accounts", { skip }, async (t) => {
  const { db, call, stop } = await start();
  const { hashPassword } = require("../server/secrets");
  const payu = require("../server/payu");
  const cfg = require("../server/payu-config");
  const tag = mkTag(), pw = "Test-" + crypto.randomBytes(8).toString("hex");
  const users = [], merchants = [];
  const PARTNER_SECRET = "psec-" + crypto.randomBytes(16).toString("hex");
  const SALT1 = "salt1-" + crypto.randomBytes(16).toString("hex"), SALT2 = "salt2-" + crypto.randomBytes(16).toString("hex");
  const KEY1 = "K1" + tag.toUpperCase(), KEY2 = "K2" + tag.toUpperCase(), LKEY = "L1" + tag.toUpperCase();
  const SECRETS = [PARTNER_SECRET, SALT1, SALT2];

  const snapshot = await db.query(`SELECT * FROM "PayuProviderConfig"`);
  t.after(async () => {
    await db.query(`DELETE FROM "PayuProviderConfig"`);
    for (const r of snapshot) {
      const cols = Object.keys(r);
      await db.query(`INSERT INTO "PayuProviderConfig" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")})`, cols.map((c) => r[c]));
    }
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
    const email = `payu-owner${n}-${tag}@example.test`;
    const r = await call("/auth/signup", { method: "POST", body: { name: "Owner " + n, email, mobile: mobile(), password: pw, businessName: `PayU Test ${n} ${tag}` } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await db.one(`SELECT u.id, ms."merchantId" FROM "User" u JOIN "Membership" ms ON ms."userId"=u.id WHERE u.email=$1`, [email]);
    users.push(row.id); merchants.push(row.merchantId);
    owners.push({ ...row, cookie: r.cookie });
  }
  const opId = db.id(), opEmail = `payu-op-${tag}@example.test`;
  await db.query(`INSERT INTO "User" (id,email,mobile,name,"passwordHash","platformRole","updatedAt") VALUES ($1,$2,$3,'Operator',$4,'SUPER_ADMIN',now())`, [opId, opEmail, mobile(), hashPassword(pw)]);
  users.push(opId);
  const op = (await call("/auth/login", { method: "POST", body: { email: opEmail, password: pw } })).cookie;
  const [m1, m2] = owners;
  const audits = async (action) => db.query(`SELECT * FROM "AuditLog" WHERE action=$1 AND ("userId"=ANY($2) OR "merchantId"=ANY($3)) ORDER BY "createdAt"`, [action, users, merchants]);

  await t.test("merchants can't write PayU credentials; the attempt is audited", async () => {
    const r = await call("/developer/credentials?mode=test", { method: "POST", cookie: m1.cookie, body: { payuMid: "123456", merchantKey: "Abcd12", salt: "x".repeat(32) } });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "MANAGED_BY_PLATFORM");
    assert.equal((await audits("developer.credential_write_blocked")).filter((a) => a.merchantId === m1.merchantId).length, 1);
  });

  await t.test("merchants can't reach the Super Admin PayU routes", async () => {
    assert.equal((await call("/super/payu/config", { cookie: m1.cookie })).status, 403);
    assert.equal((await call("/super/payu/config/test", { method: "PUT", cookie: m1.cookie, body: { version: 0, enabled: true } })).status, 403);
    assert.equal((await call(`/super/orgs/${m1.merchantId}/payu-accounts`, { method: "POST", cookie: m1.cookie, body: { mode: "test" } })).status, 403);
  });

  let testVersion;
  await t.test("Test settings: save the partner client; the secret is write-only and encrypted", async () => {
    const before = (await call("/super/payu/config", { cookie: op })).body.test;
    const r = await call("/super/payu/config/test", { method: "PUT", cookie: op, body: { version: before.version, enabled: true, partnerClientId: "client-" + tag, partnerClientSecret: PARTNER_SECRET } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.changed.includes("partnerClientSecret"));
    assert.deepEqual(r.body.config.partner.secret, { set: true, last4: PARTNER_SECRET.slice(-4) });
    assert.equal(r.body.config.partner.source, "database");
    testVersion = r.body.config.version;
    const row = await db.one(`SELECT "partnerClientSecretEnc" FROM "PayuProviderConfig" WHERE mode='TEST'`);
    assert.ok(row.partnerClientSecretEnc.startsWith("v1:") && !row.partnerClientSecretEnc.includes(PARTNER_SECRET), "stored encrypted");
    const a = (await audits("platform.payu_config.updated")).at(-1);
    assert.equal(a.mode, "TEST");
    assert.equal(a.meta.secretChanged, true);
    assert.ok(!JSON.stringify(a.meta).includes(PARTNER_SECRET), "audit meta has no secret");
  });

  await t.test("stale version is refused", async () => {
    const r = await call("/super/payu/config/test", { method: "PUT", cookie: op, body: { version: testVersion - 1, enabled: false } });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "VERSION_CONFLICT");
  });

  await t.test("endpoint overrides must be PayU https hosts (app and database)", async () => {
    const r = await call("/super/payu/config/test", { method: "PUT", cookie: op, body: { version: testVersion, oauthUrl: "https://evil.example.com/token" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.field, "oauthUrl");
    await assert.rejects(db.query(`UPDATE "PayuProviderConfig" SET "oauthUrl"='https://evil.example.com/' WHERE mode='TEST'`), (e) => e.code === "23514");
    await assert.rejects(db.query(`UPDATE "PayuProviderConfig" SET "partnerClientSecretEnc"=NULL WHERE mode='TEST'`), (e) => e.code === "23514", "partner pair constraint");
  });

  await t.test("Live writes need the operator's password; failures are audited", async () => {
    const live = (await call("/super/payu/config", { cookie: op })).body.live;
    const none = await call("/super/payu/config/live", { method: "PUT", cookie: op, body: { version: live.version, enabled: false } });
    assert.equal(none.status, 403); assert.equal(none.body.code, "PASSWORD_REQUIRED");
    const wrong = await call("/super/payu/config/live", { method: "PUT", cookie: op, body: { version: live.version, enabled: false, password: "nope-nope" } });
    assert.equal(wrong.status, 403); assert.equal(wrong.body.code, "PASSWORD_WRONG");
    assert.ok((await audits("platform.reauth_failed")).some((a) => a.userId === opId));
    const ok = await call("/super/payu/config/live", { method: "PUT", cookie: op, body: { version: live.version, enabled: false, password: pw } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.config.enabled, false);
    assert.equal((await db.one(`SELECT "failedLogins" FROM "User" WHERE id=$1`, [opId])).failedLogins, 0, "success resets the counter");
  });

  await t.test("paused Live mode refuses every organisation's Live PayU use", async () => {
    await assert.rejects(payu.requireCredential(m1.merchantId, "LIVE"), (e) => e.status === 409 && /paused/.test(e.message));
  });

  let firstId;
  await t.test("assign a test account to an organisation", async () => {
    const r = await call(`/super/orgs/${m1.merchantId}/payu-accounts`, { method: "POST", cookie: op, body: { mode: "test", mid: "5596765", key: KEY1, salt: SALT1, label: "Assigned" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    firstId = r.body.id;
    const a = r.body.accounts.find((x) => x.id === firstId);
    assert.equal(a.source, "PLATFORM"); assert.equal(a.isDefault, true); assert.equal(a.status, "ACTIVE");
    assert.notEqual(a.merchantKey, KEY1, "key is masked");
    const cred = await payu.requireCredential(m1.merchantId, "TEST");
    assert.equal(cred.id, firstId, "backend resolves the assigned account");
    const au = (await audits("platform.payu_credential.assigned")).at(-1);
    assert.equal(au.merchantId, m1.merchantId); assert.equal(au.userId, opId);
    assert.ok(!JSON.stringify(au.meta).includes(SALT1) && !JSON.stringify(au.meta).includes(KEY1));
  });

  await t.test("replace with revoke: one active default remains", async () => {
    const r = await call(`/super/orgs/${m1.merchantId}/payu-accounts`, { method: "POST", cookie: op, body: { mode: "test", mid: "5596766", key: KEY2, salt: SALT2, revokePrevious: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const rows = await db.query(`SELECT id, status, "isDefault", "revokedById" FROM "PayuCredential" WHERE "merchantId"=$1 AND mode='TEST'`, [m1.merchantId]);
    assert.equal(rows.filter((x) => x.isDefault && x.status === "ACTIVE").length, 1);
    const old = rows.find((x) => x.id === firstId);
    assert.equal(old.status, "REVOKED"); assert.equal(old.revokedById, opId);
  });

  await t.test("a PayU key can't belong to two organisations", async () => {
    const r = await call(`/super/orgs/${m2.merchantId}/payu-accounts`, { method: "POST", cookie: op, body: { mode: "test", mid: "5596767", key: KEY2, salt: SALT2 } });
    assert.equal(r.status, 409);
    assert.equal(r.body.field, "key");
  });

  await t.test("Live account assignment and revoke need the password", async () => {
    const body = { mode: "live", mid: "7000001", key: LKEY, salt: SALT1 };
    assert.equal((await call(`/super/orgs/${m2.merchantId}/payu-accounts`, { method: "POST", cookie: op, body })).status, 403);
    const ok = await call(`/super/orgs/${m2.merchantId}/payu-accounts`, { method: "POST", cookie: op, body: { ...body, password: pw } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const lr = await call(`/super/orgs/${m2.merchantId}/payu-accounts/${ok.body.id}/revoke`, { method: "POST", cookie: op, body: { reason: "test" } });
    assert.equal(lr.status, 403);
    const lr2 = await call(`/super/orgs/${m2.merchantId}/payu-accounts/${ok.body.id}/revoke`, { method: "POST", cookie: op, body: { reason: "test", password: pw } });
    assert.equal(lr2.status, 200);
  });

  await t.test("revoke a test account; revoking twice is refused", async () => {
    const cur = await db.one(`SELECT id FROM "PayuCredential" WHERE "merchantId"=$1 AND mode='TEST' AND "isDefault"`, [m1.merchantId]);
    const r = await call(`/super/orgs/${m1.merchantId}/payu-accounts/${cur.id}/revoke`, { method: "POST", cookie: op, body: { reason: "rotated" } });
    assert.equal(r.status, 200);
    assert.equal((await call(`/super/orgs/${m1.merchantId}/payu-accounts/${cur.id}/revoke`, { method: "POST", cookie: op, body: {} })).status, 409);
    await assert.rejects(payu.requireCredential(m1.merchantId, "TEST"), (e) => e.status === 409 && /Contact Bizpole support/.test(e.message));
    const au = (await audits("platform.payu_credential.revoked")).filter((a) => a.merchantId === m1.merchantId);
    assert.ok(au.length >= 1 && au.at(-1).meta.reason === "rotated");
  });

  await t.test("no Super Admin or merchant response carries a secret", async () => {
    const responses = [
      (await call("/super/payu/config", { cookie: op })).body,
      (await call(`/super/orgs/${m1.merchantId}/payu-accounts`, { cookie: op })).body,
      (await call(`/super/orgs/${m1.merchantId}`, { cookie: op })).body,
      (await call("/developer?mode=test", { cookie: m1.cookie })).body,
    ];
    for (const r of responses) assert.deepEqual(leaks(r, SECRETS), []);
  });
});

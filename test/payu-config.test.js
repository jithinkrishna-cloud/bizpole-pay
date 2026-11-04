// Unit tests for PayU provider settings (server/payu-config.js). No database or network needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

process.env.DATA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("base64");
const { encrypt } = require("../server/secrets");
const cfg = require("../server/payu-config");

const NO_ENV = { partner: null, urls: { oauthUrl: null, paymentUrl: null, postserviceUrl: null, oneApiUrl: null }, defaultCredential: null };
const row = (over = {}) => ({
  enabled: false, partnerClientId: null, partnerClientSecretEnc: null, oauthUrl: null, paymentUrl: null, postserviceUrl: null, oneApiUrl: null,
  defaultMid: null, defaultKey: null, defaultSaltEnc: null, defaultSaltVersion: null, version: 3, updatedAt: new Date(), updatedById: null, ...over,
});

test("no saved row and no env: built-in defaults, mode stays usable", () => {
  for (const mode of ["TEST", "LIVE"]) {
    const r = cfg.merge(mode, null, NO_ENV);
    assert.equal(r.enabled, true, `${mode} keeps today's behaviour until a row is saved`);
    assert.equal(r.stored, false);
    assert.equal(r.version, 0);
    assert.equal(r.partner, null);
    assert.equal(r.sources.partner, "none");
    for (const f of cfg.URL_FIELDS) {
      assert.equal(r.urls[f], cfg.DEFAULT_URLS[mode][f]);
      assert.equal(r.sources[f], "default");
    }
  }
  assert.match(cfg.DEFAULT_URLS.TEST.oauthUrl, /uat-accounts\.payu\.in/);
  assert.match(cfg.DEFAULT_URLS.LIVE.oauthUrl, /^https:\/\/accounts\.payu\.in/);
});

test("resolution order per field: database, then environment, then default", () => {
  const env = { ...NO_ENV, partner: { clientId: "env-client-id", clientSecret: "env-secret-0000000000" },
    urls: { ...NO_ENV.urls, paymentUrl: "https://env.payu.in/_payment", postserviceUrl: "https://env.payu.in/ps" } };
  const r = cfg.merge("LIVE", row({ enabled: true, partnerClientId: "db-client-id", partnerClientSecretEnc: encrypt("db-secret-111111111111"),
    paymentUrl: "https://db.payu.in/_payment" }), env);
  assert.deepEqual(r.partner, { clientId: "db-client-id", clientSecret: "db-secret-111111111111" });
  assert.equal(r.sources.partner, "database");
  assert.equal(r.urls.paymentUrl, "https://db.payu.in/_payment");
  assert.equal(r.sources.paymentUrl, "database");
  assert.equal(r.urls.postserviceUrl, "https://env.payu.in/ps");
  assert.equal(r.sources.postserviceUrl, "environment");
  assert.equal(r.urls.oneApiUrl, cfg.DEFAULT_URLS.LIVE.oneApiUrl);
  assert.equal(r.sources.oneApiUrl, "default");
  assert.equal(r.enabled, true);
  assert.equal(r.stored, true);
  assert.equal(r.version, 3);
});

test("a saved row decides the on/off switch", () => {
  assert.equal(cfg.merge("LIVE", row({ enabled: false }), NO_ENV).enabled, false);
  assert.equal(cfg.merge("TEST", row({ enabled: true }), NO_ENV).enabled, true);
});

test("shared default credential: TEST only, database before environment", () => {
  const envCred = { mid: 111111, key: "EnvKey", salt: "env-salt-xxxxxxxxxxxx", saltVersion: "V1" };
  const env = { ...NO_ENV, defaultCredential: envCred };
  assert.deepEqual(cfg.merge("TEST", null, env).defaultCredential, envCred);
  assert.equal(cfg.merge("LIVE", null, env).defaultCredential, null, "never for LIVE");
  const r = cfg.merge("TEST", row({ defaultMid: 222222, defaultKey: "DbKey1", defaultSaltEnc: encrypt("db-salt-yyyyyyyyyyyy"), defaultSaltVersion: "V1" }), env);
  assert.deepEqual(r.defaultCredential, { mid: 222222, key: "DbKey1", salt: "db-salt-yyyyyyyyyyyy", saltVersion: "V1" });
  assert.equal(r.sources.defaultCredential, "database");
});

test("publicView never contains a secret, salt or full key", () => {
  const SECRET = "partner-secret-ABCDEFGH-9876", SALT = "shared-salt-QWERTYUIOP-1234", KEY = "LongMerchantKey42";
  const r = cfg.merge("TEST", row({ partnerClientId: "client-id-123", partnerClientSecretEnc: encrypt(SECRET),
    defaultMid: 333333, defaultKey: KEY, defaultSaltEnc: encrypt(SALT), defaultSaltVersion: "V1" }), NO_ENV);
  const v = cfg.publicView(r), json = JSON.stringify(v);
  for (const s of [SECRET, SALT, KEY, "Enc"]) assert.ok(!json.includes(s), `public view leaks ${s}`);
  assert.deepEqual(v.partner.secret, { set: true, last4: "9876" });
  assert.equal(v.defaultCredential.key, "Lo••••••••42");
  assert.equal(v.defaultCredential.mid, "333333");
  assert.ok(!("salt" in v.defaultCredential));
});

test("endpoint overrides: only https PayU hosts", () => {
  const ok = ["https://test.payu.in/_payment", "https://payu.in", "https://uatoneapi.payu.in/payment-links", "https://payout.payumoney.com/payout"];
  for (const u of ok) assert.equal(cfg.cleanUrl("x", u), new URL(u).toString(), u);
  const bad = [
    "http://test.payu.in/_payment",            // not https
    "https://evil.com/payu.in",                 // payu.in only in the path
    "https://payu.in.evil.com/",                // payu.in as a subdomain of another host
    "https://evilpayu.in/",                     // look-alike domain
    "https://user:pw@test.payu.in/",            // credentials in the URL
    "https://test.payu.in@evil.com/",           // userinfo trick
    "javascript:alert(1)", "ftp://payu.in/", "not a url",
  ];
  for (const u of bad) assert.throws(() => cfg.cleanUrl("x", u), (e) => e.status === 400, u);
  assert.equal(cfg.cleanUrl("x", ""), null, "blank resets to default");
  assert.equal(cfg.cleanUrl("x", undefined), undefined, "not sent leaves it unchanged");
});

test("the database CHECK constraint uses the same host rule as the app", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "prisma", "migrations", "20261104000000_payu_provider_config", "migration.sql"), "utf8");
  const dbRegex = sql.match(/"oauthUrl"\s+~ '([^']+)'/)[1];
  assert.equal(dbRegex, cfg.PAYU_URL.source.replace(/\\\//g, "/"));
});

test("merchant credential validation", () => {
  const good = cfg.cleanMerchantCredential({ mid: " 8796890 ", key: "Ab12Cd", salt: "s".repeat(32) });
  assert.deepEqual(good, { mid: 8796890, key: "Ab12Cd", salt: "s".repeat(32), saltVersion: "V1" });
  assert.equal(cfg.cleanMerchantCredential({ mid: "1234", key: "Ab12", salt: "s".repeat(33) }).saltVersion, "V2");
  const cases = [
    [{ mid: "12a4", key: "Ab12", salt: "s".repeat(32) }, "mid"],
    [{ mid: "1234", key: "agent@example.com", salt: "s".repeat(32) }, "key"],   // the autofill bug from the merchant form
    [{ mid: "1234", key: "Ab12", salt: "short" }, "salt"],
    [{ mid: "1234", key: "Ab12", salt: "has space in the middle!!" }, "salt"],
  ];
  for (const [input, field] of cases)
    assert.throws(() => cfg.cleanMerchantCredential(input), (e) => e.status === 400 && e.extra.field === field, field);
});

test("PayU settings routes are Super Admin only and the merchant write route is blocked", () => {
  const superRoutes = require("../server/routes/super");
  const want = [["GET", "/super/payu/config"], ["PUT", "/super/payu/config/:mode"], ["POST", "/super/payu/config/:mode/test"],
    ["GET", "/super/orgs/:id/payu-accounts"], ["POST", "/super/orgs/:id/payu-accounts"], ["POST", "/super/orgs/:id/payu-accounts/:credId/revoke"]];
  for (const [m, p] of want) {
    const r = superRoutes.find(([mm, pp]) => mm === m && pp === p);
    assert.ok(r, `${m} ${p} exists`);
    assert.equal(r[3].platform, true, `${m} ${p} is platform-gated`);
  }
  const dev = require("../server/routes/developer").find(([m, p]) => m === "POST" && p === "/developer/credentials");
  assert.ok(dev, "endpoint kept so old clients get a clear answer");
  assert.ok(!/INSERT|UPDATE/.test(dev[2].toString()), "merchant endpoint no longer writes credentials");
});

test("password re-entry is required for every Live write in the Super Admin PayU routes", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "routes", "super", "payu.js"), "utf8");
  for (const fn of ["putConfig", "assign", "revoke"]) {
    const body = src.slice(src.indexOf(`async function ${fn}(`));
    const head = body.slice(0, body.indexOf("db.tx(") > 0 ? body.indexOf("db.tx(") : body.indexOf("config.save("));
    assert.match(head, /liveCheck\(ctx,/, `${fn} checks the password before writing`);
  }
});

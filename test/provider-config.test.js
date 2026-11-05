// Unit tests for payment provider settings (server/providers/*). No database or network needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

process.env.DATA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("base64");
const { encrypt } = require("../server/secrets");
const registry = require("../server/providers");
const cfg = require("../server/providers/config");
const payu = registry.get("payu");

const URLS = ["oauthUrl", "paymentUrl", "postserviceUrl", "oneApiUrl"];
const row = (over = {}) => ({ provider: "payu", enabled: false, isActive: true, settings: {}, secretsEnc: {}, version: 3, updatedAt: new Date(), updatedById: null, ...over });

test("every registered provider definition is complete", () => {
  assert.ok(registry.ALL.length >= 1);
  assert.equal(registry.get(registry.DEFAULT).id, registry.DEFAULT);
  for (const p of registry.ALL) {
    assert.match(p.id, /^[a-z][a-z0-9_]{1,31}$/, "matches the database CHECK");
    assert.ok(p.name && p.hosts instanceof RegExp && p.hostsText);
    for (const f of p.settings) {
      assert.ok(p.groups.some((g) => g.id === f.group), `${p.id}.${f.key} has a group`);
      if (f.type === "url") for (const m of ["TEST", "LIVE"]) if (f.default) assert.ok(p.hosts.test(f.default[m]), `${p.id}.${f.key} default is an allowed host`);
    }
    for (const k of ["clean", "toColumns", "display", "reference", "sharedFromEnv", "sharedDisplay"]) assert.equal(typeof p.account[k], "function", `${p.id}.account.${k}`);
    assert.equal(typeof p.testConnection, "function");
  }
  assert.throws(() => registry.get("nope"), (e) => e.status === 400);
});

test("no saved row and no env: the default provider is active, on, with built-in addresses", () => {
  for (const mode of ["TEST", "LIVE"]) {
    const r = cfg.merge(mode, payu, null, {}, true);
    assert.equal(r.enabled, true, `${mode} keeps today's behaviour until a row is saved`);
    assert.equal(r.stored, false);
    assert.equal(r.version, 0);
    assert.equal(r.values.partnerClientId, null);
    assert.equal(r.sources.partner, "none");
    for (const f of URLS) assert.equal(r.sources[f], "default");
  }
  assert.match(cfg.merge("TEST", payu, null, {}, true).values.oauthUrl, /uat-accounts\.payu\.in/);
  assert.match(cfg.merge("LIVE", payu, null, {}, true).values.oauthUrl, /^https:\/\/accounts\.payu\.in/);
  assert.equal(cfg.merge("LIVE", payu, null, {}, false).enabled, false, "a provider that isn't active is off until switched on");
});

test("resolution order per field: database, then environment, then default", () => {
  const env = { PAYU_PARTNER_CLIENT_ID: "env-client-id", PAYU_PARTNER_CLIENT_SECRET: "env-secret-0000000000",
    PAYU_LIVE_PAYMENT_URL: "https://env.payu.in/_payment", PAYU_LIVE_POSTSERVICE_URL: "https://env.payu.in/ps" };
  const r = cfg.merge("LIVE", payu, row({ enabled: true,
    settings: { partnerClientId: "db-client-id", paymentUrl: "https://db.payu.in/_payment" },
    secretsEnc: { partnerClientSecret: encrypt("db-secret-111111111111") } }), env, true);
  assert.equal(r.values.partnerClientId, "db-client-id");
  assert.equal(r.values.partnerClientSecret, "db-secret-111111111111");
  assert.equal(r.sources.partner, "database");
  assert.equal(r.values.paymentUrl, "https://db.payu.in/_payment");
  assert.equal(r.sources.paymentUrl, "database");
  assert.equal(r.values.postserviceUrl, "https://env.payu.in/ps");
  assert.equal(r.sources.postserviceUrl, "environment");
  assert.equal(r.sources.oneApiUrl, "default");
  assert.equal(r.enabled, true);
  assert.equal(r.stored, true);
  assert.equal(r.version, 3);
  // A partial env pair is ignored: the partner client is all or nothing.
  assert.equal(cfg.merge("LIVE", payu, null, { PAYU_PARTNER_CLIENT_ID: "only-the-id" }, true).sources.partner, "none");
});

test("active connection per mode: the explicitly active row, else the environment-fallback connection", () => {
  const conns = [
    { id: "a", provider: "payu", name: "PayU", envFallback: true, archivedAt: null },
    { id: "b", provider: "payu", name: "PayU backup", envFallback: false, archivedAt: null },
    { id: "c", provider: "payu", name: "Old", envFallback: false, archivedAt: new Date() },
  ];
  assert.equal(cfg.activeOf("TEST", conns, []).id, "a", "nothing chosen yet: the fallback connection");
  const rows = [{ connectionId: "b", mode: "LIVE", isActive: true }, { connectionId: "a", mode: "TEST", isActive: false }];
  assert.equal(cfg.activeOf("LIVE", conns, rows).id, "b", "Live switched to the backup");
  assert.equal(cfg.activeOf("TEST", conns, rows).id, "a", "Test unaffected");
  assert.equal(cfg.activeOf("LIVE", conns, [{ connectionId: "c", mode: "LIVE", isActive: true }]).id, "a", "archived connections are never active");
  assert.equal(cfg.activeOf("TEST", conns.slice(1), []), null, "no fallback and nothing chosen: no connection, payments paused");
});

test("a saved row decides the on/off switch", () => {
  assert.equal(cfg.merge("LIVE", payu, row({ enabled: false }), {}, true).enabled, false);
  assert.equal(cfg.merge("TEST", payu, row({ enabled: true }), {}, true).enabled, true);
});

test("shared test account: TEST only, database before environment", () => {
  const env = { PAYU_TEST_MID: "111111", PAYU_TEST_KEY: "EnvKey", PAYU_TEST_SALT: "env-salt-xxxxxxxxxxxx" };
  assert.deepEqual(cfg.merge("TEST", payu, null, env, true).sharedAccount, { mid: 111111, key: "EnvKey", salt: "env-salt-xxxxxxxxxxxx", saltVersion: "V1" });
  assert.equal(cfg.merge("LIVE", payu, null, env, true).sharedAccount, null, "never for LIVE");
  const r = cfg.merge("TEST", payu, row({ settings: { sharedAccount: { mid: "222222", key: "DbKey1" } },
    secretsEnc: { "sharedAccount.salt": encrypt("db-salt-yyyyyyyyyyyy") } }), env, true);
  assert.deepEqual(r.sharedAccount, { mid: 222222, key: "DbKey1", salt: "db-salt-yyyyyyyyyyyy", saltVersion: "V1" });
  assert.equal(r.sources.sharedAccount, "database");
  assert.equal(cfg.merge("TEST", payu, null, { ...env, PAYU_TEST_KEY: "not a key!" }, true).sharedAccount, null, "invalid env is ignored");
});

test("publicView is built from the definition and never contains a secret, salt or full key", () => {
  const SECRET = "partner-secret-ABCDEFGH-9876", SALT = "shared-salt-QWERTYUIOP-1234", KEY = "LongMerchantKey42";
  const r = cfg.merge("TEST", payu, row({ settings: { partnerClientId: "client-id-123", sharedAccount: { mid: "333333", key: KEY } },
    secretsEnc: { partnerClientSecret: encrypt(SECRET), "sharedAccount.salt": encrypt(SALT) } }), {}, true);
  const v = cfg.publicView(r), json = JSON.stringify(v);
  for (const s of [SECRET, SALT, KEY, "Enc", "v1:"]) assert.ok(!json.includes(s), `public view leaks ${s}`);
  assert.deepEqual(v.provider, { id: "payu", name: "PayU" });
  assert.deepEqual(v.groups.map((g) => g.id), payu.groups.map((g) => g.id));
  const secret = v.groups.flatMap((g) => g.fields).find((f) => f.key === "partnerClientSecret");
  assert.deepEqual(secret.secret, { set: true, last4: "9876" });
  assert.ok(!("value" in secret));
  assert.equal(v.shared.current.display.find((d) => d.label === "Merchant key").value, "Lo••••••••42");
  assert.equal(cfg.publicView(cfg.merge("LIVE", payu, null, {}, true)).shared.supported, false);
});

test("address overrides: only https hosts the provider allows", () => {
  const ok = ["https://test.payu.in/_payment", "https://payu.in", "https://uatoneapi.payu.in/payment-links", "https://payout.payumoney.com/payout"];
  for (const u of ok) assert.equal(cfg.cleanUrl(payu, "x", u), new URL(u).toString(), u);
  const bad = [
    "http://test.payu.in/_payment",            // not https
    "https://evil.com/payu.in",                 // host only in the path
    "https://payu.in.evil.com/",                // as a subdomain of another host
    "https://evilpayu.in/",                     // look-alike domain
    "https://user:pw@test.payu.in/",            // credentials in the URL
    "https://test.payu.in@evil.com/",           // userinfo trick
    "javascript:alert(1)", "ftp://payu.in/", "not a url",
  ];
  for (const u of bad) assert.throws(() => cfg.cleanUrl(payu, "x", u), (e) => e.status === 400, u);
  assert.equal(cfg.cleanUrl(payu, "x", ""), null, "blank resets to the default");
  assert.equal(cfg.cleanUrl(payu, "x", undefined), undefined, "not sent leaves it unchanged");
});

test("the migration copies every PayuProviderConfig column the definition knows about", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "prisma", "migrations", "20261105000000_payment_provider", "migration.sql"), "utf8");
  for (const f of payu.settings) assert.ok(sql.includes(`'${f.key}'`), `${f.key} is copied`);
  assert.ok(sql.includes("'sharedAccount.salt'") && sql.includes("'sharedAccount'"));
  assert.ok(!/DROP TABLE "PayuProviderConfig"/.test(sql), "the old table is kept for the app version deployed before this migration");
});

test("PayU account validation", () => {
  const good = payu.account.clean({ mid: " 8796890 ", key: "Ab12Cd", salt: "s".repeat(32) });
  assert.deepEqual(good, { mid: 8796890, key: "Ab12Cd", salt: "s".repeat(32), saltVersion: "V1" });
  assert.equal(payu.account.clean({ mid: "1234", key: "Ab12", salt: "s".repeat(33) }).saltVersion, "V2");
  const cases = [
    [{ mid: "12a4", key: "Ab12", salt: "s".repeat(32) }, "mid"],
    [{ mid: "1234", key: "agent@example.com", salt: "s".repeat(32) }, "key"],   // the autofill bug from the merchant form
    [{ mid: "1234", key: "Ab12", salt: "short" }, "salt"],
    [{ mid: "1234", key: "Ab12", salt: "has space in the middle!!" }, "salt"],
  ];
  for (const [input, field] of cases)
    assert.throws(() => payu.account.clean(input), (e) => e.status === 400 && e.extra.field === field, field);
  const shown = JSON.stringify(payu.account.display({ payuMid: 1234, merchantKey: "Ab12Cd34", saltVersion: "V1", saltEnc: "v1:zzz" }));
  assert.ok(!shown.includes("Ab12Cd34") && !shown.includes("v1:zzz"));
});

test("provider settings routes are Super Admin only and the merchant write route is blocked", () => {
  const superRoutes = require("../server/routes/super");
  const want = [["GET", "/super/provider-settings"], ["POST", "/super/provider-connections"], ["POST", "/super/provider-connections/:id/rename"],
    ["POST", "/super/provider-connections/:id/archive"], ["PUT", "/super/provider-connections/:id/:mode"], ["POST", "/super/provider-connections/:id/:mode/test"],
    ["GET", "/super/orgs/:id/provider-accounts"], ["POST", "/super/orgs/:id/provider-accounts"], ["POST", "/super/orgs/:id/provider-accounts/:credId/revoke"]];
  for (const [m, p] of want) {
    const r = superRoutes.find(([mm, pp]) => mm === m && pp === p);
    assert.ok(r, `${m} ${p} exists`);
    assert.equal(r[3].platform, true, `${m} ${p} is platform-gated`);
  }
  const dev = require("../server/routes/developer").find(([m, p]) => m === "POST" && p === "/developer/credentials");
  assert.ok(dev, "endpoint kept so old clients get a clear answer");
  assert.ok(!/INSERT|UPDATE/.test(dev[2].toString()), "merchant endpoint no longer writes credentials");
});

test("password re-entry is required for every Live write in the Super Admin provider routes", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "routes", "super", "providers.js"), "utf8");
  for (const fn of ["putSettings", "assign", "revoke"]) {
    const body = src.slice(src.indexOf(`async function ${fn}(`));
    const head = body.slice(0, body.indexOf("db.tx(") > 0 ? body.indexOf("db.tx(") : body.indexOf("config.save("));
    assert.match(head, /liveCheck\(ctx,/, `${fn} checks the password before writing`);
  }
});

test("the Super Admin UI and routes contain no provider-specific names", () => {
  const files = ["public/super/pages/provider-settings.js", "server/routes/super/providers.js", "server/providers/config.js"];
  for (const f of files) {
    const code = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\/.*$/gm, "");
    // The account table and its columns keep their PayU names until stage 2 renames them.
    assert.ok(!/payu/i.test(code.replace(/PayuCredential|payuMid/g, "")), `${f} mentions PayU outside the account table's names`);
  }
});

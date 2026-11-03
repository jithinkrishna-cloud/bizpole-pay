// Unit tests for the server-side authorization gate. No database needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { authorize, platformMode, WRITE_ROLES } = require("../server/router");

const route = (opts = {}) => ({ opts });
const merchant = (role, extra = {}) => ({ user: { id: "u1" }, merchantId: "m1", role, platformRole: null, ...extra });
const operator = (extra = {}) => ({ user: { id: "u2" }, merchantId: null, role: null, platformRole: "SUPER_ADMIN", ...extra });

test("public routes need no session", () => {
  assert.equal(authorize(route({ public: true }), null, "POST"), null);
});

test("every non-public route needs a session", () => {
  for (const opts of [{}, { session: true }, { platform: true }, { anyRole: true }])
    assert.equal(authorize(route(opts), null, "GET").status, 401);
});

test("platform routes reject every merchant role", () => {
  for (const role of ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT", "VIEWER"])
    for (const method of ["GET", "POST"])
      assert.equal(authorize(route({ platform: true }), merchant(role), method).status, 403, `${role} ${method}`);
});

test("platform role match is exact", () => {
  for (const platformRole of ["super_admin", "SUPER_ADMIN ", "ADMIN", "", undefined, true])
    assert.equal(authorize(route({ platform: true }), operator({ platformRole }), "GET").status, 403, String(platformRole));
});

test("Super Admin passes platform routes without a merchant", () => {
  assert.equal(authorize(route({ platform: true }), operator(), "GET"), null);
  assert.equal(authorize(route({ platform: true }), operator(), "POST"), null);
});

test("Super Admin without a membership cannot use merchant routes", () => {
  assert.equal(authorize(route(), operator(), "GET").status, 403);
  assert.equal(authorize(route({ anyRole: true }), operator(), "POST").status, 403);
});

test("Super Admin who is also a merchant member gets only that membership's rights on merchant routes", () => {
  assert.equal(authorize(route(), operator({ merchantId: "m1", role: "VIEWER" }), "POST").status, 403);
  assert.equal(authorize(route(), operator({ merchantId: "m1", role: "VIEWER" }), "GET"), null);
});

test("session routes accept any signed-in user", () => {
  assert.equal(authorize(route({ session: true }), operator(), "GET"), null);
  assert.equal(authorize(route({ session: true }), merchant("VIEWER"), "POST"), null);
});

test("merchant write gate is unchanged", () => {
  assert.deepEqual(WRITE_ROLES, ["OWNER", "ADMIN", "FINANCE", "DEVELOPER"]);
  for (const role of ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT", "VIEWER"]) {
    assert.equal(authorize(route(), merchant(role), "GET"), null, `${role} GET`);
    const post = authorize(route(), merchant(role), "POST");
    assert.equal(post ? post.status : "allowed", WRITE_ROLES.includes(role) ? "allowed" : 403, `${role} POST`);
    assert.equal(authorize(route({ anyRole: true }), merchant(role), "POST"), null, `${role} anyRole`);
  }
  assert.equal(authorize(route(), { ...merchant("OWNER"), merchantId: null }, "GET").status, 403);
});

test("opts.roles replaces the write roles for that route only", () => {
  const refund = route({ roles: ["OWNER", "ADMIN", "FINANCE"] });
  const link = route({ roles: ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT"] });
  const expect = {
    OWNER: [true, true], ADMIN: [true, true], FINANCE: [true, true],
    DEVELOPER: [false, true], SUPPORT: [false, true], VIEWER: [false, false],
  };
  for (const [role, [canRefund, canLink]] of Object.entries(expect)) {
    assert.equal(authorize(refund, merchant(role), "POST") === null, canRefund, `${role} refund`);
    assert.equal(authorize(link, merchant(role), "POST") === null, canLink, `${role} link`);
    assert.equal(authorize(refund, merchant(role), "GET"), null, `${role} GET still open`);
  }
  assert.equal(authorize(refund, operator(), "POST").status, 403, "platform role does not satisfy merchant roles");
});

test("route role options match docs/MODULES.md", () => {
  const find = (mod, m, p) => require(`../server/routes/${mod}`).find(([mm, pp]) => mm === m && pp === p)[3];
  assert.deepEqual(find("payments", "POST", "/refunds").roles, ["OWNER", "ADMIN", "FINANCE"]);
  assert.deepEqual(find("links", "POST", "/links").roles, ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT"]);
});

test("platformMode: missing or 'all' means every mode; otherwise test/live only", () => {
  assert.equal(platformMode(undefined), null);
  assert.equal(platformMode(""), null);
  assert.equal(platformMode("ALL"), null);
  assert.equal(platformMode("test"), "TEST");
  assert.equal(platformMode("Live"), "LIVE");
  assert.throws(() => platformMode("prod"), (e) => e.status === 400);
});

test("every /super route is platform-gated, and no other module defines /super paths", () => {
  const superRoutes = require("../server/routes/super");
  assert.ok(superRoutes.length > 0);
  for (const [method, p, , opts = {}] of superRoutes) {
    assert.ok(p.startsWith("/super/"), `${method} ${p} must live under /super/`);
    assert.equal(opts.platform, true, `${method} ${p} must have { platform: true }`);
    assert.ok(!opts.public && !opts.session, `${method} ${p} must not be public/session`);
  }
  const dir = path.join(__dirname, "..", "server", "routes");
  const others = [require("../server/auth").routes];
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".js")) others.push(require(path.join(dir, f)));
  for (const mod of others)
    for (const [method, p, , opts = {}] of mod) {
      assert.ok(!p.startsWith("/super"), `${method} ${p} is outside routes/super`);
      assert.ok(!opts.platform, `${method} ${p} is platform-gated outside routes/super`);
    }
});

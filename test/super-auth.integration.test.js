// Integration: platform/merchant boundary over real HTTP against a disposable Neon branch.
// Runs only when TEST_DATABASE_URL is set, and refuses the host configured in .env.local
// (the branch the app normally uses). Creates its own users and removes them afterwards.
//   TEST_DATABASE_URL=postgres://...branch... npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const url = process.env.TEST_DATABASE_URL;
const hostOf = (u) => { try { return new URL(u).hostname.replace("-pooler", ""); } catch { return null; } };
function appHost() {
  const f = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
  return m ? hostOf(m[1]) : null;
}

const skip = !url ? "TEST_DATABASE_URL not set" : hostOf(url) === appHost() ? "TEST_DATABASE_URL is the app database; use a test branch" : false;

test("platform/merchant authorization boundary", { skip }, async (t) => {
  process.env.DATABASE_URL = url; // before db.js opens its pool
  process.env.DATA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("base64");
  const db = require("../server/db");
  const { handle } = require("../server/router");
  const { hashPassword } = require("../server/secrets");

  const server = http.createServer((req, res) => handle(req, res, req.url.split("?")[0].slice(4)));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(p, { method = "GET", body, cookie } = {}) {
    const res = await fetch(base + p, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie");
    return { status: res.status, body: await res.json().catch(() => null), cookie: set ? set.split(";")[0] : null };
  }

  const tag = crypto.randomBytes(4).toString("hex");
  const mobile = () => "+919" + String(crypto.randomInt(1e8, 1e9));
  const pw = "Test-" + crypto.randomBytes(8).toString("hex");
  const users = [], merchants = [];

  t.after(async () => {
    await db.query(`DELETE FROM "AuditLog" WHERE "userId" = ANY($1) OR "merchantId" = ANY($2)`, [users, merchants]);
    await db.query(`DELETE FROM "Merchant" WHERE id = ANY($1)`, [merchants]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1)`, [users]);
    server.close();
    await db.getPool().end();
  });

  // Merchant owner through the real signup flow; the body tries to smuggle a platform role.
  const ownerEmail = `owner-${tag}@example.test`;
  const signup = await call("/auth/signup", { method: "POST", body: { name: "Owner", email: ownerEmail, mobile: mobile(), password: pw, businessName: "Test Co", platformRole: "SUPER_ADMIN" } });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  const owner = await db.one(`SELECT u.id, u."platformRole", ms."merchantId" FROM "User" u JOIN "Membership" ms ON ms."userId"=u.id WHERE u.email=$1`, [ownerEmail]);
  users.push(owner.id); merchants.push(owner.merchantId);
  const ownerCookie = signup.cookie;

  // Operator assigned the documented way: a direct database update, no membership.
  const opId = db.id(), opEmail = `operator-${tag}@example.test`;
  await db.query(`INSERT INTO "User" (id,email,mobile,name,"passwordHash","platformRole","updatedAt") VALUES ($1,$2,$3,'Operator',$4,'SUPER_ADMIN',now())`, [opId, opEmail, mobile(), hashPassword(pw)]);
  users.push(opId);
  const login = await call("/auth/login", { method: "POST", body: { email: opEmail, password: pw } });
  assert.equal(login.status, 200);
  const opCookie = login.cookie;

  await t.test("signup ignores a platformRole in the request body", () => {
    assert.equal(owner.platformRole, null);
    assert.equal(signup.body.platformRole, null);
  });

  await t.test("no session → 401 on /super", async () => {
    assert.equal((await call("/super/session")).status, 401);
  });

  await t.test("merchant OWNER → 403 on /super", async () => {
    const r = await call("/super/session", { cookie: ownerCookie });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "Super Admin access is required.");
  });

  await t.test("Super Admin → 200 on /super/session", async () => {
    const r = await call("/super/session", { cookie: opCookie });
    assert.equal(r.status, 200);
    assert.equal(r.body.platformRole, "SUPER_ADMIN");
    assert.equal(r.body.user.email, opEmail);
  });

  await t.test("/auth/me reports platformRole for both", async () => {
    const op = await call("/auth/me", { cookie: opCookie });
    assert.equal(op.status, 200);
    assert.equal(op.body.platformRole, "SUPER_ADMIN");
    assert.equal(op.body.merchant, null);
    const own = await call("/auth/me", { cookie: ownerCookie });
    assert.equal(own.body.platformRole, null);
  });

  await t.test("Super Admin without membership → 403 on merchant routes", async () => {
    assert.equal((await call("/payments?mode=test", { cookie: opCookie })).status, 403);
    assert.equal((await call("/settings", { cookie: opCookie })).status, 403);
  });

  await t.test("team management cannot grant SUPER_ADMIN", async () => {
    const r = await call("/settings/team", { method: "POST", cookie: ownerCookie, body: { email: opEmail, role: "SUPER_ADMIN" } });
    assert.equal(r.status, 400);
    const row = await db.one(`SELECT "platformRole" FROM "User" WHERE id=$1`, [owner.id]);
    assert.equal(row.platformRole, null);
  });

  await t.test("regression: merchant GET routes still answer for the owner", async () => {
    const paths = ["/payments", "/links", "/checkout", "/subscriptions", "/split", "/payouts", "/chargebacks", "/reports",
      "/products", "/onboarding", "/settings", "/settings/audit", "/developer", "/settlement-info", "/gateway-health"];
    for (const p of paths) {
      const r = await call(`${p}?mode=test`, { cookie: ownerCookie });
      assert.ok(r.status < 500, `${p} → ${r.status} ${JSON.stringify(r.body)}`);
      assert.notEqual(r.status, 401, p);
      assert.notEqual(r.status, 403, p);
    }
  });

  await t.test("RBAC: refunds and payment-link creation per role (docs/MODULES.md)", async () => {
    // Each role is added through the real team flow, then signs in. Requests use a txnid that doesn't
    // exist and an empty link description, so an allowed role stops at 404/400: no refund or link is created.
    const expect = { OWNER: [true, true], ADMIN: [true, true], FINANCE: [true, true], DEVELOPER: [false, true], SUPPORT: [false, true], VIEWER: [false, false] };
    const cookies = { OWNER: ownerCookie };
    for (const role of Object.keys(expect).filter((r) => r !== "OWNER")) {
      const uid = db.id(), email = `${role.toLowerCase()}-${tag}@example.test`;
      await db.query(`INSERT INTO "User" (id,email,mobile,name,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,$5,now())`, [uid, email, mobile(), role, hashPassword(pw)]);
      users.push(uid);
      const add = await call("/settings/team", { method: "POST", cookie: ownerCookie, body: { email, role } });
      assert.equal(add.status, 200, `add ${role}: ${JSON.stringify(add.body)}`);
      cookies[role] = (await call("/auth/login", { method: "POST", body: { email, password: pw } })).cookie;
      assert.equal((await call("/auth/me", { cookie: cookies[role] })).body.role, role);
    }
    for (const [role, [canRefund, canLink]] of Object.entries(expect)) {
      const rf = await call("/refunds?mode=test", { method: "POST", cookie: cookies[role], body: { txnid: "NO-SUCH-TXN", amount: 100 } });
      assert.equal(rf.status, canRefund ? 404 : 403, `${role} refund → ${rf.status} ${JSON.stringify(rf.body)}`);
      const ln = await call("/links?mode=test", { method: "POST", cookie: cookies[role], body: { desc: "" } });
      assert.equal(ln.status, canLink ? 400 : 403, `${role} link → ${ln.status} ${JSON.stringify(ln.body)}`);
      // Unchanged routes keep the default write roles: SUPPORT still cannot edit a link.
      const ed = await call("/links/none?mode=test", { method: "PATCH", cookie: cookies[role], body: {} });
      assert.equal(ed.status === 403, !["OWNER", "ADMIN", "FINANCE", "DEVELOPER"].includes(role), `${role} edit link → ${ed.status}`);
    }
    const rows = await db.one(`SELECT (SELECT count(*) FROM "Refund" WHERE "merchantId"=$1) r, (SELECT count(*) FROM "PaymentLink" WHERE "merchantId"=$1) l`, [owner.merchantId]);
    assert.deepEqual([rows.r, rows.l], [0, 0], "no refund or link rows were created");
  });

  await t.test("disabled Super Admin loses access immediately", async () => {
    await db.query(`UPDATE "User" SET status='DISABLED' WHERE id=$1`, [opId]);
    assert.equal((await call("/super/session", { cookie: opCookie })).status, 401);
  });

  await t.test("logout revokes the operator session", async () => {
    await db.query(`UPDATE "User" SET status='ACTIVE' WHERE id=$1`, [opId]);
    assert.equal((await call("/auth/logout", { method: "POST", cookie: opCookie, body: {} })).status, 200);
    assert.equal((await call("/super/session", { cookie: opCookie })).status, 401);
  });
});

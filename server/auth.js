// Sessions (HttpOnly cookie → Session.refreshHash) and the /auth/* routes.
const db = require("./db");
const { fail } = require("./http");
const { hashPassword, verifyPassword, sha256, token } = require("./secrets");

const COOKIE = "pn_session";
const SESSION_DAYS = 30;
const MAX_FAILED = 5, LOCK_MIN = 15, OTP_TTL_MIN = 10, OTP_MAX_ATTEMPTS = 5;
const STEP_KEYS = ["PAN_DETAILS", "BUSINESS_DETAILS", "BANK_ACCOUNT", "WEBSITE_DETAILS", "KYC_DOCUMENTS"];

const isProd = () => process.env.NODE_ENV === "production" || !!process.env.VERCEL;
function cookie(value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isProd() ? "; Secure" : ""}`;
}
function readCookie(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}
const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim() || null;

async function audit(c, { merchantId = null, userId = null, mode = null, action, entity = null, entityId = null, ip = null, meta = null }) {
  await (c.q || db.query)(
    `INSERT INTO "AuditLog" (id,"merchantId","userId",mode,action,entity,"entityId",ip,meta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [db.id(), merchantId, userId, mode, action, entity, entityId, ip, meta == null ? null : JSON.stringify(meta)]
  );
}

async function startSession(ctx, userId) {
  const m = await db.one(`SELECT "merchantId" FROM "Membership" WHERE "userId"=$1 ORDER BY "createdAt" LIMIT 1`, [userId]);
  const t = token();
  await db.query(
    `INSERT INTO "Session" (id,"userId","refreshHash","merchantId",mode,"userAgent",ip,"expiresAt")
     VALUES ($1,$2,$3,$4,'TEST',$5,$6, now() + interval '${SESSION_DAYS} days')`,
    [db.id(), userId, sha256(t), m ? m.merchantId : null, String(ctx.req.headers["user-agent"] || "").slice(0, 300), clientIp(ctx.req)]
  );
  await db.query(`UPDATE "User" SET "lastLoginAt"=now(), "failedLogins"=0, "lockedUntil"=NULL, "updatedAt"=now() WHERE id=$1`, [userId]);
  ctx.setHeader("set-cookie", cookie(t, SESSION_DAYS * 86400));
  return { headers: { cookie: `${COOKIE}=${t}` } }; // request-shaped, for getAuth
}

// Resolves the signed-in user and their merchant, or null.
async function getAuth(req) {
  const t = readCookie(req);
  if (!t) return null;
  const row = await db.one(
    `SELECT s.id AS "sessionId", s."merchantId", u.id AS "userId", u.name, u.email, u.mobile, u.status, u."platformRole",
            m."displayName", m."legalName", m.status AS "merchantStatus", ms.role
       FROM "Session" s JOIN "User" u ON u.id = s."userId"
       LEFT JOIN "Merchant" m ON m.id = s."merchantId"
       LEFT JOIN "Membership" ms ON ms."userId" = u.id AND ms."merchantId" = s."merchantId"
      WHERE s."refreshHash" = $1 AND s."revokedAt" IS NULL AND s."expiresAt" > now()`,
    [sha256(t)]
  );
  if (!row || row.status !== "ACTIVE") return null;
  return {
    sessionId: row.sessionId,
    user: { id: row.userId, name: row.name, email: row.email, mobile: row.mobile },
    merchantId: row.merchantId,
    merchant: row.merchantId ? { id: row.merchantId, displayName: row.displayName, legalName: row.legalName, status: row.merchantStatus } : null,
    role: row.role,
    platformRole: row.platformRole || null,
  };
}

async function me(auth) {
  const mid = auth.merchantId;
  const steps = mid ? await db.query(`SELECT key, status FROM "OnboardingStep" WHERE "merchantId"=$1`, [mid]) : [];
  const creds = mid
    ? await db.query(`SELECT mode, "payuMid" FROM "PayuCredential" WHERE "merchantId"=$1 AND "isDefault" AND status='ACTIVE'`, [mid])
    : [];
  const mids = { test: null, live: null };
  creds.forEach((c) => (mids[c.mode.toLowerCase()] = String(c.payuMid)));
  return {
    user: { name: auth.user.name, email: auth.user.email, mobile: auth.user.mobile },
    merchant: auth.merchant,
    role: auth.role,
    platformRole: auth.platformRole || null,
    mids,
    onboarding: Object.fromEntries(STEP_KEYS.map((k) => [k, (steps.find((s) => s.key === k) || {}).status || "NOT_STARTED"])),
  };
}

// Re-entry of the signed-in user's password before a sensitive change (Super Admin Live PayU writes).
// Shares the login lockout counters, so it can't be used to guess passwords. Writes an audit row on failure.
async function confirmPassword(ctx, password, action) {
  const u = await db.one(`SELECT id, "passwordHash", "failedLogins", "lockedUntil" FROM "User" WHERE id=$1`, [ctx.auth.user.id]);
  if (!u) fail(401, "Please log in again.");
  if (u.lockedUntil && u.lockedUntil > new Date()) fail(423, "Too many attempts. Try again in a few minutes.");
  if (!String(password || "")) fail(403, "Enter your password to confirm this change.", { code: "PASSWORD_REQUIRED" });
  if (!verifyPassword(password, u.passwordHash)) {
    const n = u.failedLogins + 1;
    await db.query(
      `UPDATE "User" SET "failedLogins"=$2, "lockedUntil"=CASE WHEN $2 >= ${MAX_FAILED} THEN now() + interval '${LOCK_MIN} minutes' ELSE NULL END, "updatedAt"=now() WHERE id=$1`,
      [u.id, n >= MAX_FAILED ? 0 : n]
    );
    await audit(db, { userId: u.id, action: "platform.reauth_failed", entity: "User", entityId: u.id, ip: clientIp(ctx.req), meta: { for: action } });
    fail(403, "That password is not correct.", { code: "PASSWORD_WRONG" });
  }
  if (u.failedLogins) await db.query(`UPDATE "User" SET "failedLogins"=0, "updatedAt"=now() WHERE id=$1`, [u.id]);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (e) => String(e || "").trim().toLowerCase();
const normMobile = (m) => {
  // Accepts 10 digits, 0 + 10 digits, or 91 / +91 + 10 digits. A bare 10-digit number may itself start with 91.
  let digits = String(m || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? "+91" + digits : null;
};

// OTP delivery needs an email/SMS provider. Until one is configured the code is written to the server log.
async function deliverOtp(target, code, purpose) {
  console.log(`[otp] ${purpose} code for ${target}: ${code} (no email/SMS provider configured)`);
}
async function issueOtp(userId, target, purpose) {
  const code = String(require("node:crypto").randomInt(0, 1e6)).padStart(6, "0");
  await db.query(
    `INSERT INTO "OtpCode" (id,"userId",target,purpose,"codeHash","expiresAt") VALUES ($1,$2,$3,$4,$5, now() + interval '${OTP_TTL_MIN} minutes')`,
    [db.id(), userId, target, purpose, sha256(target + ":" + code)]
  );
  await deliverOtp(target, code, purpose);
}
async function consumeOtp(target, purpose, code) {
  const row = await db.one(
    `SELECT id, "userId", "codeHash", attempts FROM "OtpCode"
      WHERE target=$1 AND purpose=$2 AND "consumedAt" IS NULL AND "expiresAt" > now()
      ORDER BY "createdAt" DESC LIMIT 1`,
    [target, purpose]
  );
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) fail(400, "Code expired. Request a new one.");
  if (row.codeHash !== sha256(target + ":" + String(code || "").trim())) {
    await db.query(`UPDATE "OtpCode" SET attempts = attempts + 1 WHERE id=$1`, [row.id]);
    fail(400, "That code is not correct.");
  }
  await db.query(`UPDATE "OtpCode" SET "consumedAt"=now() WHERE id=$1`, [row.id]);
  return row.userId;
}
async function userByTarget(target) {
  const t = String(target || "").trim();
  if (EMAIL.test(t)) return { target: normEmail(t), user: await db.one(`SELECT id, status FROM "User" WHERE email=$1`, [normEmail(t)]) };
  const m = normMobile(t);
  if (!m) fail(400, "Enter a valid email or 10-digit mobile number.");
  return { target: m, user: await db.one(`SELECT id, status FROM "User" WHERE mobile=$1`, [m]) };
}

const routes = [
  ["POST", "/auth/signup", async (ctx) => {
    const { name, email, mobile, password, businessName } = ctx.body;
    const em = normEmail(email), mob = normMobile(mobile), nm = String(name || "").trim();
    if (!nm) fail(400, "Enter your name.");
    if (!EMAIL.test(em)) fail(400, "Enter a valid email.");
    if (!mob) fail(400, "Enter a valid 10-digit mobile number.");
    if (String(password || "").length < 8) fail(400, "Password must be at least 8 characters.");
    const taken = await db.one(`SELECT email, mobile FROM "User" WHERE email=$1 OR mobile=$2`, [em, mob]);
    if (taken) fail(409, taken.email === em ? "An account with this email already exists." : "This mobile number is already registered.");

    const userId = db.id(), merchantId = db.id();
    await db.tx(async (c) => {
      await c.q(`INSERT INTO "User" (id,email,mobile,name,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,$5,now())`, [userId, em, mob, nm, hashPassword(password)]);
      await c.q(`INSERT INTO "Merchant" (id,"displayName",email,mobile,"updatedAt") VALUES ($1,$2,$3,$4,now())`, [merchantId, String(businessName || "").trim() || nm, em, mob]);
      await c.q(`INSERT INTO "Membership" (id,"userId","merchantId",role) VALUES ($1,$2,$3,'OWNER')`, [db.id(), userId, merchantId]);
      for (const k of STEP_KEYS)
        await c.q(`INSERT INTO "OnboardingStep" (id,"merchantId",key,"updatedAt") VALUES ($1,$2,$3,now())`, [db.id(), merchantId, k]);
      await require("./payu").provisionTestCredential(c, merchantId);
      await audit(c, { merchantId, userId, action: "user.signup", entity: "User", entityId: userId, ip: clientIp(ctx.req) });
    });
    return me(await getAuth(await startSession(ctx, userId)));
  }, { public: true }],

  ["POST", "/auth/login", async (ctx) => {
    const em = normEmail(ctx.body.email);
    const u = await db.one(`SELECT id, "passwordHash", status, "failedLogins", "lockedUntil" FROM "User" WHERE email=$1`, [em]);
    if (u && u.lockedUntil && u.lockedUntil > new Date()) fail(423, "Too many attempts. Try again in a few minutes.");
    if (!u || u.status !== "ACTIVE" || !verifyPassword(ctx.body.password, u.passwordHash)) {
      if (u) {
        const n = u.failedLogins + 1;
        await db.query(
          `UPDATE "User" SET "failedLogins"=$2, "lockedUntil"=CASE WHEN $2 >= ${MAX_FAILED} THEN now() + interval '${LOCK_MIN} minutes' ELSE NULL END, "updatedAt"=now() WHERE id=$1`,
          [u.id, n >= MAX_FAILED ? 0 : n]
        );
      }
      fail(401, "Email or password is incorrect.");
    }
    return me(await getAuth(await startSession(ctx, u.id)));
  }, { public: true }],

  ["POST", "/auth/otp/request", async (ctx) => {
    const { target, user } = await userByTarget(ctx.body.target);
    if (user && user.status === "ACTIVE") await issueOtp(user.id, target, "LOGIN");
    return { sent: true }; // same answer whether or not the account exists
  }, { public: true }],

  ["POST", "/auth/otp/verify", async (ctx) => {
    const { target } = await userByTarget(ctx.body.target);
    const userId = await consumeOtp(target, "LOGIN", ctx.body.code);
    return me(await getAuth(await startSession(ctx, userId)));
  }, { public: true }],

  ["POST", "/auth/password/forgot", async (ctx) => {
    const em = normEmail(ctx.body.email);
    if (!EMAIL.test(em)) fail(400, "Enter a valid email.");
    const u = await db.one(`SELECT id, status FROM "User" WHERE email=$1`, [em]);
    if (u && u.status === "ACTIVE") await issueOtp(u.id, em, "PASSWORD_RESET");
    return { sent: true };
  }, { public: true }],

  ["POST", "/auth/password/reset", async (ctx) => {
    const em = normEmail(ctx.body.email);
    if (String(ctx.body.password || "").length < 8) fail(400, "Password must be at least 8 characters.");
    const userId = await consumeOtp(em, "PASSWORD_RESET", ctx.body.code);
    await db.query(`UPDATE "User" SET "passwordHash"=$2, "failedLogins"=0, "lockedUntil"=NULL, "updatedAt"=now() WHERE id=$1`, [userId, hashPassword(ctx.body.password)]);
    await db.query(`UPDATE "Session" SET "revokedAt"=now() WHERE "userId"=$1 AND "revokedAt" IS NULL`, [userId]);
    await audit(db, { userId, action: "user.password_reset", entity: "User", entityId: userId, ip: clientIp(ctx.req) });
    return { ok: true };
  }, { public: true }],

  ["POST", "/auth/sso", async (ctx) => {
    const domain = normEmail(ctx.body.email).split("@")[1];
    const sso = domain && (await db.one(`SELECT protocol FROM "SsoConnection" WHERE "emailDomain"=$1 AND enabled`, [domain]));
    if (!sso) fail(404, "Company SSO is not set up for this email domain.");
    fail(501, "Company SSO sign-in is not available yet.");
  }, { public: true }],

  ["POST", "/auth/logout", async (ctx) => {
    await db.query(`UPDATE "Session" SET "revokedAt"=now() WHERE id=$1`, [ctx.auth.sessionId]);
    ctx.setHeader("set-cookie", cookie("", 0));
    return { ok: true };
  }, { session: true }],

  ["GET", "/auth/me", async (ctx) => me(ctx.auth), { session: true }],
];

module.exports = { routes, getAuth, audit, clientIp, confirmPassword, me, STEP_KEYS, normEmail, normMobile, EMAIL };

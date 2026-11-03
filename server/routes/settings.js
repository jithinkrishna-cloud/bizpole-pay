// Settings page: business profile, bank accounts, team, password, sessions, SSO config and the audit log.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp, EMAIL, normEmail, normMobile } = require("../auth");
const { encrypt, decrypt, hashPassword, verifyPassword } = require("../secrets");
const { safeFetch } = require("./developer");

const OWNER_ADMIN = ["OWNER", "ADMIN"];
const PUBLIC_MAIL = ["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com", "icloud.com", "rediffmail.com", "proton.me", "protonmail.com"];
const ROLES = ["ADMIN", "FINANCE", "DEVELOPER", "SUPPORT", "VIEWER"]; // assignable (OWNER is not)
const BANKS_IFSC = { HDFC: "HDFC Bank", ICIC: "ICICI Bank", SBIN: "State Bank of India", UTIB: "Axis Bank", KKBK: "Kotak Mahindra Bank", FDRL: "Federal Bank", SIBL: "South Indian Bank", YESB: "Yes Bank", IDIB: "Indian Bank", PUNB: "Punjab National Bank" };
const ENTITY_LABEL = { INDIVIDUAL: "Individual", PROPRIETORSHIP: "Sole proprietorship", PARTNERSHIP: "Partnership firm", LLP: "LLP", PRIVATE_LIMITED: "Private limited company",
  PUBLIC_LIMITED: "Public limited company", TRUST: "Trust", SOCIETY: "Society", NGO: "NGO", GOVERNMENT: "Government body" };

const requireAdmin = (ctx, what = "do this") => {
  if (!OWNER_ADMIN.includes(ctx.auth.role)) fail(403, `Only the account owner or an admin can ${what}.`);
};
const log = (ctx, action, entity, entityId, meta, c = db) =>
  audit(c, { merchantId: ctx.auth.merchantId, userId: ctx.auth.user.id, action, entity, entityId, ip: clientIp(ctx.req), meta });

async function business(mid) {
  const m = await db.one(
    `SELECT m."displayName", m."legalName", m.email, m.mobile, m."entityType", m.category, m."subCategory", m."panLast4", m.gstin, m."websiteUrl", m."appUrl", m.status,
            a.line1, a.city, a.state, a.pincode
       FROM "Merchant" m LEFT JOIN "MerchantAddress" a ON a."merchantId"=m.id AND a.kind='registered' WHERE m.id=$1`,
    [mid]
  );
  return {
    displayName: m.displayName, legalName: m.legalName, email: m.email, mobile: m.mobile, entity: ENTITY_LABEL[m.entityType] || null,
    category: m.category ? m.category + (m.subCategory ? " › " + m.subCategory : "") : null, panLast4: m.panLast4, gstin: m.gstin,
    website: m.websiteUrl, app: m.appUrl, status: m.status, address: m.line1 ? `${m.line1}, ${m.city}, ${m.state} ${m.pincode}` : null,
  };
}
async function banks(mid) {
  const rows = await db.query(
    `SELECT id, "accountHolder", "accountLast4", ifsc, "bankName", "nameAtBank", "pennyDropVerified", "isPrimary", "createdAt"
       FROM "BankAccount" WHERE "merchantId"=$1 AND "retiredAt" IS NULL ORDER BY "isPrimary" DESC, "createdAt"`,
    [mid]
  );
  return rows.map((b) => ({ id: b.id, holder: b.accountHolder, last4: b.accountLast4, ifsc: b.ifsc, bank: b.bankName || b.ifsc.slice(0, 4),
    nameAtBank: b.nameAtBank, verified: b.pennyDropVerified, primary: b.isPrimary, added: b.createdAt }));
}
async function team(mid) {
  return db.query(
    `SELECT ms.id, ms.role, ms."createdAt", u.id AS "userId", u.name, u.email, u.status, u."lastLoginAt"
       FROM "Membership" ms JOIN "User" u ON u.id = ms."userId" WHERE ms."merchantId"=$1
      ORDER BY (ms.role='OWNER') DESC, ms."createdAt"`,
    [mid]
  );
}
async function sessions(auth) {
  const rows = await db.query(
    `SELECT id, "userAgent", ip, "createdAt" FROM "Session" WHERE "userId"=$1 AND "revokedAt" IS NULL AND "expiresAt" > now() ORDER BY "createdAt" DESC`,
    [auth.user.id]
  );
  return rows.map((r) => ({ id: r.id, userAgent: r.userAgent || "", ip: r.ip || "", started: r.createdAt, current: r.id === auth.sessionId }));
}
async function sso(mid) {
  const r = await db.one(`SELECT "emailDomain", protocol, issuer, "metadataUrl", enforced, enabled, "updatedAt" FROM "SsoConnection" WHERE "merchantId"=$1`, [mid]);
  return r && { domain: r.emailDomain, protocol: r.protocol, issuer: r.issuer, metadataUrl: r.metadataUrl, enabled: r.enabled, updatedAt: r.updatedAt };
}
async function ownBank(ctx, id) {
  const b = await db.one(`SELECT id, "isPrimary", "accountLast4" FROM "BankAccount" WHERE id=$1 AND "merchantId"=$2 AND "retiredAt" IS NULL`, [id, ctx.auth.merchantId]);
  if (!b) fail(404, "Bank account not found.");
  return b;
}
async function member(ctx, id) {
  const m = await db.one(`SELECT ms.id, ms.role, ms."userId", u.email FROM "Membership" ms JOIN "User" u ON u.id=ms."userId" WHERE ms.id=$1 AND ms."merchantId"=$2`, [id, ctx.auth.merchantId]);
  if (!m) fail(404, "Team member not found.");
  if (m.role === "OWNER") fail(409, "The owner's access can't be changed.");
  if (m.userId === ctx.auth.user.id) fail(409, "You can't change your own access.");
  return m;
}

module.exports = [
  ["GET", "/settings", async ({ auth }) => {
    const [b, k, t, s, o] = await Promise.all([business(auth.merchantId), banks(auth.merchantId), team(auth.merchantId), sessions(auth), sso(auth.merchantId)]);
    return { business: b, banks: k, team: t, sessions: s, sso: o };
  }],

  ["PATCH", "/settings/business", async (ctx) => {
    requireAdmin(ctx, "edit the business profile");
    const display = String(ctx.body.displayName || "").trim(), email = normEmail(ctx.body.email), phone = normMobile(ctx.body.mobile);
    if (display.length < 2 || display.length > 80) fail(400, "Display name is required (2 to 80 characters).", { field: "b-display" });
    if (!EMAIL.test(email)) fail(400, "Enter a valid email.", { field: "b-email" });
    if (!phone) fail(400, "Enter a valid 10-digit mobile number.", { field: "b-phone" });
    await db.query(`UPDATE "Merchant" SET "displayName"=$2, email=$3, mobile=$4, "updatedAt"=now() WHERE id=$1`, [ctx.auth.merchantId, display, email, phone]);
    await log(ctx, "merchant.profile_updated", "Merchant", ctx.auth.merchantId, { displayName: display, email, mobile: phone });
    return business(ctx.auth.merchantId);
  }],

  // Adds a settlement account. The number is stored encrypted; penny-drop verification isn't connected, so it stays unverified.
  ["POST", "/settings/banks", async (ctx) => {
    requireAdmin(ctx, "change bank accounts");
    const holder = String(ctx.body.holder || "").trim().slice(0, 120), acct = String(ctx.body.account || "").replace(/\s/g, ""), ifsc = String(ctx.body.ifsc || "").trim().toUpperCase();
    if (holder.length < 3) fail(400, "Enter the name on the account.", { field: "nb-holder" });
    if (!/^\d{9,18}$/.test(acct)) fail(400, "Account number is 9–18 digits.", { field: "nb-acc" });
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) fail(400, "IFSC looks like HDFC0001234.", { field: "nb-ifsc" });
    const id = db.id();
    await db.tx(async (c) => {
      const existing = await c.q(`SELECT "accountNumberEnc", ifsc FROM "BankAccount" WHERE "merchantId"=$1 AND "retiredAt" IS NULL AND "accountLast4"=$2`, [ctx.auth.merchantId, acct.slice(-4)]);
      if (existing.some((e) => e.ifsc === ifsc && decrypt(e.accountNumberEnc) === acct)) fail(409, "This account is already added.");
      const hasPrimary = await c.one(`SELECT 1 FROM "BankAccount" WHERE "merchantId"=$1 AND "isPrimary" AND "retiredAt" IS NULL`, [ctx.auth.merchantId]);
      await c.q(
        `INSERT INTO "BankAccount" (id,"merchantId","accountHolder","accountNumberEnc","accountLast4",ifsc,"bankName","isPrimary") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, ctx.auth.merchantId, holder, encrypt(acct), acct.slice(-4), ifsc, BANKS_IFSC[ifsc.slice(0, 4)] || null, !hasPrimary]
      );
      await log(ctx, "bank_account.added", "BankAccount", id, { last4: acct.slice(-4), ifsc }, c);
    });
    return { banks: await banks(ctx.auth.merchantId) };
  }],

  ["POST", "/settings/banks/:id/primary", async (ctx) => {
    requireAdmin(ctx, "change bank accounts");
    const b = await ownBank(ctx, ctx.params.id);
    if (!b.isPrimary) {
      await db.tx(async (c) => {
        await c.q(`UPDATE "BankAccount" SET "isPrimary"=false WHERE "merchantId"=$1 AND "isPrimary"`, [ctx.auth.merchantId]);
        await c.q(`UPDATE "BankAccount" SET "isPrimary"=true WHERE id=$1`, [b.id]);
        await log(ctx, "bank_account.primary_changed", "BankAccount", b.id, { last4: b.accountLast4 }, c);
      });
    }
    return { banks: await banks(ctx.auth.merchantId) };
  }],

  // Accounts are retired, not deleted: past settlements reference them.
  ["DELETE", "/settings/banks/:id", async (ctx) => {
    requireAdmin(ctx, "change bank accounts");
    const b = await ownBank(ctx, ctx.params.id);
    if (b.isPrimary) fail(409, "Make another account primary before removing this one.");
    await db.query(`UPDATE "BankAccount" SET "retiredAt"=now() WHERE id=$1`, [b.id]);
    await log(ctx, "bank_account.removed", "BankAccount", b.id, { last4: b.accountLast4 });
    return { banks: await banks(ctx.auth.merchantId) };
  }],

  // No email provider: only people who already have a Paynest login can be added.
  ["POST", "/settings/team", async (ctx) => {
    requireAdmin(ctx, "manage the team");
    const email = normEmail(ctx.body.email), role = String(ctx.body.role || "").toUpperCase();
    if (!EMAIL.test(email)) fail(400, "Enter a valid email.", { field: "iv-email" });
    if (!ROLES.includes(role)) fail(400, "Choose a role.", { field: "iv-role" });
    if (role === "ADMIN" && ctx.auth.role !== "OWNER") fail(403, "Only the owner can add admins.");
    const u = await db.one(`SELECT id, status FROM "User" WHERE email=$1`, [email]);
    if (!u) fail(404, "No Paynest login uses this email. Email invites aren't available yet, so ask them to sign up first, then add them here.", { field: "iv-email" });
    if (u.status !== "ACTIVE") fail(409, "That login is locked or disabled.", { field: "iv-email" });
    const dup = await db.one(`SELECT 1 FROM "Membership" WHERE "userId"=$1 AND "merchantId"=$2`, [u.id, ctx.auth.merchantId]);
    if (dup) fail(409, "This person already has access.", { field: "iv-email" });
    const id = db.id();
    await db.query(`INSERT INTO "Membership" (id,"userId","merchantId",role,"invitedBy") VALUES ($1,$2,$3,$4,$5)`, [id, u.id, ctx.auth.merchantId, role, ctx.auth.user.id]);
    await log(ctx, "member.added", "Membership", id, { email, role });
    return { team: await team(ctx.auth.merchantId) };
  }],

  ["PATCH", "/settings/team/:id", async (ctx) => {
    requireAdmin(ctx, "manage the team");
    const m = await member(ctx, ctx.params.id), role = String(ctx.body.role || "").toUpperCase();
    if (!ROLES.includes(role)) fail(400, "Choose a role.");
    if ((role === "ADMIN" || m.role === "ADMIN") && ctx.auth.role !== "OWNER") fail(403, "Only the owner can change admins.");
    await db.query(`UPDATE "Membership" SET role=$2 WHERE id=$1`, [m.id, role]);
    await log(ctx, "member.role_changed", "Membership", m.id, { email: m.email, from: m.role, to: role });
    return { team: await team(ctx.auth.merchantId) };
  }],

  ["DELETE", "/settings/team/:id", async (ctx) => {
    requireAdmin(ctx, "manage the team");
    const m = await member(ctx, ctx.params.id);
    if (m.role === "ADMIN" && ctx.auth.role !== "OWNER") fail(403, "Only the owner can remove admins.");
    await db.tx(async (c) => {
      await c.q(`DELETE FROM "Membership" WHERE id=$1`, [m.id]);
      // End their sessions on this merchant so access stops now.
      await c.q(`UPDATE "Session" SET "revokedAt"=now() WHERE "userId"=$1 AND "merchantId"=$2 AND "revokedAt" IS NULL`, [m.userId, ctx.auth.merchantId]);
      await log(ctx, "member.removed", "Membership", m.id, { email: m.email, role: m.role }, c);
    });
    return { team: await team(ctx.auth.merchantId) };
  }],

  // Own account: any role.
  ["POST", "/settings/password", async (ctx) => {
    const cur = String(ctx.body.current || ""), next = String(ctx.body.next || "");
    const u = await db.one(`SELECT "passwordHash" FROM "User" WHERE id=$1`, [ctx.auth.user.id]);
    if (!verifyPassword(cur, u.passwordHash)) fail(400, "Your current password is not correct.", { field: "pw-old" });
    if (next.length < 8) fail(400, "Use at least 8 characters.", { field: "pw-new" });
    if (next === cur) fail(400, "Choose a different password.", { field: "pw-new" });
    await db.tx(async (c) => {
      await c.q(`UPDATE "User" SET "passwordHash"=$2, "updatedAt"=now() WHERE id=$1`, [ctx.auth.user.id, hashPassword(next)]);
      await c.q(`UPDATE "Session" SET "revokedAt"=now() WHERE "userId"=$1 AND id<>$2 AND "revokedAt" IS NULL`, [ctx.auth.user.id, ctx.auth.sessionId]);
      await log(ctx, "user.password_changed", "User", ctx.auth.user.id, null, c);
    });
    return { sessions: await sessions(ctx.auth) };
  }, { anyRole: true }],

  ["DELETE", "/settings/sessions/:id", async (ctx) => {
    if (ctx.params.id === ctx.auth.sessionId) fail(400, "Use Log out to end this session.");
    const r = await db.one(`UPDATE "Session" SET "revokedAt"=now() WHERE id=$1 AND "userId"=$2 AND "revokedAt" IS NULL RETURNING id`, [ctx.params.id, ctx.auth.user.id]);
    if (!r) fail(404, "Session not found.");
    await log(ctx, "session.revoked", "Session", r.id);
    return { sessions: await sessions(ctx.auth) };
  }, { anyRole: true }],

  ["POST", "/settings/sessions/revoke-others", async (ctx) => {
    const r = await db.query(`UPDATE "Session" SET "revokedAt"=now() WHERE "userId"=$1 AND id<>$2 AND "revokedAt" IS NULL RETURNING id`, [ctx.auth.user.id, ctx.auth.sessionId]);
    await log(ctx, "session.revoked_others", "Session", null, { count: r.length });
    return { sessions: await sessions(ctx.auth) };
  }, { anyRole: true }],

  // Stores the SSO connection. Sign-in through it is not implemented yet (POST /auth/sso answers 501), so it is never enforced.
  ["PUT", "/settings/sso", async (ctx) => {
    requireAdmin(ctx, "configure SSO");
    const { domain, protocol, issuer } = ssoInput(ctx.body);
    const own = normEmail(ctx.auth.user.email).split("@")[1];
    if (domain !== own) fail(400, `Use your own email domain (${own}).`, { field: "o-domain" });
    if (PUBLIC_MAIL.includes(domain)) fail(400, "SSO needs a company domain, not a public email provider.", { field: "o-domain" });
    const taken = await db.one(`SELECT 1 FROM "SsoConnection" WHERE "emailDomain"=$1 AND "merchantId"<>$2`, [domain, ctx.auth.merchantId]);
    if (taken) fail(409, "Another Bizpole Pay account already has SSO set up for this domain.", { field: "o-domain" });
    await db.query(
      `INSERT INTO "SsoConnection" (id,"merchantId","emailDomain",protocol,issuer,"metadataUrl",enforced,enabled,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,false,true,now())
       ON CONFLICT ("merchantId") DO UPDATE SET "emailDomain"=EXCLUDED."emailDomain", protocol=EXCLUDED.protocol, issuer=EXCLUDED.issuer, "metadataUrl"=EXCLUDED."metadataUrl", enforced=false, "updatedAt"=now()`,
      [db.id(), ctx.auth.merchantId, domain, protocol, issuer, protocol === "saml" ? issuer : null]
    );
    await log(ctx, "sso.saved", "SsoConnection", ctx.auth.merchantId, { domain, protocol });
    return { sso: await sso(ctx.auth.merchantId) };
  }],

  // Fetches the provider's discovery document (OIDC) or metadata (SAML) and reports what came back.
  ["POST", "/settings/sso/test", async (ctx) => {
    requireAdmin(ctx, "configure SSO");
    const { protocol, issuer } = ssoInput(ctx.body);
    const url = protocol === "oidc" ? issuer.replace(/\/+$/, "") + "/.well-known/openid-configuration" : issuer;
    try {
      const { res } = await safeFetch(url, { headers: { accept: protocol === "oidc" ? "application/json" : "application/xml" } }, { httpsOnly: true, timeoutMs: 8000 });
      const text = (await res.text()).slice(0, 200000);
      if (!res.ok) return { ok: false, message: `${url} answered HTTP ${res.status}.` };
      if (protocol === "oidc") {
        let j; try { j = JSON.parse(text); } catch { return { ok: false, message: "The discovery URL didn't return JSON." }; }
        if (!j.issuer || !j.authorization_endpoint) return { ok: false, message: "The discovery document has no issuer or authorization endpoint." };
        return { ok: true, message: `Found OpenID configuration for ${j.issuer}.` };
      }
      return /EntityDescriptor/.test(text) ? { ok: true, message: "Found SAML metadata (EntityDescriptor)." } : { ok: false, message: "That URL didn't return SAML metadata." };
    } catch (e) {
      return { ok: false, message: e.name === "TimeoutError" ? "The identity provider didn't respond within 8 seconds." : e.code ? e.message : "Couldn't connect to the identity provider." };
    }
  }],

  ["GET", "/settings/audit", async ({ auth }) => {
    const rows = await db.query(
      `SELECT a.id, a.action, a.entity, a."entityId", a.ip, a.mode, a.meta, a."createdAt", u.name, u.email
         FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."userId" WHERE a."merchantId"=$1 ORDER BY a."createdAt" DESC LIMIT 1000`,
      [auth.merchantId]
    );
    return rows.map((r) => ({ id: r.id, action: r.action, entity: r.entity, entityId: r.entityId, ip: r.ip, mode: r.mode, meta: r.meta, at: r.createdAt, who: r.name || r.email || "System" }));
  }],
];

function ssoInput(b) {
  const domain = normEmail(b.domain), protocol = String(b.protocol || "").toLowerCase().includes("saml") ? "saml" : "oidc", issuer = String(b.issuer || "").trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) fail(400, "Enter a domain like yourcompany.in", { field: "o-domain" });
  if (!/^https:\/\/\S+$/.test(issuer) || issuer.length > 400) fail(400, "Enter the https:// issuer or metadata URL.", { field: "o-issuer" });
  return { domain, protocol, issuer };
}

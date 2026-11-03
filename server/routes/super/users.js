// Super Admin: platform users, their memberships, login sessions and activity. Read-only.
const db = require("../../db");
const { fail } = require("../../http");
const { paging, dateRange, where, enumList, orderBy, like, text, pageOut } = require("../../platform");

const MEMBER_ROLES = ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT", "VIEWER"];
const USER_STATUS = ["ACTIVE", "LOCKED", "DISABLED"];

async function list(ctx) {
  const q = ctx.query, p = paging(q), r = dateRange(q, "all");
  // role: SUPER_ADMIN (platform), ORG_ADMIN (OWNER or ADMIN of any org), or one MemberRole.
  const role = q.role ? String(q.role).toUpperCase() : null;
  if (role && !["SUPER_ADMIN", "ORG_ADMIN", ...MEMBER_ROLES].includes(role)) fail(400, "Unknown role.");
  const memberRoles = role === "ORG_ADMIN" ? ["OWNER", "ADMIN"] : MEMBER_ROLES.includes(role) ? [role] : null;
  const w = where()
    .add(`u.status = ANY(?::"UserStatus"[])`, enumList(q.status, USER_STATUS, "status"))
    .add(`(u.id = ? OR u.name ILIKE ? OR u.email ILIKE ? OR u.mobile ILIKE ?)`, text(q.q), like(q.q), like(q.q), like(q.q))
    .add(role === "SUPER_ADMIN" ? `u."platformRole" = 'SUPER_ADMIN'` : `true`)
    .add(`EXISTS (SELECT 1 FROM "Membership" x WHERE x."userId" = u.id AND x.role = ANY(?::"MemberRole"[]))`, memberRoles)
    .add(`EXISTS (SELECT 1 FROM "Membership" x WHERE x."userId" = u.id AND x."merchantId" = ?)`, text(q.orgId))
    .add(q.locked === "1" ? `u."lockedUntil" > (now() AT TIME ZONE 'UTC')` : `true`)
    .range(`u."createdAt"`, r);
  const sort = orderBy(q, { createdAt: `u."createdAt"`, lastLoginAt: `u."lastLoginAt"`, name: `u.name`, email: `u.email` }, "createdAt");
  const rows = await db.query(
    `SELECT u.id, u.name, u.email, u.mobile, u.status, u."platformRole", u."failedLogins", u."lockedUntil", u."lastLoginAt", u."createdAt",
            u."emailVerifiedAt" IS NOT NULL AS "emailVerified",
            COALESCE((SELECT json_agg(json_build_object('orgId', m.id, 'org', m."displayName", 'role', x.role) ORDER BY x."createdAt")
                        FROM "Membership" x JOIN "Merchant" m ON m.id = x."merchantId" WHERE x."userId" = u.id), '[]') AS memberships,
            count(*) OVER() AS total
       FROM "User" u ${w.sql} ${sort} LIMIT ${w.next(p.size)} OFFSET ${w.next(p.offset)}`,
    w.params
  );
  return pageOut(rows.map(({ total, ...u }) => u), rows.length ? Number(rows[0].total) : 0, p);
}

async function detail(ctx) {
  const id = ctx.params.id;
  const u = await db.one(
    `SELECT id, name, email, mobile, status, "platformRole", "failedLogins", "lockedUntil", "lastLoginAt", "createdAt", "updatedAt",
            "emailVerifiedAt", "mobileVerifiedAt", "passwordHash" IS NOT NULL AS "hasPassword"
       FROM "User" WHERE id = $1`, [id]);
  if (!u) fail(404, "User not found.");
  const [memberships, sessions, activity] = await Promise.all([
    db.query(`SELECT x.id, x.role, x."createdAt", x."invitedBy", m.id AS "orgId", m."displayName" AS org, m.status AS "orgStatus"
                FROM "Membership" x JOIN "Merchant" m ON m.id = x."merchantId" WHERE x."userId" = $1 ORDER BY x."createdAt"`, [id]),
    // Sessions are the login history: one row per sign-in. The token hash is never selected.
    db.query(`SELECT s.id, s."createdAt", s."expiresAt", s."revokedAt", s.ip, s."userAgent", s.mode, m."displayName" AS org,
                     (s."revokedAt" IS NULL AND s."expiresAt" > (now() AT TIME ZONE 'UTC')) AS active
                FROM "Session" s LEFT JOIN "Merchant" m ON m.id = s."merchantId" WHERE s."userId" = $1 ORDER BY s."createdAt" DESC LIMIT 50`, [id]),
    db.query(`SELECT a.id, a.action, a.entity, a."entityId", a.mode, a.ip, a.meta, a."createdAt", m."displayName" AS org
                FROM "AuditLog" a LEFT JOIN "Merchant" m ON m.id = a."merchantId" WHERE a."userId" = $1 ORDER BY a."createdAt" DESC LIMIT 50`, [id]),
  ]);
  return { ...u, memberships, sessions, activity };
}

module.exports = [
  ["GET", "/super/users", list, { platform: true }],
  ["GET", "/super/users/:id", detail, { platform: true }],
];

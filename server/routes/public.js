// Public (no login) routes used by the landing page.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp, EMAIL, normEmail, normMobile } = require("../auth");

const clip = (v, n) => String(v || "").trim().slice(0, n);

module.exports = [
  // "Book a demo" form. There is no leads table in the frozen schema, so requests are kept in AuditLog.
  ["POST", "/leads", async (ctx) => {
    const b = ctx.body;
    const lead = {
      name: clip(b.name, 120), company: clip(b.company, 160), email: normEmail(b.email), phone: normMobile(b.phone),
      industry: clip(b.industry, 60), volume: clip(b.volume, 60), message: clip(b.message, 2000),
    };
    if (!lead.name || !lead.company) fail(400, "Enter your name and business name.");
    if (!EMAIL.test(lead.email)) fail(400, "Enter a valid work email.");
    if (!lead.phone) fail(400, "Enter a valid 10-digit mobile number.");
    const ip = clientIp(ctx.req);
    const recent = await db.one(
      `SELECT count(*) AS n FROM "AuditLog" WHERE action='lead.demo_requested' AND ip=$1 AND "createdAt" > now() - interval '1 hour'`, [ip]
    );
    if (recent && recent.n >= 5) fail(429, "Too many requests. Try again later.");
    await audit(db, { action: "lead.demo_requested", entity: "Lead", ip, meta: lead });
    return { ok: true };
  }, { public: true }],
];

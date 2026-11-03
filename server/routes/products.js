// Explore products. The catalogue is static config in public/pages/products.js; there is no table
// for access requests, so they (and launch notifications) are recorded as AuditLog rows and the
// page derives "Requested" / "Notify me" state from them.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");

// Product ids from the catalogue that take requests / notifications (mirror of CATALOGUE status).
const REQUESTABLE = ["subs", "intl", "payouts", "split", "priority"];
const NOTIFIABLE = ["offers"];
const VOLUMES = ["Under ₹1 lakh", "₹1–10 lakh", "₹10–50 lakh", "₹50 lakh – ₹2 crore", "Above ₹2 crore"];
const ACTIONS = ["product.access_requested", "product.notify_on", "product.notify_off"];

async function state(merchantId, mode) {
  const rows = await db.query(
    `SELECT action, meta, "createdAt" FROM "AuditLog"
      WHERE "merchantId"=$1 AND mode=$2 AND entity='Product' AND action = ANY($3) ORDER BY "createdAt"`,
    [merchantId, mode, ACTIONS]
  );
  const requests = {}, notify = {};
  for (const r of rows) {
    const m = r.meta || {};
    if (!m.product) continue;
    if (r.action === "product.access_requested") requests[m.product] = { at: r.createdAt, use: m.use || "", volume: m.volume || "" };
    else notify[m.product] = r.action === "product.notify_on";
  }
  return { requests, notify };
}

module.exports = [
  ["GET", "/products", async ({ auth, mode }) => state(auth.merchantId, mode)],

  ["POST", "/products/:id/request", async (ctx) => {
    const { auth, mode, body, params } = ctx;
    if (!REQUESTABLE.includes(params.id)) fail(400, "This product doesn't take access requests.");
    const use = String(body.use || "").trim().slice(0, 500), volume = String(body.volume || "");
    if (use.length < 10) fail(400, "Describe your use case in at least 10 characters.");
    if (!VOLUMES.includes(volume)) fail(400, "Choose your expected monthly volume.");
    const cur = await state(auth.merchantId, mode);
    if (cur.requests[params.id]) fail(409, "You've already requested access to this product.");
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "product.access_requested", entity: "Product", entityId: params.id,
      ip: clientIp(ctx.req), meta: { product: params.id, use, volume, email: auth.user.email } });
    return state(auth.merchantId, mode);
  }],

  ["POST", "/products/:id/notify", async (ctx) => {
    const { auth, mode, body, params } = ctx;
    if (!NOTIFIABLE.includes(params.id)) fail(400, "Launch notifications aren't available for this product.");
    const on = body.on !== false;
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: on ? "product.notify_on" : "product.notify_off", entity: "Product", entityId: params.id,
      ip: clientIp(ctx.req), meta: { product: params.id, email: auth.user.email } });
    return state(auth.merchantId, mode);
  }],
];

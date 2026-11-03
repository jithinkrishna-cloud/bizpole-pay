// Checkout branding, one "CheckoutTheme" row per (merchant, mode).
// Stored: displayName, primaryColor, methodOrder (methods shown, in order) and the logo.
// No object storage is configured, so the logo is kept inline in logoData as a small data: URL
// (the browser downscales it to ≤256px before upload); logoKey stays unused until storage exists.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");

const METHODS = ["CREDIT_CARD", "DEBIT_CARD", "NET_BANKING", "UPI", "WALLET", "EMI", "CARDLESS_EMI", "BNPL", "QR", "NEFT_RTGS", "REWARDS", "OTHER"];
const HEX = /^#[0-9a-f]{6}$/i;
const LOGO_MAX_BYTES = 300 * 1024;
const LOGO_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
// File signatures, so the declared type matches the actual bytes.
const MAGIC = {
  png: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47,
  jpeg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

// saved = branding was saved via PUT /checkout (which requires a display name). A row created only by a
// logo upload has no name or method order yet, so the page keeps showing its defaults for those.
const shape = (t) => t && t.displayName
  ? { saved: true, displayName: t.displayName, primaryColor: t.primaryColor, methodOrder: t.methodOrder || [], logo: t.logoData || null, updatedAt: t.updatedAt }
  : { saved: false, displayName: null, primaryColor: null, methodOrder: [], logo: (t && t.logoData) || null, updatedAt: null };

const get = (merchantId, mode) =>
  db.one(`SELECT "displayName", "primaryColor", "methodOrder"::text[] AS "methodOrder", "logoData", "updatedAt"
            FROM "CheckoutTheme" WHERE "merchantId"=$1 AND mode=$2`, [merchantId, mode]);

// Validate an uploaded logo → the data: URL to store.
function parseLogo(v) {
  const m = LOGO_URL.exec(String(v || ""));
  if (!m) fail(400, "Upload a PNG, JPG or WebP image.");
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || !MAGIC[m[1]](bytes)) fail(400, "That file isn't a valid image. Try another PNG, JPG or WebP.");
  if (bytes.length > LOGO_MAX_BYTES) fail(400, "Logo is too large. Use an image under 300 KB.");
  return { url: m[0], type: m[1], bytes: bytes.length };
}

module.exports = [
  ["GET", "/checkout", async ({ auth, mode }) => shape(await get(auth.merchantId, mode))],

  // Logo saves on its own (immediately on upload), without touching the other unsaved edits.
  ["PUT", "/checkout/logo", async (ctx) => {
    const { auth, mode, body } = ctx;
    const logo = parseLogo(body.logo);
    await db.query(
      `INSERT INTO "CheckoutTheme" (id,"merchantId",mode,"logoData","updatedAt") VALUES ($1,$2,$3,$4,now())
       ON CONFLICT ("merchantId",mode) DO UPDATE SET "logoData"=EXCLUDED."logoData", "updatedAt"=now()`,
      [db.id(), auth.merchantId, mode, logo.url]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "checkout.logo_uploaded", entity: "CheckoutTheme",
      ip: clientIp(ctx.req), meta: { type: logo.type, bytes: logo.bytes } });
    return shape(await get(auth.merchantId, mode));
  }],

  ["DELETE", "/checkout/logo", async (ctx) => {
    const { auth, mode } = ctx;
    await db.query(`UPDATE "CheckoutTheme" SET "logoData"=NULL, "updatedAt"=now() WHERE "merchantId"=$1 AND mode=$2`, [auth.merchantId, mode]);
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "checkout.logo_removed", entity: "CheckoutTheme", ip: clientIp(ctx.req) });
    return shape(await get(auth.merchantId, mode));
  }],

  ["PUT", "/checkout", async (ctx) => {
    const { auth, mode, body } = ctx;
    const name = String(body.displayName || "").trim();
    if (!name) fail(400, "Add a display name before saving.");
    if (name.length > 40) fail(400, "Display name is too long (40 characters max).");
    const color = String(body.primaryColor || "").trim().toLowerCase();
    if (!HEX.test(color)) fail(400, "Enter a colour as #RRGGBB.");
    const order = Array.isArray(body.methodOrder) ? body.methodOrder.map(String) : null;
    if (!order || !order.length) fail(400, "Keep at least one payment method on.");
    if (order.some((m) => !METHODS.includes(m)) || new Set(order).size !== order.length) fail(400, "Unknown or repeated payment method.");

    await db.query(
      `INSERT INTO "CheckoutTheme" (id,"merchantId",mode,"displayName","primaryColor","methodOrder","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6::"PaymentMethod"[],now())
       ON CONFLICT ("merchantId",mode) DO UPDATE SET "displayName"=EXCLUDED."displayName", "primaryColor"=EXCLUDED."primaryColor",
         "methodOrder"=EXCLUDED."methodOrder", "updatedAt"=now()`,
      [db.id(), auth.merchantId, mode, name, color, order]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "checkout.theme_saved", entity: "CheckoutTheme",
      ip: clientIp(ctx.req), meta: { displayName: name, primaryColor: color, methodOrder: order } });
    return shape(await get(auth.merchantId, mode));
  }],
];

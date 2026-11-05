// Split & transfer: child merchants (partners) and per-payment split allocations.
// Child merchants are linked here; PayU confirms their onboarding. Releasing held splits needs PayU's
// release-settlement call, which is not connected yet, so release fails clearly instead of flipping statuses.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { methodLabel, num } = require("../shape");
const payu = require("../payu");

async function partners(merchantId, mode) {
  const rows = await db.query(
    `SELECT id, name, "childMid", "childMerchantKey", "productAccountUuid", "onboardingStatus", active, "createdAt"
       FROM "ChildMerchant" WHERE "merchantId"=$1 AND mode=$2 ORDER BY "createdAt" DESC`,
    [merchantId, mode]
  );
  return rows.map((p) => ({ ...p, childMid: num(p.childMid) }));
}

async function allocations(merchantId, mode) {
  const rows = await db.query(
    `SELECT a.id, a."childMerchantId", a."splitType", a."aggregatorSubTxnId", a."amountPaise", a."chargesPaise", a.status, a."payuStatus",
            a."releasedAt", a."releaseStatus", a."createdAt",
            t.txnid, t.mihpayid, t."amountPaise" AS "txnAmount", t.method, t."createdAt" AS "txnDate", cu.name AS "custName"
       FROM "SplitAllocation" a JOIN "Transaction" t ON t.id = a."transactionId"
       JOIN "Order" o ON o.id = t."orderId" LEFT JOIN "Customer" cu ON cu.id = o."customerId"
      WHERE a."merchantId"=$1 AND a.mode=$2 ORDER BY a."createdAt" DESC LIMIT 5000`,
    [merchantId, mode]
  );
  return rows.map((a) => ({
    id: a.id, partnerId: a.childMerchantId, splitType: a.splitType, aggregatorSubTxnId: a.aggregatorSubTxnId, amount: num(a.amountPaise),
    charges: num(a.chargesPaise), status: a.status, payuStatus: a.payuStatus, releasedAt: a.releasedAt, releaseStatus: a.releaseStatus, date: a.createdAt,
    txnid: a.txnid, txn: { amount: num(a.txnAmount), mihpayid: a.mihpayid || "—", mode: methodLabel(a.method), name: a.custName || "—", date: a.txnDate },
  }));
}

module.exports = [
  ["GET", "/split", async ({ auth, mode }) => {
    const [ps, al] = await Promise.all([partners(auth.merchantId, mode), allocations(auth.merchantId, mode)]);
    return { partners: ps, allocations: al };
  }],

  // Link a child merchant that already exists under the merchant's PayU aggregator account.
  // Onboarding status stays empty until PayU reports it.
  ["POST", "/split/partners", async (ctx) => {
    const { auth, mode, body } = ctx;
    const name = String(body.name || "").trim().slice(0, 80);
    const mid = String(body.childMid || "").trim(), key = String(body.childMerchantKey || "").trim();
    if (name.length < 2) fail(400, "Enter the partner name.");
    if (!/^\d{6,10}$/.test(mid)) fail(400, "Child MID must be 6–10 digits.");
    if (!/^[A-Za-z0-9]{6,32}$/.test(key)) fail(400, "Child merchant key must be 6–32 letters or digits.");
    const dupMid = await db.one(`SELECT 1 FROM "ChildMerchant" WHERE "merchantId"=$1 AND mode=$2 AND "childMid"=$3`, [auth.merchantId, mode, Number(mid)]);
    if (dupMid) fail(409, "This child MID is already linked.");
    const dupKey = await db.one(`SELECT 1 FROM "ChildMerchant" WHERE mode=$1 AND "childMerchantKey"=$2`, [mode, key]);
    if (dupKey) fail(409, "This merchant key is already linked to a partner.");
    const id = db.id();
    await db.query(
      `INSERT INTO "ChildMerchant" (id,"merchantId",mode,name,"childMid","childMerchantKey",active,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,true,now())`,
      [id, auth.merchantId, mode, name, Number(mid), key]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "split.partner_linked", entity: "ChildMerchant", entityId: id, ip: clientIp(ctx.req), meta: { childMid: Number(mid) } });
    return (await partners(auth.merchantId, mode)).find((p) => p.id === id);
  }],

  // Pause / resume splits to a partner (our own switch; new splits are not created for a paused partner).
  ["PATCH", "/split/partners/:id", async (ctx) => {
    const { auth, mode, params, body } = ctx;
    if (typeof body.active !== "boolean") fail(400, "Send active: true or false.");
    const row = await db.one(
      `UPDATE "ChildMerchant" SET active=$4, "updatedAt"=now() WHERE id=$1 AND "merchantId"=$2 AND mode=$3 RETURNING id`,
      [params.id, auth.merchantId, mode, body.active]
    );
    if (!row) fail(404, "Partner not found.");
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: body.active ? "split.partner_resumed" : "split.partner_paused", entity: "ChildMerchant", entityId: row.id, ip: clientIp(ctx.req) });
    return (await partners(auth.merchantId, mode)).find((p) => p.id === row.id);
  }],

  // Release held (CREATED) splits. Needs PayU's release-settlement API, which is not connected yet.
  ["POST", "/split/release", async ({ auth, mode, body }) => {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
    if (!ids.length) fail(400, "Choose the held splits to release.");
    const held = await db.query(
      `SELECT id FROM "SplitAllocation" WHERE "merchantId"=$1 AND mode=$2 AND id = ANY($3) AND status='CREATED'`,
      [auth.merchantId, mode, ids]
    );
    if (!held.length) fail(409, "Nothing held to release.");
    await payu.requireCredential(auth.merchantId, mode);
    fail(501, "Releasing split settlements isn't connected yet. The splits stay held; nothing was released.");
  }],
];

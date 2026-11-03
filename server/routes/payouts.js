// Payouts: beneficiaries, single and bulk payouts. Rows are stored here first (QUEUED / unverified);
// the PayU Payouts API (beneficiary validation, transfers, wallet balance) is not connected yet, so nothing
// is reported as sent, verified or credited until a real provider response says so.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { encrypt, decrypt } = require("../secrets");
const { num } = require("../shape");

const XMODES = ["IMPS", "NEFT", "RTGS", "UPI"];
// Per-mode amount limits in paise [min, max] (bank/NPCI rules: RTGS ≥ ₹2,00,000; IMPS ≤ ₹5,00,000; UPI ≤ ₹1,00,000).
const LIMIT = { IMPS: [100, 50000000], NEFT: [100, 1000000000], RTGS: [20000000, 1000000000], UPI: [100, 10000000] };
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/, VPA = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/, REF = /^[A-Za-z0-9_-]{1,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, MOBILE = /^[6-9]\d{9}$/;

async function beneficiaries(merchantId, mode) {
  const rows = await db.query(
    `SELECT b.id, b.name, b.email, b.mobile, b."accountLast4", b.ifsc, b.vpa, b."payuBeneficiaryId", b.verified, b."createdAt",
            COALESCE((SELECT SUM(p."amountPaise") FROM "Payout" p WHERE p."beneficiaryId"=b.id AND p.status='SUCCESS'), 0) AS paid,
            (SELECT COUNT(*) FROM "Payout" p WHERE p."beneficiaryId"=b.id AND p.status='SUCCESS') AS "paidCount"
       FROM "Beneficiary" b WHERE b."merchantId"=$1 AND b.mode=$2 ORDER BY b."createdAt" DESC`,
    [merchantId, mode]
  );
  return rows.map((b) => ({
    id: b.id, name: b.name, email: b.email || "", mobile: b.mobile || "", accountLast4: b.accountLast4, ifsc: b.ifsc, vpa: b.vpa,
    payuBeneficiaryId: b.payuBeneficiaryId, verified: b.verified, createdAt: b.createdAt, paid: num(b.paid), paidCount: num(b.paidCount),
  }));
}

async function payouts(merchantId, mode) {
  const rows = await db.query(
    `SELECT p.id, p."merchantRefId", p."batchId", p."beneficiaryId", p."amountPaise", p."transferMode", p.purpose, p.status, p."payuStatus",
            p."payuRefId", p."bankRefNo", p."feePaise", p."taxPaise", p."failureReason", p."createdAt", p."updatedAt", u.name AS "createdByName"
       FROM "Payout" p LEFT JOIN "User" u ON u.id = p."createdBy"
      WHERE p."merchantId"=$1 AND p.mode=$2 ORDER BY p."createdAt" DESC LIMIT 5000`,
    [merchantId, mode]
  );
  return rows.map((p) => ({
    id: p.id, merchantRefId: p.merchantRefId, batchId: p.batchId, beneficiaryId: p.beneficiaryId, amount: num(p.amountPaise), mode: p.transferMode,
    purpose: p.purpose || "", status: p.status, payuStatus: p.payuStatus, payuRefId: p.payuRefId, utr: p.bankRefNo || "", fee: num(p.feePaise), tax: num(p.taxPaise),
    failureReason: p.failureReason || "", date: p.createdAt, updatedAt: p.updatedAt, createdBy: p.createdByName || "",
  }));
}

// Bulk uploads have no table of their own; a batch is the set of payouts that share a batchId.
function batches(list) {
  const by = new Map();
  list.filter((p) => p.batchId).forEach((p) => {
    const b = by.get(p.batchId) || { id: p.batchId, rows: 0, amount: 0, at: p.date, statuses: {} };
    b.rows++; b.amount += p.amount; b.statuses[p.status] = (b.statuses[p.status] || 0) + 1;
    if (p.date < b.at) b.at = p.date;
    by.set(p.batchId, b);
  });
  return [...by.values()].sort((a, b) => b.at - a.at);
}

// Validates one payout request against the merchant's beneficiaries. `taken` holds references used earlier in the same request.
async function check(c, merchantId, mode, v, taken) {
  const ref = String(v.ref || "").trim();
  if (!REF.test(ref)) return { error: "Reference must be 1–40 letters, digits, - or _" };
  if (taken.has(ref.toLowerCase())) return { error: "Reference already used in this file" };
  const dup = await c.one(`SELECT 1 FROM "Payout" WHERE "merchantId"=$1 AND mode=$2 AND lower("merchantRefId")=lower($3)`, [merchantId, mode, ref]);
  if (dup) return { error: "Reference already used" };
  const bid = String(v.beneficiaryId || "").trim();
  if (!bid) return { error: "Beneficiary not found" };
  const bene = await c.one(
    `SELECT id, name, ifsc, vpa FROM "Beneficiary" WHERE "merchantId"=$1 AND mode=$2 AND (id=$3 OR "payuBeneficiaryId"=$3) LIMIT 1`,
    [merchantId, mode, bid]
  );
  if (!bene) return { error: "Beneficiary not found" };
  const xmode = String(v.mode || "").toUpperCase();
  if (!XMODES.includes(xmode)) return { error: "Mode must be IMPS, NEFT, RTGS or UPI" };
  if (xmode === "UPI" && !bene.vpa) return { error: "UPI needs a beneficiary with a VPA" };
  if (xmode !== "UPI" && !bene.ifsc) return { error: `${xmode} needs a bank account; this beneficiary has only a VPA` };
  const amount = Math.round(Number(v.amount));
  if (!Number.isInteger(amount) || amount < 100) return { error: "Amount must be at least ₹1.00" };
  if (xmode === "RTGS" && amount < LIMIT.RTGS[0]) return { error: "RTGS needs at least ₹2,00,000" };
  if (amount > LIMIT[xmode][1]) return { error: `${xmode} allows at most ₹${(LIMIT[xmode][1] / 100).toLocaleString("en-IN")}` };
  const purpose = String(v.purpose || "").trim().slice(0, 60) || "Vendor payment";
  return { row: { ref, bene, amount, mode: xmode, purpose } };
}

async function insertPayout(c, merchantId, mode, userId, r, batchId) {
  const id = db.id();
  await c.q(
    `INSERT INTO "Payout" (id,"merchantId",mode,"beneficiaryId","merchantRefId","batchId","amountPaise","transferMode",purpose,status,"createdBy","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'QUEUED',$10,now())`,
    [id, merchantId, mode, r.bene.id, r.ref, batchId, r.amount, r.mode, r.purpose, userId]
  );
  return id;
}

module.exports = [
  ["GET", "/payouts", async ({ auth, mode }) => {
    const [benes, list] = await Promise.all([beneficiaries(auth.merchantId, mode), payouts(auth.merchantId, mode)]);
    // No payout wallet is connected, so there is no balance to report.
    return { beneficiaries: benes, payouts: list, batches: batches(list), balance: null };
  }],

  ["POST", "/payouts/beneficiaries", async (ctx) => {
    const { auth, mode, body } = ctx;
    const type = body.type === "vpa" ? "vpa" : "bank";
    const name = String(body.name || "").trim().slice(0, 100);
    const email = String(body.email || "").trim(), mobile = String(body.mobile || "").trim();
    if (name.length < 2) fail(400, "Enter the beneficiary name.");
    let acc = null, ifsc = null, vpa = null;
    if (type === "bank") {
      acc = String(body.accountNumber || "").replace(/\s/g, "");
      ifsc = String(body.ifsc || "").trim().toUpperCase();
      if (!/^\d{9,18}$/.test(acc)) fail(400, "Account number must be 9–18 digits.");
      if (!IFSC.test(ifsc)) fail(400, "IFSC must look like ABCD0123456: 4 letters, a zero, then 6 letters or digits.");
    } else {
      vpa = String(body.vpa || "").trim();
      if (!VPA.test(vpa)) fail(400, "Enter a valid UPI ID, like name@bank.");
    }
    if (email && !EMAIL.test(email)) fail(400, "Enter a valid email or leave it blank.");
    if (mobile && !MOBILE.test(mobile)) fail(400, "Mobile must be 10 digits starting with 6–9.");

    // Same IFSC + last 4 narrows the candidates; the full (decrypted) account number decides.
    const dup = type === "bank"
      ? (await db.query(`SELECT "accountNumberEnc" FROM "Beneficiary" WHERE "merchantId"=$1 AND mode=$2 AND ifsc=$3 AND "accountLast4"=$4 AND "accountNumberEnc" IS NOT NULL`, [auth.merchantId, mode, ifsc, acc.slice(-4)]))
          .some((r) => { try { return decrypt(r.accountNumberEnc) === acc; } catch { return false; } })
      : await db.one(`SELECT 1 FROM "Beneficiary" WHERE "merchantId"=$1 AND mode=$2 AND lower(vpa)=lower($3)`, [auth.merchantId, mode, vpa]);
    if (dup) fail(409, type === "bank" ? "This account is already a beneficiary." : "This UPI ID is already a beneficiary.");

    const id = db.id();
    await db.query(
      `INSERT INTO "Beneficiary" (id,"merchantId",mode,name,email,mobile,"accountNumberEnc","accountLast4",ifsc,vpa,verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)`,
      [id, auth.merchantId, mode, name, email || null, mobile || null, acc ? encrypt(acc) : null, acc ? acc.slice(-4) : null, ifsc, vpa]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "beneficiary.created", entity: "Beneficiary", entityId: id, ip: clientIp(ctx.req), meta: { type } });
    return (await beneficiaries(auth.merchantId, mode)).find((b) => b.id === id);
  }],

  // Penny-drop / VPA validation runs through the PayU Payouts API, which this account is not connected to.
  ["POST", "/payouts/beneficiaries/:id/verify", async ({ auth, mode, params }) => {
    const b = await db.one(`SELECT id, verified FROM "Beneficiary" WHERE id=$1 AND "merchantId"=$2 AND mode=$3`, [params.id, auth.merchantId, mode]);
    if (!b) fail(404, "Beneficiary not found.");
    if (b.verified) fail(409, "This beneficiary is already verified.");
    fail(501, "Beneficiary verification needs the PayU Payouts API, which isn't connected to this account yet. The beneficiary stays unverified.");
  }],

  ["POST", "/payouts", async (ctx) => {
    const { auth, mode, body } = ctx;
    const out = await db.tx(async (c) => {
      const r = await check(c, auth.merchantId, mode, body, new Set());
      if (r.error) fail(400, r.error);
      const id = await insertPayout(c, auth.merchantId, mode, auth.user.id, r.row, null);
      await audit(c, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "payout.queued", entity: "Payout", entityId: id, ip: clientIp(ctx.req), meta: { amount: r.row.amount, transferMode: r.row.mode } });
      return id;
    });
    return (await payouts(auth.merchantId, mode)).find((p) => p.id === out);
  }],

  // Bulk: every row is validated; valid rows are queued together under one batchId, invalid rows are returned with their errors.
  ["POST", "/payouts/bulk", async (ctx) => {
    const { auth, mode, body } = ctx;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) fail(400, "The file has no payout rows.");
    if (rows.length > 1000) fail(400, "A file can have at most 1,000 rows.");
    const dryRun = !!body.dryRun;
    const res = await db.tx(async (c) => {
      const taken = new Set(), results = [], ok = [];
      for (const [i, v] of rows.entries()) {
        const r = await check(c, auth.merchantId, mode, v, taken);
        if (r.row) { taken.add(r.row.ref.toLowerCase()); ok.push(r.row); }
        results.push({ line: Number(v.line) || i + 2, ref: String(v.ref || ""), beneficiaryId: String(v.beneficiaryId || ""), name: r.row ? r.row.bene.name : null,
          amount: Math.round(Number(v.amount)) || 0, mode: String(v.mode || "").toUpperCase(), error: r.error || "" });
      }
      if (dryRun || !ok.length) return { results, batchId: null, queued: 0 };
      const batchId = ("BP" + Date.now().toString(36)).toUpperCase();
      for (const r of ok) await insertPayout(c, auth.merchantId, mode, auth.user.id, r, batchId);
      await audit(c, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "payout.bulk_queued", entity: "Payout", entityId: batchId, ip: clientIp(ctx.req),
        meta: { file: String(body.file || "").slice(0, 120), rows: rows.length, queued: ok.length } });
      return { results, batchId, queued: ok.length };
    });
    return res;
  }],
];


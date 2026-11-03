// Transactions, refunds and settlements: the core data most dashboard pages read.
const crypto = require("node:crypto");
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { methodLabel, txnStatus, num } = require("../shape");
const payu = require("../payu");

async function transactions(merchantId, mode) {
  const rows = await db.query(
    `SELECT t.id, t.txnid, t.mihpayid, t."amountPaise", t.status, t.method, t.bankcode, t."errorMessage", t."createdAt",
            o."productInfo", cu.name AS "custName", cu.email AS "custEmail", cu.phone AS "custPhone",
            COALESCE((SELECT SUM(r."amountPaise") FROM "Refund" r WHERE r."transactionId"=t.id AND r.status <> 'FAILED'), 0) AS refunded
       FROM "Transaction" t JOIN "Order" o ON o.id = t."orderId"
       LEFT JOIN "Customer" cu ON cu.id = o."customerId"
      WHERE t."merchantId"=$1 AND t.mode=$2 AND NOT t."isMandateRegistration"
      ORDER BY t."createdAt" DESC LIMIT 5000`,
    [merchantId, mode]
  );
  return rows.map((t) => ({
    id: t.id, txnid: t.txnid, mihpayid: t.mihpayid || "—", amount: num(t.amountPaise), status: txnStatus(t.status),
    mode: methodLabel(t.method), bank: t.bankcode || "—", name: t.custName || "—", email: t.custEmail || "", phone: t.custPhone || "",
    product: t.productInfo, date: t.createdAt, refunded: num(t.refunded), error: t.errorMessage || "",
  }));
}

async function refunds(merchantId, mode) {
  const rows = await db.query(
    `SELECT r.id, r."payuRequestId", r."amountPaise", r.reason, r.status, r."bankArn", r."createdAt",
            t.txnid, t.method, t."amountPaise" AS captured, cu.name AS "custName"
       FROM "Refund" r JOIN "Transaction" t ON t.id = r."transactionId" JOIN "Order" o ON o.id = t."orderId"
       LEFT JOIN "Customer" cu ON cu.id = o."customerId"
      WHERE r."merchantId"=$1 AND r.mode=$2 ORDER BY r."createdAt" DESC LIMIT 5000`,
    [merchantId, mode]
  );
  return rows.map((r) => ({
    id: r.id, txnid: r.txnid, name: r.custName || "—", mode: methodLabel(r.method), amount: num(r.amountPaise), captured: num(r.captured),
    status: r.status, reason: r.reason || "", requestId: r.payuRequestId || "—", arn: r.bankArn || "—", date: r.createdAt,
  }));
}

async function settlements(merchantId, mode) {
  const rows = await db.query(
    `SELECT s.id, s."payuSettlementId", s.utr, s."transactionAmtPaise", s."refundAmtPaise", s."chargebackAmtPaise",
            s."serviceFeePaise", s."serviceTaxPaise", s."netAmountPaise", s.status, s."completedAt", s."fetchedAt",
            COALESCE(array_agg(l."merchantTransactionId") FILTER (WHERE l.action='CAPTURE' AND l."merchantTransactionId" IS NOT NULL), '{}') AS txnids
       FROM "Settlement" s LEFT JOIN "SettlementLine" l ON l."settlementId" = s.id
      WHERE s."merchantId"=$1 AND s.mode=$2
      GROUP BY s.id ORDER BY COALESCE(s."completedAt", s."fetchedAt") DESC`,
    [merchantId, mode]
  );
  return rows.map((s) => ({
    id: s.payuSettlementId, dbId: s.id, utr: s.utr || "—", gross: num(s.transactionAmtPaise), fee: num(s.serviceFeePaise),
    tax: num(s.serviceTaxPaise), ref: num(s.refundAmtPaise), chargebacks: num(s.chargebackAmtPaise), carriedIn: 0, carriedOut: 0,
    net: num(s.netAmountPaise), date: s.completedAt || s.fetchedAt, status: s.status, count: s.txnids.length, txnids: s.txnids,
  }));
}

// One transaction with its status history (TransactionEvent), refunds and the settlement that paid it out.
async function transactionDetail(merchantId, mode, txnid) {
  const t = await db.one(
    `SELECT t.id, t.txnid, t.mihpayid, t."amountPaise", t.status, t."payuStatus", t."unmappedStatus", t.method, t."payuMode", t.bankcode,
            t."pgType", t."bankRefNum", t."errorCode", t."errorMessage", t."cardMasked", t."vpaMasked", t."netAmountDebitPaise",
            t."additionalChargesPaise", t."discountPaise", t."completedAt", t."verifiedAt", t."createdAt", t."updatedAt",
            o.id AS "orderId", o.receipt, o."productInfo", o."createdAt" AS "orderCreatedAt", o."paymentLinkId",
            cu.name AS "custName", cu.email AS "custEmail", cu.phone AS "custPhone"
       FROM "Transaction" t JOIN "Order" o ON o.id = t."orderId"
       LEFT JOIN "Customer" cu ON cu.id = o."customerId"
      WHERE t."merchantId"=$1 AND t.mode=$2 AND t.txnid=$3`,
    [merchantId, mode, txnid]
  );
  if (!t) fail(404, "Transaction not found.");
  const [events, rf, st] = await Promise.all([
    db.query(
      `SELECT "fromStatus", "toStatus", "payuStatus", "unmappedStatus", note, "createdAt"
         FROM "TransactionEvent" WHERE "transactionId"=$1 ORDER BY "createdAt", id`,
      [t.id]
    ),
    db.query(
      `SELECT id, "amountPaise", status, reason, "payuRequestId", "bankArn", "createdAt", "updatedAt"
         FROM "Refund" WHERE "transactionId"=$1 AND "merchantId"=$2 AND mode=$3 ORDER BY "createdAt"`,
      [t.id, merchantId, mode]
    ),
    db.query(
      `SELECT s.id, s."payuSettlementId", s.utr, s.status, COALESCE(s."completedAt", s."fetchedAt") AS date,
              l."grossPaise", l."feePaise", l."taxPaise", l."netPaise"
         FROM "SettlementLine" l JOIN "Settlement" s ON s.id = l."settlementId"
        WHERE l."transactionId"=$1 AND l."merchantId"=$2 AND l.mode=$3 AND l.action='CAPTURE'
        ORDER BY date`,
      [t.id, merchantId, mode]
    ),
  ]);
  return {
    txnid: t.txnid, mihpayid: t.mihpayid || "—", amount: num(t.amountPaise), status: txnStatus(t.status),
    payuStatus: t.payuStatus, unmappedStatus: t.unmappedStatus, mode: methodLabel(t.method), payuMode: t.payuMode, bank: t.bankcode || "—",
    pgType: t.pgType, bankRefNum: t.bankRefNum, errorCode: t.errorCode, error: t.errorMessage || "", card: t.cardMasked, vpa: t.vpaMasked,
    netDebit: num(t.netAmountDebitPaise), charges: num(t.additionalChargesPaise), discount: num(t.discountPaise),
    completedAt: t.completedAt, verifiedAt: t.verifiedAt, date: t.createdAt, updatedAt: t.updatedAt,
    order: { id: t.orderId, receipt: t.receipt, product: t.productInfo, createdAt: t.orderCreatedAt, viaLink: !!t.paymentLinkId },
    customer: { name: t.custName || "—", email: t.custEmail || "", phone: t.custPhone || "" },
    events: events.map((e) => ({
      from: e.fromStatus ? txnStatus(e.fromStatus) : null, to: txnStatus(e.toStatus), payuStatus: e.payuStatus, unmappedStatus: e.unmappedStatus,
      note: e.note || "", date: e.createdAt,
    })),
    refunds: rf.map((r) => ({ id: r.id, amount: num(r.amountPaise), status: r.status, reason: r.reason || "", requestId: r.payuRequestId || "—", arn: r.bankArn || "—", date: r.createdAt, updatedAt: r.updatedAt })),
    settlements: st.map((s) => ({ dbId: s.id, id: s.payuSettlementId, utr: s.utr || "—", status: s.status, date: s.date, gross: num(s.grossPaise), fee: num(s.feePaise), tax: num(s.taxPaise), net: num(s.netPaise) })),
  };
}

// The bank account settlements are paid to (primary first, never a retired one).
async function settlementAccount(merchantId) {
  const b = await db.one(
    `SELECT "accountHolder", "accountLast4", ifsc, "bankName", "pennyDropVerified" FROM "BankAccount"
      WHERE "merchantId"=$1 AND "retiredAt" IS NULL ORDER BY "isPrimary" DESC, "createdAt" DESC LIMIT 1`,
    [merchantId]
  );
  return b ? { holder: b.accountHolder, last4: b.accountLast4, ifsc: b.ifsc, bankName: b.bankName || null, verified: b.pennyDropVerified } : null;
}

// PayU settlement lines carry a raw mode (CC, DC, NB, UPI, CASH, ...). Prefer our own transaction's method.
const PAYU_MODE_LABEL = { CC: "Credit Card", DC: "Debit Card", NB: "Net Banking", UPI: "UPI", CASH: "Wallet", EMI: "EMI", BNPL: "BNPL", QR: "QR", NEFT: "NEFT/RTGS" };
const lineMode = (method, payuMode) => (method ? methodLabel(method) : PAYU_MODE_LABEL[String(payuMode || "").toUpperCase()] || payuMode || "Other");


module.exports = [
  ["GET", "/payments", async ({ auth, mode }) => {
    const [txns, rf, st] = await Promise.all([transactions(auth.merchantId, mode), refunds(auth.merchantId, mode), settlements(auth.merchantId, mode)]);
    return { txns, refunds: rf, settlements: st };
  }],

  // Full or partial refund. Recorded first (REQUESTED), then sent to PayU when credentials exist.
  ["POST", "/refunds", async (ctx) => {
    const { auth, mode, body } = ctx;
    const amount = Math.round(Number(body.amount));
    if (!Number.isInteger(amount) || amount <= 0) fail(400, "Enter a refund amount.");
    const t = await db.one(
      `SELECT t.id, t.mihpayid, t.status, t."amountPaise", t."credentialId",
              COALESCE((SELECT SUM("amountPaise") FROM "Refund" WHERE "transactionId"=t.id AND status <> 'FAILED'), 0) AS refunded
         FROM "Transaction" t WHERE t."merchantId"=$1 AND t.mode=$2 AND t.txnid=$3`,
      [auth.merchantId, mode, String(body.txnid || "")]
    );
    if (!t) fail(404, "Transaction not found.");
    if (t.status !== "SUCCESS") fail(409, "Only successful payments can be refunded.");
    if (amount > t.amountPaise - t.refunded) fail(400, "Amount is more than the refundable balance.");

    const id = db.id(), tokenStr = ("RF" + Date.now().toString(36) + crypto.randomBytes(6).toString("hex")).slice(0, 23);
    await db.query(
      `INSERT INTO "Refund" (id,"merchantId",mode,"transactionId",token,"amountPaise",reason,status,"requestedBy","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'REQUESTED',$8,now())`,
      [id, auth.merchantId, mode, t.id, tokenStr, amount, String(body.reason || "").slice(0, 200) || null, auth.user.id]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "refund.requested", entity: "Refund", entityId: id, ip: clientIp(ctx.req), meta: { amount } });

    // Send to PayU: cancel_refund_transaction(var1=mihpayid, var2=token, var3=amount in rupees)
    const cred = await db.one(`SELECT id, "merchantKey", "saltEnc" FROM "PayuCredential" WHERE id=$1 AND status='ACTIVE'`, [t.credentialId]);
    if (cred && t.mihpayid) {
      try {
        const r = await payu.postservice(cred, mode, "cancel_refund_transaction", { var1: t.mihpayid, var2: tokenStr, var3: (amount / 100).toFixed(2) });
        const ok = String(r.status) === "1";
        await db.query(
          `UPDATE "Refund" SET status=$2, "payuRequestId"=$3, "payuStatus"=$4, "errorCode"=$5, "updatedAt"=now() WHERE id=$1`,
          [id, ok ? "QUEUED" : "FAILED", r.request_id || null, String(r.status ?? ""), ok ? null : String(r.error_code || r.msg || "").slice(0, 200)]
        );
      } catch (e) {
        console.error("[refund] PayU call failed", e.message); // stays REQUESTED; reconciliation retries
      }
    }
    return (await refunds(auth.merchantId, mode)).find((r) => r.id === id);
  }, { roles: ["OWNER", "ADMIN", "FINANCE"] }], // docs/MODULES.md: Developer, Support and Viewer cannot refund

  // Detail drawer: payment fields, TransactionEvent timeline, refunds and settlement.
  ["GET", "/transactions/:txnid", async ({ auth, mode, params }) => transactionDetail(auth.merchantId, mode, params.txnid)],

  // Settlements page extras: payout bank account and fees per payment mode from settlement lines (last 7 days).
  ["GET", "/settlement-info", async ({ auth, mode }) => {
    const [account, fees] = await Promise.all([
      settlementAccount(auth.merchantId),
      db.query(
        `SELECT t.method, l."payuMode", COUNT(*)::int AS n, SUM(l."grossPaise") AS gross, SUM(l."feePaise") AS fee, SUM(l."taxPaise") AS tax
           FROM "SettlementLine" l JOIN "Settlement" s ON s.id = l."settlementId"
           LEFT JOIN "Transaction" t ON t.id = l."transactionId"
          WHERE l."merchantId"=$1 AND l.mode=$2 AND l.action='CAPTURE'
            AND COALESCE(s."completedAt", s."fetchedAt") >= (now() AT TIME ZONE 'UTC') - interval '7 days'
          GROUP BY t.method, l."payuMode"`,
        [auth.merchantId, mode]
      ),
    ]);
    const by = {};
    fees.forEach((r) => {
      const k = lineMode(r.method, r.payuMode), m = by[k] || (by[k] = { mode: k, n: 0, gross: 0, fee: 0, tax: 0 });
      m.n += r.n; m.gross += num(r.gross); m.fee += num(r.fee); m.tax += num(r.tax);
    });
    return { account, feesByMode: Object.values(by).sort((a, b) => b.gross - a.gross) };
  }],

  // Settlement drawer: every line (captures, refunds, chargebacks) with the matching payment.
  ["GET", "/settlements/:id", async ({ auth, mode, params }) => {
    const s = await db.one(
      `SELECT s.id, s."payuSettlementId", s.utr, s."transactionAmtPaise", s."refundAmtPaise", s."chargebackAmtPaise", s."serviceFeePaise",
              s."serviceTaxPaise", s."netAmountPaise", s.status, s."completedAt", s."fetchedAt",
              b."accountLast4", b."bankName", b.ifsc
         FROM "Settlement" s LEFT JOIN "BankAccount" b ON b.id = s."bankAccountId"
        WHERE s.id=$1 AND s."merchantId"=$2 AND s.mode=$3`,
      [params.id, auth.merchantId, mode]
    );
    if (!s) fail(404, "Settlement not found.");
    const lines = await db.query(
      `SELECT l.action, l."payuId", l."payuRequestId", l."merchantTransactionId", l."grossPaise", l."feePaise", l."taxPaise", l."netPaise", l."payuMode",
              l."refundId", t.txnid, t.method, cu.name AS "custName"
         FROM "SettlementLine" l
         LEFT JOIN "Transaction" t ON t.id = l."transactionId"
         LEFT JOIN "Order" o ON o.id = t."orderId"
         LEFT JOIN "Customer" cu ON cu.id = o."customerId"
        WHERE l."settlementId"=$1 AND l."merchantId"=$2 AND l.mode=$3
        ORDER BY l.action, l."grossPaise" DESC`,
      [s.id, auth.merchantId, mode]
    );
    return {
      dbId: s.id, id: s.payuSettlementId, utr: s.utr || "—", status: s.status, date: s.completedAt || s.fetchedAt,
      completedAt: s.completedAt, fetchedAt: s.fetchedAt,
      gross: num(s.transactionAmtPaise), ref: num(s.refundAmtPaise), chargebacks: num(s.chargebackAmtPaise), fee: num(s.serviceFeePaise),
      tax: num(s.serviceTaxPaise), net: num(s.netAmountPaise), carriedIn: 0, carriedOut: 0,
      account: s.accountLast4 ? { last4: s.accountLast4, bankName: s.bankName || null, ifsc: s.ifsc } : null,
      lines: lines.map((l) => ({
        action: l.action, payuId: l.payuId, requestId: l.payuRequestId || null, txnid: l.txnid || l.merchantTransactionId || "—", refundId: l.refundId,
        name: l.custName || "—", mode: lineMode(l.method, l.payuMode), gross: num(l.grossPaise), fee: num(l.feePaise), tax: num(l.taxPaise), net: num(l.netPaise),
      })),
    };
  }],

  // Home: gateway downtime (platform-wide, GatewayDowntime) and this account's payment-method switches.
  ["GET", "/gateway-health", async ({ auth, mode }) => {
    const [down, methods] = await Promise.all([
      db.query(
        `SELECT id, method, "bankCode", severity, message, "startedAt", "endedAt" FROM "GatewayDowntime"
          WHERE "endedAt" IS NULL OR "endedAt" >= (now() AT TIME ZONE 'UTC') - interval '7 days'
          ORDER BY ("endedAt" IS NULL) DESC, "startedAt" DESC LIMIT 50`
      ),
      db.query(`SELECT method, enabled FROM "MerchantPaymentMethod" WHERE "merchantId"=$1 AND mode=$2`, [auth.merchantId, mode]),
    ]);
    const shape = (d) => ({ id: d.id, mode: methodLabel(d.method), bank: d.bankCode || null, severity: d.severity, message: d.message || "", startedAt: d.startedAt, endedAt: d.endedAt });
    return {
      checkedAt: new Date(),
      active: down.filter((d) => !d.endedAt).map(shape),
      past: down.filter((d) => d.endedAt).map(shape),
      methods: methods.map((m) => ({ mode: methodLabel(m.method), enabled: m.enabled })),
    };
  }],
];

module.exports.transactions = transactions;
module.exports.refunds = refunds;
module.exports.settlements = settlements;
module.exports.transactionDetail = transactionDetail;

// Reports: a request is recorded in "Report"; the CSV is built from the database each time it is
// downloaded (there is no object storage to keep files in). Downloading marks the report READY.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp } = require("../auth");
const { methodLabel, txnStatus, num, LABEL_METHOD } = require("../shape");
const { settlements } = require("./payments");
const chargebacks = require("./chargebacks");
const links = require("./links");

// Allowed filters per report type (mirrors TYPES in public/pages/reports.js).
const TYPES = {
  Payments: { status: ["SUCCESS", "FAILURE", "PENDING", "USER_CANCELLED"], method: Object.keys(LABEL_METHOD) },
  Refunds: { status: ["REQUESTED", "QUEUED", "IN_PROGRESS", "SUCCESS", "FAILED"] },
  Settlements: { status: ["PROCESSED", "PENDING", "ON_HOLD", "FAILED"] },
  Chargebacks: { status: ["OPEN", "CLOSED"] },
  Payouts: { status: ["QUEUED", "SCHEDULED", "IN_PROGRESS", "PENDING", "WAITING_FOR_RETRY", "SUCCESS", "FAILED", "REVERSED"] },
  PaymentLinks: { status: ["ACTIVE", "PARTIALLY_PAID", "PAID", "EXPIRED", "DEACTIVATED"] },
  Fees: {},
};
const FORMATS = ["CSV", "Excel"];
const IST = "+05:30";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// UTC instant → YYYY-MM-DD in IST.
const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const rupees = (p) => (num(p || 0) / 100).toFixed(2);
const iso = (d) => (d ? new Date(d).toISOString() : "");
const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Validate a report request → { type, from, to, fromDate, toDate, filters, format }.
function parse(input) {
  const type = String(input.type || "");
  if (!TYPES[type]) fail(400, "Choose a report type.");
  const from = String(input.from || ""), to = String(input.to || "");
  if (!DATE.test(from) || !DATE.test(to)) fail(400, "Choose both dates.");
  const fromDate = new Date(from + "T00:00:00" + IST), toDate = new Date(to + "T23:59:59.999" + IST);
  if (isNaN(fromDate) || isNaN(toDate)) fail(400, "Choose valid dates.");
  if (from > to) fail(400, '"From" must be on or before "To".');
  if (to > istDay(Date.now())) fail(400, "The range can't end in the future.");
  if ((toDate - fromDate) / 864e5 > 366) fail(400, "Pick a range of one year or less.");
  const format = FORMATS.includes(input.format) ? input.format : "CSV";
  const src = input.filters && typeof input.filters === "object" ? input.filters : input;
  const filters = {};
  for (const [k, allowed] of Object.entries(TYPES[type])) {
    const v = src[k];
    if (v == null || v === "") continue;
    if (!allowed.includes(String(v))) fail(400, `Unknown ${k === "method" ? "payment mode" : k} filter.`);
    filters[k] = String(v);
  }
  return { type, from, to, fromDate, toDate, filters, format };
}

// Build { head, rows } for a report straight from the database.
async function build(merchantId, mode, { type, fromDate, toDate, filters }) {
  const f = filters || {};
  const inR = (d) => d && new Date(d) >= fromDate && new Date(d) <= toDate;
  switch (type) {
    case "Payments": {
      const p = [merchantId, mode, fromDate, toDate];
      let extra = "";
      if (f.status) { p.push(f.status === "FAILURE" ? "FAILED" : f.status); extra += ` AND t.status=$${p.length}`; }
      if (f.method) { p.push(LABEL_METHOD[f.method]); extra += ` AND t.method=$${p.length}`; }
      const rows = await db.query(
        `SELECT t.txnid, t.mihpayid, t."amountPaise", t.status, t.method, t.bankcode, t."errorMessage", t."createdAt",
                cu.name, cu.email, cu.phone,
                COALESCE((SELECT SUM(r."amountPaise") FROM "Refund" r WHERE r."transactionId"=t.id AND r.status <> 'FAILED'), 0) AS refunded
           FROM "Transaction" t JOIN "Order" o ON o.id = t."orderId" LEFT JOIN "Customer" cu ON cu.id = o."customerId"
          WHERE t."merchantId"=$1 AND t.mode=$2 AND NOT t."isMandateRegistration" AND t."createdAt" BETWEEN $3 AND $4${extra}
          ORDER BY t."createdAt" DESC`, p);
      return { head: "date,payment_id,txnid,customer,email,phone,payment_mode,bank,amount,refunded,status,failure_reason",
        rows: rows.map((t) => [iso(t.createdAt), t.mihpayid || "", t.txnid, t.name || "", t.email || "", t.phone || "", methodLabel(t.method), t.bankcode || "",
          rupees(t.amountPaise), rupees(t.refunded), txnStatus(t.status), t.errorMessage || ""]) };
    }
    case "Refunds": {
      const p = [merchantId, mode, fromDate, toDate];
      let extra = "";
      if (f.status) { p.push(f.status); extra = ` AND r.status=$${p.length}`; }
      const rows = await db.query(
        `SELECT r.id, r."amountPaise", r.reason, r.status, r."payuRequestId", r."bankArn", r."createdAt", t.txnid, t."amountPaise" AS captured, cu.name
           FROM "Refund" r JOIN "Transaction" t ON t.id = r."transactionId" JOIN "Order" o ON o.id = t."orderId"
           LEFT JOIN "Customer" cu ON cu.id = o."customerId"
          WHERE r."merchantId"=$1 AND r.mode=$2 AND r."createdAt" BETWEEN $3 AND $4${extra} ORDER BY r."createdAt" DESC`, p);
      return { head: "date,refund_id,txnid,customer,amount,captured,reason,request_id,bank_arn,status",
        rows: rows.map((x) => [iso(x.createdAt), x.id, x.txnid, x.name || "", rupees(x.amountPaise), rupees(x.captured), x.reason || "", x.payuRequestId || "", x.bankArn || "", x.status]) };
    }
    case "Settlements": {
      const list = (await settlements(merchantId, mode)).filter((s) => inR(s.date) && (!f.status || s.status === f.status));
      return { head: "settlement_date,settlement_id,utr,payments,gross,fee,gst,refunds,chargebacks,net,status",
        rows: list.map((s) => [istDay(s.date), s.id, s.utr === "—" ? "" : s.utr, s.count, rupees(s.gross), rupees(s.fee), rupees(s.tax), rupees(s.ref), rupees(s.chargebacks), rupees(s.net), s.status]) };
    }
    case "Chargebacks": {
      const list = (await chargebacks.list(merchantId, mode, { from: fromDate, to: toDate }))
        .filter((c) => !f.status || (f.status === "CLOSED") === chargebacks.CLOSED.includes(c.status));
      return { head: "case_id,raised,txnid,payment_id,reason_code,reason,amount,respond_by,status",
        rows: list.map((c) => [c.caseId, iso(c.raised), c.txnid, c.mihpayid === "—" ? "" : c.mihpayid, c.code, c.reason, rupees(c.amount), iso(c.respondBy), c.status]) };
    }
    case "Payouts": {
      const p = [merchantId, mode, fromDate, toDate];
      let extra = "";
      if (f.status) { p.push(f.status); extra = ` AND p.status=$${p.length}`; }
      const rows = await db.query(
        `SELECT p."createdAt", p."merchantRefId", p."transferMode", p."amountPaise", p."bankRefNo", p.status, p.purpose, b.name
           FROM "Payout" p JOIN "Beneficiary" b ON b.id = p."beneficiaryId"
          WHERE p."merchantId"=$1 AND p.mode=$2 AND p."createdAt" BETWEEN $3 AND $4${extra} ORDER BY p."createdAt" DESC`, p);
      return { head: "date,reference,beneficiary,mode,amount,utr,purpose,status",
        rows: rows.map((x) => [iso(x.createdAt), x.merchantRefId, x.name, x.transferMode, rupees(x.amountPaise), x.bankRefNo || "", x.purpose || "", x.status]) };
    }
    case "PaymentLinks": {
      // Links created in the range; status is the same derived status the Payment links page shows.
      const list = (await links.list(merchantId, mode)).filter((l) => inR(l.created) && (!f.status || l.status === f.status));
      return { head: "created,invoice_number,description,customer,email,phone,amount,collected,payments,status,expires,url",
        rows: list.map((l) => [iso(l.created), l.invoiceNumber, l.desc, l.customer === "—" ? "" : l.customer, l.email, l.phone,
          l.amount == null ? "customer enters" : rupees(l.amount), rupees(l.payments.reduce((a, p) => a + p.amount, 0)), l.payments.length, l.status, iso(l.expiresAt), l.url || ""]) };
    }
    case "Fees": {
      // Charges deducted in each settlement: PayU service fee plus GST on it.
      const list = (await settlements(merchantId, mode)).filter((s) => inR(s.date));
      return { head: "settlement_date,settlement_id,utr,payments,gross,service_fee,gst,total_charges,net,status",
        rows: list.map((s) => [istDay(s.date), s.id, s.utr === "—" ? "" : s.utr, s.count, rupees(s.gross), rupees(s.fee), rupees(s.tax), rupees(num(s.fee) + num(s.tax)), rupees(s.net), s.status]) };
    }
  }
  return { head: "", rows: [] };
}

const shapeReport = (r) => {
  const f = r.filters || {};
  const { format = "CSV", ...filters } = f;
  return { id: r.id, type: r.kind, from: istDay(r.fromDate), to: istDay(r.toDate), format, filters, status: r.status, at: r.createdAt, completedAt: r.completedAt };
};

async function findReport(ctx) {
  const r = await db.one(`SELECT * FROM "Report" WHERE "merchantId"=$1 AND mode=$2 AND id=$3`, [ctx.auth.merchantId, ctx.mode, ctx.params.id]);
  if (!r) fail(404, "Report not found.");
  return r;
}

module.exports = [
  ["GET", "/reports", async ({ auth, mode }) => {
    const rows = await db.query(
      `SELECT id, kind, "fromDate", "toDate", filters, status, "createdAt", "completedAt" FROM "Report"
        WHERE "merchantId"=$1 AND mode=$2 ORDER BY "createdAt" DESC LIMIT 100`, [auth.merchantId, mode]);
    return rows.map(shapeReport);
  }],

  // Matching-record count for the builder, without recording anything.
  ["GET", "/reports/preview", async ({ auth, mode, query }) => {
    const spec = parse(query);
    const { rows } = await build(auth.merchantId, mode, spec);
    return { rows: rows.length };
  }],

  ["POST", "/reports", async (ctx) => {
    const { auth, mode, body } = ctx;
    const spec = parse(body);
    const id = db.id();
    await db.query(
      `INSERT INTO "Report" (id,"merchantId",mode,kind,"fromDate","toDate",filters,status,"requestedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,'QUEUED',$8)`,
      [id, auth.merchantId, mode, spec.type, spec.fromDate, spec.toDate, JSON.stringify({ ...spec.filters, format: spec.format }), auth.user.id]
    );
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "report.requested", entity: "Report", entityId: id, ip: clientIp(ctx.req),
      meta: { type: spec.type, from: spec.from, to: spec.to, filters: spec.filters, format: spec.format } });
    return shapeReport(await db.one(`SELECT * FROM "Report" WHERE id=$1`, [id]));
  }],

  // Generates the CSV from current data and streams it back.
  ["GET", "/reports/:id/download", async (ctx) => {
    const { auth, mode } = ctx;
    const r = await findReport(ctx);
    const rep = shapeReport(r);
    const { head, rows } = await build(auth.merchantId, mode, { type: r.kind, fromDate: r.fromDate, toDate: r.toDate, filters: rep.filters });
    await db.query(`UPDATE "Report" SET status='READY', "completedAt"=now() WHERE id=$1 AND "merchantId"=$2 AND mode=$3`, [r.id, auth.merchantId, mode]);
    const csv = (rep.format === "Excel" ? "﻿" : "") + head + "\n" + rows.map((x) => x.map(cell).join(",")).join("\n") + (rows.length ? "\n" : "");
    const name = `bizpolepay-${r.kind.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}-${rep.from}-to-${rep.to}.csv`;
    return { __raw: true, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "x-row-count": String(rows.length) }, body: csv };
  }],

  ["DELETE", "/reports/:id", async (ctx) => {
    const { auth, mode } = ctx;
    const r = await findReport(ctx);
    await db.query(`DELETE FROM "Report" WHERE id=$1 AND "merchantId"=$2 AND mode=$3`, [r.id, auth.merchantId, mode]);
    await audit(db, { merchantId: auth.merchantId, userId: auth.user.id, mode, action: "report.deleted", entity: "Report", entityId: r.id, ip: clientIp(ctx.req), meta: { type: r.kind } });
    return { ok: true };
  }],
];

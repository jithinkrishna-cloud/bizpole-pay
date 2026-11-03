// Integration: Phase 1 Super Admin read APIs against a disposable Neon branch.
// Seeds one labelled test organization with known rows, checks exact figures for it, checks platform KPIs
// against independent SQL over the whole branch, scans every response for secrets, and removes its rows.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { skip, start, tag: mkTag, mobile } = require("./_harness");

// Columns that must never leave the server, and are not allowed as keys in any /super response.
const SECRET_KEYS = ["saltEnc", "passwordHash", "secretHash", "secretEnc", "refreshHash", "panEnc", "accountNumberEnc", "clientSecretEnc", "codeHash", "payload", "storageKey", "token"];

function scan(value, path, found) {
  if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${path}[${i}]`, found));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.includes(k)) found.push(`${path}.${k}`);
      scan(v, `${path}.${k}`, found);
    }
  return found;
}

test("Super Admin read APIs", { skip }, async (t) => {
  const { db, call, stop } = await start();
  const { hashPassword, encrypt, sha256 } = require("../server/secrets");
  const tag = mkTag(), pw = "Test-" + crypto.randomBytes(8).toString("hex");
  const SALT = "salt-" + crypto.randomBytes(16).toString("hex"), KEY = "TK" + tag.toUpperCase();
  const HOOK_SECRET = "whsec-" + crypto.randomBytes(12).toString("hex"), API_SECRET = "sk-" + crypto.randomBytes(16).toString("hex");
  const ids = {}; const users = [];

  t.after(async () => {
    const m = ids.merchant ? [ids.merchant] : [];
    await db.query(`DELETE FROM "AuditLog" WHERE "userId" = ANY($1) OR "merchantId" = ANY($2)`, [users, m]);
    await db.query(`DELETE FROM "WebhookEndpoint" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "ApiKey" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "InboundEvent" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "ReconRun" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "Settlement" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "Refund" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "Transaction" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "Order" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "Customer" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "PayuCredential" WHERE "merchantId" = ANY($1)`, [m]);
    await db.query(`DELETE FROM "Merchant" WHERE id = ANY($1)`, [m]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1)`, [users]);
    await stop();
  });

  // ── People ──
  const ownerEmail = `owner-${tag}@example.test`;
  const signup = await call("/auth/signup", { method: "POST", body: { name: "Owner " + tag, email: ownerEmail, mobile: mobile(), password: pw, businessName: "SA Test " + tag } });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  const owner = await db.one(`SELECT u.id, ms."merchantId" FROM "User" u JOIN "Membership" ms ON ms."userId" = u.id WHERE u.email = $1`, [ownerEmail]);
  users.push(owner.id); ids.merchant = owner.merchantId;
  const M = owner.merchantId, ownerCookie = signup.cookie;

  const opId = db.id(), opEmail = `operator-${tag}@example.test`;
  await db.query(`INSERT INTO "User" (id,email,mobile,name,"passwordHash","platformRole","updatedAt") VALUES ($1,$2,$3,'Operator',$4,'SUPER_ADMIN',now())`, [opId, opEmail, mobile(), hashPassword(pw)]);
  users.push(opId);
  const op = (await call("/auth/login", { method: "POST", body: { email: opEmail, password: pw } })).cookie;
  assert.ok(op);

  // ── Fixture rows for the test organization (TEST mode) ──
  const C = db.id(), cust = db.id(), o1 = db.id(), o2 = db.id();
  const tx = { failed: db.id(), ok1: db.id(), ok2: db.id() };
  const txnid = { failed: `SA${tag}F`, ok1: `SA${tag}A`, ok2: `SA${tag}B` };
  await db.query(`INSERT INTO "PayuCredential" (id,"merchantId",mode,"payuMid","merchantKey","saltVersion","saltEnc",status,"isDefault") VALUES ($1,$2,'TEST',8800001,$3,'V2',$4,'ACTIVE',true)`, [C, M, KEY, encrypt(SALT)]);
  await db.query(`INSERT INTO "Customer" (id,"merchantId",mode,name,email) VALUES ($1,$2,'TEST','Test Payer',$3)`, [cust, M, `payer-${tag}@example.test`]);
  for (const [id, amt] of [[o1, 50000], [o2, 150000]])
    await db.query(`INSERT INTO "Order" (id,"merchantId",mode,"customerId","amountPaise","productInfo",status,"updatedAt") VALUES ($1,$2,'TEST',$3,$4,'Test order','PAID',now())`, [id, M, cust, amt]);
  const insTxn = (id, order, t, amt, status, method, err) => db.query(
    `INSERT INTO "Transaction" (id,"merchantId",mode,"orderId","credentialId",txnid,"amountPaise","payuAmount",status,method,"errorMessage","completedAt","updatedAt")
     VALUES ($1,$2,'TEST',$3,$4,$5,$6,$7,$8,$9,$10,now(),now())`, [id, M, order, C, t, amt, (amt / 100).toFixed(2), status, method, err]);
  await insTxn(tx.failed, o1, txnid.failed, 50000, "FAILED", "CREDIT_CARD", "Card declined");
  await insTxn(tx.ok1, o1, txnid.ok1, 50000, "SUCCESS", "CREDIT_CARD", null);
  await insTxn(tx.ok2, o2, txnid.ok2, 150000, "SUCCESS", "UPI", null);
  ids.refund = db.id();
  await db.query(`INSERT INTO "Refund" (id,"merchantId",mode,"transactionId",token,"amountPaise",status,"payuRequestId","updatedAt") VALUES ($1,$2,'TEST',$3,$4,10000,'SUCCESS',$5,now())`,
    [ids.refund, M, tx.ok2, ("RT" + tag + "x").slice(0, 23), "REQ" + tag]);
  // Net deliberately 460 paise below gross − refunds − fee − tax, and below the line total.
  ids.settlement = db.id();
  await db.query(`INSERT INTO "Settlement" (id,"merchantId",mode,"credentialId","payuSettlementId",utr,"transactionAmtPaise","refundAmtPaise","serviceFeePaise","serviceTaxPaise","netAmountPaise",status,"completedAt")
                  VALUES ($1,$2,'TEST',$3,$4,$5,150000,10000,3000,540,136000,'PROCESSED',now())`, [ids.settlement, M, C, "PS" + tag, "UTR" + tag]);
  await db.query(`INSERT INTO "SettlementLine" (id,"settlementId","merchantId",mode,"lineKey",action,"payuId","transactionId","grossPaise","feePaise","taxPaise","netPaise")
                  VALUES ($1,$2,$3,'TEST',$4,'CAPTURE',$5,$6,150000,3000,540,146460)`, [db.id(), ids.settlement, M, "L" + tag, "P" + tag, tx.ok2]);
  const run = db.id();
  await db.query(`INSERT INTO "ReconRun" (id,kind,mode,"merchantId","windowFrom","windowTo",status,checked,mismatches,"finishedAt") VALUES ($1,'VERIFY_PAYMENTS','TEST',$2,now() - interval '1 day',now(),'COMPLETED',3,2,now())`, [run, M]);
  ids.mismatch = db.id();
  await db.query(`INSERT INTO "ReconMismatch" (id,"runId","merchantId","entityType","entityId",field,"localValue","payuValue") VALUES ($1,$2,$3,'transaction',$4,'amount','500.00','499.00'),
                  ($5,$2,$3,'transaction',$6,'status',NULL,'success')`, [ids.mismatch, run, M, tx.ok1, db.id(), tx.ok2]);
  await db.query(`INSERT INTO "InboundEvent" (id,source,mode,"dedupeKey","merchantId","signatureValid",payload,processing,error) VALUES ($1,'PAYMENT_WEBHOOK','TEST',$2,$3,false,$4,'SIGNATURE_INVALID','hash mismatch')`,
    [db.id(), "dk-" + tag, M, JSON.stringify({ secretMarker: SALT })]);
  const ep = db.id();
  await db.query(`INSERT INTO "WebhookEndpoint" (id,"merchantId",mode,url,"secretEnc",events) VALUES ($1,$2,'TEST','https://example.test/hook',$3,'{payment.success}')`, [ep, M, encrypt(HOOK_SECRET)]);
  await db.query(`INSERT INTO "WebhookDelivery" (id,"endpointId","eventId",event,payload,status,attempts,"responseCode") VALUES ($1,$2,$3,'payment.success','{}','FAILED',3,500)`, [db.id(), ep, "ev-" + tag]);
  await db.query(`INSERT INTO "ApiKey" (id,"merchantId",mode,name,prefix,"secretHash") VALUES ($1,$2,'TEST','CI key',$3,$4)`, [db.id(), M, "pk_" + tag, sha256(API_SECRET)]);
  await db.query(`INSERT INTO "AuditLog" (id,"merchantId","userId",action,entity,"entityId") VALUES ($1,$2,$3,'test.csv_injection','Test','=HYPERLINK("x")')`, [db.id(), M, owner.id]);

  const GETS = [
    "/super/session", "/super/overview", "/super/overview?mode=test&range=30d", "/super/analytics?range=7d", "/super/analytics?range=ytd&mode=live", "/super/activity",
    "/super/orgs", `/super/orgs?q=${tag}`, `/super/orgs/${M}`, "/super/users", `/super/users/${owner.id}`, `/super/users/${opId}`,
    "/super/transactions", `/super/transactions/${txnid.ok1}`, "/super/refunds", `/super/refunds/${ids.refund}`,
    "/super/settlements", `/super/settlements/${ids.settlement}`, "/super/chargebacks",
    "/super/recon", "/super/recon/runs", "/super/recon/mismatches", `/super/recon/mismatches/${ids.mismatch}`,
    "/super/providers", "/super/provider-accounts", "/super/webhooks/inbound", "/super/webhooks/outbound", "/super/integration-health", "/super/api-keys",
    "/super/audit", `/super/search?q=${tag}`,
  ];

  await t.test("every route: 401 without session, 403 for a merchant OWNER, 200 for Super Admin", async () => {
    for (const p of [...GETS, "/super/audit/export"]) {
      assert.equal((await call(p)).status, 401, `anon ${p}`);
      const o = await call(p, { cookie: ownerCookie });
      assert.equal(o.status, 403, `owner ${p} → ${o.status}`);
      assert.equal(o.body.error, "Super Admin access is required.");
    }
    for (const p of GETS) {
      const r = await call(p, { cookie: op });
      assert.equal(r.status, 200, `${p} → ${r.status} ${r.raw.slice(0, 300)}`);
    }
  });

  await t.test("no secret field or secret value in any response", async () => {
    const encSalt = (await db.one(`SELECT "saltEnc" FROM "PayuCredential" WHERE id = $1`, [C])).saltEnc;
    for (const p of GETS) {
      const r = await call(p, { cookie: op });
      assert.deepEqual(scan(r.body, p, []), [], `secret keys in ${p}`);
      for (const needle of [SALT, encSalt, KEY, HOOK_SECRET, API_SECRET, sha256(API_SECRET), "scrypt$"])
        assert.ok(!r.raw.includes(needle), `${p} leaks ${needle.slice(0, 12)}…`);
    }
  });

  await t.test("GET routes are read-only", async () => {
    const TABLES = ["Merchant", "User", "Membership", "Transaction", "Refund", "Settlement", "ReconMismatch", "InboundEvent", "WebhookDelivery", "AuditLog"];
    // Row count plus a hash of every row, so any insert, update or delete shows up.
    const snap = async () => Object.fromEntries(await Promise.all(TABLES.map(async (x) =>
      [x, (await db.one(`SELECT count(*)::int AS n, md5(COALESCE(string_agg(t::text, '|' ORDER BY t.id), '')) AS h FROM "${x}" t`))])));
    const before = await snap();
    for (const p of GETS) await call(p, { cookie: op });
    assert.deepEqual(await snap(), before);
  });

  await t.test("platform KPIs match independent SQL over the whole branch", async () => {
    for (const mode of [null, "TEST", "LIVE"]) {
      const r = (await call(`/super/overview${mode ? "?mode=" + mode.toLowerCase() : ""}`, { cookie: op })).body;
      const mw = mode ? `AND mode = '${mode}'` : "";
      const x = await db.one(`SELECT
        (SELECT count(*)::int FROM "Merchant") orgs,
        (SELECT count(*)::int FROM "Merchant" WHERE status NOT IN ('REJECTED','SUSPENDED','DEACTIVATED')) active,
        (SELECT count(*)::int FROM "Merchant" WHERE status IN ('SUBMITTED','UNDER_REVIEW','ACTION_REQUIRED')) pending,
        (SELECT count(*)::int FROM "User") users,
        (SELECT count(*)::int FROM "Transaction" WHERE NOT "isMandateRegistration" ${mw}) txns,
        (SELECT count(*)::int FROM "Transaction" WHERE NOT "isMandateRegistration" AND status = 'SUCCESS' ${mw}) ok,
        (SELECT count(*)::int FROM "Transaction" WHERE NOT "isMandateRegistration" AND status IN ('FAILED','BOUNCED','DROPPED') ${mw}) failed,
        (SELECT COALESCE(sum("amountPaise"),0)::bigint FROM "Transaction" WHERE NOT "isMandateRegistration" AND status = 'SUCCESS' ${mw}) volume,
        (SELECT count(*)::int FROM "Refund" WHERE true ${mw}) refunds,
        (SELECT COALESCE(sum("amountPaise"),0)::bigint FROM "Refund" WHERE status <> 'FAILED' ${mw}) refunded,
        (SELECT count(*)::int FROM "Settlement" WHERE status = 'PENDING' ${mw}) pending_st,
        (SELECT count(*)::int FROM "ReconMismatch" x JOIN "ReconRun" r ON r.id = x."runId" WHERE x.resolution = 'OPEN' ${mode ? `AND r.mode = '${mode}'` : ""}) recon,
        (SELECT count(*)::int FROM "PayuCredential" WHERE true ${mw}) creds,
        (SELECT count(*)::int FROM "InboundEvent" WHERE true ${mw}) inbound`);
      const label = mode || "ALL";
      assert.deepEqual(
        [r.organizations.total, r.organizations.active, r.organizations.pendingVerification, r.users.total, r.transactions.total, r.transactions.successful,
          r.transactions.failed, r.transactions.volume, r.refunds.total, r.refunds.amount, r.settlements.pending, r.reconciliation.openExceptions,
          r.providerAccounts.total, r.webhooks.inbound],
        [x.orgs, x.active, x.pending, x.users, x.txns, x.ok, x.failed, x.volume, x.refunds, x.refunded, x.pending_st, x.recon, x.creds, x.inbound], label);
    }
  });

  await t.test("exact figures for the test organization", async () => {
    const tx = (await call(`/super/transactions?orgId=${M}`, { cookie: op })).body;
    assert.equal(tx.total, 3);
    assert.deepEqual(tx.summary, { count: 3, successful: 2, volume: 200000 });
    assert.equal(tx.rows[0].org.id, M);
    assert.equal((await call(`/super/transactions?orgId=${M}&status=FAILURE`, { cookie: op })).body.total, 1);
    assert.equal((await call(`/super/transactions?orgId=${M}&method=UPI`, { cookie: op })).body.total, 1);
    assert.equal((await call(`/super/transactions?orgId=${M}&min=100000`, { cookie: op })).body.total, 1);
    assert.equal((await call(`/super/transactions?orgId=${M}&mode=live`, { cookie: op })).body.total, 0);
    assert.equal((await call(`/super/transactions?q=${txnid.ok2}`, { cookie: op })).body.total, 1);

    const orgs = (await call(`/super/orgs?q=${tag}`, { cookie: op })).body;
    assert.equal(orgs.total, 1);
    assert.equal(orgs.rows[0].txnCount, 3);
    assert.equal(orgs.rows[0].volume, 200000);

    const detail = (await call(`/super/orgs/${M}`, { cookie: op })).body;
    assert.equal(detail.integrations.credentials[0].merchantKey.length, KEY.length);
    assert.ok(detail.integrations.credentials[0].merchantKey.includes("•"));
    assert.equal(detail.users[0].email, ownerEmail);
    assert.deepEqual(detail.stats.TEST, { transactions: 3, successful: 2, volume: 200000, refunded: 10000, settled: 136000 });

    const d = (await call(`/super/transactions/${txnid.ok1}`, { cookie: op })).body;
    assert.equal(d.attempts.length, 2, "two attempts on the same order");
    assert.equal(d.org.id, M);
    assert.equal(d.provider.name, "PayU");
    assert.equal(d.mode, "TEST");

    const rf = (await call(`/super/refunds?orgId=${M}`, { cookie: op })).body;
    assert.deepEqual([rf.total, rf.summary.amount], [1, 10000]);
    const rd = (await call(`/super/refunds/${ids.refund}`, { cookie: op })).body;
    assert.equal(rd.transaction.txnid, txnid.ok2);

    const st = (await call(`/super/settlements/${ids.settlement}`, { cookie: op })).body;
    assert.equal(st.discrepancy.formula, -460);
    assert.equal(st.discrepancy.lines, 136000 - 146460);
    assert.equal(st.lines[0].txnid, txnid.ok2);
  });

  await t.test("reconciliation, webhooks, provider accounts, API keys", async () => {
    const amount = (await call(`/super/recon/mismatches?orgId=${M}&category=amount`, { cookie: op })).body;
    assert.equal(amount.total, 1);
    assert.equal(amount.rows[0].field, "amount");
    assert.equal((await call(`/super/recon/mismatches?orgId=${M}&category=missing`, { cookie: op })).body.total, 1);
    assert.equal((await call(`/super/recon/mismatches?orgId=${M}&resolution=OPEN`, { cookie: op })).body.total, 2);
    const sum = (await call(`/super/recon?mode=test`, { cookie: op })).body;
    assert.ok(sum.byResolution.OPEN >= 2 && sum.openByCategory.amount >= 1 && sum.openByCategory.missing >= 1);

    const inbound = (await call(`/super/webhooks/inbound?orgId=${M}&failed=1`, { cookie: op })).body;
    assert.equal(inbound.total, 1);
    assert.equal(inbound.rows[0].signature, "INVALID");
    const outbound = (await call(`/super/webhooks/outbound?orgId=${M}&status=FAILED`, { cookie: op })).body;
    assert.equal(outbound.total, 1);
    assert.equal(outbound.rows[0].responseCode, 500);

    const acc = (await call(`/super/provider-accounts?orgId=${M}`, { cookie: op })).body;
    assert.equal(acc.total, 1);
    assert.equal(acc.rows[0].lastError.message, "Card declined");
    assert.ok(acc.rows[0].lastSuccessAt);
    const keys = (await call(`/super/api-keys?orgId=${M}`, { cookie: op })).body;
    assert.equal(keys.rows[0].prefix, "pk_" + tag);
  });

  await t.test("users: role filters distinguish Super Admin and org admins", async () => {
    const supers = (await call(`/super/users?role=SUPER_ADMIN&q=${tag}`, { cookie: op })).body;
    assert.deepEqual(supers.rows.map((u) => u.email), [opEmail]);
    const admins = (await call(`/super/users?role=ORG_ADMIN&q=${tag}`, { cookie: op })).body;
    assert.deepEqual(admins.rows.map((u) => u.email), [ownerEmail]);
    const u = (await call(`/super/users/${owner.id}`, { cookie: op })).body;
    assert.ok(u.sessions.length >= 1 && u.sessions[0].ip !== undefined);
    assert.equal(u.memberships[0].role, "OWNER");
  });

  await t.test("paging, validation and injection safety", async () => {
    const big = (await call(`/super/users?size=5000`, { cookie: op })).body;
    assert.equal(big.size, 100);
    const one = (await call(`/super/users?size=1`, { cookie: op })).body;
    assert.equal(one.rows.length, 1);
    assert.equal(one.pages, one.total);
    const past = (await call(`/super/users?size=10&page=99999`, { cookie: op })).body;
    assert.equal(past.rows.length, 0);
    for (const bad of ["/super/transactions?status=BOGUS", "/super/orgs?range=forever", "/super/orgs?from=2026-02-01&to=2026-01-01",
      "/super/overview?mode=prod", "/super/orgs?group=nope", "/super/search?q=a", "/super/transactions?method=Cheque", "/super/transactions?min=-5"])
      assert.equal((await call(bad, { cookie: op })).status, 400, bad);
    const inj = await call(`/super/orgs?q=${encodeURIComponent("'; DROP TABLE \"Merchant\"; --")}&sort=${encodeURIComponent("1; DROP TABLE x")}`, { cookie: op });
    assert.equal(inj.status, 200);
    assert.equal(inj.body.total, 0);
    assert.equal((await call(`/super/orgs?q=%25`, { cookie: op })).body.total, 0, "% is matched literally");
  });

  await t.test("search finds by txnid and org name", async () => {
    const s = (await call(`/super/search?q=${txnid.ok2}`, { cookie: op })).body;
    assert.equal(s.transactions[0].txnid, txnid.ok2);
    const o = (await call(`/super/search?q=SA%20Test%20${tag}`, { cookie: op })).body;
    assert.equal(o.organizations[0].id, M);
  });

  await t.test("audit export: CSV, formula-safe, and recorded in the audit log", async () => {
    const r = await call(`/super/audit/export?orgId=${M}`, { cookie: op });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/csv/);
    const lines = r.raw.replace(/^﻿/, "").trim().split("\r\n");
    assert.match(lines[0], /^Audit ID,Timestamp \(UTC\),Actor/);
    assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""x"")"`)), "formula cell is prefixed with '");
    assert.ok(!lines.some((l) => /,=HYPERLINK/.test(l)));
    const logged = await db.one(`SELECT meta FROM "AuditLog" WHERE "userId" = $1 AND action = 'super.export' ORDER BY "createdAt" DESC LIMIT 1`, [opId]);
    assert.equal(logged.meta.resource, "audit");
    assert.equal(logged.meta.filters.orgId, M);
    assert.equal(logged.meta.rows, Number(r.headers.get("x-row-count")));
    const visible = (await call(`/super/audit?platform=1&action=super.&actorId=${opId}`, { cookie: op })).body;
    assert.equal(visible.rows[0].action, "super.export");
    assert.equal(visible.rows[0].role, "SUPER_ADMIN");
  });
});

// Unit tests for the payments core (docs/PAYMENTS_CORE.md): the PayU gateway's hashing and parsing, route gating,
// and that the public payment pages never name the provider. No database or network.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const payu = require("../server/providers/payu");
const pages = require("../server/pay-pages");

const g = payu.gateway;
const sha512 = (s) => crypto.createHash("sha512").update(s).digest("hex");
const ACC = { key: "gtKFFx", salt: "4R38IvwiV57FwVpsgOvTXBdLE4tHUXFW", saltVersion: "V1" };
const CFG = { values: { paymentUrl: "https://test.payu.in/_payment", postserviceUrl: "https://test.payu.in/merchant/postservice.php?form=2" } };

test("checkout form: fields, action and request hash follow PayU's formula", () => {
  const f = g.checkoutForm(CFG, ACC, { txnid: "BPTEST1", amount: "10.00", productInfo: "Order 1", firstName: "Asha", email: "a@b.in",
    phone: "9876543210", returnUrl: "https://x.test/api/pay/callback/BPTEST1", udf1: "u1" });
  assert.equal(f.action, CFG.values.paymentUrl);
  assert.equal(f.method, "POST");
  assert.equal(f.fields.surl, f.fields.furl);
  const want = sha512(`gtKFFx|BPTEST1|10.00|Order 1|Asha|a@b.in|u1||||||||||${ACC.salt}`);
  assert.equal(f.fields.hash, want);
  assert.ok(!JSON.stringify(f).includes(ACC.salt), "salt is never sent");
});

const callback = (over = {}) => {
  const b = { key: ACC.key, txnid: "BPTEST1", amount: "10.00", productinfo: "Order 1", firstname: "Asha", email: "a@b.in", udf1: "u1",
    status: "success", unmappedstatus: "captured", mihpayid: "403993715531077182", mode: "UPI", bank_ref_num: "123", error: "E000", error_Message: "No Error", ...over };
  b.hash = g.responseHash(b, ACC.salt);
  return b;
};

test("callback signature: reverse hash, key match, tampering detected", () => {
  const b = callback();
  assert.equal(b.hash, sha512(`${ACC.salt}|success||||||||||u1|a@b.in|Asha|Order 1|10.00|BPTEST1|gtKFFx`));
  assert.equal(g.verifyCallback(b, ACC), true);
  assert.equal(g.verifyCallback({ ...b, amount: "1.00" }, ACC), false, "amount changed");
  assert.equal(g.verifyCallback({ ...b, status: "failure" }, ACC), false, "status changed");
  assert.equal(g.verifyCallback({ ...b, key: "other1" }, ACC), false, "other merchant key");
  assert.equal(g.verifyCallback({ ...b, hash: "" }, ACC), false, "no hash");
  const withCharges = callback({ additionalCharges: "2.00" });
  assert.equal(withCharges.hash, sha512(`2.00|${ACC.salt}|success||||||||||u1|a@b.in|Asha|Order 1|10.00|BPTEST1|gtKFFx`));
  assert.equal(g.verifyCallback(withCharges, ACC), true);
});

test("status mapping", () => {
  const m = g.mapStatus;
  assert.equal(m("success", "captured"), "SUCCESS");
  assert.equal(m("success", ""), "SUCCESS");
  assert.equal(m("pending", "auth"), "AUTHORIZED");
  assert.equal(m("pending", "pending"), "PENDING");
  assert.equal(m("failure", "failed"), "FAILED");
  assert.equal(m("failure", "userCancelled"), "USER_CANCELLED");
  assert.equal(m("failure", "bounced"), "BOUNCED");
  assert.equal(m("failure", "dropped"), "DROPPED");
  assert.equal(m("success", "autoRefund"), "AUTO_REFUNDED");
  assert.equal(m("", ""), "PENDING", "unknown is never treated as paid");
});

test("parsed callbacks keep no hash and only masked card or UPI details", () => {
  const r = g.parseCallback(callback({ mode: "CC", cardnum: "512345XXXXXX2346", upi_va: "asha.k@okbank", additionalCharges: "2.50" }));
  assert.equal(r.status, "SUCCESS");
  assert.equal(r.method, "CREDIT_CARD");
  assert.equal(r.providerPaymentId, "403993715531077182");
  assert.equal(r.cardMasked, "512345XXXXXX2346");
  assert.equal(r.vpaMasked, "as***@okbank");
  assert.equal(r.additionalChargesPaise, 250);
  assert.equal(r.errorCode, null, "E000 means no error");
  assert.ok(!("hash" in r));
  assert.equal(g.parseCallback(callback({ cardnum: "5123456789012346" })).cardMasked, "512345XXXXXX2346", "full number is masked");
});

test("salt version 2 accounts are refused for checkout, not mis-signed", () => {
  assert.equal(g.supportsAccount({ ...ACC, saltVersion: "V2" }), false);
  assert.equal(g.supportsAccount(ACC), true);
});

test("payment routes: pages and callbacks are public, merchant actions are not", () => {
  const routes = require("../server/routes/pay");
  const find = (m, p) => routes.find(([mm, pp]) => mm === m && pp === p);
  for (const [m, p, form] of [["GET", "/pay/:token", false], ["POST", "/pay/:token/start", true], ["GET", "/pay/l/:slug", false],
    ["POST", "/pay/l/:slug", true], ["POST", "/pay/callback/:txnid", true], ["POST", "/webhooks/:connectionId", true]]) {
    const r = find(m, p);
    assert.ok(r, `${m} ${p}`);
    assert.equal(r[3].public, true, `${m} ${p} is public`);
    assert.equal(!!r[3].form, form, `${m} ${p} form posts`);
  }
  for (const [m, p] of [["POST", "/orders"], ["POST", "/transactions/:txnid/verify"]]) {
    const r = find(m, p);
    assert.ok(r && !r[3].public && !r[3].form, `${m} ${p} needs a merchant login`);
  }
});

test("public payment pages never name the provider and lock down scripts", () => {
  const o = { payToken: "tok_abcdefghijklmnop", mode: "TEST", merchantName: "Asha Store", productInfo: "Order 1", amountPaise: 1000, primaryColor: "#123456" };
  const outs = [pages.orderPage(o), pages.linkPage({ ...o, slug: "a".repeat(32), description: "Order 1" }), pages.statePage("paid", o),
    pages.handoff({ action: "https://test.payu.in/_payment", method: "POST", fields: { txnid: "X" } }, { name: "Asha Store" }, "TEST")];
  for (const r of outs) {
    assert.ok(!/payu/i.test(r.body.replace(/https:\/\/test\.payu\.in\/_payment/g, "")), "no provider name on the page");
    assert.match(r.headers["content-security-policy"], /default-src 'none'/);
    assert.equal(r.headers["x-frame-options"], "DENY");
  }
  assert.match(outs[3].headers["content-security-policy"], /script-src 'nonce-/, "only the hand-off page runs a nonce'd script");
  assert.match(outs[0].headers["content-security-policy"], /script-src 'none'/);
  assert.ok(!pages.orderPage({ ...o, productInfo: "<script>x</script>" }).body.includes("<script>x"), "escaped");
});

// PayU provider definition: which platform settings it needs, what an organisation's account looks like,
// which hosts its addresses may point at, and how to test the platform connection.
// The Super Admin screens and API are built from this file; nothing PayU-specific lives in them.
const { fail } = require("../http");

const HOSTS = /^https:\/\/([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(\/|$)/;
const saltVersion = (salt) => (String(salt).length > 32 ? "V2" : "V1");
const maskKey = (k) => (k ? (k.length <= 4 ? "••••" : k.slice(0, 2) + "•".repeat(Math.min(8, k.length - 4)) + k.slice(-2)) : null);

// Validates an organisation account (or the shared test account). prefix is added to the error field name.
function cleanAccount(input, prefix = "") {
  const mid = String((input && (input.mid ?? input.payuMid)) || "").trim();
  const key = String((input && (input.key ?? input.merchantKey)) || "").trim();
  const salt = String((input && input.salt) || "").trim();
  if (!/^\d{4,12}$/.test(mid)) fail(400, "Enter the numeric PayU merchant ID (MID).", { field: prefix + "mid" });
  if (!/^[A-Za-z0-9]{4,32}$/.test(key)) fail(400, "Enter the PayU merchant key (letters and digits).", { field: prefix + "key" });
  if (salt.length < 16 || salt.length > 512 || /\s/.test(salt)) fail(400, "Enter the PayU salt exactly as shown in the PayU dashboard.", { field: prefix + "salt" });
  return { mid: Number(mid), key, salt, saltVersion: saltVersion(salt) };
}

module.exports = {
  id: "payu",
  name: "PayU",
  hosts: HOSTS,
  hostsText: "payu.in or payumoney.com",

  // Platform settings per mode. `together` groups are saved and resolved as a unit (all set or none).
  groups: [
    { id: "partner", title: "Partner client (OAuth)", sub: "Issued by PayU for the partner, payment-link and payout APIs", together: true },
    { id: "urls", title: "Addresses", sub: "Only https addresses on payu.in or payumoney.com are accepted" },
  ],
  settings: [
    { key: "partnerClientId", group: "partner", label: "Client ID", type: "text", pattern: /^[A-Za-z0-9._-]{8,200}$/,
      error: "Enter the partner client ID exactly as PayU issued it.", env: () => ["PAYU_PARTNER_CLIENT_ID"] },
    { key: "partnerClientSecret", group: "partner", label: "Client secret", type: "secret",
      error: "Enter the partner client secret exactly as PayU issued it.", env: () => ["PAYU_PARTNER_CLIENT_SECRET"] },
    { key: "oauthUrl", group: "urls", type: "url", label: "OAuth token address", help: "Partner tokens (client credentials).",
      env: (m) => [`PAYU_${m}_OAUTH_URL`, m === "LIVE" ? "PAYU_OAUTH_URL" : null],
      default: { TEST: "https://uat-accounts.payu.in/oauth/token", LIVE: "https://accounts.payu.in/oauth/token" } },
    { key: "paymentUrl", group: "urls", type: "url", label: "Payment page address", help: "Where customers are sent to pay.",
      env: (m) => [`PAYU_${m}_PAYMENT_URL`],
      default: { TEST: "https://test.payu.in/_payment", LIVE: "https://secure.payu.in/_payment" } },
    { key: "postserviceUrl", group: "urls", type: "url", label: "Merchant API address", help: "Refunds, status checks and other postservice commands.",
      env: (m) => [`PAYU_${m}_POSTSERVICE_URL`],
      default: { TEST: "https://test.payu.in/merchant/postservice.php?form=2", LIVE: "https://info.payu.in/merchant/postservice.php?form=2" } },
    { key: "oneApiUrl", group: "urls", type: "url", label: "Payment links and onboarding API", help: "Host for the payment-link and partner APIs.",
      env: (m) => [`PAYU_${m}_ONEAPI_URL`],
      default: { TEST: "https://uatoneapi.payu.in", LIVE: "https://oneapi.payu.in" } },
  ],

  // An organisation's account with this provider. Stored in "PayuCredential" (provider = 'payu').
  account: {
    title: "PayU account",
    fields: [
      { key: "mid", label: "Merchant ID (MID)", mono: true },
      { key: "key", label: "Merchant key", mono: true },
      { key: "salt", label: "Salt", type: "secret", mono: true, help: "Salts longer than 32 characters are saved as version 2." },
    ],
    clean: cleanAccount,
    // Columns written for a cleaned account. `secret` is encrypted by the caller into "saltEnc".
    toColumns: (a) => ({ payuMid: a.mid, merchantKey: a.key, saltVersion: a.saltVersion, secret: a.salt }),
    // What Super Admin sees for a stored account: never the salt, key masked.
    display: (row) => [
      { label: "Merchant ID (MID)", value: String(row.payuMid), mono: true },
      { label: "Merchant key", value: maskKey(row.merchantKey), mono: true },
      { label: "Salt", value: `${row.saltVersion} (never shown)` },
    ],
    reference: (row) => `MID ${row.payuMid}`,
    // A shared test account handed to new organisations at sign-up (TEST only).
    sharedModes: ["TEST"],
    sharedFromEnv: (mode, e) => (mode === "TEST" && e.PAYU_TEST_MID && e.PAYU_TEST_KEY && e.PAYU_TEST_SALT
      ? { mid: e.PAYU_TEST_MID, key: e.PAYU_TEST_KEY, salt: e.PAYU_TEST_SALT } : null),
    sharedDisplay: (a) => [
      { label: "Merchant ID (MID)", value: String(a.mid), mono: true },
      { label: "Merchant key", value: maskKey(a.key), mono: true },
      { label: "Salt", value: `${a.saltVersion} (never shown)` },
    ],
  },

  // Requests a client_credentials token with the partner client. The token is discarded.
  async testConnection(r, { scope } = {}) {
    const v = r.values;
    if (!v.partnerClientId || !v.partnerClientSecret) return { ok: false, code: "NO_PARTNER", message: "No partner client ID and secret are set for this mode." };
    const form = new URLSearchParams({ grant_type: "client_credentials", client_id: v.partnerClientId, client_secret: v.partnerClientSecret });
    if (scope) form.set("scope", String(scope).slice(0, 200));
    const t0 = Date.now();
    try {
      const res = await fetch(v.oauthUrl, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(10000),
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form,
      });
      const ms = Date.now() - t0;
      let body = null; try { body = await res.json(); } catch {}
      if (res.ok && body && body.access_token)
        return { ok: true, code: "OK", status: res.status, ms, message: `PayU issued a token${body.scope ? ` for: ${String(body.scope).slice(0, 200)}` : ""}.` };
      const reason = body && (body.error_description || body.error || body.message);
      return { ok: false, code: "REJECTED", status: res.status, ms, message: reason ? String(reason).slice(0, 200) : `PayU answered HTTP ${res.status}.` };
    } catch (e) {
      return { ok: false, code: e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK", ms: Date.now() - t0,
        message: e.name === "TimeoutError" ? "PayU didn't answer within 10 seconds." : "Couldn't reach PayU's token address." };
    }
  },

  // Payment flow (docs/PAYMENTS_CORE.md §3.1). `account` = { key, salt, saltVersion } of the organisation's account;
  // `cfg` = resolved connection settings. Pure apart from fetchStatus.
  gateway: {
    // Accounts on salt version 2 need a dual-salt JSON hash; only version 1 is supported for checkout for now.
    supportsAccount: (account) => account.saltVersion !== "V2",
    amount: (paise) => (Number(paise) / 100).toFixed(2),
    checkoutForm(cfg, account, p) {
      const f = {
        key: account.key, txnid: p.txnid, amount: p.amount, productinfo: clip(p.productInfo, 100), firstname: clip(p.firstName, 60),
        email: clip(p.email, 100), phone: clip(p.phone, 15), surl: p.returnUrl, furl: p.returnUrl,
        udf1: clip(p.udf1, 255), udf2: clip(p.udf2, 255), udf3: clip(p.udf3, 255), udf4: clip(p.udf4, 255), udf5: clip(p.udf5, 255),
      };
      f.hash = requestHash(f, account.salt);
      return { action: cfg.values.paymentUrl, method: "POST", fields: f };
    },
    // The merchant key the callback says it is for.
    accountKey: (body) => String((body && body.key) || ""),
    verifyCallback: (body, account) => !!body && String(body.key || "") === account.key && safeEqual(responseHash(body, account.salt), String(body.hash || "").toLowerCase()),
    parseCallback,
    // Authoritative status from the provider. Returns a parsed result, or null when the provider doesn't know the txnid.
    async fetchStatus(cfg, account, txnid) {
      const form = new URLSearchParams({ key: account.key, command: "verify_payment", var1: txnid,
        hash: sha512(`${account.key}|verify_payment|${txnid}|${account.salt}`) });
      const res = await fetch(cfg.values.postserviceUrl, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000),
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form });
      const text = await res.text();
      let j; try { j = JSON.parse(text); } catch { throw new Error(`status check answered HTTP ${res.status}`); }
      const d = j && j.transaction_details && j.transaction_details[txnid];
      if (!d || /not found/i.test(String(d.status || ""))) return null;
      return parseCallback({ ...d, txnid, amount: d.transaction_amount || d.amt, error_Message: d.error_Message || d.Error_Message,
        cardnum: d.card_no || d.cardnum, bank_ref_num: d.bank_ref_num, error: d.error_code || d.error });
    },
  },

  saltVersion, maskKey,
};

/* ---------- PayU hashing and parsing (internal) ---------- */
const crypto = require("node:crypto");
const sha512 = (s) => crypto.createHash("sha512").update(s, "utf8").digest("hex");
const clip = (v, n) => String(v ?? "").slice(0, n);
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const UDF = ["udf1", "udf2", "udf3", "udf4", "udf5"];

// sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
function requestHash(f, salt) {
  return sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, ...UDF.map((u) => f[u] || ""), "", "", "", "", "", salt].join("|"));
}
// sha512([additionalCharges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
function responseHash(b, salt) {
  const s = (k) => String(b[k] ?? "");
  const base = [salt, s("status"), "", "", "", "", "", ...UDF.slice().reverse().map(s), s("email"), s("firstname"), s("productinfo"), s("amount"), s("txnid"), s("key")].join("|");
  return sha512(b.additionalCharges ? `${b.additionalCharges}|${base}` : base);
}

// Provider status → Bizpole Pay TransactionStatus.
function mapStatus(status, unmapped) {
  const s = String(status || "").toLowerCase(), u = String(unmapped || "").toLowerCase().replace(/\s+/g, "");
  if (u === "captured") return "SUCCESS";
  if (u === "auth") return "AUTHORIZED";
  if (u === "usercancelled") return "USER_CANCELLED";
  if (u === "bounced") return "BOUNCED";
  if (u === "dropped") return "DROPPED";
  if (u === "autorefund") return "AUTO_REFUNDED";
  if (s === "success") return "SUCCESS";
  if (s === "failure" || s === "failed") return "FAILED";
  return "PENDING";
}
const METHOD = { CC: "CREDIT_CARD", DC: "DEBIT_CARD", NB: "NET_BANKING", UPI: "UPI", CASH: "WALLET", EMI: "EMI", BNPL: "BNPL", QR: "QR", NEFT: "NEFT_RTGS", RTGS: "NEFT_RTGS" };
const paise = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100));

// Normalised callback / status result. Never includes the hash or a full card number.
function parseCallback(b) {
  const mode = String(b.mode || "").toUpperCase();
  const card = String(b.cardnum || "");
  return {
    txnid: String(b.txnid || ""),
    providerPaymentId: b.mihpayid ? String(b.mihpayid) : null,
    status: mapStatus(b.status, b.unmappedstatus),
    rawStatus: b.status ? String(b.status).slice(0, 40) : null,
    unmappedStatus: b.unmappedstatus ? String(b.unmappedstatus).slice(0, 40) : null,
    amount: b.amount != null ? String(b.amount) : null,
    method: METHOD[mode] || (mode ? "OTHER" : null),
    providerMode: mode || null,
    bankcode: b.bankcode ? String(b.bankcode).slice(0, 40) : null,
    pgType: b.PG_TYPE ? String(b.PG_TYPE).slice(0, 40) : null,
    bankRefNum: b.bank_ref_num ? String(b.bank_ref_num).slice(0, 80) : null,
    errorCode: b.error && b.error !== "E000" ? String(b.error).slice(0, 40) : null,
    errorMessage: b.error_Message && !/^no error$/i.test(b.error_Message) ? String(b.error_Message).slice(0, 300) : null,
    // PayU already masks card numbers (e.g. 512345XXXXXX2346); keep only first 6 and last 4 to be safe.
    cardMasked: card ? card.replace(/^(\d{6})?[\dX*]*?(\d{4})$/, (_, a, z) => `${a || ""}XXXXXX${z}`).slice(0, 24) : null,
    vpaMasked: b.upi_va ? String(b.upi_va).replace(/^(.{2}).*(@.*)$/, "$1***$2").slice(0, 60) : null,
    additionalChargesPaise: paise(b.additionalCharges),
    netAmountDebitPaise: paise(b.net_amount_debit),
    discountPaise: paise(b.discount),
  };
}
module.exports.gateway.mapStatus = mapStatus;
module.exports.gateway.requestHash = requestHash;
module.exports.gateway.responseHash = responseHash;

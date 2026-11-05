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

  saltVersion, maskKey,
};

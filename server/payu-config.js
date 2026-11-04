// Platform-level PayU settings per mode (docs/PAYU_PROVIDER_CONFIG.md).
// Resolution, per field: PayuProviderConfig row (Super Admin) → PAYU_* environment variables (transition fallback)
// → built-in default for the mode. Secrets are decrypted only here and never returned by publicView().
const db = require("./db");
const { fail } = require("./http");
const { encrypt, decrypt } = require("./secrets");

const MODES = ["TEST", "LIVE"];
const URL_FIELDS = ["oauthUrl", "paymentUrl", "postserviceUrl", "oneApiUrl"];
const DEFAULT_URLS = {
  TEST: {
    oauthUrl: "https://uat-accounts.payu.in/oauth/token",
    paymentUrl: "https://test.payu.in/_payment",
    postserviceUrl: "https://test.payu.in/merchant/postservice.php?form=2",
    oneApiUrl: "https://uatoneapi.payu.in",
  },
  LIVE: {
    oauthUrl: "https://accounts.payu.in/oauth/token",
    paymentUrl: "https://secure.payu.in/_payment",
    postserviceUrl: "https://info.payu.in/merchant/postservice.php?form=2",
    oneApiUrl: "https://oneapi.payu.in",
  },
};
// Same rule as the PayuProviderConfig_payu_hosts CHECK constraint.
const PAYU_URL = /^https:\/\/([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(\/|$)/;

// Environment fallback (read on every resolve so tests and redeploys see changes).
function fromEnv(mode) {
  const e = process.env, m = mode === "LIVE" ? "LIVE" : "TEST";
  const clientId = e.PAYU_PARTNER_CLIENT_ID || "", clientSecret = e.PAYU_PARTNER_CLIENT_SECRET || "";
  const out = {
    partner: clientId && clientSecret ? { clientId, clientSecret } : null,
    urls: {
      oauthUrl: e[`PAYU_${m}_OAUTH_URL`] || (m === "LIVE" ? e.PAYU_OAUTH_URL : "") || null,
      paymentUrl: e[`PAYU_${m}_PAYMENT_URL`] || null,
      postserviceUrl: e[`PAYU_${m}_POSTSERVICE_URL`] || null,
      oneApiUrl: e[`PAYU_${m}_ONEAPI_URL`] || null,
    },
    defaultCredential: null,
  };
  if (m === "TEST" && e.PAYU_TEST_MID && e.PAYU_TEST_KEY && e.PAYU_TEST_SALT)
    out.defaultCredential = { mid: Number(e.PAYU_TEST_MID), key: e.PAYU_TEST_KEY, salt: e.PAYU_TEST_SALT, saltVersion: saltVersion(e.PAYU_TEST_SALT) };
  return out;
}

const saltVersion = (salt) => (String(salt).length > 32 ? "V2" : "V1");

/* ---------- cache ---------- */
// Per process, 60 s. A save clears it in the process that saved; other Vercel instances catch up within 60 s.
const TTL_MS = 60000;
const cache = new Map();
function clearCache() { cache.clear(); }

async function readRow(mode, c = db) {
  try {
    return await (c.one || db.one)(
      `SELECT p.*, u.name AS "updatedByName", u.email AS "updatedByEmail"
         FROM "PayuProviderConfig" p LEFT JOIN "User" u ON u.id = p."updatedById" WHERE p.mode = $1`,
      [mode]
    );
  } catch (e) {
    // 42P01 = table missing: migration 20261104000000 not applied yet. Fall back to environment and defaults.
    if (e.code === "42P01") return null;
    throw e;
  }
}

// Full resolved settings for the server. Contains decrypted secrets: never send this to a client.
async function resolve(mode) {
  if (!MODES.includes(mode)) throw new Error("mode must be TEST or LIVE");
  const hit = cache.get(mode);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = merge(mode, await readRow(mode), fromEnv(mode));
  cache.set(mode, { at: Date.now(), value });
  return value;
}

// Pure merge, exported for unit tests.
function merge(mode, row, env) {
  const src = {};
  const pick = (field, dbVal, envVal, def) => {
    if (dbVal != null) { src[field] = "database"; return dbVal; }
    if (envVal != null && envVal !== "") { src[field] = "environment"; return envVal; }
    src[field] = def == null ? "none" : "default";
    return def == null ? null : def;
  };
  const partner = pick("partner",
    row && row.partnerClientId ? { clientId: row.partnerClientId, clientSecret: decrypt(row.partnerClientSecretEnc) } : null,
    env.partner, null);
  const urls = {};
  for (const f of URL_FIELDS) urls[f] = pick(f, row ? row[f] : null, env.urls[f], DEFAULT_URLS[mode][f]);
  const defaultCredential = mode !== "TEST" ? (src.defaultCredential = "none", null) : pick("defaultCredential",
    row && row.defaultMid != null ? { mid: row.defaultMid, key: row.defaultKey, salt: decrypt(row.defaultSaltEnc), saltVersion: row.defaultSaltVersion } : null,
    env.defaultCredential, null);
  return {
    mode,
    // No database row yet: keep today's behaviour (both modes usable). A saved row decides from then on.
    enabled: row ? row.enabled : true,
    stored: !!row,
    version: row ? row.version : 0,
    updatedAt: row ? row.updatedAt : null,
    updatedBy: row && row.updatedById ? { name: row.updatedByName, email: row.updatedByEmail } : null,
    partner, urls, defaultCredential, sources: src,
  };
}

const mask = (s) => (s ? "•".repeat(Math.min(8, Math.max(0, s.length - 4))) + s.slice(-4) : null);
const maskKey = (k) => (k ? (k.length <= 4 ? "••••" : k.slice(0, 2) + "•".repeat(Math.min(8, k.length - 4)) + k.slice(-2)) : null);

// What Super Admin may see. Secrets become { set, last4 }; the merchant key is masked; salts are never included.
function publicView(r) {
  return {
    mode: r.mode, enabled: r.enabled, stored: r.stored, version: r.version, updatedAt: r.updatedAt, updatedBy: r.updatedBy,
    partner: r.partner ? { clientId: r.partner.clientId, secret: { set: true, last4: r.partner.clientSecret.slice(-4) }, source: r.sources.partner }
      : { clientId: null, secret: { set: false }, source: "none" },
    urls: Object.fromEntries(URL_FIELDS.map((f) => [f, { value: r.urls[f], source: r.sources[f], default: DEFAULT_URLS[r.mode][f] }])),
    defaultCredential: r.defaultCredential
      ? { mid: String(r.defaultCredential.mid), key: maskKey(r.defaultCredential.key), saltVersion: r.defaultCredential.saltVersion, source: r.sources.defaultCredential }
      : null,
  };
}

/* ---------- validation ---------- */
function cleanUrl(field, v) {
  if (v === undefined) return undefined;            // not sent: unchanged
  const s = String(v ?? "").trim();
  if (!s) return null;                               // blank: back to the default
  let u;
  try { u = new URL(s); } catch { fail(400, "Enter a full https:// address.", { field }); }
  if (u.username || u.password) fail(400, "Addresses can't contain a user name or password.", { field });
  const norm = u.toString();
  if (!PAYU_URL.test(norm)) fail(400, "Only https addresses on payu.in or payumoney.com are allowed.", { field });
  return norm.length > 300 ? fail(400, "That address is too long.", { field }) : norm;
}
function cleanMerchantCredential(input, field = "") {
  const mid = String((input && (input.mid ?? input.payuMid)) || "").trim();
  const key = String((input && (input.key ?? input.merchantKey)) || "").trim();
  const salt = String((input && input.salt) || "").trim();
  if (!/^\d{4,12}$/.test(mid)) fail(400, "Enter the numeric PayU merchant ID (MID).", { field: field + "mid" });
  if (!/^[A-Za-z0-9]{4,32}$/.test(key)) fail(400, "Enter the PayU merchant key (letters and digits).", { field: field + "key" });
  if (salt.length < 16 || salt.length > 512 || /\s/.test(salt)) fail(400, "Enter the PayU salt exactly as shown in the PayU dashboard.", { field: field + "salt" });
  return { mid: Number(mid), key, salt, saltVersion: saltVersion(salt) };
}

/* ---------- save ---------- */
// patch: { version, enabled?, partnerClientId?, partnerClientSecret?, clearPartner?, <url fields>?, defaultCredential?, clearDefault? }
// Returns { changed: [field names], enabledBefore, enabledAfter }. Never returns or logs secret values.
async function save(mode, patch, userId) {
  if (!MODES.includes(mode)) fail(400, "mode must be test or live");
  const p = patch || {};
  const expected = Number(p.version ?? -1);
  return db.tx(async (c) => {
    await c.q(`SELECT pg_advisory_xact_lock(hashtext('PayuProviderConfig:' || $1::text))`, [mode]);
    const row = await c.one(`SELECT * FROM "PayuProviderConfig" WHERE mode = $1 FOR UPDATE`, [mode]);
    if ((row ? row.version : 0) !== expected)
      fail(409, "Someone else changed these settings since you opened them. Reload and try again.", { code: "VERSION_CONFLICT" });

    const next = row ? { ...row } : { enabled: false, partnerClientId: null, partnerClientSecretEnc: null, oauthUrl: null, paymentUrl: null,
      postserviceUrl: null, oneApiUrl: null, defaultMid: null, defaultKey: null, defaultSaltEnc: null, defaultSaltVersion: null };
    const changed = [];

    if (p.enabled !== undefined) {
      if (typeof p.enabled !== "boolean") fail(400, "enabled must be true or false.", { field: "enabled" });
      if (p.enabled !== next.enabled) { next.enabled = p.enabled; changed.push("enabled"); }
    }

    if (p.clearPartner === true) {
      if (next.partnerClientId) changed.push("partnerClientId", "partnerClientSecret");
      next.partnerClientId = null; next.partnerClientSecretEnc = null;
    } else {
      if (p.partnerClientId !== undefined) {
        const id = String(p.partnerClientId || "").trim();
        if (!/^[A-Za-z0-9._-]{8,200}$/.test(id)) fail(400, "Enter the partner client ID exactly as PayU issued it.", { field: "partnerClientId" });
        if (id !== next.partnerClientId) { next.partnerClientId = id; changed.push("partnerClientId"); }
      }
      const secret = String(p.partnerClientSecret || "").trim();
      if (secret) {
        if (secret.length < 16 || secret.length > 512 || /\s/.test(secret)) fail(400, "Enter the partner client secret exactly as PayU issued it.", { field: "partnerClientSecret" });
        next.partnerClientSecretEnc = encrypt(secret); changed.push("partnerClientSecret");
      }
      if ((next.partnerClientId == null) !== (next.partnerClientSecretEnc == null))
        fail(400, next.partnerClientId ? "Enter the partner client secret as well." : "Enter the partner client ID as well.", { field: next.partnerClientId ? "partnerClientSecret" : "partnerClientId" });
    }

    for (const f of URL_FIELDS) {
      const v = cleanUrl(f, p[f]);
      if (v !== undefined && v !== next[f]) { next[f] = v; changed.push(f); }
    }

    if (p.clearDefault === true) {
      if (next.defaultMid != null) changed.push("defaultCredential");
      next.defaultMid = next.defaultKey = next.defaultSaltEnc = next.defaultSaltVersion = null;
    } else if (p.defaultCredential) {
      if (mode !== "TEST") fail(400, "A shared credential can only be set for test mode.", { field: "defaultCredential" });
      const d = cleanMerchantCredential(p.defaultCredential, "default.");
      Object.assign(next, { defaultMid: d.mid, defaultKey: d.key, defaultSaltEnc: encrypt(d.salt), defaultSaltVersion: d.saltVersion });
      changed.push("defaultCredential");
    }

    if (!changed.length) return { changed, enabledBefore: row ? row.enabled : null, enabledAfter: next.enabled, version: row ? row.version : 0 };

    const vals = [next.enabled, next.partnerClientId, next.partnerClientSecretEnc, next.oauthUrl, next.paymentUrl, next.postserviceUrl, next.oneApiUrl,
      next.defaultMid, next.defaultKey, next.defaultSaltEnc, next.defaultSaltVersion, userId];
    let version;
    if (row) {
      version = row.version + 1;
      await c.q(
        `UPDATE "PayuProviderConfig" SET enabled=$1, "partnerClientId"=$2, "partnerClientSecretEnc"=$3, "oauthUrl"=$4, "paymentUrl"=$5,
                "postserviceUrl"=$6, "oneApiUrl"=$7, "defaultMid"=$8, "defaultKey"=$9, "defaultSaltEnc"=$10, "defaultSaltVersion"=$11,
                "updatedById"=$12, version=$13, "updatedAt"=now() WHERE id=$14`,
        [...vals, version, row.id]
      );
    } else {
      version = 1;
      await c.q(
        `INSERT INTO "PayuProviderConfig" (enabled,"partnerClientId","partnerClientSecretEnc","oauthUrl","paymentUrl","postserviceUrl","oneApiUrl",
                "defaultMid","defaultKey","defaultSaltEnc","defaultSaltVersion","updatedById",id,mode,version,"updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,now())`,
        [...vals, db.id(), mode]
      );
    }
    clearCache();
    return { changed, enabledBefore: row ? row.enabled : null, enabledAfter: next.enabled, version };
  });
}

/* ---------- connection test ---------- */
// Requests a client_credentials token with the saved partner client. The token is discarded.
async function testConnection(mode, { scope } = {}) {
  const r = await resolve(mode);
  if (!r.partner) return { ok: false, code: "NO_PARTNER", message: "No partner client ID and secret are set for this mode." };
  const form = new URLSearchParams({ grant_type: "client_credentials", client_id: r.partner.clientId, client_secret: r.partner.clientSecret });
  if (scope) form.set("scope", String(scope).slice(0, 200));
  const t0 = Date.now();
  try {
    const res = await fetch(r.urls.oauthUrl, {
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
}

module.exports = {
  MODES, URL_FIELDS, DEFAULT_URLS, PAYU_URL,
  resolve, merge, publicView, save, clearCache, testConnection, cleanUrl, cleanMerchantCredential, saltVersion, maskKey, mask,
};

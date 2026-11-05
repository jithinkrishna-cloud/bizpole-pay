// PayU adapter: credential lookup and postservice commands.
// Platform settings (addresses, partner client, shared test account, on/off) come from the provider connection active
// in the mode (server/providers/config.js); each organisation's MID, key and salt come from PayuCredential (provider = 'payu').
const crypto = require("node:crypto");
const db = require("./db");
const { fail } = require("./http");
const { encrypt, decrypt } = require("./secrets");
const config = require("./providers/config");

const sha512 = (s) => crypto.createHash("sha512").update(s).digest("hex");

// Default ACTIVE credential for (merchant, mode), or null.
async function credential(merchantId, mode, c = db) {
  return (c.one || db.one)(
    `SELECT id, "payuMid", "merchantKey", "saltEnc", "saltVersion" FROM "PayuCredential"
      WHERE "merchantId"=$1 AND mode=$2 AND provider='payu' AND "isDefault" AND status='ACTIVE' LIMIT 1`,
    [merchantId, mode]
  );
}

// The organisation's credential, provided the active connection for this mode is a PayU one and is switched on.
async function requireCredential(merchantId, mode, c) {
  const cfg = await config.resolve(mode);
  if (!cfg || cfg.provider !== "payu" || !cfg.enabled)
    fail(409, mode === "LIVE"
      ? "Live payments are paused on Bizpole Pay right now. Contact Bizpole support."
      : "Test payments are paused on Bizpole Pay right now. Contact Bizpole support.");
  const cred = await credential(merchantId, mode, c);
  if (!cred)
    fail(409, mode === "LIVE"
      ? "Live mode is not active yet. Finish onboarding to go live."
      : "No test payment account is set up for your business yet. Contact Bizpole support.");
  return cred;
}

// New organisations get the shared test account, when one is configured (Super Admin → Provider settings → Test,
// else PAYU_TEST_MID / PAYU_TEST_KEY / PAYU_TEST_SALT). PayU keys are unique, so only the first organisation gets it;
// Super Admin assigns test accounts to the others.
async function provisionTestCredential(c, merchantId) {
  if (!process.env.DATA_ENCRYPTION_KEY) return null;
  const r = await config.resolve("TEST");
  const d = r && r.provider === "payu" ? r.sharedAccount : null;
  if (!d) return null;
  const taken = await c.one(`SELECT 1 FROM "PayuCredential" WHERE mode='TEST' AND "merchantKey"=$1 AND "saltVersion"=$2`, [d.key, d.saltVersion]);
  if (taken) return null;
  const id = db.id();
  await c.q(
    `INSERT INTO "PayuCredential" (id,"merchantId",provider,mode,"payuMid","merchantKey","saltVersion","saltEnc","isDefault",label,source)
     VALUES ($1,$2,'payu','TEST',$3,$4,$5,$6,true,'Test account','PLATFORM')`,
    [id, merchantId, Number(d.mid), d.key, d.saltVersion, encrypt(d.salt)]
  );
  return id;
}

// postservice: hash = sha512(key|command|var1|salt)
async function postservice(cred, mode, command, vars) {
  const cfg = await config.resolveType(mode, "payu");
  if (!cfg) fail(409, "Payments are not available right now. Contact Bizpole support.");
  const urls = cfg.values;
  const salt = decrypt(cred.saltEnc);
  const form = new URLSearchParams({ key: cred.merchantKey, command, hash: sha512(`${cred.merchantKey}|${command}|${vars.var1}|${salt}`) });
  Object.entries(vars).forEach(([k, v]) => v != null && form.set(k, String(v)));
  const res = await fetch(urls.postserviceUrl, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: 0, msg: text.slice(0, 300) }; }
}

module.exports = { credential, requireCredential, provisionTestCredential, postservice, sha512 };

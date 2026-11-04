// PayU adapter: credential lookup and postservice commands.
// Platform settings (endpoints, partner client, shared test credential, on/off per mode) come from
// server/payu-config.js; each organisation's MID, key and salt come from PayuCredential.
const crypto = require("node:crypto");
const db = require("./db");
const { fail } = require("./http");
const { encrypt, decrypt } = require("./secrets");
const config = require("./payu-config");

const sha512 = (s) => crypto.createHash("sha512").update(s).digest("hex");

// Default ACTIVE credential for (merchant, mode), or null.
async function credential(merchantId, mode, c = db) {
  return (c.one || db.one)(
    `SELECT id, "payuMid", "merchantKey", "saltEnc", "saltVersion" FROM "PayuCredential"
      WHERE "merchantId"=$1 AND mode=$2 AND "isDefault" AND status='ACTIVE' LIMIT 1`,
    [merchantId, mode]
  );
}

// The organisation's credential, provided the platform has this mode switched on.
async function requireCredential(merchantId, mode, c) {
  const cfg = await config.resolve(mode);
  if (!cfg.enabled)
    fail(409, mode === "LIVE"
      ? "Live payments are paused on Bizpole Pay right now. Contact Bizpole support."
      : "Test payments are paused on Bizpole Pay right now. Contact Bizpole support.");
  const cred = await credential(merchantId, mode, c);
  if (!cred)
    fail(409, mode === "LIVE"
      ? "Live mode is not active yet. Finish onboarding to get live PayU credentials."
      : "No PayU test account is linked to this organisation yet. Contact Bizpole support to set one up.");
  return cred;
}

// New organisations get the shared test credential, when one is configured (Super Admin → PayU settings → Test,
// else PAYU_TEST_MID / PAYU_TEST_KEY / PAYU_TEST_SALT). PayU keys are unique, so only the first organisation gets it;
// Super Admin assigns test accounts to the others.
async function provisionTestCredential(c, merchantId) {
  if (!process.env.DATA_ENCRYPTION_KEY) return null;
  const d = (await config.resolve("TEST")).defaultCredential;
  if (!d) return null;
  const taken = await c.one(`SELECT 1 FROM "PayuCredential" WHERE mode='TEST' AND "merchantKey"=$1 AND "saltVersion"=$2`, [d.key, d.saltVersion]);
  if (taken) return null;
  const id = db.id();
  await c.q(
    `INSERT INTO "PayuCredential" (id,"merchantId",mode,"payuMid","merchantKey","saltVersion","saltEnc","isDefault",label,source)
     VALUES ($1,$2,'TEST',$3,$4,$5,$6,true,'Test MID','PLATFORM')`,
    [id, merchantId, Number(d.mid), d.key, d.saltVersion, encrypt(d.salt)]
  );
  return id;
}

// postservice: hash = sha512(key|command|var1|salt)
async function postservice(cred, mode, command, vars) {
  const { urls } = await config.resolve(mode);
  const salt = decrypt(cred.saltEnc);
  const form = new URLSearchParams({ key: cred.merchantKey, command, hash: sha512(`${cred.merchantKey}|${command}|${vars.var1}|${salt}`) });
  Object.entries(vars).forEach(([k, v]) => v != null && form.set(k, String(v)));
  const res = await fetch(urls.postserviceUrl, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: 0, msg: text.slice(0, 300) }; }
}

module.exports = { credential, requireCredential, provisionTestCredential, postservice, sha512 };

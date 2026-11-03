// PayU adapter. Only what the dashboard needs today: credential lookup and postservice commands.
const crypto = require("node:crypto");
const db = require("./db");
const { fail } = require("./http");
const { encrypt, decrypt } = require("./secrets");

const sha512 = (s) => crypto.createHash("sha512").update(s).digest("hex");
const POSTSERVICE = {
  TEST: () => process.env.PAYU_TEST_POSTSERVICE_URL || "https://test.payu.in/merchant/postservice.php?form=2",
  LIVE: () => process.env.PAYU_LIVE_POSTSERVICE_URL || "https://info.payu.in/merchant/postservice.php?form=2",
};

// Default ACTIVE credential for (merchant, mode), or null.
async function credential(merchantId, mode, c = db) {
  return (c.one || db.one)(
    `SELECT id, "payuMid", "merchantKey", "saltEnc", "saltVersion" FROM "PayuCredential"
      WHERE "merchantId"=$1 AND mode=$2 AND "isDefault" AND status='ACTIVE' LIMIT 1`,
    [merchantId, mode]
  );
}
async function requireCredential(merchantId, mode, c) {
  const cred = await credential(merchantId, mode, c);
  if (!cred)
    fail(409, mode === "LIVE"
      ? "Live mode is not active yet. Finish onboarding to get live PayU credentials."
      : "No PayU test credentials on this account yet. Add your PayU test key and salt in Developer → API keys.");
  return cred;
}

// New merchants get a test credential when the platform has PayU test keys configured
// (PAYU_TEST_MID / PAYU_TEST_KEY / PAYU_TEST_SALT). PayU keys are unique, so only the first merchant gets the shared key;
// others add their own in Developer.
async function provisionTestCredential(c, merchantId) {
  const { PAYU_TEST_MID: mid, PAYU_TEST_KEY: key, PAYU_TEST_SALT: salt } = process.env;
  if (!mid || !key || !salt || !process.env.DATA_ENCRYPTION_KEY) return null;
  const version = salt.length > 32 ? "V2" : "V1";
  const taken = await c.one(`SELECT 1 FROM "PayuCredential" WHERE mode='TEST' AND "merchantKey"=$1 AND "saltVersion"=$2`, [key, version]);
  if (taken) return null;
  const id = db.id();
  await c.q(
    `INSERT INTO "PayuCredential" (id,"merchantId",mode,"payuMid","merchantKey","saltVersion","saltEnc","isDefault",label)
     VALUES ($1,$2,'TEST',$3,$4,$5,$6,true,'Test MID')`,
    [id, merchantId, Number(mid), key, version, encrypt(salt)]
  );
  return id;
}

// postservice: hash = sha512(key|command|var1|salt)
async function postservice(cred, mode, command, vars) {
  const salt = decrypt(cred.saltEnc);
  const form = new URLSearchParams({ key: cred.merchantKey, command, hash: sha512(`${cred.merchantKey}|${command}|${vars.var1}|${salt}`) });
  Object.entries(vars).forEach(([k, v]) => v != null && form.set(k, String(v)));
  const res = await fetch(POSTSERVICE[mode](), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: 0, msg: text.slice(0, 300) }; }
}

module.exports = { credential, requireCredential, provisionTestCredential, postservice, sha512 };

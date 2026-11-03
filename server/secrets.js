// Hashing and envelope encryption helpers.
const crypto = require("node:crypto");

// Passwords: scrypt (Node built-in). Stored as "scrypt$N$r$p$salt$hash" (base64url).
const N = 16384, R = 8, P = 1, KEYLEN = 64;
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, n, r, p, salt, hash] = stored.split("$");
  const expected = Buffer.from(hash, "base64url");
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, "base64url"), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(got, expected);
}

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const token = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

// *Enc columns: "v1:<keyId>:<base64(iv|ciphertext|tag)>", AES-256-GCM with DATA_ENCRYPTION_KEY.
function key() {
  const raw = process.env.DATA_ENCRYPTION_KEY || "";
  const b = Buffer.from(raw.replace(/^base64:/, ""), "base64");
  if (b.length !== 32) {
    const e = new Error("DATA_ENCRYPTION_KEY must be a base64 32-byte key");
    e.status = 500;
    throw e;
  }
  return b;
}
const KEY_ID = () => process.env.DATA_ENCRYPTION_KEY_ID || "k1";
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return `v1:${KEY_ID()}:${Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64")}`;
}
function decrypt(enc) {
  const [v, , b64] = String(enc).split(":");
  if (v !== "v1") throw new Error("unknown envelope version");
  const buf = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString("utf8");
}

module.exports = { hashPassword, verifyPassword, sha256, token, encrypt, decrypt };

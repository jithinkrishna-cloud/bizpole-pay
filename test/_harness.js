// Shared setup for integration tests: a disposable branch database, the real router over HTTP, and cookie helpers.
// Not a test file itself (npm test only runs test/*.test.js).
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const url = process.env.TEST_DATABASE_URL;
const hostOf = (u) => { try { return new URL(u).hostname.replace("-pooler", ""); } catch { return null; } };
function appHost() {
  const f = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
  return m ? hostOf(m[1]) : null;
}
// Refuses the database the app is configured for, so tests never write to it.
const skip = !url ? "TEST_DATABASE_URL not set" : hostOf(url) === appHost() ? "TEST_DATABASE_URL is the app database; use a test branch" : false;

async function start() {
  process.env.DATABASE_URL = url;
  process.env.DATA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("base64");
  const db = require("../server/db");
  const { handle } = require("../server/router");
  const server = http.createServer((req, res) => handle(req, res, req.url.split("?")[0].slice(4)));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(p, { method = "GET", body, cookie } = {}) {
    const res = await fetch(base + p, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie"), raw = await res.text();
    let json = null; try { json = JSON.parse(raw); } catch {}
    return { status: res.status, body: json, raw, headers: res.headers, cookie: set ? set.split(";")[0] : null };
  }
  const stop = async () => { server.close(); await db.getPool().end(); };
  return { db, call, stop };
}

const tag = () => crypto.randomBytes(4).toString("hex");
const mobile = () => "+919" + String(crypto.randomInt(1e8, 1e9));

module.exports = { skip, start, tag, mobile };

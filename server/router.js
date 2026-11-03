// Single entry point for /api/*. Used by scripts/serve.js locally and api/index.js on Vercel.
const { compile, readBody, send, HttpError } = require("./http");
const { routes: authRoutes, getAuth } = require("./auth");
const db = require("./db");

// Each module exports an array of [method, path, handler, opts?]. Paths are relative to /api.
const table = compile([
  ...authRoutes,
  ...require("./routes/public"),
  ...require("./routes/payments"),
  ...require("./routes/links"),
  ...require("./routes/checkout"),
  ...require("./routes/subscriptions"),
  ...require("./routes/split"),
  ...require("./routes/payouts"),
  ...require("./routes/chargebacks"),
  ...require("./routes/reports"),
  ...require("./routes/products"),
  ...require("./routes/onboarding"),
  ...require("./routes/settings"),
  ...require("./routes/developer"),
]);

const WRITE_ROLES = ["OWNER", "ADMIN", "FINANCE", "DEVELOPER"];

async function handle(req, res, path) {
  const extra = {};
  try {
    const url = new URL(req.url, "http://x");
    const query = Object.fromEntries(url.searchParams);
    const p = "/" + String(path).replace(/^\/+|\/+$/g, "");
    const hit = table.find((r) => r.method === req.method && r.re.test(p));
    if (!hit) {
      const any = table.some((r) => r.re.test(p));
      throw new HttpError(any ? 405 : 404, any ? "Method not allowed" : "Not found");
    }
    const m = p.match(hit.re);
    const params = Object.fromEntries(hit.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? await readBody(req) : {};

    // Same-origin JSON only for writes (cheap CSRF guard on top of SameSite=Lax cookies).
    if (req.method !== "GET" && !String(req.headers["content-type"] || "").includes("application/json") && req.headers["content-length"] !== "0")
      throw new HttpError(415, "Send JSON");

    const auth = await getAuth(req);
    if (!hit.opts.public && !auth) throw new HttpError(401, "Please log in again.");
    if (auth && !hit.opts.public && !auth.merchantId) throw new HttpError(403, "No merchant account on this login.");
    if (auth && req.method !== "GET" && !hit.opts.public && !hit.opts.anyRole && !WRITE_ROLES.includes(auth.role))
      throw new HttpError(403, "Your role can only view this account.");

    const ctx = {
      req, res, params, query, body, auth,
      mode: db.dbMode(query.mode || body.mode || "test"),
      setHeader: (k, v) => (extra[k] = v),
    };
    const out = await hit.handler(ctx);
    if (out && out.__raw) {
      res.writeHead(200, { "cache-control": "no-store", ...out.headers, ...extra });
      return res.end(out.body);
    }
    send(res, 200, out === undefined ? { ok: true } : out, extra);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500 && !(e instanceof HttpError)) console.error("[api]", req.method, path, e);
    // Constraint violations from Postgres (CHECK / unique / trigger) come back as 409 with a readable message.
    if (!e.status && e.code && /^(23|P0)/.test(e.code)) return send(res, 409, { error: e.code === "23505" ? "That already exists." : e.message }, extra);
    // Deliberate errors (fail()/HttpError, e.g. 501 "not available yet") keep their message; unexpected ones are hidden.
    const msg = e instanceof HttpError || status < 500 ? e.message : "Something went wrong. Try again.";
    send(res, status, { error: msg, ...(e.extra || {}) }, extra);
  }
}

module.exports = { handle };

// Single entry point for /api/*. Used by scripts/serve.js locally and api/index.js on Vercel.
const { compile, readBody, send, HttpError } = require("./http");
const { routes: authRoutes, getAuth } = require("./auth");
const db = require("./db");

// Each module exports an array of [method, path, handler, opts?]. Paths are relative to /api.
const table = compile([
  ...authRoutes,
  ...require("./routes/public"),
  ...require("./routes/pay"),
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
  ...require("./routes/super"),
]);

const WRITE_ROLES = ["OWNER", "ADMIN", "FINANCE", "DEVELOPER"];

// Server-side gate. Platform routes do not fall through to merchant membership checks.
function platformMode(value) {
  const raw = String(value || "").toLowerCase();
  if (!raw || raw === "all") return null;
  return db.dbMode(raw);
}

function authorize(hit, auth, method) {
  if (hit.opts.public) return null;
  if (!auth) return { status: 401, message: "Please log in again." };
  if (hit.opts.platform) {
    if (auth.platformRole !== "SUPER_ADMIN") return { status: 403, message: "Super Admin access is required." };
    return null;
  }
  if (hit.opts.session) return null;
  if (!auth.merchantId) return { status: 403, message: "No merchant account on this login." };
  // opts.roles replaces WRITE_ROLES for one route (docs/MODULES.md role table).
  if (method !== "GET" && !hit.opts.anyRole && !(hit.opts.roles || WRITE_ROLES).includes(auth.role))
    return { status: 403, message: hit.opts.roles ? "Your role can't do this on this account." : "Your role can only view this account." };
  return null;
}

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
    const body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? await readBody(req, { form: !!hit.opts.form }) : {};

    // Same-origin JSON only for writes (cheap CSRF guard on top of SameSite=Lax cookies). Public provider callbacks
    // (opts.form) accept form posts: they carry no session and are verified by the provider's signature instead.
    if (req.method !== "GET" && !hit.opts.form && !String(req.headers["content-type"] || "").includes("application/json") && req.headers["content-length"] !== "0")
      throw new HttpError(415, "Send JSON");

    const auth = await getAuth(req);
    const denied = authorize(hit, auth, req.method);
    if (denied) throw new HttpError(denied.status, denied.message);

    const ctx = {
      req, res, params, query, body, auth,
      // Merchant routes default to test. Platform routes treat "all" or a missing mode as every mode.
      // Public routes take no mode from the request (provider callbacks carry their own "mode" field, e.g. "UPI").
      mode: hit.opts.public ? null : hit.opts.platform ? platformMode(query.mode) : db.dbMode(query.mode || body.mode || "test"),
      setHeader: (k, v) => (extra[k] = v),
    };
    const out = await hit.handler(ctx);
    if (out && out.__raw) {
      res.writeHead(out.status || 200, { "cache-control": "no-store", ...out.headers, ...extra });
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

module.exports = { handle, authorize, platformMode, WRITE_ROLES };

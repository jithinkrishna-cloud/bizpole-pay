// Minimal router shared by the local dev server and the Vercel function.
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

// Route modules export: [["GET", "/links/:id", handler], ...]
// handler(ctx) → value (sent as JSON). ctx = { req, res, params, query, body, auth, mode }
function compile(routes) {
  return routes.map(([method, path, handler, opts = {}]) => {
    const keys = [];
    const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
    return { method, re, keys, handler, opts };
  });
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? safeJson(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 12 * 1024 * 1024) fail(413, "Request body too large");
    chunks.push(c);
  }
  return chunks.length ? safeJson(Buffer.concat(chunks).toString("utf8")) : {};
}
function safeJson(s) {
  try { return s ? JSON.parse(s) : {}; } catch { fail(400, "Body must be JSON"); }
}

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body, (_, v) => (typeof v === "bigint" ? Number(v) : v));
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(json);
}

module.exports = { HttpError, fail, compile, readBody, send };

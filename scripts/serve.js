// Dev server: static files from public/ plus the API at /api/*. node scripts/serve.js [port]
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env.local"), quiet: true });
require("dotenv").config({ quiet: true });
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { handle } = require("../server/router");

const root = path.join(__dirname, "..", "public");
const port = Number(process.argv[2]) || 8765;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".csv": "text/csv" };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/api" || url.startsWith("/api/")) {
    // Dev only: let pages served by another local static server (VS Code Live Server :5500, etc.) call the API.
    const origin = req.headers.origin || "";
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("access-control-expose-headers", "content-disposition, x-row-count");
      res.setHeader("vary", "origin");
    }
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    return handle(req, res, url.slice(4));
  }
  const file = path.normalize(path.join(root, url === "/" ? "index.html" : url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  });
}).listen(port, "127.0.0.1", () => console.log(`Paynest: http://127.0.0.1:${port}/`));

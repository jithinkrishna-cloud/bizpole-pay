// Merchants and their customers only ever see "Bizpole Pay". Which payment provider is connected is known only to
// Super Admin (public/super, server/routes/super, server/providers). These checks keep the provider's name out of
// everything else that reaches a browser or a merchant: page text, code comments shipped to the browser, and API
// error messages. Lower-case field names from the database (e.g. mihpayid, payuStatus) are not checked here.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const ls = (dir, ext) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
const PROVIDER = /PayU/;

test("merchant pages and the public site never name the payment provider", () => {
  const files = ["public/app.html", "public/index.html", ...ls("public/pages", ".js")];
  const hits = [];
  for (const f of files)
    read(f).split("\n").forEach((line, i) => { if (PROVIDER.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  assert.deepEqual(hits, [], "provider name found in merchant-facing files");
});

test("API errors sent to merchants never name the payment provider", () => {
  const files = ["server/payu.js", "server/payments-core.js", "server/pay-pages.js", ...ls("server/routes", ".js")];
  const hits = [];
  // fail(status, "message"…) – the message is returned to the browser as { error }.
  const FAIL = /fail\(\s*\d{3}\s*,\s*(?:[^,()]*\?\s*)?(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(FAIL)) if (PROVIDER.test(m[2])) hits.push(`${f}: ${m[2].slice(0, 120)}`);
    // Ternary messages: fail(409, cond ? "a" : "b")
    for (const m of src.matchAll(/fail\(\s*\d{3}\s*,[^;]*?;/gs))
      for (const s of m[0].matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) if (PROVIDER.test(s[2]) && !hits.some((h) => h.includes(s[2].slice(0, 40)))) hits.push(`${f}: ${s[2].slice(0, 120)}`);
  }
  assert.deepEqual(hits, [], "provider name found in merchant-facing API errors");
});

test("merchants can't read or change provider settings", () => {
  const routes = require("../server/routes/super");
  for (const [m, p, , opts] of routes)
    if (/provider|payu/i.test(p)) assert.equal(opts && opts.platform, true, `${m} ${p} must be Super Admin only`);
});

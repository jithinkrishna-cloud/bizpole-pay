// Static checks on the Super Admin control centre (public/super.html, public/super/**). No browser or database needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pub = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(pub, "super.html"), "utf8");
const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? jsFiles(path.join(dir, d.name)) : d.name.endsWith(".js") ? [path.join(dir, d.name)] : []));

test("super.html declares a strict CSP with no inline script allowance", () => {
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  assert.ok(csp, "CSP meta tag present");
  const script = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src"));
  assert.equal(script, "script-src 'self' https://cdnjs.cloudflare.com");
  for (const d of ["object-src 'none'", "base-uri 'none'", "connect-src 'self'"]) assert.ok(csp.includes(d), d);
});

test("no inline scripts or inline event handlers", () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  for (const [, attrs, body] of scripts) {
    assert.match(attrs, /\bsrc="/, "every script is external");
    assert.equal(body.trim(), "", "no inline script body");
  }
  assert.ok(!/\son[a-z]+\s*=/i.test(html), "no on*= attributes in super.html");
  for (const f of jsFiles(path.join(pub, "super")))
    assert.ok(!/\son(click|load|error|submit|input|change|mouse\w*|key\w*)\s*=/i.test(fs.readFileSync(f, "utf8")), `no on*= handlers generated in ${path.basename(f)}`);
});

test("third-party scripts are version-pinned with SRI", () => {
  const ext = [...html.matchAll(/<script\b[^>]*src="(https:[^"]+)"[^>]*>/g)];
  assert.ok(ext.length >= 1);
  for (const [tag, src] of ext) {
    assert.match(src, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/[^/]+\/\d+\.\d+\.\d+\//, `${src} is pinned to an exact version`);
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, `${src} has an integrity hash`);
    assert.match(tag, /crossorigin="anonymous"/);
  }
});

test("every control-centre script parses", () => {
  const files = jsFiles(path.join(pub, "super"));
  assert.ok(files.length >= 5);
  for (const f of files) assert.doesNotThrow(() => new vm.Script(fs.readFileSync(f, "utf8"), { filename: f }), path.basename(f));
  for (const [, src] of html.matchAll(/<script src="(super\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(pub, src)), `${src} exists`);
});

test("one sign-in page: the merchant app only redirects Super Admins, and never calls the platform API", () => {
  const app = fs.readFileSync(path.join(pub, "app.html"), "utf8");
  assert.ok(!/\/api\/super\//.test(app), "app.html never calls /api/super");
  const refs = app.match(/super\.html/g) || [];
  assert.equal(refs.length, 1, "exactly one reference, inside toControlCentre()");
  const fn = app.match(/function toControlCentre\(me\) \{([\s\S]*?)\n      \}/);
  assert.ok(fn, "toControlCentre() exists");
  assert.match(fn[1], /me\.platformRole !== "SUPER_ADMIN"\) return false/, "non-operators are never redirected");
  assert.match(fn[1], /location\.replace\("\/super\.html"\)/, "fixed target, no open redirect");
  assert.ok(/async function signedIn\(me, msg\) \{\s*if \(toControlCentre\(me\)\) return;/.test(app), "checked after every sign-in");
  assert.ok(/const me = await api\("\/auth\/me"[^\n]*\n\s*if \(toControlCentre\(me\)\) return;/.test(app), "checked when a session is restored");
  for (const f of jsFiles(path.join(pub, "pages"))) assert.ok(!/super\.html|\/super\//.test(fs.readFileSync(f, "utf8")), path.basename(f));
});

test("the Access and permissions table matches what the server enforces", () => {
  const SA = { pages: {}, esc: String, fmt: {}, ui: {} };
  vm.runInNewContext(fs.readFileSync(path.join(pub, "super", "pages", "users.js"), "utf8"), { SA, window: { SA } });
  const perm = Object.fromEntries(SA.PERMISSIONS.map(([label, roles]) => [label.split(/[:(]/)[0].trim(), [...roles].sort()]));
  const ALL = ["ADMIN", "DEVELOPER", "FINANCE", "OWNER", "SUPPORT", "VIEWER"];
  const { WRITE_ROLES } = require("../server/router");
  const routeRoles = (mod, m, p) => require(`../server/routes/${mod}`).find(([mm, pp]) => mm === m && pp === p)[3].roles;
  const constant = (file, name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "server", "routes", file), "utf8")
    .match(new RegExp(`const ${name} = (\\[[^\\]]+\\])`))[1].replace(/'/g, '"'));
  const sorted = (a) => [...a].sort();
  assert.deepEqual(perm["View every page of the organization's dashboard"], ALL);
  assert.deepEqual(perm["Refund a payment"], sorted(routeRoles("payments", "POST", "/refunds")));
  assert.deepEqual(perm["Create a payment link"], sorted(routeRoles("links", "POST", "/links")));
  // Developer routes pass the router's write gate first, then DEV_ROLES.
  assert.deepEqual(perm["Developer settings"], sorted(constant("developer.js", "DEV_ROLES").filter((r) => WRITE_ROLES.includes(r))));
  assert.deepEqual(perm["Business profile, bank accounts, onboarding and SSO"], sorted(constant("settings.js", "OWNER_ADMIN")));
  assert.deepEqual(perm["Business profile, bank accounts, onboarding and SSO"], sorted(constant("onboarding.js", "OWNER_ADMIN")));
  assert.deepEqual(perm["Manage the team"], sorted(constant("settings.js", "OWNER_ADMIN")));
  assert.deepEqual(perm["Other changes"], sorted(WRITE_ROLES));
  assert.deepEqual(perm["Change their own password and sign out other sessions"], ALL, "password/session routes are anyRole");
});

test("the control centre has no sign-in form of its own", () => {
  const files = [path.join(pub, "super.html"), ...jsFiles(path.join(pub, "super"))].map((f) => fs.readFileSync(f, "utf8")).join("\n");
  assert.ok(!/type="password"/.test(files), "no password field");
  assert.ok(!/\/auth\/login/.test(files), "never posts credentials");
  assert.match(fs.readFileSync(path.join(pub, "super", "boot.js"), "utf8"), /const LOGIN = "\/app\.html#\/login\?next=super";/);
});

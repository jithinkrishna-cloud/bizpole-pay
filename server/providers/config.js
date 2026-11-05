// Payment provider connections and their settings (Super Admin → Integrations → Provider settings).
// A connection ("ProviderConnection") is a named instance of a provider type defined in server/providers/<type>.js,
// added from Super Admin. It has one "PaymentProvider" row per mode holding its settings, on/off switch and whether
// it is the active connection for that mode (at most one per mode).
// Resolution, per field: saved row → environment variable named by the type (only for the connection marked
// envFallback, created by the migration) → the type's default. Until a connection is made active in a mode, the
// envFallback connection is active there and switched on, so behaviour from before connections is kept.
// Secrets are decrypted only here and never returned by publicView().
const db = require("../db");
const { fail } = require("../http");
const { encrypt, decrypt } = require("../secrets");
const registry = require("./index");

const MODES = ["TEST", "LIVE"];
const SHARED = "sharedAccount";

/* ---------- loading and cache ---------- */
// Connections and rows, 60 s per process. Writes clear it in the process that wrote; other instances catch up within 60 s.
const TTL_MS = 60000;
let cache = null;
function clearCache() { cache = null; }

// Used before migration 20261106000000 is applied: a virtual connection that only reads the environment.
const VIRTUAL = { id: "default", provider: registry.DEFAULT, name: registry.get(registry.DEFAULT).name, envFallback: true, archivedAt: null, virtual: true };

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  let connections, rows;
  try {
    connections = await db.query(`SELECT * FROM "ProviderConnection" ORDER BY "createdAt"`);
    rows = await db.query(`SELECT p.*, u.name AS "updatedByName", u.email AS "updatedByEmail"
                             FROM "PaymentProvider" p LEFT JOIN "User" u ON u.id = p."updatedById"`);
  } catch (e) {
    if (e.code !== "42P01" && e.code !== "42703") throw e;   // table or column missing: migration not applied yet
    connections = [VIRTUAL]; rows = [];
  }
  cache = { at: Date.now(), connections, rows };
  return cache;
}

// The connection active in a mode: the one whose row is active, else the envFallback connection.
function activeOf(mode, connections, rows) {
  const r = rows.find((x) => x.mode === mode && x.isActive);
  const live = connections.filter((c) => !c.archivedAt);
  return (r && live.find((c) => c.id === r.connectionId)) || live.find((c) => c.envFallback) || null;
}

function resolveWith(mode, conn, connections, rows) {
  const p = registry.get(conn.provider), act = activeOf(mode, connections, rows);
  const row = rows.find((x) => x.connectionId === conn.id && x.mode === mode) || null;
  const r = merge(mode, p, row, conn.envFallback ? process.env : {}, !!act && act.id === conn.id);
  return { ...r, connection: { id: conn.id, name: conn.name, envFallback: !!conn.envFallback, archived: !!conn.archivedAt } };
}

// Resolved settings for a connection (default: the one active in the mode), or null when no connection is active.
// Contains decrypted secrets: server only.
async function resolve(mode, connectionId) {
  if (!MODES.includes(mode)) throw new Error("mode must be TEST or LIVE");
  const { connections, rows } = await load();
  const conn = connectionId ? connections.find((c) => c.id === connectionId) : activeOf(mode, connections, rows);
  if (!conn) { if (connectionId) fail(404, "Provider connection not found."); return null; }
  return resolveWith(mode, conn, connections, rows);
}

// Settings for a provider type in a mode: the active connection when it has that type, else another connection of
// that type (the envFallback one first). Used for follow-up calls on payments made with that type (e.g. refunds).
async function resolveType(mode, type) {
  const { connections, rows } = await load();
  const act = activeOf(mode, connections, rows);
  const conn = act && act.provider === type ? act
    : connections.filter((c) => !c.archivedAt && c.provider === type).sort((a, b) => b.envFallback - a.envFallback)[0];
  return conn ? resolveWith(mode, conn, connections, rows) : null;
}

// Pure merge, exported for unit tests. env is {} for connections without the environment fallback.
function merge(mode, p, row, env, active) {
  const settings = (row && row.settings) || {}, secrets = (row && row.secretsEnc) || {};
  const fromDb = (f) => (f.type === "secret" ? (secrets[f.key] ? decrypt(secrets[f.key]) : null) : settings[f.key] ?? null);
  const fromEnv = (f) => { for (const n of f.env ? f.env(mode) : []) if (n && env[n]) return env[n]; return null; };
  const values = {}, sources = {};

  for (const g of p.groups.filter((x) => x.together)) {
    const fs = p.settings.filter((f) => f.group === g.id);
    const src = fs.every((f) => fromDb(f) != null) ? "database" : fs.every((f) => fromEnv(f) != null) ? "environment" : "none";
    for (const f of fs) { values[f.key] = src === "database" ? fromDb(f) : src === "environment" ? fromEnv(f) : null; sources[f.key] = src; }
    sources[g.id] = src;
  }
  for (const f of p.settings.filter((x) => !(p.groups.find((g) => g.id === x.group) || {}).together)) {
    const d = fromDb(f), e = fromEnv(f), def = f.default ? f.default[mode] : null;
    if (d != null) { values[f.key] = d; sources[f.key] = "database"; }
    else if (e != null) { values[f.key] = e; sources[f.key] = "environment"; }
    else { values[f.key] = def ?? null; sources[f.key] = def != null ? "default" : "none"; }
  }

  let sharedAccount = null;
  sources[SHARED] = "none";
  if (p.account.sharedModes.includes(mode)) {
    const stored = settings[SHARED]
      ? Object.fromEntries(p.account.fields.map((f) => [f.key, f.type === "secret" ? (secrets[`${SHARED}.${f.key}`] ? decrypt(secrets[`${SHARED}.${f.key}`]) : null) : settings[SHARED][f.key]]))
      : null;
    const tryClean = (x) => { try { return p.account.clean(x); } catch { return null; } };
    if (stored && (sharedAccount = tryClean(stored))) sources[SHARED] = "database";
    else if ((sharedAccount = tryClean(p.account.sharedFromEnv(mode, env) || undefined))) sources[SHARED] = "environment";
    else sharedAccount = null;
  }

  return {
    provider: p.id, name: p.name, mode, active,
    // No saved row: on only while it is the active connection (the envFallback one before anything is chosen).
    enabled: row ? row.enabled : !!active,
    stored: !!row, version: row ? row.version : 0, updatedAt: row ? row.updatedAt : null,
    updatedBy: row && row.updatedById ? { name: row.updatedByName, email: row.updatedByEmail } : null,
    values, sources, sharedAccount,
  };
}

// What Super Admin may see. Secrets become { set, last4 }; shared-account secrets are never included.
function publicView(r) {
  const p = registry.get(r.provider);
  return {
    connection: r.connection, provider: { id: p.id, name: p.name }, mode: r.mode, active: r.active, enabled: r.enabled, stored: r.stored,
    version: r.version, updatedAt: r.updatedAt, updatedBy: r.updatedBy, hostsText: p.hostsText,
    groups: p.groups.map((g) => ({
      id: g.id, title: g.title, sub: g.sub || "", together: !!g.together, source: g.together ? r.sources[g.id] : null,
      fields: p.settings.filter((f) => f.group === g.id).map((f) => {
        const v = r.values[f.key];
        return { ...registry.fieldView(f), source: r.sources[f.key], default: f.default ? f.default[r.mode] : null,
          ...(f.type === "secret" ? { secret: v ? { set: true, last4: String(v).slice(-4) } : { set: false } } : { value: v }) };
      }),
    })),
    shared: p.account.sharedModes.includes(r.mode)
      ? { supported: true, fields: p.account.fields.map(registry.fieldView),
          current: r.sharedAccount ? { display: p.account.sharedDisplay(r.sharedAccount), source: r.sources[SHARED] } : null }
      : { supported: false },
  };
}

// Everything the Provider settings page needs. No secrets.
async function overview() {
  clearCache();
  const { connections, rows } = await load();
  const live = connections.filter((c) => !c.archivedAt);
  const active = Object.fromEntries(MODES.map((m) => { const a = activeOf(m, connections, rows); return [m.toLowerCase(), a ? a.id : null]; }));
  return {
    types: registry.list(), active, pending: !!(connections[0] && connections[0].virtual),
    connections: live.map((c) => ({
      id: c.id, name: c.name, type: { id: c.provider, name: registry.get(c.provider).name }, envFallback: !!c.envFallback, createdAt: c.createdAt || null,
      test: publicView(resolveWith("TEST", c, connections, rows)), live: publicView(resolveWith("LIVE", c, connections, rows)),
    })),
  };
}

/* ---------- validation ---------- */
function cleanUrl(p, field, v) {
  if (v === undefined) return undefined;            // not sent: unchanged
  const s = String(v ?? "").trim();
  if (!s) return null;                               // blank: back to the environment variable or default
  let u;
  try { u = new URL(s); } catch { fail(400, "Enter a full https:// address.", { field }); }
  if (u.username || u.password) fail(400, "Addresses can't contain a user name or password.", { field });
  const norm = u.toString();
  if (!p.hosts.test(norm)) fail(400, `Only https addresses on ${p.hostsText} are allowed.`, { field });
  return norm.length > 300 ? fail(400, "That address is too long.", { field }) : norm;
}
function cleanValue(p, f, v) {
  if (f.type === "url") return cleanUrl(p, f.key, v);
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim();
  if (f.type === "secret") {
    if (!s) return undefined;                        // blank secret: keep the current one
    if (s.length < 16 || s.length > 512 || /\s/.test(s)) fail(400, f.error || `Enter the ${f.label.toLowerCase()} exactly as issued.`, { field: f.key });
    return s;
  }
  if (!s) return null;
  if (f.pattern && !f.pattern.test(s)) fail(400, f.error || `Check the ${f.label.toLowerCase()}.`, { field: f.key });
  return s.slice(0, 300);
}
function cleanName(v) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (s.length < 2 || s.length > 60) fail(400, "Give the connection a name of 2 to 60 characters.", { field: "name" });
  return s;
}

const pending = (e) => {
  if (e && (e.code === "42P01" || e.code === "42703"))
    fail(503, "Provider settings can't be saved yet: database migration 20261106000000_provider_connections hasn't been applied.", { code: "MIGRATION_PENDING" });
  if (e && e.code === "23505" && /name/i.test(e.constraint || ""))
    fail(409, "Another provider connection already has this name.", { field: "name" });
  throw e;
};
// Serialises every write to connections and settings (both modes), so "one active per mode" checks see current data.
const lock = (c) => c.q(`SELECT pg_advisory_xact_lock(hashtext('PaymentProvider'))`);

/* ---------- connections ---------- */
async function createConnection(type, name, userId) {
  const p = registry.get(type), n = cleanName(name), id = db.id();
  try {
    await db.tx(async (c) => {
      await lock(c);
      await c.q(`INSERT INTO "ProviderConnection" (id, provider, name, "createdById", "updatedAt") VALUES ($1,$2,$3,$4,now())`, [id, p.id, n, userId]);
    });
  } catch (e) { pending(e); }
  clearCache();
  return { id, provider: p.id, name: n };
}

async function renameConnection(id, name) {
  const n = cleanName(name);
  let before;
  try {
    await db.tx(async (c) => {
      await lock(c);
      const conn = await c.one(`SELECT * FROM "ProviderConnection" WHERE id=$1 AND "archivedAt" IS NULL FOR UPDATE`, [id]);
      if (!conn) fail(404, "Provider connection not found.");
      before = conn.name;
      if (before !== n) await c.q(`UPDATE "ProviderConnection" SET name=$2, "updatedAt"=now() WHERE id=$1`, [id, n]);
    });
  } catch (e) { pending(e); }
  clearCache();
  return { before, after: n };
}

// Archive a connection that is not active in either mode. Its settings are switched off; the audit history stays.
async function archiveConnection(id) {
  let conn;
  try {
    await db.tx(async (c) => {
      await lock(c);
      conn = await c.one(`SELECT * FROM "ProviderConnection" WHERE id=$1 AND "archivedAt" IS NULL FOR UPDATE`, [id]);
      if (!conn) fail(404, "Provider connection not found.");
      const connections = await c.q(`SELECT * FROM "ProviderConnection"`), rows = await c.q(`SELECT * FROM "PaymentProvider"`);
      const inUse = MODES.filter((m) => { const a = activeOf(m, connections, rows); return a && a.id === id; });
      if (inUse.length)
        fail(409, `This connection is active for ${inUse.map((m) => m.toLowerCase()).join(" and ")} payments. Make another connection active first.`, { code: "CONNECTION_ACTIVE" });
      await c.q(`UPDATE "ProviderConnection" SET "archivedAt"=now(), "envFallback"=false, "updatedAt"=now() WHERE id=$1`, [id]);
      await c.q(`UPDATE "PaymentProvider" SET enabled=false, "isActive"=false, version=version+1, "updatedAt"=now() WHERE "connectionId"=$1`, [id]);
    });
  } catch (e) { pending(e); }
  clearCache();
  return { id, name: conn.name, provider: conn.provider };
}

/* ---------- settings ---------- */
// patch: { version, enabled?, activate?, values?: { key: value }, clearGroups?: [groupId], sharedAccount?: {...}, clearSharedAccount? }
// Returns { changed, enabledBefore, enabledAfter, activated, replaced, version }. Never returns or logs secret values.
async function save(connectionId, mode, patch, userId) {
  if (!MODES.includes(mode)) fail(400, "mode must be test or live");
  try {
    const out = await db.tx((c) => saveTx(c, connectionId, mode, patch || {}, userId));
    clearCache();
    return out;
  } catch (e) { pending(e); }
}

async function saveTx(c, connectionId, mode, b, userId) {
  await lock(c);
  const connections = await c.q(`SELECT * FROM "ProviderConnection"`);
  const conn = connections.find((x) => x.id === connectionId && !x.archivedAt);
  if (!conn) fail(404, "Provider connection not found.");
  const p = registry.get(conn.provider);
  const rows = await c.q(`SELECT * FROM "PaymentProvider" WHERE mode = $1 FOR UPDATE`, [mode]);
  const row = rows.find((r) => r.connectionId === conn.id) || null;
  if ((row ? row.version : 0) !== Number(b.version ?? -1))
    fail(409, "Someone else changed these settings since you opened them. Reload and try again.", { code: "VERSION_CONFLICT" });

  const act = activeOf(mode, connections, rows), wasActive = !!act && act.id === conn.id;
  const current = merge(mode, p, row, conn.envFallback ? process.env : {}, wasActive);
  const settings = { ...((row && row.settings) || {}) }, secrets = { ...((row && row.secretsEnc) || {}) };
  let enabled = current.enabled, isActive = row ? row.isActive : false;
  const changed = [];

  if (b.enabled !== undefined) {
    if (typeof b.enabled !== "boolean") fail(400, "enabled must be true or false.", { field: "enabled" });
    if (b.enabled !== enabled) { enabled = b.enabled; changed.push("enabled"); }
  }

  for (const gid of Array.isArray(b.clearGroups) ? b.clearGroups : []) {
    const g = p.groups.find((x) => x.id === gid);
    if (!g) fail(400, "Unknown settings group.", { field: "clearGroups" });
    for (const f of p.settings.filter((x) => x.group === g.id)) {
      const store = f.type === "secret" ? secrets : settings;
      if (f.key in store) { delete store[f.key]; changed.push(f.key); }
    }
  }

  for (const [key, raw] of Object.entries(b.values || {})) {
    const f = p.settings.find((x) => x.key === key);
    if (!f) fail(400, `Unknown ${p.name} setting: ${key}.`, { field: key });
    const v = cleanValue(p, f, raw);
    if (v === undefined) continue;
    if (f.type === "secret") { secrets[key] = encrypt(v); changed.push(key); }
    else if (v === null) { if (key in settings) { delete settings[key]; changed.push(key); } }
    else if (settings[key] !== v) { settings[key] = v; changed.push(key); }
  }
  for (const g of p.groups.filter((x) => x.together)) {
    const fs = p.settings.filter((f) => f.group === g.id);
    const has = (f) => (f.type === "secret" ? f.key in secrets : f.key in settings);
    const missing = fs.find((f) => !has(f));
    if (missing && fs.some(has)) fail(400, `Enter the ${missing.label.toLowerCase()} as well.`, { field: missing.key });
  }

  if (b.clearSharedAccount === true) {
    if (settings[SHARED]) changed.push(SHARED);
    delete settings[SHARED];
    for (const k of Object.keys(secrets)) if (k.startsWith(SHARED + ".")) delete secrets[k];
  } else if (b.sharedAccount) {
    if (!p.account.sharedModes.includes(mode)) fail(400, "A shared account can't be set for this mode.", { field: SHARED });
    const a = p.account.clean(b.sharedAccount, SHARED + ".");
    settings[SHARED] = {};
    for (const f of p.account.fields)
      if (f.type === "secret") secrets[`${SHARED}.${f.key}`] = encrypt(a[f.key]);
      else settings[SHARED][f.key] = String(a[f.key]);
    changed.push(SHARED);
  }

  // Keep the envFallback connection's implicit "active" state explicit once it has a row.
  if (!row && wasActive) isActive = true;
  let activated = false, replaced = null;
  if (b.activate === true && !wasActive) {
    // One active row per mode (partial unique index): step the current one down first.
    const others = rows.filter((r) => r.isActive && r.connectionId !== conn.id);
    if (others.length)
      await c.q(`UPDATE "PaymentProvider" SET "isActive"=false, version=version+1, "updatedById"=$2, "updatedAt"=now() WHERE id = ANY($1)`, [others.map((r) => r.id), userId]);
    replaced = act ? { id: act.id, name: act.name } : null;
    isActive = true; activated = true; changed.push("active");
    // A connection made active starts switched on unless the request says otherwise.
    if (b.enabled === undefined && !enabled) { enabled = true; changed.push("enabled"); }
  }

  const out = (version) => ({ changed, enabledBefore: current.enabled, enabledAfter: enabled, activated, replaced, provider: p.id, version });
  if (!changed.length) return out(row ? row.version : 0);

  const vals = [enabled, isActive, JSON.stringify(settings), JSON.stringify(secrets), userId];
  let version;
  if (row) {
    version = row.version + 1;
    await c.q(`UPDATE "PaymentProvider" SET enabled=$1, "isActive"=$2, settings=$3::jsonb, "secretsEnc"=$4::jsonb, "updatedById"=$5,
                      version=$6, "updatedAt"=now() WHERE id=$7`, [...vals, version, row.id]);
  } else {
    version = 1;
    await c.q(`INSERT INTO "PaymentProvider" (enabled,"isActive",settings,"secretsEnc","updatedById",id,"connectionId",provider,mode,version,"updatedAt")
               VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,1,now())`, [...vals, db.id(), conn.id, p.id, mode]);
  }
  return out(version);
}

async function testConnection(mode, connectionId, opts) {
  clearCache();
  const r = await resolve(mode, connectionId);
  return registry.get(r.provider).testConnection(r, opts || {});
}

/* ---------- organisation accounts (shared by the Super Admin routes) ---------- */
// One stored account as Super Admin sees it. Never includes the encrypted secret.
function accountView(row) {
  const p = registry.get(row.provider || registry.DEFAULT);
  return {
    id: row.id, provider: { id: p.id, name: p.name }, mode: row.mode, status: row.status, isDefault: row.isDefault, label: row.label,
    source: row.source, issuedAt: row.issuedAt, revokedAt: row.revokedAt, createdBy: row.createdByName || null, revokedBy: row.revokedByName || null,
    reference: p.account.reference(row), fields: p.account.display(row),
  };
}
// Accounts belong to a provider type. An account assigned now uses the type of the connection active in that mode.
async function accountForms() {
  const out = {};
  for (const m of MODES) {
    const r = await resolve(m), p = registry.get(r ? r.provider : registry.DEFAULT);
    out[m] = { provider: { id: p.id, name: p.name }, connection: r ? r.connection.name : null, enabled: !!(r && r.enabled),
      title: p.account.title, fields: p.account.fields.map(registry.fieldView) };
  }
  return out;
}
async function activeType(mode) { const r = await resolve(mode); return registry.get(r ? r.provider : registry.DEFAULT); }

module.exports = {
  MODES, activeOf, resolve, resolveType, activeType, merge, publicView, overview, save, clearCache, testConnection, cleanUrl,
  createConnection, renameConnection, archiveConnection, accountView, accountForms,
};

// Postgres access for the Paynest API. Prisma owns the schema and migrations (prisma/);
// the runtime talks to Neon with plain `pg` so the same code runs locally and on Vercel.
const crypto = require("node:crypto");
const pg = require("pg");

// Prisma stores DateTime as TIMESTAMP(3) without time zone, in UTC. Read and write them as UTC.
pg.types.setTypeParser(1114, (s) => new Date(s.replace(" ", "T") + "Z"));
pg.defaults.parseInputDatesAsUTC = true;
// BIGINT (paise, counts) → Number. Amounts stay far below 2^53.
pg.types.setTypeParser(20, (s) => Number(s));

let pool;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000 });
  }
  return pool;
}

async function query(text, params = []) {
  const res = await getPool().query(text, params);
  return res.rows;
}
async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

// Run fn(client) inside a transaction. client.q / client.one mirror the pool helpers.
async function tx(fn) {
  const client = await getPool().connect();
  client.q = async (t, p = []) => (await client.query(t, p)).rows;
  client.one = async (t, p = []) => (await client.query(t, p)).rows[0] || null;
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Prisma's @default(cuid()) is applied by the client, not the database, so ids are made here.
function id() {
  return "c" + Date.now().toString(36) + crypto.randomBytes(8).toString("hex");
}

// "test" | "live" (UI) ↔ "TEST" | "LIVE" (enum Mode)
function dbMode(m) {
  const v = String(m || "").toUpperCase();
  if (v !== "TEST" && v !== "LIVE") {
    const e = new Error("mode must be test or live");
    e.status = 400;
    throw e;
  }
  return v;
}

module.exports = { query, one, tx, id, dbMode, getPool };

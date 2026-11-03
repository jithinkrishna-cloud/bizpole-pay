// Helpers for the Super Admin API (server/routes/super/*): paging, date ranges, SQL filters, CSV, masking.
const { fail } = require("./http");

const PAGE_MAX = 100, PAGE_DEFAULT = 25, EXPORT_MAX = 10000;

// ?page=1&size=25 → { page, size, offset }. size is capped at PAGE_MAX.
function paging(query) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const size = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(query.size) || PAGE_DEFAULT)));
  return { page, size, offset: (page - 1) * size };
}

// ?range=today|7d|30d|90d|ytd|all, or ?from=YYYY-MM-DD&to=YYYY-MM-DD (UTC days, `to` inclusive).
// Returns { from, to, key } where from/to are Date or null (open-ended).
function dateRange(query, fallback = "all") {
  const DAY = 86400000;
  if (query.from || query.to) {
    const parse = (s, end) => {
      if (!s) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) fail(400, "Dates must be YYYY-MM-DD.");
      const d = new Date(String(s) + "T00:00:00Z");
      if (isNaN(d)) fail(400, "Dates must be YYYY-MM-DD.");
      return end ? new Date(d.getTime() + DAY) : d; // `to` covers the whole day
    };
    const from = parse(query.from, false), to = parse(query.to, true);
    if (from && to && from >= to) fail(400, "The start date must be before the end date.");
    return { from, to, key: "custom" };
  }
  const key = String(query.range || fallback).toLowerCase();
  const now = new Date(), today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = { today: 0, "7d": 6, "30d": 29, "90d": 89 };
  if (key in back) return { from: new Date(today.getTime() - back[key] * DAY), to: null, key };
  if (key === "ytd") return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: null, key };
  if (key === "all") return { from: null, to: null, key };
  fail(400, "range must be today, 7d, 30d, 90d, ytd or all.");
}

// Builds a parameterised WHERE clause. Values are always bound, never interpolated.
function where() {
  const parts = [], params = [];
  const api = {
    params,
    // add("t.status = ?", v) – each ? becomes the next $n. Skipped when every value is undefined/null/"".
    add(sql, ...vals) {
      if (vals.length && vals.every((v) => v === undefined || v === null || v === "")) return api;
      let i = 0;
      parts.push(sql.replace(/\?/g, () => (params.push(vals[i++]), "$" + params.length)));
      return api;
    },
    range(col, r) {
      if (r.from) api.add(`${col} >= ?`, r.from);
      if (r.to) api.add(`${col} < ?`, r.to);
      return api;
    },
    // Next placeholder number, for LIMIT/OFFSET after the filters.
    next(v) { params.push(v); return "$" + params.length; },
    get sql() { return parts.length ? "WHERE " + parts.join(" AND ") : ""; },
  };
  return api;
}

// Comma-separated enum filter, validated against the allowed list. ?status=SUCCESS,FAILED
function enumList(value, allowed, label) {
  if (value === undefined || value === "") return null;
  const list = String(value).toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((v) => !allowed.includes(v));
  if (bad.length) fail(400, `Unknown ${label}: ${bad.join(", ")}.`);
  return list.length ? list : null;
}

// ?sort=createdAt&dir=asc, restricted to a whitelist of { key: "sql expression" }.
function orderBy(query, allowed, fallback) {
  const key = Object.prototype.hasOwnProperty.call(allowed, query.sort) ? query.sort : fallback;
  const dir = String(query.dir).toLowerCase() === "asc" ? "ASC" : "DESC";
  return `ORDER BY ${allowed[key]} ${dir} NULLS LAST`;
}

const like = (q) => (q ? "%" + String(q).trim().replace(/[\\%_]/g, (c) => "\\" + c) + "%" : null);
const text = (v, max = 100) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

// PayU merchant key: first 2 and last 2 characters. The salt is never selected at all.
function maskKey(k) {
  const s = String(k || "");
  if (!s) return null;
  return s.length <= 4 ? "•".repeat(s.length) : s.slice(0, 2) + "•".repeat(Math.min(8, s.length - 4)) + s.slice(-2);
}

// CSV with formula-injection guard (cells starting with = + - @ tab CR are prefixed with ').
function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvFile(name, header, rows) {
  const body = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return {
    __raw: true,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "x-row-count": String(rows.length) },
    body,
  };
}

const pageOut = (rows, total, p) => ({ rows, total, page: p.page, size: p.size, pages: Math.max(1, Math.ceil(total / p.size)) });

module.exports = { paging, dateRange, where, enumList, orderBy, like, text, maskKey, csvCell, csvFile, pageOut, PAGE_MAX, EXPORT_MAX };

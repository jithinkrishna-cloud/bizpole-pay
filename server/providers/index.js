// Payment provider registry. To add a provider, add a definition file next to payu.js (same shape) and list it here.
// The Super Admin settings and organisation account screens are built from these definitions.
const { fail } = require("../http");

const ALL = [require("./payu")];
const BY_ID = new Map(ALL.map((p) => [p.id, p]));
// Used for a mode until Super Admin picks an active provider for it.
const DEFAULT = "payu";

function get(id) {
  const p = BY_ID.get(String(id || "").toLowerCase());
  if (!p) fail(400, "Unknown payment provider.", { field: "provider" });
  return p;
}

// Field list a client can render; no regexes or functions.
const fieldView = (f) => ({ key: f.key, label: f.label, type: f.type || "text", help: f.help || "", mono: !!f.mono || f.type === "url" || f.type === "secret" });

module.exports = { ALL, DEFAULT, get, fieldView, list: () => ALL.map((p) => ({ id: p.id, name: p.name })) };

// Integrations → Provider settings. Provider connections are added here: each is a named instance of a provider type
// the server supports (server/providers/*.js) with its own Test and Live settings. One connection is active per mode
// and can be switched at any time. Every field, label and group comes from the API; nothing here is specific to one
// provider. Secrets are write-only; Live changes ask for the password; every change is audited.
// API: GET /super/provider-settings, POST /super/provider-connections[/:id/rename|/:id/archive],
//      PUT /super/provider-connections/:id/:mode, POST /super/provider-connections/:id/:mode/test.
(() => {
  "use strict";
  const { esc, fmt, ui } = SA;

  const SRC = { database: "Saved here", environment: "Environment variable", default: "Built-in default", none: "Not set" };
  const src = (s) => `<span class="src ${esc(s)}">${esc(SRC[s] || s)}</span>`;
  const pill = (label, tone) => `<span class="pill ${tone || ""}">${esc(label)}</span>`;
  const mono = (f, v) => (f.mono ? `<span class="mono">${esc(v)}</span>` : esc(v));
  const shown = (f) => (f.type === "secret"
    ? (f.secret.set ? `Set, ends in <span class="mono">${esc(f.secret.last4)}</span> <span class="muted">(can't be viewed)</span>` : '<span class="muted">Not set</span>')
    : f.value ? mono(f, f.value) : '<span class="muted">Not set</span>');
  const modeState = (v) => (v.active ? pill(v.enabled ? "Active" : "Active, paused", v.enabled ? "ok" : "bad") : '<span class="muted">Not active</span>');
  const home = () => SA.hashFor("provider-settings");
  const connLink = (id, env) => SA.hashFor("provider-settings", { conn: id, ...(env === "live" ? { env } : {}) });
  const footer = (live) => `<p class="muted" style="margin:0;font-size:12.5px">Secrets are encrypted before they are stored and are never sent back to this page. Every change is recorded in the audit log and listed under <a href="#/activity">System activity</a>.${live ? " Live changes ask for your password." : ""}</p>`;

  /* ---------- list of connections ---------- */
  function renderList(view, data) {
    const byId = Object.fromEntries(data.connections.map((c) => [c.id, c]));
    const name = (id) => (id && byId[id] ? esc(byId[id].name) : '<span class="muted">None</span>');
    const add = `<button class="btn primary" type="button" id="pc-add">Add provider</button>`;
    const summary = `<div class="panel"><div class="panel-body btn-row" style="gap:18px">
        <span>Test payments use <b>${name(data.active.test)}</b></span><span>Live payments use <b>${name(data.active.live)}</b></span>
        <span class="muted" style="font-size:13px">Open a connection to switch it on for a mode.</span></div></div>`;
    const list = ui.panel("Provider connections", ui.table([
      { label: "Name", render: (c) => `<a href="${esc(connLink(c.id))}">${esc(c.name)}</a>${c.envFallback ? '<div class="muted" style="font-size:12px">Falls back to environment variables</div>' : ""}` },
      { label: "Provider", render: (c) => esc(c.type.name) },
      { label: "Test", render: (c) => modeState(c.test) },
      { label: "Live", render: (c) => modeState(c.live) },
      { label: "", cls: "r", render: (c) => `<a class="btn sm" href="${esc(connLink(c.id))}">Open</a>` },
    ], data.connections, `<div class="panel-body muted">No provider connections yet. Add one to take payments.</div>`),
      { sub: `Provider types available: ${data.types.map((t) => t.name).join(", ")}`, right: add });
    const note = data.pending ? `<div class="note">Database migration 20261106000000_provider_connections hasn't been applied, so connections can't be added or saved yet. Values shown come from environment variables.</div>` : "";
    view.innerHTML = ui.head("Provider settings", "Payment provider connections for the whole platform. Add as many as you need and choose which one handles Test and which handles Live payments; switch at any time. Each organization's own account is managed on its profile, under API integrations.")
      + note + summary + list + footer(false);

    view.querySelector("#pc-add").addEventListener("click", async () => {
      const r = await SA.form({
        title: "Add provider", intro: "Choose the provider and name this connection. You'll enter its Test and Live keys next.",
        fields: [
          { name: "type", label: "Provider", type: "select", options: data.types.map((t) => [t.id, t.name]), value: data.types[0] && data.types[0].id },
          { name: "name", label: "Connection name", placeholder: "For example: Main account", required: true, help: "Shown in this list and in the audit log." },
        ],
        submitLabel: "Add provider",
        onSubmit: (v) => SA.api("/super/provider-connections", {}, { method: "POST", withMode: false, body: { type: v.type, name: v.name } }),
      });
      if (r) { SA.toast("Provider added"); SA.go(connLink(r.id)); }
    });
  }

  /* ---------- one connection ---------- */
  async function save(env, cfg, patch, values) {
    const body = { ...patch, version: cfg.version };
    if (env === "live") body.password = values.password;
    try {
      const r = await SA.api(`/super/provider-connections/${encodeURIComponent(cfg.connection.id)}/${env}`, {}, { method: "PUT", body, withMode: false });
      SA.toast(r.changed.length ? `${cfg.connection.name} saved` : "Nothing changed");
      return r;
    } catch (e) {
      if (e.code === "VERSION_CONFLICT") { SA.toast(e.message, "bad"); setTimeout(() => SA.render(), 0); return null; }
      throw e;
    }
  }

  function renderConnection(view, data, conn, env) {
    const live = env === "live", MODE = live ? "Live" : "Test", cfg = conn[env], name = conn.name, type = conn.type.name;
    const current = data.connections.find((c) => c.id === data.active[env]);
    const head = `<p style="margin:0 0 6px"><a href="${esc(home())}">← All provider connections</a></p>`
      + ui.head(name, `${type} connection${conn.envFallback ? ". Uses environment variables for values that aren't saved here" : ""}.`)
      + `<div class="btn-row" style="margin:-6px 0 14px"><button class="btn sm" type="button" id="pc-rename">Rename</button>
          <button class="btn sm" type="button" id="pc-archive"${conn.test.active || conn.live.active ? ' disabled title="Make another connection active in Test and Live first"' : ""}>Remove</button></div>`;
    const tabs = ui.tabs([["test", "Test"], ["live", "Live"]], env, (k) => connLink(conn.id, k));

    const stored = cfg.stored
      ? `Saved, version ${fmt.int(cfg.version)}${cfg.updatedBy ? `, by ${esc(cfg.updatedBy.name)}` : ""}${cfg.updatedAt ? ` on ${esc(fmt.dt(cfg.updatedAt))} IST` : ""}`
      : "Not saved yet.";
    const status = ui.panel(`${MODE} mode`, `<div class="panel-body" style="display:grid;gap:12px">
        <div class="btn-row">${cfg.active ? pill(`Active for ${env} payments`, "ok") : pill("Not active", "")}${cfg.active ? (cfg.enabled ? pill("On", "ok") : pill("Paused", "bad")) : ""}
          <span class="muted" style="font-size:13px">${stored}</span></div>
        <p class="muted" style="margin:0;font-size:13px">${!cfg.active
          ? `${current ? `${esc(current.name)} handles ${env} payments now.` : `No connection handles ${env} payments.`} Fill in the settings below, then make this connection active. Organizations need a ${esc(type)} account on their profile.`
          : cfg.enabled ? `Every organization's ${env} payments go through this connection. Pausing refuses them until it's turned back on.`
          : `Every ${env} payment is refused with “${MODE} payments are paused”. Organizations' accounts are kept.`}</p>
        <div class="btn-row">${cfg.active
            ? `<button class="btn ${cfg.enabled ? "" : "primary"}" type="button" id="pc-toggle">${cfg.enabled ? `Pause ${env} payments` : `Turn on ${env} payments`}</button>`
            : `<button class="btn primary" type="button" id="pc-activate">Use for ${env} payments</button>`}
          <button class="btn" type="button" id="pc-test">Test connection</button><span class="muted" id="pc-test-out" style="font-size:13px"></span></div></div>`);

    const groups = cfg.groups.map((g) => {
      const body = g.together
        ? `<div class="panel-body">${ui.kv([...g.fields.map((f) => [f.label, shown(f)]), ["Where it comes from", src(g.source)]])}
            <div class="btn-row" style="margin-top:14px"><button class="btn" type="button" data-edit="${esc(g.id)}">${g.source === "none" ? "Add" : "Replace"}</button>
            ${g.source === "database" ? `<button class="btn" type="button" data-clear="${esc(g.id)}">Remove</button>` : ""}</div></div>`
        : ui.table([
            { label: "Setting", render: (f) => `${esc(f.label)}${f.help ? `<div class="muted" style="font-size:12px">${esc(f.help)}</div>` : ""}` },
            { label: "In use", render: (f) => shown(f), cls: "ellip" },
            { label: "Source", render: (f) => src(f.source) },
          ], g.fields, "") + `<div class="panel-body"><button class="btn" type="button" data-edit="${esc(g.id)}">Change</button></div>`;
      return ui.panel(g.title, body, { sub: g.sub });
    });

    const sh = cfg.shared;
    const shared = !sh.supported ? "" : ui.panel("Shared test account", `<div class="panel-body">
        <p class="muted" style="margin:0 0 12px;font-size:13px">Given automatically to a new organization at sign-up while this connection is active for test payments. Account keys are unique, so only the first organization without one receives it; assign test accounts to the others from their profile.</p>
        ${sh.current ? ui.kv([...sh.current.display.map((d) => [d.label, d.mono ? `<span class="mono">${esc(d.value)}</span>` : esc(d.value)]), ["Where it comes from", src(sh.current.source)]])
          : '<p style="margin:0">No shared test account.</p>'}
        <div class="btn-row" style="margin-top:14px"><button class="btn" type="button" id="pc-shared">${sh.current ? "Replace" : "Add shared test account"}</button>
          ${sh.current && sh.current.source === "database" ? '<button class="btn" type="button" id="pc-shared-clear">Remove</button>' : ""}</div></div>`);

    // Where the provider sends payment notifications for this connection (same address for Test and Live).
    const hookUrl = `${data.webhookBase || location.origin}/api/webhooks/${conn.id}`;
    const hook = ui.panel("Webhook address", `<div class="panel-body">
        <p class="muted" style="margin:0 0 10px;font-size:13px">Paste this into the ${esc(type)} ${env} dashboard as the payment webhook (success and failure). Payments are confirmed even when the customer closes the browser.</p>
        <div class="btn-row"><span class="mono" style="word-break:break-all;font-size:13px">${esc(hookUrl)}</span><button class="btn sm" type="button" id="pc-hook">Copy</button></div></div>`);

    const body = groups.length > 1 ? `<div class="grid g2">${groups.slice(0, 2).join("")}</div>${groups.slice(2).join("")}` : groups.join("");
    view.innerHTML = head + tabs + status + hook + body + shared + footer(live);
    view.querySelector("#pc-hook").addEventListener("click", () => { try { navigator.clipboard.writeText(hookUrl); SA.toast("Webhook address copied"); } catch { SA.toast("Copy it manually", "bad"); } });

    const $ = (s) => view.querySelector(s);
    const after = (r) => { if (r) SA.render(); };

    $("#pc-rename").addEventListener("click", async () => {
      const r = await SA.form({ title: "Rename connection", fields: [{ name: "name", label: "Connection name", value: name, required: true }],
        onSubmit: (v) => SA.api(`/super/provider-connections/${encodeURIComponent(conn.id)}/rename`, {}, { method: "POST", withMode: false, body: { name: v.name } }) });
      if (r) { SA.toast("Connection renamed"); SA.render(); }
    });
    $("#pc-archive").addEventListener("click", async () => {
      const r = await SA.form({ title: `Remove ${name}?`, intro: "Its settings are switched off and hidden. The audit history is kept. Organizations' accounts are not changed.",
        fields: [{ name: "reason", label: "Reason", required: false }], submitLabel: "Remove", danger: true,
        onSubmit: (v) => SA.api(`/super/provider-connections/${encodeURIComponent(conn.id)}/archive`, {}, { method: "POST", withMode: false, body: { reason: v.reason } }) });
      if (r) { SA.toast("Connection removed"); SA.go(home()); }
    });

    $("#pc-activate")?.addEventListener("click", async () => after(await SA.form({
      title: `Use ${name} for ${env} payments?`,
      intro: `${current ? `${current.name} stops handling ${env} payments. ` : ""}New ${env} payments for every organization go through ${name} (${type}). Organizations need a ${type} account assigned on their profile.`,
      fields: [], submitLabel: "Make active", danger: true, confirmPassword: live,
      onSubmit: (v) => save(env, cfg, { activate: true }, v),
    })));
    $("#pc-toggle")?.addEventListener("click", async () => after(await SA.form({
      title: cfg.enabled ? `Pause ${env} payments?` : `Turn on ${env} payments?`,
      intro: cfg.enabled ? `Every ${env} payment across all organizations will be refused until this is turned back on.` : `Organizations can take ${env} payments through ${name} again.`,
      fields: [], submitLabel: cfg.enabled ? "Pause" : "Turn on", danger: cfg.enabled, confirmPassword: live,
      onSubmit: (v) => save(env, cfg, { enabled: !cfg.enabled }, v),
    })));

    $("#pc-test").addEventListener("click", async (e) => {
      const b = e.currentTarget, out = $("#pc-test-out");
      b.disabled = true; out.textContent = `Contacting ${type}…`; out.style.color = "";
      try {
        const r = await SA.api(`/super/provider-connections/${encodeURIComponent(conn.id)}/${env}/test`, {}, { method: "POST", body: {}, withMode: false });
        out.textContent = (r.ok ? "Connected. " : "Failed. ") + r.message + (r.ms != null ? ` (${r.ms} ms)` : "");
        out.style.color = r.ok ? "var(--ok)" : "var(--bad)";
      } catch (err) { out.textContent = err.message; out.style.color = "var(--bad)"; }
      b.disabled = false;
    });

    view.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      const g = cfg.groups.find((x) => x.id === b.dataset.edit);
      after(await SA.form({
        title: `${name}: ${g.title}`,
        intro: g.together ? "Secrets are encrypted and can't be viewed after saving." : `Leave a field blank to use the built-in default.${cfg.hostsText ? ` Only https addresses on ${cfg.hostsText}.` : ""}`,
        fields: g.fields.map((f) => {
          const saved = f.source === "database";
          if (f.type === "secret") return { name: f.key, label: f.label, type: "secret", mono: true, required: !saved, help: saved ? "Leave blank to keep the current value." : f.help };
          return { name: f.key, label: f.label, mono: f.mono, required: !!g.together, value: saved ? f.value || "" : "", placeholder: f.default || "", help: g.together ? f.help : "" };
        }),
        confirmPassword: live,
        onSubmit: (v) => save(env, cfg, { values: Object.fromEntries(g.fields.map((f) => [f.key, v[f.key]])) }, v),
      }));
    }));
    view.querySelectorAll("[data-clear]").forEach((b) => b.addEventListener("click", async () => {
      const g = cfg.groups.find((x) => x.id === b.dataset.clear);
      after(await SA.form({
        title: `Remove the saved ${g.title.toLowerCase()}?`, intro: conn.envFallback ? "The saved values are deleted. Matching environment variables are used instead, if set." : "The saved values are deleted.",
        fields: [], submitLabel: "Remove", danger: true, confirmPassword: live,
        onSubmit: (v) => save(env, cfg, { clearGroups: [g.id] }, v),
      }));
    }));

    $("#pc-shared")?.addEventListener("click", async () => after(await SA.form({
      title: `Shared ${type} test account`, intro: "Secrets are encrypted and can't be viewed after saving.",
      fields: sh.fields.map((f) => ({ name: f.key, label: f.label, type: f.type === "secret" ? "secret" : "text", mono: f.mono, required: true, help: f.help })),
      onSubmit: (v) => save(env, cfg, { sharedAccount: Object.fromEntries(sh.fields.map((f) => [f.key, v[f.key]])) }, v),
    })));
    $("#pc-shared-clear")?.addEventListener("click", async () => after(await SA.form({
      title: "Remove the shared test account?", intro: "New organizations will no longer get a test account automatically. Accounts already given out are not changed.",
      fields: [], submitLabel: "Remove", danger: true, onSubmit: (v) => save(env, cfg, { clearSharedAccount: true }, v),
    })));
  }

  SA.pages["provider-settings"] = {
    title: "Provider settings",
    async render(view, { params, isCurrent }) {
      view.innerHTML = ui.head("Provider settings", "") + ui.skelPanel(2) + ui.skelPanel(4);
      const data = await SA.api("/super/provider-settings", {}, { withMode: false });
      if (!isCurrent()) return;
      const conn = params.conn && data.connections.find((c) => c.id === params.conn);
      if (params.conn && !conn) { SA.toast("That provider connection no longer exists", "bad"); SA.go(home()); return; }
      if (conn) renderConnection(view, data, conn, params.env === "live" ? "live" : "test");
      else renderList(view, data);
    },
  };
})();

// Integrations → PayU settings: platform PayU configuration per mode (Test / Live tabs).
// API: GET /super/payu/config, PUT /super/payu/config/:mode, POST /super/payu/config/:mode/test.
// Secrets are write-only: the page shows "set, ends in 1234" and never receives a secret or salt.
// Live changes ask for the operator's password; every change is written to the audit log.
(() => {
  "use strict";
  const { esc, fmt, ui } = SA;

  const URLS = [
    ["oauthUrl", "OAuth token address", "Partner tokens (client credentials)."],
    ["paymentUrl", "Payment page address", "Where customers are sent to pay."],
    ["postserviceUrl", "Merchant API address", "Refunds, status checks and other postservice commands."],
    ["oneApiUrl", "Payment links and onboarding API", "Host for PayU's payment-link and partner APIs."],
  ];
  const SRC = { database: "Saved here", environment: "Environment variable", default: "Built-in default", none: "Not set" };
  const src = (s) => `<span class="src ${esc(s)}">${esc(SRC[s] || s)}</span>`;
  const pill = (label, tone) => `<span class="pill ${tone || ""}">${esc(label)}</span>`;

  async function save(env, cfg, patch, values) {
    const body = { ...patch, version: cfg.version };
    if (env === "live") body.password = values.password;
    try {
      const r = await SA.api("/super/payu/config/" + env, {}, { method: "PUT", body, withMode: false });
      SA.toast(r.changed.length ? "PayU settings saved" : "Nothing changed");
      return r;
    } catch (e) {
      if (e.code === "VERSION_CONFLICT") { SA.toast(e.message, "bad"); setTimeout(() => SA.render(), 0); return null; }
      throw e;
    }
  }

  function render(view, env, data) {
    const cfg = data[env], live = env === "live", MODE = live ? "Live" : "Test";
    const head = ui.head("PayU settings", "Platform-wide PayU configuration. Each organization's own MID, key and salt are managed on its profile, under API integrations.");
    const tabs = ui.tabs([["test", "Test"], ["live", "Live"]], env, (k) => SA.hashFor("payu-settings", k === "test" ? {} : { env: k }));
    const stored = cfg.stored
      ? `Saved in Bizpole Pay, version ${fmt.int(cfg.version)}${cfg.updatedBy ? `, by ${esc(cfg.updatedBy.name)}` : ""}${cfg.updatedAt ? ` on ${esc(fmt.dt(cfg.updatedAt))} IST` : ""}`
      : "Not saved here yet. Values come from environment variables and built-in defaults until the first save.";

    const status = ui.panel(`${MODE} mode`, `<div class="panel-body" style="display:grid;gap:12px">
        <div class="btn-row">${cfg.enabled ? pill(`${MODE} payments on`, "ok") : pill(`${MODE} payments paused`, "bad")}
          <span class="muted" style="font-size:13px">${stored}</span></div>
        <p class="muted" style="margin:0;font-size:13px">${cfg.enabled
          ? `Organizations can use their ${env} PayU accounts. Pausing stops every ${env} PayU request across the platform.`
          : `Every ${env} PayU request is refused with “${MODE} payments are paused”. Organizations' accounts are kept.`}</p>
        <div class="btn-row"><button class="btn ${cfg.enabled ? "" : "primary"}" type="button" id="pu-toggle">${cfg.enabled ? `Pause ${env} payments` : `Turn on ${env} payments`}</button>
          <button class="btn" type="button" id="pu-test">Test connection</button><span class="muted" id="pu-test-out" style="font-size:13px"></span></div></div>`);

    const p = cfg.partner;
    const partner = ui.panel("Partner client (OAuth)", `<div class="panel-body">${ui.kv([
        ["Client ID", p.clientId ? `<span class="mono">${esc(p.clientId)}</span>` : ""],
        ["Client secret", p.secret.set ? `Set, ends in <span class="mono">${esc(p.secret.last4)}</span> <span class="muted">(can't be viewed)</span>` : '<span class="muted">Not set</span>'],
        ["Where it comes from", src(p.source)],
      ])}<div class="btn-row" style="margin-top:14px"><button class="btn" type="button" id="pu-partner">${p.clientId ? "Replace partner client" : "Add partner client"}</button>
        ${p.source === "database" ? '<button class="btn" type="button" id="pu-partner-clear">Remove</button>' : ""}</div></div>`,
      { sub: "Issued by PayU for the partner, payment-link and payout APIs" });

    const urls = ui.panel("PayU addresses", ui.table([
        { label: "Address", render: (r) => `${esc(r[1])}<div class="muted" style="font-size:12px">${esc(r[2])}</div>` },
        { label: "In use", render: (r) => `<span class="mono" style="font-size:12.5px">${esc(cfg.urls[r[0]].value)}</span>`, cls: "ellip" },
        { label: "Source", render: (r) => src(cfg.urls[r[0]].source) },
      ], URLS, "") + `<div class="panel-body"><button class="btn" type="button" id="pu-urls">Change addresses</button></div>`,
      { sub: "Only https addresses on payu.in or payumoney.com are accepted" });

    const d = cfg.defaultCredential;
    const shared = live ? "" : ui.panel("Shared test credential", `<div class="panel-body">
        <p class="muted" style="margin:0 0 12px;font-size:13px">Given automatically to a new organization at sign-up. PayU keys are unique, so only the first organization without one receives it; assign test accounts to the others from their profile.</p>
        ${d ? ui.kv([["MID", `<span class="mono">${esc(d.mid)}</span>`], ["Merchant key", `<span class="mono">${esc(d.key)}</span>`],
          ["Salt", `${esc(d.saltVersion)} <span class="muted">(never shown)</span>`], ["Where it comes from", src(d.source)]]) : '<p style="margin:0">No shared test credential.</p>'}
        <div class="btn-row" style="margin-top:14px"><button class="btn" type="button" id="pu-default">${d ? "Replace" : "Add shared test credential"}</button>
          ${d && d.source === "database" ? '<button class="btn" type="button" id="pu-default-clear">Remove</button>' : ""}</div></div>`);

    view.innerHTML = head + tabs + status + `<div class="grid g2">${partner}${urls}</div>` + shared
      + `<p class="muted" style="margin:0;font-size:12.5px">Secrets are encrypted before they are stored and are never sent back to this page. Every change is recorded in the audit log and listed under <a href="#/activity">System activity</a>.${live ? " Live changes ask for your password." : ""}</p>`;

    const $ = (s) => view.querySelector(s);
    const after = (r) => { if (r) SA.render(); };
    const confirmLive = live;

    $("#pu-toggle").addEventListener("click", async () => after(await SA.form({
      title: cfg.enabled ? `Pause ${env} payments?` : `Turn on ${env} payments?`,
      intro: cfg.enabled ? `Every ${env} PayU request across all organizations will be refused until this is turned back on.` : `Organizations with ${env} PayU accounts can start using them.`,
      fields: [], submitLabel: cfg.enabled ? "Pause" : "Turn on", danger: cfg.enabled, confirmPassword: confirmLive,
      onSubmit: (v) => save(env, cfg, { enabled: !cfg.enabled }, v),
    })));

    $("#pu-test").addEventListener("click", async (e) => {
      const b = e.currentTarget, out = $("#pu-test-out");
      b.disabled = true; out.textContent = "Contacting PayU…"; out.style.color = "";
      try {
        const r = await SA.api(`/super/payu/config/${env}/test`, {}, { method: "POST", body: {}, withMode: false });
        out.textContent = (r.ok ? "Connected. " : "Failed. ") + r.message + (r.ms != null ? ` (${r.ms} ms)` : "");
        out.style.color = r.ok ? "var(--ok)" : "var(--bad)";
      } catch (err) { out.textContent = err.message; out.style.color = "var(--bad)"; }
      b.disabled = false;
    });

    $("#pu-partner").addEventListener("click", async () => after(await SA.form({
      title: `${MODE} partner client`, intro: "From PayU's partner dashboard. The secret is encrypted and can't be viewed after saving.",
      fields: [
        { name: "partnerClientId", label: "Client ID", value: p.source === "database" ? p.clientId : "", mono: true, required: true },
        { name: "partnerClientSecret", label: "Client secret", type: "secret", mono: true, required: !(p.source === "database"),
          help: p.source === "database" ? "Leave blank to keep the current secret." : "" },
      ],
      confirmPassword: confirmLive,
      onSubmit: (v) => save(env, cfg, { partnerClientId: v.partnerClientId, partnerClientSecret: v.partnerClientSecret || undefined }, v),
    })));
    $("#pu-partner-clear")?.addEventListener("click", async () => after(await SA.form({
      title: `Remove the ${env} partner client?`, intro: "The saved client ID and secret are deleted. If PAYU_PARTNER_* environment variables exist, they are used instead.",
      fields: [], submitLabel: "Remove", danger: true, confirmPassword: confirmLive,
      onSubmit: (v) => save(env, cfg, { clearPartner: true }, v),
    })));

    $("#pu-urls").addEventListener("click", async () => after(await SA.form({
      title: `${MODE} PayU addresses`, intro: "Leave a field blank to use the environment variable or built-in default.",
      fields: URLS.map(([k, label]) => ({ name: k, label, value: cfg.urls[k].source === "database" ? cfg.urls[k].value : "", placeholder: cfg.urls[k].default, mono: true, required: false })),
      confirmPassword: confirmLive,
      onSubmit: (v) => save(env, cfg, Object.fromEntries(URLS.map(([k]) => [k, v[k]])), v),
    })));

    $("#pu-default")?.addEventListener("click", async () => after(await SA.form({
      title: "Shared test credential", intro: "From the PayU test dashboard. The salt is encrypted and can't be viewed after saving.",
      fields: [
        { name: "mid", label: "Merchant ID (MID)", mono: true, required: true },
        { name: "key", label: "Merchant key", mono: true, required: true },
        { name: "salt", label: "Salt", type: "secret", mono: true, required: true, help: "Salts longer than 32 characters are saved as version 2." },
      ],
      onSubmit: (v) => save(env, cfg, { defaultCredential: { mid: v.mid, key: v.key, salt: v.salt } }, v),
    })));
    $("#pu-default-clear")?.addEventListener("click", async () => after(await SA.form({
      title: "Remove the shared test credential?", intro: "New organizations will no longer get a test account automatically. Accounts already given out are not changed.",
      fields: [], submitLabel: "Remove", danger: true, onSubmit: (v) => save(env, cfg, { clearDefault: true }, v),
    })));
  }

  SA.pages["payu-settings"] = {
    title: "PayU settings",
    async render(view, { params, isCurrent }) {
      const env = params.env === "live" ? "live" : "test";
      view.innerHTML = ui.head("PayU settings", "") + ui.skelPanel(3) + `<div class="grid g2">${ui.skelPanel(4)}${ui.skelPanel(4)}</div>`;
      const data = await SA.api("/super/payu/config", {}, { withMode: false });
      if (!isCurrent()) return;
      render(view, env, data);
    },
  };
})();

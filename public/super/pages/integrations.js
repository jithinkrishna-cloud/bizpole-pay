// Integrations (read-only): Payment providers, Provider accounts, API credentials, Webhook events, Webhook failures,
// Integration health, API activity. Data: /api/super/providers, /provider-accounts, /api-keys, /webhooks/inbound,
// /webhooks/outbound, /integration-health. Secrets never reach this page: keys are masked server-side, salts and
// webhook secrets are never selected, and inbound payloads are not returned.
(() => {
  "use strict";
  const { esc, fmt, ui } = SA;

  const RANGES = [["", "Any time"], ["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"]];
  const SOURCE = { SURL: "Success callback (surl)", FURL: "Failure callback (furl)", PAYMENT_WEBHOOK: "Payment webhook", REFUND_WEBHOOK: "Refund webhook",
    DISPUTE_WEBHOOK: "Dispute webhook", ONBOARDING_WEBHOOK: "Onboarding webhook", PAYMENT_LINK_WEBHOOK: "Payment link webhook", PAYOUT_WEBHOOK: "Payout webhook", POLL: "Status poll" };
  const RETRY = { NONE: ["Not needed", "ok"], SCHEDULED: ["Retry scheduled", "warn"], EXHAUSTED_OR_MANUAL: ["No retry left", "bad"], PENDING: ["Waiting", "warn"] };
  const SIG = { VALID: ["Valid", "ok"], INVALID: ["Invalid", "bad"], NOT_PROVIDED: ["Not signed", ""] };
  const pill = (label, tone) => `<span class="pill ${tone || ""}">${esc(label)}</span>`;
  const ago = (d, never = "Never") => (d ? `<span title="${esc(fmt.dt(d))} IST">${esc(fmt.ago(d))}</span>` : `<span class="muted">${esc(never)}</span>`);
  const orgCell = (o) => (o ? `<a href="#/orgs/${encodeURIComponent(o.id)}">${esc(o.name)}</a>` : '<span class="muted">Platform</span>');
  const modeText = () => (SA.state.mode === "all" ? "all modes" : SA.state.mode + " mode");
  const note = (t) => `<p class="muted" style="margin:0;font-size:12.5px">${esc(t)}</p>`;
  const errText = (e) => (e ? `<span title="${esc(e)}" style="color:var(--bad)">${esc(e.length > 80 ? e.slice(0, 80) + "…" : e)}</span>` : '<span class="muted">—</span>');
  const hourAgo = (h) => Date.now() - h * 3600e3;
  const count = (n, one, many) => `${fmt.int(n)} ${n === 1 ? one : many}`;

  // Paged table with toolbar. cfg: { path, api, params (fixed), filters: [[id, label, param, options]], search, cols, empty, rowHref, title, sub }
  async function pagedPanel(view, p, cfg, isCurrent) {
    const hrefFor = (over) => SA.hashFor(cfg.path, { ...p, ...over });
    const q = { ...cfg.params, page: p.page, size: 25, q: cfg.search ? p.q : undefined, range: cfg.range ? p.range : undefined };
    for (const [, , param] of cfg.filters || []) if (p[param]) q[param] = p[param];
    const data = await SA.api(cfg.api, q);
    if (!isCurrent()) return null;
    const filtered = (cfg.filters || []).some(([, , param]) => p[param]) || p.q || p.range;
    const toolbar = cfg.search || cfg.range || (cfg.filters || []).length ? `<div class="toolbar">
      ${cfg.search ? ui.search(p.q, cfg.search) : ""}
      ${(cfg.filters || []).map(([id, label, param, opts]) => ui.select(id, label, opts, p[param] || "")).join("")}
      ${cfg.range ? ui.select(cfg.path + "-range", cfg.range, RANGES, p.range || "") : ""}</div>` : "";
    const html = ui.panel(cfg.title, toolbar + ui.table(cfg.cols, data.rows,
      filtered ? ui.empty("Nothing matches these filters", "Clear the search or choose another filter.") : ui.empty(...cfg.empty), cfg.rowHref ? { rowHref: cfg.rowHref } : {})
      + ui.pager(data, (n) => hrefFor({ page: n })), { sub: cfg.sub ? cfg.sub(data) : "" });
    return { html, bind(root) {
      ui.bindSearch(root, (v) => hrefFor({ q: v, page: "" }));
      for (const [id, , param] of cfg.filters || []) root.querySelector("#" + id)?.addEventListener("change", (e) => SA.go(hrefFor({ [param]: e.target.value, page: "" })));
      root.querySelector("#" + cfg.path + "-range")?.addEventListener("change", (e) => SA.go(hrefFor({ range: e.target.value, page: "" })));
    } };
  }

  // ── Column sets ──
  const INBOUND_COLS = [
    { label: "Received", render: (e) => esc(fmt.dt(e.receivedAt)), cls: "nowrap" },
    { label: "Event ID", render: (e) => `<span class="mono">${esc(e.id)}</span>`, cls: "nowrap" },
    { label: "Provider", render: (e) => esc(e.provider) },
    { label: "Event type", render: (e) => esc(SOURCE[e.source] || fmt.label(e.source)) },
    { label: "Transaction", render: (e) => (e.txnid ? `<a class="mono" href="#/transactions/${encodeURIComponent(e.txnid)}">${esc(e.txnid)}</a>` : '<span class="muted">—</span>'), cls: "nowrap" },
    { label: "Organization", render: (e) => orgCell(e.org) },
    { label: "Signature", render: (e) => pill(...(SIG[e.signature] || [e.signature])) },
    { label: "Processing", render: (e) => ui.pill(e.processing) },
    { label: "Retry", render: () => '<span class="muted" title="Inbound events have no retry field; a resend from PayU arrives as a new event (or a duplicate)">Not tracked</span>' },
    { label: "Error", render: (e) => errText(e.error) },
    { label: "Mode", render: (e) => ui.modeTag(e.mode) },
  ];
  const OUTBOUND_COLS = [
    { label: "Created", render: (d) => esc(fmt.dt(d.date)), cls: "nowrap" },
    { label: "Event ID", render: (d) => `<span class="mono">${esc(d.eventId)}</span>`, cls: "nowrap" },
    { label: "Event", render: (d) => `<span class="mono">${esc(d.event)}</span>` },
    { label: "Organization", render: (d) => orgCell(d.org) },
    { label: "Endpoint", render: (d) => `<span class="mono" title="${esc(d.endpoint.url)}">${esc(d.endpoint.url)}</span>${d.endpoint.active ? "" : ' <span class="tag">Paused</span>'}`, cls: "ellip" },
    { label: "Status", render: (d) => ui.pill(d.status) },
    { label: "Response", render: (d) => (d.responseCode ? `<span class="mono" style="color:${d.responseCode >= 200 && d.responseCode < 300 ? "var(--ok)" : "var(--bad)"}">HTTP ${esc(d.responseCode)}</span>` : '<span class="muted">No response</span>'), cls: "nowrap" },
    { label: "Attempts", align: "r", render: (d) => fmt.int(d.attempts) },
    { label: "Retry", render: (d) => pill(...(RETRY[d.retry] || [d.retry])) + (d.nextRetryAt ? `<div class="muted" style="font-size:12px">${esc(fmt.dt(d.nextRetryAt))}</div>` : "") },
    { label: "Mode", render: (d) => ui.modeTag(d.mode) },
  ];
  const KEY_COLS = (activity) => [
    { label: "Key", render: (k) => `${esc(k.name)}<div class="mono muted" style="font-size:12px">${esc(k.prefix)}…</div>` },
    { label: "Organization", render: (k) => orgCell(k.org) },
    { label: "Mode", render: (k) => ui.modeTag(k.mode) },
    { label: "State", render: (k) => (k.revokedAt ? pill("Revoked", "bad") : pill("Active", "ok")) },
    ...(activity
      ? [{ label: "Last used", render: (k) => ago(k.lastUsedAt), cls: "nowrap" },
         { label: "Usage", render: (k) => { const t = k.lastUsedAt ? new Date(k.lastUsedAt).getTime() : 0;
           return !t ? pill("Never used", "") : t > hourAgo(24) ? pill("Used in last 24 h", "ok") : t > hourAgo(24 * 7) ? pill("Used this week", "info") : pill("Idle over 7 days", "warn"); } }]
      : [{ label: "Created", render: (k) => esc(fmt.date(k.createdAt)), cls: "nowrap" },
         { label: "Revoked", render: (k) => (k.revokedAt ? esc(fmt.date(k.revokedAt)) : '<span class="muted">—</span>'), cls: "nowrap" },
         { label: "Last used", render: (k) => ago(k.lastUsedAt), cls: "nowrap" }]),
  ];
  const keyHref = (k) => "#/orgs/" + encodeURIComponent(k.org.id) + "?tab=integrations";

  // ── Payment providers ──
  SA.pages.providers = {
    title: "Payment providers",
    async render(view, { isCurrent }) {
      const head = ui.head("Payment providers", "Payment processors Bizpole Pay is integrated with. PayU processes every payment; Bizpole Pay stores its own record of each one.");
      view.innerHTML = head + ui.skelPanel(4);
      const [list, health] = await Promise.all([SA.api("/super/providers"), SA.api("/super/integration-health")]);
      if (!isCurrent()) return;
      view.innerHTML = head + list.map((pv) => {
        const by = (m) => pv.accounts.find((a) => a.mode === m) || { total: 0, active: 0, orgs: 0 };
        const sr = pv.last24h ? fmt.pct(pv.ok24h / pv.last24h) : "—";
        return `<section class="panel"><div class="panel-head"><h2>${esc(pv.name)}</h2><span class="sub">Hosted checkout, refunds and settlement data through the PayU APIs</span>
          <div class="right">${pv.accounts.some((a) => a.active) ? pill("Connected", "ok") : pill("No active accounts", "warn")}</div></div>
          <div class="stat-row">
            <div><b>${fmt.int(by("TEST").active)} / ${fmt.int(by("LIVE").active)}</b><span>Active accounts, test / live</span></div>
            <div><b>${fmt.int(pv.accounts.reduce((a, x) => a + x.orgs, 0))}</b><span>Organizations with an account</span></div>
            <div><b>${fmt.int(pv.last24h)}</b><span>Payments in the last 24 h</span></div>
            <div><b>${sr}</b><span>Success rate, last 24 h</span></div>
            <div><b>${fmt.int(health.gateway.active.length)}</b><span>Active downtime notices</span></div>
          </div>
          <div class="panel-body">${ui.kv([
            ["Last successful payment", pv.lastSuccessAt ? `${esc(fmt.dt(pv.lastSuccessAt))} <span class="muted">(${esc(fmt.ago(pv.lastSuccessAt))})</span>` : ""],
            ["Last payment error", pv.lastErrorAt ? `${esc(fmt.dt(pv.lastErrorAt))} <span class="muted">(${esc(fmt.ago(pv.lastErrorAt))})</span>` : ""],
            ["Last PayU callback processed", health.inbound.lastSuccessAt ? esc(fmt.dt(health.inbound.lastSuccessAt)) : '<span class="muted">None recorded. The PayU callback receiver is not connected yet.</span>'],
            ["Accounts", `<a href="#/provider-accounts">See all provider accounts</a>`],
          ])}</div></section>`;
      }).join("") + note(`Figures are for ${modeText()}. Other providers can be added later; PayU is the only one integrated in the codebase today.`);
    },
  };

  // ── Provider accounts ──
  SA.pages["provider-accounts"] = {
    title: "Provider accounts",
    async render(view, { params: p, isCurrent }) {
      const head = ui.head("Provider accounts", "Each organization's PayU account (MID): status, last successful payment and last error. Keys are masked; salts are never shown.");
      view.innerHTML = head + ui.skelPanel(8);
      const r = await pagedPanel(view, p, {
        path: "provider-accounts", api: "/super/provider-accounts", title: "PayU accounts", search: "Search organization, MID or label",
        filters: [["pa-status", "Status", "status", [["", "Any status"], ["ACTIVE", "Active"], ["ROTATING", "Rotating salt"], ["REVOKED", "Revoked"]]]],
        empty: ["No provider accounts", "Organizations get a PayU account when test credentials are provisioned or added in developer settings."],
        sub: (d) => `${count(d.total, "account", "accounts")}, ${modeText()}`,
        rowHref: (a) => "#/orgs/" + encodeURIComponent(a.org.id) + "?tab=integrations",
        cols: [
          { label: "Provider", render: (a) => esc(a.provider) },
          { label: "Account ID (MID)", render: (a) => `<span class="mono">${esc(a.accountId)}</span>`, cls: "nowrap" },
          { label: "Organization", render: (a) => orgCell(a.org) },
          { label: "Environment", render: (a) => ui.modeTag(a.mode) },
          { label: "Merchant key", render: (a) => `<span class="mono">${esc(a.merchantKey)}</span>`, cls: "nowrap" },
          { label: "Configuration", render: (a) => ui.pill(a.status) + (a.isDefault ? ' <span class="tag">Default</span>' : "") + `<div class="muted" style="font-size:12px">Salt ${esc(a.saltVersion)}</div>` },
          { label: "Connection health", render: (a) => {
            if (a.status !== "ACTIVE") return pill("Not in use", "");
            const ok = a.lastSuccessAt ? new Date(a.lastSuccessAt).getTime() : 0, bad = a.lastError ? new Date(a.lastError.at).getTime() : 0;
            if (!ok && !bad) return pill("No payments yet", "");
            return bad > ok ? pill("Last payment failed", "warn") : pill("Working", "ok");
          } },
          { label: "Last successful payment", render: (a) => ago(a.lastSuccessAt), cls: "nowrap" },
          { label: "Last error", render: (a) => (a.lastError ? `${errText(a.lastError.message)}<div class="muted" style="font-size:12px">${a.lastError.code ? esc(a.lastError.code) + ", " : ""}${esc(fmt.ago(a.lastError.at))}</div>` : '<span class="muted">—</span>') },
        ],
      }, isCurrent);
      if (!r) return;
      view.innerHTML = head + r.html + note("Connection health is read from this account's own payments: “Working” when its latest payment outcome was a success. Bizpole Pay does not probe PayU separately.");
      r.bind(view);
    },
  };

  // ── API credentials and API activity (Paynest API keys) ──
  const keysPage = (path, title, sub, activity) => ({
    title,
    async render(view, { params: p, isCurrent }) {
      const head = ui.head(title, sub);
      view.innerHTML = head + ui.skelPanel(8);
      const r = await pagedPanel(view, p, {
        path, api: "/super/api-keys", title: activity ? "Keys by last use" : "Bizpole Pay API keys", search: "Search key name, prefix or organization",
        filters: [[path + "-state", "State", "state", [["", "Active and revoked"], ["active", "Active"], ["revoked", "Revoked"]]]],
        empty: ["No API keys", "Organizations create API keys in their developer settings to call the Bizpole Pay API from their servers."],
        sub: (d) => `${count(d.total, "key", "keys")}, ${modeText()}`, rowHref: keyHref, cols: KEY_COLS(activity),
      }, isCurrent);
      if (!r) return;
      view.innerHTML = head + r.html + note(activity
        ? "Bizpole Pay records only when each key was last used. There is no per-request API log yet, so request counts and error rates aren't available."
        : "Only the key prefix is shown. Bizpole Pay stores a hash of each secret and can't display it. Keys are created and revoked by each organization.");
      r.bind(view);
    },
  });
  SA.pages["api-credentials"] = keysPage("api-credentials", "API credentials", "Bizpole Pay API keys issued to organizations for server-to-server calls.", false);
  SA.pages["api-activity"] = keysPage("api-activity", "API activity", "Which API keys are in use, from the last time each one called the Bizpole Pay API.", true);

  // ── Webhook events: inbound (PayU → Paynest) and outbound (Paynest → merchant) ──
  const INBOUND_FILTERS = [["wi-source", "Type", "source", [["", "Any type"], ...Object.entries(SOURCE)]],
    ["wi-proc", "Processing", "processing", [["", "Any"], ["RECEIVED", "Received"], ["PROCESSED", "Processed"], ["DUPLICATE", "Duplicate"], ["FAILED", "Failed"], ["SIGNATURE_INVALID", "Signature invalid"]]]];
  const INBOUND_EMPTY = ["No PayU events recorded", "Bizpole Pay stores every PayU callback and webhook before processing it. The receiver isn't connected yet, so none have arrived."];
  SA.pages.webhooks = {
    title: "Webhook events",
    async render(view, { params: p, isCurrent }) {
      const dir = p.flow === "out" ? "out" : "in";
      const head = ui.head("Webhook events", "Messages from PayU to Bizpole Pay, and webhook deliveries from Bizpole Pay to merchants' servers.");
      const tabs = ui.tabs([["in", "From PayU (inbound)"], ["out", "To merchants (outbound)"]], dir, (k) => SA.hashFor("webhooks", k === "in" ? {} : { flow: k }));
      view.innerHTML = head + tabs + ui.skelPanel(8);
      const r = await pagedPanel(view, p, dir === "in"
        ? { path: "webhooks", api: "/super/webhooks/inbound", title: "Inbound events", search: "Search event ID or txnid", range: "Received",
            filters: INBOUND_FILTERS, empty: INBOUND_EMPTY, cols: INBOUND_COLS, sub: (d) => `${count(d.total, "event", "events")}, ${modeText()}` }
        : { path: "webhooks", api: "/super/webhooks/outbound", title: "Outbound deliveries", search: "Search event ID, event or endpoint URL", range: "Created",
            filters: [["wo-status", "Status", "status", [["", "Any status"], ["PENDING", "Pending"], ["DELIVERED", "Delivered"], ["FAILED", "Failed"]]]],
            empty: ["No deliveries yet", "Deliveries appear when an organization registers a webhook endpoint and an event is sent to it."],
            cols: OUTBOUND_COLS, sub: (d) => `${count(d.total, "delivery", "deliveries")}, ${modeText()}`, rowHref: (d) => "#/orgs/" + encodeURIComponent(d.org.id) + "?tab=integrations" }, isCurrent);
      if (!r) return;
      view.innerHTML = head + tabs + r.html + note(dir === "in"
        ? "Raw payloads are not shown here. They are stored with hashes, salts and card data removed."
        : "Payloads are not shown here. Organizations can redeliver from their own developer settings.");
      r.bind(view);
    },
  };

  // ── Webhook failures: both directions on one screen ──
  SA.pages["webhook-failures"] = {
    title: "Webhook failures",
    async render(view, { params: p, isCurrent }) {
      const head = ui.head("Webhook failures", "PayU messages that failed processing or signature checks, and merchant deliveries that failed.", ui.select("wf-range", "Period", RANGES, p.range || ""));
      view.innerHTML = head + ui.skelPanel(5) + ui.skelPanel(5);
      const range = p.range || undefined;
      const [inb, out] = await Promise.all([
        SA.api("/super/webhooks/inbound", { failed: "1", range, page: p.ip, size: 25 }),
        SA.api("/super/webhooks/outbound", { status: "FAILED", range, page: p.op, size: 25 }),
      ]);
      if (!isCurrent()) return;
      const hrefFor = (over) => SA.hashFor("webhook-failures", { ...p, ...over });
      view.innerHTML = head
        + ui.panel("From PayU", ui.table(INBOUND_COLS, inb.rows, ui.empty("No failed PayU events", inb.total === 0 && !range ? INBOUND_EMPTY[1] : "Nothing failed in this period.")) + ui.pager(inb, (n) => hrefFor({ ip: n })),
          { sub: `${fmt.int(inb.total)} failed or invalid, ${modeText()}` })
        + ui.panel("To merchants", ui.table(OUTBOUND_COLS, out.rows, ui.empty("No failed deliveries", "Every merchant webhook delivery in this period succeeded or is still pending."),
          { rowHref: (d) => "#/orgs/" + encodeURIComponent(d.org.id) + "?tab=integrations" }) + ui.pager(out, (n) => hrefFor({ op: n })),
          { sub: `${fmt.int(out.total)} failed, ${modeText()}` });
      view.querySelector("#wf-range").addEventListener("change", (e) => SA.go(hrefFor({ range: e.target.value, ip: "", op: "" })));
    },
  };

  // ── Integration health ──
  SA.pages["integration-health"] = {
    title: "Integration health",
    async render(view, { isCurrent }) {
      const head = ui.head("Integration health", "PayU availability, callback processing and merchant webhook delivery, from recorded events.", `<button class="btn" type="button" id="ih-refresh">Refresh</button>`);
      view.innerHTML = head + `<div class="grid g3">${ui.skelPanel(4)}${ui.skelPanel(4)}${ui.skelPanel(4)}</div>` + ui.skelPanel(5);
      const [h, providers] = await Promise.all([SA.api("/super/integration-health"), SA.api("/super/providers")]);
      if (!isCurrent()) return;
      const pv = providers[0] || {};
      const i = h.inbound, o = h.outbound, down = h.gateway.active;
      const status = (tone, label) => `<div style="margin-bottom:10px">${pill(label, tone)}</div>`;
      const payu = down.length ? status("bad", `${down.length} active downtime ${down.length === 1 ? "notice" : "notices"}`)
        : pv.lastErrorAt && (!pv.lastSuccessAt || new Date(pv.lastErrorAt) > new Date(pv.lastSuccessAt)) ? status("warn", "Latest payment failed")
        : pv.lastSuccessAt ? status("ok", "Payments succeeding") : status("", "No payments yet");
      const callbacks = i.received24h === 0 && !i.lastSuccessAt ? status("", "No callbacks recorded") : i.failed24h ? status("warn", `${i.failed24h} failed in 24 h`) : status("ok", "Processing normally");
      const deliveries = o.failed ? status("warn", `${o.failed} failed`) : o.delivered || o.pending ? status("ok", "Delivering") : status("", "No deliveries yet");
      const t = (d) => (d ? `${esc(fmt.dt(d))} <span class="muted">(${esc(fmt.ago(d))})</span>` : '<span class="muted">—</span>');
      const downCols = [
        { label: "Method", render: (d) => esc(d.method) }, { label: "Bank", render: (d) => esc(d.bank || "All") },
        { label: "Severity", render: (d) => pill(fmt.label(d.severity), d.severity === "down" ? "bad" : "warn") },
        { label: "Message", render: (d) => esc(d.message || "—"), cls: "ellip" }, { label: "Source", render: (d) => esc(d.source) },
        { label: "Started", render: (d) => esc(fmt.dt(d.startedAt)), cls: "nowrap" }, { label: "Ended", render: (d) => (d.endedAt ? esc(fmt.dt(d.endedAt)) : pill("Ongoing", "bad")), cls: "nowrap" },
      ];
      view.innerHTML = head + `<div class="grid g3">
        ${ui.panel("PayU availability", `<div class="panel-body">${payu}${ui.kv([["Payments, last 24 h", fmt.int(pv.last24h || 0)], ["Success rate, 24 h", pv.last24h ? fmt.pct(pv.ok24h / pv.last24h) : "—"],
          ["Last success", t(pv.lastSuccessAt)], ["Last error", t(pv.lastErrorAt)]])}</div>`)}
        ${ui.panel("PayU callbacks (inbound)", `<div class="panel-body">${callbacks}${ui.kv([["Received, last 24 h", fmt.int(i.received24h)], ["Failed, last 24 h", fmt.int(i.failed24h)],
          ["Invalid signatures, all time", fmt.int(i.signatureInvalid)], ["Last successful callback", t(i.lastSuccessAt)], ["Last error", t(i.lastErrorAt)]])}</div>`)}
        ${ui.panel("Merchant webhooks (outbound)", `<div class="panel-body">${deliveries}${ui.kv([["Delivered", fmt.int(o.delivered)], ["Pending", fmt.int(o.pending)], ["Failed", fmt.int(o.failed)],
          ["Last delivered", t(o.lastDeliveredAt)], ["Last failed", t(o.lastFailedAt)]])}</div>`)}
      </div>`
        + ui.panel("Payment methods, last 24 hours", ui.table([
          { label: "Method", render: (m) => esc(m.method) }, { label: "Payments", align: "r", render: (m) => fmt.int(m.total) },
          { label: "Successful", align: "r", render: (m) => fmt.int(m.successful) },
          { label: "Success rate", align: "r", render: (m) => `<span style="color:${m.successRate != null && m.successRate < 0.6 ? "var(--bad)" : "inherit"}">${fmt.pct(m.successRate)}</span>` },
        ], h.methods24h, ui.empty("No payments in the last 24 hours", "Method success rates appear once payments come in.")), { sub: modeText() })
        + ui.panel("Gateway downtime", ui.table(downCols, [...down, ...h.gateway.recent], ui.empty("No downtime recorded",
          "Active and recent (7 days) bank or method downtime from PayU appears here. Nothing records downtime yet, so this list stays empty until that feed is connected.")),
          { sub: `${down.length} active, ${h.gateway.recent.length} ended in the last 7 days` })
        + note(`Checked ${fmt.dt(h.checkedAt)} IST. Figures are for ${modeText()} where they belong to a mode.`);
      view.querySelector("#ih-refresh").addEventListener("click", () => SA.render());
    },
  };
})();

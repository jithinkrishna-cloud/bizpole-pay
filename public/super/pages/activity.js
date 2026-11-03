// System activity: recent platform events from GET /api/super/activity. Feed renderers are shared with the overview.
(() => {
  "use strict";
  const { esc, fmt, ui } = SA;
  const list = (rows, item, emptyTitle, emptyText) =>
    rows.length ? `<ul class="feed">${rows.map(item).join("")}</ul>` : ui.empty(emptyTitle, emptyText);
  const li = (title, when, sub = "") => `<li><span class="t">${title}</span><span class="when" title="${esc(fmt.dt(when))} IST">${esc(fmt.ago(when))}</span>${sub ? `<span class="s">${sub}</span>` : ""}</li>`;
  const orgName = (o) => (o ? esc(o.name) : "Platform");

  SA.feeds = {
    organizations: (rows) => list(rows, (o) => li(`<a href="#/orgs/${encodeURIComponent(o.id)}">${esc(o.name)}</a>`, o.date, `${ui.pill(o.status)} <span>${esc(o.email)}</span>`),
      "No organizations yet", "New sign-ups appear here."),
    refunds: (rows) => list(rows, (r) => li(`<span class="num">${fmt.inr(r.amount)}</span> on <span class="mono">${esc(r.txnid)}</span>`, r.date, `${ui.pill(r.status)} ${ui.modeTag(r.mode)} ${orgName(r.org)}`),
      "No refunds yet", "Refund requests from any organization appear here."),
    verificationDecisions: (rows) => list(rows, (d) => li(`${orgName(d.org)}: ${esc(d.area)} ${d.from ? esc(d.from) + " → " : ""}${esc(d.to)}`, d.date, esc(d.remarks || d.event)),
      "No PayU verification updates yet", "PayU onboarding status changes are recorded once the partner onboarding webhook is connected."),
    providerFailures: (rows) => list(rows, (f) => li(`${esc(fmt.label(f.source))} ${ui.pill(f.processing)}`, f.date, `${ui.modeTag(f.mode)} ${orgName(f.org)}${f.error ? " · " + esc(f.error) : ""}`),
      "No provider failures", "Inbound PayU callbacks that fail processing or signature checks appear here. The callback receiver isn't connected yet, so none have been recorded."),
    reconExceptions: (rows) => list(rows, (x) => li(`${esc(x.entityType)} ${esc(x.field)}: ours ${esc(x.local ?? "missing")}, PayU ${esc(x.payu ?? "missing")}`, x.date, `${esc(fmt.label(x.kind))} ${ui.modeTag(x.mode)} ${orgName(x.org)}`),
      "No open reconciliation exceptions", "Mismatches between Paynest and PayU appear here once reconciliation runs are scheduled."),
    superAdminActions: (rows) => list(rows, (a) => li(`<span class="mono">${esc(a.action)}</span>${a.entity ? ` on ${esc(a.entity)}` : ""}`, a.date, esc(a.actor.name) + " · " + esc(a.actor.email)),
      "No Super Admin actions yet", "Every operator action, including exports, is written to the audit log and listed here."),
  };

  // Transactions as a compact table (most information-dense feed).
  SA.feeds.transactions = (rows) => ui.table([
    { label: "Txnid", render: (t) => `<a class="mono" href="#/transactions/${encodeURIComponent(t.txnid)}">${esc(t.txnid)}</a>`, cls: "nowrap" },
    { label: "Organization", render: (t) => orgName(t.org), cls: "ellip" },
    { label: "Method", render: (t) => esc(t.method), cls: "nowrap" },
    { label: "Status", render: (t) => ui.pill(t.status) },
    { label: "Mode", render: (t) => ui.modeTag(t.mode) },
    { label: "Amount", align: "r", render: (t) => fmt.inr(t.amount), cls: "nowrap" },
    { label: "Created", align: "r", render: (t) => `<span title="${esc(fmt.dt(t.date))} IST">${esc(fmt.ago(t.date))}</span>`, cls: "nowrap" },
  ], rows, ui.empty("No transactions yet", "Payments from every organization appear here as they are created."));

  SA.ACTIVITY_PANELS = [
    ["organizations", "Latest organizations", "orgs"],
    ["refunds", "Recent refund requests", "refunds"],
    ["verificationDecisions", "Verification decisions", "orgs-kyc"],
    ["providerFailures", "Provider failures", "webhook-failures"],
    ["reconExceptions", "Reconciliation exceptions", "recon-exceptions"],
    ["superAdminActions", "Super Admin actions", "admin-actions"],
  ];

  SA.pages.activity = {
    title: "System activity",
    async render(view, { isCurrent }) {
      const head = ui.head("System activity", "The 25 most recent events of each kind across the platform, newest first.");
      view.innerHTML = head + ui.skelPanel(6) + `<div class="grid g3">${Array.from({ length: 3 }, () => ui.skelPanel(5)).join("")}</div>`;
      const a = await SA.api("/super/activity", { limit: 25 });
      if (!isCurrent()) return;
      view.innerHTML = head + ui.panel("Latest payment transactions", SA.feeds.transactions(a.transactions), { sub: `${a.transactions.length} shown` }) +
        `<div class="grid g3">${SA.ACTIVITY_PANELS.map(([k, title]) => ui.panel(title, SA.feeds[k](a[k]), { sub: a[k].length ? `${a[k].length} shown` : "" })).join("")}</div>`;
    },
  };
})();

// Organization management (read-only). Lists: All organizations, Onboarding, Verification and KYC, Organization status,
// Organization users. Detail: #/orgs/<id>?tab=… with nine tabs. Data: /api/super/orgs, /orgs/:id, /users, /transactions,
// /refunds, /settlements, /audit. PayU owns verification and activation, so there are no approve/suspend actions here.
(() => {
  "use strict";
  const { esc, fmt, ui } = SA;

  const STATUS = { TEST_ONLY: "Test only", ONBOARDING: "Onboarding", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review",
    ACTION_REQUIRED: "Action required", LIVE: "Live", REJECTED: "Rejected", SUSPENDED: "Suspended", DEACTIVATED: "Deactivated" };
  // Verification as an operator reads it, derived from the account status (PayU's raw status is shown alongside).
  const VERIFICATION = { TEST_ONLY: ["Not submitted", ""], ONBOARDING: ["Not submitted", ""], SUBMITTED: ["In review", "warn"], UNDER_REVIEW: ["In review", "warn"],
    ACTION_REQUIRED: ["Action required", "warn"], LIVE: ["Verified", "ok"], REJECTED: ["Rejected", "bad"], SUSPENDED: ["—", ""], DEACTIVATED: ["—", ""] };
  const STEP = { PAN_DETAILS: "PAN details", BUSINESS_DETAILS: "Business details", BANK_ACCOUNT: "Bank account", WEBSITE_DETAILS: "Website details",
    KYC_DOCUMENTS: "KYC documents", SIGNATORY: "Signatory", AGREEMENT: "Agreement", VKYC: "Video KYC" };
  const RANGES = [["", "Any time"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["ytd", "This year"]];
  const modeText = () => (SA.state.mode === "all" ? "all modes" : SA.state.mode + " mode");
  const pill = (label, tone) => `<span class="pill ${tone || ""}">${esc(label)}</span>`;
  const statusPill = (s) => pill(STATUS[s] || fmt.label(s), { LIVE: "ok", REJECTED: "bad", SUSPENDED: "bad", DEACTIVATED: "bad", SUBMITTED: "warn", UNDER_REVIEW: "warn", ACTION_REQUIRED: "warn", TEST_ONLY: "info", ONBOARDING: "info" }[s]);
  const when = (d) => (d ? `<span title="${esc(fmt.dt(d))} IST">${esc(fmt.date(d))}</span>` : '<span class="muted">—</span>');
  const orgHref = (id, tab) => SA.hashFor("orgs/" + encodeURIComponent(id), tab && tab !== "overview" ? { tab } : {});
  const empty = (t, s) => ui.empty(t, s);

  // ── Organization lists ──
  const COLUMNS = [
    { label: "Organization", sort: "name", render: (o) => `<a href="${orgHref(o.id)}">${esc(o.name)}</a>${o.legalName && o.legalName !== o.name ? `<div class="muted" style="font-size:12px">${esc(o.legalName)}</div>` : ""}` },
    { label: "Organization ID", render: (o) => `<span class="mono">${esc(o.id)}</span>`, cls: "nowrap" },
    { label: "Business email and contact", render: (o) => `<div class="ellip" style="max-width:240px">${esc(o.email)}</div><div class="muted" style="font-size:12px">${esc(o.mobile)}</div>` },
    { label: "Registered", sort: "createdAt", render: (o) => when(o.createdAt), cls: "nowrap" },
    { label: "Verification", render: (o) => { const [l, t] = VERIFICATION[o.status] || ["—", ""]; return `${pill(l, t)}${o.payuAccountStatus ? `<div class="muted" style="font-size:12px">PayU: ${esc(o.payuAccountStatus)}</div>` : ""}`; } },
    { label: "Account status", sort: "status", render: (o) => statusPill(o.status) },
    { label: "Transactions", sort: "txnCount", align: "r", render: (o) => fmt.int(o.txnCount) },
    { label: "Volume", sort: "volume", align: "r", render: (o) => fmt.inr(o.volume), cls: "nowrap" },
    { label: "Actions", align: "r", render: (o) => `<a href="${orgHref(o.id)}">View</a>` },
  ];

  // cfg: { path, title, sub, param: "group"|"status", chips: [[key, label, apiValue]], tiles }
  function listPage(cfg) {
    return {
      title: cfg.title,
      async render(view, { params: p, isCurrent }) {
        const key = cfg.chips.some(([k]) => k === p[cfg.param]) ? p[cfg.param] : cfg.chips[0][0];
        const base = { q: p.q, range: p.range };
        const filter = (k) => { const v = cfg.chips.find(([x]) => x === k)[2]; return v ? { [cfg.param]: v } : {}; };
        const hrefFor = (over) => SA.hashFor(cfg.path, { ...p, ...over });
        const head = ui.head(cfg.title, cfg.sub);
        view.innerHTML = head + ui.skelPanel(8);
        const [data, ...counts] = await Promise.all([
          SA.api("/super/orgs", { ...base, ...filter(key), sort: p.sort, dir: p.dir, page: p.page, size: 25 }),
          ...cfg.chips.map(([k]) => SA.api("/super/orgs", { ...base, ...filter(k), size: 1 }).then((r) => r.total)),
        ]);
        if (!isCurrent()) return;
        const items = cfg.chips.map(([k, l], i) => [k, l, counts[i]]);
        const chipHref = (k) => hrefFor({ [cfg.param]: k === cfg.chips[0][0] ? "" : k, page: "" });
        const filters = cfg.tiles
          ? `<nav class="status-strip" aria-label="Account status">${items.map(([k, l, n]) => `<a href="${chipHref(k)}"${k === key ? ' aria-current="true"' : ""}>${k === "all" ? esc(l) : statusPill(k)}<b>${fmt.int(n)}</b></a>`).join("")}</nav>`
          : "";
        const toolbar = `<div class="toolbar">${ui.search(p.q, "Search name, email, mobile or organization ID")}
          ${ui.select("org-range", "Registered", RANGES, p.range || "")}
          ${cfg.tiles ? "" : ui.chips(items, key, chipHref, "Organization filter")}</div>`;
        const [emptyTitle, emptyText] = cfg.empty || ["No organizations yet", "Organizations appear here as merchants sign up."];
        const table = ui.table(COLUMNS, data.rows, p.q || p.range
          ? empty("No organizations match these filters", "Clear the search or the date filter.")
          : key !== cfg.chips[0][0] ? empty(`No organizations in “${cfg.chips.find(([k]) => k === key)[1]}”`, "Choose another filter to see more.") : empty(emptyTitle, emptyText),
          { sort: { path: cfg.path, params: p }, rowHref: (o) => orgHref(o.id) });
        view.innerHTML = head + filters + `<section class="panel">${toolbar}${table}${ui.pager(data, (n) => hrefFor({ page: n }))}</section>
          <p class="muted" style="margin:0;font-size:12.5px">Transactions counts every payment attempt and volume counts successful payments, in ${esc(modeText())}. Verification is read-only: PayU verifies and activates organizations.</p>`;
        ui.bindSearch(view, (q) => hrefFor({ q, page: "" }));
        view.querySelector("#org-range").addEventListener("change", (e) => SA.go(hrefFor({ range: e.target.value, page: "" })));
      },
    };
  }

  SA.pages["orgs-onboarding"] = listPage({
    path: "orgs-onboarding", title: "Onboarding", param: "status",
    sub: "Organizations still completing the onboarding wizard and not yet submitted to PayU.",
    empty: ["No organizations are onboarding", "Every organization has submitted its application to PayU."],
    chips: [["all", "All onboarding", "TEST_ONLY,ONBOARDING"], ["TEST_ONLY", "Test only", "TEST_ONLY"], ["ONBOARDING", "Onboarding", "ONBOARDING"]],
  });
  SA.pages["orgs-kyc"] = listPage({
    path: "orgs-kyc", title: "Verification and KYC", param: "status",
    sub: "Organizations submitted to PayU for verification. Decisions come from PayU and are shown as recorded.",
    empty: ["No organizations are in verification", "Organizations appear here after they finish onboarding and submit their application to PayU."],
    chips: [["all", "All in verification", "SUBMITTED,UNDER_REVIEW,ACTION_REQUIRED,REJECTED"], ["SUBMITTED", "Submitted", "SUBMITTED"],
      ["UNDER_REVIEW", "Under review", "UNDER_REVIEW"], ["ACTION_REQUIRED", "Action required", "ACTION_REQUIRED"], ["REJECTED", "Rejected", "REJECTED"]],
  });
  SA.pages["orgs-status"] = listPage({
    path: "orgs-status", title: "Organization status", param: "status", tiles: true,
    sub: "How many organizations are in each account status. Choose a status to list them.",
    chips: [["all", "All statuses", ""], ...Object.keys(STATUS).map((s) => [s, STATUS[s], s])],
  });
  const allOrgs = listPage({
    path: "orgs", title: "All organizations", param: "group",
    sub: "Every organization on Bizpole Pay. Open one to see its profile, users, payments and integrations.",
    chips: [["all", "All", ""], ["active", "Active", "active"], ["pending", "Pending", "pending"], ["verified", "Verified", "verified"], ["rejected", "Rejected", "rejected"], ["suspended", "Suspended", "suspended"]],
  });

  // ── Organization users: everyone with a role in an organization ──
  const ROLE_OPTS = [["", "Any role"], ["ORG_ADMIN", "Owners and admins"], ["OWNER", "Owner"], ["ADMIN", "Admin"], ["FINANCE", "Finance"], ["DEVELOPER", "Developer"], ["SUPPORT", "Support"], ["VIEWER", "Viewer"]];
  SA.pages["orgs-users"] = {
    title: "Organization users",
    async render(view, { params: p, isCurrent }) {
      const hrefFor = (over) => SA.hashFor("orgs-users", { ...p, ...over });
      const head = ui.head("Organization users", "People with access to an organization, and the role they hold in each.");
      view.innerHTML = head + ui.skelPanel(8);
      const data = await SA.api("/super/users", { q: p.q, role: p.role, sort: p.sort, dir: p.dir, page: p.page, size: 25 });
      if (!isCurrent()) return;
      const cols = [
        { label: "User", sort: "name", render: (u) => `<a href="#/users/${encodeURIComponent(u.id)}">${esc(u.name)}</a><div class="muted" style="font-size:12px">${esc(u.email)}</div>` },
        { label: "Organizations and roles", render: (u) => u.memberships.length
          ? u.memberships.map((m) => `<div><a href="${orgHref(m.orgId, "users")}">${esc(m.org)}</a> <span class="tag">${esc(fmt.label(m.role))}</span></div>`).join("")
          : `<span class="muted">${u.platformRole ? "Platform operator, no organization" : "No organization"}</span>` },
        { label: "Status", render: (u) => ui.pill(u.status) },
        { label: "Last sign-in", sort: "lastLoginAt", render: (u) => (u.lastLoginAt ? `<span title="${esc(fmt.dt(u.lastLoginAt))} IST">${esc(fmt.ago(u.lastLoginAt))}</span>` : '<span class="muted">Never</span>'), cls: "nowrap" },
        { label: "Joined", sort: "createdAt", render: (u) => when(u.createdAt), cls: "nowrap" },
      ];
      view.innerHTML = head + `<section class="panel"><div class="toolbar">${ui.search(p.q, "Search name, email or mobile")}${ui.select("ou-role", "Role", ROLE_OPTS, p.role || "")}</div>
        ${ui.table(cols, data.rows, empty("No users match", "Clear the search or choose another role."), { sort: { path: "orgs-users", params: p }, rowHref: (u) => "#/users/" + encodeURIComponent(u.id) })}
        ${ui.pager(data, (n) => hrefFor({ page: n }))}</section>`;
      ui.bindSearch(view, (q) => hrefFor({ q, page: "" }));
      view.querySelector("#ou-role").addEventListener("change", (e) => SA.go(hrefFor({ role: e.target.value, page: "" })));
    },
  };

  // ── Organization detail ──
  const TABS = [["overview", "Overview"], ["business", "Business information"], ["documents", "Verification documents"], ["users", "Users"],
    ["transactions", "Transactions"], ["refunds", "Refunds"], ["settlements", "Settlements"], ["integrations", "API integrations"], ["activity", "Activity history"]];

  const stepMark = (s) => ({ VERIFIED: "done", SUBMITTED: "done", IN_PROGRESS: "part", REJECTED: "bad" }[s] || "");

  function overviewTab(o) {
    const modes = ["TEST", "LIVE"].filter((m) => o.stats[m]);
    const stats = modes.length ? modes.map((m) => { const s = o.stats[m]; return ui.panel(`${fmt.label(m)} mode`, `<div class="stat-row">
        <div><b>${fmt.int(s.transactions)}</b><span>Transactions</span></div>
        <div><b>${s.transactions ? fmt.pct(s.successful / s.transactions) : "—"}</b><span>Success rate</span></div>
        <div><b>${fmt.inr(s.volume)}</b><span>Successful volume</span></div>
        <div><b>${fmt.inr(s.refunded)}</b><span>Refunded</span></div>
        <div><b>${fmt.inr(s.settled)}</b><span>Settled to bank</span></div></div>`); }).join("")
      : ui.panel("Payments", empty("No payments yet", "This organization hasn't taken a payment in test or live mode."));
    const steps = o.onboarding.length ? `<ul class="steps">${o.onboarding.map((s) => `<li><span class="mark ${stepMark(s.status)}" aria-hidden="true"></span>
        <span>${esc(STEP[s.key] || fmt.label(s.key))}${s.remarks ? `<div class="muted" style="font-size:12px">${esc(s.remarks)}</div>` : ""}</span>${ui.pill(s.status)}</li>`).join("")}</ul>`
      : empty("No onboarding steps", "Steps are created when the organization signs up.");
    const done = o.onboarding.filter((s) => ["SUBMITTED", "VERIFIED"].includes(s.status)).length;
    const payu = o.payu.statuses.length
      ? ui.kv(o.payu.statuses.map((s) => [fmt.label(s.area), `${esc(s.status)} <span class="muted" style="font-size:12px">${esc(fmt.date(s.changedAt))}</span>${s.remarks ? `<div class="muted" style="font-size:12px">${esc(s.remarks)}</div>` : ""}`]))
      : empty("Not with PayU yet", "PayU statuses appear once the organization is referred through the partner onboarding API.");
    return stats + `<div class="grid g3">
      ${ui.panel("Onboarding progress", `<div class="panel-body">${steps}</div>`, { sub: o.onboarding.length ? `${done} of ${o.onboarding.length} submitted` : "" })}
      ${ui.panel("PayU verification", `<div class="panel-body">${ui.kv([["PayU MID", o.payu.mid ? `<span class="mono">${esc(o.payu.mid)}</span>` : ""], ["Merchant UUID", o.payu.merchantUuid ? `<span class="mono">${esc(o.payu.merchantUuid)}</span>` : ""]])}<div style="margin-top:12px">${payu}</div></div>`)}
      ${ui.panel("Key dates", `<div class="panel-body">${ui.kv([["Registered", esc(fmt.dt(o.dates.createdAt))], ["Last updated", esc(fmt.dt(o.dates.updatedAt))],
        ["Activated", o.dates.activatedAt ? esc(fmt.dt(o.dates.activatedAt)) : ""], ["Deactivated", o.dates.deactivatedAt ? esc(fmt.dt(o.dates.deactivatedAt)) : ""]])}</div>`)}
    </div>`;
  }

  function businessTab(o) {
    const b = o.business;
    const addr = b.addresses.length ? ui.kv(b.addresses.map((a) => [fmt.label(a.kind), esc([a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", "))]))
      : empty("No address on file", "Addresses are added in the business details step of onboarding.");
    const banks = ui.table([
      { label: "Account holder", render: (x) => esc(x.holder) + (x.nameAtBank && x.nameAtBank !== x.holder ? `<div class="muted" style="font-size:12px">Name at bank: ${esc(x.nameAtBank)}</div>` : "") },
      { label: "Account", render: (x) => `<span class="mono">•••• ${esc(x.last4)}</span>`, cls: "nowrap" },
      { label: "IFSC", render: (x) => `<span class="mono">${esc(x.ifsc)}</span>` },
      { label: "Bank", render: (x) => esc(x.bankName || "—") },
      { label: "Verified", render: (x) => (x.verified ? pill("Penny-drop verified", "ok") : pill("Not verified", "")) },
      { label: "Use", render: (x) => (x.retiredAt ? pill("Removed", "") : x.primary ? pill("Primary", "info") : "") },
      { label: "Added", render: (x) => when(x.createdAt), cls: "nowrap" },
    ], o.bankAccounts, empty("No bank account", "The organization adds its settlement account in onboarding or settings."));
    return `<div class="grid g2">
      ${ui.panel("Business profile", `<div class="panel-body">${ui.kv([
        ["Display name", esc(o.name)], ["Legal name", esc(o.legalName || "")], ["Entity type", b.entityType ? esc(fmt.label(b.entityType)) : ""],
        ["Category", esc([b.category, b.subCategory].filter(Boolean).join(" / "))], ["PAN", b.panLast4 ? `<span class="mono">••••••${esc(b.panLast4)}</span>` : ""],
        ["GSTIN", b.gstin ? `<span class="mono">${esc(b.gstin)}</span>` : ""], ["Website", ui.extLink(b.websiteUrl)], ["App", ui.extLink(b.appUrl)],
        ["Integration", b.integrationType ? esc(fmt.label(b.integrationType)) : ""], ["Business email", esc(o.email)], ["Contact number", esc(o.mobile)],
      ])}</div>`)}
      ${ui.panel("Addresses", `<div class="panel-body">${addr}</div>`)}
    </div>` + ui.panel("Bank accounts", banks, { sub: "Account numbers are stored encrypted; only the last 4 digits are shown." });
  }

  function documentsTab(o) {
    const steps = ui.table([
      { label: "Step", render: (s) => esc(STEP[s.key] || fmt.label(s.key)) },
      { label: "Status", render: (s) => ui.pill(s.status) },
      { label: "Remarks", render: (s) => esc(s.remarks || "—") },
      { label: "Submitted", render: (s) => when(s.submittedAt), cls: "nowrap" },
      { label: "Verified", render: (s) => when(s.verifiedAt), cls: "nowrap" },
    ], o.onboarding, empty("No onboarding steps", "Steps are created when the organization signs up."));
    const docs = ui.table([
      { label: "Document", render: (d) => esc(fmt.label(d.type)) },
      { label: "Number", render: (d) => (d.numberMasked ? `<span class="mono">${esc(d.numberMasked)}</span>` : "—") },
      { label: "Status", render: (d) => ui.pill(d.status) },
      { label: "Sent to PayU", render: (d) => (d.sentToPayu ? "Yes" : "No") },
      { label: "Remarks", render: (d) => esc(d.remarks || "—") },
      { label: "Uploaded", render: (d) => when(d.uploadedAt), cls: "nowrap" },
      { label: "Reviewed", render: (d) => when(d.reviewedAt), cls: "nowrap" },
    ], o.documents, empty("No documents uploaded", "Document upload needs private file storage, which isn't configured yet, so no KYC files have been received."));
    const payu = ui.table([
      { label: "Area", render: (s) => esc(fmt.label(s.area)) },
      { label: "PayU status", render: (s) => esc(s.status) },
      { label: "Remarks", render: (s) => esc(s.remarks || "—") },
      { label: "Changed", render: (s) => when(s.changedAt), cls: "nowrap" },
    ], o.payu.statuses, empty("No PayU verification yet", "PayU's per-area statuses appear after the organization is referred to PayU."));
    return `<div class="note">Verification decisions are made by PayU. This view shows what has been recorded; it can't approve, reject or request documents.</div>`
      + ui.panel("Onboarding steps", steps) + ui.panel("KYC documents", docs) + ui.panel("PayU verification by area", payu);
  }

  function usersTab(o) {
    return ui.panel("Users", ui.table([
      { label: "Name", render: (u) => `<a href="#/users/${encodeURIComponent(u.userId)}">${esc(u.name)}</a>${u.platformRole ? ' <span class="tag">Super Admin</span>' : ""}` },
      { label: "Email", render: (u) => esc(u.email) },
      { label: "Role", render: (u) => esc(fmt.label(u.role)) },
      { label: "Status", render: (u) => ui.pill(u.status) },
      { label: "Last sign-in", render: (u) => (u.lastLoginAt ? `<span title="${esc(fmt.dt(u.lastLoginAt))} IST">${esc(fmt.ago(u.lastLoginAt))}</span>` : '<span class="muted">Never</span>'), cls: "nowrap" },
      { label: "Member since", render: (u) => when(u.since), cls: "nowrap" },
    ], o.users, empty("No users", "This organization has no members.")), { sub: `${o.users.length} ${o.users.length === 1 ? "person" : "people"}` });
  }

  function integrationsTab(o) {
    const i = o.integrations;
    return ui.panel("PayU credentials", ui.table([
      { label: "Mode", render: (c) => ui.modeTag(c.mode) },
      { label: "PayU MID", render: (c) => `<span class="mono">${esc(c.payuMid)}</span>` },
      { label: "Merchant key", render: (c) => `<span class="mono">${esc(c.merchantKey)}</span>` },
      { label: "Salt", render: (c) => `${esc(c.saltVersion)} <span class="muted">(never shown)</span>` },
      { label: "Status", render: (c) => ui.pill(c.status) },
      { label: "Default", render: (c) => (c.isDefault ? "Yes" : "") },
      { label: "Issued", render: (c) => when(c.issuedAt), cls: "nowrap" },
    ], i.credentials, empty("No PayU credentials", "Credentials are added in the organization's developer settings.")), { sub: "Keys are masked. Salts never leave the server." })
    + ui.panel("Bizpole Pay API keys", ui.table([
      { label: "Name", render: (k) => esc(k.name) },
      { label: "Key prefix", render: (k) => `<span class="mono">${esc(k.prefix)}</span>` },
      { label: "Mode", render: (k) => ui.modeTag(k.mode) },
      { label: "Last used", render: (k) => (k.lastUsedAt ? `<span title="${esc(fmt.dt(k.lastUsedAt))} IST">${esc(fmt.ago(k.lastUsedAt))}</span>` : '<span class="muted">Never</span>'), cls: "nowrap" },
      { label: "State", render: (k) => (k.revokedAt ? pill("Revoked", "bad") : pill("Active", "ok")) },
      { label: "Created", render: (k) => when(k.createdAt), cls: "nowrap" },
    ], i.apiKeys, empty("No API keys", "The organization hasn't created a Bizpole Pay API key.")))
    + ui.panel("Webhook endpoints", ui.table([
      { label: "URL", render: (w) => `<span class="mono">${esc(w.url)}</span>`, cls: "ellip" },
      { label: "Mode", render: (w) => ui.modeTag(w.mode) },
      { label: "Events", render: (w) => esc((w.events || []).join(", ") || "All") },
      { label: "State", render: (w) => (w.active ? pill("Active", "ok") : pill("Paused", "")) },
      { label: "Deliveries", align: "r", render: (w) => fmt.int(w.deliveries) },
      { label: "Failed", align: "r", render: (w) => (w.failed ? `<span style="color:var(--bad)">${fmt.int(w.failed)}</span>` : "0") },
      { label: "Last delivery", render: (w) => (w.lastDeliveryAt ? `<span title="${esc(fmt.dt(w.lastDeliveryAt))} IST">${esc(fmt.ago(w.lastDeliveryAt))}</span>` : '<span class="muted">—</span>'), cls: "nowrap" },
    ], i.webhooks, empty("No webhook endpoints", "The organization hasn't registered a webhook URL.")));
  }

  // Tabs backed by paged platform endpoints, filtered to this organization (and the header's mode).
  const PAGED = {
    transactions: { api: "/super/transactions", title: "Transactions", sumText: (d) => `${fmt.int(d.summary.count)} payments, ${fmt.int(d.summary.successful)} successful, ${fmt.inr(d.summary.volume)}`,
      empty: ["No transactions", "This organization has no payments in the selected mode."], cols: [
        { label: "Txnid", render: (t) => `<a class="mono" href="#/transactions/${encodeURIComponent(t.txnid)}">${esc(t.txnid)}</a>`, cls: "nowrap" },
        { label: "Customer", render: (t) => esc(t.customer.name || t.customer.email || "—"), cls: "ellip" },
        { label: "Method", render: (t) => esc(t.method), cls: "nowrap" },
        { label: "Status", render: (t) => ui.pill(t.status) },
        { label: "Mode", render: (t) => ui.modeTag(t.mode) },
        { label: "Amount", align: "r", render: (t) => fmt.inr(t.amount), cls: "nowrap" },
        { label: "Created", align: "r", render: (t) => `<span title="${esc(fmt.dt(t.date))} IST">${esc(fmt.date(t.date))}</span>`, cls: "nowrap" }],
      href: (t) => "#/transactions/" + encodeURIComponent(t.txnid) },
    refunds: { api: "/super/refunds", title: "Refunds", sumText: (d) => `${fmt.int(d.summary.count)} refunds, ${fmt.inr(d.summary.amount)} not failed`,
      empty: ["No refunds", "This organization has no refunds in the selected mode."], cols: [
        { label: "Txnid", render: (r) => `<span class="mono">${esc(r.txnid)}</span>`, cls: "nowrap" },
        { label: "Amount", align: "r", render: (r) => fmt.inr(r.amount), cls: "nowrap" },
        { label: "Of payment", align: "r", render: (r) => fmt.inr(r.captured), cls: "nowrap" },
        { label: "Status", render: (r) => ui.pill(r.status) },
        { label: "PayU request", render: (r) => (r.provider.requestId ? `<span class="mono">${esc(r.provider.requestId)}</span>` : "—") },
        { label: "Mode", render: (r) => ui.modeTag(r.mode) },
        { label: "Requested", align: "r", render: (r) => `<span title="${esc(fmt.dt(r.date))} IST">${esc(fmt.date(r.date))}</span>`, cls: "nowrap" }],
      href: (r) => "#/refunds/" + encodeURIComponent(r.id) },
    settlements: { api: "/super/settlements", title: "Settlements", sumText: (d) => `${fmt.int(d.summary.count)} settlements, ${fmt.inr(d.summary.net)} net, ${fmt.int(d.summary.pending)} pending`,
      empty: ["No settlements", "PayU settlements for this organization appear here once they are synced."], cols: [
        { label: "UTR", render: (s) => `<span class="mono">${esc(s.utr || s.payuSettlementId)}</span>`, cls: "nowrap" },
        { label: "Status", render: (s) => ui.pill(s.status) },
        { label: "Gross", align: "r", render: (s) => fmt.inr(s.gross), cls: "nowrap" },
        { label: "Fees and tax", align: "r", render: (s) => fmt.inr(s.fee + s.tax), cls: "nowrap" },
        { label: "Net", align: "r", render: (s) => fmt.inr(s.net), cls: "nowrap" },
        { label: "Check", render: (s) => (s.discrepancy.formula || (s.discrepancy.lines || 0) ? `<span class="pill warn" title="Net differs from gross minus deductions by ${esc(fmt.inr(s.discrepancy.formula))}">Discrepancy</span>` : '<span class="pill ok">Balanced</span>') },
        { label: "Mode", render: (s) => ui.modeTag(s.mode) },
        { label: "Date", align: "r", render: (s) => `<span title="${esc(fmt.dt(s.date))} IST">${esc(fmt.date(s.date))}</span>`, cls: "nowrap" }],
      href: (s) => "#/settlements/" + encodeURIComponent(s.id) },
    activity: { api: "/super/audit", title: "Activity history", sumText: (d) => `${fmt.int(d.total)} recorded events`,
      empty: ["No activity recorded", "Actions taken in this organization's dashboard are recorded here."], cols: [
        { label: "When", render: (a) => `<span title="${esc(fmt.dt(a.date))} IST">${esc(fmt.dt(a.date))}</span>`, cls: "nowrap" },
        { label: "Actor", render: (a) => (a.actor ? `${esc(a.actor.name)}<div class="muted" style="font-size:12px">${esc(a.actor.email)}</div>` : '<span class="muted">System</span>') },
        { label: "Role", render: (a) => (a.role ? esc(fmt.label(a.role)) : "—") },
        { label: "Action", render: (a) => `<span class="mono">${esc(a.action)}</span>` },
        { label: "Target", render: (a) => (a.entity ? `${esc(a.entity)}${a.entityId ? ` <span class="mono muted" style="font-size:12px">${esc(a.entityId)}</span>` : ""}` : "—"), cls: "ellip" },
        { label: "IP", render: (a) => (a.ip ? `<span class="mono">${esc(a.ip)}</span>` : "—"), cls: "nowrap" }] },
  };

  async function pagedTab(view, o, tab, p, isCurrent) {
    const cfg = PAGED[tab];
    // Audit rows are mostly mode-less, so the activity tab ignores the header's mode filter.
    const data = await SA.api(cfg.api, { orgId: o.id, page: p.page, size: 25 }, { withMode: tab !== "activity" });
    if (!isCurrent()) return null;
    const hrefFor = (n) => SA.hashFor("orgs/" + encodeURIComponent(o.id), { tab, page: n });
    return ui.panel(cfg.title, ui.table(cfg.cols, data.rows, empty(...cfg.empty), cfg.href ? { rowHref: cfg.href } : {}) + ui.pager(data, hrefFor),
      { sub: `${cfg.sumText(data)}${tab === "activity" ? "" : ", " + modeText()}` });
  }

  async function detail(view, id, p, isCurrent) {
    const tab = TABS.some(([k]) => k === p.tab) ? p.tab : "overview";
    view.innerHTML = ui.skelPanel(3) + `<div class="grid g3">${ui.skelPanel(5)}${ui.skelPanel(5)}${ui.skelPanel(5)}</div>`;
    let o;
    try { o = await SA.api("/super/orgs/" + encodeURIComponent(id)); }
    catch (e) {
      if (e.status !== 404) throw e;
      view.innerHTML = ui.head("Organization not found", "") + `<div class="panel">${ui.empty("There is no organization with this ID", "It may have been entered incorrectly.")}<div style="text-align:center;padding-bottom:20px"><a href="#/orgs">Back to all organizations</a></div></div>`;
      return;
    }
    if (!isCurrent()) return;
    SA.crumb(o.name, "#/orgs");
    const header = `<div class="org-head"><div><h1 style="margin:0;font-size:22px;font-weight:600">${esc(o.name)}</h1>
        <div class="meta">${statusPill(o.status)}<span class="mono">${esc(o.id)}</span><span>Registered ${esc(fmt.date(o.dates.createdAt))}</span>${o.payu.mid ? `<span>PayU MID <span class="mono">${esc(o.payu.mid)}</span></span>` : ""}</div></div>
        <div style="margin-left:auto"><a class="btn" href="#/orgs">All organizations</a></div></div>`;
    const tabs = ui.tabs(TABS, tab, (k) => orgHref(o.id, k));
    let body;
    if (PAGED[tab]) {
      view.innerHTML = header + tabs + ui.skelPanel(8);
      body = await pagedTab(view, o, tab, p, isCurrent);
      if (body === null) return;
    } else body = { overview: overviewTab, business: businessTab, documents: documentsTab, users: usersTab, integrations: integrationsTab }[tab](o);
    view.innerHTML = header + tabs + body;
    // On narrow screens the tab bar scrolls sideways; keep the open tab visible.
    const on = view.querySelector(".tabs a[aria-current]"), bar = view.querySelector(".tabs");
    if (on && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
  }

  SA.pages.orgs = {
    title: "All organizations",
    render(view, ctx) {
      if (ctx.sub[0]) return detail(view, ctx.sub[0], ctx.params, ctx.isCurrent);
      return allOrgs.render(view, ctx);
    },
  };
})();

// Financial operations (read-only): All transactions, Payment attempts, Successful payments, Failed payments, Refunds,
// Refund requests, Settlements, Reconciliation, Reconciliation exceptions, and detail pages for a transaction, refund,
// settlement and exception. Data: /api/super/transactions, /refunds, /settlements, /recon*. No refund execution and no
// reconciliation decisions: neither is approved, so these screens only show what is recorded.
(() => {
  "use strict";
  const { esc, fmt, ui } = SA;

  const RANGES = [["", "Any time"], ["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["ytd", "This year"]];
  const METHODS = [["", "Any method"], ["CREDIT_CARD", "Credit Card"], ["DEBIT_CARD", "Debit Card"], ["NET_BANKING", "Net Banking"], ["UPI", "UPI"], ["WALLET", "Wallet"],
    ["EMI", "EMI"], ["CARDLESS_EMI", "Cardless EMI"], ["BNPL", "BNPL"], ["QR", "QR"], ["NEFT_RTGS", "NEFT/RTGS"], ["OTHER", "Other"]];
  const pill = (label, tone) => `<span class="pill ${tone || ""}">${esc(label)}</span>`;
  const count = (n, one, many) => `${fmt.int(n)} ${n === 1 ? one : many}`;
  const modeText = () => (SA.state.mode === "all" ? "all modes" : SA.state.mode + " mode");
  const note = (t) => `<p class="muted" style="margin:0;font-size:12.5px">${esc(t)}</p>`;
  const when = (d) => (d ? `<span title="${esc(fmt.dt(d))} IST">${esc(fmt.dt(d))}</span>` : '<span class="muted">—</span>');
  const orgCell = (o) => (o ? `<a href="#/orgs/${encodeURIComponent(o.id)}">${esc(o.name)}</a>` : '<span class="muted">—</span>');
  const mono = (v) => (v ? `<span class="mono">${esc(v)}</span>` : '<span class="muted">—</span>');
  const txnHref = (t) => "#/transactions/" + encodeURIComponent(t);
  const refundHref = (id) => "#/refunds/" + encodeURIComponent(id);
  const settleHref = (id) => "#/settlements/" + encodeURIComponent(id);
  const excHref = (id) => "#/recon-exceptions/" + encodeURIComponent(id);
  const notFound = (view, what, back, label) => {
    view.innerHTML = ui.head(`${what} not found`, "") + `<div class="panel">${ui.empty(`There is no ${what.toLowerCase()} with this reference`, "It may have been entered incorrectly.")}<div style="text-align:center;padding-bottom:20px"><a href="${back}">${esc(label)}</a></div></div>`;
  };
  const balanced = (s) => !s.discrepancy.formula && !(s.discrepancy.lines || 0);

  // ── Generic filtered list ──
  // cfg: { path, title, sub, api, chips: [[key, label, params]], selects: [[id, label, param, options]], search, rangeLabel, amount,
  //        cols, sorts, rowHref, stats(data), empty, note }
  function listPage(cfg) {
    return {
      title: cfg.title,
      async render(view, { params: p, isCurrent }) {
        const chips = cfg.chips || [["all", "All", {}]];
        const key = chips.some(([k]) => k === p.f) ? p.f : chips[0][0];
        const hrefFor = (over) => SA.hashFor(cfg.path, { ...p, ...over });
        const base = { q: p.q, range: p.range, orgId: p.orgId, orderId: p.orderId, runId: p.runId, min: p.min, max: p.max };
        for (const [, , param] of cfg.selects || []) base[param] = p[param];
        const chipParams = (k) => chips.find(([x]) => x === k)[2];
        // A select can narrow a chip (e.g. method); chip params win only for keys the select doesn't set.
        const query = (k) => ({ ...chipParams(k), ...Object.fromEntries(Object.entries(base).filter(([, v]) => v)) });
        const head = ui.head(cfg.title, cfg.sub);
        view.innerHTML = head + (cfg.stats ? ui.skelPanel(1, 30) : "") + ui.skelPanel(8);
        const [data, ...counts] = await Promise.all([
          SA.api(cfg.api, { ...query(key), sort: p.sort, dir: p.dir, page: p.page, size: 25 }),
          ...(chips.length > 1 ? chips.map(([k]) => SA.api(cfg.api, { ...query(k), size: 1 }).then((r) => r.total)) : []),
        ]);
        if (!isCurrent()) return;
        const scoped = [
          p.orgId && [`Organization: ${(data.rows[0] && data.rows[0].org && data.rows[0].org.name) || p.orgId}`, { orgId: "" }],
          p.orderId && [`Order ${p.orderId}`, { orderId: "" }],
        ].filter(Boolean);
        const toolbar = `<div class="toolbar">${cfg.search ? ui.search(p.q, cfg.search) : ""}
          ${(cfg.selects || []).map(([id, label, param, opts]) => ui.select(id, label, opts, p[param] || "")).join("")}
          ${ui.select(cfg.path + "-range", cfg.rangeLabel || "Date", RANGES, p.range || "")}
          ${cfg.amount ? `<form class="range-custom" data-amount><label class="sr" for="amin">Minimum amount in rupees</label><input class="inp" id="amin" type="number" min="0" step="1" inputmode="numeric" placeholder="Min ₹" value="${p.min ? esc(p.min / 100) : ""}" style="width:92px" />
            <label class="sr" for="amax">Maximum amount in rupees</label><input class="inp" id="amax" type="number" min="0" step="1" inputmode="numeric" placeholder="Max ₹" value="${p.max ? esc(p.max / 100) : ""}" style="width:92px" /><button class="btn" type="submit">Apply</button></form>` : ""}
          ${chips.length > 1 ? ui.chips(chips.map(([k, l], i) => [k, l, counts[i]]), key, (k) => hrefFor({ f: k === chips[0][0] ? "" : k, page: "" }), cfg.title + " filter") : ""}
          ${scoped.map(([l, clear]) => `<a class="chip" aria-current="true" href="${hrefFor({ ...clear, page: "" })}" title="Remove this filter">${esc(l)} ✕</a>`).join("")}</div>`;
        const filtered = p.q || p.range || p.min || p.max || (cfg.selects || []).some(([, , param]) => p[param]) || scoped.length;
        const emptyHtml = filtered ? ui.empty("Nothing matches these filters", "Clear the search or remove a filter.")
          : key !== chips[0][0] ? ui.empty(`Nothing in “${chips.find(([k]) => k === key)[1]}”`, "Choose another filter to see more.") : ui.empty(...cfg.empty);
        view.innerHTML = head + (cfg.stats ? cfg.stats(data) : "") + `<section class="panel">${toolbar}
          ${ui.table(cfg.cols, data.rows, emptyHtml, { sort: { path: cfg.path, params: p }, rowHref: cfg.rowHref })}
          ${ui.pager(data, (n) => hrefFor({ page: n }))}</section>${cfg.note ? note(cfg.note) : ""}`;
        ui.bindSearch(view, (q) => hrefFor({ q, page: "" }));
        for (const [id, , param] of cfg.selects || []) view.querySelector("#" + id).addEventListener("change", (e) => SA.go(hrefFor({ [param]: e.target.value, page: "" })));
        view.querySelector("#" + cfg.path + "-range").addEventListener("change", (e) => SA.go(hrefFor({ range: e.target.value, page: "" })));
        const af = view.querySelector("[data-amount]");
        if (af) af.addEventListener("submit", (e) => {
          e.preventDefault();
          const toPaise = (v) => (v === "" ? "" : String(Math.round(Number(v) * 100)));
          const min = toPaise(af.querySelector("#amin").value), max = toPaise(af.querySelector("#amax").value);
          if (min && max && Number(min) > Number(max)) return SA.toast("The minimum amount is more than the maximum.", "bad");
          SA.go(hrefFor({ min, max, page: "" }));
        });
      },
    };
  }

  // ── Transactions ──
  const TXN_COLS = (withOrder) => [
    { label: "Transaction ID", render: (t) => `<a class="mono" href="${txnHref(t.txnid)}">${esc(t.txnid)}</a>${t.mihpayid ? `<div class="mono muted" style="font-size:11.5px">PayU ${esc(t.mihpayid)}</div>` : ""}`, cls: "nowrap" },
    ...(withOrder ? [{ label: "Order", render: (t) => `<a class="mono" href="${SA.hashFor("attempts", { orderId: t.orderId })}" title="All attempts for this order">${esc(t.orderId.slice(-10))}</a>`, cls: "nowrap" }] : []),
    { label: "Organization", render: (t) => orgCell(t.org), cls: "ellip" },
    { label: "Customer", render: (t) => `${esc(t.customer.name || "—")}${t.customer.email ? `<div class="muted" style="font-size:12px">${esc(t.customer.email)}</div>` : ""}`, cls: "ellip" },
    { label: "Provider", render: (t) => esc(t.provider) },
    { label: "Amount", sort: "amount", align: "r", render: (t) => fmt.inr(t.amount), cls: "nowrap" },
    { label: "Currency", render: (t) => esc(t.currency) },
    { label: "Method", render: (t) => esc(t.method) + (t.bank ? `<div class="muted" style="font-size:12px">${esc(t.bank)}</div>` : ""), cls: "nowrap" },
    { label: "Status", render: (t) => ui.pill(t.status) + (t.error ? `<div class="muted ellip" style="font-size:12px;max-width:180px" title="${esc(t.error.message)}">${esc(t.error.message)}</div>` : "") },
    { label: "Mode", render: (t) => ui.modeTag(t.mode) },
    { label: "Created", sort: "createdAt", render: (t) => when(t.date), cls: "nowrap" },
  ];
  const txnStats = (d) => `<section class="panel"><div class="stat-row">
      <div><b>${fmt.int(d.summary.count)}</b><span>Payment attempts</span></div>
      <div><b>${fmt.int(d.summary.successful)}</b><span>Successful</span></div>
      <div><b>${d.summary.count ? fmt.pct(d.summary.successful / d.summary.count) : "—"}</b><span>Success rate</span></div>
      <div><b>${fmt.inr(d.summary.volume)}</b><span>Successful volume</span></div>
      <div><b>${d.summary.successful ? fmt.inr(Math.round(d.summary.volume / d.summary.successful)) : "—"}</b><span>Average successful payment</span></div></div></section>`;
  const txnPage = (path, title, sub, chips, extra = {}) => listPage({
    path, title, sub, api: "/super/transactions", chips, amount: true, rangeLabel: "Created",
    search: "Search txnid, PayU ID, bank reference, customer email or phone",
    selects: [[path + "-method", "Method", "method", METHODS]],
    cols: TXN_COLS(extra.withOrder), rowHref: (t) => txnHref(t.txnid), stats: txnStats,
    empty: ["No transactions yet", "Payments from every organization appear here as they are created."], ...extra,
  });
  const ALL_TXN_CHIPS = [["all", "All", {}], ["success", "Successful", { status: "SUCCESS" }], ["failed", "Failed", { status: "FAILED,BOUNCED,DROPPED" }],
    ["pending", "Pending", { status: "INITIATED,PENDING,AUTHORIZED" }], ["cancelled", "Cancelled", { status: "USER_CANCELLED" }], ["autorefund", "Auto-refunded", { status: "AUTO_REFUNDED" }]];
  const allTxns = txnPage("transactions", "All transactions", "Every payment attempt on the platform, across organizations. Open one for its full history.", ALL_TXN_CHIPS);
  SA.pages.attempts = txnPage("attempts", "Payment attempts", "Each row is one attempt sent to PayU. An order can have several attempts when a customer retries; open an order to see them together.",
    ALL_TXN_CHIPS, { withOrder: true, note: "Choose an order ID to list only that order's attempts." });
  SA.pages["payments-success"] = txnPage("payments-success", "Successful payments", "Payments PayU captured successfully.", [["all", "Successful", { status: "SUCCESS" }]],
    { empty: ["No successful payments yet", "Captured payments appear here."] });
  SA.pages["payments-failed"] = txnPage("payments-failed", "Failed payments", "Payments that didn't go through, with PayU's error.", [
    ["all", "All failed", { status: "FAILED,BOUNCED,DROPPED" }], ["failed", "Failed", { status: "FAILED" }], ["bounced", "Bounced", { status: "BOUNCED" }],
    ["dropped", "Dropped", { status: "DROPPED" }], ["cancelled", "Cancelled by customer", { status: "USER_CANCELLED" }]],
    { empty: ["No failed payments", "Failed, bounced and dropped payments appear here."] });

  // ── Refunds ──
  const REFUND_COLS = [
    { label: "Refund", render: (r) => `<a href="${refundHref(r.id)}">${fmt.inr(r.amount)}</a><div class="muted" style="font-size:12px">of ${fmt.inr(r.captured)}</div>`, cls: "nowrap" },
    { label: "Transaction", render: (r) => `<a class="mono" href="${txnHref(r.txnid)}">${esc(r.txnid)}</a>`, cls: "nowrap" },
    { label: "Organization", render: (r) => orgCell(r.org), cls: "ellip" },
    { label: "Status", render: (r) => ui.pill(r.status) },
    { label: "Provider response", render: (r) => `${r.provider.status != null ? `PayU status ${mono(r.provider.status)}` : '<span class="muted">Not sent</span>'}${r.provider.errorCode ? `<div style="color:var(--bad);font-size:12px">${esc(r.provider.errorCode)}</div>` : ""}` },
    { label: "PayU request", render: (r) => mono(r.provider.requestId), cls: "nowrap" },
    { label: "Bank ARN", render: (r) => mono(r.provider.arn), cls: "nowrap" },
    { label: "Reason", render: (r) => esc(r.reason || "—"), cls: "ellip" },
    { label: "Mode", render: (r) => ui.modeTag(r.mode) },
    { label: "Requested", sort: "createdAt", render: (r) => when(r.date), cls: "nowrap" },
  ];
  const refundStats = (d) => `<section class="panel"><div class="stat-row">
      <div><b>${fmt.int(d.summary.count)}</b><span>Refunds</span></div><div><b>${fmt.inr(d.summary.amount)}</b><span>Amount, excluding failed</span></div>
      </div></section>`;
  const REFUND_NOTE = "Refunds are requested by organizations from their own dashboard. This view can't issue or cancel a refund.";
  SA.pages.refunds = listPage({
    path: "refunds", title: "Refunds", sub: "Every refund on the platform with PayU's response and the bank reference (ARN) once it arrives.", api: "/super/refunds",
    chips: [["all", "All", {}], ["requested", "Requested", { status: "REQUESTED" }], ["queued", "Queued", { status: "QUEUED" }], ["progress", "In progress", { status: "IN_PROGRESS" }],
      ["success", "Successful", { status: "SUCCESS" }], ["failed", "Failed", { status: "FAILED" }]],
    search: "Search txnid, PayU request ID or bank ARN", rangeLabel: "Requested", cols: REFUND_COLS, rowHref: (r) => refundHref(r.id), stats: refundStats,
    empty: ["No refunds yet", "Refunds appear here when an organization refunds a payment."], note: REFUND_NOTE,
  });
  SA.pages["refund-requests"] = listPage({
    path: "refund-requests", title: "Refund requests", sub: "Refunds not yet completed: recorded by Bizpole Pay, queued at PayU, or in progress at the bank.", api: "/super/refunds",
    chips: [["all", "All open", { status: "REQUESTED,QUEUED,IN_PROGRESS" }], ["requested", "Not yet sent to PayU", { status: "REQUESTED" }], ["queued", "Queued at PayU", { status: "QUEUED" }],
      ["progress", "In progress", { status: "IN_PROGRESS" }]],
    search: "Search txnid, PayU request ID or bank ARN", rangeLabel: "Requested", cols: REFUND_COLS, rowHref: (r) => refundHref(r.id), stats: refundStats,
    empty: ["No open refund requests", "Every refund has completed or failed."], note: REFUND_NOTE + " “Not yet sent to PayU” means the PayU call failed or the organization has no active credential; nothing retries it yet.",
  });

  // ── Settlements ──
  SA.pages.settlements = listPage({
    path: "settlements", title: "Settlements", sub: "PayU settlement batches paid to organizations' bank accounts, with fees, tax and a balance check.", api: "/super/settlements",
    chips: [["all", "All", {}], ["pending", "Pending", { status: "PENDING" }], ["processed", "Processed", { status: "PROCESSED" }], ["hold", "On hold", { status: "ON_HOLD" }], ["failed", "Failed", { status: "FAILED" }]],
    search: "Search UTR or PayU settlement ID", rangeLabel: "Settled", rowHref: (s) => settleHref(s.id),
    stats: (d) => `<section class="panel"><div class="stat-row">
      <div><b>${fmt.int(d.summary.count)}</b><span>Settlements</span></div><div><b>${fmt.inr(d.summary.net)}</b><span>Net settled</span></div>
      <div><b>${fmt.int(d.summary.pending)}</b><span>Pending</span></div></div></section>`,
    cols: [
      { label: "Settlement", render: (s) => `<a class="mono" href="${settleHref(s.id)}">${esc(s.utr || s.payuSettlementId)}</a><div class="muted" style="font-size:12px">${s.utr ? "PayU " + esc(s.payuSettlementId) : "No UTR yet"}</div>`, cls: "nowrap" },
      { label: "Organization", render: (s) => orgCell(s.org), cls: "ellip" },
      { label: "Provider", render: (s) => esc(s.provider) },
      { label: "Status", render: (s) => ui.pill(s.status) },
      { label: "Gross", align: "r", render: (s) => fmt.inr(s.gross), cls: "nowrap" },
      { label: "Refunds and chargebacks", align: "r", render: (s) => fmt.inr(s.refunds + s.chargebacks), cls: "nowrap" },
      { label: "Fees and tax", align: "r", render: (s) => fmt.inr(s.fee + s.tax), cls: "nowrap" },
      { label: "Net", sort: "net", align: "r", render: (s) => `<b>${fmt.inr(s.net)}</b>`, cls: "nowrap" },
      { label: "Reconciliation", render: (s) => (balanced(s) ? pill("Balanced", "ok") : `<span class="pill warn" title="See the settlement for details">Discrepancy</span>`) },
      { label: "Mode", render: (s) => ui.modeTag(s.mode) },
      { label: "Settled", sort: "date", render: (s) => when(s.date), cls: "nowrap" },
    ],
    empty: ["No settlements yet", "PayU settlements appear here once they are synced for each organization."],
    note: "Balanced means PayU's net equals gross minus refunds, chargebacks, fees and tax, and equals the sum of its lines.",
  });

  // ── Reconciliation ──
  const KIND = { VERIFY_PAYMENTS: "Payment verification", REFUND_STATUS: "Refund status", SETTLEMENT_SYNC: "Settlement sync", CHARGEBACK_SYNC: "Chargeback sync", PAYOUT_STATUS: "Payout status", MANDATE_STATUS: "Mandate status" };
  const RESOLUTION = { OPEN: "Open", AUTO_FIXED: "Fixed automatically", MANUALLY_FIXED: "Fixed manually", IGNORED: "Ignored" };
  const RECON_EMPTY = "Reconciliation compares Bizpole Pay's records with PayU's (payments, refunds, settlements). The reconciliation job isn't scheduled yet, so no runs have been recorded.";
  const category = (x) => (/amount/i.test(x.field) ? "Amount mismatch" : x.local == null || x.payu == null ? (x.local == null ? "Missing in Bizpole Pay" : "Missing at PayU") : "Value mismatch");
  SA.pages.recon = {
    title: "Reconciliation",
    async render(view, { params: p, isCurrent }) {
      const head = ui.head("Reconciliation", "How Bizpole Pay's records compare with PayU's: runs, matched and unmatched records, and open exceptions.", ui.select("rc-range", "Runs", RANGES, p.range || ""));
      view.innerHTML = head + ui.skelPanel(1, 30) + `<div class="grid g2">${ui.skelPanel(4)}${ui.skelPanel(4)}</div>` + ui.skelPanel(6);
      const hrefFor = (over) => SA.hashFor("recon", { ...p, ...over });
      const [s, runs] = await Promise.all([SA.api("/super/recon", { range: p.range }), SA.api("/super/recon/runs", { range: p.range, page: p.page, size: 25 })]);
      if (!isCurrent()) return;
      const t = s.totals, c = s.openByCategory || { amount: 0, missing: 0, other: 0 };
      const cats = [["amount", "Amount mismatches", c.amount], ["missing", "Missing records", c.missing], ["other", "Other value mismatches", c.other]];
      view.innerHTML = head + `<section class="panel"><div class="stat-row">
          <div><b>${fmt.int(t.runs)}</b><span>Runs${t.failed ? `, ${fmt.int(t.failed)} failed` : ""}</span></div><div><b>${fmt.int(t.checked)}</b><span>Records checked</span></div>
          <div><b>${fmt.int(t.matched)}</b><span>Matched</span></div><div><b>${fmt.int(t.mismatches)}</b><span>Unmatched</span></div>
          <div><b>${fmt.int(s.byResolution.OPEN)}</b><span>Open exceptions</span></div></div></section>
        <div class="grid g2">
          ${ui.panel("Open exceptions by type", `<div class="panel-body">${ui.kv(cats.map(([k, l, n]) => [l, n ? `<a href="${SA.hashFor("recon-exceptions", { category: k })}">${fmt.int(n)}</a>` : "0"]))}</div>`)}
          ${ui.panel("Exceptions by decision", `<div class="panel-body">${ui.kv(Object.entries(RESOLUTION).map(([k, l]) => [l, s.byResolution[k] ? `<a href="${SA.hashFor("recon-exceptions", { f: k.toLowerCase() })}">${fmt.int(s.byResolution[k])}</a>` : "0"]))}</div>`)}
        </div>`
        + ui.panel("Latest run of each kind", ui.table([
          { label: "Kind", render: (r) => esc(KIND[r.kind] || fmt.label(r.kind)) }, { label: "Mode", render: (r) => ui.modeTag(r.mode) },
          { label: "Status", render: (r) => ui.pill(r.status) }, { label: "Checked", align: "r", render: (r) => fmt.int(r.checked) },
          { label: "Mismatches", align: "r", render: (r) => fmt.int(r.mismatches) }, { label: "Started", render: (r) => when(r.startedAt), cls: "nowrap" },
          { label: "Finished", render: (r) => when(r.finishedAt), cls: "nowrap" }, { label: "Error", render: (r) => (r.error ? `<span style="color:var(--bad)">${esc(r.error)}</span>` : "—") },
        ], s.latestRuns, ui.empty("No reconciliation runs yet", RECON_EMPTY)))
        + ui.panel("All runs", ui.table([
          { label: "Started", render: (r) => when(r.startedAt), cls: "nowrap" }, { label: "Kind", render: (r) => esc(KIND[r.kind] || fmt.label(r.kind)) },
          { label: "Scope", render: (r) => (r.org ? orgCell(r.org) : "All organizations") }, { label: "Window", render: (r) => `${esc(fmt.date(r.windowFrom))} – ${esc(fmt.date(r.windowTo))}`, cls: "nowrap" },
          { label: "Status", render: (r) => ui.pill(r.status) }, { label: "Checked", align: "r", render: (r) => fmt.int(r.checked) },
          { label: "Updated", align: "r", render: (r) => fmt.int(r.updated) },
          { label: "Mismatches", align: "r", render: (r) => (r.mismatches ? `<a href="${SA.hashFor("recon-exceptions", { runId: r.id, f: "all" })}">${fmt.int(r.mismatches)}</a>` : "0") },
          { label: "Mode", render: (r) => ui.modeTag(r.mode) },
        ], runs.rows, ui.empty("No runs in this period", RECON_EMPTY)) + ui.pager(runs, (n) => hrefFor({ page: n })), { sub: count(runs.total, "run", "runs") })
        + note("Reconciliation decisions (fix or ignore) are not available from the control centre yet; they need their own approval.");
      view.querySelector("#rc-range").addEventListener("change", (e) => SA.go(hrefFor({ range: e.target.value, page: "" })));
    },
  };

  const excList = listPage({
    path: "recon-exceptions", title: "Reconciliation exceptions", api: "/super/recon/mismatches",
    sub: "Records where Bizpole Pay and PayU disagree: amount mismatches, missing transactions and other differences.",
    chips: [["open", "Open", { resolution: "OPEN" }], ["all", "All", {}], ["auto_fixed", "Fixed automatically", { resolution: "AUTO_FIXED" }],
      ["manually_fixed", "Fixed manually", { resolution: "MANUALLY_FIXED" }], ["ignored", "Ignored", { resolution: "IGNORED" }]],
    selects: [["rx-cat", "Type", "category", [["", "Any type"], ["amount", "Amount mismatch"], ["missing", "Missing record"], ["other", "Other"]]],
      ["rx-kind", "Check", "kind", [["", "Any check"], ...Object.entries(KIND)]]],
    search: null, rangeLabel: "Found", rowHref: (x) => excHref(x.id),
    cols: [
      { label: "Found", render: (x) => when(x.date), cls: "nowrap" },
      { label: "Type", render: (x) => esc(category(x)) },
      { label: "Record", render: (x) => `${esc(fmt.label(x.entityType))}${x.entityId ? `<div class="mono muted" style="font-size:11.5px">${esc(x.entityId)}</div>` : ""}` },
      { label: "Field", render: (x) => mono(x.field) },
      { label: "Bizpole Pay", render: (x) => (x.local == null ? '<span class="muted">Missing</span>' : mono(x.local)) },
      { label: "PayU", render: (x) => (x.payu == null ? '<span class="muted">Missing</span>' : mono(x.payu)) },
      { label: "Organization", render: (x) => orgCell(x.org), cls: "ellip" },
      { label: "Check", render: (x) => esc(KIND[x.kind] || fmt.label(x.kind)) },
      { label: "Decision", render: (x) => pill(RESOLUTION[x.resolution] || x.resolution, x.resolution === "OPEN" ? "warn" : x.resolution === "IGNORED" ? "" : "ok") },
    ],
    empty: ["No open exceptions", RECON_EMPTY],
    note: "Reviewing an exception (fix or ignore) is not available from the control centre yet; it needs its own approval. Decisions recorded elsewhere appear here.",
  });

  // ── Detail pages ──
  const header = (title, metaHtml, backHref, backLabel, titleMono) => `<div class="org-head"><div><h1 style="margin:0;font-size:22px;font-weight:600"${titleMono ? ' class="mono"' : ""}>${esc(title)}</h1>
    <div class="meta">${metaHtml}</div></div><div style="margin-left:auto"><a class="btn" href="${backHref}">${esc(backLabel)}</a></div></div>`;

  async function transactionDetail(view, txnid, isCurrent) {
    view.innerHTML = ui.skelPanel(2) + `<div class="grid g3">${ui.skelPanel(8)}${ui.skelPanel(8)}${ui.skelPanel(8)}</div>`;
    let t;
    try { t = await SA.api("/super/transactions/" + encodeURIComponent(txnid), {}, { withMode: false }); }
    catch (e) { if (e.status === 404) return notFound(view, "Transaction", "#/transactions", "All transactions"); throw e; }
    if (!isCurrent()) return;
    SA.crumb(t.txnid, "#/transactions");
    const refunded = t.refunds.filter((r) => r.status !== "FAILED").reduce((a, r) => a + r.amount, 0);
    const payment = ui.kv([
      ["Amount", `<b>${fmt.inr(t.amount)}</b>`], ["Net debited", t.netDebit != null ? fmt.inr(t.netDebit) : ""], ["Additional charges", t.charges ? fmt.inr(t.charges) : ""],
      ["Discount", t.discount ? fmt.inr(t.discount) : ""], ["Refunded", refunded ? fmt.inr(refunded) : ""], ["Method", esc(t.method)],
      ["PayU mode", mono(t.payuMode)], ["Bank code", mono(t.bank !== "—" ? t.bank : "")], ["Gateway", esc(t.pgType || "")],
      ["Card", t.card ? mono(t.card) : ""], ["UPI ID", t.vpa ? mono(t.vpa) : ""], ["Bank reference", mono(t.bankRefNum)],
    ]);
    const provider = ui.kv([
      ["Provider", esc(t.provider.name)], ["PayU ID (mihpayid)", mono(t.mihpayid !== "—" ? t.mihpayid : "")], ["PayU status", mono(t.payuStatus)],
      ["PayU detailed status", mono(t.unmappedStatus)], ["Error code", t.errorCode ? `<span style="color:var(--bad)">${esc(t.errorCode)}</span>` : ""],
      ["Error message", t.error ? `<span style="color:var(--bad)">${esc(t.error)}</span>` : ""], ["PayU MID", mono(t.provider.mid)], ["Merchant key", mono(t.provider.merchantKey)],
      ["Credential", t.provider.credentialStatus ? ui.pill(t.provider.credentialStatus) : ""], ["Completed", t.completedAt ? esc(fmt.dt(t.completedAt)) : ""],
      ["Last verified with PayU", t.verifiedAt ? esc(fmt.dt(t.verifiedAt)) : '<span class="muted">Not verified yet</span>'],
    ]);
    const order = ui.kv([
      ["Organization", orgCell(t.org)], ["Order ID", mono(t.order.id)], ["Receipt", mono(t.order.receipt)], ["Product", esc(t.order.product || "")],
      ["Source", t.order.viaLink ? "Payment link" : "Checkout"], ["Customer", esc(t.customer.name)], ["Customer email", esc(t.customer.email)], ["Customer phone", esc(t.customer.phone)],
      ["Created", esc(fmt.dt(t.date))], ["Last updated", esc(fmt.dt(t.updatedAt))],
    ]);
    const timeline = t.events.length ? `<ul class="steps">${t.events.map((e) => `<li><span class="mark ${e.to === "SUCCESS" ? "done" : /FAIL|BOUNCED|DROPPED/.test(e.to) ? "bad" : "part"}" aria-hidden="true"></span>
        <span>${e.from ? `${esc(fmt.label(e.from))} → ` : ""}<b>${esc(fmt.label(e.to))}</b>${e.payuStatus || e.unmappedStatus ? ` <span class="muted mono" style="font-size:12px">${esc([e.payuStatus, e.unmappedStatus].filter(Boolean).join(" / "))}</span>` : ""}${e.note ? `<div class="muted" style="font-size:12px">${esc(e.note)}</div>` : ""}</span>
        <span class="muted nowrap" style="font-size:12.5px">${esc(fmt.dt(e.date))}</span></li>`).join("")}</ul>`
      : ui.empty("No status history", "Status changes are recorded as PayU reports them.");
    const attempts = ui.table([
      { label: "Attempt", render: (a, i) => (a.txnid === t.txnid ? `<b class="mono">${esc(a.txnid)}</b> <span class="tag">This one</span>` : `<a class="mono" href="${txnHref(a.txnid)}">${esc(a.txnid)}</a>`) },
      { label: "Method", render: (a) => esc(a.method) }, { label: "Status", render: (a) => ui.pill(a.status) },
      { label: "Amount", align: "r", render: (a) => fmt.inr(a.amount) }, { label: "Error", render: (a) => esc(a.error || "—"), cls: "ellip" },
      { label: "Created", render: (a) => when(a.date), cls: "nowrap" },
    ], t.attempts, "");
    const refunds = ui.table([
      { label: "Amount", render: (r) => `<a href="${refundHref(r.id)}">${fmt.inr(r.amount)}</a>` }, { label: "Status", render: (r) => ui.pill(r.status) },
      { label: "PayU request", render: (r) => mono(r.requestId !== "—" ? r.requestId : "") }, { label: "Bank ARN", render: (r) => mono(r.arn !== "—" ? r.arn : "") },
      { label: "Reason", render: (r) => esc(r.reason || "—") }, { label: "Requested", render: (r) => when(r.date), cls: "nowrap" },
    ], t.refunds, ui.empty("No refunds", "This payment hasn't been refunded."), { rowHref: (r) => refundHref(r.id) });
    const settlements = ui.table([
      { label: "Settlement", render: (s) => `<a class="mono" href="${settleHref(s.dbId)}">${esc(s.utr !== "—" ? s.utr : s.id)}</a>` }, { label: "Status", render: (s) => ui.pill(s.status) },
      { label: "Gross", align: "r", render: (s) => fmt.inr(s.gross) }, { label: "Fee and tax", align: "r", render: (s) => fmt.inr(s.fee + s.tax) },
      { label: "Net", align: "r", render: (s) => fmt.inr(s.net) }, { label: "Date", render: (s) => when(s.date), cls: "nowrap" },
    ], t.settlements, ui.empty("Not settled yet", "The settlement appears here once PayU pays this payment out."), { rowHref: (s) => settleHref(s.dbId) });
    const hooks = ui.table([
      { label: "Received", render: (e) => when(e.receivedAt), cls: "nowrap" }, { label: "Event ID", render: (e) => mono(e.id) },
      { label: "Type", render: (e) => esc(fmt.label(e.source)) }, { label: "Signature", render: (e) => (e.signatureValid == null ? pill("Not signed", "") : e.signatureValid ? pill("Valid", "ok") : pill("Invalid", "bad")) },
      { label: "Processing", render: (e) => ui.pill(e.processing) }, { label: "Error", render: (e) => esc(e.error || "—"), cls: "ellip" },
    ], t.inboundEvents, ui.empty("No webhook history", "PayU callbacks and webhooks for this payment appear here. The receiver isn't connected yet, so none have been recorded."));
    view.innerHTML = header(t.txnid, `${ui.pill(t.status)}<b>${fmt.inr(t.amount)}</b>${ui.modeTag(t.mode)}${orgCell(t.org)}<span>${esc(fmt.dt(t.date))} IST</span>`, "#/transactions", "All transactions", true)
      + `<div class="grid g3">${ui.panel("Payment", `<div class="panel-body">${payment}</div>`)}${ui.panel("Provider response", `<div class="panel-body">${provider}</div>`)}${ui.panel("Order and customer", `<div class="panel-body">${order}</div>`)}</div>`
      + `<div class="grid g2">${ui.panel("Status history", `<div class="panel-body">${timeline}</div>`, { sub: count(t.events.length, "change", "changes") })}
         ${ui.panel("Payment attempts for this order", attempts, { sub: t.attempts.length > 1 ? `${t.attempts.length} attempts` : "Only attempt" })}</div>`
      + ui.panel("Refund history", refunds) + ui.panel("Settlement", settlements) + ui.panel("Webhook history", hooks);
  }

  async function refundDetail(view, id, isCurrent) {
    view.innerHTML = ui.skelPanel(2) + `<div class="grid g2">${ui.skelPanel(6)}${ui.skelPanel(6)}</div>`;
    let r;
    try { r = await SA.api("/super/refunds/" + encodeURIComponent(id), {}, { withMode: false }); }
    catch (e) { if (e.status === 404) return notFound(view, "Refund", "#/refunds", "All refunds"); throw e; }
    if (!isCurrent()) return;
    SA.crumb(`Refund ${fmt.inr(r.amount)}`, "#/refunds");
    const timeline = `<ul class="steps">${r.timeline.map((e) => `<li><span class="mark ${e.status === "SUCCESS" ? "done" : e.status === "FAILED" ? "bad" : "part"}" aria-hidden="true"></span>
      <span><b>${esc(e.event === "created" ? "Refund recorded" : e.event === "last update" ? `Last update: ${fmt.label(e.status)}` : e.event)}</b>${e.by ? ` <span class="muted">by ${esc(e.by)}</span>` : ""}
      ${e.meta && e.meta.amount ? `<div class="muted" style="font-size:12px">${fmt.inr(e.meta.amount)}</div>` : ""}</span><span class="muted nowrap" style="font-size:12.5px">${esc(fmt.dt(e.date))}</span></li>`).join("")}</ul>`;
    const split = r.splitBreakdown ? `<pre class="mono" style="margin:0;white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(r.splitBreakdown, null, 2))}</pre>` : "";
    view.innerHTML = header(`Refund of ${fmt.inr(r.amount)}`, `${ui.pill(r.status)}${ui.modeTag(r.mode)}${orgCell(r.org)}<span>on <a class="mono" href="${txnHref(r.transaction.txnid)}">${esc(r.transaction.txnid)}</a></span>`, "#/refunds", "All refunds")
      + `<div class="grid g2">
        ${ui.panel("Refund", `<div class="panel-body">${ui.kv([["Amount", `<b>${fmt.inr(r.amount)}</b>`], ["Status", ui.pill(r.status)], ["Reason", esc(r.reason || "")],
          ["Requested by", r.requestedBy ? `<a href="#/users/${encodeURIComponent(r.requestedBy.id)}">${esc(r.requestedBy.name || r.requestedBy.id)}</a>` : ""], ["Refund ID", mono(r.id)]])}</div>`)}
        ${ui.panel("Provider response", `<div class="panel-body">${ui.kv([["PayU status", mono(r.provider.status)], ["Error code", r.provider.errorCode ? `<span style="color:var(--bad)">${esc(r.provider.errorCode)}</span>` : ""],
          ["PayU request ID", mono(r.provider.requestId)], ["Bank ARN", mono(r.provider.arn)], ["Bank reference", mono(r.provider.bankRefNum)], ["Refund mode", esc(r.provider.refundMode || "")]])}</div>`)}
      </div><div class="grid g2">
        ${ui.panel("Original transaction", `<div class="panel-body">${ui.kv([["Transaction", `<a class="mono" href="${txnHref(r.transaction.txnid)}">${esc(r.transaction.txnid)}</a>`],
          ["Amount", fmt.inr(r.transaction.amount)], ["Status", ui.pill(r.transaction.status)], ["Method", esc(r.transaction.method)], ["Organization", orgCell(r.org)]])}</div>`)}
        ${ui.panel("Refund timeline", `<div class="panel-body">${timeline}</div>`)}
      </div>`
      + ui.panel("Settlement", ui.table([
        { label: "Settlement", render: (s) => `<a class="mono" href="${settleHref(s.id)}">${esc(s.utr || s.payuSettlementId)}</a>` },
        { label: "Deducted", align: "r", render: (s) => fmt.inr(s.net) }, { label: "Date", render: (s) => when(s.date), cls: "nowrap" },
      ], r.settlements, ui.empty("Not deducted from a settlement yet", "When PayU deducts this refund from a settlement, it appears here."), { rowHref: (s) => settleHref(s.id) }))
      + (split ? ui.panel("Split breakdown", `<div class="panel-body">${split}</div>`) : "")
      + note(REFUND_NOTE);
  }

  async function settlementDetail(view, id, isCurrent) {
    view.innerHTML = ui.skelPanel(2) + ui.skelPanel(8);
    let s;
    try { s = await SA.api("/super/settlements/" + encodeURIComponent(id), {}, { withMode: false }); }
    catch (e) { if (e.status === 404) return notFound(view, "Settlement", "#/settlements", "All settlements"); throw e; }
    if (!isCurrent()) return;
    SA.crumb(s.utr || s.payuSettlementId, "#/settlements");
    const d = s.discrepancy, unmatched = s.lines.filter((l) => l.unmatched).length;
    const checks = `<ul class="steps">
      <li><span class="mark ${d.formula ? "bad" : "done"}" aria-hidden="true"></span><span>Net equals gross minus refunds, chargebacks, fees and tax</span><span>${d.formula ? `<span style="color:var(--bad)">Off by ${fmt.inr(d.formula)}</span>` : pill("Matches", "ok")}</span></li>
      <li><span class="mark ${d.lines == null ? "" : d.lines ? "bad" : "done"}" aria-hidden="true"></span><span>Net equals the sum of its lines</span><span>${d.lines == null ? '<span class="muted">No lines synced</span>' : d.lines ? `<span style="color:var(--bad)">Off by ${fmt.inr(d.lines)}</span>` : pill("Matches", "ok")}</span></li>
      <li><span class="mark ${unmatched ? "bad" : "done"}" aria-hidden="true"></span><span>Every captured line matches a Bizpole Pay transaction</span><span>${unmatched ? `<span style="color:var(--bad)">${count(unmatched, "line", "lines")} unmatched</span>` : pill(s.lines.length ? "All matched" : "No lines", s.lines.length ? "ok" : "")}</span></li></ul>`;
    view.innerHTML = header(s.utr || s.payuSettlementId, `${ui.pill(s.status)}<b>${fmt.inr(s.net)}</b>${ui.modeTag(s.mode)}${orgCell(s.org)}<span>${esc(fmt.dt(s.date))} IST</span>`, "#/settlements", "All settlements", true)
      + `<section class="panel"><div class="stat-row"><div><b>${fmt.inr(s.gross)}</b><span>Gross</span></div><div><b>${fmt.inr(s.refunds + s.chargebacks)}</b><span>Refunds and chargebacks</span></div>
         <div><b>${fmt.inr(s.fee)}</b><span>Fees</span></div><div><b>${fmt.inr(s.tax)}</b><span>Tax</span></div><div><b>${fmt.inr(s.net)}</b><span>Net to bank</span></div></div></section>`
      + `<div class="grid g2">${ui.panel("Reconciliation checks", `<div class="panel-body">${checks}</div>`)}
         ${ui.panel("Settlement details", `<div class="panel-body">${ui.kv([["Provider", esc(s.provider)], ["UTR", mono(s.utr)], ["PayU settlement ID", mono(s.payuSettlementId)],
           ["Bank account", s.account ? `${mono("•••• " + s.account.last4)} ${esc(s.account.bankName || "")} <span class="muted mono">${esc(s.account.ifsc)}</span>` : ""],
           ["Completed", s.completedAt ? esc(fmt.dt(s.completedAt)) : ""], ["Synced from PayU", esc(fmt.dt(s.fetchedAt))]])}</div>`)}</div>`
      + ui.panel("Lines", ui.table([
        { label: "Type", render: (l) => esc(fmt.label(l.action)) },
        { label: "Transaction", render: (l) => (l.txnid ? (l.unmatched ? `${mono(l.txnid)} <span class="pill bad">Not in Bizpole Pay</span>` : `<a class="mono" href="${txnHref(l.txnid)}">${esc(l.txnid)}</a>`) : '<span class="muted">—</span>') },
        { label: "PayU ID", render: (l) => mono(l.payuId) }, { label: "Method", render: (l) => esc(l.method || "—") },
        { label: "Gross", align: "r", render: (l) => fmt.inr(l.gross) }, { label: "Fee", align: "r", render: (l) => fmt.inr(l.fee) },
        { label: "Tax", align: "r", render: (l) => fmt.inr(l.tax) }, { label: "Net", align: "r", render: (l) => fmt.inr(l.net) },
      ], s.lines, ui.empty("No lines synced", "PayU's per-payment breakdown appears here once it is synced.")), { sub: count(s.lines.length, "line", "lines") });
  }

  async function exceptionDetail(view, id, isCurrent) {
    view.innerHTML = ui.skelPanel(2) + `<div class="grid g2">${ui.skelPanel(6)}${ui.skelPanel(6)}</div>`;
    let x;
    try { x = await SA.api("/super/recon/mismatches/" + encodeURIComponent(id), {}, { withMode: false }); }
    catch (e) { if (e.status === 404) return notFound(view, "Exception", "#/recon-exceptions", "All exceptions"); throw e; }
    if (!isCurrent()) return;
    const kind = category(x);
    SA.crumb(kind, "#/recon-exceptions");
    view.innerHTML = header(kind === "Amount mismatch" ? `Amount mismatch on ${fmt.label(x.entityType).toLowerCase()}` : `${kind}: ${x.field}`, `${pill(RESOLUTION[x.resolution] || x.resolution, x.resolution === "OPEN" ? "warn" : "ok")}${ui.modeTag(x.run.mode)}${orgCell(x.org)}<span>Found ${esc(fmt.dt(x.date))} IST</span>`, "#/recon-exceptions", "All exceptions")
      + `<div class="grid g2">
        ${ui.panel("Difference", `<div class="panel-body">${ui.kv([["Record type", esc(fmt.label(x.entityType))], ["Bizpole Pay record", mono(x.entityId)], ["PayU reference", mono(x.payuRef)], ["Field", mono(x.field)],
          ["Value in Bizpole Pay", x.local == null ? '<span style="color:var(--bad)">Missing</span>' : mono(x.local)], ["Value at PayU", x.payu == null ? '<span style="color:var(--bad)">Missing</span>' : mono(x.payu)]])}</div>`)}
        ${ui.panel("Reconciliation run", `<div class="panel-body">${ui.kv([["Check", esc(KIND[x.run.kind] || fmt.label(x.run.kind))], ["Run status", ui.pill(x.run.status)],
          ["Window", `${esc(fmt.dt(x.run.windowFrom))} – ${esc(fmt.dt(x.run.windowTo))}`], ["Run ID", mono(x.run.id)]])}</div>`)}
      </div>`
      + ui.panel("Review and resolution history", `<div class="panel-body">${ui.kv([["Decision", esc(RESOLUTION[x.resolution] || x.resolution)],
          ["Decided by", x.resolvedBy ? `<a href="#/users/${encodeURIComponent(x.resolvedBy.id)}">${esc(x.resolvedBy.name || x.resolvedBy.id)}</a>` : ""], ["Decided", x.resolvedAt ? esc(fmt.dt(x.resolvedAt)) : ""]])}
        ${x.history.length ? `<ul class="steps" style="margin-top:12px">${x.history.map((h) => `<li><span class="mark part" aria-hidden="true"></span><span><span class="mono">${esc(h.action)}</span>${h.by ? ` <span class="muted">by ${esc(h.by)}</span>` : ""}</span><span class="muted" style="font-size:12.5px">${esc(fmt.dt(h.date))}</span></li>`).join("")}</ul>`
          : `<p class="muted" style="margin:12px 0 0">No review actions recorded.</p>`}</div>`)
      + note("Fixing or ignoring an exception isn't available from the control centre yet; it needs its own approval and audit logging.");
  }

  // Routes with a detail sub-path: #/transactions/<txnid>, #/refunds/<id>, #/settlements/<id>, #/recon-exceptions/<id>
  const withDetail = (list, detail) => ({ title: list.title, render: (view, ctx) => (ctx.sub[0] ? detail(view, ctx.sub[0], ctx.isCurrent) : list.render(view, ctx)) });
  SA.pages.transactions = withDetail(allTxns, transactionDetail);
  SA.pages.refunds = withDetail(SA.pages.refunds, refundDetail);
  SA.pages.settlements = withDetail(SA.pages.settlements, settlementDetail);
  SA.pages["recon-exceptions"] = withDetail(excList, exceptionDetail);
})();

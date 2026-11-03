// Paynest Control Centre core: state, API client, router, navigation and shared UI.
// Pages register on SA.pages[route] = { title, group, render(view, params) }. All text from the API goes through esc().
(() => {
  "use strict";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const MODES = ["all", "test", "live"];
  const SA = (window.SA = {
    pages: {},
    state: {
      session: null,
      mode: MODES.includes(store.get("sa.mode", "all")) ? store.get("sa.mode", "all") : "all",
      range: store.get("sa.range", { key: "30d", from: "", to: "" }),
    },
    store,
  });

  // ── Formatting ──
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const nf2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfc = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
  const nfi = new Intl.NumberFormat("en-IN");
  const TZ = "Asia/Kolkata";
  const fmt = {
    inr: (p) => (p == null ? "—" : (p < 0 ? "−₹" : "₹") + nf2.format(Math.abs(p) / 100)),
    inrShort: (p) => (p == null ? "—" : (p < 0 ? "−₹" : "₹") + (Math.abs(p) >= 10000000 ? nfc.format(Math.abs(p) / 100) : nfi.format(Math.round(Math.abs(p) / 100)))),
    int: (n) => (n == null ? "—" : nfi.format(n)),
    pct: (x) => (x == null ? "—" : (x * 100).toFixed(x >= 0.995 || x === 0 ? 0 : 1) + "%"),
    date: (d) => (d ? new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }) : "—"),
    dt: (d) => (d ? new Date(d).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—"),
    ago(d) {
      if (!d) return "—";
      const s = Math.round((Date.now() - new Date(d)) / 1000);
      if (s < 60) return "just now";
      if (s < 3600) return Math.floor(s / 60) + " min ago";
      if (s < 86400) return Math.floor(s / 3600) + " h ago";
      if (s < 86400 * 7) return Math.floor(s / 86400) + " d ago";
      return fmt.date(d);
    },
    label: (s) => (s ? String(s).charAt(0) + String(s).slice(1).toLowerCase().replace(/_/g, " ") : "—"),
  };
  SA.esc = esc; SA.fmt = fmt;

  // ── API ──
  // Same rule as app.html: on localhost with any port other than the dev server (8765, e.g. VS Code Live Server),
  // call the API on :8765. Deployed builds and the dev server itself use same-origin /api.
  const DEV_API_PORT = "8765";
  SA.API_BASE = /^(127.0.0.1|localhost)$/.test(location.hostname) && location.port !== DEV_API_PORT ? `${location.protocol}//${location.hostname}:${DEV_API_PORT}` : "";
  SA.credentials = SA.API_BASE ? "include" : "same-origin";
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  SA.api = async function api(path, params = {}, { method = "GET", body, withMode = true } = {}) {
    const qs = new URLSearchParams();
    if (withMode) qs.set("mode", SA.state.mode);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    const res = await fetch(SA.API_BASE + "/api" + path + (qs.toString() ? "?" + qs : ""), {
      method, credentials: SA.credentials,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 401) { SA.signedOut(); throw new ApiError(401, "Your session ended. Sign in again."); }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status}).`);
    return data;
  };
  SA.rangeParams = () => {
    const r = SA.state.range;
    return r.key === "custom" ? { from: r.from, to: r.to } : { range: r.key };
  };

  // ── Icons (24×24 stroke paths) ──
  const ICON = {
    home: "M3 11l9-8 9 8M5 10v10h14V10", chart: "M4 20V10M10 20V4M16 20v-7M2 20h20", list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    building: "M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 9h2M14 9h2M8 13h2M14 13h2", flag: "M4 22V4M4 4h13l-2 4 2 4H4", shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
    users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3", pulse: "M3 12h4l3-8 4 16 3-8h4",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0", star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
    key: "M14.5 9.5a4 4 0 1 0-1.2 2.8L21 20M17.5 16.5l2-2", clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2", ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM5 5l14 14",
    card: "M2 6h20v12H2zM2 10h20", retry: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5", check: "M20 6L9 17l-5-5", x: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6",
    refund: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3", inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z", bank: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18",
    scale: "M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z", alert: "M12 3l10 18H2zM12 10v5M12 18v.01",
    plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4", id: "M3 5h18v14H3zM7 15h4M7 11h10", hook: "M18 17h-6a4 4 0 1 1-4-4M12 6l3 6a4 4 0 1 1-1 7M9 13l3-7a4 4 0 1 1 6 3",
    heart: "M3 12h4l2-4 3 8 2-4h7", terminal: "M4 17l6-5-6-5M12 19h8", doc: "M14 2H6v20h12V8zM14 2v6h6M8 13h8M8 17h8", lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
    tool: "M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L4 12l2.3-2.3z", bug: "M8 8V6a4 4 0 0 1 8 0v2M5 12H2M22 12h-3M5 8l2 2M19 8l-2 2M6 18l2-2M18 18l-2-2M7 8h10v7a5 5 0 0 1-10 0z",
    chev: "M6 9l6 6 6-6", out: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9",
  };
  const icon = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[n] || ICON.list}"/></svg>`;
  SA.icon = icon;

  // ── Navigation (labels from the Super Admin brief). phase: when the page ships; built pages register in SA.pages. ──
  // Not shown: Platform Admins (role not introduced) and Platform Configuration (no backend; M3 deferred).
  SA.NAV = [
    { id: "overview", label: "Overview", items: [
      ["overview", "Platform dashboard", "home", 2], ["analytics", "Platform analytics", "chart", 2], ["activity", "System activity", "list", 2]] },
    { id: "orgs", label: "Organizations", items: [
      ["orgs", "All organizations", "building", 3], ["orgs-onboarding", "Onboarding", "flag", 3], ["orgs-kyc", "Verification and KYC", "shield", 3],
      ["orgs-users", "Organization users", "users", 3], ["orgs-status", "Organization status", "pulse", 3]] },
    { id: "users", label: "Users", items: [
      ["users", "All users", "user", 3], ["users-super", "Super Admins", "star", 3], ["users-org-admins", "Organization admins", "users", 3],
      ["users-access", "Access and permissions", "key", 3], ["users-logins", "Login activity", "clock", 3], ["users-suspended", "Suspended users", "ban", 3]] },
    { id: "finance", label: "Financial operations", items: [
      ["transactions", "All transactions", "card", 3], ["attempts", "Payment attempts", "retry", 3], ["payments-success", "Successful payments", "check", 3],
      ["payments-failed", "Failed payments", "x", 3], ["refunds", "Refunds", "refund", 3], ["refund-requests", "Refund requests", "inbox", 3],
      ["settlements", "Settlements", "bank", 3], ["recon", "Reconciliation", "scale", 4], ["recon-exceptions", "Reconciliation exceptions", "alert", 4]] },
    { id: "integrations", label: "Integrations", items: [
      ["providers", "Payment providers", "plug", 4], ["provider-accounts", "Provider accounts", "id", 4], ["api-credentials", "API credentials", "key", 4],
      ["webhooks", "Webhook events", "hook", 4], ["webhook-failures", "Webhook failures", "alert", 4], ["integration-health", "Integration health", "heart", 4],
      ["api-activity", "API activity", "terminal", 4]] },
    { id: "security", label: "Monitoring and security", items: [
      ["audit", "Audit logs", "doc", 4], ["security-events", "Security events", "shield", 4], ["failed-auth", "Failed sign-ins", "lock", 5],
      ["admin-actions", "Administrative actions", "tool", 4], ["system-exceptions", "System exceptions", "bug", 4]] },
  ];
  const navItem = (route) => {
    for (const g of SA.NAV) for (const [r, label, ic, phase] of g.items) if (r === route) return { route: r, label, icon: ic, phase, group: g };
    return null;
  };
  SA.navItem = navItem;

  function renderNav() {
    const shut = store.get("sa.navShut", []);
    $("#nav").innerHTML = SA.NAV.map((g) => `
      <div class="nav-group${shut.includes(g.id) ? " shut" : ""}" data-group="${g.id}">
        <button type="button" aria-expanded="${!shut.includes(g.id)}"><span>${esc(g.label)}</span>${icon("chev", "ico chev")}</button>
        <ul>${g.items.map(([r, label, ic, phase]) => `
          <li><a href="#/${r}" data-route="${r}" title="${esc(label)}">${icon(ic)}<span>${esc(label)}</span>${SA.pages[r] ? "" : `<span class="soon">Phase ${phase}</span>`}</a></li>`).join("")}
        </ul>
      </div>`).join("");
  }
  function markNav(route) {
    document.querySelectorAll("#nav a[data-route]").forEach((a) => (a.dataset.route === route ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  }

  // ── Router ──
  const $ = (s, el = document) => el.querySelector(s);
  SA.$ = $;
  let renderSeq = 0;
  const charts = new Set();
  SA.parseHash = () => {
    const [path, qs] = (location.hash.replace(/^#\/?/, "") || "overview").split("?");
    const [route, ...rest] = path.split("/");
    return { route: route || "overview", sub: rest.map(decodeURIComponent), params: Object.fromEntries(new URLSearchParams(qs || "")) };
  };
  SA.go = (hash) => { if (location.hash === hash) SA.render(); else location.hash = hash; };

  SA.render = async function render() {
    if (!SA.state.session) return;
    const seq = ++renderSeq;
    charts.forEach((c) => c.destroy()); charts.clear();
    closePops();
    document.body.classList.remove("nav-open");
    const loc = SA.parseHash(), page = SA.pages[loc.route], item = navItem(loc.route);
    markNav(loc.route);
    const title = page ? page.title : item ? item.label : "Not found";
    const group = item ? item.group.label : page && page.group;
    $("#crumbs").innerHTML = `<span>Control centre</span>${group ? `<span class="sep">/</span><span>${esc(group)}</span>` : ""}<span class="sep">/</span><b>${esc(title)}</b>`;
    document.title = `${title} · Bizpole Pay Control Centre`;
    const view = $("#view");
    view.scrollTop = 0; window.scrollTo(0, 0);
    if (!page) {
      view.innerHTML = item
        ? `${SA.ui.head(item.label, "")}<div class="panel">${SA.ui.empty(`${item.label} is scheduled for phase ${item.phase}`, item.phase === 5
            ? "Failed sign-ins are not recorded yet. The sign-in audit entries ship with the authorization work in phase 5."
            : "The read-only API for this section is already live. Its screen is built in a later phase of the control-centre rollout.")}</div>`
        : `${SA.ui.head("Page not found", "")}<div class="panel">${SA.ui.empty("There is no page at this address", `<a href="#/overview">Go to the platform dashboard</a>`, true)}</div>`;
      return;
    }
    try {
      await page.render(view, { ...loc, isCurrent: () => seq === renderSeq });
    } catch (e) {
      if (seq !== renderSeq || e.status === 401) return;
      view.innerHTML = `${SA.ui.head(title, "")}${SA.ui.error(e)}`;
      SA.ui.bindRetry(view);
    }
  };
  // Detail pages: turn the last crumb into a link and append the record's name.
  SA.crumb = (label, parentHref) => {
    const c = $("#crumbs"), last = c.querySelector("b");
    if (last && parentHref) last.outerHTML = `<a href="${esc(parentHref)}">${esc(last.textContent)}</a>`;
    c.insertAdjacentHTML("beforeend", `<span class="sep">/</span><b>${esc(label)}</b>`);
    document.title = `${label} · Bizpole Pay Control Centre`;
  };
  SA.chart = (canvas, config) => {
    const c = new window.Chart(canvas, config);
    charts.add(c);
    return c;
  };

  // ── UI building blocks (return HTML strings) ──
  SA.ui = {
    head: (title, sub, actions = "") => `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`,
    panel: (title, body, { sub = "", right = "", cls = "" } = {}) =>
      `<section class="panel ${cls}"><div class="panel-head"><h2>${esc(title)}</h2>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}${right ? `<div class="right">${right}</div>` : ""}</div>${body}</section>`,
    // html=true only for trusted, static strings written in this codebase.
    empty: (title, text, html = false) => `<div class="empty"><b>${esc(title)}</b><p>${html ? text : esc(text)}</p></div>`,
    error: (e) => `<div class="error-box" role="alert"><span>${esc(e.message || "The request failed.")}</span><button type="button" class="btn" data-retry>Try again</button></div>`,
    bindRetry: (el) => el.querySelectorAll("[data-retry]").forEach((b) => b.addEventListener("click", () => SA.render())),
    skel: (h = 16, w = "100%") => `<div class="skel" style="height:${h}px;width:${w}"></div>`,
    skelPanel: (rows = 4, h = 18) => `<div class="panel"><div class="panel-head">${SA.ui.skel(14, "30%")}</div><div class="panel-body" style="display:grid;gap:12px">${Array.from({ length: rows }, () => SA.ui.skel(h)).join("")}</div></div>`,
    pill(status) {
      const s = String(status || "").toUpperCase();
      const tone = /^(SUCCESS|PROCESSED|LIVE|ACTIVE|DELIVERED|VERIFIED|WON|COMPLETED|AUTO_FIXED|MANUALLY_FIXED)$/.test(s) ? "ok"
        : /^(FAILED|FAILURE|REJECTED|SUSPENDED|DEACTIVATED|BOUNCED|DROPPED|LOST|SIGNATURE_INVALID|DISABLED|REVOKED|FRAUD_LIABILITY)$/.test(s) ? "bad"
        : /^(PENDING|REQUESTED|QUEUED|IN_PROGRESS|SUBMITTED|UNDER_REVIEW|ACTION_REQUIRED|ON_HOLD|OPEN|RUNNING|LOCKED|NEW|PENDING_RESPONSE|INITIATED|AUTHORIZED)$/.test(s) ? "warn"
        : /^(TEST_ONLY|ONBOARDING|USER_CANCELLED)$/.test(s) ? "info" : "";
      return `<span class="pill ${tone}">${esc(fmt.label(s))}</span>`;
    },
    modeTag: (m) => (m ? `<span class="tag ${String(m).toLowerCase()}">${esc(fmt.label(m))}</span>` : ""),
    // opts.sort = { path, params }: columns with `sort` get header links that toggle ?sort=&dir= (server-side sorting).
    // opts.rowHref(row): the whole row opens that address (the first link in the row stays the keyboard target).
    table(columns, rows, emptyHtml, opts = {}) {
      if (!rows.length) return emptyHtml;
      const th = (c) => {
        const cls = c.align === "r" ? "r" : "";
        if (!c.sort || !opts.sort) return `<th class="${cls}" scope="col">${esc(c.label)}</th>`;
        const { path, params } = opts.sort, on = params.sort === c.sort;
        const dir = on && params.dir !== "asc" ? "asc" : "desc";
        const aria = on ? (params.dir === "asc" ? "ascending" : "descending") : "none";
        return `<th class="${cls}" scope="col" aria-sort="${aria}"><a class="sort${on ? " on" : ""}" href="${SA.hashFor(path, { ...params, sort: c.sort, dir, page: "" })}">${esc(c.label)}<span aria-hidden="true">${on ? (params.dir === "asc" ? "↑" : "↓") : "↕"}</span></a></th>`;
      };
      return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${columns.map(th).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr${opts.rowHref ? ` data-href="${esc(opts.rowHref(r))}"` : ""}>${columns.map((c) => `<td class="${[c.align === "r" ? "r" : "", c.cls || ""].join(" ")}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    },
    // Paged API result → "1–25 of 120" with previous/next links.
    pager(data, hrefFor) {
      if (!data || data.total <= data.size && data.page === 1) return data && data.total ? `<div class="pager"><span>${fmt.int(data.total)} ${data.total === 1 ? "result" : "results"}</span></div>` : "";
      const from = (data.page - 1) * data.size + 1, to = Math.min(data.total, data.page * data.size);
      const link = (p, label, on) => on ? `<a class="btn sm" href="${hrefFor(p)}">${label}</a>` : `<span class="btn sm" aria-disabled="true">${label}</span>`;
      return `<nav class="pager" aria-label="Pages"><span>${data.total ? `${fmt.int(from)}–${fmt.int(to)} of ${fmt.int(data.total)}` : "No results"}</span>
        <span class="pager-nav">${link(data.page - 1, "Previous", data.page > 1)}<span class="muted">Page ${fmt.int(data.page)} of ${fmt.int(data.pages)}</span>${link(data.page + 1, "Next", data.page < data.pages)}</span></nav>`;
    },
    // items: [[value, label, count?]]. The current one is marked; each links to hrefFor(value).
    chips: (items, current, hrefFor, label = "Filter") => `<nav class="chips" aria-label="${esc(label)}">${items.map(([v, l, n]) =>
      `<a class="chip" href="${hrefFor(v)}"${v === current ? ' aria-current="true"' : ""}>${esc(l)}${n != null ? ` <span class="n">${fmt.int(n)}</span>` : ""}</a>`).join("")}</nav>`,
    tabs: (items, current, hrefFor) => `<nav class="tabs" aria-label="Sections">${items.map(([k, l]) =>
      `<a href="${hrefFor(k)}"${k === current ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</nav>`,
    // pairs: [[label, html]] – values are HTML, so callers escape data.
    kv: (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v == null || v === "" ? '<span class="muted">—</span>' : v}</dd>`).join("")}</dl>`,
    // Search box that writes ?q= into the address. hrefFor(q) builds the new hash.
    search: (value, placeholder) => `<form class="tsearch" data-tsearch role="search"><label class="sr" for="tq">${esc(placeholder)}</label>
      <input class="inp" id="tq" type="search" name="q" value="${esc(value || "")}" placeholder="${esc(placeholder)}" autocomplete="off" /><button class="btn" type="submit">Search</button></form>`,
    bindSearch(root, hrefFor) {
      const f = root.querySelector("[data-tsearch]");
      if (f) f.addEventListener("submit", (e) => { e.preventDefault(); SA.go(hrefFor(f.q.value.trim())); });
    },
    select: (id, label, options, value) => `<label class="tsel"><span>${esc(label)}</span><select class="inp" id="${id}">${options.map(([v, l]) =>
      `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`,
  };
  // Address for a route plus query params; empty values are dropped so URLs stay short.
  SA.hashFor = (path, params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    return "#/" + path + (qs ? "?" + qs : "");
  };
  // Safe external link: only http(s), opened without referrer or opener.
  SA.ui.extLink = (url) => /^https?:\/\//i.test(String(url || "")) ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>` : esc(url || "");

  // Range selector used by overview and analytics. Today / 7 / 30 / 90 days / This year / All time / Custom.
  const RANGES = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["ytd", "This year"], ["all", "All time"], ["custom", "Custom"]];
  SA.ui.rangePicker = (allowed = RANGES.map((r) => r[0])) => {
    const r = SA.state.range;
    return `<div class="seg" role="group" aria-label="Date range" data-range>${RANGES.filter(([k]) => allowed.includes(k))
      .map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${r.key === k}">${l}</button>`).join("")}</div>
      <form class="range-custom" data-custom ${r.key === "custom" ? "" : "hidden"}>
        <label class="sr" for="rf">From</label><input class="inp" id="rf" type="date" value="${esc(r.from)}" required />
        <span class="muted">to</span>
        <label class="sr" for="rt">To</label><input class="inp" id="rt" type="date" value="${esc(r.to)}" required />
        <button class="btn" type="submit">Apply</button>
      </form>`;
  };
  SA.ui.bindRange = (root) => {
    const seg = root.querySelector("[data-range]"), form = root.querySelector("[data-custom]");
    if (!seg) return;
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-k]");
      if (!b) return;
      if (b.dataset.k === "custom") {
        form.hidden = false;
        seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        form.querySelector("input").focus();
        return;
      }
      SA.state.range = { key: b.dataset.k, from: "", to: "" };
      store.set("sa.range", SA.state.range);
      SA.render();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const from = form.querySelector("#rf").value, to = form.querySelector("#rt").value;
      if (from > to) return SA.toast("The start date must be on or before the end date.", "bad");
      SA.state.range = { key: "custom", from, to };
      store.set("sa.range", SA.state.range);
      SA.render();
    });
  };
  SA.rangeLabel = () => {
    const r = SA.state.range;
    if (r.key === "custom") return `${fmt.date(r.from + "T00:00:00Z")} – ${fmt.date(r.to + "T00:00:00Z")}`;
    return (RANGES.find((x) => x[0] === r.key) || [, "30 days"])[1];
  };

  // ── Toasts and confirmation dialog ──
  SA.toast = (msg, tone = "") => {
    const t = document.createElement("div");
    t.className = "toast " + tone;
    t.textContent = msg;
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 4500);
  };
  // Resolves true only when the operator presses the confirm button. Used for sensitive actions in later phases.
  SA.confirm = ({ title, body, confirmLabel = "Confirm", danger = false }) => new Promise((resolve) => {
    const d = $("#dlg");
    d.innerHTML = `<h2>${esc(title)}</h2><div class="dlg-body">${esc(body)}</div>
      <div class="dlg-foot"><button type="button" class="btn" value="no">Cancel</button><button type="button" class="btn ${danger ? "danger" : "primary"}" value="yes">${esc(confirmLabel)}</button></div>`;
    const done = (v) => { d.close(); resolve(v); };
    d.querySelector('[value="no"]').addEventListener("click", () => done(false));
    d.querySelector('[value="yes"]').addEventListener("click", () => done(true));
    d.addEventListener("cancel", () => resolve(false), { once: true });
    d.showModal();
    d.querySelector('[value="no"]').focus();
  });

  // ── Header: mode, search, notifications, profile ──
  function closePops(except) {
    ["#search-pop", "#bell-pop", "#me-pop"].forEach((s) => { if (s !== except) $(s).hidden = true; });
    ["#bell", "#me"].forEach((s) => $(s).setAttribute("aria-expanded", String(s + "-pop" === except)));
  }
  SA.closePops = closePops;

  function renderMode() {
    const label = { all: "All modes", test: "Test", live: "Live" };
    const dot = { all: "var(--band-all)", test: "var(--band-test)", live: "var(--band-live)" };
    $("#mode").innerHTML = MODES.map((m) => `<button type="button" data-mode="${m}" aria-pressed="${SA.state.mode === m}"><span class="dot" style="background:${dot[m]}"></span>${label[m]}</button>`).join("");
    document.body.dataset.mode = SA.state.mode;
  }

  let searchTimer, searchSeq = 0;
  async function runSearch(q) {
    const pop = $("#search-pop"), seq = ++searchSeq;
    if (q.length < 2) { pop.hidden = true; return; }
    pop.hidden = false;
    pop.innerHTML = `<div class="sr-group">Searching…</div>`;
    try {
      const r = await SA.api("/super/search", { q });
      if (seq !== searchSeq) return;
      const groups = [
        ["Organizations", r.organizations, (o) => [`#/orgs/${encodeURIComponent(o.id)}`, esc(o.name), `${esc(o.email)} · ${esc(fmt.label(o.status))}`]],
        ["Users", r.users, (u) => [`#/users/${encodeURIComponent(u.id)}`, esc(u.name), `${esc(u.email)}${u.platformRole ? " · Super Admin" : ""}`]],
        ["Transactions", r.transactions, (t) => [`#/transactions/${encodeURIComponent(t.txnid)}`, `<span class="mono">${esc(t.txnid)}</span>`, `${fmt.inr(t.amount)} · ${esc(t.org)}`]],
        ["Refunds", r.refunds, (x) => [`#/refunds/${encodeURIComponent(x.id)}`, `<span class="mono">${esc(x.txnid)}</span>`, `${fmt.inr(x.amount)} · ${esc(fmt.label(x.status))}`]],
        ["Settlements", r.settlements, (s) => [`#/settlements/${encodeURIComponent(s.id)}`, `<span class="mono">${esc(s.utr || s.payuSettlementId)}</span>`, fmt.inr(s.net)]],
      ].filter(([, rows]) => rows.length);
      pop.innerHTML = groups.length
        ? groups.map(([label, rows, f]) => `<div class="sr-group">${label}</div>${rows.map((x) => { const [href, t, meta] = f(x); return `<a class="sr-item" role="option" href="${href}"><span>${t}</span><span class="meta">${meta}</span></a>`; }).join("")}`).join("")
        : `<div class="empty"><b>No matches for “${esc(q)}”</b><p>Search by organization or user name and email, txnid, mihpayid, bank reference, refund request ID or UTR.</p></div>`;
    } catch (e) {
      if (seq === searchSeq) pop.innerHTML = `<div class="empty"><b>Search failed</b><p>${esc(e.message)}</p></div>`;
    }
  }

  // Notifications are computed from live platform counts, not stored messages.
  async function loadBell() {
    try {
      const o = await SA.api("/super/overview", { range: "all" });
      const items = [
        [o.organizations.pendingVerification, "organizations waiting on PayU verification", "#/orgs-onboarding"],
        [o.reconciliation.openExceptions, "open reconciliation exceptions", "#/recon-exceptions"],
        [o.webhooks.inboundFailed, "inbound PayU events failed or had an invalid signature", "#/webhook-failures"],
        [o.webhooks.outboundFailed, "merchant webhook deliveries failed", "#/webhook-failures"],
        [o.refunds.open, "refunds not yet completed", "#/refund-requests"],
        [o.settlements.pending, "settlements pending", "#/settlements"],
      ].filter(([n]) => n > 0);
      const bell = $("#bell");
      bell.querySelector(".count")?.remove();
      if (items.length) bell.insertAdjacentHTML("beforeend", `<span class="count">${items.length}</span>`);
      bell.setAttribute("aria-label", items.length ? `Notifications, ${items.length} need attention` : "Notifications");
      $("#bell-pop").innerHTML = `<div class="menu-head"><b>Needs attention</b><div class="muted" style="font-size:12px">${esc(o.mode === "ALL" ? "All modes" : fmt.label(o.mode) + " mode")}, all time</div></div>` +
        (items.length ? items.map(([n, text, href]) => `<a class="menu-item" href="${href}"><b class="num">${fmt.int(n)}</b><span>${esc(text)}</span></a>`).join("")
          : `<div class="empty"><b>Nothing needs attention</b><p>Pending verifications, failed webhooks, open refunds and reconciliation exceptions show up here.</p></div>`);
    } catch {}
  }
  SA.loadBell = loadBell;

  function renderMe() {
    const s = SA.state.session;
    const initials = s.user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    $("#avatar").textContent = initials;
    $("#me-pop").innerHTML = `<div class="menu-head"><b>${esc(s.user.name)}</b><div class="muted" style="font-size:12.5px">${esc(s.user.email)}</div>
        <div style="margin-top:6px"><span class="pill info">Super Admin</span></div></div>
      <button type="button" class="menu-item" id="signout">${icon("out")}<span>Sign out</span></button>`;
    $("#signout").addEventListener("click", async () => {
      try { await SA.api("/auth/logout", {}, { method: "POST", body: {}, withMode: false }); } catch {}
      SA.signedOut("You're signed out.", "info");
    });
  }

  SA.refreshMe = renderMe;
  SA.initShell = () => {
    renderNav(); renderMode(); renderMe();
    if (store.get("sa.collapsed", false)) document.body.classList.add("collapsed");
    $("#collapse").addEventListener("click", () => {
      const on = document.body.classList.toggle("collapsed");
      store.set("sa.collapsed", on);
      $("#collapse").setAttribute("aria-label", on ? "Expand sidebar" : "Collapse sidebar");
    });
    $("#nav").addEventListener("click", (e) => {
      const g = e.target.closest(".nav-group > button");
      if (!g) return;
      const box = g.parentElement, shut = box.classList.toggle("shut");
      g.setAttribute("aria-expanded", String(!shut));
      store.set("sa.navShut", [...document.querySelectorAll(".nav-group.shut")].map((x) => x.dataset.group));
    });
    $("#menu").addEventListener("click", () => document.body.classList.add("nav-open"));
    $("#scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
    $("#mode").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode]");
      if (!b || b.dataset.mode === SA.state.mode) return;
      SA.state.mode = b.dataset.mode;
      store.set("sa.mode", SA.state.mode);
      renderMode(); loadBell(); SA.render();
    });
    const q = $("#q");
    q.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(q.value.trim()), 250); });
    q.addEventListener("focus", () => { if (q.value.trim().length >= 2) $("#search-pop").hidden = false; });
    q.addEventListener("keydown", (e) => {
      const items = [...document.querySelectorAll("#search-pop .sr-item")];
      if (e.key === "Escape") { $("#search-pop").hidden = true; q.blur(); return; }
      if (!items.length || !["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
      e.preventDefault();
      let i = items.findIndex((x) => x.classList.contains("on"));
      if (e.key === "Enter") { (items[i] || items[0]).click(); q.blur(); return; }
      i = e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
      items.forEach((x, j) => x.classList.toggle("on", j === i));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
      if (e.key === "Escape") closePops();
    });
    const toggle = (btn, pop) => $(btn).addEventListener("click", (e) => {
      e.stopPropagation();
      const open = $(pop).hidden;
      closePops(pop);
      $(pop).hidden = !open;
      $(btn).setAttribute("aria-expanded", String(open));
    });
    toggle("#bell", "#bell-pop"); toggle("#me", "#me-pop");
    document.addEventListener("click", (e) => { if (!e.target.closest(".wrap-pop, .search")) closePops(); });
    window.addEventListener("hashchange", SA.render);
    $("#view").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-href]");
      if (!tr || e.target.closest("a, button, input, select, label") || getSelection().toString()) return;
      SA.go(tr.dataset.href);
    });
    loadBell();
  };

  // Chart.js defaults matched to the console.
  // Bizpole Pay chart palette (docs/PAGE_BUILD_GUIDE.md): charcoal, coral, then graphite tint; status colours stay semantic.
  SA.COLORS = { ink: "#211f24", coral: "#e65f55", yellow: "#f1c64b", graphite: "#8a858f", sand: "#cdb89a", ok: "#2f8f5b", bad: "#c8463c", grid: "#eeece7" };
  SA.chartDefaults = () => {
    if (!window.Chart) return;
    const C = window.Chart;
    C.defaults.font.family = getComputedStyle(document.body).getPropertyValue("--sans");
    C.defaults.font.size = 12;
    C.defaults.color = "#6f6a66";
    C.defaults.borderColor = SA.COLORS.grid;
    C.defaults.plugins.legend.display = false;
    C.defaults.plugins.tooltip.backgroundColor = "#211f24";
    C.defaults.plugins.tooltip.padding = 10;
    C.defaults.plugins.tooltip.cornerRadius = 4;
    C.defaults.plugins.tooltip.boxPadding = 4;
    C.defaults.maintainAspectRatio = false;
    // Set fields only: replacing defaults.animation drops Chart.js's easing function.
    C.defaults.animation.duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300;
  };
})();

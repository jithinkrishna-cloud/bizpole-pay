// User management (read-only). Lists: All users, Super Admins, Organization admins, Access and permissions, Login activity,
// Suspended users. Detail: #/users/<id>?tab=overview|logins|activity. Data: /api/super/users, /users/:id, /audit.
// No suspend/activate actions here: those need their own approval and server-side audit (later phase).
(() => {
  "use strict";
  const { esc, fmt, ui } = SA;

  const ROLE = { OWNER: "Owner", ADMIN: "Admin", FINANCE: "Finance", DEVELOPER: "Developer", SUPPORT: "Support", VIEWER: "Viewer" };
  const MEMBER_ROLES = Object.keys(ROLE);
  const ROLE_OPTS = [["", "Any role"], ["SUPER_ADMIN", "Super Admin"], ["ORG_ADMIN", "Owners and admins"], ...MEMBER_ROLES.map((r) => [r, ROLE[r]])];
  const RANGES = [["", "Any time"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["ytd", "This year"]];

  // What each organization role can do, as enforced by the server (router WRITE_ROLES, route `roles` options and
  // the role checks in routes/developer.js, settings.js, onboarding.js). test/super-ui.test.js compares this with the code.
  SA.PERMISSIONS = [
    ["View every page of the organization's dashboard", MEMBER_ROLES],
    ["Refund a payment", ["OWNER", "ADMIN", "FINANCE"]],
    ["Create a payment link", ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT"]],
    ["Developer settings: PayU credentials, API keys, webhooks", ["OWNER", "ADMIN", "DEVELOPER"]],
    ["Business profile, bank accounts, onboarding and SSO", ["OWNER", "ADMIN"]],
    ["Manage the team (only the owner can add or change admins)", ["OWNER", "ADMIN"]],
    ["Other changes: links, checkout, subscriptions, split, payouts, reports", ["OWNER", "ADMIN", "FINANCE", "DEVELOPER"]],
    ["Change their own password and sign out other sessions", MEMBER_ROLES],
  ];

  const when = (d) => (d ? `<span title="${esc(fmt.dt(d))} IST">${esc(fmt.date(d))}</span>` : '<span class="muted">—</span>');
  const ago = (d, never = "Never") => (d ? `<span title="${esc(fmt.dt(d))} IST">${esc(fmt.ago(d))}</span>` : `<span class="muted">${esc(never)}</span>`);
  const userHref = (id, tab) => SA.hashFor("users/" + encodeURIComponent(id), tab && tab !== "overview" ? { tab } : {});
  const orgHref = (id) => "#/orgs/" + encodeURIComponent(id);
  const roleTag = (r) => `<span class="tag">${esc(ROLE[r] || fmt.label(r))}</span>`;
  const superTag = '<span class="pill info">Super Admin</span>';
  const lockedNow = (u) => u.lockedUntil && new Date(u.lockedUntil) > new Date();
  const statusCell = (u) => ui.pill(u.status) + (lockedNow(u) ? `<div class="muted" style="font-size:12px">Locked out until ${esc(fmt.dt(u.lockedUntil))}</div>` : "");
  const orgsCell = (u) => {
    if (!u.memberships.length) return `<span class="muted">${u.platformRole ? "Platform operator" : "No organization"}</span>`;
    const shown = u.memberships.slice(0, 2).map((m) => `<div><a href="${orgHref(m.orgId)}">${esc(m.org)}</a> ${roleTag(m.role)}</div>`).join("");
    return shown + (u.memberships.length > 2 ? `<div class="muted" style="font-size:12px">and ${u.memberships.length - 2} more</div>` : "");
  };

  const COLUMNS = {
    user: { label: "User", sort: "name", render: (u) => `<a href="${userHref(u.id)}">${esc(u.name)}</a> ${u.platformRole ? superTag : ""}<div class="muted" style="font-size:12px">${esc(u.email)}${u.mobile ? " · " + esc(u.mobile) : ""}</div>` },
    orgs: { label: "Organizations and roles", render: orgsCell },
    status: { label: "Status", render: statusCell },
    failed: { label: "Failed sign-ins", align: "r", render: (u) => (u.failedLogins ? `<span style="color:var(--warn)">${fmt.int(u.failedLogins)}</span>` : "0") },
    last: { label: "Last sign-in", sort: "lastLoginAt", render: (u) => ago(u.lastLoginAt), cls: "nowrap" },
    joined: { label: "Joined", sort: "createdAt", render: (u) => when(u.createdAt), cls: "nowrap" },
    view: { label: "Actions", align: "r", render: (u) => `<a href="${userHref(u.id)}">View</a>` },
  };
  const DEFAULT_COLS = ["user", "orgs", "status", "failed", "last", "joined", "view"];

  // cfg: { path, title, sub, chips: [[key, label, apiParams]], roleSelect, cols, sort, empty, note }
  function listPage(cfg) {
    return {
      title: cfg.title,
      async render(view, { params: p, isCurrent }) {
        const key = cfg.chips.some(([k]) => k === p.f) ? p.f : cfg.chips[0][0];
        const hrefFor = (over) => SA.hashFor(cfg.path, { ...p, ...over });
        const base = { q: p.q, range: p.range, role: cfg.roleSelect ? p.role : undefined };
        const filt = (k) => cfg.chips.find(([x]) => x === k)[2];
        const head = ui.head(cfg.title, cfg.sub);
        view.innerHTML = head + ui.skelPanel(8);
        const sort = p.sort || cfg.sort;
        const [data, ...counts] = await Promise.all([
          SA.api("/super/users", { ...base, ...filt(key), sort, dir: p.dir, page: p.page, size: 25 }),
          ...cfg.chips.map(([k]) => SA.api("/super/users", { ...base, ...filt(k), size: 1 }).then((r) => r.total)),
        ]);
        if (!isCurrent()) return;
        const chips = cfg.chips.length > 1 ? ui.chips(cfg.chips.map(([k, l], i) => [k, l, counts[i]]), key, (k) => hrefFor({ f: k === cfg.chips[0][0] ? "" : k, page: "" }), "User filter") : "";
        const toolbar = `<div class="toolbar">${ui.search(p.q, "Search name, email, mobile or user ID")}
          ${cfg.roleSelect ? ui.select("u-role", "Role", ROLE_OPTS, p.role || "") : ""}
          ${ui.select("u-range", "Joined", RANGES, p.range || "")}${chips}</div>`;
        const [et, es] = p.q || p.range || p.role ? ["No users match these filters", "Clear the search or choose another filter."]
          : key !== cfg.chips[0][0] ? [`No users in “${cfg.chips.find(([k]) => k === key)[1]}”`, "Choose another filter to see more."] : cfg.empty;
        const cols = (cfg.cols || DEFAULT_COLS).map((c) => COLUMNS[c]);
        view.innerHTML = head + `<section class="panel">${toolbar}
          ${ui.table(cols, data.rows, ui.empty(et, es), { sort: { path: cfg.path, params: { ...p, sort } }, rowHref: (u) => userHref(u.id) })}
          ${ui.pager(data, (n) => hrefFor({ page: n }))}</section>${cfg.note ? `<p class="muted" style="margin:0;font-size:12.5px">${esc(cfg.note)}</p>` : ""}`;
        ui.bindSearch(view, (q) => hrefFor({ q, page: "" }));
        view.querySelector("#u-range").addEventListener("change", (e) => SA.go(hrefFor({ range: e.target.value, page: "" })));
        const rs = view.querySelector("#u-role");
        if (rs) rs.addEventListener("change", (e) => SA.go(hrefFor({ role: e.target.value, page: "" })));
      },
    };
  }

  const allUsers = listPage({
    path: "users", title: "All users", roleSelect: true,
    sub: "Everyone with a Paynest login: merchant team members and platform operators.",
    chips: [["all", "All", {}], ["active", "Active", { status: "ACTIVE" }], ["locked", "Locked", { status: "LOCKED" }], ["disabled", "Disabled", { status: "DISABLED" }]],
    empty: ["No users yet", "Users appear here as people sign up or are added to a team."],
  });
  SA.pages["users-super"] = listPage({
    path: "users-super", title: "Super Admins",
    sub: "Platform operators with access to this control centre. The role is granted only by a direct database update; no screen or API can grant it.",
    chips: [["all", "All Super Admins", { role: "SUPER_ADMIN" }], ["active", "Active", { role: "SUPER_ADMIN", status: "ACTIVE" }], ["disabled", "Disabled", { role: "SUPER_ADMIN", status: "DISABLED" }]],
    empty: ["No Super Admins", "Assign the role with a database update, as described in docs/SCHEMA_REVIEW.md."],
  });
  SA.pages["users-org-admins"] = listPage({
    path: "users-org-admins", title: "Organization admins",
    sub: "Owners and admins of organizations. They manage their organization's team, bank accounts and onboarding.",
    chips: [["all", "Owners and admins", { role: "ORG_ADMIN" }], ["owner", "Owners", { role: "OWNER" }], ["admin", "Admins", { role: "ADMIN" }]],
    empty: ["No organization admins", "Every organization's owner appears here once it signs up."],
  });
  SA.pages["users-suspended"] = listPage({
    path: "users-suspended", title: "Suspended users",
    sub: "Logins that can't sign in: disabled or locked accounts, and accounts temporarily locked out after too many failed attempts.",
    chips: [["all", "Disabled or locked", { status: "DISABLED,LOCKED" }], ["disabled", "Disabled", { status: "DISABLED" }], ["locked", "Locked", { status: "LOCKED" }],
      ["temp", "Locked out after failed sign-ins", { locked: "1" }]],
    empty: ["No suspended users", "Every login is active. Disabled and locked accounts appear here."],
    note: "This view is read-only. Suspending or reactivating users will come with server-side audit logging in a later phase.",
  });
  SA.pages["users-logins"] = listPage({
    path: "users-logins", title: "Login activity", sort: "lastLoginAt",
    sub: "Most recent sign-in for each user, with failed attempts since their last successful sign-in.",
    chips: [["all", "All users", {}], ["locked", "Locked out now", { locked: "1" }]],
    cols: ["user", "last", "failed", "status", "orgs", "view"],
    empty: ["No sign-ins yet", "Sign-ins appear here as people use Paynest."],
    note: "Open a user for their full sign-in history (one row per session, with IP and device). Failed sign-in attempts are counted but not individually recorded yet; that starts in phase 5.",
  });

  // ── Access and permissions: every (user, organization, role), plus what each role can do ──
  SA.pages["users-access"] = {
    title: "Access and permissions",
    async render(view, { params: p, isCurrent }) {
      const hrefFor = (over) => SA.hashFor("users-access", { ...p, ...over });
      const head = ui.head("Access and permissions", "Each user's role in each organization, and what that role allows. Read-only.");
      view.innerHTML = head + ui.skelPanel(6) + ui.skelPanel(8);
      const role = MEMBER_ROLES.includes(p.role) || p.role === "ORG_ADMIN" ? p.role : "";
      const data = await SA.api("/super/users", { q: p.q, role, sort: p.sort || "name", dir: p.dir || "asc", page: p.page, size: 25 });
      if (!isCurrent()) return;
      const matrix = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">Permission</th>${MEMBER_ROLES.map((r) => `<th scope="col" style="text-align:center">${esc(ROLE[r])}</th>`).join("")}</tr></thead>
        <tbody>${SA.PERMISSIONS.map(([label, roles]) => `<tr><td>${esc(label)}</td>${MEMBER_ROLES.map((r) => `<td style="text-align:center">${roles.includes(r)
          ? `<span style="color:var(--ok)" aria-label="Allowed">${SA.icon("check")}</span>` : '<span class="muted" aria-label="Not allowed">—</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      // One row per membership; users without an organization get one row so operators are visible too.
      const keep = (m) => (!role ? true : role === "ORG_ADMIN" ? ["OWNER", "ADMIN"].includes(m.role) : m.role === role);
      const rows = data.rows.flatMap((u) => (u.memberships.length ? u.memberships.filter(keep).map((m) => ({ u, m })) : [{ u, m: null }]));
      const can = (r) => SA.PERMISSIONS.filter(([, roles]) => roles.includes(r)).length;
      const table = ui.table([
        { label: "User", render: ({ u }) => `<a href="${userHref(u.id)}">${esc(u.name)}</a>${u.platformRole ? " " + superTag : ""}<div class="muted" style="font-size:12px">${esc(u.email)}</div>` },
        { label: "Organization", render: ({ u, m }) => (m ? `<a href="${orgHref(m.orgId)}">${esc(m.org)}</a>` : `<span class="muted">${u.platformRole ? "Control centre (all organizations, read-only)" : "No organization"}</span>`) },
        { label: "Role", render: ({ u, m }) => (m ? roleTag(m.role) : u.platformRole ? superTag : "—") },
        { label: "Permissions", render: ({ m }) => (m ? `${can(m.role)} of ${SA.PERMISSIONS.length}` : '<span class="muted">—</span>') },
        { label: "Login status", render: ({ u }) => statusCell(u) },
      ], rows, ui.empty("No users match", "Clear the search or choose another role."), { rowHref: ({ u }) => userHref(u.id) });
      view.innerHTML = head + ui.panel("What each organization role can do", matrix, { sub: "As enforced by the server" })
        + `<section class="panel"><div class="panel-head"><h2>Who has access</h2><span class="sub">${esc(fmt.int(data.total))} users, one row per organization role</span></div>
          <div class="toolbar">${ui.search(p.q, "Search name, email or mobile")}${ui.select("a-role", "Role", [["", "Any role"], ["ORG_ADMIN", "Owners and admins"], ...MEMBER_ROLES.map((r) => [r, ROLE[r]])], role)}</div>
          ${table}${ui.pager(data, (n) => hrefFor({ page: n }))}</section>
        <p class="muted" style="margin:0;font-size:12.5px">Roles are managed by each organization's owner and admins in their own settings. Super Admin can't be granted from any screen.</p>`;
      ui.bindSearch(view, (q) => hrefFor({ q, page: "" }));
      view.querySelector("#a-role").addEventListener("change", (e) => SA.go(hrefFor({ role: e.target.value, page: "" })));
    },
  };

  // ── User detail ──
  const TABS = [["overview", "Overview"], ["logins", "Login history"], ["activity", "Activity"]];
  const device = (ua) => {
    const s = String(ua || "");
    if (!s) return '<span class="muted">Unknown</span>';
    const b = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : /curl|node|axios|python/i.test(s) ? "Script" : "Browser";
    const os = /Windows/.test(s) ? "Windows" : /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iOS" : /Mac OS X/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
    return `<span title="${esc(s)}">${esc(b)}${os ? " on " + esc(os) : ""}</span>`;
  };
  const sessionState = (s) => (s.active ? ui.pill("ACTIVE") : s.revokedAt ? `<span class="pill">Signed out</span>` : `<span class="pill">Expired</span>`);

  function overviewTab(u) {
    const profile = ui.kv([
      ["Name", esc(u.name)], ["Email", `${esc(u.email)} ${u.emailVerifiedAt ? '<span class="pill ok">Verified</span>' : '<span class="pill">Not verified</span>'}`],
      ["Mobile", u.mobile ? `${esc(u.mobile)} ${u.mobileVerifiedAt ? '<span class="pill ok">Verified</span>' : '<span class="pill">Not verified</span>'}` : ""],
      ["User ID", `<span class="mono">${esc(u.id)}</span>`], ["Joined", esc(fmt.dt(u.createdAt))], ["Last updated", esc(fmt.dt(u.updatedAt))],
    ]);
    const security = ui.kv([
      ["Login status", statusCell(u)], ["Platform role", u.platformRole ? superTag : '<span class="muted">None</span>'],
      ["Sign-in method", u.hasPassword ? "Password or one-time code" : "Single sign-on only"],
      ["Last sign-in", u.lastLoginAt ? esc(fmt.dt(u.lastLoginAt)) : '<span class="muted">Never</span>'],
      ["Failed sign-ins", u.failedLogins ? `<span style="color:var(--warn)">${fmt.int(u.failedLogins)} since the last successful sign-in</span>` : "0"],
      ["Active sessions", fmt.int(u.sessions.filter((s) => s.active).length)],
    ]);
    const members = ui.table([
      { label: "Organization", render: (m) => `<a href="${orgHref(m.orgId)}">${esc(m.org)}</a>` },
      { label: "Role", render: (m) => roleTag(m.role) },
      { label: "Permissions", render: (m) => `${SA.PERMISSIONS.filter(([, r]) => r.includes(m.role)).length} of ${SA.PERMISSIONS.length}` },
      { label: "Organization status", render: (m) => ui.pill(m.orgStatus) },
      { label: "Member since", render: (m) => when(m.createdAt), cls: "nowrap" },
    ], u.memberships, ui.empty(u.platformRole ? "Not a member of any organization" : "No organization access",
      u.platformRole ? "Super Admins see every organization from the control centre, read-only." : "This login can't open any organization's dashboard."), { rowHref: (m) => orgHref(m.orgId) });
    return `<div class="grid g2">${ui.panel("Profile", `<div class="panel-body">${profile}</div>`)}${ui.panel("Access and security", `<div class="panel-body">${security}</div>`)}</div>`
      + ui.panel("Organizations and roles", members, { sub: `${u.memberships.length} ${u.memberships.length === 1 ? "organization" : "organizations"}` });
  }

  function loginsTab(u) {
    return ui.panel("Login history", ui.table([
      { label: "Signed in", render: (s) => `<span title="${esc(fmt.dt(s.createdAt))} IST">${esc(fmt.dt(s.createdAt))}</span>`, cls: "nowrap" },
      { label: "IP address", render: (s) => (s.ip ? `<span class="mono">${esc(s.ip)}</span>` : "—"), cls: "nowrap" },
      { label: "Device", render: (s) => device(s.userAgent) },
      { label: "Organization", render: (s) => esc(s.org || "—") },
      { label: "Session", render: sessionState },
      { label: "Ends", render: (s) => esc(fmt.dt(s.revokedAt || s.expiresAt)), cls: "nowrap" },
    ], u.sessions, ui.empty("No sign-ins", "This user hasn't signed in yet.")),
    { sub: u.sessions.length >= 50 ? "Latest 50 sessions" : `${u.sessions.length} ${u.sessions.length === 1 ? "session" : "sessions"}` })
    + `<p class="muted" style="margin:0;font-size:12.5px">Each row is one successful sign-in. Failed attempts are counted on the account but not recorded individually yet.</p>`;
  }

  async function activityTab(u, p, isCurrent) {
    const data = await SA.api("/super/audit", { actorId: u.id, page: p.page, size: 25 }, { withMode: false });
    if (!isCurrent()) return null;
    return ui.panel("Activity", ui.table([
      { label: "When", render: (a) => esc(fmt.dt(a.date)), cls: "nowrap" },
      { label: "Action", render: (a) => `<span class="mono">${esc(a.action)}</span>` },
      { label: "Target", render: (a) => (a.entity ? `${esc(a.entity)}${a.entityId ? ` <span class="mono muted" style="font-size:12px">${esc(a.entityId)}</span>` : ""}` : "—"), cls: "ellip" },
      { label: "Organization", render: (a) => (a.org ? `<a href="${orgHref(a.org.id)}">${esc(a.org.name)}</a>` : '<span class="muted">Platform</span>') },
      { label: "Mode", render: (a) => ui.modeTag(a.mode) || "—" },
      { label: "IP", render: (a) => (a.ip ? `<span class="mono">${esc(a.ip)}</span>` : "—"), cls: "nowrap" },
    ], data.rows, ui.empty("No recorded activity", "Actions this user takes are written to the audit log and listed here.")) + ui.pager(data, (n) => SA.hashFor("users/" + encodeURIComponent(u.id), { tab: "activity", page: n })),
    { sub: `${fmt.int(data.total)} recorded ${data.total === 1 ? "action" : "actions"}` });
  }

  async function detail(view, id, p, isCurrent) {
    const tab = TABS.some(([k]) => k === p.tab) ? p.tab : "overview";
    view.innerHTML = ui.skelPanel(3) + `<div class="grid g2">${ui.skelPanel(6)}${ui.skelPanel(6)}</div>`;
    let u;
    try { u = await SA.api("/super/users/" + encodeURIComponent(id), {}, { withMode: false }); }
    catch (e) {
      if (e.status !== 404) throw e;
      view.innerHTML = ui.head("User not found", "") + `<div class="panel">${ui.empty("There is no user with this ID", "It may have been entered incorrectly.")}<div style="text-align:center;padding-bottom:20px"><a href="#/users">Back to all users</a></div></div>`;
      return;
    }
    if (!isCurrent()) return;
    SA.crumb(u.name, "#/users");
    const header = `<div class="org-head"><div><h1 style="margin:0;font-size:22px;font-weight:600">${esc(u.name)}</h1>
        <div class="meta">${ui.pill(u.status)}${u.platformRole ? superTag : ""}<span>${esc(u.email)}</span><span>Joined ${esc(fmt.date(u.createdAt))}</span></div></div>
        <div style="margin-left:auto"><a class="btn" href="#/users">All users</a></div></div>`;
    const tabs = ui.tabs(TABS, tab, (k) => userHref(u.id, k));
    let body;
    if (tab === "activity") {
      view.innerHTML = header + tabs + ui.skelPanel(8);
      body = await activityTab(u, p, isCurrent);
      if (body === null) return;
    } else body = tab === "logins" ? loginsTab(u) : overviewTab(u);
    view.innerHTML = header + tabs + body;
  }

  SA.pages.users = {
    title: "All users",
    render(view, ctx) {
      if (ctx.sub[0]) return detail(view, ctx.sub[0], ctx.params, ctx.isCurrent);
      return allUsers.render(view, ctx);
    },
  };
})();

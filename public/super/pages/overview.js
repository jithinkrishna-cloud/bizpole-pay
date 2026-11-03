// Platform dashboard: KPIs (GET /api/super/overview), two trend charts (analytics) and recent activity.
(() => {
  "use strict";
  const { esc, fmt, ui, COLORS: C } = SA;

  const kpi = (label, value, { sub = "", href = "", tone = "" } = {}) => {
    const tag = href ? "a" : "div";
    return `<${tag} class="kpi${tone ? " tone-" + tone : ""}"${href ? ` href="${href}"` : ""}><span class="label">${esc(label)}</span><span class="value">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</${tag}>`;
  };
  const group = (title, note, items) => `<section class="kpi-group"><h2>${esc(title)} <span style="font-weight:400">${esc(note)}</span></h2><div class="kpi-list">${items.join("")}</div></section>`;

  SA.pages.overview = {
    title: "Platform dashboard",
    async render(view, { isCurrent }) {
      const head = ui.head("Platform dashboard", "Live figures across every organization on Bizpole Pay. Amounts in rupees, times in IST.", ui.rangePicker());
      view.innerHTML = head + `<div class="kpi-groups">${Array.from({ length: 4 }, () => ui.skelPanel(4, 22)).join("")}</div><div class="grid g2">${ui.skelPanel(3, 40)}${ui.skelPanel(3, 40)}</div>`;
      ui.bindRange(view);
      const rp = SA.rangeParams();
      const [o, a, act] = await Promise.all([SA.api("/super/overview", rp), SA.api("/super/analytics", rp), SA.api("/super/activity", { limit: 6 })]);
      if (!isCurrent()) return;
      const period = SA.rangeLabel(), t = o.transactions;
      const sr = t.total ? fmt.pct(t.successful / t.total) + " success rate" : "No payments in period";

      const kpis = `<div class="kpi-groups">
        ${group("Organizations and users", "now", [
          kpi("Total organizations", fmt.int(o.organizations.total), { href: "#/orgs" }),
          kpi("Active organizations", fmt.int(o.organizations.active), { sub: `${fmt.int(o.organizations.live)} live on PayU`, href: "#/orgs-status" }),
          kpi("Pending verification", fmt.int(o.organizations.pendingVerification), { sub: "Submitted, under review or action required", href: "#/orgs-onboarding", tone: o.organizations.pendingVerification ? "warn" : "" }),
          kpi("Platform users", fmt.int(o.users.total), { sub: `${fmt.int(o.users.superAdmins)} Super Admin${o.users.superAdmins === 1 ? "" : "s"}`, href: "#/users" }),
        ])}
        ${group("Payments", period, [
          kpi("Total transactions", fmt.int(t.total), { href: "#/transactions" }),
          kpi("Successful", fmt.int(t.successful), { sub: sr, href: "#/payments-success" }),
          kpi("Failed", fmt.int(t.failed), { sub: `${fmt.int(t.cancelled)} cancelled by the customer`, href: "#/payments-failed", tone: t.failed ? "bad" : "" }),
          kpi("Payment volume", `<span title="${esc(fmt.inr(t.volume))}">${fmt.inrShort(t.volume)}</span>`, { sub: "Successful payments" }),
        ])}
        ${group("Refunds and settlements", period, [
          kpi("Refunds", fmt.int(o.refunds.total), { sub: `${fmt.int(o.refunds.open)} not yet completed`, href: "#/refunds" }),
          kpi("Refund amount", `<span title="${esc(fmt.inr(o.refunds.amount))}">${fmt.inrShort(o.refunds.amount)}</span>`, { sub: "Excludes failed refunds" }),
          kpi("Pending settlements", fmt.int(o.settlements.pending), { sub: `${fmt.inr(o.settlements.pendingAmount)} awaiting payout, any date`, href: "#/settlements" }),
        ])}
        ${group("Operations", period, [
          kpi("Open reconciliation exceptions", fmt.int(o.reconciliation.openExceptions), { sub: "Any date", href: "#/recon-exceptions", tone: o.reconciliation.openExceptions ? "bad" : "" }),
          kpi("Provider accounts", fmt.int(o.providerAccounts.total), { sub: `${fmt.int(o.providerAccounts.active)} active PayU credentials`, href: "#/provider-accounts" }),
          kpi("Webhook events", fmt.int(o.webhooks.inbound + o.webhooks.outbound),
            { sub: `${fmt.int(o.webhooks.inbound)} from PayU, ${fmt.int(o.webhooks.outbound)} to merchants, ${fmt.int(o.webhooks.inboundFailed + o.webhooks.outboundFailed)} failed`, href: "#/webhooks",
              tone: o.webhooks.inboundFailed + o.webhooks.outboundFailed ? "warn" : "" }),
        ])}
      </div>`;

      const T = a.transactions, has = !SA.chartEmpty(T, ["total"]);
      const chartPanel = (title, id, lg) => ui.panel(title, has
        ? `<div style="padding:10px 16px 0">${lg}</div><div class="panel-body"><div class="chart-box short"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`
        : ui.empty("No payments in this period", "Choose a longer range or another mode."), { right: `<a href="#/analytics">All analytics</a>` });
      const charts = `<div class="grid g2">
        ${chartPanel("Transaction volume", "o-vol", SA.chartLegend([[C.coral, "Successful volume"], [C.ink, "Payments"]]))}
        ${chartPanel("Success and failure", "o-sf", SA.chartLegend([[C.ok, "Successful"], [C.bad, "Failed"], [C.graphite, "Other"]]))}
      </div>`;

      const recent = ui.panel("Latest payment transactions", SA.feeds.transactions(act.transactions), { right: `<a href="#/activity">System activity</a>` }) +
        `<div class="grid g3">${SA.ACTIVITY_PANELS.map(([k, title, route]) =>
          ui.panel(title, SA.feeds[k](act[k]), { right: act[k].length ? `<a href="#/${route}">View all</a>` : "" })).join("")}</div>`;

      view.innerHTML = head + kpis + charts + recent;
      ui.bindRange(view);
      if (has) {
        SA.charts.volume(view.querySelector("#o-vol"), T, a.unit);
        SA.charts.successFailure(view.querySelector("#o-sf"), T, a.unit);
      }
    },
  };
})();

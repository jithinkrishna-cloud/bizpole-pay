// Platform analytics: eight charts from GET /api/super/analytics. Chart builders are shared with the overview page.
(() => {
  "use strict";
  const { esc, fmt, ui, COLORS: C } = SA;

  const bucketLabel = (b, unit) => {
    const d = new Date(b + (unit === "month" ? "-01" : "") + "T00:00:00Z");
    return unit === "month"
      ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
  };
  const rupeeTick = (v) => "₹" + new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v / 100);
  const intTick = (v) => (Number.isInteger(v) ? fmt.int(v) : "");
  const axes = (y, y1) => ({
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
    y: { beginAtZero: true, ticks: { callback: y, maxTicksLimit: 5 }, border: { display: false } },
    ...(y1 ? { y1: { beginAtZero: true, position: "right", grid: { display: false }, ticks: { callback: y1, maxTicksLimit: 5 }, border: { display: false } } } : {}),
  });
  const legend = (items) => `<div class="legend">${items.map(([c, l, dash]) => `<span><i class="${dash ? "dash" : ""}" style="${dash ? `border-color:${c}` : `background:${c}`}"></i>${esc(l)}</span>`).join("")}</div>`;
  const allZero = (rows, keys) => rows.every((r) => keys.every((k) => !r[k]));

  // Each builder: (canvas, data) → Chart. Data shapes are the API's.
  SA.charts = {
    volume(cv, rows, unit) {
      return SA.chart(cv, { type: "bar", data: { labels: rows.map((r) => bucketLabel(r.bucket, unit)), datasets: [
        { label: "Successful volume", data: rows.map((r) => r.volume), backgroundColor: C.teal, borderRadius: 2, maxBarThickness: 28, yAxisID: "y" },
        { label: "Payments", type: "line", data: rows.map((r) => r.total), borderColor: C.navy, backgroundColor: C.navy, borderWidth: 1.5, pointRadius: 0, pointHitRadius: 8, yAxisID: "y1" },
      ] }, options: { interaction: { mode: "index", intersect: false }, scales: axes(rupeeTick, intTick),
        plugins: { tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === "y" ? ` Volume ${fmt.inr(c.raw)}` : ` Payments ${fmt.int(c.raw)}` } } } } });
    },
    successFailure(cv, rows, unit) {
      return SA.chart(cv, { type: "bar", data: { labels: rows.map((r) => bucketLabel(r.bucket, unit)), datasets: [
        { label: "Successful", data: rows.map((r) => r.successful), backgroundColor: C.ok, maxBarThickness: 28 },
        { label: "Failed", data: rows.map((r) => r.failed), backgroundColor: C.bad, maxBarThickness: 28 },
        { label: "Other", data: rows.map((r) => r.total - r.successful - r.failed), backgroundColor: C.slate, maxBarThickness: 28 },
      ] }, options: { interaction: { mode: "index", intersect: false }, scales: { ...axes(intTick), x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } }, y: { stacked: true, beginAtZero: true, ticks: { callback: intTick, maxTicksLimit: 5 }, border: { display: false } } },
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label} ${fmt.int(c.raw)}`,
          footer: (items) => { const t = items.reduce((a, i) => a + i.raw, 0), ok = items.find((i) => i.dataset.label === "Successful"); return t ? `Success rate ${fmt.pct(ok.raw / t)}` : ""; } } } } } });
    },
    distribution(cv, bands) {
      return SA.chart(cv, { type: "bar", data: { labels: bands.map((b) => b.band), datasets: [
        { label: "Payments", data: bands.map((b) => b.count), backgroundColor: C.navy, borderRadius: 2, maxBarThickness: 48 }] },
        options: { scales: axes(intTick), plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.raw)} payments · ${fmt.inr(bands[c.dataIndex].amount)}` } } } } });
    },
    orgGrowth(cv, rows, unit) {
      return SA.chart(cv, { type: "bar", data: { labels: rows.map((r) => bucketLabel(r.bucket, unit)), datasets: [
        { label: "New", data: rows.map((r) => r.new), backgroundColor: C.teal, borderRadius: 2, maxBarThickness: 28, yAxisID: "y" },
        { label: "Total", type: "line", data: rows.map((r) => r.total), borderColor: C.navy, borderWidth: 1.5, pointRadius: 0, pointHitRadius: 8, yAxisID: "y1" },
      ] }, options: { interaction: { mode: "index", intersect: false }, scales: axes(intTick, intTick),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label} ${fmt.int(c.raw)}` } } } } });
    },
    users(cv, rows, unit) {
      return SA.chart(cv, { type: "bar", data: { labels: rows.map((r) => bucketLabel(r.bucket, unit)), datasets: [
        { label: "New users", data: rows.map((r) => r.new), backgroundColor: C.navy, borderRadius: 2, maxBarThickness: 28 }] },
        options: { scales: axes(intTick), plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.raw)} new users` } } } } });
    },
    refunds(cv, rows, unit) {
      return SA.chart(cv, { type: "bar", data: { labels: rows.map((r) => bucketLabel(r.bucket, unit)), datasets: [
        { label: "Refund amount", data: rows.map((r) => r.amount), backgroundColor: C.amber, borderRadius: 2, maxBarThickness: 28, yAxisID: "y" },
        { label: "Refunds", type: "line", data: rows.map((r) => r.count), borderColor: C.navy, borderWidth: 1.5, pointRadius: 0, pointHitRadius: 8, yAxisID: "y1" },
      ] }, options: { interaction: { mode: "index", intersect: false }, scales: axes(rupeeTick, intTick),
        plugins: { tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === "y" ? ` Amount ${fmt.inr(c.raw)}` : ` Refunds ${fmt.int(c.raw)}` } } } } });
    },
    methods(cv, rows) {
      return SA.chart(cv, { type: "bar", data: { labels: rows.map((r) => r.method), datasets: [
        { label: "Success rate", data: rows.map((r) => (r.successRate == null ? 0 : r.successRate * 100)), backgroundColor: C.teal, borderRadius: 2, maxBarThickness: 18 }] },
        options: { indexAxis: "y", scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + "%", maxTicksLimit: 6 }, border: { display: false } }, y: { grid: { display: false } } },
          plugins: { tooltip: { callbacks: { label: (c) => { const r = rows[c.dataIndex]; return ` ${fmt.pct(r.successRate)} · ${fmt.int(r.successful)} of ${fmt.int(r.total)} · ${fmt.inr(r.volume)}`; } } } } } });
    },
    settlements(cv, rows, unit) {
      return SA.chart(cv, { type: "bar", data: { labels: rows.map((r) => bucketLabel(r.bucket, unit)), datasets: [
        { label: "Net settled", data: rows.map((r) => r.net), backgroundColor: C.navy, borderRadius: 2, maxBarThickness: 28 },
        { label: "Fees and tax", type: "line", data: rows.map((r) => r.fees), borderColor: C.amber, borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, pointHitRadius: 8 },
      ] }, options: { interaction: { mode: "index", intersect: false }, scales: axes(rupeeTick),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label} ${fmt.inr(c.raw)}` } } } } });
    },
  };
  SA.chartLegend = legend;
  SA.chartEmpty = allZero;

  const box = (id, short) => `<div class="panel-body"><div class="chart-box${short ? " short" : ""}"><canvas id="${id}" role="img"></canvas></div></div>`;
  const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);

  SA.pages.analytics = {
    title: "Platform analytics",
    async render(view, { isCurrent }) {
      const head = ui.head("Platform analytics", "Trends across every organization for the selected period. Times are in IST; buckets are UTC days or months.", ui.rangePicker());
      view.innerHTML = head + `<div class="grid g2">${Array.from({ length: 4 }, () => ui.skelPanel(3, 40)).join("")}</div>`;
      ui.bindRange(view);
      const a = await SA.api("/super/analytics", SA.rangeParams());
      if (!isCurrent()) return;
      const T = a.transactions, unit = a.unit;
      const ok = sum(T, "successful"), all = sum(T, "total");
      const P = [
        ["Transaction volume over time", "c-vol", `${fmt.inr(sum(T, "volume"))} successful · ${fmt.int(all)} payments`, legend([[C.teal, "Successful volume"], [C.navy, "Payments"]]), !allZero(T, ["total"]), () => SA.charts.volume(view.querySelector("#c-vol"), T, unit)],
        ["Payment success and failure", "c-sf", all ? `${fmt.pct(ok / all)} success rate` : "", legend([[C.ok, "Successful"], [C.bad, "Failed"], [C.slate, "Pending, cancelled or other"]]), !allZero(T, ["total"]), () => SA.charts.successFailure(view.querySelector("#c-sf"), T, unit)],
        ["Transaction amount distribution", "c-dist", "All attempts, by amount", "", a.amountDistribution.some((b) => b.count), () => SA.charts.distribution(view.querySelector("#c-dist"), a.amountDistribution)],
        ["Payment method performance", "c-meth", "PayU, success rate by method", "", a.methodPerformance.length > 0, () => SA.charts.methods(view.querySelector("#c-meth"), a.methodPerformance)],
        ["Organization growth", "c-org", `${fmt.int(sum(a.organizations, "new"))} new in period`, legend([[C.teal, "New"], [C.navy, "Total"]]), a.organizations.some((r) => r.total), () => SA.charts.orgGrowth(view.querySelector("#c-org"), a.organizations, unit)],
        ["New user registrations", "c-usr", `${fmt.int(sum(a.userRegistrations, "new"))} in period`, "", !allZero(a.userRegistrations, ["new"]), () => SA.charts.users(view.querySelector("#c-usr"), a.userRegistrations, unit)],
        ["Refund trends", "c-ref", `${fmt.inr(sum(a.refunds, "amount"))} · ${fmt.int(sum(a.refunds, "count"))} refunds`, legend([[C.amber, "Refund amount"], [C.navy, "Refunds"]]), !allZero(a.refunds, ["count"]), () => SA.charts.refunds(view.querySelector("#c-ref"), a.refunds, unit)],
        ["Settlement trends", "c-set", `${fmt.inr(sum(a.settlements, "net"))} net settled`, legend([[C.navy, "Net settled"], [C.amber, "Fees and tax", true]]), !allZero(a.settlements, ["count"]), () => SA.charts.settlements(view.querySelector("#c-set"), a.settlements, unit)],
      ];
      view.innerHTML = head + `<div class="grid g2">${P.map(([title, id, sub, lg, has]) =>
        ui.panel(title, has ? (lg ? `<div style="padding:10px 16px 0">${lg}</div>` : "") + box(id) : ui.empty("No data in this period", "Choose a longer range or another mode."), { sub })).join("")}</div>`;
      ui.bindRange(view);
      P.forEach(([, , , , has, draw]) => has && draw());
    },
  };
})();

// Page: analytics. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Payment analytics ---- */
(() => {
  const DAY = 864e5;
  // Same rolling windows as Transactions ("Last 7 days" = now − 7×24 h) so numbers match that page.
  const AN_RANGES = [['today', 'Today'], ['3d', 'Last 3 days', 3], ['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30]];
  // Theme colours are read from the core's tokens at render time so charts follow the design system.
  const tok = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
  // Series order and previous-period colour come from the guide's chart palette.
  const SERIES = ['#211F24', '#E65F55', '#F1C64B', '#8A858F', '#CDB89A', '#F2A39C'], PREV_COLOR = '#B9B4AD';
  const BRAND = () => tok('--ink', SERIES[0]), PREV = () => PREV_COLOR;
  const modeColors = () => Object.fromEntries([...new Set(MODES)].map((m, i) => [m, SERIES[i % SERIES.length]]));
  const MODE_ORDER = [...new Set(MODES)];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const an = { range: '7d', compare: true };

  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const rangeLabel = () => AN_RANGES.find(r => r[0] === an.range)[1];
  // Current window [from, to] and the equally long window right before it.
  function windows(){
    const to = now.getTime();
    const from = an.range === 'today' ? sod(now).getTime() : to - AN_RANGES.find(r => r[0] === an.range)[2] * DAY;
    const len = an.range === 'today' ? DAY : to - from;
    return { from, to, prevFrom: from - len, prevTo: from };
  }
  // Inclusive of both ends.
  const within = (rows, a, b) => rows.filter(t => t.date.getTime() >= a && t.date.getTime() <= b);
  const ok = t => t.status === 'SUCCESS';
  const sum = (rows, f = t => t.amount) => rows.reduce((a, t) => a + f(t), 0);
  const pct = (a, b) => b ? a / b * 100 : 0;
  const short = p => { const r = p / 100; return r >= 1e7 ? '₹' + (r / 1e7).toFixed(1) + 'Cr' : r >= 1e5 ? '₹' + (r / 1e5).toFixed(1) + 'L' : r >= 1e3 ? '₹' + (r / 1e3).toFixed(r >= 1e4 ? 0 : 1) + 'k' : '₹' + Math.round(r); };
  const failReason = t => t.status === 'USER_CANCELLED' ? 'Cancelled by customer' : t.error;

  function metrics(rows){
    const s = rows.filter(ok), f = rows.filter(t => t.status === 'FAILURE');
    return { n: rows.length, ok: s.length, gmv: sum(s), rate: pct(s.length, rows.length), avg: s.length ? sum(s) / s.length : 0, failN: f.length, failAmt: sum(f), pending: rows.filter(t => t.status === 'PENDING').length };
  }
  // Buckets for the trend charts: 3-hour blocks for "Today", calendar days otherwise.
  function buckets(w){
    const out = [];
    if (an.range === 'today') {
      for (let h = 0; h < 24; h += 3) { const a = w.from + h * 3600e3; if (a > w.to) break; out.push({ label: String(h).padStart(2, '0') + ':00', from: a, to: a + 3 * 3600e3 - 1 }); }
      return out;
    }
    for (let d = sod(w.from).getTime(); d <= w.to; d += DAY) {
      out.push({ label: new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), from: Math.max(d, w.from), to: Math.min(d + DAY - 1, w.to) });
    }
    return out;
  }

  /* ---------- chart primitives (inline SVG / CSS, no libraries) ---------- */
  function lineChart(labels, series, { yMax = 100, yFmt = v => v + '%', h = 250 } = {}){
    const W = 820, H = h, L = 44, R = 18, T = 22, B = 30, iw = W - L - R, ih = H - T - B, n = labels.length;
    const x = i => L + (n === 1 ? iw / 2 : i * iw / (n - 1)), y = v => T + ih - v / yMax * ih;
    const grid = [0, .25, .5, .75, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(f * yMax)}" y2="${y(f * yMax)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(f * yMax) + 4}" text-anchor="end" class="an-ax">${yFmt(f * yMax)}</text>`).join('');
    const step = Math.ceil(n / 10);
    const xl = labels.map((l, i) => i % step === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="an-ax">${l}</text>` : '').join('');
    const paths = series.map(s => {
      const segs = []; let cur = [];
      s.values.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
      if (cur.length) segs.push(cur);
      const line = segs.map(seg => `<path d="${seg.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.dash ? 2 : 2.5}" ${s.dash ? 'stroke-dasharray="5 5"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('');
      const dots = s.values.map((v, i) => v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="${s.dash ? 2.5 : 4}" fill="${s.dash ? s.color : '#fff'}" stroke="${s.color}" stroke-width="2"><title>${labels[i]} · ${s.name}: ${yFmt(v)}</title></circle>
        ${s.labels ? `<text x="${x(i) + (i === 0 && n > 1 ? 6 : 0)}" y="${y(v) - 10}" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}" class="an-val">${yFmt(v)}</text>` : ''}`).join('');
      return line + dots;
    }).join('');
    return `<svg class="an-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${series.map(s => s.name).join(', ')}">${grid}${xl}${paths}</svg>`;
  }
  function stackedBars(labels, stacks, keys, colors, { h = 300 } = {}){
    const W = 620, H = h, L = 54, R = 10, T = 22, B = 30, iw = W - L - R, ih = H - T - B, n = labels.length;
    const totals = stacks.map(s => keys.reduce((a, k) => a + (s[k] || 0), 0)), max = Math.max(1, ...totals);
    const top = (() => { const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), m = [1, 2, 2.5, 5, 10].find(c => c * mag >= raw); return m * mag * 4; })();
    const y = v => T + ih - v / top * ih, bw = Math.min(56, iw / n * .62), step = Math.ceil(n / 12);
    const grid = [0, .25, .5, .75, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(f * top)}" y2="${y(f * top)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(f * top) + 4}" text-anchor="end" class="an-ax">${short(f * top)}</text>`).join('');
    const bars = stacks.map((s, i) => {
      const cx = L + (i + .5) * iw / n; let acc = 0;
      const rects = keys.map(k => { const v = s[k] || 0; if (!v) return ''; const r = `<rect x="${cx - bw / 2}" y="${y(acc + v)}" width="${bw}" height="${Math.max(1, y(acc) - y(acc + v) - 1)}" fill="${colors[k]}" rx="2"><title>${labels[i]} · ${k}: ${inr(v)}</title></rect>`; acc += v; return r; }).join('');
      return rects + (totals[i] ? `<text x="${cx}" y="${y(totals[i]) - 6}" text-anchor="middle" class="an-val">${short(totals[i])}</text>` : '') +
        (i % step === 0 || i === n - 1 ? `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="an-ax">${labels[i]}</text>` : '');
    }).join('');
    return `<svg class="an-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Successful volume by payment mode">${grid}${bars}</svg>`;
  }
  const legend = items => `<div class="an-legend">${items.map(([label, color, dash]) => `<span><i style="${dash ? `border-top:2px dashed ${color};background:none;height:0;width:22px;border-radius:0` : `background:${color}`}"></i>${label}</span>`).join('')}</div>`;
  const insight = text => `<p class="an-insight"><b>Insight</b> ${text}</p>`;
  const card = (title, sub, body, foot) => `<div class="card"><div><h3 style="margin:0">${title}</h3><p class="muted" style="margin:2px 0 0;font-size:12.5px">${sub}</p></div>${body}${foot}</div>`;

  function rateBars(groups, avg){
    return `<div class="an-hb-wrap">${groups.map(g => `<div class="an-hb"><span title="${esc(g.label)}">${esc(g.label)}</span>
      <span class="t"><i style="width:${g.rate}%;background:${g.rate >= avg ? 'var(--ok)' : 'var(--warn)'}"></i><em style="left:${avg}%"></em></span>
      <span class="right"><b>${Math.round(g.rate)}%</b> <small class="muted">${g.ok}/${g.n}</small></span></div>`).join('')}</div>`;
  }
  function groupBy(rows, key){
    const m = {};
    rows.forEach(t => { const k = key(t), g = m[k] = m[k] || { label: k, n: 0, ok: 0, gmv: 0 }; g.n++; if (ok(t)) { g.ok++; g.gmv += t.amount; } });
    return Object.values(m).map(g => ({ ...g, rate: pct(g.ok, g.n) })).sort((a, b) => b.n - a.n);
  }
  const deltaHtml = (cur, prev, prevN, { pts = false, invert = false, fmt } = {}) => {
    if (!an.compare) return '';
    if (!prevN) return `<span class="d muted">No data in previous period</span>`;
    if (!pts && !prev) return `<span class="d muted">Previous: ${fmt(prev)}</span>`;
    const d = pts ? cur - prev : (cur - prev) / prev * 100, good = invert ? d < 0 : d > 0;
    if (Math.abs(d) < 0.05) return `<span class="d muted">No change vs previous (${fmt(prev)})</span>`;
    return `<span class="d ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}${pts ? ' pts' : '%'}</span> <span class="d muted">vs ${fmt(prev)} previous</span>`;
  };

  /* ---------- page ---------- */
  function view(){
    const w = windows(), rows = within(D(), w.from, w.to), prev = within(D(), w.prevFrom, w.prevTo - 1);
    const m = metrics(rows), pm = metrics(prev);
    const toolbar = `<div class="toolbar">
      <div class="dd"><button class="btn" data-andd="range"><i data-icon=calendar class=li></i> ${rangeLabel()} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="andd-range">${AN_RANGES.map(([k, l]) => `<button data-anrange="${k}" class="${k === an.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <label class="chip an-toggle"><input type="checkbox" id="ancmp" ${an.compare ? 'checked' : ''}> Compare to previous period</label>
      <span class="muted" style="font-size:12.5px">${fmtDate(new Date(w.from))} – ${fmtDate(new Date(w.to))}${an.compare ? ` · previous: ${fmtDate(new Date(w.prevFrom))} – ${fmtDate(new Date(w.prevTo))}` : ''}</span>
      <span style="flex:1"></span>
      <button class="btn" id="andl" ${rows.length ? '' : 'disabled'}><i data-icon=download class=li></i> Download daily CSV</button></div>`;
    const header = head('Payment analytics', 'Where payments succeed, where they fail, and when customers pay.', `<a class="btn" href="#/transactions"><i data-icon=arrow-left-right class=li></i> View transactions</a>`);
    if (!rows.length) {
      return header + toolbar + `<div class="card"><div class="empty-state"><div class="box">📈</div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO PAYMENTS IN THIS PERIOD</p>
        <h3 style="margin:4px 0 6px;font-size:20px">Nothing to analyse yet</h3><p class="muted" style="margin:0 0 12px">${isLive() ? 'Live payments will appear here as soon as customers start paying.' : 'Pick a wider date range to see payment trends.'}</p>
        <div class="row" style="gap:8px">${an.range !== '30d' ? '<button class="btn sm" id="an30">Show last 30 days</button>' : ''}${isLive() ? '<button class="btn sm" id="antest">View test-mode analytics</button><a class="btn sm" href="#/links">Create a payment link</a>' : ''}</div></div></div></div>`;
    }

    const kpi = (label, value, delta, sub) => `<div class="card kpi"><small>${label}</small><b>${value}</b><div>${delta}</div><span class="d muted">${sub}</span></div>`;
    const kpis = `<div class="grid g4 kpis">
      ${kpi('Gross volume (GMV)', inr(m.gmv), deltaHtml(m.gmv, pm.gmv, pm.n, { fmt: inr }), `${m.ok} successful payments`)}
      ${kpi('Success rate', m.rate.toFixed(1) + '%', deltaHtml(m.rate, pm.rate, pm.n, { pts: true, fmt: v => v.toFixed(1) + '%' }), `${m.ok} of ${m.n} attempts`)}
      ${kpi('Average ticket', inr(m.avg), deltaHtml(m.avg, pm.avg, pm.n, { fmt: inr }), 'per successful payment')}
      ${kpi('Failed volume', inr(m.failAmt), deltaHtml(m.failAmt, pm.failAmt, pm.n, { invert: true, fmt: inr }), `${m.failN} failed · ${m.pending} pending`)}</div>`;

    // Trend: success rate per bucket, with the previous period overlaid by position.
    const bs = buckets(w), shift = w.from - w.prevFrom;
    const cur = bs.map(b => { const r = within(rows, b.from, b.to); return r.length ? pct(r.filter(ok).length, r.length) : null; });
    const prv = bs.map(b => { const r = within(prev, b.from - shift, b.to - shift); return r.length ? pct(r.filter(ok).length, r.length) : null; });
    const labels = bs.map(b => b.label);
    const curVals = cur.filter(v => v != null), lowI = cur.indexOf(Math.min(...curVals)), highI = cur.indexOf(Math.max(...curVals));
    const trend = card('Success rate trend', `Successful ÷ all attempts, per ${an.range === 'today' ? '3-hour block' : 'day'}${an.compare ? '; previous period overlaid' : ''}`,
      lineChart(labels, [...(an.compare ? [{ name: 'Previous period', color: PREV(), values: prv, dash: true }] : []), { name: rangeLabel(), color: BRAND(), values: cur, labels: true }], { yFmt: v => Math.round(v) + '%' }),
      legend([[rangeLabel(), BRAND()], ...(an.compare ? [['Previous period', PREV(), true]] : [])]) +
      insight(curVals.length > 1 ? `Success rate ranged from <b>${Math.round(cur[lowI])}%</b> on ${labels[lowI]} to <b>${Math.round(cur[highI])}%</b> on ${labels[highI]}; the period average is ${m.rate.toFixed(1)}%.` : `Success rate is ${m.rate.toFixed(1)}% across ${m.n} attempts.`));

    // Funnel: initiated → authenticated (customer completed bank/OTP step) → success.
    const authed = rows.filter(t => t.status !== 'USER_CANCELLED' && t.error !== 'Authentication failed');
    const steps = [['Initiated', rows.length, 'checkout opened, payment attempted'], ['Authenticated', authed.length, 'OTP / PIN / bank login passed'], ['Successful', m.ok, 'money captured']];
    const funnel = card('Conversion funnel', 'Attempts reaching each stage', `<div class="an-funnel">${steps.map(([l, n, d], i) => `<div>
        <div class="between"><span><b>${l}</b> <span class="muted" style="font-size:12px">${d}</span></span><span><b>${n}</b> <span class="muted">· ${Math.round(pct(n, rows.length))}%</span></span></div>
        <div class="an-fbar"><i style="width:${pct(n, rows.length)}%;opacity:${1 - i * .25}"></i></div>
        ${i ? `<div class="muted an-drop">↳ ${steps[i - 1][1] - n} dropped (${Math.round(100 - pct(n, steps[i - 1][1]))}% of ${steps[i - 1][0].toLowerCase()})</div>` : ''}</div>`).join('')}</div>`,
      legend([['Share of initiated attempts', 'var(--ink-2)']]) +
      insight(steps[0][1] - steps[1][1] > steps[1][1] - steps[2][1] ? `Most losses happen <b>before authentication</b> (${steps[0][1] - steps[1][1]} attempts) — check OTP delivery and bank redirects.` : `Most losses happen <b>after authentication</b> (${steps[1][1] - steps[2][1]} attempts) — bank declines, low balance, timeouts and pending payments.`));

    // Volume by mode, stacked per bucket.
    const stacks = bs.map(b => { const o = {}; within(rows, b.from, b.to).filter(ok).forEach(t => o[t.mode] = (o[t.mode] || 0) + t.amount); return o; });
    const MC = modeColors(), byMode = groupBy(rows, t => t.mode), topVol = [...byMode].sort((a, b) => b.gmv - a.gmv)[0];
    const presentModes = MODE_ORDER.filter(k => byMode.some(g => g.label === k));
    const volume = card('Volume by payment mode', 'Successful payment value, stacked by mode', stackedBars(labels, stacks, presentModes, MC),
      legend(presentModes.map(k => [k, MC[k]])) + insight(`<b>${topVol.label}</b> brought in ${inr(topVol.gmv)}, ${Math.round(pct(topVol.gmv, m.gmv))}% of successful volume.`));

    // Hour-of-day heatmap of attempts (weekday × hour).
    const grid = WEEKDAYS.map(() => Array(24).fill(0));
    rows.forEach(t => grid[(t.date.getDay() + 6) % 7][t.date.getHours()]++);
    const hmax = Math.max(1, ...grid.flat()), hourTot = Array.from({ length: 24 }, (_, h) => grid.reduce((a, r) => a + r[h], 0));
    const win = h => hourTot[h % 24] + hourTot[(h + 1) % 24] + hourTot[(h + 2) % 24];
    let bestH = 0; for (let h = 1; h < 24; h++) if (win(h) > win(bestH)) bestH = h;
    const hh = h => String(h % 24).padStart(2, '0') + ':00';
    const heat = card('When customers pay', 'Payment attempts by weekday and hour of day', `<div class="an-heat">
        <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="an-hl">${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>`).join('')}
        ${WEEKDAYS.map((d, r) => `<span class="an-hd">${d}</span>${grid[r].map((v, h) => `<span class="an-hc" style="background:${v ? `color-mix(in srgb, var(--brand) ${Math.round(35 + 65 * v / hmax)}%, var(--card))` : 'var(--soft)'};color:${v / hmax >= .6 ? 'var(--card)' : 'var(--ink)'}" title="${d} ${hh(h)}–${hh(h + 1)}: ${v} attempt${v === 1 ? '' : 's'}">${v || ''}</span>`).join('')}`).join('')}</div>`,
      `<div class="an-legend"><span>Fewer</span><span class="an-grad"></span><span>More (max ${hmax} in one hour)</span><span class="muted">· local time, hour of day across the top</span></div>` +
      insight(`The busiest 3-hour window is <b>${hh(bestH)}–${hh(bestH + 3)}</b> with ${win(bestH)} attempts (${Math.round(pct(win(bestH), rows.length))}% of the period) — schedule maintenance and campaigns around it.`));

    // Success by mode / bank, failure reasons.
    const best = [...byMode].sort((a, b) => b.rate - a.rate)[0], worst = [...byMode].sort((a, b) => a.rate - b.rate)[0];
    const modeCard = card('Success rate by payment mode', 'Bar = success rate · marker = period average', rateBars(byMode, m.rate),
      legend([['At or above average', 'var(--ok)'], ['Below average', 'var(--warn)'], [`Average ${Math.round(m.rate)}%`, 'var(--ink)']]) +
      insight(best.rate === worst.rate ? `Every mode converts at ${Math.round(best.rate)}%.` : `<b>${worst.label}</b> success is ${Math.round(best.rate - worst.rate)} pts below ${best.label} (${Math.round(worst.rate)}% vs ${Math.round(best.rate)}%).`));
    const byBank = groupBy(rows, t => t.bank === '—' ? 'UPI apps (VPA)' : `${t.bank} (${t.mode})`), wb = [...byBank].sort((a, b) => a.rate - b.rate)[0];
    const bankCard = card('Success rate by bank / issuer', 'Issuing bank, wallet or UPI app', rateBars(byBank, m.rate),
      legend([['At or above average', 'var(--ok)'], ['Below average', 'var(--warn)'], [`Average ${Math.round(m.rate)}%`, 'var(--ink)']]) +
      insight(wb.rate < m.rate ? `<b>${wb.label}</b> is the weakest issuer at ${Math.round(wb.rate)}% — ${wb.n - wb.ok} of ${wb.n} attempts did not succeed.` : 'Every issuer is at or above the period average.'));
    const failed = rows.filter(t => t.status === 'FAILURE' || t.status === 'USER_CANCELLED'), fr = {};
    failed.forEach(t => fr[failReason(t)] = (fr[failReason(t)] || 0) + 1);
    const frl = Object.entries(fr).sort((a, b) => b[1] - a[1]);
    const failCard = card('Top failure reasons', `${failed.length} failed or cancelled attempts · pending excluded`, frl.length ? `<div class="an-hb-wrap">${frl.map(([r, n]) => `<div class="an-hb"><span title="${esc(r)}">${esc(r)}</span><span class="t"><i style="width:${pct(n, failed.length)}%;background:var(--bad)"></i></span><span class="right"><b>${Math.round(pct(n, failed.length))}%</b> <small class="muted">${n}</small></span></div>`).join('')}</div>` : '<p class="muted" style="margin:6px 0 auto">No failed payments in this period.</p>',
      legend([['Share of failed attempts', 'var(--bad)']]) +
      insight(frl.length ? `<b>${frl[0][0]}</b> causes ${Math.round(pct(frl[0][1], failed.length))}% of failures${/insufficient|declined/i.test(frl[0][0]) ? ' — offer UPI or EMI as a fallback at checkout' : /time|auth/i.test(frl[0][0]) ? ' — check OTP delivery and bank redirect latency' : ''}.` : 'Keep an eye on this after big campaigns.'));

    return header + toolbar + kpis +
      `<div class="grid g-21 an-row">${trend}${funnel}</div>
       <div class="grid g2 an-row">${volume}${heat}</div>
       <div class="grid g3 an-row">${modeCard}${bankCard}${failCard}</div>
       <p class="muted" style="font-size:12.5px;margin:4px 0 0">Same definitions as Transactions: GMV counts successful payments only; success rate = successful ÷ all attempts (pending included).</p>`;
  }

  function downloadCsv(){
    const w = windows(), rows = within(D(), w.from, w.to);
    const days = []; for (let d = sod(w.from).getTime(); d <= w.to; d += DAY) days.push(d);
    const csv = 'date,attempts,successful,success_rate_pct,gmv_inr,avg_ticket_inr,failed,failed_amount_inr,pending\n' + days.map(d => {
      const x = metrics(within(rows, d, d + DAY - 1));
      return [new Date(d).toLocaleDateString('en-CA'), x.n, x.ok, x.rate.toFixed(1), (x.gmv / 100).toFixed(2), (x.avg / 100).toFixed(2), x.failN, (x.failAmt / 100).toFixed(2), x.pending].join(',');
    }).join('\n') + '\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `bizpolepay-analytics-daily-${an.range}.csv`; a.click();
    toast(`Downloaded ${days.length} days of ${rangeLabel().toLowerCase()}`);
  }

  addStyle('analytics', `
    .an-row{margin-bottom:14px}
    .an-row>.card{gap:12px}
    .an-svg{width:100%;height:auto;display:block;margin-top:auto}
    .an-ax{font:11px "Instrument Sans",sans-serif;fill:var(--muted)}
    .an-val{font:600 11px "Instrument Sans",sans-serif;fill:var(--ink-2)}
    .an-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--ink-2);align-items:center}
    .an-legend i{display:inline-block;width:14px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
    .an-grad{width:120px;height:10px;border-radius:3px;background:linear-gradient(90deg,color-mix(in srgb,var(--brand) 30%,var(--card)),var(--brand))}
    .an-insight{margin:0;padding:9px 12px;border-radius:9px;background:var(--brand-soft);font-size:13px;color:var(--ink-2)}
    .an-insight>b:first-child{color:var(--brand);margin-right:4px}
    .an-toggle{gap:8px;padding:8px 12px;font-size:13px;font-weight:600;margin:0}
    .an-toggle input{width:auto;margin:0}
    .an-hb-wrap{display:flex;flex-direction:column;gap:6px;margin:4px 0 auto}
    .an-hb{display:grid;grid-template-columns:minmax(90px,150px) 1fr 80px;gap:10px;align-items:center;font-size:13px}
    .an-hb>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .an-hb .t{position:relative;height:10px;background:var(--soft);border-radius:9px}
    .an-hb .t i{display:block;height:100%;border-radius:9px}
    .an-hb .t em{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink);opacity:.55}
    .an-funnel{display:flex;flex-direction:column;gap:14px;margin:6px 0 auto}
    .an-fbar{height:30px;background:var(--soft);border-radius:8px;overflow:hidden;margin-top:6px}
    .an-fbar i{display:block;height:100%;background:var(--ink-2);border-radius:8px}
    .an-drop{font-size:12.5px;margin-top:4px}
    .an-heat{display:grid;grid-template-columns:34px repeat(24,1fr);gap:3px;margin:6px 0 auto;font-size:11px}
    .an-hl{color:var(--muted)}
    .an-hd{color:var(--muted);align-self:center}
    .an-hc{height:36px;border-radius:4px;display:grid;place-items:center;font-weight:600;min-width:0}
    @media (max-width:820px){ .an-heat{grid-template-columns:26px repeat(24,1fr);gap:1px;font-size:8px} .an-hc{border-radius:2px;font-size:0;height:14px} .an-hb{grid-template-columns:90px 1fr 72px} .an-legend .muted{display:none} }
  `);

  PAGES.analytics = () => liveLocked() ? head('Payment analytics') + locked('Payment analytics') : view();
  BIND.analytics = () => {
    if (liveLocked()) return;
    const redraw = () => route();
    document.querySelectorAll('[data-andd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#andd-' + b.dataset.andd), open = m.classList.contains('open'); document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')); if (!open) m.classList.add('open'); });
    document.querySelectorAll('[data-anrange]').forEach(b => b.onclick = () => { an.range = b.dataset.anrange; redraw(); });
    const c = $('#ancmp'); if (c) c.onchange = () => { an.compare = c.checked; redraw(); };
    const dl = $('#andl'); if (dl) dl.onclick = downloadCsv;
    const a30 = $('#an30'); if (a30) a30.onclick = () => { an.range = '30d'; redraw(); };
    const at = $('#antest'); if (at) at.onclick = () => { state.mode = 'test'; route(); toast('Switched to test mode'); };
  };
  document.addEventListener('click', () => document.querySelectorAll('[id^="andd-"].open').forEach(m => m.classList.remove('open')));
})();

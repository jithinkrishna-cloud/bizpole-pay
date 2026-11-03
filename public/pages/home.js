// Page: home (Business summary). Uses globals from app.html core (state, data, helpers, PAGES, BIND).
(() => {
  const PH = { rocket: 'rocket-launch', coins: 'coins', swap: 'arrows-left-right', undo: 'arrow-counter-clockwise', badge: 'seal-check', chart: 'chart-line-up', box: 'chart-donut',
    pulse: 'heartbeat', layers: 'stack', bolt: 'lightning', page: 'browser', code: 'code', plug: 'plugs-connected' };
  const ic = (name, size = 22) => `<i class="ph-duotone ph-${PH[name]}" style="font-size:${size}px;line-height:1" aria-hidden="true"></i>`;
  const DONUT = { 'UPI': '#F1C64B', 'EMI': '#E65F55', 'Debit Card': '#F2A39C', 'Wallet': '#B9B4AD', 'Net Banking': '#343138', 'Credit Card': '#E3E0D9' };
  const short = p => p >= 1e7 ? '₹' + (p / 1e7).toFixed(1) + 'L' : p >= 1e5 ? '₹' + (p / 1e5).toFixed(1) + 'k' : p ? inr(p) : '₹0';

  const DAY = 864e5;
  const RANGES = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']];
  const hm = { range: '7d', tab: 'a' };
  // Per mode, from GET /gateway-health: { checkedAt, active: [], past: [], methods: [{mode, enabled}] }.
  const health = { test: null, live: null };
  LOAD.home = async (mode) => { health[mode] = await api('/gateway-health', { mode }); };
  // Payment modes shown on the card (labels match server/shape.js).
  const PAY_MODES = [['UPI', 'UPI'], ['Credit Card', 'Credit card'], ['Debit Card', 'Debit card'], ['Net Banking', 'Net banking'], ['Wallet', 'Wallets'], ['EMI', 'EMI']];

  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  // Calendar days in the selected range (ending today) and the equally long window right before it.
  function win(){
    const today = sod(now).getTime();
    const n = hm.range === '7d' ? 7 : hm.range === '30d' ? 30 : now.getDate();
    const from = today - (n - 1) * DAY, to = now.getTime() + 1;
    return { n, from, to, prevFrom: from - n * DAY, prevTo: from, days: Array.from({ length: n }, (_, i) => from + i * DAY) };
  }
  const inWin = (x, a, b) => x.date.getTime() >= a && x.date.getTime() < b;
  // Change vs the previous window (same length), or null when there is nothing to compare with.
  const delta = (cur, prev) => prev ? (cur - prev) / prev * 100 : null;
  const deltaBadge = (v, invert = false) => {
    if (v === null || !isFinite(v)) return '';
    const up = v >= 0, good = invert ? !up : up;
    return `<span class="hm-delta ${good ? 'good' : 'bad'}" title="vs previous ${win().n} days">${up ? '↑' : '↓'} ${up ? '+' : ''}${v.toFixed(1)}%</span>`;
  };
  const niceStep = raw => { if (raw <= 100) return 100; const mag = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].find(c => c * mag >= raw) * mag; };

  function healthBody(){
    const h = health[state.mode];
    if (!h) return `<p class="muted" style="margin:6px 0">Gateway status could not be loaded. Use Refresh to try again.</p>`;
    const asOf = `As of ${fmtDate(new Date(h.checkedAt))}`;
    const item = d => `<div><span><span class="dot ${d.severity === 'down' ? 'bad' : 'warn'}"></span><b>${esc(d.mode)}${d.bank ? ' · ' + esc(d.bank) : ''}</b>
      <small class="muted" style="display:block">${d.severity === 'down' ? 'Down' : 'Degraded'} · ${fmtDate(new Date(d.startedAt))}${d.endedAt ? '–' + fmtDate(new Date(d.endedAt)) : ' – ongoing'}${d.message ? ' · ' + esc(d.message) : ''}</small></span>
      <span class="pill ${d.endedAt ? '' : d.severity === 'down' ? 'bad' : 'warn'}">${d.endedAt ? 'Resolved' : d.severity === 'down' ? 'Down' : 'Degraded'}</span></div>`;
    if (hm.tab === 'a') return h.active.length ? `<div class="hm-list">${h.active.map(item).join('')}</div><p class="muted" style="font-size:12.5px;margin:8px 0 0">${asOf}</p>`
      : `<div class="hm-ok"><div><b><span class="dot"></span>No active downtime reported</b><span class="muted">${asOf}</span></div><span class="hm-ck"><i class="ph-bold ph-check" aria-hidden="true"></i></span></div>`;
    return h.past.length ? `<div class="hm-list">${h.past.map(item).join('')}</div>` : `<p class="muted" style="margin:6px 0">No downtime reported in the last 7 days.</p>`;
  }
  function modeStatus(mode){
    if (liveLocked()) return '<a class="pill" href="#/onboarding">Activate</a>';
    const m = ((health[state.mode] || {}).methods || []).find(x => x.mode === mode);
    if (m) return m.enabled ? '<span class="pill ok">Active</span>' : '<span class="pill">Off</span>';
    return D().some(t => t.mode === mode && t.status === 'SUCCESS') ? '<span class="pill ok">In use</span>' : '<span class="pill">Not set up</span>';
  }

  PAGES.home = () => {
    const w = win(), all = D();
    const t = all.filter(x => inWin(x, w.from, w.to)), tPrev = all.filter(x => inWin(x, w.prevFrom, w.prevTo));
    const ok = t.filter(x => x.status === 'SUCCESS'), okPrev = tPrev.filter(x => x.status === 'SUCCESS');
    const sumOf = a => a.reduce((s, x) => s + x.amount, 0);
    const sum = sumOf(ok), sr = t.length ? Math.round(ok.length / t.length * 100) : 0;
    const srDelta = t.length && tPrev.length ? (ok.length / t.length - okPrev.length / tPrev.length) * 100 : null;
    const rfAll = refunds[state.mode], rfDone = rfAll.filter(r => r.status === 'SUCCESS');
    const rfCur = rfDone.filter(r => inWin(r, w.from, w.to)), rfPrev = rfDone.filter(r => inWin(r, w.prevFrom, w.prevTo));
    const rfOpen = rfAll.filter(r => ['REQUESTED', 'QUEUED', 'IN_PROGRESS'].includes(r.status)).length;
    const stAll = settlements[state.mode].filter(s => s.status === 'PROCESSED');
    const stCurL = stAll.filter(s => inWin(s, w.from, w.to)), stPrevL = stAll.filter(s => inWin(s, w.prevFrom, w.prevTo));
    const netOf = a => a.reduce((s, x) => s + x.net, 0);
    const rangeLabel = RANGES.find(r => r[0] === hm.range)[1].toLowerCase();

    const byMode = {}; ok.forEach(x => byMode[x.mode] = (byMode[x.mode] || 0) + x.amount);
    const modes = Object.entries(byMode).sort((a, b) => b[1] - a[1]);
    const days = w.days.map(d => { const dt = new Date(d); return { l: w.n <= 7 ? dt.toLocaleDateString('en-IN', { weekday: 'short' }) : String(dt.getDate()), full: dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), v: sumOf(ok.filter(x => x.date.getTime() >= d && x.date.getTime() < d + DAY)) }; });
    const peak = Math.max(0, ...days.map(d => d.v));
    const step = niceStep(peak / 4), top = step * 4, showVals = days.length <= 10, labelEvery = days.length <= 10 ? 1 : 5;
    const done = Object.values(state.onboarding).filter(v => v === 'done').length, pct = done * 20;

    // donut segments
    const R = 70, C = 2 * Math.PI * R; let off = 0;
    const segs = modes.map(([m, v]) => { const len = v / sum * C, s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${DONUT[m] || '#8A858F'}" stroke-width="26" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('');

    return `<div class="hm-hero"><div><h1>Hi ${esc((state.user.name || '').split(' ')[0])} <span aria-hidden="true">👋</span></h1>
        <p class="muted">${isLive() ? 'Your live business at a glance.' : 'Welcome to your test account. Try payments with test cards and UPI.'}</p></div>
        <label class="hm-range"><i class="ph-duotone ph-calendar-blank" style="font-size:18px" aria-hidden="true"></i><select id="hmrange" aria-label="Date range">${RANGES.map(([k, l]) => `<option value="${k}" ${k === hm.range ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${done < 5 ? `<div class="hm-onb"><div class="hm-ico y">${ic('rocket', 26)}</div><div class="t"><b>Complete onboarding to accept live payments</b><span class="muted">You've completed ${pct}% · ${5 - done} steps left</span></div>
        <div class="p"><span class="bar"><i style="width:${pct}%"></i></span><b>${pct}%</b></div><a class="btn primary" href="#/onboarding">Resume onboarding →</a></div>` : ''}
      <div class="grid g4 hm-kpis">
        <div class="card"><div class="hm-ico c">${ic('coins')}</div><div><small>Total collected</small><b>${inr(sum)}</b><span>${ok.length} successful · ${rangeLabel}</span></div>${deltaBadge(delta(sum, sumOf(okPrev)))}</div>
        <div class="card"><div class="hm-ico o">${ic('swap')}</div><div><small>Settled</small><b>${inr(netOf(stCurL))}</b><span>${stCurL.length} settlement${stCurL.length === 1 ? '' : 's'} · ${rangeLabel}</span></div>${deltaBadge(delta(netOf(stCurL), netOf(stPrevL)))}</div>
        <div class="card"><div class="hm-ico y">${ic('undo')}</div><div><small>Refunded</small><b>${inr(sumOf(rfCur))}</b><span>${rfCur.length} processed · ${rfOpen} in progress</span></div>${deltaBadge(delta(sumOf(rfCur), sumOf(rfPrev)), true)}</div>
        <div class="card"><div class="hm-ico g">${ic('badge')}</div><div><small>Success rate</small><b>${t.length ? sr + '%' : '—'}</b><span>${t.length} attempt${t.length === 1 ? '' : 's'} · ${rangeLabel}</span></div>${srDelta === null ? '' : `<span class="hm-delta ${srDelta >= 0 ? 'good' : 'bad'}">${srDelta >= 0 ? '↑ +' : '↓ '}${srDelta.toFixed(1)} pts</span>`}</div>
      </div>
      <div class="grid g-21" style="margin-bottom:16px">
        <div class="card"><div class="between hm-h"><h3><span class="hm-hi">${ic('chart')}</span>Successful transactions trend</h3><span class="chip">Avg ticket&nbsp;<b>${inr(ok.length ? Math.round(sum / ok.length) : 0)}</b></span></div>
          ${ok.length ? `<div class="hm-chart"><div class="ax">${[4, 3, 2, 1, 0].map(k => `<span style="bottom:${k * 25}%">${k ? short(k * step) : '₹0'}</span>`).join('')}</div>
            <div class="plot ${showVals ? '' : 'dense'}">${[4, 3, 2, 1].map(k => `<i class="gl" style="bottom:${k * 25}%"></i>`).join('')}
            ${days.map(d => `<div class="col">${showVals ? `<span class="bv">${short(d.v)}</span>` : ''}<i class="${d.v === peak && peak ? 'pk' : ''}" style="height:${Math.max(1.5, d.v / top * 100)}%" title="${d.full}: ${inr(d.v)}"></i></div>`).join('')}</div>
            <div class="xl ${showVals ? '' : 'dense'}">${days.map((d, i) => `<span>${i % labelEvery === 0 || i === days.length - 1 ? d.l : ''}</span>`).join('')}</div></div>`
            : `<div class="empty-state" style="flex:1"><div class="box"><i data-icon=chart-column class=li></i></div><div><h3 style="margin:0 0 6px;font-size:18px">No successful payments ${rangeLabel}</h3><p class="muted" style="margin:0 0 12px">${all.length ? 'Pick a longer range to see earlier payments.' : `Your ${isLive() ? 'live' : 'test'} payments will be charted here day by day.`}</p><div class="row" style="gap:8px"><a class="btn sm primary" href="#/links">Create a payment link</a><a class="btn sm" href="#/transactions">View transactions</a></div></div></div>`}</div>
        <div class="card"><div class="hm-h"><h3><span class="hm-hi">${ic('box')}</span>Split by payment mode</h3></div>
          ${modes.length ? `<div class="hm-donut"><div class="d"><svg viewBox="0 0 180 180" width="180" height="180" style="transform:rotate(-90deg)">${segs}</svg>
              <div class="c"><b>₹${Math.round(sum / 100).toLocaleString('en-IN')}</b><span>Total collected</span></div></div>
            <ul>${modes.map(([m, v]) => `<li><i style="background:${DONUT[m] || '#8A858F'}"></i><span>${esc(m)}</span><b>${Math.round(v / sum * 100)}%</b></li>`).join('')}</ul></div>` : `<p class="muted" style="margin:auto 0">No successful payments ${rangeLabel}. The split appears once customers pay.</p>`}</div>
      </div>
      <div class="grid g3">
        <div class="card"><div class="between hm-h"><h3><span class="hm-hi">${ic('pulse')}</span>Gateway health</h3><button class="btn sm" id="hr"><i data-icon=refresh-cw class=li></i> Refresh</button></div>
          <div class="tabs" style="margin-bottom:12px"><button class="${hm.tab === 'a' ? 'on' : ''}" data-h="a">Active downtime</button><button class="${hm.tab === 'p' ? 'on' : ''}" data-h="p">Past downtime</button></div>
          <div id="hbody">${healthBody()}</div></div>
        <div class="card"><div class="hm-h"><h3><span class="hm-hi">${ic('layers')}</span>Payment modes</h3></div>
          <div class="hm-list">${PAY_MODES.map(([k, l]) => `<div><span>${l}</span>${modeStatus(k)}</div>`).join('')}</div>
          <p class="muted" style="font-size:12.5px;margin:10px 0 0">Payment modes are enabled on your PayU account. <a class="linkish" href="#/products">See products</a></p></div>
        <div class="card"><div class="hm-h"><h3><span class="hm-hi">${ic('bolt')}</span>Go live your way</h3></div>
          <div class="hm-go">
            <a href="#/checkout"><span class="hm-ico c sm">${ic('page', 18)}</span><span><b>Hosted checkout</b> <span class="pill brand">1–2 days</span><small>Redirect to our prebuilt payment page.</small></span><em><i data-icon=chevron-right class=li></i></em></a>
            <a href="#/developer"><span class="hm-ico c sm">${ic('code', 18)}</span><span><b>Custom checkout</b> <span class="pill brand">2–3 days</span><small>Build your own UI on our APIs.</small></span><em><i data-icon=chevron-right class=li></i></em></a>
            <a href="#/products"><span class="hm-ico c sm">${ic('plug', 18)}</span><span><b>Plugins</b> <span class="pill brand">Minutes</span><small>Shopify, WooCommerce and more.</small></span><em><i data-icon=chevron-right class=li></i></em></a>
          </div></div>
      </div>`;
  };

  BIND.home = () => {
    $('#hmrange').onchange = e => { hm.range = e.target.value; route(); };
    $('#hr').onclick = async () => {
      const b = $('#hr'); b.disabled = true;
      const mode = state.mode;
      try { health[mode] = await api('/gateway-health', { mode }); toast('Gateway status refreshed'); } catch (e) { apiFail(e); }
      b.disabled = false;
      const hb = $('#hbody'); if (hb && mode === state.mode) hb.innerHTML = healthBody();
    };
    document.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      hm.tab = b.dataset.h;
      document.querySelectorAll('[data-h]').forEach(x => x.classList.toggle('on', x === b));
      $('#hbody').innerHTML = healthBody();
    });
  };

  addStyle('home', `
    .hm-hero{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}
    .hm-hero h1{margin:0;font-size:30px;letter-spacing:-.02em}.hm-hero p{margin:4px 0 0}
    .hm-range{display:flex;align-items:center;gap:6px;margin:0!important;background:var(--card);border:1.5px solid var(--line);border-radius:12px;padding:0 4px 0 14px;box-shadow:0 4px 14px -10px rgba(33,31,36,.3)}
    .hm-range select{border:0;background:transparent;font-weight:600;padding:11px 10px}
    .hm-onb{position:relative;z-index:1;display:flex;align-items:center;gap:18px;padding:16px 20px;margin-bottom:18px;border-radius:16px;background:linear-gradient(90deg,var(--accent-soft),#FDF7E8);border:1px solid #F3E4B8;flex-wrap:wrap}
    .hm-onb .t{flex:1;min-width:220px}.hm-onb .t b{display:block;font-size:18px;margin-bottom:2px}
    .hm-onb .p{display:flex;align-items:center;gap:12px;min-width:240px}.hm-onb .p b{font-size:15px}
    .hm-onb .bar{flex:1;width:240px;height:10px;border-radius:9px;background:#E9E5DD;overflow:hidden}.hm-onb .bar i{display:block;height:100%;background:var(--accent);border-radius:9px}
    .hm-onb .btn{padding:12px 20px}
    .hm-ico{width:48px;height:48px;flex:none;border-radius:13px;display:grid;place-items:center}
    .hm-ico.sm{width:40px;height:40px;border-radius:11px}
    .hm-ico.c{background:var(--brand-soft);color:var(--brand)}.hm-ico.o{background:#FDEBDD;color:#E2793E}
    .hm-ico.y{background:var(--accent-soft);color:#C9971B}.hm-ico.g{background:var(--ok-soft);color:var(--ok)}
    .hm-onb .hm-ico{width:56px;height:56px;border-radius:15px;background:#FBE9B5;color:#B9851A}
    .hm-kpis{margin-bottom:16px}
    .hm-kpis .card{flex-direction:row!important;align-items:flex-start;gap:14px;padding:18px;position:relative}
    .hm-kpis small{color:var(--ink-2);font-size:13.5px}.hm-kpis b{display:block;font-size:26px;letter-spacing:-.02em;margin:2px 0}
    .hm-kpis span:not(.hm-delta){color:var(--muted);font-size:13px}
    .hm-delta{position:absolute;top:16px;right:16px;font-size:12px;font-weight:700;padding:3px 8px;border-radius:999px}
    .hm-delta.good{background:var(--ok-soft);color:var(--ok)}.hm-delta.bad{background:var(--bad-soft);color:var(--bad)}
    .hm-h h3{display:flex;align-items:center;gap:10px;font-size:18px;margin:0 0 14px}
    .hm-hi{color:var(--brand);display:inline-grid}
    .hm-h .chip{background:var(--soft);border-color:transparent;font-size:13px;padding:6px 12px;cursor:default}
    .hm-chart{display:grid;grid-template-columns:44px 1fr;grid-template-rows:1fr auto;flex:1;min-height:220px;gap:6px 8px}
    .hm-chart .ax{position:relative;margin-top:22px;font-size:12px;color:var(--muted);text-align:right}.hm-chart .ax span{position:absolute;right:0;transform:translateY(50%)}
    .hm-chart .plot{position:relative;display:flex;align-items:flex-end;gap:10px;border-left:1px solid var(--line);border-bottom:1px solid var(--line);padding:0 8px;margin-top:22px}
    .hm-chart .gl{position:absolute;left:0;right:0;border-top:1px dashed #E6E2DB}
    .hm-chart .col{position:relative;flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
    .hm-chart .col i{width:100%;background:linear-gradient(180deg,#3B3740,var(--ink));border-radius:8px 8px 2px 2px;position:relative}
    .hm-chart .col i.pk{background:linear-gradient(180deg,#F6D267,var(--accent))}
    .hm-chart .bv{font-size:12.5px;font-weight:700;margin-bottom:4px;color:var(--ink)}
    .hm-chart .xl{grid-column:2;display:flex;gap:10px;padding:0 8px}.hm-chart .xl span{flex:1;text-align:center;font-size:13px;color:var(--ink-2)}
    .hm-chart .plot.dense,.hm-chart .xl.dense{gap:3px}.hm-chart .xl.dense span{font-size:11px}
    .hm-donut{display:flex;align-items:center;gap:26px;flex:1;flex-wrap:wrap;justify-content:center}
    .hm-donut .d{position:relative;width:180px;height:180px}
    .hm-donut .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .hm-donut .c b{font-size:20px}.hm-donut .c span{font-size:12.5px;color:var(--muted)}
    .hm-donut ul{list-style:none;margin:0;padding:0;flex:1;min-width:200px}
    .hm-donut li{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #EFECE6;font-size:14px}
    .hm-donut li:last-child{border-bottom:0}.hm-donut li i{width:12px;height:12px;border-radius:50%;flex:none}.hm-donut li span{flex:1}
    .hm-ok{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0}
    .hm-ok b{display:flex;align-items:center;gap:8px}.hm-ok b .dot{margin:0}.hm-ok .muted{display:block;font-size:13px;margin:4px 0 0 14px}
    .hm-ok .hm-ck{flex:none;width:44px;height:44px;border-radius:12px;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;font-size:22px;line-height:1}
    .hm-list>div{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #EFECE6}
    .hm-list>div:last-child{border-bottom:0}
    .hm-go a{display:flex;align-items:center;gap:14px;padding:12px 4px;border-bottom:1px solid #EFECE6;border-radius:10px}
    .hm-go a:last-child{border-bottom:0}.hm-go a:hover{background:var(--bg)}
    .hm-go a>span:nth-child(2){flex:1}.hm-go small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
    .hm-go em{font-style:normal;font-size:22px;color:var(--ink-2)}
    @media (max-width:820px){ .hm-onb .p{min-width:0;width:100%} }
  `);
})();

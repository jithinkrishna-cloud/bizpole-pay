// Page: home (Business summary). Uses globals from app.html core (state, data, helpers, PAGES, BIND).
(() => {
  const PH = { rocket: 'rocket-launch', coins: 'coins', swap: 'arrows-left-right', undo: 'arrow-counter-clockwise', badge: 'seal-check', chart: 'chart-line-up', box: 'chart-donut',
    pulse: 'heartbeat', layers: 'stack', bolt: 'lightning', page: 'browser', code: 'code', plug: 'plugs-connected' };
  const ic = (name, size = 22) => `<i class="ph-duotone ph-${PH[name]}" style="font-size:${size}px;line-height:1" aria-hidden="true"></i>`;
  const DONUT = { 'UPI': '#F1C64B', 'EMI': '#E65F55', 'Debit Card': '#F2A39C', 'Wallet': '#B9B4AD', 'Net Banking': '#343138', 'Credit Card': '#E3E0D9' };
  const short = p => p >= 1e7 ? '₹' + (p / 1e7).toFixed(1) + 'L' : p >= 1e5 ? '₹' + (p / 1e5).toFixed(1) + 'k' : p ? inr(p) : '₹0';
  const day = d => d.toDateString();

  // Change vs the previous period, compared as average per day so a partly covered previous window stays fair.
  function delta(cur, prev, prevDays) {
    if (!prevDays || !prev) return null;
    return ((cur / 7) - (prev / prevDays)) / (prev / prevDays) * 100;
  }
  const deltaBadge = (v, invert = false) => {
    if (v === null || !isFinite(v)) return '';
    const up = v >= 0, good = invert ? !up : up;
    return `<span class="hm-delta ${good ? 'good' : 'bad'}">${up ? '↑' : '↓'} ${up ? '+' : ''}${v.toFixed(1)}%</span>`;
  };

  PAGES.home = () => {
    const t = D(), ok = t.filter(x => x.status === 'SUCCESS');
    const weekAgo = now.getTime() - 7 * 864e5, twoWeeks = now.getTime() - 14 * 864e5;
    const cur = ok.filter(x => x.date.getTime() >= weekAgo), prev = ok.filter(x => x.date.getTime() < weekAgo && x.date.getTime() >= twoWeeks);
    const prevDays = prev.length ? Math.ceil((weekAgo - Math.min(...prev.map(x => x.date.getTime()))) / 864e5) : 0;
    const sum = ok.reduce((a, x) => a + x.amount, 0), sr = t.length ? Math.round(ok.length / t.length * 100) : 0;
    const rfAll = refunds[state.mode], rfDone = rfAll.filter(r => r.status === 'SUCCESS'), rf = rfDone.reduce((a, x) => a + x.amount, 0);
    const rfOpen = rfAll.filter(r => ['QUEUED', 'IN_PROGRESS'].includes(r.status)).length;
    const st = settlements[state.mode].filter(s => s.status === 'PROCESSED'), settled = st.reduce((a, s) => a + s.net, 0);
    const stIn = s => s.date.getTime() >= weekAgo, stCurL = st.filter(stIn), stPrevL = st.filter(s => !stIn(s));
    const stCur = stCurL.reduce((a, s) => a + s.net, 0), stPrev = stPrevL.reduce((a, s) => a + s.net, 0), stPrevDays = stPrevL.length;
    const sumOf = a => a.reduce((s, x) => s + x.amount, 0);
    const tCur = t.filter(x => x.date.getTime() >= weekAgo), tPrev = t.filter(x => x.date.getTime() < weekAgo && x.date.getTime() >= twoWeeks);
    const srDelta = tPrev.length ? (cur.length / Math.max(1, tCur.length) - prev.length / tPrev.length) * 100 : null;
    const rfCur = rfDone.filter(r => r.date.getTime() >= weekAgo), rfPrev = rfDone.filter(r => r.date.getTime() < weekAgo);

    const byMode = {}; ok.forEach(x => byMode[x.mode] = (byMode[x.mode] || 0) + x.amount);
    const modes = Object.entries(byMode).sort((a, b) => b[1] - a[1]);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * 864e5); return { l: d.toLocaleDateString('en-IN', { weekday: 'short' }), v: ok.filter(x => day(x.date) === day(d)).reduce((a, x) => a + x.amount, 0) }; });
    const peak = Math.max(...days.map(d => d.v));
    const step = Math.max(1e6, Math.ceil(peak / 4 / 1e6) * 1e6), top = step * 4; // ticks in ₹10k steps (paise)
    const done = Object.values(state.onboarding).filter(v => v === 'done').length, pct = done * 20;

    // donut segments
    const R = 70, C = 2 * Math.PI * R; let off = 0;
    const segs = modes.map(([m, v]) => { const len = v / sum * C, s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${DONUT[m] || '#8A858F'}" stroke-width="26" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('');

    return `<div class="hm-hero"><div><h1>Hi ${esc(state.user.name.split(' ')[0])} <span aria-hidden="true">👋</span></h1>
        <p class="muted">${isLive() ? 'Your live business at a glance.' : 'Welcome to your test account. Try payments with test cards and UPI.'}</p></div>
        <label class="hm-range"><i class="ph-duotone ph-calendar-blank" style="font-size:18px" aria-hidden="true"></i><select aria-label="Date range"><option>Last 7 days</option><option>Last 30 days</option><option>This month</option></select></label></div>
      ${done < 5 ? `<div class="hm-onb"><div class="hm-ico y">${ic('rocket', 26)}</div><div class="t"><b>Complete onboarding to accept live payments</b><span class="muted">You've completed ${pct}% · ${5 - done} steps left</span></div>
        <div class="p"><span class="bar"><i style="width:${pct}%"></i></span><b>${pct}%</b></div><a class="btn primary" href="#/onboarding">Resume onboarding →</a></div>` : ''}
      <div class="grid g4 hm-kpis">
        <div class="card"><div class="hm-ico c">${ic('coins')}</div><div><small>Total collected</small><b>${inr(sum)}</b><span>${ok.length} successful transactions</span></div>${deltaBadge(delta(sumOf(cur), sumOf(prev), prevDays))}</div>
        <div class="card"><div class="hm-ico o">${ic('swap')}</div><div><small>Settled</small><b>${inr(settled)}</b><span>${st.length} settlements</span></div>${deltaBadge(delta(stCur, stPrev, stPrevDays))}</div>
        <div class="card"><div class="hm-ico y">${ic('undo')}</div><div><small>Refunded</small><b>${inr(rf)}</b><span>${rfDone.length} processed · ${rfOpen} in progress</span></div>${deltaBadge(delta(sumOf(rfCur), sumOf(rfPrev), prevDays), true)}</div>
        <div class="card"><div class="hm-ico g">${ic('badge')}</div><div><small>Success rate</small><b>${sr}%</b><span>${t.length} attempts</span></div>${srDelta === null ? '' : `<span class="hm-delta ${srDelta >= 0 ? 'good' : 'bad'}">${srDelta >= 0 ? '↑ +' : '↓ '}${srDelta.toFixed(1)} pts</span>`}</div>
      </div>
      <div class="grid g-21" style="margin-bottom:16px">
        <div class="card"><div class="between hm-h"><h3><span class="hm-hi">${ic('chart')}</span>Successful transactions trend</h3><span class="chip">Avg ticket&nbsp;<b>${inr(ok.length ? sum / ok.length : 0)}</b></span></div>
          ${t.length ? `<div class="hm-chart"><div class="ax">${[4, 3, 2, 1, 0].map(k => `<span style="bottom:${k * 25}%">${k ? '₹' + (k * step / 1e5).toFixed(0) + 'k' : '₹0'}</span>`).join('')}</div>
            <div class="plot">${[4, 3, 2, 1].map(k => `<i class="gl" style="bottom:${k * 25}%"></i>`).join('')}
            ${days.map(d => `<div class="col"><span class="bv">${short(d.v)}</span><i class="${d.v === peak && peak ? 'pk' : ''}" style="height:${Math.max(1.5, d.v / top * 100)}%" title="${inr(d.v)}"></i></div>`).join('')}</div>
            <div class="xl">${days.map(d => `<span>${d.l}</span>`).join('')}</div></div>` : '<div class="empty">No transactions yet</div>'}</div>
        <div class="card"><div class="hm-h"><h3><span class="hm-hi">${ic('box')}</span>Split by payment mode</h3></div>
          ${modes.length ? `<div class="hm-donut"><div class="d"><svg viewBox="0 0 180 180" width="180" height="180" style="transform:rotate(-90deg)">${segs}</svg>
              <div class="c"><b>₹${Math.round(sum / 100).toLocaleString('en-IN')}</b><span>Total collected</span></div></div>
            <ul>${modes.map(([m, v]) => `<li><i style="background:${DONUT[m] || '#8A858F'}"></i><span>${m}</span><b>${Math.round(v / sum * 100)}%</b></li>`).join('')}</ul></div>` : '<p class="muted">No data</p>'}</div>
      </div>
      <div class="grid g3">
        <div class="card"><div class="between hm-h"><h3><span class="hm-hi">${ic('pulse')}</span>Gateway health</h3><button class="btn sm" id="hr"><i data-icon=refresh-cw class=li></i> Refresh</button></div>
          <div class="tabs" style="margin-bottom:12px"><button class="on" data-h="a">Active downtime</button><button data-h="p">Past downtime</button></div>
          <div id="hbody"><div class="hm-ok"><div><b><span class="dot"></span>All payment modes are working</b><span class="muted" id="ht">As of ${fmtDate(new Date())}</span></div><span class="ck"><i class="ph-bold ph-check" aria-hidden="true"></i></span></div></div></div>
        <div class="card"><div class="hm-h"><h3><span class="hm-hi">${ic('layers')}</span>Payment modes</h3></div>
          <div class="hm-list">${['UPI', 'Credit card', 'Debit card', 'Net banking', 'Wallets', 'EMI'].map(m => `<div><span>${m}</span>${liveLocked() && isLive() ? '<span class="pill">Activate</span>' : '<span class="pill ok">Active</span>'}</div>`).join('')}</div></div>
        <div class="card"><div class="hm-h"><h3><span class="hm-hi">${ic('bolt')}</span>Go live your way</h3></div>
          <div class="hm-go">
            <a href="#/checkout"><span class="hm-ico c sm">${ic('page', 18)}</span><span><b>Hosted checkout</b> <span class="pill brand">1–2 days</span><small>Redirect to our prebuilt payment page.</small></span><em><i data-icon=chevron-right class=li></i></em></a>
            <a href="#/developer"><span class="hm-ico c sm">${ic('code', 18)}</span><span><b>Custom checkout</b> <span class="pill brand">2–3 days</span><small>Build your own UI on our APIs.</small></span><em><i data-icon=chevron-right class=li></i></em></a>
            <a href="#/products"><span class="hm-ico c sm">${ic('plug', 18)}</span><span><b>Plugins</b> <span class="pill brand">Minutes</span><small>Shopify, WooCommerce and more.</small></span><em><i data-icon=chevron-right class=li></i></em></a>
          </div></div>
      </div>`;
  };

  BIND.home = () => {
    $('#hr').onclick = () => { const h = $('#ht'); if (h) h.textContent = 'As of ' + fmtDate(new Date()); toast('Gateway status refreshed'); };
    document.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      document.querySelectorAll('[data-h]').forEach(x => x.classList.toggle('on', x === b));
      $('#hbody').innerHTML = b.dataset.h === 'a'
        ? `<div class="hm-ok"><div><b><span class="dot"></span>All payment modes are working</b><span class="muted" id="ht">As of ${fmtDate(new Date())}</span></div><span class="ck"><i class="ph-bold ph-check" aria-hidden="true"></i></span></div>`
        : `<div class="hm-list"><div><span><span class="dot warn"></span><b>Net banking · ICICI</b><small class="muted" style="display:block">Degraded · 31 Oct, 01:10–01:45</small></span><span class="pill warn">Resolved</span></div>
           <div><span><span class="dot bad"></span><b>UPI · one PSP</b><small class="muted" style="display:block">Down · 29 Oct, 22:05–22:20</small></span><span class="pill warn">Resolved</span></div></div>`;
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
    .hm-donut{display:flex;align-items:center;gap:26px;flex:1;flex-wrap:wrap;justify-content:center}
    .hm-donut .d{position:relative;width:180px;height:180px}
    .hm-donut .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .hm-donut .c b{font-size:20px}.hm-donut .c span{font-size:12.5px;color:var(--muted)}
    .hm-donut ul{list-style:none;margin:0;padding:0;flex:1;min-width:200px}
    .hm-donut li{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #EFECE6;font-size:14px}
    .hm-donut li:last-child{border-bottom:0}.hm-donut li i{width:12px;height:12px;border-radius:50%;flex:none}.hm-donut li span{flex:1}
    .hm-ok{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0}
    .hm-ok b{display:block}.hm-ok .muted{display:block;font-size:13px;margin:4px 0 0 14px}
    .hm-ok .ck{width:44px;height:44px;border-radius:12px;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;font-size:22px;font-weight:700}
    .hm-list>div{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #EFECE6}
    .hm-list>div:last-child{border-bottom:0}
    .hm-go a{display:flex;align-items:center;gap:14px;padding:12px 4px;border-bottom:1px solid #EFECE6;border-radius:10px}
    .hm-go a:last-child{border-bottom:0}.hm-go a:hover{background:var(--bg)}
    .hm-go a>span:nth-child(2){flex:1}.hm-go small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
    .hm-go em{font-style:normal;font-size:22px;color:var(--ink-2)}
    @media (max-width:820px){ .hm-onb .p{min-width:0;width:100%} }
  `);
})();

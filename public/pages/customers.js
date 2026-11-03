// Page: customers. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Customers ---- */
(() => {
  const PER_PAGE = 10, DAY = 864e5;
  const HIGH_VALUE = 3000000;      // ₹30,000 net lifetime value
  const SEGMENTS = [
    ['new', 'New', 'First payment attempt in the last 7 days', 'brand'],
    ['repeat', 'Repeat', '2 or more successful payments', 'ok'],
    ['high', 'High value', `Lifetime value of ${inr(HIGH_VALUE)} or more`, 'ok'],
    ['risk', 'At risk', 'No successful payment in 3 days, or 3+ failed attempts this week', 'bad'],
  ];
  const SORTS = [['spend', 'Lifetime value: high to low'], ['last', 'Last payment: most recent'], ['payments', 'Payments: most first'], ['name', 'Name: A to Z']];
  const cu = { q: '', seg: [], sort: 'spend', page: 1 };

  // One row per customer (email, else phone), built from this mode's transactions and refunds.
  // Payments with no customer details at all are left out: there is nobody to list.
  const keyOf = t => (t.email || '').toLowerCase() || t.phone || '';
  function customers(){
    const m = {};
    D().forEach(t => {
      const k = keyOf(t); if (!k) return;
      const c = m[k] = m[k] || { key: k, name: t.name, email: t.email, phone: t.phone, txns: [], first: t.date, last: null, lastAttempt: t.date, ok: 0, spend: 0, refunded: 0, modes: {}, recentFails: 0 };
      c.txns.push(t);
      if (t.date < c.first) c.first = t.date;
      if (t.date > c.lastAttempt) c.lastAttempt = t.date;
      if (t.status === 'SUCCESS') { c.ok++; c.spend += t.amount; c.refunded += t.refunded; c.modes[t.mode] = (c.modes[t.mode] || 0) + 1; if (!c.last || t.date > c.last) c.last = t.date; }
      else if (now - t.date < 7 * DAY && t.status !== 'PENDING') c.recentFails++;
    });
    return Object.values(m).map(c => {
      c.ltv = c.spend - c.refunded;
      c.mode = Object.entries(c.modes).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      c.txns.sort((a, b) => b.date - a.date);
      c.segs = [];
      if (now - c.first < 7 * DAY) c.segs.push('new');
      if (c.ok >= 2) c.segs.push('repeat');
      if (c.ltv >= HIGH_VALUE) c.segs.push('high');
      if (!c.last || now - c.last > 3 * DAY || c.recentFails >= 3) c.segs.push('risk');
      return c;
    });
  }
  const segPill = k => { const s = SEGMENTS.find(x => x[0] === k); return `<span class="pill ${s[3]}" title="${s[2]}">${s[1]}</span>`; };
  const initials = n => (n && n !== '—' ? n : '?').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  function rows(all){
    const q = cu.q.trim().toLowerCase();
    const by = { spend: (a, b) => b.ltv - a.ltv, last: (a, b) => (b.last || 0) - (a.last || 0), payments: (a, b) => b.ok - a.ok || b.ltv - a.ltv, name: (a, b) => a.name.localeCompare(b.name) }[cu.sort];
    return all.filter(c => (!q || [c.name, c.email, c.phone].some(v => v.toLowerCase().includes(q))) && (!cu.seg.length || cu.seg.some(s => c.segs.includes(s)))).sort(by);
  }

  function view(){
    const all = customers(), list = rows(all), paying = all.filter(c => c.ok);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE)); cu.page = Math.min(cu.page, pages);
    const newWeek = all.filter(c => c.segs.includes('new')).length;
    const header = head('Customers', 'Everyone who has paid you, how often and how much.', `<button class="btn" id="cudl" ${list.length ? '' : 'disabled'}><i data-icon=download class=li></i> Download CSV</button><a class="btn primary" href="#/links">+ Request a payment</a>`);
    if (!all.length) {
      return header + `<div class="card"><div class="empty-state"><div class="box"><i data-icon=users class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO CUSTOMERS YET</p>
        <h3 style="margin:4px 0 6px;font-size:20px">Your customer list builds itself</h3><p class="muted" style="margin:0 0 12px">Each person who pays you ${isLive() ? 'in live mode' : ''} shows up here with their lifetime value and payment history.</p>
        <div class="row" style="gap:8px"><a class="btn sm primary" href="#/links">Create a payment link</a>${isLive() ? '<button class="btn sm" id="cutest">View test customers</button>' : ''}</div></div></div></div>`;
    }
    const kpis = `<div class="grid g4 kpis">
      <div class="card kpi"><small>Customers</small><b>${all.length}</b><span class="d muted">${paying.length} have paid at least once</span></div>
      <div class="card kpi"><small>Repeat rate</small><b>${paying.length ? Math.round(paying.filter(c => c.ok >= 2).length / paying.length * 100) : 0}%</b><span class="d muted">${paying.filter(c => c.ok >= 2).length} of ${paying.length} paying customers came back</span></div>
      <div class="card kpi"><small>Average lifetime value</small><b>${inr(paying.length ? Math.round(paying.reduce((a, c) => a + c.ltv, 0) / paying.length) : 0)}</b><span class="d muted">net of refunds, per paying customer</span></div>
      <div class="card kpi"><small>New this week</small><b>${newWeek}</b><span class="d muted">first attempt in the last 7 days</span></div></div>`;
    const toolbar = `<div class="toolbar">
      <div class="searchbox"><input id="cuq" placeholder="Search by name, email or phone" value="${esc(cu.q)}"><button class="btn primary" id="cugo">Search</button></div>
      <div class="dd"><button class="btn" data-cudd="seg"><i data-icon=list-filter class=li></i> Segment${cu.seg.length ? ` <span class="pill brand">${cu.seg.length}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="cudd-seg"><h6>Segment</h6>${SEGMENTS.map(([k, l, d]) => `<label class="ck" title="${d}"><input type="checkbox" data-cuseg="${k}" ${cu.seg.includes(k) ? 'checked' : ''}>${l} <span class="muted" style="margin-left:auto;font-size:12px">${all.filter(c => c.segs.includes(k)).length}</span></label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="cureset">Reset</button><button class="btn sm primary" id="cuapply">Apply</button></div></div></div>
      <div class="dd"><button class="btn" data-cudd="sort">⇅ ${SORTS.find(s => s[0] === cu.sort)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="cudd-sort">${SORTS.map(([k, l]) => `<button data-cusort="${k}" class="${k === cu.sort ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <span style="flex:1"></span>
      <span class="row cu-segchips" style="flex:none;gap:6px">${SEGMENTS.map(([k, l]) => `<button class="chip ${cu.seg.length === 1 && cu.seg[0] === k ? 'brand' : ''}" data-cuchip="${k}">${l} · ${all.filter(c => c.segs.includes(k)).length}</button>`).join('')}</span></div>`;
    const th = (key, label, cls = '') => `<th class="${cls} sortable" data-cusorth="${key}">${label} <span class="muted">${cu.sort === key ? '↓' : '↕'}</span></th>`;
    const body = list.length ? list.slice((cu.page - 1) * PER_PAGE, cu.page * PER_PAGE).map(c => `<tr class="click" data-cu="${esc(c.key)}">
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="cu-av">${esc(initials(c.name))}</span><div style="min-width:0"><b>${esc(c.name)}</b><div class="muted" style="font-size:12px">${esc(c.email || '—')}</div></div></div></td>
        <td>${esc(c.phone || '—')}</td><td>${c.segs.map(segPill).join(' ') || '<span class="muted">—</span>'}</td>
        <td class="right">${c.ok}<span class="muted"> / ${c.txns.length}</span></td><td>${c.mode}</td>
        <td class="right"><b>${inr(c.ltv)}</b>${c.refunded ? `<div class="muted" style="font-size:11.5px">${inr(c.refunded)} refunded</div>` : ''}</td>
        <td>${c.last ? fmtDate(c.last) : '<span class="muted">Never paid</span>'}</td></tr>`).join('')
      : `<tr><td colspan="7"><div class="empty-state"><div class="box">🔍</div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO MATCHING CUSTOMERS</p>
          <h3 style="margin:4px 0 6px;font-size:20px">Nobody matches that search</h3><p class="muted" style="margin:0 0 12px">Check the spelling, search by phone instead, or clear the segment filter.</p>
          <div class="row" style="gap:8px"><button class="btn sm" id="cuclear">Clear search and filters</button></div></div></div></td></tr>`;
    const from = list.length ? (cu.page - 1) * PER_PAGE + 1 : 0, to = Math.min(list.length, cu.page * PER_PAGE);
    const pager = list.length ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${list.length} customers</span>
      <span class="pager"><button class="btn sm" data-cupg="${cu.page - 1}" ${cu.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === cu.page ? 'primary' : ''}" data-cupg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="btn sm" data-cupg="${cu.page + 1}" ${cu.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
    return header + kpis + toolbar + `<div class="tbl-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Segment</th>${th('payments', 'Payments', 'right')}<th>Preferred mode</th>${th('spend', 'Lifetime value', 'right')}${th('last', 'Last payment')}</tr></thead><tbody>${body}</tbody></table></div>` + pager;
  }

  function drawer(key){
    const c = customers().find(x => x.key === key); if (!c) return;
    const txids = new Set(c.txns.map(t => t.txnid)), refs = refunds[state.mode].filter(r => txids.has(r.txnid));
    const modeRows = Object.entries(c.modes).sort((a, b) => b[1] - a[1]);
    openDrawer(`<div class="between"><div class="row" style="gap:12px;flex-wrap:nowrap"><span class="cu-av lg">${esc(initials(c.name))}</span><div style="min-width:0"><h2 style="margin:0">${esc(c.name)}</h2><div class="muted" style="font-size:13px">Customer since ${fmtDate(c.first)}</div></div></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p style="margin:12px 0">${c.segs.map(segPill).join(' ') || '<span class="pill">No segment</span>'}</p>
      <div class="cu-stats"><div><small>Lifetime value</small><b>${inr(c.ltv)}</b></div><div><small>Successful payments</small><b>${c.ok} <span class="muted" style="font-size:13px;font-weight:500">of ${c.txns.length}</span></b></div>
        <div><small>Average ticket</small><b>${c.ok ? inr(Math.round(c.spend / c.ok)) : '—'}</b></div><div><small>Refunded</small><b>${inr(c.refunded)}</b></div></div>
      <h3 style="margin-top:18px">Profile</h3><dl class="kv"><dt>Email</dt><dd>${esc(c.email || '—')}</dd><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd><dt>Last successful payment</dt><dd>${c.last ? fmtDate(c.last) : 'Never'}</dd><dt>Last attempt</dt><dd>${fmtDate(c.lastAttempt)}</dd></dl>
      <h3 style="margin-top:18px">Preferred payment mode</h3>
      ${modeRows.length ? modeRows.map(([m, n]) => `<div class="hbar"><span>${m}</span><span class="t"><i style="width:${n / c.ok * 100}%"></i></span><span class="right">${n}</span></div>`).join('') : '<p class="muted">No successful payments yet.</p>'}
      <h3 style="margin-top:18px">Payment history <span class="muted" style="font-weight:500;font-size:13px">· ${c.txns.length}</span></h3>
      <div class="tbl-wrap"><table><thead><tr><th>Date · Txn ID</th><th>Mode</th><th class="right">Amount</th><th>Status</th></tr></thead><tbody>
        ${c.txns.map(t => `<tr title="${esc(t.product)}${t.error ? ' · ' + esc(t.error) : ''}"><td>${fmtDate(t.date)}<div class="mono muted" style="font-size:11px">${t.txnid}</div></td><td>${t.mode}</td><td class="right">${inr(t.amount)}</td><td>${statusPill(t.status)}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin-top:18px">Refunds <span class="muted" style="font-weight:500;font-size:13px">· ${refs.length}</span></h3>
      ${refs.length ? `<div class="tbl-wrap"><table><thead><tr><th>Refund ID</th><th>Txn ID</th><th class="right">Amount</th><th>Status</th></tr></thead><tbody>
        ${refs.map(r => `<tr title="${esc(r.reason || '')}"><td><span class="mono">${r.id}</span><div class="muted" style="font-size:11px">${esc(r.reason || '')}</div></td><td class="mono">${r.txnid}</td><td class="right">${inr(r.amount)}</td><td>${statusPill(r.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin:0">No refunds for this customer.</p>'}
      <div class="row" style="margin-top:20px"><button class="btn primary" id="culink"><i data-icon=link class=li></i> Create payment link</button>
        ${c.email ? '<button class="btn" id="cucopy">Copy email</button>' : ''}</div>`);
    $('#culink').onclick = () => customers_link(c.key);
    const cp = $('#cucopy'); if (cp) cp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(c.email); toast('Email copied'); };
  }
  // Hands the customer to Payment links: hash query `#/links?name=&email=&phone=` (links page may read it),
  // and, as a fallback, opens that page's create dialog and fills the customer fields if they exist.
  window.customers_link = key => {
    const c = customers().find(x => x.key === key); if (!c) return;
    closeAll();
    go('links?' + new URLSearchParams({ name: c.name, email: c.email, phone: c.phone }).toString());
    setTimeout(() => {
      if ($('#modal').classList.contains('open')) return;
      const nl = $('#lknew') || $('#nl'); if (!nl) return;
      nl.click();
      const set = (sel, v) => { const el = $(sel); if (el && !el.value) el.value = v; };
      if ($('#lcn')) { set('#lcn', c.name); set('#lcph', c.phone); set('#lcem', c.email); } else { set('#ln', c.name); set('#lp', c.email); }
      toast(`Payment link for ${c.name}`);
    }, 60);
  };

  addStyle('customers', `
    .cu-av{width:34px;height:34px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:grid;place-items:center;font-weight:700;font-size:12.5px;flex:none!important;min-width:0!important}
    .cu-av.lg{width:46px;height:46px;font-size:16px}
    .cu-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .cu-stats>div{background:var(--soft);border-radius:10px;padding:10px 12px}
    .cu-stats small{color:var(--muted);font-size:12px} .cu-stats b{display:block;font-size:18px}
    .drawer .tbl-wrap td,.drawer .tbl-wrap th{padding:8px 9px}
    .cu-segchips>*{flex:none!important;min-width:0!important}
    @media (max-width:1000px){ .cu-segchips{display:none!important} }
  `);

  PAGES.customers = () => liveLocked() ? head('Customers') + locked('Customers') : view();
  BIND.customers = () => {
    if (liveLocked()) return;
    const redraw = () => route();
    document.querySelectorAll('[data-cudd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#cudd-' + b.dataset.cudd), open = m.classList.contains('open'); document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')); if (!open) m.classList.add('open'); });
    document.querySelectorAll('[id^="cudd-"]').forEach(m => m.onclick = e => e.stopPropagation());
    const search = () => { cu.q = $('#cuq').value; cu.page = 1; redraw(); };
    if ($('#cugo')) { $('#cugo').onclick = search; $('#cuq').onkeydown = e => { if (e.key === 'Enter') search(); }; }
    if ($('#cuapply')) {
      $('#cuapply').onclick = () => { cu.seg = [...document.querySelectorAll('[data-cuseg]:checked')].map(x => x.dataset.cuseg); cu.page = 1; redraw(); };
      $('#cureset').onclick = () => { cu.seg = []; cu.page = 1; redraw(); };
    }
    document.querySelectorAll('[data-cuchip]').forEach(b => b.onclick = () => { const k = b.dataset.cuchip; cu.seg = cu.seg.length === 1 && cu.seg[0] === k ? [] : [k]; cu.page = 1; redraw(); });
    document.querySelectorAll('[data-cusort]').forEach(b => b.onclick = () => { cu.sort = b.dataset.cusort; cu.page = 1; redraw(); });
    document.querySelectorAll('[data-cusorth]').forEach(h => h.onclick = () => { cu.sort = h.dataset.cusorth; cu.page = 1; redraw(); });
    document.querySelectorAll('[data-cupg]').forEach(b => b.onclick = () => { cu.page = +b.dataset.cupg; redraw(); });
    document.querySelectorAll('tr[data-cu]').forEach(r => r.onclick = () => drawer(r.dataset.cu));
    if ($('#cuclear')) $('#cuclear').onclick = () => { cu.q = ''; cu.seg = []; cu.page = 1; redraw(); };
    if ($('#cutest')) $('#cutest').onclick = () => { if (isLive() && $('#mode')) $('#mode').click(); }; // core toggle reloads test data
    if ($('#cudl')) $('#cudl').onclick = () => {
      const list = rows(customers());
      const csv = 'name,email,phone,segments,successful_payments,attempts,preferred_mode,lifetime_value_inr,refunded_inr,first_seen,last_payment\n' +
        list.map(c => [`"${String(c.name).replace(/"/g, '""')}"`, c.email, c.phone, c.segs.join('|'), c.ok, c.txns.length, c.mode, (c.ltv / 100).toFixed(2), (c.refunded / 100).toFixed(2), c.first.toISOString(), c.last ? c.last.toISOString() : ''].join(',')).join('\n') + '\n';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'bizpolepay-customers.csv'; a.click();
      toast(`Downloaded ${list.length} customers`);
    };
  };
  document.addEventListener('click', () => document.querySelectorAll('[id^="cudd-"].open').forEach(m => m.classList.remove('open')));
})();

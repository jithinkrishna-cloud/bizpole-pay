// Page: split. Uses globals from app.html core (state, api, LOAD, helpers, PAGES, BIND).
/* ---- Split & transfer: child merchants (partners) and per-payment split allocations ---- */
(() => {
  const PAGE_SIZE = 10, DAY = 864e5;
  const SSTATUS = ['PENDING', 'CREATED', 'RELEASED', 'FAILED'];
  const SLABEL = { PENDING: 'Pending', CREATED: 'Held', RELEASED: 'Released', FAILED: 'Failed' };
  const PCLS = { RELEASED: 'ok', CREATED: 'brand', PENDING: 'warn', FAILED: 'bad' };
  const pill = s => `<span class="pill ${PCLS[s] || ''}">${esc(SLABEL[s] || s)}</span>`;
  // Onboarding status is whatever the payment partner reported for the child account; empty until it confirms it.
  const onbPill = p => p.onboardingStatus ? `<span class="pill ${/^active$/i.test(p.onboardingStatus) ? 'ok' : /reject/i.test(p.onboardingStatus) ? 'bad' : 'warn'}">${esc(p.onboardingStatus)}</span>` : '<span class="pill warn">Not confirmed by the payment partner</span>';
  const SEARCH = [['sub', 'Sub-txn ID'], ['txnid', 'Transaction ID'], ['partner', 'Partner']];
  const RANGES = [['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['all', 'All time', null]];
  const mask = k => k ? k.slice(0, 2) + '••••••' + k.slice(-2) : '—';
  const typeText = t => t === 'PERCENTAGE' ? 'Percentage' : 'Fixed amount';

  /* ---------- data (from /api/split, per mode) ---------- */
  const store = { test: { partners: [], allocations: [] }, live: { partners: [], allocations: [] } };
  const S = () => store[state.mode];
  const partnerOf = a => S().partners.find(p => p.id === a.partnerId) || { name: '—', childMid: null, childMerchantKey: null };
  LOAD.split = async (mode) => {
    const r = await api('/split', { mode });
    store[mode] = {
      partners: r.partners.map(p => ({ ...p, createdAt: new Date(p.createdAt) })),
      allocations: r.allocations.map(a => ({ ...a, date: new Date(a.date), releasedAt: toDate(a.releasedAt), txn: { ...a.txn, date: toDate(a.txn.date) } })),
    };
  };
  const refresh = () => LOAD.split(state.mode);

  /* ---------- view state ---------- */
  const sp = { tab: 'a', page: 1, field: 'sub', q: '', range: '30d', status: [], partners: [], sort: { key: 'date', dir: -1 } };
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);

  function rows(){
    const q = sp.q.trim().toLowerCase(), rg = RANGES.find(r => r[0] === sp.range)[2];
    const val = a => sp.field === 'sub' ? a.aggregatorSubTxnId : sp.field === 'txnid' ? a.txnid : partnerOf(a).name;
    return S().allocations.filter(a => (!rg || now - a.date <= rg * DAY) && (!sp.status.length || sp.status.includes(a.status)) && (!sp.partners.length || sp.partners.includes(a.partnerId))
      && (!q || String(val(a) || '').toLowerCase().includes(q))).sort((a, b) => sp.sort.dir * (sp.sort.key === 'amount' ? a.amount - b.amount : a.date - b.date));
  }
  function kpis(){
    const al = S().allocations.filter(a => now - a.date <= 30 * DAY), ok = al.filter(a => a.status !== 'FAILED');
    const rel = al.filter(a => a.status === 'RELEASED'), held = al.filter(a => a.status === 'CREATED'), ps = S().partners;
    const sum = l => l.reduce((x, a) => x + a.amount, 0);
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Split volume (30 days)</small><b>${inr(sum(ok))}</b><span class="d muted">${ok.length} splits on ${new Set(ok.map(a => a.txnid)).size} payments</span></div>
      <div class="card kpi"><small>Released to partners</small><b>${inr(sum(rel))}</b><span class="d muted">${rel.length} splits · charges ${inr(rel.reduce((x, a) => x + (a.charges || 0), 0))}</span></div>
      <div class="card kpi"><small>Held for release</small><b>${inr(sum(held))}</b><span class="d muted">${held.length} splits waiting · ${al.filter(a => a.status === 'PENDING').length} pending with the payment partner</span></div>
      <div class="card kpi"><small>Partners</small><b>${ps.filter(p => p.active).length}</b><span class="d muted">active · ${ps.filter(p => !p.onboardingStatus).length} not yet confirmed by the payment partner</span></div></div>`;
  }

  PAGES.split = () => {
    if (liveLocked()) return head('Split & transfer') + locked('Split & transfer');
    return head('Split & transfer', 'Share each payment with partners or vendors, and release their settlement when you are ready.', `<button class="btn" id="sp-rel">⇥ Release held</button><button class="btn primary" id="sp-add">+ Add partner</button>`) +
      `<div id="sp-kpis"></div><div class="tabs"><button data-sp="a">Split payments</button><button data-sp="p">Partners</button></div><div id="sp-view"></div>`;
  };

  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-sort="${key}">${label} <span class="muted">${sp.sort.key === key ? (sp.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;
  function pager(total){
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), from = total ? (sp.page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(total, sp.page * PAGE_SIZE);
    return total ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${total}</span>
      <span class="pager"><button class="btn sm" data-pg="${sp.page - 1}" ${sp.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === sp.page ? 'primary' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="btn sm" data-pg="${sp.page + 1}" ${sp.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
  }
  const empty = (title, text, buttons) => `<div class="empty-state"><div class="box"><i data-icon=split class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NOTHING HERE YET</p>
    <h3 style="margin:4px 0 6px;font-size:20px">${title}</h3><p class="muted" style="margin:0 0 12px;max-width:520px">${text}</p><div class="row" style="gap:8px">${buttons}</div></div></div>`;
  const noPartners = () => `<div class="card">${empty('Add your first partner', 'Partners are child merchants under your aggregator account. Once a partner is active, part of any payment can be split to them as a fixed amount or a percentage.', '<button class="btn sm primary" data-addp>+ Add partner</button>')}</div>`;

  /* ---------- Split payments ---------- */
  function renderAllocs(){
    if (!S().partners.length && !S().allocations.length) return noPartners();
    const list = rows(), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); sp.page = Math.min(sp.page, pages);
    const held = list.filter(a => a.status === 'CREATED'), nF = sp.status.length + sp.partners.length, f = SEARCH.find(x => x[0] === sp.field), none = !S().allocations.length;
    return `<div class="toolbar">
      <div class="searchbox"><select id="sp-sf">${SEARCH.map(([k, l]) => `<option value="${k}" ${k === sp.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="sp-sq" placeholder="Search ${f[1]}" value="${esc(sp.q)}"><button class="btn primary" id="sp-sgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="sprange"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === sp.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-sprange">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === sp.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="spfilter"><i data-icon=list-filter class=li></i> Filter${nF ? ` <span class="pill brand">${nF}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-spfilter"><h6>Status</h6>${SSTATUS.map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${sp.status.includes(s) ? 'checked' : ''}>${SLABEL[s]}</label>`).join('')}
          ${S().partners.length ? `<h6>Partner</h6>${S().partners.map(p => `<label class="ck"><input type="checkbox" data-fp="${esc(p.id)}" ${sp.partners.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}` : ''}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sp-freset">Reset</button><button class="btn sm primary" id="sp-fapply">Apply</button></div></div></div>
      <span style="flex:1"></span>
      ${held.length ? `<button class="btn" data-relall>⇥ Release ${held.length} held · ${inr(held.reduce((x, a) => x + a.amount, 0))}</button>` : ''}
      <button class="btn" id="sp-dl"><i data-icon=download class=li></i> Download CSV</button></div>
    <div class="tbl-wrap"><table><thead><tr>${sortHead('date', 'Date')}<th>Payment (Txn ID)</th><th>Partner</th><th>Sub-txn ID</th>${sortHead('amount', 'Split amount', 'right')}<th class="right">Charges</th><th class="right">Net to partner</th><th>Status</th><th class="right">Action</th></tr></thead>
    <tbody>${list.length ? list.slice((sp.page - 1) * PAGE_SIZE, sp.page * PAGE_SIZE).map(a => { const t = a.txn, p = partnerOf(a);
      return `<tr class="click" data-aid="${esc(a.id)}"><td>${fmtDate(a.date)}</td><td><span class="mono">${esc(a.txnid)}</span><div class="muted" style="font-size:12px">${inr(t.amount || 0)} · ${esc(t.name || '—')}</div></td>
        <td>${esc(p.name)}<div class="muted" style="font-size:12px">${typeText(a.splitType)}</div></td><td class="mono">${esc(a.aggregatorSubTxnId)}</td>
        <td class="right"><b>${inr(a.amount)}</b></td><td class="right muted">${a.charges == null ? '—' : inr(a.charges)}</td><td class="right">${inr(a.amount - (a.charges || 0))}</td><td>${pill(a.status)}</td>
        <td class="right">${a.status === 'CREATED' ? `<button class="btn sm" data-release="${esc(a.id)}">Release</button>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')
      : `<tr><td colspan="9">${none ? empty('No split payments yet', 'Splits appear here when a payment is split to one of your partners through our payment partner.', '<button class="btn sm" data-gop>View partners</button>')
        : empty("We couldn't find any splits", 'Remove the filters or widen the date range and try again.', '<button class="btn sm" id="sp-eclear">Clear filters</button><button class="btn sm" id="sp-eall">Show all time</button>')}</td></tr>`}</tbody></table></div>` + pager(list.length);
  }

  /* ---------- Partners ---------- */
  function renderPartners(){
    const ps = S().partners;
    if (!ps.length) return noPartners();
    return `<div class="tbl-wrap"><table><thead><tr><th>Partner</th><th>Child MID</th><th>Child merchant key</th><th>Onboarding</th><th class="right">Released (30d)</th><th class="right">Held</th><th>State</th></tr></thead>
    <tbody>${ps.map(p => { const al = S().allocations.filter(a => a.partnerId === p.id && now - a.date <= 30 * DAY);
      return `<tr class="click" data-pid="${esc(p.id)}"><td><b style="font-weight:600">${esc(p.name)}</b><div class="mono muted" style="font-size:11.5px">${esc(p.id)}</div></td><td class="mono">${p.childMid || '—'}</td><td class="mono">${esc(mask(p.childMerchantKey))}</td>
        <td>${onbPill(p)}</td>
        <td class="right">${inr(al.filter(a => a.status === 'RELEASED').reduce((x, a) => x + a.amount, 0))}</td><td class="right">${inr(S().allocations.filter(a => a.partnerId === p.id && a.status === 'CREATED').reduce((x, a) => x + a.amount, 0))}</td>
        <td>${p.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Paused</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="grid g3" style="margin-top:16px">
      <div class="card tile"><div class="ic">%</div><div><b>Percentage splits</b><p>The partner gets a share of the payment. Bizpole Pay sends the split to the payment partner with the payment's aggregatorSubTxnId.</p></div></div>
      <div class="card tile"><div class="ic">₹</div><div><b>Fixed amount splits</b><p>A flat amount from the payment, never more than the payment itself, so your own share is never negative.</p></div></div>
      <div class="card tile"><div class="ic">⇥</div><div><b>Held settlements</b><p>Held splits wait until you release them, for example after delivery. Released splits settle to the partner on the next cycle.</p></div></div></div>`;
  }

  /* ---------- drawers, dialogs, actions ---------- */
  function allocDrawer(id){
    const a = S().allocations.find(x => x.id === id); if (!a) return;
    const t = a.txn, p = partnerOf(a), siblings = S().allocations.filter(x => x.txnid === a.txnid);
    const yours = (t.amount || 0) - siblings.filter(x => x.status !== 'FAILED').reduce((s, x) => s + x.amount, 0);
    const steps = [['Payment captured', true, t.date ? fmtDate(t.date) : '—'], ['Split sent to the payment partner', true, fmtDate(a.date)], ['Accepted by the payment partner', ['CREATED', 'RELEASED'].includes(a.status), a.status === 'FAILED' ? 'rejected' : a.status === 'PENDING' ? 'awaiting status' : 'ok'],
      ['Settlement released', a.status === 'RELEASED', a.releasedAt ? fmtDate(a.releasedAt) : 'not yet']];
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">Split to ${esc(p.name)}</div><h2 style="margin:0">${inr(a.amount)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(a.status)} <span class="muted">${fmtDate(a.date)}</span></p>
      ${a.status === 'FAILED' ? `<div class="card" style="background:var(--bad-soft);border-color:transparent;margin-bottom:14px"><b>Split failed.</b> The payment partner rejected this split${a.payuStatus ? ` (status ${esc(a.payuStatus)})` : ''}. The full amount stays with you.</div>` : ''}
      ${a.status === 'CREATED' ? `<div class="card" style="background:var(--brand-soft);border-color:transparent;margin-bottom:14px"><b>Held.</b> This split settles to the partner only after it is released.</div>` : ''}
      <h3>Split</h3><dl class="kv"><dt>Sub-txn ID</dt><dd class="mono">${esc(a.aggregatorSubTxnId)}</dd><dt>Split type</dt><dd>${typeText(a.splitType)}</dd>
        <dt>Amount</dt><dd>${inr(a.amount)}</dd><dt>Charges</dt><dd>${a.charges == null ? '—' : inr(a.charges)}</dd><dt>Net to partner</dt><dd><b>${inr(a.amount - (a.charges || 0))}</b></dd><dt>Gateway status</dt><dd class="mono">${esc(a.payuStatus || '—')}</dd>${a.releaseStatus ? `<dt>Release response</dt><dd class="mono">${esc(a.releaseStatus)}</dd>` : ''}</dl>
      <h3 style="margin-top:18px">Partner</h3><dl class="kv"><dt>Name</dt><dd>${esc(p.name)}</dd><dt>Child MID</dt><dd class="mono">${p.childMid || '—'}</dd><dt>Merchant key</dt><dd class="mono">${esc(mask(p.childMerchantKey))}</dd></dl>
      <h3 style="margin-top:18px">Original payment</h3><dl class="kv"><dt>Txn ID</dt><dd class="mono">${esc(a.txnid)}</dd><dt>Payment ID</dt><dd class="mono">${esc(t.mihpayid || '—')}</dd><dt>Customer</dt><dd>${esc(t.name || '—')}</dd><dt>Payment</dt><dd>${inr(t.amount || 0)} · ${esc(t.mode || '—')}</dd>
        <dt>Splits</dt><dd>${siblings.map(x => `${esc(partnerOf(x).name)} ${inr(x.amount)}`).join('<br>')}</dd><dt>Your share</dt><dd><b>${inr(yours)}</b></dd></dl>
      <h3 style="margin-top:18px">Progress</h3>${steps.map(([s, d, sub]) => `<p style="font-size:13px;margin:6px 0"><span class="dot ${d ? '' : a.status === 'FAILED' && s.startsWith('Accepted') ? 'bad' : 'warn'}"></span>${s} <span class="muted">· ${sub}</span></p>`).join('')}
      <div class="row" style="margin-top:20px">${a.status === 'CREATED' ? `<button class="btn primary" onclick="split_release(['${esc(a.id)}'])">⇥ Release settlement</button>` : ''}
        <button class="btn" onclick="closeAll();go('transactions')">View transactions</button></div>`);
  }
  window.split_release = ids => {
    const list = ids.map(id => S().allocations.find(a => a.id === id)).filter(a => a && a.status === 'CREATED');
    if (!list.length) return toast('Nothing held to release');
    const total = list.reduce((x, a) => x + a.amount, 0), byP = [...new Set(list.map(a => a.partnerId))];
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Release settlement?</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">${list.length} held split${list.length > 1 ? 's' : ''} to ${byP.length} partner${byP.length > 1 ? 's' : ''}</p>
      <div class="sp-sum"><span>Amount to release</span><b>${inr(total)}</b></div>
      <p style="font-size:13.5px">The payment partner will settle these amounts to the partners on their next settlement cycle. A released split can't be held again; to reverse it, refund the payment.</p>
      <div id="sp-rerr"></div>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="sp-confirm">Release ${inr(total)}</button></div>`);
    $('#sp-confirm').onclick = async () => {
      const b = $('#sp-confirm'); b.disabled = true;
      try { await api('/split/release', { method: 'POST', body: { ids: list.map(a => a.id) } }); await refresh(); }
      catch (e) { b.disabled = false; $('#sp-rerr').innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; return; }
      closeAll(); toast(`${list.length} split${list.length > 1 ? 's' : ''} released · ${inr(total)}`); redraw();
    };
  };
  function partnerDrawer(id){
    const p = S().partners.find(x => x.id === id); if (!p) return;
    const al = S().allocations.filter(a => a.partnerId === id).sort((a, b) => b.date - a.date);
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">Partner · child merchant</div><h2 style="margin:0">${esc(p.name)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${onbPill(p)} ${p.active ? '' : '<span class="pill">Paused</span>'} <span class="muted">added ${fmtDate(p.createdAt)}</span></p>
      ${!p.onboardingStatus ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Not confirmed by the payment partner yet.</b> Splits to this partner are rejected until the payment partner activates the child account under your aggregator account.</div>`
        : !/^active$/i.test(p.onboardingStatus) ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Onboarding: ${esc(p.onboardingStatus)}.</b> Splits to this partner will be rejected until the payment partner activates the child account.</div>` : ''}
      <h3>Account</h3><dl class="kv"><dt>Partner ID</dt><dd class="mono">${esc(p.id)}</dd><dt>Child MID</dt><dd class="mono">${p.childMid || '—'}</dd><dt>Child merchant key</dt><dd class="mono">${esc(mask(p.childMerchantKey))}</dd><dt>Product account</dt><dd class="mono">${esc(p.productAccountUuid || '—')}</dd></dl>
      <h3 style="margin-top:18px">Recent splits</h3>${al.length ? al.slice(0, 6).map(a => `<div class="between sp-line"><div><span class="mono">${esc(a.aggregatorSubTxnId)}</span><div class="muted" style="font-size:12px">${fmtDate(a.date)} · ${typeText(a.splitType)}</div></div><span style="flex:none">${inr(a.amount)} ${pill(a.status)}</span></div>`).join('') : '<p class="muted" style="font-size:13px">No splits yet.</p>'}
      <div class="row" style="margin-top:20px"><button class="btn ${p.active ? 'danger' : 'primary'}" onclick="split_toggle('${esc(p.id)}')">${p.active ? 'Pause splits' : 'Resume splits'}</button></div>`);
  }
  window.split_toggle = async id => {
    const p = S().partners.find(x => x.id === id); if (!p) return;
    try { await api(`/split/partners/${encodeURIComponent(id)}`, { method: 'PATCH', body: { active: !p.active } }); await refresh(); }
    catch (e) { return apiFail(e); }
    toast(`${p.name}: splits ${!p.active ? 'resumed' : 'paused'}`); redraw(); partnerDrawer(id);
  };
  function partnerModal(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Add partner</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin-bottom:0">Link a child merchant created under your aggregator account.</p>
      <label>Partner name</label><input id="pp-name" maxlength="80" placeholder="Registered business name">
      <div class="row"><div><label>Child MID</label><input id="pp-mid" inputmode="numeric" placeholder="6–10 digits"></div><div><label>Child merchant key</label><input id="pp-key" autocomplete="off" placeholder="From the child account"></div></div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">The partner shows as "Not confirmed by the payment partner" until the payment partner reports the child account's onboarding status.</p>
      <div id="pp-err"></div>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="pp-go">Add partner</button></div>`);
    $('#pp-go').onclick = async () => {
      const name = $('#pp-name').value.trim(), mid = $('#pp-mid').value.trim(), key = $('#pp-key').value.trim();
      const err = name.length < 2 ? 'Enter the partner name.' : !/^\d{6,10}$/.test(mid) ? 'Child MID must be 6–10 digits.' : S().partners.some(p => String(p.childMid) === mid) ? 'This child MID is already linked.'
        : !/^[A-Za-z0-9]{6,32}$/.test(key) ? 'Child merchant key must be 6–32 letters or digits.' : S().partners.some(p => p.childMerchantKey === key) ? 'This merchant key is already linked to another partner.' : '';
      if (err) { $('#pp-err').innerHTML = `<div class="notice bad">${err}</div>`; return; }
      const b = $('#pp-go'); b.disabled = true;
      try { await api('/split/partners', { method: 'POST', body: { name, childMid: mid, childMerchantKey: key } }); await refresh(); }
      catch (e) { b.disabled = false; $('#pp-err').innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; return; }
      closeAll(); toast(`${name} added · waiting for the payment partner to confirm the child account`); sp.tab = 'p'; redraw();
    };
  }

  /* ---------- tabs and binding ---------- */
  function show(t){
    if (t !== sp.tab) sp.page = 1;
    sp.tab = t;
    document.querySelectorAll('[data-sp]').forEach(b => b.classList.toggle('on', b.dataset.sp === t));
    $('#sp-kpis').innerHTML = kpis();
    $('#sp-view').innerHTML = t === 'a' ? renderAllocs() : renderPartners();
    bindView(t);
  }
  const redraw = () => { if ($('#sp-view')) show(sp.tab); };
  function bindView(t){
    const v = $('#sp-view');
    v.querySelectorAll('[data-addp]').forEach(b => b.onclick = () => partnerModal());
    v.querySelectorAll('[data-gop]').forEach(b => b.onclick = () => show('p'));
    v.querySelectorAll('tr[data-pid]').forEach(r => r.onclick = () => partnerDrawer(r.dataset.pid));
    if (t !== 'a' || !$('#sp-sf')) return;
    v.querySelectorAll('[data-dd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#dd-' + b.dataset.dd), open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); });
    v.querySelectorAll('.menu').forEach(m => m.onclick = e => e.stopPropagation());
    $('#sp-sf').onchange = e => { sp.field = e.target.value; sp.q = ''; redraw(); };
    const search = () => { sp.q = $('#sp-sq').value; sp.page = 1; redraw(); };
    $('#sp-sgo').onclick = search; $('#sp-sq').onkeydown = e => { if (e.key === 'Enter') search(); };
    v.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { sp.range = b.dataset.range; sp.page = 1; redraw(); });
    $('#sp-fapply').onclick = () => { sp.status = [...v.querySelectorAll('[data-fs]:checked')].map(x => x.dataset.fs); sp.partners = [...v.querySelectorAll('[data-fp]:checked')].map(x => x.dataset.fp); sp.page = 1; redraw(); };
    $('#sp-freset').onclick = () => { sp.status = []; sp.partners = []; sp.page = 1; redraw(); };
    v.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { const key = h.dataset.sort; sp.sort = { key, dir: sp.sort.key === key ? -sp.sort.dir : -1 }; redraw(); });
    v.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { sp.page = +b.dataset.pg; redraw(); });
    v.querySelectorAll('tr[data-aid]').forEach(r => r.onclick = e => { if (!e.target.closest('button')) allocDrawer(r.dataset.aid); });
    v.querySelectorAll('[data-release]').forEach(b => b.onclick = () => window.split_release([b.dataset.release]));
    v.querySelectorAll('[data-relall]').forEach(b => b.onclick = () => window.split_release(rows().filter(a => a.status === 'CREATED').map(a => a.id)));
    if ($('#sp-eclear')) { $('#sp-eclear').onclick = () => { sp.status = []; sp.partners = []; sp.q = ''; redraw(); }; $('#sp-eall').onclick = () => { sp.range = 'all'; redraw(); }; }
    $('#sp-dl').onclick = () => {
      const q = s => `"${String(s).replace(/"/g, '""')}"`;
      const list = rows(), csv = 'date,txnid,aggregator_sub_txn_id,partner,child_mid,split_type,amount,charges,status\n' + list.map(a => { const p = partnerOf(a); return [a.date.toISOString(), a.txnid, a.aggregatorSubTxnId, q(p.name), p.childMid || '', a.splitType, (a.amount / 100).toFixed(2), a.charges == null ? '' : (a.charges / 100).toFixed(2), a.status].join(','); }).join('\n') + '\n';
      const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); el.download = `bizpolepay-splits-${sp.range}.csv`; el.click(); toast(`Downloaded ${list.length} splits`);
    };
  }

  addStyle('split', `
    .sp-sum{display:flex;justify-content:space-between;align-items:center;background:var(--soft);border-radius:10px;padding:12px 14px;margin:10px 0}
    .sp-sum b{font-size:20px}
    .sp-line{padding:8px 0;border-top:1px solid var(--line);font-size:13px}
  `);

  BIND.split = () => {
    if (liveLocked()) return;
    $('#sp-add').onclick = () => partnerModal();
    $('#sp-rel').onclick = () => window.split_release(S().allocations.filter(a => a.status === 'CREATED').map(a => a.id));
    document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => show(b.dataset.sp));
    show(sp.tab);
  };
})();

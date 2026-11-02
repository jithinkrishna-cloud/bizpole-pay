// Page: split. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Split & transfer: child merchants (partners), split rules and per-payment split allocations ---- */
(() => {
  const PAGE_SIZE = 10, DAY = 864e5;
  const SSTATUS = ['PENDING', 'CREATED', 'RELEASED', 'FAILED'];
  const SLABEL = { PENDING: 'Pending', CREATED: 'Held', RELEASED: 'Released', FAILED: 'Failed' };
  const PCLS = { RELEASED: 'ok', CREATED: 'brand', PENDING: 'warn', FAILED: 'bad', Active: 'ok', 'Under review': 'warn', 'Documents pending': 'warn', Rejected: 'bad' };
  const pill = s => `<span class="pill ${PCLS[s] || ''}">${SLABEL[s] || s}</span>`;
  const SEARCH = [['sub', 'Sub-txn ID'], ['txnid', 'Transaction ID'], ['partner', 'Partner']];
  const RANGES = [['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['all', 'All time', null]];
  const mask = k => k ? k.slice(0, 2) + '••••••' + k.slice(-2) : '—';
  const ruleText = p => p.splitType === 'PERCENTAGE' ? `${p.value}% of each payment` : `${inr(p.value)} per payment`;
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(rnd() * 16); return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  /* ---------- mock data (test mode; live starts empty) ---------- */
  function build(){
    const partners = [
      ['Kochi Tutors Pvt Ltd', 8812045, 'kT9x2LmQ', 'Active', 'PERCENTAGE', 80, true, 140],
      ['Malabar Logistics', 8812071, 'mL4p8RzA', 'Active', 'ABSOLUTE', 6000, false, 120],
      ['Spice Route Kitchens', 8812088, 'sR7v1NcK', 'Active', 'PERCENTAGE', 15, true, 90],
      ['Periyar Crafts Collective', 8812102, 'pC2h6WqE', 'Under review', 'PERCENTAGE', 10, true, 6],
      ['Wayanad Homestays LLP', 8812119, 'wH5j3TdY', 'Documents pending', 'ABSOLUTE', 50000, false, 3],
    ].map(([name, childMid, childMerchantKey, onboardingStatus, splitType, value, hold, age], i) => ({ id: 'CM' + (410 + i), name, childMid, childMerchantKey, productAccountUuid: uuid(),
      onboardingStatus, splitType, value, hold, active: true, createdAt: new Date(now - age * DAY) }));
    const live = partners.filter(p => p.onboardingStatus === 'Active');
    const allocations = [];
    data.test.filter(t => t.status === 'SUCCESS').slice(0, 30).forEach((t, i) => {
      const chosen = i % 3 === 0 ? [live[i % live.length], live[(i + 1) % live.length]] : [live[i % live.length]];
      chosen.forEach((p, n) => {
        const amount = p.splitType === 'PERCENTAGE' ? Math.round(t.amount * p.value / 100 / (chosen.length > 1 && p.value > 50 ? 1.4 : 1)) : Math.min(p.value, Math.round(t.amount / 2));
        const charges = Math.round(amount * .005 * 1.18), r = rnd(), age = (now - t.date) / DAY;
        const status = r < .07 ? 'FAILED' : age < .6 && r < .3 ? 'PENDING' : p.hold && age < 5 ? 'CREATED' : 'RELEASED';
        allocations.push({ id: 'SA' + (90100 + allocations.length), txnid: t.txnid, partnerId: p.id, splitType: p.splitType, aggregatorSubTxnId: `${t.txnid}_S${n + 1}`, amount, charges,
          status, payuStatus: { PENDING: '2', CREATED: '1', RELEASED: '1', FAILED: '0' }[status], date: new Date(t.date.getTime() + 4 * 60e3),
          releasedAt: status === 'RELEASED' ? new Date(Math.min(now.getTime(), t.date.getTime() + (p.hold ? 2.5 : 1) * DAY)) : null, releaseStatus: status === 'RELEASED' ? 'success' : null,
          error: status === 'FAILED' ? pick(['Child merchant not active for split', 'Split amount exceeds transaction amount', 'Duplicate aggregatorSubTxnId']) : '' });
      });
    });
    return { partners, allocations };
  }
  const store = { test: build(), live: { partners: [], allocations: [] } };
  const S = () => store[state.mode];
  const partnerOf = a => S().partners.find(p => p.id === a.partnerId);
  const txOf = a => D().find(t => t.txnid === a.txnid) || {};

  /* ---------- view state ---------- */
  const sp = { tab: 'a', page: 1, field: 'sub', q: '', range: '30d', status: [], partners: [], sort: { key: 'date', dir: -1 } };
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);

  function rows(){
    const q = sp.q.trim().toLowerCase(), rg = RANGES.find(r => r[0] === sp.range)[2];
    const val = a => sp.field === 'sub' ? a.aggregatorSubTxnId : sp.field === 'txnid' ? a.txnid : partnerOf(a).name;
    return S().allocations.filter(a => (!rg || now - a.date <= rg * DAY) && (!sp.status.length || sp.status.includes(a.status)) && (!sp.partners.length || sp.partners.includes(a.partnerId))
      && (!q || val(a).toLowerCase().includes(q))).sort((a, b) => sp.sort.dir * (sp.sort.key === 'amount' ? a.amount - b.amount : a.date - b.date));
  }
  function kpis(){
    const al = S().allocations.filter(a => now - a.date <= 30 * DAY), ok = al.filter(a => a.status !== 'FAILED');
    const rel = al.filter(a => a.status === 'RELEASED'), held = al.filter(a => a.status === 'CREATED'), ps = S().partners;
    const sum = l => l.reduce((x, a) => x + a.amount, 0);
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Split volume (30 days)</small><b>${inr(sum(ok))}</b><span class="d muted">${ok.length} splits on ${new Set(ok.map(a => a.txnid)).size} payments</span></div>
      <div class="card kpi"><small>Released to partners</small><b>${inr(sum(rel))}</b><span class="d muted">${rel.length} splits · charges ${inr(rel.reduce((x, a) => x + a.charges, 0))}</span></div>
      <div class="card kpi"><small>Held for release</small><b>${inr(sum(held))}</b><span class="d muted">${held.length} splits waiting · ${al.filter(a => a.status === 'PENDING').length} pending at PayU</span></div>
      <div class="card kpi"><small>Partners</small><b>${ps.filter(p => p.active && p.onboardingStatus === 'Active').length}</b><span class="d muted">active · ${ps.filter(p => p.onboardingStatus !== 'Active').length} still onboarding</span></div></div>`;
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
  const noPartners = () => `<div class="card">${empty('Add your first partner', 'Partners are child merchants under your account. Once a partner is active, split part of any payment to them using a fixed amount or a percentage.', '<button class="btn sm primary" data-addp>+ Add partner</button>')}</div>`;

  /* ---------- Split payments ---------- */
  function renderAllocs(){
    if (!S().partners.length) return noPartners();
    const list = rows(), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); sp.page = Math.min(sp.page, pages);
    const held = list.filter(a => a.status === 'CREATED'), nF = sp.status.length + sp.partners.length, f = SEARCH.find(x => x[0] === sp.field);
    return `<div class="toolbar">
      <div class="searchbox"><select id="sp-sf">${SEARCH.map(([k, l]) => `<option value="${k}" ${k === sp.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="sp-sq" placeholder="Search ${f[1]}" value="${esc(sp.q)}"><button class="btn primary" id="sp-sgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="sprange"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === sp.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-sprange">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === sp.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="spfilter"><i data-icon=list-filter class=li></i> Filter${nF ? ` <span class="pill brand">${nF}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-spfilter"><h6>Status</h6>${SSTATUS.map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${sp.status.includes(s) ? 'checked' : ''}>${SLABEL[s]}</label>`).join('')}
          <h6>Partner</h6>${S().partners.map(p => `<label class="ck"><input type="checkbox" data-fp="${p.id}" ${sp.partners.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sp-freset">Reset</button><button class="btn sm primary" id="sp-fapply">Apply</button></div></div></div>
      <span style="flex:1"></span>
      ${held.length ? `<button class="btn" data-relall>⇥ Release ${held.length} held · ${inr(held.reduce((x, a) => x + a.amount, 0))}</button>` : ''}
      <button class="btn" id="sp-dl"><i data-icon=download class=li></i> Download CSV</button></div>
    <div class="tbl-wrap"><table><thead><tr>${sortHead('date', 'Date')}<th>Payment (Txn ID)</th><th>Partner</th><th>Sub-txn ID</th>${sortHead('amount', 'Split amount', 'right')}<th class="right">Charges</th><th class="right">Net to partner</th><th>Status</th><th class="right">Action</th></tr></thead>
    <tbody>${list.length ? list.slice((sp.page - 1) * PAGE_SIZE, sp.page * PAGE_SIZE).map(a => { const t = txOf(a), p = partnerOf(a);
      return `<tr class="click" data-aid="${a.id}"><td>${fmtDate(a.date)}</td><td><span class="mono">${a.txnid}</span><div class="muted" style="font-size:12px">${inr(t.amount || 0)} · ${esc(t.name || '—')}</div></td>
        <td>${esc(p.name)}<div class="muted" style="font-size:12px">${a.splitType === 'PERCENTAGE' ? p.value + '%' : 'Fixed'}</div></td><td class="mono">${a.aggregatorSubTxnId}</td>
        <td class="right"><b>${inr(a.amount)}</b></td><td class="right muted">${inr(a.charges)}</td><td class="right">${inr(a.amount - a.charges)}</td><td>${pill(a.status)}</td>
        <td class="right">${a.status === 'CREATED' ? `<button class="btn sm" data-release="${a.id}">Release</button>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')
      : `<tr><td colspan="9">${empty("We couldn't find any splits", 'Remove the filters or widen the date range and try again.', '<button class="btn sm" id="sp-eclear">Clear filters</button><button class="btn sm" id="sp-eall">Show all time</button>')}</td></tr>`}</tbody></table></div>` + pager(list.length);
  }

  /* ---------- Partners ---------- */
  function renderPartners(){
    const ps = S().partners;
    if (!ps.length) return noPartners();
    return `<div class="tbl-wrap"><table><thead><tr><th>Partner</th><th>Child MID</th><th>Child merchant key</th><th>Split rule</th><th>Settlement</th><th>Onboarding</th><th class="right">Released (30d)</th><th class="right">Held</th><th>State</th></tr></thead>
    <tbody>${ps.map(p => { const al = S().allocations.filter(a => a.partnerId === p.id && now - a.date <= 30 * DAY);
      return `<tr class="click" data-pid="${p.id}"><td><b style="font-weight:600">${esc(p.name)}</b><div class="mono muted" style="font-size:11.5px">${p.id}</div></td><td class="mono">${p.childMid}</td><td class="mono">${mask(p.childMerchantKey)}</td>
        <td>${ruleText(p)}</td><td>${p.hold ? 'Held until released' : 'Auto-release'}</td><td>${pill(p.onboardingStatus)}</td>
        <td class="right">${inr(al.filter(a => a.status === 'RELEASED').reduce((x, a) => x + a.amount, 0))}</td><td class="right">${inr(al.filter(a => a.status === 'CREATED').reduce((x, a) => x + a.amount, 0))}</td>
        <td>${p.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Paused</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="grid g3" style="margin-top:16px">
      <div class="card tile"><div class="ic">%</div><div><b>Percentage rules</b><p>The partner gets a share of each payment. Bizpole Pay sends the split to PayU with the payment's aggregatorSubTxnId.</p></div></div>
      <div class="card tile"><div class="ic">₹</div><div><b>Fixed amount rules</b><p>A flat amount per payment, capped at half the payment so your own share is never negative.</p></div></div>
      <div class="card tile"><div class="ic">⇥</div><div><b>Held settlements</b><p>Held splits wait until you release them, for example after delivery. Released splits settle to the partner on the next cycle.</p></div></div></div>`;
  }

  /* ---------- drawers, dialogs, actions ---------- */
  function allocDrawer(id){
    const a = S().allocations.find(x => x.id === id), t = txOf(a), p = partnerOf(a), siblings = S().allocations.filter(x => x.txnid === a.txnid);
    const yours = (t.amount || 0) - siblings.filter(x => x.status !== 'FAILED').reduce((s, x) => s + x.amount, 0);
    const steps = [['Payment captured', true, fmtDate(t.date || a.date)], ['Split sent to PayU', true, fmtDate(a.date)], ['Accepted by PayU (status 1)', ['CREATED', 'RELEASED'].includes(a.status), a.status === 'FAILED' ? 'rejected' : a.status === 'PENDING' ? 'awaiting status' : 'ok'],
      [p.hold ? 'Settlement released' : 'Auto-released', a.status === 'RELEASED', a.releasedAt ? fmtDate(a.releasedAt) : 'not yet'], ['Settled to partner', a.status === 'RELEASED' && now - a.releasedAt > DAY, a.status === 'RELEASED' ? 'next settlement cycle' : '—']];
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">Split to ${esc(p.name)}</div><h2 style="margin:0">${inr(a.amount)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(a.status)} <span class="muted">${fmtDate(a.date)}</span></p>
      ${a.status === 'FAILED' ? `<div class="card" style="background:var(--bad-soft);border-color:transparent;margin-bottom:14px"><b>Split failed:</b> ${a.error}. The full amount stays with you.</div>` : ''}
      ${a.status === 'CREATED' ? `<div class="card" style="background:var(--brand-soft);border-color:transparent;margin-bottom:14px"><b>Held.</b> This split settles to the partner only after you release it.</div>` : ''}
      <h3>Split</h3><dl class="kv"><dt>Sub-txn ID</dt><dd class="mono">${a.aggregatorSubTxnId}</dd><dt>Split type</dt><dd>${a.splitType === 'PERCENTAGE' ? 'Percentage · ' + p.value + '%' : 'Absolute'}</dd>
        <dt>Amount</dt><dd>${inr(a.amount)}</dd><dt>Charges</dt><dd>${inr(a.charges)}</dd><dt>Net to partner</dt><dd><b>${inr(a.amount - a.charges)}</b></dd><dt>PayU status</dt><dd class="mono">${a.payuStatus}</dd>${a.releaseStatus ? `<dt>Release response</dt><dd class="mono">${a.releaseStatus}</dd>` : ''}</dl>
      <h3 style="margin-top:18px">Partner</h3><dl class="kv"><dt>Name</dt><dd>${esc(p.name)}</dd><dt>Child MID</dt><dd class="mono">${p.childMid}</dd><dt>Merchant key</dt><dd class="mono">${mask(p.childMerchantKey)}</dd></dl>
      <h3 style="margin-top:18px">Original payment</h3><dl class="kv"><dt>Txn ID</dt><dd class="mono">${a.txnid}</dd><dt>PayU ID</dt><dd class="mono">${t.mihpayid || '—'}</dd><dt>Customer</dt><dd>${esc(t.name || '—')}</dd><dt>Payment</dt><dd>${inr(t.amount || 0)} · ${t.mode || '—'}</dd>
        <dt>Splits</dt><dd>${siblings.map(x => `${esc(partnerOf(x).name)} ${inr(x.amount)}`).join('<br>')}</dd><dt>Your share</dt><dd><b>${inr(yours)}</b></dd></dl>
      <h3 style="margin-top:18px">Progress</h3>${steps.map(([s, d, sub]) => `<p style="font-size:13px;margin:6px 0"><span class="dot ${d ? '' : a.status === 'FAILED' && s.startsWith('Accepted') ? 'bad' : 'warn'}"></span>${s} <span class="muted">· ${sub}</span></p>`).join('')}
      <div class="row" style="margin-top:20px">${a.status === 'CREATED' ? `<button class="btn primary" onclick="split_release(['${a.id}'])">⇥ Release settlement</button>` : ''}
        ${a.status === 'PENDING' ? `<button class="btn" onclick="toast('Split status re-checked with PayU')">Check status</button>` : ''}
        <button class="btn" onclick="closeAll();go('transactions')">View transactions</button></div>`);
  }
  window.split_release = ids => {
    const list = ids.map(id => S().allocations.find(a => a.id === id)).filter(a => a && a.status === 'CREATED');
    if (!list.length) return toast('Nothing held to release');
    const total = list.reduce((x, a) => x + a.amount, 0), byP = [...new Set(list.map(a => a.partnerId))];
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Release settlement?</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">${list.length} held split${list.length > 1 ? 's' : ''} to ${byP.length} partner${byP.length > 1 ? 's' : ''}</p>
      <div class="sp-sum"><span>Amount to release</span><b>${inr(total)}</b></div>
      <p style="font-size:13.5px">PayU will settle these amounts to the partners on their next settlement cycle. A released split can't be held again; to reverse it, refund the payment.</p>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="sp-confirm">Release ${inr(total)}</button></div>`);
    $('#sp-confirm').onclick = () => {
      list.forEach(a => { a.status = 'RELEASED'; a.releasedAt = new Date(); a.releaseStatus = 'success'; });
      closeAll(); toast(`${list.length} split${list.length > 1 ? 's' : ''} released · ${inr(total)}`); redraw();
    };
  };
  function partnerDrawer(id){
    const p = S().partners.find(x => x.id === id), al = S().allocations.filter(a => a.partnerId === id).sort((a, b) => b.date - a.date);
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">Partner · child merchant</div><h2 style="margin:0">${esc(p.name)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(p.onboardingStatus)} ${p.active ? '' : '<span class="pill">Paused</span>'} <span class="muted">added ${fmtDate(p.createdAt)}</span></p>
      ${p.onboardingStatus !== 'Active' ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Onboarding: ${p.onboardingStatus}.</b> Splits to this partner will be rejected until PayU activates the child account.</div>` : ''}
      <h3>Account</h3><dl class="kv"><dt>Partner ID</dt><dd class="mono">${p.id}</dd><dt>Child MID</dt><dd class="mono">${p.childMid}</dd><dt>Child merchant key</dt><dd class="mono">${mask(p.childMerchantKey)}</dd><dt>Product account</dt><dd class="mono">${p.productAccountUuid}</dd></dl>
      <h3 style="margin-top:18px">Split rule</h3><dl class="kv"><dt>Rule</dt><dd>${ruleText(p)}</dd><dt>Type</dt><dd>${p.splitType}</dd><dt>Settlement</dt><dd>${p.hold ? 'Held until you release' : 'Released automatically'}</dd></dl>
      <h3 style="margin-top:18px">Recent splits</h3>${al.length ? al.slice(0, 6).map(a => `<div class="between sp-line"><div><span class="mono">${a.aggregatorSubTxnId}</span><div class="muted" style="font-size:12px">${fmtDate(a.date)}</div></div><span style="flex:none">${inr(a.amount)} ${pill(a.status)}</span></div>`).join('') : '<p class="muted" style="font-size:13px">No splits yet.</p>'}
      <div class="row" style="margin-top:20px"><button class="btn primary" onclick="split_editPartner('${p.id}')">Edit split rule</button><button class="btn ${p.active ? 'danger' : ''}" onclick="split_toggle('${p.id}')">${p.active ? 'Pause splits' : 'Resume splits'}</button></div>`);
  }
  window.split_toggle = id => { const p = S().partners.find(x => x.id === id); p.active = !p.active; toast(`${p.name}: splits ${p.active ? 'resumed' : 'paused'}`); redraw(); partnerDrawer(id); };
  window.split_editPartner = id => partnerModal(S().partners.find(x => x.id === id));
  function partnerModal(edit){
    const e = edit || { name: '', childMid: '', childMerchantKey: '', splitType: 'PERCENTAGE', value: '', hold: true };
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${edit ? 'Edit split rule' : 'Add partner'}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      ${edit ? `<p class="muted">${esc(e.name)} · MID ${e.childMid}</p>` : `<p class="muted" style="margin-bottom:0">Link a child merchant created under your PayU aggregator account.</p>
      <label>Partner name</label><input id="pp-name" maxlength="80" placeholder="Registered business name">
      <div class="row"><div><label>Child MID</label><input id="pp-mid" inputmode="numeric" placeholder="e.g. 8812150"></div><div><label>Child merchant key</label><input id="pp-key" autocomplete="off" placeholder="From the child account"></div></div>`}
      <div class="row"><div><label>Split type</label><select id="pp-type"><option value="PERCENTAGE" ${e.splitType === 'PERCENTAGE' ? 'selected' : ''}>Percentage of payment</option><option value="ABSOLUTE" ${e.splitType === 'ABSOLUTE' ? 'selected' : ''}>Fixed amount</option></select></div>
        <div><label id="pp-vl">Value</label><input id="pp-val" type="number" step="0.01" min="0" value="${e.value === '' ? '' : e.splitType === 'ABSOLUTE' ? (e.value / 100).toFixed(2) : e.value}"></div></div>
      <label class="ck" style="margin-top:14px!important"><input type="checkbox" id="pp-hold" ${e.hold ? 'checked' : ''}>Hold each split until I release it</label>
      <div id="pp-err"></div>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="pp-go">${edit ? 'Save rule' : 'Add partner'}</button></div>`);
    const lbl = () => { $('#pp-vl').textContent = $('#pp-type').value === 'PERCENTAGE' ? 'Share (%)' : 'Amount per payment (₹)'; };
    $('#pp-type').onchange = lbl; lbl();
    $('#pp-go').onclick = () => {
      const type = $('#pp-type').value, raw = parseFloat($('#pp-val').value), value = type === 'PERCENTAGE' ? raw : Math.round(raw * 100);
      let err = '';
      const name = edit ? e.name : $('#pp-name').value.trim(), mid = edit ? e.childMid : $('#pp-mid').value.trim(), key = edit ? e.childMerchantKey : $('#pp-key').value.trim();
      if (!edit) {
        err = name.length < 2 ? 'Enter the partner name.' : !/^\d{6,10}$/.test(mid) ? 'Child MID must be 6–10 digits.' : S().partners.some(p => String(p.childMid) === mid) ? 'This child MID is already linked.'
          : !/^[A-Za-z0-9]{6,32}$/.test(key) ? 'Child merchant key must be 6–32 letters or digits.' : S().partners.some(p => p.childMerchantKey === key) ? 'This merchant key is already linked to another partner.' : '';
      }
      if (!err) err = type === 'PERCENTAGE' ? (!(raw > 0 && raw <= 100) ? 'Share must be more than 0% and at most 100%.' : '') : !(value >= 100) ? 'Fixed amount must be at least ₹1.00.' : '';
      if (err) { $('#pp-err').innerHTML = `<div class="notice bad">${err}</div>`; return; }
      if (edit) { Object.assign(edit, { splitType: type, value: type === 'PERCENTAGE' ? Math.round(raw * 100) / 100 : value, hold: $('#pp-hold').checked }); closeAll(); toast('Split rule updated'); redraw(); return; }
      S().partners.push({ id: 'CM' + (410 + S().partners.length + 7), name, childMid: Number(mid), childMerchantKey: key, productAccountUuid: uuid(), onboardingStatus: 'Under review',
        splitType: type, value: type === 'PERCENTAGE' ? Math.round(raw * 100) / 100 : value, hold: $('#pp-hold').checked, active: true, createdAt: new Date() });
      closeAll(); toast(`${name} added · PayU is reviewing the child account`); sp.tab = 'p'; redraw();
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
      const list = rows(), csv = 'date,txnid,aggregator_sub_txn_id,partner,child_mid,split_type,amount,charges,status\n' + list.map(a => { const p = partnerOf(a); return [a.date.toISOString(), a.txnid, a.aggregatorSubTxnId, `"${p.name}"`, p.childMid, a.splitType, (a.amount / 100).toFixed(2), (a.charges / 100).toFixed(2), a.status].join(','); }).join('\n') + '\n';
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

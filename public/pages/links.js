// Page: links. Uses globals from app.html core (state, links, api, LOAD, helpers, PAGES, BIND).
/* ---- Payment links ---- */
// Data: /api/links (server/routes/links.js). Payments on a link are successful transactions on orders tied to it.
// PayU's payment-link API isn't connected yet, so new links have no URL until PayU issues one.
(() => {
  const PAGE = 10, DAY = 864e5;
  const RANGES = [['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['90d', 'Last 90 days', 90], ['all', 'All time', null]];
  const FIELDS = [['invoiceNumber', 'Invoice number'], ['id', 'Link ID'], ['customer', 'Customer']];
  const STATUSES = ['ACTIVE', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'DEACTIVATED'];
  const CHANNELS = [['sms', 'SMS'], ['email', 'Email'], ['whatsapp', 'WhatsApp']];
  const lk = { page: 1, range: 'all', field: 'invoiceNumber', q: '', status: [], sort: { key: 'created', dir: -1 } };

  const fmtDay = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const shortDay = d => d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
  const norm = l => ({ ...l, created: toDate(l.created), expiresAt: toDate(l.expiresAt), payments: (l.payments || []).map(p => ({ ...p, date: toDate(p.date) })) });
  const put = l => { const n = norm(l), list = links[state.mode], i = list.findIndex(x => x.id === n.id); if (i >= 0) list[i] = n; else list.unshift(n); return n; };
  LOAD.links = async mode => { links[mode] = (await api('/links', { mode })).links.map(norm); };

  const L = () => links[state.mode];
  const paid = l => (l.payments || []).reduce((a, p) => a + p.amount, 0);
  const isOpen = l => ['ACTIVE', 'PARTIALLY_PAID'].includes(l.status);
  const pill = st => st === 'PARTIALLY_PAID' ? '<span class="pill warn">Partially paid</span>' : st === 'DEACTIVATED' ? '<span class="pill">Deactivated</span>' : statusPill(st);
  const copy = (txt, msg) => { try { navigator.clipboard && navigator.clipboard.writeText(txt); } catch (e) { /* clipboard may be blocked */ } toast(msg); };
  const NO_URL = 'PayU issues the link URL once the link is created on PayU. That connection isn’t set up yet, so this link is saved here without a URL.';
  const NO_SEND = 'Sending by SMS, email or WhatsApp needs a messaging provider, which isn’t set up yet.';
  const shortId = id => String(id).slice(-8).toUpperCase();

  addStyle('links', `
    .lk-ac{display:flex;gap:6px;justify-content:flex-end}
    .lk-url{display:flex;gap:8px;align-items:center;background:var(--soft);border-radius:10px;padding:8px 10px}
    .lk-url code{flex:1;font:12.5px "JetBrains Mono",monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .lk-pend{background:var(--accent-soft);border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.5}
    .lk-share{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
    .lk-share .btn{min-width:0;padding:8px 6px;font-size:12.5px}
    .modal:has(.lk-form){width:min(640px,calc(100% - 32px));max-height:calc(100vh - 40px);overflow:auto}
    .lk-form .g{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
    .lk-form .full{grid-column:1/-1}
    .lk-err{color:var(--bad);font-size:12px;margin-top:4px;min-height:0}
    .lk-form .bad{border-color:var(--bad)}
    .lk-seg{display:flex;gap:8px}
    .lk-seg label{flex:1;margin:0;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer;font-weight:500;font-size:13.5px;display:flex;gap:8px;align-items:flex-start}
    .lk-seg label:has(input:checked){border-color:var(--brand);background:var(--brand-soft)}
    .lk-seg input{width:auto;margin-top:3px}
    .lk-sec{font:600 11px "Instrument Sans";letter-spacing:.06em;color:var(--muted);text-transform:uppercase;margin:18px 0 0;padding-top:12px;border-top:1px solid var(--line)}
    .lk-ok{text-align:center;padding:6px 0}
    .lk-ok .ic{width:54px;height:54px;border-radius:50%;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;font-size:26px;margin:0 auto 10px}
    .lk-mini{height:6px;border-radius:9px;background:var(--soft);overflow:hidden;width:90px;margin-top:4px}
    .lk-mini i{display:block;height:100%;background:var(--ok)}
    @media (max-width:820px){ .lk-form .g{grid-template-columns:1fr} .lk-share{grid-template-columns:repeat(2,1fr)} }
  `);

  function rows(){
    const q = lk.q.trim().toLowerCase(), rg = RANGES.find(x => x[0] === lk.range)[2];
    return L().filter(l => (!rg || l.created >= now - rg * DAY) && (!lk.status.length || lk.status.includes(l.status)) &&
      (!q || String(lk.field === 'customer' ? `${l.customer} ${l.phone} ${l.email}` : l[lk.field] || '').toLowerCase().includes(q)))
      .sort((a, b) => lk.sort.dir * (lk.sort.key === 'amount' ? (a.amount || 0) - (b.amount || 0) : lk.sort.key === 'expires' ? (a.expiresAt || 8.64e15) - (b.expiresAt || 8.64e15) : a.created - b.created));
  }
  function kpis(){
    const all = L(), open = all.filter(isOpen), pays = all.flatMap(l => l.payments || []);
    const soon = open.filter(l => l.expiresAt && l.expiresAt - now <= 7 * DAY && l.expiresAt >= now);
    const paidLinks = all.filter(l => l.status === 'PAID');
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Active links <i data-icon=info class=li></i></small><b>${open.length}</b><span class="d muted">${open.filter(l => l.status === 'PARTIALLY_PAID').length} partially paid · ${all.length} total</span></div>
      <div class="card kpi"><small>Collected via links <i data-icon=info class=li></i></small><b>${inr(pays.reduce((a, p) => a + p.amount, 0))}</b><span class="d muted">${pays.length} payments received</span></div>
      <div class="card kpi"><small>Paid links <i data-icon=info class=li></i></small><b>${paidLinks.length}</b><span class="d muted">${all.length ? Math.round(paidLinks.length / all.length * 100) : 0}% of all links</span></div>
      <div class="card kpi"><small>Expiring in 7 days <i data-icon=info class=li></i></small><b>${soon.length}</b><span class="d ${soon.length ? '' : 'muted'}" style="${soon.length ? 'color:var(--warn)' : ''}">${soon.length ? inr(soon.reduce((a, l) => a + Math.max(0, (l.amount || 0) - paid(l)), 0)) + ' still due' : 'Nothing expiring soon'}</span></div></div>`;
  }
  function toolbar(){
    const f = FIELDS.find(x => x[0] === lk.field);
    return `<div class="toolbar">
      <div class="searchbox"><select id="lkf" aria-label="Search field">${FIELDS.map(([k, l]) => `<option value="${k}" ${k === lk.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="lkq" placeholder="Search ${f[1].toLowerCase()}${lk.field === 'customer' ? ', phone or email' : ''}" value="${esc(lk.q)}"><button class="btn primary" id="lkgo">Search</button></div>
      <div class="dd"><button class="btn" data-lkdd="range"><i data-icon=calendar class=li></i> ${RANGES.find(x => x[0] === lk.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="lkdd-range">${RANGES.map(([k, l]) => `<button data-lkrange="${k}" class="${k === lk.range ? 'on' : ''}">Created · ${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-lkdd="filter"><i data-icon=list-filter class=li></i> Filter${lk.status.length ? ` <span class="pill brand">${lk.status.length}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="lkdd-filter"><h6>Status</h6>${STATUSES.map(st => `<label class="ck"><input type="checkbox" data-lkfs="${st}" ${lk.status.includes(st) ? 'checked' : ''}>${st === 'PARTIALLY_PAID' ? 'Partially paid' : st[0] + st.slice(1).toLowerCase()}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="lkfreset">Reset</button><button class="btn sm primary" id="lkfapply">Apply</button></div></div></div>
      <span style="flex:1"></span>
      <button class="btn" id="lkdl" ${L().length ? '' : 'disabled'}><i data-icon=download class=li></i> Download</button>
    </div>`;
  }
  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-lksort="${key}">${label} <span class="muted">${lk.sort.key === key ? (lk.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;
  function emptyRow(){
    const none = !L().length;
    return `<tr><td colspan="9"><div class="empty-state"><div class="box">${none ? '<i data-icon=link class=li></i>' : '<i data-icon=package-open class=li></i>'}</div><div>
      <p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">${none ? 'NO PAYMENT LINKS YET' : 'NO RESULTS FOUND'}</p>
      <h3 style="margin:4px 0 6px;font-size:20px">${none ? `Create your first ${state.mode} payment link` : 'No links match these filters'}</h3>
      <p class="muted" style="margin:0 0 12px">${none ? 'Request a payment for an invoice or order without building a website.' : 'Clear the filters or search, or widen the date range.'}</p>
      <div class="row" style="gap:8px">${none ? '<button class="btn sm primary" id="lkecreate">+ Create link</button>' : '<button class="btn sm" id="lkeclear">Clear filters</button><button class="btn sm" id="lkeall">Show all time</button>'}</div></div></div></td></tr>`;
  }
  function pager(total){
    const pages = Math.max(1, Math.ceil(total / PAGE)), from = (lk.page - 1) * PAGE + 1, to = Math.min(total, lk.page * PAGE);
    return total ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${total}</span>
      <span class="pager"><button class="btn sm" data-lkpg="${lk.page - 1}" ${lk.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === lk.page ? 'primary' : ''}" data-lkpg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="btn sm" data-lkpg="${lk.page + 1}" ${lk.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
  }
  function amountCell(l){
    if (l.customerAmount) return `<span class="chip" style="cursor:default">Customer enters</span>`;
    return `<b>${inr(l.amount)}</b>${l.partial ? `<div class="muted" style="font-size:11.5px">Partial · min ${inr(l.minAmount)}</div>` : ''}`;
  }
  function collectedCell(l){
    const p = paid(l);
    if (l.customerAmount) return `<b>${inr(p)}</b><div class="muted" style="font-size:11.5px">${l.payments.length}${l.maxPayments ? ` of ${l.maxPayments}` : ''} payments</div>`;
    const pct = l.amount ? Math.min(100, Math.round(p / l.amount * 100)) : 0;
    return `<b>${inr(p)}</b><div class="lk-mini" style="margin-left:auto"><i style="width:${pct}%"></i></div>`;
  }
  function table(){
    const all = rows(), pages = Math.max(1, Math.ceil(all.length / PAGE));
    lk.page = Math.min(lk.page, pages);
    return `<div class="tbl-wrap"><table><thead><tr>${sortHead('created', 'Created')}<th>Invoice · Link ID</th><th>Description</th><th>Customer</th>${sortHead('amount', 'Amount', 'right')}<th class="right">Collected</th>${sortHead('expires', 'Expires')}<th>Status</th><th class="right">Actions</th></tr></thead>
      <tbody>${all.length ? all.slice((lk.page - 1) * PAGE, lk.page * PAGE).map(l => `<tr class="click" data-lk="${l.id}">
        <td>${shortDay(l.created)}</td><td><span class="mono">${esc(l.invoiceNumber)}</span><div class="mono muted" style="font-size:11.5px" title="${l.id}">…${shortId(l.id)}</div></td>
        <td style="white-space:normal;min-width:180px;max-width:280px">${esc(l.desc)}</td>
        <td>${esc(l.customer)}${l.phone ? `<div class="muted" style="font-size:11.5px">+91 ${esc(l.phone)}</div>` : ''}</td>
        <td class="right">${amountCell(l)}</td><td class="right">${collectedCell(l)}</td>
        <td>${l.expiresAt ? `${shortDay(l.expiresAt)}${isOpen(l) && l.expiresAt - now <= 7 * DAY ? ' <span class="pill warn" style="font-size:11px">Soon</span>' : ''}` : '<span class="muted">No expiry</span>'}</td>
        <td>${pill(l.status)}${l.url ? '' : '<div class="muted" style="font-size:11px">URL pending</div>'}</td>
        <td><div class="lk-ac"><button class="btn sm" data-lkcopy="${l.id}" ${l.url ? 'title="Copy link"' : `disabled title="${esc(NO_URL)}"`}><i data-icon=copy class=li></i> Copy</button></div></td></tr>`).join('') : emptyRow()}</tbody></table></div>` + pager(all.length);
  }

  PAGES.links = () => {
    if (liveLocked()) return head('Payment links') + locked('Payment links');
    return head('Payment links', 'Collect payments without a website. Create a link for an invoice or order and share it with your customer.', `<button class="btn primary" id="lknew">+ Create link</button>`) +
      `<div id="lkview"></div>`;
  };
  function closeMenus(){ document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); }
  function draw(){
    const v = $('#lkview'); if (!v) return;
    v.innerHTML = kpis() + toolbar() + table();
    bindView();
  }
  function bindView(){
    document.querySelectorAll('[data-lkdd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#lkdd-' + b.dataset.lkdd), open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); });
    document.querySelectorAll('#lkview .menu').forEach(m => m.onclick = e => e.stopPropagation());
    $('#lkf').onchange = e => { lk.field = e.target.value; lk.q = ''; lk.page = 1; draw(); };
    const search = () => { lk.q = $('#lkq').value; lk.page = 1; draw(); };
    $('#lkgo').onclick = search;
    $('#lkq').onkeydown = e => { if (e.key === 'Enter') search(); };
    document.querySelectorAll('[data-lkrange]').forEach(b => b.onclick = () => { lk.range = b.dataset.lkrange; lk.page = 1; draw(); });
    $('#lkfapply').onclick = () => { lk.status = [...document.querySelectorAll('[data-lkfs]:checked')].map(x => x.dataset.lkfs); lk.page = 1; draw(); };
    $('#lkfreset').onclick = () => { lk.status = []; lk.page = 1; draw(); };
    $('#lkdl').onclick = () => {
      const list = rows(), cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
      const csv = 'link_id,invoice_number,created,description,customer,phone,email,amount,collected,expires,status,url\n' + list.map(l => [l.id, l.invoiceNumber, l.created.toISOString(), l.desc, l.customer, l.phone, l.email,
        l.amount == null ? '' : (l.amount / 100).toFixed(2), (paid(l) / 100).toFixed(2), l.expiresAt ? l.expiresAt.toISOString().slice(0, 10) : '', l.status, l.url || ''].map(cell).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv + '\n'], { type: 'text/csv' })); a.download = `bizpolepay-payment-links-${state.mode}-${lk.range}.csv`; a.click();
      toast(`Downloaded ${list.length} links`);
    };
    document.querySelectorAll('[data-lksort]').forEach(h => h.onclick = () => { const key = h.dataset.lksort; lk.sort = { key, dir: lk.sort.key === key ? -lk.sort.dir : -1 }; draw(); });
    document.querySelectorAll('[data-lkpg]').forEach(b => b.onclick = () => { lk.page = +b.dataset.lkpg; draw(); });
    document.querySelectorAll('[data-lkcopy]').forEach(b => b.onclick = e => { e.stopPropagation(); window.links_copy(b.dataset.lkcopy); });
    document.querySelectorAll('.lk-ac').forEach(a => a.onclick = e => e.stopPropagation());
    document.querySelectorAll('tr[data-lk]').forEach(tr => tr.onclick = () => drawer(tr.dataset.lk));
    if ($('#lkeclear')) { $('#lkeclear').onclick = () => { lk.status = []; lk.q = ''; lk.page = 1; draw(); }; $('#lkeall').onclick = () => { lk.range = 'all'; lk.page = 1; draw(); }; }
    if ($('#lkecreate')) $('#lkecreate').onclick = () => createModal();
  }

  function drawer(id){
    const l = L().find(x => x.id === id); if (!l) return;
    const p = paid(l), pct = l.amount ? Math.min(100, Math.round(p / l.amount * 100)) : 0, open = isOpen(l);
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">${esc(l.invoiceNumber)}</div><h2 style="margin:2px 0 0">${l.customerAmount ? 'Customer enters amount' : inr(l.amount)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(l.status)} <span class="muted">${esc(l.desc)}</span></p>
      ${l.url ? `<div class="lk-url"><code>${esc(l.url)}</code><button class="btn sm" onclick="links_copy('${l.id}')"><i data-icon=copy class=li></i> Copy</button></div>`
        : `<div class="lk-pend"><b>Link URL pending</b><br>${NO_URL}</div>`}
      <div class="lk-share">${CHANNELS.map(([k, n]) => `<button class="btn" disabled title="${esc(NO_SEND)}">${k === 'sms' ? '✉' : k === 'email' ? '@' : '◍'} ${n}</button>`).join('')}<button class="btn" ${l.url ? '' : 'disabled'} onclick="links_copy('${l.id}')"><i data-icon=copy class=li></i> Copy</button></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">${NO_SEND}</p>
      <h3 style="margin-top:20px">Collection</h3>
      ${l.customerAmount ? `<p style="margin:4px 0"><b>${inr(p)}</b> <span class="muted">from ${l.payments.length}${l.maxPayments ? ` of ${l.maxPayments} allowed` : ''} payments</span></p>`
        : `<div class="between" style="font-size:13px"><span><b>${inr(p)}</b> <span class="muted">of ${inr(l.amount)}</span></span><span class="muted">${pct}%</span></div><div class="prog"><i style="width:${pct}%"></i></div>`}
      <h3 style="margin-top:14px">Details</h3><dl class="kv">
        <dt>Link ID</dt><dd class="mono" style="word-break:break-all">${l.id}</dd><dt>Invoice number</dt><dd class="mono">${esc(l.invoiceNumber)}</dd>
        <dt>Created</dt><dd>${fmtDate(l.created)}</dd><dt>Expires</dt><dd>${l.expiresAt ? fmtDay(l.expiresAt) : 'No expiry'}</dd>
        <dt>Amount</dt><dd>${l.customerAmount ? 'Entered by customer' : 'Fixed · ' + inr(l.amount)}</dd>
        <dt>Partial payments</dt><dd>${l.partial ? `Allowed · min ${inr(l.minAmount)}` : 'No'}</dd>
        <dt>Max payments</dt><dd>${l.maxPayments || '—'}</dd>
        <dt>Link URL</dt><dd>${l.url ? 'Issued by PayU' : 'Not issued yet'}</dd></dl>
      <h3 style="margin-top:18px">Customer</h3><dl class="kv"><dt>Name</dt><dd>${esc(l.customer)}</dd><dt>Phone</dt><dd>${l.phone ? '+91 ' + esc(l.phone) : '—'}</dd><dt>Email</dt><dd>${esc(l.email || '—')}</dd></dl>
      <h3 style="margin-top:18px">Payments received <span class="muted" style="font-weight:500">(${l.payments.length})</span></h3>
      ${l.payments.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>PayU ID</th><th>Mode</th><th class="right">Amount</th></tr></thead><tbody>
        ${l.payments.slice().sort((a, b) => b.date - a.date).map(x => `<tr><td>${fmtDate(x.date)}</td><td class="mono">${esc(x.mihpayid)}</td><td>${esc(x.mode)}</td><td class="right"><b>${inr(x.amount)}</b></td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted" style="font-size:13px">No payments yet.</p>`}
      ${open ? `<div class="row" style="margin-top:20px"><button class="btn" onclick="links_extend('${l.id}')"><i data-icon=calendar class=li></i> Extend expiry</button><button class="btn danger" onclick="links_deactivate('${l.id}')">Deactivate link</button></div>`
        : l.status === 'EXPIRED' ? `<div class="row" style="margin-top:20px"><button class="btn" onclick="links_extend('${l.id}')"><i data-icon=calendar class=li></i> Reactivate with new expiry</button></div>` : ''}`);
  }

  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => isoDay(new Date());
  const endOfDay = v => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59); };
  const busy = (btn, on, label) => { if (btn) { btn.disabled = on; if (label) btn.textContent = label; } };

  function extendModal(id){
    const l = L().find(x => x.id === id); if (!l) return;
    const base = l.expiresAt && l.expiresAt > now ? l.expiresAt : new Date();
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${l.status === 'EXPIRED' ? 'Reactivate' : 'Extend'} ${esc(l.invoiceNumber)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">Current expiry: <b style="color:var(--ink)">${l.expiresAt ? fmtDay(l.expiresAt) : 'No expiry'}</b></p>
      <label for="lkxd">New expiry date</label><input id="lkxd" type="date" min="${today()}" value="${isoDay(new Date(base.getTime() + 7 * DAY))}"><div class="lk-err" id="lkxe"></div>
      <div class="row" style="margin-top:16px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="lkxgo">Save expiry</button></div>`);
    $('#lkxgo').onclick = async () => {
      const v = $('#lkxd').value;
      if (!v) return $('#lkxe').textContent = 'Choose a date';
      if (v < today()) return $('#lkxe').textContent = 'Expiry date can’t be in the past';
      busy($('#lkxgo'), true, 'Saving…');
      try {
        const n = put(await api('/links/' + encodeURIComponent(l.id), { method: 'PATCH', body: { expiresAt: endOfDay(v).toISOString() } }));
        closeAll(); draw(); drawer(n.id); toast(`${n.invoiceNumber} now expires on ${fmtDay(n.expiresAt)}`);
      } catch (e) { busy($('#lkxgo'), false, 'Save expiry'); $('#lkxe').textContent = e.message; }
    };
  }
  function deactivateModal(id){
    const l = L().find(x => x.id === id); if (!l) return;
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Deactivate ${esc(l.invoiceNumber)}?</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">The link will stop accepting payments. Payments already received are not affected. This can’t be undone.</p><div class="lk-err" id="lkde"></div>
      <div class="row" style="margin-top:16px"><button class="btn" onclick="closeAll()">Keep link</button><button class="btn primary" style="background:var(--bad);border-color:var(--bad)" id="lkdgo">Deactivate</button></div>`);
    $('#lkdgo').onclick = async () => {
      busy($('#lkdgo'), true, 'Deactivating…');
      try {
        const n = put(await api('/links/' + encodeURIComponent(l.id) + '/deactivate', { method: 'POST' }));
        closeAll(); draw(); drawer(n.id); toast(`${n.invoiceNumber} deactivated`);
      } catch (e) { busy($('#lkdgo'), false, 'Deactivate'); $('#lkde').textContent = e.message; }
    };
  }

  function createModal(pre = {}){
    const noCred = !state.mids[state.mode];
    openModal(`<div class="lk-form"><div class="between"><h2 style="margin:0;font-size:20px">Create payment link</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin:4px 0 0">${state.mode === 'test' ? 'Test link · no real money moves.' : 'Live link · customers are charged.'}</p>
      <div id="lcnote">${noCred ? `<div class="notice bad">${state.mode === 'live' ? 'Live mode is not active yet. Finish onboarding to get live PayU credentials.' : 'No PayU test credentials on this account yet. Add your PayU test key and salt in Developer → API keys.'}</div>` : ''}</div>
      <div class="g">
        <div class="full"><label for="lcd">Description *</label><input id="lcd" maxlength="120" placeholder="What is this payment for?"><div class="lk-err" data-err="desc"></div></div>
        <div><label for="lci">Invoice number</label><input id="lci" maxlength="30" class="mono" placeholder="Generated if left blank"><div class="lk-err" data-err="inv"></div></div>
        <div><label for="lcm">Max payments</label><input id="lcm" type="number" min="1" max="1000" value="1"><div class="lk-err" data-err="max"></div></div>
        <div class="full"><label>Amount</label><div class="lk-seg">
          <label><input type="radio" name="lct" value="fixed" checked><span><b>Fixed amount</b><div class="muted" style="font-size:12px">You set what the customer pays</div></span></label>
          <label><input type="radio" name="lct" value="customer"><span><b>Customer enters</b><div class="muted" style="font-size:12px">Donations, tips, open invoices</div></span></label></div></div>
        <div id="lcfixed" class="full"><div class="g"><div><label for="lca">Amount (₹) *</label><input id="lca" type="number" step="0.01" min="1" placeholder="0.00"><div class="lk-err" data-err="amt"></div></div>
          <div><label>&nbsp;</label><label class="ck" style="margin-top:10px!important"><input type="checkbox" id="lcp"> Allow partial payments</label></div>
          <div id="lcminw" style="display:none"><label for="lcmin">Minimum first payment (₹) *</label><input id="lcmin" type="number" step="0.01" min="1"><div class="lk-err" data-err="min"></div></div></div></div>
        <div><label for="lce">Expiry date</label><input id="lce" type="date" min="${today()}" value="${isoDay(new Date(Date.now() + 15 * DAY))}"><div class="lk-err" data-err="exp"></div></div>
        <div class="muted" style="font-size:12.5px;align-self:end;padding-bottom:10px">The link stops accepting payments at 11:59 PM on this date. Clear it for no expiry.</div>
        <div class="full lk-sec">Customer (optional)</div>
        <div class="full"><label for="lcn">Name</label><input id="lcn" maxlength="60" placeholder="Customer name" value="${esc(pre.name || '')}"><div class="lk-err" data-err="name"></div></div>
        <div><label for="lcph">Phone</label><input id="lcph" inputmode="tel" placeholder="10-digit mobile" value="${esc(pre.phone || '')}"><div class="lk-err" data-err="phone"></div></div>
        <div><label for="lcem">Email</label><input id="lcem" type="email" placeholder="Customer email" value="${esc(pre.email || '')}"><div class="lk-err" data-err="email"></div></div>
      </div>
      <p class="muted" style="font-size:12px;margin:12px 0 0">${NO_URL}</p>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="lcgo">Create link</button></div></div>`);
    const fixed = () => document.querySelector('input[name=lct]:checked').value === 'fixed';
    const sync = () => {
      $('#lcfixed').style.display = fixed() ? '' : 'none';
      $('#lcminw').style.display = fixed() && $('#lcp').checked ? '' : 'none';
      if (!fixed() && +$('#lcm').value === 1) $('#lcm').value = 100;
      if (fixed() && $('#lcp').checked && +$('#lcm').value < 2) $('#lcm').value = 5;
    };
    document.querySelectorAll('input[name=lct]').forEach(x => x.onchange = sync);
    $('#lcp').onchange = sync;
    $('#lcgo').onclick = async () => {
      const err = {}, v = id => $('#' + id).value.trim(), rupees = id => Math.round(parseFloat(v(id)) * 100);
      const desc = v('lcd'), invNo = v('lci'), max = +v('lcm'), exp = v('lce'), name = v('lcn'), phone = v('lcph').replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''), email = v('lcem');
      let amount = null, minAmount = null;
      if (!desc) err.desc = 'Add a description so the customer knows what they’re paying for';
      if (invNo && !/^[A-Za-z0-9\-_/]{1,30}$/.test(invNo)) err.inv = 'Use letters, numbers, - _ or / only';
      else if (invNo && L().some(l => l.invoiceNumber === invNo)) err.inv = 'This invoice number is already used by another link';
      if (!Number.isInteger(max) || max < 1 || max > 1000) err.max = 'Enter a whole number from 1 to 1000';
      if (fixed()) {
        amount = rupees('lca');
        if (!(amount >= 100)) err.amt = 'Enter an amount of at least ₹1.00';
        else if (amount > 50000000) err.amt = 'Payment links accept up to ₹5,00,000';
        if ($('#lcp').checked) {
          minAmount = rupees('lcmin');
          if (!(minAmount >= 100)) err.min = 'Enter a minimum of at least ₹1.00';
          else if (amount >= 100 && minAmount >= amount) err.min = 'Minimum must be less than the full amount';
          if (!err.max && max < 2) err.max = 'Partial payments need at least 2 payments';
        }
      }
      if (exp && exp < today()) err.exp = 'Expiry date can’t be in the past';
      if (name && !/^[\p{L} .'-]{2,60}$/u.test(name)) err.name = 'Use letters, spaces, . \' or - only';
      if (phone && !/^[6-9]\d{9}$/.test(phone)) err.phone = 'Enter a valid 10-digit Indian mobile number';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) err.email = 'Enter a valid email address';
      document.querySelectorAll('.lk-form [data-err]').forEach(e => e.textContent = err[e.dataset.err] || '');
      const ids = { desc: 'lcd', inv: 'lci', max: 'lcm', amt: 'lca', min: 'lcmin', exp: 'lce', name: 'lcn', phone: 'lcph', email: 'lcem' };
      Object.entries(ids).forEach(([k, id]) => $('#' + id).classList.toggle('bad', !!err[k]));
      const first = Object.keys(err)[0];
      if (first) { const el = ids[first] && $('#' + ids[first]); if (el) el.focus(); return toast(`Fix ${Object.keys(err).length} field${Object.keys(err).length > 1 ? 's' : ''} to continue`); }
      const body = { desc, invoiceNumber: invNo, maxPayments: max, customerAmount: !fixed(), amount, partial: !!minAmount, minAmount,
        expiresAt: exp ? endOfDay(exp).toISOString() : null, name, phone, email };
      busy($('#lcgo'), true, 'Creating…');
      let l;
      try { l = put(await api('/links', { method: 'POST', body })); }
      catch (e) {
        busy($('#lcgo'), false, 'Create link');
        if (/invoice number/i.test(e.message)) { $('[data-err=inv]').textContent = e.message; $('#lci').classList.add('bad'); }
        $('#lcnote').innerHTML = `<div class="notice bad">${esc(e.message)}</div>`;
        $('#lcnote').scrollIntoView({ block: 'nearest' });
        return;
      }
      lk.page = 1; lk.q = ''; lk.status = []; lk.sort = { key: 'created', dir: -1 }; draw();
      $('#modal').innerHTML = `<div class="lk-form lk-ok"><div class="ic">✓</div><h2 style="margin:0 0 4px;font-size:20px">Payment link saved</h2>
        <p class="muted" style="margin:0 0 14px">${esc(l.invoiceNumber)} · ${esc(desc)} · ${amount ? inr(amount) : 'customer enters amount'}</p>
        ${l.url ? `<div class="lk-url" style="text-align:left"><code>${esc(l.url)}</code><button class="btn sm" onclick="links_copy('${l.id}')"><i data-icon=copy class=li></i> Copy</button></div>`
          : `<div class="lk-pend" style="text-align:left"><b>Link URL pending</b><br>${NO_URL}</div>`}
        <div class="row" style="margin-top:14px"><button class="btn" id="lcagain">+ Create another</button><button class="btn" onclick="closeAll();links_open('${l.id}')">View details</button><button class="btn primary" onclick="closeAll()">Done</button></div></div>`;
      $('#lcagain').onclick = () => createModal();
    };
  }

  window.links_copy = id => { const l = L().find(x => x.id === id); if (!l) return; if (!l.url) return toast('This link has no URL yet'); copy(l.url, 'Link copied'); };
  window.links_extend = extendModal;
  window.links_deactivate = deactivateModal;
  window.links_open = drawer;

  BIND.links = () => {
    if (liveLocked()) return;
    $('#lknew').onclick = () => createModal();
    draw();
    // Customers page hands over a customer as #/links?name=&email=&phone=
    const qs = location.hash.split('?')[1];
    if (qs) {
      const p = new URLSearchParams(qs), pre = { name: p.get('name') || '', email: p.get('email') || '', phone: (p.get('phone') || '').replace(/^\+91\s?/, '') };
      history.replaceState(null, '', '#/links');
      if (pre.name || pre.email || pre.phone) createModal(pre);
    }
  };
  document.addEventListener('click', e => { if (!e.target.closest('#lkview .dd')) document.querySelectorAll('#lkview .menu.open').forEach(m => m.classList.remove('open')); });
})();

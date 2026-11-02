// Page: links. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Payment links ---- */
(() => {
  const PAGE = 10, DAY = 864e5;
  const RANGES = [['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['90d', 'Last 90 days', 90], ['all', 'All time', null]];
  const FIELDS = [['id', 'Link ID'], ['invoiceNumber', 'Invoice number'], ['customer', 'Customer']];
  const STATUSES = ['ACTIVE', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'DEACTIVATED'];
  const CHANNELS = [['sms', 'SMS'], ['email', 'Email'], ['whatsapp', 'WhatsApp']];
  const PAY_MODES = ['UPI', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet'];
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const lk = { page: 1, range: 'all', field: 'id', q: '', status: [], sort: { key: 'created', dir: -1 } };

  // Local seeded generator so core rnd() sequences used by other pages stay unchanged.
  let s = 4242; const r = () => (s = (s * 48271) % 2147483647) / 2147483647, pk = a => a[Math.floor(r() * a.length)];
  const fmtDay = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const shortDay = d => d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
  const parseDay = str => { const m = /^(\d{1,2}) ([A-Z][a-z]{2})$/.exec(str || ''); if (!m || !(m[2] in MON)) return null; const d = new Date(now.getFullYear(), MON[m[2]], +m[1], 23, 59); return d; };
  const code = () => Math.random().toString(36).slice(2, 6).padEnd(4, 'x');
  const phoneOf = n => '9' + String(Math.floor(n * 1e9)).padStart(9, '0');
  const emailOf = name => name && name !== '—' ? name.split(' ')[0].toLowerCase() + '@example.in' : '';
  const pay = (amount, date) => ({ id: 'TL' + Math.floor(100000 + r() * 899999), mihpayid: String(19000000000 + Math.floor(r() * 9e8)), amount, mode: pk(PAY_MODES), date });

  // Enrich a core link with Payment Links API concepts. Idempotent: core fields stay untouched.
  function enrich(l, i){
    if (l._lk) return l;
    const created = new Date(now - (6 + i * 4) * DAY - r() * DAY);
    const expiresAt = parseDay(l.expires);
    Object.assign(l, {
      _lk: true, created, expiresAt, invoiceNumber: /INV-\d+/.exec(l.desc)?.[0] || 'INV-' + (2100 + i * 7),
      phone: l.customer !== '—' ? phoneOf(r()) : '', email: emailOf(l.customer),
      customerAmount: l.amount == null, partial: false, minAmount: null, maxPayments: l.amount == null ? 100 : 1,
      notify: l.customer !== '—' ? ['sms', 'email'] : [], payments: [],
    });
    if (l.status === 'ACTIVE' && expiresAt && expiresAt < now) l.status = 'EXPIRED';
    if (l.status === 'PAID') l.payments = [pay(l.amount, new Date(created.getTime() + 2 * DAY))];
    if (l.amount == null) l.payments = [pay(50000, new Date(now - 3 * DAY)), pay(100000, new Date(now - 2 * DAY)), pay(25100, new Date(now - 9 * 3600e3))];
    return l;
  }
  function seedMore(list){
    const DESCS = ['Website redesign · milestone 2', 'Yoga retreat booking', 'Wedding photography advance', 'Annual maintenance contract', 'Catering order #C-88', 'Guitar lessons · Nov', 'Tax filing service', 'Bulk order · 40 kg spices', 'Interior consultation', 'School trip fee', 'Bridal makeup booking', 'Software licence renewal', 'Event stall rental', 'Tuition fee · term 2'];
    DESCS.forEach((desc, i) => {
      const name = NAMES[(i * 5 + 3) % NAMES.length], amount = Math.round(800 + r() * 24000) * 100;
      const created = new Date(now - (i * 2.6 + r()) * DAY), roll = r();
      const partial = i % 4 === 1, expiresAt = new Date(created.getTime() + (i % 3 === 0 ? 9 : 21) * DAY);
      let payments = [], status = 'ACTIVE';
      if (roll < .35) { payments = [pay(amount, new Date(created.getTime() + r() * 2 * DAY))]; status = 'PAID'; }
      else if (partial) { payments = [pay(Math.round(amount * .4 / 100) * 100, new Date(created.getTime() + DAY))]; status = 'PARTIALLY_PAID'; }
      if (status !== 'PAID' && expiresAt < now) status = 'EXPIRED';
      if (i === 11) status = 'DEACTIVATED';
      list.push({
        id: 'PL' + (1045 + i), desc, amount, customer: name, status, url: 'https://pay.bizpolepay.example/l/' + Math.floor(r() * 36 ** 4).toString(36).padStart(4, '0'),
        expires: shortDay(expiresAt), _lk: true, created, expiresAt, invoiceNumber: 'INV-' + (2240 + i), phone: phoneOf(r()), email: emailOf(name),
        customerAmount: false, partial, minAmount: partial ? Math.round(amount * .25 / 100) * 100 : null, maxPayments: partial ? 5 : 1,
        notify: pk([['sms', 'email'], ['whatsapp'], ['email'], ['sms', 'whatsapp', 'email']]), payments,
      });
    });
  }
  links.test.forEach(enrich);
  if (!links.test.some(l => l.id === 'PL1045')) seedMore(links.test);
  const L = () => links[state.mode].map(enrich);
  const paid = l => (l.payments || []).reduce((a, p) => a + p.amount, 0);
  const isOpen = l => ['ACTIVE', 'PARTIALLY_PAID'].includes(l.status);
  const nextId = () => 'PL' + (1 + Math.max(1044, ...Object.values(links).flat().map(l => +String(l.id).replace(/\D/g, '') || 0)));
  const pill = st => st === 'PARTIALLY_PAID' ? '<span class="pill warn">Partially paid</span>' : st === 'DEACTIVATED' ? '<span class="pill">Deactivated</span>' : statusPill(st);
  const copy = (txt, msg) => { try { navigator.clipboard && navigator.clipboard.writeText(txt); } catch (e) { /* clipboard may be blocked */ } toast(msg); };

  addStyle('links', `
    .lk-ac{display:flex;gap:6px;justify-content:flex-end}
    .lk-url{display:flex;gap:8px;align-items:center;background:var(--soft);border-radius:10px;padding:8px 10px}
    .lk-url code{flex:1;font:12.5px "JetBrains Mono",monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .lk-qr{display:flex;gap:16px;align-items:center;margin:14px 0}
    .lk-qr svg{width:132px;height:132px;flex:none;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--card)}
    .lk-share{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
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

  const qrSvg = text => {
    let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const n = 29, out = [], inF = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([a, b]) => x >= a - 1 && x < a + 8 && y >= b - 1 && y < b + 8);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (inF(x, y)) continue; h = (Math.imul(h, 1103515245) + 12345) >>> 0; if (h & 0x10000) out.push(`M${x} ${y}h1v1h-1z`); }
    const fp = (a, b) => `<rect x="${a}" y="${b}" width="7" height="7"/><rect x="${a + 1}" y="${b + 1}" width="5" height="5" fill="#fff"/><rect x="${a + 2}" y="${b + 2}" width="3" height="3"/>`;
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" fill="#211F24" role="img" aria-label="QR code for ${esc(text)}">${fp(0, 0)}${fp(n - 7, 0)}${fp(0, n - 7)}<path d="${out.join('')}"/></svg>`;
  };

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
      <button class="btn" id="lkdl"><i data-icon=download class=li></i> Download</button>
    </div>`;
  }
  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-lksort="${key}">${label} <span class="muted">${lk.sort.key === key ? (lk.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;
  function emptyRow(){
    const none = !L().length;
    return `<tr><td colspan="9"><div class="empty-state"><div class="box">${none ? '<i data-icon=link class=li></i>' : '<i data-icon=package-open class=li></i>'}</div><div>
      <p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">${none ? 'NO PAYMENT LINKS YET' : 'NO RESULTS FOUND'}</p>
      <h3 style="margin:4px 0 6px;font-size:20px">${none ? `Create your first ${state.mode} payment link` : 'No links match these filters'}</h3>
      <p class="muted" style="margin:0 0 12px">${none ? 'Share it over WhatsApp, SMS or email and get paid without a website.' : 'Clear the filters or search, or widen the date range.'}</p>
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
    if (l.customerAmount) return `<b>${inr(p)}</b><div class="muted" style="font-size:11.5px">${l.payments.length} of ${l.maxPayments} payments</div>`;
    const pct = l.amount ? Math.min(100, Math.round(p / l.amount * 100)) : 0;
    return `<b>${inr(p)}</b><div class="lk-mini" style="margin-left:auto"><i style="width:${pct}%"></i></div>`;
  }
  function table(){
    const all = rows(), pages = Math.max(1, Math.ceil(all.length / PAGE));
    lk.page = Math.min(lk.page, pages);
    return `<div class="tbl-wrap"><table><thead><tr>${sortHead('created', 'Created')}<th>Link ID · Invoice</th><th>Description</th><th>Customer</th>${sortHead('amount', 'Amount', 'right')}<th class="right">Collected</th>${sortHead('expires', 'Expires')}<th>Status</th><th class="right">Actions</th></tr></thead>
      <tbody>${all.length ? all.slice((lk.page - 1) * PAGE, lk.page * PAGE).map(l => `<tr class="click" data-lk="${l.id}">
        <td>${shortDay(l.created)}</td><td><span class="mono">${l.id}</span><div class="mono muted" style="font-size:11.5px">${esc(l.invoiceNumber || '—')}</div></td>
        <td style="white-space:normal;min-width:180px;max-width:280px">${esc(l.desc)}</td>
        <td>${esc(l.customer)}${l.phone ? `<div class="muted" style="font-size:11.5px">+91 ${l.phone}</div>` : ''}</td>
        <td class="right">${amountCell(l)}</td><td class="right">${collectedCell(l)}</td>
        <td>${l.expiresAt ? `${shortDay(l.expiresAt)}${isOpen(l) && l.expiresAt - now <= 7 * DAY ? ' <span class="pill warn" style="font-size:11px">Soon</span>' : ''}` : '<span class="muted">No expiry</span>'}</td>
        <td>${pill(l.status)}</td>
        <td><div class="lk-ac"><button class="btn sm" data-lkcopy="${l.id}" title="Copy link"><i data-icon=copy class=li></i> Copy</button>
          <div class="dd"><button class="btn sm" data-lkdd="sh-${l.id}" ${isOpen(l) ? '' : 'disabled'} title="Share"><i data-icon=arrow-up-right class=li></i> Share</button>
          <div class="menu right" id="lkdd-sh-${l.id}">${CHANNELS.map(([k, n]) => `<button data-lkshare="${l.id}" data-ch="${k}">Send via ${n}</button>`).join('')}</div></div></div></td></tr>`).join('') : emptyRow()}</tbody></table></div>` + pager(all.length);
  }

  PAGES.links = () => {
    if (liveLocked()) return head('Payment links') + locked('Payment links');
    return head('Payment links', 'Collect payments without a website. Share a link on WhatsApp, SMS or email.', `<button class="btn primary" id="lknew">+ Create link</button>`) +
      `<div id="lkview"></div>`;
  };
  function closeMenus(){ document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); }
  function draw(){
    const v = $('#lkview'); if (!v) return;
    v.innerHTML = kpis() + toolbar() + table();
    bindView();
  }
  function share(l, ch){
    closeMenus();
    if (!isOpen(l)) return toast('Only active links can be shared');
    const to = ch === 'email' ? l.email : l.phone ? '+91 ' + l.phone : '';
    if (!to) return toast(`Add the customer's ${ch === 'email' ? 'email' : 'phone number'} to send via ${CHANNELS.find(c => c[0] === ch)[1]}`);
    toast(`Link ${l.id} sent via ${CHANNELS.find(c => c[0] === ch)[1]} to ${to}`);
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
        l.amount == null ? '' : (l.amount / 100).toFixed(2), (paid(l) / 100).toFixed(2), l.expiresAt ? l.expiresAt.toISOString().slice(0, 10) : '', l.status, l.url].map(cell).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv + '\n'], { type: 'text/csv' })); a.download = `bizpolepay-payment-links-${lk.range}.csv`; a.click();
      toast(`Downloaded ${list.length} links`);
    };
    document.querySelectorAll('[data-lksort]').forEach(h => h.onclick = () => { const key = h.dataset.lksort; lk.sort = { key, dir: lk.sort.key === key ? -lk.sort.dir : -1 }; draw(); });
    document.querySelectorAll('[data-lkpg]').forEach(b => b.onclick = () => { lk.page = +b.dataset.lkpg; draw(); });
    document.querySelectorAll('[data-lkcopy]').forEach(b => b.onclick = e => { e.stopPropagation(); const l = L().find(x => x.id === b.dataset.lkcopy); copy(l.url, 'Link copied · ' + l.url); });
    document.querySelectorAll('[data-lkshare]').forEach(b => b.onclick = e => { e.stopPropagation(); share(L().find(x => x.id === b.dataset.lkshare), b.dataset.ch); });
    document.querySelectorAll('.lk-ac').forEach(a => a.onclick = e => e.stopPropagation());
    document.querySelectorAll('tr[data-lk]').forEach(tr => tr.onclick = () => drawer(tr.dataset.lk));
    if ($('#lkeclear')) { $('#lkeclear').onclick = () => { lk.status = []; lk.q = ''; lk.page = 1; draw(); }; $('#lkeall').onclick = () => { lk.range = 'all'; lk.page = 1; draw(); }; }
    if ($('#lkecreate')) $('#lkecreate').onclick = createModal;
  }

  function drawer(id){
    const l = L().find(x => x.id === id); if (!l) return;
    const p = paid(l), pct = l.amount ? Math.min(100, Math.round(p / l.amount * 100)) : 0, open = isOpen(l);
    const yes = v => v ? 'Yes' : 'No';
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">${l.id} · ${esc(l.invoiceNumber)}</div><h2 style="margin:2px 0 0">${l.customerAmount ? 'Customer enters amount' : inr(l.amount)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(l.status)} <span class="muted">${esc(l.desc)}</span></p>
      <div class="lk-url"><code>${esc(l.url)}</code><button class="btn sm" onclick="links_copy('${l.id}')"><i data-icon=copy class=li></i> Copy</button></div>
      <div class="lk-qr">${qrSvg(l.url)}<div><b>Scan to pay</b><p class="muted" style="font-size:12.5px;margin:4px 0 10px">Print it on an invoice or show it at the counter. Opens the hosted Bizpole Pay checkout.</p>
        <button class="btn sm" onclick="links_qr('${l.id}')"><i data-icon=download class=li></i> Download QR</button></div></div>
      <div class="lk-share">${CHANNELS.map(([k, n]) => `<button class="btn" ${open ? '' : 'disabled'} onclick="links_share('${l.id}','${k}')">${k === 'sms' ? '✉' : k === 'email' ? '@' : '◍'} ${n}</button>`).join('')}<button class="btn" onclick="links_copy('${l.id}')"><i data-icon=copy class=li></i> Copy</button></div>
      <h3 style="margin-top:20px">Collection</h3>
      ${l.customerAmount ? `<p style="margin:4px 0"><b>${inr(p)}</b> <span class="muted">from ${l.payments.length} of ${l.maxPayments} allowed payments</span></p>`
        : `<div class="between" style="font-size:13px"><span><b>${inr(p)}</b> <span class="muted">of ${inr(l.amount)}</span></span><span class="muted">${pct}%</span></div><div class="prog"><i style="width:${pct}%"></i></div>`}
      <h3 style="margin-top:14px">Details</h3><dl class="kv">
        <dt>Link ID</dt><dd class="mono">${l.id}</dd><dt>Invoice number</dt><dd class="mono">${esc(l.invoiceNumber)}</dd>
        <dt>Created</dt><dd>${fmtDate(l.created)}</dd><dt>Expires</dt><dd>${l.expiresAt ? fmtDay(l.expiresAt) : 'No expiry'}</dd>
        <dt>Amount</dt><dd>${l.customerAmount ? 'Entered by customer' : 'Fixed · ' + inr(l.amount)}</dd>
        <dt>Partial payments</dt><dd>${l.partial ? `Allowed · min ${inr(l.minAmount)}` : yes(false)}</dd>
        <dt>Max payments</dt><dd>${l.maxPayments}</dd>
        <dt>Notify via</dt><dd>${l.notify.length ? l.notify.map(c => CHANNELS.find(x => x[0] === c)[1]).join(', ') : 'Not sent'}</dd></dl>
      <h3 style="margin-top:18px">Customer</h3><dl class="kv"><dt>Name</dt><dd>${esc(l.customer)}</dd><dt>Phone</dt><dd>${l.phone ? '+91 ' + l.phone : '—'}</dd><dt>Email</dt><dd>${esc(l.email || '—')}</dd></dl>
      <h3 style="margin-top:18px">Payments received <span class="muted" style="font-weight:500">(${l.payments.length})</span></h3>
      ${l.payments.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>PayU ID</th><th>Mode</th><th class="right">Amount</th></tr></thead><tbody>
        ${l.payments.slice().sort((a, b) => b.date - a.date).map(x => `<tr><td>${fmtDate(x.date)}</td><td class="mono">${x.mihpayid}</td><td>${x.mode}</td><td class="right"><b>${inr(x.amount)}</b></td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted" style="font-size:13px">No payments yet. ${open ? 'Share the link to get paid.' : ''}</p>`}
      ${open ? `<div class="row" style="margin-top:20px"><button class="btn" onclick="links_extend('${l.id}')"><i data-icon=calendar class=li></i> Extend expiry</button><button class="btn danger" onclick="links_deactivate('${l.id}')">Deactivate link</button></div>`
        : l.status === 'EXPIRED' ? `<div class="row" style="margin-top:20px"><button class="btn" onclick="links_extend('${l.id}')"><i data-icon=calendar class=li></i> Reactivate with new expiry</button></div>` : ''}`);
  }

  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => isoDay(new Date());
  function extendModal(id){
    const l = L().find(x => x.id === id), base = l.expiresAt && l.expiresAt > now ? l.expiresAt : new Date();
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${l.status === 'EXPIRED' ? 'Reactivate' : 'Extend'} ${l.id}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">Current expiry: <b style="color:var(--ink)">${l.expiresAt ? fmtDay(l.expiresAt) : 'No expiry'}</b></p>
      <label for="lkxd">New expiry date</label><input id="lkxd" type="date" min="${today()}" value="${isoDay(new Date(base.getTime() + 7 * DAY))}"><div class="lk-err" id="lkxe"></div>
      <div class="row" style="margin-top:16px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="lkxgo">Save expiry</button></div>`);
    $('#lkxgo').onclick = () => {
      const v = $('#lkxd').value;
      if (!v) return $('#lkxe').textContent = 'Choose a date';
      if (v < today()) return $('#lkxe').textContent = 'Expiry date can’t be in the past';
      const [y, m, d] = v.split('-').map(Number);
      l.expiresAt = new Date(y, m - 1, d, 23, 59); l.expires = shortDay(l.expiresAt);
      if (l.status === 'EXPIRED') l.status = paid(l) ? 'PARTIALLY_PAID' : 'ACTIVE';
      closeAll(); draw(); drawer(l.id); toast(`${l.id} now expires on ${fmtDay(l.expiresAt)}`);
    };
  }
  function deactivateModal(id){
    const l = L().find(x => x.id === id);
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Deactivate ${l.id}?</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">Customers who open <span class="mono">${esc(l.url)}</span> will see that the link is no longer active. Payments already received are not affected. This can’t be undone.</p>
      <div class="row" style="margin-top:16px"><button class="btn" onclick="closeAll()">Keep link</button><button class="btn primary" style="background:var(--bad);border-color:var(--bad)" id="lkdgo">Deactivate</button></div>`);
    $('#lkdgo').onclick = () => { l.status = 'DEACTIVATED'; closeAll(); draw(); drawer(l.id); toast(`${l.id} deactivated`); };
  }

  function createModal(){
    const inv = 'INV-' + (2300 + L().length);
    openModal(`<div class="lk-form"><div class="between"><h2 style="margin:0;font-size:20px">Create payment link</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin:4px 0 0">${state.mode === 'test' ? 'Test link · no real money moves.' : 'Live link · customers are charged.'}</p>
      <div class="g">
        <div class="full"><label for="lcd">Description *</label><input id="lcd" maxlength="120" placeholder="What is this payment for?"><div class="lk-err" data-err="desc"></div></div>
        <div><label for="lci">Invoice number</label><input id="lci" maxlength="30" value="${inv}" class="mono"><div class="lk-err" data-err="inv"></div></div>
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
        <div class="full"><label for="lcn">Name</label><input id="lcn" maxlength="60" placeholder="Customer name"><div class="lk-err" data-err="name"></div></div>
        <div><label for="lcph">Phone</label><input id="lcph" inputmode="tel" placeholder="10-digit mobile"><div class="lk-err" data-err="phone"></div></div>
        <div><label for="lcem">Email</label><input id="lcem" type="email" placeholder="name@example.in"><div class="lk-err" data-err="email"></div></div>
        <div class="full"><label>Notify customer via</label><div class="row" style="gap:16px">${CHANNELS.map(([k, n]) => `<label class="ck" style="flex:none;min-width:0"><input type="checkbox" data-lcn="${k}">${n}</label>`).join('')}</div><div class="lk-err" data-err="notify"></div></div>
      </div>
      <div class="row" style="margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="lcgo">Create link</button></div></div>`);
    const fixed = () => document.querySelector('input[name=lct]:checked').value === 'fixed';
    const sync = () => {
      $('#lcfixed').style.display = fixed() ? '' : 'none';
      $('#lcminw').style.display = fixed() && $('#lcp').checked ? '' : 'none';
      if (!fixed() && +$('#lcm').value === 1) $('#lcm').value = 100;
      if (fixed() && $('#lcp').checked && +$('#lcm').value < 2) $('#lcm').value = 5;
    };
    document.querySelectorAll('input[name=lct]').forEach(x => x.onchange = sync);
    $('#lcp').onchange = sync;
    $('#lcgo').onclick = () => {
      const err = {}, v = id => $('#' + id).value.trim(), rupees = id => Math.round(parseFloat(v(id)) * 100);
      const desc = v('lcd'), invNo = v('lci'), max = +v('lcm'), exp = v('lce'), name = v('lcn'), phone = v('lcph').replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''), email = v('lcem');
      const notify = [...document.querySelectorAll('[data-lcn]:checked')].map(x => x.dataset.lcn);
      let amount = null, minAmount = null;
      if (!desc) err.desc = 'Add a description so the customer knows what they’re paying for';
      if (invNo && !/^[A-Za-z0-9\-_/]{1,30}$/.test(invNo)) err.inv = 'Use letters, numbers, - _ or / only';
      else if (invNo && Object.values(links).flat().some(l => l.invoiceNumber === invNo)) err.inv = 'This invoice number is already used by another link';
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
      const needPhone = notify.filter(c => c !== 'email'), needs = [];
      if (needPhone.length && !phone) needs.push(`a phone number for ${needPhone.map(c => CHANNELS.find(x => x[0] === c)[1]).join(' and ')}`);
      if (notify.includes('email') && !email) needs.push('an email address for Email');
      if (needs.length) err.notify = 'Add ' + needs.join(' and ');
      document.querySelectorAll('.lk-form [data-err]').forEach(e => e.textContent = err[e.dataset.err] || '');
      const ids = { desc: 'lcd', inv: 'lci', max: 'lcm', amt: 'lca', min: 'lcmin', exp: 'lce', name: 'lcn', phone: 'lcph', email: 'lcem' };
      Object.entries(ids).forEach(([k, id]) => $('#' + id).classList.toggle('bad', !!err[k]));
      const first = Object.keys(err)[0];
      if (first) { const el = ids[first] && $('#' + ids[first]); if (el) el.focus(); return toast(`Fix ${Object.keys(err).length} field${Object.keys(err).length > 1 ? 's' : ''} to continue`); }
      let expiresAt = null; if (exp) { const [y, m, d] = exp.split('-').map(Number); expiresAt = new Date(y, m - 1, d, 23, 59); }
      const l = { id: nextId(), desc, amount, customer: name || '—', status: 'ACTIVE', url: 'https://pay.bizpolepay.example/l/' + code(), expires: shortDay(expiresAt),
        _lk: true, created: new Date(), expiresAt, invoiceNumber: invNo || '—', phone, email, customerAmount: !fixed(), partial: !!minAmount, minAmount, maxPayments: max, notify, payments: [] };
      links[state.mode].unshift(l);
      lk.page = 1; lk.q = ''; lk.status = []; lk.sort = { key: 'created', dir: -1 }; draw();
      copy(l.url, 'Link created and copied');
      $('#modal').innerHTML = `<div class="lk-form lk-ok"><div class="ic">✓</div><h2 style="margin:0 0 4px;font-size:20px">Payment link created</h2>
        <p class="muted" style="margin:0 0 14px">${esc(desc)} · ${amount ? inr(amount) : 'customer enters amount'}${notify.length ? ` · sent via ${notify.map(c => CHANNELS.find(x => x[0] === c)[1]).join(', ')}` : ''}</p>
        <div class="lk-url" style="text-align:left"><code>${esc(l.url)}</code><button class="btn sm" onclick="links_copy('${l.id}')"><i data-icon=copy class=li></i> Copy</button></div>
        <div class="lk-qr" style="justify-content:center">${qrSvg(l.url)}</div>
        <div class="row" style="margin-top:6px"><button class="btn" id="lcagain">+ Create another</button><button class="btn" onclick="closeAll();links_open('${l.id}')">View details</button><button class="btn primary" onclick="closeAll()">Done</button></div></div>`;
      $('#lcagain').onclick = createModal;
    };
  }

  window.links_copy = id => { const l = L().find(x => x.id === id); if (l) copy(l.url, 'Link copied'); };
  window.links_share = (id, ch) => share(L().find(x => x.id === id), ch);
  window.links_extend = extendModal;
  window.links_deactivate = deactivateModal;
  window.links_open = drawer;
  window.links_qr = id => {
    const l = L().find(x => x.id === id), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([qrSvg(l.url).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" ')], { type: 'image/svg+xml' }));
    a.download = `bizpolepay-${l.id}-qr.svg`; a.click(); toast('QR code downloaded');
  };

  BIND.links = () => {
    if (liveLocked()) return;
    $('#lknew').onclick = createModal;
    draw();
  };
  document.addEventListener('click', e => { if (!e.target.closest('#lkview .dd')) document.querySelectorAll('#lkview .menu.open').forEach(m => m.classList.remove('open')); });
})();

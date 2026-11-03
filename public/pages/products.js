// Page: products. Uses globals from app.html core (state, api, LOAD, data, helpers, PAGES, BIND).
// The catalogue is static config; access requests and launch notifications are stored server-side (AuditLog).
/* ---- Explore products ---- */
(() => {
  const CATS = [
    ['accept', 'Accept payments', 'Ways for customers to pay you'],
    ['money', 'Manage money', 'Move, split and speed up your funds'],
    ['grow', 'Grow', 'Convert more customers and learn what works'],
  ];
  // status: Enabled (route works now) · Available (self-serve setup) · Request access (needs review) · Coming soon.
  const CATALOGUE = [
    { id: 'checkout', cat: 'accept', ic: '<i data-icon=panels-top-left class=li></i>', name: 'Hosted checkout', line: 'A ready-made payment page with UPI, cards, net banking and wallets.', status: 'Enabled', route: 'checkout' },
    { id: 'links', cat: 'accept', ic: '<i data-icon=link class=li></i>', name: 'Payment links', line: 'Send a link over WhatsApp, SMS or email and get paid without a website.', status: 'Enabled', route: 'links' },
    { id: 'buttons', cat: 'accept', ic: '⏺', name: 'Payment buttons', line: 'Paste one snippet to add a "Pay now" button to any page.', status: 'Available', route: 'checkout' },
    { id: 'qr', cat: 'accept', ic: '▦', name: 'UPI QR codes', line: 'Print a QR for your counter or show a dynamic one per order.', status: 'Available', route: 'links' },
    { id: 'subs', cat: 'accept', ic: '<i data-icon=repeat class=li></i>', name: 'Subscriptions', line: 'Charge automatically every cycle through UPI Autopay or card mandates.', status: 'Request access', route: 'subscriptions' },
    { id: 'intl', cat: 'accept', ic: '🌐', name: 'International payments', line: 'Accept cards issued outside India and settle in rupees.', status: 'Request access' },
    { id: 'payouts', cat: 'money', ic: '<i data-icon=arrow-up-right class=li></i>', name: 'Payouts', line: 'Pay vendors, refunds and staff to any bank account or UPI ID in bulk.', status: 'Request access', route: 'payouts' },
    { id: 'split', cat: 'money', ic: '<i data-icon=split class=li></i>', name: 'Split settlements', line: 'Route a share of each payment to partners or sellers automatically.', status: 'Request access', route: 'split' },
    { id: 'instant', cat: 'money', ic: '<i data-icon=rotate-ccw class=li></i>', name: 'Instant refunds', line: 'Return money to customers in seconds instead of 5–7 working days.', status: 'Available', route: 'transactions' },
    { id: 'priority', cat: 'money', ic: '⚡', name: 'Priority settlements', line: 'Get each day\'s collections in your bank the same day, not T+1.', status: 'Request access' },
    { id: 'offers', cat: 'grow', ic: '✿', name: 'Offers & discounts', line: 'Run bank, card and coupon offers that apply right at checkout.', status: 'Coming soon' },
    { id: 'emi', cat: 'grow', ic: '◫', name: 'EMI & pay later', line: 'Let customers split big purchases into monthly instalments.', status: 'Available', route: 'checkout' },
    { id: 'analytics', cat: 'grow', ic: '<i data-icon=chart-pie class=li></i>', name: 'Payment analytics', line: 'See success rates by mode and bank, failure reasons and peak hours.', status: 'Enabled', route: 'analytics' },
  ];
  const VOLUMES = ['Under ₹1 lakh', '₹1–10 lakh', '₹10–50 lakh', '₹50 lakh – ₹2 crore', 'Above ₹2 crore'];
  const pr = { q: '', cat: 'all', saved: { test: { requests: {}, notify: {} }, live: { requests: {}, notify: {} } } };
  const mine = () => pr.saved[state.mode] || { requests: {}, notify: {} };
  LOAD.products = async (mode) => { pr.saved[mode] = await api('/products', { mode }); };
  const statusOf = p => p.status === 'Request access' && mine().requests[p.id] ? 'Requested' : p.status;
  const PILL = { 'Enabled': 'ok', 'Available': 'brand', 'Request access': '', 'Requested': 'warn', 'Coming soon': '' };

  function cta(p, primary = false){
    const P = primary ? ' primary' : '';
    const s = statusOf(p);
    if (s === 'Enabled') return `<a class="btn sm" href="#/${p.route}">Open <i data-icon=chevron-right class=li></i></a>`;
    if (s === 'Available') return `<button class="btn sm${P}" data-prgo="${p.id}">Set up <i data-icon=chevron-right class=li></i></button>`;
    if (s === 'Request access') return `<button class="btn sm${P}" data-prreq="${p.id}">Request access</button>${p.route ? `<a class="btn sm" href="#/${p.route}">Preview</a>` : ''}`;
    if (s === 'Requested') return `<button class="btn sm" disabled>✓ Request sent</button><span class="muted" style="font-size:12px">Sent ${new Date(mine().requests[p.id].at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>`;
    return `<button class="btn sm" data-prnotify="${p.id}">${mine().notify[p.id] ? '✓ We\'ll notify you' : '🔔 Notify me'}</button>`;
  }
  const tile = p => `<div class="card pr-card" data-prid="${p.id}"><div class="between" style="align-items:flex-start"><div class="pr-ic">${p.ic}</div><span class="pill ${PILL[statusOf(p)]}">${statusOf(p)}</span></div>
    <b class="pr-name">${p.name}</b><p class="muted pr-line">${p.line}</p><div class="pr-cta">${cta(p)}</div></div>`;

  // Recommendations derived only from this account's own payments; none are shown without a real signal.
  function recommended(){
    const t = D(), ok = t.filter(x => x.status === 'SUCCESS'), refs = refunds[state.mode] || [];
    const big = ok.filter(x => x.amount >= 500000), byEmail = {};
    ok.forEach(x => { if (x.email) byEmail[x.email] = (byEmail[x.email] || 0) + 1; });
    const repeat = Object.values(byEmail).filter(n => n >= 2).length;
    const recs = [
      ['instant', `You issued ${refs.length} refund${refs.length === 1 ? '' : 's'}. Customers would get them back in seconds.`, refs.length],
      ['emi', `${big.length} of your ${ok.length} successful payments were ₹5,000 or more — good candidates for monthly instalments.`, big.length],
      ['subs', `${repeat} customer${repeat === 1 ? '' : 's'} paid you more than once. Bill them automatically each cycle.`, repeat],
    ].filter(([id, , n]) => n > 0 && !['Enabled', 'Requested'].includes(statusOf(CATALOGUE.find(p => p.id === id))));
    return recs.sort((a, b) => b[2] - a[2]).slice(0, 3);
  }

  function view(){
    const q = pr.q.trim().toLowerCase();
    const match = p => (pr.cat === 'all' || p.cat === pr.cat) && (!q || (p.name + ' ' + p.line).toLowerCase().includes(q));
    const shown = CATALOGUE.filter(match), recs = recommended();
    const enabled = CATALOGUE.filter(p => statusOf(p) === 'Enabled').length, requested = CATALOGUE.filter(p => statusOf(p) === 'Requested').length;
    const header = head('Explore products', 'Turn on more ways to collect, move and grow your money.',
      `<span class="chip">${enabled} of ${CATALOGUE.length} enabled${requested ? ` · ${requested} requested` : ''}</span>`);
    const toolbar = `<div class="toolbar">
      <div class="searchbox" style="max-width:420px"><input id="prq" placeholder="Search products, e.g. refunds, QR, EMI" value="${esc(pr.q)}"></div>
      <span class="row pr-chips" style="flex:none;gap:6px">${[['all', 'All', CATALOGUE.length], ...CATS.map(([k, l]) => [k, l, CATALOGUE.filter(p => p.cat === k).length])].map(([k, l, n]) => `<button class="chip ${pr.cat === k ? 'brand' : ''}" data-prcat="${k}">${l} · ${n}</button>`).join('')}</span></div>`;
    const recRow = !q && pr.cat === 'all' && recs.length ? `<h3 class="pr-h"><i data-icon=sparkles class=li></i> Recommended for you <span class="muted" style="font-weight:500;font-size:13px">· based on your ${isLive() ? 'live' : 'test'} payments</span></h3>
      <div class="grid g3 pr-sec">${recs.map(([id, why]) => { const p = CATALOGUE.find(x => x.id === id); return `<div class="card pr-rec"><div class="row" style="gap:12px;flex-wrap:nowrap;align-items:flex-start"><div class="pr-ic">${p.ic}</div><div style="min-width:0"><b>${p.name}</b> <span class="pill ${PILL[statusOf(p)]}">${statusOf(p)}</span><p class="muted pr-line" style="margin-top:4px">${why}</p></div></div><div class="pr-cta">${cta(p, true)}</div></div>`; }).join('')}</div>` : '';
    const sections = CATS.map(([k, l, d]) => {
      const items = shown.filter(p => p.cat === k); if (!items.length) return '';
      return `<h3 class="pr-h">${l} <span class="muted" style="font-weight:500;font-size:13px">· ${d}</span></h3><div class="grid ${items.length === 4 ? 'g4' : 'g3'} pr-sec">${items.map(tile).join('')}</div>`;
    }).join('');
    const empty = `<div class="card"><div class="empty-state"><div class="box"><i data-icon=sparkles class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO PRODUCTS FOUND</p>
      <h3 style="margin:4px 0 6px;font-size:20px">Nothing matches "${esc(pr.q)}"</h3><p class="muted" style="margin:0 0 12px">Try a broader word like "refund", "UPI" or "settle", or look across all categories.</p>
      <div class="row" style="gap:8px"><button class="btn sm" id="prclear">Clear search</button></div></div></div></div>`;
    return header + toolbar + recRow + (shown.length ? sections : empty) +
      `<p class="muted" style="font-size:12.5px;margin:18px 0 0">Payments are processed by PayU. Some products need a business review before they go live.</p>`;
  }

  function requestDialog(id){
    const p = CATALOGUE.find(x => x.id === id);
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Request ${p.name}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin:6px 0 0">${p.line} Tell us a little about how you'll use it and our team will review your account.</p>
      <label for="prUse">How will you use ${p.name.toLowerCase()}?</label><textarea id="prUse" rows="3" placeholder="e.g. Monthly billing for 400 gym members"></textarea>
      <label for="prVol">Expected monthly volume</label><select id="prVol"><option value="">Choose a range</option>${VOLUMES.map(v => `<option>${v}</option>`).join('')}</select>
      <div class="notice bad" id="prErr" style="display:none"></div>
      <p class="muted" style="font-size:12.5px">Your request is saved on your account and our team replies by email to ${esc(state.user.email)}.</p>
      <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="prSend">Submit request</button></div>`);
    $('#prSend').onclick = async () => {
      const use = $('#prUse').value.trim(), vol = $('#prVol').value, err = $('#prErr'), btn = $('#prSend');
      const msg = use.length < 10 ? 'Describe your use case in at least 10 characters.' : !vol ? 'Choose your expected monthly volume.' : '';
      if (msg) { err.textContent = msg; err.style.display = 'block'; return; }
      btn.disabled = true;
      try {
        pr.saved[state.mode] = await api(`/products/${id}/request`, { method: 'POST', body: { use, volume: vol } });
        closeAll(); toast(`Access requested for ${p.name}`); route();
      } catch (e) { btn.disabled = false; err.textContent = e.message; err.style.display = 'block'; }
    };
  }

  addStyle('products', `
    .pr-chips>*{flex:none!important;min-width:0!important}
    .pr-h{margin:22px 0 10px;font-size:16px}
    .pr-sec{margin-bottom:6px}
    .pr-card{gap:8px}
    .pr-ic{width:40px;height:40px;border-radius:11px;background:var(--brand-soft);color:var(--brand);display:grid;place-items:center;font-size:19px;flex:none!important;min-width:0!important}
    .pr-name{font-size:15.5px;margin-top:4px}
    .pr-line{margin:0;font-size:13.5px}
    .pr-cta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:auto;padding-top:8px}
    .pr-rec{gap:10px;background:linear-gradient(135deg,#fff 40%,var(--brand-soft));border-color:var(--line)}
    .pr-rec .pr-line{color:var(--ink-2)}
    textarea{resize:vertical}
  `);

  PAGES.products = view;
  BIND.products = () => {
    const q = $('#prq');
    q.oninput = () => { pr.q = q.value; const pos = q.selectionStart; route(); const n = $('#prq'); n.focus(); n.setSelectionRange(pos, pos); };
    document.querySelectorAll('[data-prcat]').forEach(b => b.onclick = () => { pr.cat = b.dataset.prcat; route(); });
    document.querySelectorAll('[data-prreq]').forEach(b => b.onclick = () => requestDialog(b.dataset.prreq));
    document.querySelectorAll('[data-prgo]').forEach(b => b.onclick = () => { const p = CATALOGUE.find(x => x.id === b.dataset.prgo); toast(`${p.name}: setup continues on ${p.route === 'transactions' ? 'Transactions' : 'the next page'}`); go(p.route); });
    document.querySelectorAll('[data-prnotify]').forEach(b => b.onclick = async () => {
      const id = b.dataset.prnotify, on = !mine().notify[id]; b.disabled = true;
      try {
        pr.saved[state.mode] = await api(`/products/${id}/notify`, { method: 'POST', body: { on } });
        toast(on ? 'We\'ll email you when it launches' : 'Notification turned off'); route();
      } catch (e) { b.disabled = false; apiFail(e); }
    });
    if ($('#prclear')) $('#prclear').onclick = () => { pr.q = ''; pr.cat = 'all'; route(); };
  };
  window.products_request = requestDialog;
})();

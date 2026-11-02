// Page: developer. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
(() => {
  const V = { tab: 'keys', saltShown: false, rotating: false, saltVersion: { test: 'V2', live: 'V2' }, logQ: '', logS: '' };
  const PATHS = [['POST', '/v1/orders'], ['GET', '/v1/orders/{id}'], ['POST', '/v1/refunds'], ['GET', '/v1/payments/{id}'], ['POST', '/v1/payment_links'], ['GET', '/v1/settlements']];
  const apiLogs = Array.from({ length: 24 }, (_, i) => {
    const [m, p] = PATHS[i % PATHS.length], code = i % 9 === 4 ? 400 : i % 13 === 7 ? 401 : i % 17 === 11 ? 500 : m === 'POST' ? 201 : 200;
    return { id: 'req_' + (8800000 + i * 7919).toString(36), m, p: p.replace('{id}', i % 2 ? 'ord_' + (4100 + i) : 'pay_' + (9200 + i)), code, ms: 80 + Math.round(rnd() * 380), at: new Date(now - i * 47 * 60e3), key: 'pn_test_4f9a' };
  });
  const hookLogs = () => D().slice(0, 18).map((t, i) => ({
    id: 'evt_' + t.txnid.slice(-5), event: t.status === 'SUCCESS' ? 'payment.success' : t.status === 'PENDING' ? 'payment.pending' : 'payment.failed',
    url: (webhooks[state.mode][0] || {}).url || '—', attempts: i === 2 ? 3 : 1, code: i === 2 ? 200 : i === 6 ? 500 : 200, status: i === 6 ? 'FAILED' : 'DELIVERED', at: t.date, txn: t,
  }));
  const CODE = {
    node: `// npm i node-fetch
const res = await fetch("https://api.bizpolepay.example/v1/orders", {
  method: "POST",
  headers: { "Authorization": "Bearer " + process.env.BIZPOLEPAY_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 49900, receipt: "INV-1042",
    customer: { name: "Asha", email: "asha@example.in" }, return_url: "https://shop.example.in/thanks" })
});
const order = await res.json();   // redirect the customer to order.checkout_url`,
    python: `import os, requests
order = requests.post("https://api.bizpolepay.example/v1/orders",
    headers={"Authorization": f"Bearer {os.environ['BIZPOLEPAY_KEY']}"},
    json={"amount": 49900, "receipt": "INV-1042",
          "customer": {"name": "Asha", "email": "asha@example.in"},
          "return_url": "https://shop.example.in/thanks"}).json()
# redirect the customer to order["checkout_url"]`,
    php: `<?php
$ch = curl_init("https://api.bizpolepay.example/v1/orders");
curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Authorization: Bearer " . getenv("BIZPOLEPAY_KEY"), "Content-Type: application/json"],
  CURLOPT_POSTFIELDS => json_encode(["amount" => 49900, "receipt" => "INV-1042",
    "customer" => ["name" => "Asha", "email" => "asha@example.in"], "return_url" => "https://shop.example.in/thanks"])]);
$order = json_decode(curl_exec($ch), true); // redirect to $order["checkout_url"]`,
    curl: `curl https://api.bizpolepay.example/v1/orders \\
  -H "Authorization: Bearer $BIZPOLEPAY_KEY" -H "Content-Type: application/json" \\
  -d '{"amount":49900,"receipt":"INV-1042","customer":{"name":"Asha","email":"asha@example.in"},"return_url":"https://shop.example.in/thanks"}'`,
  };
  const VERIFY = `// Verify a Bizpole Pay webhook (Node)
import { createHmac, timingSafeEqual } from "node:crypto";
const sig = req.headers["bizpolepay-signature"];           // "t=1730530000,v1=<hex>"
const [t, v1] = sig.split(",").map(p => p.split("=")[1]);
const expected = createHmac("sha256", process.env.WEBHOOK_SECRET).update(t + "." + rawBody).digest("hex");
if (!timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) return res.sendStatus(400);`;
  const pretty = o => esc(JSON.stringify(o, null, 2));
  const dl = (name, text, type = 'text/plain') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };

  const TABS = [['keys', 'API keys'], ['hooks', 'Webhooks'], ['hlogs', 'Webhook logs'], ['alogs', 'API logs'], ['guide', 'Integration guide']];
  PAGES.developer = () => {
    const ok = apiLogs.filter(l => l.code < 400).length, lat = apiLogs.map(l => l.ms).sort((a, b) => a - b), hl = hookLogs();
    return head('Developer', `${isLive() ? 'Live' : 'Test'} mode credentials, webhooks and request logs.`, `<a class="btn" href="#/transactions">View test payments</a>`) +
      `<div class="grid g4" style="margin-bottom:16px">
        <div class="card kpi"><small>API requests · 24h</small><b>${apiLogs.length}</b><span class="d muted">${apiLogs.length - ok} errors</span></div>
        <div class="card kpi"><small>Error rate</small><b>${Math.round((apiLogs.length - ok) / apiLogs.length * 100)}%</b><span class="d muted">4xx and 5xx responses</span></div>
        <div class="card kpi"><small>p95 latency</small><b>${lat[Math.floor(lat.length * .95) - 1]} ms</b><span class="d muted">median ${lat[Math.floor(lat.length / 2)]} ms</span></div>
        <div class="card kpi"><small>Webhook success</small><b>${hl.length ? Math.round(hl.filter(h => h.status === 'DELIVERED').length / hl.length * 100) : 100}%</b><span class="d muted">${hl.length} deliveries</span></div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button data-dv="${k}" class="${k === V.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="dv"></div>`;
  };

  const VIEW = {
    keys: () => liveLocked() ? locked('Live keys') : `<div class="grid g2">
      <div class="card"><div class="between"><h3>Payment gateway credentials (${state.mode})</h3><span class="pill brand">Salt ${V.saltVersion[state.mode]}</span></div>
        <p class="muted" style="font-size:13px;margin-top:0">Used only by Bizpole Pay's servers to sign requests to PayU. Never put the salt in an app or website.</p>
        <label>Merchant ID</label><div class="secret"><code>${isLive() ? '87100421' : 'T-55120934'}</code><button class="btn sm" data-copy="${isLive() ? '87100421' : 'T-55120934'}">Copy</button></div>
        <label>Merchant key</label><div class="secret"><code>${isLive() ? 'LIVE_KEY_••••••' : 'TEST_KEY_••••••'}</code><button class="btn sm" data-copy="key">Copy</button></div>
        <label>Salt</label><div class="secret"><code>${V.saltShown ? 'demo-salt-not-real-0000000000' : '••••••••••••••••••••••••••••'}</code><button class="btn sm" id="dv-reveal">${V.saltShown ? 'Hide' : 'Reveal'}</button></div>
        ${V.rotating ? `<div class="notice" style="background:var(--accent-soft);color:#6B5208;margin-top:14px">A new V2 salt was issued. Update your servers, then activate it within 15 days or it expires.<div class="row" style="margin-top:8px;gap:8px"><button class="btn sm primary" id="dv-activate">Activate new salt</button><button class="btn sm" id="dv-cancelrot">Cancel</button></div></div>`
          : `<button class="btn" id="dv-rotate" style="margin-top:14px;align-self:flex-start">Rotate salt</button>`}</div>
      <div class="card"><div class="between"><h3>Bizpole Pay API keys</h3><button class="btn primary sm" id="dv-newkey">+ Create key</button></div>
        <p class="muted" style="font-size:13px;margin-top:0">Your servers use these to call the Bizpole Pay API. The secret is shown once when you create a key.</p>
        <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>
        ${apiKeys[state.mode].map((a, i) => `<tr><td>${esc(a.name)}</td><td class="mono">${a.prefix}••••</td><td>${a.created}</td><td>${a.last}</td><td class="right"><button class="btn sm danger" data-revoke="${i}">Revoke</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No API keys yet</td></tr>'}</tbody></table></div></div></div>`,
    hooks: () => `<div class="between" style="margin-bottom:12px"><span class="muted">We POST signed JSON to these URLs and retry failures up to 5 times over 24 hours.</span><button class="btn primary" id="dv-addhook">+ Add endpoint</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Endpoint</th><th>Events</th><th>Status</th><th></th></tr></thead><tbody>
      ${webhooks[state.mode].map((w, i) => `<tr><td class="mono">${esc(w.url)}</td><td>${w.events.map(e => `<span class="pill" style="margin:2px">${e}</span>`).join('')}</td><td>${w.active ? statusPill('ACTIVE') : statusPill('INACTIVE')}</td>
        <td class="right" style="white-space:nowrap"><button class="btn sm" data-test="${i}">Send test</button> <button class="btn sm" data-edit="${i}">Edit</button> <button class="btn sm danger" data-delhook="${i}">Delete</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No endpoints yet. Add one to receive payment events.</td></tr>'}</tbody></table></div>
      <div class="card" style="margin-top:16px"><h3>Verify signatures</h3><p class="muted" style="font-size:13px;margin-top:0">Every request has a <span class="mono">BizpolePay-Signature</span> header. Check it before trusting the body.</p><pre class="code">${esc(VERIFY)}</pre></div>`,
    hlogs: () => {
      const rows = hookLogs().filter(h => !V.logS || h.status === V.logS);
      return `<div class="toolbar"><select id="dv-hs" style="width:auto"><option value="">All deliveries</option><option value="DELIVERED" ${V.logS === 'DELIVERED' ? 'selected' : ''}>Delivered</option><option value="FAILED" ${V.logS === 'FAILED' ? 'selected' : ''}>Failed</option></select></div>
      <div class="tbl-wrap"><table><thead><tr><th>Time</th><th>Event ID</th><th>Event</th><th>Endpoint</th><th class="right">Attempts</th><th>Response</th><th>Status</th></tr></thead><tbody>
      ${rows.map(h => `<tr class="click" data-hl="${h.id}"><td>${fmtDate(h.at)}</td><td class="mono">${h.id}</td><td class="mono">${h.event}</td><td class="mono">${esc(h.url.replace(/^https?:\/\/[^/]+/, ''))}</td><td class="right">${h.attempts}</td><td class="mono">${h.code}</td><td>${statusPill(h.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No deliveries</td></tr>'}</tbody></table></div>`;
    },
    alogs: () => {
      const q = V.logQ.toLowerCase(), rows = apiLogs.filter(l => !q || (l.m + ' ' + l.p + ' ' + l.id + ' ' + l.code).toLowerCase().includes(q));
      return `<div class="toolbar"><input id="dv-aq" placeholder="Search path, request ID or status code" value="${esc(V.logQ)}" style="max-width:420px"></div>
      <div class="tbl-wrap"><table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th class="right">Latency</th><th>Request ID</th></tr></thead><tbody>
      ${rows.map(l => `<tr class="click" data-al="${l.id}"><td>${fmtDate(l.at)}</td><td><span class="pill ${l.m === 'POST' ? 'brand' : ''}">${l.m}</span></td><td class="mono">${l.p}</td><td><span class="pill ${l.code < 400 ? 'ok' : l.code < 500 ? 'warn' : 'bad'}">${l.code}</span></td><td class="right">${l.ms} ms</td><td class="mono muted">${l.id}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No matching requests</td></tr>'}</tbody></table></div>`;
    },
    guide: () => `<div class="grid g-21"><div class="card"><h3>1 · Create an order on your server</h3>
        <div class="tabs" style="margin-bottom:10px">${Object.keys(CODE).map(k => `<button data-lang="${k}" class="${k === (V.lang || 'node') ? 'on' : ''}">${{ node: 'Node.js', python: 'Python', php: 'PHP', curl: 'cURL' }[k]}</button>`).join('')}</div>
        <pre class="code" id="dv-code">${esc(CODE[V.lang || 'node'])}</pre>
        <h3 style="margin-top:18px">2 · Redirect and listen</h3><p class="muted" style="margin:0">Send the customer to <span class="mono">checkout_url</span>. When the payment is confirmed with PayU we send <span class="mono">payment.success</span> to your webhook.</p>
        <h3 style="margin-top:18px">3 · Refund when needed</h3><pre class="code">POST /v1/refunds  { "payment_id": "pay_9201", "amount": 10000, "reason": "Customer request" }</pre></div>
      <div class="card"><h3>Test details</h3><p class="muted" style="font-size:13px;margin-top:0">Test mode never moves real money. Use these on the test checkout:</p>
        <dl class="kv"><dt>Card (success)</dt><dd class="mono">5123 4567 8901 2346</dd><dt>Expiry / CVV</dt><dd class="mono">05/30 · 123</dd><dt>OTP</dt><dd class="mono">123456</dd>
        <dt>UPI (success)</dt><dd class="mono">success@upi</dd><dt>UPI (failure)</dt><dd class="mono">failure@upi</dd></dl>
        <p class="muted" style="font-size:12.5px">Illustrative values. Use the current test credentials from PayU's sandbox docs.</p>
        <a class="btn" href="#/checkout" style="margin-top:auto">Preview your checkout</a></div></div>`,
  };

  function show(k){ V.tab = k; document.querySelectorAll('[data-dv]').forEach(b => b.classList.toggle('on', b.dataset.dv === k)); $('#dv').innerHTML = VIEW[k](); (BINDV[k] || (() => {}))(); }
  function hookDialog(i){
    const w = i == null ? { url: '', events: ['payment.success', 'payment.failed', 'refund.processed'], active: true } : webhooks[state.mode][i];
    const EV = ['payment.success', 'payment.failed', 'payment.pending', 'refund.processed', 'settlement.processed', 'link.paid', 'chargeback.created'];
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${i == null ? 'Add' : 'Edit'} webhook endpoint</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <label>Endpoint URL</label><input id="wh-url" type="url" value="${esc(w.url)}" placeholder="https://yourserver.in/webhooks/bizpolepay"><span class="muted" id="wh-err" style="color:var(--bad);font-size:12px"></span>
      <label>Events</label><div class="grid g2" style="gap:0 12px">${EV.map(e => `<label class="ck"><input type="checkbox" class="wh-ev" value="${e}" ${w.events.includes(e) ? 'checked' : ''}>${e}</label>`).join('')}</div>
      <label class="ck" style="margin-top:10px!important"><input type="checkbox" id="wh-act" ${w.active ? 'checked' : ''}>Endpoint enabled</label>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="wh-go">${i == null ? 'Add endpoint' : 'Save'}</button></div>`, { wide: true });
    $('#wh-go').onclick = () => {
      const url = $('#wh-url').value.trim(), evs = [...document.querySelectorAll('.wh-ev:checked')].map(x => x.value);
      const e = !/^https:\/\/[^\s/]+\.[^\s]+/.test(url) ? 'Use a public https:// URL' : !evs.length ? 'Pick at least one event' : '';
      $('#wh-err').textContent = e; if (e) return;
      const rec = { url, events: evs, active: $('#wh-act').checked };
      if (i == null) {
        webhooks[state.mode].push(rec);
        const secret = 'whsec_' + Math.random().toString(36).slice(2, 14);
        openModal(`<h2 style="margin:0 0 6px;font-size:20px">Endpoint added</h2><p class="muted">Copy the signing secret now. It won't be shown again.</p>
          <div class="secret"><code>${secret}</code><button class="btn sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${secret}');toast('Secret copied')">Copy</button></div>
          <div class="row" style="margin-top:14px"><button class="btn primary" onclick="closeAll()">Done</button></div>`);
      } else { webhooks[state.mode][i] = rec; closeAll(); toast('Endpoint updated'); }
      show('hooks');
    };
  }

  const BINDV = {
    keys: () => {
      if (liveLocked()) return;
      document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); });
      $('#dv-reveal').onclick = () => {
        if (V.saltShown) { V.saltShown = false; return show('keys'); }
        openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Confirm it's you</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
          <p class="muted">Revealing the salt is recorded in the audit log.</p><label>Password</label><input id="rv-pw" type="password" placeholder="Your Bizpole Pay password"><span id="rv-err" style="color:var(--bad);font-size:12px"></span>
          <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rv-go">Reveal salt</button></div>`);
        $('#rv-go').onclick = () => { if (!$('#rv-pw').value) { $('#rv-err').textContent = 'Enter your password'; return; } V.saltShown = true; closeAll(); toast('Salt revealed · logged in audit trail'); show('keys'); };
      };
      if ($('#dv-rotate')) $('#dv-rotate').onclick = () => { V.rotating = true; toast('New V2 salt issued'); show('keys'); };
      if ($('#dv-activate')) $('#dv-activate').onclick = () => { V.rotating = false; V.saltVersion[state.mode] = 'V2'; toast('New salt active · old salt retired'); show('keys'); };
      if ($('#dv-cancelrot')) $('#dv-cancelrot').onclick = () => { V.rotating = false; show('keys'); };
      $('#dv-newkey').onclick = () => {
        openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Create API key</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
          <label>Key name</label><input id="nk-name" placeholder="e.g. Production server"><span id="nk-err" style="color:var(--bad);font-size:12px"></span>
          <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="nk-go">Create</button></div>`);
        $('#nk-go').onclick = () => {
          const n = $('#nk-name').value.trim(); if (n.length < 3) { $('#nk-err').textContent = 'Give the key a name (3+ characters)'; return; }
          const prefix = `pn_${state.mode}_${Math.random().toString(16).slice(2, 6)}`, secret = prefix + '_' + Math.random().toString(36).slice(2, 18);
          apiKeys[state.mode].unshift({ name: n, prefix, created: 'Today', last: 'Never' });
          openModal(`<h2 style="margin:0 0 6px;font-size:20px">Key created</h2><p class="muted">Copy this secret now. For your security it won't be shown again.</p>
            <div class="secret"><code>${secret}</code><button class="btn sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${secret}');toast('Secret copied')">Copy</button></div>
            <div class="row" style="margin-top:14px"><button class="btn primary" onclick="closeAll()">I've saved it</button></div>`);
          show('keys');
        };
      };
      document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = () => {
        const k = apiKeys[state.mode][+b.dataset.revoke];
        openModal(`<h2 style="margin:0 0 8px;font-size:20px">Revoke ${esc(k.name)}?</h2><p class="muted">Requests using <span class="mono">${k.prefix}••••</span> will fail immediately.</p>
          <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rk-go">Revoke key</button></div>`);
        $('#rk-go').onclick = () => { apiKeys[state.mode].splice(+b.dataset.revoke, 1); closeAll(); toast('Key revoked'); show('keys'); };
      });
    },
    hooks: () => {
      $('#dv-addhook').onclick = () => hookDialog(null);
      document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => hookDialog(+b.dataset.edit));
      document.querySelectorAll('[data-delhook]').forEach(b => b.onclick = () => { webhooks[state.mode].splice(+b.dataset.delhook, 1); toast('Endpoint deleted'); show('hooks'); });
      document.querySelectorAll('[data-test]').forEach(b => b.onclick = () => {
        const w = webhooks[state.mode][+b.dataset.test], body = { id: 'evt_test_' + Date.now().toString(36), type: 'payment.success', created: new Date().toISOString(), data: { payment_id: 'pay_test_1', amount: 49900, currency: 'INR' } };
        openDrawer(`<div class="between"><h2 style="margin:0">Test event sent</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div><p>${statusPill('DELIVERED')} <span class="muted">${esc(w.url)}</span></p>
          <h3>Request</h3><pre class="code">POST ${esc(w.url)}\nBizpolePay-Signature: t=${Math.floor(Date.now() / 1000)},v1=3f9c…\n\n${pretty(body)}</pre>
          <h3 style="margin-top:14px">Response</h3><pre class="code">HTTP/1.1 200 OK · 142 ms\n\n{"received": true}</pre>`);
      });
    },
    hlogs: () => {
      $('#dv-hs').onchange = e => { V.logS = e.target.value; show('hlogs'); };
      document.querySelectorAll('[data-hl]').forEach(r => r.onclick = () => {
        const h = hookLogs().find(x => x.id === r.dataset.hl), t = h.txn;
        const body = { id: h.id, type: h.event, created: t.date.toISOString(), data: { payment_id: t.mihpayid, txnid: t.txnid, amount: t.amount, currency: 'INR', mode: t.mode, status: t.status.toLowerCase() } };
        openDrawer(`<div class="between"><h2 style="margin:0;font-size:20px">${h.event}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
          <p>${statusPill(h.status)} <span class="muted">${fmtDate(h.at)} · ${h.attempts} attempt${h.attempts > 1 ? 's' : ''}</span></p>
          <dl class="kv"><dt>Event ID</dt><dd class="mono">${h.id}</dd><dt>Endpoint</dt><dd class="mono">${esc(h.url)}</dd><dt>Response</dt><dd class="mono">${h.code}${h.code >= 500 ? ' · server error' : ' · OK'}</dd></dl>
          <h3 style="margin-top:14px">Payload</h3><pre class="code">${pretty(body)}</pre>
          <div class="row" style="margin-top:14px"><button class="btn primary" id="hl-re">Redeliver</button><button class="btn" onclick="closeAll();go('transactions')">Open payment</button></div>`);
        $('#hl-re').onclick = () => { closeAll(); toast('Redelivered · 200 OK'); };
      });
    },
    alogs: () => {
      $('#dv-aq').oninput = e => { V.logQ = e.target.value; show('alogs'); const i = $('#dv-aq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
      document.querySelectorAll('[data-al]').forEach(r => r.onclick = () => {
        const l = apiLogs.find(x => x.id === r.dataset.al);
        const req = l.m === 'POST' ? { amount: 49900, receipt: 'INV-' + (1000 + l.ms), customer: { email: 'asha@example.in' } } : null;
        const resp = l.code >= 500 ? { error: { code: 'internal_error', message: 'Temporary upstream failure. Safe to retry.' } }
          : l.code === 401 ? { error: { code: 'unauthorized', message: 'Invalid API key' } } : l.code === 400 ? { error: { code: 'invalid_request', message: 'amount must be at least 100 (₹1)', param: 'amount' } }
          : { id: l.p.split('/').pop().startsWith('ord') ? l.p.split('/').pop() : 'ord_' + l.ms, status: 'created', amount: 49900 };
        openDrawer(`<div class="between"><h2 style="margin:0;font-size:20px">${l.m} ${esc(l.p)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
          <p><span class="pill ${l.code < 400 ? 'ok' : l.code < 500 ? 'warn' : 'bad'}">${l.code}</span> <span class="muted">${fmtDate(l.at)} · ${l.ms} ms</span></p>
          <dl class="kv"><dt>Request ID</dt><dd class="mono">${l.id}</dd><dt>API key</dt><dd class="mono">${l.key}••••</dd><dt>Source IP</dt><dd class="mono">103.21.58.14</dd></dl>
          ${req ? `<h3 style="margin-top:14px">Request body</h3><pre class="code">${pretty(req)}</pre>` : ''}<h3 style="margin-top:14px">Response body</h3><pre class="code">${pretty(resp)}</pre>`);
      });
    },
    guide: () => document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { V.lang = b.dataset.lang; show('guide'); }),
  };

  BIND.developer = () => { document.querySelectorAll('[data-dv]').forEach(b => b.onclick = () => show(b.dataset.dv)); show(V.tab); };
})();

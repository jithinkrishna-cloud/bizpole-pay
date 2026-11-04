// Page: developer. Uses globals from app.html core (state, api, LOAD, webhooks, apiKeys, helpers, PAGES, BIND).
(() => {
  const V = { tab: 'keys', logS: '', lang: 'node' };
  // Per-mode stores filled by LOAD.developer (apiKeys / webhooks are core stores).
  const creds = { test: [], live: [] }, deliveries = { test: [], live: [] };
  let EVENTS = ['payment.success', 'payment.failed', 'payment.pending', 'refund.processed', 'settlement.processed', 'link.paid', 'chargeback.created'];
  const canWrite = () => ['OWNER', 'ADMIN', 'DEVELOPER'].includes(state.role);

  LOAD.developer = async (mode) => {
    const r = await api('/developer', { mode });
    creds[mode] = r.credentials.map(c => ({ ...c, issuedAt: toDate(c.issuedAt) }));
    apiKeys[mode] = r.apiKeys.map(k => ({ ...k, created: toDate(k.created), lastUsed: toDate(k.lastUsed) }));
    webhooks[mode] = r.webhooks;
    deliveries[mode] = r.deliveries.map(d => ({ ...d, at: toDate(d.at) }));
    if (r.events && r.events.length) EVENTS = r.events;
  };

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
  const day = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never';
  const x = '<button class="x" onclick="closeAll()" aria-label="Close"><i data-icon=x class=li></i></button>';
  const copyBtn = v => `<button class="btn sm" data-copyval="${esc(v)}">Copy</button>`;
  const bindCopy = root => (root || document).querySelectorAll('[data-copyval]').forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copyval); toast('Copied'); });
  const busy = (b, on) => { if (b) b.disabled = on; };

  // API logs: there is no request-log table, so that tab was removed rather than showing invented requests.
  const TABS = [['keys', 'API keys'], ['hooks', 'Webhooks'], ['hlogs', 'Webhook logs'], ['guide', 'Integration guide']];
  PAGES.developer = () => {
    const m = state.mode, dl = deliveries[m], ok = dl.filter(d => d.status === 'DELIVERED').length, def = creds[m].find(c => c.isDefault && c.status === 'ACTIVE');
    return head('Developer', `${isLive() ? 'Live' : 'Test'} mode credentials, API keys and webhooks.`, `<a class="btn" href="#/transactions">View ${isLive() ? 'live' : 'test'} payments</a>`) +
      `<div class="grid g4" style="margin-bottom:16px">
        <div class="card kpi"><small>PayU credentials</small><b>${def ? 'Active' : 'Not set'}</b><span class="d muted">${def ? 'MID ' + esc(def.mid) + ' · salt ' + def.saltVersion : isLive() ? 'Issued when you go live' : 'Set up by Bizpole support'}</span></div>
        <div class="card kpi"><small>Active API keys</small><b>${apiKeys[m].length}</b><span class="d muted">${m} mode</span></div>
        <div class="card kpi"><small>Webhook endpoints</small><b>${webhooks[m].length}</b><span class="d muted">${webhooks[m].filter(w => w.active).length} enabled</span></div>
        <div class="card kpi"><small>Webhook success</small><b>${dl.length ? Math.round(ok / dl.length * 100) + '%' : '—'}</b><span class="d muted">${dl.length} deliver${dl.length === 1 ? 'y' : 'ies'} recorded</span></div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button data-dv="${k}" class="${k === V.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="dv"></div>`;
  };

  function credCard(){
    const list = creds[state.mode], def = list.find(c => c.isDefault && c.status === 'ACTIVE'), others = list.filter(c => c !== def);
    const body = def ? `<label>Merchant ID</label><div class="secret"><code>${esc(def.mid)}</code>${copyBtn(def.mid)}</div>
        <label>Merchant key</label><div class="secret"><code>${esc(def.key)}</code></div>
        <label>Salt</label><div class="secret"><code>••••••••••••••••••••••••••••</code></div>
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">The salt is stored encrypted and is never shown, not even to you.</p>`
      : `<div class="empty-state" style="padding:18px 8px;text-align:center"><b>No ${state.mode} credentials yet</b><p class="muted" style="font-size:13px;margin:6px 0 0">${isLive() ? 'Live PayU credentials are issued when your account goes live.' : 'Bizpole support links a PayU test account to your organization so test payments, refunds and links can reach PayU.'}</p></div>`;
    return `<div class="card"><div class="between"><h3>Payment gateway credentials (${state.mode})</h3>${def ? `<span class="pill brand">Salt ${def.saltVersion}</span>` : ''}</div>
      <p class="muted" style="font-size:13px;margin-top:0">Used only by Bizpole Pay's servers to sign requests to PayU. Never put the salt in an app or website.</p>
      ${body}
      ${others.length ? `<h4 style="margin:16px 0 4px;font-size:13px">Other credentials</h4><div class="tbl-wrap"><table><thead><tr><th>MID</th><th>Key</th><th>Salt</th><th>Status</th><th>Added</th></tr></thead><tbody>
        ${others.map(c => `<tr><td class="mono">${esc(c.mid)}</td><td class="mono">${esc(c.key)}</td><td>${c.saltVersion}</td><td>${statusPill(c.status === 'ACTIVE' ? 'INACTIVE' : c.status)}</td><td>${day(c.issuedAt)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);font-size:13px;color:var(--ink-2)">PayU credentials are managed by Bizpole. To add, replace or rotate them, contact Bizpole support.</div></div>`;
  }

  const VIEW = {
    keys: () => liveLocked() ? locked('Live keys') : `<div class="grid g2">${credCard()}
      <div class="card"><div class="between"><h3>Bizpole Pay API keys</h3>${canWrite() ? '<button class="btn primary sm" id="dv-newkey">+ Create key</button>' : ''}</div>
        <p class="muted" style="font-size:13px;margin-top:0">Your servers use these to call the Bizpole Pay API. The secret is shown once when you create a key; we keep only a hash of it.</p>
        <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>
        ${apiKeys[state.mode].map(a => `<tr><td>${esc(a.name)}</td><td class="mono">${esc(a.prefix)}_••••</td><td>${day(a.created)}</td><td>${day(a.lastUsed)}</td><td class="right">${canWrite() ? `<button class="btn sm danger" data-revoke="${esc(a.id)}">Revoke</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">No ${state.mode} API keys yet</td></tr>`}</tbody></table></div></div></div>`,
    hooks: () => `<div class="between" style="margin-bottom:12px"><span class="muted">We POST signed JSON to these URLs. Use "Send test" to check an endpoint; the result is your server's real response.</span>${canWrite() ? '<button class="btn primary" id="dv-addhook">+ Add endpoint</button>' : ''}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Endpoint</th><th>Events</th><th>Status</th><th></th></tr></thead><tbody>
      ${webhooks[state.mode].map(w => `<tr><td class="mono">${esc(w.url)}</td><td>${w.events.map(e => `<span class="pill" style="margin:2px">${esc(e)}</span>`).join('')}</td><td>${w.active ? statusPill('ACTIVE') : statusPill('INACTIVE')}</td>
        <td class="right" style="white-space:nowrap">${canWrite() ? `<button class="btn sm" data-test="${esc(w.id)}">Send test</button> <button class="btn sm" data-edit="${esc(w.id)}">Edit</button> <button class="btn sm danger" data-delhook="${esc(w.id)}">Delete</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="4" class="empty">No ${state.mode} endpoints yet. Add one to receive payment events.</td></tr>`}</tbody></table></div>
      <div class="card" style="margin-top:16px"><h3>Verify signatures</h3><p class="muted" style="font-size:13px;margin-top:0">Every request has a <span class="mono">BizpolePay-Signature</span> header. Check it before trusting the body.</p><pre class="code">${esc(VERIFY)}</pre></div>`,
    hlogs: () => {
      const rows = deliveries[state.mode].filter(h => !V.logS || h.status === V.logS);
      return `<div class="toolbar"><select id="dv-hs" style="width:auto"><option value="">All deliveries</option>${['DELIVERED', 'FAILED', 'PENDING'].map(s => `<option value="${s}" ${V.logS === s ? 'selected' : ''}>${s[0] + s.slice(1).toLowerCase()}</option>`).join('')}</select></div>
      <div class="tbl-wrap"><table><thead><tr><th>Time</th><th>Event ID</th><th>Event</th><th>Endpoint</th><th class="right">Attempts</th><th>Response</th><th>Status</th></tr></thead><tbody>
      ${rows.map(h => `<tr class="click" data-hl="${esc(h.id)}"><td>${fmtDate(h.at)}</td><td class="mono">${esc(h.eventId)}</td><td class="mono">${esc(h.event)}</td><td class="mono">${esc(h.url.replace(/^https?:\/\/[^/]+/, '') || '/')}</td><td class="right">${h.attempts}</td><td class="mono">${h.code == null ? '—' : h.code}</td><td>${statusPill(h.status)}</td></tr>`).join('')
        || `<tr><td colspan="7" class="empty">${deliveries[state.mode].length ? 'No deliveries match this filter' : 'No webhook deliveries yet. Add an endpoint and use "Send test" to make one.'}</td></tr>`}</tbody></table></div>`;
    },
    guide: () => `<div class="grid g-21"><div class="card"><h3>1 · Create an order on your server</h3>
        <div class="tabs" style="margin-bottom:10px">${Object.keys(CODE).map(k => `<button data-lang="${k}" class="${k === V.lang ? 'on' : ''}">${{ node: 'Node.js', python: 'Python', php: 'PHP', curl: 'cURL' }[k]}</button>`).join('')}</div>
        <pre class="code" id="dv-code">${esc(CODE[V.lang])}</pre>
        <h3 style="margin-top:18px">2 · Redirect and listen</h3><p class="muted" style="margin:0">Send the customer to <span class="mono">checkout_url</span>. When the payment is confirmed with PayU we send <span class="mono">payment.success</span> to your webhook.</p>
        <h3 style="margin-top:18px">3 · Refund when needed</h3><pre class="code">POST /v1/refunds  { "payment_id": "pay_9201", "amount": 10000, "reason": "Customer request" }</pre></div>
      <div class="card"><h3>Test details</h3><p class="muted" style="font-size:13px;margin-top:0">Test mode never moves real money. Use these on the test checkout:</p>
        <dl class="kv"><dt>Card (success)</dt><dd class="mono">5123 4567 8901 2346</dd><dt>Expiry / CVV</dt><dd class="mono">05/30 · 123</dd><dt>OTP</dt><dd class="mono">123456</dd>
        <dt>UPI (success)</dt><dd class="mono">success@upi</dd><dt>UPI (failure)</dt><dd class="mono">failure@upi</dd></dl>
        <p class="muted" style="font-size:12.5px">Illustrative values. Use the current test credentials from PayU's sandbox docs.</p>
        <a class="btn" href="#/checkout" style="margin-top:auto">Preview your checkout</a></div></div>`,
  };

  function show(k){ V.tab = k; document.querySelectorAll('[data-dv]').forEach(b => b.classList.toggle('on', b.dataset.dv === k)); $('#dv').innerHTML = VIEW[k](); bindCopy($('#dv')); (BINDV[k] || (() => {}))(); }
  // Refresh this mode's developer data and redraw (KPIs included).
  async function refresh(){ await LOAD.developer(state.mode).catch(apiFail); route(); }

  function secretModal(title, note, secret, done){
    openModal(`<h2 style="margin:0 0 6px;font-size:20px">${title}</h2><p class="muted">${note}</p>
      <div class="secret"><code style="word-break:break-all">${esc(secret)}</code>${copyBtn(secret)}</div>
      <div class="row" style="margin-top:14px"><button class="btn primary" onclick="closeAll()">${done}</button></div>`);
    bindCopy($('#modal'));
  }

  function hookDialog(id){
    const w = id == null ? { url: '', events: ['payment.success', 'payment.failed', 'refund.processed'], active: true } : webhooks[state.mode].find(h => h.id === id);
    if (!w) return;
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${id == null ? 'Add' : 'Edit'} webhook endpoint</h2>${x}</div>
      <label>Endpoint URL</label><input id="wh-url" type="url" value="${esc(w.url)}" placeholder="https://yourserver.in/webhooks/bizpolepay"><span class="muted" id="wh-err" style="color:var(--bad);font-size:12px"></span>
      <label>Events</label><div class="grid g2" style="gap:0 12px">${EVENTS.map(e => `<label class="ck"><input type="checkbox" class="wh-ev" value="${esc(e)}" ${w.events.includes(e) ? 'checked' : ''}>${esc(e)}</label>`).join('')}</div>
      <label class="ck" style="margin-top:10px!important"><input type="checkbox" id="wh-act" ${w.active ? 'checked' : ''}>Endpoint enabled</label>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="wh-go">${id == null ? 'Add endpoint' : 'Save'}</button></div>`, { wide: true });
    $('#wh-go').onclick = async () => {
      const url = $('#wh-url').value.trim(), events = [...document.querySelectorAll('.wh-ev:checked')].map(i => i.value);
      const e = !/^https:\/\/[^\s/]+\.[^\s]+/.test(url) ? 'Use a public https:// URL' : !events.length ? 'Pick at least one event' : '';
      $('#wh-err').textContent = e; if (e) return;
      const body = { url, events, active: $('#wh-act').checked };
      busy($('#wh-go'), true);
      try {
        if (id == null) {
          const r = await api('/developer/webhooks', { method: 'POST', body });
          await LOAD.developer(state.mode).catch(apiFail); route();
          secretModal('Endpoint added', "Copy the signing secret now. It won't be shown again.", r.secret, 'Done');
        } else {
          await api('/developer/webhooks/' + encodeURIComponent(id), { method: 'PATCH', body });
          closeAll(); toast('Endpoint updated'); await refresh();
        }
      } catch (err) { $('#wh-err').textContent = err.message; busy($('#wh-go'), false); }
    };
  }

  // Shows the real outcome of a delivery attempt (test or redelivery).
  function resultDrawer(title, r){
    const ok = r.ok, code = r.code;
    openDrawer(`<div class="between"><h2 style="margin:0">${title}</h2>${x}</div>
      <p>${statusPill(ok ? 'DELIVERED' : 'FAILED')} <span class="muted">${esc(r.url)}</span></p>
      ${r.payload ? `<h3>Request</h3><pre class="code">POST ${esc(r.url)}\nBizpolePay-Signature: ${esc(r.signature)}\n\n${pretty(r.payload)}</pre>` : ''}
      <h3 style="margin-top:14px">Response</h3><pre class="code">${code == null ? esc(r.error || 'No response') : `HTTP ${code}${r.ms != null ? ' · ' + r.ms + ' ms' : ''}\n\n${esc(r.body || '(empty body)')}`}</pre>
      ${ok ? '' : '<p class="muted" style="font-size:13px">Only a 2xx response counts as delivered.</p>'}`);
  }

  const BINDV = {
    keys: () => {
      if (liveLocked()) return;
      if ($('#dv-newkey')) $('#dv-newkey').onclick = () => {
        openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Create ${state.mode} API key</h2>${x}</div>
          <label>Key name</label><input id="nk-name" placeholder="e.g. Production server" maxlength="60"><span id="nk-err" style="color:var(--bad);font-size:12px"></span>
          <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="nk-go">Create</button></div>`);
        $('#nk-go').onclick = async () => {
          const n = $('#nk-name').value.trim(); if (n.length < 3) { $('#nk-err').textContent = 'Give the key a name (3+ characters)'; return; }
          busy($('#nk-go'), true);
          try {
            const r = await api('/developer/keys', { method: 'POST', body: { name: n } });
            await LOAD.developer(state.mode).catch(apiFail); route();
            secretModal('Key created', "Copy this secret now. We only store a hash, so it can't be shown again.", r.secret, "I've saved it");
          } catch (e) { $('#nk-err').textContent = e.message; busy($('#nk-go'), false); }
        };
      };
      document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = () => {
        const k = apiKeys[state.mode].find(a => a.id === b.dataset.revoke); if (!k) return;
        openModal(`<h2 style="margin:0 0 8px;font-size:20px">Revoke ${esc(k.name)}?</h2><p class="muted">Requests using <span class="mono">${esc(k.prefix)}_••••</span> will fail immediately.</p>
          <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rk-go">Revoke key</button></div>`);
        $('#rk-go').onclick = async () => {
          busy($('#rk-go'), true);
          try { await api('/developer/keys/' + encodeURIComponent(k.id), { method: 'DELETE' }); closeAll(); toast('Key revoked'); await refresh(); }
          catch (e) { apiFail(e); busy($('#rk-go'), false); }
        };
      });
    },
    hooks: () => {
      if ($('#dv-addhook')) $('#dv-addhook').onclick = () => hookDialog(null);
      document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => hookDialog(b.dataset.edit));
      document.querySelectorAll('[data-delhook]').forEach(b => b.onclick = () => {
        const w = webhooks[state.mode].find(h => h.id === b.dataset.delhook); if (!w) return;
        openModal(`<h2 style="margin:0 0 8px;font-size:20px">Delete this endpoint?</h2><p class="muted mono" style="word-break:break-all">${esc(w.url)}</p><p class="muted">Its delivery history is deleted too.</p>
          <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="dh-go">Delete endpoint</button></div>`);
        $('#dh-go').onclick = async () => {
          busy($('#dh-go'), true);
          try { await api('/developer/webhooks/' + encodeURIComponent(w.id), { method: 'DELETE' }); closeAll(); toast('Endpoint deleted'); await refresh(); }
          catch (e) { apiFail(e); busy($('#dh-go'), false); }
        };
      });
      document.querySelectorAll('[data-test]').forEach(b => b.onclick = async () => {
        busy(b, true); b.textContent = 'Sending…';
        try {
          const r = await api('/developer/webhooks/' + encodeURIComponent(b.dataset.test) + '/test', { method: 'POST' });
          await LOAD.developer(state.mode).catch(apiFail); route();
          resultDrawer(r.ok ? 'Test event delivered' : 'Test event not delivered', r);
        } catch (e) { apiFail(e); busy(b, false); b.textContent = 'Send test'; }
      });
    },
    hlogs: () => {
      $('#dv-hs').onchange = e => { V.logS = e.target.value; show('hlogs'); };
      document.querySelectorAll('[data-hl]').forEach(r => r.onclick = () => {
        const h = deliveries[state.mode].find(d => d.id === r.dataset.hl); if (!h) return;
        openDrawer(`<div class="between"><h2 style="margin:0;font-size:20px">${esc(h.event)}</h2>${x}</div>
          <p>${statusPill(h.status)} <span class="muted">${fmtDate(h.at)} · ${h.attempts} attempt${h.attempts === 1 ? '' : 's'}</span></p>
          <dl class="kv"><dt>Event ID</dt><dd class="mono">${esc(h.eventId)}</dd><dt>Endpoint</dt><dd class="mono" style="word-break:break-all">${esc(h.url)}</dd><dt>Response</dt><dd class="mono">${h.code == null ? 'No response' : h.code}</dd></dl>
          <h3 style="margin-top:14px">Payload</h3><pre class="code">${pretty(h.payload)}</pre>
          ${canWrite() ? '<div class="row" style="margin-top:14px"><button class="btn primary" id="hl-re">Redeliver</button></div>' : ''}`);
        if ($('#hl-re')) $('#hl-re').onclick = async () => {
          busy($('#hl-re'), true); $('#hl-re').textContent = 'Sending…';
          try {
            const res = await api('/developer/deliveries/' + encodeURIComponent(h.id) + '/redeliver', { method: 'POST' });
            await LOAD.developer(state.mode).catch(apiFail); route();
            resultDrawer(res.ok ? 'Redelivered' : 'Redelivery failed', res);
          } catch (e) { apiFail(e); busy($('#hl-re'), false); }
        };
      });
    },
    guide: () => document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { V.lang = b.dataset.lang; show('guide'); }),
  };

  BIND.developer = () => { document.querySelectorAll('[data-dv]').forEach(b => b.onclick = () => show(b.dataset.dv)); show(V.tab); };
})();

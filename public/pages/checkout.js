// Page: checkout. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Manage checkout ---- */
(() => {
  const METHODS = {
    UPI: { ic: '◎', sub: 'Google Pay, PhonePe, Paytm & any UPI app' },
    Cards: { ic: '<i data-icon=credit-card class=li></i>', sub: 'Visa, Mastercard, RuPay, Amex' },
    'Net banking': { ic: '<i data-icon=landmark class=li></i>', sub: '50+ banks' },
    Wallets: { ic: '👛', sub: 'PhonePe, Amazon Pay, Mobikwik' },
    EMI: { ic: '📆', sub: 'Credit & debit card EMI' },
    'Pay later': { ic: '<i data-icon=timer class=li></i>', sub: 'Simpl, LazyPay, ICICI PayLater' },
  };
  const PRESETS = ['#E65F55', '#211F24', '#F1C64B', '#343138', '#2F8F5B', '#1d4ed8', '#C8463C', '#8A858F'];
  const LANGS = {
    en: { name: 'English', pay: 'Pay', methods: 'Payment methods', summary: 'Order summary', total: 'Total', scan: 'Scan with any UPI app', vpa: 'Or enter your UPI ID', card: 'Card number', exp: 'Expiry (MM/YY)', cvv: 'CVV', holder: 'Name on card', verify: 'Verify', other: 'Select a payment method to continue' },
    hi: { name: 'हिन्दी', pay: 'भुगतान करें', methods: 'भुगतान के तरीके', summary: 'ऑर्डर सारांश', total: 'कुल', scan: 'किसी भी UPI ऐप से स्कैन करें', vpa: 'या अपनी UPI ID दर्ज करें', card: 'कार्ड नंबर', exp: 'समाप्ति (MM/YY)', cvv: 'CVV', holder: 'कार्ड पर नाम', verify: 'सत्यापित करें', other: 'जारी रखने के लिए भुगतान का तरीका चुनें' },
    ta: { name: 'தமிழ்', pay: 'செலுத்து', methods: 'கட்டண முறைகள்', summary: 'ஆர்டர் சுருக்கம்', total: 'மொத்தம்', scan: 'எந்த UPI செயலியிலும் ஸ்கேன் செய்யவும்', vpa: 'அல்லது உங்கள் UPI ID-ஐ உள்ளிடவும்', card: 'கார்டு எண்', exp: 'காலாவதி (MM/YY)', cvv: 'CVV', holder: 'கார்டில் உள்ள பெயர்', verify: 'சரிபார்', other: 'தொடர கட்டண முறையைத் தேர்ந்தெடுக்கவும்' },
    ml: { name: 'മലയാളം', pay: 'പണമടയ്ക്കുക', methods: 'പേയ്‌മെന്റ് രീതികൾ', summary: 'ഓർഡർ സംഗ്രഹം', total: 'ആകെ', scan: 'ഏത് UPI ആപ്പിലും സ്കാൻ ചെയ്യുക', vpa: 'അല്ലെങ്കിൽ UPI ID നൽകുക', card: 'കാർഡ് നമ്പർ', exp: 'കാലാവധി (MM/YY)', cvv: 'CVV', holder: 'കാർഡിലെ പേര്', verify: 'പരിശോധിക്കുക', other: 'തുടരാൻ ഒരു പേയ്‌മെന്റ് രീതി തിരഞ്ഞെടുക്കുക' },
  };
  const ORDER = { id: 'ORD-48213', items: [['Pro plan · 1 year', 211780], ['GST (18%)', 38120]] };
  const TOTAL = ORDER.items.reduce((a, i) => a + i[1], 0);
  const defaults = () => ({
    name: 'Your Business', color: '#E65F55', logo: '', dark: false, button: 'Pay', lang: 'en', offers: true, emi: true,
    order: Object.keys(METHODS).map(m => ({ m, on: m !== 'Pay later' })),
  });
  const themes = { test: defaults(), live: defaults() };
  const saved = { test: JSON.stringify(themes.test), live: JSON.stringify(themes.live) };
  const ui = { device: 'desktop', sel: null };
  const T = () => themes[state.mode];
  const dirty = () => JSON.stringify(T()) !== saved[state.mode];
  const validHex = c => /^#[0-9a-f]{6}$/i.test(c);
  const onColor = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#211F24' : '#FFFEFB'; };

  addStyle('checkout', `
    .co-grid{display:grid;grid-template-columns:minmax(360px,460px) 1fr;gap:16px;align-items:start}
    .co-ed .card{margin-bottom:14px}
    .co-ed .card h3{display:flex;justify-content:space-between;align-items:center}
    .co-sw{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .co-sw button{width:26px;height:26px;border-radius:50%;border:2px solid var(--card);box-shadow:0 0 0 1px var(--line);cursor:pointer;padding:0}
    .co-sw button.on{box-shadow:0 0 0 2px var(--ink)}
    .co-color{display:flex;gap:8px;align-items:center}
    .co-color input[type=color]{width:46px;height:42px;padding:3px;flex:none}
    .co-logo{display:flex;gap:12px;align-items:center}
    .co-logo .lg{width:52px;height:52px;border-radius:12px;display:grid;place-items:center;font-weight:700;font-size:22px;flex:none;overflow:hidden;border:1px solid var(--line)}
    .co-logo .lg img{width:100%;height:100%;object-fit:cover}
    .co-seg{display:inline-flex;border:1.5px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card)}
    .co-seg button{border:0;background:none;padding:7px 14px;font-weight:600;cursor:pointer;color:var(--muted)}
    .co-seg button.on{background:var(--brand-soft);color:var(--brand)}
    .co-m{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:6px;background:var(--card)}
    .co-m.off{background:var(--soft)} .co-m.off .t{opacity:.5}
    .co-m .ic{width:30px;height:30px;border-radius:8px;background:var(--brand-soft);display:grid;place-items:center;flex:none}
    .co-m .t{flex:1;min-width:0} .co-m .t small{display:block;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .co-tg{width:36px;height:20px;border-radius:999px;background:var(--line);position:relative;cursor:pointer;border:0;flex:none}
    .co-tg:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--card);transition:.15s}
    .co-tg.on{background:var(--ok)} .co-tg.on:after{left:18px}
    .co-tr{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:13.5px}
    .co-tr:first-of-type{border-top:0}
    .co-stage{position:sticky;top:76px;display:flex;flex-direction:column;min-height:760px}
    .co-canvas{flex:1;background:repeating-linear-gradient(45deg,var(--soft),var(--soft) 12px,var(--bg) 12px,var(--bg) 24px);border-radius:12px;padding:24px;display:flex;justify-content:center;align-items:flex-start;overflow:auto}
    .co-frame{background:var(--card);border-radius:12px;box-shadow:0 24px 50px -24px rgba(33,31,36,.4);overflow:hidden;width:100%;max-width:980px;transition:max-width .2s}
    .co-frame.mob{max-width:390px;border-radius:26px;border:8px solid var(--ink)}
    .co-bar{display:flex;align-items:center;gap:8px;background:var(--soft);padding:8px 12px;font-size:12px;color:var(--muted)}
    .co-bar i{width:10px;height:10px;border-radius:50%;background:var(--line);display:inline-block}
    .co-bar span{flex:1;background:var(--card);border-radius:6px;padding:3px 10px;font-family:"JetBrains Mono",monospace;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .co-frame.mob .co-bar{justify-content:center} .co-frame.mob .co-bar i{display:none}
    .hp{--b:var(--brand);--bt:var(--card);--pg:var(--bg);--cd:var(--card);--tx:var(--ink);--mu:var(--muted);--ln:var(--line);display:grid;grid-template-columns:340px 1fr;min-height:620px;background:var(--pg);color:var(--tx);font-size:14px}
    .hp.dark{--pg:var(--ink);--cd:var(--ink-2);--tx:var(--bg);--mu:color-mix(in srgb,var(--bg) 62%,var(--ink-2));--ln:color-mix(in srgb,var(--bg) 16%,var(--ink-2))}
    .hp .side{background:var(--b);color:var(--bt);padding:26px;display:flex;flex-direction:column;gap:18px}
    .hp .mlogo{display:flex;align-items:center;gap:12px}
    .hp .mlogo .lg{width:46px;height:46px;border-radius:12px;background:var(--bt);color:var(--b);display:grid;place-items:center;font-weight:800;font-size:20px;overflow:hidden;flex:none}
    .hp .mlogo .lg img{width:100%;height:100%;object-fit:cover}
    .hp .amt{font-size:30px;font-weight:700;letter-spacing:-.02em}
    .hp .sum{background:rgba(255,255,255,.12);border-radius:12px;padding:14px;font-size:13px}
    .hp .sum .r{display:flex;justify-content:space-between;padding:4px 0}
    .hp .sum .r.tot{border-top:1px solid currentColor;margin-top:6px;padding-top:8px;font-weight:700;opacity:1}
    .hp .main{padding:24px;display:flex;flex-direction:column;gap:12px}
    .hp h4{margin:0;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--mu)}
    .hp .pm{display:flex;align-items:center;gap:12px;background:var(--cd);border:1.5px solid var(--ln);border-radius:12px;padding:11px 14px;cursor:pointer}
    .hp .pm.sel{border-color:var(--b);box-shadow:0 0 0 3px color-mix(in srgb,var(--b) 18%,transparent)}
    .hp .pm .ic{width:34px;height:34px;border-radius:9px;background:color-mix(in srgb,var(--b) 14%,transparent);display:grid;place-items:center;flex:none}
    .hp .pm .t{flex:1;min-width:0} .hp .pm small{display:block;color:var(--mu);font-size:12px}
    .hp .bdg{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:var(--ok-soft);color:var(--ok);white-space:nowrap}
    .hp .bdg.emi{background:var(--accent-soft);color:var(--warn)}
    .hp .det{background:var(--cd);border:1.5px solid var(--ln);border-radius:12px;padding:16px}
    .hp .qr{display:flex;gap:16px;align-items:center}
    .hp .qr svg{width:116px;height:116px;flex:none;background:var(--card);border-radius:8px;padding:6px}
    .hp .fi{border:1.5px solid var(--ln);border-radius:9px;padding:10px 12px;color:var(--mu);background:var(--pg);font-size:13px;margin-top:8px}
    .hp .fr{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .hp .payb{background:var(--b);color:var(--bt);border:0;border-radius:10px;padding:13px;font-weight:700;width:100%;font-size:15px;margin-top:4px}
    .hp .foot{margin-top:auto;text-align:center;font-size:11.5px;color:var(--mu);padding-top:8px}
    .hp.mob{grid-template-columns:1fr;min-height:0}
    .hp.mob .side{padding:18px;gap:12px} .hp.mob .amt{font-size:24px} .hp.mob .main{padding:16px}
    .hp.mob .qr svg{width:92px;height:92px}
    @media (max-width:1100px){ .co-grid{grid-template-columns:1fr} .co-stage{position:static;min-height:0} }
    @media (max-width:820px){ .hp{grid-template-columns:1fr} .co-canvas{padding:12px} }
  `);

  // Deterministic QR-like pattern (illustrative only).
  const qrSvg = (seedStr, fg) => {
    let h = 0; for (const c of seedStr) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const n = 25, cells = [], finder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([a, b]) => x >= a && x < a + 7 && y >= b && y < b + 7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      h = (h * 1103515245 + 12345) >>> 0;
      if ((h >>> 16) & 1) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
    const fp = (a, b) => `<rect x="${a}" y="${b}" width="7" height="7"/><rect x="${a + 1}" y="${b + 1}" width="5" height="5" fill="#fff"/><rect x="${a + 2}" y="${b + 2}" width="3" height="3"/>`;
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" fill="${fg}" aria-label="UPI QR code">${fp(0, 0)}${fp(n - 7, 0)}${fp(0, n - 7)}${cells.join('')}</svg>`;
  };

  PAGES.checkout = () => {
    if (liveLocked()) return head('Manage checkout') + locked('Checkout customisation');
    return head('Manage checkout', `Make the hosted payment page look like your brand. Settings apply to <b>${state.mode}</b> mode.`,
      `<span id="codirty"></span><button class="btn" id="coreset"><i data-icon=rotate-ccw class=li></i> Reset</button><button class="btn primary" id="cosave">Save changes</button>`) +
      `<div class="co-grid"><div class="co-ed" id="coed"></div>
        <div class="card co-stage"><div class="between" style="margin-bottom:12px;flex-wrap:wrap"><div><h3 style="margin:0">Live preview</h3><span class="muted" style="font-size:12.5px">What customers see at checkout. Click a payment method to preview it.</span></div>
          <div class="co-seg" role="group" aria-label="Preview device"><button data-dev="desktop">🖥 Desktop</button><button data-dev="mobile"><i data-icon=smartphone class=li></i> Mobile</button></div></div>
          <div class="co-canvas"><div class="co-frame" id="coframe"></div></div></div></div>`;
  };

  function editorHtml(){
    const t = T();
    return `<div class="card"><h3>Branding</h3>
        <label for="coname">Display name</label><input id="coname" maxlength="40" value="${esc(t.name)}" placeholder="Shown to customers at checkout">
        <label for="cohex">Brand colour</label><div class="co-color"><input id="cocolor" type="color" value="${t.color}" aria-label="Pick brand colour"><input id="cohex" value="${t.color}" maxlength="7" class="mono"></div>
        <div class="co-sw">${PRESETS.map(c => `<button data-preset="${c}" class="${c.toLowerCase() === t.color.toLowerCase() ? 'on' : ''}" style="background:${c}" title="${c}" aria-label="Use ${c}"></button>`).join('')}</div>
        <label>Logo</label><div class="co-logo"><div class="lg" style="background:${t.color};color:${onColor(t.color)}">${t.logo ? `<img src="${t.logo}" alt="">` : esc((t.name.trim()[0] || 'Y').toUpperCase())}</div>
          <div style="flex:1"><div class="row" style="gap:8px"><label class="btn sm" style="margin:0;flex:none;min-width:0;font-size:13px"><i data-icon=upload class=li></i> Upload<input type="file" id="cologo" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden></label>
          ${t.logo ? '<button class="btn sm danger" id="cologox" style="flex:none;min-width:0">Remove</button>' : ''}</div><div class="muted" style="font-size:12px;margin-top:4px">PNG, JPG, SVG or WebP · square · up to 1 MB. Without a logo we show your initial.</div></div></div>
        <label>Theme</label><div class="co-seg"><button data-theme="light" class="${t.dark ? '' : 'on'}">☀ Light</button><button data-theme="dark" class="${t.dark ? 'on' : ''}">☾ Dark</button></div></div>
      <div class="card"><h3>Content</h3>
        <div class="row" style="gap:10px"><div><label for="cobtn">Button text</label><input id="cobtn" maxlength="18" value="${esc(t.button)}"></div>
        <div><label for="colang">Language</label><select id="colang">${Object.entries(LANGS).map(([k, l]) => `<option value="${k}" ${k === t.lang ? 'selected' : ''}>${l.name}</option>`).join('')}</select></div></div>
        <div class="muted" style="font-size:12px;margin-top:4px">The amount is added after the button text, e.g. “${esc(t.button || 'Pay')} ${inr(TOTAL)}”.</div>
        <div style="margin-top:10px"><div class="co-tr"><span>Show offers badge <span class="muted" style="font-size:12px">· cashback on UPI</span></span><button class="co-tg ${t.offers ? 'on' : ''}" data-flag="offers" aria-label="Show offers badge"></button></div>
        <div class="co-tr"><span>Show EMI badge <span class="muted" style="font-size:12px">· no-cost EMI on cards</span></span><button class="co-tg ${t.emi ? 'on' : ''}" data-flag="emi" aria-label="Show EMI badge"></button></div></div></div>
      <div class="card"><h3>Payment methods <span class="muted" style="font-weight:500;font-size:12.5px">${t.order.filter(o => o.on).length} of ${t.order.length} shown</span></h3>
        <p class="muted" style="margin:0 0 10px;font-size:13px">Customers see enabled methods in this order. At least one must stay on.</p>
        ${t.order.map((o, i) => `<div class="co-m ${o.on ? '' : 'off'}"><span class="ic">${METHODS[o.m].ic}</span><span class="t"><b>${i + 1}. ${o.m}</b><small>${METHODS[o.m].sub}</small></span>
          <button class="btn sm" data-u="${i}" ${i ? '' : 'disabled'} aria-label="Move ${o.m} up">↑</button><button class="btn sm" data-d="${i}" ${i < t.order.length - 1 ? '' : 'disabled'} aria-label="Move ${o.m} down">↓</button>
          <button class="co-tg ${o.on ? 'on' : ''}" data-tg="${i}" aria-label="${o.on ? 'Hide' : 'Show'} ${o.m}"></button></div>`).join('')}</div>`;
  }

  function previewHtml(){
    const t = T(), L = LANGS[t.lang], mob = ui.device === 'mobile', on = t.order.filter(o => o.on).map(o => o.m);
    if (!on.includes(ui.sel)) ui.sel = on[0];
    const bt = onColor(t.color), initial = esc((t.name.trim()[0] || 'Y').toUpperCase());
    const badge = m => (m === 'UPI' && t.offers ? '<span class="bdg">₹50 cashback</span>' : '') + ((m === 'EMI' || m === 'Cards') && t.emi ? `<span class="bdg emi">No-cost EMI · ${inr(Math.round(TOTAL / 3))}/mo</span>` : '');
    const detail = m => m === 'UPI' ? `<div class="det"><div class="qr">${qrSvg(t.name + t.color, '#211F24')}<div><b>${L.scan}</b><div style="color:var(--mu);font-size:12.5px;margin-top:4px">QR valid for 5:00 min</div></div></div>
        <div style="color:var(--mu);font-size:12.5px;margin-top:12px">${L.vpa}</div><div class="fr" style="grid-template-columns:1fr auto"><div class="fi">yourname@okbank</div><div class="fi" style="color:var(--b);font-weight:700">${L.verify}</div></div></div>`
      : m === 'Cards' || m === 'EMI' ? `<div class="det"><div class="fi">${L.card} · 4111 1111 1111 1111</div><div class="fr"><div class="fi">${L.exp}</div><div class="fi">${L.cvv}</div></div><div class="fi">${L.holder}</div>
        ${m === 'EMI' ? '<div class="fi">Tenure · 3, 6, 9 or 12 months</div>' : ''}</div>`
      : m ? `<div class="det" style="color:var(--mu);font-size:13px">${m === 'Net banking' ? 'SBI · HDFC · ICICI · Axis · Kotak · + more banks' : m === 'Wallets' ? 'PhonePe · Amazon Pay · Mobikwik · Airtel Money' : 'Simpl · LazyPay · ICICI PayLater'}</div>` : `<div class="det" style="color:var(--mu)">${L.other}</div>`;
    return `<div class="co-bar"><i></i><i></i><i></i><span><i data-icon=lock class=li></i> checkout.bizpolepay.example/pay/${ORDER.id.toLowerCase()}</span></div>
      <div class="hp ${t.dark ? 'dark' : ''} ${mob ? 'mob' : ''}" style="--b:${t.color};--bt:${bt}">
        <div class="side"><div class="mlogo"><div class="lg">${t.logo ? `<img src="${t.logo}" alt="">` : initial}</div><div><b style="font-size:16px">${esc(t.name || 'Your Business')}</b><div style="opacity:.8;font-size:12px">Order ${ORDER.id}</div></div></div>
          <div><div style="opacity:.8;font-size:12.5px">${L.total}</div><div class="amt">${inr(TOTAL)}</div></div>
          ${mob ? '' : `<div class="sum"><b style="display:block;margin-bottom:6px">${L.summary}</b>${ORDER.items.map(([n, a]) => `<div class="r" style="opacity:.85"><span>${n}</span><span>${inr(a)}</span></div>`).join('')}<div class="r tot"><span>${L.total}</span><span>${inr(TOTAL)}</span></div></div>
          <div style="margin-top:auto;font-size:12px;opacity:.8"><i data-icon=lock class=li></i> 256-bit encrypted · PCI DSS compliant</div>`}</div>
        <div class="main"><h4>${L.methods}</h4>
          ${on.length ? on.map(m => `<div class="pm ${m === ui.sel ? 'sel' : ''}" data-pm="${m}"><span class="ic">${METHODS[m].ic}</span><span class="t"><b>${m}</b><small>${METHODS[m].sub}</small>${mob && badge(m) ? `<span style="display:flex;gap:4px;margin-top:4px">${badge(m)}</span>` : ''}</span>${mob ? '' : badge(m)}<span style="color:var(--mu)">${m === ui.sel ? '<i data-icon=chevron-down class=li></i>' : '<i data-icon=chevron-right class=li></i>'}</span></div>${m === ui.sel ? detail(m) : ''}`).join('') : detail(null)}
          <button class="payb">${esc(t.button || 'Pay')} ${inr(TOTAL)}</button>
          <div class="foot">Secured by Bizpole Pay · payments processed by PayU</div></div></div>`;
  }

  function drawPreview(){
    const f = $('#coframe'); if (!f) return;
    f.classList.toggle('mob', ui.device === 'mobile');
    f.innerHTML = previewHtml();
    document.querySelectorAll('[data-dev]').forEach(b => b.classList.toggle('on', b.dataset.dev === ui.device));
    document.querySelectorAll('[data-pm]').forEach(p => p.onclick = () => { ui.sel = p.dataset.pm; drawPreview(); });
    $('#codirty').innerHTML = dirty() ? '<span class="pill warn">Unsaved changes</span>' : '<span class="pill ok">Saved</span>';
  }
  function drawEditor(){ $('#coed').innerHTML = editorHtml(); bindEditor(); drawPreview(); }
  function setColor(c){ T().color = c.toLowerCase(); drawEditor(); }

  function bindEditor(){
    const t = T();
    $('#coname').oninput = e => { t.name = e.target.value; if (!t.logo) $('.co-logo .lg').textContent = (t.name.trim()[0] || 'Y').toUpperCase(); drawPreview(); };
    $('#cocolor').oninput = e => { t.color = e.target.value; $('#cohex').value = e.target.value; drawPreview(); };
    $('#cocolor').onchange = e => setColor(e.target.value);
    $('#cohex').onchange = e => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (!validHex(v)) { e.target.value = t.color; return toast('Enter a colour as #RRGGBB'); } setColor(v); };
    document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => setColor(b.dataset.preset));
    $('#cologo').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return toast('Choose a PNG, JPG, SVG or WebP image');
      if (f.size > 1024 * 1024) return toast('Logo must be 1 MB or smaller');
      const r = new FileReader();
      r.onload = () => { t.logo = r.result; drawEditor(); toast('Logo uploaded'); };
      r.onerror = () => toast('Could not read that file');
      r.readAsDataURL(f);
    };
    if ($('#cologox')) $('#cologox').onclick = () => { t.logo = ''; drawEditor(); };
    document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { t.dark = b.dataset.theme === 'dark'; drawEditor(); });
    $('#cobtn').oninput = e => { t.button = e.target.value; drawPreview(); };
    $('#cobtn').onchange = e => { if (!e.target.value.trim()) { t.button = e.target.value = 'Pay'; toast('Button text can’t be empty · reset to “Pay”'); drawPreview(); } };
    $('#colang').onchange = e => { t.lang = e.target.value; drawPreview(); };
    document.querySelectorAll('[data-flag]').forEach(b => b.onclick = () => { t[b.dataset.flag] = !t[b.dataset.flag]; drawEditor(); });
    const swap = (i, j) => { [t.order[i], t.order[j]] = [t.order[j], t.order[i]]; drawEditor(); };
    document.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const i = +b.dataset.u; if (i > 0) swap(i - 1, i); });
    document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const i = +b.dataset.d; if (i < t.order.length - 1) swap(i, i + 1); });
    document.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => {
      const o = t.order[+b.dataset.tg];
      if (o.on && t.order.filter(x => x.on).length === 1) return toast('Keep at least one payment method on');
      o.on = !o.on; drawEditor();
    });
  }

  BIND.checkout = () => {
    if (liveLocked()) return;
    document.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => { ui.device = b.dataset.dev; drawPreview(); });
    $('#cosave').onclick = () => {
      const t = T();
      if (!t.name.trim()) return toast('Add a display name before saving');
      saved[state.mode] = JSON.stringify(t); drawPreview(); toast(`Checkout settings saved for ${state.mode} mode`);
    };
    $('#coreset').onclick = () => { themes[state.mode] = defaults(); ui.sel = null; drawEditor(); toast('Reset to Bizpole Pay defaults · save to apply'); };
    drawEditor();
  };
})();

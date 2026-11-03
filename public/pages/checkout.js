// Page: checkout. Uses globals from app.html core (state, api, LOAD, helpers, PAGES, BIND).
// Data: /api/checkout (server/routes/checkout.js) → CheckoutTheme: display name, brand colour, method order.
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
  const ORDER = { id: 'SAMPLE-ORDER', items: [['Sample item', 211780], ['GST (18%)', 38120]] }; // preview fixture only
  const TOTAL = ORDER.items.reduce((a, i) => a + i[1], 0);
  // Dashboard method groups ↔ PaymentMethod enum values stored in CheckoutTheme.methodOrder.
  const ENUMS = { UPI: ['UPI'], Cards: ['CREDIT_CARD', 'DEBIT_CARD'], 'Net banking': ['NET_BANKING'], Wallets: ['WALLET'], EMI: ['EMI'], 'Pay later': ['BNPL'] };
  const DEFAULT_COLOR = '#E65F55';
  const defaultOrder = () => Object.keys(METHODS).map(m => ({ m, on: m !== 'Pay later' }));
  const defaults = () => ({ name: (state.merchant && state.merchant.displayName) || '', color: DEFAULT_COLOR, order: defaultOrder() });
  // methodOrder lists the methods shown, in order; methods not in it are hidden and listed after.
  const fromApi = r => {
    if (!r || !r.saved) return defaults();
    const pos = m => Math.min(...ENUMS[m].map(e => { const i = r.methodOrder.indexOf(e); return i < 0 ? 1e9 : i; }));
    const keys = Object.keys(METHODS), order = keys.map(m => ({ m, on: pos(m) < 1e9 })).sort((x, y) => (pos(x.m) - pos(y.m)) || (keys.indexOf(x.m) - keys.indexOf(y.m)));
    return { name: r.displayName || '', color: r.primaryColor || DEFAULT_COLOR, order };
  };
  const toApi = t => ({ displayName: t.name.trim(), primaryColor: t.color, methodOrder: t.order.filter(o => o.on).flatMap(o => ENUMS[o.m]) });
  const themes = { test: defaults(), live: defaults() };
  const saved = { test: null, live: null }; // JSON of the last saved state; null = never saved in this mode
  const meta = { test: null, live: null };  // { updatedAt } from the server
  const logos = { test: null, live: null }; // data: URL; saved on upload, separate from the Save button
  const ui = { device: 'desktop', sel: null, lang: 'en', busy: false, logoBusy: false };
  const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const LOGO_SIDE = 256, LOGO_MAX_IN = 5 * 1024 * 1024, LOGO_MAX_OUT = 300 * 1024;
  const logo = () => logos[state.mode];
  // Logo tile: the uploaded image, or the brand-coloured initial.
  const logoTile = (t, cls = 'lg') => logo()
    ? `<div class="${cls}" style="background:#fff"><img src="${logo()}" alt="${esc(t.name || 'Logo')}"></div>`
    : `<div class="${cls}" style="background:${t.color};color:${onColor(t.color)}">${esc((t.name.trim()[0] || 'Y').toUpperCase())}</div>`;
  const T = () => themes[state.mode];
  const dirty = () => JSON.stringify(T()) !== (saved[state.mode] || JSON.stringify(defaults()));
  const validHex = c => /^#[0-9a-f]{6}$/i.test(c);
  const onColor = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#211F24' : '#FFFEFB'; };
  const apply = (mode, r) => { themes[mode] = fromApi(r); saved[mode] = r && r.saved ? JSON.stringify(themes[mode]) : null; meta[mode] = r && r.saved ? { updatedAt: toDate(r.updatedAt) } : null; logos[mode] = (r && r.logo) || null; };
  LOAD.checkout = async mode => apply(mode, await api('/checkout', { mode }));

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
    .co-logo{border-radius:12px;transition:background .15s}
    .co-lb{display:flex;flex-direction:row;gap:6px;flex-wrap:wrap;align-items:center}
    .co-lb .btn{width:auto;flex:none;margin:0}
    .co-logo.drag{background:var(--brand-soft);outline:2px dashed var(--brand);outline-offset:4px}
    .co-logo .lg img,.hp .mlogo .lg img{width:100%;height:100%;object-fit:contain}
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
        <div class="card co-stage"><div class="between" style="margin-bottom:12px;flex-wrap:wrap;gap:8px"><div><h3 style="margin:0">Preview</h3><span class="muted" style="font-size:12.5px">A sample order with your branding. Click a payment method to preview it.</span></div>
          <div class="row" style="gap:8px;flex:none"><select id="colang" aria-label="Preview language" title="Preview language (not saved)" style="width:auto">${Object.entries(LANGS).map(([k, l]) => `<option value="${k}" ${k === ui.lang ? 'selected' : ''}>${l.name}</option>`).join('')}</select>
          <div class="co-seg" role="group" aria-label="Preview device"><button data-dev="desktop">🖥 Desktop</button><button data-dev="mobile"><i data-icon=smartphone class=li></i> Mobile</button></div></div></div>
          <div class="co-canvas"><div class="co-frame" id="coframe"></div></div></div></div>`;
  };

  function editorHtml(){
    const t = T();
    return `<div class="card"><h3>Branding</h3>
        <label for="coname">Display name</label><input id="coname" maxlength="40" value="${esc(t.name)}" placeholder="Shown to customers at checkout">
        <label for="cohex">Brand colour</label><div class="co-color"><input id="cocolor" type="color" value="${t.color}" aria-label="Pick brand colour"><input id="cohex" value="${t.color}" maxlength="7" class="mono"></div>
        <div class="co-sw">${PRESETS.map(c => `<button data-preset="${c}" class="${c.toLowerCase() === t.color.toLowerCase() ? 'on' : ''}" style="background:${c}" title="${c}" aria-label="Use ${c}"></button>`).join('')}</div>
        <label>Logo</label><div class="co-logo" id="cologo">${logoTile(t)}
          <div style="flex:1;min-width:0"><div class="co-lb">
            <button class="btn sm" id="coup" ${ui.logoBusy ? 'disabled' : ''}><i data-icon=upload class=li></i> ${ui.logoBusy ? 'Uploading…' : logo() ? 'Replace logo' : 'Upload logo'}</button>
            ${logo() ? `<button class="btn sm danger" id="corm" ${ui.logoBusy ? 'disabled' : ''}>Remove</button>` : ''}</div>
            <div class="muted" style="font-size:12px;margin-top:6px">${logo() ? 'Saved. Customers see this logo at checkout.' : 'PNG, JPG or WebP, up to 5 MB. Square images look best. Until you upload one, customers see your initial.'}</div></div>
          <input type="file" id="cofile" accept="${LOGO_TYPES.join(',')}" hidden></div>
        <div class="co-drop-hint muted" style="font-size:11.5px;margin-top:4px">Tip: drop an image on the logo to upload it.</div></div>
      <div class="card"><h3>Payment methods <span class="muted" style="font-weight:500;font-size:12.5px">${t.order.filter(o => o.on).length} of ${t.order.length} shown</span></h3>
        <p class="muted" style="margin:0 0 10px;font-size:13px">Customers see enabled methods in this order. At least one must stay on.</p>
        ${t.order.map((o, i) => `<div class="co-m ${o.on ? '' : 'off'}"><span class="ic">${METHODS[o.m].ic}</span><span class="t"><b>${i + 1}. ${o.m}</b><small>${METHODS[o.m].sub}</small></span>
          <button class="btn sm" data-u="${i}" ${i ? '' : 'disabled'} aria-label="Move ${o.m} up">↑</button><button class="btn sm" data-d="${i}" ${i < t.order.length - 1 ? '' : 'disabled'} aria-label="Move ${o.m} down">↓</button>
          <button class="co-tg ${o.on ? 'on' : ''}" data-tg="${i}" aria-label="${o.on ? 'Hide' : 'Show'} ${o.m}"></button></div>`).join('')}</div>
      ${meta[state.mode] ? `<p class="muted" style="font-size:12px;margin:0">Last saved ${fmtDate(meta[state.mode].updatedAt)}</p>` : `<p class="muted" style="font-size:12px;margin:0">Not saved yet for ${state.mode} mode. You’re seeing the defaults.</p>`}`;
  }

  function previewHtml(){
    const t = T(), L = LANGS[ui.lang], mob = ui.device === 'mobile', on = t.order.filter(o => o.on).map(o => o.m);
    if (!on.includes(ui.sel)) ui.sel = on[0];
    const bt = onColor(t.color);
    const detail = m => m === 'UPI' ? `<div class="det"><div class="qr">${qrSvg(t.name + t.color, '#211F24')}<div><b>${L.scan}</b><div style="color:var(--mu);font-size:12.5px;margin-top:4px">Sample QR · preview only</div></div></div>
        <div style="color:var(--mu);font-size:12.5px;margin-top:12px">${L.vpa}</div><div class="fr" style="grid-template-columns:1fr auto"><div class="fi">name@bank</div><div class="fi" style="color:var(--b);font-weight:700">${L.verify}</div></div></div>`
      : m === 'Cards' || m === 'EMI' ? `<div class="det"><div class="fi">${L.card}</div><div class="fr"><div class="fi">${L.exp}</div><div class="fi">${L.cvv}</div></div><div class="fi">${L.holder}</div>
        ${m === 'EMI' ? '<div class="fi">Tenure · 3, 6, 9 or 12 months</div>' : ''}</div>`
      : m ? `<div class="det" style="color:var(--mu);font-size:13px">${METHODS[m].sub}</div>` : `<div class="det" style="color:var(--mu)">${L.other}</div>`;
    return `<div class="co-bar"><i></i><i></i><i></i><span><i data-icon=lock class=li></i> Preview · sample order</span></div>
      <div class="hp ${mob ? 'mob' : ''}" style="--b:${t.color};--bt:${bt}">
        <div class="side"><div class="mlogo">${logo() ? `<div class="lg"><img src="${logo()}" alt=""></div>` : `<div class="lg">${esc((t.name.trim()[0] || 'Y').toUpperCase())}</div>`}<div><b style="font-size:16px">${esc(t.name || 'Your business')}</b><div style="opacity:.8;font-size:12px">Sample order</div></div></div>
          <div><div style="opacity:.8;font-size:12.5px">${L.total}</div><div class="amt">${inr(TOTAL)}</div></div>
          ${mob ? '' : `<div class="sum"><b style="display:block;margin-bottom:6px">${L.summary}</b>${ORDER.items.map(([n, a]) => `<div class="r" style="opacity:.85"><span>${n}</span><span>${inr(a)}</span></div>`).join('')}<div class="r tot"><span>${L.total}</span><span>${inr(TOTAL)}</span></div></div>
          <div style="margin-top:auto;font-size:12px;opacity:.8"><i data-icon=lock class=li></i> 256-bit encrypted · PCI DSS compliant</div>`}</div>
        <div class="main"><h4>${L.methods}</h4>
          ${on.length ? on.map(m => `<div class="pm ${m === ui.sel ? 'sel' : ''}" data-pm="${m}"><span class="ic">${METHODS[m].ic}</span><span class="t"><b>${m}</b><small>${METHODS[m].sub}</small></span><span style="color:var(--mu)">${m === ui.sel ? '<i data-icon=chevron-down class=li></i>' : '<i data-icon=chevron-right class=li></i>'}</span></div>${m === ui.sel ? detail(m) : ''}`).join('') : detail(null)}
          <button class="payb">${L.pay} ${inr(TOTAL)}</button>
          <div class="foot">Secured by Bizpole Pay · payments processed by PayU</div></div></div>`;
  }

  function drawPreview(){
    const f = $('#coframe'); if (!f) return;
    f.classList.toggle('mob', ui.device === 'mobile');
    f.innerHTML = previewHtml();
    document.querySelectorAll('[data-dev]').forEach(b => b.classList.toggle('on', b.dataset.dev === ui.device));
    document.querySelectorAll('[data-pm]').forEach(p => p.onclick = () => { ui.sel = p.dataset.pm; drawPreview(); });
    $('#codirty').innerHTML = dirty() ? '<span class="pill warn">Unsaved changes</span>' : saved[state.mode] ? '<span class="pill ok">Saved</span>' : '<span class="pill">Defaults</span>';
  }
  function drawEditor(){ $('#coed').innerHTML = editorHtml(); bindEditor(); drawPreview(); }
  function setColor(c){ T().color = c.toLowerCase(); drawEditor(); }

  function bindEditor(){
    const t = T();
    $('#coname').oninput = e => { t.name = e.target.value; if (!logo()) $('.co-logo .lg').textContent = (t.name.trim()[0] || 'Y').toUpperCase(); drawPreview(); };
    $('#coup').onclick = () => $('#cofile').click();
    $('#cofile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadLogo(f); };
    if ($('#corm')) $('#corm').onclick = removeLogo;
    const drop = $('#cologo');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) uploadLogo(f); };
    $('#cocolor').oninput = e => { t.color = e.target.value; $('#cohex').value = e.target.value; drawPreview(); };
    $('#cocolor').onchange = e => setColor(e.target.value);
    $('#cohex').onchange = e => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (!validHex(v)) { e.target.value = t.color; return toast('Enter a colour as #RRGGBB'); } setColor(v); };
    document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => setColor(b.dataset.preset));
    const swap = (i, j) => { [t.order[i], t.order[j]] = [t.order[j], t.order[i]]; drawEditor(); };
    document.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const i = +b.dataset.u; if (i > 0) swap(i - 1, i); });
    document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const i = +b.dataset.d; if (i < t.order.length - 1) swap(i, i + 1); });
    document.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => {
      const o = t.order[+b.dataset.tg];
      if (o.on && t.order.filter(x => x.on).length === 1) return toast('Keep at least one payment method on');
      o.on = !o.on; drawEditor();
    });
  }

  // Shrink to ≤256px on the longest side so the stored logo stays small; keep PNG (transparency)
  // and fall back to WebP, then JPEG on white, if the result is still over the server limit.
  async function shrinkLogo(file){
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('That file isn’t an image we can read. Try a PNG, JPG or WebP.')); i.src = url; });
      const k = Math.min(1, LOGO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
      const size = d => Math.ceil((d.length - d.indexOf(',') - 1) * 3 / 4);
      let out = c.toDataURL('image/png');
      if (size(out) > LOGO_MAX_OUT) {
        const webp = c.toDataURL('image/webp', 0.9); // browsers without WebP encoding return PNG here
        if (webp.startsWith('data:image/webp')) out = webp;
      }
      if (size(out) > LOGO_MAX_OUT) {
        g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', 0.85);
      }
      if (size(out) > LOGO_MAX_OUT) throw new Error('Logo is still too large after resizing. Try a simpler image.');
      return out;
    } finally { URL.revokeObjectURL(url); }
  }

  async function uploadLogo(file){
    if (ui.logoBusy) return;
    if (!LOGO_TYPES.includes(file.type)) return toast('Upload a PNG, JPG or WebP image');
    if (file.size > LOGO_MAX_IN) return toast('That image is over 5 MB. Choose a smaller file');
    const mode = state.mode;
    ui.logoBusy = true; if ($('#coed')) drawEditor();
    try {
      const data = await shrinkLogo(file);
      const r = await api('/checkout/logo', { method: 'PUT', body: { logo: data }, mode });
      logos[mode] = r.logo || null;
      toast(`Logo uploaded for ${mode} mode`);
    } catch (e) { apiFail(e); }
    finally { ui.logoBusy = false; if (state.mode === mode && $('#coed')) drawEditor(); }
  }

  async function removeLogo(){
    if (ui.logoBusy) return;
    const mode = state.mode;
    ui.logoBusy = true; if ($('#coed')) drawEditor();
    try {
      await api('/checkout/logo', { method: 'DELETE', mode });
      logos[mode] = null;
      toast('Logo removed · customers see your initial');
    } catch (e) { apiFail(e); }
    finally { ui.logoBusy = false; if (state.mode === mode && $('#coed')) drawEditor(); }
  }

  BIND.checkout = () => {
    if (liveLocked()) return;
    document.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => { ui.device = b.dataset.dev; drawPreview(); });
    $('#colang').onchange = e => { ui.lang = e.target.value; drawPreview(); };
    $('#cosave').onclick = async () => {
      const t = T(), mode = state.mode, btn = $('#cosave');
      if (!t.name.trim()) return toast('Add a display name before saving');
      if (ui.busy) return;
      ui.busy = true; btn.disabled = true; btn.textContent = 'Saving…';
      try {
        apply(mode, await api('/checkout', { method: 'PUT', body: toApi(t), mode }));
        if (state.mode === mode && $('#coed')) drawEditor();
        toast(`Checkout settings saved for ${mode} mode`);
      } catch (e) { apiFail(e); }
      finally { ui.busy = false; if ($('#cosave')) { $('#cosave').disabled = false; $('#cosave').textContent = 'Save changes'; } }
    };
    $('#coreset').onclick = () => { themes[state.mode] = defaults(); ui.sel = null; drawEditor(); toast('Reset to defaults · save to apply'); };
    drawEditor();
  };
})();

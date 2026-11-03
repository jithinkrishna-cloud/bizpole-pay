// Page: reports. Uses globals from app.html core (state, api, LOAD, helpers, PAGES, BIND).
// Report requests live in the Report table; each download builds the CSV from current data.
// Layout: Categories (report cards by group) · Generated reports (history) · Scheduled reports.
/* ---- Reports ---- */
(() => {
  const DAY = 864e5;
  // Filters per report type (mirrors TYPES in server/routes/reports.js).
  const TYPES = {
    Payments: { label: 'Transactions', filters: [['status', 'Status', ['SUCCESS', 'FAILURE', 'PENDING', 'USER_CANCELLED']], ['method', 'Payment mode', [...new Set(MODES)]]] },
    Settlements: { label: 'Settlements', filters: [['status', 'Status', ['PROCESSED', 'PENDING', 'ON_HOLD', 'FAILED']]] },
    Refunds: { label: 'Refunds', filters: [['status', 'Status', ['REQUESTED', 'QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILED']]] },
    Chargebacks: { label: 'Chargebacks', filters: [['status', 'Status', ['OPEN', 'CLOSED']]] },
    Payouts: { label: 'Payouts', filters: [['status', 'Status', ['QUEUED', 'SCHEDULED', 'IN_PROGRESS', 'PENDING', 'WAITING_FOR_RETRY', 'SUCCESS', 'FAILED', 'REVERSED']]] },
    PaymentLinks: { label: 'Payment links', filters: [['status', 'Status', ['ACTIVE', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'DEACTIVATED']]] },
    Fees: { label: 'Fees & GST', filters: [] },
  };
  // Category cards: [type, icon, description]
  const GROUPS = [
    ['', [
      ['Payments', 'arrow-left-right', 'Every payment attempt with customer details, payment mode, amount, refunds and status.'],
      ['Settlements', 'landmark', 'Payouts to your bank with UTR, payment count, fees, GST, refunds and net amount.'],
      ['Refunds', 'rotate-ccw', 'Refunds you started and where each one is, from request to credit with the bank ARN.'],
      ['Chargebacks', 'shield-alert', 'Disputes raised by customers’ banks with reason codes, amounts and response deadlines.'],
    ]],
    ['Product reports', [
      ['Payouts', 'send', 'Money you sent to beneficiaries: amount, transfer mode, UTR, purpose and status.'],
      ['PaymentLinks', 'link', 'Links you created with the amount asked, amount collected, payments and status.'],
    ]],
    ['Financial documents', [
      ['Fees', 'file-text', 'Service fees and GST deducted in each settlement. Use it for your accounts and GST filing.'],
    ]],
  ];
  const label = t => (TYPES[t] && TYPES[t].label) || t;
  const ago = d => new Date(now - d * DAY);
  const iso = d => d.toLocaleDateString('en-CA');
  const fromIso = s => new Date(s + 'T00:00:00');
  const dayLabel = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const nice = v => v.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

  const rp = {
    tab: 'cat',
    form: { type: 'Payments', from: iso(ago(6)), to: iso(now), format: 'CSV', status: '', method: '' },
    hist: { test: [], live: [] },
    count: null, countKey: '',
  };
  const hist = () => rp.hist[state.mode] || [];
  const shape = r => ({ ...r, at: new Date(r.at), completedAt: toDate(r.completedAt) });
  LOAD.reports = async (mode) => { rp.hist[mode] = (await api('/reports', { mode })).map(shape); };

  addStyle('reports', `
    .rp-tabs{display:flex;gap:22px;border-bottom:1px solid var(--line);margin:0 0 20px}
    .rp-tabs button{white-space:nowrap;flex:none;border:0;background:none;padding:10px 2px;margin-bottom:-1px;font-size:14.5px;font-weight:500;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent}
    .rp-tabs button:hover{color:var(--ink)}
    .rp-tabs button.on{color:var(--ink);font-weight:600;border-bottom-color:var(--brand)}
    .rp-tabs .n{display:inline-block;min-width:18px;padding:0 6px;margin-left:6px;border-radius:9px;background:var(--soft);font-size:11.5px;line-height:18px;text-align:center}
    .rp-sec{margin:26px 0 12px;font-size:15px;font-weight:600;color:var(--muted)}
    .rp-sec:first-child{margin-top:0}
    .rp-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .rp-card{display:flex;flex-direction:column;gap:10px;padding:16px 18px;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s}
    .rp-card:hover{border-color:var(--brand);box-shadow:var(--shadow-sm)}
    .rp-card .t{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;color:var(--ink)}
    .rp-card .ic{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);flex:none}
    .rp-card p{margin:0;font-size:13px;line-height:1.5;color:var(--muted);flex:1}
    .rp-card .go{font-size:13px;font-weight:600;color:var(--brand);display:flex;align-items:center;gap:4px}
    .rp-seg{display:inline-flex;border:1.5px solid var(--line);border-radius:9px;overflow:hidden;background:var(--card)}
    .rp-seg button{border:0;background:none;padding:9px 16px;font-weight:600;cursor:pointer;color:var(--muted)}
    .rp-seg button.on{background:var(--brand-soft);color:var(--brand)}
    .rp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px;margin-top:14px}
    .rp-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
    .rp-err{color:var(--bad);font-size:12.5px;margin:8px 0 0;min-height:0}
    .rp-acts{display:flex;gap:6px;justify-content:flex-end}
    @media (max-width:1100px){.rp-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:640px){.rp-cards,.rp-form{grid-template-columns:1fr}.rp-tabs{gap:14px;overflow-x:auto}}
  `);

  // QUEUED = recorded, not downloaded yet; READY = generated at least once (completedAt).
  const pill = r => r.status === 'READY' ? '<span class="pill ok">Generated</span>' : '<span class="pill">Requested</span>';
  const filtersLabel = f => Object.entries(f || {}).filter(([, v]) => v).map(([k, v]) => `${k === 'method' ? '' : 'Status: '}${esc(nice(v))}`).join(' · ') || '<span class="muted">All</span>';
  const rangeLabel = r => `${dayLabel(fromIso(r.from))} – ${dayLabel(fromIso(r.to))}`;
  const formFilters = f => { const o = {}; (TYPES[f.type] || TYPES.Payments).filters.forEach(([k]) => { if (f[k]) o[k] = f[k]; }); return o; };
  const countText = () => rp.count == null ? 'Counting matching records…' : `${rp.count} matching record${rp.count === 1 ? '' : 's'} in this range`;

  // Server-side count for the current form (same query the download uses).
  async function recountRemote(){
    const f = rp.form;
    if (!f.from || !f.to || f.from > f.to) { rp.count = null; return; }
    const qs = new URLSearchParams({ type: f.type, from: f.from, to: f.to, ...formFilters(f) }).toString();
    if (qs === rp.countKey) return;
    rp.countKey = qs; rp.count = null;
    if ($('#rpcount')) $('#rpcount').textContent = countText();
    try {
      const out = await api('/reports/preview?' + qs);
      if (rp.countKey !== qs) return;
      rp.count = out.rows;
    } catch (e) {
      if (rp.countKey !== qs) return;
      rp.countKey = '';
      if ($('#rpcount')) $('#rpcount').textContent = '';
      if ($('#rperr')) $('#rperr').textContent = e.message;
      return;
    }
    if ($('#rpcount')) $('#rpcount').textContent = countText();
  }

  /* ---- Tab: categories ---- */
  function categories(){
    return GROUPS.map(([title, cards]) => `${title ? `<h3 class="rp-sec">${title}</h3>` : '<div class="rp-sec" style="margin:0"></div>'}
      <div class="rp-cards">${cards.map(([type, icon, desc]) => `<button class="card rp-card" data-open="${type}">
        <span class="t"><span class="ic"><i data-icon=${icon} class=li></i></span>${label(type)}</span>
        <p>${desc}</p><span class="go"><i data-icon=download class=li></i> Download report</span></button>`).join('')}</div>`).join('');
  }

  /* ---- Tab: generated reports ---- */
  function history(){
    const list = hist();
    return `<div class="between" style="margin:0 0 10px;flex-wrap:wrap"><span class="muted" style="font-size:13px">${list.length} report${list.length === 1 ? '' : 's'} · each download uses your latest data</span>
        <button class="btn sm" data-open="Payments"><i data-icon=download class=li></i> New report</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Report</th><th>Date range</th><th>Filters</th><th>Format</th><th>Status</th><th>Requested</th><th>Last generated</th><th class="right">Actions</th></tr></thead>
      <tbody>${list.length ? list.map(r => `<tr><td><b>${esc(label(r.type))}</b><div class="mono muted" style="font-size:11.5px">${esc(r.id)}</div></td><td>${rangeLabel(r)}</td><td>${filtersLabel(r.filters)}</td><td>${esc(r.format)}</td>
          <td>${pill(r)}</td><td>${fmtDate(r.at)}</td><td>${r.completedAt ? fmtDate(r.completedAt) : '<span class="muted">—</span>'}</td>
          <td><div class="rp-acts"><button class="btn sm" data-dl="${esc(r.id)}"><i data-icon=download class=li></i> Download</button>
            <button class="btn sm" data-rerun="${esc(r.id)}" title="Re-run with latest data" aria-label="Re-run"><i data-icon=refresh-cw class=li></i></button>
            <button class="btn sm danger" data-del="${esc(r.id)}" title="Delete" aria-label="Delete"><i data-icon=x class=li></i></button></div></td></tr>`).join('')
        : `<tr><td colspan="8"><div class="empty-state"><div class="box"><i data-icon=file-text class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO REPORTS YET</p>
        <h3 style="margin:4px 0 6px;font-size:20px">Your generated reports appear here</h3><p class="muted" style="margin:0 0 12px">Pick a report from Categories, choose the dates, then download it.</p>
        <button class="btn sm primary" id="rpfirst">Download last 7 days of transactions</button></div></div></td></tr>`}</tbody></table></div>`;
  }

  /* ---- Tab: scheduled reports ---- */
  // Scheduled email delivery needs a scheduler and email sender; neither exists yet, so no schedules are offered.
  function scheduled(){
    return `<div class="card"><div class="empty" style="padding:32px 8px"><div style="font-size:28px">✉</div>
      <h3 style="margin:8px 0 4px">Scheduled reports aren’t available yet</h3>
      <p class="muted" style="margin:0 0 14px;font-size:13.5px">Soon you’ll be able to get reports emailed daily, weekly or monthly. For now, download any report on demand.</p>
      <button class="btn sm" id="rptocat">Browse reports</button></div></div>`;
  }

  /* ---- Builder (modal) ---- */
  function builder(){
    const f = rp.form, defs = TYPES[f.type].filters;
    const sel = (id, l, opts, val) => `<div><label for="${id}">${l} (optional)</label><select id="${id}"><option value="">All</option>${opts.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${esc(nice(o))}</option>`).join('')}</select></div>`;
    return `<div class="between"><h2 style="margin:0;font-size:20px">Download ${esc(label(f.type))} report</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin:4px 0 0;font-size:13px">Built from your latest data each time you download.</p>
      <div class="rp-form">
        <div style="grid-column:1/-1"><label for="rpt">Report</label><select id="rpt">${Object.keys(TYPES).map(t => `<option value="${t}" ${t === f.type ? 'selected' : ''}>${esc(label(t))}</option>`).join('')}</select></div>
        <div><label for="rpf">From</label><input type="date" id="rpf" value="${f.from}" max="${iso(now)}"></div>
        <div><label for="rpto">To</label><input type="date" id="rpto" value="${f.to}" max="${iso(now)}"></div>
        <div style="grid-column:1/-1" class="rp-presets">${[['Today', 0], ['Last 7 days', 6], ['Last 30 days', 29], ['This month', -1]].map(([l, d]) => `<button class="chip" data-pre="${d}">${l}</button>`).join('')}</div>
        ${defs.map(([k, l, opts]) => sel('rpx-' + k, l, opts, f[k])).join('')}
        <div style="grid-column:1/-1;margin-top:12px"><label>Format</label><div class="rp-seg">${['CSV', 'Excel'].map(x => `<button data-fmt="${x}" class="${x === f.format ? 'on' : ''}">${x}</button>`).join('')}</div></div>
      </div>
      <p class="rp-err" id="rperr"></p>
      <div class="between" style="padding-top:16px;flex-wrap:wrap;gap:10px"><span class="muted" style="font-size:13px" id="rpcount">${countText()}</span>
        <div class="row" style="gap:8px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rpgo"><i data-icon=download class=li></i> Download</button></div></div>`;
  }

  function openBuilder(type){
    if (type && TYPES[type] && type !== rp.form.type) { rp.form.type = type; rp.form.status = ''; rp.form.method = ''; }
    rp.countKey = '';
    drawBuilder();
  }
  function drawBuilder(){
    openModal(builder(), { wide: true });
    drawIcons();
    bindBuilder();
    recountRemote();
  }

  PAGES.reports = () => {
    if (liveLocked()) return head('Reports') + locked('Reports');
    return head('Reports & documents', 'Download transactions, settlements, refunds, chargebacks, payouts and fee statements for reconciliation.',
      `<button class="btn" id="rpdl"><i data-icon=download class=li></i> Download</button><button class="btn" id="rpsch"><i data-icon=calendar class=li></i> Schedule</button>`) + `<div id="rpview"></div>`;
  };

  function render(){
    const n = hist().length;
    const tabs = [['cat', 'Categories'], ['gen', `Generated reports${n ? `<span class="n">${n}</span>` : ''}`], ['sch', 'Scheduled reports']];
    $('#rpview').innerHTML = `<div class="rp-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" class="${k === rp.tab ? 'on' : ''}">${l}</button>`).join('')}</div>`
      + (rp.tab === 'cat' ? categories() : rp.tab === 'gen' ? history() : scheduled());
    drawIcons();
    bind();
  }

  async function create(params, btn){
    if (btn) btn.disabled = true;
    try {
      const r = shape(await api('/reports', { method: 'POST', body: params }));
      rp.hist[state.mode] = [r, ...hist()];
      return r;
    } catch (e) {
      if (btn) btn.disabled = false;
      if ($('#rperr')) $('#rperr').textContent = e.message; else apiFail(e);
      return null;
    }
  }

  async function download(r, btn){
    if (!r) return;
    if (btn) btn.disabled = true;
    try {
      // Same API origin as api() (core may point dev pages at the :8765 API server).
      const base = typeof API_BASE === 'string' ? API_BASE : '';
      const res = await fetch(`${base}/api/reports/${encodeURIComponent(r.id)}/download?mode=${state.mode}`, { credentials: 'include' });
      if (!res.ok) { let msg = 'Download failed (' + res.status + ')'; try { msg = (await res.json()).error || msg; } catch (e) { /* not JSON */ } throw new Error(msg); }
      // Keep raw bytes for the file: text() would drop the UTF-8 BOM the Excel format relies on.
      const bytes = await res.arrayBuffer(), text = new TextDecoder().decode(bytes), hdr = res.headers.get('x-row-count');
      // x-row-count isn't readable cross-origin; fall back to counting record breaks outside quotes, minus the header.
      let n = hdr != null ? +hdr : 0;
      if (hdr == null) { let inQ = false; for (const ch of text) { if (ch === '"') inQ = !inQ; else if (ch === '\n' && !inQ) n++; } n = Math.max(0, n - 1); }
      const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `bizpolepay-${r.type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}-${r.from}-to-${r.to}.csv`; a.click();
      r.status = 'READY'; r.completedAt = new Date();
      if ($('#rpview')) render();
      toast(`Downloaded ${label(r.type)}: ${n} row${n === 1 ? '' : 's'}${r.format === 'Excel' ? ' (CSV, opens in Excel)' : ''}`);
    } catch (e) {
      if (btn) btn.disabled = false;
      apiFail(e);
    }
  }

  // Record the report, then download it straight away; it stays under Generated reports for later.
  async function createAndDownload(params, btn){
    const r = await create(params, btn);
    if (!r) return;
    closeAll();
    rp.tab = 'gen';
    if ($('#rpview')) render();
    await download(r);
  }

  function readForm(){
    const f = rp.form;
    f.type = $('#rpt').value; f.from = $('#rpf').value; f.to = $('#rpto').value;
    TYPES[f.type].filters.forEach(([k]) => { const el = $('#rpx-' + k); f[k] = el ? el.value : ''; });
  }

  function bindBuilder(){
    const f = rp.form;
    $('#rpt').onchange = () => { readForm(); f.status = ''; f.method = ''; drawBuilder(); };
    const recount = () => { readForm(); $('#rperr').textContent = ''; recountRemote(); };
    ['#rpf', '#rpto'].forEach(s => $(s).onchange = recount);
    document.querySelectorAll('#modal [id^="rpx-"]').forEach(el => el.onchange = recount);
    document.querySelectorAll('#modal [data-fmt]').forEach(b => b.onclick = () => { readForm(); f.format = b.dataset.fmt; drawBuilder(); });
    document.querySelectorAll('#modal [data-pre]').forEach(b => b.onclick = () => {
      readForm(); const d = +b.dataset.pre;
      f.from = d < 0 ? iso(new Date(now.getFullYear(), now.getMonth(), 1)) : iso(ago(d)); f.to = iso(now); drawBuilder();
    });
    $('#rpgo').onclick = () => {
      readForm();
      const err = !f.from || !f.to ? 'Choose both dates.' : f.from > f.to ? '"From" must be on or before "To".' : f.to > iso(new Date()) ? 'The range can\'t end in the future.' : (fromIso(f.to) - fromIso(f.from)) / DAY > 365 ? 'Pick a range of one year or less.' : '';
      if (err) { $('#rperr').textContent = err; return; }
      createAndDownload({ type: f.type, from: f.from, to: f.to, format: f.format, filters: formFilters(f) }, $('#rpgo'));
    };
  }

  function bind(){
    if ($('#rpdl')) $('#rpdl').onclick = () => openBuilder();
    if ($('#rpsch')) $('#rpsch').onclick = () => { rp.tab = 'sch'; render(); };
    document.querySelectorAll('#rpview [data-tab]').forEach(b => b.onclick = () => { rp.tab = b.dataset.tab; render(); });
    document.querySelectorAll('#rpview [data-open]').forEach(b => b.onclick = () => openBuilder(b.dataset.open));
    if ($('#rptocat')) $('#rptocat').onclick = () => { rp.tab = 'cat'; render(); };
    document.querySelectorAll('#rpview [data-dl]').forEach(b => b.onclick = () => download(hist().find(r => r.id === b.dataset.dl), b));
    document.querySelectorAll('#rpview [data-rerun]').forEach(b => b.onclick = async () => {
      const o = hist().find(r => r.id === b.dataset.rerun);
      if (o) createAndDownload({ type: o.type, from: o.from, to: o.to, format: o.format, filters: { ...o.filters } }, b);
    });
    document.querySelectorAll('#rpview [data-del]').forEach(b => b.onclick = async () => {
      const id = b.dataset.del; b.disabled = true;
      try {
        await api(`/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
        rp.hist[state.mode] = hist().filter(r => r.id !== id);
        render(); toast(`Deleted ${id}`);
      } catch (e) { b.disabled = false; apiFail(e); }
    });
    if ($('#rpfirst')) $('#rpfirst').onclick = () => createAndDownload({ type: 'Payments', from: iso(ago(6)), to: iso(now), format: 'CSV', filters: {} }, $('#rpfirst'));
  }

  BIND.reports = () => { if (!liveLocked()) render(); };
})();

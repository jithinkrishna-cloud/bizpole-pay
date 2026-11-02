// Page: reports. Uses globals from app.html core (state, data, refunds, settlements, helpers, PAGES, BIND).
/* ---- Reports ---- */
(() => {
  const DAY = 864e5, KEEP_DAYS = 7, BUILD_MS = 2500;
  const TYPES = {
    Payments: { filters: [['status', 'Status', ['SUCCESS', 'FAILURE', 'PENDING', 'USER_CANCELLED']], ['mode', 'Payment mode', [...new Set(MODES)]]] },
    Refunds: { filters: [['status', 'Status', ['QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILED']]] },
    Settlements: { filters: [['status', 'Status', ['PROCESSED', 'PENDING']]] },
    Chargebacks: { filters: [['status', 'Status', ['OPEN', 'CLOSED']]] },
    Payouts: { filters: [['status', 'Status', ['SUCCESS', 'PENDING']]] },
  };
  const ago = (d, h = 0) => new Date(now - d * DAY - h * 3600e3);
  // Payout mock rows match the Payouts page.
  const PAYOUTS = { test: [
    { date: new Date(2026, 10, 2, 10, 20), ref: 'VEND-1192', who: 'Sneha Iyer', mode: 'IMPS', amount: 1250000, utr: 'IMPS6629104', status: 'SUCCESS' },
    { date: new Date(2026, 10, 1, 17, 2), ref: 'VEND-1191', who: 'Arjun Das', mode: 'UPI', amount: 450000, utr: '', status: 'PENDING' },
    { date: new Date(2026, 9, 31, 12, 44), ref: 'VEND-1190', who: 'Bluebird Supplies', mode: 'NEFT', amount: 6100000, utr: 'N30512887', status: 'SUCCESS' },
  ], live: [] };
  const iso = d => d.toLocaleDateString('en-CA');
  const fromIso = s => new Date(s + 'T00:00:00'), toIso = s => new Date(s + 'T23:59:59.999');
  const dayLabel = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rupees = p => (p / 100).toFixed(2);
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

  const rp = {
    seq: 1044,
    form: { type: 'Payments', from: iso(ago(6)), to: iso(now), format: 'CSV', status: '', mode: '' },
    hist: { test: [
      { id: 'RP1043', type: 'Payments', from: iso(ago(6, 2)), to: iso(ago(0, 2)), format: 'CSV', filters: {}, status: 'READY', at: ago(0, 2), rows: null },
      { id: 'RP1042', type: 'Settlements', from: iso(ago(9)), to: iso(ago(1)), format: 'Excel', filters: { status: 'PROCESSED' }, status: 'READY', at: ago(1, 3), rows: null },
      { id: 'RP1039', type: 'Refunds', from: iso(ago(40)), to: iso(ago(10)), format: 'CSV', filters: {}, status: 'EXPIRED', at: ago(10, 5), rows: 0 },
    ], live: [] },
    sched: { test: [
      { id: 'SC11', type: 'Payments', freq: 'Daily', day: '', time: '09:00', to: 'demo@bizpolepay.example' },
      { id: 'SC12', type: 'Settlements', freq: 'Weekly', day: 'Monday', time: '08:30', to: 'accounts@bizpolepay.example, demo@bizpolepay.example' },
    ], live: [] },
  };
  const hist = () => rp.hist[state.mode], sched = () => rp.sched[state.mode];

  function source(r){
    const a = fromIso(r.from).getTime(), b = toIso(r.to).getTime(), f = r.filters || {}, inR = d => d.getTime() >= a && d.getTime() <= b;
    const m = state.mode;
    switch (r.type) {
      case 'Payments': return { head: 'date,payu_id,txnid,customer,email,phone,payment_mode,bank,amount,refunded,status,failure_reason',
        rows: data[m].filter(t => inR(t.date) && (!f.status || t.status === f.status) && (!f.mode || t.mode === f.mode))
          .map(t => [t.date.toISOString(), t.mihpayid, t.txnid, t.name, t.email, t.phone, t.mode, t.bank, rupees(t.amount), rupees(t.refunded), t.status, t.error]) };
      case 'Refunds': return { head: 'date,refund_id,txnid,customer,amount,captured,reason,payu_request_id,bank_arn,status',
        rows: refunds[m].filter(x => inR(x.date) && (!f.status || x.status === f.status))
          .map(x => [x.date.toISOString(), x.id, x.txnid, x.name, rupees(x.amount), rupees(x.captured || 0), x.reason, x.requestId, x.arn === '—' ? '' : x.arn, x.status]) };
      case 'Settlements': return { head: 'settlement_date,settlement_id,utr,payments,gross,fee,gst,refunds,carried_in,carried_out,net,status',
        rows: settlements[m].filter(s => inR(s.date) && (!f.status || s.status === f.status))
          .map(s => [iso(s.date), s.id, s.status === 'PENDING' ? '' : s.utr, s.count, rupees(s.gross), rupees(s.fee), rupees(s.tax), rupees(s.ref), rupees(s.carriedIn), rupees(s.carriedOut), rupees(s.net), s.status]) };
      case 'Chargebacks': return { head: 'case_id,raised,txnid,payu_id,reason_code,reason,amount,respond_by,status',
        rows: (window.chargebacks_list ? window.chargebacks_list() : []).filter(c => inR(c.raised) && (!f.status || (f.status === 'CLOSED') === ['WON', 'LOST'].includes(c.status)))
          .map(c => [c.raised.toISOString(), c.id, c.txnid, c.mihpayid, c.code, c.reason, rupees(c.amount), c.respondBy.toISOString(), c.status]) };
      default: return { head: 'date,reference,beneficiary,mode,amount,utr,status',
        rows: PAYOUTS[m].filter(p => inR(p.date) && (!f.status || p.status === f.status)).map(p => [p.date.toISOString(), p.ref, p.who, p.mode, rupees(p.amount), p.utr, p.status]) };
    }
  }
  hist().forEach(r => { if (r.rows === null) r.rows = source(r).rows.length; });

  addStyle('reports', `
    .rp-seg{display:inline-flex;border:1.5px solid var(--line);border-radius:9px;overflow:hidden;background:var(--card)}
    .rp-seg button{border:0;background:none;padding:9px 16px;font-weight:600;cursor:pointer;color:var(--muted)}
    .rp-seg button.on{background:var(--brand-soft);color:var(--brand)}
    .rp-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 14px}
    .rp-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
    .rp-err{color:var(--bad);font-size:12.5px;margin:8px 0 0;min-height:0}
    .rp-sch{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
    .rp-sch:last-of-type{border-bottom:0}
    .rp-sch .ic{width:36px;height:36px;border-radius:10px;background:var(--brand-soft);color:var(--brand);display:grid;place-items:center;flex:none;font-size:16px}
    .rp-sch .who{font-size:12.5px;color:var(--muted);overflow-wrap:anywhere;word-break:normal}
    .rp-acts{display:flex;gap:6px;justify-content:flex-end}
    @media (max-width:1000px){.rp-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:820px){.rp-form{grid-template-columns:1fr}}
  `);

  const pill = r => r.status === 'QUEUED' ? '<span class="pill warn"><i data-icon=repeat class=li></i> Generating</span>' : r.status === 'READY' ? '<span class="pill ok">Ready</span>' : '<span class="pill bad">Expired</span>';
  const expires = r => new Date(r.at.getTime() + KEEP_DAYS * DAY);
  const filtersLabel = f => Object.entries(f || {}).filter(([, v]) => v).map(([k, v]) => `${k === 'mode' ? '' : 'Status: '}${v.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())}`).join(' · ') || '<span class="muted">All</span>';
  const rangeLabel = r => `${dayLabel(fromIso(r.from))} – ${dayLabel(fromIso(r.to))}`;

  function builder(){
    const f = rp.form, defs = TYPES[f.type].filters;
    const sel = (id, label, opts, val) => `<div><label for="${id}">${label}</label><select id="${id}"><option value="">All</option>${opts.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())}</option>`).join('')}</select></div>`;
    const n = source({ ...f, filters: { status: f.status, mode: f.mode } }).rows.length;
    return `<div class="card"><div class="between"><h3 style="margin:0">Generate a report</h3><span class="muted" style="font-size:13px">Ready in a few seconds · kept for ${KEEP_DAYS} days</span></div>
      <div class="rp-form">
        <div><label for="rpt">Report type</label><select id="rpt">${Object.keys(TYPES).map(t => `<option ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label for="rpf">From</label><input type="date" id="rpf" value="${f.from}" max="${iso(now)}"></div>
        <div><label for="rpto">To</label><input type="date" id="rpto" value="${f.to}" max="${iso(now)}"></div>
        <div><label>Format</label><div class="rp-seg">${['CSV', 'Excel'].map(x => `<button data-fmt="${x}" class="${x === f.format ? 'on' : ''}">${x}</button>`).join('')}</div></div>
        ${defs.map(([k, l, opts]) => sel('rpx-' + k, l + ' (optional)', opts, f[k])).join('')}
      </div>
      <div class="rp-presets">${[['Today', 0], ['Last 7 days', 6], ['Last 30 days', 29], ['This month', -1]].map(([l, d]) => `<button class="chip" data-pre="${d}">${l}</button>`).join('')}</div>
      <p class="rp-err" id="rperr"></p>
      <div class="between" style="margin-top:auto;padding-top:14px;flex-wrap:wrap"><span class="muted" style="font-size:13px" id="rpcount">${n} matching record${n === 1 ? "" : "s"} in this range</span>
        <button class="btn primary" id="rpgo">Generate report</button></div></div>`;
  }

  function schedCard(){
    return `<div class="card"><div class="between"><h3 style="margin:0">Scheduled reports</h3><button class="btn sm" id="rpadd">+ Add schedule</button></div>
      <p class="muted" style="font-size:13px;margin:4px 0 4px">Emailed automatically as a CSV attachment.</p>
      ${sched().length ? sched().map(s => `<div class="rp-sch"><span class="ic">✉</span><div style="flex:1;min-width:0"><b>${s.type}</b> · ${s.freq === 'Daily' ? 'Daily' : 'Every ' + s.day} at ${s.time}
        <div class="who">To ${esc(s.to)}</div><div class="muted" style="font-size:12px">Covers the previous ${s.freq === 'Daily' ? 'day' : '7 days'}</div></div>
        <button class="btn sm danger" data-unsched="${s.id}" aria-label="Remove schedule">Remove</button></div>`).join('')
        : `<div class="empty" style="padding:24px 8px"><div style="font-size:26px">✉</div><p style="margin:6px 0 0">No scheduled reports.</p><p style="margin:2px 0 0;font-size:13px">Add one to get payments or settlements in your inbox every morning.</p></div>`}
    </div>`;
  }

  function history(){
    const list = hist();
    return `<div class="between" style="margin:22px 0 10px;flex-wrap:wrap"><h3 style="margin:0">Report history</h3><span class="muted" style="font-size:13px">${list.filter(r => r.status === 'READY').length} ready to download · links expire after ${KEEP_DAYS} days</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Requested</th><th>Report ID</th><th>Type</th><th>Date range</th><th>Filters</th><th>Format</th><th class="right">Rows</th><th>Status</th><th>Expires</th><th class="right">Actions</th></tr></thead>
      <tbody id="rphist">${list.length ? list.map(r => {
        const exp = expires(r), left = Math.ceil((exp - Date.now()) / DAY);
        return `<tr><td>${fmtDate(r.at)}</td><td class="mono">${r.id}</td><td><b>${r.type}</b></td><td>${rangeLabel(r)}</td><td>${filtersLabel(r.filters)}</td><td>${r.format}</td>
          <td class="right">${r.status === 'QUEUED' ? '<span class="muted">—</span>' : r.status === 'EXPIRED' ? '<span class="muted">—</span>' : r.rows}</td><td>${pill(r)}</td>
          <td>${r.status === 'EXPIRED' ? `<span class="muted">${dayLabel(exp)}</span>` : r.status === 'QUEUED' ? '<span class="muted">—</span>' : `${dayLabel(exp)}<div class="muted" style="font-size:11.5px">in ${left} day${left === 1 ? '' : 's'}</div>`}</td>
          <td><div class="rp-acts">${r.status === 'READY' ? `<button class="btn sm" data-dl="${r.id}"><i data-icon=download class=li></i> Download</button>` : ''}
            <button class="btn sm" data-rerun="${r.id}" ${r.status === 'QUEUED' ? 'disabled' : ''}><i data-icon=refresh-cw class=li></i> Re-run</button><button class="btn sm danger" data-del="${r.id}" ${r.status === 'QUEUED' ? 'disabled' : ''}>Delete</button></div></td></tr>`;
      }).join('') : `<tr><td colspan="10"><div class="empty-state"><div class="box"><i data-icon=file-text class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO REPORTS YET</p>
        <h3 style="margin:4px 0 6px;font-size:20px">Your generated reports appear here</h3><p class="muted" style="margin:0 0 12px">Pick a report type and date range above, then choose Generate report.</p>
        <button class="btn sm primary" id="rpfirst">Generate last 7 days of payments</button></div></div></td></tr>`}</tbody></table></div>`;
  }

  PAGES.reports = () => {
    if (liveLocked()) return head('Reports') + locked('Reports');
    return head('Reports', 'Export payments, refunds, settlements, chargebacks and payouts for reconciliation.',
      `<a class="btn" href="#/settlements">₹ Settlements</a>`) + `<div id="rpview"></div>`;
  };

  function render(){
    $('#rpview').innerHTML = `<div class="grid g-21">${builder()}${schedCard()}</div>` + history();
    bind();
  }

  function queue(params){
    const r = { id: 'RP' + rp.seq++, ...params, status: 'QUEUED', at: new Date(), rows: 0 };
    hist().unshift(r);
    setTimeout(() => { r.status = 'READY'; r.rows = source(r).rows.length; if ($('#rpview') && location.hash.includes('reports')) render(); toast(`${r.type} report ${r.id} is ready`); }, BUILD_MS);
    return r;
  }

  function download(r){
    const { head: h, rows } = source(r), excel = r.format === 'Excel';
    const csv = (excel ? '﻿' : '') + h + '\n' + rows.map(x => x.map(q).join(',')).join('\n') + (rows.length ? '\n' : '');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bizpolepay-${r.type.toLowerCase()}-${r.from}-to-${r.to}.csv`; a.click();
    toast(`Downloaded ${rows.length} rows${excel ? ' (CSV, opens in Excel)' : ''}`);
  }

  function readForm(){
    const f = rp.form;
    f.type = $('#rpt').value; f.from = $('#rpf').value; f.to = $('#rpto').value;
    TYPES[f.type].filters.forEach(([k]) => { const el = $('#rpx-' + k); f[k] = el ? el.value : ''; });
  }

  function bind(){
    const f = rp.form;
    $('#rpt').onchange = () => { readForm(); f.status = ''; f.mode = ''; render(); };
    const recount = () => { readForm(); const n = source({ ...f, filters: { status: f.status, mode: f.mode } }).rows.length; $('#rpcount').textContent = `${n} matching record${n === 1 ? "" : "s"} in this range`; $('#rperr').textContent = ''; };
    ['#rpf', '#rpto'].forEach(s => $(s).onchange = recount);
    document.querySelectorAll('[id^="rpx-"]').forEach(el => el.onchange = recount);
    document.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { readForm(); f.format = b.dataset.fmt; render(); });
    document.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => {
      readForm(); const d = +b.dataset.pre;
      f.from = d < 0 ? iso(new Date(now.getFullYear(), now.getMonth(), 1)) : iso(ago(d)); f.to = iso(now); render();
    });
    $('#rpgo').onclick = () => {
      readForm();
      const err = !f.from || !f.to ? 'Choose both dates.' : f.from > f.to ? '"From" must be on or before "To".' : f.to > iso(now) ? 'The range can\'t end in the future.' : (fromIso(f.to) - fromIso(f.from)) / DAY > 365 ? 'Pick a range of one year or less.' : '';
      if (err) { $('#rperr').textContent = err; return; }
      const filters = {}; TYPES[f.type].filters.forEach(([k]) => { if (f[k]) filters[k] = f[k]; });
      const r = queue({ type: f.type, from: f.from, to: f.to, format: f.format, filters });
      render(); toast(`${r.type} report queued · ${r.id}`);
    };
    document.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => download(hist().find(r => r.id === b.dataset.dl)));
    document.querySelectorAll('[data-rerun]').forEach(b => b.onclick = () => {
      const o = hist().find(r => r.id === b.dataset.rerun), r = queue({ type: o.type, from: o.from, to: o.to, format: o.format, filters: { ...o.filters } });
      render(); toast(`Re-running ${o.id} as ${r.id}`);
    });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const i = hist().findIndex(r => r.id === b.dataset.del); const [r] = hist().splice(i, 1); render(); toast(`Deleted ${r.id}`); });
    document.querySelectorAll('[data-unsched]').forEach(b => b.onclick = () => { const i = sched().findIndex(s => s.id === b.dataset.unsched); const [s] = sched().splice(i, 1); render(); toast(`${s.type} schedule removed`); });
    $('#rpadd').onclick = schedModal;
    if ($('#rpfirst')) $('#rpfirst').onclick = () => { queue({ type: 'Payments', from: iso(ago(6)), to: iso(now), format: 'CSV', filters: {} }); render(); toast('Payments report queued'); };
  }

  function schedModal(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Schedule a report</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <label for="sct">Report type</label><select id="sct">${Object.keys(TYPES).map(t => `<option>${t}</option>`).join('')}</select>
      <div class="row" style="gap:12px"><div style="min-width:120px"><label for="scf">Frequency</label><select id="scf"><option>Daily</option><option>Weekly</option></select></div>
        <div style="min-width:120px" id="scdw" hidden><label for="scd">Day</label><select id="scd">${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => `<option>${d}</option>`).join('')}</select></div>
        <div style="min-width:120px"><label for="sctime">Time (IST)</label><input type="time" id="sctime" value="09:00"></div></div>
      <label for="scto">Email to</label><input id="scto" value="${esc(state.user.email)}" placeholder="name@business.in, accounts@business.in">
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">Separate up to 5 addresses with commas.</p><p class="rp-err" id="scerr"></p>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="scsave">Save schedule</button></div>`);
    $('#scf').onchange = e => { $('#scdw').hidden = e.target.value !== 'Weekly'; };
    $('#scsave').onclick = () => {
      const emails = $('#scto').value.split(',').map(s => s.trim()).filter(Boolean), time = $('#sctime').value;
      const bad = emails.find(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      const err = !emails.length ? 'Add at least one email address.' : bad ? `"${bad}" isn't a valid email address.` : emails.length > 5 ? 'Use 5 addresses or fewer.' : !time ? 'Choose a time.' : '';
      if (err) { $('#scerr').textContent = err; return; }
      const s = { id: 'SC' + (13 + sched().length + Math.floor(Math.random() * 900)), type: $('#sct').value, freq: $('#scf').value, day: $('#scf').value === 'Weekly' ? $('#scd').value : '', time, to: emails.join(', ') };
      sched().push(s); closeAll(); toast(`${s.type} report scheduled · ${s.freq === 'Daily' ? 'daily' : 'every ' + s.day} at ${s.time}`); if ($('#rpview')) render();
    };
  }

  BIND.reports = () => { if (!liveLocked()) render(); };
})();

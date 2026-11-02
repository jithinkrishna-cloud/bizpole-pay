// Page: transactions. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Transactions ---- */
const PAGE_SIZE = 10;
const RANGES = [['1h', 'Last 1 hour', 3600e3], ['today', 'Today', null], ['yesterday', 'Yesterday', null], ['7d', 'Last 7 days', 7 * 864e5], ['30d', 'Last 30 days', 30 * 864e5]];
const SEARCH_FIELDS = {
  p: [['mihpayid', 'PayU ID'], ['txnid', 'Transaction ID'], ['email', 'Email'], ['phone', 'Phone'], ['name', 'Customer name']],
  r: [['id', 'Refund ID'], ['txnid', 'Transaction ID'], ['arn', 'Bank ARN'], ['name', 'Customer name']],
};
const COLUMNS = [['date', 'Date', true], ['payu', 'PayU ID (Transaction ID)', true], ['mode', 'Payment mode', true], ['customer', 'Customer', false], ['email', 'Email', true], ['phone', 'Phone', false], ['bank', 'Bank / issuer', false], ['amount', 'Amount', true], ['status', 'Status', true]];
const tx = {
  tab: 'p', page: 1, range: '7d', field: { p: 'mihpayid', r: 'id' }, q: { p: '', r: '' },
  status: { p: [], r: [] }, modes: [], sort: { key: 'date', dir: -1 }, cols: Object.fromEntries(COLUMNS.map(c => [c[0], c[2]])),
  updatedAt: new Date(), batches: [
    { id: 'BR2031', file: 'refunds-oct-28.csv', rows: 18, ok: 17, failed: 1, status: 'PROCESSED', at: new Date(now - 5 * 864e5) },
    { id: 'BR2030', file: 'cancelled-orders.csv', rows: 6, ok: 6, failed: 0, status: 'PROCESSED', at: new Date(now - 9 * 864e5) },
  ],
};
const titleCase = s => s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
function inRange(d){
  const r = RANGES.find(x => x[0] === tx.range), t = d.getTime(), sod = new Date(now); sod.setHours(0, 0, 0, 0);
  if (tx.range === 'today') return t >= sod.getTime();
  if (tx.range === 'yesterday') return t >= sod.getTime() - 864e5 && t < sod.getTime();
  return t >= now.getTime() - r[2];
}
function payRows(){
  const q = tx.q.p.trim().toLowerCase(), f = tx.field.p;
  return D().filter(t => inRange(t.date) && (!tx.status.p.length || tx.status.p.includes(t.status)) && (!tx.modes.length || tx.modes.includes(t.mode)) && (!q || String(t[f]).toLowerCase().includes(q)))
    .sort((a, b) => tx.sort.dir * (tx.sort.key === 'amount' ? a.amount - b.amount : a.date - b.date));
}
function refRows(){
  const q = tx.q.r.trim().toLowerCase(), f = tx.field.r;
  return refunds[state.mode].filter(r => inRange(r.date) && (!tx.status.r.length || tx.status.r.includes(r.status)) && (!q || String(r[f] || '').toLowerCase().includes(q)))
    .sort((a, b) => tx.sort.dir * (tx.sort.key === 'amount' ? a.amount - b.amount : a.date - b.date));
}
const settledTotal = () => settlements[state.mode].filter(s => s.status === 'PROCESSED').reduce((a, s) => a + s.net, 0);

PAGES.transactions = () => {
  if (liveLocked()) return head('Transactions') + locked('Transactions');
  return `<div class="promo" id="promo"><div class="ic"><i data-icon=rotate-ccw class=li></i></div><div style="flex:1"><b>Turn on instant refunds</b><div class="muted">Refund customers in seconds from a pre-funded refund balance, even before settlement.</div></div>
      <a class="btn sm" href="#/products">Know more</a><button class="x" id="promoX" aria-label="Dismiss"><i data-icon=x class=li></i></button></div>
    <div class="page-h"><div><div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><h1 style="flex:none">Transactions overview</h1>
      <a class="chip brand" href="#/settlements">Total settlement amount: <b>${inr(settledTotal())}</b> <i data-icon=chevron-right class=li></i></a>
      <button class="chip" id="refresh">Last updated at <b id="upd">${tx.updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b> <i data-icon=refresh-cw class=li></i></button></div></div>
      <div class="row" style="flex:none"><a class="btn" href="#/analytics"><i data-icon=chart-column class=li></i> View analytics</a></div></div>
    <div class="tabs"><button data-t="p">Payments</button><button data-t="r">Refunds</button><button data-t="b">Batch refunds</button></div>
    <div id="tview"></div>`;
};

function toolbar(kind){
  const fields = SEARCH_FIELDS[kind], f = tx.field[kind];
  const nFilters = tx.status[kind].length + (kind === 'p' ? tx.modes.length : 0);
  const statuses = kind === 'p' ? ['SUCCESS', 'FAILURE', 'PENDING', 'USER_CANCELLED'] : ['QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILED'];
  return `<div class="toolbar">
    <div class="searchbox"><select id="sf">${fields.map(([k, l]) => `<option value="${k}" ${k === f ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input id="sq" placeholder="Search ${fields.find(x => x[0] === f)[1]}" value="${esc(tx.q[kind])}"><button class="btn primary" id="sgo">Search</button></div>
    <div class="dd"><button class="btn" data-dd="range"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === tx.range)[1]} <i data-icon=chevron-down class=li></i></button>
      <div class="menu" id="dd-range">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === tx.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="dd"><button class="btn" data-dd="filter"><i data-icon=list-filter class=li></i> Filter${nFilters ? ` <span class="pill brand">${nFilters}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
      <div class="menu wide" id="dd-filter"><h6>Status</h6>${statuses.map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${tx.status[kind].includes(s) ? 'checked' : ''}>${titleCase(s)}</label>`).join('')}
        ${kind === 'p' ? `<h6>Payment mode</h6>${[...new Set(MODES)].map(m => `<label class="ck"><input type="checkbox" data-fm="${m}" ${tx.modes.includes(m) ? 'checked' : ''}>${m}</label>`).join('')}` : ''}
        <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="freset">Reset</button><button class="btn sm primary" id="fapply">Apply</button></div></div></div>
    <span style="flex:1"></span>
    <div class="dd"><button class="btn" data-dd="dl"><i data-icon=download class=li></i> Download <i data-icon=chevron-down class=li></i></button>
      <div class="menu right" id="dd-dl"><button data-dl="csv">CSV (.csv)</button><button data-dl="xlsx">Excel (.xlsx)</button><button data-dl="email">Email me the report</button></div></div>
  </div>`;
}
function kpis(kind, rows){
  if (kind === 'p') {
    const ok = rows.filter(t => t.status === 'SUCCESS');
    return `<div class="grid g3 kpis">
      <div class="card kpi"><small>Total payments <i data-icon=info class=li></i></small><b>${inr(ok.reduce((a, t) => a + t.amount, 0))}</b><span class="d muted">${ok.length} successful</span></div>
      <div class="card kpi"><small>Number of transactions <i data-icon=info class=li></i></small><b>${rows.length}</b><span class="d muted">${rows.filter(t => t.status === 'FAILURE').length} failed · ${rows.filter(t => t.status === 'PENDING').length} pending</span></div>
      <div class="card kpi"><small>Success rate <i data-icon=info class=li></i></small><b>${rows.length ? Math.round(ok.length / rows.length * 100) : 0}%</b><span class="d muted">${rows.length} total</span></div></div>`;
  }
  const done = rows.filter(r => r.status === 'SUCCESS'), open = rows.filter(r => ['QUEUED', 'IN_PROGRESS'].includes(r.status));
  return `<div class="grid g3 kpis">
    <div class="card kpi"><small>Total refunded <i data-icon=info class=li></i></small><b>${inr(done.reduce((a, r) => a + r.amount, 0))}</b><span class="d muted">${done.length} processed</span></div>
    <div class="card kpi"><small>Number of refunds <i data-icon=info class=li></i></small><b>${rows.length}</b><span class="d muted">${open.length} in progress · ${rows.filter(r => r.status === 'FAILED').length} failed</span></div>
    <div class="card kpi"><small>Pending amount <i data-icon=info class=li></i></small><b>${inr(open.reduce((a, r) => a + r.amount, 0))}</b><span class="d muted">ARN arrives 24–72 h after processing</span></div></div>`;
}
const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-sort="${key}">${label} <span class="muted">${tx.sort.key === key ? (tx.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;
function emptyState(colspan){
  return `<tr><td colspan="${colspan}"><div class="empty-state"><div class="box"><i data-icon=package-open class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO RESULTS FOUND</p>
    <h3 style="margin:4px 0 6px;font-size:20px">We couldn't find anything</h3><p class="muted" style="margin:0 0 12px">Remove the filters or widen the date range and try again.</p>
    <div class="row" style="gap:8px"><button class="btn sm" id="eclear">Clear filters</button><button class="btn sm" id="e7d">Show last 7 days</button></div></div></div></td></tr>`;
}
function pager(total){
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), from = total ? (tx.page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(total, tx.page * PAGE_SIZE);
  return total ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${total}</span>
    <span class="pager"><button class="btn sm" data-pg="${tx.page - 1}" ${tx.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
    ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === tx.page ? 'primary' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
    <button class="btn sm" data-pg="${tx.page + 1}" ${tx.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
}

function renderPayments(){
  const rows = payRows(), pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  tx.page = Math.min(tx.page, pages);
  const vis = COLUMNS.filter(c => tx.cols[c[0]]);
  const cell = (c, t) => ({
    date: `<td>${fmtDate(t.date)}</td>`,
    payu: `<td><span class="mono">${t.mihpayid}</span><div class="mono muted" style="font-size:11.5px">${t.txnid}</div></td>`,
    mode: `<td>${t.mode}</td>`, customer: `<td>${esc(t.name)}</td>`, email: `<td>${t.email}</td>`, phone: `<td>${t.phone}</td>`, bank: `<td>${t.bank}</td>`,
    amount: `<td class="right">${t.refunded ? `<span class="pill" style="margin-right:6px" title="${inr(t.refunded)} refunded">${t.refunded >= t.amount ? 'Refunded' : 'Part refunded'}</span>` : ''}<b>${inr(t.amount)}</b></td>`,
    status: `<td>${statusPill(t.status)}</td>`,
  })[c[0]];
  return toolbar('p') + kpis('p', rows) +
    `<div class="tbl-wrap"><table><thead><tr>${vis.map(c => c[0] === 'date' ? sortHead('date', 'Date') : c[0] === 'amount' ? sortHead('amount', 'Amount', 'right') : `<th>${c[1]}</th>`).join('')}
      <th class="right" style="width:44px"><div class="dd"><button class="iconbtn" data-dd="cols" title="Choose columns"><i data-icon=settings class=li></i></button>
      <div class="menu right" id="dd-cols"><h6>Columns</h6>${COLUMNS.map(([k, l]) => `<label class="ck"><input type="checkbox" data-col="${k}" ${tx.cols[k] ? 'checked' : ''} ${['date', 'amount', 'status'].includes(k) ? 'disabled' : ''}>${l}</label>`).join('')}</div></div></th></tr></thead>
    <tbody>${rows.length ? rows.slice((tx.page - 1) * PAGE_SIZE, tx.page * PAGE_SIZE).map(t => `<tr class="click" data-id="${t.txnid}">${vis.map(c => cell(c, t)).join('')}<td></td></tr>`).join('') : emptyState(vis.length + 1)}</tbody></table></div>` + pager(rows.length);
}
function renderRefunds(){
  const rows = refRows(), pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  tx.page = Math.min(tx.page, pages);
  return toolbar('r') + kpis('r', rows) +
    `<div class="tbl-wrap"><table><thead><tr>${sortHead('date', 'Requested')}<th>Refund ID</th><th>PayU ID (Transaction ID)</th><th>Customer</th><th>Reason</th>${sortHead('amount', 'Amount', 'right')}<th>Bank ARN</th><th>Status</th></tr></thead>
    <tbody>${rows.length ? rows.slice((tx.page - 1) * PAGE_SIZE, tx.page * PAGE_SIZE).map(r => { const t = D().find(x => x.txnid === r.txnid) || {};
      return `<tr class="click" data-rid="${r.id}"><td>${fmtDate(r.date)}</td><td class="mono">${r.id}</td><td><span class="mono">${t.mihpayid || '—'}</span><div class="mono muted" style="font-size:11.5px">${r.txnid}</div></td><td>${esc(r.name || '—')}</td><td>${esc(r.reason || '—')}</td>
      <td class="right">${r.captured && r.amount < r.captured ? '<span class="pill" style="margin-right:6px">Partial</span>' : ''}<b>${inr(r.amount)}</b></td><td class="mono">${r.arn}</td><td>${statusPill(r.status)}</td></tr>`; }).join('') : emptyState(8)}</tbody></table></div>` + pager(rows.length);
}
function renderBatch(){
  return `<div class="grid g-21" style="margin-bottom:18px">
    <div class="card"><h3>Upload a batch refund file</h3><p class="muted" style="margin:0 0 12px">Refund many payments at once. Each row is checked against your transactions before anything is sent to PayU.</p>
      <label class="drop" id="drop"><input type="file" id="bfile" accept=".csv" hidden><div style="font-size:28px"><i data-icon=upload class=li></i></div><b>Drop a CSV here or click to choose</b><span class="muted" style="font-size:13px">Max 5,000 rows · UTF-8 CSV</span></label>
      <div id="bpreview"></div></div>
    <div class="card"><h3>File format</h3><p class="muted" style="margin:0 0 10px;font-size:13px">One refund per row, with a header row:</p>
      <pre class="code">payu_id,amount,reason
${D().filter(t => t.status === 'SUCCESS').slice(0, 3).map(t => `${t.mihpayid},${(t.amount / 200).toFixed(2)},Customer request`).join('\n')}</pre>
      <ul class="muted" style="font-size:13px;padding-left:18px;margin:10px 0"><li><b>payu_id</b>: the PayU ID of a successful payment</li><li><b>amount</b>: in rupees, up to the refundable amount</li><li><b>reason</b>: optional, shown on the refund</li></ul>
      <button class="btn" id="sample" style="margin-top:auto"><i data-icon=download class=li></i> Download sample file</button></div></div>
    <h3 style="margin:0 0 10px">Batch history</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Uploaded</th><th>Batch ID</th><th>File</th><th class="right">Rows</th><th class="right">Accepted</th><th class="right">Rejected</th><th>Status</th></tr></thead>
    <tbody>${tx.batches.map(b => `<tr><td>${fmtDate(b.at)}</td><td class="mono">${b.id}</td><td>${esc(b.file)}</td><td class="right">${b.rows}</td><td class="right">${b.ok}</td><td class="right">${b.failed ? `<span style="color:var(--bad)">${b.failed}</span>` : 0}</td><td>${statusPill(b.status)}</td></tr>`).join('')}</tbody></table></div>`;
}
function parseBatch(text){
  const lines = text.trim().split(/\r?\n/), header = lines.shift().split(',').map(h => h.trim().toLowerCase());
  const iId = header.indexOf('payu_id'), iAmt = header.indexOf('amount'), iReason = header.indexOf('reason');
  if (iId < 0 || iAmt < 0) return { error: 'Header must include payu_id and amount.' };
  return { rows: lines.filter(Boolean).map((line, n) => {
    const c = line.split(','), id = (c[iId] || '').trim(), amt = Math.round(parseFloat(c[iAmt]) * 100), t = D().find(x => x.mihpayid === id);
    let error = '';
    if (!t) error = 'PayU ID not found';
    else if (t.status !== 'SUCCESS') error = 'Payment was not successful';
    else if (!(amt > 0)) error = 'Invalid amount';
    else if (amt > t.amount - t.refunded) error = `Exceeds refundable ${inr(t.amount - t.refunded)}`;
    return { line: n + 2, id, amt, reason: iReason >= 0 ? (c[iReason] || '').trim() : '', t, error };
  }) };
}
function showBatchPreview(name, parsed){
  if (parsed.error) { $('#bpreview').innerHTML = `<div class="notice bad">${parsed.error}</div>`; return; }
  const ok = parsed.rows.filter(r => !r.error), bad = parsed.rows.filter(r => r.error);
  $('#bpreview').innerHTML = `<div class="between" style="margin:14px 0 8px"><b>${esc(name)}</b><span><span class="pill ok">${ok.length} valid</span> ${bad.length ? `<span class="pill bad">${bad.length} with errors</span>` : ''}</span></div>
    <div class="tbl-wrap" style="max-height:220px"><table><thead><tr><th>Row</th><th>PayU ID</th><th class="right">Amount</th><th>Check</th></tr></thead><tbody>
    ${parsed.rows.map(r => `<tr><td>${r.line}</td><td class="mono">${esc(r.id)}</td><td class="right">${r.amt > 0 ? inr(r.amt) : '—'}</td><td>${r.error ? `<span style="color:var(--bad)">${r.error}</span>` : '<span style="color:var(--ok)">✓ Ready</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:12px;gap:8px"><button class="btn" id="bcancel">Cancel</button><button class="btn primary" id="bsubmit" ${ok.length ? '' : 'disabled'}>Refund ${ok.length} payments · ${inr(ok.reduce((a, r) => a + r.amt, 0))}</button></div>`;
  $('#bcancel').onclick = () => { $('#bpreview').innerHTML = ''; $('#bfile').value = ''; };
  $('#bsubmit').onclick = () => {
    ok.forEach(r => { r.t.refunded += r.amt; refunds[state.mode].unshift({ id: 'RF' + Math.floor(8300 + Math.random() * 999), txnid: r.t.txnid, name: r.t.name, mode: r.t.mode, amount: r.amt, captured: r.t.amount, status: 'QUEUED', reason: r.reason || 'Batch refund', requestId: String(1190000000 + Math.floor(Math.random() * 9e6)), arn: '—', date: new Date() }); });
    tx.batches.unshift({ id: 'BR' + (2032 + tx.batches.length - 2), file: name, rows: parsed.rows.length, ok: ok.length, failed: bad.length, status: 'QUEUED', at: new Date() });
    toast(`${ok.length} refunds queued`); showTxTab('b');
  };
}

function showTxTab(k){
  if (k !== tx.tab) { tx.page = 1; tx.sort = { key: 'date', dir: -1 }; }
  tx.tab = k;
  document.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === k));
  $('#tview').innerHTML = k === 'p' ? renderPayments() : k === 'r' ? renderRefunds() : renderBatch();
  bindTxView(k);
}
function bindTxView(k){
  const redraw = () => showTxTab(k);
  if (k === 'b') {
    $('#bfile').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => showBatchPreview(f.name, parseBatch(t))); };
    const drop = $('#drop');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) f.text().then(t => showBatchPreview(f.name, parseBatch(t))); };
    $('#sample').onclick = () => {
      const csv = 'payu_id,amount,reason\n' + D().filter(t => t.status === 'SUCCESS').slice(0, 3).map(t => `${t.mihpayid},${(t.amount / 200).toFixed(2)},Customer request`).join('\n') + '\n';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'bizpolepay-batch-refund-sample.csv'; a.click();
    };
    return;
  }
  document.querySelectorAll('[data-dd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#dd-' + b.dataset.dd), open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); });
  document.querySelectorAll('.menu').forEach(m => m.onclick = e => e.stopPropagation());
  $('#sf').onchange = e => { tx.field[k] = e.target.value; tx.q[k] = ''; redraw(); };
  const search = () => { tx.q[k] = $('#sq').value; tx.page = 1; redraw(); };
  $('#sgo').onclick = search;
  $('#sq').onkeydown = e => { if (e.key === 'Enter') search(); };
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { tx.range = b.dataset.range; tx.page = 1; redraw(); });
  $('#fapply').onclick = () => {
    tx.status[k] = [...document.querySelectorAll('[data-fs]:checked')].map(x => x.dataset.fs);
    if (k === 'p') tx.modes = [...document.querySelectorAll('[data-fm]:checked')].map(x => x.dataset.fm);
    tx.page = 1; redraw();
  };
  $('#freset').onclick = () => { tx.status[k] = []; if (k === 'p') tx.modes = []; tx.page = 1; redraw(); };
  document.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
    closeMenus();
    if (b.dataset.dl === 'email') return toast(`Report will be emailed to ${state.user.email}`);
    const rows = k === 'p' ? payRows() : refRows();
    const csv = k === 'p'
      ? 'date,payu_id,txnid,mode,email,amount,status\n' + rows.map(t => [t.date.toISOString(), t.mihpayid, t.txnid, t.mode, t.email, (t.amount / 100).toFixed(2), t.status].join(',')).join('\n')
      : 'date,refund_id,txnid,amount,arn,status\n' + rows.map(r => [r.date.toISOString(), r.id, r.txnid, (r.amount / 100).toFixed(2), r.arn, r.status].join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv + '\n'], { type: 'text/csv' }));
    a.download = `bizpolepay-${k === 'p' ? 'payments' : 'refunds'}-${tx.range}.${b.dataset.dl === 'xlsx' ? 'csv' : 'csv'}`; a.click();
    toast(`Downloaded ${rows.length} rows${b.dataset.dl === 'xlsx' ? ' (CSV; opens in Excel)' : ''}`);
  });
  document.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { const key = h.dataset.sort; tx.sort = { key, dir: tx.sort.key === key ? -tx.sort.dir : -1 }; redraw(); });
  document.querySelectorAll('[data-col]').forEach(c => c.onchange = () => { tx.cols[c.dataset.col] = c.checked; redraw(); setTimeout(() => $('#dd-cols').classList.add('open')); });
  document.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { tx.page = +b.dataset.pg; redraw(); });
  document.querySelectorAll('tr[data-id]').forEach(r => r.onclick = () => txnDrawer(r.dataset.id));
  document.querySelectorAll('tr[data-rid]').forEach(r => r.onclick = () => refundDrawer(r.dataset.rid));
  if ($('#eclear')) { $('#eclear').onclick = () => { tx.status[k] = []; tx.modes = []; tx.q[k] = ''; redraw(); }; $('#e7d').onclick = () => { tx.range = '7d'; redraw(); }; }
}
function closeMenus(){ document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); }
document.addEventListener('click', closeMenus);
BIND.transactions = () => {
  if (liveLocked()) return;
  $('#promoX').onclick = () => $('#promo').remove();
  $('#refresh').onclick = () => { tx.updatedAt = new Date(); $('#upd').textContent = tx.updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); toast('Transactions refreshed'); };
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => showTxTab(b.dataset.t));
  showTxTab(tx.tab);
};

function refundDrawer(id){
  const r = refunds[state.mode].find(x => x.id === id);
  const steps = [['Refund requested', true], ['Accepted by PayU (request ID issued)', r.status !== 'REQUESTED'], ['Processed by bank', ['SUCCESS'].includes(r.status)], ['ARN available to customer', r.arn !== '—']];
  openDrawer(`<div class="between"><h2 style="margin:0">${inr(r.amount)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
    <p>${statusPill(r.status)} <span class="muted">${fmtDate(r.date)}</span></p>
    ${r.status === 'FAILED' ? `<div class="card" style="background:var(--bad-soft);border-color:transparent;margin-bottom:14px"><b>Refund failed.</b> The bank rejected the request. You can retry from the transaction.</div>` : ''}
    <h3>Refund</h3><dl class="kv"><dt>Refund ID</dt><dd class="mono">${r.id}</dd><dt>PayU request ID</dt><dd class="mono">${r.requestId || '—'}</dd><dt>Bank ARN</dt><dd class="mono">${r.arn}</dd><dt>Reason</dt><dd>${esc(r.reason || '—')}</dd><dt>Type</dt><dd>${r.captured && r.amount < r.captured ? 'Partial' : 'Full'}</dd></dl>
    <h3 style="margin-top:18px">Original payment</h3><dl class="kv"><dt>Txn ID</dt><dd class="mono">${r.txnid}</dd><dt>Customer</dt><dd>${esc(r.name || '—')}</dd><dt>Mode</dt><dd>${r.mode || '—'}</dd><dt>Captured</dt><dd>${r.captured ? inr(r.captured) : '—'}</dd></dl>
    <h3 style="margin-top:18px">Progress</h3>${steps.map(([s, d]) => `<p style="font-size:13px;margin:6px 0"><span class="dot ${d ? '' : 'warn'}"></span>${s}</p>`).join('')}
    <p class="muted" style="font-size:12.5px;margin-top:14px">Bank ARN usually arrives 24–72 business hours after the refund is processed.</p>
    <div class="row" style="margin-top:16px"><button class="btn" onclick="closeAll();txnDrawer('${r.txnid}')">View payment</button>${['QUEUED', 'IN_PROGRESS'].includes(r.status) ? `<button class="btn" onclick="toast('Status re-checked with PayU')">Check status</button>` : ''}</div>`);
}
function txnDrawer(id){
  const t = D().find(x => x.txnid === id), refundable = t.amount - t.refunded;
  openDrawer(`<div class="between"><h2 style="margin:0">${inr(t.amount)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
    <p>${statusPill(t.status)} <span class="muted">${fmtDate(t.date)}</span></p>
    ${t.error ? `<div class="card" style="background:var(--bad-soft);border-color:transparent;margin-bottom:14px"><b>Failure reason:</b> ${t.error}</div>` : ''}
    <h3>Payment</h3><dl class="kv"><dt>Txn ID</dt><dd class="mono">${t.txnid}</dd><dt>PayU ID (mihpayid)</dt><dd class="mono">${t.mihpayid}</dd><dt>Mode</dt><dd>${t.mode}</dd><dt>Bank / issuer</dt><dd>${t.bank}</dd><dt>Product info</dt><dd>${esc(t.product)}</dd><dt>Refunded</dt><dd>${inr(t.refunded)}</dd></dl>
    <h3 style="margin-top:18px">Customer</h3><dl class="kv"><dt>Name</dt><dd>${esc(t.name)}</dd><dt>Email</dt><dd>${t.email}</dd><dt>Phone</dt><dd>${t.phone}</dd></dl>
    <h3 style="margin-top:18px">Timeline</h3>
    <p class="muted" style="font-size:13px;margin:4px 0">● Order created · ${fmtDate(t.date)}</p>
    <p class="muted" style="font-size:13px;margin:4px 0">● Redirected to checkout</p>
    <p class="muted" style="font-size:13px;margin:4px 0">● Callback received · hash verified</p>
    <p class="muted" style="font-size:13px;margin:4px 0">● Status confirmed with verify_payment</p>
    <div class="row" style="margin-top:20px">
      ${t.status === 'SUCCESS' && refundable > 0 ? `<button class="btn primary" id="rfb">Issue refund</button>` : ''}
      ${t.status === 'PENDING' ? `<button class="btn" onclick="toast('Re-checking status with the payment provider…')">Check status</button>` : ''}
      <button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${t.txnid}');toast('Txn ID copied')">Copy Txn ID</button>
    </div>`);
  const b = $('#rfb'); if (b) b.onclick = () => refundModal(t);
}
function refundModal(t){
  const max = t.amount - t.refunded;
  openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Refund ${t.txnid}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
    <p class="muted">Refundable: <b style="color:var(--ink)">${inr(max)}</b></p>
    <label>Amount (₹)</label><input id="ra" type="number" step="0.01" min="1" max="${max / 100}" value="${(max / 100).toFixed(2)}">
    <label>Reason</label><select id="rr"><option>Customer request</option><option>Duplicate payment</option><option>Order cancelled</option><option>Other</option></select>
    <p class="muted" style="font-size:12.5px">Refunds usually reach the customer within 5–7 working days. UPI refunds are often faster.</p>
    <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rgo">Refund</button></div>`);
  $('#rgo').onclick = () => {
    const amt = Math.round(parseFloat($('#ra').value) * 100);
    if (!(amt > 0 && amt <= max)) return toast('Enter an amount up to ' + inr(max));
    t.refunded += amt;
    refunds[state.mode].unshift({ id: 'RF' + Math.floor(8200 + Math.random() * 999), txnid: t.txnid, name: t.name, mode: t.mode, amount: amt, captured: t.amount,
      status: 'QUEUED', reason: $('#rr').value, requestId: String(1189000000 + Math.floor(Math.random() * 9e6)), arn: '—', date: new Date() });
    closeAll(); toast('Refund queued · ' + inr(amt)); if (location.hash.includes('transactions')) route();
  };
}

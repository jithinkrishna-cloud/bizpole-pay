// Page: settlements. Uses globals from app.html core (state, data, settlements, helpers, PAGES, BIND).
/* ---- Settlements ---- */
(() => {
  const PAGE = 10;
  const RANGES = [['7d', 'Last 7 days', 7], ['14d', 'Last 14 days', 14], ['30d', 'Last 30 days', 30], ['90d', 'Last 90 days', 90]];
  const FIELDS = [['id', 'Settlement ID'], ['utr', 'UTR']];
  const STATUSES = [['PROCESSED', 'Processed (paid out)'], ['PENDING', 'Pending (scheduled)'], ['ON_HOLD', 'On hold'], ['FAILED', 'Failed']];
  // Per mode: { account: {bankName,last4,ifsc,...} | null, feesByMode: [{mode,n,gross,fee,tax}] } from GET /settlement-info.
  const info = { test: null, live: null };
  LOAD.settlements = async (mode) => { info[mode] = await api('/settlement-info', { mode }); };
  const inf = () => info[state.mode] || { account: null, feesByMode: [] };
  const bank = () => { const a = inf().account; return a ? `${esc(a.bankName || 'Bank account')} ••••${esc(a.last4)}` : ''; };
  const bankOr = (fallback) => bank() || fallback;
  const st = { range: '30d', field: 'id', q: '', status: [], page: 1, sort: { key: 'date', dir: -1 } };

  const dayLabel = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rangeDays = () => RANGES.find(r => r[0] === st.range)[2];
  const inRange = s => s.date.getTime() >= now.getTime() - rangeDays() * 864e5;
  const adj = s => s.ref + (s.chargebacks || 0) + s.carriedIn - s.carriedOut; // positive = deducted from the payout
  const all = () => settlements[state.mode];
  const rows = () => {
    const q = st.q.trim().toLowerCase();
    return all().filter(s => inRange(s) && (!st.status.length || st.status.includes(s.status)) && (!q || String(s[st.field]).toLowerCase().includes(q)))
      .sort((a, b) => st.sort.dir * (st.sort.key === 'net' ? a.net - b.net : a.date - b.date));
  };
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);
  const download = (name, csv) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click(); };
  const rupees = p => (p / 100).toFixed(2);

  addStyle('settlements', `
    .stl-lines{display:grid;grid-template-columns:1fr auto;gap:0;font-size:13.5px;margin:0}
    .stl-lines dt,.stl-lines dd{padding:8px 0;border-bottom:1px solid var(--line);margin:0}
    .stl-lines dd{text-align:right;font-variant-numeric:tabular-nums}
    .stl-lines .tot{font-weight:700;border-bottom:0;font-size:15px}
    .stl-txns{max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px}
    .stl-txns div{display:grid;grid-template-columns:1fr auto auto;gap:12px;padding:7px 12px;border-bottom:1px solid var(--line);font-size:13px}
    .stl-txns div:last-child{border-bottom:0}
    .stl-sched{display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start;margin:8px 0}
    .stl-sched .n{width:28px;height:28px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:grid;place-items:center;font-weight:700;font-size:12px}
    .stl-sched p{margin:0;font-size:13px} .stl-sched small{color:var(--muted);font-size:12px}
    .stl-fees{overflow:auto}
  `);

  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-sort="${key}">${label} <span class="muted">${st.sort.key === key ? (st.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;

  function kpis(list){
    const next = all().find(s => s.status === 'PENDING');
    const done = list.filter(s => s.status === 'PROCESSED');
    const gross = list.reduce((a, s) => a + s.gross, 0), fees = list.reduce((a, s) => a + s.fee + s.tax, 0);
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Next settlement</small><b>${next ? inr(next.net) : '—'}</b><span class="d muted">${next ? `Reported ${dayLabel(next.date)} · ${next.count} payment${next.count === 1 ? '' : 's'}` : 'Nothing pending right now'}</span></div>
      <div class="card kpi"><small>Settled in range</small><b>${inr(done.reduce((a, s) => a + s.net, 0))}</b><span class="d muted">${done.length} settlement${done.length === 1 ? '' : 's'} · ${RANGES.find(r => r[0] === st.range)[1].toLowerCase()}</span></div>
      <div class="card kpi"><small>Fees + GST in range</small><b>${inr(fees)}</b><span class="d muted">${gross ? (fees / gross * 100).toFixed(2) : '0.00'}% of ${inr(gross)} gross</span></div>
      <div class="card kpi"><small>Settlement bank account</small><b style="font-size:20px">${bankOr('Not added yet')}</b><span class="d muted">${bank() ? 'T+1 cycle' : 'Add it in onboarding to receive payouts'} · <a class="linkish" href="#/${bank() ? 'settings' : 'onboarding'}">${bank() ? 'Manage' : 'Add account'}</a></span></div></div>`;
  }

  function toolbar(){
    const n = st.status.length;
    return `<div class="toolbar">
      <div class="searchbox"><select id="ssf">${FIELDS.map(([k, l]) => `<option value="${k}" ${k === st.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="ssq" placeholder="Search ${FIELDS.find(f => f[0] === st.field)[1]}" value="${esc(st.q)}"><button class="btn primary" id="ssgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="sfilter"><i data-icon=list-filter class=li></i> Status${n ? ` <span class="pill brand">${n}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-sfilter"><h6>Status</h6>${STATUSES.map(([s, l]) => `<label class="ck"><input type="checkbox" data-fs="${s}" ${st.status.includes(s) ? 'checked' : ''}>${l}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sfreset">Reset</button><button class="btn sm primary" id="sfapply">Apply</button></div></div></div>
      <span style="flex:1"></span>
      <span class="muted" style="font-size:13px">${bank() ? `Paid T+1 to ${bank()}` : 'No settlement bank account on file'}</span>
    </div>`;
  }

  function emptyState(){
    const any = all().length;
    return `<tr><td colspan="8"><div class="empty-state"><div class="box"><i data-icon=landmark class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO SETTLEMENTS FOUND</p>
      <h3 style="margin:4px 0 6px;font-size:20px">${any ? 'Nothing matches these filters' : 'No settlements yet'}</h3>
      <p class="muted" style="margin:0 0 12px">${any ? 'Clear the search or status filter, or widen the date range.' : `Successful ${isLive() ? 'live' : 'test'} payments are settled to your bank account the next working day. Settlements appear here once PayU reports them.`}</p>
      <div class="row" style="gap:8px">${any ? '<button class="btn sm" id="seclear">Clear filters</button><button class="btn sm" id="se30">Show last 30 days</button>' : '<a class="btn sm" href="#/transactions">View transactions</a>'}</div></div></div></td></tr>`;
  }

  function pager(total){
    const pages = Math.max(1, Math.ceil(total / PAGE)), from = total ? (st.page - 1) * PAGE + 1 : 0, to = Math.min(total, st.page * PAGE);
    return total ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${total}</span>
      <span class="pager"><button class="btn sm" data-pg="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === st.page ? 'primary' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="btn sm" data-pg="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
  }

  function table(list){
    const pages = Math.max(1, Math.ceil(list.length / PAGE)); st.page = Math.min(st.page, pages);
    return `<div class="tbl-wrap"><table><thead><tr>${sortHead('date', 'Settlement date')}<th>Settlement ID</th><th>UTR</th><th class="right">Gross</th><th class="right">Fees + GST</th><th class="right">Refunds / adjustments</th>${sortHead('net', 'Net settled', 'right')}<th>Status</th></tr></thead>
      <tbody>${list.length ? list.slice((st.page - 1) * PAGE, st.page * PAGE).map(s => {
        const a = adj(s);
        const note = s.carriedOut ? `<div class="muted" style="font-size:11.5px">${inr(s.carriedOut)} carried forward</div>` : s.carriedIn ? `<div class="muted" style="font-size:11.5px">incl. ${inr(s.carriedIn)} carried in</div>` : '';
        return `<tr class="click" data-sid="${esc(s.dbId)}"><td>${dayLabel(s.date)}<div class="muted" style="font-size:11.5px">${s.count} payments</div></td><td class="mono">${esc(s.id)}</td><td class="mono">${s.status === 'PENDING' ? '<span class="muted">Awaiting payout</span>' : esc(s.utr)}</td>
          <td class="right">${inr(s.gross)}</td><td class="right muted">${inr(-(s.fee + s.tax))}</td><td class="right ${a ? '' : 'muted'}">${a ? inr(-a) : '—'}${note}</td><td class="right"><b>${inr(s.net)}</b></td><td>${statusPill(s.status)}</td></tr>`;
      }).join('') : emptyState()}</tbody></table></div>` + pager(list.length);
  }

  function feeBreakdown(){
    // Actual fee and GST per settled payment, from PayU's settlement lines.
    const recent = all().filter(s => s.date.getTime() >= now.getTime() - 7 * 864e5), list = inf().feesByMode;
    const tot = list.reduce((a, m) => a + m.fee + m.tax, 0), max = Math.max(1, ...list.map(m => m.fee + m.tax));
    const sum = k => list.reduce((a, m) => a + m[k], 0);
    return `<div class="card"><div class="between" style="margin-bottom:6px;flex-wrap:wrap"><h3 style="margin:0">Fees by payment mode · last 7 days</h3><span class="muted" style="font-size:13px">${recent.length} settlement${recent.length === 1 ? '' : 's'} · ${sum('n')} payments</span></div>
      ${list.length ? `<div class="stl-fees"><table style="margin-top:6px"><thead><tr><th>Payment mode</th><th class="right">Payments</th><th class="right">Gross</th><th class="right">Fee</th><th class="right">GST</th><th style="width:28%">Share of fees</th></tr></thead><tbody>
        ${list.map(m => `<tr><td>${esc(m.mode)}</td><td class="right">${m.n}</td><td class="right">${inr(m.gross)}</td><td class="right">${inr(m.fee)}</td><td class="right">${inr(m.tax)}</td>
          <td><div class="hbar" style="grid-template-columns:1fr 40px;margin:0"><div class="t"><i style="width:${((m.fee + m.tax) / max * 100).toFixed(1)}%"></i></div><span class="muted right">${tot ? Math.round((m.fee + m.tax) / tot * 100) : 0}%</span></div></td></tr>`).join('')}
        <tr><td><b>Total</b></td><td class="right"><b>${sum('n')}</b></td><td class="right"><b>${inr(sum('gross'))}</b></td><td class="right"><b>${inr(sum('fee'))}</b></td><td class="right"><b>${inr(sum('tax'))}</b></td><td></td></tr></tbody></table></div>`
        : '<p class="muted">No settled payments in the last 7 days.</p>'}
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">Fees and GST are taken from each payment's settlement line; settlement totals are rounded per settlement and can differ by a few paise.</p></div>`;
  }

  function schedule(){
    const next = all().find(s => s.status === 'PENDING');
    return `<div class="card"><h3>Settlement schedule</h3>
      <div class="stl-sched"><span class="n">T</span><div><p><b>Payment captured</b></p><small>Successful payments are grouped by capture day</small></div></div>
      <div class="stl-sched"><span class="n">+1</span><div><p><b>Settled next working day</b></p><small>Net of the gateway fee, GST on the fee and processed refunds</small></div></div>
      <div class="stl-sched"><span class="n">₹</span><div><p><b>Next payout</b> · ${next ? inr(next.net) : '—'}</p><small>${next ? `Reported ${dayLabel(next.date)} · paid once the bank transfer completes` : 'No settlement is pending right now'}</small></div></div>
      <dl class="kv" style="margin:8px 0 14px;grid-template-columns:110px 1fr"><dt>Bank account</dt><dd>${bankOr('<span class="muted">Not added yet</span>')}</dd><dt>Cycle</dt><dd>T+1 (working days)</dd><dt>Shortfalls</dt><dd style="word-break:normal">Carried to the next settlement, never debited</dd></dl>
      <a class="btn" href="#/settings" style="margin-top:auto;align-self:flex-start">Manage in Settings <i data-icon=chevron-right class=li></i></a></div>`;
  }

  function csvFor(list){
    return 'settlement_date,settlement_id,utr,payments,gross,fee,gst,refunds,chargebacks,carried_in,carried_out,net,status\n' +
      list.map(s => [s.date.toISOString().slice(0, 10), s.id, s.status === 'PENDING' ? '' : s.utr, s.count, rupees(s.gross), rupees(s.fee), rupees(s.tax), rupees(s.ref), rupees(s.chargebacks || 0), rupees(s.carriedIn), rupees(s.carriedOut), rupees(s.net), s.status].join(',')).join('\n') + '\n';
  }

  PAGES.settlements = () => {
    if (liveLocked()) return head('Settlements') + locked('Settlements');
    return head('Settlements', 'Money paid to your bank account from successful payments, after fees, GST and refunds.',
      `<div class="dd"><button class="btn" data-dd="srange"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === st.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu right" id="dd-srange">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === st.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <button class="btn" id="sdl"><i data-icon=download class=li></i> Download</button>`) + `<div id="sview"></div>`;
  };

  function render(){
    $('#sview').innerHTML = kpis(all().filter(inRange)) + toolbar() + table(rows()) + `<div class="grid g-21" style="margin-top:20px">${feeBreakdown()}${schedule()}</div>`;
    bind();
  }

  function bind(){
    document.querySelectorAll('[data-dd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#dd-' + b.dataset.dd), open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); });
    document.querySelectorAll('.menu').forEach(m => m.onclick = e => e.stopPropagation());
    $('#ssf').onchange = e => { st.field = e.target.value; st.q = ''; render(); };
    const search = () => { st.q = $('#ssq').value; st.page = 1; render(); };
    $('#ssgo').onclick = search;
    $('#ssq').onkeydown = e => { if (e.key === 'Enter') search(); };
    $('#sfapply').onclick = () => { st.status = [...document.querySelectorAll('[data-fs]:checked')].map(x => x.dataset.fs); st.page = 1; render(); };
    $('#sfreset').onclick = () => { st.status = []; st.page = 1; render(); };
    document.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { const key = h.dataset.sort; st.sort = { key, dir: st.sort.key === key ? -st.sort.dir : -1 }; render(); });
    document.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { st.page = +b.dataset.pg; render(); });
    document.querySelectorAll('tr[data-sid]').forEach(r => r.onclick = () => drawer(r.dataset.sid));
    if ($('#seclear')) { $('#seclear').onclick = () => { st.status = []; st.q = ''; render(); }; $('#se30').onclick = () => { st.range = '30d'; route(); }; }
  }

  BIND.settlements = () => {
    if (liveLocked()) return;
    render();
    document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { st.range = b.dataset.range; st.page = 1; route(); });
    $('#sdl').onclick = () => { const list = rows(); download(`bizpolepay-settlements-${st.range}.csv`, csvFor(list)); toast(`Downloaded ${list.length} settlements`); };
  };

  // Breakdown rows; carry-forward rows only when PayU reported them (they are 0 otherwise).
  function lines(s){
    return [['Gross collections', s.gross], ['Gateway fee', -s.fee], ['GST on fee', -s.tax], ['Refunds adjusted', -s.ref], ['Chargebacks adjusted', -(s.chargebacks || 0)],
      ...(s.carriedIn ? [['Carried in from previous settlement', -s.carriedIn]] : []), ...(s.carriedOut ? [['Shortfall carried forward', s.carriedOut]] : [])];
  }
  const ACTION = { CAPTURE: 'Payment', REFUND: 'Refund', CHARGEBACK: 'Chargeback', CHARGEBACK_REVERSAL: 'Chargeback reversal', OTHER: 'Adjustment' };

  function drawer(dbId){
    const base = all().find(x => x.dbId === dbId);
    if (!base) return toast('Settlement not found. Refresh and try again.');
    const paint = (s, d) => {
      const caps = d ? d.lines.filter(l => l.action === 'CAPTURE') : [], others = d ? d.lines.filter(l => l.action !== 'CAPTURE') : [];
      const acct = d && d.account ? `${esc(d.account.bankName || 'Bank account')} ••••${esc(d.account.last4)}` : bankOr('—');
      openDrawer(`<div class="between" id="sdrw" data-sid="${esc(s.dbId)}"><h2 style="margin:0">${inr(s.net)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
        <p>${statusPill(s.status)} <span class="muted">${esc(s.id)} · ${s.status === 'PROCESSED' ? `paid ${dayLabel(s.date)}` : `reported ${dayLabel(s.date)}`}</span></p>
        ${s.status === 'ON_HOLD' ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px;font-size:13.5px"><b>On hold.</b> PayU is holding this settlement. Check your email from PayU or contact support.</div>` : ''}
        ${s.status === 'FAILED' ? `<div class="card" style="background:var(--bad-soft);border-color:transparent;margin-bottom:14px;font-size:13.5px"><b>Payout failed.</b> The bank transfer did not go through. Check your settlement bank account details.</div>` : ''}
        <h3>Breakdown</h3>
        <dl class="stl-lines">${lines(s).map(([l, v]) => `<dt class="${v ? '' : 'muted'}">${l}</dt><dd class="${v ? '' : 'muted'}">${v ? inr(v) : '—'}</dd>`).join('')}<dt class="tot">Net settled</dt><dd class="tot">${inr(s.net)}</dd></dl>
        <h3 style="margin-top:18px">Payout</h3>
        <dl class="kv"><dt>UTR</dt><dd class="mono">${s.utr === '—' ? (s.status === 'PROCESSED' ? '—' : 'Issued when paid out') : `${esc(s.utr)} <button class="linkish" id="sutr" style="margin-left:6px">Copy</button>`}</dd><dt>Bank account</dt><dd>${acct}</dd></dl>
        <h3 style="margin-top:18px">Included payments (${d ? caps.length : s.count})</h3>
        ${!d ? '<p class="muted" id="sload" style="font-size:13px">Loading settlement lines…</p>'
          : caps.length ? `<div class="stl-txns">${caps.map(l => `<div><span><span class="mono">${esc(l.txnid)}</span><span class="muted" style="font-size:12px"> · ${esc(l.name)}</span></span><span class="muted">${esc(l.mode)}</span><b>${inr(l.gross)}</b></div>`).join('')}</div>`
          : '<p class="muted" style="font-size:13px">PayU did not report payment lines for this settlement.</p>'}
        ${others.length ? `<h3 style="margin-top:18px">Adjustments (${others.length})</h3><div class="stl-txns">${others.map(l => `<div><span><span class="mono">${esc(l.txnid)}</span><span class="muted" style="font-size:12px"> · ${ACTION[l.action] || l.action}</span></span><span class="muted">${esc(l.mode)}</span><b>${inr(l.net)}</b></div>`).join('')}</div>` : ''}
        <div class="row" style="margin-top:18px"><button class="btn primary" id="sreport" style="flex-basis:100%" ${d ? '' : 'disabled'}><i data-icon=download class=li></i> Download settlement report</button><a class="btn" href="#/transactions">View transactions</a></div>`);
      const c = $('#sutr'); if (c) c.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(s.utr); toast('UTR copied'); };
      $('#sreport').onclick = () => {
        if (!d) return;
        const q = v => `"${String(v).replace(/"/g, '""')}"`;
        const csv = `settlement_id,${q(s.id)}\nutr,${s.utr === '—' ? '' : q(s.utr)}\nstatus,${s.status}\nsettlement_date,${s.date.toISOString().slice(0, 10)}\n\nline,amount\n` +
          lines(s).map(([l, v]) => `${l},${rupees(v)}`).join('\n') + `\nNet settled,${rupees(s.net)}\n\ntype,txnid,payu_id,payment_mode,customer,gross,fee,gst,net\n` +
          d.lines.map(l => [ACTION[l.action] || l.action, q(l.txnid), q(l.payuId), q(l.mode), q(l.name), rupees(l.gross), rupees(l.fee), rupees(l.tax), rupees(l.net)].join(',')).join('\n') + '\n';
        download(`bizpolepay-${s.id}.csv`, csv); toast(`Settlement report for ${s.id} downloaded`);
      };
    };
    paint(base, null);
    api('/settlements/' + encodeURIComponent(dbId)).then(d => {
      const open = $('#sdrw'); if (!open || open.dataset.sid !== dbId) return;
      paint({ ...base, ...d, date: new Date(d.date), count: base.count }, d);
    }).catch(e => { const l = $('#sload'); if (l) l.textContent = 'Could not load settlement lines: ' + e.message; });
  }
})();

// Page: settlements. Uses globals from app.html core (state, data, settlements, helpers, PAGES, BIND).
/* ---- Settlements ---- */
(() => {
  const PAGE = 10;
  const RANGES = [['7d', 'Last 7 days', 7], ['14d', 'Last 14 days', 14], ['30d', 'Last 30 days', 30], ['90d', 'Last 90 days', 90]];
  const FIELDS = [['id', 'Settlement ID'], ['utr', 'UTR']];
  const STATUSES = ['PROCESSED', 'PENDING'];
  const BANK = 'HDFC Bank ••••4821';
  const st = { range: '30d', field: 'id', q: '', status: [], page: 1, sort: { key: 'date', dir: -1 } };

  const dayLabel = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const payoutAt = d => { const x = new Date(d); x.setHours(11, 0, 0, 0); return x; };
  const rangeDays = () => RANGES.find(r => r[0] === st.range)[2];
  const inRange = s => s.date.getTime() >= now.getTime() - rangeDays() * 864e5;
  const adj = s => s.ref + s.carriedIn - s.carriedOut; // positive = deducted from the payout
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
      <div class="card kpi"><small>Next settlement</small><b>${next ? inr(next.net) : '—'}</b><span class="d muted">${next ? `Expected ${dayLabel(next.date)}, by 11:00 AM · ${next.carriedOut ? `${inr(next.carriedOut)} shortfall carried forward` : `${next.count} payments`}` : 'Nothing pending right now'}</span></div>
      <div class="card kpi"><small>Settled in range</small><b>${inr(done.reduce((a, s) => a + s.net, 0))}</b><span class="d muted">${done.length} settlement${done.length === 1 ? '' : 's'} · ${RANGES.find(r => r[0] === st.range)[1].toLowerCase()}</span></div>
      <div class="card kpi"><small>Fees + GST in range</small><b>${inr(fees)}</b><span class="d muted">${gross ? (fees / gross * 100).toFixed(2) : '0.00'}% of ${inr(gross)} gross</span></div>
      <div class="card kpi"><small>Settlement bank account</small><b style="font-size:20px">${BANK}</b><span class="d muted">T+1 cycle · <a class="linkish" href="#/settings">Manage</a></span></div></div>`;
  }

  function toolbar(){
    const n = st.status.length;
    return `<div class="toolbar">
      <div class="searchbox"><select id="ssf">${FIELDS.map(([k, l]) => `<option value="${k}" ${k === st.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="ssq" placeholder="Search ${FIELDS.find(f => f[0] === st.field)[1]}" value="${esc(st.q)}"><button class="btn primary" id="ssgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="sfilter"><i data-icon=list-filter class=li></i> Status${n ? ` <span class="pill brand">${n}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-sfilter"><h6>Status</h6>${STATUSES.map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${st.status.includes(s) ? 'checked' : ''}>${s === 'PENDING' ? 'Pending (scheduled)' : 'Processed (paid out)'}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sfreset">Reset</button><button class="btn sm primary" id="sfapply">Apply</button></div></div></div>
      <span style="flex:1"></span>
      <span class="muted" style="font-size:13px">Paid T+1 to ${BANK}</span>
    </div>`;
  }

  function emptyState(){
    const any = all().length;
    return `<tr><td colspan="8"><div class="empty-state"><div class="box"><i data-icon=landmark class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO SETTLEMENTS FOUND</p>
      <h3 style="margin:4px 0 6px;font-size:20px">${any ? 'Nothing matches these filters' : 'No settlements yet'}</h3>
      <p class="muted" style="margin:0 0 12px">${any ? 'Clear the search or status filter, or widen the date range.' : 'Successful payments are settled to your bank account the next working day.'}</p>
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
        return `<tr class="click" data-sid="${s.id}"><td>${dayLabel(s.date)}<div class="muted" style="font-size:11.5px">${s.count} payments</div></td><td class="mono">${s.id}</td><td class="mono">${s.status === 'PENDING' ? '<span class="muted">Awaiting payout</span>' : s.utr}</td>
          <td class="right">${inr(s.gross)}</td><td class="right muted">${inr(-(s.fee + s.tax))}</td><td class="right ${a ? '' : 'muted'}">${a ? inr(-a) : '—'}${note}</td><td class="right"><b>${inr(s.net)}</b></td><td>${statusPill(s.status)}</td></tr>`;
      }).join('') : emptyState()}</tbody></table></div>` + pager(list.length);
  }

  function feeBreakdown(){
    const recent = all().filter(s => s.date.getTime() >= now.getTime() - 7 * 864e5), ids = new Set(recent.flatMap(s => s.txnids));
    const by = {};
    D().filter(t => ids.has(t.txnid)).forEach(t => { const m = by[t.mode] || (by[t.mode] = { n: 0, gross: 0 }); m.n++; m.gross += t.amount; });
    const list = Object.entries(by).map(([mode, v]) => { const fee = Math.round(v.gross * .02); return { mode, ...v, fee, tax: Math.round(fee * .18) }; }).sort((a, b) => b.gross - a.gross);
    const tot = list.reduce((a, m) => a + m.fee + m.tax, 0), max = Math.max(1, ...list.map(m => m.fee + m.tax));
    const sum = k => list.reduce((a, m) => a + m[k], 0);
    return `<div class="card"><div class="between" style="margin-bottom:6px;flex-wrap:wrap"><h3 style="margin:0">Fees by payment mode · last 7 days</h3><span class="muted" style="font-size:13px">${recent.length} settlements · ${ids.size} payments</span></div>
      ${list.length ? `<div class="stl-fees"><table style="margin-top:6px"><thead><tr><th>Payment mode</th><th class="right">Payments</th><th class="right">Gross</th><th class="right">Fee (2%)</th><th class="right">GST (18%)</th><th style="width:28%">Share of fees</th></tr></thead><tbody>
        ${list.map(m => `<tr><td>${m.mode}</td><td class="right">${m.n}</td><td class="right">${inr(m.gross)}</td><td class="right">${inr(m.fee)}</td><td class="right">${inr(m.tax)}</td>
          <td><div class="hbar" style="grid-template-columns:1fr 40px;margin:0"><div class="t"><i style="width:${((m.fee + m.tax) / max * 100).toFixed(1)}%"></i></div><span class="muted right">${tot ? Math.round((m.fee + m.tax) / tot * 100) : 0}%</span></div></td></tr>`).join('')}
        <tr><td><b>Total</b></td><td class="right"><b>${sum('n')}</b></td><td class="right"><b>${inr(sum('gross'))}</b></td><td class="right"><b>${inr(sum('fee'))}</b></td><td class="right"><b>${inr(sum('tax'))}</b></td><td></td></tr></tbody></table></div>`
        : '<p class="muted">No settled payments in the last 7 days.</p>'}
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">Fees here are computed per mode; settlement totals are rounded per settlement and can differ by a few paise.</p></div>`;
  }

  function schedule(){
    const next = all().find(s => s.status === 'PENDING');
    const nextAt = next ? payoutAt(next.date) : payoutAt(new Date(now.getTime() + 864e5));
    return `<div class="card"><h3>Settlement schedule</h3>
      <div class="stl-sched"><span class="n">T</span><div><p><b>Payment captured</b></p><small>Successful payments are grouped by capture day</small></div></div>
      <div class="stl-sched"><span class="n">+1</span><div><p><b>Settled next working day</b></p><small>Net of 2% fee, 18% GST on the fee and processed refunds</small></div></div>
      <div class="stl-sched"><span class="n">₹</span><div><p><b>Next payout</b> · ${next ? inr(next.net) : '—'}</p><small>${dayLabel(nextAt)}, by 11:00 AM</small></div></div>
      <dl class="kv" style="margin:8px 0 14px;grid-template-columns:110px 1fr"><dt>Bank account</dt><dd>${BANK}</dd><dt>Cycle</dt><dd>T+1 (working days)</dd><dt>Shortfalls</dt><dd style="word-break:normal">Carried to the next settlement, never debited</dd></dl>
      <a class="btn" href="#/settings" style="margin-top:auto;align-self:flex-start">Manage in Settings <i data-icon=chevron-right class=li></i></a></div>`;
  }

  function csvFor(list){
    return 'settlement_date,settlement_id,utr,payments,gross,fee,gst,refunds,carried_in,carried_out,net,status\n' +
      list.map(s => [s.date.toISOString().slice(0, 10), s.id, s.status === 'PENDING' ? '' : s.utr, s.count, rupees(s.gross), rupees(s.fee), rupees(s.tax), rupees(s.ref), rupees(s.carriedIn), rupees(s.carriedOut), rupees(s.net), s.status].join(',')).join('\n') + '\n';
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

  function lines(s){
    return [['Gross collections', s.gross], ['Gateway fee (2%)', -s.fee], ['GST on fee (18%)', -s.tax], ['Refunds adjusted', -s.ref],
      ['Carried in from previous settlement', -s.carriedIn], ['Shortfall carried forward', s.carriedOut]];
  }
  function drawer(id){
    const s = all().find(x => x.id === id), txns = D().filter(t => s.txnids.includes(t.txnid));
    const cap = new Date(s.date.getTime() - 864e5), refs = refunds[state.mode].filter(r => r.status === 'SUCCESS' && r.date.toDateString() === cap.toDateString());
    openDrawer(`<div class="between"><h2 style="margin:0">${inr(s.net)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${statusPill(s.status)} <span class="muted">${s.id} · ${s.status === 'PENDING' ? `expected ${dayLabel(s.date)}, by 11:00 AM` : `paid ${dayLabel(s.date)}`}</span></p>
      ${s.carriedOut ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px;font-size:13.5px"><b>Nothing paid out.</b> Refunds exceeded this day's collections; ${inr(s.carriedOut)} is deducted from the next settlement.</div>` : ''}
      <h3>Breakdown</h3>
      <dl class="stl-lines">${lines(s).map(([l, v]) => `<dt class="${v ? '' : 'muted'}">${l}</dt><dd class="${v ? '' : 'muted'}">${v ? inr(v) : '—'}</dd>`).join('')}<dt class="tot">Net settled</dt><dd class="tot">${inr(s.net)}</dd></dl>
      <h3 style="margin-top:18px">Payout</h3>
      <dl class="kv"><dt>UTR</dt><dd class="mono">${s.status === 'PENDING' ? 'Issued when paid out' : `${s.utr} <button class="linkish" id="sutr" style="margin-left:6px">Copy</button>`}</dd><dt>Bank account</dt><dd>${BANK}</dd><dt>Captured on</dt><dd>${dayLabel(cap)}</dd>${refs.length ? `<dt>Refunds adjusted</dt><dd>${refs.map(r => `<span class="mono">${r.id}</span>`).join(', ')}</dd>` : ''}</dl>
      <h3 style="margin-top:18px">Included payments (${txns.length})</h3>
      <div class="stl-txns">${txns.map(t => `<div><span><span class="mono">${t.txnid}</span><span class="muted" style="font-size:12px"> · ${esc(t.name)}</span></span><span class="muted">${t.mode}</span><b>${inr(t.amount)}</b></div>`).join('')}</div>
      <div class="row" style="margin-top:18px"><button class="btn primary" id="sreport" style="flex-basis:100%"><i data-icon=download class=li></i> Download settlement report</button><a class="btn" href="#/transactions">View transactions</a></div>`);
    const c = $('#sutr'); if (c) c.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(s.utr); toast('UTR copied'); };
    $('#sreport').onclick = () => {
      const csv = `settlement_id,${s.id}\nutr,${s.status === 'PENDING' ? '' : s.utr}\nstatus,${s.status}\nsettlement_date,${s.date.toISOString().slice(0, 10)}\n\nline,amount\n` +
        lines(s).map(([l, v]) => `${l},${rupees(v)}`).join('\n') + `\nNet settled,${rupees(s.net)}\n\ntxnid,payment_mode,customer,amount\n` +
        txns.map(t => [t.txnid, t.mode, `"${t.name}"`, rupees(t.amount)].join(',')).join('\n') + '\n';
      download(`bizpolepay-${s.id}.csv`, csv); toast(`Settlement report for ${s.id} downloaded`);
    };
  }
})();

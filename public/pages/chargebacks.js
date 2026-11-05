// Page: chargebacks. Uses globals from app.html core (state, api, LOAD, helpers, PAGES, BIND).
/* ---- Chargebacks ---- */
(() => {
  const PAGE = 10;
  const H = 3600e3, DAY = 864e5;
  const RANGES = [['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['90d', 'Last 90 days', 90]];
  const FIELDS = [['caseId', 'Case ID'], ['txnid', 'Transaction ID'], ['mihpayid', 'Payment ID']];
  // Dispute lifecycle from the payment partner (enum ChargebackStatus). "act" = merchant must respond.
  const ST = {
    NEW: ['New', 'warn', true],
    PENDING_RESPONSE: ['Pending response', 'warn', true],
    PENDING_DOC_REVIEW: ['Pending doc review', '', false],
    SUBMITTED_TO_BANK: ['Submitted to bank', '', false],
    INSUFFICIENT_DOCUMENT: ['Insufficient document', 'bad', true],
    WON: ['Won · merchant favour', 'ok', false],
    LOST: ['Lost · customer favour', 'bad', false],
    FRAUD_LIABILITY: ['Closed · fraud liability', 'bad', false],
    ACCEPTED: ['Accepted by you', 'bad', false],
    OTHER: ['Other', '', false],
  };
  const CLOSED = ['WON', 'LOST', 'FRAUD_LIABILITY', 'ACCEPTED'];
  const NETWORK = { 'Credit Card': 'Card network', 'Debit Card': 'Card network', EMI: 'Card network', UPI: 'NPCI (UPI)', 'Net Banking': 'Issuer bank', Wallet: 'Wallet issuer' };
  // Reason codes about unauthorised use: proof of authorisation beats proof of delivery.
  const AUTH_CODES = ['10.4', '4837', 'NB05'];
  const cases = { test: [], live: [] };
  const st = { range: '30d', field: 'caseId', q: '', status: [], page: 1, sort: { key: 'raised', dir: -1 } };

  const shape = c => ({ ...c, raised: new Date(c.raised), respondBy: toDate(c.respondBy), txnDate: toDate(c.txnDate), network: NETWORK[c.mode] || c.mode,
    timeline: (c.timeline || []).map(([d, t, n]) => [new Date(d), t, n]) });
  LOAD.chargebacks = async (mode) => { cases[mode] = (await api('/chargebacks', { mode })).map(shape); };
  const all = () => cases[state.mode] || [];

  const stOf = s => ST[s] || [String(s || '').replace(/_/g, ' ').toLowerCase(), '', false];
  const isOpen = c => !CLOSED.includes(c.status), needsAction = c => stOf(c.status)[2];
  const pill = s => `<span class="pill ${stOf(s)[1]}">${stOf(s)[0]}</span>`;
  const rangeDays = () => RANGES.find(r => r[0] === st.range)[2];
  const inRange = c => c.raised.getTime() >= now.getTime() - rangeDays() * DAY;
  // No reply-by date from the payment partner → no deadline shown (never guessed).
  const dueIn = c => c.respondBy ? c.respondBy.getTime() - Date.now() : Infinity;
  const dueLabel = c => { if (!c.respondBy) return 'date not given'; const ms = dueIn(c); if (ms <= 0) return 'Overdue'; const h = Math.floor(ms / H); return h < 48 ? `in ${h} h` : `in ${Math.floor(h / 24)} days`; };
  const dayLabel = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const rows = () => {
    const q = st.q.trim().toLowerCase();
    return all().filter(c => inRange(c) && (!st.status.length || st.status.includes(c.status)) && (!q || String(c[st.field]).toLowerCase().includes(q)))
      .sort((a, b) => st.sort.dir * (st.sort.key === 'amount' ? a.amount - b.amount : st.sort.key === 'due' ? (a.respondBy || 0) - (b.respondBy || 0) : a.raised - b.raised));
  };
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);

  addStyle('chargebacks', `
    .cb-tl{position:relative;margin:6px 0 0 6px;padding-left:18px;border-left:2px solid var(--line)}
    .cb-tl div{position:relative;margin:0 0 12px;font-size:13px}
    .cb-tl div:before{content:"";position:absolute;left:-24px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--brand)}
    .cb-tl div.last:before{background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft, var(--soft))}
    .cb-tl small{display:block;color:var(--muted);font-size:12px}
    .cb-ev{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;margin:6px 0;font-size:13px}
    .cb-ev .ic{width:30px;height:30px;border-radius:8px;background:var(--soft);display:grid;place-items:center}
    .cb-due{font-size:11.5px;font-weight:600}
    .cb-err{color:var(--bad);font-size:12px;margin:4px 0 0;display:none}
    .cb-err.on{display:block}
    .cb-warn{background:var(--warn-soft);color:var(--ink)}
    .cb-list{margin:8px 0 0;padding-left:18px;font-size:13.5px}
    .cb-list li{margin:4px 0}
    .cb-guide{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px}
    @media (max-width:1000px){.cb-guide{grid-template-columns:1fr 1fr}}
    @media (max-width:820px){.cb-guide{grid-template-columns:1fr}}
  `);

  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-sort="${key}">${label} <span class="muted">${st.sort.key === key ? (st.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;

  function kpis(){
    const list = all().filter(inRange), open = list.filter(isOpen), urgent = open.filter(c => needsAction(c) && dueIn(c) < 48 * H);
    const won = list.filter(c => c.status === 'WON').length, lost = list.filter(c => ['LOST', 'FRAUD_LIABILITY', 'ACCEPTED'].includes(c.status)).length;
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Open cases</small><b>${open.length}</b><span class="d muted">${open.filter(needsAction).length} need your response</span></div>
      <div class="card kpi"><small>Amount at risk</small><b>${inr(open.reduce((a, c) => a + c.amount, 0))}</b><span class="d muted">Held from settlements until closed</span></div>
      <div class="card kpi"><small>Respond within 48 h</small><b style="${urgent.length ? 'color:var(--bad)' : ''}">${urgent.length}</b><span class="d muted">${urgent.length ? `Next due ${dueLabel(urgent.sort((a, b) => a.respondBy - b.respondBy)[0])}` : 'No urgent deadlines'}</span></div>
      <div class="card kpi"><small>Win rate</small><b>${won + lost ? Math.round(won / (won + lost) * 100) + '%' : '—'}</b><span class="d muted">${won} won · ${lost} lost (closed cases)</span></div></div>`;
  }

  function toolbar(){
    const n = st.status.length;
    return `<div class="toolbar">
      <div class="searchbox"><select id="cbf">${FIELDS.map(([k, l]) => `<option value="${k}" ${k === st.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="cbq" placeholder="Search ${FIELDS.find(f => f[0] === st.field)[1]}" value="${esc(st.q)}"><button class="btn primary" id="cbgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="cbrange"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === st.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-cbrange">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === st.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="cbfilter"><i data-icon=list-filter class=li></i> Status${n ? ` <span class="pill brand">${n}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-cbfilter"><h6>Status</h6>${Object.keys(ST).filter(s => s !== 'OTHER').map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${st.status.includes(s) ? 'checked' : ''}>${ST[s][0]}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="cbreset">Reset</button><button class="btn sm primary" id="cbapply">Apply</button></div></div></div>
      <button class="btn" id="cbneeds"><i data-icon=flag class=li></i> Needs response</button>
      <span style="flex:1"></span>
      <button class="btn" id="cbdl"><i data-icon=download class=li></i> Download</button>
    </div>`;
  }

  function emptyState(){
    const any = all().length;
    return `<tr><td colspan="8"><div class="empty-state"><div class="box">${any ? '🔎' : '🛡'}</div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">${any ? 'NO RESULTS FOUND' : 'NO DISPUTES'}</p>
      <h3 style="margin:4px 0 6px;font-size:20px">${any ? 'No chargebacks match these filters' : 'No chargebacks so far'}</h3>
      <p class="muted" style="margin:0 0 12px">${any ? 'Clear the search or status filter, or widen the date range.' : 'When a customer disputes a payment with their bank, the case shows up here with a response deadline.'}</p>
      <div class="row" style="gap:8px">${any ? '<button class="btn sm" id="cbeclear">Clear filters</button><button class="btn sm" id="cbe90">Show last 90 days</button>' : '<a class="btn sm" href="#/transactions">View transactions</a>'}</div></div></div></td></tr>`;
  }

  function pager(total){
    const pages = Math.max(1, Math.ceil(total / PAGE)), from = total ? (st.page - 1) * PAGE + 1 : 0, to = Math.min(total, st.page * PAGE);
    return total ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${total}</span>
      <span class="pager"><button class="btn sm" data-pg="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === st.page ? 'primary' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="btn sm" data-pg="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
  }

  const codeLine = c => `${esc(c.network)}${c.code ? ` · code ${esc(c.code)}` : ''}`;

  function table(list){
    const pages = Math.max(1, Math.ceil(list.length / PAGE)); st.page = Math.min(st.page, pages);
    return `<div class="tbl-wrap"><table><thead><tr>${sortHead('raised', 'Raised')}<th>Case ID</th><th>Payment ID (Transaction ID)</th><th>Reason</th><th>Customer</th>${sortHead('amount', 'Disputed', 'right')}${sortHead('due', 'Respond by')}<th>Status</th></tr></thead>
      <tbody>${list.length ? list.slice((st.page - 1) * PAGE, st.page * PAGE).map(c => {
        const urgent = needsAction(c) && dueIn(c) < 48 * H;
        return `<tr class="click" data-cid="${esc(c.id)}"><td>${fmtDate(c.raised)}</td><td class="mono">${esc(c.caseId)}</td><td><span class="mono">${esc(c.mihpayid)}</span><div class="mono muted" style="font-size:11.5px">${esc(c.txnid)}</div></td>
          <td>${esc(c.reason)}<div class="muted" style="font-size:11.5px">${codeLine(c)}</div></td><td>${esc(c.name)}<div class="muted" style="font-size:11.5px">${esc(c.mode)}</div></td><td class="right"><b>${inr(c.amount)}</b></td>
          <td>${needsAction(c) && c.respondBy ? `${dayLabel(c.respondBy)}<div class="cb-due" style="color:${urgent ? 'var(--bad)' : 'var(--warn)'}">Due ${dueLabel(c)}</div>` : '<span class="muted">—</span>'}</td><td>${pill(c.status)}</td></tr>`;
      }).join('') : emptyState()}</tbody></table></div>` + pager(list.length);
  }

  const guide = () => `<div class="cb-guide">
    ${[['1', 'Respond before the deadline', 'Cases without a response by the reply-by date close in the customer\'s favour.'], ['2', 'Send strong evidence', 'Invoice plus proof of delivery or service usage wins most disputes.'],
      ['3', 'Payment partner reviews first', 'Documents are checked before going to the bank; you may be asked for more.'], ['4', 'Bank decides', 'Issuing banks take up to 45 days. Held funds are released if you win.']]
      .map(([n, t, p]) => `<div class="card tile"><div class="ic">${n}</div><div><b>${t}</b><p>${p}</p></div></div>`).join('')}</div>`;

  PAGES.chargebacks = () => {
    if (liveLocked()) return head('Chargebacks') + locked('Chargebacks');
    return head('Chargebacks', 'Payments your customers disputed through their bank. Respond before the deadline to keep the money.',
      `<a class="btn" href="#/reports"><i data-icon=file-text class=li></i> Chargeback reports</a>`) + `<div id="cbview"></div>`;
  };

  function render(){
    $('#cbview').innerHTML = kpis() + toolbar() + table(rows()) + guide();
    bind();
  }

  const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  function bind(){
    document.querySelectorAll('[data-dd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#dd-' + b.dataset.dd), open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); });
    document.querySelectorAll('.menu').forEach(m => m.onclick = e => e.stopPropagation());
    $('#cbf').onchange = e => { st.field = e.target.value; st.q = ''; render(); };
    const search = () => { st.q = $('#cbq').value; st.page = 1; render(); };
    $('#cbgo').onclick = search;
    $('#cbq').onkeydown = e => { if (e.key === 'Enter') search(); };
    document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { st.range = b.dataset.range; st.page = 1; render(); });
    $('#cbapply').onclick = () => { st.status = [...document.querySelectorAll('[data-fs]:checked')].map(x => x.dataset.fs); st.page = 1; render(); };
    $('#cbreset').onclick = () => { st.status = []; st.page = 1; render(); };
    $('#cbneeds').onclick = () => { st.status = Object.keys(ST).filter(s => ST[s][2]); st.page = 1; render(); };
    $('#cbdl').onclick = () => {
      const list = rows();
      if (!list.length) return toast('No chargebacks to download for these filters');
      const csv = 'case_id,raised,txnid,payment_id,reason_code,reason,amount,respond_by,status\n' +
        list.map(c => [c.caseId, c.raised.toISOString(), c.txnid, c.mihpayid, c.code, c.reason, (c.amount / 100).toFixed(2), c.respondBy ? c.respondBy.toISOString() : '', c.status].map(csvCell).join(',')).join('\n') + '\n';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `bizpolepay-chargebacks-${st.range}.csv`; a.click();
      toast(`Downloaded ${list.length} cases`);
    };
    document.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { const key = h.dataset.sort; st.sort = { key, dir: st.sort.key === key ? -st.sort.dir : -1 }; render(); });
    document.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { st.page = +b.dataset.pg; render(); });
    document.querySelectorAll('tr[data-cid]').forEach(r => r.onclick = () => drawer(r.dataset.cid));
    if ($('#cbeclear')) { $('#cbeclear').onclick = () => { st.status = []; st.q = ''; render(); }; $('#cbe90').onclick = () => { st.range = '90d'; render(); }; }
  }

  BIND.chargebacks = () => { if (!liveLocked()) render(); };

  const refresh = id => { if ($('#cbview')) render(); if (id) drawer(id); };

  function drawer(id){
    const c = all().find(x => x.id === id);
    if (!c) return;
    const act = needsAction(c);
    openDrawer(`<div class="between"><h2 style="margin:0">${inr(c.amount)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(c.status)} <span class="muted">${esc(c.caseId)} · raised ${fmtDate(c.raised)}</span></p>
      ${act ? `<div class="card" style="background:${dueIn(c) < 48 * H ? 'var(--bad-soft)' : 'var(--warn-soft)'};border-color:transparent;margin-bottom:14px;font-size:13.5px"><b>${c.respondBy ? `Respond by ${dayLabel(c.respondBy)} (${dueLabel(c)}).` : 'Response needed.'}</b> ${c.status === 'INSUFFICIENT_DOCUMENT' ? 'The payment partner needs more documents before this can go to the bank.' : 'Accept the chargeback or contest it with evidence.'}</div>` : ''}
      <h3>Dispute</h3><dl class="kv"><dt>Case ID</dt><dd class="mono">${esc(c.caseId)}</dd>${c.bankCaseNo ? `<dt>Bank case no.</dt><dd class="mono">${esc(c.bankCaseNo)}</dd>` : ''}<dt>Reason</dt><dd>${esc(c.reason)}</dd><dt>Reason code</dt><dd class="mono">${c.code ? codeLine(c) : '—'}</dd><dt>Disputed amount</dt><dd>${inr(c.amount)}</dd><dt>Respond by</dt><dd>${act && c.respondBy ? dayLabel(c.respondBy) : '—'}</dd>${c.debitStatus ? `<dt>Debit status</dt><dd>${esc(c.debitStatus)}</dd>` : ''}</dl>
      <h3 style="margin-top:18px">Original payment</h3><dl class="kv"><dt>Txn ID</dt><dd class="mono">${esc(c.txnid)}</dd><dt>Payment ID</dt><dd class="mono">${esc(c.mihpayid)}</dd><dt>Customer</dt><dd>${esc(c.name)}</dd><dt>Mode</dt><dd>${esc(c.mode)}</dd><dt>Paid on</dt><dd>${c.txnDate ? fmtDate(c.txnDate) : '—'}</dd></dl>
      <h3 style="margin-top:18px">Timeline</h3><div class="cb-tl">${c.timeline.map((e, i) => `<div class="${i === c.timeline.length - 1 ? 'last' : ''}"><b>${esc(e[1])}</b><small>${fmtDate(e[0])}${e[2] ? ' · ' + esc(e[2]) : ''}</small></div>`).join('')}</div>
      <h3 style="margin-top:10px">Evidence (${c.evidence.length})</h3>
      ${c.evidence.length ? c.evidence.map(f => `<div class="cb-ev"><span class="ic"><i data-icon=file class=li></i></span><div style="flex:1;min-width:0"><b style="word-break:break-all">${esc(f.name)}</b></div></div>`).join('') : '<p class="muted" style="font-size:13px;margin:4px 0">No documents submitted yet.</p>'}
      <div class="row" style="margin-top:20px">
        ${act ? `<button class="btn primary" id="cbcontest">Contest with evidence</button><button class="btn danger" id="cbaccept">Accept chargeback</button>` : ''}
        <button class="btn" id="cbcopy">Copy case ID</button></div>`);
    $('#cbcopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(c.caseId); toast('Case ID copied'); };
    if (act) { $('#cbcontest').onclick = () => contest(c); $('#cbaccept').onclick = () => accept(c); }
  }

  function accept(c){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Accept ${esc(c.caseId)}?</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">You won't contest this dispute. <b style="color:var(--ink)">${inr(c.amount)}</b> goes back to ${esc(c.name)} and is deducted from your settlements. This can't be undone.</p>
      <div class="notice cb-warn" style="font-size:13px">This marks the case as accepted in your dashboard. Sending the acceptance to the payment partner isn't connected yet, so also ask Bizpole support to accept case ${esc(c.caseId)} before the deadline.</div>
      <div class="row" style="margin-top:14px"><button class="btn" id="cbback">Go back</button><button class="btn primary" id="cbyes" style="background:var(--bad);border-color:var(--bad)">Accept chargeback</button></div>`);
    $('#cbback').onclick = () => drawer(c.id);
    $('#cbyes').onclick = async () => {
      const b = $('#cbyes'); b.disabled = true;
      try {
        const out = shape(await api(`/chargebacks/${encodeURIComponent(c.id)}/accept`, { method: 'POST' }));
        const list = all(), i = list.findIndex(x => x.id === c.id); if (i >= 0) list[i] = out;
        closeAll(); toast(`${c.caseId} accepted here · confirm it with Bizpole support too`); refresh(c.id);
      } catch (e) { b.disabled = false; apiFail(e); }
    };
  }

  // Evidence upload needs document storage and the payment partner's dispute API; neither is connected,
  // so this explains what to send and where instead of pretending to upload.
  function contest(c){
    const auth = AUTH_CODES.includes(c.code);
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Contest ${esc(c.caseId)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin:6px 0 0;font-size:13px">${esc(c.reason)}${c.code ? ` · ${codeLine(c)}` : ''} · ${inr(c.amount)}</p>
      <div class="notice cb-warn" style="font-size:13px;margin-top:12px">Uploading evidence from this dashboard isn't available yet. Send your documents to Bizpole support for case <b class="mono">${esc(c.caseId)}</b>${c.respondBy ? ` before ${dayLabel(c.respondBy)}` : ' as soon as possible'}.</div>
      <h3 style="margin:14px 0 0;font-size:15px">What to send</h3>
      <ul class="cb-list"><li>Invoice or order receipt for transaction <span class="mono">${esc(c.txnid)}</span></li>
        <li>${auth ? 'Proof of authorisation (OTP / 3-D Secure log)' : 'Proof of delivery or service usage'}</li>
        <li>Any customer communication about the order <span class="muted">(optional)</span></li>
        <li>A short note explaining why the charge is valid</li></ul>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">PDF, JPG or PNG, up to 5 MB each.</p>
      <div class="row" style="margin-top:14px"><button class="btn" id="cbcancel">Back</button><button class="btn primary" id="cbcopy2">Copy case ID</button></div>`);
    $('#cbcancel').onclick = () => drawer(c.id);
    $('#cbcopy2').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(c.caseId); toast('Case ID copied'); };
  }
})();

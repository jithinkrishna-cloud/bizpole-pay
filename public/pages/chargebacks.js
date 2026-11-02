// Page: chargebacks. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Chargebacks ---- */
(() => {
  const PAGE = 10;
  const H = 3600e3, DAY = 864e5;
  const RANGES = [['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['90d', 'Last 90 days', 90]];
  const FIELDS = [['id', 'Case ID'], ['txnid', 'Transaction ID'], ['mihpayid', 'PayU ID']];
  // PayU-style dispute lifecycle. "act" = merchant must respond.
  const ST = {
    NEW: ['New', 'warn', true],
    PENDING_RESPONSE: ['Pending response', 'warn', true],
    PENDING_DOC_REVIEW: ['Pending doc review', '', false],
    SUBMITTED_TO_BANK: ['Submitted to bank', '', false],
    INSUFFICIENT_DOC: ['Insufficient document', 'bad', true],
    WON: ['Won · merchant favour', 'ok', false],
    LOST: ['Lost · customer favour', 'bad', false],
  };
  const CLOSED = ['WON', 'LOST'];
  // Reason codes per payment rail: card network codes, NPCI UPI codes, issuer/wallet dispute codes.
  const REASONS = {
    Card: [['13.1', 'Merchandise / services not received'], ['10.4', 'Fraud · card-absent environment'], ['12.6', 'Duplicate processing'], ['13.3', 'Not as described or defective'], ['13.7', 'Cancelled merchandise / services'], ['4837', 'No cardholder authorisation']],
    UPI: [['U008', 'Paid, but goods or services not provided'], ['U010', 'Credit not processed for cancelled order'], ['U005', 'Customer account debited, merchant not credited'], ['U021', 'Duplicate debit']],
    Other: [['NB02', 'Goods or services not received'], ['NB05', 'Unauthorised debit'], ['NB07', 'Refund not processed']],
  };
  const rail = m => m === 'UPI' ? 'UPI' : ['Credit Card', 'Debit Card', 'EMI'].includes(m) ? 'Card' : 'Other';
  const NETWORK = { 'Credit Card': 'Visa', 'Debit Card': 'RuPay', EMI: 'Mastercard', UPI: 'NPCI (UPI)', 'Net Banking': 'Issuer bank', Wallet: 'Wallet issuer' };
  // [status, raised days ago, reason index]
  const SEED = [['NEW', .3, 0], ['PENDING_RESPONSE', 5.4, 5], ['INSUFFICIENT_DOC', 6.3, 3], ['NEW', 1.2, 1], ['PENDING_RESPONSE', 2.5, 6], ['PENDING_DOC_REVIEW', 4, 2],
    ['SUBMITTED_TO_BANK', 6.8, 4], ['SUBMITTED_TO_BANK', 7.6, 7], ['WON', 8.2, 0], ['WON', 8.6, 3], ['LOST', 8.9, 1], ['WON', 7.2, 5]];
  const cache = {};
  const st = { range: '30d', field: 'id', q: '', status: [], page: 1, sort: { key: 'raised', dir: -1 } };

  function build(mode){
    const used = new Set(refunds[mode].map(r => r.txnid)), ok = data[mode].filter(t => t.status === 'SUCCESS');
    const out = [];
    SEED.forEach(([status, ago, ri], i) => {
      const raised = new Date(now - ago * DAY), t = ok.find(x => !used.has(x.txnid) && x.date < raised - 18 * H && (i % 2 ? x.amount > 150000 : true));
      if (!t) return; used.add(t.txnid);
      const list = REASONS[rail(t.mode)], [code, reason] = list[ri % list.length];
      const respondBy = new Date(raised.getTime() + 7 * DAY);
      const tl = [[raised, 'Chargeback raised by issuing bank', `${reason} (${code})`], [new Date(raised.getTime() + 2 * H), 'Case opened by PayU', 'Amount put on hold from settlements']];
      const ev = [];
      if (['PENDING_DOC_REVIEW', 'SUBMITTED_TO_BANK', 'INSUFFICIENT_DOC', 'WON'].includes(status)) {
        ev.push({ name: `invoice-${t.txnid}.pdf`, kind: 'Invoice' }, { name: 'delivery-proof.pdf', kind: 'Proof of delivery' });
        tl.push([new Date(raised.getTime() + 1.6 * DAY), 'Evidence submitted by you', '2 documents']);
      }
      if (status === 'INSUFFICIENT_DOC') tl.push([new Date(raised.getTime() + 2.5 * DAY), 'PayU asked for more documents', 'Proof of delivery must show the customer signature or OTP']);
      if (['SUBMITTED_TO_BANK', 'WON'].includes(status)) tl.push([new Date(raised.getTime() + 2.6 * DAY), 'Documents reviewed and sent to the bank', 'Bank decision usually takes up to 45 days']);
      if (status === 'WON') tl.push([new Date(raised.getTime() + 6 * DAY), 'Closed in your favour', 'Held amount released to the next settlement']);
      if (status === 'LOST') tl.push([new Date(raised.getTime() + 7 * DAY), 'Closed in customer favour', 'No response before the deadline · amount debited']);
      out.push({ id: 'CB' + (3310 - i * 3), txnid: t.txnid, mihpayid: t.mihpayid, name: t.name, mode: t.mode, amount: t.amount, txnDate: t.date,
        code, reason, network: NETWORK[t.mode] || t.mode, raised, respondBy, status,
        timeline: tl.filter(x => x[0] <= now), evidence: ev, note: '' });
    });
    return out;
  }
  const all = () => cache[state.mode] || (cache[state.mode] = build(state.mode));
  window.chargebacks_list = all; // used by Reports for the Chargebacks export

  const isOpen = c => !CLOSED.includes(c.status), needsAction = c => ST[c.status][2];
  const pill = s => `<span class="pill ${ST[s][1]}">${ST[s][0]}</span>`;
  const rangeDays = () => RANGES.find(r => r[0] === st.range)[2];
  const inRange = c => c.raised.getTime() >= now.getTime() - rangeDays() * DAY;
  const dueIn = c => c.respondBy.getTime() - Date.now();
  const dueLabel = c => { const ms = dueIn(c); if (ms <= 0) return 'Overdue'; const h = Math.floor(ms / H); return h < 48 ? `in ${h} h` : `in ${Math.floor(h / 24)} days`; };
  const dayLabel = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rows = () => {
    const q = st.q.trim().toLowerCase();
    return all().filter(c => inRange(c) && (!st.status.length || st.status.includes(c.status)) && (!q || String(c[st.field]).toLowerCase().includes(q)))
      .sort((a, b) => st.sort.dir * (st.sort.key === 'amount' ? a.amount - b.amount : st.sort.key === 'due' ? a.respondBy - b.respondBy : a.raised - b.raised));
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
    .cb-guide{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px}
    @media (max-width:1000px){.cb-guide{grid-template-columns:1fr 1fr}}
    @media (max-width:820px){.cb-guide{grid-template-columns:1fr}}
  `);

  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-sort="${key}">${label} <span class="muted">${st.sort.key === key ? (st.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;

  function kpis(){
    const list = all().filter(inRange), open = list.filter(isOpen), urgent = open.filter(c => needsAction(c) && dueIn(c) < 48 * H);
    const won = list.filter(c => c.status === 'WON').length, lost = list.filter(c => c.status === 'LOST').length;
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Open cases</small><b>${open.length}</b><span class="d muted">${open.filter(needsAction).length} need your response</span></div>
      <div class="card kpi"><small>Amount at risk</small><b>${inr(open.reduce((a, c) => a + c.amount, 0))}</b><span class="d muted">Held from settlements until closed</span></div>
      <div class="card kpi"><small>Respond within 48 h</small><b style="${urgent.length ? 'color:var(--bad)' : ''}">${urgent.length}</b><span class="d muted">${urgent.length ? `Next due ${dueLabel(urgent.sort((a, b) => a.respondBy - b.respondBy)[0])}` : 'No urgent deadlines'}</span></div>
      <div class="card kpi"><small>Win rate</small><b>${won + lost ? Math.round(won / (won + lost) * 100) : 0}%</b><span class="d muted">${won} won · ${lost} lost (closed cases)</span></div></div>`;
  }

  function toolbar(){
    const n = st.status.length;
    return `<div class="toolbar">
      <div class="searchbox"><select id="cbf">${FIELDS.map(([k, l]) => `<option value="${k}" ${k === st.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="cbq" placeholder="Search ${FIELDS.find(f => f[0] === st.field)[1]}" value="${esc(st.q)}"><button class="btn primary" id="cbgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="cbrange"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === st.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-cbrange">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === st.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="cbfilter"><i data-icon=list-filter class=li></i> Status${n ? ` <span class="pill brand">${n}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-cbfilter"><h6>Status</h6>${Object.keys(ST).map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${st.status.includes(s) ? 'checked' : ''}>${ST[s][0]}</label>`).join('')}
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

  function table(list){
    const pages = Math.max(1, Math.ceil(list.length / PAGE)); st.page = Math.min(st.page, pages);
    return `<div class="tbl-wrap"><table><thead><tr>${sortHead('raised', 'Raised')}<th>Case ID</th><th>PayU ID (Transaction ID)</th><th>Reason</th><th>Customer</th>${sortHead('amount', 'Disputed', 'right')}${sortHead('due', 'Respond by')}<th>Status</th></tr></thead>
      <tbody>${list.length ? list.slice((st.page - 1) * PAGE, st.page * PAGE).map(c => {
        const urgent = needsAction(c) && dueIn(c) < 48 * H;
        return `<tr class="click" data-cid="${c.id}"><td>${fmtDate(c.raised)}</td><td class="mono">${c.id}</td><td><span class="mono">${c.mihpayid}</span><div class="mono muted" style="font-size:11.5px">${c.txnid}</div></td>
          <td>${esc(c.reason)}<div class="muted" style="font-size:11.5px">${c.network} · code ${c.code}</div></td><td>${esc(c.name)}<div class="muted" style="font-size:11.5px">${c.mode}</div></td><td class="right"><b>${inr(c.amount)}</b></td>
          <td>${needsAction(c) ? `${dayLabel(c.respondBy)}<div class="cb-due" style="color:${urgent ? 'var(--bad)' : 'var(--warn)'}">Due ${dueLabel(c)}</div>` : '<span class="muted">—</span>'}</td><td>${pill(c.status)}</td></tr>`;
      }).join('') : emptyState()}</tbody></table></div>` + pager(list.length);
  }

  const guide = () => `<div class="cb-guide">
    ${[['1', 'Respond in 7 days', 'Cases without a response by the deadline close in the customer\'s favour.'], ['2', 'Send strong evidence', 'Invoice plus proof of delivery or service usage wins most disputes.'],
      ['3', 'PayU reviews first', 'Documents are checked before going to the bank; you may be asked for more.'], ['4', 'Bank decides', 'Issuing banks take up to 45 days. Held funds are released if you win.']]
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
      const list = rows(), csv = 'case_id,raised,txnid,payu_id,reason_code,reason,amount,respond_by,status\n' +
        list.map(c => [c.id, c.raised.toISOString(), c.txnid, c.mihpayid, c.code, `"${c.reason}"`, (c.amount / 100).toFixed(2), needsAction(c) ? c.respondBy.toISOString() : '', c.status].join(',')).join('\n') + '\n';
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
    const c = all().find(x => x.id === id), act = needsAction(c);
    openDrawer(`<div class="between"><h2 style="margin:0">${inr(c.amount)}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(c.status)} <span class="muted">${c.id} · raised ${fmtDate(c.raised)}</span></p>
      ${act ? `<div class="card" style="background:${dueIn(c) < 48 * H ? 'var(--bad-soft)' : 'var(--warn-soft)'};border-color:transparent;margin-bottom:14px;font-size:13.5px"><b>Respond by ${dayLabel(c.respondBy)} (${dueLabel(c)}).</b> ${c.status === 'INSUFFICIENT_DOC' ? 'PayU needs more documents before this can go to the bank.' : 'Accept the chargeback or contest it with evidence.'}</div>` : ''}
      <h3>Dispute</h3><dl class="kv"><dt>Case ID</dt><dd class="mono">${c.id}</dd><dt>Reason</dt><dd>${esc(c.reason)}</dd><dt>Reason code</dt><dd class="mono">${c.network} · ${c.code}</dd><dt>Disputed amount</dt><dd>${inr(c.amount)}</dd><dt>Respond by</dt><dd>${act ? dayLabel(c.respondBy) : '—'}</dd></dl>
      <h3 style="margin-top:18px">Original payment</h3><dl class="kv"><dt>Txn ID</dt><dd class="mono">${c.txnid}</dd><dt>PayU ID</dt><dd class="mono">${c.mihpayid}</dd><dt>Customer</dt><dd>${esc(c.name)}</dd><dt>Mode</dt><dd>${c.mode}</dd><dt>Paid on</dt><dd>${fmtDate(c.txnDate)}</dd></dl>
      <h3 style="margin-top:18px">Timeline</h3><div class="cb-tl">${c.timeline.map((e, i) => `<div class="${i === c.timeline.length - 1 ? 'last' : ''}"><b>${e[1]}</b><small>${fmtDate(e[0])}${e[2] ? ' · ' + esc(e[2]) : ''}</small></div>`).join('')}</div>
      <h3 style="margin-top:10px">Evidence (${c.evidence.length})</h3>
      ${c.evidence.length ? c.evidence.map(f => `<div class="cb-ev"><span class="ic"><i data-icon=file class=li></i></span><div style="flex:1;min-width:0"><b style="word-break:break-all">${esc(f.name)}</b><div class="muted" style="font-size:12px">${esc(f.kind)}</div></div></div>`).join('') : '<p class="muted" style="font-size:13px;margin:4px 0">No documents submitted yet.</p>'}
      ${c.note ? `<p style="font-size:13px;margin:8px 0 0"><span class="muted">Your note:</span> ${esc(c.note)}</p>` : ''}
      <div class="row" style="margin-top:20px">
        ${act ? `<button class="btn primary" id="cbcontest">Contest with evidence</button><button class="btn danger" id="cbaccept">Accept chargeback</button>` : ''}
        <button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${c.id}');toast('Case ID copied')">Copy case ID</button></div>`);
    if (act) { $('#cbcontest').onclick = () => contest(c); $('#cbaccept').onclick = () => accept(c); }
  }

  function accept(c){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Accept ${c.id}?</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">You won't contest this dispute. <b style="color:var(--ink)">${inr(c.amount)}</b> will be returned to ${esc(c.name)} and deducted from your next settlement. This can't be undone.</p>
      <div class="row" style="margin-top:14px"><button class="btn" id="cbback">Go back</button><button class="btn primary" id="cbyes" style="background:var(--bad);border-color:var(--bad)">Accept chargeback</button></div>`);
    $('#cbback').onclick = () => drawer(c.id);
    $('#cbyes').onclick = () => {
      c.status = 'LOST'; c.timeline.push([new Date(), 'Accepted by you', 'Closed in customer favour · amount debited from next settlement']);
      closeAll(); toast(`${c.id} accepted · ${inr(c.amount)} will be debited`); refresh(c.id);
    };
  }

  function contest(c){
    const field = (id, label, req, hint) => `<label for="${id}">${label}${req ? ' <span style="color:var(--bad)">*</span>' : ' <span class="muted">(optional)</span>'}</label>
      <input type="file" id="${id}" accept=".pdf,.jpg,.jpeg,.png" ${id === 'cbfo' ? 'multiple' : ''}><p class="cb-err" id="${id}-e">${hint}</p>`;
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Contest ${c.id}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin:6px 0 0;font-size:13px">${esc(c.reason)} · ${c.network} code ${c.code} · ${inr(c.amount)}. PDF, JPG or PNG, up to 5 MB each.</p>
      ${field('cbfi', 'Invoice or order receipt', true, 'Attach the invoice for this order.')}
      ${field('cbfd', c.code === '10.4' || c.code === '4837' ? 'Proof of authorisation (OTP / 3-D Secure log)' : 'Proof of delivery or service usage', true, 'Attach proof for this reason code.')}
      ${field('cbfo', 'Customer communication', false, '')}
      <label for="cbnote">Note to the bank <span style="color:var(--bad)">*</span></label><textarea id="cbnote" rows="4" placeholder="Explain why the charge is valid: what was ordered, when it was delivered, and how the customer confirmed it."></textarea>
      <p class="cb-err" id="cbnote-e">Write at least 30 characters.</p><p class="cb-err" id="cbsize-e">Each file must be under 5 MB.</p>
      <div class="row" style="margin-top:14px"><button class="btn" id="cbcancel">Cancel</button><button class="btn primary" id="cbsend">Submit evidence</button></div>`);
    $('#cbcancel').onclick = () => drawer(c.id);
    $('#cbsend').onclick = () => {
      const files = ['cbfi', 'cbfd', 'cbfo'].map(id => [...$('#' + id).files]);
      const errs = { cbfi: !files[0].length, cbfd: !files[1].length, cbnote: $('#cbnote').value.trim().length < 30, cbsize: files.flat().some(f => f.size > 5 * 1024 * 1024) };
      Object.entries(errs).forEach(([k, v]) => $('#' + k + '-e').classList.toggle('on', v));
      if (Object.values(errs).some(Boolean)) return toast('Fix the highlighted fields');
      const kinds = ['Invoice', 'Proof of delivery', 'Customer communication'];
      files.forEach((list, i) => list.forEach(f => c.evidence.push({ name: f.name, kind: kinds[i] })));
      c.note = $('#cbnote').value.trim(); c.status = 'PENDING_DOC_REVIEW';
      c.timeline.push([new Date(), 'Evidence submitted by you', `${files.flat().length} document${files.flat().length === 1 ? '' : 's'} · in PayU review`]);
      closeAll(); toast(`Evidence submitted for ${c.id}`); refresh(c.id);
    };
  }
})();

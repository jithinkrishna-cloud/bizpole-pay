// Page: subscriptions. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
/* ---- Subscriptions: plans, mandates (UPI Autopay / e-mandate / card SI) and pre-debit notices ---- */
(() => {
  const PAGE_SIZE = 10, H = 3600e3, DAY = 864e5;
  const CYCLES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ADHOC'];
  const METHODS = [['UPI', 'UPI Autopay'], ['CARD', 'Card'], ['NET_BANKING', 'Net banking e-mandate']];
  const MSTATUS = ['PENDING_REGISTRATION', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED'];
  const NSTATUS = ['SCHEDULED', 'SENT', 'FAILED', 'MISSED'];
  const PERIOD = { DAILY: DAY, WEEKLY: 7 * DAY, MONTHLY: 30 * DAY, YEARLY: 365 * DAY, ADHOC: 11 * DAY };
  const PER_MONTH = { DAILY: 30, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12, ADHOC: 0 };
  const UNIT = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year', ADHOC: 'charge' };
  const SEARCH = [['name', 'Customer name'], ['id', 'Mandate ID'], ['authPayuId', 'authpayuid'], ['email', 'Email']];
  const RANGES = [['all', 'All time', null], ['30d', 'Created last 30 days', 30], ['90d', 'Created last 90 days', 90], ['180d', 'Created last 180 days', 180]];
  const URANGES = [['7d', 'Next 7 days', 7], ['14d', 'Next 14 days', 14], ['30d', 'Next 30 days', 30]];
  const PCLS = { ACTIVE: 'ok', SUCCESS: 'ok', SENT: 'ok', PENDING_REGISTRATION: 'warn', PAUSED: 'warn', SCHEDULED: 'brand', REVOKED: 'bad', EXPIRED: 'bad', FAILED: 'bad', MISSED: 'bad' };
  const tc = s => s === 'ADHOC' ? 'Ad-hoc' : s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  const pill = s => `<span class="pill ${PCLS[s] || ''}">${tc(s)}</span>`;
  const day = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const methodLabel = m => METHODS.find(x => x[0] === m)[1];
  const every = p => p.cycle === 'ADHOC' ? 'On demand' : p.interval === 1 ? `Every ${UNIT[p.cycle]}` : `Every ${p.interval} ${UNIT[p.cycle]}s`;
  const per = p => p.cycle === 'ADHOC' ? 'max per charge' : p.interval === 1 ? `/ ${UNIT[p.cycle]}` : `/ ${p.interval} ${UNIT[p.cycle]}s`;

  /* ---------- mock data (test mode; live starts empty) ---------- */
  const PLAN_SEED = [
    ['Starter', 49900, 'MONTHLY', 1, null], ['Pro', 149900, 'MONTHLY', 1, null], ['Pro annual', 1499900, 'YEARLY', 1, null],
    ['Weekly meal box', 89900, 'WEEKLY', 1, 26], ['Daily e-paper', 1500, 'DAILY', 1, null], ['Usage top-up', 500000, 'ADHOC', 1, null],
  ];
  function build(){
    const plans = PLAN_SEED.map(([name, amount, cycle, interval, totalCycles], i) => ({ id: 'PLN' + (3101 + i), name, amount, cycle, interval, totalCycles, active: true, createdAt: new Date(now - (200 - i * 17) * DAY) }));
    const weights = [0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 5];
    const mandates = Array.from({ length: 42 }, (_, i) => {
      const plan = plans[pick(weights)], name = pick(NAMES), method = pick(['UPI', 'UPI', 'UPI', 'CARD', 'CARD', 'NET_BANKING']);
      const r = rnd(), status = r < .66 ? 'ACTIVE' : r < .76 ? 'PAUSED' : r < .84 ? 'PENDING_REGISTRATION' : r < .93 ? 'REVOKED' : 'EXPIRED';
      const createdAt = new Date(now - (2 + rnd() * 170) * DAY), period = PERIOD[plan.cycle] * plan.interval;
      const maxAmount = plan.cycle === 'ADHOC' ? plan.amount : method === 'UPI' && rnd() < .5 ? Math.round(plan.amount * 1.5 / 100) * 100 : plan.amount;
      const m = { id: 'MND' + (70400 + i), name, email: name.split(' ')[0].toLowerCase() + (i % 4 ? '' : i) + '@example.in', phone: '98' + String(Math.floor(rnd() * 1e8)).padStart(8, '0'),
        planId: plan.id, method, maxAmount, cycle: plan.cycle, interval: plan.interval, billingRule: method === 'UPI' ? (maxAmount > plan.amount ? 'MAX' : 'EXACT') : null,
        billingLimit: method === 'UPI' ? 'ON' : null, status, createdAt, startDate: createdAt, endDate: new Date(createdAt.getTime() + (plan.cycle === 'YEARLY' ? 5 : 2) * 365 * DAY),
        registrationTxnId: 'TREG' + (580000 + i), authPayuId: status === 'PENDING_REGISTRATION' ? null : String(19100000000 + Math.floor(rnd() * 9e8)),
        nextDebitAt: null, debits: [], notices: [], upcoming: null, cycleNo: 1 };
      if (status === 'EXPIRED') m.endDate = new Date(now - (1 + rnd() * 20) * DAY);
      if (status !== 'PENDING_REGISTRATION') {
        // past debits, each preceded by a 48 h pre-debit notice
        const stop = status === 'ACTIVE' || status === 'PAUSED' ? now.getTime() : Math.min(now.getTime(), m.endDate.getTime(), createdAt.getTime() + (1 + rnd() * 120) * DAY);
        let t = createdAt.getTime() + period, n = 1;
        const firstShown = Math.max(1, Math.floor((stop - createdAt.getTime()) / period) - 7);
        while (t < stop) {
          if (n >= firstShown) {
            const amt = plan.cycle === 'ADHOC' ? Math.round((800 + rnd() * 3800)) * 100 : plan.amount, ok = rnd() > .09;
            const rq = 'PDN' + Math.floor(41000000 + rnd() * 8e6);
            m.notices.push({ requestId: rq, debitDate: new Date(t), amount: amt, sentAt: new Date(t - 48 * H), status: 'SENT', invoiceStatus: ok ? 'Paid' : 'Unpaid', seq: m.method === 'UPI' ? n : null });
            m.debits.push({ cycle: n, date: new Date(t + 6 * H), amount: amt, status: ok ? 'SUCCESS' : 'FAILED', txnid: 'TREC' + Math.floor(310000 + rnd() * 6e5), requestId: rq, reason: ok ? '' : pick(['Insufficient funds', 'Mandate limit exceeded', 'Bank timeout']) });
          }
          t += period; n++;
        }
        m.cycleNo = n;
        if (status === 'ACTIVE') {
          m.nextDebitAt = new Date(Math.max(now.getTime() + 3 * H, t));
          if (m.nextDebitAt - now > 40 * DAY && plan.cycle !== 'YEARLY') m.nextDebitAt = new Date(now.getTime() + (1 + rnd() * 25) * DAY);
          m.nextDebitAt.setHours(10, 0, 0, 0); if (m.nextDebitAt < now) m.nextDebitAt = new Date(m.nextDebitAt.getTime() + DAY);
          upcomingNotice(m, plan, rnd());
        }
      }
      return m;
    });
    return { plans, mandates };
  }
  // The notice for the next debit goes out 48 h ahead; PayU rejects a debit whose notice reached the customer less than 24 h before.
  function upcomingNotice(m, plan, r){
    const debitDate = m.nextDebitAt, noticeAt = new Date(debitDate.getTime() - 48 * H), left = (debitDate - now) / H;
    let status = 'SCHEDULED', sentAt = null;
    if (noticeAt <= now) { status = r < .82 ? 'SENT' : left < 24 ? 'MISSED' : 'FAILED'; sentAt = status === 'SENT' ? noticeAt : null; }
    const amt = plan.cycle === 'ADHOC' ? Math.round(plan.amount * (.2 + r * .5) / 100) * 100 : plan.amount;
    m.upcoming = { requestId: 'PDN' + Math.floor(49000000 + r * 8e6), debitDate, noticeAt, sentAt, amount: amt, status, invoiceStatus: status === 'SENT' ? 'Unpaid' : null, seq: m.method === 'UPI' ? m.cycleNo : null };
  }
  const store = { test: build(), live: { plans: [], mandates: [] } };
  const S = () => store[state.mode];
  const planOf = m => S().plans.find(p => p.id === m.planId);

  /* ---------- view state ---------- */
  const sv = { tab: 'plans', page: 1, field: 'name', q: '', status: [], methods: [], plans: [], range: 'all', sort: { key: 'next', dir: 1 }, urange: '14d', ustatus: [] };
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);

  function mrrOf(p){
    const subs = S().mandates.filter(m => m.planId === p.id && m.status === 'ACTIVE');
    if (p.cycle === 'ADHOC') return subs.reduce((a, m) => a + m.debits.filter(d => d.status === 'SUCCESS' && now - d.date < 30 * DAY).reduce((x, d) => x + d.amount, 0), 0);
    return Math.round(subs.length * p.amount * PER_MONTH[p.cycle] / p.interval);
  }
  const upcomingList = days => S().mandates.filter(m => m.status === 'ACTIVE' && m.upcoming && m.upcoming.debitDate - now <= days * DAY);

  function kpis(){
    const ms = S().mandates, active = ms.filter(m => m.status === 'ACTIVE'), up7 = upcomingList(7);
    const failed = ms.flatMap(m => m.debits).filter(d => d.status === 'FAILED' && now - d.date < 30 * DAY);
    const mrr = S().plans.reduce((a, p) => a + mrrOf(p), 0);
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Monthly recurring revenue <i data-icon=info class=li></i></small><b>${inr(mrr)}</b><span class="d muted">From ${active.length} active mandates · ad-hoc uses last 30 days</span></div>
      <div class="card kpi"><small>Active mandates</small><b>${active.length}</b><span class="d muted">${ms.filter(m => m.status === 'PAUSED').length} paused · ${ms.filter(m => m.status === 'PENDING_REGISTRATION').length} awaiting registration</span></div>
      <div class="card kpi"><small>Upcoming debits (7 days)</small><b>${inr(up7.reduce((a, m) => a + m.upcoming.amount, 0))}</b><span class="d muted">${up7.length} debits · ${up7.filter(m => ['FAILED', 'MISSED'].includes(m.upcoming.status)).length} notices need attention</span></div>
      <div class="card kpi"><small>Failed debits (30 days)</small><b ${failed.length ? 'style="color:var(--bad)"' : ''}>${failed.length}</b><span class="d muted">${inr(failed.reduce((a, d) => a + d.amount, 0))} not collected</span></div></div>`;
  }

  PAGES.subscriptions = () => {
    if (liveLocked()) return head('Subscriptions') + locked('Subscriptions');
    return head('Subscriptions', 'Recurring billing on UPI Autopay, cards and net banking e-mandates.', `<button class="btn" id="sb-dlall"><i data-icon=download class=li></i> Mandates CSV</button><button class="btn primary" id="sb-new">+ New plan</button>`) +
      `<div id="sb-kpis"></div>
      <div class="tabs"><button data-st="plans">Plans</button><button data-st="subs">Subscribers (mandates)</button><button data-st="up">Upcoming debits</button></div><div id="sb-view"></div>`;
  };

  /* ---------- Plans ---------- */
  function renderPlans(){
    const plans = S().plans;
    if (!plans.length) return `<div class="card"><div class="empty-state"><div class="box"><i data-icon=repeat class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO PLANS YET</p>
      <h3 style="margin:4px 0 6px;font-size:20px">Create your first subscription plan</h3><p class="muted" style="margin:0 0 12px">A plan sets the amount and billing cycle. Customers authorise a mandate once and are then debited automatically.</p>
      <button class="btn sm primary" data-newplan>+ New plan</button></div></div></div>`;
    return `<div class="grid g3">${plans.map(p => {
      const subs = S().mandates.filter(m => m.planId === p.id), act = subs.filter(m => m.status === 'ACTIVE').length;
      return `<div class="card sb-plan ${p.active ? '' : 'off'}"><div class="between"><h3 style="margin:0">${esc(p.name)}</h3>${pill(p.active ? 'ACTIVE' : 'INACTIVE')}</div>
        <div style="margin:10px 0 2px"><b style="font-size:24px;letter-spacing:-.02em">${inr(p.amount)}</b> <span class="muted">${per(p)}</span></div>
        <div class="row sb-chips"><span class="chip">${tc(p.cycle)}</span><span class="chip">${every(p)}</span><span class="chip">${p.totalCycles ? p.totalCycles + ' cycles' : 'Until cancelled'}</span></div>
        <dl class="kv sb-kv"><dt>Active subscribers</dt><dd><b>${act}</b> <span class="muted">of ${subs.length}</span></dd><dt>MRR</dt><dd><b>${inr(mrrOf(p))}</b></dd><dt>Plan ID</dt><dd class="mono">${p.id}</dd><dt>Created</dt><dd>${day(p.createdAt)}</dd></dl>
        <div class="row sb-foot"><button class="btn sm" data-viewplan="${p.id}">View subscribers</button><button class="btn sm ${p.active ? 'danger' : ''}" data-toggleplan="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button></div></div>`;
    }).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin-top:12px">Deactivating a plan stops new sign-ups. Existing mandates keep debiting until they are cancelled or expire.</p>`;
  }
  function planModal(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">New plan</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <label>Plan name</label><input id="pn-name" maxlength="60" placeholder="e.g. Pro monthly">
      <div class="row"><div><label>Amount (₹)</label><input id="pn-amt" type="number" min="1" step="0.01" placeholder="499.00"></div>
        <div><label>Billing cycle</label><select id="pn-cycle">${CYCLES.map(c => `<option value="${c}" ${c === 'MONTHLY' ? 'selected' : ''}>${tc(c)}</option>`).join('')}</select></div></div>
      <div class="row"><div><label>Bill every (interval)</label><input id="pn-int" type="number" min="1" step="1" value="1"></div>
        <div><label>Total cycles <span class="muted">(optional)</span></label><input id="pn-tot" type="number" min="1" step="1" placeholder="Until cancelled"></div></div>
      <p class="muted" id="pn-hint" style="font-size:12.5px;margin:10px 0 0"></p>
      <div id="pn-err"></div>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="pn-go">Create plan</button></div>`);
    const hint = () => {
      const c = $('#pn-cycle').value; $('#pn-int').disabled = c === 'ADHOC';
      $('#pn-hint').textContent = c === 'ADHOC' ? 'Ad-hoc: the amount is the most you can charge per debit; you trigger each charge yourself.' : 'Customers authorise the amount once; a pre-debit notice is sent 48 h before every charge.';
    };
    $('#pn-cycle').onchange = hint; hint();
    $('#pn-go').onclick = () => {
      const name = $('#pn-name').value.trim(), amt = Math.round(parseFloat($('#pn-amt').value) * 100), cycle = $('#pn-cycle').value;
      const interval = cycle === 'ADHOC' ? 1 : Number($('#pn-int').value), totRaw = $('#pn-tot').value.trim(), tot = totRaw ? Number(totRaw) : null;
      const err = !name ? 'Enter a plan name.' : S().plans.some(p => p.name.toLowerCase() === name.toLowerCase()) ? 'A plan with this name already exists.'
        : !(amt >= 100) ? 'Amount must be at least ₹1.00.' : amt > 1500000000 ? 'Amount is above the mandate limit.'
        : !(Number.isInteger(interval) && interval >= 1 && interval <= 365) ? 'Interval must be a whole number from 1 to 365.'
        : tot !== null && !(Number.isInteger(tot) && tot >= 1 && tot <= 999) ? 'Total cycles must be a whole number from 1 to 999, or blank.' : '';
      if (err) { $('#pn-err').innerHTML = `<div class="notice bad">${err}</div>`; return; }
      S().plans.push({ id: 'PLN' + (3200 + S().plans.length), name, amount: amt, cycle, interval, totalCycles: tot, active: true, createdAt: new Date() });
      closeAll(); toast(`Plan "${name}" created`); sv.tab = 'plans'; route();
    };
  }

  /* ---------- Subscribers ---------- */
  function subRows(){
    const q = sv.q.trim().toLowerCase(), rg = RANGES.find(r => r[0] === sv.range)[2];
    return S().mandates.filter(m => (!sv.status.length || sv.status.includes(m.status)) && (!sv.methods.length || sv.methods.includes(m.method)) && (!sv.plans.length || sv.plans.includes(m.planId))
        && (!rg || now - m.createdAt <= rg * DAY) && (!q || String(m[sv.field] || '').toLowerCase().includes(q)))
      .sort((a, b) => sv.sort.dir * (sv.sort.key === 'amount' ? a.maxAmount - b.maxAmount : sv.sort.key === 'created' ? a.createdAt - b.createdAt
        : (a.nextDebitAt ? a.nextDebitAt.getTime() : 9e15) - (b.nextDebitAt ? b.nextDebitAt.getTime() : 9e15)));
  }
  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-sort="${key}">${label} <span class="muted">${sv.sort.key === key ? (sv.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;
  function pager(total){
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), from = total ? (sv.page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(total, sv.page * PAGE_SIZE);
    return total ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${total}</span>
      <span class="pager"><button class="btn sm" data-pg="${sv.page - 1}" ${sv.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === sv.page ? 'primary' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="btn sm" data-pg="${sv.page + 1}" ${sv.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
  }
  const emptyRow = (colspan, title, text, buttons) => `<tr><td colspan="${colspan}"><div class="empty-state"><div class="box">📭</div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO RESULTS FOUND</p>
    <h3 style="margin:4px 0 6px;font-size:20px">${title}</h3><p class="muted" style="margin:0 0 12px">${text}</p><div class="row" style="gap:8px">${buttons}</div></div></div></td></tr>`;
  function renderSubs(){
    const rows = subRows(), pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); sv.page = Math.min(sv.page, pages);
    const nF = sv.status.length + sv.methods.length + sv.plans.length, f = SEARCH.find(x => x[0] === sv.field);
    const none = !S().mandates.length;
    return `<div class="toolbar">
      <div class="searchbox"><select id="sb-sf">${SEARCH.map(([k, l]) => `<option value="${k}" ${k === sv.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="sb-sq" placeholder="Search ${f[1]}" value="${esc(sv.q)}"><button class="btn primary" id="sb-sgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="sbrange"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === sv.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-sbrange">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === sv.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="sbfilter"><i data-icon=list-filter class=li></i> Filter${nF ? ` <span class="pill brand">${nF}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-sbfilter"><h6>Status</h6>${MSTATUS.map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${sv.status.includes(s) ? 'checked' : ''}>${tc(s)}</label>`).join('')}
          <h6>Method</h6>${METHODS.map(([k, l]) => `<label class="ck"><input type="checkbox" data-fm="${k}" ${sv.methods.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}
          <h6>Plan</h6>${S().plans.map(p => `<label class="ck"><input type="checkbox" data-fp="${p.id}" ${sv.plans.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sb-freset">Reset</button><button class="btn sm primary" id="sb-fapply">Apply</button></div></div></div>
      <span style="flex:1"></span>
      <button class="btn" id="sb-dl"><i data-icon=download class=li></i> Download CSV</button></div>
    <div class="tbl-wrap"><table><thead><tr>${sortHead('created', 'Created')}<th>Customer</th><th>Mandate ID · authpayuid</th><th>Plan</th><th>Method</th>${sortHead('amount', 'Max amount', 'right')}<th>Status</th>${sortHead('next', 'Next debit')}</tr></thead>
    <tbody>${rows.length ? rows.slice((sv.page - 1) * PAGE_SIZE, sv.page * PAGE_SIZE).map(m => { const p = planOf(m);
      return `<tr class="click" data-mid="${m.id}"><td>${day(m.createdAt)}</td><td><b style="font-weight:600">${esc(m.name)}</b><div class="muted" style="font-size:12px">${esc(m.email)}</div></td>
        <td><span class="mono">${m.id}</span><div class="mono muted" style="font-size:11.5px">${m.authPayuId || 'not registered yet'}</div></td>
        <td>${esc(p.name)}<div class="muted" style="font-size:12px">${tc(p.cycle)}</div></td><td>${methodLabel(m.method)}</td><td class="right"><b>${inr(m.maxAmount)}</b>${m.billingRule ? `<div class="muted" style="font-size:11.5px">UPI rule: ${m.billingRule}</div>` : ''}</td>
        <td>${pill(m.status)}</td><td>${m.nextDebitAt ? fmtDate(m.nextDebitAt) : '<span class="muted">—</span>'}</td></tr>`; }).join('')
      : none ? emptyRow(8, 'No subscribers yet', 'Share a plan\'s checkout link. Each customer appears here as soon as they start registering a mandate.', '<button class="btn sm" data-st2="plans">Go to plans</button>')
      : emptyRow(8, "We couldn't find any mandates", 'Remove the filters or widen the date range and try again.', '<button class="btn sm" id="sb-eclear">Clear filters</button><button class="btn sm" id="sb-eall">Show all time</button>')}</tbody></table></div>` + pager(rows.length);
  }

  /* ---------- Upcoming debits ---------- */
  function upRows(){
    const days = URANGES.find(r => r[0] === sv.urange)[2];
    return upcomingList(days).filter(m => !sv.ustatus.length || sv.ustatus.includes(m.upcoming.status)).sort((a, b) => a.upcoming.debitDate - b.upcoming.debitDate);
  }
  function renderUp(){
    const rows = upRows(), nF = sv.ustatus.length, attn = rows.filter(m => ['FAILED', 'MISSED'].includes(m.upcoming.status));
    return `<div class="card sb-rule"><div class="tile"><div class="ic"><i data-icon=timer class=li></i></div><div><b>Pre-debit notices</b><p>Bizpole Pay asks PayU to notify the customer 48 h before each debit. A debit only runs if its notice reached the customer at least 24 h earlier; a missed notice moves the debit out.</p></div></div>
      <div class="row sb-legend">${NSTATUS.map(s => `<span>${pill(s)} <b>${rows.filter(m => m.upcoming.status === s).length}</b></span>`).join('')}</div></div>
    <div class="toolbar">
      <div class="dd"><button class="btn" data-dd="urange"><i data-icon=calendar class=li></i> ${URANGES.find(r => r[0] === sv.urange)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-urange">${URANGES.map(([k, l]) => `<button data-urange="${k}" class="${k === sv.urange ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="ufilter"><i data-icon=list-filter class=li></i> Notice status${nF ? ` <span class="pill brand">${nF}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-ufilter"><h6>Notice status</h6>${NSTATUS.map(s => `<label class="ck"><input type="checkbox" data-fu="${s}" ${sv.ustatus.includes(s) ? 'checked' : ''}>${tc(s)}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sb-ureset">Reset</button><button class="btn sm primary" id="sb-uapply">Apply</button></div></div></div>
      <span class="muted" style="font-size:13px">${rows.length} debits · ${inr(rows.reduce((a, m) => a + m.upcoming.amount, 0))}${attn.length ? ` · <span style="color:var(--bad)">${attn.length} need attention</span>` : ''}</span>
      <span style="flex:1"></span>${attn.some(m => m.upcoming.status === 'FAILED') ? `<button class="btn" id="sb-resendall"><i data-icon=refresh-cw class=li></i> Resend failed notices</button>` : ''}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Debit date</th><th>Customer</th><th>Plan · mandate</th><th>Method</th><th class="right">Amount</th><th>Notice</th><th class="right">Lead time</th><th>Notice status</th><th class="right">Action</th></tr></thead>
    <tbody>${rows.length ? rows.map(m => { const u = m.upcoming, left = (u.debitDate - now) / H, lead = u.sentAt ? (u.debitDate - u.sentAt) / H : null;
      return `<tr class="click" data-mid="${m.id}"><td><b style="font-weight:600">${fmtDate(u.debitDate)}</b><div class="muted" style="font-size:12px">in ${left < 48 ? Math.max(0, Math.round(left)) + ' h' : Math.round(left / 24) + ' days'}</div></td>
        <td>${esc(m.name)}</td><td>${esc(planOf(m).name)}<div class="mono muted" style="font-size:11.5px">${m.id}</div></td><td>${methodLabel(m.method)}</td><td class="right"><b>${inr(u.amount)}</b></td>
        <td>${u.sentAt ? `Sent ${fmtDate(u.sentAt)}` : u.status === 'SCHEDULED' ? `<span class="muted">Scheduled ${fmtDate(u.noticeAt)}</span>` : `<span style="color:var(--bad)">Not delivered</span>`}<div class="mono muted" style="font-size:11.5px">${u.requestId}</div></td>
        <td class="right">${lead !== null ? `<span style="color:${lead >= 24 ? 'var(--ok)' : 'var(--bad)'}">${Math.round(lead)} h</span>` : '<span class="muted">48 h planned</span>'}</td>
        <td>${pill(u.status)}</td><td class="right">${u.status === 'FAILED' || u.status === 'SCHEDULED' ? `<button class="btn sm" data-send="${m.id}">${u.status === 'FAILED' ? 'Resend' : 'Send now'}</button>`
          : u.status === 'MISSED' ? `<button class="btn sm" data-resched="${m.id}">Reschedule</button>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')
      : emptyRow(9, 'No debits in this window', 'Nothing is due on active mandates in this period. Widen the window or clear the status filter.', '<button class="btn sm" id="sb-u30">Next 30 days</button><button class="btn sm" id="sb-ureset2">Clear filter</button>')}</tbody></table></div>`;
  }
  function sendNotice(m){
    const u = m.upcoming, left = (u.debitDate - Date.now()) / H;
    if (left < 24) { toast('Too late: the notice must reach the customer 24 h before the debit'); return false; }
    u.status = 'SENT'; u.sentAt = new Date(); u.invoiceStatus = 'Unpaid'; return true;
  }
  function reschedule(m){
    const u = m.upcoming; u.debitDate = new Date(Date.now() + 50 * H); u.debitDate.setMinutes(0, 0, 0); m.nextDebitAt = u.debitDate;
    u.noticeAt = new Date(); u.sentAt = new Date(); u.status = 'SENT'; u.invoiceStatus = 'Unpaid';
  }

  /* ---------- tab switching and binding ---------- */
  function show(t){
    if (t !== sv.tab) sv.page = 1;
    sv.tab = t;
    document.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === t));
    $('#sb-kpis').innerHTML = kpis();
    $('#sb-view').innerHTML = t === 'plans' ? renderPlans() : t === 'subs' ? renderSubs() : renderUp();
    bindView(t);
  }
  const redraw = () => { if ($('#sb-view')) show(sv.tab); };
  function bindView(t){
    const v = $('#sb-view');
    v.querySelectorAll('[data-dd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#dd-' + b.dataset.dd), open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); });
    v.querySelectorAll('.menu').forEach(m => m.onclick = e => e.stopPropagation());
    v.querySelectorAll('[data-newplan]').forEach(b => b.onclick = planModal);
    v.querySelectorAll('[data-st2]').forEach(b => b.onclick = () => show(b.dataset.st2));
    v.querySelectorAll('tr[data-mid]').forEach(r => r.onclick = e => { if (!e.target.closest('button')) mandateDrawer(r.dataset.mid); });
    if (t === 'plans') {
      v.querySelectorAll('[data-viewplan]').forEach(b => b.onclick = () => { sv.plans = [b.dataset.viewplan]; sv.status = []; sv.methods = []; sv.q = ''; show('subs'); });
      v.querySelectorAll('[data-toggleplan]').forEach(b => b.onclick = () => { const p = S().plans.find(x => x.id === b.dataset.toggleplan); p.active = !p.active; toast(`${p.name} ${p.active ? 'activated' : 'deactivated'}`); redraw(); });
    }
    if (t === 'subs') {
      $('#sb-sf').onchange = e => { sv.field = e.target.value; sv.q = ''; redraw(); };
      const search = () => { sv.q = $('#sb-sq').value; sv.page = 1; redraw(); };
      $('#sb-sgo').onclick = search; $('#sb-sq').onkeydown = e => { if (e.key === 'Enter') search(); };
      v.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { sv.range = b.dataset.range; sv.page = 1; redraw(); });
      $('#sb-fapply').onclick = () => {
        sv.status = [...v.querySelectorAll('[data-fs]:checked')].map(x => x.dataset.fs); sv.methods = [...v.querySelectorAll('[data-fm]:checked')].map(x => x.dataset.fm);
        sv.plans = [...v.querySelectorAll('[data-fp]:checked')].map(x => x.dataset.fp); sv.page = 1; redraw();
      };
      $('#sb-freset').onclick = () => { sv.status = []; sv.methods = []; sv.plans = []; sv.page = 1; redraw(); };
      v.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { const key = h.dataset.sort; sv.sort = { key, dir: sv.sort.key === key ? -sv.sort.dir : key === 'next' ? 1 : -1 }; redraw(); });
      v.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { sv.page = +b.dataset.pg; redraw(); });
      if ($('#sb-eclear')) { $('#sb-eclear').onclick = () => { sv.status = []; sv.methods = []; sv.plans = []; sv.q = ''; redraw(); }; $('#sb-eall').onclick = () => { sv.range = 'all'; redraw(); }; }
      $('#sb-dl').onclick = () => {
        const rows = subRows(), csv = 'mandate_id,authpayuid,customer,email,plan,method,max_amount,status,next_debit\n' + rows.map(m => [m.id, m.authPayuId || '', `"${m.name}"`, m.email, `"${planOf(m).name}"`, m.method, (m.maxAmount / 100).toFixed(2), m.status, m.nextDebitAt ? m.nextDebitAt.toISOString() : ''].join(',')).join('\n') + '\n';
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'bizpolepay-mandates.csv'; a.click(); toast(`Downloaded ${rows.length} mandates`);
      };
    }
    if (t === 'up') {
      v.querySelectorAll('[data-urange]').forEach(b => b.onclick = () => { sv.urange = b.dataset.urange; redraw(); });
      $('#sb-uapply').onclick = () => { sv.ustatus = [...v.querySelectorAll('[data-fu]:checked')].map(x => x.dataset.fu); redraw(); };
      $('#sb-ureset').onclick = () => { sv.ustatus = []; redraw(); };
      v.querySelectorAll('[data-send]').forEach(b => b.onclick = () => { const m = S().mandates.find(x => x.id === b.dataset.send); if (sendNotice(m)) { toast(`Pre-debit notice sent to ${m.name}`); redraw(); } });
      v.querySelectorAll('[data-resched]').forEach(b => b.onclick = () => { const m = S().mandates.find(x => x.id === b.dataset.resched); reschedule(m); toast(`Debit moved to ${fmtDate(m.nextDebitAt)} · notice sent`); redraw(); });
      if ($('#sb-resendall')) $('#sb-resendall').onclick = () => { const n = upRows().filter(m => m.upcoming.status === 'FAILED' && sendNotice(m)).length; toast(`${n} notices resent`); redraw(); };
      if ($('#sb-u30')) { $('#sb-u30').onclick = () => { sv.urange = '30d'; redraw(); }; $('#sb-ureset2').onclick = () => { sv.ustatus = []; redraw(); }; }
    }
  }

  /* ---------- mandate drawer and actions ---------- */
  function mandateDrawer(id){
    const m = S().mandates.find(x => x.id === id), p = planOf(m), ok = m.debits.filter(d => d.status === 'SUCCESS');
    const steps = [['Registration started', true, fmtDate(m.createdAt)], ['Customer authorised via ' + methodLabel(m.method), !!m.authPayuId, m.authPayuId ? 'authpayuid ' + m.authPayuId : 'waiting for the customer'],
      ['First recurring debit', m.debits.length > 0, m.debits.length ? fmtDate(m.debits[0].date) : 'not yet'], [m.status === 'REVOKED' ? 'Cancelled' : m.status === 'EXPIRED' ? 'Expired' : 'Mandate ends', ['REVOKED', 'EXPIRED'].includes(m.status), day(m.endDate)]];
    const notices = [...(m.upcoming && m.status === 'ACTIVE' ? [m.upcoming] : []), ...m.notices.slice().reverse()].slice(0, 5);
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">Mandate · ${methodLabel(m.method)}</div><h2 style="margin:0">${esc(m.name)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(m.status)} <span class="muted">${esc(p.name)} · ${inr(p.amount)} ${per(p)}</span></p>
      ${m.status === 'PAUSED' ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Paused.</b> No debits or notices are sent until you resume.</div>` : ''}
      ${m.status === 'PENDING_REGISTRATION' ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Awaiting authorisation.</b> The customer has not completed the registration payment yet.</div>` : ''}
      <h3>Mandate</h3><dl class="kv"><dt>Mandate ID</dt><dd class="mono">${m.id}</dd><dt>authpayuid</dt><dd class="mono">${m.authPayuId || '—'}</dd><dt>Registration txn</dt><dd class="mono">${m.registrationTxnId}</dd>
        <dt>Method</dt><dd>${methodLabel(m.method)}</dd><dt>Max amount</dt><dd>${inr(m.maxAmount)}</dd>${m.billingRule ? `<dt>UPI billing rule</dt><dd>${m.billingRule} · limit ${m.billingLimit}</dd>` : ''}
        <dt>Billing</dt><dd>${tc(m.cycle)} · ${every(m)}</dd><dt>Valid</dt><dd>${day(m.startDate)} → ${day(m.endDate)}</dd><dt>Next debit</dt><dd>${m.nextDebitAt ? fmtDate(m.nextDebitAt) : '—'}</dd></dl>
      <h3 style="margin-top:18px">Customer</h3><dl class="kv"><dt>Email</dt><dd>${esc(m.email)}</dd><dt>Phone</dt><dd>${m.phone}</dd><dt>Collected</dt><dd>${inr(ok.reduce((a, d) => a + d.amount, 0))} over ${ok.length} debits</dd></dl>
      <h3 style="margin-top:18px">Progress</h3>${steps.map(([s, d, sub]) => `<p style="font-size:13px;margin:6px 0"><span class="dot ${d ? '' : 'warn'}"></span>${s} <span class="muted">· ${sub}</span></p>`).join('')}
      <h3 style="margin-top:18px">Debit history</h3>${m.debits.length ? `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Date</th><th class="right">Amount</th><th>Status</th></tr></thead><tbody>
        ${m.debits.slice().reverse().slice(0, 6).map(d => `<tr><td>${d.cycle}</td><td>${fmtDate(d.date)}<div class="mono muted" style="font-size:11px">${d.txnid}</div></td><td class="right">${inr(d.amount)}</td><td>${pill(d.status)}${d.reason ? `<div class="muted" style="font-size:11px">${d.reason}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="font-size:13px">No debits yet.</p>'}
      <h3 style="margin-top:18px">Pre-debit notifications</h3>${notices.length ? notices.map(n => `<div class="between sb-notice"><div><b style="font-weight:600">${inr(n.amount)}</b> for ${day(n.debitDate)}<div class="mono muted" style="font-size:11.5px">${n.requestId}${n.seq ? ' · seq ' + n.seq : ''}${n.sentAt ? ' · sent ' + fmtDate(n.sentAt) : ''}</div></div><span style="flex:none">${pill(n.status)}${n.invoiceStatus ? ` <span class="pill">${n.invoiceStatus}</span>` : ''}</span></div>`).join('') : '<p class="muted" style="font-size:13px">No notices yet.</p>'}
      <div class="row" style="margin-top:20px">
        ${m.status === 'ACTIVE' ? `<button class="btn" onclick="subscriptions_act('${m.id}','pause')">⏸ Pause</button>` : ''}
        ${m.status === 'PAUSED' ? `<button class="btn primary" onclick="subscriptions_act('${m.id}','resume')">▶ Resume</button>` : ''}
        ${['ACTIVE', 'PAUSED', 'PENDING_REGISTRATION'].includes(m.status) ? `<button class="btn danger" onclick="subscriptions_act('${m.id}','cancel')">Cancel mandate</button>` : ''}
        <button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${m.authPayuId || m.id}');toast('Copied')">Copy ${m.authPayuId ? 'authpayuid' : 'mandate ID'}</button></div>`);
  }
  const ACT = {
    pause: ['Pause this mandate?', 'No debits or pre-debit notices will be sent until you resume. The customer\'s authorisation stays in place.', 'Pause mandate', ''],
    resume: ['Resume this mandate?', 'Billing restarts on the next cycle. A pre-debit notice goes out 48 h before the debit.', 'Resume mandate', 'primary'],
    cancel: ['Cancel this mandate?', 'PayU will be asked to revoke the mandate. This cannot be undone; the customer must register again to restart.', 'Cancel mandate', 'primary sb-danger'],
  };
  window.subscriptions_act = (id, act) => {
    const m = S().mandates.find(x => x.id === id), [title, text, label, cls] = ACT[act];
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${title}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">${esc(m.name)} · ${m.id} · ${inr(m.maxAmount)} max</p><p>${text}</p>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Keep as is</button><button class="btn ${cls}" id="sb-confirm">${label}</button></div>`);
    $('#sb-confirm').onclick = () => {
      if (act === 'pause') { m.status = 'PAUSED'; m.nextDebitAt = null; }
      if (act === 'resume') {
        m.status = 'ACTIVE'; m.nextDebitAt = new Date(Date.now() + Math.max(3 * DAY, Math.min(PERIOD[m.cycle] * m.interval, 30 * DAY))); m.nextDebitAt.setHours(10, 0, 0, 0);
        upcomingNotice(m, planOf(m), .99); m.upcoming.status = 'SCHEDULED'; m.upcoming.sentAt = null; m.upcoming.invoiceStatus = null;
      }
      if (act === 'cancel') { m.status = 'REVOKED'; m.nextDebitAt = null; m.endDate = new Date(); }
      closeAll(); toast({ pause: 'Mandate paused', resume: 'Mandate resumed', cancel: 'Mandate cancelled' }[act]); redraw(); mandateDrawer(id);
    };
  };

  addStyle('subscriptions', `
    .sb-plan.off{opacity:.65}
    .sb-chips{gap:6px;margin-bottom:12px}.sb-chips>*{flex:none;min-width:0}
    .sb-kv{grid-template-columns:130px 1fr;font-size:13px}
    .sb-foot{margin-top:auto;padding-top:14px;gap:8px}.sb-foot>*{flex:none;min-width:0}
    .sb-rule{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
    .sb-rule .tile{flex:1;min-width:260px}
    .sb-legend{gap:14px;flex:none}.sb-legend>*{flex:none;min-width:0}
    .sb-notice{padding:8px 0;border-top:1px solid var(--line);font-size:13px}
    .btn.sb-danger{background:var(--bad);border-color:var(--bad)}
  `);

  BIND.subscriptions = () => {
    if (liveLocked()) return;
    $('#sb-new').onclick = planModal;
    $('#sb-dlall').onclick = () => { show('subs'); $('#sb-dl').click(); };
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => show(b.dataset.st));
    show(sv.tab);
  };
})();

// Page: subscriptions. Uses globals from app.html core (state, api, LOAD, helpers, PAGES, BIND).
/* ---- Subscriptions: plans, mandates (UPI Autopay / e-mandate / card SI) and pre-debit notices ---- */
(() => {
  const PAGE_SIZE = 10, H = 3600e3, DAY = 864e5;
  const CYCLES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ADHOC'];
  const METHODS = [['UPI', 'UPI Autopay'], ['CARD', 'Card'], ['NET_BANKING', 'Net banking e-mandate']];
  const MSTATUS = ['PENDING_REGISTRATION', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED', 'FAILED'];
  // Notice status for the next debit. DUE = the 48 h send time has passed and no notice has gone out yet.
  const NSTATUS = ['SCHEDULED', 'DUE', 'SENT', 'FAILED', 'MISSED'];
  const ATTN = ['DUE', 'FAILED', 'MISSED'];
  const FAILED_TX = ['FAILED', 'BOUNCED', 'DROPPED', 'USER_CANCELLED'];
  const PER_MONTH = { DAILY: 30, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12, ADHOC: 0, ONCE: 0 };
  const UNIT = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year', ADHOC: 'charge', ONCE: 'charge' };
  const SEARCH = [['name', 'Customer name'], ['id', 'Mandate ID'], ['authPayuId', 'Authorisation ID'], ['email', 'Email']];
  const RANGES = [['all', 'All time', null], ['30d', 'Created last 30 days', 30], ['90d', 'Created last 90 days', 90], ['180d', 'Created last 180 days', 180]];
  const URANGES = [['7d', 'Next 7 days', 7], ['14d', 'Next 14 days', 14], ['30d', 'Next 30 days', 30]];
  const PCLS = { ACTIVE: 'ok', SUCCESS: 'ok', SENT: 'ok', PENDING_REGISTRATION: 'warn', PAUSED: 'warn', DUE: 'warn', INITIATED: 'warn', PENDING: 'warn', AUTHORIZED: 'warn',
    SCHEDULED: 'brand', REVOKED: 'bad', EXPIRED: 'bad', FAILED: 'bad', MISSED: 'bad', BOUNCED: 'bad', DROPPED: 'bad', USER_CANCELLED: 'bad', AUTO_REFUNDED: 'bad' };
  const tc = s => s === 'ADHOC' ? 'Ad-hoc' : s === 'DUE' ? 'Due to send' : String(s).replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  const pill = s => `<span class="pill ${PCLS[s] || ''}">${tc(s)}</span>`;
  const day = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const methodLabel = m => (METHODS.find(x => x[0] === m) || [m, m])[1];
  const adhoc = c => c === 'ADHOC' || c === 'ONCE';
  const every = p => adhoc(p.cycle) ? 'On demand' : p.interval === 1 ? `Every ${UNIT[p.cycle]}` : `Every ${p.interval} ${UNIT[p.cycle]}s`;
  const per = p => adhoc(p.cycle) ? 'max per charge' : p.interval === 1 ? `/ ${UNIT[p.cycle]}` : `/ ${p.interval} ${UNIT[p.cycle]}s`;
  const ymd = s => s ? new Date(s + 'T00:00:00') : null;
  const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ---------- data (from /api/subscriptions, per mode) ---------- */
  const store = { test: { plans: [], mandates: [] }, live: { plans: [], mandates: [] } };
  const S = () => store[state.mode];
  const planOf = m => S().plans.find(p => p.id === m.planId) || null;
  const planName = m => { const p = planOf(m); return p ? p.name : 'No plan'; };

  // The notice for the next debit goes out 48 h ahead; the payment partner rejects a debit whose notice reached the customer less than 24 h before.
  // Derived from the mandate's nextDebitAt and the PreDebitNotification row for that date, if there is one.
  function upcomingOf(m, plans){
    if (m.status !== 'ACTIVE' || !m.nextDebitAt) return null;
    const debitDate = m.nextDebitAt, noticeAt = new Date(debitDate.getTime() - 48 * H), left = (debitDate - now) / H;
    const n = m.notices.find(x => !x.hasDebit && x.debitDateStr === ymdOf(debitDate));
    const status = n ? n.status : noticeAt > now ? 'SCHEDULED' : left < 24 ? 'MISSED' : 'DUE';
    const p = plans.find(x => x.id === m.planId);
    return { requestId: n ? n.requestId : null, debitDate, noticeAt, sentAt: n && n.status === 'SENT' ? n.sentAt : null,
      amount: n ? n.amount : p && !adhoc(p.cycle) ? p.amount : m.maxAmount, status, invoiceStatus: n ? n.invoiceStatus : null, seq: n ? n.seq : null };
  }
  LOAD.subscriptions = async (mode) => {
    const r = await api('/subscriptions', { mode });
    const plans = r.plans.map(p => ({ ...p, createdAt: new Date(p.createdAt) }));
    const mandates = r.mandates.map(m => ({ ...m, createdAt: new Date(m.createdAt), startDate: ymd(m.startDate), endDate: ymd(m.endDate), nextDebitAt: toDate(m.nextDebitAt),
      notices: m.notices.map(n => ({ ...n, debitDateStr: n.debitDate, debitDate: ymd(n.debitDate), sentAt: toDate(n.sentAt), status: String(n.payuStatus) === '1' ? 'SENT' : 'FAILED' })),
      debits: m.debits.map(d => ({ ...d, date: new Date(d.date) })) }));
    mandates.forEach(m => { m.upcoming = upcomingOf(m, plans); });
    store[mode] = { plans, mandates };
  };
  const refresh = () => LOAD.subscriptions(state.mode);

  /* ---------- view state ---------- */
  const sv = { tab: 'plans', page: 1, field: 'name', q: '', status: [], methods: [], plans: [], range: 'all', sort: { key: 'next', dir: 1 }, urange: '14d', ustatus: [] };
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);

  function mrrOf(p){
    const subs = S().mandates.filter(m => m.planId === p.id && m.status === 'ACTIVE');
    if (adhoc(p.cycle)) return subs.reduce((a, m) => a + m.debits.filter(d => d.status === 'SUCCESS' && now - d.date < 30 * DAY).reduce((x, d) => x + d.amount, 0), 0);
    return Math.round(subs.length * p.amount * PER_MONTH[p.cycle] / p.interval);
  }
  const upcomingList = days => S().mandates.filter(m => m.upcoming && m.upcoming.debitDate - now <= days * DAY);

  function kpis(){
    const ms = S().mandates, active = ms.filter(m => m.status === 'ACTIVE'), up7 = upcomingList(7);
    const failed = ms.flatMap(m => m.debits).filter(d => FAILED_TX.includes(d.status) && now - d.date < 30 * DAY);
    const mrr = S().plans.reduce((a, p) => a + mrrOf(p), 0);
    return `<div class="grid g4 kpis">
      <div class="card kpi"><small>Monthly recurring revenue <i data-icon=info class=li></i></small><b>${inr(mrr)}</b><span class="d muted">From ${active.length} active mandates · ad-hoc uses last 30 days</span></div>
      <div class="card kpi"><small>Active mandates</small><b>${active.length}</b><span class="d muted">${ms.filter(m => m.status === 'PAUSED').length} paused · ${ms.filter(m => m.status === 'PENDING_REGISTRATION').length} awaiting registration</span></div>
      <div class="card kpi"><small>Upcoming debits (7 days)</small><b>${inr(up7.reduce((a, m) => a + m.upcoming.amount, 0))}</b><span class="d muted">${up7.length} debits · ${up7.filter(m => ATTN.includes(m.upcoming.status)).length} notices need attention</span></div>
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
        <dl class="kv sb-kv"><dt>Active subscribers</dt><dd><b>${act}</b> <span class="muted">of ${subs.length}</span></dd><dt>MRR</dt><dd><b>${inr(mrrOf(p))}</b></dd><dt>Plan ID</dt><dd class="mono">${esc(p.id)}</dd><dt>Created</dt><dd>${day(p.createdAt)}</dd></dl>
        <div class="row sb-foot"><button class="btn sm" data-viewplan="${esc(p.id)}">View subscribers</button><button class="btn sm ${p.active ? 'danger' : ''}" data-toggleplan="${esc(p.id)}">${p.active ? 'Deactivate' : 'Activate'}</button></div></div>`;
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
    $('#pn-go').onclick = async () => {
      const name = $('#pn-name').value.trim(), amt = Math.round(parseFloat($('#pn-amt').value) * 100), cycle = $('#pn-cycle').value;
      const interval = cycle === 'ADHOC' ? 1 : Number($('#pn-int').value), totRaw = $('#pn-tot').value.trim(), tot = totRaw ? Number(totRaw) : null;
      const err = !name ? 'Enter a plan name.' : S().plans.some(p => p.name.toLowerCase() === name.toLowerCase()) ? 'A plan with this name already exists.'
        : !(amt >= 100) ? 'Amount must be at least ₹1.00.' : amt > 1500000000 ? 'Amount is above the mandate limit.'
        : !(Number.isInteger(interval) && interval >= 1 && interval <= 365) ? 'Interval must be a whole number from 1 to 365.'
        : tot !== null && !(Number.isInteger(tot) && tot >= 1 && tot <= 999) ? 'Total cycles must be a whole number from 1 to 999, or blank.' : '';
      if (err) { $('#pn-err').innerHTML = `<div class="notice bad">${err}</div>`; return; }
      const btn = $('#pn-go'); btn.disabled = true;
      try {
        await api('/subscriptions/plans', { method: 'POST', body: { name, amount: amt, cycle, interval, totalCycles: tot } });
        await refresh();
      } catch (e) { btn.disabled = false; $('#pn-err').innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; return; }
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
          ${S().plans.length ? `<h6>Plan</h6>${S().plans.map(p => `<label class="ck"><input type="checkbox" data-fp="${esc(p.id)}" ${sv.plans.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}` : ''}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sb-freset">Reset</button><button class="btn sm primary" id="sb-fapply">Apply</button></div></div></div>
      <span style="flex:1"></span>
      <button class="btn" id="sb-dl"><i data-icon=download class=li></i> Download CSV</button></div>
    <div class="tbl-wrap"><table><thead><tr>${sortHead('created', 'Created')}<th>Customer</th><th>Mandate ID · Authorisation ID</th><th>Plan</th><th>Method</th>${sortHead('amount', 'Max amount', 'right')}<th>Status</th>${sortHead('next', 'Next debit')}</tr></thead>
    <tbody>${rows.length ? rows.slice((sv.page - 1) * PAGE_SIZE, sv.page * PAGE_SIZE).map(m => {
      return `<tr class="click" data-mid="${esc(m.id)}"><td>${day(m.createdAt)}</td><td><b style="font-weight:600">${esc(m.name)}</b><div class="muted" style="font-size:12px">${esc(m.email)}</div></td>
        <td><span class="mono">${esc(m.id)}</span><div class="mono muted" style="font-size:11.5px">${esc(m.authPayuId || 'not registered yet')}</div></td>
        <td>${esc(planName(m))}<div class="muted" style="font-size:12px">${tc(m.cycle)}</div></td><td>${methodLabel(m.method)}</td><td class="right"><b>${inr(m.maxAmount)}</b>${m.billingRule ? `<div class="muted" style="font-size:11.5px">UPI rule: ${esc(m.billingRule)}</div>` : ''}</td>
        <td>${pill(m.status)}</td><td>${m.nextDebitAt ? fmtDate(m.nextDebitAt) : '<span class="muted">—</span>'}</td></tr>`; }).join('')
      : none ? emptyRow(8, 'No subscribers yet', 'A subscriber appears here once a customer starts a mandate registration payment for one of your plans.', '<button class="btn sm" data-st2="plans">Go to plans</button>')
      : emptyRow(8, "We couldn't find any mandates", 'Remove the filters or widen the date range and try again.', '<button class="btn sm" id="sb-eclear">Clear filters</button><button class="btn sm" id="sb-eall">Show all time</button>')}</tbody></table></div>` + pager(rows.length);
  }

  /* ---------- Upcoming debits ---------- */
  function upRows(){
    const days = URANGES.find(r => r[0] === sv.urange)[2];
    return upcomingList(days).filter(m => !sv.ustatus.length || sv.ustatus.includes(m.upcoming.status)).sort((a, b) => a.upcoming.debitDate - b.upcoming.debitDate);
  }
  const canSend = u => ['SCHEDULED', 'DUE', 'FAILED'].includes(u.status);
  function renderUp(){
    const rows = upRows(), nF = sv.ustatus.length, attn = rows.filter(m => ATTN.includes(m.upcoming.status));
    return `<div class="card sb-rule"><div class="tile"><div class="ic"><i data-icon=timer class=li></i></div><div><b>Pre-debit notices</b><p>Bizpole Pay asks the payment partner to notify the customer 48 h before each debit. A debit only runs if its notice reached the customer at least 24 h earlier; a missed notice moves the debit out.</p></div></div>
      <div class="row sb-legend">${NSTATUS.map(s => `<span>${pill(s)} <b>${rows.filter(m => m.upcoming.status === s).length}</b></span>`).join('')}</div></div>
    <div class="toolbar">
      <div class="dd"><button class="btn" data-dd="urange"><i data-icon=calendar class=li></i> ${URANGES.find(r => r[0] === sv.urange)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-urange">${URANGES.map(([k, l]) => `<button data-urange="${k}" class="${k === sv.urange ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="ufilter"><i data-icon=list-filter class=li></i> Notice status${nF ? ` <span class="pill brand">${nF}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-ufilter"><h6>Notice status</h6>${NSTATUS.map(s => `<label class="ck"><input type="checkbox" data-fu="${s}" ${sv.ustatus.includes(s) ? 'checked' : ''}>${tc(s)}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="sb-ureset">Reset</button><button class="btn sm primary" id="sb-uapply">Apply</button></div></div></div>
      <span class="muted" style="font-size:13px">${rows.length} debits · ${inr(rows.reduce((a, m) => a + m.upcoming.amount, 0))}${attn.length ? ` · <span style="color:var(--bad)">${attn.length} need attention</span>` : ''}</span>
      <span style="flex:1"></span>${rows.some(m => ['DUE', 'FAILED'].includes(m.upcoming.status)) ? `<button class="btn" id="sb-resendall"><i data-icon=refresh-cw class=li></i> Send pending notices</button>` : ''}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Debit date</th><th>Customer</th><th>Plan · mandate</th><th>Method</th><th class="right">Amount</th><th>Notice</th><th class="right">Lead time</th><th>Notice status</th><th class="right">Action</th></tr></thead>
    <tbody>${rows.length ? rows.map(m => { const u = m.upcoming, left = (u.debitDate - now) / H, lead = u.sentAt ? (u.debitDate - u.sentAt) / H : null;
      return `<tr class="click" data-mid="${esc(m.id)}"><td><b style="font-weight:600">${fmtDate(u.debitDate)}</b><div class="muted" style="font-size:12px">in ${left < 48 ? Math.max(0, Math.round(left)) + ' h' : Math.round(left / 24) + ' days'}</div></td>
        <td>${esc(m.name)}</td><td>${esc(planName(m))}<div class="mono muted" style="font-size:11.5px">${esc(m.id)}</div></td><td>${methodLabel(m.method)}</td><td class="right"><b>${inr(u.amount)}</b></td>
        <td>${u.sentAt ? `Sent ${fmtDate(u.sentAt)}` : u.status === 'SCHEDULED' ? `<span class="muted">Due ${fmtDate(u.noticeAt)}</span>` : `<span style="color:var(--bad)">Not delivered</span>`}<div class="mono muted" style="font-size:11.5px">${esc(u.requestId || '—')}</div></td>
        <td class="right">${lead !== null ? `<span style="color:${lead >= 24 ? 'var(--ok)' : 'var(--bad)'}">${Math.round(lead)} h</span>` : '<span class="muted">48 h planned</span>'}</td>
        <td>${pill(u.status)}</td><td class="right">${canSend(u) ? `<button class="btn sm" data-send="${esc(m.id)}">${u.status === 'FAILED' ? 'Resend' : 'Send now'}</button>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')
      : emptyRow(9, 'No debits in this window', 'Nothing is due on active mandates in this period. Widen the window or clear the status filter.', '<button class="btn sm" id="sb-u30">Next 30 days</button><button class="btn sm" id="sb-ureset2">Clear filter</button>')}</tbody></table></div>`;
  }
  // Sends through the gateway's pre-debit API on the server; returns false (with a toast) when it can't be sent.
  async function sendNotice(m){
    const left = (m.upcoming.debitDate - Date.now()) / H;
    if (left < 24) { toast('Too late: the notice must reach the customer 24 h before the debit'); return false; }
    try { await api(`/subscriptions/mandates/${encodeURIComponent(m.id)}/pre-debit`, { method: 'POST' }); return true; }
    catch (e) { apiFail(e); return false; }
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
      v.querySelectorAll('[data-toggleplan]').forEach(b => b.onclick = async () => {
        const p = S().plans.find(x => x.id === b.dataset.toggleplan); b.disabled = true;
        try { await api(`/subscriptions/plans/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { active: !p.active } }); await refresh(); }
        catch (e) { b.disabled = false; return apiFail(e); }
        toast(`${p.name} ${!p.active ? 'activated' : 'deactivated'}`); redraw();
      });
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
        const q = s => `"${String(s).replace(/"/g, '""')}"`;
        const rows = subRows(), csv = 'mandate_id,authorisation_id,customer,email,plan,method,max_amount,status,next_debit\n' + rows.map(m => [m.id, m.authPayuId || '', q(m.name), q(m.email), q(planName(m)), m.method, (m.maxAmount / 100).toFixed(2), m.status, m.nextDebitAt ? m.nextDebitAt.toISOString() : ''].join(',')).join('\n') + '\n';
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'bizpolepay-mandates.csv'; a.click(); toast(`Downloaded ${rows.length} mandates`);
      };
    }
    if (t === 'up') {
      v.querySelectorAll('[data-urange]').forEach(b => b.onclick = () => { sv.urange = b.dataset.urange; redraw(); });
      $('#sb-uapply').onclick = () => { sv.ustatus = [...v.querySelectorAll('[data-fu]:checked')].map(x => x.dataset.fu); redraw(); };
      $('#sb-ureset').onclick = () => { sv.ustatus = []; redraw(); };
      v.querySelectorAll('[data-send]').forEach(b => b.onclick = async () => {
        const m = S().mandates.find(x => x.id === b.dataset.send); b.disabled = true;
        if (await sendNotice(m)) { await refresh().catch(apiFail); toast(`Pre-debit notice sent to ${m.name}`); redraw(); } else b.disabled = false;
      });
      if ($('#sb-resendall')) $('#sb-resendall').onclick = async () => {
        let n = 0;
        for (const m of upRows().filter(x => ['DUE', 'FAILED'].includes(x.upcoming.status))) { if (!(await sendNotice(m))) break; n++; }
        if (n) { await refresh().catch(apiFail); toast(`${n} notices sent`); redraw(); }
      };
      if ($('#sb-u30')) { $('#sb-u30').onclick = () => { sv.urange = '30d'; redraw(); }; $('#sb-ureset2').onclick = () => { sv.ustatus = []; redraw(); }; }
    }
  }

  /* ---------- mandate drawer and actions ---------- */
  function mandateDrawer(id){
    const m = S().mandates.find(x => x.id === id); if (!m) return;
    const p = planOf(m), ok = m.debits.filter(d => d.status === 'SUCCESS');
    const steps = [['Registration started', true, fmtDate(m.createdAt)], ['Customer authorised via ' + methodLabel(m.method), !!m.authPayuId, m.authPayuId ? 'Authorisation ID ' + m.authPayuId : 'waiting for the customer'],
      ['First recurring debit', m.debits.length > 0, m.debits.length ? fmtDate(m.debits[0].date) : 'not yet'], [m.status === 'REVOKED' ? 'Cancelled' : m.status === 'EXPIRED' ? 'Expired' : 'Mandate ends', ['REVOKED', 'EXPIRED'].includes(m.status), day(m.endDate)]];
    const up = m.upcoming ? [m.upcoming] : [];
    const notices = [...up, ...m.notices.filter(n => !up.length || n.requestId !== up[0].requestId).slice().reverse()].slice(0, 5);
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">Mandate · ${methodLabel(m.method)}</div><h2 style="margin:0">${esc(m.name)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(m.status)} <span class="muted">${p ? `${esc(p.name)} · ${inr(p.amount)} ${per(p)}` : `No plan · ${inr(m.maxAmount)} max ${per(m)}`}</span></p>
      ${m.status === 'PAUSED' ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Paused.</b> No debits or notices are sent until you resume.</div>` : ''}
      ${m.status === 'PENDING_REGISTRATION' ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Awaiting authorisation.</b> The customer has not completed the registration payment yet.</div>` : ''}
      <h3>Mandate</h3><dl class="kv"><dt>Mandate ID</dt><dd class="mono">${esc(m.id)}</dd><dt>Authorisation ID</dt><dd class="mono">${esc(m.authPayuId || '—')}</dd><dt>Registration txn</dt><dd class="mono">${esc(m.registrationTxnId || '—')}</dd>
        <dt>Method</dt><dd>${methodLabel(m.method)}</dd><dt>Max amount</dt><dd>${inr(m.maxAmount)}</dd>${m.billingRule ? `<dt>UPI billing rule</dt><dd>${esc(m.billingRule)} · limit ${esc(m.billingLimit || '—')}</dd>` : ''}
        <dt>Billing</dt><dd>${tc(m.cycle)} · ${every(m)}</dd><dt>Valid</dt><dd>${day(m.startDate)} → ${day(m.endDate)}</dd><dt>Next debit</dt><dd>${m.nextDebitAt ? fmtDate(m.nextDebitAt) : '—'}</dd></dl>
      <h3 style="margin-top:18px">Customer</h3><dl class="kv"><dt>Email</dt><dd>${esc(m.email || '—')}</dd><dt>Phone</dt><dd>${esc(m.phone || '—')}</dd><dt>Collected</dt><dd>${inr(ok.reduce((a, d) => a + d.amount, 0))} over ${ok.length} debits</dd></dl>
      <h3 style="margin-top:18px">Progress</h3>${steps.map(([s, d, sub]) => `<p style="font-size:13px;margin:6px 0"><span class="dot ${d ? '' : 'warn'}"></span>${s} <span class="muted">· ${esc(sub)}</span></p>`).join('')}
      <h3 style="margin-top:18px">Debit history</h3>${m.debits.length ? `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Date</th><th class="right">Amount</th><th>Status</th></tr></thead><tbody>
        ${m.debits.slice().reverse().slice(0, 6).map(d => `<tr><td>${d.cycle}</td><td>${fmtDate(d.date)}<div class="mono muted" style="font-size:11px">${esc(d.txnid)}</div></td><td class="right">${inr(d.amount)}</td><td>${pill(d.status)}${d.reason ? `<div class="muted" style="font-size:11px">${esc(d.reason)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="font-size:13px">No debits yet.</p>'}
      <h3 style="margin-top:18px">Pre-debit notifications</h3>${notices.length ? notices.map(n => `<div class="between sb-notice"><div><b style="font-weight:600">${inr(n.amount)}</b> for ${day(n.debitDate)}<div class="mono muted" style="font-size:11.5px">${esc(n.requestId || 'not sent yet')}${n.seq ? ' · seq ' + n.seq : ''}${n.sentAt ? ' · sent ' + fmtDate(n.sentAt) : ''}</div></div><span style="flex:none">${pill(n.status)}${n.invoiceStatus ? ` <span class="pill">${esc(n.invoiceStatus)}</span>` : ''}</span></div>`).join('') : '<p class="muted" style="font-size:13px">No notices yet.</p>'}
      <div class="row" style="margin-top:20px">
        ${m.status === 'ACTIVE' ? `<button class="btn" onclick="subscriptions_act('${esc(m.id)}','pause')">⏸ Pause</button>` : ''}
        ${m.status === 'PAUSED' ? `<button class="btn primary" onclick="subscriptions_act('${esc(m.id)}','resume')">▶ Resume</button>` : ''}
        ${['ACTIVE', 'PAUSED', 'PENDING_REGISTRATION'].includes(m.status) ? `<button class="btn danger" onclick="subscriptions_act('${esc(m.id)}','cancel')">Cancel mandate</button>` : ''}
        <button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(m.authPayuId || m.id)}');toast('Copied')">Copy ${m.authPayuId ? 'authorisation ID' : 'mandate ID'}</button></div>`);
  }
  const ACT = {
    pause: ['Pause this mandate?', 'No debits or pre-debit notices will be sent until you resume. The customer\'s authorisation stays in place.', 'Pause mandate', ''],
    resume: ['Resume this mandate?', 'Billing restarts on the next cycle. A pre-debit notice goes out 48 h before the debit.', 'Resume mandate', 'primary'],
    cancel: ['Cancel this mandate?', 'The payment partner will be asked to revoke the mandate. This cannot be undone; the customer must register again to restart.', 'Cancel mandate', 'primary sb-danger'],
  };
  window.subscriptions_act = (id, act) => {
    const m = S().mandates.find(x => x.id === id), [title, text, label, cls] = ACT[act];
    if (!m) return;
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${title}</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted">${esc(m.name)} · ${esc(m.id)} · ${inr(m.maxAmount)} max</p><p>${text}</p>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Keep as is</button><button class="btn ${cls}" id="sb-confirm">${label}</button></div>`);
    $('#sb-confirm').onclick = async () => {
      const b = $('#sb-confirm'); b.disabled = true;
      try { await api(`/subscriptions/mandates/${encodeURIComponent(id)}/${act}`, { method: 'POST' }); await refresh(); }
      catch (e) { closeAll(); apiFail(e); mandateDrawer(id); return; }
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

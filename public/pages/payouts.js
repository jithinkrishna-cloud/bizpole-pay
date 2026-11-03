// Page: payouts. Uses globals from app.html core (state, api, LOAD, helpers, PAGES, BIND).
/* ---- Payouts: payouts, bulk uploads and beneficiaries ---- */
(() => {
  const PAGE_SIZE = 10, DAY = 864e5;
  const STATUSES = ['QUEUED', 'SCHEDULED', 'IN_PROGRESS', 'PENDING', 'WAITING_FOR_RETRY', 'SUCCESS', 'FAILED', 'REVERSED'];
  const OPEN = ['QUEUED', 'SCHEDULED', 'IN_PROGRESS', 'PENDING', 'WAITING_FOR_RETRY'];
  const XMODES = ['IMPS', 'NEFT', 'RTGS', 'UPI'];
  const FEE = { IMPS: 500, NEFT: 300, RTGS: 2000, UPI: 400 }; // published per-payout fee in paise, plus 18% GST (estimate; the actual fee comes back from PayU)
  const LIMIT = { IMPS: [100, 50000000], NEFT: [100, 1000000000], RTGS: [20000000, 1000000000], UPI: [100, 10000000] };
  const PCLS = { SUCCESS: 'ok', FAILED: 'bad', REVERSED: 'bad', QUEUED: 'warn', SCHEDULED: 'brand', IN_PROGRESS: 'warn', PENDING: 'warn', WAITING_FOR_RETRY: 'warn' };
  const tc = s => String(s).replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  const pill = s => `<span class="pill ${PCLS[s] || ''}">${tc(s)}</span>`;
  const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/, VPA = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/, REF = /^[A-Za-z0-9_-]{1,40}$/;
  const BANKS = { HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra', FDRL: 'Federal Bank' };
  const bankOf = ifsc => BANKS[(ifsc || '').slice(0, 4)] || 'Bank';
  const feeOf = mode => { const fee = FEE[mode] || 0; return { fee, tax: Math.round(fee * .18) }; };
  const dest = b => b.vpa ? b.vpa : b.ifsc ? `${bankOf(b.ifsc)} ••${b.accountLast4}` : '—';
  const beneRef = b => b.payuBeneficiaryId || b.id;
  const feeText = p => p.fee == null ? '—' : inr(p.fee + (p.tax || 0));
  const SEARCH = [['ref', 'Reference'], ['utr', 'UTR'], ['bene', 'Beneficiary'], ['payuRefId', 'PayU ref']];
  const RANGES = [['today', 'Today', null], ['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['all', 'All time', null]];

  /* ---------- data (from /api/payouts, per mode) ---------- */
  const store = { test: { benes: [], payouts: [], batches: [] }, live: { benes: [], payouts: [], batches: [] } };
  const S = () => store[state.mode];
  const beneOf = p => S().benes.find(b => b.id === p.beneficiaryId) || {};
  LOAD.payouts = async (mode) => {
    const r = await api('/payouts', { mode });
    store[mode] = {
      benes: r.beneficiaries.map(b => ({ ...b, createdAt: new Date(b.createdAt) })),
      payouts: r.payouts.map(p => ({ ...p, date: new Date(p.date) })),
      batches: r.batches.map(b => ({ ...b, at: new Date(b.at) })),
    };
  };
  const refresh = () => LOAD.payouts(state.mode);

  /* ---------- view state ---------- */
  const pv = { tab: 'p', page: 1, field: 'ref', q: '', range: '30d', status: [], modes: [], sort: { key: 'date', dir: -1 }, bq: '', bver: 'all' };
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);

  function inRange(d){
    if (pv.range === 'all') return true;
    if (pv.range === 'today') { const sod = new Date(); sod.setHours(0, 0, 0, 0); return d >= sod; }
    return Date.now() - d <= RANGES.find(r => r[0] === pv.range)[2] * DAY;
  }
  function rows(){
    const q = pv.q.trim().toLowerCase();
    const val = p => pv.field === 'ref' ? p.merchantRefId : pv.field === 'utr' ? p.utr : pv.field === 'bene' ? beneOf(p).name : p.payuRefId;
    return S().payouts.filter(p => inRange(p.date) && (!pv.status.length || pv.status.includes(p.status)) && (!pv.modes.length || pv.modes.includes(p.mode)) && (!q || String(val(p) || '').toLowerCase().includes(q)))
      .sort((a, b) => pv.sort.dir * (pv.sort.key === 'amount' ? a.amount - b.amount : a.date - b.date));
  }

  // One validator for the dialog and every CSV row (the server checks again). `taken` holds references used earlier in the same file.
  function validate({ ref, bene, amount, mode }, taken = new Set()){
    if (!REF.test(ref || '')) return 'Reference must be 1–40 letters, digits, - or _';
    const key = ref.toLowerCase();
    if (S().payouts.some(p => p.merchantRefId.toLowerCase() === key) || taken.has(key)) return 'Reference already used';
    if (!bene) return 'Beneficiary not found';
    if (!XMODES.includes(mode)) return 'Mode must be IMPS, NEFT, RTGS or UPI';
    if (mode === 'UPI' && !bene.vpa) return 'UPI needs a beneficiary with a VPA';
    if (mode !== 'UPI' && !bene.ifsc) return `${mode} needs a bank account; this beneficiary has only a VPA`;
    if (!(amount >= 100)) return 'Amount must be at least ₹1.00';
    if (mode === 'RTGS' && amount < LIMIT.RTGS[0]) return 'RTGS needs at least ₹2,00,000';
    if (amount > LIMIT[mode][1]) return `${mode} allows at most ${inr(LIMIT[mode][1])}`;
    return '';
  }
  const nextRef = () => { let n = S().payouts.length + 1; while (S().payouts.some(p => p.merchantRefId === 'VEND-' + n)) n++; return 'VEND-' + n; };

  function kpis(){
    const s = S(), m30 = s.payouts.filter(p => Date.now() - p.date <= 30 * DAY), ok = m30.filter(p => p.status === 'SUCCESS'), open = s.payouts.filter(p => OPEN.includes(p.status));
    const bad = m30.filter(p => ['FAILED', 'REVERSED'].includes(p.status)), queued = s.payouts.filter(p => p.status === 'QUEUED').length;
    return `<div class="grid g4 kpis">
      <div class="card po-bal"><small>Payout balance</small><b>Not connected</b><span class="d">The payout wallet is held with PayU Payouts, which isn't connected to this account yet. No balance is shown until it is.</span></div>
      <div class="card kpi"><small>Paid out (30 days)</small><b>${inr(ok.reduce((a, p) => a + p.amount, 0))}</b><span class="d muted">${ok.length} payouts · fees ${inr(ok.reduce((a, p) => a + (p.fee || 0) + (p.tax || 0), 0))} incl. GST</span></div>
      <div class="card kpi"><small>In flight</small><b>${inr(open.reduce((a, p) => a + p.amount, 0))}</b><span class="d muted">${open.length} queued, processing or retrying${queued ? ` · ${queued} waiting to be sent` : ''}</span></div>
      <div class="card kpi"><small>Failed or reversed (30 days)</small><b ${bad.length ? 'style="color:var(--bad)"' : ''}>${bad.length}</b><span class="d muted">${inr(bad.reduce((a, p) => a + p.amount, 0))} not paid out</span></div></div>`;
  }

  PAGES.payouts = () => {
    if (liveLocked()) return head('Payouts') + locked('Payouts');
    return head('Payouts', 'Send money to vendors, partners or customers over IMPS, NEFT, RTGS or UPI.', `<button class="btn" id="po-bulk"><i data-icon=upload class=li></i> Bulk payout</button><button class="btn primary" id="po-new">+ New payout</button>`) +
      `<div id="po-kpis"></div><div class="tabs"><button data-pt="p">Payouts</button><button data-pt="b">Beneficiaries</button><button data-pt="u">Bulk upload</button></div><div id="po-view"></div>`;
  };

  const sortHead = (key, label, cls = '') => `<th class="${cls} sortable" data-sort="${key}">${label} <span class="muted">${pv.sort.key === key ? (pv.sort.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;
  function pager(total){
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), from = total ? (pv.page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(total, pv.page * PAGE_SIZE);
    return total ? `<div class="between" style="margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Showing ${from}–${to} of ${total}</span>
      <span class="pager"><button class="btn sm" data-pg="${pv.page - 1}" ${pv.page <= 1 ? 'disabled' : ''}><i data-icon=chevron-left class=li></i> Prev</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="btn sm ${i + 1 === pv.page ? 'primary' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="btn sm" data-pg="${pv.page + 1}" ${pv.page >= pages ? 'disabled' : ''}>Next <i data-icon=chevron-right class=li></i></button></span></div>` : '';
  }
  const empty = (title, text, buttons) => `<div class="empty-state"><div class="box"><i data-icon=arrow-up-right class=li></i></div><div><p class="muted" style="margin:0;font-size:12px;letter-spacing:.06em">NO RESULTS FOUND</p>
    <h3 style="margin:4px 0 6px;font-size:20px">${title}</h3><p class="muted" style="margin:0 0 12px;max-width:520px">${text}</p><div class="row" style="gap:8px">${buttons}</div></div></div>`;

  /* ---------- Payouts tab ---------- */
  function renderPayouts(){
    const list = rows(), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); pv.page = Math.min(pv.page, pages);
    const nF = pv.status.length + pv.modes.length, f = SEARCH.find(x => x[0] === pv.field), none = !S().payouts.length;
    return `<div class="toolbar">
      <div class="searchbox"><select id="po-sf">${SEARCH.map(([k, l]) => `<option value="${k}" ${k === pv.field ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="po-sq" placeholder="Search ${f[1]}" value="${esc(pv.q)}"><button class="btn primary" id="po-sgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="porange"><i data-icon=calendar class=li></i> ${RANGES.find(r => r[0] === pv.range)[1]} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-porange">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === pv.range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dd"><button class="btn" data-dd="pofilter"><i data-icon=list-filter class=li></i> Filter${nF ? ` <span class="pill brand">${nF}</span>` : ''} <i data-icon=chevron-down class=li></i></button>
        <div class="menu wide" id="dd-pofilter"><h6>Status</h6>${STATUSES.map(s => `<label class="ck"><input type="checkbox" data-fs="${s}" ${pv.status.includes(s) ? 'checked' : ''}>${tc(s)}</label>`).join('')}
          <h6>Mode</h6>${XMODES.map(m => `<label class="ck"><input type="checkbox" data-fm="${m}" ${pv.modes.includes(m) ? 'checked' : ''}>${m}</label>`).join('')}
          <div class="between" style="margin-top:10px;gap:8px"><button class="btn sm" id="po-freset">Reset</button><button class="btn sm primary" id="po-fapply">Apply</button></div></div></div>
      <span style="flex:1"></span><button class="btn" id="po-dl"><i data-icon=download class=li></i> Download CSV</button></div>
    <div class="tbl-wrap"><table><thead><tr>${sortHead('date', 'Date')}<th>Reference</th><th>Beneficiary</th><th>Mode</th>${sortHead('amount', 'Amount', 'right')}<th class="right">Fee + GST</th><th>UTR</th><th>Status</th></tr></thead>
    <tbody>${list.length ? list.slice((pv.page - 1) * PAGE_SIZE, pv.page * PAGE_SIZE).map(p => { const b = beneOf(p);
      return `<tr class="click" data-poid="${esc(p.id)}"><td>${fmtDate(p.date)}</td><td><span class="mono">${esc(p.merchantRefId)}</span>${p.batchId ? `<div class="muted" style="font-size:11.5px">Batch ${esc(p.batchId)}</div>` : ''}</td>
        <td>${esc(b.name || '—')}<div class="muted" style="font-size:12px">${esc(dest(b))}</div></td><td>${p.mode}</td><td class="right"><b>${inr(p.amount)}</b></td><td class="right muted">${feeText(p)}</td>
        <td class="mono">${esc(p.utr || '—')}</td><td>${pill(p.status)}</td></tr>`; }).join('')
      : `<tr><td colspan="8">${none ? empty('No payouts yet', 'Add a beneficiary, then create your first payout. Payouts are queued here and sent once PayU Payouts is connected.', '<button class="btn sm primary" data-newpo>+ New payout</button>')
        : empty("We couldn't find any payouts", 'Remove the filters or widen the date range and try again.', '<button class="btn sm" id="po-eclear">Clear filters</button><button class="btn sm" id="po-eall">Show all time</button>')}</td></tr>`}</tbody></table></div>` + pager(list.length);
  }
  function payoutDrawer(id){
    const p = S().payouts.find(x => x.id === id); if (!p) return;
    const b = beneOf(p), st = p.status;
    const reached = { QUEUED: 1, SCHEDULED: 2, IN_PROGRESS: 3, PENDING: 3, WAITING_FOR_RETRY: 3, SUCCESS: 4, FAILED: 4, REVERSED: 5 }[st];
    const steps = [['Created and queued', 1, fmtDate(p.date)], ['Scheduled for the next bank window', 2, ''], ['Sent to bank via ' + p.mode, 3, st === 'WAITING_FOR_RETRY' ? 'bank unavailable, will retry' : st === 'PENDING' ? 'awaiting bank confirmation' : ''],
      [st === 'FAILED' ? 'Failed' : 'Credited to beneficiary', 4, p.utr ? 'UTR ' + p.utr : st === 'FAILED' ? p.failureReason : ''], ...(st === 'REVERSED' ? [['Reversed by the beneficiary bank', 5, p.failureReason]] : [])];
    const dot = n => n > reached ? 'warn" style="opacity:.3' : n === reached && ['FAILED', 'REVERSED'].includes(st) ? 'bad' : n === reached && OPEN.includes(st) ? 'warn' : '';
    openDrawer(`<div class="between"><div><div class="muted" style="font-size:12.5px">Payout to ${esc(b.name || '—')}</div><h2 style="margin:0">${inr(p.amount)}</h2></div><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p>${pill(st)} <span class="muted">${fmtDate(p.date)}</span></p>
      ${st === 'QUEUED' && !p.payuRefId ? `<div class="card" style="background:var(--warn-soft);border-color:transparent;margin-bottom:14px"><b>Not sent yet.</b> This payout is queued in Bizpole Pay. It goes to the bank once PayU Payouts is connected to your account.</div>` : ''}
      ${['FAILED', 'REVERSED'].includes(st) ? `<div class="card" style="background:var(--bad-soft);border-color:transparent;margin-bottom:14px"><b>${st === 'FAILED' ? 'Failure reason' : 'Reversal'}:</b> ${esc(p.failureReason || 'not reported')}.</div>` : ''}
      <h3>Payout</h3><dl class="kv"><dt>Reference</dt><dd class="mono">${esc(p.merchantRefId)}</dd><dt>PayU reference</dt><dd class="mono">${esc(p.payuRefId || '—')}</dd><dt>UTR</dt><dd class="mono">${esc(p.utr || '—')}</dd>
        <dt>Mode</dt><dd>${p.mode}</dd><dt>Purpose</dt><dd>${esc(p.purpose || '—')}</dd>${p.batchId ? `<dt>Batch</dt><dd class="mono">${esc(p.batchId)}</dd>` : ''}<dt>Created by</dt><dd>${esc(p.createdBy || '—')}</dd></dl>
      <h3 style="margin-top:18px">Charges</h3><dl class="kv"><dt>Amount</dt><dd>${inr(p.amount)}</dd>${p.fee == null ? `<dt>Fee</dt><dd class="muted">Reported by PayU when the payout is processed</dd>`
        : `<dt>Fee</dt><dd>${inr(p.fee)}</dd><dt>GST</dt><dd>${inr(p.tax || 0)}</dd><dt>Total debited</dt><dd><b>${inr(p.amount + p.fee + (p.tax || 0))}</b></dd>`}</dl>
      <h3 style="margin-top:18px">Beneficiary</h3><dl class="kv"><dt>Name</dt><dd>${esc(b.name || '—')}</dd>${b.vpa ? `<dt>VPA</dt><dd class="mono">${esc(b.vpa)}</dd>` : `<dt>Account</dt><dd class="mono">••••${esc(b.accountLast4 || '')}</dd><dt>IFSC</dt><dd class="mono">${esc(b.ifsc || '—')} · ${bankOf(b.ifsc)}</dd>`}<dt>Beneficiary ID</dt><dd class="mono">${esc(b.payuBeneficiaryId || '—')}</dd></dl>
      <h3 style="margin-top:18px">Timeline</h3>${steps.map(([s, n, sub]) => `<p style="font-size:13px;margin:6px 0"><span class="dot ${dot(n)}"></span>${s}${sub ? ` <span class="muted">· ${esc(sub)}</span>` : ''}</p>`).join('')}
      <div class="row" style="margin-top:20px">${['FAILED', 'REVERSED'].includes(st) ? `<button class="btn primary" onclick="payouts_retry('${esc(p.id)}')">Retry payout</button>` : ''}
        ${p.utr ? `<button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(p.utr)}');toast('UTR copied')">Copy UTR</button>` : ''}</div>`);
  }
  window.payouts_retry = id => {
    const p = S().payouts.find(x => x.id === id); if (!p) return;
    let ref = p.merchantRefId + '-R1', n = 1;
    while (S().payouts.some(x => x.merchantRefId === ref)) ref = p.merchantRefId + '-R' + (++n);
    payoutModal({ beneficiaryId: p.beneficiaryId, amount: p.amount, mode: p.mode, ref: ref.slice(0, 40), purpose: p.purpose });
  };

  /* ---------- dialogs ---------- */
  function payoutModal(pre = {}){
    const benes = S().benes;
    if (!benes.length) { toast('Add a beneficiary first'); show('b'); return; }
    const sel = (benes.find(b => b.id === pre.beneficiaryId) || benes.find(b => b.verified) || benes[0]).id;
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">New payout</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <p class="muted" style="margin-bottom:0">The payout is queued in Bizpole Pay and sent to the bank once PayU Payouts is connected to your account.</p>
      <label>Beneficiary</label><select id="np-b">${benes.map(b => `<option value="${esc(b.id)}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)} · ${esc(dest(b))}${b.verified ? '' : ' (unverified)'}</option>`).join('')}</select>
      <div class="row"><div><label>Amount (₹)</label><input id="np-a" type="number" min="1" step="0.01" value="${pre.amount ? (pre.amount / 100).toFixed(2) : ''}" placeholder="0.00"></div>
        <div><label>Mode</label><select id="np-m">${XMODES.map(m => `<option ${m === pre.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
      <div class="row"><div><label>Reference <span class="muted">(unique, max 40)</span></label><input id="np-r" maxlength="40" value="${esc(pre.ref || nextRef())}"></div>
        <div><label>Purpose</label><select id="np-p">${['Vendor payment', 'Partner commission', 'Customer refund', 'Salary advance', 'Other'].map(x => `<option ${x === pre.purpose ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <div class="po-calc" id="np-calc"></div><div id="np-err"></div>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="np-go">Queue payout</button></div>`);
    const read = () => ({ bene: benes.find(b => b.id === $('#np-b').value), amount: Math.round(parseFloat($('#np-a').value) * 100), mode: $('#np-m').value, ref: $('#np-r').value.trim(), purpose: $('#np-p').value });
    const calc = () => {
      const v = read(), { fee, tax } = feeOf(v.mode), amt = v.amount > 0 ? v.amount : 0;
      $('#np-calc').innerHTML = `<span>Estimated fee ${inr(fee)} + GST ${inr(tax)}</span><span>Estimated total <b>${inr(amt + fee + tax)}</b></span>
        <div class="muted" style="flex-basis:100%;font-size:12px">${v.mode === 'RTGS' ? 'RTGS: minimum ₹2,00,000, bank hours only.' : v.mode === 'UPI' ? 'UPI: up to ₹1,00,000, to the beneficiary VPA.' : v.mode === 'IMPS' ? 'IMPS: instant, up to ₹5,00,000.' : 'NEFT: settles in half-hourly batches.'}
        ${v.bene && !v.bene.verified ? '<br><span style="color:var(--warn)">This beneficiary is not verified yet.</span>' : ''}</div>`;
      $('#np-err').innerHTML = '';
    };
    // Picking a VPA-only beneficiary switches the mode to UPI; picking a bank beneficiary moves off UPI.
    $('#np-b').onchange = () => { const b = read().bene; if (b.vpa && !b.ifsc) $('#np-m').value = 'UPI'; else if (!b.vpa && $('#np-m').value === 'UPI') $('#np-m').value = 'IMPS'; calc(); };
    if (!pre.mode) $('#np-b').onchange();
    ['#np-a', '#np-m'].forEach(s => { $(s).oninput = calc; $(s).onchange = calc; });
    calc();
    $('#np-go').onclick = async () => {
      const v = read(), err = validate(v);
      if (err) { $('#np-err').innerHTML = `<div class="notice bad">${err}</div>`; return; }
      const btn = $('#np-go'); btn.disabled = true;
      try {
        await api('/payouts', { method: 'POST', body: { beneficiaryId: v.bene.id, amount: v.amount, mode: v.mode, ref: v.ref, purpose: v.purpose } });
        await refresh();
      } catch (e) { btn.disabled = false; $('#np-err').innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; return; }
      closeAll(); toast(`Payout queued · ${inr(v.amount)} to ${v.bene.name}`); pv.tab = 'p'; redraw();
    };
  }
  function beneModal(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Add beneficiary</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      <div class="tabs" style="margin:10px 0 0"><button class="on" data-btype="bank">Bank account</button><button data-btype="vpa">UPI VPA</button></div>
      <label>Name</label><input id="ab-n" maxlength="100" placeholder="As on the bank account">
      <div id="ab-bank"><label>Account number</label><input id="ab-acc" inputmode="numeric" autocomplete="off" placeholder="9–18 digits">
        <label>Confirm account number</label><input id="ab-acc2" inputmode="numeric" autocomplete="off">
        <label>IFSC</label><input id="ab-ifsc" maxlength="11" placeholder="ABCD0123456" style="text-transform:uppercase"></div>
      <div id="ab-vpa" style="display:none"><label>UPI ID (VPA)</label><input id="ab-v" placeholder="name@bank"></div>
      <div class="row"><div><label>Email <span class="muted">(optional)</span></label><input id="ab-e" type="email"></div><div><label>Mobile <span class="muted">(optional)</span></label><input id="ab-m" inputmode="numeric" maxlength="10"></div></div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">The account number is stored encrypted; only the last 4 digits are shown.</p>
      <div id="ab-err"></div>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="ab-go">Add beneficiary</button></div>`);
    let type = 'bank';
    document.querySelectorAll('[data-btype]').forEach(b => b.onclick = () => { type = b.dataset.btype; document.querySelectorAll('[data-btype]').forEach(x => x.classList.toggle('on', x === b)); $('#ab-bank').style.display = type === 'bank' ? '' : 'none'; $('#ab-vpa').style.display = type === 'vpa' ? '' : 'none'; });
    $('#ab-go').onclick = async () => {
      const name = $('#ab-n').value.trim(), acc = $('#ab-acc').value.replace(/\s/g, ''), ifsc = $('#ab-ifsc').value.trim().toUpperCase(), vpa = $('#ab-v').value.trim(), email = $('#ab-e').value.trim(), mob = $('#ab-m').value.trim();
      const err = name.length < 2 ? 'Enter the beneficiary name.'
        : type === 'bank' ? (!/^\d{9,18}$/.test(acc) ? 'Account number must be 9–18 digits.' : acc !== $('#ab-acc2').value.replace(/\s/g, '') ? 'Account numbers do not match.'
          : !IFSC.test(ifsc) ? 'IFSC must look like ABCD0123456: 4 letters, a zero, then 6 letters or digits.' : '')
        : !VPA.test(vpa) ? 'Enter a valid UPI ID, like name@bank.' : S().benes.some(b => (b.vpa || '').toLowerCase() === vpa.toLowerCase()) ? 'This UPI ID is already a beneficiary.' : '';
      const err2 = err || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter a valid email or leave it blank.' : mob && !/^[6-9]\d{9}$/.test(mob) ? 'Mobile must be 10 digits starting with 6–9.' : '');
      if (err2) { $('#ab-err').innerHTML = `<div class="notice bad">${err2}</div>`; return; }
      const btn = $('#ab-go'); btn.disabled = true;
      try {
        await api('/payouts/beneficiaries', { method: 'POST', body: type === 'bank' ? { type, name, accountNumber: acc, ifsc, email, mobile: mob } : { type, name, vpa, email, mobile: mob } });
        await refresh();
      } catch (e) { btn.disabled = false; $('#ab-err').innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; return; }
      closeAll(); toast(`${name} added`); pv.tab = 'b'; redraw();
    };
  }
  window.payouts_verify = async id => {
    try { await api(`/payouts/beneficiaries/${encodeURIComponent(id)}/verify`, { method: 'POST' }); await refresh(); toast('Beneficiary verified'); redraw(); }
    catch (e) { apiFail(e); }
  };

  /* ---------- Beneficiaries tab ---------- */
  function renderBenes(){
    const q = pv.bq.trim().toLowerCase(), all = S().benes;
    const list = all.filter(b => (pv.bver === 'all' || (pv.bver === 'v') === b.verified) && (!q || [b.name, b.payuBeneficiaryId, b.vpa, b.ifsc].some(x => String(x || '').toLowerCase().includes(q))));
    return `<div class="toolbar"><div class="searchbox"><input id="po-bq" placeholder="Search name, beneficiary ID, IFSC or VPA" value="${esc(pv.bq)}"><button class="btn primary" id="po-bgo">Search</button></div>
      <div class="dd"><button class="btn" data-dd="bver"><i data-icon=list-filter class=li></i> ${pv.bver === 'all' ? 'All beneficiaries' : pv.bver === 'v' ? 'Verified' : 'Unverified'} <i data-icon=chevron-down class=li></i></button>
        <div class="menu" id="dd-bver">${[['all', 'All beneficiaries'], ['v', 'Verified'], ['u', 'Unverified']].map(([k, l]) => `<button data-bver="${k}" class="${k === pv.bver ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <span class="muted" style="font-size:13px">${all.filter(b => b.verified).length} of ${all.length} verified</span><span style="flex:1"></span><button class="btn primary" data-addbene>+ Add beneficiary</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>Beneficiary</th><th>Beneficiary ID</th><th>Account / VPA</th><th>Bank</th><th>Mobile</th><th>Added</th><th class="right">Paid (all time)</th><th>Status</th><th class="right">Action</th></tr></thead>
    <tbody>${list.length ? list.map(b => `<tr><td><b style="font-weight:600">${esc(b.name)}</b><div class="muted" style="font-size:12px">${esc(b.email || '—')}</div></td><td class="mono">${esc(b.payuBeneficiaryId || '—')}</td>
        <td class="mono">${b.vpa ? esc(b.vpa) : '••••' + esc(b.accountLast4 || '')}</td><td>${b.vpa ? 'UPI' : `${bankOf(b.ifsc)}<div class="mono muted" style="font-size:11.5px">${esc(b.ifsc || '')}</div>`}</td><td>${esc(b.mobile || '—')}</td><td>${fmtDate(b.createdAt)}</td>
        <td class="right">${inr(b.paid)}<div class="muted" style="font-size:12px">${b.paidCount} payouts</div></td>
        <td>${b.verified ? '<span class="pill ok">Verified</span>' : '<span class="pill warn">Unverified</span>'}</td>
        <td class="right"><span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap">${b.verified ? '' : `<button class="btn sm" onclick="payouts_verify('${esc(b.id)}')">Verify</button>`}<button class="btn sm ${b.verified ? '' : 'primary'}" data-pay="${esc(b.id)}">Pay</button></span></td></tr>`).join('')
      : `<tr><td colspan="9">${all.length ? empty('No matching beneficiaries', 'Try another name, ID or IFSC, or show all beneficiaries.', '<button class="btn sm" id="po-bclear">Clear search</button>')
        : empty('No beneficiaries yet', 'Add the bank account or UPI ID you want to pay. It is verified with PayU before money moves.', '<button class="btn sm primary" data-addbene>+ Add beneficiary</button>')}</td></tr>`}</tbody></table></div>`;
  }

  /* ---------- Bulk upload tab ---------- */
  const sampleRows = () => { const n = +nextRef().slice(5); return S().benes.slice(0, 3).map((b, i) => `VEND-${n + i},${beneRef(b)},${(2500 + i * 1250).toFixed(2)},${b.vpa ? 'UPI' : 'IMPS'},Vendor payment`); };
  const batchStatus = b => { const k = Object.keys(b.statuses); return k.length === 1 ? pill(k[0]) : `<span class="pill">Mixed</span> <span class="muted" style="font-size:12px">${k.map(s => `${b.statuses[s]} ${tc(s).toLowerCase()}`).join(' · ')}</span>`; };
  function renderBulk(){
    return `<div class="grid g-21" style="margin-bottom:18px">
      <div class="card"><h3>Upload a bulk payout file</h3><p class="muted" style="margin:0 0 12px">Pay many beneficiaries at once. Every row is checked against your beneficiaries and mode rules; valid rows are queued together as one batch.</p>
        <label class="drop" id="po-drop"><input type="file" id="po-file" accept=".csv" hidden><div style="font-size:28px"><i data-icon=upload class=li></i></div><b>Drop a CSV here or click to choose</b><span class="muted" style="font-size:13px">Max 1,000 rows · UTF-8 CSV</span></label>
        <div id="po-preview"></div></div>
      <div class="card"><h3>File format</h3><p class="muted" style="margin:0 0 10px;font-size:13px">One payout per row, with a header row:</p>
        <pre class="code">reference,beneficiary_id,amount,mode,purpose
${S().benes.length ? sampleRows().join('\n') : 'VEND-1,&lt;beneficiary id&gt;,2500.00,IMPS,Vendor payment'}</pre>
        <ul class="muted" style="font-size:13px;padding-left:18px;margin:10px 0"><li><b>reference</b>: unique, up to 40 characters</li><li><b>beneficiary_id</b>: one of your beneficiary IDs</li><li><b>amount</b>: in rupees; RTGS needs ₹2,00,000 or more</li><li><b>mode</b>: IMPS, NEFT, RTGS or UPI (UPI needs a VPA)</li></ul>
        <div class="row" style="margin-top:auto;gap:8px"><button class="btn" id="po-sample" ${S().benes.length ? '' : 'disabled'}><i data-icon=download class=li></i> Download sample file</button></div></div></div>
    <h3 style="margin:0 0 10px">Batch history</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Uploaded</th><th>Batch ID</th><th class="right">Payouts</th><th class="right">Amount</th><th>Status</th></tr></thead>
    <tbody>${S().batches.length ? S().batches.map(b => `<tr><td>${fmtDate(b.at)}</td><td class="mono">${esc(b.id)}</td><td class="right">${b.rows}</td><td class="right">${inr(b.amount)}</td><td>${batchStatus(b)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">No bulk files uploaded yet.</td></tr>'}</tbody></table></div>`;
  }
  function parseBulk(text){
    const lines = text.trim().split(/\r?\n/), header = (lines.shift() || '').split(',').map(h => h.trim().toLowerCase());
    const ix = k => header.indexOf(k), iR = ix('reference'), iB = ix('beneficiary_id'), iA = ix('amount'), iM = ix('mode'), iP = ix('purpose');
    if (iR < 0 || iB < 0 || iA < 0 || iM < 0) return { error: 'Header must include reference, beneficiary_id, amount and mode.' };
    if (lines.length > 1000) return { error: 'A file can have at most 1,000 rows.' };
    const taken = new Set();
    return { rows: lines.map((line, n) => ({ line, n })).filter(x => x.line.trim()).map(({ line, n }) => {
      const c = line.split(',').map(x => x.trim()), ref = c[iR] || '', bid = c[iB] || '', amount = Math.round(parseFloat(c[iA]) * 100), mode = (c[iM] || '').toUpperCase();
      const bene = S().benes.find(b => b.payuBeneficiaryId === bid || b.id === bid), v = { ref, bene, amount, mode, purpose: iP >= 0 ? c[iP] : '' };
      const error = validate(v, taken);
      if (!error) taken.add(ref.toLowerCase());
      return { line: n + 2, ...v, bid, error };
    }) };
  }
  function showBulkPreview(name, parsed){
    if (parsed.error) { $('#po-preview').innerHTML = `<div class="notice bad">${parsed.error}</div>`; return; }
    const ok = parsed.rows.filter(r => !r.error), bad = parsed.rows.filter(r => r.error), total = ok.reduce((a, r) => a + r.amount, 0);
    $('#po-preview').innerHTML = `<div class="between" style="margin:14px 0 8px"><b>${esc(name)}</b><span><span class="pill ok">${ok.length} valid</span> ${bad.length ? `<span class="pill bad">${bad.length} with errors</span>` : ''}</span></div>
      <div class="tbl-wrap" style="max-height:240px"><table><thead><tr><th>Row</th><th>Reference</th><th>Beneficiary</th><th>Mode</th><th class="right">Amount</th><th>Check</th></tr></thead><tbody>
      ${parsed.rows.map(r => `<tr><td>${r.line}</td><td class="mono">${esc(r.ref)}</td><td>${r.bene ? esc(r.bene.name) : `<span class="mono">${esc(r.bid)}</span>`}</td><td>${esc(r.mode)}</td><td class="right">${r.amount > 0 ? inr(r.amount) : '—'}</td>
        <td>${r.error ? `<span style="color:var(--bad)">${esc(r.error)}</span>` : '<span style="color:var(--ok)">✓ Ready</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div id="po-berr"></div>
      <div class="row" style="margin-top:12px;gap:8px"><button class="btn" id="po-bcancel">Cancel</button><button class="btn primary" id="po-bsubmit" ${ok.length ? '' : 'disabled'}>Queue ${ok.length} payouts · ${inr(total)}</button></div>`;
    $('#po-bcancel').onclick = () => { $('#po-preview').innerHTML = ''; $('#po-file').value = ''; };
    $('#po-bsubmit').onclick = async () => {
      const btn = $('#po-bsubmit'); btn.disabled = true;
      let r;
      try {
        r = await api('/payouts/bulk', { method: 'POST', body: { file: name, rows: ok.map(x => ({ line: x.line, ref: x.ref, beneficiaryId: x.bene.id, amount: x.amount, mode: x.mode, purpose: x.purpose })) } });
        await refresh();
      } catch (e) { btn.disabled = false; $('#po-berr').innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; return; }
      const rejected = r.results.filter(x => x.error);
      toast(r.queued ? `${r.queued} payouts queued in batch ${r.batchId}${rejected.length ? ` · ${rejected.length} rejected` : ''}` : 'No payouts were queued'); redraw();
    };
  }

  /* ---------- tabs and binding ---------- */
  function show(t){
    if (t !== pv.tab) pv.page = 1;
    pv.tab = t;
    document.querySelectorAll('[data-pt]').forEach(b => b.classList.toggle('on', b.dataset.pt === t));
    $('#po-kpis').innerHTML = kpis();
    $('#po-view').innerHTML = t === 'p' ? renderPayouts() : t === 'b' ? renderBenes() : renderBulk();
    bindView(t);
  }
  const redraw = () => { if ($('#po-view')) show(pv.tab); };
  function bindView(t){
    const v = $('#po-view');
    v.querySelectorAll('[data-dd]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = $('#dd-' + b.dataset.dd), open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); });
    v.querySelectorAll('.menu').forEach(m => m.onclick = e => e.stopPropagation());
    v.querySelectorAll('[data-newpo]').forEach(b => b.onclick = () => payoutModal());
    v.querySelectorAll('[data-addbene]').forEach(b => b.onclick = beneModal);
    if (t === 'p') {
      $('#po-sf').onchange = e => { pv.field = e.target.value; pv.q = ''; redraw(); };
      const search = () => { pv.q = $('#po-sq').value; pv.page = 1; redraw(); };
      $('#po-sgo').onclick = search; $('#po-sq').onkeydown = e => { if (e.key === 'Enter') search(); };
      v.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { pv.range = b.dataset.range; pv.page = 1; redraw(); });
      $('#po-fapply').onclick = () => { pv.status = [...v.querySelectorAll('[data-fs]:checked')].map(x => x.dataset.fs); pv.modes = [...v.querySelectorAll('[data-fm]:checked')].map(x => x.dataset.fm); pv.page = 1; redraw(); };
      $('#po-freset').onclick = () => { pv.status = []; pv.modes = []; pv.page = 1; redraw(); };
      v.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { const key = h.dataset.sort; pv.sort = { key, dir: pv.sort.key === key ? -pv.sort.dir : -1 }; redraw(); });
      v.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { pv.page = +b.dataset.pg; redraw(); });
      v.querySelectorAll('tr[data-poid]').forEach(r => r.onclick = () => payoutDrawer(r.dataset.poid));
      if ($('#po-eclear')) { $('#po-eclear').onclick = () => { pv.status = []; pv.modes = []; pv.q = ''; redraw(); }; $('#po-eall').onclick = () => { pv.range = 'all'; redraw(); }; }
      $('#po-dl').onclick = () => {
        const q = s => `"${String(s).replace(/"/g, '""')}"`, money = x => x == null ? '' : (x / 100).toFixed(2);
        const list = rows(), csv = 'date,reference,batch_id,beneficiary,beneficiary_id,mode,amount,fee,tax,utr,payu_ref,status\n' + list.map(p => { const b = beneOf(p); return [p.date.toISOString(), p.merchantRefId, p.batchId || '', q(b.name || ''), b.payuBeneficiaryId || b.id || '', p.mode, money(p.amount), money(p.fee), money(p.tax), p.utr, p.payuRefId || '', p.status].join(','); }).join('\n') + '\n';
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `bizpolepay-payouts-${pv.range}.csv`; a.click(); toast(`Downloaded ${list.length} payouts`);
      };
    }
    if (t === 'b') {
      const search = () => { pv.bq = $('#po-bq').value; redraw(); };
      $('#po-bgo').onclick = search; $('#po-bq').onkeydown = e => { if (e.key === 'Enter') search(); };
      v.querySelectorAll('[data-bver]').forEach(b => b.onclick = () => { pv.bver = b.dataset.bver; redraw(); });
      v.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => payoutModal({ beneficiaryId: b.dataset.pay }));
      if ($('#po-bclear')) $('#po-bclear').onclick = () => { pv.bq = ''; pv.bver = 'all'; redraw(); };
    }
    if (t === 'u') {
      const read = f => { if (f) f.text().then(txt => showBulkPreview(f.name, parseBulk(txt))); };
      $('#po-file').onchange = e => read(e.target.files[0]);
      const drop = $('#po-drop');
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); read(e.dataTransfer.files[0]); };
      $('#po-sample').onclick = () => {
        const csv = 'reference,beneficiary_id,amount,mode,purpose\n' + sampleRows().join('\n') + '\n';
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'bizpolepay-bulk-payout-sample.csv'; a.click();
      };
    }
  }

  addStyle('payouts', `
    .po-bal{background:var(--ink);color:var(--card);border-color:transparent}
    .po-bal small{color:var(--soft);opacity:.8;font-size:12.5px}.po-bal b{display:block;font-size:24px;letter-spacing:-.02em;margin:2px 0;color:var(--accent)}.po-bal .d{font-size:12px;color:var(--soft);opacity:.8}
    .po-calc{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;background:var(--soft);border-radius:10px;padding:10px 12px;margin-top:12px;font-size:13px}
  `);

  BIND.payouts = () => {
    if (liveLocked()) return;
    $('#po-new').onclick = () => payoutModal();
    $('#po-bulk').onclick = () => show('u');
    document.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => show(b.dataset.pt));
    show(pv.tab);
  };
})();

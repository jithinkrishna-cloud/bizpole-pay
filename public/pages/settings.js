// Page: settings. Uses globals from app.html core (state, api, LOAD, helpers, PAGES, BIND).
(() => {
  // Filled from GET /settings and GET /settings/audit (not mode-scoped).
  const S = { tab: 'biz', aq: '', biz: null, banks: [], team: [], sessions: [], sso: null, audit: [], gw: { credentials: [], apiKeys: [], webhooks: [], deliveries: [] } };
  const ROLES = ['Owner', 'Admin', 'Finance', 'Developer', 'Support', 'Viewer'];
  // Matches the server's role checks (router WRITE_ROLES + per-route owner/admin checks).
  const PERMS = [
    ['View transactions & settlements', [1, 1, 1, 1, 1, 1]], ['Issue refunds', [1, 1, 1, 1, 0, 0]], ['Create payment links', [1, 1, 1, 1, 0, 0]],
    ['Manage API keys & webhooks', [1, 1, 0, 1, 0, 0]], ['Change bank account', [1, 1, 0, 0, 0, 0]], ['Manage team', [1, 1, 0, 0, 0, 0]], ['Fill in onboarding', [1, 1, 0, 0, 0, 0]],
  ];
  const isAdmin = () => ['OWNER', 'ADMIN'].includes(state.role);
  const canGw = () => ['OWNER', 'ADMIN', 'DEVELOPER'].includes(state.role);

  const roleLabel = r => r ? r[0] + r.slice(1).toLowerCase() : '—';

  LOAD.settings = async () => {
    const [r, a] = await Promise.all([api('/settings', { mode: false }), api('/settings/audit', { mode: false })]);
    S.biz = r.business;
    S.banks = r.banks.map(b => ({ ...b, added: toDate(b.added) }));
    S.team = r.team.map(m => ({ ...m, lastLoginAt: toDate(m.lastLoginAt) }));
    S.sessions = r.sessions.map(s => ({ ...s, started: toDate(s.started) }));
    S.sso = r.sso;
    S.audit = a.map(x => ({ ...x, at: toDate(x.at) }));
  };
  // PayU adapter, API keys and webhooks for the current mode (from the developer endpoints).
  LOAD.payu = async (mode) => {
    const r = await api('/developer', { mode });
    S.gw.credentials = (r.credentials || []).map(c => ({ ...c, issuedAt: toDate(c.issuedAt) }));
    S.gw.apiKeys = (r.apiKeys || []).map(k => ({ ...k, created: toDate(k.created), lastUsed: toDate(k.lastUsed) }));
    S.gw.webhooks = r.webhooks || [];
    S.gw.deliveries = (r.deliveries || []).map(d => ({ ...d, at: toDate(d.at) }));
  };

  const refreshAudit = async () => { try { S.audit = (await api('/settings/audit', { mode: false })).map(x => ({ ...x, at: toDate(x.at) })); } catch (e) { /* audit view refreshes on next load */ } };

  const day = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const ago = d => {
    if (!d) return 'Never';
    const m = Math.round((Date.now() - d) / 60000);
    return m < 2 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : m < 2880 ? 'Yesterday' : day(d);
  };
  const device = ua => {
    const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl\//i.test(ua) ? 'curl' : 'Browser';
    const o = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return o ? `${b} · ${o}` : b;
  };
  const ACTION = {
    'user.signup': 'Signed up', 'user.password_changed': 'Password changed', 'user.password_reset': 'Password reset',
    'merchant.profile_updated': 'Business profile updated', 'bank_account.added': 'Bank account added', 'bank_account.primary_changed': 'Primary bank account changed', 'bank_account.removed': 'Bank account removed',
    'member.added': 'Team member added', 'member.role_changed': 'Team role changed', 'member.removed': 'Team member removed',
    'session.revoked': 'Session signed out', 'session.revoked_others': 'Other sessions signed out', 'sso.saved': 'SSO settings saved',
    'onboarding.step_draft': 'Onboarding draft saved', 'onboarding.step_submitted': 'Onboarding step submitted', 'onboarding.submitted': 'Application submitted',
    'credential.added': 'PayU credentials added', 'api_key.created': 'API key created', 'api_key.revoked': 'API key revoked',
    'webhook.created': 'Webhook added', 'webhook.updated': 'Webhook updated', 'webhook.deleted': 'Webhook deleted', 'webhook.test_sent': 'Webhook test sent', 'webhook.redelivered': 'Webhook redelivered',
    'refund.requested': 'Refund requested',
  };
  const actionLabel = a => ACTION[a] || a.replace(/[._]/g, ' ').replace(/^./, c => c.toUpperCase());

  const err = (id, msg) => { const el = $('#' + id); if (!el) return; el.classList.toggle('st-bad', !!msg); const m = el.parentElement.querySelector('.st-err'); if (m) m.textContent = msg || ''; };
  // Server validation errors carry { field } so they land under the right input.
  const fieldErr = (e, fallbackId) => { const f = e.data && e.data.field; if (f && $('#' + f)) err(f, e.message); else if (fallbackId && $('#' + fallbackId)) err(fallbackId, e.message); else apiFail(e); };
  const field = (label, id, value = '', attrs = '') => `<div class="st-f"><label for="${id}">${label}</label><input id="${id}" value="${esc(value == null ? '' : value)}" ${attrs}><span class="st-err"></span></div>`;
  const x = '<button class="x" onclick="closeAll()" aria-label="Close"><i data-icon=x class=li></i></button>';
  const busy = (b, on) => { if (b) b.disabled = on; };
  const none = '<span class="muted">Not provided yet</span>';

  // Notifications: no preference storage and no email/SMS provider, so the tab explains that instead of offering toggles that do nothing.
  const TABS = [['biz', 'Business profile'], ['payu', 'Payment gateway'], ['bank', 'Bank accounts'], ['team', 'Team & roles'], ['sec', 'Security'], ['notif', 'Notifications'], ['audit', 'Audit log']];
  PAGES.settings = () => head('Settings', 'Your business, payment gateway, payout accounts, people and security.') +
    `<div class="tabs">${TABS.map(([k, l]) => `<button data-st="${k}" class="${k === S.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="sv"></div>`;

  const VIEW = {
    biz: () => { const b = S.biz; if (!b) return '<div class="card empty"><p class="muted">Couldn\'t load your business profile. Reload the page to try again.</p></div>';
      const verified = b.status === 'LIVE';
      return `<div class="grid g-21"><div class="card"><div class="between"><h3>Business details</h3>${statusPill(b.status)}</div>
        <div class="grid g2" style="gap:4px 16px">${field('Display name (shown on checkout)', 'b-display', b.displayName, isAdmin() ? '' : 'disabled')}${field('Support email', 'b-email', b.email, 'type="email" ' + (isAdmin() ? '' : 'disabled'))}
          ${field('Support phone', 'b-phone', b.mobile, 'inputmode="tel" ' + (isAdmin() ? '' : 'disabled'))}</div>
        <div class="between" style="margin-top:14px"><span class="muted" style="font-size:13px">${isAdmin() ? 'Display name and support contacts update instantly.' : 'Only the owner or an admin can edit these.'}</span>${isAdmin() ? '<button class="btn primary" id="b-save">Save changes</button>' : ''}</div></div>
      <div class="card"><h3>Registered details</h3><dl class="kv"><dt>Legal name</dt><dd>${b.legalName ? esc(b.legalName) : none}</dd><dt>Business type</dt><dd>${b.entity ? esc(b.entity) : none}</dd><dt>Category</dt><dd>${b.category ? esc(b.category) : none}</dd>
        <dt>PAN</dt><dd class="mono">${b.panLast4 ? '••••••' + esc(b.panLast4) : none}</dd><dt>GSTIN</dt><dd class="mono">${b.gstin ? esc(b.gstin) : none}</dd><dt>Website</dt><dd>${b.website ? esc(b.website) : none}</dd><dt>Address</dt><dd>${b.address ? esc(b.address) : none}</dd></dl>
        <p class="muted" style="font-size:13px;margin:14px 0 10px">${verified ? 'These were verified during onboarding. Contact support to change them; changes need a fresh KYC review.' : 'These come from onboarding. Edit them there until your application is submitted.'}</p>
        ${verified ? '' : '<a class="btn" href="#/onboarding" style="margin-top:auto;align-self:flex-start">Open onboarding</a>'}</div></div>`; },
    bank: () => `<div class="between" style="margin-bottom:12px"><span class="muted">Settlements are paid to the primary account. ₹1 penny-drop verification isn't connected yet, so new accounts show as unverified.</span>${isAdmin() ? '<button class="btn primary" id="k-add">+ Add bank account</button>' : ''}</div>
      ${S.banks.length ? `<div class="grid g2">${S.banks.map(b => `<div class="card"><div class="between"><h3 style="margin:0">${esc(b.bank)} ••••${esc(b.last4)}</h3>${b.primary ? '<span class="pill brand">Primary</span>' : ''}</div>
        <dl class="kv" style="margin-top:12px"><dt>Account holder</dt><dd>${esc(b.holder)}</dd><dt>IFSC</dt><dd class="mono">${esc(b.ifsc)}</dd><dt>Verification</dt><dd>${b.verified ? `<span class="pill ok">Penny-drop matched</span>${b.nameAtBank ? ' ' + esc(b.nameAtBank) : ''}` : '<span class="pill warn">Not verified</span>'}</dd><dt>Added</dt><dd>${day(b.added)}</dd></dl>
        <div class="row" style="margin-top:auto;padding-top:14px;gap:8px">${b.primary ? '<span class="muted" style="font-size:13px">Receives settlements</span>' : isAdmin() ? `<button class="btn sm" data-primary="${esc(b.id)}">Make primary</button><button class="btn sm danger" data-rmbank="${esc(b.id)}">Remove</button>` : ''}</div></div>`).join('')}</div>`
        : `<div class="card empty"><div style="font-size:30px"><i data-icon=landmark class=li></i></div><h3 style="margin:8px 0">No bank account yet</h3><p class="muted">Add the account you want settlements paid into. You can also add it in onboarding.</p>${isAdmin() ? '' : '<p class="muted">Ask the owner or an admin to add one.</p>'}</div>`}`,
    team: () => `<div class="grid g-21"><div><div class="between" style="margin-bottom:12px"><span class="muted">${S.team.length} ${S.team.length === 1 ? 'person has' : 'people have'} access to this account</span>${isAdmin() ? '<button class="btn primary" id="t-inv">+ Add member</button>' : ''}</div>
        <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
        ${S.team.map(m => { const self = m.email === state.user.email, editable = isAdmin() && m.role !== 'OWNER' && !self && (state.role === 'OWNER' || m.role !== 'ADMIN');
          return `<tr><td>${esc(m.name)}${self ? ' <span class="muted">(you)</span>' : ''}</td><td>${esc(m.email)}</td>
          <td>${m.role === 'OWNER' ? '<span class="pill brand">Owner</span>' : editable ? `<select data-role="${esc(m.id)}" style="width:auto;padding:5px 8px">${ROLES.slice(state.role === 'OWNER' ? 1 : 2).map(r => `<option value="${r.toUpperCase()}" ${r.toUpperCase() === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select>` : roleLabel(m.role)}</td>
          <td>${m.status === 'ACTIVE' ? '<span class="pill ok">Active</span>' : `<span class="pill bad">${roleLabel(m.status)}</span>`}</td><td>${ago(m.lastLoginAt)}</td>
          <td class="right">${editable ? `<button class="btn sm danger" data-rm="${esc(m.id)}">Remove</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="card"><h3>What each role can do</h3><div class="tbl-wrap"><table class="st-perm"><thead><tr><th>Permission</th>${ROLES.map(r => `<th>${r.slice(0, 3)}</th>`).join('')}</tr></thead>
        <tbody>${PERMS.map(([p, a]) => `<tr><td>${p}</td>${a.map(v => `<td>${v ? '<span class="st-yes">✓</span>' : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div>`,
    sec: () => { const o = S.sso, others = S.sessions.filter(s => !s.current).length;
      return `<div class="grid g2"><div class="card"><h3>Sign-in</h3>
        <div class="between st-row"><div><b>Password</b><div class="muted" style="font-size:13px">Changing it signs out your other sessions</div></div><button class="btn sm" id="s-pw">Change password</button></div>
        <h3 style="margin-top:18px">Your active sessions</h3>${S.sessions.map(s => `<div class="between st-row"><div><b>${esc(device(s.userAgent))}</b>${s.current ? ' <span class="pill ok">This device</span>' : ''}<div class="muted" style="font-size:13px">${esc(s.ip || 'Unknown IP')} · signed in ${ago(s.started)}</div></div>${s.current ? '' : `<button class="btn sm danger" data-rev="${esc(s.id)}">Sign out</button>`}</div>`).join('') || '<p class="muted">No active sessions.</p>'}
        ${others ? '<button class="btn sm" id="s-revall" style="margin-top:12px;align-self:flex-start">Sign out all other sessions</button>' : ''}</div>
      <div class="card"><div class="between"><h3>Company SSO</h3><span class="pill ${o ? 'warn' : ''}">${o ? 'Saved · sign-in not live' : 'Not configured'}</span></div>
        <p class="muted" style="font-size:13px;margin-top:0">Save your identity provider (Google Workspace, Microsoft Entra ID, Okta). Signing in through SSO isn't available in Bizpole Pay yet, so password sign-in keeps working and SSO is not enforced.</p>
        ${field('Email domain', 'o-domain', o ? o.domain : (state.user.email.split('@')[1] || ''), isAdmin() ? '' : 'disabled')}
        <div class="st-f"><label for="o-proto">Protocol</label><select id="o-proto" ${isAdmin() ? '' : 'disabled'}>${[['oidc', 'OIDC'], ['saml', 'SAML 2.0']].map(([v, l]) => `<option value="${v}" ${o && o.protocol === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${field('Issuer / metadata URL', 'o-issuer', o ? o.issuer : '', 'placeholder="https://login.microsoftonline.com/…" ' + (isAdmin() ? '' : 'disabled'))}
        <div id="o-res" class="muted" style="font-size:13px;margin-top:6px"></div>
        ${isAdmin() ? '<div class="row" style="margin-top:auto;padding-top:14px;gap:8px"><button class="btn" id="o-test">Test connection</button><button class="btn primary" id="o-save">Save</button></div>' : ''}</div></div>`; },
    notif: () => `<div class="card"><h3>Email and SMS alerts</h3>
      <div class="notice" style="background:var(--accent-soft);color:var(--ink-2);margin:0">Alerts aren't available yet. Bizpole Pay has no email or SMS provider connected, so nothing would be sent. This page will let you choose alerts once one is set up.</div>
      <p class="muted" style="font-size:13px;margin:12px 0 0">Until then, check Transactions, Settlements and Chargebacks for updates. Alerts will go to ${esc(state.user.email)}.</p></div>`,
    audit: () => {
      const q = S.aq.toLowerCase(), rows = S.audit.filter(a => !q || [actionLabel(a.action), a.action, a.entity || '', a.who, a.ip || ''].some(v => v.toLowerCase().includes(q)));
      return `<div class="toolbar"><input id="a-q" placeholder="Search action, person, entity or IP" value="${esc(S.aq)}" style="max-width:420px"><span style="flex:1"></span><button class="btn" id="a-dl" ${S.audit.length ? '' : 'disabled'}><i data-icon=download class=li></i> Download CSV</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Entity</th><th>Mode</th><th>IP address</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td>${fmtDate(a.at)}</td><td>${esc(a.who)}</td><td>${esc(actionLabel(a.action))}</td><td>${esc(a.entity || '—')}</td><td>${a.mode ? a.mode.toLowerCase() : '—'}</td><td class="mono">${esc(a.ip || '—')}</td></tr>`).join('')
        || `<tr><td colspan="6" class="empty">${S.audit.length ? 'No matching activity' : 'No activity recorded yet'}</td></tr>`}</tbody></table></div>`;
    },
  };

  function show(k){ S.tab = k; document.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === k)); $('#sv').innerHTML = VIEW[k](); (BINDV[k] || (() => {}))(); }
  const redraw = async k => { await refreshAudit(); closeAll(); show(k); };

  function addBank(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Add bank account</h2>${x}</div>
      ${field('Account holder name', 'nb-holder')}${field('Account number', 'nb-acc', '', 'inputmode="numeric" autocomplete="off"')}${field('Confirm account number', 'nb-acc2', '', 'inputmode="numeric" autocomplete="off"')}
      ${field('IFSC', 'nb-ifsc', '', 'maxlength="11" style="text-transform:uppercase" placeholder="HDFC0001234"')}
      <p class="muted" style="font-size:13px">The account number is stored encrypted. ₹1 penny-drop verification isn't connected yet, so the account is added as unverified.</p>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="nb-go">Add account</button></div>`);
    $('#nb-go').onclick = async () => {
      const h = $('#nb-holder').value.trim(), a = $('#nb-acc').value.replace(/\s/g, ''), a2 = $('#nb-acc2').value.replace(/\s/g, ''), ifsc = $('#nb-ifsc').value.trim().toUpperCase();
      err('nb-holder', h.length < 3 ? 'Enter the name on the account' : ''); err('nb-acc', /^\d{9,18}$/.test(a) ? '' : 'Account number is 9–18 digits');
      err('nb-acc2', a && a === a2 ? '' : 'Account numbers do not match'); err('nb-ifsc', /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) ? '' : 'IFSC looks like HDFC0001234');
      if (document.querySelector('.modal .st-bad')) return;
      busy($('#nb-go'), true);
      try {
        const r = await api('/settings/banks', { method: 'POST', body: { holder: h, account: a, ifsc }, mode: false });
        S.banks = r.banks.map(b => ({ ...b, added: toDate(b.added) })); toast('Bank account added'); await redraw('bank');
      } catch (e) { fieldErr(e, 'nb-acc'); busy($('#nb-go'), false); }
    };
  }
  function invite(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Add a team member</h2>${x}</div>
      ${field('Work email', 'iv-email', '', 'type="email" placeholder="name@yourbusiness.in"')}
      <div class="st-f"><label for="iv-role">Role</label><select id="iv-role">${ROLES.slice(state.role === 'OWNER' ? 1 : 2).map(r => `<option value="${r.toUpperCase()}">${r}</option>`).join('')}</select><span class="st-err"></span></div>
      <p class="muted" style="font-size:13px">Email invites aren't available yet. The person needs a Bizpole Pay login already; ask them to sign up first, then add them here.</p>
      <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="iv-go">Add member</button></div>`);
    $('#iv-go').onclick = async () => {
      const e = $('#iv-email').value.trim().toLowerCase();
      err('iv-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? 'Enter a valid email' : S.team.some(m => m.email === e) ? 'This person already has access' : '');
      if (document.querySelector('.modal .st-bad')) return;
      busy($('#iv-go'), true);
      try {
        const r = await api('/settings/team', { method: 'POST', body: { email: e, role: $('#iv-role').value }, mode: false });
        S.team = r.team.map(m => ({ ...m, lastLoginAt: toDate(m.lastLoginAt) })); toast(e + ' added'); await redraw('team');
      } catch (er) { fieldErr(er, 'iv-email'); busy($('#iv-go'), false); }
    };
  }
  function changePw(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Change password</h2>${x}</div>
      ${field('Current password', 'pw-old', '', 'type="password" autocomplete="current-password"')}${field('New password', 'pw-new', '', 'type="password" autocomplete="new-password"')}
      <div class="st-meter"><i id="pw-bar"></i></div><span class="muted" id="pw-lbl" style="font-size:12.5px">Use 10+ characters with a number and a symbol</span>
      ${field('Confirm new password', 'pw-new2', '', 'type="password" autocomplete="new-password"')}
      <div class="row" style="margin-top:12px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="pw-go">Update password</button></div>`);
    const score = p => [p.length >= 10, /\d/.test(p), /[^A-Za-z0-9]/.test(p), /[a-z]/.test(p) && /[A-Z]/.test(p)].filter(Boolean).length;
    $('#pw-new').oninput = e => { const s = score(e.target.value); $('#pw-bar').style.width = s * 25 + '%'; $('#pw-bar').style.background = ['var(--bad)', 'var(--bad)', 'var(--warn)', 'var(--accent)', 'var(--ok)'][s]; $('#pw-lbl').textContent = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s]; };
    $('#pw-go').onclick = async () => {
      const o = $('#pw-old').value, n = $('#pw-new').value;
      err('pw-old', o ? '' : 'Enter your current password'); err('pw-new', n.length < 8 ? 'Use at least 8 characters' : score(n) < 3 ? 'Too weak' : n === o ? 'Choose a different password' : ''); err('pw-new2', n === $('#pw-new2').value ? '' : 'Passwords do not match');
      if (document.querySelector('.modal .st-bad')) return;
      busy($('#pw-go'), true);
      try {
        const r = await api('/settings/password', { method: 'POST', body: { current: o, next: n }, mode: false });
        S.sessions = r.sessions.map(s => ({ ...s, started: toDate(s.started) })); toast('Password updated · other sessions signed out'); await redraw('sec');
      } catch (e) { fieldErr(e, 'pw-old'); busy($('#pw-go'), false); }
    };
  }

  const pretty = o => esc(JSON.stringify(o, null, 2));
  function gwSecretModal(title, note, secret, done){
    openModal(`<h2 style="margin:0 0 6px;font-size:20px">${title}</h2><p class="muted">${note}</p>
      <div class="secret"><code style="word-break:break-all">${esc(secret)}</code></div>
      <div class="row" style="margin-top:14px"><button class="btn primary" onclick="closeAll()">${done}</button></div>`);
  }
  function gwCredDialog(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">PayU test credentials</h2>${x}</div>
      <p class="muted" style="font-size:13px">Copy these from your PayU test dashboard. They become the default for test mode. The salt is encrypted and can't be viewed again.</p>
      <label>Merchant ID (MID)</label><input id="gw-mid" inputmode="numeric" autocomplete="off" class="mono">
      <label>Merchant key</label><input id="gw-key" autocomplete="off" class="mono">
      <label>Salt</label><input id="gw-salt" type="password" autocomplete="off" class="mono"><span class="muted" style="font-size:12px">Salts longer than 32 characters are saved as version 2.</span>
      <label>Label <span class="muted" style="font-weight:500">(optional)</span></label><input id="gw-label" placeholder="Test MID" maxlength="60">
      <span id="gw-err" style="color:var(--bad);font-size:12.5px;display:block;margin-top:8px"></span>
      <div class="row" style="margin-top:10px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="gw-go">Save credentials</button></div>`);
    $('#gw-go').onclick = async () => {
      const b = $('#gw-go'), body = { payuMid: $('#gw-mid').value.trim(), merchantKey: $('#gw-key').value.trim(), salt: $('#gw-salt').value.trim(), label: $('#gw-label').value.trim() };
      if (!/^\d{4,12}$/.test(body.payuMid)) return void ($('#gw-err').textContent = 'Enter the numeric MID.');
      if (!body.merchantKey) return void ($('#gw-err').textContent = 'Enter the merchant key.');
      if (body.salt.length < 16) return void ($('#gw-err').textContent = 'Enter the full salt.');
      busy(b, true);
      try {
        await api('/developer/credentials', { method: 'POST', body, mode: 'test' });
        await LOAD.payu(state.mode); closeAll(); toast('PayU test credentials saved'); show('payu');
      } catch (e) { $('#gw-err').textContent = e.message; busy(b, false); }
    };
  }
  function gwHookDialog(id){
    const w = id == null ? { url: '', events: ['payment.success'], active: true } : S.gw.webhooks.find(h => h.id === id);
    const ev = (w && w.events && w.events[0]) || '';
    const parts = ev.split('.');
    const type = parts[0] || 'payment', event = parts[1] || 'success';
    const types = [...new Set(HOOK_EVENTS.map(e => String(e).split('.')[0]))];
    const acts = HOOK_EVENTS.filter(e => String(e).split('.')[0] === type).map(e => String(e).split('.')[1]);
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">${id == null ? 'Add' : 'Edit'} webhook endpoint</h2>${x}</div>
      <label>Endpoint URL</label><input id="gw-wh-url" type="url" placeholder="https://yourserver.in/webhooks/paynest">
      <div class="st-f"><label for="gw-wh-type">Type</label><select id="gw-wh-type">${types.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="st-f"><label for="gw-wh-event">Event</label><select id="gw-wh-event">${acts.map(a => `<option value="${a}" ${a === event ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <label class="ck" style="margin-top:10px!important"><input type="checkbox" id="gw-wh-act" ${w && w.active ? 'checked' : ''}>Endpoint enabled</label>
      <span id="gw-wh-err" style="color:var(--bad);font-size:12px;display:block;margin-top:8px"></span>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="gw-wh-go">${id == null ? 'Add endpoint' : 'Save'}</button></div>`, { wide: true });
    $('#gw-wh-go').onclick = async () => {
      const url = $('#gw-wh-url').value.trim(), type = $('#gw-wh-type').value, event = $('#gw-wh-event').value;
      const ev = [type, event].filter(Boolean).join('.');
      const bad = !/^https:\/\/[^\s/]+\.[^\s]+/.test(url) ? 'Use a public https:// URL' : !ev ? 'Pick an event' : '';
      $('#gw-wh-err').textContent = bad; if (bad) return;
      const body = { type, event, url, active: $('#gw-wh-act').checked };
      busy($('#gw-wh-go'), true);
      try {
        if (id == null) { const r = await api('/developer/webhooks', { method: 'POST', body, mode: state.mode }); closeAll(); gwSecretModal('Endpoint added', "Copy the signing secret now. It won't be shown again.", r.secret, 'Done'); await LOAD.payu(state.mode); show('payu'); }
        else { await api('/developer/webhooks/' + encodeURIComponent(id), { method: 'PATCH', body, mode: state.mode }); closeAll(); toast('Webhook updated'); await LOAD.payu(state.mode); show('payu'); }
        await LOAD.payu(state.mode);
      } catch (e) { $('#gw-wh-err').textContent = e.message; busy($('#gw-wh-go'), false); }
    };
  }
  function gwTest(){
    busy($('#gw-test'), true); $('#gw-test').textContent = 'Testing...';
    api('/developer/credentials/test', { method: 'POST', mode: state.mode }).then(r => {
      openDrawer(`<div class="between"><h2 style="margin:0">PayU connection test</h2>${x}</div>
        <p style="margin-top:0">${statusPill(r.ok ? 'SUCCESS' : 'FAILED')} <span class="muted">${esc(r.msg || '')}</span></p>
        <pre class="code">${pretty(r)}</pre>`);
    }).catch(e => {
      openDrawer(`<div class="between"><h2 style="margin:0">PayU connection test</h2>${x}</div>
        <p style="margin-top:0">${esc(e.message || 'Test failed')}</p>`);
    }).finally(() => busy($('#gw-test'), false));
  }
  const BINDV = {
    biz: () => {
      if (!$('#b-save')) return;
      $('#b-save').onclick = async () => {
        const d = $('#b-display').value.trim(), e = $('#b-email').value.trim(), p = $('#b-phone').value.trim();
        err('b-display', d.length < 2 ? 'Display name is required' : ''); err('b-email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? '' : 'Enter a valid email');
        err('b-phone', /^\d{10}$/.test(p.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')) ? '' : 'Enter a 10-digit mobile number');
        if (document.querySelector('#sv .st-bad')) return;
        busy($('#b-save'), true);
        try {
          S.biz = await api('/settings/business', { method: 'PATCH', body: { displayName: d, email: e, mobile: p }, mode: false });
          applyMe(await api('/auth/me', { mode: false }));
          toast('Business profile saved'); await refreshAudit(); route();
        } catch (er) { fieldErr(er); busy($('#b-save'), false); }
      };
    },
    bank: () => {
      if ($('#k-add')) $('#k-add').onclick = addBank;
      document.querySelectorAll('[data-primary]').forEach(b => b.onclick = async () => {
        busy(b, true);
        try { S.banks = (await api(`/settings/banks/${encodeURIComponent(b.dataset.primary)}/primary`, { method: 'POST', mode: false })).banks.map(k => ({ ...k, added: toDate(k.added) })); toast('Primary account changed · applies from the next settlement'); await redraw('bank'); }
        catch (e) { apiFail(e); busy(b, false); }
      });
      document.querySelectorAll('[data-rmbank]').forEach(b => b.onclick = () => {
        const k = S.banks.find(v => v.id === b.dataset.rmbank); if (!k) return;
        openModal(`<h2 style="margin:0 0 8px;font-size:20px">Remove ${esc(k.bank)} ••••${esc(k.last4)}?</h2><p class="muted">It stops receiving settlements. Past settlements keep their record of it.</p>
          <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rb-go">Remove</button></div>`);
        $('#rb-go').onclick = async () => {
          busy($('#rb-go'), true);
          try { S.banks = (await api('/settings/banks/' + encodeURIComponent(k.id), { method: 'DELETE', mode: false })).banks.map(v => ({ ...v, added: toDate(v.added) })); toast('Bank account removed'); await redraw('bank'); }
          catch (e) { apiFail(e); busy($('#rb-go'), false); }
        };
      });
    },
    team: () => {
      if ($('#t-inv')) $('#t-inv').onclick = invite;
      const setTeam = r => { S.team = r.team.map(m => ({ ...m, lastLoginAt: toDate(m.lastLoginAt) })); };
      document.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => {
        s.disabled = true;
        try { setTeam(await api('/settings/team/' + encodeURIComponent(s.dataset.role), { method: 'PATCH', body: { role: s.value }, mode: false })); toast('Role updated to ' + roleLabel(s.value)); await redraw('team'); }
        catch (e) { apiFail(e); show('team'); }
      });
      document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
        const m = S.team.find(t => t.id === b.dataset.rm); if (!m) return;
        openModal(`<h2 style="margin:0 0 8px;font-size:20px">Remove ${esc(m.email)}?</h2><p class="muted">They lose access immediately and are signed out of this account. You can add them again later.</p>
          <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rm-go">Remove</button></div>`);
        $('#rm-go').onclick = async () => {
          busy($('#rm-go'), true);
          try { setTeam(await api('/settings/team/' + encodeURIComponent(m.id), { method: 'DELETE', mode: false })); toast('Member removed'); await redraw('team'); }
          catch (e) { apiFail(e); busy($('#rm-go'), false); }
        };
      });
    },
    sec: () => {
      $('#s-pw').onclick = changePw;
      const setSessions = r => { S.sessions = r.sessions.map(s => ({ ...s, started: toDate(s.started) })); };
      document.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => {
        busy(b, true);
        try { setSessions(await api('/settings/sessions/' + encodeURIComponent(b.dataset.rev), { method: 'DELETE', mode: false })); toast('Session signed out'); await redraw('sec'); }
        catch (e) { apiFail(e); busy(b, false); }
      });
      if ($('#s-revall')) $('#s-revall').onclick = async () => {
        busy($('#s-revall'), true);
        try { setSessions(await api('/settings/sessions/revoke-others', { method: 'POST', mode: false })); toast('All other sessions signed out'); await redraw('sec'); }
        catch (e) { apiFail(e); busy($('#s-revall'), false); }
      };
      const readSso = () => {
        const d = $('#o-domain').value.trim().toLowerCase(), i = $('#o-issuer').value.trim();
        err('o-domain', /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? '' : 'Enter a domain like yourcompany.in'); err('o-issuer', /^https:\/\/\S+$/.test(i) ? '' : 'Enter the https:// issuer or metadata URL');
        return document.querySelector('#sv .st-bad') ? null : { domain: d, issuer: i, protocol: $('#o-proto').value };
      };
      if ($('#o-test')) $('#o-test').onclick = async () => {
        const v = readSso(); if (!v) return;
        busy($('#o-test'), true); $('#o-res').textContent = 'Contacting the identity provider…'; $('#o-res').style.color = '';
        try { const r = await api('/settings/sso/test', { method: 'POST', body: v, mode: false }); $('#o-res').textContent = r.message; $('#o-res').style.color = r.ok ? 'var(--ok)' : 'var(--bad)'; }
        catch (e) { fieldErr(e); $('#o-res').textContent = ''; }
        busy($('#o-test'), false);
      };
      if ($('#o-save')) $('#o-save').onclick = async () => {
        const v = readSso(); if (!v) return;
        busy($('#o-save'), true);
        try { S.sso = (await api('/settings/sso', { method: 'PUT', body: v, mode: false })).sso; toast('SSO settings saved'); await redraw('sec'); }
        catch (e) { fieldErr(e); busy($('#o-save'), false); }
      };
    },
    audit: () => {
      $('#a-q').oninput = e => { S.aq = e.target.value; show('audit'); const i = $('#a-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
      $('#a-dl').onclick = () => {
        const cell = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        const csv = 'time,who,action,entity,mode,ip\n' + S.audit.map(a => [a.at.toISOString(), a.who, actionLabel(a.action), a.entity || '', a.mode || '', a.ip || ''].map(v => cell(String(v))).join(',')).join('\n') + '\n';
        const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); l.download = 'bizpolepay-audit-log.csv'; l.click();
      };
    },
  };

  // The audit log changes with writes on other pages, so refetch it whenever Settings opens.
  BIND.settings = () => {
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => show(b.dataset.st)); show(S.tab);
    refreshAudit().then(() => { if (S.tab === 'audit' && $('#sv') && !$('#a-q:focus')) show('audit'); });
  };

  addStyle('settings', `
    #sv .kv dd{word-break:normal;overflow-wrap:anywhere}
    .st-f{margin-bottom:2px}.st-f label{margin-top:10px}
    .st-err{display:block;min-height:16px;font-size:12px;color:var(--bad)}
    input.st-bad,select.st-bad{border-color:var(--bad)!important}
    .st-row{padding:12px 0;border-bottom:1px solid var(--line)}
    .st-perm td,.st-perm th{text-align:center;padding:9px 8px}.st-perm td:first-child,.st-perm th:first-child{text-align:left}
    .st-yes{color:var(--ok);font-weight:700}
    .st-meter{height:6px;border-radius:9px;background:var(--soft);overflow:hidden;margin:4px 0}.st-meter i{display:block;height:100%;width:0;transition:.2s}
  `);
})();

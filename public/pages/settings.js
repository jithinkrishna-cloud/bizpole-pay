// Page: settings. Uses globals from app.html core (state, data, helpers, PAGES, BIND).
(() => {
  const S = {
    tab: 'biz',
    biz: { legal: 'Bizpole Services', display: 'Bizpole', type: 'Proprietorship', category: 'Professional services', pan: 'ABCPK••••F', gstin: '32ABCPK1234F1Z5',
      website: 'https://bizpole.example', email: 'support@bizpole.example', phone: '+91 98470 12345', address: '2nd Floor, MG Road, Kochi, Kerala 682016' },
    banks: [
      { id: 'b1', bank: 'HDFC Bank', last4: '4821', ifsc: 'HDFC0001234', holder: 'Jithin Krishna K', primary: true, verified: true, added: '12 Oct 2026' },
      { id: 'b2', bank: 'ICICI Bank', last4: '7730', ifsc: 'ICIC0000456', holder: 'Bizpole Services', primary: false, verified: true, added: '20 Oct 2026' },
    ],
    team: [
      { name: null, email: null, role: 'Owner', status: 'Active', last: 'Now' },
      { name: 'Anu Thomas', email: 'anu@bizpole.example', role: 'Finance', status: 'Active', last: 'Yesterday' },
      { name: 'Dev Team', email: 'dev@bizpole.example', role: 'Developer', status: 'Active', last: '3 days ago' },
      { name: '—', email: 'support@bizpole.example', role: 'Support', status: 'Invited', last: '—' },
    ],
    otp: true,
    sessions: [
      { id: 's1', device: 'Chrome · Windows 11', ip: '103.21.58.14', place: 'Kochi, IN', last: 'Active now', current: true },
      { id: 's2', device: 'Safari · iPhone 15', ip: '49.37.204.9', place: 'Kochi, IN', last: '2 hours ago' },
      { id: 's3', device: 'Edge · Windows 10', ip: '117.211.6.88', place: 'Bengaluru, IN', last: '4 days ago' },
    ],
    sso: { domain: '', protocol: 'OIDC', issuer: '', enforced: false, status: 'Not configured' },
    notif: { 'Successful payment': [false, false], 'Failed payment': [true, false], 'Refund processed': [true, false], 'Settlement credited': [true, true], 'Chargeback raised': [true, true], 'Daily summary': [true, false] },
  };
  const ROLES = ['Owner', 'Admin', 'Finance', 'Developer', 'Support', 'Viewer'];
  const PERMS = [
    ['View transactions & settlements', [1, 1, 1, 1, 1, 1]], ['Issue refunds', [1, 1, 1, 0, 0, 0]], ['Create payment links', [1, 1, 1, 0, 1, 0]],
    ['Manage API keys & webhooks', [1, 1, 0, 1, 0, 0]], ['Change bank account', [1, 1, 0, 0, 0, 0]], ['Manage team', [1, 1, 0, 0, 0, 0]], ['Download reports', [1, 1, 1, 1, 0, 1]],
  ];
  const AUDIT = Array.from({ length: 14 }, (_, i) => {
    const a = [['Refund issued', 'Refund', 'Anu Thomas'], ['API key created', 'API key', 'Dev Team'], ['Webhook updated', 'Webhook', 'Dev Team'], ['Logged in', 'Session', null],
      ['Payment link created', 'Payment link', 'Anu Thomas'], ['Bank account added', 'Bank account', null], ['Member invited', 'Team', null], ['Salt revealed', 'Credentials', 'Dev Team']][i % 8];
    return { action: a[0], entity: a[1], who: a[2], ip: ['103.21.58.14', '49.37.204.9', '117.211.6.88'][i % 3], at: new Date(now - i * 7.3 * 3600e3) };
  });
  const who = n => n || state.user.name;
  const err = (id, msg) => { const el = $('#' + id); if (!el) return; el.classList.toggle('st-bad', !!msg); const m = el.parentElement.querySelector('.st-err'); if (m) m.textContent = msg || ''; };
  const field = (label, id, value = '', attrs = '') => `<div class="st-f"><label for="${id}">${label}</label><input id="${id}" value="${esc(value)}" ${attrs}><span class="st-err"></span></div>`;

  const TABS = [['biz', 'Business profile'], ['bank', 'Bank accounts'], ['team', 'Team & roles'], ['sec', 'Security'], ['notif', 'Notifications'], ['audit', 'Audit log']];
  PAGES.settings = () => head('Settings', 'Your business details, payout accounts, people and security.') +
    `<div class="tabs">${TABS.map(([k, l]) => `<button data-st="${k}" class="${k === S.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="sv"></div>`;

  const VIEW = {
    biz: () => `<div class="grid g-21"><div class="card"><div class="between"><h3>Business details</h3><span class="pill ok">Verified</span></div>
        <div class="grid g2" style="gap:4px 16px">${field('Display name (shown on checkout)', 'b-display', S.biz.display)}${field('Support email', 'b-email', S.biz.email, 'type="email"')}
          ${field('Support phone', 'b-phone', S.biz.phone)}${field('Website', 'b-web', S.biz.website, 'type="url"')}</div>
        <div class="between" style="margin-top:14px"><span class="muted" style="font-size:13px">Display name, support contacts and website update instantly.</span><button class="btn primary" id="b-save">Save changes</button></div></div>
      <div class="card"><h3>Registered details</h3><dl class="kv"><dt>Legal name</dt><dd>${S.biz.legal}</dd><dt>Business type</dt><dd>${S.biz.type}</dd><dt>Category</dt><dd>${S.biz.category}</dd>
        <dt>PAN</dt><dd class="mono">${S.biz.pan}</dd><dt>GSTIN</dt><dd class="mono">${S.biz.gstin}</dd><dt>Address</dt><dd>${S.biz.address}</dd></dl>
        <p class="muted" style="font-size:13px;margin:14px 0 10px">These were verified during onboarding. Changes need a fresh KYC review.</p>
        <button class="btn" id="b-req" style="margin-top:auto">Request a change</button></div></div>`,
    bank: () => `<div class="between" style="margin-bottom:12px"><span class="muted">Settlements are paid to the primary account. Every account is verified with a ₹1 penny-drop.</span><button class="btn primary" id="k-add">+ Add bank account</button></div>
      <div class="grid g2">${S.banks.map(b => `<div class="card"><div class="between"><h3 style="margin:0">${b.bank} ••••${b.last4}</h3>${b.primary ? '<span class="pill brand">Primary</span>' : ''}</div>
        <dl class="kv" style="margin-top:12px"><dt>Account holder</dt><dd>${esc(b.holder)}</dd><dt>IFSC</dt><dd class="mono">${b.ifsc}</dd><dt>Verification</dt><dd>${b.verified ? '<span class="pill ok">Penny-drop matched</span>' : '<span class="pill warn">Pending</span>'}</dd><dt>Added</dt><dd>${b.added}</dd></dl>
        <div class="row" style="margin-top:auto;padding-top:14px;gap:8px">${b.primary ? '<span class="muted" style="font-size:13px">Receiving settlements (T+1)</span>' : `<button class="btn sm" data-primary="${b.id}">Make primary</button><button class="btn sm danger" data-rmbank="${b.id}">Remove</button>`}</div></div>`).join('')}</div>`,
    team: () => `<div class="grid g-21"><div><div class="between" style="margin-bottom:12px"><span class="muted">${S.team.length} people can access this account</span><button class="btn primary" id="t-inv">+ Invite member</button></div>
        <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last active</th><th></th></tr></thead><tbody>
        ${S.team.map((m, i) => `<tr><td>${esc(m.name || state.user.name)}</td><td>${esc(m.email || state.user.email)}</td>
          <td>${m.role === 'Owner' ? '<span class="pill brand">Owner</span>' : `<select data-role="${i}" style="width:auto;padding:5px 8px">${ROLES.slice(1).map(r => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select>`}</td>
          <td>${m.status === 'Active' ? '<span class="pill ok">Active</span>' : '<span class="pill warn">Invited</span>'}</td><td>${m.last}</td>
          <td class="right">${m.role === 'Owner' ? '' : `<button class="btn sm danger" data-rm="${i}">Remove</button>`}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>What each role can do</h3><div class="tbl-wrap"><table class="st-perm"><thead><tr><th>Permission</th>${ROLES.map(r => `<th>${r.slice(0, 3)}</th>`).join('')}</tr></thead>
        <tbody>${PERMS.map(([p, a]) => `<tr><td>${p}</td>${a.map(x => `<td>${x ? '<span class="st-yes">✓</span>' : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div>`,
    sec: () => `<div class="grid g2"><div class="card"><h3>Sign-in</h3>
        <div class="between st-row"><div><b>Password</b><div class="muted" style="font-size:13px">Last changed 34 days ago</div></div><button class="btn sm" id="s-pw">Change password</button></div>
        <div class="between st-row"><div><b>OTP on new devices</b><div class="muted" style="font-size:13px">Ask for a one-time code when signing in from a new device</div></div><button class="st-tg ${S.otp ? 'on' : ''}" id="s-otp" aria-label="Toggle OTP"></button></div>
        <h3 style="margin-top:18px">Active sessions</h3>${S.sessions.map(s => `<div class="between st-row"><div><b>${s.device}</b>${s.current ? ' <span class="pill ok">This device</span>' : ''}<div class="muted" style="font-size:13px">${s.place} · ${s.ip} · ${s.last}</div></div>${s.current ? '' : `<button class="btn sm danger" data-rev="${s.id}">Sign out</button>`}</div>`).join('')}
        ${S.sessions.length > 1 ? '<button class="btn sm" id="s-revall" style="margin-top:12px;align-self:flex-start">Sign out all other sessions</button>' : ''}</div>
      <div class="card"><div class="between"><h3>Company SSO</h3><span class="pill ${S.sso.status === 'Connected' ? 'ok' : ''}">${S.sso.status}</span></div>
        <p class="muted" style="font-size:13px;margin-top:0">Let your team sign in with Google Workspace, Microsoft Entra ID or Okta.</p>
        ${field('Email domain', 'o-domain', S.sso.domain, 'placeholder="bizpole.example"')}
        <div class="st-f"><label for="o-proto">Protocol</label><select id="o-proto">${['OIDC', 'SAML 2.0'].map(p => `<option ${p === S.sso.protocol ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        ${field('Issuer / metadata URL', 'o-issuer', S.sso.issuer, 'placeholder="https://login.microsoftonline.com/…"')}
        <label class="ck" style="margin-top:10px!important"><input type="checkbox" id="o-enf" ${S.sso.enforced ? 'checked' : ''}>Require SSO for everyone on this domain</label>
        <div class="row" style="margin-top:auto;padding-top:14px;gap:8px"><button class="btn" id="o-test">Test connection</button><button class="btn primary" id="o-save">Save</button></div></div></div>`,
    notif: () => `<div class="card"><div class="between"><h3>Email and SMS alerts</h3><button class="btn primary" id="n-save">Save preferences</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Event</th><th style="width:120px">Email</th><th style="width:120px">SMS</th></tr></thead><tbody>
      ${Object.entries(S.notif).map(([e, [m, s]]) => `<tr><td>${e}</td><td><input type="checkbox" data-n="${e}|0" ${m ? 'checked' : ''} style="width:auto"></td><td><input type="checkbox" data-n="${e}|1" ${s ? 'checked' : ''} style="width:auto"></td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:13px;margin:12px 0 0">Alerts go to ${esc(state.user.email)}. SMS goes to the support phone in Business profile.</p></div>`,
    audit: () => {
      const q = (S.aq || '').toLowerCase(), rows = AUDIT.filter(a => !q || [a.action, a.entity, who(a.who), a.ip].some(v => v.toLowerCase().includes(q)));
      return `<div class="toolbar"><input id="a-q" placeholder="Search action, person, entity or IP" value="${esc(S.aq || '')}" style="max-width:420px"><span style="flex:1"></span><button class="btn" id="a-dl"><i data-icon=download class=li></i> Download CSV</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Entity</th><th>IP address</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td>${fmtDate(a.at)}</td><td>${esc(who(a.who))}</td><td>${a.action}</td><td>${a.entity}</td><td class="mono">${a.ip}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No matching activity</td></tr>'}</tbody></table></div>`;
    },
  };

  function show(k){ S.tab = k; document.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === k)); $('#sv').innerHTML = VIEW[k](); (BINDV[k] || (() => {}))(); }

  function addBank(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Add bank account</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      ${field('Account holder name', 'nb-holder')}${field('Account number', 'nb-acc', '', 'inputmode="numeric"')}${field('Confirm account number', 'nb-acc2', '', 'inputmode="numeric"')}
      ${field('IFSC', 'nb-ifsc', '', 'maxlength="11" style="text-transform:uppercase" placeholder="HDFC0001234"')}
      <div id="nb-res"></div><div class="row" style="margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="nb-go">Verify with ₹1</button></div>`);
    $('#nb-go').onclick = () => {
      const h = $('#nb-holder').value.trim(), a = $('#nb-acc').value.replace(/\s/g, ''), a2 = $('#nb-acc2').value.replace(/\s/g, ''), ifsc = $('#nb-ifsc').value.trim().toUpperCase();
      err('nb-holder', h.length < 3 ? 'Enter the name on the account' : ''); err('nb-acc', /^\d{9,18}$/.test(a) ? '' : 'Account number is 9–18 digits');
      err('nb-acc2', a && a === a2 ? '' : 'Account numbers do not match'); err('nb-ifsc', /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) ? '' : 'IFSC looks like HDFC0001234');
      if (document.querySelector('.modal .st-bad')) return;
      $('#nb-go').disabled = true; $('#nb-res').innerHTML = '<p class="muted">Sending ₹1 to verify…</p>';
      setTimeout(() => {
        S.banks.push({ id: 'b' + Date.now(), bank: { HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank' }[ifsc.slice(0, 4)] || ifsc.slice(0, 4) + ' Bank', last4: a.slice(-4), ifsc, holder: h, primary: false, verified: true, added: 'Today' });
        closeAll(); toast(`Verified · name at bank: ${h.toUpperCase()}`); show('bank');
      }, 900);
    };
  }
  function invite(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Invite a team member</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      ${field('Work email', 'iv-email', '', 'type="email" placeholder="name@bizpole.example"')}
      <div class="st-f"><label for="iv-role">Role</label><select id="iv-role">${ROLES.slice(1).map(r => `<option>${r}</option>`).join('')}</select></div>
      <p class="muted" style="font-size:13px">They'll get an email link that expires in 7 days.</p>
      <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="iv-go">Send invite</button></div>`);
    $('#iv-go').onclick = () => {
      const e = $('#iv-email').value.trim().toLowerCase();
      err('iv-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? 'Enter a valid email' : S.team.some(m => (m.email || state.user.email) === e) ? 'This person already has access' : '');
      if (document.querySelector('.modal .st-bad')) return;
      S.team.push({ name: '—', email: e, role: $('#iv-role').value, status: 'Invited', last: '—' }); closeAll(); toast('Invite sent to ' + e); show('team');
    };
  }
  function changePw(){
    openModal(`<div class="between"><h2 style="margin:0;font-size:20px">Change password</h2><button class="x" onclick="closeAll()"><i data-icon=x class=li></i></button></div>
      ${field('Current password', 'pw-old', '', 'type="password"')}${field('New password', 'pw-new', '', 'type="password"')}
      <div class="st-meter"><i id="pw-bar"></i></div><span class="muted" id="pw-lbl" style="font-size:12.5px">Use 10+ characters with a number and a symbol</span>
      ${field('Confirm new password', 'pw-new2', '', 'type="password"')}
      <div class="row" style="margin-top:12px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="pw-go">Update password</button></div>`);
    const score = p => [p.length >= 10, /\d/.test(p), /[^A-Za-z0-9]/.test(p), /[a-z]/.test(p) && /[A-Z]/.test(p)].filter(Boolean).length;
    $('#pw-new').oninput = e => { const s = score(e.target.value); $('#pw-bar').style.width = s * 25 + '%'; $('#pw-bar').style.background = ['var(--bad)', 'var(--bad)', 'var(--warn)', 'var(--accent)', 'var(--ok)'][s]; $('#pw-lbl').textContent = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s]; };
    $('#pw-go').onclick = () => {
      const o = $('#pw-old').value, n = $('#pw-new').value;
      err('pw-old', o ? '' : 'Enter your current password'); err('pw-new', score(n) >= 3 ? (n === o ? 'Choose a different password' : '') : 'Too weak'); err('pw-new2', n === $('#pw-new2').value ? '' : 'Passwords do not match');
      if (document.querySelector('.modal .st-bad')) return;
      closeAll(); toast('Password updated · other sessions signed out'); S.sessions = S.sessions.filter(s => s.current); show('sec');
    };
  }

  const BINDV = {
    biz: () => {
      $('#b-save').onclick = () => {
        const d = $('#b-display').value.trim(), e = $('#b-email').value.trim(), w = $('#b-web').value.trim();
        err('b-display', d.length < 2 ? 'Display name is required' : ''); err('b-email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? '' : 'Enter a valid email');
        err('b-web', /^https?:\/\/[^\s.]+\.[^\s]+$/.test(w) ? '' : 'Enter a full URL starting with https://');
        if (document.querySelector('#sv .st-bad')) return;
        Object.assign(S.biz, { display: d, email: e, website: w, phone: $('#b-phone').value.trim() }); toast('Business profile saved');
      };
      $('#b-req').onclick = () => toast('Change request opened · our team will email you');
    },
    bank: () => {
      $('#k-add').onclick = addBank;
      document.querySelectorAll('[data-primary]').forEach(b => b.onclick = () => { S.banks.forEach(x => x.primary = x.id === b.dataset.primary); toast('Primary account changed · applies from the next settlement'); show('bank'); });
      document.querySelectorAll('[data-rmbank]').forEach(b => b.onclick = () => { S.banks = S.banks.filter(x => x.id !== b.dataset.rmbank); toast('Bank account removed'); show('bank'); });
    },
    team: () => {
      $('#t-inv').onclick = invite;
      document.querySelectorAll('[data-role]').forEach(s => s.onchange = () => { S.team[+s.dataset.role].role = s.value; toast('Role updated to ' + s.value); });
      document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
        const m = S.team[+b.dataset.rm];
        openModal(`<h2 style="margin:0 0 8px;font-size:20px">Remove ${esc(m.email)}?</h2><p class="muted">They lose access immediately. You can invite them again later.</p>
          <div class="row"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rm-go">Remove</button></div>`);
        $('#rm-go').onclick = () => { S.team.splice(+b.dataset.rm, 1); closeAll(); toast('Member removed'); show('team'); };
      });
    },
    sec: () => {
      $('#s-pw').onclick = changePw;
      $('#s-otp').onclick = () => { S.otp = !S.otp; toast(S.otp ? 'OTP on new devices turned on' : 'OTP on new devices turned off'); show('sec'); };
      document.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => { S.sessions = S.sessions.filter(s => s.id !== b.dataset.rev); toast('Session signed out'); show('sec'); });
      if ($('#s-revall')) $('#s-revall').onclick = () => { S.sessions = S.sessions.filter(s => s.current); toast('All other sessions signed out'); show('sec'); };
      const readSso = () => {
        const d = $('#o-domain').value.trim().toLowerCase(), i = $('#o-issuer').value.trim();
        err('o-domain', /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? '' : 'Enter a domain like bizpole.example'); err('o-issuer', /^https:\/\/\S+$/.test(i) ? '' : 'Enter the https:// issuer or metadata URL');
        return document.querySelector('#sv .st-bad') ? null : { d, i };
      };
      $('#o-test').onclick = () => { if (readSso()) toast('Connection OK · identity provider responded'); };
      $('#o-save').onclick = () => { const v = readSso(); if (!v) return; Object.assign(S.sso, { domain: v.d, issuer: v.i, protocol: $('#o-proto').value, enforced: $('#o-enf').checked, status: 'Connected' }); toast('SSO saved'); show('sec'); };
    },
    notif: () => {
      document.querySelectorAll('[data-n]').forEach(c => c.onchange = () => { const [e, i] = c.dataset.n.split('|'); S.notif[e][+i] = c.checked; });
      $('#n-save').onclick = () => toast('Notification preferences saved');
    },
    audit: () => {
      $('#a-q').oninput = e => { S.aq = e.target.value; show('audit'); const i = $('#a-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
      $('#a-dl').onclick = () => {
        const csv = 'time,who,action,entity,ip\n' + AUDIT.map(a => [a.at.toISOString(), who(a.who), a.action, a.entity, a.ip].join(',')).join('\n') + '\n';
        const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); l.download = 'bizpolepay-audit-log.csv'; l.click();
      };
    },
  };

  BIND.settings = () => { document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => show(b.dataset.st)); show(S.tab); };

  addStyle('settings', `
    #sv .kv dd{word-break:normal;overflow-wrap:anywhere}
    .st-f{margin-bottom:2px}.st-f label{margin-top:10px}
    .st-err{display:block;min-height:16px;font-size:12px;color:var(--bad)}
    input.st-bad,select.st-bad{border-color:var(--bad)!important}
    .st-row{padding:12px 0;border-bottom:1px solid var(--line)}
    .st-tg{width:42px;height:24px;border-radius:999px;border:0;background:var(--line);position:relative;cursor:pointer;flex:none}
    .st-tg:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--card);transition:.2s}
    .st-tg.on{background:var(--ok)}.st-tg.on:after{left:21px}
    .st-perm td,.st-perm th{text-align:center;padding:9px 8px}.st-perm td:first-child,.st-perm th:first-child{text-align:left}
    .st-yes{color:var(--ok);font-weight:700}
    .st-meter{height:6px;border-radius:9px;background:var(--soft);overflow:hidden;margin:4px 0}.st-meter i{display:block;height:100%;width:0;transition:.2s}
  `);
})();

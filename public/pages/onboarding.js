// Page: onboarding. Uses globals from app.html core (state, STEPS, helpers, PAGES, BIND).
/* ---- Onboarding: wizard → review → under-review tracker ---- */
(() => {
  // [value, label, PAN 4th-letter codes allowed]
  const ENT = [['individual', 'Individual', ['P']], ['proprietorship', 'Sole proprietorship', ['P']], ['partnership', 'Partnership firm', ['F']], ['llp', 'LLP', ['F']],
    ['pvt', 'Private limited company', ['C']], ['public', 'Public limited company', ['C']], ['trust', 'Trust / Society / NGO', ['T', 'A']]];
  const PAN_TYPE = { P: 'an individual', C: 'a company', F: 'a firm or LLP', T: 'a trust', A: 'an association or society', H: 'a HUF', G: 'a government body', L: 'a local authority', J: 'an artificial juridical person', B: 'a body of individuals' };
  const CATS = {
    'Professional services': ['Consulting', 'Legal', 'Accounting & tax', 'Design & marketing'],
    'Education': ['Coaching & tuition', 'Online courses', 'Schools & colleges'],
    'E-commerce': ['Fashion & apparel', 'Electronics', 'Home & kitchen', 'Groceries'],
    'Software / SaaS': ['B2B SaaS', 'Mobile apps', 'IT services'],
    'Food & beverage': ['Restaurants', 'Cloud kitchen', 'Bakery & sweets'],
    'Healthcare': ['Clinics', 'Pharmacy', 'Diagnostics'],
  };
  const STATES_IN = ['Andhra Pradesh', 'Delhi', 'Goa', 'Gujarat', 'Karnataka', 'Kerala', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];
  const VOLUMES = ['Under ₹1 lakh', '₹1–5 lakh', '₹5–25 lakh', '₹25 lakh–1 crore', 'Over ₹1 crore'];
  const POL = [['terms', 'Terms & conditions', true], ['refund', 'Refund & cancellation policy', true], ['privacy', 'Privacy policy', true],
    ['contact', 'Contact us (address, email, phone)', true], ['pricing', 'Product / service pricing in ₹', true], ['shipping', 'Shipping / delivery policy', false]];
  const BANKS_IFSC = { HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank', FDRL: 'Federal Bank', SIBL: 'South Indian Bank', YESB: 'Yes Bank', IDIB: 'Indian Bank', PUNB: 'Punjab National Bank' };
  const STEP_HELP = {
    PAN_DETAILS: [['What you need', ['The business PAN (company, firm or trust) or, for a proprietorship, the proprietor\'s PAN', 'Name exactly as printed on the PAN', 'Date of birth or date of incorporation']],
      ['Why we ask', 'Our payment partner checks the PAN against the Income Tax database before a live account can be opened. The 4th letter of a PAN shows the holder type, so it must match your business type.']],
    BUSINESS_DETAILS: [['What you need', ['Legal name as registered', 'GSTIN if you are registered (optional if you are below the GST threshold)', 'Registered address with PIN code']],
      ['Why we ask', 'Category and expected volume decide your pricing, risk checks and settlement limits. Your customers see the legal name on bank statements.']],
    BANK_ACCOUNT: [['What you need', ['A current or savings account in the business\'s or the proprietor\'s name', 'Account number and IFSC from a cheque or passbook']],
      ['How the ₹1 check works', 'We credit ₹1 to the account and read back the account holder\'s name from the bank. It must match your PAN or legal business name. The ₹1 stays with you.']],
    WEBSITE_DETAILS: [['What you need', ['A live website or app where customers buy from you', 'Public pages for terms, refunds, privacy and contact', 'Prices shown in rupees']],
      ['Why we ask', 'Card networks and banks require these pages before they allow online payments. We check that each page loads and belongs to your domain.']],
    KYC_DOCUMENTS: [['What you need', ['Clear scans or photos (PDF, JPG or PNG, up to 5 MB each)', 'Masked Aadhaar only — the first 8 digits hidden']],
      ['Why we ask', 'Documents depend on your business type. They are shared only with our payment partner for verification under RBI KYC rules.']],
  };
  const AREAS = [['pan', 'PAN verification', 'Checked against the Income Tax database'], ['docs', 'KYC documents', 'Reviewed by the risk team'], ['bank', 'Bank account', 'Verified by the ₹1 penny-drop'],
    ['web', 'Website review', 'Policy pages, pricing and product checks'], ['esign', 'Agreement e-sign', 'Merchant agreement signed with Aadhaar OTP'], ['vkyc', 'Video KYC', 'A 3-minute video call with a verification agent']];

  const ob = {
    view: null, cur: null, err: {}, tried: {}, decl: false, submitted: null, approved: false, timeline: [], areas: null, vkycSlot: '',
    d: {
      pan: { pan: 'ABCPK1234F', name: 'Jithin Krishna K', entity: 'proprietorship', dob: '1992-04-18' },
      biz: { legal: 'Bizpole Services', brand: 'Bizpole', cat: 'Professional services', sub: 'Consulting', gstin: '', addr: '2nd Floor, Thejaswini, Infopark Phase 1, Kakkanad', city: 'Kochi', st: 'Kerala', pin: '682042', volume: '₹1–5 lakh',
        desc: 'Company registration, GST filing and compliance services for small businesses.' },
      bank: { holder: '', type: 'Current', acct: '', acct2: '', ifsc: '', pd: null },
      web: { url: '', app: '', pol: Object.fromEntries(POL.map(p => [p[0], { on: false, url: '' }])), check: null },
      kyc: { files: {}, masked: false },
    },
  };
  // Read-only snapshot for other Bizpole Pay pages (settings shows the KYC'd profile).
  window.onboarding_profile = () => ({ ...JSON.parse(JSON.stringify(ob.d)), entityLabel: ent()[1], submitted: ob.submitted, approved: ob.approved });

  const get = p => p.split('.').reduce((o, k) => (o == null ? o : o[k]), ob.d);
  const set = (p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], ob.d)[last] = v; };
  const ent = () => ENT.find(e => e[0] === ob.d.pan.entity) || ENT[1];
  const isPerson = () => ['individual', 'proprietorship'].includes(ob.d.pan.entity);
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const isUrl = u => /^https?:\/\/[^\s/?#]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(u) && !!host(u);
  const fsize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const doneCount = () => STEPS.filter(([k]) => state.onboarding[k] === 'done').length;
  const allDone = () => doneCount() === STEPS.length;
  const mask = a => a ? '••••' + a.slice(-4) : '—';
  const bankName = ifsc => BANKS_IFSC[(ifsc || '').slice(0, 4)] || 'Bank';
  const toks = s => (s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean).filter(t => !['PVT', 'LTD', 'PRIVATE', 'LIMITED', 'LLP', 'M', 'S'].includes(t));
  function nameScore(a, b){
    const A = toks(a), B = toks(b); if (!A.length || !B.length) return 0;
    const hit = A.filter(t => B.some(u => u === t || (t.length === 1 && u[0] === t) || (u.length === 1 && t[0] === u))).length;
    return Math.round(hit / Math.max(A.length, B.length) * 100);
  }

  function docsFor(){
    const e = ob.d.pan.entity;
    const sig = isPerson() ? 'proprietor' : e === 'pvt' || e === 'public' ? 'director' : e === 'trust' ? 'authorised signatory' : 'partner';
    const cheque = ['cheque', 'Cancelled cheque or bank statement', 'Must show the account holder name, number and IFSC', true];
    const aad = ['aadhaar', `Masked Aadhaar of the ${e === 'individual' ? 'account holder' : sig}`, 'Front and back in one file; first 8 digits hidden', true];
    switch (e) {
      case 'individual': return [['pan', 'PAN card', 'Front side, clearly readable', true], aad, cheque];
      case 'proprietorship': return [['pan', 'PAN card of the proprietor', 'Front side, clearly readable', true], aad, cheque, ['bizproof', 'Business proof', 'GST certificate, Udyam registration or Shop & Establishment licence', true]];
      case 'partnership': return [['pan', 'PAN card of the firm', 'Issued in the firm\'s name', true], ['deed', 'Partnership deed', 'All pages, signed by every partner', true], ['sigpan', 'PAN of the authorised partner', 'Partner who will sign the agreement', true], aad, cheque, ['gst', 'GST certificate', 'If registered', false]];
      case 'llp': return [['pan', 'PAN card of the LLP', 'Issued in the LLP\'s name', true], ['coi', 'Certificate of incorporation', 'Issued by the MCA', true], ['deed', 'LLP agreement', 'Latest version, all pages', true], ['sigpan', 'PAN of the designated partner', 'Partner who will sign the agreement', true], aad, cheque];
      case 'trust': return [['pan', 'PAN card of the trust / society', 'Issued in the organisation\'s name', true], ['reg', 'Registration certificate', 'Trust or society registration', true], ['deed', 'Trust deed or bye-laws', 'All pages', true], ['sigpan', 'PAN of the authorised signatory', 'Trustee or secretary', true], aad, cheque, ['g80', '12A / 80G certificate', 'If you accept donations', false]];
      default: return [['pan', 'PAN card of the company', 'Issued in the company\'s name', true], ['coi', 'Certificate of incorporation', 'Issued by the MCA', true], ['moa', 'MoA and AoA', 'Memorandum and Articles of Association', true],
        ['board', 'Board resolution', 'Authorising the signatory to open this account', true], ['sigpan', 'PAN of the authorised director', 'Director who will sign the agreement', true], aad, cheque];
    }
  }

  /* ---- validation ---- */
  const V = {
    'pan.pan': v => !v ? 'Enter your PAN.' : !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? 'A PAN has 10 characters: 5 letters, 4 digits, then 1 letter (for example ABCPK1234F).'
      : !ent()[2].includes(v[3]) ? `The 4th letter "${v[3]}" is used for PANs issued to ${PAN_TYPE[v[3]] || 'another holder type'}. A ${ent()[1].toLowerCase()} PAN has "${ent()[2].join('" or "')}" there.` : '',
    'pan.name': v => !v.trim() ? 'Enter the name exactly as printed on the PAN.' : !/^[A-Za-z][A-Za-z .'&-]{2,}$/.test(v.trim()) ? 'Use letters, spaces and . & \' - only (at least 3 characters).' : '',
    'pan.entity': v => v ? '' : 'Choose your business type.',
    'pan.dob': v => {
      if (!v) return isPerson() ? 'Enter the date of birth shown on the PAN.' : 'Enter the date of incorporation.';
      const d = new Date(v);
      if (isNaN(d) || d.getFullYear() < 1900) return 'Enter a valid date.';
      if (d > now) return 'The date can\'t be in the future.';
      if (isPerson()) { const a = new Date(d); a.setFullYear(a.getFullYear() + 18); if (a > now) return 'The PAN holder must be at least 18 years old.'; }
      return '';
    },
    'biz.legal': v => v.trim().length < 3 ? 'Enter the legal business name (at least 3 characters).' : '',
    'biz.cat': v => v ? '' : 'Choose a category.',
    'biz.sub': v => v ? '' : 'Choose a sub-category.',
    'biz.gstin': v => {
      if (!v) return '';
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return 'A GSTIN has 15 characters: 2-digit state code, the 10-character PAN, then 3 more (for example 32ABCPK1234F1Z5).';
      if (v.slice(2, 12) !== ob.d.pan.pan) return `Characters 3–12 of a GSTIN are the PAN. This GSTIN has ${v.slice(2, 12)}, but your PAN is ${ob.d.pan.pan || 'not entered yet'}.`;
      return '';
    },
    'biz.desc': v => v.trim().length < 20 ? 'Describe what you sell in at least 20 characters.' : '',
    'biz.addr': v => v.trim().length < 10 ? 'Enter the building and street (at least 10 characters).' : '',
    'biz.city': v => v.trim() ? '' : 'Enter the city.',
    'biz.st': v => v ? '' : 'Choose the state.',
    'biz.pin': v => !v ? 'Enter the PIN code.' : !/^[1-9][0-9]{5}$/.test(v) ? 'A PIN code has 6 digits and doesn\'t start with 0.' : '',
    'biz.volume': v => v ? '' : 'Choose your expected monthly volume.',
    'bank.holder': v => v.trim().length < 3 ? 'Enter the account holder name.' : '',
    'bank.acct': v => !v ? 'Enter the account number.' : !/^\d{9,18}$/.test(v) ? 'Account numbers have 9 to 18 digits, with no spaces.' : '',
    'bank.acct2': v => !v ? 'Re-enter the account number.' : v !== ob.d.bank.acct ? 'The account numbers don\'t match.' : '',
    'bank.ifsc': v => !v ? 'Enter the IFSC.' : !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? 'An IFSC has 11 characters: 4 letters, a zero, then 6 letters or digits (for example HDFC0001234).' : '',
    'bank.pd': v => !v || v.status === 'running' ? 'Verify the account with the ₹1 penny-drop before you continue.' : v.status === 'failed' ? 'The bank couldn\'t verify this account. Check the account number and IFSC.'
      : v.status === 'mismatch' ? 'The name at the bank doesn\'t match your PAN or business name. Use an account held in that name.' : '',
    'web.url': v => !v ? 'Enter your website URL.' : !isUrl(v) ? 'Enter the full address, for example https://yourbusiness.in' : '',
    'web.app': v => !v ? '' : !isUrl(v) ? 'Enter the full store link.' : !/(play\.google\.com|apps\.apple\.com)$/.test(host(v)) ? 'Use a Google Play or App Store link.' : '',
    'kyc.masked': v => !v && docsFor().some(d => d[0] === 'aadhaar') ? 'Confirm that the Aadhaar you uploaded is masked.' : '',
  };
  function check(p){
    if (V[p]) return V[p](get(p));
    let m = p.match(/^web\.pol\.(\w+)\.url$/);
    if (m) {
      const def = POL.find(x => x[0] === m[1]), pol = ob.d.web.pol[m[1]], site = host(ob.d.web.url);
      if (!pol.on) return def[2] ? 'Required. Add this page to your site, then tick it and paste its link.' : '';
      if (!isUrl(pol.url)) return 'Paste the full link to this page.';
      if (site && host(pol.url) !== site) return `This page should be on ${site}.`;
      return '';
    }
    m = p.match(/^kyc\.files\.(\w+)$/);
    if (m) { const d = docsFor().find(x => x[0] === m[1]); return d && d[3] && !ob.d.kyc.files[m[1]] ? 'Upload this document.' : ''; }
    return '';
  }
  const FIELDS = {
    PAN_DETAILS: () => ['pan.entity', 'pan.pan', 'pan.name', 'pan.dob'],
    BUSINESS_DETAILS: () => ['biz.legal', 'biz.cat', 'biz.sub', 'biz.gstin', 'biz.desc', 'biz.addr', 'biz.city', 'biz.st', 'biz.pin', 'biz.volume'],
    BANK_ACCOUNT: () => ['bank.holder', 'bank.acct', 'bank.acct2', 'bank.ifsc', 'bank.pd'],
    WEBSITE_DETAILS: () => ['web.url', 'web.app', ...POL.map(p => `web.pol.${p[0]}.url`)],
    KYC_DOCUMENTS: () => [...docsFor().map(d => `kyc.files.${d[0]}`), 'kyc.masked'],
  };
  function validate(k, only){
    const ps = only || FIELDS[k]();
    ps.forEach(p => { const m = check(p); if (m) ob.err[p] = m; else delete ob.err[p]; });
    return ps.filter(p => ob.err[p]);
  }

  /* ---- field helpers ---- */
  const errBox = p => `<div class="ob-err" role="alert">${ob.err[p] ? '<i data-icon=triangle-alert class=li></i> ' + esc(ob.err[p]) : ''}</div>`;
  function fld(p, label, ctl, o = {}){
    return `<div class="ob-f ${o.span ? 's2' : ''} ${ob.err[p] ? 'has-err' : ''}" data-p="${p}"><label>${label}${o.opt ? ' <span class="muted" style="font-weight:500">(optional)</span>' : ''}</label>${ctl}
      ${errBox(p)}${o.hint ? `<div class="ob-hint">${o.hint}</div>` : ''}</div>`;
  }
  const val = p => esc(get(p) == null ? '' : get(p));
  const inp = (p, a = '') => `<input data-f="${p}" value="${val(p)}" ${a}>`;
  const sel = (p, opts, a = '') => `<select data-f="${p}" ${a}><option value="">Select…</option>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${get(p) === v ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;

  /* ---- step forms ---- */
  const FORMS = {
    PAN_DETAILS: () => `<div class="ob-fg">
      ${fld('pan.entity', 'Business type', sel('pan.entity', ENT.map(e => [e[0], e[1]])), { hint: 'Decides which PAN and documents we ask for.' })}
      ${fld('pan.pan', isPerson() ? 'PAN of the ' + (ob.d.pan.entity === 'individual' ? 'individual' : 'proprietor') : 'Business PAN', inp('pan.pan', 'maxlength="10" data-up autocomplete="off" placeholder="ABCPK1234F" class="mono-in"'),
        { hint: `10 characters. The 4th letter must be ${ent()[2].join(' or ')} for a ${ent()[1].toLowerCase()}.` })}
      ${fld('pan.name', 'Name as on PAN', inp('pan.name', 'placeholder="Exactly as printed"'))}
      ${fld('pan.dob', isPerson() ? 'Date of birth' : 'Date of incorporation', inp('pan.dob', `type="date" max="${now.toISOString().slice(0, 10)}"`))}
    </div>
    <div class="ob-note"><b>PAN check</b><span class="muted">We confirm the PAN, name and date with the Income Tax database when you submit. Nothing is shared with your customers.</span></div>`,
    BUSINESS_DETAILS: () => `<div class="ob-fg">
      ${fld('biz.legal', 'Legal business name', inp('biz.legal'), { hint: 'As registered. Shown on customers\' bank statements.' })}
      ${fld('biz.brand', 'Brand / display name', inp('biz.brand', 'placeholder="Shown on checkout"'), { opt: true })}
      ${fld('biz.cat', 'Category', sel('biz.cat', Object.keys(CATS)))}
      ${fld('biz.sub', 'Sub-category', sel('biz.sub', CATS[ob.d.biz.cat] || [], ob.d.biz.cat ? '' : 'disabled'))}
      ${fld('biz.gstin', 'GSTIN', inp('biz.gstin', 'maxlength="15" data-up placeholder="32ABCPK1234F1Z5" class="mono-in"'), { opt: true, hint: 'Characters 3–12 must be your PAN.' })}
      ${fld('biz.volume', 'Expected monthly volume', sel('biz.volume', VOLUMES))}
      ${fld('biz.desc', 'What do you sell?', `<textarea data-f="biz.desc" rows="2" placeholder="Products or services, and who buys them">${val('biz.desc')}</textarea>`, { span: true })}
    </div>
    <h4 class="ob-sub">Registered address</h4>
    <div class="ob-fg">
      ${fld('biz.addr', 'Building and street', inp('biz.addr', 'placeholder="Building, street, area"'), { span: true })}
      ${fld('biz.city', 'City', inp('biz.city'))}
      <div class="ob-fg2">${fld('biz.st', 'State', sel('biz.st', STATES_IN))}${fld('biz.pin', 'PIN code', inp('biz.pin', 'maxlength="6" inputmode="numeric" placeholder="682042"'))}</div>
    </div>`,
    BANK_ACCOUNT: () => `<div class="ob-fg">
      ${fld('bank.holder', 'Account holder name', inp('bank.holder', `placeholder="${esc(isPerson() ? ob.d.pan.name : ob.d.biz.legal)}"`), { hint: 'The business\'s or the proprietor\'s name, as the bank has it.' })}
      ${fld('bank.type', 'Account type', sel('bank.type', ['Current', 'Savings']))}
      ${fld('bank.acct', 'Account number', inp('bank.acct', 'inputmode="numeric" maxlength="18" autocomplete="off" class="mono-in"'))}
      ${fld('bank.acct2', 'Re-enter account number', inp('bank.acct2', 'inputmode="numeric" maxlength="18" autocomplete="off" class="mono-in" onpaste="return false"'), { hint: 'Type it again; pasting is turned off.' })}
      ${fld('bank.ifsc', 'IFSC', inp('bank.ifsc', 'maxlength="11" data-up placeholder="HDFC0001234" class="mono-in"'), { hint: 'Printed on your cheque book. The bank and branch are shown after verification.' })}
    </div>
    <div id="ob-pd">${pdBox()}</div>`,
    WEBSITE_DETAILS: () => `<div class="ob-fg">
      ${fld('web.url', 'Website URL', inp('web.url', 'type="url" placeholder="https://yourbusiness.in"'))}
      ${fld('web.app', 'Android / iOS app link', inp('web.app', 'type="url" placeholder="https://play.google.com/store/apps/details?id=…"'), { opt: true })}
    </div>
    <h4 class="ob-sub">Policy pages <span class="muted" style="font-weight:500">· tick each page your site shows and paste its link</span></h4>
    <div class="ob-pols">${POL.map(([k, l, req]) => { const p = ob.d.web.pol[k], e = ob.err[`web.pol.${k}.url`];
      return `<div class="ob-pol ob-f ${e ? 'has-err' : ''}" data-p="web.pol.${k}.url"><label class="ck"><input type="checkbox" data-f="web.pol.${k}.on" ${p.on ? 'checked' : ''}>${l}${req ? '' : ' <span class="muted">(if you ship goods)</span>'}</label>
        <input data-f="web.pol.${k}.url" type="url" value="${esc(p.url)}" placeholder="https://${esc(host(ob.d.web.url) || 'yourbusiness.in')}/${k}" ${p.on ? '' : 'disabled'}>
        ${errBox(`web.pol.${k}.url`)}</div>`; }).join('')}</div>
    <div id="ob-wc">${wcBox()}</div>`,
    KYC_DOCUMENTS: () => { const docs = docsFor();
      return `<p class="muted" style="margin:0 0 12px">Documents for a <b style="color:var(--ink)">${ent()[1].toLowerCase()}</b>. Change the business type in <button class="linkish" data-goto="PAN_DETAILS">PAN details</button> if this is wrong.</p>
      <div class="ob-docs">${docs.map(([k, l, h, req]) => { const f = ob.d.kyc.files[k], e = ob.err[`kyc.files.${k}`];
        return `<div class="ob-doc ob-f ${e ? 'has-err' : ''} ${f ? 'has-file' : ''}" data-p="kyc.files.${k}"><div class="between" style="align-items:flex-start"><div><b>${l}</b>${req ? '' : ' <span class="muted">(optional)</span>'}<div class="muted" style="font-size:12.5px">${h}</div></div>${f ? '<span class="pill ok">Uploaded</span>' : req ? '<span class="pill">Required</span>' : ''}</div>
          ${f ? `<div class="ob-file"><span class="ob-fic">${/\.pdf$/i.test(f.name) ? 'PDF' : 'IMG'}</span><div style="flex:1;min-width:0"><div class="ob-fname">${esc(f.name)}</div><div class="muted" style="font-size:12px">${fsize(f.size)}</div></div>
              <label class="btn sm" style="margin:0">Replace<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" data-doc="${k}"></label><button class="btn sm danger" data-rm="${k}">Remove</button></div>`
            : `<label class="ob-up" data-dropdoc="${k}"><input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" data-doc="${k}"><span style="font-size:20px"><i data-icon=upload class=li></i></span><span><b>Drop a file or click to choose</b><br><span class="muted" style="font-size:12px">PDF, JPG or PNG · max 5 MB</span></span></label>`}
          ${errBox(`kyc.files.${k}`)}</div>`; }).join('')}</div>
      ${docs.some(d => d[0] === 'aadhaar') ? `<div class="ob-f ob-mask ${ob.err['kyc.masked'] ? 'has-err' : ''}" data-p="kyc.masked"><div><b>Masked Aadhaar only.</b> <span class="muted">Hide the first 8 digits so only the last 4 show (XXXX XXXX 1234). Download a masked copy from the UIDAI website. We reject unmasked Aadhaar and delete the file.</span></div>
        <label class="ck"><input type="checkbox" data-f="kyc.masked" ${ob.d.kyc.masked ? 'checked' : ''}>The Aadhaar I uploaded is masked</label>${errBox('kyc.masked')}</div>` : ''}
      <button class="btn sm" id="ob-sample" style="margin-top:12px">Fill with sample files (demo)</button>`; },
  };

  function pdBox(){
    const pd = ob.d.bank.pd, e = ob.err['bank.pd'];
    let body;
    if (!pd) body = `<div class="between" style="flex-wrap:wrap"><div><b>Verify with a ₹1 penny-drop</b><div class="muted" style="font-size:13px">We send ₹1 to this account and show you the name the bank returns.</div></div><button class="btn primary" id="ob-pdgo" style="flex:none">Verify account · ₹1</button></div>`;
    else if (pd.status === 'running') body = `<div class="row" style="gap:12px"><span class="ob-spin"></span><div style="flex:1"><b>Sending ₹1 to ${bankName(ob.d.bank.ifsc)} ${mask(ob.d.bank.acct)}…</b><div class="muted" style="font-size:13px">This usually takes a few seconds.</div></div></div>`;
    else if (pd.status === 'failed') body = `<div class="between" style="flex-wrap:wrap"><div><b style="color:var(--bad)"><i data-icon=x class=li></i> Verification failed</b><div class="muted" style="font-size:13px">${pd.reason} · Ref ${pd.ref}</div></div><button class="btn" id="ob-pdgo" style="flex:none">Try again</button></div>`;
    else body = `<div class="between" style="flex-wrap:wrap;align-items:flex-start"><div><b style="color:${pd.status === 'ok' ? 'var(--ok)' : 'var(--bad)'}">${pd.status === 'ok' ? '✓ Account verified' : '<i data-icon=triangle-alert class=li></i> Name mismatch'}</b>
        <dl class="kv ob-kv"><dt>Name at bank</dt><dd><b>${esc(pd.nameAtBank)}</b></dd><dt>Bank</dt><dd>${pd.bank} · ${pd.branch}</dd><dt>Account</dt><dd class="mono">${mask(ob.d.bank.acct)} · ${ob.d.bank.ifsc}</dd>
        <dt>Match</dt><dd>${pd.status === 'ok' ? `<span class="pill ok">${pd.score}% match</span> with ${pd.against}` : `<span class="pill bad">${pd.score}% match</span> best match was ${pd.against}`}</dd><dt>Reference</dt><dd class="mono">${pd.ref} · ₹1.00 credited</dd></dl></div>
        <button class="btn sm" id="ob-pdgo" style="flex:none">Verify again</button></div>`;
    return `<div class="ob-pd ob-f ${pd && pd.status !== 'running' ? 'pd-' + pd.status : ''} ${e ? 'has-err' : ''}" data-p="bank.pd">${body}${errBox('bank.pd')}</div>`;
  }
  function runPennyDrop(){
    const ps = ['bank.holder', 'bank.acct', 'bank.acct2', 'bank.ifsc'], bad = validate('BANK_ACCOUNT', ps);
    ps.forEach(paint);
    if (bad.length) { focusErr(); return toast('Fix the highlighted fields first'); }
    ob.d.bank.pd = { status: 'running' }; delete ob.err['bank.pd']; $('#ob-pd').innerHTML = pdBox();
    setTimeout(() => {
      const b = ob.d.bank, ref = 'PD' + Date.now().toString().slice(-8);
      if (/0000$/.test(b.acct)) b.pd = { status: 'failed', reason: 'Account not found or closed at the bank', ref };
      else {
        const nameAtBank = b.holder.trim().toUpperCase().replace(/\s+/g, ' ');
        const cands = [[nameScore(nameAtBank, ob.d.pan.name), 'the name on your PAN'], [nameScore(nameAtBank, ob.d.biz.legal), 'your legal business name']].sort((x, y) => y[0] - x[0]);
        b.pd = { status: cands[0][0] >= 75 ? 'ok' : 'mismatch', nameAtBank, score: cands[0][0], against: cands[0][1], bank: bankName(b.ifsc), branch: 'Kakkanad, Kochi', ref, at: new Date() };
      }
      if ($('#ob-pd')) { $('#ob-pd').innerHTML = pdBox(); bindPd(); }
      toast(b.pd.status === 'ok' ? '₹1 credited · name matched' : b.pd.status === 'mismatch' ? 'Name at bank doesn\'t match' : 'Bank couldn\'t verify the account');
    }, 1300);
  }
  function wcBox(){
    const c = ob.d.web.check;
    if (!c) return `<div class="ob-pd"><div class="between" style="flex-wrap:wrap"><div><b>Check your website</b><div class="muted" style="font-size:13px">We open each page you listed and confirm it loads on your domain.</div></div><button class="btn" id="ob-wcgo" style="flex:none">Check website</button></div></div>`;
    if (c.running) return `<div class="ob-pd"><div class="row"><span class="ob-spin"></span><b style="flex:1">Checking ${esc(host(ob.d.web.url))}…</b></div></div>`;
    const ok = c.rows.filter(r => r[1] === 'ok').length;
    return `<div class="ob-pd ${ok === c.rows.length ? 'pd-ok' : 'pd-mismatch'}"><div class="between"><b>${ok === c.rows.length ? '✓ All checks passed' : `${ok} of ${c.rows.length} checks passed`}</b><span class="row" style="flex:none;gap:8px"><span class="muted" style="font-size:12.5px;flex:none;min-width:0">Checked ${c.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span><button class="btn sm" id="ob-wcgo" style="flex:none;min-width:0">Check again</button></span></div>
      <table class="ob-wct"><tbody>${c.rows.map(([l, s, n]) => `<tr><td style="width:26px">${s === 'ok' ? '<span style="color:var(--ok)">✓</span>' : s === 'warn' ? '<span style="color:var(--warn)">!</span>' : '<span style="color:var(--bad)"><i data-icon=x class=li></i></span>'}</td><td style="width:280px"><b>${l}</b></td><td class="muted">${esc(n)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function runSiteCheck(){
    const bad = validate('WEBSITE_DETAILS', ['web.url']); paint('web.url');
    if (bad.length) { focusErr(); return toast('Enter your website URL first'); }
    ob.d.web.check = { running: true }; $('#ob-wc').innerHTML = wcBox();
    setTimeout(() => {
      const w = ob.d.web, site = host(w.url), rows = [];
      rows.push(['Site reachable', /^https:/.test(w.url) ? 'ok' : 'warn', /^https:/.test(w.url) ? `200 OK · valid SSL certificate for ${site}` : 'Loads over http only. Turn on HTTPS before going live.']);
      POL.forEach(([k, l, req]) => { const p = w.pol[k];
        if (!p.on || !p.url) { if (req) rows.push([l, 'bad', 'Not linked from your site']); return; }
        rows.push([l, host(p.url) === site ? 'ok' : 'bad', host(p.url) === site ? `Found at ${p.url.replace(/^https?:\/\//, '')}` : `On ${host(p.url) || 'an invalid URL'}, not ${site}`]); });
      if (w.app) rows.push(['App listing', isUrl(w.app) ? 'ok' : 'bad', isUrl(w.app) ? 'Store page found' : 'Link didn\'t open']);
      w.check = { rows, at: new Date() };
      if ($('#ob-wc')) { $('#ob-wc').innerHTML = wcBox(); bindWc(); }
    }, 1100);
  }

  /* ---- views ---- */
  function rail(){
    const done = doneCount(), pct = Math.round(done / STEPS.length * 100);
    const item = (k, n, t, d, cls, badge) => `<div class="step ${cls}" data-s="${k}" role="button" tabindex="0"><span class="n">${badge || n}</span><div style="min-width:0"><b>${t}</b><div class="muted" style="font-size:12px">${d}</div></div></div>`;
    const stepCls = k => `${state.onboarding[k] === 'done' ? 'done' : ''} ${ob.view === 'step' && ob.cur === k ? 'cur' : ''}`;
    return `<div class="card ob-rail"><div class="between"><b>Your progress</b><b style="color:${pct === 100 ? 'var(--ok)' : 'var(--brand)'}">${pct}%</b></div>
      <div class="prog"><i style="width:${pct}%"></i></div><p class="muted" style="font-size:12.5px;margin:-4px 0 10px">${done} of ${STEPS.length} steps complete</p>
      <div class="steps">${STEPS.map(([k, t, d], i) => item(k, i + 1, t, state.onboarding[k] === 'done' ? 'Completed' : ob.view === 'step' && ob.cur === k ? 'In progress' : d.split(',')[0], stepCls(k), state.onboarding[k] === 'done' ? '✓' : '')).join('')}
        ${item('review', 6, 'Review & submit', ob.submitted ? 'Submitted ' + fmtDate(ob.submitted) : allDone() ? 'Ready to submit' : 'Finish all steps first', `${ob.view === 'review' ? 'cur' : ''} ${ob.submitted ? 'done' : ''}`, ob.submitted ? '✓' : '')}
        ${ob.submitted ? item('status', 7, 'Application status', ob.approved ? 'Approved · live' : 'Under review', `${ob.view === 'status' ? 'cur' : ''} ${ob.approved ? 'done' : ''}`, ob.approved ? '✓' : '◷') : ''}</div>
      <div class="ob-help"><b>Need help?</b><div class="muted" style="font-size:12.5px">Your progress is saved as you go. Write to <span class="mono">onboarding@bizpolepay.example</span> or call 1800-000-0000 (Mon–Sat, 9–7).</div></div></div>`;
  }
  function stepView(){
    const k = ob.cur, i = STEPS.findIndex(s => s[0] === k), [, t, d] = STEPS[i], done = state.onboarding[k] === 'done';
    const nErr = FIELDS[k]().filter(p => ob.err[p]).length, ro = !!ob.submitted, help = STEP_HELP[k];
    return `<div class="card ob-main"><div class="between" style="align-items:flex-start"><div><div class="ob-kicker">STEP ${i + 1} OF ${STEPS.length}</div><h2 class="ob-h2">${t}</h2><p class="muted" style="margin:2px 0 0">${d}.</p></div>
        ${done ? '<span class="pill ok">✓ Completed</span>' : nErr ? `<span class="pill bad">${nErr} to fix</span>` : '<span class="pill warn">In progress</span>'}</div>
      ${ro ? `<div class="ob-banner">Your application is under review, so these details are locked. Write to onboarding@bizpolepay.example to change them.</div>` : ''}
      ${nErr && ob.tried[k] ? `<div class="notice bad" style="margin:14px 0 0">Fix ${nErr} field${nErr > 1 ? 's' : ''} highlighted below to continue.</div>` : ''}
      <fieldset class="ob-fs" ${ro ? 'disabled' : ''}>${FORMS[k]()}</fieldset>
      <div class="ob-actions">${i ? '<button class="btn" id="ob-back"><i data-icon=chevron-left class=li></i> Back</button>' : '<span></span>'}<span style="flex:1"></span>
        ${ro ? `<button class="btn primary" data-s="status">View application status</button>` : `<button class="btn" id="ob-draft">Save draft</button><button class="btn primary" id="ob-next">${i === STEPS.length - 1 ? 'Save & review' : 'Save & continue <i data-icon=chevron-right class=li></i>'}</button>`}</div></div>
    <div class="ob-side"><div class="card"><h3>${help[0][0]}</h3><ul class="ob-ul">${help[0][1].map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div class="card" style="flex:1"><h3>${help[1][0]}</h3><p class="muted" style="margin:0;font-size:13.5px">${help[1][1]}</p>
        <div class="ob-sec"><span><i data-icon=lock class=li></i></span><span class="muted">Details are encrypted and shared only with our payment partner, PayU, for verification.</span></div></div></div>`;
  }
  function summary(k){
    const d = ob.d, rows = {
      PAN_DETAILS: [['Business type', ent()[1]], ['PAN', `<span class="mono">${esc(d.pan.pan)}</span>`], ['Name as on PAN', esc(d.pan.name)], [isPerson() ? 'Date of birth' : 'Incorporated', d.pan.dob ? new Date(d.pan.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—']],
      BUSINESS_DETAILS: [['Legal name', esc(d.biz.legal)], ['Category', `${esc(d.biz.cat)} <i data-icon=chevron-right class=li></i> ${esc(d.biz.sub || '—')}`], ['GSTIN', d.biz.gstin ? `<span class="mono">${d.biz.gstin}</span>` : '<span class="muted">Not provided</span>'],
        ['Address', `${esc(d.biz.addr)}, ${esc(d.biz.city)}, ${esc(d.biz.st)} ${esc(d.biz.pin)}`], ['Monthly volume', esc(d.biz.volume)]],
      BANK_ACCOUNT: [['Account holder', esc(d.bank.holder || '—')], ['Account', `<span class="mono">${mask(d.bank.acct)}</span> · ${d.bank.type}`], ['IFSC', `<span class="mono">${d.bank.ifsc || '—'}</span>`],
        ['Penny-drop', d.bank.pd && d.bank.pd.status === 'ok' ? `<span class="pill ok">✓ ${d.bank.pd.score}% match</span> ${esc(d.bank.pd.nameAtBank)}` : '<span class="pill warn">Not verified</span>']],
      WEBSITE_DETAILS: [['Website', esc(d.web.url || '—')], ['App', esc(d.web.app || 'None')], ['Policy pages', `${POL.filter(p => d.web.pol[p[0]].on).length} of ${POL.length} linked`],
        ['Site check', d.web.check && d.web.check.rows ? `${d.web.check.rows.filter(r => r[1] === 'ok').length} of ${d.web.check.rows.length} passed` : '<span class="muted">Not run</span>']],
      KYC_DOCUMENTS: docsFor().map(([dk, l, , req]) => [l, d.kyc.files[dk] ? `✓ ${esc(d.kyc.files[dk].name)} <span class="muted">(${fsize(d.kyc.files[dk].size)})</span>` : req ? '<span style="color:var(--bad)">Missing</span>' : '<span class="muted">Not provided</span>']),
    }[k];
    return `<dl class="kv ob-kv">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
  }
  function reviewView(){
    const missing = STEPS.filter(([k]) => state.onboarding[k] !== 'done');
    const card = ([k, t], i) => `<div class="card ob-rv ${k === 'KYC_DOCUMENTS' ? 's2' : ''}"><div class="between" style="margin-bottom:6px"><h3 style="margin:0">${i + 1}. ${t}</h3><span class="row" style="flex:none;gap:10px">
      ${state.onboarding[k] === 'done' ? '<span class="pill ok" style="flex:none;min-width:0">✓ Done</span>' : '<span class="pill bad" style="flex:none;min-width:0">Incomplete</span>'}${ob.submitted ? '' : `<button class="linkish" style="flex:none;min-width:0" data-goto="${k}">Edit</button>`}</span></div>${summary(k)}</div>`;
    return `<div class="ob-main ob-wide"><div class="card"><div class="between" style="flex-wrap:wrap"><div><div class="ob-kicker">STEP 6 OF 6</div><h2 class="ob-h2">Review & submit</h2>
        <p class="muted" style="margin:2px 0 0">Check everything once more. After you submit, details are locked while our payment partner reviews them.</p></div>
        ${missing.length ? `<span class="pill bad">${missing.length} step${missing.length > 1 ? 's' : ''} incomplete</span>` : '<span class="pill ok">Ready to submit</span>'}</div>
        ${missing.length ? `<div class="notice bad">Finish ${missing.map(([k, t]) => `<button class="linkish" data-goto="${k}" style="color:var(--bad);text-decoration:underline">${t}</button>`).join(', ')} before you submit.</div>` : ''}</div>
      <div class="ob-rvgrid">${STEPS.map(card).join('')}</div>
      <div class="card ob-decl"><div class="ob-f ${ob.err.decl ? 'has-err' : ''}" data-p="decl"><label class="ck" style="align-items:flex-start"><input type="checkbox" id="ob-decl" ${ob.decl ? 'checked' : ''} ${ob.submitted ? 'disabled' : ''} style="margin-top:3px">
        <span>I confirm these details are true and that I'm authorised to open this account for <b>${esc(ob.d.biz.legal)}</b>. I agree to the Bizpole Pay merchant terms and allow Bizpole Pay to share my KYC with PayU for verification.</span></label>
        ${errBox('decl')}</div>
        <div class="ob-actions" style="margin-top:12px"><button class="btn" data-goto="${STEPS[STEPS.length - 1][0]}"><i data-icon=chevron-left class=li></i> Back</button><span style="flex:1"></span>
          ${ob.submitted ? '<button class="btn primary" data-s="status">View application status</button>' : `<button class="btn primary" id="ob-submit" ${missing.length ? 'disabled' : ''}>Submit application</button>`}</div></div></div>`;
  }
  const AREA_PILL = { VERIFIED: ['ok', 'Verified'], IN_REVIEW: ['warn', 'In review'], ACTION: ['bad', 'Action needed'], SCHEDULED: ['brand', 'Scheduled'], PENDING: ['', 'Pending'] };
  const areaPill = s => `<span class="pill ${AREA_PILL[s][0]}">${AREA_PILL[s][1]}</span>`;
  function statusView(){
    const a = ob.areas, nOk = AREAS.filter(([k]) => a[k] === 'VERIFIED').length;
    const stages = [['Submitted', true], ['Verification', ['pan', 'docs', 'bank', 'web'].every(k => a[k] === 'VERIFIED')], ['Agreement signed', a.esign === 'VERIFIED'], ['Video KYC', a.vkyc === 'VERIFIED'], ['Live', ob.approved]];
    const curStage = stages.findIndex(s => !s[1]);
    const action = k => k === 'esign' && a.esign === 'ACTION' ? '<button class="btn sm primary" data-act="esign">Sign agreement</button>'
      : k === 'vkyc' && ['ACTION', 'SCHEDULED'].includes(a.vkyc) ? `<button class="btn sm ${a.vkyc === 'ACTION' ? 'primary' : ''}" data-act="vkyc">${a.vkyc === 'ACTION' ? 'Start video KYC' : 'Join now'}</button>` : '';
    const notes = { pan: 'Name and PAN matched', docs: a.docs === 'VERIFIED' ? 'All documents accepted' : `${Object.keys(ob.d.kyc.files).length} documents with the risk team`, bank: ob.d.bank.pd && ob.d.bank.pd.nameAtBank ? `${esc(ob.d.bank.pd.nameAtBank)} · ${mask(ob.d.bank.acct)}` : 'Penny-drop matched',
      web: a.web === 'VERIFIED' ? 'Policy pages approved' : `Reviewing ${esc(host(ob.d.web.url) || 'your website')}`, esign: a.esign === 'VERIFIED' ? 'Signed with Aadhaar OTP' : 'Waiting for your signature',
      vkyc: a.vkyc === 'SCHEDULED' ? 'Booked for ' + esc(ob.vkycSlot) : a.vkyc === 'IN_REVIEW' ? 'Call completed · being checked' : a.vkyc === 'VERIFIED' ? 'Identity confirmed' : 'Takes about 3 minutes' };
    return `<div class="ob-main ob-wide">
      <div class="card ob-stathead ${ob.approved ? 'ok' : ''}"><div class="between" style="flex-wrap:wrap;align-items:flex-start"><div><div class="ob-kicker">APPLICATION APP-55120934</div>
          <h2 class="ob-h2">${ob.approved ? '✓ Approved — your live account is ready' : 'Under review'}</h2>
          <p class="muted" style="margin:2px 0 0">${ob.approved ? 'Live MID <span class="mono">87100421</span> is active. Switch to live mode to accept real payments.' : `Submitted ${fmtDate(ob.submitted)}. Reviews usually take 1–3 working days; we email ${esc(state.user.email)} at each step.`}</p></div>
          ${ob.approved ? '<button class="btn primary" id="ob-golive">Switch to live mode</button>' : `<span class="pill warn" style="font-size:13px">${nOk} of ${AREAS.length} areas verified</span>`}</div>
        <div class="ob-stages">${stages.map(([l, d], i) => `<div class="ob-stage ${d ? 'done' : i === curStage ? 'cur' : ''}"><span class="n">${d ? '✓' : i + 1}</span><span>${l}</span></div>`).join('<i></i>')}</div></div>
      <div class="ob-stgrid"><div class="card"><h3>Verification areas</h3><div class="tbl-wrap"><table><thead><tr><th>Area</th><th>Details</th><th>Status</th><th class="right">Action</th></tr></thead><tbody>
          ${AREAS.map(([k, l, d]) => `<tr><td><b>${l}</b><div class="muted" style="font-size:12px">${d}</div></td><td>${notes[k]}</td><td>${areaPill(a[k])}</td><td class="right">${action(k)}</td></tr>`).join('')}</tbody></table></div>
          ${ob.approved ? '' : `<div class="ob-demo"><div><b>Demo controls</b><div class="muted" style="font-size:12.5px">Skip the partner review: mark every area verified and unlock live mode.</div></div><button class="btn" id="ob-approve">Simulate approval</button></div>`}</div>
        <div class="card"><h3>Timeline</h3><div class="ob-tl">${ob.timeline.slice().reverse().map(e => `<div class="ob-ev"><span class="dot ${e.kind === 'warn' ? 'warn' : e.kind === 'bad' ? 'bad' : ''}"></span><div><div>${e.text}</div><div class="muted" style="font-size:12px">${fmtDate(e.t)}</div></div></div>`).join('')}</div></div></div></div>`;
  }
  function view(){
    if (!ob.cur) ob.cur = (STEPS.find(([k]) => state.onboarding[k] !== 'done') || STEPS[0])[0];
    if (!ob.view) ob.view = ob.submitted ? 'status' : allDone() ? 'review' : 'step';
    if (ob.view === 'status' && !ob.submitted) ob.view = 'review';
    const done = doneCount();
    const sub = ob.approved ? 'Your live account is active.' : ob.submitted ? 'Application submitted · under review with our payment partner.' : `${done} of ${STEPS.length} steps complete · progress is saved as you go.`;
    const body = ob.view === 'status' ? statusView() : ob.view === 'review' ? reviewView() : stepView();
    return head('Activate your live account', sub, ob.submitted ? `<span class="pill ${ob.approved ? 'ok' : 'warn'}" style="font-size:13px;padding:6px 12px">${ob.approved ? 'Live' : 'Under review'}</span>` : `<span class="chip">Test mode works while you finish</span>`) +
      `<div class="ob-grid ${ob.view === 'step' ? '' : 'two'}">${rail()}${body}</div>`;
  }

  /* ---- DOM ---- */
  function paint(p){
    const box = document.querySelector(`.ob-f[data-p="${p}"]`); if (!box) return;
    const e = ob.err[p] || '';
    box.classList.toggle('has-err', !!e);
    const el = box.querySelector(':scope > .ob-err'); if (el) el.innerHTML = e ? '<i data-icon=triangle-alert class=li></i> ' + esc(e) : '';
  }
  function focusErr(){ const el = document.querySelector('.ob-f.has-err'); if (el) { el.scrollIntoView({ block: 'center' }); const i = el.querySelector('input:not([type=checkbox]):not([type=file]),select,textarea'); if (i) i.focus({ preventScroll: true }); } }
  const redraw = () => { const r = $('#ob-root'); if (!r) return; r.innerHTML = view(); bind(); };
  const goStep = k => { ob.view = 'step'; ob.cur = k; redraw(); window.scrollTo(0, 0); };
  const addEvent = (text, kind, t) => ob.timeline.push({ text, kind, t: t || new Date() });
  function checkApproved(){
    if (!ob.approved && AREAS.every(([k]) => ob.areas[k] === 'VERIFIED')) {
      ob.approved = true; STEPS.forEach(([k]) => { state.onboarding[k] = 'done'; });
      addEvent('Account approved — live MID 87100421 issued', 'ok'); toast('Approved · live mode unlocked');
    }
  }
  function takeFile(k, f){
    if (!f) return;
    const p = `kyc.files.${k}`;
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) ob.err[p] = `"${f.name}" isn't a PDF, JPG or PNG.`;
    else if (f.size > 5 * 1048576) ob.err[p] = `${f.name} is ${fsize(f.size)}. The limit is 5 MB.`;
    else if (!f.size) ob.err[p] = `${f.name} is empty.`;
    else { ob.d.kyc.files[k] = { name: f.name, size: f.size }; delete ob.err[p]; toast('Uploaded ' + f.name); }
    redraw();
  }
  function onChange(p){
    if (p === 'pan.entity') { if (ob.d.pan.pan) { const m = check('pan.pan'); if (m) ob.err['pan.pan'] = m; else delete ob.err['pan.pan']; } return redraw(); }
    if (p === 'biz.cat') { ob.d.biz.sub = ''; return redraw(); }
    if (/^bank\.(holder|acct|ifsc)$/.test(p) && ob.d.bank.pd && ob.d.bank.pd.status !== 'running') { ob.d.bank.pd = null; $('#ob-pd').innerHTML = pdBox(); bindPd(); if (state.onboarding.BANK_ACCOUNT === 'done') state.onboarding.BANK_ACCOUNT = 'todo'; }
    const pol = p.match(/^web\.pol\.(\w+)\.on$/);
    if (pol) { const up = `web.pol.${pol[1]}.url`, box = document.querySelector(`[data-f="${up}"]`); box.disabled = !get(p); if (get(p)) box.focus(); else { delete ob.err[up]; paint(up); } }
    if (/^web\./.test(p) && ob.d.web.check && !ob.d.web.check.running) { ob.d.web.check = null; $('#ob-wc').innerHTML = wcBox(); bindWc(); }
  }
  const bindPd = () => { const b = $('#ob-pdgo'); if (b) b.onclick = runPennyDrop; };
  const bindWc = () => { const b = $('#ob-wcgo'); if (b) b.onclick = runSiteCheck; };
  const modal = (title, body) => openModal(`<div class="ob-m"><div class="between"><h2 style="margin:0;font-size:20px">${title}</h2><button class="x" onclick="closeAll()" aria-label="Close"><i data-icon=x class=li></i></button></div>${body}</div>`);
  function esignModal(){
    modal('Sign the merchant agreement', `<p class="muted" style="margin:8px 0 12px">Signed digitally with an OTP sent to the mobile linked to the signatory's Aadhaar.</p>
      <div class="ob-agr"><b>Bizpole Pay merchant agreement · v3.2</b><ul class="ob-ul" style="margin:8px 0 0"><li>Pricing: 2% per successful payment + 18% GST on the fee</li><li>Settlement: T+1 working days to ${mask(ob.d.bank.acct)}</li><li>Refunds and chargebacks are adjusted in future settlements</li><li>Either side may end the agreement with 30 days' notice</li></ul></div>
      <dl class="kv ob-kv" style="margin-top:12px"><dt>Signatory</dt><dd>${esc(ob.d.pan.name)}</dd><dt>For</dt><dd>${esc(ob.d.biz.legal)}</dd></dl>
      <div id="ob-otpbox"><button class="btn primary block" id="ob-otp" style="margin-top:14px">Send OTP to Aadhaar-linked mobile</button></div>`);
    $('#ob-otp').onclick = () => {
      $('#ob-otpbox').innerHTML = `<div class="ob-f" data-p="otp"><label>6-digit OTP sent to ••••••4410</label><input id="ob-otpv" inputmode="numeric" maxlength="6" class="mono-in" placeholder="Demo: any 6 digits"><div class="ob-err" role="alert"></div></div>
        <div class="ob-actions" style="justify-content:flex-end;padding-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="ob-sign">Sign agreement</button></div>`;
      $('#ob-otpv').focus();
      $('#ob-sign').onclick = () => {
        if (!/^\d{6}$/.test($('#ob-otpv').value)) { ob.err.otp = 'Enter the 6-digit OTP.'; paint('otp'); delete ob.err.otp; return; }
        ob.areas.esign = 'VERIFIED'; addEvent('Merchant agreement e-signed by ' + esc(ob.d.pan.name), 'ok'); checkApproved(); closeAll(); toast('Agreement signed'); redraw();
      };
    };
  }
  function vkycModal(){
    const slots = [1, 2, 3].map(d => new Date(now.getTime() + d * 864e5).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }));
    modal('Video KYC', `<p class="muted" style="margin:8px 0 12px">A short video call where an agent matches you with your PAN. Use a phone or laptop with a camera.</p>
      <ul class="ob-ul"><li>Keep your original PAN card ready</li><li>Sit in good light, with your face clearly visible</li><li>Stay in India during the call (location is checked)</li></ul>
      <label>Or book a slot</label><select id="ob-slot"><option value="">Choose a slot…</option>${slots.flatMap(s => ['10:00 am', '2:30 pm', '5:00 pm'].map(t => `<option>${s}, ${t}</option>`)).join('')}</select>
      <div class="ob-actions" style="justify-content:flex-end;padding-top:16px"><button class="btn" id="ob-book">Book slot</button><button class="btn primary" id="ob-start">Start call now</button></div>`);
    $('#ob-book').onclick = () => { if (!$('#ob-slot').value) return toast('Choose a slot first'); ob.vkycSlot = $('#ob-slot').value; ob.areas.vkyc = 'SCHEDULED'; addEvent('Video KYC booked for ' + ob.vkycSlot); closeAll(); toast('Slot booked'); redraw(); };
    $('#ob-start').onclick = () => { ob.areas.vkyc = 'IN_REVIEW'; addEvent('Video KYC call completed · recording under review', 'warn'); closeAll(); toast('Video KYC completed'); redraw(); };
  }

  function bind(){
    document.querySelectorAll('#ob-root [data-s]').forEach(s => { const pickStep = () => {
      const k = s.dataset.s;
      if (k === 'review') ob.view = 'review'; else if (k === 'status') ob.view = 'status'; else { ob.view = 'step'; ob.cur = k; }
      redraw(); window.scrollTo(0, 0); };
      s.onclick = pickStep; s.onkeydown = e => { if (e.key === 'Enter') pickStep(); }; });
    document.querySelectorAll('#ob-root [data-goto]').forEach(b => b.onclick = () => goStep(b.dataset.goto));
    document.querySelectorAll('#ob-root [data-f]').forEach(el => {
      const p = el.dataset.f;
      const upd = () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.hasAttribute('data-up') && v !== v.toUpperCase()) { const pos = el.selectionStart; v = v.toUpperCase(); el.value = v; el.setSelectionRange(pos, pos); }
        if (get(p) === v) return;
        set(p, v);
        if (ob.err[p]) { delete ob.err[p]; paint(p); }
        onChange(p);
      };
      el.addEventListener('input', upd); el.addEventListener('change', upd);
      if (el.type !== 'checkbox') el.addEventListener('blur', () => { if (!el.value) return; const m = check(p); if (m) ob.err[p] = m; else delete ob.err[p]; paint(p); });
    });
    if (ob.view === 'step') {
      const i = STEPS.findIndex(s => s[0] === ob.cur);
      if ($('#ob-back')) $('#ob-back').onclick = () => goStep(STEPS[i - 1][0]);
      if ($('#ob-draft')) $('#ob-draft').onclick = () => toast('Draft saved · you can come back any time');
      if ($('#ob-next')) $('#ob-next').onclick = () => {
        ob.tried[ob.cur] = true;
        const bad = validate(ob.cur);
        if (bad.length) { redraw(); focusErr(); return toast(`Fix ${bad.length} field${bad.length > 1 ? 's' : ''} to continue`); }
        state.onboarding[ob.cur] = 'done'; toast(`${STEPS[i][1]} saved`);
        const next = STEPS.find(([k], j) => j > i && state.onboarding[k] !== 'done') || STEPS.find(([k]) => state.onboarding[k] !== 'done');
        if (next) goStep(next[0]); else { ob.view = 'review'; redraw(); window.scrollTo(0, 0); }
      };
      bindPd(); bindWc();
      document.querySelectorAll('#ob-root input[data-doc]').forEach(fi => fi.onchange = e => takeFile(fi.dataset.doc, e.target.files[0]));
      document.querySelectorAll('#ob-root [data-dropdoc]').forEach(z => {
        z.ondragover = e => { e.preventDefault(); z.classList.add('over'); };
        z.ondragleave = () => z.classList.remove('over');
        z.ondrop = e => { e.preventDefault(); z.classList.remove('over'); takeFile(z.dataset.dropdoc, e.dataTransfer.files[0]); };
      });
      document.querySelectorAll('#ob-root [data-rm]').forEach(b => b.onclick = () => { delete ob.d.kyc.files[b.dataset.rm]; if (state.onboarding.KYC_DOCUMENTS === 'done') state.onboarding.KYC_DOCUMENTS = 'todo'; redraw(); toast('File removed'); });
      if ($('#ob-sample')) $('#ob-sample').onclick = () => {
        docsFor().forEach(([k], n) => { if (!ob.d.kyc.files[k]) ob.d.kyc.files[k] = { name: `${k}-${(ob.d.pan.pan || 'doc').toLowerCase()}.${n % 2 ? 'jpg' : 'pdf'}`, size: 180000 + n * 213457 }; delete ob.err[`kyc.files.${k}`]; });
        redraw(); toast('Sample files attached');
      };
    }
    if (ob.view === 'review') {
      const d = $('#ob-decl'); if (d) d.onchange = () => { ob.decl = d.checked; if (d.checked) { delete ob.err.decl; paint('decl'); } };
      if ($('#ob-submit')) $('#ob-submit').onclick = () => {
        if (!allDone()) return toast('Finish every step first');
        if (!ob.decl) { ob.err.decl = 'Tick the declaration to submit.'; paint('decl'); return; }
        const t = new Date(), at = s => new Date(t.getTime() + s * 1000);
        ob.submitted = t; ob.view = 'status';
        ob.areas = { pan: 'VERIFIED', docs: 'IN_REVIEW', bank: ob.d.bank.pd && ob.d.bank.pd.status === 'ok' ? 'VERIFIED' : 'IN_REVIEW', web: 'IN_REVIEW', esign: 'ACTION', vkyc: 'ACTION' };
        addEvent('Application submitted', '', t);
        addEvent(`PAN ${ob.d.pan.pan.slice(0, 5)}••••${ob.d.pan.pan.slice(-1)} verified with the Income Tax database`, 'ok', at(1));
        if (ob.areas.bank === 'VERIFIED') addEvent('Bank account verified · name at bank matched', 'ok', at(2));
        addEvent(`${Object.keys(ob.d.kyc.files).length} documents queued for the risk team`, 'warn', at(3));
        addEvent('Website review started', 'warn', at(4));
        addEvent('Waiting for agreement e-sign and video KYC', 'bad', at(5));
        redraw(); window.scrollTo(0, 0); toast('Application submitted for review');
      };
    }
    if (ob.view === 'status') {
      document.querySelectorAll('#ob-root [data-act]').forEach(b => b.onclick = () => (b.dataset.act === 'esign' ? esignModal() : vkycModal()));
      if ($('#ob-approve')) $('#ob-approve').onclick = () => {
        const msg = { docs: 'KYC documents accepted', web: 'Website approved', esign: 'Agreement e-signed', vkyc: 'Video KYC approved', bank: 'Bank account verified', pan: 'PAN verified' };
        AREAS.forEach(([k]) => { if (ob.areas[k] !== 'VERIFIED') { ob.areas[k] = 'VERIFIED'; addEvent(msg[k], 'ok'); } });
        checkApproved(); redraw();
      };
      if ($('#ob-golive')) $('#ob-golive').onclick = () => { state.mode = 'live'; toast('Switched to live mode'); go('home'); };
    }
  }

  addStyle('onboarding', `
    .ob-grid{display:grid;grid-template-columns:290px minmax(0,1fr) 320px;gap:16px;align-items:stretch}
    .ob-grid.two{grid-template-columns:290px minmax(0,1fr)}
    .ob-rail{display:flex;flex-direction:column}
    .ob-rail .step b{font-size:14px}
    .ob-help{margin-top:auto;padding-top:14px;border-top:1px solid var(--line)}
    .ob-rail .steps{margin-bottom:16px}
    .ob-main.card{display:flex;flex-direction:column;padding:22px 26px}
    .ob-wide{display:flex;flex-direction:column;gap:16px;min-width:0}
    .ob-kicker{font:600 11px "JetBrains Mono",monospace;letter-spacing:.08em;color:var(--brand)}
    .ob-h2{margin:2px 0 0;font-size:21px;letter-spacing:-.02em}
    .ob-sub{margin:22px 0 2px;font-size:14px}
    .ob-fs{border:0;padding:0;margin:8px 0 22px;min-width:0}
    .ob-fs:disabled{opacity:.75}
    .ob-fg{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px}
    .ob-fg2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
    .ob-f.s2{grid-column:1/-1}
    .ob-f.has-err>input,.ob-f.has-err>select,.ob-f.has-err>textarea{border-color:var(--bad);background:#fffafb}
    .ob-err{color:var(--bad);font-size:12.5px;margin-top:4px;font-weight:500}
    .ob-err:empty{display:none}
    .ob-hint{color:var(--muted);font-size:12px;margin-top:4px}
    .ob-f.has-err .ob-hint{display:none}
    .mono-in{font-family:"JetBrains Mono",monospace;letter-spacing:.04em}
    .ob-fg textarea{resize:vertical}
    .ob-note{display:flex;flex-direction:column;gap:2px;margin-top:18px;padding:12px 14px;border-radius:10px;background:var(--soft);font-size:13px}
    .ob-actions{display:flex;gap:10px;align-items:center}
    .ob-main.card>.ob-actions{border-top:1px solid var(--line);margin-top:auto;padding-top:16px}
    .ob-side{display:flex;flex-direction:column;gap:16px}
    .ob-ul{margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2)} .ob-ul li{margin:4px 0}
    .ob-sec{display:flex;gap:8px;font-size:12.5px;margin-top:auto;padding-top:14px}
    .ob-pd{margin-top:18px;padding:14px 16px;border:1.5px dashed var(--line);border-radius:12px;background:var(--soft)}
    .ob-pd.pd-ok{border-style:solid;border-color:#bfe8d6;background:var(--ok-soft)}
    .ob-pd.pd-mismatch,.ob-pd.pd-failed{border-style:solid;border-color:#f3c3cc;background:var(--bad-soft)}
    .ob-pd.has-err{border-color:var(--bad)}
    .ob-kv{grid-template-columns:130px 1fr;margin-top:8px;font-size:13px}
    .ob-kv dd{word-break:normal;overflow-wrap:anywhere}
    .ob-spin{width:20px;height:20px;border-radius:50%;border:3px solid var(--brand-soft);border-top-color:var(--brand);animation:obspin .8s linear infinite;flex:none!important;min-width:0!important}
    @keyframes obspin{to{transform:rotate(360deg)}}
    .ob-pols{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin-top:8px}
    .ob-pol{padding:10px 12px;border:1px solid var(--line);border-radius:10px}
    .ob-pol .ck{margin:0 0 8px!important}
    .ob-pol>input{padding:8px 10px;font-size:13px}
    .ob-pol>input:disabled{background:var(--soft)}
    .ob-pol.has-err{border-color:#f3c3cc;background:#fffafb}
    .ob-wct{margin-top:8px;font-size:13px} .ob-wct td{padding:6px 8px;border-top:1px solid rgba(0,0,0,.06);white-space:normal}
    .ob-docs{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .ob-doc{padding:12px 14px;border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;gap:10px}
    .ob-doc.has-err{border-color:var(--bad);background:#fffafb}
    .ob-doc.has-file{border-color:#bfe8d6}
    .ob-up{display:flex!important;align-items:center;gap:12px;padding:12px 14px;border:1.5px dashed var(--line);border-radius:10px;background:var(--soft);cursor:pointer;font-weight:500!important;font-size:13px!important;margin:auto 0 0!important}
    .ob-up:hover,.ob-up.over{border-color:var(--brand);background:var(--brand-soft)}
    .ob-file{display:flex;align-items:center;gap:10px;margin-top:auto;padding:8px 10px;border-radius:10px;background:var(--ok-soft)}
    .ob-fic{width:34px;height:34px;border-radius:8px;background:#fff;display:grid;place-items:center;font:600 10px "JetBrains Mono",monospace;color:var(--ok);flex:none}
    .ob-fname{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ob-mask{margin-top:14px;padding:12px 14px;border-radius:10px;background:var(--warn-soft);font-size:13px}
    .ob-mask .ck{margin-top:8px!important}
    .ob-banner{margin-top:14px;padding:10px 12px;border-radius:10px;background:var(--warn-soft);color:#7a5600;font-size:13px}
    .ob-rvgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .ob-rv.s2{grid-column:1/-1}
    .ob-rv .ob-kv{grid-template-columns:150px 1fr}
    .ob-rv.s2 .ob-kv{grid-template-columns:repeat(2,minmax(150px,240px) 1fr)}
    .ob-decl .ck{font-size:13.5px!important;line-height:1.5}
    .ob-stathead{background:linear-gradient(90deg,#fff8e8,#f3f1ff);border-color:#efe4c8}
    .ob-stathead.ok{background:linear-gradient(90deg,var(--ok-soft),#f3f1ff);border-color:#bfe8d6}
    .ob-stages{display:flex;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap}
    .ob-stages>i{flex:1;height:2px;background:var(--line);min-width:20px}
    .ob-stage{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--muted)}
    .ob-stage .n{width:26px;height:26px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;font-size:12px;background:#fff}
    .ob-stage.done{color:var(--ok)} .ob-stage.done .n{background:var(--ok);border-color:var(--ok);color:#fff}
    .ob-stage.cur{color:var(--brand)} .ob-stage.cur .n{border-color:var(--brand)}
    .ob-stgrid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px}
    .ob-stgrid td{white-space:normal;vertical-align:middle}
    .ob-stgrid .card>.tbl-wrap{margin-bottom:14px}
    .ob-demo{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:auto;padding:12px 14px;border:1.5px dashed var(--brand-2);border-radius:12px;background:var(--brand-soft)}
    .ob-tl{display:flex;flex-direction:column;gap:12px;font-size:13.5px}
    .ob-ev{display:flex;gap:6px;align-items:flex-start} .ob-ev .dot{margin-top:6px;flex:none}
    .ob-agr{padding:12px 14px;border-radius:10px;background:var(--soft);font-size:13.5px}
    .modal:has(.ob-m){width:min(520px,calc(100% - 32px))}
    @media (max-width:1300px){ .ob-grid{grid-template-columns:260px minmax(0,1fr)} .ob-side{grid-column:2} }
    @media (max-width:1000px){ .ob-grid,.ob-grid.two{grid-template-columns:1fr} .ob-side{grid-column:auto} .ob-stgrid{grid-template-columns:1fr} .ob-rv.s2 .ob-kv{grid-template-columns:150px 1fr} }
    @media (max-width:820px){ .ob-fg,.ob-pols,.ob-docs,.ob-rvgrid{grid-template-columns:1fr} .ob-main.card{padding:16px} .ob-stages>i{display:none} .ob-kv,.ob-rv .ob-kv,.ob-rv.s2 .ob-kv{grid-template-columns:1fr} }
  `);

  PAGES.onboarding = () => `<div id="ob-root">${view()}</div>`;
  BIND.onboarding = () => bind();
})();

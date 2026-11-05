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
      ['How the account is checked', 'During review ₹1 is credited to the account to read back the holder\'s name from the bank. It must match your PAN or legal business name. Automatic penny-drop isn\'t connected in Bizpole Pay yet, so this happens after you submit.']],
    WEBSITE_DETAILS: [['What you need', ['A live website or app where customers buy from you', 'Public pages for terms, refunds, privacy and contact', 'Prices shown in rupees']],
      ['Why we ask', 'Card networks and banks require these pages before they allow online payments. We check that each page loads and belongs to your domain.']],
    KYC_DOCUMENTS: [['What you need', ['Clear scans or photos (PDF, JPG or PNG, up to 5 MB each)', 'Masked Aadhaar only — the first 8 digits hidden']],
      ['Why we ask', 'Documents depend on your business type. They are shared only with our payment partner for verification under RBI KYC rules.']],
  };
  // Labels for the payment partner's per-area onboarding statuses (onboarding status area); unknown areas are shown as-is.
  const AREA_LABEL = { account: 'Account', kyc: 'KYC', pan_verification: 'PAN verification', document: 'KYC documents', bank: 'Bank account', website: 'Website review', agreement: 'Agreement e-sign', vkyc: 'Video KYC', settlement: 'Settlement' };
  const STATUS_LABEL = { TEST_ONLY: 'Not started', ONBOARDING: 'In progress', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', ACTION_REQUIRED: 'Action needed', LIVE: 'Live', REJECTED: 'Rejected', SUSPENDED: 'Suspended', DEACTIVATED: 'Deactivated' };
  const STEP_LABEL = { NOT_STARTED: ['', 'Not started'], IN_PROGRESS: ['warn', 'Draft saved'], SUBMITTED: ['brand', 'Submitted'], VERIFIED: ['ok', 'Verified'], REJECTED: ['bad', 'Rejected'] };
  const EVENT_LABEL = { 'onboarding.step_draft': 'draft saved', 'onboarding.step_submitted': 'submitted' };

  const blank = () => ({
    pan: { pan: '', name: '', entity: '', dob: '' },
    biz: { legal: '', brand: '', cat: '', sub: '', gstin: '', addr: '', city: '', st: '', pin: '', volume: '', desc: '' },
    bank: { holder: '', type: 'Current', acct: '', acct2: '', ifsc: '' },
    web: { url: '', app: '', pol: Object.fromEntries(POL.map(p => [p[0], { on: false, url: '' }])), check: null },
    kyc: { files: {}, masked: false },
  });
  // srv = last GET /onboarding response (merchant status, saved PAN last 4, primary bank, verification areas, timeline).
  const ob = { view: null, cur: null, err: {}, tried: {}, decl: false, saving: false, mid: null, srv: null, d: blank() };
  const EDITABLE = ['TEST_ONLY', 'ONBOARDING', 'ACTION_REQUIRED'];
  const srv = () => ob.srv || { merchantStatus: 'TEST_ONLY', editable: true, pan: {}, steps: {}, bank: null, documents: [], payu: [], timeline: [] };
  const locked_ = () => !srv().editable;
  const submittedAt = () => { const e = srv().timeline.filter(t => t.action === 'onboarding.submitted').pop(); return e ? new Date(e.at) : null; };
  const approved = () => srv().merchantStatus === 'LIVE';
  const panSaved = () => !!(srv().pan && srv().pan.saved);
  const bankSaved = () => srv().bank;
  const keepBank = () => !!bankSaved() && ob.d.bank.ifsc === bankSaved().ifsc;

  // Fill the form from what the server holds. Raw PAN and account numbers never come back, so those inputs stay empty.
  function hydrate(r, keys){
    ob.srv = r;
    const st = r.steps, d = ob.d;
    const want = k => !keys || keys.includes(k);
    if (want('PAN_DETAILS')) { const p = st.PAN_DETAILS.data; d.pan = { pan: '', name: p.name || '', entity: p.entity || r.entity || '', dob: p.dob || '' }; }
    if (want('BUSINESS_DETAILS')) d.biz = { ...blank().biz, ...st.BUSINESS_DETAILS.data };
    if (want('BANK_ACCOUNT')) { const b = st.BANK_ACCOUNT.data; d.bank = { holder: b.holder || (r.bank && r.bank.holder) || '', type: b.type || 'Current', acct: '', acct2: '', ifsc: b.ifsc || (r.bank && r.bank.ifsc) || '' }; }
    if (want('WEBSITE_DETAILS')) { const w = st.WEBSITE_DETAILS.data; d.web = { url: w.url || '', app: w.app || '', pol: { ...blank().web.pol, ...(w.pol || {}) }, check: null }; }
    if (want('KYC_DOCUMENTS')) d.kyc = { files: {}, masked: !!st.KYC_DOCUMENTS.data.masked };
  }
  LOAD.onboarding = async () => {
    const mid = state.merchant && state.merchant.id;
    if (ob.srv && ob.mid === mid) return; // mode switches don't change onboarding; keep unsaved edits
    const r = await api('/onboarding', { mode: false });
    Object.assign(ob, { view: null, cur: null, err: {}, tried: {}, decl: false, mid, d: blank() });
    hydrate(r);
  };

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
  // Last 4 of the account: what's typed now, else the saved account (when it's being kept).
  const acctLast4 = () => ob.d.bank.acct ? ob.d.bank.acct.slice(-4) : keepBank() ? bankSaved().last4 : '';

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
    'pan.pan': v => !v ? (panSaved() ? '' : 'Enter your PAN.') : !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? 'A PAN has 10 characters: 5 letters, 4 digits, then 1 letter (for example ABCPK1234F).'
      : ob.d.pan.entity && !ent()[2].includes(v[3]) ? `The 4th letter "${v[3]}" is used for PANs issued to ${PAN_TYPE[v[3]] || 'another holder type'}. A ${ent()[1].toLowerCase()} PAN has "${ent()[2].join('" or "')}" there.` : '',
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
      const pan = ob.d.pan.pan, last4 = srv().pan && srv().pan.last4;
      if (pan) { if (v.slice(2, 12) !== pan) return `Characters 3–12 of a GSTIN are the PAN. This GSTIN has ${v.slice(2, 12)}, but your PAN is ${pan}.`; }
      else if (!last4) return 'Save your PAN details first. Characters 3–12 of a GSTIN must be your PAN.';
      else if (v.slice(8, 12) !== last4) return `Characters 3–12 of a GSTIN are the PAN, but this GSTIN doesn't match your saved PAN (ending ${last4}).`;
      return '';
    },
    'biz.desc': v => v.trim().length < 20 ? 'Describe what you sell in at least 20 characters.' : '',
    'biz.addr': v => v.trim().length < 10 ? 'Enter the building and street (at least 10 characters).' : '',
    'biz.city': v => v.trim() ? '' : 'Enter the city.',
    'biz.st': v => v ? '' : 'Choose the state.',
    'biz.pin': v => !v ? 'Enter the PIN code.' : !/^[1-9][0-9]{5}$/.test(v) ? 'A PIN code has 6 digits and doesn\'t start with 0.' : '',
    'biz.volume': v => v ? '' : 'Choose your expected monthly volume.',
    'bank.holder': v => v.trim().length < 3 ? 'Enter the account holder name.' : '',
    // A saved account can be kept without re-typing its number, as long as the IFSC is unchanged.
    'bank.acct': v => !v ? (keepBank() ? '' : bankSaved() ? 'Enter the account number again to change the IFSC.' : 'Enter the account number.') : !/^\d{9,18}$/.test(v) ? 'Account numbers have 9 to 18 digits, with no spaces.' : '',
    'bank.acct2': v => !ob.d.bank.acct && keepBank() ? '' : !v ? 'Re-enter the account number.' : v !== ob.d.bank.acct ? 'The account numbers don\'t match.' : '',
    'bank.ifsc': v => !v ? 'Enter the IFSC.' : !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? 'An IFSC has 11 characters: 4 letters, a zero, then 6 letters or digits (for example HDFC0001234).' : '',
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
    BANK_ACCOUNT: () => ['bank.holder', 'bank.acct', 'bank.acct2', 'bank.ifsc'],
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
      ${fld('pan.pan', isPerson() ? 'PAN of the ' + (ob.d.pan.entity === 'individual' ? 'individual' : 'proprietor') : 'Business PAN', inp('pan.pan', `maxlength="10" data-up autocomplete="off" placeholder="${panSaved() ? 'Saved · ending ' + esc(srv().pan.last4) : 'ABCPK1234F'}" class="mono-in"`),
        { hint: panSaved() ? `Saved PAN ends in ${esc(srv().pan.last4)}. Leave blank to keep it, or type a new one.` : ob.d.pan.entity ? `10 characters. The 4th letter must be ${ent()[2].join(' or ')} for a ${ent()[1].toLowerCase()}.` : '10 characters: 5 letters, 4 digits, 1 letter.' })}
      ${fld('pan.name', 'Name as on PAN', inp('pan.name', 'placeholder="Exactly as printed"'))}
      ${fld('pan.dob', isPerson() ? 'Date of birth' : 'Date of incorporation', inp('pan.dob', `type="date" max="${now.toISOString().slice(0, 10)}"`))}
    </div>
    <div class="ob-note"><b>PAN check</b><span class="muted">Your PAN is stored encrypted; only the last 4 characters are shown back. Automatic verification with the Income Tax database isn't connected yet, so the PAN is checked during review.</span></div>`,
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
      ${fld('bank.acct', 'Account number', inp('bank.acct', `inputmode="numeric" maxlength="18" autocomplete="off" class="mono-in" ${bankSaved() ? `placeholder="Saved · ending ${esc(bankSaved().last4)}"` : ''}`),
        bankSaved() ? { hint: 'Leave blank to keep the saved account, or type a new number.' } : {})}
      ${fld('bank.acct2', 'Re-enter account number', inp('bank.acct2', 'inputmode="numeric" maxlength="18" autocomplete="off" class="mono-in" onpaste="return false"'), { hint: 'Type it again; pasting is turned off.' })}
      ${fld('bank.ifsc', 'IFSC', inp('bank.ifsc', 'maxlength="11" data-up placeholder="HDFC0001234" class="mono-in"'), { hint: 'Printed on your cheque book.' })}
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
      return `<div class="ob-banner" style="margin:0 0 14px"><b>Document upload isn't available yet.</b> No secure file storage is connected to Bizpole Pay, so KYC documents can't be stored and this step can't be completed for now. Your other steps are saved; you can come back to this one later.</div>
      <p class="muted" style="margin:0 0 12px">Documents for a <b style="color:var(--ink)">${ent()[1].toLowerCase()}</b>. Change the business type in <button class="linkish" data-goto="PAN_DETAILS">PAN details</button> if this is wrong.</p>
      <div class="ob-docs">${docs.map(([k, l, h, req]) => { const f = ob.d.kyc.files[k], e = ob.err[`kyc.files.${k}`];
        return `<div class="ob-doc ob-f ${e ? 'has-err' : ''} ${f ? 'has-file' : ''}" data-p="kyc.files.${k}"><div class="between" style="align-items:flex-start"><div><b>${l}</b>${req ? '' : ' <span class="muted">(optional)</span>'}<div class="muted" style="font-size:12.5px">${h}</div></div>${f ? '<span class="pill ok">Uploaded</span>' : req ? '<span class="pill">Required</span>' : ''}</div>
          ${f ? `<div class="ob-file"><span class="ob-fic">${/\.pdf$/i.test(f.name) ? 'PDF' : 'IMG'}</span><div style="flex:1;min-width:0"><div class="ob-fname">${esc(f.name)}</div><div class="muted" style="font-size:12px">${fsize(f.size)}</div></div>
              <label class="btn sm" style="margin:0">Replace<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" data-doc="${k}"></label><button class="btn sm danger" data-rm="${k}">Remove</button></div>`
            : `<label class="ob-up" data-dropdoc="${k}"><input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" data-doc="${k}"><span style="font-size:20px"><i data-icon=upload class=li></i></span><span><b>Drop a file or click to choose</b><br><span class="muted" style="font-size:12px">PDF, JPG or PNG · max 5 MB</span></span></label>`}
          ${errBox(`kyc.files.${k}`)}</div>`; }).join('')}</div>
      ${docs.some(d => d[0] === 'aadhaar') ? `<div class="ob-f ob-mask ${ob.err['kyc.masked'] ? 'has-err' : ''}" data-p="kyc.masked"><div><b>Masked Aadhaar only.</b> <span class="muted">Hide the first 8 digits so only the last 4 show (XXXX XXXX 1234). Download a masked copy from the UIDAI website. We reject unmasked Aadhaar and delete the file.</span></div>
        <label class="ck"><input type="checkbox" data-f="kyc.masked" ${ob.d.kyc.masked ? 'checked' : ''}>The Aadhaar I uploaded is masked</label>${errBox('kyc.masked')}</div>` : ''}`; },
  };

  // Penny-drop isn't connected: show what's saved and say so, rather than a simulated ₹1 credit.
  function pdBox(){
    const b = bankSaved();
    if (b && b.verified) return `<div class="ob-pd pd-ok"><b style="color:var(--ok)">✓ Account verified</b><dl class="kv ob-kv"><dt>Name at bank</dt><dd><b>${esc(b.nameAtBank || '—')}</b></dd><dt>Account</dt><dd class="mono">${esc(b.bankName || bankName(b.ifsc))} ••••${esc(b.last4)} · ${esc(b.ifsc)}</dd></dl></div>`;
    return `<div class="ob-pd"><b>₹1 penny-drop verification</b><div class="muted" style="font-size:13px;margin-top:2px">Automatic penny-drop isn't connected yet. When you save, the account number is stored encrypted and the account is verified during review.
      ${b ? `<br>Saved: <span class="mono">${esc(b.bankName || bankName(b.ifsc))} ••••${esc(b.last4)} · ${esc(b.ifsc)}</span> · <span class="pill warn">Not verified yet</span>` : ''}</div></div>`;
  }
  function runSiteCheckView(c){
    const ok = c.rows.filter(r => r[1] === 'ok').length;
    return `<div class="ob-pd ${ok === c.rows.length ? 'pd-ok' : 'pd-mismatch'}"><div class="between"><b>${ok === c.rows.length ? '✓ All checks passed' : `${ok} of ${c.rows.length} checks passed`}</b><span class="row" style="flex:none;gap:8px"><span class="muted" style="font-size:12.5px;flex:none;min-width:0">Checked ${c.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span><button class="btn sm" id="ob-wcgo" style="flex:none;min-width:0">Check again</button></span></div>
      <table class="ob-wct"><tbody>${c.rows.map(([l, s, n]) => `<tr><td style="width:26px">${s === 'ok' ? '<span style="color:var(--ok)">✓</span>' : s === 'warn' ? '<span style="color:var(--warn)">!</span>' : '<span style="color:var(--bad)"><i data-icon=x class=li></i></span>'}</td><td style="width:280px"><b>${esc(l)}</b></td><td class="muted">${esc(n)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function wcBox(){
    const c = ob.d.web.check;
    if (!c) return `<div class="ob-pd"><div class="between" style="flex-wrap:wrap"><div><b>Check your website</b><div class="muted" style="font-size:13px">We open each page you listed and confirm it loads on your domain.</div></div><button class="btn" id="ob-wcgo" style="flex:none">Check website</button></div></div>`;
    if (c.running) return `<div class="ob-pd"><div class="row"><span class="ob-spin"></span><b style="flex:1">Checking ${esc(host(ob.d.web.url))}…</b></div></div>`;
    return runSiteCheckView(c);
  }
  // Our server opens each page and reports the real HTTP result.
  async function runSiteCheck(){
    const bad = validate('WEBSITE_DETAILS', ['web.url']); paint('web.url');
    if (bad.length) { focusErr(); return toast('Enter your website URL first'); }
    const w = ob.d.web;
    w.check = { running: true }; $('#ob-wc').innerHTML = wcBox();
    try {
      const r = await api('/onboarding/website/check', { method: 'POST', mode: false, body: { url: w.url, app: w.app, pol: w.pol } });
      w.check = { rows: r.rows, at: new Date(r.at) };
    } catch (e) { w.check = null; apiFail(e); }
    if ($('#ob-wc')) { $('#ob-wc').innerHTML = wcBox(); bindWc(); }
  }

  /* ---- views ---- */
  const canEdit = () => !locked_() && ['OWNER', 'ADMIN'].includes(state.role);
  const rawOf = k => state.onboardingRaw[k] || 'NOT_STARTED';
  function rail(){
    const done = doneCount(), pct = Math.round(done / STEPS.length * 100), sub = submittedAt();
    const item = (k, n, t, d, cls, badge) => `<div class="step ${cls}" data-s="${k}" role="button" tabindex="0"><span class="n">${badge || n}</span><div style="min-width:0"><b>${t}</b><div class="muted" style="font-size:12px">${d}</div></div></div>`;
    const stepCls = k => `${state.onboarding[k] === 'done' ? 'done' : ''} ${ob.view === 'step' && ob.cur === k ? 'cur' : ''}`;
    const stepSub = (k, d) => rawOf(k) === 'VERIFIED' ? 'Verified' : rawOf(k) === 'SUBMITTED' ? 'Submitted' : rawOf(k) === 'REJECTED' ? 'Needs changes' : rawOf(k) === 'IN_PROGRESS' ? 'Draft saved' : ob.view === 'step' && ob.cur === k ? 'In progress' : d.split(',')[0];
    return `<div class="card ob-rail"><div class="between"><b>Your progress</b><b style="color:${pct === 100 ? 'var(--ok)' : 'var(--brand)'}">${pct}%</b></div>
      <div class="prog"><i style="width:${pct}%"></i></div><p class="muted" style="font-size:12.5px;margin:-4px 0 10px">${done} of ${STEPS.length} steps complete</p>
      <div class="steps">${STEPS.map(([k, t, d], i) => item(k, i + 1, t, stepSub(k, d), stepCls(k), state.onboarding[k] === 'done' ? '✓' : '')).join('')}
        ${item('review', 6, 'Review & submit', locked_() ? 'Submitted' + (sub ? ' ' + fmtDate(sub) : '') : allDone() ? 'Ready to submit' : 'Finish all steps first', `${ob.view === 'review' ? 'cur' : ''} ${locked_() ? 'done' : ''}`, locked_() ? '✓' : '')}
        ${locked_() ? item('status', 7, 'Application status', STATUS_LABEL[srv().merchantStatus] || srv().merchantStatus, `${ob.view === 'status' ? 'cur' : ''} ${approved() ? 'done' : ''}`, approved() ? '✓' : '◷') : ''}</div>
      <div class="ob-help"><b>Need help?</b><div class="muted" style="font-size:12.5px">Your progress is saved to your account as you go, so you can leave and come back any time.</div></div></div>`;
  }
  function stepPill(k, nErr){
    const r = rawOf(k);
    if (r === 'VERIFIED') return '<span class="pill ok">✓ Verified</span>';
    if (nErr) return `<span class="pill bad">${nErr} to fix</span>`;
    if (r === 'SUBMITTED') return '<span class="pill ok">✓ Submitted</span>';
    if (r === 'REJECTED') return '<span class="pill bad">Needs changes</span>';
    if (r === 'IN_PROGRESS') return '<span class="pill warn">Draft saved</span>';
    return '<span class="pill">Not started</span>';
  }
  function stepView(){
    const k = ob.cur, i = STEPS.findIndex(s => s[0] === k), [, t, d] = STEPS[i], isKyc = k === 'KYC_DOCUMENTS';
    const nErr = FIELDS[k]().filter(p => ob.err[p]).length, ro = !canEdit(), help = STEP_HELP[k], remarks = (srv().steps[k] || {}).remarks;
    return `<div class="card ob-main"><div class="between" style="align-items:flex-start"><div><div class="ob-kicker">STEP ${i + 1} OF ${STEPS.length}</div><h2 class="ob-h2">${t}</h2><p class="muted" style="margin:2px 0 0">${d}.</p></div>
        ${stepPill(k, nErr)}</div>
      ${locked_() ? `<div class="ob-banner">Your application has been submitted, so these details are locked. Contact Bizpole Pay support to change them.</div>`
        : ro ? `<div class="ob-banner">Only the account owner or an admin can fill in onboarding. You can view what's been saved.</div>` : ''}
      ${remarks ? `<div class="notice bad" style="margin:14px 0 0"><b>Reviewer note:</b> ${esc(remarks)}</div>` : ''}
      ${nErr && ob.tried[k] ? `<div class="notice bad" style="margin:14px 0 0">Fix ${nErr} field${nErr > 1 ? 's' : ''} highlighted below to continue.</div>` : ''}
      <fieldset class="ob-fs" ${ro ? 'disabled' : ''}>${FORMS[k]()}</fieldset>
      <div class="ob-actions">${i ? '<button class="btn" id="ob-back"><i data-icon=chevron-left class=li></i> Back</button>' : '<span></span>'}<span style="flex:1"></span>
        ${locked_() ? `<button class="btn primary" data-s="status">View application status</button>`
          : ro ? (i < STEPS.length - 1 ? `<button class="btn" data-goto="${STEPS[i + 1][0]}">Next <i data-icon=chevron-right class=li></i></button>` : '<button class="btn" data-s="review">Review</button>')
          : `<button class="btn" id="ob-draft">Save draft</button><button class="btn primary" id="ob-next">${isKyc ? 'Save draft & review' : i === STEPS.length - 1 ? 'Save & review' : 'Save & continue <i data-icon=chevron-right class=li></i>'}</button>`}</div></div>
    <div class="ob-side"><div class="card"><h3>${help[0][0]}</h3><ul class="ob-ul">${help[0][1].map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div class="card" style="flex:1"><h3>${help[1][0]}</h3><p class="muted" style="margin:0;font-size:13.5px">${help[1][1]}</p>
        <div class="ob-sec"><span><i data-icon=lock class=li></i></span><span class="muted">PAN and account numbers are stored encrypted. Details are shared only with our RBI-authorised payment partner, for verification.</span></div></div></div>`;
  }
  function summary(k){
    const d = ob.d, last4 = d.pan.pan ? d.pan.pan.slice(-4) : panSaved() ? srv().pan.last4 : '', a4 = acctLast4(), b = bankSaved();
    const rows = {
      PAN_DETAILS: [['Business type', d.pan.entity ? ent()[1] : '—'], ['PAN', last4 ? `<span class="mono">••••••${esc(last4)}</span>` : '—'], ['Name as on PAN', esc(d.pan.name || '—')], [isPerson() ? 'Date of birth' : 'Incorporated', d.pan.dob ? new Date(d.pan.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—']],
      BUSINESS_DETAILS: [['Legal name', esc(d.biz.legal || '—')], ['Category', d.biz.cat ? `${esc(d.biz.cat)} <i data-icon=chevron-right class=li></i> ${esc(d.biz.sub || '—')}` : '—'], ['GSTIN', d.biz.gstin ? `<span class="mono">${esc(d.biz.gstin)}</span>` : '<span class="muted">Not provided</span>'],
        ['Address', d.biz.addr ? `${esc(d.biz.addr)}, ${esc(d.biz.city)}, ${esc(d.biz.st)} ${esc(d.biz.pin)}` : '—'], ['Monthly volume', esc(d.biz.volume || '—')]],
      BANK_ACCOUNT: [['Account holder', esc(d.bank.holder || '—')], ['Account', a4 ? `<span class="mono">••••${esc(a4)}</span> · ${esc(d.bank.type)}` : '—'], ['IFSC', `<span class="mono">${esc(d.bank.ifsc || '—')}</span>`],
        ['Penny-drop', b && b.verified ? `<span class="pill ok">✓ Verified</span> ${esc(b.nameAtBank || '')}` : '<span class="pill warn">Not verified yet</span>']],
      WEBSITE_DETAILS: [['Website', esc(d.web.url || '—')], ['App', esc(d.web.app || 'None')], ['Policy pages', `${POL.filter(p => d.web.pol[p[0]].on).length} of ${POL.length} linked`],
        ['Site check', d.web.check && d.web.check.rows ? `${d.web.check.rows.filter(r => r[1] === 'ok').length} of ${d.web.check.rows.length} passed` : '<span class="muted">Not run</span>']],
      KYC_DOCUMENTS: docsFor().map(([, l, , req]) => [l, req ? '<span style="color:var(--bad)">Missing · upload not available yet</span>' : '<span class="muted">Not provided</span>']),
    }[k];
    return `<dl class="kv ob-kv">${rows.map(([a, v]) => `<dt>${a}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }
  function reviewView(){
    const missing = STEPS.filter(([k]) => state.onboarding[k] !== 'done'), done = locked_(), can = canEdit();
    const card = ([k, t], i) => `<div class="card ob-rv ${k === 'KYC_DOCUMENTS' ? 's2' : ''}"><div class="between" style="margin-bottom:6px"><h3 style="margin:0">${i + 1}. ${t}</h3><span class="row" style="flex:none;gap:10px">
      ${state.onboarding[k] === 'done' ? '<span class="pill ok" style="flex:none;min-width:0">✓ Done</span>' : '<span class="pill bad" style="flex:none;min-width:0">Incomplete</span>'}${done ? '' : `<button class="linkish" style="flex:none;min-width:0" data-goto="${k}">${can ? 'Edit' : 'View'}</button>`}</span></div>${summary(k)}</div>`;
    return `<div class="ob-main ob-wide"><div class="card"><div class="between" style="flex-wrap:wrap"><div><div class="ob-kicker">STEP 6 OF 6</div><h2 class="ob-h2">Review & submit</h2>
        <p class="muted" style="margin:2px 0 0">Check everything once more. After you submit, details are locked while they're reviewed.</p></div>
        ${done ? '<span class="pill ok">Submitted</span>' : missing.length ? `<span class="pill bad">${missing.length} step${missing.length > 1 ? 's' : ''} incomplete</span>` : '<span class="pill ok">Ready to submit</span>'}</div>
        ${!done && missing.length ? `<div class="notice bad">Finish ${missing.map(([k, t]) => `<button class="linkish" data-goto="${k}" style="color:var(--bad);text-decoration:underline">${t}</button>`).join(', ')} before you submit.${missing.some(([k]) => k === 'KYC_DOCUMENTS') ? ' KYC documents can\'t be uploaded yet because no file storage is connected, so the application can\'t be submitted for now.' : ''}</div>` : ''}</div>
      <div class="ob-rvgrid">${STEPS.map(card).join('')}</div>
      <div class="card ob-decl"><div class="ob-f ${ob.err.decl ? 'has-err' : ''}" data-p="decl"><label class="ck" style="align-items:flex-start"><input type="checkbox" id="ob-decl" ${ob.decl || done ? 'checked' : ''} ${done || !can ? 'disabled' : ''} style="margin-top:3px">
        <span>I confirm these details are true and that I'm authorised to open this account for <b>${esc(ob.d.biz.legal || 'my business')}</b>. I agree to the Bizpole Pay merchant terms and allow Bizpole Pay to share my KYC with its RBI-authorised payment partner for verification.</span></label>
        ${errBox('decl')}</div>
        <div class="ob-actions" style="margin-top:12px"><button class="btn" data-goto="${STEPS[STEPS.length - 1][0]}"><i data-icon=chevron-left class=li></i> Back</button><span style="flex:1"></span>
          ${done ? '<button class="btn primary" data-s="status">View application status</button>' : can ? `<button class="btn primary" id="ob-submit" ${missing.length ? 'disabled' : ''}>Submit application</button>` : ''}</div></div></div>`;
  }
  function statusView(){
    const r = srv(), st = r.merchantStatus, sub = submittedAt();
    const stages = [['Submitted', true], ['Review', ['LIVE'].includes(st)], ['Live', approved()]], curStage = stages.findIndex(s => !s[1]);
    const evText = e => e.action === 'onboarding.submitted' ? 'Application submitted'
      : `${(STEPS.find(s => e.meta && s[0] === e.meta.step) || [, 'Step'])[1]} ${EVENT_LABEL[e.action] || e.action.replace(/^onboarding\./, '').replace(/_/g, ' ')}`;
    return `<div class="ob-main ob-wide">
      <div class="card ob-stathead ${approved() ? 'ok' : ''}"><div class="between" style="flex-wrap:wrap;align-items:flex-start"><div><div class="ob-kicker">APPLICATION STATUS</div>
          <h2 class="ob-h2">${approved() ? '✓ Approved — your live account is active' : esc(STATUS_LABEL[st] || st)}</h2>
          <p class="muted" style="margin:2px 0 0">${approved() ? 'Switch to live mode to accept real payments.'
            : `Submitted${sub ? ' ' + fmtDate(sub) : ''}. Sending applications for verification isn't connected yet, so your application is saved in Bizpole Pay and hasn't been sent for verification. This page updates when review starts.`}</p></div>
          ${approved() ? '<button class="btn primary" id="ob-golive">Switch to live mode</button>' : statusPill(st)}</div>
        <div class="ob-stages">${stages.map(([l, d], i) => `<div class="ob-stage ${d ? 'done' : i === curStage ? 'cur' : ''}"><span class="n">${d ? '✓' : i + 1}</span><span>${l}</span></div>`).join('<i></i>')}</div></div>
      <div class="ob-stgrid"><div class="card"><h3>Your steps</h3><div class="tbl-wrap"><table><thead><tr><th>Step</th><th>Status</th><th>Notes</th></tr></thead><tbody>
          ${STEPS.map(([k, t]) => { const s = r.steps[k] || {}, [cls, lbl] = STEP_LABEL[s.status || 'NOT_STARTED'];
            return `<tr><td><b>${t}</b></td><td><span class="pill ${cls}">${lbl}</span></td><td class="muted">${esc(s.remarks || (s.submittedAt ? 'Submitted ' + fmtDate(new Date(s.submittedAt)) : '—'))}</td></tr>`; }).join('')}</tbody></table></div>
          <h3 style="margin-top:18px">Verification</h3>
          ${r.payu.length ? `<div class="tbl-wrap"><table><thead><tr><th>Area</th><th>Status</th><th>Remarks</th><th>Updated</th></tr></thead><tbody>
            ${r.payu.map(a => `<tr><td><b>${esc(AREA_LABEL[a.area] || a.area)}</b></td><td><span class="pill">${esc(a.status)}</span></td><td class="muted">${esc(a.remarks || '—')}</td><td>${fmtDate(new Date(a.changedAt))}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="muted" style="margin:0;font-size:13.5px">No verification updates yet. PAN, bank, website, agreement e-sign and video KYC checks will show here once your application is sent for verification.</p>'}</div>
        <div class="card"><h3>Timeline</h3><div class="ob-tl">${r.timeline.slice().reverse().map(e => `<div class="ob-ev"><span class="dot ${e.action === 'onboarding.submitted' ? '' : 'warn'}"></span><div><div>${esc(evText(e))}</div><div class="muted" style="font-size:12px">${fmtDate(new Date(e.at))}${e.by ? ' · ' + esc(e.by) : ''}</div></div></div>`).join('') || '<p class="muted" style="margin:0">No activity yet.</p>'}</div></div></div></div>`;
  }
  function view(){
    if (!ob.cur) ob.cur = (STEPS.find(([k]) => state.onboarding[k] !== 'done') || STEPS[0])[0];
    if (!ob.view) ob.view = locked_() ? 'status' : allDone() ? 'review' : 'step';
    if (ob.view === 'status' && !locked_()) ob.view = 'review';
    const done = doneCount(), st = srv().merchantStatus;
    const sub = approved() ? 'Your live account is active.' : locked_() ? `Application ${(STATUS_LABEL[st] || st).toLowerCase()}.` : `${done} of ${STEPS.length} steps complete · progress is saved to your account.`;
    const body = ob.view === 'status' ? statusView() : ob.view === 'review' ? reviewView() : stepView();
    return head('Activate your live account', sub, locked_() ? statusPill(st) : `<span class="chip">Test mode works while you finish</span>`) +
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
  // KYC files can't be stored (no object storage). The server answers 501; show that under the document.
  async function takeFile(k, f){
    if (!f) return;
    const p = `kyc.files.${k}`;
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) ob.err[p] = `"${f.name}" isn't a PDF, JPG or PNG.`;
    else if (f.size > 5 * 1048576) ob.err[p] = `${f.name} is ${fsize(f.size)}. The limit is 5 MB.`;
    else if (!f.size) ob.err[p] = `${f.name} is empty.`;
    else {
      try { await api('/onboarding/documents', { method: 'POST', mode: false, body: { type: k, name: f.name, size: f.size } }); }
      catch (e) { ob.err[p] = e.message; }
    }
    redraw();
  }
  function onChange(p){
    if (p === 'pan.entity') { if (ob.d.pan.pan) { const m = check('pan.pan'); if (m) ob.err['pan.pan'] = m; else delete ob.err['pan.pan']; } return redraw(); }
    if (p === 'biz.cat') { ob.d.biz.sub = ''; return redraw(); }
    const pol = p.match(/^web\.pol\.(\w+)\.on$/);
    if (pol) { const up = `web.pol.${pol[1]}.url`, box = document.querySelector(`[data-f="${up}"]`); box.disabled = !get(p); if (get(p)) box.focus(); else { delete ob.err[up]; paint(up); } }
    if (/^web\./.test(p) && ob.d.web.check && !ob.d.web.check.running) { ob.d.web.check = null; $('#ob-wc').innerHTML = wcBox(); bindWc(); }
  }
  const bindWc = () => { const b = $('#ob-wcgo'); if (b) b.onclick = runSiteCheck; };

  // What each step sends. The server validates again and keeps raw PAN / account numbers out of OnboardingStep.data.
  const PAYLOAD = {
    PAN_DETAILS: () => ({ ...ob.d.pan }),
    BUSINESS_DETAILS: () => ({ ...ob.d.biz }),
    BANK_ACCOUNT: () => ({ holder: ob.d.bank.holder, type: ob.d.bank.type, ifsc: ob.d.bank.ifsc, acct: ob.d.bank.acct }),
    WEBSITE_DETAILS: () => ({ url: ob.d.web.url, app: ob.d.web.app, pol: ob.d.web.pol }),
    KYC_DOCUMENTS: () => ({ masked: ob.d.kyc.masked }),
  };
  const setBusy = on => ['#ob-draft', '#ob-next', '#ob-submit'].forEach(s => { const b = $(s); if (b) b.disabled = on; });
  // Saves the current step (draft or submit), then refreshes onboarding state from the server.
  async function saveStep(submit){
    const k = ob.cur;
    if (ob.saving) return false;
    ob.saving = true; setBusy(true);
    const keep = k === 'BANK_ACCOUNT' && !submit ? { acct: ob.d.bank.acct, acct2: ob.d.bank.acct2 } : null;
    try {
      const r = await api('/onboarding/' + k, { method: 'PUT', mode: false, body: { submit, data: PAYLOAD[k]() } });
      hydrate(r, [k]);
      if (keep) Object.assign(ob.d.bank, keep); // a draft doesn't store the account number; keep what was typed on screen
      applyMe(await api('/auth/me', { mode: false }));
      return true;
    } catch (e) {
      const f = e.data && e.data.field;
      if (f) { ob.err[f] = e.message; ob.tried[k] = true; redraw(); focusErr(); toast('Fix the highlighted field'); } else apiFail(e);
      return false;
    } finally { ob.saving = false; setBusy(false); }
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
      if ($('#ob-draft')) $('#ob-draft').onclick = async () => {
        if (await saveStep(false)) { redraw(); toast(ob.cur === 'BANK_ACCOUNT' ? 'Draft saved · the account number is stored when you continue' : 'Draft saved · you can come back any time'); }
      };
      if ($('#ob-next')) $('#ob-next').onclick = async () => {
        if (ob.cur === 'KYC_DOCUMENTS') { // can't be submitted without document storage
          if (await saveStep(false)) { ob.view = 'review'; redraw(); window.scrollTo(0, 0); toast('Draft saved'); }
          return;
        }
        ob.tried[ob.cur] = true;
        const bad = validate(ob.cur);
        if (bad.length) { redraw(); focusErr(); return toast(`Fix ${bad.length} field${bad.length > 1 ? 's' : ''} to continue`); }
        if (!(await saveStep(true))) return;
        toast(`${STEPS[i][1]} saved`);
        const next = STEPS.find(([k], j) => j > i && state.onboarding[k] !== 'done') || STEPS.find(([k]) => state.onboarding[k] !== 'done');
        if (next) goStep(next[0]); else { ob.view = 'review'; redraw(); window.scrollTo(0, 0); }
      };
      bindWc();
      document.querySelectorAll('#ob-root input[data-doc]').forEach(fi => fi.onchange = e => takeFile(fi.dataset.doc, e.target.files[0]));
      document.querySelectorAll('#ob-root [data-dropdoc]').forEach(z => {
        z.ondragover = e => { e.preventDefault(); z.classList.add('over'); };
        z.ondragleave = () => z.classList.remove('over');
        z.ondrop = e => { e.preventDefault(); z.classList.remove('over'); takeFile(z.dataset.dropdoc, e.dataTransfer.files[0]); };
      });
    }
    if (ob.view === 'review') {
      const d = $('#ob-decl'); if (d) d.onchange = () => { ob.decl = d.checked; if (d.checked) { delete ob.err.decl; paint('decl'); } };
      if ($('#ob-submit')) $('#ob-submit').onclick = async () => {
        if (!allDone()) return toast('Finish every step first');
        if (!ob.decl) { ob.err.decl = 'Tick the declaration to submit.'; paint('decl'); return; }
        setBusy(true);
        try {
          hydrate(await api('/onboarding/submit', { method: 'POST', mode: false, body: { declaration: true } }), []);
          applyMe(await api('/auth/me', { mode: false }));
          ob.view = 'status'; redraw(); window.scrollTo(0, 0); toast('Application submitted');
        } catch (e) { setBusy(false); if (e.data && e.data.field) { ob.err[e.data.field] = e.message; paint(e.data.field); } else apiFail(e); }
      };
    }
    if (ob.view === 'status' && $('#ob-golive')) $('#ob-golive').onclick = async () => {
      state.mode = 'live'; await loadMode('live').catch(apiFail); toast('Switched to live mode'); go('home');
    };
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
    .ob-tl{display:flex;flex-direction:column;gap:12px;font-size:13.5px}
    .ob-ev{display:flex;gap:6px;align-items:flex-start} .ob-ev .dot{margin-top:6px;flex:none}
    .modal:has(.ob-m){width:min(520px,calc(100% - 32px))}
    @media (max-width:1300px){ .ob-grid{grid-template-columns:260px minmax(0,1fr)} .ob-side{grid-column:2} }
    @media (max-width:1000px){ .ob-grid,.ob-grid.two{grid-template-columns:1fr} .ob-side{grid-column:auto} .ob-stgrid{grid-template-columns:1fr} .ob-rv.s2 .ob-kv{grid-template-columns:150px 1fr} }
    @media (max-width:820px){ .ob-fg,.ob-pols,.ob-docs,.ob-rvgrid{grid-template-columns:1fr} .ob-main.card{padding:16px} .ob-stages>i{display:none} .ob-kv,.ob-rv .ob-kv,.ob-rv.s2 .ob-kv{grid-template-columns:1fr} }
  `);

  PAGES.onboarding = () => `<div id="ob-root">${view()}</div>`;
  BIND.onboarding = () => bind();
})();

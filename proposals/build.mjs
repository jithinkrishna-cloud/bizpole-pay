// Builds the Bizpole Pay partnership proposal PDFs.
// Usage: node proposals/build.mjs            (all versions)
// Edit wording in content.mjs and styling in proposal.css.
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import * as C from './content.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'output');
const tmp = join(tmpdir(), 'bizpole-proposal-build');
mkdirSync(outDir, { recursive: true });
mkdirSync(tmp, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const t = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, '<span class="phd">[$1]</span>');
const pad = (n) => String(n).padStart(2, '0');

const TOC = [
  [1, 'About Bizpole'], [2, 'Bizpole Pay'], [3, 'Partner fit'], [4, 'Partnership model'],
  [5, 'Requirements'], [6, 'Expectations'], [7, 'Commercials'], [8, 'Roadmap'], [9, 'First meeting'],
];

const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="#E8604F"/>
  <path d="M10 8h7.5a5 5 0 0 1 1.6 9.7A5.2 5.2 0 0 1 17.8 24H10z" fill="none" stroke="#11161C" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M10 16h8" stroke="#11161C" stroke-width="2.6"/></svg>`;

function orbit() {
  const cx = 300, cy = 300;
  const ring = (r, o = 0.22, dash = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E8604F" stroke-opacity="${o}" stroke-width="1" ${dash}/>`;
  const nodes = [
    [120, -20, 'UPI'], [120, 45, 'Cards'], [120, 110, 'Net Banking'], [120, 200, 'Wallets'],
    [205, -125, 'Webhooks'], [205, -60, 'Refunds'], [205, 145, 'Settlement'], [205, 180, 'Reconciliation'],
  ];
  let s = ring(120, 0.35) + ring(205, 0.25) + ring(285, 0.14, 'stroke-dasharray="2 6"');
  for (const [r, deg, label] of nodes) {
    const a = (deg * Math.PI) / 180, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E8604F" stroke-opacity=".28" stroke-dasharray="3 4"/>`;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="#11161C" stroke="#E6B84F" stroke-width="1.6"/>`;
    s += `<text x="${(x + 11).toFixed(1)}" y="${(y + 4).toFixed(1)}" class="olabel">${label}</text>`;
  }
  s += `<circle cx="${cx}" cy="${cy}" r="52" fill="#1F2730" stroke="#E8604F" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="#E8604F" stroke-opacity=".5" stroke-width="1"/>
    <text x="${cx}" y="${cy - 2}" class="ocore" text-anchor="middle">Bizpole</text>
    <text x="${cx}" y="${cy + 17}" class="ocore2" text-anchor="middle">PAY</text>`;
  return `<svg class="orbit" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}

// Payment flow diagram: Customer → Bizpole Pay → Payment partner → Banks & networks
function flow() {
  const box = (x, y, w, h, title, sub, kind) => {
    const fill = kind === 'core' ? '#11161C' : kind === 'partner' ? '#FDEDE9' : '#F5F3F0';
    const stroke = kind === 'partner' ? '#CF4F3B' : kind === 'core' ? '#11161C' : '#E8E4DF';
    const tc = kind === 'core' ? '#FFFFFF' : '#11161C', sc = kind === 'core' ? '#E6B84F' : '#5D646C';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.3" ${kind === 'partner' ? 'stroke-dasharray="5 3"' : ''}/>
      <text x="${x + w / 2}" y="${y + h / 2 - 3}" text-anchor="middle" class="ft" fill="${tc}">${title}</text>
      <text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" class="fs" fill="${sc}">${sub}</text>`;
  };
  const arrow = (x1, y1, x2, y2, label, ly) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#CF4F3B" stroke-width="1.4" marker-end="url(#ah)"/>
    ${label ? `<text x="${(x1 + x2) / 2}" y="${ly}" text-anchor="middle" class="fl">${label}</text>` : ''}`;
  return `<svg class="flow" viewBox="0 0 660 196" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#CF4F3B"/></marker></defs>
    ${box(0, 18, 120, 62, 'Customer', 'Pays online', 'plain')}
    ${box(170, 18, 140, 62, 'Bizpole Pay', 'Merchants · links · refunds', 'core')}
    ${box(360, 18, 140, 62, 'Payment Partner', 'Gateway APIs', 'partner')}
    ${box(546, 18, 114, 62, 'Banks & networks', 'UPI · cards · wallets', 'plain')}
    ${arrow(122, 49, 166, 49, 'Checkout', 12)}
    ${arrow(312, 42, 356, 42, 'Payment API', 12)}
    ${arrow(356, 60, 314, 60, '', 0)}
    <text x="335" y="94" text-anchor="middle" class="fl">Status &amp; webhooks</text>
    ${arrow(502, 49, 542, 49, 'Process', 12)}
    ${box(170, 128, 140, 56, 'Merchant dashboard', 'Reports · reconciliation', 'plain')}
    ${box(360, 128, 140, 56, 'Merchant bank account', 'Direct settlement', 'plain')}
    ${arrow(240, 82, 240, 124, '', 0)}
    ${arrow(430, 82, 430, 124, '', 0)}
    <text x="246" y="108" class="fl" text-anchor="start">Visibility</text>
    <text x="436" y="108" class="fl" text-anchor="start">Settlement</text>
  </svg>`;
}

const sec = (num, kicker, title) =>
  `<div class="sec"><div class="sec-big" aria-hidden="true">${pad(num)}</div><div class="sec-k">${kicker}</div><h2>${t(title)}</h2><div class="sec-bar"></div></div>`;

function page(p, i, total, current, body) {
  return `<section class="page inner">
  <main class="main">
    <div class="top"><div class="brand"><div><b>Bizpole Pay</b><span>Payment Partnership Proposal</span></div></div><span class="top-r">Prepared by <b>Bizpole</b> · ${C.META.date}</span></div>
    ${body}
    <div class="bot"><span>Confidential · Bizpole</span><span class="pgn"><b>${pad(i)}</b> / ${pad(total)}</span></div>
  </main>
</section>`;
}

function render(key) {
  const p = C.PROVIDERS[key];
  const TOTAL = 8;

  const arcs = `<svg class="c-arcs" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    ${[60, 100, 140, 180, 220, 260, 300, 340].map((r, i) => `<circle cx="400" cy="0" r="${r}" fill="none" stroke="${i === 3 ? '#E8604F' : '#FFFFFF'}" stroke-opacity="${i === 3 ? 0.9 : 0.07 + i * 0.008}" stroke-width="${i === 3 ? 1.4 : 1}"/>`).join('')}
    <circle cx="${(400 - 180 * Math.cos(Math.PI / 5)).toFixed(1)}" cy="${(180 * Math.sin(Math.PI / 5)).toFixed(1)}" r="4" fill="#E8604F"/>
  </svg>`;

  const cover = `<section class="page cover c2">
  <div class="c-top">
    ${arcs}
    <div class="c-head"><div class="c-word">Bizpole Pay</div><div class="c-conf">Strictly confidential</div></div>
    <div class="c-title">
      <div class="c-kick">Partnership Proposal <i></i> ${C.META.date}</div>
      <h1>Payment Partnership<br>Proposal</h1>
      <div class="c-rule"></div>
      <p class="c-sub">Strategic Payment Infrastructure Collaboration</p>
      <p class="c-desc">A proposal to establish a long-term payment infrastructure partnership for Bizpole Pay, a proposed multi-merchant platform for business payments.</p>
    </div>
  </div>
  <div class="c-bottom">
    <div class="c-meta">
      <div><span>Prepared for</span><b>Prospective Payment Partner</b><em>Payment Partnerships Team</em></div>
      <div><span>Prepared by</span><b>Bizpole</b><em>On behalf of Bizpole Pay</em></div>
      <div><span>Date</span><b>${C.META.date}</b><em>${C.META.version}</em></div>
    </div>
    <div class="c-toc"><span>Contents</span><ol>${[
      'About Bizpole Pay', 'Product scope', 'Product workflow', 'Integration modules & APIs', 'Security & compliance', 'Partnership model',
      'Expected partnership', 'Implementation roadmap', 'Commercial discussion', 'First meeting', 'Roadmap summary',
    ].map((x, i) => `<li><i>${pad(i + 1)}</i>${x}</li>`).join('')}</ol></div>
    <p class="c-note">This document is confidential and intended solely for the recipient’s evaluation of a potential partnership with Bizpole. It does not constitute a commercial commitment.</p>
  </div>
</section>`;

  const p2 = page(p, 2, TOTAL, [1, 2], `
  ${sec(1, 'About Bizpole Pay', 'One branded interface for business payments')}
  <div class="lead">${C.PRODUCT.intro.map((x) => `<p>${t(x)}</p>`).join('')}</div>
  <div class="vision"><span>Product vision</span><p>${t(C.PRODUCT.vision)}</p></div>
  ${sec(2, 'Product scope', 'Where we start, and where we are going')}
  <div class="phase-k"><b>Initial release</b><span>Built on supported payment partner integrations</span></div>
  <div class="obj">${C.PRODUCT.initial.map(([h, d], k) => `
    <div class="obj-i"><span class="obj-n">${pad(k + 1)}</span><div><b>${h}</b><span>${d}</span></div></div>`).join('')}
  </div>
  <div class="phase-k"><b>Future releases</b><span>May include</span></div>
  <div class="future">${C.PRODUCT.future.map((x) => `<span>${x}</span>`).join('')}</div>
  <div class="why">
    <div class="why-k">Why we need a payment partner</div>
    <div class="why-g">${C.PRODUCT.why.map(([h, d]) => `<div><b>${h}</b><span>${d}</span></div>`).join('')}</div>
  </div>`);

  const p3 = page(p, 3, TOTAL, [3, 4], `
  ${sec(3, 'Product workflow', 'How Bizpole Pay will work')}
  <p class="intro">Bizpole Pay manages the payment experience, tracking and reporting. Our payment partner provides the payment processing, notifications and settlement underneath it.</p>
  ${flow()}
  <table class="tbl cap">
    <thead><tr><th style="width:22%">Stage</th><th style="width:39%">Bizpole Pay handles</th><th>We need from our payment partner</th></tr></thead>
    <tbody>${C.RESPONSIBILITIES.map(([a, b, c]) => `<tr><td class="b">${t(a)}</td><td>${t(b)}</td><td>${t(c)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="acct">
    <div class="acct-c"><div class="acct-k">Merchant account ownership</div><ul>${C.ACCOUNTS.ownership.map((x) => `<li>${t(x)}</li>`).join('')}</ul></div>
    <div class="acct-c"><div class="acct-k">Fund flow</div><ul>${C.ACCOUNTS.funds.map((x) => `<li>${t(x)}</li>`).join('')}</ul></div>
  </div>
  <p class="note"><b>To clarify:</b> ${t(C.ACCOUNTS.clarify)}</p>`);

  const p4 = page(p, 4, TOTAL, [4], `
  ${sec(4, 'Integration requirements', 'Required Payment Integration Modules & APIs')}
  <p class="intro">Our requirements fall into five modules. Together they cover onboarding, the full payment lifecycle, and the support needed to run payments reliably at scale.</p>
  <div class="reqs">${C.REQUIREMENTS.map((r) => `
    <div class="req">
      <div class="req-h"><span class="req-badge">${r.key}</span><div class="req-t"><b>${r.title}</b><em>${r.lead}</em></div></div>
      <ul class="req-l">${r.items.map((x) => `<li>${x}</li>`).join('')}</ul>
    </div>`).join('')}
  </div>`);

  const p5 = page(p, 5, TOTAL, [5, 6], `
  ${sec(5, 'Security & compliance', 'Protecting payment data')}
  <p class="intro">${t(C.SECURITY.intro)}</p>
  <div class="acct">
    <div class="acct-c"><div class="acct-k">Our intended approach</div><ul>${C.SECURITY.approach.map((x) => `<li>${t(x)}</li>`).join('')}</ul></div>
    <div class="acct-c"><div class="acct-k">Guidance we request</div><ul>${C.SECURITY.guidance.map((x) => `<li>${t(x)}</li>`).join('')}</ul></div>
  </div>
  ${sec(6, 'Partnership model', 'Which model best suits Bizpole Pay?')}
  <p class="intro">Bizpole Pay will onboard and serve multiple merchants. We request our payment partner to recommend the most appropriate model for onboarding multiple merchants, including its regulatory implications, KYC responsibilities and the onboarding path that follows.</p>
  <div class="models">${C.MODELS.map(([h, d], k) => `<div class="model"><span class="model-n">${String.fromCharCode(65 + k)}</span><div><b>${h}</b><p>${d}</p></div></div>`).join('')}</div>`);

  const p6 = page(p, 6, TOTAL, [7, 8], `
  ${sec(7, 'Expected strategic partnership', 'What we hope to build together')}
  <div class="exp">${C.EXPECTATIONS.map(([h, d], k) => `<div class="exp-i"><span>${pad(k + 1)}</span><b>${h}</b><p>${d}</p></div>`).join('')}</div>
  ${sec(8, 'Implementation roadmap', 'Four phases from onboarding to growth')}
  <div class="road">${C.PHASES.map((ph, k) => `
    <div class="step${k === 3 ? ' last' : ''}">
      <div class="step-n">${ph.n}</div>
      <div class="step-b"><b>${ph.title}</b><p>${ph.desc}</p></div>
      <div class="chips">${ph.points.map((x) => `<span>${x}</span>`).join('')}</div>
    </div>`).join('')}
  </div>
  <p class="src">Timelines for each phase to be agreed jointly with our payment partner.</p>`);

  let ci = 0;
  const p7 = page(p, 7, TOTAL, [9], `
  ${sec(9, 'Commercial discussion', 'Information we would like to receive')}
  <p class="intro">We have not assumed any pricing. We request <b class="em">separate pricing for each payment method and service</b> listed below.</p>
  <table class="tbl com">
    <thead><tr><th style="width:6%">#</th><th style="width:24%">Payment method / service</th><th style="width:46%">Pricing requested</th><th>Partner response</th></tr></thead>
    <tbody>${C.COMMERCIALS.map((g) => `<tr class="grp"><td colspan="4">${g.group}</td></tr>` + g.rows.map(([a, b]) => `<tr><td class="num">${pad(++ci)}</td><td class="b">${a}</td><td>${b}</td><td class="blank"></td></tr>`).join('')).join('')}</tbody>
  </table>`);

  const p8 = page(p, 8, TOTAL, [10, 11], `
  ${sec(10, 'First meeting', 'Proposed discussion points')}
  <ol class="agenda">${C.MEETING.map((x) => `<li>${x}</li>`).join('')}</ol>
  ${sec(11, 'Summary', 'Roadmap summary')}
  <div class="sum">${C.SUMMARY.map(([n, h, a, b, o]) => `
    <div class="sum-c">
      <div class="sum-n">${n}</div><b>${h}</b>
      <dl><dt>Bizpole Pay</dt><dd>${a}</dd><dt>Payment partner</dt><dd>${b}</dd></dl>
      <div class="sum-o">${o}</div>
    </div>`).join('')}
  </div>
  <div class="quote"><p>${t(C.PRODUCT.intent)}</p></div>
  <div class="contact">
    <div class="contact-h"><div><b>Bizpole contact</b><span>We look forward to building a lasting partnership together.</span></div></div>
    <div class="contact-g">${C.CONTACT.map(([k, v]) => `<div><span>${k}</span><b>${t(v)}</b></div>`).join('')}</div>
  </div>`);

  const css = readFileSync(join(here, 'proposal.css'), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Bizpole Pay — Payment Partnership Proposal</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@500;600;700;800&display=block" rel="stylesheet">
<style>${css}</style>
<script>if(location.hash){const n=+location.hash.slice(2);addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".page").forEach((p,i)=>{if(i!==n-1)p.style.display="none";else p.style.margin="0"})})}</script>
</head><body>${cover}${p2}${p3}${p4}${p5}${p6}${p7}${p8}</body></html>`;
}

const keys = process.argv[2] ? [process.argv[2]] : Object.keys(C.PROVIDERS);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);

for (const k of keys) {
  const p = C.PROVIDERS[k];
  const html = join(tmp, `${p.file}.html`);
  writeFileSync(html, render(k));
  const pdf = join(outDir, `${p.file}.pdf`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=15000', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { stdio: 'ignore' });
  if (!process.env.KEEP_HTML) rmSync(html);
  console.log('built', pdf);
}

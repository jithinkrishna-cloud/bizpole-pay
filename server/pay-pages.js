// HTML for the public payment pages (/pay/<token>, /pay/l/<slug>) and the hand-off to the provider's hosted page.
// Branded as the merchant on Bizpole Pay; never names the provider. No external assets; the only script is the
// nonce'd auto-submit on the hand-off page (a button does the same when scripts are off).
const crypto = require("node:crypto");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (paise) => "₹" + (Number(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COLOR = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function page({ title, brand = {}, mode, body, nonce = null, status = 200 }) {
  const color = COLOR.test(brand.color || "") ? brand.color : "#2f2b26";
  const logo = LOGO.test(brand.logo || "") ? `<img class="logo" src="${brand.logo}" alt="">` : "";
  const csp = ["default-src 'none'", "style-src 'unsafe-inline'", "img-src data:", "form-action 'self' https:", "base-uri 'none'", "frame-ancestors 'none'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'"].join("; ");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Bizpole Pay</title>
<style>
  :root{--ink:#1f1d1a;--muted:#6b665e;--line:#e6e1d8;--bg:#f6f4ef;--card:#fffdf9;--brand:${color};--ok:#1f7a4d;--bad:#b3261e}
  *{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:16px}
  .card{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
  .head{display:flex;align-items:center;gap:12px;margin-bottom:18px}.logo{width:44px;height:44px;border-radius:10px;object-fit:contain;background:#fff;border:1px solid var(--line)}
  .who{font-weight:600}.muted{color:var(--muted);font-size:13px}.amt{font-size:32px;font-weight:650;margin:6px 0 2px}
  .tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:#fff3cd;color:#7a5b00;margin-left:auto}
  label{display:block;font-size:13px;color:var(--muted);margin:12px 0 4px}input{width:100%;height:42px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font:inherit;background:#fff}
  button,.btn{display:block;width:100%;height:46px;margin-top:18px;border:0;border-radius:12px;background:var(--brand);color:#fff;font:600 15px/46px inherit;text-align:center;text-decoration:none;cursor:pointer}
  .err{color:var(--bad);font-size:13.5px;margin-top:10px}.state{font-size:20px;font-weight:650;margin:4px 0}.ok{color:var(--ok)}.bad{color:var(--bad)}
  .foot{text-align:center;color:var(--muted);font-size:12px;margin-top:16px}
</style></head><body><main class="card">
<div class="head">${logo}<div><div class="who">${esc(brand.name || "Bizpole Pay")}</div><div class="muted">Payment request</div></div>${mode === "TEST" ? '<span class="tag">Test mode</span>' : ""}</div>
${body}
<div class="foot">Secured by Bizpole Pay</div></main></body></html>`;
  return { __raw: true, status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": csp, "x-frame-options": "DENY", "referrer-policy": "no-referrer" }, body: html };
}

const field = (name, label, value, type = "text", extra = "") =>
  `<label for="${name}">${esc(label)}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value || "")}" ${extra}>`;

// Order page: amount, what it's for, and the customer details the provider needs.
function orderPage(o, { error = null } = {}) {
  const brand = { name: o.brandName || o.merchantName, logo: o.logoData, color: o.primaryColor };
  return page({ title: `Pay ${brand.name}`, brand, mode: o.mode, body: `
    <div class="muted">${esc(o.productInfo)}</div><div class="amt">${inr(o.amountPaise)}</div>
    <form method="post" action="/api/pay/${esc(o.payToken)}/start" autocomplete="on">
      ${field("name", "Full name", o.customerName, "text", 'required maxlength="60" autocomplete="name"')}
      ${field("email", "Email", o.customerEmail, "email", 'required maxlength="100" autocomplete="email"')}
      ${field("phone", "Mobile number", o.customerPhone, "tel", 'required inputmode="numeric" maxlength="13" autocomplete="tel"')}
      ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
      <button type="submit">Pay ${inr(o.amountPaise)}</button>
    </form>` });
}

// Payment link page: like the order page, plus the amount when the customer chooses it.
function linkPage(l, { error = null, values = {} } = {}) {
  const brand = { name: l.brandName || l.merchantName, logo: l.logoData, color: l.primaryColor };
  const amountField = l.isAmountFilledByCustomer || l.isPartialPaymentAllowed
    ? field("amount", l.isPartialPaymentAllowed ? `Amount (at least ${inr(l.minAmountForCustomerPaise || 100)})` : "Amount (₹)", values.amount || (l.amountPaise ? (Number(l.amountPaise) / 100).toFixed(2) : ""), "text", 'required inputmode="decimal"')
    : "";
  return page({ title: `Pay ${brand.name}`, brand, mode: l.mode, body: `
    <div class="muted">${esc(l.description)}</div>${l.amountPaise ? `<div class="amt">${inr(l.amountPaise)}</div>` : ""}
    <form method="post" action="/api/pay/l/${esc(l.slug)}" autocomplete="on">
      ${amountField}
      ${field("name", "Full name", values.name || l.customerName, "text", 'required maxlength="60" autocomplete="name"')}
      ${field("email", "Email", values.email || l.customerEmail, "email", 'required maxlength="100" autocomplete="email"')}
      ${field("phone", "Mobile number", values.phone || l.customerPhone, "tel", 'required inputmode="numeric" maxlength="13" autocomplete="tel"')}
      ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
      <button type="submit">Continue to payment</button>
    </form>` });
}

// Hand-off: posts the signed form to the provider's hosted page.
function handoff(form, brand = {}, mode) {
  const nonce = crypto.randomBytes(16).toString("base64");
  const inputs = Object.entries(form.fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  return page({ title: "Redirecting to payment", brand, mode, nonce, body: `
    <div class="state">Taking you to the secure payment page…</div><p class="muted">Don't close this window.</p>
    <form id="go" method="${esc(form.method || "POST")}" action="${esc(form.action)}">${inputs}<button type="submit">Continue</button></form>
    <script nonce="${nonce}">document.getElementById("go").submit();</script>` });
}

const STATES = {
  paid: ["Payment successful", "ok", "Thank you. Your payment has been received."],
  pending: ["Payment processing", "", "We're confirming your payment with the bank. This page updates when you reload it."],
  failed: ["Payment failed", "bad", "No money was taken, or it will be returned automatically. You can try again."],
  expired: ["This payment request has expired", "bad", "Ask the business for a new payment link."],
  cancelled: ["This payment request was cancelled", "bad", "Ask the business for a new payment link."],
  unavailable: ["Payments are not available right now", "bad", "Please try again later."],
  notfound: ["Payment request not found", "bad", "Check the link you were given."],
};
function statePage(kind, o = null, { retry = false, message = null } = {}) {
  const [title, tone, text] = STATES[kind] || STATES.notfound;
  const brand = o ? { name: o.brandName || o.merchantName, logo: o.logoData, color: o.primaryColor } : {};
  return page({ title, brand, mode: o && o.mode, status: kind === "notfound" ? 404 : 200, body: `
    ${o ? `<div class="muted">${esc(o.productInfo || o.description || "")}</div><div class="amt">${inr(o.amountPaise || 0)}</div>` : ""}
    <div class="state ${tone}">${esc(title)}</div><p class="muted">${esc(message || text)}</p>
    ${retry && o && o.payToken ? `<a class="btn" href="/pay/${esc(o.payToken)}">Try again</a>` : ""}` });
}

module.exports = { orderPage, linkPage, handoff, statePage, page };

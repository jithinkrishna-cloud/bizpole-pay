// Onboarding wizard: per-step drafts and submissions (OnboardingStep + Merchant / MerchantAddress / BankAccount),
// the final application submit, and a real website reachability check.
const db = require("../db");
const { fail } = require("../http");
const { audit, clientIp, STEP_KEYS } = require("../auth");
const { encrypt, decrypt } = require("../secrets");
const { safeFetch } = require("./developer");

// Wizard business type → BusinessEntityType, and the PAN 4th letters each allows.
const ENTITY = { individual: "INDIVIDUAL", proprietorship: "PROPRIETORSHIP", partnership: "PARTNERSHIP", llp: "LLP", pvt: "PRIVATE_LIMITED", public: "PUBLIC_LIMITED", trust: "TRUST" };
const ENTITY_UI = { ...Object.fromEntries(Object.entries(ENTITY).map(([k, v]) => [v, k])), SOCIETY: "trust", NGO: "trust" };
const PAN_4TH = { individual: ["P"], proprietorship: ["P"], partnership: ["F"], llp: ["F"], pvt: ["C"], public: ["C"], trust: ["T", "A"] };
const BANKS_IFSC = { HDFC: "HDFC Bank", ICIC: "ICICI Bank", SBIN: "State Bank of India", UTIB: "Axis Bank", KKBK: "Kotak Mahindra Bank", FDRL: "Federal Bank", SIBL: "South Indian Bank", YESB: "Yes Bank", IDIB: "Indian Bank", PUNB: "Punjab National Bank" };
const POL = [["terms", true], ["refund", true], ["privacy", true], ["contact", true], ["pricing", true], ["shipping", false]];
const VOLUMES = ["Under ₹1 lakh", "₹1–5 lakh", "₹5–25 lakh", "₹25 lakh–1 crore", "Over ₹1 crore"];
// Merchant statuses in which the wizard can still be edited.
const EDITABLE = ["TEST_ONLY", "ONBOARDING", "ACTION_REQUIRED"];
const NO_STORAGE = "Document upload isn't available yet: no secure file storage is connected to Paynest, so KYC documents can't be stored. Your other steps are saved.";

const OWNER_ADMIN = ["OWNER", "ADMIN"];
const s = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
const bad = (field, msg) => fail(400, msg, { field });
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const isUrl = (u) => /^https?:\/\/[^\s/?#]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(u) && !!host(u);

async function state(merchantId) {
  const [m, steps, addr, bank, docs, payu, events] = await Promise.all([
    db.one(`SELECT status, "panLast4", "panEnc" IS NOT NULL AS "panSaved", "entityType", "legalName", "displayName", email FROM "Merchant" WHERE id=$1`, [merchantId]),
    db.query(`SELECT key, status, data, remarks, "submittedAt", "verifiedAt" FROM "OnboardingStep" WHERE "merchantId"=$1`, [merchantId]),
    db.one(`SELECT line1, city, state, pincode FROM "MerchantAddress" WHERE "merchantId"=$1 AND kind='registered'`, [merchantId]),
    db.one(`SELECT id, "accountHolder", "accountLast4", ifsc, "bankName", "nameAtBank", "pennyDropVerified", "createdAt" FROM "BankAccount"
             WHERE "merchantId"=$1 AND "isPrimary" AND "retiredAt" IS NULL`, [merchantId]),
    db.query(`SELECT id, type, "numberMasked", status, remarks, "uploadedAt" FROM "KycDocument" WHERE "merchantId"=$1 AND status <> 'DELETED' ORDER BY "uploadedAt"`, [merchantId]),
    db.query(`SELECT area, status, remarks, "changedAt" FROM "PayuOnboardingStatus" WHERE "merchantId"=$1 ORDER BY area`, [merchantId]),
    db.query(`SELECT a.action, a.meta, a."createdAt", u.name FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."userId"
               WHERE a."merchantId"=$1 AND a.action LIKE 'onboarding.%' ORDER BY a."createdAt" LIMIT 200`, [merchantId]),
  ]);
  const byKey = Object.fromEntries(steps.map((r) => [r.key, r]));
  return {
    merchantStatus: m.status,
    editable: EDITABLE.includes(m.status),
    pan: { saved: m.panSaved, last4: m.panLast4 },
    entity: ENTITY_UI[m.entityType] || "",
    steps: Object.fromEntries(STEP_KEYS.map((k) => {
      const r = byKey[k] || {};
      return [k, { status: r.status || "NOT_STARTED", data: r.data || {}, remarks: r.remarks || "", submittedAt: r.submittedAt || null, verifiedAt: r.verifiedAt || null }];
    })),
    address: addr,
    bank: bank && { id: bank.id, holder: bank.accountHolder, last4: bank.accountLast4, ifsc: bank.ifsc, bankName: bank.bankName, nameAtBank: bank.nameAtBank, verified: bank.pennyDropVerified, added: bank.createdAt },
    documents: docs,
    payu,
    timeline: events.map((e) => ({ action: e.action, meta: e.meta, at: e.createdAt, by: e.name })),
  };
}

async function decryptedPan(c, merchantId) {
  const r = await c.one(`SELECT "panEnc" FROM "Merchant" WHERE id=$1`, [merchantId]);
  return r && r.panEnc ? decrypt(r.panEnc) : null;
}

/* ---- per-step validation and writes. Each returns the JSON stored in OnboardingStep.data (never raw PAN / account numbers). ---- */
const STEP = {
  async PAN_DETAILS(c, mid, b, submit) {
    const entity = s(b.entity, 20), name = s(b.name, 120), dob = s(b.dob, 10), pan = s(b.pan, 10).toUpperCase();
    if (entity && !ENTITY[entity]) bad("pan.entity", "Choose your business type.");
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) bad("pan.pan", "A PAN has 10 characters: 5 letters, 4 digits, then 1 letter.");
    if (submit) {
      if (!entity) bad("pan.entity", "Choose your business type.");
      const full = pan || (await decryptedPan(c, mid));
      if (!full) bad("pan.pan", "Enter your PAN.");
      if (!PAN_4TH[entity].includes(full[3])) bad("pan.pan", `The 4th letter of this PAN is "${full[3]}", which doesn't match the business type you chose.`);
      if (!/^[A-Za-z][A-Za-z .'&-]{2,}$/.test(name)) bad("pan.name", "Enter the name exactly as printed on the PAN.");
      const d = new Date(dob);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(d) || d.getFullYear() < 1900 || d > new Date()) bad("pan.dob", "Enter a valid date.");
      if (["individual", "proprietorship"].includes(entity)) {
        const a = new Date(d); a.setFullYear(a.getFullYear() + 18);
        if (a > new Date()) bad("pan.dob", "The PAN holder must be at least 18 years old.");
      }
    }
    if (pan) await c.q(`UPDATE "Merchant" SET "panEnc"=$2, "panLast4"=$3, "updatedAt"=now() WHERE id=$1`, [mid, encrypt(pan), pan.slice(-4)]);
    if (entity) await c.q(`UPDATE "Merchant" SET "entityType"=$2, "updatedAt"=now() WHERE id=$1`, [mid, ENTITY[entity]]);
    return { entity, name, dob };
  },

  async BUSINESS_DETAILS(c, mid, b, submit) {
    const d = { legal: s(b.legal, 160), brand: s(b.brand, 80), cat: s(b.cat, 80), sub: s(b.sub, 80), gstin: s(b.gstin, 15).toUpperCase(), desc: s(b.desc, 600),
      addr: s(b.addr, 200), city: s(b.city, 80), st: s(b.st, 60), pin: s(b.pin, 6), volume: s(b.volume, 40) };
    if (d.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(d.gstin)) bad("biz.gstin", "A GSTIN has 15 characters: 2-digit state code, the 10-character PAN, then 3 more.");
    if (!submit) return d;
    if (d.legal.length < 3) bad("biz.legal", "Enter the legal business name (at least 3 characters).");
    if (!d.cat) bad("biz.cat", "Choose a category.");
    if (!d.sub) bad("biz.sub", "Choose a sub-category.");
    if (d.gstin) {
      const pan = await decryptedPan(c, mid);
      if (!pan) bad("biz.gstin", "Save your PAN details first. Characters 3–12 of a GSTIN must be your PAN.");
      if (d.gstin.slice(2, 12) !== pan) bad("biz.gstin", "Characters 3–12 of this GSTIN don't match the PAN you saved.");
    }
    if (d.desc.length < 20) bad("biz.desc", "Describe what you sell in at least 20 characters.");
    if (d.addr.length < 10) bad("biz.addr", "Enter the building and street (at least 10 characters).");
    if (!d.city) bad("biz.city", "Enter the city.");
    if (!d.st) bad("biz.st", "Choose the state.");
    if (!/^[1-9][0-9]{5}$/.test(d.pin)) bad("biz.pin", "A PIN code has 6 digits and doesn't start with 0.");
    if (!VOLUMES.includes(d.volume)) bad("biz.volume", "Choose your expected monthly volume.");
    await c.q(
      `UPDATE "Merchant" SET "legalName"=$2, "displayName"=COALESCE(NULLIF($3,''), "displayName"), category=$4, "subCategory"=$5, gstin=NULLIF($6,''), "updatedAt"=now() WHERE id=$1`,
      [mid, d.legal, d.brand, d.cat, d.sub, d.gstin]
    );
    await c.q(
      `INSERT INTO "MerchantAddress" (id,"merchantId",kind,line1,city,state,pincode,"updatedAt") VALUES ($1,$2,'registered',$3,$4,$5,$6,now())
       ON CONFLICT ("merchantId",kind) DO UPDATE SET line1=EXCLUDED.line1, line2=NULL, city=EXCLUDED.city, state=EXCLUDED.state, pincode=EXCLUDED.pincode, "updatedAt"=now()`,
      [db.id(), mid, d.addr, d.city, d.st, d.pin]
    );
    return d;
  },

  async BANK_ACCOUNT(c, mid, b, submit, prev) {
    const holder = s(b.holder, 120), type = b.type === "Savings" ? "Savings" : "Current", ifsc = s(b.ifsc, 11).toUpperCase();
    const acct = String(b.acct || "").replace(/\s/g, "");
    const bankName = BANKS_IFSC[ifsc.slice(0, 4)] || null;
    if (acct && !/^\d{9,18}$/.test(acct)) bad("bank.acct", "Account numbers have 9 to 18 digits, with no spaces.");
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) bad("bank.ifsc", "An IFSC has 11 characters: 4 letters, a zero, then 6 letters or digits.");
    const d = { holder, type, ifsc, bankName, bankAccountId: prev.bankAccountId || null, last4: prev.last4 || null };
    if (!submit) return d; // the account number itself is only stored on submit, encrypted, in BankAccount
    if (holder.length < 3) bad("bank.holder", "Enter the account holder name.");
    if (!ifsc) bad("bank.ifsc", "Enter the IFSC.");
    const cur = await c.one(`SELECT id, "accountNumberEnc", ifsc FROM "BankAccount" WHERE "merchantId"=$1 AND "isPrimary" AND "retiredAt" IS NULL`, [mid]);
    if (!acct) {
      if (!cur) bad("bank.acct", "Enter the account number.");
      if (cur.ifsc !== ifsc) bad("bank.acct", "Enter the account number again to change the IFSC.");
      await c.q(`UPDATE "BankAccount" SET "accountHolder"=$2, "bankName"=COALESCE($3,"bankName") WHERE id=$1`, [cur.id, holder, bankName]);
      return { ...d, bankAccountId: cur.id, last4: (await c.one(`SELECT "accountLast4" FROM "BankAccount" WHERE id=$1`, [cur.id])).accountLast4 };
    }
    if (cur && decrypt(cur.accountNumberEnc) === acct && cur.ifsc === ifsc) {
      await c.q(`UPDATE "BankAccount" SET "accountHolder"=$2, "bankName"=COALESCE($3,"bankName") WHERE id=$1`, [cur.id, holder, bankName]);
      return { ...d, bankAccountId: cur.id, last4: acct.slice(-4) };
    }
    if (cur) await c.q(`UPDATE "BankAccount" SET "isPrimary"=false, "retiredAt"=now() WHERE id=$1`, [cur.id]);
    const id = db.id();
    await c.q(
      `INSERT INTO "BankAccount" (id,"merchantId","accountHolder","accountNumberEnc","accountLast4",ifsc,"bankName","isPrimary") VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
      [id, mid, holder, encrypt(acct), acct.slice(-4), ifsc, bankName]
    );
    return { ...d, bankAccountId: id, last4: acct.slice(-4) };
  },

  async WEBSITE_DETAILS(c, mid, b, submit) {
    const url = s(b.url, 300), app = s(b.app, 300), pin = b.pol || {};
    const pol = Object.fromEntries(POL.map(([k]) => [k, { on: !!(pin[k] && pin[k].on), url: s(pin[k] && pin[k].url, 300) }]));
    const d = { url, app, pol };
    if (!submit) return d;
    if (!isUrl(url)) bad("web.url", "Enter the full address, for example https://yourbusiness.in");
    if (app && (!isUrl(app) || !/(play\.google\.com|apps\.apple\.com)$/.test(host(app)))) bad("web.app", "Use a Google Play or App Store link.");
    for (const [k, req] of POL) {
      const p = pol[k];
      if (!p.on) { if (req) bad(`web.pol.${k}.url`, "Required. Add this page to your site, then tick it and paste its link."); continue; }
      if (!isUrl(p.url)) bad(`web.pol.${k}.url`, "Paste the full link to this page.");
      if (host(p.url) !== host(url)) bad(`web.pol.${k}.url`, `This page should be on ${host(url)}.`);
    }
    await c.q(`UPDATE "Merchant" SET "websiteUrl"=$2, "appUrl"=NULLIF($3,''), "updatedAt"=now() WHERE id=$1`, [mid, url, app]);
    return d;
  },

  async KYC_DOCUMENTS(c, mid, b, submit) {
    if (submit) fail(501, NO_STORAGE);
    return { masked: !!b.masked };
  },
};

module.exports = [
  ["GET", "/onboarding", async ({ auth }) => state(auth.merchantId)],

  // Save a step. body: { data, submit }. Draft → IN_PROGRESS; submit → validated, typed tables written, SUBMITTED.
  ["PUT", "/onboarding/:key", async (ctx) => {
    const { auth } = ctx, key = ctx.params.key, submit = !!ctx.body.submit;
    if (!OWNER_ADMIN.includes(auth.role)) fail(403, "Only the account owner or an admin can fill in onboarding.");
    if (!STEP[key]) fail(404, "Unknown onboarding step.");
    await db.tx(async (c) => {
      const m = await c.one(`SELECT status FROM "Merchant" WHERE id=$1 FOR UPDATE`, [auth.merchantId]);
      if (!EDITABLE.includes(m.status)) fail(409, "Your application is under review, so these details are locked.");
      const row = await c.one(`SELECT id, data, status FROM "OnboardingStep" WHERE "merchantId"=$1 AND key=$2`, [auth.merchantId, key]);
      if (row && row.status === "VERIFIED") fail(409, "This step is already verified and can't be changed.");
      const data = await STEP[key](c, auth.merchantId, ctx.body.data || {}, submit, (row && row.data) || {});
      await c.q(
        `INSERT INTO "OnboardingStep" (id,"merchantId",key,status,data,"submittedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT ("merchantId",key) DO UPDATE SET status=EXCLUDED.status, data=EXCLUDED.data, "submittedAt"=EXCLUDED."submittedAt", remarks=NULL, "updatedAt"=now()`,
        [db.id(), auth.merchantId, key, submit ? "SUBMITTED" : "IN_PROGRESS", JSON.stringify(data), submit ? new Date() : null]
      );
      if (m.status === "TEST_ONLY") await c.q(`UPDATE "Merchant" SET status='ONBOARDING', "updatedAt"=now() WHERE id=$1`, [auth.merchantId]);
      await audit(c, { merchantId: auth.merchantId, userId: auth.user.id, action: submit ? "onboarding.step_submitted" : "onboarding.step_draft",
        entity: "OnboardingStep", entityId: key, ip: clientIp(ctx.req), meta: { step: key } });
    });
    return state(auth.merchantId);
  }],

  // Final submit once every step is SUBMITTED/VERIFIED. Moves Merchant.status to SUBMITTED.
  ["POST", "/onboarding/submit", async (ctx) => {
    const { auth } = ctx;
    if (!OWNER_ADMIN.includes(auth.role)) fail(403, "Only the account owner or an admin can submit the application.");
    if (ctx.body.declaration !== true) bad("decl", "Tick the declaration to submit.");
    await db.tx(async (c) => {
      const m = await c.one(`SELECT status FROM "Merchant" WHERE id=$1 FOR UPDATE`, [auth.merchantId]);
      if (!EDITABLE.includes(m.status)) fail(409, "This application has already been submitted.");
      const steps = await c.q(`SELECT key, status FROM "OnboardingStep" WHERE "merchantId"=$1`, [auth.merchantId]);
      const open = STEP_KEYS.filter((k) => !steps.some((r) => r.key === k && ["SUBMITTED", "VERIFIED"].includes(r.status)));
      if (open.length) fail(409, `Finish every step before you submit (${open.length} left).`, { open });
      await c.q(`UPDATE "Merchant" SET status='SUBMITTED', "updatedAt"=now() WHERE id=$1`, [auth.merchantId]);
      await audit(c, { merchantId: auth.merchantId, userId: auth.user.id, action: "onboarding.submitted", entity: "Merchant", entityId: auth.merchantId, ip: clientIp(ctx.req) });
    });
    return state(auth.merchantId);
  }],

  // KYC uploads need private object storage, which isn't configured.
  ["POST", "/onboarding/documents", async (ctx) => {
    if (!OWNER_ADMIN.includes(ctx.auth.role)) fail(403, "Only the account owner or an admin can upload documents.");
    fail(501, NO_STORAGE);
  }],

  // Opens the website and each policy page from the server and reports what actually came back.
  ["POST", "/onboarding/website/check", async (ctx) => {
    const url = s(ctx.body.url, 300), app = s(ctx.body.app, 300), pol = ctx.body.pol || {};
    if (!isUrl(url)) bad("web.url", "Enter the full address, for example https://yourbusiness.in");
    const site = host(url), LABEL = { terms: "Terms & conditions", refund: "Refund & cancellation policy", privacy: "Privacy policy", contact: "Contact us", pricing: "Pricing", shipping: "Shipping / delivery policy" };
    const probe = async (u) => {
      try {
        const { res, ms } = await safeFetch(u, { method: "GET", headers: { "user-agent": "BizpolePay-SiteCheck/1.0" } }, { timeoutMs: 8000 });
        res.body && res.body.cancel().catch(() => {});
        if (res.status >= 200 && res.status < 300) return ["ok", `${res.status} · ${ms} ms`];
        if (res.status >= 300 && res.status < 400) return ["warn", `${res.status} redirect to ${res.headers.get("location") || "another page"}`];
        return ["bad", `HTTP ${res.status}`];
      } catch (e) {
        return ["bad", e.name === "TimeoutError" ? "Didn't respond within 8 seconds" : e.code === "PRIVATE" || e.code === "DNS" ? e.message : "Couldn't connect" + (e.cause && e.cause.code ? ` (${e.cause.code})` : "")];
      }
    };
    const jobs = [["Site reachable", url, true]];
    POL.forEach(([k, req]) => {
      const p = pol[k] || {};
      if (p.on && isUrl(s(p.url, 300))) jobs.push([LABEL[k], s(p.url, 300), false]);
      else if (req) jobs.push([LABEL[k], null, false]);
    });
    if (app) jobs.push(["App listing", app, false]);
    const rows = await Promise.all(jobs.map(async ([label, u, isSite]) => {
      if (!u) return [label, "bad", "Not linked yet"];
      if (!isSite && label !== "App listing" && host(u) !== site) return [label, "bad", `On ${host(u)}, not ${site}`];
      const [st, note] = await probe(u);
      if (isSite && st === "ok" && !/^https:/.test(u)) return [label, "warn", note + " · loads over http only; turn on HTTPS before going live"];
      return [label, st, note];
    }));
    return { rows, at: new Date() };
  }],
];

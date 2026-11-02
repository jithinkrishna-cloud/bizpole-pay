# REA analysis: payu.in and the PayU merchant dashboard

Captured on 2 Nov 2026 with REA (Chrome DevTools Protocol, Chrome 156). The user signed in to their own account themselves. REA only read the pages: it did not click anything inside the dashboard, change any setting, or capture any credentials.

The labels below mean:
- **Observed**: REA captured it.
- **Inferred**: concluded from what was captured.
- **Unknown**: not checked.

## 1. Evidence

| Evidence ID | What |
|---|---|
| `ev_451c16cc…ab586` | Logged-out load of `payu.in/business`: redirect to sign-in, network hosts, screenshot |
| `ev_db30f60d…6d573` | payu.in home page structure (navigation, products, footer); clicked **Login** |
| `ev_a5f25b45…de587` | Passive inspection of logged-in dashboard, **Live** mode |
| `ev_9d569838…eefa` | Passive inspection of logged-in dashboard, **Test** mode |

Screenshot of the sign-in page: [evidence/payu-business-signin.png](evidence/payu-business-signin.png)

> The live-mode capture showed a **test key and part of the test salt** in the "Get UAT Key & Salt" widget. They are deliberately left out of this repo. Since they appeared in a capture, consider rotating them.

## 2. Logged-out behaviour (observed)

- `https://payu.in/business` → redirects to `onboarding.payu.in/account/service_login` → `onboarding.payu.in/app/account/signin?redirect_to=…`
- Sign-in page elements: **Email**, **Password** (with show/hide toggle), **Login using OTP**, **Forgot Password**, **LOGIN**, **Continue with Company SSO**, **Sign Up**. Left panel: marketing banner loaded from a CMS.
- payu.in home page header: Products · Business Types · Resources · About · Pricing · Support · **Login** (opens in a new tab) · **Sign Up**.
- Sign-up and login links carry `first_visit_url` and `last_visit_url` query parameters (attribution tracking).

## 3. Logged-in dashboard (observed)

**Header:** MID button (a different MID in Test and Live), **Test Mode / Live Mode** toggle, global search ("transactions, payment products, refunds …"), checkout-customisation shortcut, profile menu, chat widget.

**Sidebar (3 groups):**

| TRACK | PAYMENT PRODUCTS | INSIGHTS & ENGAGEMENT | (bottom) |
|---|---|---|---|
| Business Summary | Manage Checkout | Payment Analytics | Explore Products |
| Transactions | Payment Tools | Customer Insights | Settings |
| Settlements | Subscriptions | Offers and Loyalty | Developer |
| Chargeback | Split & Transfer Payments | | |
| Reports | Hexa Wallet · Maximizer · Payouts | | |

**Home, live mode, before onboarding:**
- "Welcome back, *name*. Complete Onboarding to get started!" with a **Resume Onboarding** button
- **Onboarding Progress**: "You've already completed 0% of your Onboarding". Steps: **PAN Details → Business Details → Bank Account → Website Details → KYC Documents**
- **Payment Mode Status** ("Complete onboarding to activate"): Credit card, UPI, Wallets, EMI, Debit card, Net Banking
- **Gateway Health**: Active Downtime / Past Downtime tabs, "All Payment Modes are Active, as of {time}", Refresh
- "Get UAT Key & Salt to try payments" (test key and salt shown)
- Integration choices: **PayU Hosted** (1–2 days, "prebuilt checkout page"), **Merchant Hosted** (2–3 days, "custom payment page with … APIs"), **Integrate with Plugins** (in minutes: Shopify, WooCommerce …)

**Home, test mode:**
- "TEST DATA" banner, "Welcome … on your test account!", **Connect existing test account**
- Date-range picker (default: last 7 days)
- KPI cards: **Total Transaction Amount** (n transactions), **Total Settled Amount** (n settlements), **Total Refunds** (n refunds)
- **Success Rates**, **Avg. Transaction Size**, **Preferred Payment Mode**
- **Successful Transactions Trend** chart (Txn. volume toggle), **Split by payment modes**
- **Active payment modes**: EMI, BNPL, Net Banking, Credit Card, Debit Card, Cash Card, UPI ("Unable to load Payment Handle / Try Again" seen)
- Product hub: "Check PayU Products"

## 4. Front-end architecture (observed)

- Micro-frontend shell: `payu.in/onedash.3.17.7/root-config.js`, SystemJS + import-map-overrides (jsDelivr). This looks like single-spa (inferred).
- Separately versioned bundles: `micro-bundles/aside-menu/onedashsidemenu.2.37.19`, `micro-bundles/txns/onedashtxn.3.97.12`, shared UI kit `payu-ui-bundles/v1.45.9` and `uiv2`.
- Bundle names show the route modules (inferred): `transactions`, `settlements`, `payment-link`, `paymentGateway`, `settings`, `report`, `analytics`, `buttons`, `developerConsole`, `diagnosticTool`.
- Sign-in app at `onboarding.payu.in` (separate React bundle). Auth: `POST accounts.payu.in/oauth/token.json`.
- Other first-party calls: `oneapi.payu.in/pariksha/api/frontend` (on load; probably feature flags or experiments, inferred). CMS: Prismic (`payuprod.prismic.io`).
- Third parties seen: GTM/GA, DoubleClick, LinkedIn, Meta, Bing, Clarity, Hotjar, Netcore, CleverTap.

## 5. Not observed (unknown)

- **Internal dashboard API endpoints and response shapes.** REA attached after the dashboard had loaded, and the scripted reload failed on the logged-in tab, so dashboard XHRs were not captured. The Prisma schema is modelled on the visible UI plus PayU's public merchant APIs, not on PayU's internal data.
- Inner screens (Transactions table columns, Settlement detail, Settings, Developer, onboarding forms) were not opened.
- How PayU's partner or aggregator onboarding API works. It needs partner credentials and docs from PayU.

**Next capture (optional):** click through each sidebar module while REA observes passively, to record table columns, filters, and the API calls each screen makes.

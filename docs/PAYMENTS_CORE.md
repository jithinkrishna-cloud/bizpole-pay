# Payments core: plan and schema (for approval)

Status: **approved 5 Nov 2026; built.** Migration `20261107000000_payments_core` is written but **not applied**.
Code: `server/payments-core.js`, `server/pay-pages.js`, `server/routes/pay.js`, `gateway` in `server/providers/payu.js`;
tests: `test/payments-core.test.js`. Refunds still use `server/payu.js` `postservice` (moving them behind the
gateway interface is a follow-up).

## 1. Goal

Take real payments, in Test and Live, through whichever provider connection is active for the mode
(Super Admin → Provider settings). Today only refunds call the provider; nothing creates a payment, so test
mode never reaches PayU and payment links stay "URL pending".

Merchants and customers only ever see **Bizpole Pay** (docs/PAYMENT_PROVIDER_CONFIG.md, test/white-label.test.js).
The provider's own hosted payment page is the one place a customer sees the provider.

## 2. Payment flow

```
Merchant creates an order (dashboard, payment link, later the API)
  → customer opens  https://bizpole-pay.vercel.app/pay/<token>          (Bizpole Pay page: who, what, how much)
  → "Continue to payment" posts a signed form to the provider's payment page   (PayU: test.payu.in/_payment)
  → provider returns the customer to  /api/pay/return/<txnid>              (success and failure URL)
       verify signature → confirm status with the provider → save → redirect to the merchant's return URL
  → provider also calls  /api/webhooks/<connectionId>                      (server to server, may come first or twice)
  → merchant sees the payment; refunds and status checks use the same provider and account
```

- One **order** can have several **attempts** (transactions). Each attempt gets a new `txnid`.
- A payment always stays with the **connection and account it started on**. Switching the active connection
  only changes new payments; follow-ups (return, webhook, status check, refund) for older payments keep working.
- The pay page needs no JavaScript: it shows a button that submits the signed form, so the strict CSP stays.

## 3. What gets built

### 3.1 Provider interface (each provider file implements it; PayU first)

| Function | Purpose | PayU implementation |
|---|---|---|
| `checkoutForm(cfg, account, txn)` | Form fields and action URL for the hosted page | `_payment` with `key, txnid, amount, productinfo, firstname, email, phone, surl, furl, udf1–5, hash` where hash = sha512(`key\|txnid\|amount\|productinfo\|firstname\|email\|udf1\|…\|udf5\|\|\|\|\|\|salt`) |
| `parseCallback(body)` | Normalise a return or webhook: txnid, provider id, status, amount, method, masked card/VPA, error | Reverse hash sha512(`[additionalCharges\|]salt\|status\|\|\|\|\|\|udf5\|…\|udf1\|email\|firstname\|productinfo\|amount\|txnid\|key`) |
| `fetchStatus(cfg, account, txn)` | Authoritative status | postservice `verify_payment` (var1 = txnid) |
| `refund(cfg, account, txn, refund)` | Refund | postservice `cancel_refund_transaction` (exists today; moved behind the interface) |
| `webhookAccount(body)` | Which account sent it | merchant `key` in the payload |

Status mapping (PayU): `success`+`captured` → SUCCESS, `auth` → AUTHORIZED, `pending` → PENDING,
`failure` → FAILED, `userCancelled` → USER_CANCELLED, `bounced` → BOUNCED, `dropped` → DROPPED, `autoRefund` → AUTO_REFUNDED.
Raw values stay in the existing columns (`payuStatus`, `unmappedStatus`, `payuMode`) for support.

### 3.2 Server routes

| Route | Who | Purpose |
|---|---|---|
| `POST /api/orders` | merchant (write roles) | Create an order: amount, description, customer name/email/phone, optional receipt and return URL. Returns `checkoutUrl`. |
| `GET /pay/<token>` | public | Bizpole Pay page with the merchant's checkout branding, amount, "Continue to payment". Expired or paid orders show a clear message. |
| `POST /api/pay/<token>/start` | public | Creates the attempt and returns the auto-filled provider form (HTML). |
| `POST /api/pay/return/<txnid>` | provider (form post) | Verify, confirm with `fetchStatus`, save, redirect to the merchant's return URL with `status` and `order_id`, or to a Bizpole Pay result page. |
| `POST /api/webhooks/<connectionId>` | provider (form or JSON) | Verify and save; always answers 200 once recorded (duplicates are ignored). |
| `POST /api/transactions/<txnid>/verify` | merchant | "Check status with gateway" button. |
| `GET /pay/l/<slug>` + `POST /api/pay/l/<slug>` | public | Payment link page: collects name, email, phone (and amount when the customer enters it), then creates an order. |

Router changes: routes can accept form-encoded bodies (`opts.form`, only these provider callbacks), return
HTML and redirects; `vercel.json` and `scripts/serve.js` map `/pay/*` to the API.

### 3.3 Safety rules

- Every return and webhook is checked against the account's salt; a bad signature is stored as `SIGNATURE_INVALID` and changes nothing.
- The amount and txnid in a callback must match our attempt; otherwise the attempt is flagged, not marked paid.
- A SUCCESS from the return page is confirmed with `fetchStatus` before the order is marked paid (webhook can confirm it too).
- Each event is stored once (`InboundEvent.dedupeKey`); repeats are `DUPLICATE`.
- Stored payloads drop `hash`, full card numbers and any secret; only masked card and VPA are kept (existing columns).
- Pay tokens and link slugs are random (128 bits), so order and link pages can't be guessed.
- Merchant return URLs must be `https` (localhost allowed in Test only).
- Paused mode or no account: the pay page shows "Payments are not available right now" (no provider name).

### 3.4 Screens

- **Merchant dashboard:** "Collect payment" (creates an order and shows the link to share); "Check status" on a payment;
  payment links get real URLs and a copy button. Wording stays provider-neutral.
- **Super Admin → Provider settings → connection:** shows its **webhook address** per mode to paste into the provider dashboard.

### 3.5 Not in this phase

API-key access for merchants' own servers, automatic re-checking of stuck payments on a schedule (Vercel cron),
subscriptions/mandates, split settlements, payouts, chargebacks, settlement sync, and salt version 2 accounts
(PayU then expects a JSON hash with both salts; test MIDs use version 1). Each can follow once this works.

## 4. Schema changes (migration `20261107000000_payments_core`, for approval)

```sql
-- Which connection and provider handled an attempt (existing rows: NULL connection, provider 'payu').
ALTER TABLE "Transaction"
  ADD COLUMN "connectionId" TEXT REFERENCES "ProviderConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "provider"     TEXT NOT NULL DEFAULT 'payu';

-- Public, unguessable token for /pay/<token>.
ALTER TABLE "Order" ADD COLUMN "payToken" TEXT;
CREATE UNIQUE INDEX "Order_payToken_key" ON "Order"("payToken");

-- Public slug for /pay/l/<slug>; "url" is filled with the Bizpole Pay address on creation.
ALTER TABLE "PaymentLink" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "PaymentLink_slug_key" ON "PaymentLink"("slug");

-- Which connection a callback arrived on.
ALTER TABLE "InboundEvent" ADD COLUMN "connectionId" TEXT REFERENCES "ProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Additive only. Existing links get a slug and URL in the same migration
(`UPDATE "PaymentLink" SET slug = <random>, url = 'https://bizpole-pay.vercel.app/pay/l/' || slug WHERE url IS NULL`),
so their "URL pending" goes away. `down.sql` drops the columns.

## 5. Rollout

1. Approve section 4. 2. Build + unit tests (hash vectors, callback parsing, status mapping, amount mismatch, duplicates).
3. Integration test on a Neon branch against a local fake provider. 4. Apply the migration, deploy.
5. Super Admin pastes the webhook address into the PayU **test** dashboard. 6. End-to-end test on techovic
(MID 13837816) with PayU test cards and UPI: success, failure, cancel, refund, status check.
7. Live stays paused until PayU live keys and a live test are done.

# User Flows

Actors: **Visitor**, **Merchant user** (Owner/Admin/Finance/Developer/Support/Viewer), **Customer** (the merchant's payer), **Paynest API**, **PayU**.

## 1. Sign up

```mermaid
flowchart LR
  A[Landing: Sign Up] --> B[Name, email, mobile, password]
  B --> C[Email + mobile OTP]
  C --> D[Create User + Merchant status=TEST_ONLY]
  D --> E[Provision TEST PayuCredential<br/>key+salt encrypted, saltVersion]
  E --> F[Dashboard in Test Mode<br/>'Welcome on your test account']
```

Created: `User`, `Merchant`, `Membership(OWNER)`, five `OnboardingStep` rows (NOT_STARTED), `PayuCredential(mode=TEST, isDefault)`, `MerchantPaymentMethod` rows (TEST, enabled).

## 2. Sign in

```mermaid
flowchart TD
  L[Sign-in page] -->|Email + Password| P{Valid?}
  L -->|Login using OTP| O[Send OTP to email/mobile] --> V{OTP ok?}
  L -->|Company SSO| S[Lookup SsoConnection by email domain] --> I[IdP redirect] --> CB[OIDC/SAML callback]
  L -->|Forgot Password| R[Reset OTP → new password]
  P -->|yes| SES[Create Session + set cookie]
  V -->|yes| SES
  CB --> SES
  P -->|no, 5x| LOCK[Lock account 15 min]
  SES --> RED{redirect_to?}
  RED -->|yes| BACK[Return to requested page]
  RED -->|no| HOME[Business Summary]
```

The session stores the selected merchant (MID switcher) and the current **mode**.

## 3. Onboarding (test → live)

```mermaid
flowchart LR
  H[Home: Resume Onboarding] --> S1[PAN Details<br/>PAN, name on PAN, business type]
  S1 --> S2[Business Details<br/>legal name, category, address, GSTIN]
  S2 --> S3[Bank Account<br/>acct no, IFSC → penny-drop]
  S3 --> S4[Website Details<br/>URL/app, T&C, refund, privacy, contact pages]
  S4 --> S5[KYC Documents<br/>upload per business type]
  S5 --> SUB[Submit → partner onboarding API<br/>status=UNDER_REVIEW]
  SUB -->|approved| LIVE[merchant_credentials_issued webhook<br/>LIVE PayuCredential (salt_v2), status=LIVE]
  SUB -->|rejected/needs info| FIX[Step → REJECTED with remarks<br/>merchant edits & resubmits]
```

Progress % = verified-or-submitted steps ÷ 5. The **Payment Mode Status** card stays "Complete onboarding to activate" until the merchant is LIVE.

## 4. Choose integration

The home page offers **Hosted** (Paynest/PayU checkout page, about 1–2 days), **Merchant Hosted** (custom UI with server APIs, about 2–3 days) and **Plugins** (minutes). The choice is saved as `Merchant.integrationType` and decides which developer guide is shown.

## 5. Customer checkout (Hosted)

```mermaid
sequenceDiagram
  participant C as Customer
  participant M as Merchant server
  participant N as Paynest API
  participant P as PayU
  M->>N: POST /v1/orders {amount, receipt, customer}
  N-->>M: order_id
  M->>C: redirect to Paynest /pay/{order_id}
  C->>N: GET /pay/{order_id}
  N->>N: new Transaction(txnid), hash = sha512(key|txnid|amount|...|SALT)
  N-->>C: auto-submit form → PayU _payment
  C->>P: pay (card/UPI/NB/wallet/EMI)
  P-->>C: POST surl/furl (browser)
  C->>N: POST /payu/callback/success|failure
  N->>N: store InboundEvent (dedupeKey), check reverse hash
  N->>P: verify_payment(txnid)
  P-->>N: status
  N->>N: Transaction + Order status, ledger
  N-->>C: receipt page → merchant return_url
  N-)M: webhook payment.success (signed)
  P-)N: S2S webhook (later, for retries/pending)
```

## 6. Refund

```mermaid
flowchart LR
  T[Transaction detail] --> R[Refund: amount ≤ refundable, reason]
  R --> X[Refund REQUESTED, token ≤23 chars]
  X --> API[PayU cancel_refund_transaction<br/>var1 mihpayid, var2 token, var3 amount]
  API -->|request_id| Q[QUEUED]
  Q --> POLL[Worker: check_action_status / webhook]
  POLL --> OK[SUCCESS + bank ARN] & FAIL[FAILED + reason]
  OK --> WH[webhook refund.processed]
```

Only the Owner, Admin and Finance roles can refund. Each refund is written to `AuditLog`.

## 7. Settlement sync

A nightly worker pulls settlement data from PayU for each LIVE merchant, calls `GET /settlement/range` in 3-day windows, then upserts `Settlement` and its `SettlementLine` rows (capture/refund/chargeback lines with fee, tax and net) and posts balanced `LedgerEntry` journals. The Business Summary card "Total Settled Amount" reads these rows.

## 8. Reconciliation (stuck payments)

```mermaid
flowchart LR
  CRON[Every 5 min] --> Q[Transactions INITIATED/PENDING older than 10 min]
  Q --> V[verify_payment batch]
  V --> U[Update status; emit webhooks]
  U --> E[After 24h still INITIATED → DROPPED]
```

## 9. Payment link

Payment Tools → Create link (amount or open amount, description, customer, expiry) → `PaymentLink` + short URL → customer opens the link → the order is created → hosted checkout (flow 5) → the link becomes PAID (or PARTIALLY_PAID).

## 10. Developer setup

Developer page → see the test key, with the salt hidden until "Reveal" plus re-authentication → create a Paynest API key → add a webhook endpoint and secret → "Send test event" → view the delivery log.

## 11. Test/Live switch

The header toggle updates `Session.mode`. Every query is filtered by `mode`. Switching to Live before the merchant is LIVE shows the onboarding prompt instead of data.

## 12. Gateway health

A worker reads PayU downtime information and/or probe results into `GatewayDowntime`. The home widget shows open rows (Active Downtime) and the last 7 days of closed rows (Past Downtime). The Refresh button re-queries.

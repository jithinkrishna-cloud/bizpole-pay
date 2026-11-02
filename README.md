# Paynest — Merchant Payments Dashboard on PayU

Paynest is a merchant dashboard and payments platform for Indian businesses. It works like a payment-gateway dashboard, but it runs on **PayU's APIs as a partner**: PayU moves the money (cards, UPI, net banking, wallets, EMI, BNPL). Paynest handles signup, onboarding, the merchant dashboard, its own ledger, reports, and webhooks to the merchant.

> Paynest has its own brand and design. It does not reuse PayU's name, logo, images, or copy. PayU is named only as the payment provider ("Payments processed by PayU").

## Contents

| Doc | What it covers |
|---|---|
| [docs/REA_ANALYSIS.md](docs/REA_ANALYSIS.md) | What we saw on payu.in and the PayU dashboard (REA evidence), what we didn't see |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | Signup, login, onboarding, test→live, checkout, refund, settlement, webhook flows |
| [docs/PAYU_INTEGRATION.md](docs/PAYU_INTEGRATION.md) | PayU endpoints, hash formulas, callback handling, reconciliation, partner onboarding |
| [docs/MODULES.md](docs/MODULES.md) | Every dashboard module: screens, data, and the PayU API behind it |
| [prisma/schema.prisma](prisma/schema.prisma) | Database schema v2 — **frozen** (PostgreSQL, Prisma 7) |
| [prisma/sql/constraints.sql](prisma/sql/constraints.sql) | CHECKs, partial unique indexes, refund + ledger triggers |
| [docs/SCHEMA_REVIEW.md](docs/SCHEMA_REVIEW.md) | PayU compatibility review, redesign rationale, open questions, verification |
| [public/index.html](public/index.html) | Landing page |
| [public/app.html](public/app.html) | Clickable dashboard prototype (all modules, mock data) |

## Scope

### MVP (phase 1)
1. Accounts: email/password login, OTP login, forgot password, sign-up. Company SSO comes later.
2. **Test mode first**: every new merchant gets a test MID right away. A Test/Live switch in the header scopes every screen.
3. Onboarding wizard with 5 steps: PAN details, Business details, Bank account, Website details, KYC documents, plus a progress percentage.
4. Home (Business Summary): total transaction amount, settled amount, refunds, success rate, average ticket size, preferred payment mode, trend chart, and a date-range picker.
5. Transactions list and detail, refunds (full and partial).
6. Settlements list and detail.
7. Hosted checkout (PayU Hosted). The merchant integrates through Paynest's API plus a server SDK.
8. Payment links.
9. Developer: API keys, webhooks, test key and salt shown masked.
10. Gateway health panel (active and past downtime per payment mode).

### Phase 2
Chargebacks, scheduled and exported reports, checkout customisation (logo, colour, mode order), subscriptions (UPI Autopay / standing instructions), split settlements, payouts, team roles, Company SSO, analytics.

### Out of scope
Hexa wallet, Maximizer, offers and loyalty engines, POS hardware, lending.

## Architecture

```
Browser (Next.js app)                Merchant's server
   │  session cookie                     │  Paynest API key
   ▼                                     ▼
┌──────────────────────── Paynest API (Node/TypeScript) ────────────────────────┐
│ auth · merchants · onboarding · orders · payments · refunds · links · reports │
│ PayU adapter: hash/sign · _payment form · postservice commands · OAuth APIs   │
│ Callback receiver (surl/furl/webhook) → InboundEvent → ledger journal          │
│ Workers: reconciliation (verify_payment), settlement sync, webhook delivery   │
└───────────────┬──────────────────────────────────────────────┬────────────────┘
                ▼                                              ▼
         PostgreSQL (Prisma)                         PayU (test.payu.in / secure.payu.in /
         Redis (queues, rate limits, OTP)            info.payu.in / partner + OAuth APIs)
         S3-compatible storage (KYC, reports)
```

**Suggested stack:** Next.js (App Router) + TypeScript, Prisma 7 + PostgreSQL, BullMQ + Redis, Zod for validation, S3/MinIO for documents, Tailwind for UI.

### Rules the code must follow
- **The PayU salt never leaves the server.** Hashes are computed only on the server.
- **Callbacks are not trusted until checked**: verify the reverse hash, then confirm with `verify_payment` before marking an order PAID.
- **Use a new `txnid` for every attempt**. One Order can have many Transactions.
- **Store money as integer paise** (`BigInt`). Convert to PayU's `"10.00"` string only at the adapter.
- **Everything is scoped by mode**: test and live data never mix, and each mode has its own MID, key and salt.
- **Idempotency**: refunds use a unique `token` (≤23 chars), payouts use `merchantRefId` (≤40), and every inbound event is stored once by `dedupeKey`.
- **Data security (PCI-DSS)**: never store a full card number, CVV or expiry. Encrypt salts, bank account numbers and webhook secrets.

## Repo layout (proposed)

```
paynest/
├─ prisma/schema.prisma
├─ prisma.config.ts
├─ public/index.html          # static landing + sign-in mock
├─ src/
│  ├─ app/                    # Next.js routes (auth, dashboard/*, api/*)
│  ├─ server/payu/            # adapter: hash.ts, hosted.ts, commands.ts, oauth.ts
│  ├─ server/ledger/          # order/txn state machine, reconciliation
│  ├─ server/webhooks/        # inbound PayU + outbound merchant delivery
│  └─ generated/prisma/       # prisma client output
└─ docs/
```

## Getting started

```bash
cp .env.example .env          # fill PAYU_TEST_KEY / PAYU_TEST_SALT from your PayU test dashboard
npm i -D prisma && npm i @prisma/client dotenv
npx prisma migrate dev --name init
npx prisma migrate dev --create-only --name constraints   # paste prisma/sql/constraints.sql, then migrate dev
npx prisma generate
```

Open `public/index.html` (landing) or `public/app.html` (dashboard prototype; any email/password works) in a browser.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | Auth + test merchant | Sign up → test MID + test key/salt stored encrypted |
| M2 | Hosted checkout (test) | Order → PayU test page → surl → reverse hash ok → verify_payment → PAID |
| M3 | Dashboard home + transactions | Numbers on the home page match the transactions table for the selected date range |
| M4 | Refunds + reconciliation worker | Partial refund reaches SUCCESS; stuck PENDING txns are resolved by the cron |
| M5 | Onboarding → partner submission | 5 steps complete → submitted to PayU → live MID stored on approval |
| M6 | Settlements + payment links + webhooks | Settlement sync job; link paid end-to-end; signed webhooks delivered to merchant |

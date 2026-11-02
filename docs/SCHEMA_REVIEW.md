# Schema review: v1 → v2 (frozen)

**Status:** v2 is **frozen** as of 2 Nov 2026. Any change after this needs an entry in the change log at the bottom, a new migration, and a re-run of the checks in §5.

**Scope:** (2) Is the schema compatible with PayU's APIs? (3) Redesign for merchant isolation, test/live separation, the ledger, and reconciliation.

**Sources:** PayU India docs (docs.payu.in), fetched 2 Nov 2026. Where PayU's docs contradict themselves, the schema stores PayU's raw value and keeps the normalised value in a separate column, so we never have to guess.

## 1. PayU compatibility: what changed and why

| Area | v1 assumption | What PayU actually does (docs) | v2 change |
|---|---|---|---|
| Partner onboarding | One `MerchantStatus` + a 5-step wizard | Partner API: create merchant, then ~16 separate steps (PAN, CKYC OTP, business, bank, website, signatory, DigiLocker, UBO, documents, VKYC, e-sign). Status is tracked per area. A webhook signed with HMAC-SHA256 fires on every change. `merchant_credentials_issued` delivers `mid`, `merchant_key`, `salt_v1`, `salt_v2` | `Merchant.payuMid/payuMerchantUuid/payuProductAccountUuid`; `PayuOnboardingStatus` (one row per area, raw status); `PayuOnboardingEvent` (history); wizard steps gain `SIGNATORY`, `AGREEMENT`, `VKYC` |
| Credentials | One key and salt per merchant and mode | Salt **V1** (32 chars) or **V2** (256-bit, recommended; a regenerated salt must be activated within 15 days). The dashboard has a MID switcher, so a merchant can have several MIDs | `PayuCredential` with `saltVersion`, `status` (ACTIVE/ROTATING/REVOKED), `isDefault`. **Every transaction stores `credentialId`**, so verify and refund calls use the same key and salt |
| txnid | Unbounded | ≤ 25 characters, unique; reusing a successful one is rejected | `txnid VarChar(25) @unique` |
| mihpayid | Unique overall | Text; verify can return the "Not Found" sentinel; test and live are separate systems | `String?`, `@@unique([mode, mihpayid])` |
| Status | One enum | `status` ∈ success/failure/pending, plus `unmappedstatus` ∈ captured, **auth**, userCancelled, bounced, dropped, failed, **autoRefund**, initiated, in progress, pending. Casing is inconsistent | Raw `payuStatus` + `unmappedStatus` kept; enum gains `AUTHORIZED`, `AUTO_REFUNDED`; `TransactionEvent` keeps the status history |
| Amount | Paise only | The reverse hash uses the exact amount string PayU returns | `payuAmount` stored as received; plus `netAmountDebitPaise`, `discountPaise` |
| Refunds | `tokenId` free-form | `var2` token ≤ 23 chars and unique; statuses QUEUED / IN PROGRESS / SUCCESS / FAILURE; `bank_arn` arrives 24–72 h later; refunds of split payments use `var8` | `token VarChar(23)`, `IN_PROGRESS`, raw status, `bankArn`, `refundMode`, `splitBreakdown`; DB trigger blocks refunding more than was captured |
| Settlement | `get_settlement_details` postservice command | REST `GET info.payu.in/settlement/range` (≤ 3-day window, HMAC-SHA512 header) → settlements with `transaction[]` lines covering capture / refund / chargeback / chargeback reversal, plus fee, tax and GST | `Settlement` with PayU's amount fields; `SettlementLine` (action, payuId, requestId, fee, tax, signed net) linked to both `Transaction` and `Refund`; dedupe on `lineKey` |
| Chargebacks | Phase 2 placeholder | Real API (`bankportal.payu.in`, ≤ 20-day window) + dispute webhook. `cb_status`: New, Pending Response, Pending Doc Review, Submitted to Bank, Insufficient Document, Closed in Merchant/Customer Favour, Closed under Fraud Liability | Normalised `ChargebackStatus` + raw `payuStatus`, `cbType`, `reasonCode`, `bankCaseNo`, `debitStatus`, `replyBefore` |
| Payment links | Generic link | `oneapi.payu.in/payment-links` (OAuth `create_payment_links` scope): `invoiceNumber`, `subAmount`, `isAmountFilledByCustomer`, `isPartialPaymentAllowed`, `minAmountForCustomer`, `maxPaymentsAllowed`, `expiryDate` | All of these fields; unique per credential on `invoiceNumber` |
| Subscriptions | Plan + subscription | `si=1` + `si_details`. The mandate id is `authpayuid` (the mihpayid of the registration). Pre-debit notice (`pre_debit_SI`) is required 24–48 h ahead; then the debit (`si_transaction`) | `Mandate` (method, cap, cycle, UPI rule/limit, dates, `authPayuId`), `PreDebitNotification`, `RecurringDebit` (one per cycle, linked to its Transaction) |
| Split | Partner + rule | Child merchants created under an aggregator, identified by **merchant key** in `splitInfo`. Split status 1/2/0. `release_settlement` per child | `ChildMerchant` (childMid, childMerchantKey, productAccountUuid), `SplitAllocation` (aggregatorSubTxnId, amount, charges, status, release) |
| Payouts | 5 statuses | `merchantRefId` ≤ 40; statuses QUEUED, SCHEDULED, IN_PROGRESS, PENDING, WAITING_FOR_RETRY, SUCCESS, FAILED (+ reversed by webhook); fee and tax per transfer | `PayoutStatus` matches; `payuRefId`, `bankRefNo`, `batchId`, `feePaise`, `taxPaise`; unique `(merchant, mode, merchantRefId)` |
| Webhooks | One `PayuEvent` table | Payment events are form-posted and checked with the reverse hash. Refund and dispute events are JSON **with no documented signature**. Onboarding events use HMAC. Payout events have an `authorization` field | `InboundEvent` covers every source; `signatureValid` is nullable (null = PayU sends no signature, so **always confirm by polling**); `dedupeKey @unique` |

## 2. Structural redesign

1. **The database enforces test/live and merchant isolation.** Parents expose `@@unique([id, merchantId, mode])` and children reference them with composite foreign keys, so a LIVE refund can't point at a TEST transaction and merchant A's order can't hold merchant B's transaction. Tested in §5.
2. **Every merchant-scoped financial table has `mode`**: Refund, Settlement, Chargeback, Mandate, SplitAllocation, ChildMerchant, Beneficiary and Customer were all missing it in v1.
3. **Financial rows can't be deleted.** Merchant → money tables use `onDelete: Restrict`. A merchant is retired with `status = DEACTIVATED`, `deactivatedAt`.
4. **Double-entry ledger.** `LedgerEntry` is append-only (a trigger blocks UPDATE and DELETE). Every `journalId` must sum to zero; this is checked at COMMIT. Standard postings:
   - capture → `CUSTOMER_PAYMENTS −x`, `PENDING_SETTLEMENT +x`
   - fee → `PENDING_SETTLEMENT −f`, `GATEWAY_FEES +f` (tax similarly)
   - refund → `PENDING_SETTLEMENT −r`, `REFUNDS +r`
   - settlement → `PENDING_SETTLEMENT −net`, `SETTLED_TO_BANK +net`
5. **Reconciliation is recorded.** `ReconRun` stores each sweep (verify, refund status, settlement, chargeback, payout, mandate) and `ReconMismatch` stores each disagreement between our data and PayU's, with how it was resolved.
6. **Status history.** `TransactionEvent` (append-only) records every status change and the inbound event that caused it.
7. **Sensitive data.**
   - PAN → `panEnc` + `panLast4`; only masked Aadhaar (`AADHAAR_MASKED`) is stored.
   - Bank account numbers, salts and webhook/SSO secrets are encrypted.
   - The envelope format records which encryption key was used, so keys can be rotated.
   - `OnboardingStep.data` must not contain raw identifiers. Enforce this in the Zod schema for each step.
8. **Smaller fixes:** `Session.merchantId` gets a real foreign key; `MerchantAddress` is normalised out of `Merchant`; `WebhookDelivery` has a stable `eventId` so merchants can dedupe; `Order.udf*` and `productInfo` lengths match PayU's limits (255 / 100); there's one default credential per merchant and mode, and one primary bank account (partial unique indexes).

## 3. Kept as raw strings on purpose

`payuStatus`, `unmappedStatus`, `payuMode`, `pgType`, refund and chargeback raw statuses, `PayuOnboardingStatus.status`, `releaseStatus`. PayU's docs differ in casing (`userCancelled` vs `usercancelled`) and in which of 0/1 means success. The adapter normalises them once, case-insensitively, into the enum columns. Nothing else parses the raw values.

## 4. Open questions (need PayU or partner confirmation)

| # | Question | Effect if the answer differs |
|---|---|---|
| 1 | Should the payment webhook's reverse hash use the **salt** or the **client_secret**? (The docs conflict.) | Only the adapter changes, not the schema |
| 2 | Signing of refund and dispute webhooks | None. They're treated as unsigned and confirmed by polling |
| 3 | Does `createmerchant` return `product_account_uuid`, or only GetMerchant? | Column is nullable already |
| 4 | Payment-link transaction status values | Raw value stored in `Transaction.payuStatus` |
| 5 | Settlement lookup by UTR | None; we sync by date range |
| 6 | OAuth token hosts (`uat-accounts` vs `test-accounts`) | Config only |

## 5. Verification run (2 Nov 2026)

- `prisma validate` (Prisma CLI 7.10.1): **valid**.
- `prisma migrate diff --from-empty`: generates 42 tables with composite foreign keys.
- `init.sql` and `constraints.sql` were applied to PGlite (PostgreSQL in WebAssembly). 14/14 invariant checks passed:
  - Accepted: seed data, partial refund, remaining refund, balanced journal.
  - Rejected:
    - a transaction pointing at another merchant's order
    - a TEST transaction pointing at a LIVE order
    - a txnid longer than 25 characters
    - a second default credential
    - an over-refund
    - a negative amount
    - an unbalanced journal
    - an update or delete of a ledger entry
    - deleting a merchant that has financial rows

Not checked: concurrent refunds under real PostgreSQL row locking. The trigger takes `FOR UPDATE` on the transaction row, but this wasn't load-tested. Row-level security policies are drafted (commented out) and also not tested.

## 6. Change log

| Date | Version | Change |
|---|---|---|
| 2026-11-02 | v2 | PayU compatibility + structural redesign (this document). Frozen. |

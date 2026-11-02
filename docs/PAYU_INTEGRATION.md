# PayU Integration Guide (Paynest adapter)

Checked against docs.payu.in on 2 Nov 2026. Conflicts and unconfirmed points are listed in [SCHEMA_REVIEW.md §4](SCHEMA_REVIEW.md#4-open-questions-need-payu--partner-confirmation). Recheck these details before going live.

## 1. Hosts and credentials

| Purpose | Test | Live | Auth |
|---|---|---|---|
| Hosted checkout (form POST) | `test.payu.in/_payment` | `secure.payu.in/_payment` | request hash |
| Commands (verify, refund, split, SI) | `test.payu.in/merchant/postservice.php?form=2` | `info.payu.in/merchant/postservice.php?form=2` | `sha512(key\|command\|var1\|salt)` |
| Settlement REST | `apitest.payu.in/settlement/...` | `info.payu.in/settlement/...` | `Authorization: hmac username="<key>", algorithm="sha512", headers="date", signature="sha512(body\|date\|salt)"` |
| OAuth tokens | `uat-accounts.payu.in/oauth/token` | `accounts.payu.in/oauth/token` | `client_credentials` |
| Partner onboarding | (UAT host from KAM) | `partner.payu.in/api/v3/...`, `onboarding.payu.in/api/v3/product_accounts` | Bearer (scopes `refer_merchant`, `client_manage_kyc_details`, `client_manage_agreement`, `refer_child_merchant`) |
| Payment links | `uatoneapi.payu.in` | `oneapi.payu.in/payment-links` | Bearer (`create/read/update_payment_links`) + `merchantId` header |
| Payouts | `uatoneapi.payu.in/payout` | `payout.payumoney.com/payout` | Bearer (`create_payout_transactions`) |
| Chargebacks | — | `bankportal.payu.in/api/v1/chargebacks` | `X-Optimus-API-Key` |

Per-merchant key and salt are stored in `PayuCredential` (encrypted, with `saltVersion` V1/V2). Platform OAuth clients live only in env/secret manager.

## 2. Hosted checkout

**Request hash** (never send the salt):
```
sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
```
**Response hash** (verify surl/furl):
```
sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
additionalCharges present → sha512(additionalCharges|SALT|status|…)
split payments            → splitInfo inserted right after status
```
Use `amount` **exactly as received**. Limits: `txnid` ≤ 25, `udf1–5` ≤ 255, `productinfo` ≤ 100, `email` ≤ 50, `firstname` ≤ 60 (≤ 20 on test).

```ts
// src/server/payu/hash.ts
import { createHash, timingSafeEqual } from "node:crypto";
const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

export function requestHash(p: { key: string; txnid: string; amount: string; productinfo: string;
  firstname: string; email: string; udf: string[] }, salt: string) {
  const u = Array.from({ length: 5 }, (_, i) => p.udf[i] ?? "");
  return sha512([p.key, p.txnid, p.amount, p.productinfo, p.firstname, p.email, ...u, "", "", "", "", "", salt].join("|"));
}

export function responseHashValid(r: Record<string, string>, salt: string) {
  const mid = [r.status, ...(r.splitInfo ? [r.splitInfo] : []), "", "", "", "", "",
    r.udf5 ?? "", r.udf4 ?? "", r.udf3 ?? "", r.udf2 ?? "", r.udf1 ?? "",
    r.email, r.firstname, r.productinfo, r.amount, r.txnid, r.key];
  const base = [salt, ...mid].join("|");
  const expected = sha512(r.additionalCharges ? `${r.additionalCharges}|${base}` : base);
  const a = Buffer.from(expected), b = Buffer.from((r.hash ?? "").toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## 3. Commands (`postservice.php?form=2`)

| Use | command | vars | Key response fields |
|---|---|---|---|
| Verify | `verify_payment` | var1 = txnid (pipe-separated for several) | `transaction_details[txnid]`: mihpayid, status, unmappedstatus, mode, … |
| Refund | `cancel_refund_transaction` | var1 = mihpayid, var2 = token (≤ 23, unique), var3 = amount, var5 = callback URL, var8 = split breakdown | `status`, `request_id`, `bank_ref_num`, `error_code` (102 = success) |
| Refund status | `check_action_status` | var1 = request_id (or var1 = mihpayid, var2 = `payuid`) | status (queued/success/failure/in progress), `bank_arn`, `refund_mode`, `settlement_id`, `UTR_no` |
| Split after payment | `payment_split` | var1 = `{type, payuId, splitInfo}` | status 1/2/0 |
| Release split funds | `release_settlement` | var1 = mihpayid, var2 = child MID | message |
| SI pre-debit | `pre_debit_SI` | var1 = `{authpayuid, requestId, debitDate, amount, invoiceDisplayNumber \| mandateSeqNo}` | status, invoiceStatus |
| SI debit | `si_transaction` | var1 = `{authpayuid, amount, txnid, …}` | captured / pending / failed |

## 4. Status mapping (adapter, case-insensitive)

| unmappedstatus | status | → `TransactionStatus` | Order |
|---|---|---|---|
| captured | success | SUCCESS | PAID |
| auth | success | AUTHORIZED | ATTEMPTED (capture pending) |
| initiated / in progress / pending | pending | PENDING | ATTEMPTED |
| failed | failure | FAILED | ATTEMPTED |
| userCancelled | failure | USER_CANCELLED | ATTEMPTED |
| bounced | failure | BOUNCED | ATTEMPTED |
| dropped | failure | DROPPED | EXPIRED when no other attempt succeeded |
| autoRefund | failure | AUTO_REFUNDED | ATTEMPTED |

PayU `mode` → `PaymentMethod`: CC→CREDIT_CARD, DC→DEBIT_CARD, NB→NET_BANKING, UPI→UPI, CASH→WALLET, EMI→EMI, CLEMI→CARDLESS_EMI, BNPL→BNPL, QR→QR, NEFTRTGS→NEFT_RTGS, LR→REWARDS. The raw value is kept in `payuMode`.

## 5. Inbound pipeline

```
POST /payu/surl | /payu/furl | /payu/webhook/{payment|refund|dispute|onboarding|payout|link}
 1. Parse (form or JSON). Compute dedupeKey = sha256(source|id fields|status).
 2. Verify the signature where PayU provides one:
      payment → reverse hash; onboarding → HMAC-SHA256(client_secret); payout → authorization field.
      refund / dispute → no documented signature → signatureValid = null.
 3. INSERT InboundEvent (payload without hash/salts/card data). If dedupeKey already exists → DUPLICATE, return 200.
 4. Confirm by polling (verify_payment / check_action_status / GetMerchant). Never trust a callback alone.
 5. One DB transaction: update the entity, add a TransactionEvent, post ledger journal(s), queue WebhookDelivery rows.
 6. Browser routes redirect to the receipt; webhook routes return 200 quickly.
```

## 6. Workers

| Job | Schedule | API | Writes |
|---|---|---|---|
| Verify sweep | every 5 min | `verify_payment` (batch ≤ 100 txnids) | Transaction, TransactionEvent, ReconRun/Mismatch |
| Refund status | every 30 min until final + ARN | `check_action_status` | Refund |
| Settlement sync | daily, 3-day windows | `GET /settlement/range` | Settlement, SettlementLine, LedgerEntry |
| Chargeback sync | daily, ≤ 20-day windows | chargebacks API | Chargeback |
| Payout status | every 10 min | `listTransactions` | Payout |
| SI scheduler | hourly | `pre_debit_SI` then `si_transaction` | PreDebitNotification, RecurringDebit, Transaction |
| Onboarding poll (backup for webhook) | hourly | GetMerchant | PayuOnboardingStatus |

## 7. Partner onboarding flow

1. Get a token with scope `refer_merchant` and call `POST /api/v3/merchants`. Store `mid`, `uuid` and `product_account_uuid` on `Merchant`.
2. Wizard steps call the matching partner endpoints: PAN/DOB, CKYC OTP, business, bank and bank proof, website, signatory, documents, VKYC, e-sign.
3. The status webhook updates one `PayuOnboardingStatus` row per area and appends a `PayuOnboardingEvent`.
4. On `merchant_credentials_issued`:
   - Create a LIVE `PayuCredential` with `salt_v2` (preferred) and keep `salt_v1` only if needed.
   - Encrypt the salts and never log the payload.
   - Set the merchant to `LIVE` and enable payment methods.

## 8. Tests

Hash vectors from the docs; tampered hash rejected; duplicate webhook ignored; pending → resolved by the verify sweep; partial and over-refund (DB trigger); split refund; settlement lines balance to the settlement total; ledger journals balance (DB trigger).

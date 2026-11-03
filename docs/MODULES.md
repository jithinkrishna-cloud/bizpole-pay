# Dashboard modules

Mirrors the observed PayU dashboard sidebar. **Phase**: 1 = MVP, 2 = later, — = out of scope.

| Group | Module | Phase | Key screens | Prisma models | PayU API |
|---|---|---|---|---|---|
| Header | MID switcher, Test/Live toggle, search | 1 | — | Session, Membership, PayuCredential | — |
| TRACK | Business Summary | 1 | KPIs (txn amount, settled, refunds), success rate, avg ticket, preferred mode, trend, split by mode, onboarding progress, gateway health | Transaction, LedgerEntry, Refund, OnboardingStep, GatewayDowntime | — (local aggregates) |
| TRACK | Transactions | 1 | Table (date, txnid, mihpayid, amount, mode, status, customer), filters, detail drawer, refund button | Order, Transaction, Refund | verify_payment, cancel_refund_transaction |
| TRACK | Settlements | 1 | List (date, UTR, gross, fees, tax, net, status), detail with txns | Settlement, SettlementLine, BankAccount, LedgerEntry | GET /settlement/range |
| TRACK | Chargeback | 2 | Open cases, respond-by, evidence upload | Chargeback | chargebacks API + dispute webhook |
| TRACK | Reports | 2 | Request CSV export, download history | Report | — |
| PAYMENT PRODUCTS | Manage Checkout | 2 | Logo, colour, payment-mode order, preview | CheckoutTheme | hosted-checkout params |
| PAYMENT PRODUCTS | Payment Tools | 1 (links), 2 (buttons, QR) | Create/list links, share, status | PaymentLink, Order | oneapi.payu.in/payment-links (OAuth) |
| PAYMENT PRODUCTS | Subscriptions | 2 | Plans, subscribers, mandate status | SubscriptionPlan, Mandate, PreDebitNotification, RecurringDebit | si=1, pre_debit_SI, si_transaction |
| PAYMENT PRODUCTS | Split & Transfer | 2 | Partners, split rules, transfers | ChildMerchant, SplitAllocation | splitRequest / payment_split, release_settlement |
| PAYMENT PRODUCTS | Payouts | 2 | Beneficiaries, payouts, balance | Beneficiary, Payout | Payouts API (beneficiary, v2/payment, listTransactions) |
| PAYMENT PRODUCTS | Hexa Wallet, Maximizer | — | — | — | — |
| INSIGHTS | Payment Analytics | 2 | SR by mode/bank, failure reasons | Transaction (aggregates) | — |
| INSIGHTS | Customer Insights | 2 | Repeat customers, top payers | Customer, Order | — |
| INSIGHTS | Offers and Loyalty | — | — | — | — |
| Bottom | Explore Products | 1 | Static product catalogue | — | — |
| Bottom | Settings | 1 | Business profile, bank account, team & roles, SSO | Merchant, BankAccount, Membership, SsoConnection | partner onboarding |
| Bottom | Developer | 1 | Keys (test key, masked salt), Paynest API keys, webhooks, delivery log | PayuCredential, ApiKey, WebhookEndpoint, WebhookDelivery | — |
| Onboarding | Wizard (5 steps) | 1 | PAN, Business, Bank, Website, KYC | OnboardingStep, PayuOnboardingStatus, KycDocument, BankAccount | partner API + status webhook |

## Role permissions

| Action | Owner | Admin | Finance | Developer | Support | Viewer |
|---|---|---|---|---|---|---|
| View transactions/settlements | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Refund | ✓ | ✓ | ✓ | | | |
| Create payment link | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Reveal salt / manage keys & webhooks | ✓ | ✓ | | ✓ | | |
| Edit bank account / onboarding | ✓ | ✓ | | | | |
| Manage team | ✓ | ✓ | | | | |

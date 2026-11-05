-- Payments core (docs/PAYMENTS_CORE.md §4, approved 5 Nov 2026). Additive only.

-- Which provider connection and provider handled each payment attempt. Older rows: NULL connection, provider 'payu'.
ALTER TABLE "Transaction"
  ADD COLUMN "connectionId" TEXT REFERENCES "ProviderConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "provider"     TEXT NOT NULL DEFAULT 'payu';

-- Public, unguessable token for the Bizpole Pay payment page /pay/<token>.
ALTER TABLE "Order" ADD COLUMN "payToken" TEXT;
CREATE UNIQUE INDEX "Order_payToken_key" ON "Order"("payToken");

-- Public slug for the payment link page /pay/l/<slug>. The link URL is built from APP_URL when read.
ALTER TABLE "PaymentLink" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "PaymentLink_slug_key" ON "PaymentLink"("slug");
UPDATE "PaymentLink" SET "slug" = md5(random()::text || clock_timestamp()::text || "id") WHERE "slug" IS NULL;

-- Which provider connection a return or webhook arrived on.
ALTER TABLE "InboundEvent"
  ADD COLUMN "connectionId" TEXT REFERENCES "ProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

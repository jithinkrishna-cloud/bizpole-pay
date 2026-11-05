-- Manual rollback for 20261107000000_payments_core. Prisma does not run this file.
-- Run only after redeploying an app version without the payments core; then delete the migration's row from "_prisma_migrations".
ALTER TABLE "InboundEvent" DROP COLUMN "connectionId";
DROP INDEX "PaymentLink_slug_key";
ALTER TABLE "PaymentLink" DROP COLUMN "slug";
DROP INDEX "Order_payToken_key";
ALTER TABLE "Order" DROP COLUMN "payToken";
ALTER TABLE "Transaction" DROP COLUMN "provider", DROP COLUMN "connectionId";

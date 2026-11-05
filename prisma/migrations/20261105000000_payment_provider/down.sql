-- Manual rollback for 20261105000000_payment_provider. Prisma does not run this file.
-- Run only after redeploying an app version that reads "PayuProviderConfig" again. Changes saved in
-- "PaymentProvider" after this migration are not copied back. Then delete the migration's row from
-- "_prisma_migrations" so it can be re-applied later.
ALTER TABLE "PayuCredential" DROP CONSTRAINT "PayuCredential_provider_format", DROP COLUMN "extraEnc", DROP COLUMN "provider";
DROP TABLE "PaymentProvider";

-- Manual rollback for 20261106000000_provider_connections. Prisma does not run this file.
-- Run only after redeploying an app version without provider connections. Settings of connections other than
-- the environment-fallback one are deleted. Then delete the migration's row from "_prisma_migrations".
DELETE FROM "PaymentProvider" p USING "ProviderConnection" c WHERE c."id" = p."connectionId" AND NOT c."envFallback";
DROP INDEX "PaymentProvider_connectionId_mode_key";
CREATE UNIQUE INDEX "PaymentProvider_provider_mode_key" ON "PaymentProvider"("provider", "mode");
ALTER TABLE "PaymentProvider" DROP COLUMN "connectionId";
DROP TABLE "ProviderConnection";

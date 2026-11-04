-- Manual rollback for 20261104000000_payu_provider_config. Prisma does not run this file.
-- Run only after redeploying an app version that does not read these columns, then delete the
-- migration's row from "_prisma_migrations" so it can be re-applied later.
ALTER TABLE "PayuCredential" DROP COLUMN "revokedById", DROP COLUMN "createdById", DROP COLUMN "source";
DROP TABLE "PayuProviderConfig";
DROP TYPE "CredentialSource";

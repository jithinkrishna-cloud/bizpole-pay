-- PayU provider settings managed from Super Admin (docs/PAYU_PROVIDER_CONFIG.md, approved 4 Nov 2026).
-- Additive only: no rows are inserted or updated. Rollback: down.sql in this folder (not run automatically).

CREATE TYPE "CredentialSource" AS ENUM ('MERCHANT', 'PLATFORM', 'ONBOARDING');

CREATE TABLE "PayuProviderConfig" (
  "id"                     TEXT PRIMARY KEY,
  "mode"                   "Mode" NOT NULL,
  "enabled"                BOOLEAN NOT NULL DEFAULT false,
  "partnerClientId"        TEXT,
  "partnerClientSecretEnc" TEXT,
  "oauthUrl"               TEXT,
  "paymentUrl"             TEXT,
  "postserviceUrl"         TEXT,
  "oneApiUrl"              TEXT,
  "defaultMid"             INTEGER,
  "defaultKey"             TEXT,
  "defaultSaltEnc"         TEXT,
  "defaultSaltVersion"     "SaltVersion",
  "version"                INTEGER NOT NULL DEFAULT 1,
  "updatedById"            TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayuProviderConfig_mode_key" UNIQUE ("mode"),
  -- partner client ID and secret are set together or not at all
  CONSTRAINT "PayuProviderConfig_partner_pair"
    CHECK (("partnerClientId" IS NULL) = ("partnerClientSecretEnc" IS NULL)),
  -- shared default credential: all four fields or none, and only for TEST
  CONSTRAINT "PayuProviderConfig_default_all_or_none"
    CHECK (num_nulls("defaultMid", "defaultKey", "defaultSaltEnc", "defaultSaltVersion") IN (0, 4)),
  CONSTRAINT "PayuProviderConfig_default_test_only"
    CHECK ("mode" = 'TEST' OR "defaultMid" IS NULL),
  -- endpoint overrides may only point at PayU hosts over HTTPS (credentials are never sent elsewhere)
  CONSTRAINT "PayuProviderConfig_payu_hosts" CHECK (
        ("oauthUrl"       IS NULL OR "oauthUrl"       ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
    AND ("paymentUrl"     IS NULL OR "paymentUrl"     ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
    AND ("postserviceUrl" IS NULL OR "postserviceUrl" ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
    AND ("oneApiUrl"      IS NULL OR "oneApiUrl"      ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
  )
);

ALTER TABLE "PayuCredential"
  ADD COLUMN "source"      "CredentialSource" NOT NULL DEFAULT 'MERCHANT',
  ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "revokedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Provider-neutral payment provider settings (docs/PAYMENT_PROVIDER_CONFIG.md, stage 1, approved 4 Nov 2026).
-- Fields per provider come from server/providers/*.js; this table stores them as JSON:
--   settings   = non-secret values (client IDs, address overrides, shared account's non-secret fields)
--   secretsEnc = { field: AES-256-GCM ciphertext } (server/secrets.js); never sent to a browser.
-- Address host rules are per provider and enforced in the app (server/providers/config.js cleanUrl).
-- Copies the PayuProviderConfig rows; that table is left in place (unused) so the app version running
-- before this deploy keeps its settings, and is dropped by a later cleanup migration.
-- Rollback: down.sql in this folder (not run automatically).

CREATE TABLE "PaymentProvider" (
  "id"          TEXT PRIMARY KEY,
  "provider"    TEXT NOT NULL,
  "mode"        "Mode" NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT false,
  "isActive"    BOOLEAN NOT NULL DEFAULT false,
  "settings"    JSONB NOT NULL DEFAULT '{}',
  "secretsEnc"  JSONB NOT NULL DEFAULT '{}',
  "version"     INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentProvider_provider_format" CHECK ("provider" ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT "PaymentProvider_settings_object" CHECK (jsonb_typeof("settings") = 'object'),
  CONSTRAINT "PaymentProvider_secrets_object"  CHECK (jsonb_typeof("secretsEnc") = 'object')
);
CREATE UNIQUE INDEX "PaymentProvider_provider_mode_key" ON "PaymentProvider"("provider", "mode");
-- At most one active provider per mode.
CREATE UNIQUE INDEX "PaymentProvider_one_active_per_mode" ON "PaymentProvider"("mode") WHERE "isActive";

INSERT INTO "PaymentProvider" ("id", "provider", "mode", "enabled", "isActive", "settings", "secretsEnc", "version", "updatedById", "createdAt", "updatedAt")
SELECT "id", 'payu', "mode", "enabled", true,
       jsonb_strip_nulls(jsonb_build_object(
         'partnerClientId', "partnerClientId",
         'oauthUrl', "oauthUrl", 'paymentUrl', "paymentUrl", 'postserviceUrl', "postserviceUrl", 'oneApiUrl', "oneApiUrl",
         'sharedAccount', CASE WHEN "defaultMid" IS NULL THEN NULL
                               ELSE jsonb_build_object('mid', "defaultMid"::text, 'key', "defaultKey") END)),
       jsonb_strip_nulls(jsonb_build_object(
         'partnerClientSecret', "partnerClientSecretEnc",
         'sharedAccount.salt', "defaultSaltEnc")),
       "version", "updatedById", "createdAt", "updatedAt"
  FROM "PayuProviderConfig";

-- Organisation accounts: tag the provider. Existing rows are PayU.
ALTER TABLE "PayuCredential"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'payu',
  ADD COLUMN "extraEnc" TEXT,
  ADD CONSTRAINT "PayuCredential_provider_format" CHECK ("provider" ~ '^[a-z][a-z0-9_]{1,31}$');

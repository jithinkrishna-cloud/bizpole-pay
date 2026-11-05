-- Provider connections added from Super Admin (docs/PAYMENT_PROVIDER_CONFIG.md §0.1, approved 4 Nov 2026).
-- A connection is a named instance of a provider type (server/providers/<type>.js) with its own Test and Live
-- settings ("PaymentProvider" rows). Each mode has at most one active row. The existing settings become the
-- connection "PayU", the only one that falls back to the PAYU_* environment variables.
-- Rollback: down.sql in this folder (not run automatically).

CREATE TABLE "ProviderConnection" (
  "id"          TEXT PRIMARY KEY,
  "provider"    TEXT NOT NULL,
  "name"        VARCHAR(60) NOT NULL,
  "envFallback" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt"  TIMESTAMP(3),
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConnection_provider_format" CHECK ("provider" ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT "ProviderConnection_name_not_blank" CHECK (length(btrim("name")) >= 2)
);
-- Names are unique among connections in use (case-insensitive); archived names can be reused.
CREATE UNIQUE INDEX "ProviderConnection_name_active_key" ON "ProviderConnection"(lower("name")) WHERE "archivedAt" IS NULL;
-- At most one environment-fallback connection.
CREATE UNIQUE INDEX "ProviderConnection_one_env_fallback" ON "ProviderConnection"("envFallback") WHERE "envFallback";

INSERT INTO "ProviderConnection" ("id", "provider", "name", "envFallback", "updatedAt")
VALUES ('cpayu' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), 'payu', 'PayU', true, CURRENT_TIMESTAMP);

ALTER TABLE "PaymentProvider"
  ADD COLUMN "connectionId" TEXT REFERENCES "ProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
UPDATE "PaymentProvider" p SET "connectionId" = c."id"
  FROM "ProviderConnection" c WHERE c."envFallback" AND c."provider" = p."provider";
ALTER TABLE "PaymentProvider" ALTER COLUMN "connectionId" SET NOT NULL;

DROP INDEX "PaymentProvider_provider_mode_key";
CREATE UNIQUE INDEX "PaymentProvider_connectionId_mode_key" ON "PaymentProvider"("connectionId", "mode");
-- Unchanged: "PaymentProvider_one_active_per_mode" (one active row per mode).

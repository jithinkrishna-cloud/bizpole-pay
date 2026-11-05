# Payment provider configuration: schema and migration plan

Status: **approved 4 Nov 2026; implemented.** Migration 20261104000000 is applied to production. Migration
20261105000000 (provider-neutral settings, section 0) is approved and implemented but **not applied yet**.
Decisions (section 8): keep the shared test credential; keep env fallback; password re-entry for Live only; skip the optional data update.
Date: 4 Nov 2026

## 0. Stage 1: provider-neutral settings (supersedes the PayU-only table below)

Requested 4 Nov 2026: "not for PayU, don't hardcode; we may change the provider". Approved the same day.

- **Provider definitions** live in `server/providers/<id>.js` (today: `payu.js`), listed in `server/providers/index.js`.
  Each declares its name, settings groups and fields (text / secret / url, environment variable names, defaults per mode),
  allowed address hosts, the per-organisation account fields and validation, the shared test account, and a connection test.
  Adding a provider means adding one file; no UI or schema change.
- **Table `PaymentProvider`** (migration `20261105000000_payment_provider`): one row per (provider, mode) with
  `enabled`, `isActive` (partial unique index: one active provider per mode), `settings` jsonb (non-secret values) and
  `secretsEnc` jsonb (`{ field: AES-256-GCM ciphertext }`). The migration copies the `PayuProviderConfig` rows and leaves that
  table in place, unused, for the app version deployed before it; a later cleanup migration drops it.
  Address hosts are checked per provider in the app (`server/providers/config.js` `cleanUrl`), not by a database CHECK.
- **`PayuCredential`** gains `provider` (default `'payu'`) and `extraEnc`. The table and its PayU-named columns are renamed in stage 2.
- **Super Admin**: Integrations → **Provider settings** (Test / Live tabs, active provider per mode, groups and fields from the
  definition). Organisation → API integrations → **Provider accounts** (form fields from the active provider's definition).
  API: `/super/provider-settings[/:provider/:mode[/test]]`, `/super/orgs/:id/provider-accounts[/:credId/revoke]`.
- **Audit actions**: `platform.provider_config.updated | activated | tested`, `platform.provider_account.assigned | revoked`
  (meta includes `provider`). Older rows keep the `platform.payu_*` names.
- **Stage 2 (not started)**: checkout, refunds, payouts, links, subscriptions and webhooks call a common provider interface
  instead of PayU code directly; rename `PayuCredential` to a neutral name. To be designed once the second provider is chosen.

### 0.1 Provider connections added from Super Admin (approved 4 Nov 2026)

- **`ProviderConnection`** (migration `20261106000000_provider_connections`): a named instance of a provider type
  (`provider` = file in `server/providers/`). Super Admin → Provider settings → **Add provider** creates one; it can be
  renamed, and removed (archived) when it isn't active in either mode. Names are unique among non-archived connections.
- **`PaymentProvider`** rows now belong to a connection (`connectionId`, unique per mode); `isActive` still allows one
  active row per mode. Test and Live can use different connections and can be switched at any time (Live needs the password).
- The migration created the connection **"PayU"** with `envFallback = true` and attached the existing rows. Only that
  connection reads `PAYU_*` environment variables, and it is active in any mode where no connection was chosen explicitly.
- Organisation accounts stay per provider type, so switching between two connections of the same type needs no new accounts.
- API: `GET /super/provider-settings`, `POST /super/provider-connections`, `POST /super/provider-connections/:id/rename|archive`,
  `PUT /super/provider-connections/:id/:mode`, `POST /super/provider-connections/:id/:mode/test`.
- Audit: `platform.provider_connection.created | renamed | archived`, `platform.provider_config.updated | activated | tested`.

Deploy order: `npm run db:migrate` (applies 20261105000000 and 20261106000000), then deploy the app. Before the migration, the settings page
falls back to environment variables and saving returns "migration hasn't been applied".

## 1. Goal

- Platform-level PayU settings (partner OAuth client, API endpoints, optional shared test credential) are managed by Super Admin, separately for **Test** and **Live**, stored encrypted in the database instead of environment variables.
- Each organisation's PayU account (MID, key, salt per mode) is assigned and revoked by Super Admin.
- Merchant Admin → Developer → API keys becomes read-only.
- Every change is written to `AuditLog` and visible in Super Admin → Audit.

## 2. Exposed credentials (rotate)

Commit `215a0da` ("Update .env.example with PayU test credentials…") put real values in `.env.example`, and that commit is on `origin/main` (`github.com/jithinkrishna-cloud/bizpole-pay`). The file is now back to placeholders, but the values stay in git history.

| Variable | Exposed value starts with | Sensitivity | Action |
|---|---|---|---|
| `PAYU_PARTNER_CLIENT_SECRET` | `bc2c7836…` | **Critical.** With the client ID it can request partner OAuth tokens (merchant onboarding, payment links, payouts, depending on granted scopes). | Rotate with PayU now. Check PayU partner logs for token requests you don't recognise. |
| `PAYU_PARTNER_CLIENT_ID` | `5a908165…` | Identifier; only harmful together with the secret. | Rotate if PayU issues the ID and secret as a pair. |
| `PAYU_TEST_SALT` | `pwPgOBIR…` | **High (test mode only).** With the key, anyone can sign or forge request and response hashes for this test MID. | Regenerate the salt in the PayU test dashboard. |
| `PAYU_TEST_KEY` / `PAYU_TEST_MID` | `Jk5eOy` / `87968903` | Identifiers; not secret on their own. | No action beyond the salt rotation. |

After rotating:
1. Put the new values in Vercel → Project → Environment Variables (and your local `.env`), never in `.env.example`.
2. If any organisation already received the old test credential (auto-provisioned at signup with label "Test MID"), its stored salt must be replaced as well. Super Admin can do this with the new "Replace credential" action (section 5).
3. Optional: if the repository is or was public, rewrite history (`git filter-repo`) and force-push. Rotation is what actually removes the risk; a history rewrite only reduces exposure.

`DATA_ENCRYPTION_KEY` and database URLs were placeholders and were not exposed.

## 3. Schema changes

All changes are **additive**. Nothing is renamed or dropped, and existing rows keep working unchanged.

### 3.1 New table: `PayuProviderConfig` (one row per mode)

```prisma
model PayuProviderConfig {
  id                     String        @id @default(cuid())
  mode                   Mode          @unique
  enabled                Boolean       @default(false)   // kill switch; LIVE stays off until set
  partnerClientId        String?
  partnerClientSecretEnc String?                           // AES-256-GCM via server/secrets.js, never returned
  oauthUrl               String?                           // null = built-in default for the mode
  paymentUrl             String?
  postserviceUrl         String?
  oneApiUrl              String?                           // payment links / onboarding API host
  defaultMid             Int?                              // optional shared test credential (TEST only)
  defaultKey             String?
  defaultSaltEnc         String?
  defaultSaltVersion     SaltVersion?
  version                Int           @default(1)        // optimistic concurrency for edits
  updatedById            String?
  updatedBy              User?         @relation("PayuConfigUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt
}
```

### 3.2 Changes to `PayuCredential`

```prisma
enum CredentialSource {
  MERCHANT    // entered by the merchant in Developer (all existing rows)
  PLATFORM    // assigned by Super Admin, or the shared test credential
  ONBOARDING  // issued by PayU partner onboarding (future)
}

model PayuCredential {
  // ...existing fields unchanged...
  source       CredentialSource @default(MERCHANT)
  createdById  String?          // Super Admin who assigned it; null for older rows
  revokedById  String?
}
```

`User` gets the matching back-relations (`payuConfigsUpdated`, `payuCredentialsCreated`, `payuCredentialsRevoked`). There are no column changes on `User`.

### 3.3 Audit

No schema change. `AuditLog` already has `merchantId` (nullable), `userId`, `mode`, `action`, `entity`, `entityId` and `meta`, and Super Admin → Audit already lists it. New actions:

| Action | merchantId | Meta (never contains secrets) |
|---|---|---|
| `platform.payu_config.updated` | null | changed field names, `enabled` before/after, `secretChanged: true/false` |
| `platform.payu_config.tested` | null | result (`ok` / error code), no token |
| `platform.payu_credential.assigned` | org | `payuMid`, masked key (`Jk…Oy`), `saltVersion`, `replacedCredentialId` |
| `platform.payu_credential.revoked` | org | `payuMid`, masked key, reason |
| `developer.credential_write_blocked` | org | attempted mode (records old clients still calling the removed endpoint) |

## 4. Migration `20261104000000_payu_provider_config`

```sql
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
  "updatedById"            TEXT REFERENCES "User"("id") ON DELETE SET NULL,
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
  -- endpoint overrides may only point at PayU hosts over HTTPS (stops credentials being sent elsewhere)
  CONSTRAINT "PayuProviderConfig_payu_hosts" CHECK (
        ("oauthUrl"       IS NULL OR "oauthUrl"       ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
    AND ("paymentUrl"     IS NULL OR "paymentUrl"     ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
    AND ("postserviceUrl" IS NULL OR "postserviceUrl" ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
    AND ("oneApiUrl"      IS NULL OR "oneApiUrl"      ~ '^https://([a-z0-9-]+\.)*(payu\.in|payumoney\.com)(/|$)')
  )
);

ALTER TABLE "PayuCredential"
  ADD COLUMN "source"      "CredentialSource" NOT NULL DEFAULT 'MERCHANT',
  ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  ADD COLUMN "revokedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
```

Properties:
- No rows are inserted or updated by the migration. `PayuProviderConfig` rows are created on the first Super Admin save (upsert by `mode`).
- `ADD COLUMN … DEFAULT 'MERCHANT'` is a metadata-only change in Postgres 11+, so there's no table rewrite or long lock.
- The existing partial unique index (one ACTIVE default per merchant and mode) still applies, so Super Admin assignments can't create two defaults.

Rollback (`down.sql`, kept next to the migration, not run automatically):

```sql
ALTER TABLE "PayuCredential" DROP COLUMN "revokedById", DROP COLUMN "createdById", DROP COLUMN "source";
DROP TABLE "PayuProviderConfig";
DROP TYPE "CredentialSource";
```

### 4.1 Rollout order

1. Review and approve this document.
2. Create a Neon branch from production and run `prisma migrate deploy` against the **branch** only.
3. Deploy the app to a Vercel preview pointing at the branch; run the Test/Live checks in section 7.
4. Apply the migration to production (`prisma migrate deploy`), then promote the deployment.
5. In Super Admin, enter the **rotated** partner credentials and endpoints for Test, then Live. Turn Live on last.
6. After a successful week on database config, remove the `PAYU_*` credential variables from Vercel (endpoints can stay as fallbacks).

### 4.2 Optional data update (needs separate approval)

Mark existing auto-provisioned rows as platform-owned so Super Admin shows where they came from:

```sql
UPDATE "PayuCredential" SET "source" = 'PLATFORM' WHERE "label" = 'Test MID' AND "mode" = 'TEST';
```

This is cosmetic and can be skipped. It would only run after you approve it.

## 5. Application changes (after approval)

### 5.1 Credential resolution (`server/payu.js`)

- `providerConfig(mode)`: the DB row (secrets decrypted only inside the server), else environment variables (transition fallback), else built-in endpoint defaults. Cached in memory for 60 seconds and cleared on save.
- `requireCredential(merchantId, mode)`: unchanged lookup of the org's default ACTIVE `PayuCredential`. It also refuses LIVE when the Live config is not `enabled`. Error messages tell merchants to contact Bizpole support instead of pointing at Developer.
- `provisionTestCredential`: uses the TEST config's shared default credential if one is set, else the environment variables. Marked `source = 'PLATFORM'`.

### 5.2 Super Admin API (all `platform: true`, SUPER_ADMIN only)

| Method | Path | Notes |
|---|---|---|
| GET | `/super/payu/config` | Both modes. Secrets returned only as `{ set: true, last4 }`. |
| PUT | `/super/payu/config/:mode` | Partial update. Secrets are write-only (blank = keep). Requires `version` (409 on conflict). LIVE changes require the admin's password again. |
| POST | `/super/payu/config/:mode/test` | Requests an OAuth token with the saved credentials and reports success or the PayU error. Doesn't store the token. |
| GET | `/super/orgs/:id/payu-accounts` | Existing list plus `source` and who created it. |
| POST | `/super/orgs/:id/payu-accounts` | Assign or replace `{ mode, mid, key, salt, label }`. Same validation as today's merchant form. The previous default stays in history as non-default (or revoked if requested). LIVE requires the password again. |
| POST | `/super/orgs/:id/payu-accounts/:credId/revoke` | Sets `REVOKED`, `revokedAt`, `revokedById`. |

### 5.3 Super Admin UI

- **Integrations → PayU** with **Test | Live** tabs: enabled switch, partner client ID, secret (write-only field with "Replace"), endpoint overrides with defaults shown, shared test credential (Test tab only), "Test connection" button, last updated by and when. Fields use `autocomplete="off"` / `new-password` so browsers don't autofill account emails into key fields (the bug visible in the current merchant form).
- **Organisations → org → PayU accounts**: Test and Live sections, assign or replace, revoke, history.

### 5.4 Merchant Admin

- Developer → API keys shows MID, masked key, salt version, status and "Managed by Bizpole. Contact support to change." The form and "Replace test credentials" button are removed.
- `POST /developer/credentials` returns **403** with that message and writes `developer.credential_write_blocked` to the audit log.

## 6. Security notes

- Secrets are encrypted with the existing `DATA_ENCRYPTION_KEY` (AES-256-GCM). They are decrypted only in server memory and are never sent to any browser, log or audit entry.
- Endpoint overrides are limited to PayU hosts in both the API validation and a database constraint.
- LIVE writes require the admin's password again. All writes are audited with IP.
- Optimistic `version` prevents two admins silently overwriting each other.

## 7. Test plan (step 6)

- Unit tests: config resolution order (DB, env, default); validation (MID, key, salt, URL host allowlist); secrets never present in any API response or audit `meta`.
- Integration tests (Neon branch): save and read config per mode, version conflict, Live password check, assign/replace/revoke org credentials, partial unique index holds, merchant POST returns 403, audit rows written for every action.
- Manual: Test tab "Test connection" against `uatoneapi` / test OAuth; a test payment from a merchant using a Super Admin-assigned credential; Live left disabled, then a merchant Live action gives the expected error.

## 8. Decisions needed from you

1. **Shared test credential.** PayU keys are unique, so the shared test credential can only be auto-assigned to one organisation (today's behaviour). Keep it, or drop auto-provisioning and have Super Admin assign test accounts to every organisation?
2. **Environment fallback.** Keep `PAYU_*` env vars as a fallback during the transition (recommended), or switch to database-only from day one?
3. **Password re-entry.** Require it for Live changes only (proposed), or for Test as well?
4. **Optional data update** in section 4.2: run it or skip it?

-- Paynest v2: invariants Prisma cannot express.
-- Apply as a follow-up migration right after `init`:
--   npx prisma migrate dev --create-only --name constraints   # then paste this file into migration.sql

-- ── Money is never negative where the sign has no meaning ──
ALTER TABLE "Order"          ADD CONSTRAINT order_amount_pos       CHECK ("amountPaise" > 0);
ALTER TABLE "Transaction"    ADD CONSTRAINT txn_amount_pos         CHECK ("amountPaise" > 0);
ALTER TABLE "Refund"         ADD CONSTRAINT refund_amount_pos      CHECK ("amountPaise" > 0);
ALTER TABLE "Chargeback"     ADD CONSTRAINT cb_amount_pos          CHECK ("amountPaise" > 0);
ALTER TABLE "Payout"         ADD CONSTRAINT payout_amount_pos      CHECK ("amountPaise" > 0);
ALTER TABLE "SplitAllocation" ADD CONSTRAINT split_amount_pos      CHECK ("amountPaise" > 0);
ALTER TABLE "Mandate"        ADD CONSTRAINT mandate_amount_pos     CHECK ("maxAmountPaise" > 0);
ALTER TABLE "Mandate"        ADD CONSTRAINT mandate_dates          CHECK ("endDate" >= "startDate");
ALTER TABLE "Order"          ADD CONSTRAINT order_currency_inr     CHECK ("currency" = 'INR');
ALTER TABLE "PaymentLink"    ADD CONSTRAINT link_amount_mode       CHECK ("isAmountFilledByCustomer" OR "amountPaise" > 0);

-- ── Exactly one default credential / primary bank account ──
CREATE UNIQUE INDEX payu_credential_one_default
  ON "PayuCredential" ("merchantId", "mode") WHERE "isDefault" AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX bank_account_one_primary
  ON "BankAccount" ("merchantId") WHERE "isPrimary" AND "retiredAt" IS NULL;

-- ── Refunds can never exceed the captured amount ──
CREATE OR REPLACE FUNCTION refund_within_captured() RETURNS trigger AS $$
DECLARE captured BIGINT; refunded BIGINT;
BEGIN
  SELECT "amountPaise" INTO captured FROM "Transaction" WHERE id = NEW."transactionId" FOR UPDATE;
  SELECT COALESCE(SUM("amountPaise"), 0) INTO refunded FROM "Refund"
   WHERE "transactionId" = NEW."transactionId" AND status <> 'FAILED' AND id <> NEW.id;
  IF refunded + NEW."amountPaise" > captured THEN
    RAISE EXCEPTION 'refund % exceeds refundable amount on transaction %', NEW.id, NEW."transactionId";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER refund_within_captured
  BEFORE INSERT OR UPDATE OF "amountPaise", status ON "Refund"
  FOR EACH ROW EXECUTE FUNCTION refund_within_captured();

-- ── Ledger: append-only, every journal balances to zero ──
CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'LedgerEntry is append-only; post a reversing journal instead'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

CREATE OR REPLACE FUNCTION ledger_journal_balanced() RETURNS trigger AS $$
DECLARE total BIGINT;
BEGIN
  SELECT SUM("amountPaise") INTO total FROM "LedgerEntry" WHERE "journalId" = NEW."journalId";
  IF total <> 0 THEN RAISE EXCEPTION 'journal % does not balance (%)', NEW."journalId", total; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
-- Deferred: checked at COMMIT, after all lines of the journal are inserted.
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();

-- ── Status history is append-only too ──
CREATE TRIGGER txn_event_no_update BEFORE UPDATE OR DELETE ON "TransactionEvent"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- ── Optional hardening: row-level security per merchant (enable once the app sets app.merchant_id) ──
-- ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY merchant_isolation ON "Transaction"
--   USING ("merchantId" = current_setting('app.merchant_id', true));

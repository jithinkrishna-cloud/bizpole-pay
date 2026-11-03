-- Checkout logo stored inline as a data: URL until object storage is configured.
ALTER TABLE "CheckoutTheme" ADD COLUMN "logoData" TEXT;
ALTER TABLE "CheckoutTheme" ADD CONSTRAINT checkout_logo_data CHECK ("logoData" IS NULL OR ("logoData" ~ '^data:image/(png|jpeg|webp);base64,' AND length("logoData") <= 409600));

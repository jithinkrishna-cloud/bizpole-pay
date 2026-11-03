-- Super Admin is a platform role, not a merchant membership. Existing users stay null.
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN');

ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole";

CREATE INDEX "User_platformRole_idx" ON "User" ("platformRole") WHERE "platformRole" IS NOT NULL;

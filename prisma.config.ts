import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Local secrets live in .env.local (written by `neon env pull`); .env is a fallback.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations need the direct (non-pooled) endpoint; the app uses the pooled DATABASE_URL.
  datasource: { url: env("DATABASE_URL_UNPOOLED") },
});

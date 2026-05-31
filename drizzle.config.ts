import { defineConfig } from "drizzle-kit";
import "./env.config";

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  strict: true,
  verbose: true,
});

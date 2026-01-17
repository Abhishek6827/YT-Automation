// Prisma 7 config for Vercel deployment
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use pooling URL for queries (Vercel Postgres)
    url: process.env["POSTGRES_PRISMA_URL"] || process.env["DATABASE_URL"],
  },
});

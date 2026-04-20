#!/usr/bin/env tsx
/**
 * Seed a test workspace with a known API key for widget smoke testing.
 * Requires DATABASE_URL to be set.
 *
 * Usage: DATABASE_URL=postgres://... tsx scripts/seed.ts
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { workspaces } from "../packages/api/src/db/schema.js";

const TEST_WORKSPACE = {
  name: "DaChat Smoke Test",
  apiKey: "dachat_test_key_smoke_abc123",
};

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema: { workspaces } });

  console.log("Seeding test workspace...");
  const [ws] = await db
    .insert(workspaces)
    .values(TEST_WORKSPACE)
    .onConflictDoNothing()
    .returning();

  if (ws) {
    console.log(`Created workspace: ${ws.id} (api_key: ${ws.apiKey})`);
  } else {
    console.log("Workspace with that api_key already exists — skipped.");
  }

  await pool.end();
  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

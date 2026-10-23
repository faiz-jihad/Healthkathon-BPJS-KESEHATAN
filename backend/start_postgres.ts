import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const dbDir = path.resolve("./.postgres-data");
  const isInitialized = fs.existsSync(path.join(dbDir, "PG_VERSION"));

  console.log(`[PostgreSQL Service] Initializing live embedded PostgreSQL at: ${dbDir}`);

  const pg = new EmbeddedPostgres({
    databaseDir: dbDir,
    port: 5432,
    user: "aura_user",
    password: "aura_password",
    authMethod: "password",
    persistent: true,
  });

  if (!isInitialized) {
    console.log("[PostgreSQL Service] Creating cluster with initdb...");
    await pg.initialise();
  }

  console.log("[PostgreSQL Service] Starting PostgreSQL server daemon on port 5432...");
  await pg.start();
  console.log("[PostgreSQL Service] PostgreSQL active and listening on localhost:5432!");

  try {
    await pg.createDatabase("aura_jkn_db");
    console.log("[PostgreSQL Service] Database 'aura_jkn_db' ready!");
  } catch (err: any) {
    if (err?.message?.includes("already exists")) {
      console.log("[PostgreSQL Service] Database 'aura_jkn_db' already exists.");
    } else {
      console.log("[PostgreSQL Service] Database initialization note:", err?.message);
    }
  }

  console.log("\n>>> LIVE POSTGRESQL RUNNING on postgresql://aura_user:aura_password@localhost:5432/aura_jkn_db <<<\n");

  // Keep process alive as background service
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[PostgreSQL Service Fatal Error]", err);
  process.exit(1);
});

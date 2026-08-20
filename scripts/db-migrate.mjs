import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const connectionString = process.env.OFFICE_DIRECT_DATABASE_URL;
if (!connectionString) {
  throw new Error("OFFICE_DIRECT_DATABASE_URL is required for migrations.");
}

const migrationsDirectory = join(import.meta.dirname, "..", "db", "migrations");
const migrations = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migration (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`,
  );

  for (const migration of migrations) {
    const applied = await client.query(
      "SELECT 1 FROM schema_migration WHERE version = $1",
      [migration],
    );
    if (applied.rowCount) continue;

    const sql = await readFile(join(migrationsDirectory, migration), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migration (version) VALUES ($1)", [
        migration,
      ]);
      await client.query("COMMIT");
      console.log(`Applied migration ${migration}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

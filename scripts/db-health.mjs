import pg from "pg";

if (!process.env.OFFICE_DATABASE_URL) {
  throw new Error(
    "OFFICE_DATABASE_URL is required for the database health check.",
  );
}

const client = new pg.Client({
  connectionString: process.env.OFFICE_DATABASE_URL,
});

try {
  await client.connect();
  await client.query("SELECT 1");
  console.log("Neon database health check passed.");
} finally {
  await client.end().catch(() => undefined);
}

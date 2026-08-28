import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "../modules/auth/password.js";

const required = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};

const connectionString = required("OFFICE_DIRECT_DATABASE_URL");
const email = required("ADMIN_EMAIL").toLocaleLowerCase("en-US");
const password = required("ADMIN_PASSWORD");
const name = process.env.ADMIN_NAME?.trim() || "Admin Master";

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  const existing = await client.query<{ email: string }>(
    "SELECT email FROM app_user WHERE role = 'admin_master' LIMIT 1",
  );
  const current = existing.rows[0];
  if (current) {
    if (current.email.toLocaleLowerCase("en-US") === email) {
      console.log("Admin Master already exists.");
    } else {
      throw new Error(
        "An Admin Master already exists; refusing to replace it.",
      );
    }
  } else {
    await client.query(
      `INSERT INTO app_user (
        id, name, email, role, active, password_hash, password_changed_at, session_version
      ) VALUES ($1, $2, $3, 'admin_master', true, $4, now(), 1)`,
      [randomUUID(), name, email, await hashPassword(password)],
    );
    console.log("Admin Master bootstrap completed.");
  }
} finally {
  await client.end().catch(() => undefined);
}

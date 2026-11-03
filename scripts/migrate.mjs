import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

function requireEnvironment(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to run database migrations.`);
  }

  return value;
}

const port = Number.parseInt(process.env.PGPORT ?? "5432", 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PGPORT must be a valid TCP port.");
}

const client = postgres({
  host: requireEnvironment("PGHOST"),
  port,
  database: requireEnvironment("PGDATABASE"),
  username: requireEnvironment("PGUSER"),
  password: requireEnvironment("PGPASSWORD"),
  max: 1,
});

try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("Database migrations completed.");
} finally {
  await client.end();
}

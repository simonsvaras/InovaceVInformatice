import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

let sqlClient: Sql | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;

function requireEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function getDatabase(): PostgresJsDatabase<typeof schema> {
  if (database) {
    return database;
  }

  const port = Number.parseInt(process.env.PGPORT ?? "5432", 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PGPORT must be a valid TCP port.");
  }

  sqlClient = postgres({
    host: requireEnvironment("PGHOST"),
    port,
    database: requireEnvironment("PGDATABASE"),
    username: requireEnvironment("PGUSER"),
    password: requireEnvironment("PGPASSWORD"),
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  database = drizzle(sqlClient, { schema });

  return database;
}

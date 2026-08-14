import postgres from "postgres";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

// Server-only PostgreSQL client. Imported by route loaders/server functions; never from client components.
const sql = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 20,
  ssl: false,
});

export default sql;

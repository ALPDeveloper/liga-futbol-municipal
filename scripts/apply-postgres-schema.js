import fs from "node:fs";
import path from "node:path";
import "../server/env.js";
import { postgresPool } from "../server/postgresDatabase.js";
import { ROOT_DIR } from "../server/env.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no esta configurado.");
  process.exit(1);
}

const schemaPath = path.join(ROOT_DIR, "supabase", "schema.sql");
if (!fs.existsSync(schemaPath)) {
  console.error(`No se encontro el esquema: ${schemaPath}`);
  process.exit(1);
}

const schemaSql = fs.readFileSync(schemaPath, "utf8");

try {
  await postgresPool.query(schemaSql);
  console.log("Esquema Postgres/Supabase aplicado correctamente.");
} finally {
  await postgresPool.end();
}

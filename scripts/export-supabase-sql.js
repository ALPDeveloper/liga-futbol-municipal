import fs from "node:fs";
import path from "node:path";
import "../server/env.js";
import { DB_PATH, db } from "../server/database.js";
import { initializePostgresDatabase, postgresPool } from "../server/postgresDatabase.js";
import { ROOT_DIR } from "../server/env.js";

const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER === "postgres" ? "postgres" : "sqlite";

const TABLES = [
  "leagues",
  "competitions",
  "league_identities",
  "league_rules",
  "league_highlights",
  "league_announcements",
  "teams",
  "players",
  "matches",
  "match_events",
  "player_sanctions",
  "player_injuries",
  "team_affiliations",
  "discipline_links",
  "discipline_adjustments",
  "discipline_resets",
  "users",
  "memberships",
  "sponsors",
  "audit_logs",
  "password_reset_requests"
];

const BOOLEAN_COLUMNS = new Set(["needs_surgery", "needs_support"]);
const DATE_COLUMNS = new Set([
  "renewal_date",
  "starts_at",
  "ends_at",
  "date",
  "expected_return",
  "locked_until",
  "last_failed_login_at",
  "created_at",
  "expires_at",
  "used_at"
]);
const IDENTITY_TABLES = [
  { table: "league_highlights", sequence: "league_highlights_id_seq" },
  { table: "match_events", sequence: "match_events_id_seq" },
  { table: "audit_logs", sequence: "audit_logs_id_seq" }
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sqlIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlValue(column, value) {
  if (value === null || value === undefined) return "NULL";
  if (DATE_COLUMNS.has(column) && String(value).trim() === "") return "NULL";
  if (BOOLEAN_COLUMNS.has(column)) return Number(value) ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (value instanceof Date) return `'${value.toISOString().replaceAll("'", "''")}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function selectRows(table) {
  if (DATABASE_PROVIDER === "postgres") {
    const result = await postgresPool.query(`SELECT * FROM ${sqlIdentifier(table)}`);
    return result.rows;
  }

  return db.prepare(`SELECT * FROM ${sqlIdentifier(table)}`).all();
}

async function insertStatements(table) {
  const rows = await selectRows(table);
  if (!rows.length) return [`-- ${table}: sin registros`];

  return rows.map((row) => {
    const columns = Object.keys(row);
    const columnSql = columns.map(sqlIdentifier).join(", ");
    const valueSql = columns.map((column) => sqlValue(column, row[column])).join(", ");
    return `INSERT INTO ${sqlIdentifier(table)} (${columnSql}) VALUES (${valueSql});`;
  });
}

async function sequenceResetStatement({ table, sequence }) {
  const row = DATABASE_PROVIDER === "postgres"
    ? (await postgresPool.query(`SELECT MAX(id) AS "maxId" FROM ${sqlIdentifier(table)}`)).rows[0]
    : db.prepare(`SELECT MAX(id) AS maxId FROM ${sqlIdentifier(table)}`).get();
  const maxId = Number(row?.maxId || 0);
  if (!maxId) return null;
  return `SELECT setval('${sequence}', ${maxId}, TRUE);`;
}

if (DATABASE_PROVIDER === "postgres") {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no esta configurado.");
    process.exit(1);
  }
  await initializePostgresDatabase();
}

const configuredBackupDir = process.env.BACKUP_DIR || "backups";
const outputDir = path.isAbsolute(configuredBackupDir)
  ? configuredBackupDir
  : path.join(ROOT_DIR, configuredBackupDir);
const outputPath = path.join(outputDir, `supabase-seed-${timestamp()}.sql`);

fs.mkdirSync(outputDir, { recursive: true });

const lines = [
  `-- Seed generado desde ${DATABASE_PROVIDER} para Supabase/Postgres.`,
  `-- Origen: ${DATABASE_PROVIDER === "postgres" ? "DATABASE_URL configurada" : DB_PATH}`,
  `-- Fecha: ${new Date().toISOString()}`,
  "-- Contiene usuarios y hashes de contraseña. Tratar como archivo sensible.",
  "",
  "BEGIN;",
  "SET CONSTRAINTS ALL DEFERRED;",
  "",
  ...[...TABLES].reverse().map((table) => `DELETE FROM ${sqlIdentifier(table)};`),
  ""
];

for (const table of TABLES) {
  lines.push(`-- ${table}`);
  lines.push(...await insertStatements(table));
  lines.push("");
}

for (const item of IDENTITY_TABLES) {
  const statement = await sequenceResetStatement(item);
  if (statement) lines.push(statement);
}

lines.push("", "COMMIT;", "");

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");

console.log(`SQL Supabase generado: ${outputPath}`);
console.log("Este archivo contiene usuarios y hashes de contraseña. No lo compartas publicamente.");

await postgresPool?.end();

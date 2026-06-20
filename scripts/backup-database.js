import "../server/env.js";
import fs from "node:fs";
import path from "node:path";
import { db, DB_PATH } from "../server/database.js";
import { DATABASE_LABEL, DATABASE_PROVIDER, getStoreData, initializeData } from "../server/dataLayer.js";
import { ROOT_DIR } from "../server/env.js";
import { postgresPool } from "../server/postgresDatabase.js";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const configuredBackupDir = process.env.BACKUP_DIR || "backups";
const backupDir = path.isAbsolute(configuredBackupDir)
  ? configuredBackupDir
  : path.join(ROOT_DIR, configuredBackupDir);
const backupPath = path.join(backupDir, `liga-futbol-${timestamp()}.sqlite`);
const backupStorageBucket = String(process.env.BACKUP_STORAGE_BUCKET || "").trim();
const backupTimeoutMs = Math.max(
  30_000,
  Number(process.env.BACKUP_TIMEOUT_MS || 10 * 60 * 1000)
);
const backupTimeout = setTimeout(() => {
  console.error(`Backup cancelado: excedio ${Math.round(backupTimeoutMs / 1000)} segundos.`);
  process.exit(1);
}, backupTimeoutMs);

async function uploadBackupToSupabaseStorage(filePath) {
  if (!backupStorageBucket) return null;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios para subir backups.");
  }

  const baseUrl = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const filename = path.basename(filePath);
  const objectPath = `database/${new Date().toISOString().slice(0, 10)}/${filename}`;
  const endpoint = `${baseUrl}/storage/v1/object/${backupStorageBucket}/${objectPath}`;
  const fileBuffer = fs.readFileSync(filePath);
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=0, no-store",
      "x-upsert": "false"
    },
    body: fileBuffer
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo subir el backup a Supabase Storage. ${detail}`.trim());
  }

  return objectPath;
}

fs.mkdirSync(backupDir, { recursive: true });

if (DATABASE_PROVIDER === "postgres") {
  await initializeData();
  const store = await getStoreData();
  const jsonPath = path.join(backupDir, `postgres-store-backup-${timestamp()}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  const uploadedPath = await uploadBackupToSupabaseStorage(jsonPath);
  console.log(`Respaldo logico creado: ${jsonPath}`);
  if (uploadedPath) {
    console.log(`Respaldo subido a Supabase Storage: ${backupStorageBucket}/${uploadedPath}`);
  }
  console.log(`Base origen: ${DATABASE_LABEL}`);
  console.log("Nota: este respaldo contiene datos operativos de ligas, equipos, jugadores y partidos. Para respaldo fisico completo de Supabase/Postgres usa tambien el backup del proveedor.");
  await postgresPool?.end();
  clearTimeout(backupTimeout);
  process.exit(0);
}

await db.backup(backupPath);
clearTimeout(backupTimeout);

console.log(`Respaldo creado: ${backupPath}`);
console.log(`Base origen: ${DB_PATH}`);

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

fs.mkdirSync(backupDir, { recursive: true });

if (DATABASE_PROVIDER === "postgres") {
  await initializeData();
  const store = await getStoreData();
  const jsonPath = path.join(backupDir, `postgres-store-backup-${timestamp()}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  console.log(`Respaldo logico creado: ${jsonPath}`);
  console.log(`Base origen: ${DATABASE_LABEL}`);
  console.log("Nota: este respaldo contiene datos operativos de ligas, equipos, jugadores y partidos. Para respaldo fisico completo de Supabase/Postgres usa tambien el backup del proveedor.");
  await postgresPool?.end();
  process.exit(0);
}

await db.backup(backupPath);

console.log(`Respaldo creado: ${backupPath}`);
console.log(`Base origen: ${DB_PATH}`);

import "../server/env.js";
import fs from "node:fs";
import path from "node:path";
import { db, DB_PATH } from "../server/database.js";
import { ROOT_DIR } from "../server/env.js";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const configuredBackupDir = process.env.BACKUP_DIR || "backups";
const backupDir = path.isAbsolute(configuredBackupDir)
  ? configuredBackupDir
  : path.join(ROOT_DIR, configuredBackupDir);
const backupPath = path.join(backupDir, `liga-futbol-${timestamp()}.sqlite`);

fs.mkdirSync(backupDir, { recursive: true });

await db.backup(backupPath);

console.log(`Respaldo creado: ${backupPath}`);
console.log(`Base origen: ${DB_PATH}`);

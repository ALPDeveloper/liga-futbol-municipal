import fs from "node:fs";
import path from "node:path";
import { getStore, initializeDatabase } from "../server/database.js";
import { ROOT_DIR } from "../server/env.js";

initializeDatabase();

const BACKUP_DIR = process.env.BACKUP_DIR || "backups";
const targetDir = path.isAbsolute(BACKUP_DIR) ? BACKUP_DIR : path.join(ROOT_DIR, BACKUP_DIR);
fs.mkdirSync(targetDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filePath = path.join(targetDir, `store-export-${timestamp}.json`);

fs.writeFileSync(filePath, `${JSON.stringify(getStore(), null, 2)}\n`, "utf8");

console.log(`Export generado: ${filePath}`);

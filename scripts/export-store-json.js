import fs from "node:fs";
import path from "node:path";
import { DATABASE_LABEL, getStoreData, initializeData } from "../server/dataLayer.js";
import { ROOT_DIR } from "../server/env.js";
import { postgresPool } from "../server/postgresDatabase.js";

await initializeData();

const BACKUP_DIR = process.env.BACKUP_DIR || "backups";
const targetDir = path.isAbsolute(BACKUP_DIR) ? BACKUP_DIR : path.join(ROOT_DIR, BACKUP_DIR);
fs.mkdirSync(targetDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filePath = path.join(targetDir, `store-export-${timestamp}.json`);

const store = await getStoreData();
fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

console.log(`Export generado: ${filePath}`);
console.log(`Origen: ${DATABASE_LABEL}`);

await postgresPool?.end();

import fs from "node:fs";
import path from "node:path";
import "../server/env.js";
import { DB_PATH, db, getStore, importStore, initializeDatabase } from "../server/database.js";

const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error("Uso: npm run restore:local-sqlite -- backups/postgres-store-backup-FECHA.json");
  process.exit(1);
}

const resolvedSource = path.resolve(sourcePath);
if (!fs.existsSync(resolvedSource)) {
  console.error(`No existe el archivo: ${resolvedSource}`);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(resolvedSource, "utf8"));
initializeDatabase();
importStore(store);
const restored = getStore();

console.log(`Base local restaurada: ${DB_PATH}`);
console.log(`Origen: ${resolvedSource}`);
console.log(`Ligas: ${restored.leagues.length}`);
console.log(`Equipos: ${restored.leagues.reduce((total, league) => total + league.teams.length, 0)}`);
console.log(`Jugadores: ${restored.leagues.reduce((total, league) => total + league.players.length, 0)}`);
console.log(`Partidos: ${restored.leagues.reduce((total, league) => total + league.matches.length, 0)}`);

db.close();

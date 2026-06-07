import fs from "node:fs";
import "../server/env.js";
import { importPostgresStore, postgresPool } from "../server/postgresDatabase.js";

const filePath = process.argv[2];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no esta configurado.");
  process.exit(1);
}

if (!filePath) {
  console.error("Uso: npm run import:postgres -- backups/store-export-FECHA.json");
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
const imported = await importPostgresStore(store);

console.log(`Import Postgres OK. Ligas importadas: ${imported.leagues.length}`);
for (const league of imported.leagues) {
  console.log(`- ${league.name}: ${league.teams.length} equipos, ${league.players.length} jugadores, ${league.matches.length} partidos`);
}

await postgresPool.end();

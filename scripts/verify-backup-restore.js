import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Uso: npm run verify:backup -- backups/postgres-store-backup-FECHA.json");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`No existe el archivo: ${filePath}`);
  process.exit(1);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligatec-restore-"));
const tempDbPath = path.join(tempDir, "restore-check.sqlite");

const script = `
  import fs from "node:fs";
  import { initializeDatabase, importStore, getStore, db } from "./server/database.js";
  const source = ${JSON.stringify(path.resolve(filePath))};
  const store = JSON.parse(fs.readFileSync(source, "utf8"));
  initializeDatabase();
  const restored = importStore(store);
  const readBack = getStore();
  const summary = {
    leagues: readBack.leagues.length,
    teams: readBack.leagues.reduce((total, league) => total + league.teams.length, 0),
    players: readBack.leagues.reduce((total, league) => total + league.players.length, 0),
    matches: readBack.leagues.reduce((total, league) => total + league.matches.length, 0)
  };
  if (!summary.leagues) throw new Error("El respaldo no contiene ligas restaurables.");
  console.log(JSON.stringify({ restoredLeagues: restored.leagues.length, ...summary }));
  db.close();
`;

const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
  cwd: path.resolve("."),
  env: {
    ...process.env,
    DATABASE_PROVIDER: "sqlite",
    DB_PATH: tempDbPath,
    SEED_DEMO_USERS: "false"
  },
  encoding: "utf8"
});

fs.rmSync(tempDir, { recursive: true, force: true });

if (result.status !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

const summary = JSON.parse(result.stdout.trim());
console.log("Verificacion de restauracion OK");
console.log(`- Archivo: ${filePath}`);
console.log(`- Ligas: ${summary.leagues}`);
console.log(`- Equipos: ${summary.teams}`);
console.log(`- Jugadores: ${summary.players}`);
console.log(`- Partidos: ${summary.matches}`);

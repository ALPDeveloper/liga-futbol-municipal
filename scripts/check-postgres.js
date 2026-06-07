import "../server/env.js";
import { getPostgresStore, initializePostgresDatabase, postgresPool } from "../server/postgresDatabase.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no esta configurado.");
  process.exit(1);
}

await initializePostgresDatabase();
const store = await getPostgresStore();

console.log(`Conexion Postgres OK. Ligas: ${store.leagues.length}`);
for (const league of store.leagues) {
  console.log(`- ${league.name}: ${league.teams.length} equipos, ${league.players.length} jugadores, ${league.matches.length} partidos`);
}

await postgresPool.end();

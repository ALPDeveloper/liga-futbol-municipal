import "../server/env.js";
import { DATABASE_LABEL, DATABASE_PROVIDER, getStoreData, initializeData, listUsersData } from "../server/dataLayer.js";
import { postgresPool } from "../server/postgresDatabase.js";
import { runtimeConfig } from "../server/runtimeConfig.js";

const problems = [];
const warnings = [];

if (DATABASE_PROVIDER !== "postgres") {
  problems.push("DATABASE_PROVIDER debe ser postgres para capturar datos que viviran en produccion.");
}

if (DATABASE_PROVIDER === "postgres" && !process.env.DATABASE_URL) {
  problems.push("DATABASE_URL no esta configurada.");
}

if (process.env.SEED_DEMO_USERS !== "false") {
  warnings.push("SEED_DEMO_USERS no esta en false. Antes del lanzamiento final conviene desactivarlo y eliminar/deshabilitar usuarios demo.");
}

if (runtimeConfig.imageStorageProvider !== "supabase") {
  warnings.push("IMAGE_STORAGE_PROVIDER no esta en supabase. Las imagenes se guardaran localmente; para produccion usa Supabase Storage.");
}

if (runtimeConfig.imageStorageProvider === "supabase") {
  if (!runtimeConfig.supabaseUrl) problems.push("SUPABASE_URL no esta configurada.");
  if (!runtimeConfig.supabaseServiceRoleKey) problems.push("SUPABASE_SERVICE_ROLE_KEY no esta configurada.");
  if (!runtimeConfig.supabaseStorageBucket) problems.push("SUPABASE_STORAGE_BUCKET no esta configurado.");
}

await initializeData();

const store = await getStoreData();
const users = await listUsersData();
const activeSuperAdmins = users.filter((user) => user.role === "super_admin" && user.status === "active");
const demoUsers = users.filter((user) => /@ligafut\.local$|@demo\.com$/i.test(user.email));
const activeDemoUsers = demoUsers.filter((user) => user.status === "active");

if (!store.leagues.length) {
  problems.push("No hay ligas en la base activa.");
}

if (!activeSuperAdmins.length) {
  problems.push("No hay ningun super admin activo.");
}

if (activeDemoUsers.length) {
  warnings.push(`Hay ${activeDemoUsers.length} usuario(s) demo/local activo(s). Antes de produccion crea usuarios reales y deshabilita demos.`);
}

console.log("Revision para captura real");
console.log(`- Base activa: ${DATABASE_LABEL}`);
console.log(`- Proveedor: ${DATABASE_PROVIDER}`);
console.log(`- Storage imagenes: ${runtimeConfig.imageStorageProvider}`);
console.log(`- Bucket imagenes: ${runtimeConfig.imageStorageProvider === "supabase" ? runtimeConfig.supabaseStorageBucket : runtimeConfig.uploadDir}`);
console.log(`- Ligas: ${store.leagues.length}`);
for (const league of store.leagues) {
  console.log(`  - ${league.name}: ${league.teams.length} equipos, ${league.players.length} jugadores, ${league.matches.length} partidos`);
}
console.log(`- Super admins activos: ${activeSuperAdmins.length}`);

if (warnings.length) {
  console.log("\nAdvertencias:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (problems.length) {
  console.error("\nProblemas por resolver:");
  for (const problem of problems) console.error(`- ${problem}`);
  await postgresPool?.end();
  process.exit(1);
}

console.log("\nOK para capturar datos en la base activa.");
await postgresPool?.end();

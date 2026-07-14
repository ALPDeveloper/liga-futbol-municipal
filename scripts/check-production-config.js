import "../server/env.js";
import { runtimeConfig, validateRuntimeConfig } from "../server/runtimeConfig.js";

validateRuntimeConfig();

console.log("Configuracion de produccion OK");
console.log(`- API: ${runtimeConfig.host}:${runtimeConfig.port}`);
console.log(`- CORS: ${Array.isArray(runtimeConfig.corsOrigin) ? runtimeConfig.corsOrigin.join(", ") : runtimeConfig.corsOrigin}`);
console.log(`- Datos: ${runtimeConfig.databaseProvider}`);
console.log(`- Respaldos externos: ${runtimeConfig.backupStorageBucket ? "configurados" : "pendientes"}`);

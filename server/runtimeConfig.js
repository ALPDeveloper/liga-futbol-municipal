import "./env.js";

const DEFAULT_DEV_SECRET = "dev-local-secret-change-before-production";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function parseCorsOrigin() {
  const value = String(process.env.CORS_ORIGIN || "").trim();
  if (!value) return IS_PRODUCTION ? "" : true;
  if (value === "*") return "*";
  if (!value.includes(",")) return value;
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const runtimeConfig = {
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  port: Number(process.env.API_PORT || process.env.PORT || 3001),
  host: process.env.API_HOST || "127.0.0.1",
  corsOrigin: parseCorsOrigin(),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  showRecoveryCodeInResponse: parseBoolean(
    process.env.SHOW_RECOVERY_CODE_IN_RESPONSE,
    !IS_PRODUCTION
  ),
  tokenSecret: process.env.AUTH_SECRET || DEFAULT_DEV_SECRET,
  tokenTtlMs: 1000 * 60 * 60 * Number(process.env.TOKEN_TTL_HOURS || 8),
  databaseProvider: process.env.DATABASE_PROVIDER === "postgres" ? "postgres" : "sqlite",
  databaseUrl: process.env.DATABASE_URL || ""
};

export function validateRuntimeConfig() {
  if (!runtimeConfig.isProduction) return;

  const problems = [];
  if (!process.env.AUTH_SECRET || runtimeConfig.tokenSecret === DEFAULT_DEV_SECRET) {
    problems.push("AUTH_SECRET es obligatorio en produccion.");
  } else if (runtimeConfig.tokenSecret.length < 32) {
    problems.push("AUTH_SECRET debe tener al menos 32 caracteres en produccion.");
  }

  if (!runtimeConfig.corsOrigin || runtimeConfig.corsOrigin === "*") {
    problems.push("CORS_ORIGIN debe apuntar al dominio publico en produccion.");
  }

  if (runtimeConfig.showRecoveryCodeInResponse) {
    problems.push("SHOW_RECOVERY_CODE_IN_RESPONSE debe ser false en produccion.");
  }

  if (runtimeConfig.databaseProvider === "postgres" && !runtimeConfig.databaseUrl) {
    problems.push("DATABASE_URL es obligatorio cuando DATABASE_PROVIDER=postgres.");
  }

  if (problems.length) {
    throw new Error(`Configuracion de produccion incompleta:\n- ${problems.join("\n- ")}`);
  }
}

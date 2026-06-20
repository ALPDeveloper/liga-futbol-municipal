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
  if (!value) return IS_PRODUCTION ? "" : ["http://127.0.0.1:5173", "http://localhost:5173"];
  if (value === "*") return "*";
  if (!value.includes(",")) return value;
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getConfiguredOrigins(corsOrigin) {
  if (!corsOrigin || corsOrigin === "*") return [];
  return Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
}

function isLocalHttpOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isValidHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export const runtimeConfig = {
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  port: Number(process.env.API_PORT || process.env.PORT || 3001),
  host: process.env.API_HOST || "127.0.0.1",
  trustProxy: parseBoolean(process.env.TRUST_PROXY, IS_PRODUCTION),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "2mb",
  corsOrigin: parseCorsOrigin(),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  loginIpWindowMinutes: Number(process.env.LOGIN_IP_WINDOW_MINUTES || 15),
  loginIpMaxAttempts: Number(process.env.LOGIN_IP_MAX_ATTEMPTS || 40),
  passwordResetWindowMinutes: Number(process.env.PASSWORD_RESET_WINDOW_MINUTES || 30),
  passwordResetMaxRequests: Number(process.env.PASSWORD_RESET_MAX_REQUESTS || 5),
  showRecoveryCodeInResponse: parseBoolean(
    process.env.SHOW_RECOVERY_CODE_IN_RESPONSE,
    false
  ),
  seedDemoUsers: parseBoolean(process.env.SEED_DEMO_USERS, !IS_PRODUCTION),
  tokenSecret: process.env.AUTH_SECRET || DEFAULT_DEV_SECRET,
  tokenTtlMs: 1000 * 60 * 60 * Number(process.env.TOKEN_TTL_HOURS || 8),
  databaseProvider: process.env.DATABASE_PROVIDER === "postgres" ? "postgres" : "sqlite",
  databaseUrl: process.env.DATABASE_URL || "",
  imageUploadMaxBytes: Number(process.env.IMAGE_UPLOAD_MAX_BYTES || 1_800_000),
  imageStorageProvider: process.env.IMAGE_STORAGE_PROVIDER === "supabase" ? "supabase" : "local",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "ligatec-images",
  storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL || "",
  serveStatic: parseBoolean(process.env.SERVE_STATIC, IS_PRODUCTION),
  publicCacheSeconds: Math.max(0, Number(process.env.PUBLIC_CACHE_SECONDS || 5))
};

export function validateRuntimeConfig() {
  if (!runtimeConfig.isProduction) return;

  const problems = [];
  if (!process.env.AUTH_SECRET || runtimeConfig.tokenSecret === DEFAULT_DEV_SECRET) {
    problems.push("AUTH_SECRET es obligatorio en produccion.");
  } else if (runtimeConfig.tokenSecret.length < 32) {
    problems.push("AUTH_SECRET debe tener al menos 32 caracteres en produccion.");
  } else if (/cambia|secret|password|123/i.test(runtimeConfig.tokenSecret)) {
    problems.push("AUTH_SECRET no debe parecer una clave de ejemplo.");
  }

  if (!runtimeConfig.corsOrigin || runtimeConfig.corsOrigin === "*") {
    problems.push("CORS_ORIGIN debe apuntar al dominio publico en produccion.");
  } else {
    for (const origin of getConfiguredOrigins(runtimeConfig.corsOrigin)) {
      try {
        const url = new URL(origin);
        if (!["http:", "https:"].includes(url.protocol)) {
          problems.push(`CORS_ORIGIN invalido: ${origin}`);
        }
        if (url.protocol !== "https:" && !isLocalHttpOrigin(origin)) {
          problems.push(`CORS_ORIGIN debe usar https en produccion: ${origin}`);
        }
      } catch {
        problems.push(`CORS_ORIGIN invalido: ${origin}`);
      }
    }
  }

  if (runtimeConfig.showRecoveryCodeInResponse) {
    problems.push("SHOW_RECOVERY_CODE_IN_RESPONSE debe ser false en produccion.");
  }

  if (runtimeConfig.seedDemoUsers) {
    problems.push("SEED_DEMO_USERS debe ser false en produccion.");
  }

  if (runtimeConfig.databaseProvider === "postgres" && !runtimeConfig.databaseUrl) {
    problems.push("DATABASE_URL es obligatorio cuando DATABASE_PROVIDER=postgres.");
  }

  if (runtimeConfig.databaseProvider !== "postgres") {
    problems.push("DATABASE_PROVIDER debe ser postgres en produccion.");
  }

  if (runtimeConfig.imageUploadMaxBytes <= 0 || runtimeConfig.imageUploadMaxBytes > 5_000_000) {
    problems.push("IMAGE_UPLOAD_MAX_BYTES debe ser mayor a 0 y no superar 5000000 en produccion.");
  }

  if (runtimeConfig.imageStorageProvider !== "supabase") {
    problems.push("IMAGE_STORAGE_PROVIDER debe ser supabase en produccion.");
  }

  if (runtimeConfig.imageStorageProvider === "supabase") {
    if (!runtimeConfig.supabaseUrl || !isValidHttpsUrl(runtimeConfig.supabaseUrl)) {
      problems.push("SUPABASE_URL debe ser una URL https valida.");
    }
    if (!runtimeConfig.supabaseServiceRoleKey || runtimeConfig.supabaseServiceRoleKey.length < 40) {
      problems.push("SUPABASE_SERVICE_ROLE_KEY es obligatorio para subir imagenes en produccion.");
    }
    if (!runtimeConfig.supabaseStorageBucket) {
      problems.push("SUPABASE_STORAGE_BUCKET es obligatorio para subir imagenes en produccion.");
    }
  }

  const apiBaseUrl = String(process.env.VITE_API_BASE_URL || "").trim();
  if (apiBaseUrl && !apiBaseUrl.startsWith("/") && !isValidHttpsUrl(apiBaseUrl)) {
    problems.push("VITE_API_BASE_URL debe ser una ruta relativa o una URL https en produccion.");
  }

  if (problems.length) {
    throw new Error(`Configuracion de produccion incompleta:\n- ${problems.join("\n- ")}`);
  }
}

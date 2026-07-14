import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./database.js";
import { ROOT_DIR } from "./env.js";
import {
  createBackupRecordData,
  DATABASE_PROVIDER,
  getBackupRecordData,
  getStoreData,
  updateBackupRecordData
} from "./dataLayer.js";

const configuredBackupDir = process.env.BACKUP_DIR || "backups";
const BACKUP_DIR = path.isAbsolute(configuredBackupDir)
  ? configuredBackupDir
  : path.join(ROOT_DIR, configuredBackupDir);
const BACKUP_STORAGE_BUCKET = String(process.env.BACKUP_STORAGE_BUCKET || "").trim();

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getBackupId() {
  return `backup-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function getBackupContentType(record) {
  return record?.kind === "logical_store_json" ? "application/json" : "application/octet-stream";
}

function assertBackupPath(filePath) {
  const resolvedDir = path.resolve(BACKUP_DIR);
  const resolvedPath = path.resolve(filePath || "");
  if (!resolvedPath.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error("Ruta de respaldo no permitida.");
  }
  return resolvedPath;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  return hash.digest("hex");
}

function getSafeErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("Supabase") || message.includes("Storage") || message.includes("credenciales")) {
    return message;
  }
  return "No se pudo crear el respaldo. Revisa permisos de escritura o configuracion del servidor.";
}

async function uploadBackupToSupabaseStorage(filePath, { contentType }) {
  if (!BACKUP_STORAGE_BUCKET) return { bucket: "", path: "" };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan credenciales para subir el respaldo a Supabase Storage.");
  }

  const baseUrl = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const fileName = path.basename(filePath);
  const storagePath = `database/${new Date().toISOString().slice(0, 10)}/${fileName}`;
  const endpoint = `${baseUrl}/storage/v1/object/${BACKUP_STORAGE_BUCKET}/${storagePath}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=0, no-store",
      "x-upsert": "false"
    },
    body: fs.readFileSync(filePath)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo guardar el respaldo externo. ${detail}`.trim());
  }

  return { bucket: BACKUP_STORAGE_BUCKET, path: storagePath };
}

export function getSafeBackupRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    provider: record.provider,
    kind: record.kind,
    status: record.status,
    fileName: record.fileName,
    sizeBytes: Number(record.sizeBytes || 0),
    checksumSha256: record.checksumSha256 || "",
    storageBucket: record.storageBucket ? "configurado" : "",
    storagePath: record.storagePath ? "respaldo externo disponible" : "",
    createdByUserId: record.createdByUserId || "",
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    errorMessage: record.errorMessage || "",
    downloadAvailable: record.status === "completed" && Boolean(record.filePath)
  };
}

export async function createPlatformBackup({ user }) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const id = getBackupId();
  const createdAt = new Date().toISOString();
  const provider = DATABASE_PROVIDER;
  const kind = provider === "postgres" ? "logical_store_json" : "sqlite_file";

  await createBackupRecordData({
    id,
    provider,
    kind,
    status: "pending",
    createdByUserId: user?.id || "",
    createdAt
  });

  try {
    let fileName = "";
    let filePath = "";
    const contentType = getBackupContentType({ kind });

    if (provider === "postgres") {
      const store = await getStoreData();
      fileName = `postgres-store-backup-${timestamp()}.json`;
      filePath = path.join(BACKUP_DIR, fileName);
      fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    } else {
      fileName = `liga-futbol-${timestamp()}.sqlite`;
      filePath = path.join(BACKUP_DIR, fileName);
      await db.backup(filePath);
    }

    const stats = fs.statSync(filePath);
    const checksumSha256 = sha256File(filePath);
    const storage = await uploadBackupToSupabaseStorage(filePath, { contentType });
    const completed = await updateBackupRecordData(id, {
      status: "completed",
      fileName,
      filePath,
      sizeBytes: stats.size,
      checksumSha256,
      storageBucket: storage.bucket,
      storagePath: storage.path,
      completedAt: new Date().toISOString(),
      errorMessage: ""
    });

    return getSafeBackupRecord(completed);
  } catch (error) {
    await updateBackupRecordData(id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage: getSafeErrorMessage(error)
    });
    throw error;
  }
}

export async function getBackupDownload(recordId) {
  const record = await getBackupRecordData(recordId);
  if (!record || record.status !== "completed" || !record.filePath) return null;
  const filePath = assertBackupPath(record.filePath);
  if (!fs.existsSync(filePath)) return null;
  return {
    record,
    filePath,
    fileName: record.fileName || path.basename(filePath),
    contentType: getBackupContentType(record)
  };
}

export async function verifyBackupIntegrity(recordId) {
  const record = await getBackupRecordData(recordId);
  if (!record || record.status !== "completed" || !record.filePath) {
    return {
      ok: false,
      reason: "Respaldo no disponible.",
      backup: getSafeBackupRecord(record)
    };
  }

  const filePath = assertBackupPath(record.filePath);
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      reason: "El archivo fisico del respaldo no existe en el servidor.",
      backup: getSafeBackupRecord(record)
    };
  }

  const stats = fs.statSync(filePath);
  const checksumSha256 = sha256File(filePath);
  const expectedChecksum = String(record.checksumSha256 || "");
  const checksumMatches = Boolean(expectedChecksum) && checksumSha256 === expectedChecksum;
  const sizeMatches = Number(record.sizeBytes || 0) === Number(stats.size || 0);

  return {
    ok: checksumMatches && sizeMatches,
    reason: checksumMatches && sizeMatches
      ? "Respaldo verificado correctamente."
      : "El respaldo existe, pero su tamano o checksum no coincide.",
    checksumMatches,
    sizeMatches,
    fileAvailable: true,
    sizeBytes: stats.size,
    checksumSha256,
    verifiedAt: new Date().toISOString(),
    backup: getSafeBackupRecord(record)
  };
}

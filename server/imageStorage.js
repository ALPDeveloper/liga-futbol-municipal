import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT_DIR } from "./env.js";
import { runtimeConfig } from "./runtimeConfig.js";

const MIME_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\s]+)$/i;
const DEFAULT_IMAGE_UPLOAD_MAX_BYTES = 650_000;
const SCOPED_IMAGE_UPLOAD_MAX_BYTES = {
  "league-logos": 400_000,
  "player-photos": 400_000,
  "team-logos": 400_000,
  "league-media": 900_000,
  sponsors: 900_000
};

function hasValidImageSignature(buffer, mimeType) {
  if (mimeType === "image/png") {
    return buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

function cleanSegment(value, fallback) {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;
}

export function getLocalUploadDir() {
  return path.resolve(ROOT_DIR, runtimeConfig.uploadDir);
}

function getScopedUploadMaxBytes(scope) {
  const scopedLimit = SCOPED_IMAGE_UPLOAD_MAX_BYTES[cleanSegment(scope, "general")];
  return Math.min(runtimeConfig.imageUploadMaxBytes, scopedLimit || DEFAULT_IMAGE_UPLOAD_MAX_BYTES);
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

export function parseImageDataUrl(dataUrl, { maxBytes = runtimeConfig.imageUploadMaxBytes } = {}) {
  const match = DATA_URL_PATTERN.exec(String(dataUrl || "").trim());
  if (!match) throw new Error("Formato de imagen invalido.");

  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  if (!MIME_EXTENSIONS[mimeType]) throw new Error("Tipo de imagen no permitido.");

  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) throw new Error("Imagen vacia.");
  if (buffer.length > maxBytes) {
    throw new Error(`La imagen optimizada debe pesar menos de ${formatBytes(maxBytes)}.`);
  }
  if (!hasValidImageSignature(buffer, mimeType)) {
    throw new Error("El archivo no coincide con un formato de imagen permitido.");
  }

  return {
    buffer,
    extension: MIME_EXTENSIONS[mimeType],
    mimeType,
    sizeBytes: buffer.length
  };
}

function buildObjectPath({ extension, leagueId, scope, user }) {
  const folder = cleanSegment(scope, "general");
  const leagueSegment = cleanSegment(leagueId || user?.leagueId || "global", "global");
  const id = crypto.randomUUID();
  return `${leagueSegment}/${folder}/${Date.now()}-${id}.${extension}`;
}

async function uploadToSupabaseStorage({ buffer, mimeType, objectPath }) {
  const endpoint = `${runtimeConfig.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${runtimeConfig.supabaseStorageBucket}/${objectPath}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${runtimeConfig.supabaseServiceRoleKey}`,
      apikey: runtimeConfig.supabaseServiceRoleKey,
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false"
    },
    body: buffer
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo subir la imagen a Supabase Storage. ${detail}`.trim());
  }

  const publicBase = runtimeConfig.storagePublicBaseUrl ||
    `${runtimeConfig.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${runtimeConfig.supabaseStorageBucket}`;
  return `${publicBase.replace(/\/+$/, "")}/${objectPath}`;
}

async function uploadToLocalStorage({ buffer, objectPath }) {
  const uploadDir = getLocalUploadDir();
  const targetPath = path.join(uploadDir, objectPath);
  if (!targetPath.startsWith(uploadDir)) throw new Error("Ruta de imagen invalida.");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer, { flag: "wx" });
  return `/uploads/${objectPath}`;
}

export async function uploadImageDataUrl({ dataUrl, leagueId, scope, user }) {
  const image = parseImageDataUrl(dataUrl, { maxBytes: getScopedUploadMaxBytes(scope) });
  const objectPath = buildObjectPath({ extension: image.extension, leagueId, scope, user });
  const uploadMeta = {
    objectPath,
    sizeBytes: image.sizeBytes,
    mimeType: image.mimeType
  };

  if (runtimeConfig.imageStorageProvider === "supabase") {
    return {
      ...uploadMeta,
      url: await uploadToSupabaseStorage({ ...image, objectPath })
    };
  }

  return {
    ...uploadMeta,
    url: await uploadToLocalStorage({ ...image, objectPath })
  };
}

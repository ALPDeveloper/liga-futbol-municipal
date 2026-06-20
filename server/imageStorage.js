import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT_DIR } from "./env.js";
import { runtimeConfig } from "./runtimeConfig.js";

const MIME_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i;

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

export function parseImageDataUrl(dataUrl) {
  const match = DATA_URL_PATTERN.exec(String(dataUrl || "").trim());
  if (!match) throw new Error("Formato de imagen invalido.");

  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  if (!MIME_EXTENSIONS[mimeType]) throw new Error("Tipo de imagen no permitido.");

  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) throw new Error("Imagen vacia.");
  if (buffer.length > runtimeConfig.imageUploadMaxBytes) {
    throw new Error(`La imagen debe pesar menos de ${Math.round(runtimeConfig.imageUploadMaxBytes / 1024 / 1024)} MB.`);
  }

  return {
    buffer,
    extension: MIME_EXTENSIONS[mimeType],
    mimeType
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
  const image = parseImageDataUrl(dataUrl);
  const objectPath = buildObjectPath({ extension: image.extension, leagueId, scope, user });

  if (runtimeConfig.imageStorageProvider === "supabase") {
    return uploadToSupabaseStorage({ ...image, objectPath });
  }

  return uploadToLocalStorage({ ...image, objectPath });
}

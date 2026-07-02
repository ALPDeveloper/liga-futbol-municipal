import "../server/env.js";
import { runtimeConfig } from "../server/runtimeConfig.js";

const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp"];

function requireValue(name, value) {
  if (!value) throw new Error(`${name} es obligatorio para configurar Supabase Storage.`);
}

function storageHeaders() {
  return {
    Authorization: `Bearer ${runtimeConfig.supabaseServiceRoleKey}`,
    apikey: runtimeConfig.supabaseServiceRoleKey,
    "Content-Type": "application/json"
  };
}

async function parseSupabaseResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message || payload.error || text || "Error de Supabase Storage");
  }
  return payload;
}

async function getBucket(baseUrl, bucketId) {
  const response = await fetch(`${baseUrl}/storage/v1/bucket/${bucketId}`, {
    headers: storageHeaders()
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (response.status === 404 || /bucket not found/i.test(payload.message || payload.error || text)) return null;
  if (!response.ok) {
    throw new Error(payload.message || payload.error || text || "Error de Supabase Storage");
  }
  return payload;
}

async function createBucket(baseUrl, bucketId) {
  const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders(),
    body: JSON.stringify({
      id: bucketId,
      name: bucketId,
      public: true,
      file_size_limit: runtimeConfig.imageUploadMaxBytes,
      allowed_mime_types: allowedMimeTypes
    })
  });
  return parseSupabaseResponse(response);
}

async function updateBucket(baseUrl, bucketId) {
  const response = await fetch(`${baseUrl}/storage/v1/bucket/${bucketId}`, {
    method: "PUT",
    headers: storageHeaders(),
    body: JSON.stringify({
      public: true,
      file_size_limit: runtimeConfig.imageUploadMaxBytes,
      allowed_mime_types: allowedMimeTypes
    })
  });
  return parseSupabaseResponse(response);
}

requireValue("SUPABASE_URL", runtimeConfig.supabaseUrl);
requireValue("SUPABASE_SERVICE_ROLE_KEY", runtimeConfig.supabaseServiceRoleKey);
requireValue("SUPABASE_STORAGE_BUCKET", runtimeConfig.supabaseStorageBucket);

const baseUrl = runtimeConfig.supabaseUrl.replace(/\/+$/, "");
const bucketId = runtimeConfig.supabaseStorageBucket;

console.log("Configurando Supabase Storage");
console.log(`- Proyecto: ${baseUrl}`);
console.log(`- Bucket: ${bucketId}`);
console.log(`- Publico: si`);
console.log(`- Limite imagen: ${runtimeConfig.imageUploadMaxBytes} bytes`);

const existingBucket = await getBucket(baseUrl, bucketId);
if (existingBucket) {
  await updateBucket(baseUrl, bucketId);
  console.log("Bucket existente actualizado.");
} else {
  await createBucket(baseUrl, bucketId);
  console.log("Bucket creado.");
}

console.log("Supabase Storage OK");

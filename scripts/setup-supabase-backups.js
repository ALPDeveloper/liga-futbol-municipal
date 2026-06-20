import "../server/env.js";

const backupStorageBucket = String(process.env.BACKUP_STORAGE_BUCKET || "ligatec-backups").trim();
const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function requireValue(name, value) {
  if (!value) throw new Error(`${name} es obligatorio para configurar backups en Supabase Storage.`);
}

function storageHeaders() {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
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

async function getBucket(bucketId) {
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, {
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

async function createBucket(bucketId) {
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders(),
    body: JSON.stringify({
      id: bucketId,
      name: bucketId,
      public: false,
      allowed_mime_types: ["application/json"]
    })
  });
  return parseSupabaseResponse(response);
}

async function updateBucket(bucketId) {
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, {
    method: "PUT",
    headers: storageHeaders(),
    body: JSON.stringify({
      public: false,
      allowed_mime_types: ["application/json"]
    })
  });
  return parseSupabaseResponse(response);
}

requireValue("SUPABASE_URL", supabaseUrl);
requireValue("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
requireValue("BACKUP_STORAGE_BUCKET", backupStorageBucket);

console.log("Configurando bucket privado de backups");
console.log(`- Proyecto: ${supabaseUrl}`);
console.log(`- Bucket: ${backupStorageBucket}`);
console.log("- Publico: no");

const existingBucket = await getBucket(backupStorageBucket);
if (existingBucket) {
  await updateBucket(backupStorageBucket);
  console.log("Bucket privado existente actualizado.");
} else {
  await createBucket(backupStorageBucket);
  console.log("Bucket privado creado.");
}

console.log("Supabase backup storage OK");

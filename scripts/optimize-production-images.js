import "../server/env.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import sharp from "sharp";
import { ROOT_DIR } from "../server/env.js";
import { runtimeConfig } from "../server/runtimeConfig.js";

const DEFAULT_MIN_SAVINGS_RATIO = 0.12;
const DEFAULT_MIN_BYTES = 90_000;
const IMAGE_URL_PATTERN = /https?:\/\/[^\s"'<>\\)]+(?:png|jpe?g|webp)(?:\?[^\s"'<>\\)]*)?/gi;
const DIRECT_IMAGE_COLUMNS = [
  { table: "league_identities", idColumn: "league_id", urlColumn: "logo_url", scope: "league-logos", leagueColumn: "league_id", kind: "logo" },
  { table: "teams", idColumn: "id", urlColumn: "logo_url", scope: "team-logos", leagueColumn: "league_id", kind: "logo" },
  { table: "players", idColumn: "id", urlColumn: "photo_url", scope: "player-photos", leagueColumn: "league_id", kind: "player-photo" },
  { table: "referee_profiles", idColumn: "user_id", urlColumn: "photo_url", scope: "referee-photos", leagueColumn: null, kind: "player-photo" },
  { table: "league_media", idColumn: "id", urlColumn: "image_url", scope: "league-media", leagueColumn: "league_id", kind: "media" },
  { table: "sponsors", idColumn: "id", urlColumn: "image_url", scope: "sponsors", leagueColumn: "league_id", kind: "media" },
  { table: "match_participation_players", idColumn: "id", urlColumn: "player_photo_snapshot", scope: "player-photos", leagueColumn: null, kind: "player-photo" }
];
const JSON_IMAGE_COLUMNS = [
  { table: "match_rosters", idColumn: "id", columns: ["players_json", "starters_json", "substitutes_json", "lineup_json"], cast: "jsonb" },
  { table: "referee_match_sheets", idColumn: "id", columns: ["payload_json"], cast: "jsonb" }
];

function parseArgs() {
  const args = new Map();
  for (const arg of process.argv.slice(2)) {
    if (arg === "--apply") {
      args.set("apply", true);
      continue;
    }
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    args.set(key, value || true);
  }
  return args;
}

function cleanSegment(value, fallback = "global") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

function getPublicStorageBaseUrl() {
  const baseUrl = runtimeConfig.storagePublicBaseUrl ||
    `${runtimeConfig.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${runtimeConfig.supabaseStorageBucket}`;
  return baseUrl.replace(/\/+$/, "");
}

function getStorageObjectPath(url) {
  const publicBase = getPublicStorageBaseUrl();
  const value = String(url || "").trim();
  if (value.startsWith(`${publicBase}/`)) {
    return decodeURIComponent(value.slice(publicBase.length + 1));
  }

  const parsed = new URL(value);
  const marker = `/storage/v1/object/public/${runtimeConfig.supabaseStorageBucket}/`;
  const index = parsed.pathname.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(parsed.pathname.slice(index + marker.length));
}

function isSupportedStorageImageUrl(url) {
  try {
    const objectPath = getStorageObjectPath(url);
    if (!objectPath || objectPath.includes("/optimized/")) return false;
    return /\.(png|jpe?g|webp)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function getImageProfile(record) {
  if (record.kind === "media") {
    return { maxSide: 1400, targetBytes: 650_000, quality: 82 };
  }
  if (record.kind === "player-photo") {
    return { maxSide: 640, targetBytes: 180_000, quality: 78 };
  }
  return { maxSide: 640, targetBytes: 240_000, quality: 82 };
}

function getOutputObjectPath(record, inputBuffer) {
  const hash = crypto.createHash("sha256").update(inputBuffer).digest("hex").slice(0, 16);
  const leagueSegment = cleanSegment(record.leagueId || "global");
  return `${leagueSegment}/optimized/${cleanSegment(record.scope)}/${hash}.webp`;
}

async function getDirectReferences(client, leagueId) {
  const references = [];
  for (const definition of DIRECT_IMAGE_COLUMNS) {
    const params = [];
    let where = `${definition.urlColumn} IS NOT NULL AND ${definition.urlColumn} <> ''`;
    if (leagueId && definition.leagueColumn) {
      params.push(leagueId);
      where += ` AND ${definition.leagueColumn} = $${params.length}`;
    }
    const result = await client.query(
      `SELECT ${definition.idColumn} AS id, ${definition.urlColumn} AS url${definition.leagueColumn ? `, ${definition.leagueColumn} AS league_id` : ""}
       FROM ${definition.table}
       WHERE ${where}`,
      params
    );
    for (const row of result.rows) {
      references.push({
        table: definition.table,
        idColumn: definition.idColumn,
        id: row.id,
        urlColumn: definition.urlColumn,
        url: row.url,
        leagueId: row.league_id || leagueId || "global",
        scope: definition.scope,
        kind: definition.kind,
        direct: true
      });
    }
  }
  return references;
}

async function getJsonReferences(client) {
  const references = [];
  for (const definition of JSON_IMAGE_COLUMNS) {
    const result = await client.query(
      `SELECT ${definition.idColumn} AS id, ${definition.columns.map((column) => `${column}::text AS ${column}`).join(", ")}
       FROM ${definition.table}`
    );
    for (const row of result.rows) {
      for (const column of definition.columns) {
        const value = String(row[column] || "");
        const urls = value.match(IMAGE_URL_PATTERN) || [];
        for (const url of urls) {
          references.push({
            table: definition.table,
            idColumn: definition.idColumn,
            id: row.id,
            urlColumn: column,
            url,
            scope: "embedded-json",
            kind: "player-photo",
            cast: definition.cast,
            direct: false
          });
        }
      }
    }
  }
  return references;
}

function chooseCanonicalRecord(records) {
  return records.find((record) => record.direct) || records[0];
}

async function fetchImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo descargar ${url}: ${response.status} ${detail}`.trim());
  }
  const contentType = response.headers.get("content-type") || "";
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function optimizeImage(buffer, record) {
  const profile = getImageProfile(record);
  const pipeline = sharp(buffer, { animated: false })
    .rotate()
    .resize({
      width: profile.maxSide,
      height: profile.maxSide,
      fit: "inside",
      withoutEnlargement: true
    });

  let quality = profile.quality;
  let output = await pipeline.clone().webp({ quality, effort: 5 }).toBuffer();
  while (output.length > profile.targetBytes && quality > 58) {
    quality -= 8;
    output = await pipeline.clone().webp({ quality, effort: 5 }).toBuffer();
  }

  const metadata = await sharp(output).metadata();
  return {
    buffer: output,
    bytes: output.length,
    width: metadata.width || null,
    height: metadata.height || null,
    quality
  };
}

async function uploadOptimizedImage(objectPath, buffer) {
  const endpoint = `${runtimeConfig.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${runtimeConfig.supabaseStorageBucket}/${objectPath}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${runtimeConfig.supabaseServiceRoleKey}`,
      apikey: runtimeConfig.supabaseServiceRoleKey,
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false"
    },
    body: buffer
  });

  if (response.status === 409) return;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo subir imagen optimizada ${objectPath}: ${response.status} ${detail}`.trim());
  }
}

async function updateReferences(client, mapping) {
  for (const item of mapping) {
    for (const ref of item.references.filter((reference) => reference.direct)) {
      await client.query(
        `UPDATE ${ref.table} SET ${ref.urlColumn} = $1 WHERE ${ref.idColumn} = $2 AND ${ref.urlColumn} = $3`,
        [item.optimizedUrl, ref.id, item.originalUrl]
      );
    }
  }

  for (const definition of JSON_IMAGE_COLUMNS) {
    for (const column of definition.columns) {
      let query = `UPDATE ${definition.table} SET ${column} = replace(${column}::text, $1, $2)`;
      if (definition.cast === "jsonb") query += "::jsonb";
      query += ` WHERE ${column}::text LIKE $3`;
      for (const item of mapping) {
        await client.query(query, [item.originalUrl, item.optimizedUrl, `%${item.originalUrl}%`]);
      }
    }
  }
}

async function main() {
  const args = parseArgs();
  const apply = args.has("apply");
  const limit = Number(args.get("limit") || 0);
  const leagueId = String(args.get("league") || "").trim();
  const minBytes = Number(args.get("min-bytes") || DEFAULT_MIN_BYTES);
  const minSavingsRatio = Number(args.get("min-savings-ratio") || DEFAULT_MIN_SAVINGS_RATIO);

  if (apply && process.env.CONFIRM_OPTIMIZE_PRODUCTION_IMAGES !== "YES") {
    throw new Error("Para aplicar cambios usa CONFIRM_OPTIMIZE_PRODUCTION_IMAGES=YES npm run optimize:production-images -- --apply");
  }
  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseServiceRoleKey || !runtimeConfig.supabaseStorageBucket) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_STORAGE_BUCKET son obligatorios.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL es obligatorio.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const connection = await pool.connect();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    leagueId: leagueId || null,
    minBytes,
    minSavingsRatio,
    scannedUrls: 0,
    skipped: [],
    optimized: []
  };

  try {
    const allReferences = [
      ...(await getDirectReferences(connection, leagueId)),
      ...(await getJsonReferences(connection))
    ].filter((reference) => isSupportedStorageImageUrl(reference.url));
    const grouped = new Map();
    for (const reference of allReferences) {
      if (!grouped.has(reference.url)) grouped.set(reference.url, []);
      grouped.get(reference.url).push(reference);
    }

    const urls = [...grouped.keys()].slice(0, limit || undefined);
    report.scannedUrls = urls.length;

    for (const url of urls) {
      const references = grouped.get(url);
      const canonical = chooseCanonicalRecord(references);
      try {
        const source = await fetchImage(url);
        if (source.buffer.length < minBytes) {
          report.skipped.push({ url, reason: "below-min-bytes", bytes: source.buffer.length, references: references.length });
          continue;
        }
        const optimized = await optimizeImage(source.buffer, canonical);
        const savingsRatio = 1 - (optimized.bytes / source.buffer.length);
        if (optimized.bytes >= source.buffer.length || savingsRatio < minSavingsRatio) {
          report.skipped.push({
            url,
            reason: "insufficient-savings",
            originalBytes: source.buffer.length,
            optimizedBytes: optimized.bytes,
            savingsRatio,
            references: references.length
          });
          continue;
        }

        const objectPath = getOutputObjectPath(canonical, source.buffer);
        const optimizedUrl = `${getPublicStorageBaseUrl()}/${objectPath}`;
        const item = {
          originalUrl: url,
          optimizedUrl,
          originalBytes: source.buffer.length,
          optimizedBytes: optimized.bytes,
          savedBytes: source.buffer.length - optimized.bytes,
          savingsRatio,
          width: optimized.width,
          height: optimized.height,
          quality: optimized.quality,
          objectPath,
          references
        };

        if (apply) await uploadOptimizedImage(objectPath, optimized.buffer);
        report.optimized.push(item);
      } catch (error) {
        report.skipped.push({ url, reason: "error", message: error.message, references: references.length });
      }
    }

    if (apply && report.optimized.length) {
      await connection.query("BEGIN");
      try {
        await updateReferences(connection, report.optimized);
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    connection.release();
    await pool.end();
  }

  const reportDir = path.join(ROOT_DIR, "backups", "media-optimization");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `image-optimization-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const originalBytes = report.optimized.reduce((sum, item) => sum + item.originalBytes, 0);
  const optimizedBytes = report.optimized.reduce((sum, item) => sum + item.optimizedBytes, 0);
  console.log(`Modo: ${report.mode}`);
  console.log(`URLs revisadas: ${report.scannedUrls}`);
  console.log(`Imagenes optimizables: ${report.optimized.length}`);
  console.log(`Ahorro estimado: ${formatBytes(originalBytes - optimizedBytes)} de ${formatBytes(originalBytes)}`);
  console.log(`Omitidas: ${report.skipped.length}`);
  console.log(`Reporte: ${reportPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

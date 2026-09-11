import crypto from "node:crypto";
import { runtimeConfig } from "./runtimeConfig.js";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
let cachedKeys = { expiresAt: 0, keys: [] };

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
}

async function getGoogleKeys() {
  const now = Date.now();
  if (cachedKeys.expiresAt > now && cachedKeys.keys.length) return cachedKeys.keys;

  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("No se pudo validar Google en este momento.");
  const payload = await response.json();
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedKeys = {
    expiresAt: now + Math.max(300, maxAgeSeconds) * 1000,
    keys: Array.isArray(payload.keys) ? payload.keys : []
  };
  return cachedKeys.keys;
}

export async function verifyGoogleCredential(credential) {
  if (!runtimeConfig.googleClientId) {
    throw new Error("El acceso con Google no esta configurado.");
  }

  const token = String(credential || "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token de Google invalido.");

  const header = decodeJsonPart(parts[0]);
  const payload = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Token de Google invalido.");

  const keys = await getGoogleKeys();
  const jwk = keys.find((item) => item.kid === header.kid);
  if (!jwk) throw new Error("No se pudo validar Google en este momento.");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signatureOk = verifier.verify(publicKey, Buffer.from(parts[2], "base64url"));
  if (!signatureOk) throw new Error("Token de Google invalido.");

  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.has(payload.iss)) throw new Error("Token de Google invalido.");
  if (!audience.includes(runtimeConfig.googleClientId)) throw new Error("Token de Google invalido para LIGATEC.");
  if (!payload.exp || payload.exp < nowSeconds) throw new Error("La sesion de Google expiro.");
  if (payload.nbf && payload.nbf > nowSeconds + 60) throw new Error("Token de Google invalido.");
  if (!payload.email || payload.email_verified !== true) throw new Error("Google no confirmo este correo.");

  return {
    subject: String(payload.sub || ""),
    email: String(payload.email || "").trim().toLowerCase(),
    name: String(payload.name || payload.email || "").trim(),
    picture: String(payload.picture || "").trim()
  };
}

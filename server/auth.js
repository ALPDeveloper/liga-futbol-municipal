import "./env.js";
import crypto from "node:crypto";
import { getUserById } from "./dataLayer.js";
import { runtimeConfig } from "./runtimeConfig.js";

const TOKEN_SECRET = runtimeConfig.tokenSecret;
const TOKEN_TTL_MS = runtimeConfig.tokenTtlMs;

export function createToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    leagueId: user.league_id ?? user.leagueId ?? null,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export async function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp < Date.now()) return null;

  const user = await getUserById(payload.id, { activeOnly: true });
  return user ? toPublicUser(user) : null;
}

export async function getAuthUser(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyToken(token);
}

export async function requireAuth(request, response, next) {
  const user = await getAuthUser(request);
  if (!user) return response.status(401).json({ error: "Sesion requerida" });
  request.user = user;
  next();
}

export async function requireSuperAdmin(request, response, next) {
  const user = await getAuthUser(request);
  if (!user || user.role !== "super_admin") return response.status(403).json({ error: "Permiso de super admin requerido" });
  request.user = user;
  next();
}

export function toPublicUser(user) {
  return {
    id: user.id,
    leagueId: user.league_id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    failedLoginCount: user.failed_login_count || 0,
    lockedUntil: user.locked_until || null
  };
}

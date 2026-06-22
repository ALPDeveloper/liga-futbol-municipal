import "./env.js";
import cors from "cors";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "./env.js";
import { listAuditLogs, logAudit } from "./audit.js";
import { createToken, getAuthUser, requireAuth, requireSuperAdmin, toPublicUser } from "./auth.js";
import {
  clearLoginLockData,
  countActiveSuperAdminsExcept,
  countLeagueAdmins,
  createPasswordResetData,
  createUserData,
  DATABASE_LABEL,
  DATABASE_PROVIDER,
  deleteUserData,
  disableUserData,
  getActiveUserByEmail,
  getStoreData,
  getUserById,
  importStoreData,
  initializeData,
  listActivePasswordResetRequests,
  listUsersData,
  markPasswordResetUsed,
  registerFailedLoginData,
  updatePasswordData,
  updateUserData
} from "./dataLayer.js";
import { hashPassword, verifyPassword } from "./password.js";
import { runtimeConfig, validateRuntimeConfig } from "./runtimeConfig.js";
import { getLocalUploadDir, uploadImageDataUrl } from "./imageStorage.js";
import { postgresPool } from "./postgresDatabase.js";
import {
  applySecurityHeaders,
  createRateLimiter,
  requireStrongPassword,
  scopeStoreForUser,
  validateEmail,
  validateStorePayload,
  validateUserRole,
  validateUserStatus
} from "./security.js";

validateRuntimeConfig();
await initializeData();

const app = express();
const PORT = runtimeConfig.port;
const HOST = runtimeConfig.host;
const LOGIN_MAX_ATTEMPTS = runtimeConfig.loginMaxAttempts;
const LOGIN_LOCK_MINUTES = runtimeConfig.loginLockMinutes;
const SHOW_RECOVERY_CODE_IN_RESPONSE = runtimeConfig.showRecoveryCodeInResponse;
const DIST_DIR = path.join(ROOT_DIR, "dist");
const DIST_INDEX = path.join(DIST_DIR, "index.html");
let publicStoreCache = null;
let publicStoreCacheUntil = 0;

app.disable("x-powered-by");
app.set("trust proxy", runtimeConfig.trustProxy);
app.use(applySecurityHeaders);
app.use(cors({
  origin: runtimeConfig.corsOrigin,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600
}));
app.use(express.json({ limit: runtimeConfig.jsonBodyLimit }));
app.use("/uploads", express.static(getLocalUploadDir(), {
  fallthrough: false,
  immutable: true,
  maxAge: "365d"
}));

const loginIpLimiter = createRateLimiter({
  windowMs: runtimeConfig.loginIpWindowMinutes * 60 * 1000,
  max: runtimeConfig.loginIpMaxAttempts,
  keyGenerator: (request) => `login:${request.ip}`
});

const passwordResetLimiter = createRateLimiter({
  windowMs: runtimeConfig.passwordResetWindowMinutes * 60 * 1000,
  max: runtimeConfig.passwordResetMaxRequests,
  keyGenerator: (request) => `reset:${request.ip}:${String(request.body?.email || "").trim().toLowerCase()}`
});

const passwordResetCompleteLimiter = createRateLimiter({
  windowMs: runtimeConfig.passwordResetWindowMinutes * 60 * 1000,
  max: runtimeConfig.passwordResetMaxRequests,
  keyGenerator: (request) => `reset-complete:${request.ip}:${String(request.body?.email || "").trim().toLowerCase()}`
});

function canManageLeague(user, leagueId) {
  return user.role === "super_admin" || (user.role === "league_admin" && user.leagueId === leagueId);
}

function clearPublicCache() {
  publicStoreCache = null;
  publicStoreCacheUntil = 0;
}

async function getPublicStoreCached() {
  const now = Date.now();
  if (runtimeConfig.publicCacheSeconds > 0 && publicStoreCache && publicStoreCacheUntil > now) {
    return publicStoreCache;
  }

  const publicStore = scopeStoreForUser(await getStoreData(), null);
  publicStoreCache = publicStore;
  publicStoreCacheUntil = now + runtimeConfig.publicCacheSeconds * 1000;
  return publicStore;
}

function setPublicCacheHeaders(response) {
  if (runtimeConfig.publicCacheSeconds > 0) {
    response.setHeader("Cache-Control", `public, max-age=${runtimeConfig.publicCacheSeconds}, stale-while-revalidate=15`);
  } else {
    response.setHeader("Cache-Control", "no-cache");
  }
}

function isUserLocked(user) {
  return user.locked_until && new Date(user.locked_until).getTime() > Date.now();
}

function lockedMessage(user) {
  const unlockDate = new Date(user.locked_until);
  return `Cuenta bloqueada temporalmente. Intenta de nuevo despues de ${unlockDate.toLocaleString("es-MX")}.`;
}

async function registerFailedLogin(user, email) {
  if (!user) {
    await logAudit({
      action: "login_failed",
      entityType: "auth",
      detail: `Intento fallido para correo no registrado o inactivo: ${email}`
    });
    return;
  }

  const previousLockExpired = user.locked_until && new Date(user.locked_until).getTime() <= Date.now();
  const nextFailedCount = (previousLockExpired ? 0 : Number(user.failed_login_count || 0)) + 1;
  const lockedUntil = nextFailedCount >= LOGIN_MAX_ATTEMPTS
    ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000).toISOString()
    : null;

  await registerFailedLoginData(user, lockedUntil, nextFailedCount);

  await logAudit({
    user: toPublicUser(user),
    leagueId: user.league_id,
    action: lockedUntil ? "login_locked" : "login_failed",
    entityType: "user",
    entityId: user.id,
    detail: lockedUntil
      ? `Cuenta bloqueada por ${nextFailedCount} intentos fallidos`
      : `Intento fallido ${nextFailedCount} de ${LOGIN_MAX_ATTEMPTS}`
  });
}

async function clearLoginLock(userId) {
  await clearLoginLockData(userId);
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    provider: DATABASE_PROVIDER,
    database: runtimeConfig.isProduction ? DATABASE_PROVIDER : DATABASE_LABEL
  });
});

app.post("/api/auth/login", loginIpLimiter, async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  if (!validateEmail(email)) {
    return response.status(401).json({ error: "Correo o contraseña incorrectos" });
  }
  const user = await getActiveUserByEmail(email);

  if (user && isUserLocked(user)) {
    await logAudit({
      user: toPublicUser(user),
      leagueId: user.league_id,
      action: "login_blocked",
      entityType: "user",
      entityId: user.id,
      detail: "Intento de acceso durante bloqueo temporal"
    });
    return response.status(423).json({ error: lockedMessage(user) });
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    await registerFailedLogin(user, email);
    return response.status(401).json({ error: "Correo o contraseña incorrectos" });
  }

  await clearLoginLock(user.id);

  await logAudit({
    user: toPublicUser(user),
    leagueId: user.league_id,
    action: "login",
    entityType: "user",
    entityId: user.id,
    detail: "Inicio de sesion"
  });

  response.json({
    token: createToken(user),
    user: toPublicUser({ ...user, failed_login_count: 0, locked_until: null })
  });
});

app.get("/api/auth/me", async (request, response) => {
  const user = await getAuthUser(request);
  if (!user) return response.status(401).json({ error: "Sesion invalida" });
  response.json({ user });
});

app.post("/api/uploads/images", requireAuth, async (request, response) => {
  const leagueId = String(request.body.leagueId || request.user.leagueId || "").trim();
  if (leagueId && !canManageLeague(request.user, leagueId)) {
    return response.status(403).json({ error: "No puedes subir imagenes para esta liga" });
  }

  const url = await uploadImageDataUrl({
    dataUrl: request.body.dataUrl,
    leagueId,
    scope: request.body.scope,
    user: request.user
  });

  await logAudit({
    user: request.user,
    leagueId,
    action: "image_upload",
    entityType: "upload",
    detail: `Subio imagen ${request.body.scope || "general"}`
  });

  response.status(201).json({
    provider: runtimeConfig.imageStorageProvider,
    url
  });
});

app.post("/api/auth/request-password-reset", passwordResetLimiter, async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  if (!validateEmail(email)) {
    return response.json({ message: "Si el correo existe, se genero una solicitud de recuperacion." });
  }
  const user = await getActiveUserByEmail(email);
  if (!user) {
    return response.json({ message: "Si el correo existe, se genero una solicitud de recuperacion." });
  }

  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const id = `reset-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 20).toISOString();
  await createPasswordResetData({ id, userId: user.id, codeHash: hashPassword(code), expiresAt });

  await logAudit({
    user: toPublicUser(user),
    leagueId: user.league_id,
    action: "password_reset_request",
    entityType: "user",
    entityId: user.id,
    detail: "Solicito recuperacion de contraseña"
  });

  const payload = {
    message: SHOW_RECOVERY_CODE_IN_RESPONSE
      ? "Codigo de recuperacion generado. En produccion se enviaria por correo o WhatsApp."
      : "Solicitud generada. Si el correo existe, recibiras instrucciones por el canal configurado.",
    expiresAt
  };

  if (SHOW_RECOVERY_CODE_IN_RESPONSE) payload.recoveryCode = code;
  response.json(payload);
});

app.post("/api/auth/reset-password", passwordResetCompleteLimiter, async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const code = String(request.body.code || "").trim().toUpperCase();
  const password = String(request.body.password || "");
  const passwordError = requireStrongPassword(password);
  if (!validateEmail(email) || !code || passwordError) {
    return response.status(400).json({ error: passwordError || "Correo y codigo son requeridos" });
  }

  const user = await getActiveUserByEmail(email);
  if (!user) return response.status(400).json({ error: "Solicitud invalida o expirada" });

  const requests = await listActivePasswordResetRequests(user.id);
  const resetRequest = requests.find((item) => verifyPassword(code, item.code_hash));
  if (!resetRequest) return response.status(400).json({ error: "Solicitud invalida o expirada" });

  await updatePasswordData(user.id, hashPassword(password));
  await clearLoginLock(user.id);
  await markPasswordResetUsed(resetRequest.id);

  await logAudit({
    user: toPublicUser(user),
    leagueId: user.league_id,
    action: "password_reset_complete",
    entityType: "user",
    entityId: user.id,
    detail: "Restablecio contraseña con codigo"
  });

  response.json({ message: "Contraseña actualizada. Ya puedes iniciar sesion." });
});

app.get("/api/store", async (request, response) => {
  const user = await getAuthUser(request);
  if (!user) {
    setPublicCacheHeaders(response);
    return response.json(await getPublicStoreCached());
  }
  response.setHeader("Cache-Control", "no-store");
  response.json(scopeStoreForUser(await getStoreData(), user));
});

app.put("/api/store", requireAuth, async (request, response) => {
  if (!validateStorePayload(request.body)) {
    return response.status(400).json({ error: "Estado invalido o incompleto" });
  }

  if (request.user.role === "super_admin") {
    const nextStore = await importStoreData(request.body);
    clearPublicCache();
    await logAudit({
      user: request.user,
      action: "store_save",
      entityType: "store",
      detail: "Super admin guardo estado completo"
    });
    return response.json(nextStore);
  }

  if (request.user.role !== "league_admin" || !request.user.leagueId) {
    return response.status(403).json({ error: "Permiso insuficiente" });
  }

  const currentStore = await getStoreData();
  const currentLeague = currentStore.leagues.find((league) => league.id === request.user.leagueId);
  if (!currentLeague || currentLeague.status !== "active") {
    return response.status(403).json({ error: "La liga esta suspendida o no existe" });
  }

  const incomingLeague = request.body.leagues?.find((league) => league.id === request.user.leagueId);
  if (!incomingLeague) return response.status(400).json({ error: "No se encontro la liga asignada en la solicitud" });

  const protectedLeague = {
    ...incomingLeague,
    status: currentLeague.status,
    ownerEmail: currentLeague.ownerEmail || "",
    renewalDate: currentLeague.renewalDate || "",
    membershipNotes: currentLeague.membershipNotes || "",
    plan: currentLeague.plan || "",
    sponsors: currentLeague.sponsors || []
  };

  const mergedStore = {
    ...currentStore,
    currentLeagueId: request.user.leagueId,
    leagues: currentStore.leagues.map((league) => (league.id === request.user.leagueId ? protectedLeague : league))
  };

  const nextStore = await importStoreData(mergedStore);
  clearPublicCache();
  await logAudit({
    user: request.user,
    leagueId: request.user.leagueId,
    action: "league_save",
    entityType: "league",
    entityId: request.user.leagueId,
    detail: "Admin de liga guardo cambios operativos"
  });
  response.json(nextStore);
});

app.get("/api/leagues", async (request, response) => {
  const user = await getAuthUser(request);
  if (!user) {
    setPublicCacheHeaders(response);
    return response.json((await getPublicStoreCached()).leagues);
  }
  response.setHeader("Cache-Control", "no-store");
  response.json(scopeStoreForUser(await getStoreData(), user).leagues);
});

app.delete("/api/leagues/:leagueId", requireSuperAdmin, async (request, response) => {
  const currentStore = await getStoreData();
  const league = currentStore.leagues.find((item) => item.id === request.params.leagueId);
  if (!league) return response.status(404).json({ error: "Liga no encontrada" });

  if (currentStore.leagues.length <= 1) return response.status(400).json({ error: "No se puede eliminar la unica liga registrada" });

  const removedAdmins = await countLeagueAdmins(league.id);
  const nextStore = await importStoreData({
    ...currentStore,
    currentLeagueId: currentStore.leagues.find((item) => item.id !== league.id)?.id,
    leagues: currentStore.leagues.filter((item) => item.id !== league.id)
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId: league.id,
    action: "league_delete",
    entityType: "league",
    entityId: league.id,
    detail: `Elimino liga ${league.name} y ${removedAdmins} usuario(s) admin de liga`
  });

  response.json({ store: nextStore, removedAdmins });
});

app.get("/api/users", requireSuperAdmin, async (_request, response) => {
  const users = await listUsersData();
  response.json(users.map(toPublicUser));
});

app.get("/api/audit-logs", requireSuperAdmin, async (request, response) => {
  response.json(await listAuditLogs(Number(request.query.limit || 80)));
});

app.post("/api/users", requireSuperAdmin, async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  const passwordError = requireStrongPassword(password);
  if (!email || !password || !request.body.name || !request.body.role) {
    return response.status(400).json({ error: "Nombre, correo, rol y contraseña son requeridos" });
  }
  if (!validateEmail(email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserRole(request.body.role)) return response.status(400).json({ error: "Rol invalido" });
  if (request.body.status && !validateUserStatus(request.body.status)) return response.status(400).json({ error: "Estado invalido" });
  if (request.body.role === "league_admin" && !request.body.leagueId) {
    return response.status(400).json({ error: "Un admin de liga debe estar asignado a una liga" });
  }
  if (passwordError) return response.status(400).json({ error: passwordError });

  const id = `user-${crypto.randomUUID()}`;
  const user = await createUserData({
    id,
    leagueId: request.body.leagueId || null,
    name: request.body.name,
    email,
    role: request.body.role,
    status: request.body.status || "active",
    passwordHash: hashPassword(password)
  });
  await logAudit({
    user: request.user,
    leagueId: user.league_id,
    action: "user_create",
    entityType: "user",
    entityId: user.id,
    detail: `Creo usuario ${user.email} (${user.role})`
  });
  response.status(201).json(toPublicUser(user));
});

app.patch("/api/users/:userId", requireSuperAdmin, async (request, response) => {
  const current = await getUserById(request.params.userId);
  if (!current) return response.status(404).json({ error: "Usuario no encontrado" });

  const next = {
    leagueId: request.body.leagueId === "" ? null : request.body.leagueId ?? current.league_id,
    name: request.body.name ?? current.name,
    email: request.body.email ? String(request.body.email).trim().toLowerCase() : current.email,
    role: request.body.role ?? current.role,
    status: request.body.status ?? current.status
  };
  if (!validateEmail(next.email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserRole(next.role)) return response.status(400).json({ error: "Rol invalido" });
  if (!validateUserStatus(next.status)) return response.status(400).json({ error: "Estado invalido" });
  if (next.role === "league_admin" && !next.leagueId) {
    return response.status(400).json({ error: "Un admin de liga debe estar asignado a una liga" });
  }

  if (current.id === request.user.id && (next.role !== "super_admin" || next.status !== "active")) {
    return response.status(400).json({ error: "No puedes quitarte permisos de super admin ni deshabilitar tu propia sesion" });
  }

  const remainsActiveSuperAdmin = next.role === "super_admin" && next.status === "active";
  if (current.role === "super_admin" && !remainsActiveSuperAdmin && await countActiveSuperAdminsExcept(current.id) < 1) {
    return response.status(400).json({ error: "Debe quedar al menos un super admin activo" });
  }

  const nextPassword = request.body.password ? String(request.body.password) : "";
  const passwordError = nextPassword ? requireStrongPassword(nextPassword) : "";
  if (passwordError) return response.status(400).json({ error: passwordError });

  const user = await updateUserData(current.id, {
    ...next,
    passwordHash: nextPassword ? hashPassword(nextPassword) : null
  });
  await logAudit({
    user: request.user,
    leagueId: user.league_id,
    action: "user_update",
    entityType: "user",
    entityId: user.id,
    detail: `Actualizo usuario ${user.email}`
  });
  response.json(toPublicUser(user));
});

app.delete("/api/users/:userId", requireSuperAdmin, async (request, response) => {
  const user = await getUserById(request.params.userId);
  if (!user) return response.status(404).json({ error: "Usuario no encontrado" });
  if (user.id === request.user.id) {
    return response.status(400).json({ error: "No puedes deshabilitar ni eliminar tu propia sesion" });
  }
  if (user.role === "super_admin" && await countActiveSuperAdminsExcept(user.id) < 1) {
    return response.status(400).json({ error: "Debe quedar al menos un super admin activo" });
  }

  if (request.query.mode === "permanent") {
    await deleteUserData(user.id);
    await logAudit({
      user: request.user,
      leagueId: user.league_id,
      action: "user_delete",
      entityType: "user",
      entityId: user.id,
      detail: `Elimino usuario ${user.email}`
    });
    return response.json({ deleted: true, user: toPublicUser(user) });
  }

  const disabledUser = await disableUserData(user.id);
  await logAudit({
    user: request.user,
    leagueId: disabledUser.league_id,
    action: "user_disable",
    entityType: "user",
    entityId: disabledUser.id,
    detail: `Deshabilito usuario ${disabledUser.email}`
  });
  response.json(toPublicUser(disabledUser));
});

app.get("/api/leagues/:leagueId/rules", async (request, response) => {
  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === request.params.leagueId);
  if (!league) return response.status(404).json({ error: "Liga no encontrada" });
  response.json(league.rules);
});

app.patch("/api/leagues/:leagueId/rules", requireAuth, async (request, response) => {
  if (!canManageLeague(request.user, request.params.leagueId)) {
    return response.status(403).json({ error: "No puedes modificar esta liga" });
  }

  const store = await getStoreData();
  const currentLeague = store.leagues.find((item) => item.id === request.params.leagueId);
  if (!currentLeague) return response.status(404).json({ error: "Liga no encontrada" });
  const current = currentLeague.rules || {};

  const next = {
    withdrawalPolicy: request.body.withdrawalPolicy || current.withdrawalPolicy,
    forfeitPoints: Number(request.body.forfeitPoints ?? current.forfeitPoints),
    forfeitGoalsFor: Number(request.body.forfeitGoalsFor ?? current.forfeitGoalsFor),
    forfeitGoalsAgainst: Number(request.body.forfeitGoalsAgainst ?? current.forfeitGoalsAgainst),
    yellowSuspensionLimit: Number(request.body.yellowSuspensionLimit ?? current.yellowSuspensionLimit),
    defaultRedSuspensionMatches: Number(request.body.defaultRedSuspensionMatches ?? current.defaultRedSuspensionMatches ?? 1),
    disciplineScope: request.body.disciplineScope === "league" ? "league" : "competition",
    playoffQualifiers: Number(request.body.playoffQualifiers ?? current.playoffQualifiers ?? 8),
    notes: request.body.notes ?? current.notes
  };

  const nextStore = await importStoreData({
    ...store,
    leagues: store.leagues.map((league) => (
      league.id === request.params.leagueId ? { ...league, rules: { ...current, ...next } } : league
    ))
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId: request.params.leagueId,
    action: "rules_update",
    entityType: "league_rules",
    entityId: request.params.leagueId,
    detail: `Actualizo reglas: default ${next.forfeitGoalsFor}-${next.forfeitGoalsAgainst}, amarillas ${next.yellowSuspensionLimit}, roja ${next.defaultRedSuspensionMatches}, liguilla ${next.playoffQualifiers}`
  });

  response.json(nextStore);
});

app.post("/api/leagues/:leagueId/teams/:teamId/withdraw", requireAuth, async (request, response) => {
  const { leagueId, teamId } = request.params;
  if (!canManageLeague(request.user, leagueId)) {
    return response.status(403).json({ error: "No puedes modificar esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  const team = league?.teams.find((item) => item.id === teamId);
  if (!league || !team) return response.status(404).json({ error: "Liga o equipo no encontrado" });
  const rules = league.rules || {};

  const round = Number(request.body.round || 0);
  const reason = request.body.reason || "Baja a medio torneo";

  const nextLeague = {
    ...league,
    teams: league.teams.map((item) => (
      item.id === teamId ? { ...item, status: "withdrawn", withdrawnRound: round || null, withdrawnReason: reason } : item
    )),
    matches: league.matches.map((match) => {
      const shouldResolve = rules.withdrawalPolicy === "award_walkover" &&
        match.status === "scheduled" &&
        (match.homeTeamId === teamId || match.awayTeamId === teamId) &&
        (!round || Number(match.round) >= round);
      if (!shouldResolve) return match;
      const withdrawnIsHome = match.homeTeamId === teamId;
      return {
        ...match,
        status: "walkover",
        resolutionType: "team_withdrawal",
        resolutionNote: reason,
        homeGoals: withdrawnIsHome ? rules.forfeitGoalsAgainst : rules.forfeitGoalsFor,
        awayGoals: withdrawnIsHome ? rules.forfeitGoalsFor : rules.forfeitGoalsAgainst,
        events: []
      };
    })
  };
  const nextStore = await importStoreData({
    ...store,
    leagues: store.leagues.map((item) => (item.id === leagueId ? nextLeague : item))
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "team_withdraw",
    entityType: "team",
    entityId: teamId,
    detail: `Marco baja de ${team.name} desde jornada ${round || "actual"}: ${reason}`
  });
  response.json(nextStore);
});

app.post("/api/matches/:matchId/walkover", requireAuth, async (request, response) => {
  const store = await getStoreData();
  const league = store.leagues.find((item) => item.matches.some((match) => match.id === request.params.matchId));
  const match = league?.matches.find((item) => item.id === request.params.matchId);
  if (!match) return response.status(404).json({ error: "Partido no encontrado" });
  if (!canManageLeague(request.user, league.id)) {
    return response.status(403).json({ error: "No puedes modificar esta liga" });
  }

  const winnerTeamId = request.body.winnerTeamId;
  const rules = league.rules || {};
  if (![match.homeTeamId, match.awayTeamId].includes(winnerTeamId)) {
    return response.status(400).json({ error: "El ganador debe ser local o visitante" });
  }

  const winnerIsHome = winnerTeamId === match.homeTeamId;
  const nextLeague = {
    ...league,
    matches: league.matches.map((item) => (
      item.id === match.id
        ? {
            ...item,
            status: "walkover",
            resolutionType: "administrative_default",
            resolutionNote: request.body.note || "Triunfo administrativo por default",
            homeGoals: winnerIsHome ? rules.forfeitGoalsFor : rules.forfeitGoalsAgainst,
            awayGoals: winnerIsHome ? rules.forfeitGoalsAgainst : rules.forfeitGoalsFor,
            events: []
          }
        : item
    ))
  };
  const nextStore = await importStoreData({
    ...store,
    leagues: store.leagues.map((item) => (item.id === league.id ? nextLeague : item))
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId: league.id,
    action: "match_walkover",
    entityType: "match",
    entityId: match.id,
    detail: `Resolvio partido por default administrativo. Ganador: ${winnerTeamId}`
  });

  response.json(nextStore);
});

if (runtimeConfig.serveStatic) {
  if (!fs.existsSync(DIST_INDEX)) {
    throw new Error("SERVE_STATIC esta activo, pero no existe dist/index.html. Ejecuta npm run build antes de iniciar produccion.");
  }

  app.use(express.static(DIST_DIR, {
    index: false,
    immutable: runtimeConfig.isProduction,
    maxAge: runtimeConfig.isProduction ? "1y" : 0,
    setHeaders: (response, filePath) => {
      const filename = path.basename(filePath);
      if (filename === "index.html" || filename === "service-worker.js" || filename === "site.webmanifest") {
        response.setHeader("Cache-Control", "no-cache");
      }
    }
  }));

  app.use((request, response, next) => {
    if (!["GET", "HEAD"].includes(request.method)) return next();
    if (request.path.startsWith("/api/")) return next();
    if (!request.accepts("html")) return next();
    response.setHeader("Cache-Control", "no-cache");
    return response.sendFile(DIST_INDEX);
  });
}

app.use((_request, response) => {
  response.status(404).json({ error: "Ruta no encontrada" });
});

app.use((error, _request, response, _next) => {
  console.error("Error API:", error);
  response.status(error.status || 500).json({
    error: runtimeConfig.isProduction ? "Error interno del servidor" : error.message
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`API lista en http://${HOST}:${PORT}`);
  console.log(`Datos: ${DATABASE_PROVIDER} (${DATABASE_LABEL})`);
});

server.on("error", (error) => {
  console.error("No se pudo iniciar la API:", error.message);
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(`Recibido ${signal}. Cerrando servidor...`);
  server.close(async () => {
    try {
      await postgresPool?.end();
    } catch (error) {
      console.error("No se pudo cerrar Postgres:", error.message);
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.error("Cierre forzado por timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

import "./env.js";
import cors from "cors";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "./env.js";
import { listAuditLogs, logAudit } from "./audit.js";
import { createToken, getAuthUser, requireAuth, requireSuperAdmin, toPublicUser } from "./auth.js";
import { sendPasswordResetEmail } from "./mailer.js";
import {
  clearLoginLockData,
  activateRefereeUserData,
  countActiveSuperAdminsExcept,
  countLeagueAdmins,
  countTeamDelegateAssignmentsData,
  createRefereeMatchSheetData,
  createRefereeActivationData,
  createRefereeProfileData,
  createTeamDelegateActivationData,
  createTeamDelegateAssignmentData,
  createPasswordResetData,
  createTeamPortalPlayerData,
  createUserData,
  DATABASE_LABEL,
  DATABASE_PROVIDER,
  deleteTeamDelegateAssignmentData,
  deleteUserData,
  disableUserData,
  getActiveUserByEmail,
  getStoreData,
  getPendingRefereeMatchSheetForMatchData,
  getRefereeActivationByHashData,
  getRefereeMatchSheetData,
  getRefereeProfileData,
  getTeamDelegateContextData,
  getTeamDelegateActivationByHashData,
  getUserById,
  importStoreData,
  initializeData,
  listActivePasswordResetRequests,
  listRefereeMatchSheetsData,
  listRefereeMatchSheetsForRefereeData,
  listRefereesData,
  listTeamDelegatesData,
  listTeamPortalPlayersData,
  listUsersData,
  markPasswordResetUsed,
  markRefereeActivationUsedData,
  markTeamDelegateActivationUsedData,
  registerFailedLoginData,
  revokeRefereeActivationsData,
  setTeamRosterPermissionData,
  revokeTeamDelegateActivationsData,
  activateTeamDelegateUserData,
  updateTeamDelegateStatusData,
  updateMatchRefereesData,
  updateRefereeMatchSheetReviewData,
  updateRefereeStatusData,
  updateTeamLogoData,
  updatePasswordData,
  updateTeamPortalPlayerData,
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
import { findDuplicatePlayer, validatePlayerFullName } from "../src/lib/playerValidation.js";
import { getEligiblePlayersForTeam, upperText } from "../src/lib/domain.js";
import { saveMatchSheet } from "../src/lib/actions.js";

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

const activationLimiter = createRateLimiter({
  windowMs: runtimeConfig.activationWindowMinutes * 60 * 1000,
  max: runtimeConfig.activationMaxRequests,
  keyGenerator: (request) => `activation:${request.ip}`
});

const uploadLimiter = createRateLimiter({
  windowMs: runtimeConfig.uploadWindowMinutes * 60 * 1000,
  max: runtimeConfig.uploadMaxRequests,
  keyGenerator: (request) => `upload:${request.ip}:${request.user?.id || "anonymous"}`
});

function canManageLeague(user, leagueId) {
  return user.role === "super_admin" || (user.role === "league_admin" && user.leagueId === leagueId);
}

function isPortalOnlyRole(role) {
  return role === "team_delegate" || role === "referee";
}

function hashActivationToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function getAppBaseUrl(request) {
  const configured = String(runtimeConfig.appBaseUrl || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${request.protocol}://${request.get("host")}`;
}

async function createDelegateInvitation({ request, userId, assignmentId, delegateName, teamName }) {
  await revokeTeamDelegateActivationsData(userId);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + runtimeConfig.delegateActivationHours * 60 * 60 * 1000).toISOString();
  const activation = await createTeamDelegateActivationData({
    id: `delegate-activation-${crypto.randomUUID()}`,
    userId,
    assignmentId,
    tokenHash: hashActivationToken(rawToken),
    expiresAt
  });
  const activationUrl = `${getAppBaseUrl(request)}/activar-delegado/${encodeURIComponent(rawToken)}`;
  const whatsappMessage = [
    `Hola ${delegateName}, has sido registrado como delegado del equipo ${teamName} en LIGATEC.`,
    "Para activar tu cuenta, entra al siguiente enlace:",
    activationUrl,
    "Ahi podras crear tu contrasena y posteriormente administrar unicamente la plantilla de tu equipo."
  ].join("\n");

  return {
    activationUrl,
    expiresAt: activation?.expiresAt || expiresAt,
    whatsappMessage
  };
}

async function createRefereeInvitation({ request, userId, refereeName, municipality }) {
  await revokeRefereeActivationsData(userId);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + runtimeConfig.delegateActivationHours * 60 * 60 * 1000).toISOString();
  const activation = await createRefereeActivationData({
    id: `referee-activation-${crypto.randomUUID()}`,
    userId,
    tokenHash: hashActivationToken(rawToken),
    expiresAt
  });
  const activationUrl = `${getAppBaseUrl(request)}/activar-arbitro/${encodeURIComponent(rawToken)}`;
  const whatsappMessage = [
    `Hola ${refereeName}, has sido registrado como arbitro de ${municipality} en LIGATEC.`,
    "Para activar tu cuenta, entra al siguiente enlace:",
    activationUrl,
    "Ahi podras crear tu contrasena y posteriormente ver tus partidos asignados."
  ].join("\n");

  return {
    activationUrl,
    expiresAt: activation?.expiresAt || expiresAt,
    whatsappMessage
  };
}

function getActivationProblem(activation) {
  if (!activation) return "La invitacion no existe o el enlace es invalido.";
  if (activation.revokedAt) return "Esta invitacion fue reemplazada por una mas reciente.";
  if (activation.usedAt) return "Esta invitacion ya fue utilizada.";
  if (new Date(activation.expiresAt).getTime() <= Date.now()) return "Esta invitacion expiro.";
  if (activation.userStatus === "deleted" || activation.userStatus === "disabled" || activation.userStatus === "suspended") {
    return "Esta cuenta no esta disponible. Solicita una nueva invitacion al administrador.";
  }
  if (activation.assignmentStatus === "deleted" || activation.assignmentStatus === "disabled" || activation.assignmentStatus === "suspended") {
    return "Este acceso al equipo no esta disponible. Solicita una nueva invitacion al administrador.";
  }
  if (activation.userStatus !== "pending_activation") return "Esta cuenta no esta pendiente de activacion.";
  if (activation.assignmentStatus !== "pending_activation") return "Este acceso al equipo no esta pendiente de activacion.";
  return "";
}

function getRefereeActivationProblem(activation) {
  if (!activation) return "La invitacion no existe o el enlace es invalido.";
  if (activation.revokedAt) return "Esta invitacion fue reemplazada por una mas reciente.";
  if (activation.usedAt) return "Esta invitacion ya fue utilizada.";
  if (new Date(activation.expiresAt).getTime() <= Date.now()) return "Esta invitacion expiro.";
  if (activation.userStatus === "deleted" || activation.userStatus === "disabled" || activation.userStatus === "suspended") {
    return "Esta cuenta no esta disponible. Solicita una nueva invitacion al administrador.";
  }
  if (activation.userStatus !== "pending_activation") return "Esta cuenta no esta pendiente de activacion.";
  return "";
}

function parseIntegerInRange(value, fallback, { min, max, label }) {
  const next = Number(value ?? fallback);
  if (!Number.isInteger(next) || next < min || next > max) {
    const error = new Error(`${label} debe ser un numero entero entre ${min} y ${max}.`);
    error.status = 400;
    throw error;
  }
  return next;
}

async function getLeagueAndTeam(leagueId, teamId) {
  const store = await getStoreData();
  const league = (store.leagues || []).find((item) => item.id === leagueId);
  const team = league?.teams?.find((item) => item.id === teamId);
  return { league, team };
}

async function getLeagueById(leagueId) {
  const store = await getStoreData();
  return (store.leagues || []).find((item) => item.id === leagueId) || null;
}

async function getLeagueAdminMunicipality(user) {
  if (user.role !== "league_admin" || !user.leagueId) return "";
  const league = await getLeagueById(user.leagueId);
  return String(league?.city || "").trim().toUpperCase();
}

async function canManageMunicipality(user, municipality) {
  if (user.role === "super_admin") return true;
  if (user.role !== "league_admin") return false;
  return upperText(municipality) === await getLeagueAdminMunicipality(user);
}

function buildRefereePortalPayload(store, referee, userId, refereeSheets = []) {
  const sheetByMatchId = new Map();
  for (const sheet of refereeSheets.filter((item) => item.status === "pending_review" || item.status === "rejected")) {
    if (!sheetByMatchId.has(sheet.matchId)) sheetByMatchId.set(sheet.matchId, sheet);
  }
  const assignedMatches = [];
  for (const league of store.leagues || []) {
    if (upperText(league.city || "") !== upperText(referee.municipality)) continue;
    for (const match of league.matches || []) {
      const refereeRole = match.centralRefereeUserId === userId
        ? "central"
        : match.assistantReferee1UserId === userId
        ? "auxiliar_1"
        : match.assistantReferee2UserId === userId
        ? "auxiliar_2"
        : match.fourthRefereeUserId === userId
        ? "cuarto_arbitro"
        : "";
      if (!refereeRole) continue;
      const competition = (league.competitions || []).find((item) => item.id === match.competitionId);
      const homeTeam = (league.teams || []).find((item) => item.id === match.homeTeamId);
      const awayTeam = (league.teams || []).find((item) => item.id === match.awayTeamId);
      const reviewSheet = sheetByMatchId.get(match.id);
      const reviewPayload = reviewSheet?.payload || {};
      const hasPendingReview = reviewSheet?.status === "pending_review";
      assignedMatches.push({
        id: match.id,
        leagueId: league.id,
        leagueName: league.name,
        competitionId: match.competitionId,
        competitionName: competition?.name || "",
        round: match.round,
        date: match.date,
        time: match.time,
        venue: match.venue,
        status: match.status,
        homeGoals: reviewSheet ? reviewPayload.homeGoals : match.homeGoals,
        awayGoals: reviewSheet ? reviewPayload.awayGoals : match.awayGoals,
        observations: match.observations || "",
        events: reviewSheet ? reviewPayload.events || [] : match.events || [],
        sheetReviewId: reviewSheet?.id || "",
        sheetReviewStatus: reviewSheet?.status || "",
        sheetReviewNote: reviewSheet?.reviewNote || "",
        sheetSubmittedAt: reviewSheet?.submittedAt || "",
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeTeamName: homeTeam?.name || "LOCAL",
        awayTeamName: awayTeam?.name || "VISITANTE",
        homePlayers: getEligiblePlayersForTeam(league, match.homeTeamId).map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
          position: player.position,
          teamId: player.teamId
        })),
        awayPlayers: getEligiblePlayersForTeam(league, match.awayTeamId).map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
          position: player.position,
          teamId: player.teamId
        })),
        refereeRole,
        canCapture: refereeRole === "central" && !hasPendingReview && match.status !== "finished" && match.status !== "walkover"
      });
    }
  }
  assignedMatches.sort((a, b) => (
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || ""))
  ));
  return {
    referee,
    pendingMatches: assignedMatches.filter((match) => match.canCapture),
    history: assignedMatches.filter((match) => !match.canCapture)
  };
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

app.post("/api/uploads/images", requireAuth, uploadLimiter, async (request, response) => {
  const leagueId = String(request.body.leagueId || request.user.leagueId || "").trim();
  let canUploadForLeague = !leagueId || canManageLeague(request.user, leagueId);

  if (!canUploadForLeague && request.user.role === "team_delegate") {
    const context = await getTeamDelegateContextData(request.user.id);
    canUploadForLeague = Boolean(
      context &&
      context.leagueId === leagueId &&
      (request.body.scope === "team-logos" || context.canManageRoster)
    );
  }

  if (leagueId && !canUploadForLeague) {
    return response.status(403).json({ error: "No puedes subir imagenes para esta liga" });
  }
  if (request.user.role === "team_delegate" && !["player-photos", "team-logos"].includes(request.body.scope)) {
    return response.status(403).json({ error: "Los delegados solo pueden subir fotos de jugadores o escudo de su equipo." });
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
  const delivery = await sendPasswordResetEmail({ to: email, code, expiresAt });

  await logAudit({
    user: toPublicUser(user),
    leagueId: user.league_id,
    action: "password_reset_request",
    entityType: "user",
    entityId: user.id,
    detail: delivery.sent
      ? "Solicito recuperacion de contraseña. Codigo enviado por correo."
      : `Solicito recuperacion de contraseña. Correo no enviado: ${delivery.reason || "sin detalle"}`
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

app.get("/api/team-delegate-activations/:token", activationLimiter, async (request, response) => {
  const activation = await getTeamDelegateActivationByHashData(hashActivationToken(request.params.token));
  const problem = getActivationProblem(activation);
  if (problem) {
    return response.status(400).json({
      valid: false,
      error: problem,
      message: "Solicita una nueva invitacion al administrador de la liga."
    });
  }

  response.json({
    valid: true,
    delegateName: activation.userName,
    teamName: activation.teamName,
    leagueName: activation.leagueName,
    expiresAt: activation.expiresAt
  });
});

app.post("/api/team-delegate-activations/:token", activationLimiter, async (request, response) => {
  const activation = await getTeamDelegateActivationByHashData(hashActivationToken(request.params.token));
  const problem = getActivationProblem(activation);
  if (problem) {
    return response.status(400).json({
      valid: false,
      error: problem,
      message: "Solicita una nueva invitacion al administrador de la liga."
    });
  }

  const password = String(request.body.password || "");
  const confirmPassword = String(request.body.confirmPassword || "");
  if (password !== confirmPassword) {
    return response.status(400).json({ error: "Las contraseñas no coinciden." });
  }
  const passwordError = requireStrongPassword(password);
  if (passwordError) return response.status(400).json({ error: passwordError });

  const user = await activateTeamDelegateUserData({
    userId: activation.userId,
    assignmentId: activation.assignmentId,
    passwordHash: hashPassword(password)
  });
  await markTeamDelegateActivationUsedData(activation.id);

  await logAudit({
    user: toPublicUser(user),
    leagueId: activation.leagueId,
    action: "team_delegate_activation",
    entityType: "user",
    entityId: activation.userId,
    detail: `Delegado activo cuenta para ${activation.teamName}`
  });

  response.json({
    message: "Cuenta activada correctamente.",
    token: createToken(user),
    user: toPublicUser(user)
  });
});

app.get("/api/referee-activations/:token", activationLimiter, async (request, response) => {
  const activation = await getRefereeActivationByHashData(hashActivationToken(request.params.token));
  const problem = getRefereeActivationProblem(activation);
  if (problem) {
    return response.status(400).json({
      valid: false,
      error: problem,
      message: "Solicita una nueva invitacion al administrador de la liga."
    });
  }

  response.json({
    valid: true,
    refereeName: activation.userName,
    municipality: activation.municipality,
    expiresAt: activation.expiresAt
  });
});

app.post("/api/referee-activations/:token", activationLimiter, async (request, response) => {
  const activation = await getRefereeActivationByHashData(hashActivationToken(request.params.token));
  const problem = getRefereeActivationProblem(activation);
  if (problem) {
    return response.status(400).json({
      valid: false,
      error: problem,
      message: "Solicita una nueva invitacion al administrador de la liga."
    });
  }

  const password = String(request.body.password || "");
  const confirmPassword = String(request.body.confirmPassword || "");
  if (password !== confirmPassword) return response.status(400).json({ error: "Las contraseñas no coinciden." });
  const passwordError = requireStrongPassword(password);
  if (passwordError) return response.status(400).json({ error: passwordError });

  const user = await activateRefereeUserData({
    userId: activation.userId,
    passwordHash: hashPassword(password)
  });
  await markRefereeActivationUsedData(activation.id);

  await logAudit({
    user: toPublicUser(user),
    action: "referee_activation",
    entityType: "user",
    entityId: activation.userId,
    detail: `Arbitro activo para ${activation.municipality}`
  });

  response.json({
    message: "Cuenta activada correctamente.",
    token: createToken(user),
    user: toPublicUser(user)
  });
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

app.get("/api/team-delegates", requireAuth, async (request, response) => {
  const leagueId = String(request.query.leagueId || request.user.leagueId || "");
  if (leagueId && !canManageLeague(request.user, leagueId)) {
    return response.status(403).json({ error: "No puedes ver delegados de esta liga" });
  }
  if (!leagueId && request.user.role !== "super_admin") {
    return response.status(403).json({ error: "Selecciona una liga valida" });
  }
  response.json(await listTeamDelegatesData(leagueId));
});

app.post("/api/team-delegates", requireAuth, async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const phone = String(request.body.phone || "").trim();
  const name = String(request.body.name || "").trim();
  const leagueId = String(request.body.leagueId || request.user.leagueId || "").trim();
  const teamId = String(request.body.teamId || "").trim();
  const status = "pending_activation";

  if (!canManageLeague(request.user, leagueId)) {
    return response.status(403).json({ error: "No puedes crear delegados para esta liga" });
  }
  const { league, team } = await getLeagueAndTeam(leagueId, teamId);
  if (!league || !team) return response.status(400).json({ error: "Equipo invalido para esta liga" });
  if (!email || !phone || !name) return response.status(400).json({ error: "Nombre, telefono y correo son requeridos" });
  if (!validateEmail(email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserStatus(status)) return response.status(400).json({ error: "Estado invalido" });

  const userId = `user-${crypto.randomUUID()}`;
  const assignmentId = `delegate-${crypto.randomUUID()}`;
  let user;
  let invitation;
  try {
    user = await createUserData({
      id: userId,
      leagueId,
      name,
      email,
      phone,
      role: "team_delegate",
      status,
      passwordHash: null
    });
    await createTeamDelegateAssignmentData({ id: assignmentId, leagueId, teamId, userId, status });
    invitation = await createDelegateInvitation({
      request,
      userId,
      assignmentId,
      delegateName: name,
      teamName: team.name
    });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return response.status(409).json({ error: "Ya existe un usuario con ese correo." });
    }
    throw error;
  }

  await logAudit({
    user: request.user,
    leagueId,
    action: "team_delegate_create",
    entityType: "user",
    entityId: user.id,
    detail: `Creo invitacion de delegado ${email} para ${team.name}`
  });

  response.status(201).json({
    delegates: await listTeamDelegatesData(leagueId),
    invitation
  });
});

app.patch("/api/team-delegates/:assignmentId", requireAuth, async (request, response) => {
  const delegates = await listTeamDelegatesData(request.user.role === "league_admin" ? request.user.leagueId : "");
  const assignment = delegates.find((item) => item.id === request.params.assignmentId);
  if (!assignment) return response.status(404).json({ error: "Delegado no encontrado" });
  if (!canManageLeague(request.user, assignment.leagueId)) {
    return response.status(403).json({ error: "No puedes modificar este delegado" });
  }
  const status = request.body.status || assignment.status;
  if (!validateUserStatus(status)) return response.status(400).json({ error: "Estado invalido" });
  if (status === "active") {
    const user = await getUserById(assignment.userId);
    if (!user?.password_hash) {
      return response.status(400).json({ error: "Este delegado aun debe activar su cuenta con la invitacion." });
    }
  }
  await updateTeamDelegateStatusData({ assignmentId: assignment.id, userId: assignment.userId, status });
  await logAudit({
    user: request.user,
    leagueId: assignment.leagueId,
    action: "team_delegate_update",
    entityType: "team_user_assignment",
    entityId: assignment.id,
    detail: `Actualizo delegado de ${assignment.teamName}`
  });
  response.json(await listTeamDelegatesData(assignment.leagueId));
});

app.post("/api/team-delegates/:assignmentId/invitation", requireAuth, async (request, response) => {
  const delegates = await listTeamDelegatesData(request.user.role === "league_admin" ? request.user.leagueId : "");
  const assignment = delegates.find((item) => item.id === request.params.assignmentId);
  if (!assignment) return response.status(404).json({ error: "Delegado no encontrado" });
  if (!canManageLeague(request.user, assignment.leagueId)) {
    return response.status(403).json({ error: "No puedes reenviar esta invitacion" });
  }
  if (assignment.status === "deleted") {
    return response.status(400).json({ error: "No se puede invitar a un usuario eliminado." });
  }

  if (assignment.status !== "pending_activation") {
    await updateTeamDelegateStatusData({
      assignmentId: assignment.id,
      userId: assignment.userId,
      status: "pending_activation"
    });
  }
  const invitation = await createDelegateInvitation({
    request,
    userId: assignment.userId,
    assignmentId: assignment.id,
    delegateName: assignment.userName,
    teamName: assignment.teamName
  });

  await logAudit({
    user: request.user,
    leagueId: assignment.leagueId,
    action: "team_delegate_invitation",
    entityType: "team_user_assignment",
    entityId: assignment.id,
    detail: `Regenero invitacion de delegado ${assignment.userEmail} para ${assignment.teamName}`
  });

  response.json({
    delegates: await listTeamDelegatesData(assignment.leagueId),
    invitation
  });
});

app.delete("/api/team-delegates/:assignmentId", requireAuth, async (request, response) => {
  const delegates = await listTeamDelegatesData(request.user.role === "league_admin" ? request.user.leagueId : "");
  const assignment = delegates.find((item) => item.id === request.params.assignmentId);
  if (!assignment) return response.status(404).json({ error: "Delegado no encontrado" });
  if (!canManageLeague(request.user, assignment.leagueId)) {
    return response.status(403).json({ error: "No puedes eliminar este delegado" });
  }

  const mode = String(request.query.mode || "disable_user");
  const currentAssignments = await countTeamDelegateAssignmentsData(assignment.userId);
  if (mode === "delete_user" && currentAssignments > 1) {
    return response.status(400).json({
      error: "Este usuario tiene otros equipos asignados. Quita primero los demas accesos antes de eliminarlo definitivamente."
    });
  }

  await deleteTeamDelegateAssignmentData(assignment.id);
  const remainingAssignments = await countTeamDelegateAssignmentsData(assignment.userId);
  let userDisabled = false;
  let userDeleted = false;

  if (mode === "delete_user" && remainingAssignments === 0) {
    await deleteUserData(assignment.userId);
    userDeleted = true;
  } else if (mode === "disable_user" && remainingAssignments === 0) {
    await disableUserData(assignment.userId);
    userDisabled = true;
  }

  await logAudit({
    user: request.user,
    leagueId: assignment.leagueId,
    action: "team_delegate_delete",
    entityType: "team_user_assignment",
    entityId: assignment.id,
    detail: userDeleted
      ? `Quito delegado ${assignment.userEmail} de ${assignment.teamName} y elimino definitivamente su usuario`
      : userDisabled
      ? `Quito delegado ${assignment.userEmail} de ${assignment.teamName} y deshabilito su usuario`
      : `Quito delegado ${assignment.userEmail} de ${assignment.teamName}`
  });

  response.json({
    delegates: await listTeamDelegatesData(assignment.leagueId),
    userDisabled,
    userDeleted
  });
});

app.get("/api/referees", requireAuth, async (request, response) => {
  if (!["super_admin", "league_admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "No puedes ver arbitros" });
  }
  const requestedMunicipality = upperText(String(request.query.municipality || ""));
  const municipality = request.user.role === "league_admin"
    ? await getLeagueAdminMunicipality(request.user)
    : requestedMunicipality;
  response.json(await listRefereesData(municipality));
});

app.post("/api/referees", requireAuth, async (request, response) => {
  if (!["super_admin", "league_admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "No puedes crear arbitros" });
  }
  const name = String(request.body.name || "").trim();
  const phone = String(request.body.phone || "").trim();
  const email = String(request.body.email || "").trim().toLowerCase();
  const municipality = request.user.role === "league_admin"
    ? await getLeagueAdminMunicipality(request.user)
    : upperText(String(request.body.municipality || "").trim());
  const status = "pending_activation";

  if (!name || !phone || !email || !municipality) {
    return response.status(400).json({ error: "Nombre, telefono, correo y municipio son requeridos." });
  }
  if (!validateEmail(email)) return response.status(400).json({ error: "Correo invalido" });
  if (!await canManageMunicipality(request.user, municipality)) {
    return response.status(403).json({ error: "No puedes crear arbitros para este municipio" });
  }

  const userId = `user-referee-${crypto.randomUUID()}`;
  let user;
  let invitation;
  try {
    user = await createUserData({
      id: userId,
      leagueId: null,
      name,
      email,
      phone,
      role: "referee",
      status,
      passwordHash: null
    });
    await createRefereeProfileData({ userId, municipality });
    invitation = await createRefereeInvitation({ request, userId, refereeName: name, municipality });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return response.status(409).json({ error: "Ya existe un usuario con ese correo." });
    }
    throw error;
  }

  await logAudit({
    user: request.user,
    action: "referee_create",
    entityType: "user",
    entityId: user.id,
    detail: `Creo invitacion de arbitro ${email} para ${municipality}`
  });

  response.status(201).json({
    referees: await listRefereesData(request.user.role === "league_admin" ? municipality : ""),
    invitation
  });
});

app.patch("/api/referees/:userId", requireAuth, async (request, response) => {
  if (!["super_admin", "league_admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "No puedes modificar arbitros" });
  }
  const referee = await getRefereeProfileData(request.params.userId);
  if (!referee) return response.status(404).json({ error: "Arbitro no encontrado" });
  if (!await canManageMunicipality(request.user, referee.municipality)) {
    return response.status(403).json({ error: "No puedes modificar arbitros de otro municipio" });
  }
  const status = String(request.body.status || referee.status);
  if (!validateUserStatus(status)) return response.status(400).json({ error: "Estado invalido" });
  if (status === "active") {
    const user = await getUserById(referee.userId);
    if (!user?.password_hash) {
      return response.status(400).json({ error: "Este arbitro aun debe activar su cuenta con la invitacion." });
    }
  }
  await updateRefereeStatusData(referee.userId, status);
  await logAudit({
    user: request.user,
    action: "referee_update",
    entityType: "user",
    entityId: referee.userId,
    detail: `Actualizo arbitro ${referee.email}`
  });
  response.json(await listRefereesData(request.user.role === "league_admin" ? referee.municipality : ""));
});

app.post("/api/referees/:userId/invitation", requireAuth, async (request, response) => {
  if (!["super_admin", "league_admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "No puedes invitar arbitros" });
  }
  const referee = await getRefereeProfileData(request.params.userId);
  if (!referee) return response.status(404).json({ error: "Arbitro no encontrado" });
  if (!await canManageMunicipality(request.user, referee.municipality)) {
    return response.status(403).json({ error: "No puedes invitar arbitros de otro municipio" });
  }
  if (referee.status === "deleted") return response.status(400).json({ error: "No se puede invitar a un usuario eliminado." });
  if (referee.status !== "pending_activation") await updateRefereeStatusData(referee.userId, "pending_activation");
  const invitation = await createRefereeInvitation({
    request,
    userId: referee.userId,
    refereeName: referee.name,
    municipality: referee.municipality
  });
  await logAudit({
    user: request.user,
    action: "referee_invitation",
    entityType: "user",
    entityId: referee.userId,
    detail: `Regenero invitacion de arbitro ${referee.email}`
  });
  response.json({
    referees: await listRefereesData(request.user.role === "league_admin" ? referee.municipality : ""),
    invitation
  });
});

app.delete("/api/referees/:userId", requireAuth, async (request, response) => {
  if (!["super_admin", "league_admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "No puedes eliminar arbitros" });
  }
  const referee = await getRefereeProfileData(request.params.userId);
  if (!referee) return response.status(404).json({ error: "Arbitro no encontrado" });
  if (!await canManageMunicipality(request.user, referee.municipality)) {
    return response.status(403).json({ error: "No puedes eliminar arbitros de otro municipio" });
  }

  await deleteUserData(referee.userId);
  clearPublicCache();

  await logAudit({
    user: request.user,
    action: "referee_delete",
    entityType: "user",
    entityId: referee.userId,
    detail: `Elimino definitivamente arbitro ${referee.email} de ${referee.municipality}`
  });

  response.json({
    referees: await listRefereesData(request.user.role === "league_admin" ? referee.municipality : ""),
    userDeleted: true
  });
});

app.get("/api/referee-match-sheets", requireAuth, async (request, response) => {
  if (!["super_admin", "league_admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "No puedes ver actas arbitrales" });
  }
  const requestedLeagueId = String(request.query.leagueId || request.user.leagueId || "").trim();
  const status = String(request.query.status || "pending_review");
  if (requestedLeagueId && !canManageLeague(request.user, requestedLeagueId)) {
    return response.status(403).json({ error: "No puedes ver actas de esta liga" });
  }
  if (!requestedLeagueId && request.user.role !== "super_admin") {
    return response.status(403).json({ error: "Selecciona una liga valida" });
  }
  response.json(await listRefereeMatchSheetsData({ leagueId: requestedLeagueId, status }));
});

app.patch("/api/referee-match-sheets/:sheetId/review", requireAuth, async (request, response) => {
  if (!["super_admin", "league_admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "No puedes revisar actas arbitrales" });
  }
  const sheet = await getRefereeMatchSheetData(request.params.sheetId);
  if (!sheet) return response.status(404).json({ error: "Acta arbitral no encontrada" });
  if (!canManageLeague(request.user, sheet.leagueId)) {
    return response.status(403).json({ error: "No puedes revisar actas de esta liga" });
  }
  if (sheet.status !== "pending_review") {
    return response.status(400).json({ error: "Esta acta ya fue revisada." });
  }

  const action = String(request.body.action || "").trim();
  const reviewNote = String(request.body.reviewNote || "").trim();
  if (action === "reject") {
    const rejectedSheet = await updateRefereeMatchSheetReviewData({
      sheetId: sheet.id,
      status: "rejected",
      reviewNote,
      reviewedByUserId: request.user.id
    });
    await logAudit({
      user: request.user,
      leagueId: sheet.leagueId,
      action: "referee_match_sheet_reject",
      entityType: "referee_match_sheet",
      entityId: sheet.id,
      detail: `Rechazo acta arbitral de partido ${sheet.matchId}`
    });
    return response.json({
      sheet: rejectedSheet,
      sheets: await listRefereeMatchSheetsData({ leagueId: sheet.leagueId, status: "pending_review" })
    });
  }

  if (action !== "approve") {
    return response.status(400).json({ error: "Accion de revision invalida." });
  }

  const store = await getStoreData();
  const league = (store.leagues || []).find((item) => item.id === sheet.leagueId);
  const match = league?.matches?.find((item) => item.id === sheet.matchId);
  if (!league || !match) return response.status(404).json({ error: "Partido no encontrado para esta acta." });
  if (match.status === "finished" || match.status === "walkover") {
    return response.status(400).json({ error: "Este partido ya tiene acta oficial guardada." });
  }

  const nextStore = saveMatchSheet(store, sheet.leagueId, sheet.payload);
  await importStoreData(nextStore);
  clearPublicCache();
  const approvedSheet = await createRefereeMatchSheetData({
    id: sheet.id,
    leagueId: sheet.leagueId,
    matchId: sheet.matchId,
    submittedByUserId: sheet.submittedByUserId,
    payload: sheet.payload,
    status: "approved",
    reviewNote,
    submittedAt: sheet.submittedAt,
    reviewedByUserId: request.user.id,
    reviewedAt: new Date().toISOString()
  });

  await logAudit({
    user: request.user,
    leagueId: sheet.leagueId,
    action: "referee_match_sheet_approve",
    entityType: "referee_match_sheet",
    entityId: sheet.id,
    detail: `Aprobo acta arbitral de partido ${sheet.matchId}`
  });

  response.json({
    sheet: approvedSheet,
    sheets: await listRefereeMatchSheetsData({ leagueId: sheet.leagueId, status: "pending_review" }),
    store: await getStoreData()
  });
});

app.patch("/api/matches/:matchId/referees", requireAuth, async (request, response) => {
  const store = await getStoreData();
  const league = store.leagues.find((item) => item.matches.some((match) => match.id === request.params.matchId));
  const match = league?.matches.find((item) => item.id === request.params.matchId);
  if (!league || !match) return response.status(404).json({ error: "Partido no encontrado" });
  if (!canManageLeague(request.user, league.id)) return response.status(403).json({ error: "No puedes modificar esta liga" });

  const refereeIds = [
    request.body.centralRefereeUserId,
    request.body.assistantReferee1UserId,
    request.body.assistantReferee2UserId,
    request.body.fourthRefereeUserId
  ].filter(Boolean);
  if (new Set(refereeIds).size !== refereeIds.length) {
    return response.status(400).json({ error: "Un arbitro no puede ocupar dos posiciones en el mismo partido." });
  }
  const allowedReferees = await listRefereesData(upperText(league.city || ""));
  const allowedIds = new Set(allowedReferees.filter((item) => item.status === "active").map((item) => item.userId));
  const invalid = refereeIds.find((userId) => !allowedIds.has(userId));
  if (invalid) return response.status(400).json({ error: "Solo puedes asignar arbitros activos del municipio de la liga." });

  await updateMatchRefereesData(match.id, {
    centralRefereeUserId: request.body.centralRefereeUserId || "",
    assistantReferee1UserId: request.body.assistantReferee1UserId || "",
    assistantReferee2UserId: request.body.assistantReferee2UserId || "",
    fourthRefereeUserId: request.body.fourthRefereeUserId || ""
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId: league.id,
    action: "match_referees_update",
    entityType: "match",
    entityId: match.id,
    detail: "Actualizo designacion arbitral"
  });

  response.json(await getStoreData());
});

app.put("/api/team-roster-permissions/:teamId", requireAuth, async (request, response) => {
  const teamId = String(request.params.teamId || "").trim();
  const leagueId = String(request.body.leagueId || request.user.leagueId || "").trim();
  if (!canManageLeague(request.user, leagueId)) {
    return response.status(403).json({ error: "No puedes modificar permisos de esta liga" });
  }
  const { league, team } = await getLeagueAndTeam(leagueId, teamId);
  if (!league || !team) return response.status(400).json({ error: "Equipo invalido para esta liga" });
  await setTeamRosterPermissionData({
    leagueId,
    teamId,
    registrationEnabled: request.body.registrationEnabled === true || request.body.registrationEnabled === "true",
    enabledUntil: request.body.enabledUntil || null,
    notes: request.body.notes || ""
  });
  await logAudit({
    user: request.user,
    leagueId,
    action: "team_roster_permission_update",
    entityType: "team",
    entityId: teamId,
    detail: `Actualizo captura de plantilla para ${team.name}`
  });
  response.json(await listTeamDelegatesData(leagueId));
});

app.get("/api/team-portal/me", requireAuth, async (request, response) => {
  if (request.user.role !== "team_delegate") {
    return response.status(403).json({ error: "Permiso de delegado requerido" });
  }
  const context = await getTeamDelegateContextData(request.user.id);
  if (!context) return response.status(404).json({ error: "No tienes equipo asignado" });
  const players = await listTeamPortalPlayersData(context.teamId);
  response.json({ context, players });
});

app.get("/api/referee-portal/me", requireAuth, async (request, response) => {
  if (request.user.role !== "referee") {
    return response.status(403).json({ error: "Permiso de arbitro requerido" });
  }
  const referee = await getRefereeProfileData(request.user.id);
  if (!referee || referee.status !== "active") {
    return response.status(403).json({ error: "Tu cuenta de arbitro no esta activa." });
  }
  const store = await getStoreData();
  const refereeSheets = await listRefereeMatchSheetsForRefereeData(request.user.id, { status: "all" });
  response.json(buildRefereePortalPayload(store, referee, request.user.id, refereeSheets));
});

app.post("/api/referee-portal/matches/:matchId/sheet", requireAuth, async (request, response) => {
  if (request.user.role !== "referee") {
    return response.status(403).json({ error: "Permiso de arbitro requerido" });
  }
  const referee = await getRefereeProfileData(request.user.id);
  if (!referee || referee.status !== "active") {
    return response.status(403).json({ error: "Tu cuenta de arbitro no esta activa." });
  }

  const store = await getStoreData();
  const league = (store.leagues || []).find((item) => item.matches?.some((match) => match.id === request.params.matchId));
  const match = league?.matches?.find((item) => item.id === request.params.matchId);
  if (!league || !match) return response.status(404).json({ error: "Partido no encontrado" });
  if (upperText(league.city || "") !== upperText(referee.municipality)) {
    return response.status(403).json({ error: "No puedes capturar partidos de otro municipio." });
  }
  if (match.centralRefereeUserId !== request.user.id) {
    return response.status(403).json({ error: "Solo el arbitro central asignado puede capturar esta acta." });
  }
  if (match.status === "finished" || match.status === "walkover") {
    return response.status(400).json({ error: "Esta acta ya fue capturada. Solicita correccion al administrador." });
  }
  const pendingSheet = await getPendingRefereeMatchSheetForMatchData(match.id);
  if (pendingSheet) {
    return response.status(400).json({ error: "Esta acta ya fue enviada y esta pendiente de revision." });
  }

  const sheetPayload = {
    matchId: match.id,
    homeGoals: request.body.homeGoals,
    awayGoals: request.body.awayGoals,
    observations: request.body.observations || "",
    status: request.body.status === "walkover" ? "walkover" : "finished",
    resolutionType: request.body.resolutionType || (request.body.status === "walkover" ? "no_show" : "normal"),
    resolutionNote: request.body.resolutionNote || "",
    events: Array.isArray(request.body.events) ? request.body.events : []
  };
  saveMatchSheet(store, league.id, sheetPayload);
  const sheet = await createRefereeMatchSheetData({
    id: `referee-sheet-${crypto.randomUUID()}`,
    leagueId: league.id,
    matchId: match.id,
    submittedByUserId: request.user.id,
    payload: sheetPayload
  });

  await logAudit({
    user: request.user,
    leagueId: league.id,
    action: "referee_match_sheet_submit",
    entityType: "referee_match_sheet",
    entityId: sheet.id,
    detail: `Arbitro central envio acta de ${match.id} a revision`
  });

  const refereeSheets = await listRefereeMatchSheetsForRefereeData(request.user.id, { status: "all" });
  response.status(201).json(buildRefereePortalPayload(await getStoreData(), referee, request.user.id, refereeSheets));
});

app.post("/api/team-portal/players", requireAuth, async (request, response) => {
  if (request.user.role !== "team_delegate") {
    return response.status(403).json({ error: "Permiso de delegado requerido" });
  }
  const context = await getTeamDelegateContextData(request.user.id);
  if (!context) return response.status(404).json({ error: "No tienes equipo asignado" });
  if (!context.canManageRoster) {
    return response.status(403).json({ error: "El registro de plantilla esta cerrado para tu equipo." });
  }

  const payload = {
    name: request.body.name,
    number: request.body.number,
    position: request.body.position,
    photoUrl: request.body.photoUrl,
    photoAuthorized: request.body.photoAuthorized === true || request.body.photoAuthorized === "true"
  };
  const nameCheck = validatePlayerFullName(payload.name);
  if (!nameCheck.valid) return response.status(400).json({ error: nameCheck.message });

  const store = await getStoreData();
  const league = (store.leagues || []).find((item) => item.id === context.leagueId);
  const duplicate = league ? findDuplicatePlayer(league, payload) : null;
  if (duplicate) return response.status(409).json({ error: `Este jugador ya esta registrado como ${duplicate.name}.` });

  const players = await createTeamPortalPlayerData({
    id: `player-${crypto.randomUUID()}`,
    leagueId: context.leagueId,
    competitionId: context.competitionId,
    teamId: context.teamId,
    ...payload
  });

  await logAudit({
    user: request.user,
    leagueId: context.leagueId,
    action: "team_portal_player_create",
    entityType: "player",
    detail: `Delegado registro jugador en ${context.teamName}`
  });

  clearPublicCache();
  response.status(201).json({ context, players });
});

app.patch("/api/team-portal/players/:playerId", requireAuth, async (request, response) => {
  if (request.user.role !== "team_delegate") {
    return response.status(403).json({ error: "Permiso de delegado requerido" });
  }
  const context = await getTeamDelegateContextData(request.user.id);
  if (!context) return response.status(404).json({ error: "No tienes equipo asignado" });
  if (!context.canManageRoster) {
    return response.status(403).json({ error: "El registro de plantilla esta cerrado para tu equipo." });
  }

  const payload = {
    name: request.body.name,
    number: request.body.number,
    position: request.body.position,
    photoUrl: request.body.photoUrl,
    photoAuthorized: request.body.photoAuthorized === true || request.body.photoAuthorized === "true"
  };
  const nameCheck = validatePlayerFullName(payload.name);
  if (!nameCheck.valid) return response.status(400).json({ error: nameCheck.message });

  const store = await getStoreData();
  const league = (store.leagues || []).find((item) => item.id === context.leagueId);
  const player = league?.players?.find((item) => item.id === request.params.playerId);
  if (!player || player.teamId !== context.teamId) {
    return response.status(404).json({ error: "Jugador no encontrado en tu equipo." });
  }
  const duplicate = league ? findDuplicatePlayer(league, payload, player.id) : null;
  if (duplicate) return response.status(409).json({ error: `Este jugador ya esta registrado como ${duplicate.name}.` });

  const players = await updateTeamPortalPlayerData(player.id, {
    teamId: context.teamId,
    ...payload
  });

  await logAudit({
    user: request.user,
    leagueId: context.leagueId,
    action: "team_portal_player_update",
    entityType: "player",
    entityId: player.id,
    detail: `Delegado actualizo jugador en ${context.teamName}`
  });

  clearPublicCache();
  response.json({ context, players });
});

app.patch("/api/team-portal/team-logo", requireAuth, async (request, response) => {
  if (request.user.role !== "team_delegate") {
    return response.status(403).json({ error: "Permiso de delegado requerido" });
  }
  const context = await getTeamDelegateContextData(request.user.id);
  if (!context) return response.status(404).json({ error: "No tienes equipo asignado" });

  await updateTeamLogoData({
    leagueId: context.leagueId,
    teamId: context.teamId,
    logoUrl: request.body.logoUrl || ""
  });
  const nextContext = await getTeamDelegateContextData(request.user.id);
  const players = await listTeamPortalPlayersData(context.teamId);

  await logAudit({
    user: request.user,
    leagueId: context.leagueId,
    action: "team_portal_team_logo_update",
    entityType: "team",
    entityId: context.teamId,
    detail: `Delegado actualizo escudo de ${context.teamName}`
  });

  clearPublicCache();
  response.json({ context: nextContext, players });
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
  const role = String(request.body.role || "");
  const leagueId = role === "league_admin" ? request.body.leagueId || "" : null;
  const passwordError = requireStrongPassword(password);
  if (!email || !password || !request.body.name || !role) {
    return response.status(400).json({ error: "Nombre, correo, rol y contraseña son requeridos" });
  }
  if (!validateEmail(email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserRole(role)) return response.status(400).json({ error: "Rol invalido" });
  if (role === "team_delegate") return response.status(400).json({ error: "Crea delegados desde el modulo de equipos." });
  if (role === "referee") return response.status(400).json({ error: "Crea arbitros desde el modulo de arbitros." });
  if (request.body.status && !validateUserStatus(request.body.status)) return response.status(400).json({ error: "Estado invalido" });
  if (role === "league_admin" && !leagueId) {
    return response.status(400).json({ error: "Un admin de liga debe estar asignado a una liga" });
  }
  if (passwordError) return response.status(400).json({ error: passwordError });

  const id = `user-${crypto.randomUUID()}`;
  let user;
  try {
    user = await createUserData({
      id,
      leagueId,
      name: request.body.name,
      email,
      role,
      status: request.body.status || "active",
      passwordHash: hashPassword(password)
    });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return response.status(409).json({ error: "Ya existe un usuario con ese correo." });
    }
    throw error;
  }
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
    name: request.body.name ?? current.name,
    email: request.body.email ? String(request.body.email).trim().toLowerCase() : current.email,
    role: request.body.role ?? current.role,
    status: request.body.status ?? current.status
  };
  next.leagueId = next.role === "league_admin"
    ? (request.body.leagueId === "" ? null : request.body.leagueId ?? current.league_id)
    : null;
  if (!validateEmail(next.email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserRole(next.role)) return response.status(400).json({ error: "Rol invalido" });
  if (next.role === "team_delegate") return response.status(400).json({ error: "Edita delegados desde el modulo de equipos." });
  if (next.role === "referee") return response.status(400).json({ error: "Edita arbitros desde el modulo de arbitros." });
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

  let user;
  try {
    user = await updateUserData(current.id, {
      ...next,
      passwordHash: nextPassword ? hashPassword(nextPassword) : null
    });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return response.status(409).json({ error: "Ya existe un usuario con ese correo." });
    }
    throw error;
  }
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
  if (isPortalOnlyRole(user.role)) {
    return response.status(400).json({ error: "Los delegados y arbitros se eliminan desde su modulo correspondiente." });
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
  const withdrawalPolicy = request.body.withdrawalPolicy || current.withdrawalPolicy || "award_walkover";
  if (!["award_walkover", "manual"].includes(withdrawalPolicy)) {
    return response.status(400).json({ error: "Politica de baja invalida." });
  }
  const notes = String(request.body.notes ?? current.notes ?? "").slice(0, 1000);

  const next = {
    withdrawalPolicy,
    forfeitPoints: parseIntegerInRange(request.body.forfeitPoints, current.forfeitPoints ?? 3, { min: 0, max: 10, label: "Puntos por default" }),
    forfeitGoalsFor: parseIntegerInRange(request.body.forfeitGoalsFor, current.forfeitGoalsFor ?? 3, { min: 0, max: 30, label: "Goles a favor por default" }),
    forfeitGoalsAgainst: parseIntegerInRange(request.body.forfeitGoalsAgainst, current.forfeitGoalsAgainst ?? 0, { min: 0, max: 30, label: "Goles en contra por default" }),
    yellowSuspensionLimit: parseIntegerInRange(request.body.yellowSuspensionLimit, current.yellowSuspensionLimit ?? 3, { min: 1, max: 10, label: "Limite de amarillas" }),
    defaultRedSuspensionMatches: parseIntegerInRange(request.body.defaultRedSuspensionMatches, current.defaultRedSuspensionMatches ?? 1, { min: 1, max: 20, label: "Partidos de suspension por roja" }),
    disciplineScope: request.body.disciplineScope === "league" ? "league" : "competition",
    playoffQualifiers: parseIntegerInRange(request.body.playoffQualifiers, current.playoffQualifiers ?? 8, { min: 2, max: 64, label: "Clasificados a liguilla" }),
    notes
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
            events: request.body.clearEvents === true ? [] : item.events || []
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

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

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

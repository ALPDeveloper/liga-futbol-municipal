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
  activateAdminUserData,
  activateRefereeUserData,
  countActiveSuperAdminsExcept,
  countLeagueAdmins,
  countTeamDelegateAssignmentsData,
  createRefereeMatchSheetData,
  createRefereeActivationData,
  createRefereeProfileData,
  createAdminActivationData,
  createTeamDelegateActivationData,
  createTeamDelegateAssignmentData,
  createPasswordResetData,
  createTeamPortalPlayerData,
  createUserAccessData,
  createUserData,
  DATABASE_LABEL,
  DATABASE_PROVIDER,
  deleteTeamDelegateAssignmentData,
  deleteUserData,
  disableUserData,
  getActiveUserByEmail,
  getAdminActivationByHashData,
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
  listMatchRostersForLeagueData,
  listRefereesData,
  listTeamDelegatesData,
  listTeamPortalPlayersData,
  listUsersData,
  markAdminActivationUsedData,
  markPasswordResetUsed,
  markRefereeActivationUsedData,
  markTeamDelegateActivationUsedData,
  removeRefereeRoleData,
  registerFailedLoginData,
  revokeAdminActivationsData,
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
  upsertMatchRosterData,
  updateUserAccessData,
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
  validateAccessRole,
  normalizeAdminPermissions,
  getDefaultPermissionsForRole,
  validateStorePayload,
  validateUserRole,
  validateUserStatus
} from "./security.js";
import { findDuplicatePlayer, validatePlayerFullName } from "../src/lib/playerValidation.js";
import { calculatePlayerAppearanceEligibility, calculateSuspensionNotices, getEligiblePlayersForTeam, upperText } from "../src/lib/domain.js";
import { addPlayer, deletePlayer, saveMatchSheet, saveResult, updatePlayer } from "../src/lib/actions.js";

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
let publicStoreRefreshPromise = null;

app.disable("x-powered-by");
app.set("trust proxy", runtimeConfig.trustProxy);
app.use(applySecurityHeaders);
app.use((request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.on("finish", () => {
    if (!request.path.startsWith("/api/")) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (durationMs > 500) {
      console.warn(JSON.stringify({
        level: "warn",
        type: "slow_api",
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(durationMs)
      }));
    }
  });
  next();
});
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
  if (user.role === "super_admin") return true;
  if (user.role === "league_admin" && user.leagueId === leagueId) return true;
  return (user.accesses || []).some((access) => (
    access.status === "active" &&
    (access.role === "super_admin" || access.leagueId === leagueId) &&
    ["super_admin", "league_admin", "admin_limited"].includes(access.role)
  ));
}

function isPortalOnlyRole(role) {
  return role === "team_delegate" || role === "referee";
}

function hasActiveRoleAccess(user, role) {
  return user?.role === role || (user?.accesses || []).some((access) => (
    access.role === role && access.status === "active"
  ));
}

function hasActiveTeamDelegateAccess(user) {
  return user?.role === "team_delegate" || (user?.accesses || []).some((access) => (
    access.role === "team_delegate" && access.status === "active"
  ));
}

function hasAnyNonRefereeAccess(user) {
  if (!user) return false;
  if (user.role && user.role !== "referee") return true;
  return (user.accesses || []).some((access) => access.role !== "referee" && access.status !== "deleted");
}

function hasAnyNonDelegateAccess(user) {
  if (!user) return false;
  if (user.role && user.role !== "team_delegate") return true;
  return (user.accesses || []).some((access) => access.role !== "team_delegate" && access.status !== "deleted");
}

function getFallbackPrimaryRoleFromAccesses(user, excludedAccessIds = new Set()) {
  const remainingAccesses = (user?.accesses || []).filter((access) => (
    access.status !== "deleted" && !excludedAccessIds.has(access.id)
  ));
  const priority = ["super_admin", "league_admin", "admin_limited", "team_delegate", "referee"];
  return [...remainingAccesses].sort((a, b) => priority.indexOf(a.role) - priority.indexOf(b.role))[0] || null;
}

function hasAdminPermission(user, leagueId, permission) {
  if (user.role === "super_admin") return true;
  if (user.role === "league_admin" && user.leagueId === leagueId) return true;
  return (user.accesses || []).some((access) => {
    if (access.status !== "active") return false;
    if (access.role === "super_admin") return true;
    if (access.leagueId !== leagueId) return false;
    if (access.role === "league_admin") return true;
    const permissions = access.permissions || [];
    return permissions.includes("*") || permissions.includes(permission);
  });
}

function hasAnyAdminPermission(user, permissions = []) {
  if (user.role === "super_admin" || user.role === "league_admin") return true;
  return (user.accesses || []).some((access) => (
    access.status === "active" &&
    ["super_admin", "league_admin", "admin_limited"].includes(access.role) &&
    (
      access.role === "super_admin" ||
      access.role === "league_admin" ||
      (access.permissions || []).includes("*") ||
      permissions.some((permission) => (access.permissions || []).includes(permission))
    )
  ));
}

function getPrimaryAdminLeagueId(user, permissions = []) {
  if (user.role === "league_admin" && user.leagueId) return user.leagueId;
  const access = (user.accesses || []).find((item) => (
    item.status === "active" &&
    item.leagueId &&
    ["league_admin", "admin_limited"].includes(item.role) &&
    (
      item.role === "league_admin" ||
      (item.permissions || []).includes("*") ||
      permissions.some((permission) => (item.permissions || []).includes(permission))
    )
  ));
  return access?.leagueId || "";
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

async function createAdminInvitation({ request, userId, accessId, adminName, role, leagueName }) {
  await revokeAdminActivationsData(userId);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + runtimeConfig.delegateActivationHours * 60 * 60 * 1000).toISOString();
  const activation = await createAdminActivationData({
    id: `admin-activation-${crypto.randomUUID()}`,
    userId,
    accessId,
    tokenHash: hashActivationToken(rawToken),
    expiresAt
  });
  const activationUrl = `${getAppBaseUrl(request)}/activar-admin/${encodeURIComponent(rawToken)}`;
  const roleLabel = role === "super_admin"
    ? "super administrador"
    : role === "league_admin"
      ? "administrador de liga"
      : "administrador con permisos limitados";
  const whatsappMessage = [
    `Hola ${adminName}, has sido registrado como ${roleLabel} en LIGATEC${leagueName ? ` para ${leagueName}` : ""}.`,
    "Para activar tu cuenta, entra al siguiente enlace:",
    activationUrl,
    "Ahi podras crear tu contrasena y posteriormente ingresar desde Acceso LIGATEC."
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

function getAdminActivationProblem(activation) {
  if (!activation) return "La invitacion no existe o el enlace es invalido.";
  if (activation.revokedAt) return "Esta invitacion fue reemplazada por una mas reciente.";
  if (activation.usedAt) return "Esta invitacion ya fue utilizada.";
  if (new Date(activation.expiresAt).getTime() <= Date.now()) return "Esta invitacion expiro.";
  if (activation.userStatus === "deleted" || activation.userStatus === "disabled" || activation.userStatus === "suspended") {
    return "Esta cuenta no esta disponible. Solicita una nueva invitacion al super administrador.";
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

function isValidDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isValidTimeValue(value) {
  return value === "" || /^\d{2}:\d{2}$/.test(String(value || ""));
}

function canEditMatchResults(user, leagueId) {
  return hasAdminPermission(user, leagueId, "match_sheets");
}

function parseOptionalScore(value, fallback = null, label = "Marcador") {
  if (value === "" || value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
    const error = new Error(`${label} debe ser un numero entero valido.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function buildMatchPayload({ league, payload, currentMatch = null, canEditResults = false }) {
  const competitionId = String(payload.competitionId || currentMatch?.competitionId || league.currentCompetitionId || "").trim();
  const competition = (league.competitions || []).find((item) => item.id === competitionId);
  if (!competition) {
    const error = new Error("Categoria invalida para este partido.");
    error.status = 400;
    throw error;
  }

  const stage = payload.stage === "playoff" ? "playoff" : "regular";
  const round = stage === "playoff"
    ? Number(payload.round || currentMatch?.round || 0)
    : parseIntegerInRange(payload.round, currentMatch?.round || 1, { min: 1, max: 999, label: "Jornada" });
  const date = String(payload.date || currentMatch?.date || "").trim();
  const time = String(payload.time ?? currentMatch?.time ?? "").trim();
  if (!isValidDateValue(date)) {
    const error = new Error("Fecha invalida para el partido.");
    error.status = 400;
    throw error;
  }
  if (!isValidTimeValue(time)) {
    const error = new Error("Hora invalida para el partido.");
    error.status = 400;
    throw error;
  }

  const homeTeamId = String(payload.homeTeamId || currentMatch?.homeTeamId || "").trim();
  const awayTeamId = String(payload.awayTeamId || currentMatch?.awayTeamId || "").trim();
  const competitionTeamIds = new Set((league.teams || [])
    .filter((team) => (team.competitionId || competitionId) === competitionId)
    .map((team) => team.id));
  if (!competitionTeamIds.has(homeTeamId) || !competitionTeamIds.has(awayTeamId) || homeTeamId === awayTeamId) {
    const error = new Error("Selecciona equipos validos y diferentes dentro de la misma categoria.");
    error.status = 400;
    throw error;
  }

  const next = {
    ...(currentMatch || {}),
    competitionId,
    stage,
    playoffRound: stage === "playoff" ? upperText(payload.playoffRound || currentMatch?.playoffRound || "") : upperText(payload.playoffRound || ""),
    playoffLeg: stage === "playoff" ? upperText(payload.playoffLeg || currentMatch?.playoffLeg || "") : upperText(payload.playoffLeg || ""),
    aggregateHome: parseOptionalScore(payload.aggregateHome, currentMatch?.aggregateHome ?? null, "Global local"),
    aggregateAway: parseOptionalScore(payload.aggregateAway, currentMatch?.aggregateAway ?? null, "Global visitante"),
    round,
    date,
    time,
    venue: upperText(payload.venue ?? currentMatch?.venue ?? ""),
    homeTeamId,
    awayTeamId,
    status: currentMatch?.status || "scheduled",
    homeGoals: currentMatch?.homeGoals ?? null,
    awayGoals: currentMatch?.awayGoals ?? null,
    observations: currentMatch?.observations || "",
    events: currentMatch?.events || []
  };

  if (canEditResults) {
    const status = ["scheduled", "finished", "walkover"].includes(payload.status) ? payload.status : next.status;
    next.status = status;
    next.homeGoals = parseOptionalScore(payload.homeGoals, null, "Goles local");
    next.awayGoals = parseOptionalScore(payload.awayGoals, null, "Goles visitante");
    next.observations = payload.observations === undefined ? next.observations : upperText(payload.observations || "");
  } else if (next.status !== "scheduled") {
    const error = new Error("Este permiso solo permite programar partidos pendientes, no modificar resultados.");
    error.status = 403;
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
  const access = (user.accesses || []).find((item) => (
    item.status === "active" &&
    ["league_admin", "admin_limited"].includes(item.role) &&
    item.leagueId
  ));
  const leagueId = user.role === "league_admin" && user.leagueId ? user.leagueId : access?.leagueId;
  if (!leagueId) return "";
  const league = await getLeagueById(leagueId);
  return String(league?.city || "").trim().toUpperCase();
}

async function canManageMunicipality(user, municipality) {
  if (user.role === "super_admin") return true;
  if (!hasAnyAdminPermission(user, ["referees", "match_sheets"])) return false;
  return upperText(municipality) === await getLeagueAdminMunicipality(user);
}

async function buildTeamPortalPayload(userId) {
  const context = await getTeamDelegateContextData(userId);
  if (!context) return null;
  const players = await listTeamPortalPlayersData(context.teamId);
  const store = await getStoreData();
  const league = (store.leagues || []).find((item) => item.id === context.leagueId);
  const matchRosters = league ? await listMatchRostersForLeagueData(league.id) : [];
  const leagueWithRosters = league ? { ...league, matchRosters } : null;
  const eligibilityByPlayerId = leagueWithRosters ? calculatePlayerAppearanceEligibility(leagueWithRosters) : new Map();
  const activeSuspensionByPlayerId = new Map();
  if (league) {
    for (const notice of calculateSuspensionNotices(league)) {
      if (notice.status === "active" && notice.player?.id) activeSuspensionByPlayerId.set(notice.player.id, notice);
    }
  }
  const eligiblePlayers = league ? getEligiblePlayersForTeam(league, context.teamId).map((player) => ({
    id: player.id,
    name: player.name,
    number: player.number,
    position: player.position,
    teamId: player.teamId,
    playoffEligibility: eligibilityByPlayerId.get(player.id) || null,
    suspension: activeSuspensionByPlayerId.has(player.id)
      ? {
        type: activeSuspensionByPlayerId.get(player.id).type,
        reason: activeSuspensionByPlayerId.get(player.id).reason,
        remainingMatches: activeSuspensionByPlayerId.get(player.id).remainingMatches,
        returnRound: activeSuspensionByPlayerId.get(player.id).returnRound
      }
      : null
  })) : [];
  const rosterByMatchTeam = new Map(matchRosters.map((roster) => [`${roster.matchId}:${roster.teamId}`, roster]));
  const matches = league ? (league.matches || [])
    .filter((match) => match.status === "scheduled" && (match.homeTeamId === context.teamId || match.awayTeamId === context.teamId))
    .sort((a, b) => (
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.time || "").localeCompare(String(b.time || ""))
    ))
    .map((match) => {
      const opponentTeamId = match.homeTeamId === context.teamId ? match.awayTeamId : match.homeTeamId;
      const opponent = (league.teams || []).find((team) => team.id === opponentTeamId);
      const roster = rosterByMatchTeam.get(`${match.id}:${context.teamId}`);
      return {
        id: match.id,
        date: match.date,
        time: match.time,
        round: match.round,
        venue: match.venue,
        competitionId: match.competitionId,
        isPlayoff: match.stage === "playoff" || Boolean(match.playoffRound),
        isHome: match.homeTeamId === context.teamId,
        opponentName: opponent?.name || "RIVAL",
        roster: roster || null
      };
    }) : [];

  return {
    context,
    players: players.map((player) => ({
      ...player,
      playoffEligibility: eligibilityByPlayerId.get(player.id) || null
    })),
    eligiblePlayers,
    matches
  };
}

async function listMatchRostersForStore(store) {
  const rosters = [];
  for (const league of store.leagues || []) {
    rosters.push(...await listMatchRostersForLeagueData(league.id));
  }
  return rosters;
}

function generateCaptainPin() {
  return String(crypto.randomInt(100000, 1000000));
}

function normalizePin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function buildRefereePortalPayload(store, referee, userId, refereeSheets = [], matchRosters = []) {
  const sheetByMatchId = new Map();
  for (const sheet of refereeSheets.filter((item) => item.status === "pending_review" || item.status === "rejected")) {
    if (!sheetByMatchId.has(sheet.matchId)) sheetByMatchId.set(sheet.matchId, sheet);
  }
  const rosterByMatchTeam = new Map(matchRosters.map((roster) => [`${roster.matchId}:${roster.teamId}`, roster]));
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
      const homeRoster = rosterByMatchTeam.get(`${match.id}:${match.homeTeamId}`);
      const awayRoster = rosterByMatchTeam.get(`${match.id}:${match.awayTeamId}`);
      const homeEligiblePlayers = getEligiblePlayersForTeam(league, match.homeTeamId);
      const awayEligiblePlayers = getEligiblePlayersForTeam(league, match.awayTeamId);
      const buildRosterPlayers = (players, roster) => {
        const rosterPlayerIds = new Set((roster?.players || []).map((entry) => typeof entry === "string" ? entry : entry.playerId));
        const source = roster ? players.filter((player) => rosterPlayerIds.has(player.id)) : players;
        return source.map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
          position: player.position,
          teamId: player.teamId,
          isCaptain: roster?.captainPlayerId === player.id
        }));
      };
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
        homePlayers: buildRosterPlayers(homeEligiblePlayers, homeRoster),
        awayPlayers: buildRosterPlayers(awayEligiblePlayers, awayRoster),
        homeRosterSubmitted: Boolean(homeRoster),
        awayRosterSubmitted: Boolean(awayRoster),
        homePinRequired: Boolean(homeRoster?.captainPin),
        awayPinRequired: Boolean(awayRoster?.captainPin),
        homeCaptainPlayerId: homeRoster?.captainPlayerId || "",
        awayCaptainPlayerId: awayRoster?.captainPlayerId || "",
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
  publicStoreRefreshPromise = null;
}

async function getPublicStoreCached() {
  const now = Date.now();
  if (runtimeConfig.publicCacheSeconds > 0 && publicStoreCache && publicStoreCacheUntil > now) {
    return publicStoreCache;
  }

  if (runtimeConfig.publicCacheSeconds > 0 && publicStoreCache) {
    if (!publicStoreRefreshPromise) {
      publicStoreRefreshPromise = getStoreData()
        .then((store) => {
          publicStoreCache = scopeStoreForUser(store, null);
          publicStoreCacheUntil = Date.now() + runtimeConfig.publicCacheSeconds * 1000;
        })
        .catch(() => {})
        .finally(() => {
          publicStoreRefreshPromise = null;
        });
    }
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
  let canUploadForLeague = !leagueId || hasAdminPermission(request.user, leagueId, "settings");

  if (!canUploadForLeague && hasActiveTeamDelegateAccess(request.user)) {
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
  if (hasActiveTeamDelegateAccess(request.user) && !["player-photos", "team-logos"].includes(request.body.scope)) {
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

app.get("/api/admin-activations/:token", activationLimiter, async (request, response) => {
  const activation = await getAdminActivationByHashData(hashActivationToken(request.params.token));
  const problem = getAdminActivationProblem(activation);
  if (problem) {
    return response.status(400).json({
      valid: false,
      error: problem,
      message: "Solicita una nueva invitacion al super administrador."
    });
  }

  response.json({
    valid: true,
    adminName: activation.userName,
    email: activation.userEmail,
    role: activation.role,
    leagueName: activation.leagueName || "Todas las ligas",
    expiresAt: activation.expiresAt
  });
});

app.post("/api/admin-activations/:token", activationLimiter, async (request, response) => {
  const activation = await getAdminActivationByHashData(hashActivationToken(request.params.token));
  const problem = getAdminActivationProblem(activation);
  if (problem) {
    return response.status(400).json({
      valid: false,
      error: problem,
      message: "Solicita una nueva invitacion al super administrador."
    });
  }

  const password = String(request.body.password || "");
  const confirmPassword = String(request.body.confirmPassword || "");
  if (password !== confirmPassword) return response.status(400).json({ error: "Las contraseñas no coinciden." });
  const passwordError = requireStrongPassword(password);
  if (passwordError) return response.status(400).json({ error: passwordError });

  const user = await activateAdminUserData({
    userId: activation.userId,
    accessId: activation.accessId,
    passwordHash: hashPassword(password)
  });
  await markAdminActivationUsedData(activation.id);

  await logAudit({
    user: toPublicUser(user),
    leagueId: activation.leagueId || null,
    action: "admin_activation",
    entityType: "user",
    entityId: activation.userId,
    detail: `Administrador activo cuenta ${activation.userEmail}`
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

  const hasSuperAccess = request.user.role === "super_admin" ||
    (request.user.accesses || []).some((access) => access.status === "active" && access.role === "super_admin");
  if (hasSuperAccess) {
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

  const leagueAdminAccess = request.user.role === "league_admin" && request.user.leagueId
    ? { leagueId: request.user.leagueId }
    : (request.user.accesses || []).find((access) => access.status === "active" && access.role === "league_admin" && access.leagueId);
  if (!leagueAdminAccess?.leagueId) {
    return response.status(403).json({ error: "Permiso insuficiente" });
  }

  const currentStore = await getStoreData();
  const currentLeague = currentStore.leagues.find((league) => league.id === leagueAdminAccess.leagueId);
  if (!currentLeague || currentLeague.status !== "active") {
    return response.status(403).json({ error: "La liga esta suspendida o no existe" });
  }

  const incomingLeague = request.body.leagues?.find((league) => league.id === leagueAdminAccess.leagueId);
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
    currentLeagueId: leagueAdminAccess.leagueId,
    leagues: currentStore.leagues.map((league) => (league.id === leagueAdminAccess.leagueId ? protectedLeague : league))
  };

  const nextStore = await importStoreData(mergedStore);
  clearPublicCache();
  await logAudit({
    user: request.user,
    leagueId: leagueAdminAccess.leagueId,
    action: "league_save",
    entityType: "league",
    entityId: leagueAdminAccess.leagueId,
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

app.post("/api/leagues/:leagueId/matches", requireAuth, async (request, response) => {
  const leagueId = String(request.params.leagueId || "").trim();
  if (!hasAdminPermission(request.user, leagueId, "matches")) {
    return response.status(403).json({ error: "No puedes programar partidos en esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  if (!league || league.status !== "active") return response.status(404).json({ error: "Liga no encontrada o suspendida" });
  const match = {
    ...buildMatchPayload({ league, payload: request.body, canEditResults: false }),
    id: `match-${crypto.randomUUID()}`,
    status: "scheduled",
    homeGoals: null,
    awayGoals: null,
    observations: "",
    events: []
  };
  const nextLeague = { ...league, matches: [...(league.matches || []), match] };
  const nextStore = await importStoreData({
    ...store,
    leagues: store.leagues.map((item) => (item.id === league.id ? nextLeague : item))
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "match_create",
    entityType: "match",
    entityId: match.id,
    detail: `Programo partido jornada ${match.round || "-"}`
  });
  response.status(201).json(nextStore);
});

app.patch("/api/leagues/:leagueId/matches/:matchId", requireAuth, async (request, response) => {
  const leagueId = String(request.params.leagueId || "").trim();
  if (!hasAdminPermission(request.user, leagueId, "matches")) {
    return response.status(403).json({ error: "No puedes modificar partidos en esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  const currentMatch = league?.matches?.find((item) => item.id === request.params.matchId);
  if (!league || !currentMatch) return response.status(404).json({ error: "Partido no encontrado" });
  const canEditResults = canEditMatchResults(request.user, leagueId);
  const nextMatch = buildMatchPayload({ league, payload: request.body, currentMatch, canEditResults });
  const nextLeague = {
    ...league,
    matches: league.matches.map((item) => (item.id === currentMatch.id ? nextMatch : item))
  };
  const nextStore = await importStoreData({
    ...store,
    leagues: store.leagues.map((item) => (item.id === league.id ? nextLeague : item))
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "match_update",
    entityType: "match",
    entityId: currentMatch.id,
    detail: `Actualizo partido jornada ${nextMatch.round || "-"}`
  });
  response.json(nextStore);
});

app.delete("/api/leagues/:leagueId/matches/:matchId", requireAuth, async (request, response) => {
  const leagueId = String(request.params.leagueId || "").trim();
  if (!hasAdminPermission(request.user, leagueId, "matches")) {
    return response.status(403).json({ error: "No puedes eliminar partidos en esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  const match = league?.matches?.find((item) => item.id === request.params.matchId);
  if (!league || !match) return response.status(404).json({ error: "Partido no encontrado" });
  if (match.status !== "scheduled" && !canEditMatchResults(request.user, leagueId)) {
    return response.status(403).json({ error: "Este permiso solo permite eliminar partidos pendientes." });
  }
  const nextLeague = {
    ...league,
    matches: league.matches.filter((item) => item.id !== match.id)
  };
  const nextStore = await importStoreData({
    ...store,
    leagues: store.leagues.map((item) => (item.id === league.id ? nextLeague : item))
  });
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "match_delete",
    entityType: "match",
    entityId: match.id,
    detail: `Elimino partido jornada ${match.round || "-"}`
  });
  response.json(nextStore);
});

function getPlayerPayloadFromRequest(body) {
  return {
    teamId: String(body.teamId || "").trim(),
    competitionId: String(body.competitionId || "").trim(),
    name: body.name,
    number: body.number,
    position: body.position,
    photoUrl: body.photoUrl,
    photoAuthorized: body.photoAuthorized === true || body.photoAuthorized === "true"
  };
}

function validatePlayerPayloadForLeague(league, payload, excludePlayerId = "") {
  const team = (league.teams || []).find((item) => item.id === payload.teamId);
  if (!team) return { status: 400, error: "Equipo invalido para esta liga." };

  const competitionId = payload.competitionId || team.competitionId || league.currentCompetitionId;
  const competition = (league.competitions || []).find((item) => item.id === competitionId);
  if (!competition) return { status: 400, error: "Categoria invalida para este jugador." };

  const nameCheck = validatePlayerFullName(payload.name);
  if (!nameCheck.valid) return { status: 400, error: nameCheck.message };

  const duplicate = findDuplicatePlayer(league, { ...payload, competitionId }, excludePlayerId);
  if (duplicate) return { status: 409, error: `Este jugador ya esta registrado como ${duplicate.name}.` };

  return null;
}

app.post("/api/leagues/:leagueId/players", requireAuth, async (request, response) => {
  const leagueId = String(request.params.leagueId || "").trim();
  if (!hasAdminPermission(request.user, leagueId, "players")) {
    return response.status(403).json({ error: "No puedes registrar jugadores en esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  if (!league || league.status !== "active") return response.status(404).json({ error: "Liga no encontrada o suspendida" });

  const payload = getPlayerPayloadFromRequest(request.body || {});
  const validation = validatePlayerPayloadForLeague(league, payload);
  if (validation) return response.status(validation.status).json({ error: validation.error });

  const nextStore = await importStoreData(addPlayer(store, leagueId, payload));
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "player_create",
    entityType: "player",
    detail: `Registro jugador ${upperText(payload.name || "")}`
  });
  response.status(201).json(nextStore);
});

app.patch("/api/leagues/:leagueId/players/:playerId", requireAuth, async (request, response) => {
  const leagueId = String(request.params.leagueId || "").trim();
  if (!hasAdminPermission(request.user, leagueId, "players")) {
    return response.status(403).json({ error: "No puedes modificar jugadores en esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  const player = league?.players?.find((item) => item.id === request.params.playerId);
  if (!league || !player) return response.status(404).json({ error: "Jugador no encontrado" });
  if (league.status !== "active") return response.status(404).json({ error: "Liga suspendida" });

  const payload = getPlayerPayloadFromRequest(request.body || {});
  const validation = validatePlayerPayloadForLeague(league, payload, player.id);
  if (validation) return response.status(validation.status).json({ error: validation.error });

  const nextStore = await importStoreData(updatePlayer(store, leagueId, player.id, payload));
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "player_update",
    entityType: "player",
    entityId: player.id,
    detail: `Actualizo jugador ${upperText(payload.name || player.name)}`
  });
  response.json(nextStore);
});

app.delete("/api/leagues/:leagueId/players/:playerId", requireAuth, async (request, response) => {
  const leagueId = String(request.params.leagueId || "").trim();
  if (!hasAdminPermission(request.user, leagueId, "players")) {
    return response.status(403).json({ error: "No puedes eliminar jugadores en esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  const player = league?.players?.find((item) => item.id === request.params.playerId);
  if (!league || !player) return response.status(404).json({ error: "Jugador no encontrado" });
  if (league.status !== "active") return response.status(404).json({ error: "Liga suspendida" });

  const nextStore = await importStoreData(deletePlayer(store, leagueId, player.id));
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "player_delete",
    entityType: "player",
    entityId: player.id,
    detail: `Elimino jugador ${player.name}`
  });
  response.json(nextStore);
});

app.post("/api/leagues/:leagueId/matches/:matchId/result", requireAuth, async (request, response) => {
  const leagueId = String(request.params.leagueId || "").trim();
  if (!canEditMatchResults(request.user, leagueId)) {
    return response.status(403).json({ error: "No puedes capturar resultados en esta liga" });
  }

  const store = await getStoreData();
  const league = store.leagues.find((item) => item.id === leagueId);
  const match = league?.matches?.find((item) => item.id === request.params.matchId);
  if (!league || !match) return response.status(404).json({ error: "Partido no encontrado" });
  if (league.status !== "active") return response.status(404).json({ error: "Liga suspendida" });

  const nextStore = await importStoreData(saveResult(store, leagueId, {
    ...request.body,
    matchId: match.id
  }));
  clearPublicCache();

  await logAudit({
    user: request.user,
    leagueId,
    action: "match_result_save",
    entityType: "match",
    entityId: match.id,
    detail: `Guardo resultado jornada ${match.round || "-"}`
  });
  response.json(nextStore);
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
  const fallbackLeagueId = request.user.role === "super_admin" ? "" : getPrimaryAdminLeagueId(request.user, ["delegates"]);
  const leagueId = String(request.query.leagueId || request.user.leagueId || fallbackLeagueId || "");
  if (leagueId && !hasAdminPermission(request.user, leagueId, "delegates")) {
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

  if (!hasAdminPermission(request.user, leagueId, "delegates")) {
    return response.status(403).json({ error: "No puedes crear delegados para esta liga" });
  }
  const { league, team } = await getLeagueAndTeam(leagueId, teamId);
  if (!league || !team) return response.status(400).json({ error: "Equipo invalido para esta liga" });
  if (!email || !phone || !name) return response.status(400).json({ error: "Nombre, telefono y correo son requeridos" });
  if (!validateEmail(email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserStatus(status)) return response.status(400).json({ error: "Estado invalido" });

  const existingUser = (await listUsersData()).find((item) => String(item.email || "").toLowerCase() === email);
  if (existingUser?.status === "deleted") {
    return response.status(409).json({ error: "Ese correo pertenece a un usuario eliminado. Usa otro correo o recupera la cuenta manualmente." });
  }
  const existingDelegateAssignment = existingUser
    ? (await listTeamDelegatesData(leagueId)).find((item) => item.userId === existingUser.id && item.teamId === teamId && item.status !== "deleted")
    : null;
  if (existingDelegateAssignment) {
    return response.status(409).json({ error: "Ese usuario ya es delegado de este equipo." });
  }

  const userId = existingUser?.id || `user-${crypto.randomUUID()}`;
  const assignmentId = `delegate-${crypto.randomUUID()}`;
  let user;
  let invitation;
  try {
    if (!existingUser) {
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
    } else {
      user = existingUser;
    }
    const assignmentStatus = existingUser?.status === "active" ? "active" : status;
    await createTeamDelegateAssignmentData({ id: assignmentId, leagueId, teamId, userId, status: assignmentStatus });
    if (existingUser?.status === "active") {
      await createUserAccessData({
        id: `access-delegate-${crypto.randomUUID()}`,
        userId,
        leagueId,
        teamId,
        role: "team_delegate",
        status: "active"
      });
      invitation = {
        activationUrl: `${getAppBaseUrl(request)}/acceso`,
        expiresAt: "",
        whatsappMessage: [
          `Hola ${name}, se agrego el acceso de delegado del equipo ${team.name} a tu cuenta existente de LIGATEC.`,
          "Entra desde Acceso LIGATEC con tu correo y contrasena actual:",
          `${getAppBaseUrl(request)}/acceso`,
          "Despues selecciona el rol Delegado para administrar tu plantilla."
        ].join("\n")
      };
    } else {
      await createUserAccessData({
        id: `access-delegate-${crypto.randomUUID()}`,
        userId,
        leagueId,
        teamId,
        role: "team_delegate",
        status
      });
      invitation = await createDelegateInvitation({
        request,
        userId,
        assignmentId,
        delegateName: name,
        teamName: team.name
      });
    }
    user = await getUserById(userId);
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
  const lookupLeagueId = request.user.role === "super_admin" ? "" : getPrimaryAdminLeagueId(request.user, ["delegates"]);
  const delegates = await listTeamDelegatesData(lookupLeagueId);
  const assignment = delegates.find((item) => item.id === request.params.assignmentId);
  if (!assignment) return response.status(404).json({ error: "Delegado no encontrado" });
  if (!hasAdminPermission(request.user, assignment.leagueId, "delegates")) {
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
  const lookupLeagueId = request.user.role === "super_admin" ? "" : getPrimaryAdminLeagueId(request.user, ["delegates"]);
  const delegates = await listTeamDelegatesData(lookupLeagueId);
  const assignment = delegates.find((item) => item.id === request.params.assignmentId);
  if (!assignment) return response.status(404).json({ error: "Delegado no encontrado" });
  if (!hasAdminPermission(request.user, assignment.leagueId, "delegates")) {
    return response.status(403).json({ error: "No puedes reenviar esta invitacion" });
  }
  if (assignment.status === "deleted") {
    return response.status(400).json({ error: "No se puede invitar a un usuario eliminado." });
  }

  const delegateUser = await getUserById(assignment.userId);
  if (delegateUser?.status === "active") {
    if (assignment.status !== "active") {
      await updateTeamDelegateStatusData({
        assignmentId: assignment.id,
        userId: assignment.userId,
        status: "active"
      });
    }
    const existingDelegateAccess = (delegateUser.accesses || []).find((access) => (
      access.role === "team_delegate" &&
      access.teamId === assignment.teamId &&
      access.status !== "deleted"
    ));
    if (existingDelegateAccess) {
      await updateUserAccessData(existingDelegateAccess.id, {
        leagueId: assignment.leagueId,
        teamId: assignment.teamId,
        role: "team_delegate",
        permissions: existingDelegateAccess.permissions || [],
        status: "active"
      });
    } else {
      await createUserAccessData({
        id: `access-delegate-${crypto.randomUUID()}`,
        userId: assignment.userId,
        leagueId: assignment.leagueId,
        teamId: assignment.teamId,
        role: "team_delegate",
        status: "active"
      });
    }
    const invitation = {
      activationUrl: `${getAppBaseUrl(request)}/acceso`,
      expiresAt: "",
      whatsappMessage: [
        `Hola ${assignment.userName}, tu acceso de delegado del equipo ${assignment.teamName} esta disponible en LIGATEC.`,
        "Entra con tu correo y contrasena actual desde:",
        `${getAppBaseUrl(request)}/acceso`,
        "Despues selecciona el rol Delegado."
      ].join("\n")
    };
    await logAudit({
      user: request.user,
      leagueId: assignment.leagueId,
      action: "team_delegate_invitation",
      entityType: "team_user_assignment",
      entityId: assignment.id,
      detail: `Genero mensaje de acceso para delegado existente ${assignment.userEmail}`
    });
    return response.json({
      delegates: await listTeamDelegatesData(assignment.leagueId),
      invitation
    });
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
  const lookupLeagueId = request.user.role === "super_admin" ? "" : getPrimaryAdminLeagueId(request.user, ["delegates"]);
  const delegates = await listTeamDelegatesData(lookupLeagueId);
  const assignment = delegates.find((item) => item.id === request.params.assignmentId);
  if (!assignment) return response.status(404).json({ error: "Delegado no encontrado" });
  if (!hasAdminPermission(request.user, assignment.leagueId, "delegates")) {
    return response.status(403).json({ error: "No puedes eliminar este delegado" });
  }

  const mode = String(request.query.mode || "disable_user");
  const currentAssignments = await countTeamDelegateAssignmentsData(assignment.userId);
  const delegateUser = await getUserById(assignment.userId);
  const canAffectWholeUser = !hasAnyNonDelegateAccess(delegateUser);
  if (mode === "delete_user" && currentAssignments > 1) {
    return response.status(400).json({
      error: "Este usuario tiene otros equipos asignados. Quita primero los demas accesos antes de eliminarlo definitivamente."
    });
  }

  await deleteTeamDelegateAssignmentData(assignment.id);
  const delegateAccess = (delegateUser?.accesses || []).find((access) => (
    access.role === "team_delegate" &&
    access.teamId === assignment.teamId &&
    access.status !== "deleted"
  ));
  if (delegateAccess) {
    await updateUserAccessData(delegateAccess.id, {
      leagueId: assignment.leagueId,
      teamId: assignment.teamId,
      role: "team_delegate",
      permissions: delegateAccess.permissions || [],
      status: "deleted"
    });
  }
  const remainingAssignments = await countTeamDelegateAssignmentsData(assignment.userId);
  let userDisabled = false;
  let userDeleted = false;

  if (mode === "delete_user" && remainingAssignments === 0 && canAffectWholeUser) {
    await deleteUserData(assignment.userId);
    userDeleted = true;
  } else if (mode === "disable_user" && remainingAssignments === 0 && canAffectWholeUser) {
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
  if (!hasAnyAdminPermission(request.user, ["referees"])) {
    return response.status(403).json({ error: "No puedes ver arbitros" });
  }
  const requestedMunicipality = upperText(String(request.query.municipality || ""));
  const municipality = request.user.role === "super_admin" ? requestedMunicipality : await getLeagueAdminMunicipality(request.user);
  response.json(await listRefereesData(municipality));
});

app.post("/api/referees", requireAuth, async (request, response) => {
  if (!hasAnyAdminPermission(request.user, ["referees"])) {
    return response.status(403).json({ error: "No puedes crear arbitros" });
  }
  const name = String(request.body.name || "").trim();
  const phone = String(request.body.phone || "").trim();
  const email = String(request.body.email || "").trim().toLowerCase();
  const municipality = request.user.role === "super_admin"
    ? upperText(String(request.body.municipality || "").trim())
    : await getLeagueAdminMunicipality(request.user);
  const status = "pending_activation";

  if (!name || !phone || !email || !municipality) {
    return response.status(400).json({ error: "Nombre, telefono, correo y municipio son requeridos." });
  }
  if (!validateEmail(email)) return response.status(400).json({ error: "Correo invalido" });
  if (!await canManageMunicipality(request.user, municipality)) {
    return response.status(403).json({ error: "No puedes crear arbitros para este municipio" });
  }

  const existingUser = (await listUsersData()).find((item) => String(item.email || "").toLowerCase() === email);
  if (existingUser?.status === "deleted") {
    return response.status(409).json({ error: "Ese correo pertenece a un usuario eliminado. Usa otro correo o recupera la cuenta manualmente." });
  }
  if (existingUser && await getRefereeProfileData(existingUser.id)) {
    return response.status(409).json({ error: "Ese correo ya esta registrado como arbitro." });
  }

  const userId = existingUser?.id || `user-referee-${crypto.randomUUID()}`;
  let user;
  let invitation;
  try {
    if (!existingUser) {
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
    } else {
      user = existingUser;
    }
    const nextRefereeStatus = existingUser?.status === "active" ? "active" : status;
    const existingRefereeAccess = (user?.accesses || []).find((access) => access.role === "referee" && access.status !== "deleted");
    if (existingRefereeAccess) {
      await updateUserAccessData(existingRefereeAccess.id, {
        leagueId: existingRefereeAccess.leagueId || null,
        teamId: existingRefereeAccess.teamId || null,
        role: "referee",
        permissions: existingRefereeAccess.permissions || [],
        status: nextRefereeStatus
      });
    } else {
      await createUserAccessData({
        id: `access-referee-${crypto.randomUUID()}`,
        userId,
        role: "referee",
        status: nextRefereeStatus
      });
    }
    await createRefereeProfileData({ userId, municipality });
    invitation = existingUser?.status === "active"
      ? {
          activationUrl: `${getAppBaseUrl(request)}/acceso`,
          expiresAt: "",
          whatsappMessage: [
            `Hola ${name}, se agrego el acceso de arbitro para ${municipality} a tu cuenta existente de LIGATEC.`,
            "Entra desde Acceso LIGATEC con tu correo y contrasena actual:",
            `${getAppBaseUrl(request)}/acceso`,
            "Despues selecciona el rol Arbitro para ver tus partidos asignados."
          ].join("\n")
        }
      : await createRefereeInvitation({ request, userId, refereeName: name, municipality });
    user = await getUserById(userId);
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
    referees: await listRefereesData(request.user.role === "super_admin" ? "" : municipality),
    invitation
  });
});

app.patch("/api/referees/:userId", requireAuth, async (request, response) => {
  if (!hasAnyAdminPermission(request.user, ["referees"])) {
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
  response.json(await listRefereesData(request.user.role === "super_admin" ? "" : referee.municipality));
});

app.post("/api/referees/:userId/invitation", requireAuth, async (request, response) => {
  if (!hasAnyAdminPermission(request.user, ["referees"])) {
    return response.status(403).json({ error: "No puedes invitar arbitros" });
  }
  const referee = await getRefereeProfileData(request.params.userId);
  if (!referee) return response.status(404).json({ error: "Arbitro no encontrado" });
  if (!await canManageMunicipality(request.user, referee.municipality)) {
    return response.status(403).json({ error: "No puedes invitar arbitros de otro municipio" });
  }
  if (referee.status === "deleted") return response.status(400).json({ error: "No se puede invitar a un usuario eliminado." });
  const refereeUser = await getUserById(referee.userId);
  if (refereeUser?.status === "active") {
    if (referee.status !== "active") await updateRefereeStatusData(referee.userId, "active");
    const invitation = {
      activationUrl: `${getAppBaseUrl(request)}/acceso`,
      expiresAt: "",
      whatsappMessage: [
        `Hola ${referee.name}, tu acceso de arbitro para ${referee.municipality} esta disponible en LIGATEC.`,
        "Entra con tu correo y contrasena actual desde:",
        `${getAppBaseUrl(request)}/acceso`,
        "Despues selecciona el rol Arbitro."
      ].join("\n")
    };
    await logAudit({
      user: request.user,
      action: "referee_invitation",
      entityType: "user",
      entityId: referee.userId,
      detail: `Genero mensaje de acceso para arbitro existente ${referee.email}`
    });
    return response.json({
      referees: await listRefereesData(request.user.role === "super_admin" ? "" : referee.municipality),
      invitation
    });
  }
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
    referees: await listRefereesData(request.user.role === "super_admin" ? "" : referee.municipality),
    invitation
  });
});

app.delete("/api/referees/:userId", requireAuth, async (request, response) => {
  if (!hasAnyAdminPermission(request.user, ["referees"])) {
    return response.status(403).json({ error: "No puedes eliminar arbitros" });
  }
  const referee = await getRefereeProfileData(request.params.userId);
  if (!referee) return response.status(404).json({ error: "Arbitro no encontrado" });
  if (!await canManageMunicipality(request.user, referee.municipality)) {
    return response.status(403).json({ error: "No puedes eliminar arbitros de otro municipio" });
  }

  const refereeUser = await getUserById(referee.userId);
  const userDeleted = !hasAnyNonRefereeAccess(refereeUser);
  if (userDeleted) {
    await deleteUserData(referee.userId);
  } else {
    await removeRefereeRoleData(referee.userId);
  }
  clearPublicCache();

  await logAudit({
    user: request.user,
    action: "referee_delete",
    entityType: "user",
    entityId: referee.userId,
    detail: userDeleted
      ? `Elimino definitivamente arbitro ${referee.email} de ${referee.municipality}`
      : `Retiro rol de arbitro ${referee.email} de ${referee.municipality}`
  });

  response.json({
    referees: await listRefereesData(request.user.role === "super_admin" ? "" : referee.municipality),
    userDeleted
  });
});

app.get("/api/referee-match-sheets", requireAuth, async (request, response) => {
  if (!hasAnyAdminPermission(request.user, ["match_sheets"])) {
    return response.status(403).json({ error: "No puedes ver actas arbitrales" });
  }
  const requestedLeagueId = String(request.query.leagueId || getPrimaryAdminLeagueId(request.user, ["match_sheets"]) || "").trim();
  const status = String(request.query.status || "pending_review");
  if (requestedLeagueId && !hasAdminPermission(request.user, requestedLeagueId, "match_sheets")) {
    return response.status(403).json({ error: "No puedes ver actas de esta liga" });
  }
  if (!requestedLeagueId && request.user.role !== "super_admin") {
    return response.status(403).json({ error: "Selecciona una liga valida" });
  }
  response.json(await listRefereeMatchSheetsData({ leagueId: requestedLeagueId, status }));
});

app.patch("/api/referee-match-sheets/:sheetId/review", requireAuth, async (request, response) => {
  if (!hasAnyAdminPermission(request.user, ["match_sheets"])) {
    return response.status(403).json({ error: "No puedes revisar actas arbitrales" });
  }
  const sheet = await getRefereeMatchSheetData(request.params.sheetId);
  if (!sheet) return response.status(404).json({ error: "Acta arbitral no encontrada" });
  if (!hasAdminPermission(request.user, sheet.leagueId, "match_sheets")) {
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
  if (!hasAdminPermission(request.user, league.id, "referees")) return response.status(403).json({ error: "No puedes modificar esta liga" });

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
  const leagueId = String(request.body.leagueId || request.user.leagueId || getPrimaryAdminLeagueId(request.user, ["delegates"]) || "").trim();
  if (!hasAdminPermission(request.user, leagueId, "delegates")) {
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
  if (!hasActiveTeamDelegateAccess(request.user)) {
    return response.status(403).json({ error: "Permiso de delegado requerido" });
  }
  const payload = await buildTeamPortalPayload(request.user.id);
  if (!payload) return response.status(404).json({ error: "No tienes equipo asignado" });
  response.json(payload);
});

app.get("/api/referee-portal/me", requireAuth, async (request, response) => {
  if (!hasActiveRoleAccess(request.user, "referee")) {
    return response.status(403).json({ error: "Permiso de arbitro requerido" });
  }
  const referee = await getRefereeProfileData(request.user.id);
  if (!referee || referee.status !== "active") {
    return response.status(403).json({ error: "Tu cuenta de arbitro no esta activa." });
  }
  const store = await getStoreData();
  const refereeSheets = await listRefereeMatchSheetsForRefereeData(request.user.id, { status: "all" });
  const matchRosters = await listMatchRostersForStore(store);
  response.json(buildRefereePortalPayload(store, referee, request.user.id, refereeSheets, matchRosters));
});

app.post("/api/referee-portal/matches/:matchId/sheet", requireAuth, async (request, response) => {
  if (!hasActiveRoleAccess(request.user, "referee")) {
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

  const isWalkoverSheet = request.body.status === "walkover";
  const matchRosters = await listMatchRostersForLeagueData(league.id);
  const homeRoster = matchRosters.find((roster) => roster.matchId === match.id && roster.teamId === match.homeTeamId);
  const awayRoster = matchRosters.find((roster) => roster.matchId === match.id && roster.teamId === match.awayTeamId);
  const approvals = request.body.approvals && typeof request.body.approvals === "object" ? request.body.approvals : {};
  if (!isWalkoverSheet) {
    if (homeRoster?.captainPin && normalizePin(approvals.homePin) !== normalizePin(homeRoster.captainPin)) {
      return response.status(400).json({ error: "PIN de capitan incorrecto para equipo local." });
    }
    if (awayRoster?.captainPin && normalizePin(approvals.awayPin) !== normalizePin(awayRoster.captainPin)) {
      return response.status(400).json({ error: "PIN de capitan incorrecto para equipo visitante." });
    }
  }

  const sheetPayload = {
    matchId: match.id,
    homeGoals: request.body.homeGoals,
    awayGoals: request.body.awayGoals,
    observations: request.body.observations || "",
    status: isWalkoverSheet ? "walkover" : "finished",
    resolutionType: request.body.resolutionType || (isWalkoverSheet ? "no_show" : "normal"),
    resolutionNote: request.body.resolutionNote || "",
    events: Array.isArray(request.body.events) ? request.body.events : [],
    captainApprovals: {
      home: !homeRoster?.captainPin || !isWalkoverSheet,
      away: !awayRoster?.captainPin || !isWalkoverSheet,
      approvedAt: !isWalkoverSheet ? new Date().toISOString() : ""
    }
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
  const nextStore = await getStoreData();
  response.status(201).json(buildRefereePortalPayload(nextStore, referee, request.user.id, refereeSheets, await listMatchRostersForStore(nextStore)));
});

app.post("/api/team-portal/players", requireAuth, async (request, response) => {
  if (!hasActiveTeamDelegateAccess(request.user)) {
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

  await createTeamPortalPlayerData({
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
  response.status(201).json(await buildTeamPortalPayload(request.user.id));
});

app.patch("/api/team-portal/players/:playerId", requireAuth, async (request, response) => {
  if (!hasActiveTeamDelegateAccess(request.user)) {
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

  await updateTeamPortalPlayerData(player.id, {
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
  response.json(await buildTeamPortalPayload(request.user.id));
});

app.patch("/api/team-portal/team-logo", requireAuth, async (request, response) => {
  if (!hasActiveTeamDelegateAccess(request.user)) {
    return response.status(403).json({ error: "Permiso de delegado requerido" });
  }
  const context = await getTeamDelegateContextData(request.user.id);
  if (!context) return response.status(404).json({ error: "No tienes equipo asignado" });

  await updateTeamLogoData({
    leagueId: context.leagueId,
    teamId: context.teamId,
    logoUrl: request.body.logoUrl || ""
  });
  await logAudit({
    user: request.user,
    leagueId: context.leagueId,
    action: "team_portal_team_logo_update",
    entityType: "team",
    entityId: context.teamId,
    detail: `Delegado actualizo escudo de ${context.teamName}`
  });

  clearPublicCache();
  response.json(await buildTeamPortalPayload(request.user.id));
});

app.post("/api/team-portal/matches/:matchId/roster", requireAuth, async (request, response) => {
  if (!hasActiveTeamDelegateAccess(request.user)) {
    return response.status(403).json({ error: "Permiso de delegado requerido" });
  }
  const context = await getTeamDelegateContextData(request.user.id);
  if (!context) return response.status(404).json({ error: "No tienes equipo asignado" });

  const store = await getStoreData();
  const league = (store.leagues || []).find((item) => item.id === context.leagueId);
  const match = league?.matches?.find((item) => item.id === request.params.matchId);
  if (!league || !match) return response.status(404).json({ error: "Partido no encontrado." });
  if (match.homeTeamId !== context.teamId && match.awayTeamId !== context.teamId) {
    return response.status(403).json({ error: "Solo puedes enviar convocatoria de tu propio equipo." });
  }
  if (match.status !== "scheduled") {
    return response.status(400).json({ error: "Solo se puede enviar convocatoria de partidos programados." });
  }

  const requestedPlayerIds = [...new Set((Array.isArray(request.body.playerIds) ? request.body.playerIds : [])
    .map((playerId) => String(playerId || "").trim())
    .filter(Boolean))];
  if (!requestedPlayerIds.length) return response.status(400).json({ error: "Selecciona al menos un jugador para la convocatoria." });
  if (requestedPlayerIds.length > 40) return response.status(400).json({ error: "La convocatoria no puede exceder 40 jugadores." });

  const eligiblePlayerIds = new Set(getEligiblePlayersForTeam(league, context.teamId).map((player) => player.id));
  const invalidPlayerId = requestedPlayerIds.find((playerId) => !eligiblePlayerIds.has(playerId));
  if (invalidPlayerId) return response.status(400).json({ error: "La convocatoria incluye un jugador que no pertenece a este equipo." });

  const activeSuspensionByPlayerId = new Map();
  for (const notice of calculateSuspensionNotices(league)) {
    if (notice.status === "active" && notice.player?.id) activeSuspensionByPlayerId.set(notice.player.id, notice);
  }
  const suspendedPlayerId = requestedPlayerIds.find((playerId) => activeSuspensionByPlayerId.has(playerId));
  if (suspendedPlayerId) {
    const player = league.players.find((item) => item.id === suspendedPlayerId);
    return response.status(400).json({ error: `${player?.name || "Un jugador"} esta suspendido y no puede ser convocado.` });
  }

  const rosters = await listMatchRostersForLeagueData(league.id);
  const existingRoster = rosters.find((roster) => roster.matchId === match.id && roster.teamId === context.teamId);
  const eligibilityByPlayerId = calculatePlayerAppearanceEligibility({ ...league, matchRosters: rosters });
  const isPlayoffMatch = match.stage === "playoff" || Boolean(match.playoffRound);
  if (isPlayoffMatch) {
    const ineligiblePlayerId = requestedPlayerIds.find((playerId) => {
      const eligibility = eligibilityByPlayerId.get(playerId);
      return eligibility?.applies && !eligibility.eligible;
    });
    if (ineligiblePlayerId) {
      const player = league.players.find((item) => item.id === ineligiblePlayerId);
      return response.status(400).json({ error: `${player?.name || "Un jugador"} no cumple partidos minimos para liguilla.` });
    }
  }

  const captainPlayerId = String(request.body.captainPlayerId || "").trim();
  if (!captainPlayerId || !requestedPlayerIds.includes(captainPlayerId)) {
    return response.status(400).json({ error: "Selecciona un capitan dentro de la convocatoria." });
  }

  await upsertMatchRosterData({
    id: `match-roster-${crypto.randomUUID()}`,
    leagueId: league.id,
    matchId: match.id,
    teamId: context.teamId,
    submittedByUserId: request.user.id,
    captainPlayerId,
    captainPin: existingRoster?.captainPin || generateCaptainPin(),
    players: requestedPlayerIds.map((playerId) => ({ playerId })),
    status: "submitted",
    notes: request.body.notes || ""
  });

  await logAudit({
    user: request.user,
    leagueId: league.id,
    action: "team_match_roster_submit",
    entityType: "match_roster",
    entityId: match.id,
    detail: `Delegado envio convocatoria de ${context.teamName} para partido ${match.id}`
  });

  response.status(201).json(await buildTeamPortalPayload(request.user.id));
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
  const role = String(request.body.role || "");
  const leagueId = role === "league_admin" || role === "admin_limited" ? request.body.leagueId || "" : null;
  const permissions = role === "admin_limited"
    ? normalizeAdminPermissions(request.body.permissions)
    : getDefaultPermissionsForRole(role);
  if (!email || !request.body.name || !role) {
    return response.status(400).json({ error: "Nombre, correo y rol son requeridos" });
  }
  if (!validateEmail(email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserRole(role)) return response.status(400).json({ error: "Rol invalido" });
  if (role === "team_delegate") return response.status(400).json({ error: "Crea delegados desde el modulo de equipos." });
  if (role === "referee") return response.status(400).json({ error: "Crea arbitros desde el modulo de arbitros." });
  if (!validateAccessRole(role)) return response.status(400).json({ error: "Rol de acceso invalido" });
  if ((role === "league_admin" || role === "admin_limited") && !leagueId) {
    return response.status(400).json({ error: "Este acceso administrativo debe estar asignado a una liga" });
  }
  if (role === "admin_limited" && !permissions.length) {
    return response.status(400).json({ error: "Selecciona al menos un permiso para el admin limitado." });
  }

  const existingUser = (await listUsersData()).find((item) => String(item.email || "").toLowerCase() === email);
  if (existingUser?.status === "deleted") {
    return response.status(409).json({ error: "Ese correo pertenece a un usuario eliminado. Usa otro correo o recupera la cuenta manualmente." });
  }
  if (existingUser?.accesses?.some((access) => access.role === role && (access.leagueId || "") === (leagueId || "") && access.status !== "deleted")) {
    return response.status(409).json({ error: "Ese usuario ya tiene un acceso igual." });
  }

  const id = existingUser?.id || `user-${crypto.randomUUID()}`;
  const accessId = `access-${crypto.randomUUID()}`;
  let user;
  let invitation = null;
  try {
    if (!existingUser) {
      user = await createUserData({
        id,
        leagueId,
        name: request.body.name,
        email,
        phone: request.body.phone || "",
        role,
        status: "pending_activation",
        passwordHash: null
      });
    } else {
      user = existingUser;
    }
    await createUserAccessData({
      id: accessId,
      userId: id,
      leagueId,
      role,
      permissions,
      status: user.status === "active" ? "active" : "pending_activation"
    });
    user = await getUserById(id);
    if (user.status === "active" && existingUser) {
      const roleLabel = role === "super_admin"
        ? "super administrador"
        : role === "league_admin"
          ? "administrador de liga"
          : "administrador con permisos limitados";
      const league = (await getStoreData()).leagues.find((item) => item.id === leagueId);
      invitation = {
        activationUrl: `${getAppBaseUrl(request)}/acceso`,
        expiresAt: "",
        whatsappMessage: [
          `Hola ${request.body.name}, se agrego el acceso de ${roleLabel} a tu cuenta existente de LIGATEC${league?.name ? ` para ${league.name}` : ""}.`,
          "Entra desde Acceso LIGATEC con tu correo y contrasena actual:",
          `${getAppBaseUrl(request)}/acceso`,
          "Despues selecciona el rol administrativo correspondiente."
        ].join("\n")
      };
    } else if (user.status !== "active") {
      const league = (await getStoreData()).leagues.find((item) => item.id === leagueId);
      invitation = await createAdminInvitation({
        request,
        userId: id,
        accessId,
        adminName: request.body.name,
        role,
        leagueName: league?.name || ""
      });
    }
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
    detail: `${existingUser ? "Agrego acceso" : "Creo usuario"} ${user.email} (${role})`
  });
  response.status(201).json({ user: toPublicUser(user), invitation });
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
  next.leagueId = next.role === "league_admin" || next.role === "admin_limited"
    ? (request.body.leagueId === "" ? null : request.body.leagueId ?? current.league_id)
    : null;
  if (!validateEmail(next.email)) return response.status(400).json({ error: "Correo invalido" });
  if (!validateUserRole(next.role)) return response.status(400).json({ error: "Rol invalido" });
  if (next.role === "team_delegate") return response.status(400).json({ error: "Edita delegados desde el modulo de equipos." });
  if (next.role === "referee") return response.status(400).json({ error: "Edita arbitros desde el modulo de arbitros." });
  if (!validateUserStatus(next.status)) return response.status(400).json({ error: "Estado invalido" });
  if ((next.role === "league_admin" || next.role === "admin_limited") && !next.leagueId) {
    return response.status(400).json({ error: "Un admin de liga debe estar asignado a una liga" });
  }
  const permissions = next.role === "admin_limited"
    ? normalizeAdminPermissions(request.body.permissions)
    : getDefaultPermissionsForRole(next.role);
  if (next.role === "admin_limited" && !permissions.length) {
    return response.status(400).json({ error: "Selecciona al menos un permiso para el admin limitado." });
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
  const currentAdminAccess = (current.accesses || []).find((access) => ["super_admin", "league_admin", "admin_limited"].includes(access.role));
  const accessStatus = next.status === "active" ? "active" : next.status;
  if (currentAdminAccess) {
    await updateUserAccessData(currentAdminAccess.id, {
      leagueId: next.leagueId,
      role: next.role,
      permissions,
      status: accessStatus
    });
  } else if (["super_admin", "league_admin", "admin_limited"].includes(next.role)) {
    await createUserAccessData({
      id: `access-${crypto.randomUUID()}`,
      userId: current.id,
      leagueId: next.leagueId,
      role: next.role,
      permissions,
      status: accessStatus
    });
  }
  user = await getUserById(current.id);
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

app.post("/api/users/:userId/invitation", requireSuperAdmin, async (request, response) => {
  const user = await getUserById(request.params.userId);
  if (!user) return response.status(404).json({ error: "Usuario no encontrado" });
  if (isPortalOnlyRole(user.role)) {
    return response.status(400).json({ error: "Delegados y arbitros regeneran invitacion desde sus modulos." });
  }
  if (user.status === "deleted") return response.status(400).json({ error: "No se puede invitar a un usuario eliminado." });

  const access = (user.accesses || []).find((item) => ["super_admin", "league_admin", "admin_limited"].includes(item.role)) || null;
  const league = access?.leagueId ? (await getStoreData()).leagues.find((item) => item.id === access.leagueId) : null;
  if (user.status === "active") {
    const roleLabel = (access?.role || user.role) === "super_admin"
      ? "super administrador"
      : (access?.role || user.role) === "league_admin"
        ? "administrador de liga"
        : "administrador con permisos limitados";
    const invitation = {
      activationUrl: `${getAppBaseUrl(request)}/acceso`,
      expiresAt: "",
      whatsappMessage: [
        `Hola ${user.name}, tu acceso de ${roleLabel} en LIGATEC${league?.name ? ` para ${league.name}` : ""} esta disponible.`,
        "Entra con tu correo y contrasena actual desde:",
        `${getAppBaseUrl(request)}/acceso`,
        "Despues selecciona el rol administrativo correspondiente."
      ].join("\n")
    };
    await logAudit({
      user: request.user,
      leagueId: access?.leagueId || user.league_id,
      action: "admin_invitation",
      entityType: "user",
      entityId: user.id,
      detail: `Genero mensaje de acceso admin existente ${user.email}`
    });
    return response.json({ user: toPublicUser(user), invitation });
  }
  const invitation = await createAdminInvitation({
    request,
    userId: user.id,
    accessId: access?.id || null,
    adminName: user.name,
    role: access?.role || user.role,
    leagueName: league?.name || ""
  });

  await logAudit({
    user: request.user,
    leagueId: access?.leagueId || user.league_id,
    action: "admin_invitation",
    entityType: "user",
    entityId: user.id,
    detail: `Regenero invitacion admin ${user.email}`
  });

  response.json({ user: toPublicUser(user), invitation });
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
  const adminAccess = (user.accesses || []).find((access) => ["super_admin", "league_admin", "admin_limited"].includes(access.role) && access.status !== "deleted") || null;
  if (isPortalOnlyRole(user.role) && !adminAccess) {
    return response.status(400).json({ error: "Los delegados y arbitros se eliminan desde su modulo correspondiente." });
  }

  const fallbackAccess = getFallbackPrimaryRoleFromAccesses(user, new Set(adminAccess ? [adminAccess.id] : []));
  if (fallbackAccess) {
    if (adminAccess) {
      await updateUserAccessData(adminAccess.id, {
        leagueId: adminAccess.leagueId || null,
        role: adminAccess.role,
        permissions: adminAccess.permissions || [],
        status: "deleted"
      });
    }
    await updateUserData(user.id, {
      leagueId: fallbackAccess.leagueId || null,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: fallbackAccess.role,
      status: fallbackAccess.status === "active" ? "active" : fallbackAccess.status
    });
    const updatedUser = await getUserById(user.id);
    await logAudit({
      user: request.user,
      leagueId: adminAccess?.leagueId || user.league_id,
      action: "user_delete",
      entityType: "user",
      entityId: user.id,
      detail: `Retiro acceso administrativo de ${user.email} y conservo rol ${fallbackAccess.role}`
    });
    return response.json({ deleted: false, user: toPublicUser(updatedUser) });
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
  if (!hasAdminPermission(request.user, request.params.leagueId, "settings")) {
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
    minimumPlayoffAppearances: parseIntegerInRange(request.body.minimumPlayoffAppearances, current.minimumPlayoffAppearances ?? 0, { min: 0, max: 64, label: "Partidos minimos por jugador para liguilla" }),
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
    detail: `Actualizo reglas: default ${next.forfeitGoalsFor}-${next.forfeitGoalsAgainst}, amarillas ${next.yellowSuspensionLimit}, roja ${next.defaultRedSuspensionMatches}, liguilla ${next.playoffQualifiers}, minimo jugador ${next.minimumPlayoffAppearances}`
  });

  response.json(nextStore);
});

app.post("/api/leagues/:leagueId/teams/:teamId/withdraw", requireAuth, async (request, response) => {
  const { leagueId, teamId } = request.params;
  if (!hasAdminPermission(request.user, leagueId, "teams")) {
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
  if (!hasAdminPermission(request.user, league.id, "match_sheets")) {
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

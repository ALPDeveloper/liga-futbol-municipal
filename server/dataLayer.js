import "./env.js";
import crypto from "node:crypto";
import { DB_PATH, db, getStore as getSqliteStore, importStore as importSqliteStore, initializeDatabase } from "./database.js";
import { getPostgresStore, importPostgresStore, initializePostgresDatabase, postgresPool } from "./postgresDatabase.js";
import { sanitizeImageUrl, upperText } from "../src/lib/domain.js";

export const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER === "postgres" ? "postgres" : "sqlite";
export const DATABASE_LABEL = DATABASE_PROVIDER === "postgres" ? "postgres" : DB_PATH;
let importQueue = Promise.resolve();

function isPostgres() {
  return DATABASE_PROVIDER === "postgres";
}

function normalizeDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeUserRow(user) {
  if (!user) return null;
  return {
    ...user,
    league_id: user.league_id ?? user.leagueId ?? null,
    failed_login_count: Number(user.failed_login_count || 0),
    locked_until: normalizeDateTime(user.locked_until),
    last_failed_login_at: normalizeDateTime(user.last_failed_login_at)
  };
}

function normalizeUserAccessRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    leagueId: row.league_id ?? row.leagueId ?? "",
    leagueName: row.league_name ?? row.leagueName ?? "",
    teamId: row.team_id ?? row.teamId ?? "",
    teamName: row.team_name ?? row.teamName ?? "",
    role: row.role,
    permissions: parseJsonValue(row.permissions_json ?? row.permissionsJson, []),
    status: row.status || "active",
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt)
  };
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeTeamDelegateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    leagueName: row.league_name ?? row.leagueName,
    teamId: row.team_id ?? row.teamId,
    teamName: row.team_name ?? row.teamName,
    competitionId: row.competition_id ?? row.competitionId,
    competitionName: row.competition_name ?? row.competitionName,
    teamLogoUrl: row.team_logo_url ?? row.teamLogoUrl ?? "",
    userId: row.user_id ?? row.userId,
    userName: row.user_name ?? row.userName,
    userEmail: row.user_email ?? row.userEmail,
    userPhone: row.user_phone ?? row.userPhone ?? "",
    role: (row.assignment_role ?? row.role) || "delegate",
    assignmentStatus: (row.assignment_status ?? row.assignmentStatus) || "active",
    status: (row.user_status ?? row.status) || (row.assignment_status ?? row.assignmentStatus) || "active",
    registrationEnabled: toBoolean(row.registration_enabled ?? row.registrationEnabled),
    enabledUntil: normalizeDateTime(row.enabled_until ?? row.enabledUntil),
    notes: (row.permission_notes ?? row.notes) || ""
  };
}

function normalizeRefereeRow(row) {
  if (!row) return null;
  return {
    userId: row.user_id ?? row.userId ?? row.id,
    name: row.user_name ?? row.userName ?? row.name,
    email: row.user_email ?? row.userEmail ?? row.email,
    phone: row.user_phone ?? row.userPhone ?? row.phone ?? "",
    status: (row.referee_status ?? row.refereeStatus ?? row.user_status ?? row.userStatus ?? row.status) || "active",
    municipality: row.municipality || "",
    photoUrl: row.photo_url ?? row.photoUrl ?? "",
    notes: row.notes || "",
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt)
  };
}

function normalizeAccessRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    leagueName: row.league_name ?? row.leagueName ?? "",
    teamId: row.team_id ?? row.teamId ?? "",
    teamName: row.team_name ?? row.teamName ?? "",
    competitionId: row.competition_id ?? row.competitionId ?? "",
    competitionName: row.competition_name ?? row.competitionName ?? "",
    requestedRole: row.requested_role ?? row.requestedRole,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash ?? row.passwordHash ?? "",
    status: row.status || "pending",
    reviewNote: row.review_note ?? row.reviewNote ?? "",
    reviewedByUserId: row.reviewed_by_user_id ?? row.reviewedByUserId ?? "",
    reviewedByName: row.reviewed_by_name ?? row.reviewedByName ?? "",
    reviewedAt: normalizeDateTime(row.reviewed_at ?? row.reviewedAt),
    createdUserId: row.created_user_id ?? row.createdUserId ?? "",
    createdAccessId: row.created_access_id ?? row.createdAccessId ?? "",
    createdAssignmentId: row.created_assignment_id ?? row.createdAssignmentId ?? "",
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt)
  };
}

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeRefereeMatchSheetRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    leagueName: row.league_name ?? row.leagueName ?? "",
    matchId: row.match_id ?? row.matchId,
    submittedByUserId: row.submitted_by_user_id ?? row.submittedByUserId ?? "",
    submittedByName: row.submitted_by_name ?? row.submittedByName ?? "",
    submittedByEmail: row.submitted_by_email ?? row.submittedByEmail ?? "",
    payload: parseJsonValue(row.payload_json ?? row.payloadJson, {}),
    status: row.status || "pending_review",
    reviewNote: row.review_note ?? row.reviewNote ?? "",
    submittedAt: normalizeDateTime(row.submitted_at ?? row.submittedAt),
    reviewedByUserId: row.reviewed_by_user_id ?? row.reviewedByUserId ?? "",
    reviewedByName: row.reviewed_by_name ?? row.reviewedByName ?? "",
    reviewedAt: normalizeDateTime(row.reviewed_at ?? row.reviewedAt)
  };
}

function normalizeMatchRosterRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    matchId: row.match_id ?? row.matchId,
    teamId: row.team_id ?? row.teamId,
    submittedByUserId: row.submitted_by_user_id ?? row.submittedByUserId ?? "",
    captainPlayerId: row.captain_player_id ?? row.captainPlayerId ?? "",
    goalkeeperPlayerId: row.goalkeeper_player_id ?? row.goalkeeperPlayerId ?? "",
    captainPin: row.captain_pin ?? row.captainPin ?? "",
    players: parseJsonValue(row.players_json ?? row.playersJson, []),
    starters: parseJsonValue(row.starters_json ?? row.startersJson, []),
    substitutes: parseJsonValue(row.substitutes_json ?? row.substitutesJson, []),
    lineup: parseJsonValue(row.lineup_json ?? row.lineupJson, {}),
    status: row.status || "submitted",
    notes: row.notes || "",
    submittedAt: normalizeDateTime(row.submitted_at ?? row.submittedAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt),
    version: Number(row.version || 1)
  };
}

function normalizeMatchParticipationPlayerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    matchParticipationId: row.match_participation_id ?? row.matchParticipationId,
    playerId: row.player_id ?? row.playerId,
    playerNameSnapshot: row.player_name_snapshot ?? row.playerNameSnapshot ?? "",
    playerNumberSnapshot: row.player_number_snapshot ?? row.playerNumberSnapshot ?? "",
    playerPhotoSnapshot: row.player_photo_snapshot ?? row.playerPhotoSnapshot ?? "",
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt)
  };
}

function normalizeMatchParticipationRow(row, players = []) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    matchId: row.match_id ?? row.matchId,
    teamId: row.team_id ?? row.teamId,
    status: row.status || "submitted",
    captainPlayerId: row.captain_player_id ?? row.captainPlayerId ?? "",
    submittedByUserId: row.submitted_by_user_id ?? row.submittedByUserId ?? "",
    submittedAt: normalizeDateTime(row.submitted_at ?? row.submittedAt),
    lockedAt: normalizeDateTime(row.locked_at ?? row.lockedAt),
    correctedByUserId: row.corrected_by_user_id ?? row.correctedByUserId ?? "",
    correctedAt: normalizeDateTime(row.corrected_at ?? row.correctedAt),
    correctionReason: row.correction_reason ?? row.correctionReason ?? "",
    source: row.source || "delegate_portal",
    metadata: parseJsonValue(row.metadata_json ?? row.metadataJson, {}),
    active: toBoolean(row.active ?? row.isActive ?? true),
    version: Number(row.version || 1),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt),
    players
  };
}

function normalizeMatchTeamPinRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    matchId: row.match_id ?? row.matchId,
    teamId: row.team_id ?? row.teamId,
    rosterId: row.roster_id ?? row.rosterId ?? "",
    pinHash: row.pin_hash ?? row.pinHash ?? "",
    pinSalt: row.pin_salt ?? row.pinSalt ?? "",
    status: row.status || "active",
    attempts: Number(row.attempts || 0),
    lockedUntil: normalizeDateTime(row.locked_until ?? row.lockedUntil),
    generatedByUserId: row.generated_by_user_id ?? row.generatedByUserId ?? "",
    generatedAt: normalizeDateTime(row.generated_at ?? row.generatedAt),
    revealedByUserId: row.revealed_by_user_id ?? row.revealedByUserId ?? "",
    revealedAt: normalizeDateTime(row.revealed_at ?? row.revealedAt),
    invalidatedAt: normalizeDateTime(row.invalidated_at ?? row.invalidatedAt),
    usedAt: normalizeDateTime(row.used_at ?? row.usedAt),
    signedAt: normalizeDateTime(row.signed_at ?? row.signedAt),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt)
  };
}

function normalizeMatchSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    matchId: row.match_id ?? row.matchId,
    refereeUserId: row.referee_user_id ?? row.refereeUserId ?? "",
    captureMode: row.capture_mode ?? row.captureMode ?? "live",
    status: row.status || "draft",
    period: row.period || "",
    startedAt: normalizeDateTime(row.started_at ?? row.startedAt),
    pausedAt: normalizeDateTime(row.paused_at ?? row.pausedAt),
    savedAt: normalizeDateTime(row.saved_at ?? row.savedAt),
    resumedAt: normalizeDateTime(row.resumed_at ?? row.resumedAt),
    finishedAt: normalizeDateTime(row.finished_at ?? row.finishedAt),
    suspendedAt: normalizeDateTime(row.suspended_at ?? row.suspendedAt),
    suspensionReason: row.suspension_reason ?? row.suspensionReason ?? "",
    clockState: parseJsonValue(row.clock_state_json ?? row.clockStateJson, {}),
    metadata: parseJsonValue(row.metadata_json ?? row.metadataJson, {}),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt)
  };
}

function normalizeMatchSessionOperationRow(row) {
  if (!row) return null;
  return {
    operationId: row.operation_id ?? row.operationId,
    leagueId: row.league_id ?? row.leagueId,
    matchId: row.match_id ?? row.matchId,
    sessionId: row.session_id ?? row.sessionId ?? "",
    refereeUserId: row.referee_user_id ?? row.refereeUserId ?? "",
    operationType: row.operation_type ?? row.operationType,
    status: row.status || "synced",
    payload: parseJsonValue(row.payload_json ?? row.payloadJson, {}),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    syncedAt: normalizeDateTime(row.synced_at ?? row.syncedAt)
  };
}

function normalizeMatchReportRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leagueId: row.league_id ?? row.leagueId,
    matchId: row.match_id ?? row.matchId,
    sessionId: row.session_id ?? row.sessionId ?? "",
    generatedByUserId: row.generated_by_user_id ?? row.generatedByUserId ?? "",
    captureMode: row.capture_mode ?? row.captureMode ?? "admin",
    status: row.status || "draft",
    version: Number(row.version || 1),
    payload: parseJsonValue(row.payload_json ?? row.payloadJson, {}),
    homeGoals: row.home_goals ?? row.homeGoals ?? null,
    awayGoals: row.away_goals ?? row.awayGoals ?? null,
    generatedAt: normalizeDateTime(row.generated_at ?? row.generatedAt),
    finalizedAt: normalizeDateTime(row.finalized_at ?? row.finalizedAt),
    publishedAt: normalizeDateTime(row.published_at ?? row.publishedAt),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt)
  };
}

function normalizeMatchReportSignatureRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportId: row.report_id ?? row.reportId,
    leagueId: row.league_id ?? row.leagueId,
    matchId: row.match_id ?? row.matchId,
    teamId: row.team_id ?? row.teamId,
    captainPlayerId: row.captain_player_id ?? row.captainPlayerId ?? "",
    signedByUserId: row.signed_by_user_id ?? row.signedByUserId ?? "",
    method: row.method || "pin",
    status: row.status || "signed",
    signedAt: normalizeDateTime(row.signed_at ?? row.signedAt),
    actVersion: row.act_version ?? row.actVersion ?? null,
    actHash: row.act_hash ?? row.actHash ?? "",
    actSnapshot: parseJsonValue(row.act_snapshot_json ?? row.actSnapshotJson, {}),
    invalidatedAt: normalizeDateTime(row.invalidated_at ?? row.invalidatedAt),
    ipAddress: row.ip_address ?? row.ipAddress ?? "",
    userAgent: row.user_agent ?? row.userAgent ?? "",
    metadata: parseJsonValue(row.metadata_json ?? row.metadataJson, {})
  };
}

function isRosterOpen(row) {
  if (!toBoolean(row?.registration_enabled ?? row?.registrationEnabled)) return false;
  const enabledUntil = normalizeDateTime(row?.enabled_until ?? row?.enabledUntil);
  return !enabledUntil || new Date(enabledUntil).getTime() >= Date.now();
}

async function pgQuery(text, values = []) {
  const result = await postgresPool.query(text, values);
  return result.rows;
}

async function listUserAccessesForUserData(userId) {
  if (!userId) return [];
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT ua.*, l.name AS league_name, t.name AS team_name
      FROM user_accesses ua
      LEFT JOIN leagues l ON l.id = ua.league_id
      LEFT JOIN teams t ON t.id = ua.team_id
      WHERE ua.user_id = $1
      ORDER BY ua.role, l.name, t.name
    `, [userId]);
    return rows.map(normalizeUserAccessRow);
  }
  return db.prepare(`
    SELECT ua.*, l.name AS league_name, t.name AS team_name
    FROM user_accesses ua
    LEFT JOIN leagues l ON l.id = ua.league_id
    LEFT JOIN teams t ON t.id = ua.team_id
    WHERE ua.user_id = ?
    ORDER BY ua.role, l.name, t.name
  `).all(userId).map(normalizeUserAccessRow);
}

async function attachUserAccesses(user) {
  if (!user) return null;
  return {
    ...user,
    accesses: await listUserAccessesForUserData(user.id)
  };
}

async function attachUsersAccesses(users) {
  return Promise.all((users || []).map((user) => attachUserAccesses(user)));
}

export async function listUserAccessesData(userId = "") {
  if (userId) return listUserAccessesForUserData(userId);
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT ua.*, l.name AS league_name, t.name AS team_name
      FROM user_accesses ua
      LEFT JOIN leagues l ON l.id = ua.league_id
      LEFT JOIN teams t ON t.id = ua.team_id
      ORDER BY ua.role, l.name, t.name
    `);
    return rows.map(normalizeUserAccessRow);
  }
  return db.prepare(`
    SELECT ua.*, l.name AS league_name, t.name AS team_name
    FROM user_accesses ua
    LEFT JOIN leagues l ON l.id = ua.league_id
    LEFT JOIN teams t ON t.id = ua.team_id
    ORDER BY ua.role, l.name, t.name
  `).all().map(normalizeUserAccessRow);
}

export async function createUserAccessData({ id, userId, leagueId = null, teamId = null, role, permissions = [], status = "active" }) {
  const now = new Date().toISOString();
  const payload = JSON.stringify(permissions || []);
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO user_accesses (id, user_id, league_id, team_id, role, permissions_json, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $8)
    `, [id, userId, leagueId || null, teamId || null, role, payload, status, now]);
  } else {
    db.prepare(`
      INSERT INTO user_accesses (id, user_id, league_id, team_id, role, permissions_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, leagueId || null, teamId || null, role, payload, status, now, now);
  }
  return listUserAccessesForUserData(userId);
}

export async function updateUserAccessData(accessId, { leagueId = null, teamId = null, role, permissions = [], status = "active" }) {
  const now = new Date().toISOString();
  const payload = JSON.stringify(permissions || []);
  if (isPostgres()) {
    await pgQuery(`
      UPDATE user_accesses
      SET league_id = $1, team_id = $2, role = $3, permissions_json = $4::jsonb, status = $5, updated_at = $6
      WHERE id = $7
    `, [leagueId || null, teamId || null, role, payload, status, now, accessId]);
  } else {
    db.prepare(`
      UPDATE user_accesses
      SET league_id = ?, team_id = ?, role = ?, permissions_json = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(leagueId || null, teamId || null, role, payload, status, now, accessId);
  }
}

export async function revokeAdminActivationsData(userId) {
  const revokedAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE admin_activation_tokens
      SET revoked_at = $1
      WHERE user_id = $2 AND used_at IS NULL AND revoked_at IS NULL
    `, [revokedAt, userId]);
    return;
  }
  db.prepare(`
    UPDATE admin_activation_tokens
    SET revoked_at = ?
    WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL
  `).run(revokedAt, userId);
}

function normalizeAdminActivationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    accessId: row.access_id ?? row.accessId ?? "",
    tokenHash: row.token_hash ?? row.tokenHash,
    expiresAt: normalizeDateTime(row.expires_at ?? row.expiresAt),
    usedAt: normalizeDateTime(row.used_at ?? row.usedAt),
    revokedAt: normalizeDateTime(row.revoked_at ?? row.revokedAt),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    userName: row.user_name ?? row.userName,
    userEmail: row.user_email ?? row.userEmail,
    userStatus: row.user_status ?? row.userStatus,
    role: row.access_role ?? row.role,
    leagueId: row.league_id ?? row.leagueId ?? "",
    leagueName: row.league_name ?? row.leagueName ?? ""
  };
}

export async function createAdminActivationData({ id, userId, accessId, tokenHash, expiresAt }) {
  const createdAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO admin_activation_tokens (id, user_id, access_id, token_hash, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, userId, accessId || null, tokenHash, expiresAt, createdAt]);
  } else {
    db.prepare(`
      INSERT INTO admin_activation_tokens (id, user_id, access_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, accessId || null, tokenHash, expiresAt, createdAt);
  }
  return getAdminActivationByHashData(tokenHash);
}

export async function getAdminActivationByHashData(tokenHash) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT aat.*, u.name AS user_name, u.email AS user_email, u.status AS user_status,
        ua.role AS access_role, ua.league_id, l.name AS league_name
      FROM admin_activation_tokens aat
      JOIN users u ON u.id = aat.user_id
      LEFT JOIN user_accesses ua ON ua.id = aat.access_id
      LEFT JOIN leagues l ON l.id = ua.league_id
      WHERE aat.token_hash = $1
    `, [tokenHash]);
    return normalizeAdminActivationRow(rows[0]);
  }
  return normalizeAdminActivationRow(db.prepare(`
    SELECT aat.*, u.name AS user_name, u.email AS user_email, u.status AS user_status,
      ua.role AS access_role, ua.league_id, l.name AS league_name
    FROM admin_activation_tokens aat
    JOIN users u ON u.id = aat.user_id
    LEFT JOIN user_accesses ua ON ua.id = aat.access_id
    LEFT JOIN leagues l ON l.id = ua.league_id
    WHERE aat.token_hash = ?
  `).get(tokenHash));
}

export async function markAdminActivationUsedData(activationId) {
  const usedAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery("UPDATE admin_activation_tokens SET used_at = $1 WHERE id = $2", [usedAt, activationId]);
    return;
  }
  db.prepare("UPDATE admin_activation_tokens SET used_at = ? WHERE id = ?").run(usedAt, activationId);
}

export async function initializeData() {
  if (isPostgres()) {
    await initializePostgresDatabase();
    return;
  }
  await initializeDatabase();
}

export async function getStoreData() {
  return isPostgres() ? getPostgresStore() : getSqliteStore();
}

export async function importStoreData(store) {
  const importTask = async () => (isPostgres() ? importPostgresStore(store) : importSqliteStore(store));
  importQueue = importQueue.catch(() => null).then(importTask);
  return importQueue;
}

export async function getActiveUserByEmail(email) {
  let user;
  if (isPostgres()) {
    const rows = await pgQuery("SELECT * FROM users WHERE lower(email) = $1 AND status = 'active'", [email]);
    user = normalizeUserRow(rows[0]);
    return attachUserAccesses(user);
  }
  user = normalizeUserRow(db.prepare("SELECT * FROM users WHERE lower(email) = ? AND status = 'active'").get(email));
  return attachUserAccesses(user);
}

export async function getUserById(userId, { activeOnly = false } = {}) {
  let user;
  if (isPostgres()) {
    const rows = await pgQuery(
      `SELECT * FROM users WHERE id = $1${activeOnly ? " AND status = 'active'" : ""}`,
      [userId]
    );
    user = normalizeUserRow(rows[0]);
    return attachUserAccesses(user);
  }
  const sql = `SELECT * FROM users WHERE id = ?${activeOnly ? " AND status = 'active'" : ""}`;
  user = normalizeUserRow(db.prepare(sql).get(userId));
  return attachUserAccesses(user);
}

export async function listUsersData() {
  let users;
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT id, league_id, name, email, phone, role, status, failed_login_count, locked_until
      FROM users
      ORDER BY role, name
    `);
    users = rows.map(normalizeUserRow);
    return attachUsersAccesses(users);
  }
  users = db.prepare(`
    SELECT id, league_id, name, email, phone, role, status, failed_login_count, locked_until
    FROM users
    ORDER BY role, name
  `).all().map(normalizeUserRow);
  return attachUsersAccesses(users);
}

export async function createUserData({ id, leagueId, name, email, phone = "", role, status, passwordHash }) {
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO users (id, league_id, name, email, phone, role, status, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, leagueId || null, name, email, phone, role, status || "active", passwordHash || null]);
  } else {
    db.prepare(`
      INSERT INTO users (id, league_id, name, email, phone, role, status, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, leagueId || null, name, email, phone, role, status || "active", passwordHash || null);
  }
  return getUserById(id);
}

export async function updateUserData(userId, payload) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET league_id = $1, name = $2, email = $3, phone = $4, role = $5, status = $6
      WHERE id = $7
    `, [payload.leagueId, payload.name, payload.email, payload.phone || "", payload.role, payload.status, userId]);
    if (payload.passwordHash) {
      await pgQuery(`
        UPDATE users
        SET password_hash = $1, failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
        WHERE id = $2
      `, [payload.passwordHash, userId]);
    }
    return getUserById(userId);
  }

  db.prepare(`
    UPDATE users
    SET league_id = ?, name = ?, email = ?, phone = ?, role = ?, status = ?
    WHERE id = ?
  `).run(payload.leagueId, payload.name, payload.email, payload.phone || "", payload.role, payload.status, userId);
  if (payload.passwordHash) {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
      WHERE id = ?
    `).run(payload.passwordHash, userId);
  }
  return getUserById(userId);
}

function accessRequestSelectSql() {
  return `
    SELECT ar.*,
      l.name AS league_name,
      t.name AS team_name,
      t.competition_id,
      c.name AS competition_name,
      reviewer.name AS reviewed_by_name
    FROM access_requests ar
    JOIN leagues l ON l.id = ar.league_id
    LEFT JOIN teams t ON t.id = ar.team_id
    LEFT JOIN competitions c ON c.id = t.competition_id
    LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by_user_id
  `;
}

export async function createAccessRequestData({
  id,
  leagueId,
  teamId = null,
  requestedRole,
  name,
  email,
  phone,
  passwordHash
}) {
  const createdAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO access_requests (
        id, league_id, team_id, requested_role, name, email, phone, password_hash, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
    `, [id, leagueId, teamId || null, requestedRole, name, email, phone, passwordHash, createdAt]);
    return getAccessRequestData(id);
  }
  db.prepare(`
    INSERT INTO access_requests (
      id, league_id, team_id, requested_role, name, email, phone, password_hash, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, leagueId, teamId || null, requestedRole, name, email, phone, passwordHash, createdAt);
  return getAccessRequestData(id);
}

export async function listAccessRequestsData({ leagueId = "", status = "pending", role = "" } = {}) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      ${accessRequestSelectSql()}
      WHERE ($1::text = '' OR ar.league_id = $1)
        AND ($2::text = 'all' OR ar.status = $2)
        AND ($3::text = '' OR ar.requested_role = $3)
      ORDER BY
        CASE ar.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        ar.created_at DESC
    `, [leagueId || "", status || "pending", role || ""]);
    return rows.map(normalizeAccessRequestRow);
  }
  return db.prepare(`
    ${accessRequestSelectSql()}
    WHERE (? = '' OR ar.league_id = ?)
      AND (? = 'all' OR ar.status = ?)
      AND (? = '' OR ar.requested_role = ?)
    ORDER BY
      CASE ar.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      datetime(ar.created_at) DESC
  `).all(leagueId || "", leagueId || "", status || "pending", status || "pending", role || "", role || "").map(normalizeAccessRequestRow);
}

export async function getAccessRequestData(requestId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      ${accessRequestSelectSql()}
      WHERE ar.id = $1
    `, [requestId]);
    return normalizeAccessRequestRow(rows[0]);
  }
  return normalizeAccessRequestRow(db.prepare(`
    ${accessRequestSelectSql()}
    WHERE ar.id = ?
  `).get(requestId));
}

export async function updateAccessRequestReviewData(requestId, {
  status,
  reviewNote = "",
  reviewedByUserId = "",
  createdUserId = "",
  createdAccessId = "",
  createdAssignmentId = ""
}) {
  const reviewedAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE access_requests
      SET status = $1,
          review_note = $2,
          reviewed_by_user_id = $3,
          reviewed_at = $4,
          created_user_id = $5,
          created_access_id = $6,
          created_assignment_id = $7
      WHERE id = $8
    `, [status, reviewNote, reviewedByUserId || null, reviewedAt, createdUserId || null, createdAccessId || null, createdAssignmentId || null, requestId]);
    return getAccessRequestData(requestId);
  }
  db.prepare(`
    UPDATE access_requests
    SET status = ?,
        review_note = ?,
        reviewed_by_user_id = ?,
        reviewed_at = ?,
        created_user_id = ?,
        created_access_id = ?,
        created_assignment_id = ?
    WHERE id = ?
  `).run(status, reviewNote, reviewedByUserId || null, reviewedAt, createdUserId || null, createdAccessId || null, createdAssignmentId || null, requestId);
  return getAccessRequestData(requestId);
}

export async function listTeamDelegatesData(leagueId = "") {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT
        tua.id, tua.league_id, l.name AS league_name, tua.team_id, t.name AS team_name,
        t.logo_url AS team_logo_url, t.competition_id, c.name AS competition_name,
        tua.user_id, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
        tua.role AS assignment_role, tua.status AS assignment_status,
        COALESCE(trp.registration_enabled, false) AS registration_enabled,
        trp.enabled_until, trp.notes AS permission_notes
      FROM team_user_assignments tua
      JOIN users u ON u.id = tua.user_id
      JOIN teams t ON t.id = tua.team_id
      JOIN leagues l ON l.id = tua.league_id
      LEFT JOIN competitions c ON c.id = t.competition_id
      LEFT JOIN team_roster_permissions trp ON trp.team_id = tua.team_id
      WHERE ($1::text = '' OR tua.league_id = $1)
      ORDER BY l.name, t.name, u.name
    `, [leagueId || ""]);
    return rows.map(normalizeTeamDelegateRow);
  }

  const rows = db.prepare(`
    SELECT
      tua.id, tua.league_id, l.name AS league_name, tua.team_id, t.name AS team_name,
      t.logo_url AS team_logo_url, t.competition_id, c.name AS competition_name,
      tua.user_id, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
      tua.role AS assignment_role, tua.status AS assignment_status,
      COALESCE(trp.registration_enabled, 0) AS registration_enabled,
      trp.enabled_until, trp.notes AS permission_notes
    FROM team_user_assignments tua
    JOIN users u ON u.id = tua.user_id
    JOIN teams t ON t.id = tua.team_id
    JOIN leagues l ON l.id = tua.league_id
    LEFT JOIN competitions c ON c.id = t.competition_id
    LEFT JOIN team_roster_permissions trp ON trp.team_id = tua.team_id
    WHERE (? = '' OR tua.league_id = ?)
    ORDER BY l.name, t.name, u.name
  `).all(leagueId || "", leagueId || "");
  return rows.map(normalizeTeamDelegateRow);
}

export async function createTeamDelegateAssignmentData({ id, leagueId, teamId, userId, status = "active" }) {
  const createdAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO team_user_assignments (id, league_id, team_id, user_id, role, status, created_at)
      VALUES ($1, $2, $3, $4, 'delegate', $5, $6)
    `, [id, leagueId, teamId, userId, status, createdAt]);
  } else {
    db.prepare(`
      INSERT INTO team_user_assignments (id, league_id, team_id, user_id, role, status, created_at)
      VALUES (?, ?, ?, ?, 'delegate', ?, ?)
    `).run(id, leagueId, teamId, userId, status, createdAt);
  }
  return listTeamDelegatesData(leagueId);
}

export async function listRefereesData(municipality = "") {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT
        rp.user_id, rp.municipality, rp.photo_url, rp.notes, rp.created_at, rp.updated_at,
        u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
        COALESCE(ua.status, CASE WHEN u.role = 'referee' THEN u.status ELSE NULL END) AS referee_status
      FROM referee_profiles rp
      JOIN users u ON u.id = rp.user_id
      LEFT JOIN user_accesses ua ON ua.user_id = u.id AND ua.role = 'referee' AND ua.status <> 'deleted'
      WHERE ($1::text = '' OR rp.municipality = $1)
      ORDER BY rp.municipality, u.name
    `, [municipality || ""]);
    return rows.map(normalizeRefereeRow);
  }
  return db.prepare(`
    SELECT
      rp.user_id, rp.municipality, rp.photo_url, rp.notes, rp.created_at, rp.updated_at,
      u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
      COALESCE(ua.status, CASE WHEN u.role = 'referee' THEN u.status ELSE NULL END) AS referee_status
    FROM referee_profiles rp
    JOIN users u ON u.id = rp.user_id
    LEFT JOIN user_accesses ua ON ua.user_id = u.id AND ua.role = 'referee' AND ua.status <> 'deleted'
    WHERE (? = '' OR rp.municipality = ?)
    ORDER BY rp.municipality, u.name
  `).all(municipality || "", municipality || "").map(normalizeRefereeRow);
}

export async function createRefereeProfileData({ userId, municipality, photoUrl = "", notes = "" }) {
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO referee_profiles (user_id, municipality, photo_url, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
    `, [userId, upperText(municipality), sanitizeImageUrl(photoUrl), notes, now]);
    return;
  }
  db.prepare(`
    INSERT INTO referee_profiles (user_id, municipality, photo_url, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, upperText(municipality), sanitizeImageUrl(photoUrl), notes, now, now);
}

export async function updateRefereeStatusData(userId, status) {
  const user = await getUserById(userId);
  const refereeAccess = (user?.accesses || []).find((access) => access.role === "referee" && access.status !== "deleted");
  if (refereeAccess) {
    await updateUserAccessData(refereeAccess.id, {
      leagueId: refereeAccess.leagueId || null,
      teamId: refereeAccess.teamId || null,
      role: "referee",
      permissions: refereeAccess.permissions || [],
      status
    });
    return getUserById(userId);
  }
  if (isPostgres()) {
    await pgQuery("UPDATE users SET status = $1 WHERE id = $2 AND role = 'referee'", [status, userId]);
    return getUserById(userId);
  }
  db.prepare("UPDATE users SET status = ? WHERE id = ? AND role = 'referee'").run(status, userId);
  return getUserById(userId);
}

export async function getRefereeProfileData(userId) {
  const rows = isPostgres()
    ? await pgQuery(`
        SELECT
          rp.user_id, rp.municipality, rp.photo_url, rp.notes, rp.created_at, rp.updated_at,
          u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
          COALESCE(ua.status, CASE WHEN u.role = 'referee' THEN u.status ELSE NULL END) AS referee_status
        FROM referee_profiles rp
        JOIN users u ON u.id = rp.user_id
        LEFT JOIN user_accesses ua ON ua.user_id = u.id AND ua.role = 'referee' AND ua.status <> 'deleted'
        WHERE rp.user_id = $1
      `, [userId])
    : db.prepare(`
        SELECT
          rp.user_id, rp.municipality, rp.photo_url, rp.notes, rp.created_at, rp.updated_at,
          u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
          COALESCE(ua.status, CASE WHEN u.role = 'referee' THEN u.status ELSE NULL END) AS referee_status
        FROM referee_profiles rp
        JOIN users u ON u.id = rp.user_id
        LEFT JOIN user_accesses ua ON ua.user_id = u.id AND ua.role = 'referee' AND ua.status <> 'deleted'
        WHERE rp.user_id = ?
      `).all(userId);
  return normalizeRefereeRow(rows[0]);
}

export async function removeRefereeRoleData(userId) {
  if (isPostgres()) {
    await pgQuery("DELETE FROM referee_profiles WHERE user_id = $1", [userId]);
    await pgQuery("DELETE FROM user_accesses WHERE user_id = $1 AND role = 'referee'", [userId]);
    await pgQuery("UPDATE matches SET central_referee_user_id = NULL WHERE central_referee_user_id = $1", [userId]);
    await pgQuery("UPDATE matches SET assistant_referee1_user_id = NULL WHERE assistant_referee1_user_id = $1", [userId]);
    await pgQuery("UPDATE matches SET assistant_referee2_user_id = NULL WHERE assistant_referee2_user_id = $1", [userId]);
    await pgQuery("UPDATE matches SET fourth_referee_user_id = NULL WHERE fourth_referee_user_id = $1", [userId]);
    return;
  }
  db.prepare("DELETE FROM referee_profiles WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM user_accesses WHERE user_id = ? AND role = 'referee'").run(userId);
  db.prepare("UPDATE matches SET central_referee_user_id = NULL WHERE central_referee_user_id = ?").run(userId);
  db.prepare("UPDATE matches SET assistant_referee1_user_id = NULL WHERE assistant_referee1_user_id = ?").run(userId);
  db.prepare("UPDATE matches SET assistant_referee2_user_id = NULL WHERE assistant_referee2_user_id = ?").run(userId);
  db.prepare("UPDATE matches SET fourth_referee_user_id = NULL WHERE fourth_referee_user_id = ?").run(userId);
}

export async function updateMatchRefereesData(matchId, payload) {
  const preserveCrewMode = payload.refereeCrewMode === undefined;
  const values = [
    payload.centralRefereeUserId || null,
    payload.assistantReferee1UserId || null,
    payload.assistantReferee2UserId || null,
    payload.fourthRefereeUserId || null,
    preserveCrewMode ? null : payload.refereeCrewMode || null,
    preserveCrewMode,
    matchId
  ];
  if (isPostgres()) {
    await pgQuery(`
      UPDATE matches
      SET central_referee_user_id = $1,
          assistant_referee1_user_id = $2,
          assistant_referee2_user_id = $3,
          fourth_referee_user_id = $4,
          referee_crew_mode = CASE WHEN $6::boolean THEN referee_crew_mode ELSE $5 END
      WHERE id = $7
    `, values);
    return;
  }
  db.prepare(`
    UPDATE matches
    SET central_referee_user_id = ?,
        assistant_referee1_user_id = ?,
        assistant_referee2_user_id = ?,
        fourth_referee_user_id = ?,
        referee_crew_mode = CASE WHEN ? THEN referee_crew_mode ELSE ? END
    WHERE id = ?
  `).run(
    values[0],
    values[1],
    values[2],
    values[3],
    preserveCrewMode ? 1 : 0,
    values[4],
    matchId
  );
}

export async function createRefereeMatchSheetData({
  id,
  leagueId,
  matchId,
  submittedByUserId,
  payload,
  status = "pending_review",
  reviewNote = "",
  submittedAt = new Date().toISOString(),
  reviewedByUserId = null,
  reviewedAt = null
}) {
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO referee_match_sheets (
        id, league_id, match_id, submitted_by_user_id, payload_json, status, review_note, submitted_at, reviewed_by_user_id, reviewed_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        league_id = EXCLUDED.league_id,
        match_id = EXCLUDED.match_id,
        submitted_by_user_id = EXCLUDED.submitted_by_user_id,
        payload_json = EXCLUDED.payload_json,
        status = EXCLUDED.status,
        review_note = EXCLUDED.review_note,
        submitted_at = EXCLUDED.submitted_at,
        reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
        reviewed_at = EXCLUDED.reviewed_at
    `, [id, leagueId, matchId, submittedByUserId, JSON.stringify(payload || {}), status, reviewNote, submittedAt, reviewedByUserId, reviewedAt]);
    return getRefereeMatchSheetData(id);
  }
  db.prepare(`
    INSERT INTO referee_match_sheets (
      id, league_id, match_id, submitted_by_user_id, payload_json, status, review_note, submitted_at, reviewed_by_user_id, reviewed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      league_id = excluded.league_id,
      match_id = excluded.match_id,
      submitted_by_user_id = excluded.submitted_by_user_id,
      payload_json = excluded.payload_json,
      status = excluded.status,
      review_note = excluded.review_note,
      submitted_at = excluded.submitted_at,
      reviewed_by_user_id = excluded.reviewed_by_user_id,
      reviewed_at = excluded.reviewed_at
  `).run(id, leagueId, matchId, submittedByUserId, JSON.stringify(payload || {}), status, reviewNote, submittedAt, reviewedByUserId, reviewedAt);
  return getRefereeMatchSheetData(id);
}

export async function getPendingRefereeMatchSheetForMatchData(matchId) {
  const rows = isPostgres()
    ? await pgQuery(`
        SELECT rms.*, submitter.name AS submitted_by_name, submitter.email AS submitted_by_email
        FROM referee_match_sheets rms
        LEFT JOIN users submitter ON submitter.id = rms.submitted_by_user_id
        WHERE rms.match_id = $1 AND rms.status = 'pending_review'
        ORDER BY rms.submitted_at DESC
        LIMIT 1
      `, [matchId])
    : db.prepare(`
        SELECT rms.*, submitter.name AS submitted_by_name, submitter.email AS submitted_by_email
        FROM referee_match_sheets rms
        LEFT JOIN users submitter ON submitter.id = rms.submitted_by_user_id
        WHERE rms.match_id = ? AND rms.status = 'pending_review'
        ORDER BY rms.submitted_at DESC
        LIMIT 1
      `).all(matchId);
  return normalizeRefereeMatchSheetRow(rows[0]);
}

export async function getRefereeMatchSheetData(sheetId) {
  const rows = isPostgres()
    ? await pgQuery(`
        SELECT
          rms.*, submitter.name AS submitted_by_name, submitter.email AS submitted_by_email,
          reviewer.name AS reviewed_by_name
        FROM referee_match_sheets rms
        LEFT JOIN users submitter ON submitter.id = rms.submitted_by_user_id
        LEFT JOIN users reviewer ON reviewer.id = rms.reviewed_by_user_id
        WHERE rms.id = $1
      `, [sheetId])
    : db.prepare(`
        SELECT
          rms.*, submitter.name AS submitted_by_name, submitter.email AS submitted_by_email,
          reviewer.name AS reviewed_by_name
        FROM referee_match_sheets rms
        LEFT JOIN users submitter ON submitter.id = rms.submitted_by_user_id
        LEFT JOIN users reviewer ON reviewer.id = rms.reviewed_by_user_id
        WHERE rms.id = ?
      `).all(sheetId);
  return normalizeRefereeMatchSheetRow(rows[0]);
}

export async function listRefereeMatchSheetsData({ leagueId = "", status = "pending_review" } = {}) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT
        rms.*, leagues.name AS league_name,
        submitter.name AS submitted_by_name, submitter.email AS submitted_by_email,
        reviewer.name AS reviewed_by_name
      FROM referee_match_sheets rms
      JOIN leagues ON leagues.id = rms.league_id
      LEFT JOIN users submitter ON submitter.id = rms.submitted_by_user_id
      LEFT JOIN users reviewer ON reviewer.id = rms.reviewed_by_user_id
      WHERE ($1::text = '' OR rms.league_id = $1)
        AND ($2::text = 'all' OR rms.status = $2)
      ORDER BY rms.submitted_at DESC
    `, [leagueId || "", status || "pending_review"]);
    return rows.map(normalizeRefereeMatchSheetRow);
  }
  return db.prepare(`
    SELECT
      rms.*, leagues.name AS league_name,
      submitter.name AS submitted_by_name, submitter.email AS submitted_by_email,
      reviewer.name AS reviewed_by_name
    FROM referee_match_sheets rms
    JOIN leagues ON leagues.id = rms.league_id
    LEFT JOIN users submitter ON submitter.id = rms.submitted_by_user_id
    LEFT JOIN users reviewer ON reviewer.id = rms.reviewed_by_user_id
    WHERE (? = '' OR rms.league_id = ?)
      AND (? = 'all' OR rms.status = ?)
    ORDER BY rms.submitted_at DESC
  `).all(leagueId || "", leagueId || "", status || "pending_review", status || "pending_review").map(normalizeRefereeMatchSheetRow);
}

export async function updateRefereeMatchSheetReviewData({ sheetId, status, reviewNote = "", reviewedByUserId }) {
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE referee_match_sheets
      SET status = $1,
          review_note = $2,
          reviewed_by_user_id = $3,
          reviewed_at = $4
      WHERE id = $5
    `, [status, reviewNote, reviewedByUserId, now, sheetId]);
    return getRefereeMatchSheetData(sheetId);
  }
  db.prepare(`
    UPDATE referee_match_sheets
    SET status = ?,
        review_note = ?,
        reviewed_by_user_id = ?,
        reviewed_at = ?
    WHERE id = ?
  `).run(status, reviewNote, reviewedByUserId, now, sheetId);
  return getRefereeMatchSheetData(sheetId);
}

export async function listRefereeMatchSheetsForRefereeData(userId, { status = "pending_review" } = {}) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT rms.*, leagues.name AS league_name
      FROM referee_match_sheets rms
      JOIN leagues ON leagues.id = rms.league_id
      WHERE rms.submitted_by_user_id = $1
        AND ($2::text = 'all' OR rms.status = $2)
      ORDER BY rms.submitted_at DESC
    `, [userId, status || "pending_review"]);
    return rows.map(normalizeRefereeMatchSheetRow);
  }
  return db.prepare(`
    SELECT rms.*, leagues.name AS league_name
    FROM referee_match_sheets rms
    JOIN leagues ON leagues.id = rms.league_id
    WHERE rms.submitted_by_user_id = ?
      AND (? = 'all' OR rms.status = ?)
    ORDER BY rms.submitted_at DESC
  `).all(userId, status || "pending_review", status || "pending_review").map(normalizeRefereeMatchSheetRow);
}

export async function updateTeamDelegateAssignmentData(assignmentId, { status }) {
  if (isPostgres()) {
    await pgQuery("UPDATE team_user_assignments SET status = $1 WHERE id = $2", [status, assignmentId]);
    return;
  }
  db.prepare("UPDATE team_user_assignments SET status = ? WHERE id = ?").run(status, assignmentId);
}

export async function updateTeamDelegateStatusData({ assignmentId, userId, status }) {
  if (isPostgres()) {
    await pgQuery("UPDATE team_user_assignments SET status = $1 WHERE id = $2", [status === "active" ? "active" : status, assignmentId]);
    await pgQuery("UPDATE users SET status = $1 WHERE id = $2 AND role = 'team_delegate'", [status, userId]);
    await pgQuery(`
      UPDATE user_accesses ua
      SET status = $1, updated_at = $2
      FROM team_user_assignments tua
      WHERE tua.id = $3
        AND ua.user_id = tua.user_id
        AND ua.role = 'team_delegate'
        AND ua.team_id = tua.team_id
        AND ua.status <> 'deleted'
    `, [status, new Date().toISOString(), assignmentId]);
    return;
  }
  db.prepare("UPDATE team_user_assignments SET status = ? WHERE id = ?").run(status === "active" ? "active" : status, assignmentId);
  db.prepare("UPDATE users SET status = ? WHERE id = ? AND role = 'team_delegate'").run(status, userId);
  db.prepare(`
    UPDATE user_accesses
    SET status = ?, updated_at = ?
    WHERE role = 'team_delegate'
      AND status <> 'deleted'
      AND EXISTS (
        SELECT 1
        FROM team_user_assignments tua
        WHERE tua.id = ?
          AND tua.user_id = user_accesses.user_id
          AND tua.team_id = user_accesses.team_id
      )
  `).run(status, new Date().toISOString(), assignmentId);
}

export async function deleteTeamDelegateAssignmentData(assignmentId) {
  if (isPostgres()) {
    await pgQuery("DELETE FROM team_user_assignments WHERE id = $1", [assignmentId]);
    return;
  }
  db.prepare("DELETE FROM team_user_assignments WHERE id = ?").run(assignmentId);
}

export async function countTeamDelegateAssignmentsData(userId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT COUNT(*)::int AS total
      FROM team_user_assignments
      WHERE user_id = $1
    `, [userId]);
    return rows[0]?.total || 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM team_user_assignments
    WHERE user_id = ?
  `).get(userId).total;
}

export async function setTeamRosterPermissionData({ leagueId, teamId, registrationEnabled, enabledUntil = null, notes = "" }) {
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO team_roster_permissions (team_id, league_id, registration_enabled, enabled_until, notes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(team_id) DO UPDATE
      SET registration_enabled = EXCLUDED.registration_enabled,
          enabled_until = EXCLUDED.enabled_until,
          notes = EXCLUDED.notes,
          updated_at = EXCLUDED.updated_at
    `, [teamId, leagueId, Boolean(registrationEnabled), enabledUntil || null, notes, now]);
    return;
  }
  db.prepare(`
    INSERT INTO team_roster_permissions (team_id, league_id, registration_enabled, enabled_until, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id) DO UPDATE
    SET registration_enabled = excluded.registration_enabled,
        enabled_until = excluded.enabled_until,
        notes = excluded.notes,
        updated_at = excluded.updated_at
  `).run(teamId, leagueId, registrationEnabled ? 1 : 0, enabledUntil || null, notes, now);
}

export async function getTeamDelegateContextData(userId) {
  const rows = isPostgres()
    ? await pgQuery(`
        SELECT
          tua.id, tua.league_id, l.name AS league_name, tua.team_id, t.name AS team_name,
          t.logo_url AS team_logo_url, t.competition_id, c.name AS competition_name,
          tua.user_id, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
          tua.role AS assignment_role, tua.status AS assignment_status,
          COALESCE(trp.registration_enabled, false) AS registration_enabled,
          trp.enabled_until, trp.notes AS permission_notes
        FROM team_user_assignments tua
        JOIN users u ON u.id = tua.user_id
        JOIN teams t ON t.id = tua.team_id
        JOIN leagues l ON l.id = tua.league_id
        LEFT JOIN competitions c ON c.id = t.competition_id
        LEFT JOIN team_roster_permissions trp ON trp.team_id = tua.team_id
        WHERE tua.user_id = $1 AND tua.status = 'active' AND u.status = 'active'
        ORDER BY tua.created_at ASC
        LIMIT 1
      `, [userId])
    : db.prepare(`
        SELECT
          tua.id, tua.league_id, l.name AS league_name, tua.team_id, t.name AS team_name,
          t.logo_url AS team_logo_url, t.competition_id, c.name AS competition_name,
          tua.user_id, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
          tua.role AS assignment_role, tua.status AS assignment_status,
          COALESCE(trp.registration_enabled, 0) AS registration_enabled,
          trp.enabled_until, trp.notes AS permission_notes
        FROM team_user_assignments tua
        JOIN users u ON u.id = tua.user_id
        JOIN teams t ON t.id = tua.team_id
        JOIN leagues l ON l.id = tua.league_id
        LEFT JOIN competitions c ON c.id = t.competition_id
        LEFT JOIN team_roster_permissions trp ON trp.team_id = tua.team_id
        WHERE tua.user_id = ? AND tua.status = 'active' AND u.status = 'active'
        ORDER BY tua.created_at ASC
        LIMIT 1
      `).all(userId);

  const context = normalizeTeamDelegateRow(rows[0]);
  return context ? { ...context, canManageRoster: isRosterOpen(rows[0]) } : null;
}

export async function listTeamPortalPlayersData(teamId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT id, league_id, competition_id, team_id, name, number, position, photo_url, photo_authorized, status
      FROM players
      WHERE team_id = $1 AND COALESCE(status, 'active') <> 'historical'
      ORDER BY number, name
    `, [teamId]);
    return rows.map(normalizePlayerRow);
  }
  return db.prepare(`
    SELECT id, league_id, competition_id, team_id, name, number, position, photo_url, photo_authorized, status
    FROM players
    WHERE team_id = ? AND COALESCE(status, 'active') <> 'historical'
    ORDER BY number, name
  `).all(teamId).map(normalizePlayerRow);
}

export async function listMatchRostersForLeagueData(leagueId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, goalkeeper_player_id, captain_pin, players_json, starters_json, substitutes_json, lineup_json, status, notes, submitted_at, updated_at, version
      FROM match_rosters
      WHERE league_id = $1
      ORDER BY submitted_at DESC
    `, [leagueId]);
    return rows.map(normalizeMatchRosterRow);
  }
  return db.prepare(`
    SELECT id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, goalkeeper_player_id, captain_pin, players_json, starters_json, substitutes_json, lineup_json, status, notes, submitted_at, updated_at, version
    FROM match_rosters
    WHERE league_id = ?
    ORDER BY submitted_at DESC
  `).all(leagueId).map(normalizeMatchRosterRow);
}

export async function upsertMatchRosterData({ id, leagueId, matchId, teamId, submittedByUserId, captainPlayerId, goalkeeperPlayerId = "", captainPin = "", players, starters = [], substitutes = [], lineup = {}, status = "submitted", notes = "" }) {
  const now = new Date().toISOString();
  const payload = JSON.stringify(players || []);
  const startersPayload = JSON.stringify(starters || []);
  const substitutesPayload = JSON.stringify(substitutes || []);
  const lineupPayload = JSON.stringify(lineup || {});
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO match_rosters (id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, goalkeeper_player_id, captain_pin, players_json, starters_json, substitutes_json, lineup_json, status, notes, submitted_at, updated_at, version)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $15, 1)
      ON CONFLICT (match_id, team_id) DO UPDATE SET
        submitted_by_user_id = EXCLUDED.submitted_by_user_id,
        captain_player_id = EXCLUDED.captain_player_id,
        goalkeeper_player_id = EXCLUDED.goalkeeper_player_id,
        captain_pin = EXCLUDED.captain_pin,
        players_json = EXCLUDED.players_json,
        starters_json = EXCLUDED.starters_json,
        substitutes_json = EXCLUDED.substitutes_json,
        lineup_json = EXCLUDED.lineup_json,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at,
        version = match_rosters.version + 1
    `, [id, leagueId, matchId, teamId, submittedByUserId, captainPlayerId || null, goalkeeperPlayerId || null, captainPin, payload, startersPayload, substitutesPayload, lineupPayload, status, notes, now]);
    return;
  }
  db.prepare(`
    INSERT INTO match_rosters (id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, goalkeeper_player_id, captain_pin, players_json, starters_json, substitutes_json, lineup_json, status, notes, submitted_at, updated_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(match_id, team_id) DO UPDATE SET
      submitted_by_user_id = excluded.submitted_by_user_id,
      captain_player_id = excluded.captain_player_id,
      goalkeeper_player_id = excluded.goalkeeper_player_id,
      captain_pin = excluded.captain_pin,
      players_json = excluded.players_json,
      starters_json = excluded.starters_json,
      substitutes_json = excluded.substitutes_json,
      lineup_json = excluded.lineup_json,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      version = match_rosters.version + 1
  `).run(id, leagueId, matchId, teamId, submittedByUserId, captainPlayerId || null, goalkeeperPlayerId || null, captainPin, payload, startersPayload, substitutesPayload, lineupPayload, status, notes, now, now);
}

async function attachParticipationPlayers(participations) {
  const rows = (participations || []).filter(Boolean);
  if (!rows.length) return [];
  const ids = rows.map((item) => item.id);
  let playerRows = [];
  if (isPostgres()) {
    playerRows = await pgQuery(`
      SELECT *
      FROM match_participation_players
      WHERE match_participation_id = ANY($1::text[])
      ORDER BY created_at ASC
    `, [ids]);
  } else {
    const placeholders = ids.map(() => "?").join(",");
    playerRows = db.prepare(`
      SELECT *
      FROM match_participation_players
      WHERE match_participation_id IN (${placeholders})
      ORDER BY created_at ASC
    `).all(...ids);
  }
  const playersByParticipationId = new Map();
  for (const row of playerRows.map(normalizeMatchParticipationPlayerRow)) {
    if (!playersByParticipationId.has(row.matchParticipationId)) playersByParticipationId.set(row.matchParticipationId, []);
    playersByParticipationId.get(row.matchParticipationId).push(row);
  }
  return rows.map((row) => normalizeMatchParticipationRow(row, playersByParticipationId.get(row.id) || []));
}

export async function listMatchParticipationsForLeagueData(leagueId, { activeOnly = true } = {}) {
  if (!leagueId) return [];
  let rows;
  if (isPostgres()) {
    rows = await pgQuery(`
      SELECT *
      FROM match_participations
      WHERE league_id = $1 AND ($2::boolean = false OR active = true)
      ORDER BY submitted_at DESC, version DESC
    `, [leagueId, Boolean(activeOnly)]);
  } else {
    rows = db.prepare(`
      SELECT *
      FROM match_participations
      WHERE league_id = ? AND (? = 0 OR active = 1)
      ORDER BY submitted_at DESC, version DESC
    `).all(leagueId, activeOnly ? 1 : 0);
  }
  return attachParticipationPlayers(rows);
}

export async function getActiveMatchParticipationData(matchId, teamId) {
  if (!matchId || !teamId) return null;
  let rows;
  if (isPostgres()) {
    rows = await pgQuery(`
      SELECT *
      FROM match_participations
      WHERE match_id = $1 AND team_id = $2 AND active = true
      ORDER BY version DESC
      LIMIT 1
    `, [matchId, teamId]);
  } else {
    rows = db.prepare(`
      SELECT *
      FROM match_participations
      WHERE match_id = ? AND team_id = ? AND active = 1
      ORDER BY version DESC
      LIMIT 1
    `).all(matchId, teamId);
  }
  const [participation] = await attachParticipationPlayers(rows);
  return participation || null;
}

export async function createMatchParticipationData({
  id,
  leagueId,
  matchId,
  teamId,
  captainPlayerId,
  submittedByUserId = "",
  players = [],
  source = "delegate_portal",
  metadata = {},
  allowCorrection = false,
  correctedByUserId = "",
  correctionReason = ""
}) {
  const now = new Date().toISOString();
  const safePlayers = (Array.isArray(players) ? players : [])
    .map((player) => ({
      playerId: String(player.playerId || player.id || "").trim(),
      playerNameSnapshot: String(player.playerNameSnapshot || player.name || "").trim(),
      playerNumberSnapshot: String(player.playerNumberSnapshot ?? player.number ?? "").trim(),
      playerPhotoSnapshot: sanitizeImageUrl(player.playerPhotoSnapshot || player.photoUrl || "")
    }))
    .filter((player) => player.playerId && player.playerNameSnapshot);
  const nextId = id || `match-participation-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
  const metadataJson = JSON.stringify(metadata || {});

  if (isPostgres()) {
    const client = await postgresPool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(`
        SELECT *
        FROM match_participations
        WHERE match_id = $1 AND team_id = $2 AND active = true
        ORDER BY version DESC
        LIMIT 1
        FOR UPDATE
      `, [matchId, teamId]);
      const existing = existingResult.rows[0] || null;
      if (existing && !allowCorrection) {
        await client.query("ROLLBACK");
        const [current] = await attachParticipationPlayers([existing]);
        return { participation: current, duplicate: true };
      }
      const version = existing ? Number(existing.version || 1) + 1 : 1;
      if (existing) {
        await client.query(`
          UPDATE match_participations
          SET active = false,
              status = 'superseded',
              corrected_by_user_id = $1,
              corrected_at = $2,
              correction_reason = $3,
              updated_at = $2
          WHERE id = $4
        `, [correctedByUserId || submittedByUserId || null, now, correctionReason || "", existing.id]);
      }
      await client.query(`
        INSERT INTO match_participations (
          id, league_id, match_id, team_id, status, captain_player_id,
          submitted_by_user_id, submitted_at, locked_at, corrected_by_user_id,
          corrected_at, correction_reason, source, metadata_json, active, version,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'submitted', $5, $6, $7, $7, $8, $9, $10, $11, $12::jsonb, true, $13, $7, $7)
      `, [
        nextId,
        leagueId,
        matchId,
        teamId,
        captainPlayerId || null,
        submittedByUserId || null,
        now,
        correctedByUserId || null,
        allowCorrection ? now : null,
        correctionReason || "",
        source,
        metadataJson,
        version
      ]);
      for (const player of safePlayers) {
        await client.query(`
          INSERT INTO match_participation_players (
            id, match_participation_id, player_id, player_name_snapshot,
            player_number_snapshot, player_photo_snapshot, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (match_participation_id, player_id) DO NOTHING
        `, [
          `match-participation-player-${crypto.randomUUID()}`,
          nextId,
          player.playerId,
          player.playerNameSnapshot,
          player.playerNumberSnapshot,
          player.playerPhotoSnapshot,
          now
        ]);
      }
      await client.query("COMMIT");
      return { participation: await getActiveMatchParticipationData(matchId, teamId), duplicate: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const transaction = db.transaction(() => {
    const existing = db.prepare(`
      SELECT *
      FROM match_participations
      WHERE match_id = ? AND team_id = ? AND active = 1
      ORDER BY version DESC
      LIMIT 1
    `).get(matchId, teamId);
    if (existing && !allowCorrection) return { existing, duplicate: true };
    const version = existing ? Number(existing.version || 1) + 1 : 1;
    if (existing) {
      db.prepare(`
        UPDATE match_participations
        SET active = 0,
            status = 'superseded',
            corrected_by_user_id = ?,
            corrected_at = ?,
            correction_reason = ?,
            updated_at = ?
        WHERE id = ?
      `).run(correctedByUserId || submittedByUserId || null, now, correctionReason || "", now, existing.id);
    }
    db.prepare(`
      INSERT INTO match_participations (
        id, league_id, match_id, team_id, status, captain_player_id,
        submitted_by_user_id, submitted_at, locked_at, corrected_by_user_id,
        corrected_at, correction_reason, source, metadata_json, active, version,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      nextId,
      leagueId,
      matchId,
      teamId,
      captainPlayerId || null,
      submittedByUserId || null,
      now,
      now,
      correctedByUserId || null,
      allowCorrection ? now : null,
      correctionReason || "",
      source,
      metadataJson,
      version,
      now,
      now
    );
    const insertPlayer = db.prepare(`
      INSERT OR IGNORE INTO match_participation_players (
        id, match_participation_id, player_id, player_name_snapshot,
        player_number_snapshot, player_photo_snapshot, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const player of safePlayers) {
      insertPlayer.run(
        `match-participation-player-${crypto.randomUUID()}`,
        nextId,
        player.playerId,
        player.playerNameSnapshot,
        player.playerNumberSnapshot,
        player.playerPhotoSnapshot,
        now
      );
    }
    return { duplicate: false };
  });
  const result = transaction();
  if (result.duplicate) {
    const [current] = await attachParticipationPlayers([result.existing]);
    return { participation: current, duplicate: true };
  }
  return { participation: await getActiveMatchParticipationData(matchId, teamId), duplicate: false };
}

export async function upsertMatchTeamPinData({ id, leagueId, matchId, teamId, rosterId = "", pinHash, pinSalt = "", generatedByUserId = "" }) {
  const now = new Date().toISOString();
  if (!pinHash) throw new Error("PIN hash requerido");

  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO match_team_pins (
        id, league_id, match_id, team_id, roster_id, pin_hash, pin_salt, status,
        attempts, generated_by_user_id, generated_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 0, $8, $9, $9, $9)
      ON CONFLICT (match_id, team_id) DO UPDATE SET
        roster_id = EXCLUDED.roster_id,
        pin_hash = EXCLUDED.pin_hash,
        pin_salt = EXCLUDED.pin_salt,
        status = 'active',
        attempts = 0,
        locked_until = NULL,
        generated_by_user_id = EXCLUDED.generated_by_user_id,
        generated_at = EXCLUDED.generated_at,
        revealed_by_user_id = NULL,
        revealed_at = NULL,
        invalidated_at = NULL,
        used_at = NULL,
        signed_at = NULL,
        updated_at = EXCLUDED.updated_at
    `, [id, leagueId, matchId, teamId, rosterId || null, pinHash, pinSalt || null, generatedByUserId || null, now]);
    return;
  }

  db.prepare(`
    INSERT INTO match_team_pins (
      id, league_id, match_id, team_id, roster_id, pin_hash, pin_salt, status,
      attempts, generated_by_user_id, generated_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?, ?)
    ON CONFLICT(match_id, team_id) DO UPDATE SET
      roster_id = excluded.roster_id,
      pin_hash = excluded.pin_hash,
      pin_salt = excluded.pin_salt,
      status = 'active',
      attempts = 0,
      locked_until = NULL,
      generated_by_user_id = excluded.generated_by_user_id,
      generated_at = excluded.generated_at,
      revealed_by_user_id = NULL,
      revealed_at = NULL,
      invalidated_at = NULL,
      used_at = NULL,
      signed_at = NULL,
      updated_at = excluded.updated_at
  `).run(id, leagueId, matchId, teamId, rosterId || null, pinHash, pinSalt || null, generatedByUserId || null, now, now, now);
}

export async function getMatchTeamPinData(matchId, teamId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT *
      FROM match_team_pins
      WHERE match_id = $1 AND team_id = $2
      LIMIT 1
    `, [matchId, teamId]);
    return normalizeMatchTeamPinRow(rows[0]);
  }

  return normalizeMatchTeamPinRow(db.prepare(`
    SELECT *
    FROM match_team_pins
    WHERE match_id = ? AND team_id = ?
    LIMIT 1
  `).get(matchId, teamId));
}

export async function updateMatchRosterPinData({ matchId, teamId, captainPin }) {
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE match_rosters
      SET captain_pin = $1, updated_at = $2, version = version + 1
      WHERE match_id = $3 AND team_id = $4
    `, [captainPin || "", now, matchId, teamId]);
    return;
  }

  db.prepare(`
    UPDATE match_rosters
    SET captain_pin = ?, updated_at = ?, version = version + 1
    WHERE match_id = ? AND team_id = ?
  `).run(captainPin || "", now, matchId, teamId);
}

export async function markMatchTeamPinRevealedData({ matchId, teamId, revealedByUserId }) {
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE match_team_pins
      SET revealed_by_user_id = $1, revealed_at = $2, updated_at = $2
      WHERE match_id = $3 AND team_id = $4
    `, [revealedByUserId || null, now, matchId, teamId]);
    return;
  }

  db.prepare(`
    UPDATE match_team_pins
    SET revealed_by_user_id = ?, revealed_at = ?, updated_at = ?
    WHERE match_id = ? AND team_id = ?
  `).run(revealedByUserId || null, now, now, matchId, teamId);
}

export async function listMatchSessionsForRefereeData(refereeUserId) {
  if (!refereeUserId) return [];
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT *
      FROM match_sessions
      WHERE referee_user_id = $1
      ORDER BY updated_at DESC
    `, [refereeUserId]);
    return rows.map(normalizeMatchSessionRow);
  }

  return db.prepare(`
    SELECT *
    FROM match_sessions
    WHERE referee_user_id = ?
    ORDER BY updated_at DESC
  `).all(refereeUserId).map(normalizeMatchSessionRow);
}

export async function listMatchSessionsForLeagueData(leagueId) {
  if (!leagueId) return [];
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT *
      FROM match_sessions
      WHERE league_id = $1
      ORDER BY updated_at DESC
    `, [leagueId]);
    return rows.map(normalizeMatchSessionRow);
  }

  return db.prepare(`
    SELECT *
    FROM match_sessions
    WHERE league_id = ?
    ORDER BY updated_at DESC
  `).all(leagueId).map(normalizeMatchSessionRow);
}

export async function listMatchSessionsForMatchData(matchId) {
  if (!matchId) return [];
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT *
      FROM match_sessions
      WHERE match_id = $1
      ORDER BY updated_at DESC
    `, [matchId]);
    return rows.map(normalizeMatchSessionRow);
  }

  return db.prepare(`
    SELECT *
    FROM match_sessions
    WHERE match_id = ?
    ORDER BY updated_at DESC
  `).all(matchId).map(normalizeMatchSessionRow);
}

export async function getMatchSessionData(sessionId) {
  if (!sessionId) return null;
  if (isPostgres()) {
    const rows = await pgQuery("SELECT * FROM match_sessions WHERE id = $1", [sessionId]);
    return normalizeMatchSessionRow(rows[0]);
  }
  return normalizeMatchSessionRow(db.prepare("SELECT * FROM match_sessions WHERE id = ?").get(sessionId));
}

export async function getMatchSessionOperationData(operationId) {
  if (!operationId) return null;
  if (isPostgres()) {
    const rows = await pgQuery("SELECT * FROM match_session_operations WHERE operation_id = $1", [operationId]);
    return normalizeMatchSessionOperationRow(rows[0]);
  }
  return normalizeMatchSessionOperationRow(db.prepare("SELECT * FROM match_session_operations WHERE operation_id = ?").get(operationId));
}

export async function createMatchSessionOperationData({
  operationId,
  leagueId,
  matchId,
  sessionId = "",
  refereeUserId = "",
  operationType,
  payload = {},
  status = "synced"
}) {
  if (!operationId) return { operation: null, duplicate: false };
  const existing = await getMatchSessionOperationData(operationId);
  if (existing) return { operation: existing, duplicate: true };

  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(payload || {});
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO match_session_operations (
        operation_id, league_id, match_id, session_id, referee_user_id, operation_type,
        status, payload_json, created_at, synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
      ON CONFLICT (operation_id) DO NOTHING
    `, [operationId, leagueId, matchId, sessionId || null, refereeUserId || null, operationType, status, payloadJson, now]);
    const operation = await getMatchSessionOperationData(operationId);
    return { operation, duplicate: operation?.createdAt !== now };
  }

  db.prepare(`
    INSERT OR IGNORE INTO match_session_operations (
      operation_id, league_id, match_id, session_id, referee_user_id, operation_type,
      status, payload_json, created_at, synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(operationId, leagueId, matchId, sessionId || null, refereeUserId || null, operationType, status, payloadJson, now, now);
  const operation = await getMatchSessionOperationData(operationId);
  return { operation, duplicate: operation?.createdAt !== now };
}

export async function upsertMatchSessionData({
  id,
  leagueId,
  matchId,
  refereeUserId,
  captureMode = "live",
  status = "draft",
  period = "",
  clockState = {},
  metadata = {},
  suspensionReason = ""
}) {
  const now = new Date().toISOString();
  const clockPayload = JSON.stringify(clockState || {});
  const metadataPayload = JSON.stringify(metadata || {});
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO match_sessions (
        id, league_id, match_id, referee_user_id, capture_mode, status, period,
        started_at, paused_at, saved_at, resumed_at, finished_at, suspended_at,
        suspension_reason, clock_state_json, metadata_json, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        CASE WHEN $6 = 'in_progress' THEN $8::timestamptz ELSE NULL END,
        CASE WHEN $6 = 'paused' THEN $8::timestamptz ELSE NULL END,
        CASE WHEN $6 = 'temporarily_saved' THEN $8::timestamptz ELSE NULL END,
        CASE WHEN $6 = 'in_progress' THEN $8::timestamptz ELSE NULL END,
        CASE WHEN $6 = 'match_finished' THEN $8::timestamptz ELSE NULL END,
        CASE WHEN $6 LIKE 'suspended%' THEN $8::timestamptz ELSE NULL END,
        $9, $10::jsonb, $11::jsonb, $8, $8
      )
      ON CONFLICT (id) DO UPDATE SET
        capture_mode = EXCLUDED.capture_mode,
        status = EXCLUDED.status,
        period = EXCLUDED.period,
        paused_at = CASE WHEN EXCLUDED.status = 'paused' THEN EXCLUDED.updated_at ELSE match_sessions.paused_at END,
        saved_at = CASE WHEN EXCLUDED.status = 'temporarily_saved' THEN EXCLUDED.updated_at ELSE match_sessions.saved_at END,
        resumed_at = CASE WHEN EXCLUDED.status = 'in_progress' THEN EXCLUDED.updated_at ELSE match_sessions.resumed_at END,
        finished_at = CASE WHEN EXCLUDED.status = 'match_finished' THEN EXCLUDED.updated_at ELSE match_sessions.finished_at END,
        suspended_at = CASE WHEN EXCLUDED.status LIKE 'suspended%' THEN EXCLUDED.updated_at ELSE match_sessions.suspended_at END,
        suspension_reason = EXCLUDED.suspension_reason,
        clock_state_json = EXCLUDED.clock_state_json,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = EXCLUDED.updated_at
    `, [id, leagueId, matchId, refereeUserId || null, captureMode, status, period || "", now, suspensionReason || "", clockPayload, metadataPayload]);
    return getMatchSessionData(id);
  }

  db.prepare(`
    INSERT INTO match_sessions (
      id, league_id, match_id, referee_user_id, capture_mode, status, period,
      started_at, paused_at, saved_at, resumed_at, finished_at, suspended_at,
      suspension_reason, clock_state_json, metadata_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      capture_mode = excluded.capture_mode,
      status = excluded.status,
      period = excluded.period,
      paused_at = CASE WHEN excluded.status = 'paused' THEN excluded.updated_at ELSE match_sessions.paused_at END,
      saved_at = CASE WHEN excluded.status = 'temporarily_saved' THEN excluded.updated_at ELSE match_sessions.saved_at END,
      resumed_at = CASE WHEN excluded.status = 'in_progress' THEN excluded.updated_at ELSE match_sessions.resumed_at END,
      finished_at = CASE WHEN excluded.status = 'match_finished' THEN excluded.updated_at ELSE match_sessions.finished_at END,
      suspended_at = CASE WHEN excluded.status LIKE 'suspended%' THEN excluded.updated_at ELSE match_sessions.suspended_at END,
      suspension_reason = excluded.suspension_reason,
      clock_state_json = excluded.clock_state_json,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    leagueId,
    matchId,
    refereeUserId || null,
    captureMode,
    status,
    period || "",
    status === "in_progress" ? now : null,
    status === "paused" ? now : null,
    status === "temporarily_saved" ? now : null,
    status === "in_progress" ? now : null,
    status === "match_finished" ? now : null,
    status?.startsWith("suspended") ? now : null,
    suspensionReason || "",
    clockPayload,
    metadataPayload,
    now,
    now
  );
  return getMatchSessionData(id);
}

export async function updateMatchWorkflowData({ matchId, workflowStatus, captureMode = "", currentReportId = "", finalizedAt = "", publishedAt = "" }) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE matches
      SET workflow_status = COALESCE(NULLIF($1, ''), workflow_status),
          capture_mode = COALESCE(NULLIF($2, ''), capture_mode),
          current_report_id = COALESCE(NULLIF($3, ''), current_report_id),
          finalized_at = COALESCE($4::timestamptz, finalized_at),
          published_at = COALESCE($5::timestamptz, published_at)
      WHERE id = $6
    `, [workflowStatus || "", captureMode || "", currentReportId || "", finalizedAt || null, publishedAt || null, matchId]);
    return;
  }

  db.prepare(`
    UPDATE matches
    SET workflow_status = COALESCE(NULLIF(?, ''), workflow_status),
        capture_mode = COALESCE(NULLIF(?, ''), capture_mode),
        current_report_id = COALESCE(NULLIF(?, ''), current_report_id),
        finalized_at = COALESCE(NULLIF(?, ''), finalized_at),
        published_at = COALESCE(NULLIF(?, ''), published_at)
    WHERE id = ?
  `).run(workflowStatus || "", captureMode || "", currentReportId || "", finalizedAt || "", publishedAt || "", matchId);
}

export async function createMatchReportData({ id, leagueId, matchId, sessionId = "", generatedByUserId = "", captureMode = "live", status = "draft", payload = {}, homeGoals = null, awayGoals = null }) {
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(payload || {});
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO match_reports (
        id, league_id, match_id, session_id, generated_by_user_id, capture_mode, status,
        version, payload_json, home_goals, away_goals, generated_at, finalized_at, published_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8::jsonb, $9, $10, $11, NULL, NULL, $11, $11)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        payload_json = EXCLUDED.payload_json,
        home_goals = EXCLUDED.home_goals,
        away_goals = EXCLUDED.away_goals,
        generated_at = EXCLUDED.generated_at,
        updated_at = EXCLUDED.updated_at,
        version = match_reports.version + 1
    `, [id, leagueId, matchId, sessionId || null, generatedByUserId || null, captureMode, status, payloadJson, homeGoals, awayGoals, now]);
    const rows = await pgQuery("SELECT * FROM match_reports WHERE id = $1", [id]);
    return normalizeMatchReportRow(rows[0]);
  }

  db.prepare(`
    INSERT INTO match_reports (
      id, league_id, match_id, session_id, generated_by_user_id, capture_mode, status,
      version, payload_json, home_goals, away_goals, generated_at, finalized_at, published_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      payload_json = excluded.payload_json,
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      generated_at = excluded.generated_at,
      updated_at = excluded.updated_at,
      version = match_reports.version + 1
  `).run(id, leagueId, matchId, sessionId || null, generatedByUserId || null, captureMode, status, payloadJson, homeGoals, awayGoals, now, now, now);
  return normalizeMatchReportRow(db.prepare("SELECT * FROM match_reports WHERE id = ?").get(id));
}

export async function getLatestMatchReportForMatchData(matchId) {
  if (!matchId) return null;
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT *
      FROM match_reports
      WHERE match_id = $1
      ORDER BY generated_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    `, [matchId]);
    return normalizeMatchReportRow(rows[0]);
  }

  return normalizeMatchReportRow(db.prepare(`
    SELECT *
    FROM match_reports
    WHERE match_id = ?
    ORDER BY COALESCE(generated_at, updated_at) DESC, updated_at DESC
    LIMIT 1
  `).get(matchId));
}

export async function updateMatchReportPayloadData({ reportId, payload = {}, homeGoals = null, awayGoals = null }) {
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(payload || {});
  if (isPostgres()) {
    await pgQuery(`
      UPDATE match_reports
      SET payload_json = $1::jsonb,
          home_goals = COALESCE($2, home_goals),
          away_goals = COALESCE($3, away_goals),
          updated_at = $4,
          version = version + 1
      WHERE id = $5
    `, [payloadJson, homeGoals, awayGoals, now, reportId]);
    const rows = await pgQuery("SELECT * FROM match_reports WHERE id = $1", [reportId]);
    return normalizeMatchReportRow(rows[0]);
  }

  db.prepare(`
    UPDATE match_reports
    SET payload_json = ?,
        home_goals = COALESCE(?, home_goals),
        away_goals = COALESCE(?, away_goals),
        updated_at = ?,
        version = version + 1
    WHERE id = ?
  `).run(payloadJson, homeGoals, awayGoals, now, reportId);
  return normalizeMatchReportRow(db.prepare("SELECT * FROM match_reports WHERE id = ?").get(reportId));
}

export async function listMatchReportSignaturesData(reportId) {
  if (!reportId) return [];
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT *
      FROM match_report_signatures
      WHERE report_id = $1
      ORDER BY signed_at ASC
    `, [reportId]);
    return rows.map(normalizeMatchReportSignatureRow);
  }

  return db.prepare(`
    SELECT *
    FROM match_report_signatures
    WHERE report_id = ?
    ORDER BY signed_at ASC
  `).all(reportId).map(normalizeMatchReportSignatureRow);
}

export async function createMatchReportSignatureData({
  id,
  reportId,
  leagueId,
  matchId,
  teamId,
  captainPlayerId = "",
  signedByUserId = "",
  method = "pin",
  ipAddress = "",
  userAgent = "",
  actVersion = null,
  actHash = "",
  actSnapshot = {},
  metadata = {}
}) {
  const now = new Date().toISOString();
  const metadataPayload = JSON.stringify(metadata || {});
  const actSnapshotPayload = JSON.stringify(actSnapshot || {});
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO match_report_signatures (
        id, report_id, league_id, match_id, team_id, captain_player_id,
        signed_by_user_id, method, status, signed_at, act_version, act_hash,
        act_snapshot_json, invalidated_at, ip_address, user_agent, metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'signed', $9, $10, $11, $12::jsonb, NULL, $13, $14, $15::jsonb)
      ON CONFLICT (report_id, team_id) DO UPDATE SET
        captain_player_id = EXCLUDED.captain_player_id,
        signed_by_user_id = EXCLUDED.signed_by_user_id,
        method = EXCLUDED.method,
        status = 'signed',
        signed_at = EXCLUDED.signed_at,
        act_version = EXCLUDED.act_version,
        act_hash = EXCLUDED.act_hash,
        act_snapshot_json = EXCLUDED.act_snapshot_json,
        invalidated_at = NULL,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        metadata_json = EXCLUDED.metadata_json
    `, [id, reportId, leagueId, matchId, teamId, captainPlayerId || null, signedByUserId || null, method, now, actVersion, actHash || "", actSnapshotPayload, ipAddress || "", userAgent || "", metadataPayload]);
    return listMatchReportSignaturesData(reportId);
  }

  db.prepare(`
    INSERT INTO match_report_signatures (
      id, report_id, league_id, match_id, team_id, captain_player_id,
      signed_by_user_id, method, status, signed_at, act_version, act_hash,
      act_snapshot_json, invalidated_at, ip_address, user_agent, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'signed', ?, ?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(report_id, team_id) DO UPDATE SET
      captain_player_id = excluded.captain_player_id,
      signed_by_user_id = excluded.signed_by_user_id,
      method = excluded.method,
      status = 'signed',
      signed_at = excluded.signed_at,
      act_version = excluded.act_version,
      act_hash = excluded.act_hash,
      act_snapshot_json = excluded.act_snapshot_json,
      invalidated_at = NULL,
      ip_address = excluded.ip_address,
      user_agent = excluded.user_agent,
      metadata_json = excluded.metadata_json
  `).run(id, reportId, leagueId, matchId, teamId, captainPlayerId || null, signedByUserId || null, method, now, actVersion, actHash || "", actSnapshotPayload, ipAddress || "", userAgent || "", metadataPayload);
  return listMatchReportSignaturesData(reportId);
}

export async function invalidateMatchReportSignaturesData({ reportId, reason = "" }) {
  if (!reportId) return [];
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE match_report_signatures
      SET status = 'invalidated',
          invalidated_at = $1,
          metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $2::jsonb
      WHERE report_id = $3 AND status = 'signed'
    `, [now, JSON.stringify({ invalidationReason: reason || "acta_updated" }), reportId]);
    return listMatchReportSignaturesData(reportId);
  }

  const signatures = await listMatchReportSignaturesData(reportId);
  const update = db.prepare(`
    UPDATE match_report_signatures
    SET status = 'invalidated',
        invalidated_at = ?,
        metadata_json = ?
    WHERE id = ?
  `);
  for (const signature of signatures.filter((item) => item.status === "signed")) {
    update.run(now, JSON.stringify({ ...(signature.metadata || {}), invalidationReason: reason || "acta_updated" }), signature.id);
  }
  return listMatchReportSignaturesData(reportId);
}

export async function updateMatchReportStatusData({ reportId, status, finalizedAt = "", publishedAt = "" }) {
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE match_reports
      SET status = $1,
          finalized_at = COALESCE($2::timestamptz, finalized_at),
          published_at = COALESCE($3::timestamptz, published_at),
          updated_at = $4
      WHERE id = $5
    `, [status, finalizedAt || null, publishedAt || null, now, reportId]);
    const rows = await pgQuery("SELECT * FROM match_reports WHERE id = $1", [reportId]);
    return normalizeMatchReportRow(rows[0]);
  }

  db.prepare(`
    UPDATE match_reports
    SET status = ?,
        finalized_at = COALESCE(NULLIF(?, ''), finalized_at),
        published_at = COALESCE(NULLIF(?, ''), published_at),
        updated_at = ?
    WHERE id = ?
  `).run(status, finalizedAt || "", publishedAt || "", now, reportId);
  return normalizeMatchReportRow(db.prepare("SELECT * FROM match_reports WHERE id = ?").get(reportId));
}

export async function markMatchTeamPinSignedData({ matchId, teamId }) {
  const now = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE match_team_pins
      SET used_at = $1, signed_at = $1, updated_at = $1
      WHERE match_id = $2 AND team_id = $3
    `, [now, matchId, teamId]);
    return;
  }

  db.prepare(`
    UPDATE match_team_pins
    SET used_at = ?, signed_at = ?, updated_at = ?
    WHERE match_id = ? AND team_id = ?
  `).run(now, now, now, matchId, teamId);
}

export async function listMatchReportsData({ leagueId = "", status = "" } = {}) {
  const statuses = String(status || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (isPostgres()) {
    const conditions = [];
    const values = [];
    if (leagueId) {
      values.push(leagueId);
      conditions.push(`league_id = $${values.length}`);
    }
    if (statuses.length) {
      values.push(statuses);
      conditions.push(`status = ANY($${values.length}::text[])`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await pgQuery(`
      SELECT *
      FROM match_reports
      ${where}
      ORDER BY generated_at DESC NULLS LAST, updated_at DESC
    `, values);
    return rows.map(normalizeMatchReportRow);
  }

  const conditions = [];
  const values = [];
  if (leagueId) {
    conditions.push("league_id = ?");
    values.push(leagueId);
  }
  if (statuses.length) {
    conditions.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    values.push(...statuses);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`
    SELECT *
    FROM match_reports
    ${where}
    ORDER BY COALESCE(generated_at, updated_at) DESC, updated_at DESC
  `).all(...values).map(normalizeMatchReportRow);
}

export async function getMatchReportData(reportId) {
  if (isPostgres()) {
    const rows = await pgQuery("SELECT * FROM match_reports WHERE id = $1", [reportId]);
    return rows[0] ? normalizeMatchReportRow(rows[0]) : null;
  }
  const row = db.prepare("SELECT * FROM match_reports WHERE id = ?").get(reportId);
  return row ? normalizeMatchReportRow(row) : null;
}

export async function publishOfficialMatchFromReportData({ leagueId, match, reportId, publishedAt = new Date().toISOString() }) {
  if (!match?.id) throw new Error("Partido requerido para publicar acta.");
  const events = Array.isArray(match.events) ? match.events : [];

  if (isPostgres()) {
    await pgQuery("DELETE FROM match_events WHERE match_id = $1", [match.id]);
    await pgQuery(`
      UPDATE matches
      SET status = $1,
          workflow_status = 'published',
          current_report_id = $2,
          published_at = $3,
          finalized_at = COALESCE(finalized_at, $3),
          home_goals = $4,
          away_goals = $5,
          observations = $6,
          resolution_type = $7,
          resolution_note = $8,
          extra_time_home_goals = $9,
          extra_time_away_goals = $10,
          penalty_home_goals = $11,
          penalty_away_goals = $12,
          capture_mode = $13
      WHERE id = $14 AND league_id = $15
    `, [
      match.status || "finished",
      reportId || null,
      publishedAt,
      match.homeGoals,
      match.awayGoals,
      match.observations || "",
      match.resolutionType || "normal",
      match.resolutionNote || null,
      match.extraTimeHomeGoals ?? null,
      match.extraTimeAwayGoals ?? null,
      match.penaltyHomeGoals ?? null,
      match.penaltyAwayGoals ?? null,
      match.captureMode || "admin",
      match.id,
      leagueId
    ]);
    for (const event of events) {
      const eventMetadata = {
        ...(event.metadata && typeof event.metadata === "object" ? event.metadata : {}),
        ...(event.cardDetail ? { cardDetail: event.cardDetail } : {}),
        ...(event.countsForAccumulation !== undefined ? { countsForAccumulation: event.countsForAccumulation } : {}),
        ...(event.excludedFromAccumulation !== undefined ? { excludedFromAccumulation: event.excludedFromAccumulation } : {}),
        ...(Array.isArray(event.sourceYellowCardMinutes) ? { sourceYellowCardMinutes: event.sourceYellowCardMinutes } : {})
      };
      await pgQuery(`
        INSERT INTO match_events (
          match_id, type, player_id, team_id, subtype, period, minute, minute_label,
          suspension_matches, suspension_indefinite, disciplinary_pending, reason,
          metadata_json, is_official, sync_status, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, 'synced', 1)
      `, [
        match.id,
        event.type,
        event.playerId || null,
        event.teamId || null,
        event.subtype || event.cardDetail || "",
        event.period || "",
        event.minute === "" || event.minute === undefined ? null : event.minute,
        event.minuteLabel || "",
        event.suspensionMatches ?? null,
        toBoolean(event.suspensionIndefinite),
        toBoolean(event.disciplinaryPending),
        event.reason || "",
        JSON.stringify(eventMetadata)
      ]);
    }
    if (reportId) {
      await pgQuery(`
        UPDATE match_reports
        SET status = 'published',
            finalized_at = COALESCE(finalized_at, $1),
            published_at = $1,
            updated_at = $1
        WHERE id = $2
      `, [publishedAt, reportId]);
    }
    return;
  }

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM match_events WHERE match_id = ?").run(match.id);
    db.prepare(`
      UPDATE matches
      SET status = ?,
          workflow_status = 'published',
          current_report_id = ?,
          published_at = ?,
          finalized_at = COALESCE(finalized_at, ?),
          home_goals = ?,
          away_goals = ?,
          observations = ?,
          resolution_type = ?,
          resolution_note = ?,
          extra_time_home_goals = ?,
          extra_time_away_goals = ?,
          penalty_home_goals = ?,
          penalty_away_goals = ?,
          capture_mode = ?
      WHERE id = ? AND league_id = ?
    `).run(
      match.status || "finished",
      reportId || "",
      publishedAt,
      publishedAt,
      match.homeGoals,
      match.awayGoals,
      match.observations || "",
      match.resolutionType || "normal",
      match.resolutionNote || null,
      match.extraTimeHomeGoals ?? null,
      match.extraTimeAwayGoals ?? null,
      match.penaltyHomeGoals ?? null,
      match.penaltyAwayGoals ?? null,
      match.captureMode || "admin",
      match.id,
      leagueId
    );
    for (const event of events) {
      const eventMetadata = {
        ...(event.metadata && typeof event.metadata === "object" ? event.metadata : {}),
        ...(event.cardDetail ? { cardDetail: event.cardDetail } : {}),
        ...(event.countsForAccumulation !== undefined ? { countsForAccumulation: event.countsForAccumulation } : {}),
        ...(event.excludedFromAccumulation !== undefined ? { excludedFromAccumulation: event.excludedFromAccumulation } : {}),
        ...(Array.isArray(event.sourceYellowCardMinutes) ? { sourceYellowCardMinutes: event.sourceYellowCardMinutes } : {})
      };
      db.prepare(`
        INSERT INTO match_events (
          match_id, type, player_id, team_id, subtype, period, minute, minute_label,
          suspension_matches, suspension_indefinite, disciplinary_pending, reason,
          metadata_json, is_official, sync_status, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'synced', 1)
      `).run(
        match.id,
        event.type,
        event.playerId || null,
        event.teamId || null,
        event.subtype || event.cardDetail || "",
        event.period || "",
        event.minute === "" || event.minute === undefined ? null : event.minute,
        event.minuteLabel || "",
        event.suspensionMatches ?? null,
        event.suspensionIndefinite ? 1 : 0,
        event.disciplinaryPending ? 1 : 0,
        event.reason || "",
        JSON.stringify(eventMetadata)
      );
    }
    if (reportId) {
      db.prepare(`
        UPDATE match_reports
        SET status = 'published',
            finalized_at = COALESCE(finalized_at, ?),
            published_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(publishedAt, publishedAt, publishedAt, reportId);
    }
  });
  transaction();
}

export async function createTeamPortalPlayerData({ id, leagueId, competitionId, teamId, name, number, position, photoUrl, photoAuthorized }) {
  const values = [
    id,
    leagueId,
    competitionId || null,
    teamId,
    upperText(name),
    Number(number || 0),
    upperText(position || "Jugador"),
    sanitizeImageUrl(photoUrl),
    photoAuthorized ? 1 : 0
  ];

  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO players (id, league_id, competition_id, team_id, name, number, position, photo_url, photo_authorized, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
    `, [values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], Boolean(values[8])]);
  } else {
    db.prepare(`
      INSERT INTO players (id, league_id, competition_id, team_id, name, number, position, photo_url, photo_authorized, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(...values);
  }
  return listTeamPortalPlayersData(teamId);
}

export async function updateTeamPortalPlayerData(playerId, { teamId, name, number, position, photoUrl, photoAuthorized }) {
  const values = [
    upperText(name),
    Number(number || 0),
    upperText(position || "Jugador"),
    sanitizeImageUrl(photoUrl),
    photoAuthorized ? 1 : 0,
    playerId,
    teamId
  ];

  if (isPostgres()) {
    await pgQuery(`
      UPDATE players
      SET name = $1, number = $2, position = $3, photo_url = $4, photo_authorized = $5
      WHERE id = $6 AND team_id = $7
    `, [values[0], values[1], values[2], values[3], Boolean(values[4]), values[5], values[6]]);
  } else {
    db.prepare(`
      UPDATE players
      SET name = ?, number = ?, position = ?, photo_url = ?, photo_authorized = ?
      WHERE id = ? AND team_id = ?
    `).run(...values);
  }
  return listTeamPortalPlayersData(teamId);
}

export async function updateTeamPortalPlayerNumberData(playerId, { teamId, number }) {
  const normalizedNumber = Number(number || 0);
  if (isPostgres()) {
    await pgQuery(`
      UPDATE players
      SET number = $1
      WHERE id = $2 AND team_id = $3
    `, [normalizedNumber, playerId, teamId]);
  } else {
    db.prepare(`
      UPDATE players
      SET number = ?
      WHERE id = ? AND team_id = ?
    `).run(normalizedNumber, playerId, teamId);
  }
  return listTeamPortalPlayersData(teamId);
}

export async function updateTeamLogoData({ teamId, leagueId, logoUrl }) {
  if (isPostgres()) {
    await pgQuery("UPDATE teams SET logo_url = $1 WHERE id = $2 AND league_id = $3", [sanitizeImageUrl(logoUrl), teamId, leagueId]);
    return;
  }
  db.prepare("UPDATE teams SET logo_url = ? WHERE id = ? AND league_id = ?").run(sanitizeImageUrl(logoUrl), teamId, leagueId);
}

function normalizeActivationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    assignmentId: row.assignment_id ?? row.assignmentId,
    tokenHash: row.token_hash ?? row.tokenHash,
    expiresAt: normalizeDateTime(row.expires_at ?? row.expiresAt),
    usedAt: normalizeDateTime(row.used_at ?? row.usedAt),
    revokedAt: normalizeDateTime(row.revoked_at ?? row.revokedAt),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    userName: row.user_name ?? row.userName,
    userEmail: row.user_email ?? row.userEmail,
    userPhone: row.user_phone ?? row.userPhone,
    userStatus: row.user_status ?? row.userStatus,
    leagueId: row.league_id ?? row.leagueId,
    leagueName: row.league_name ?? row.leagueName,
    teamId: row.team_id ?? row.teamId,
    teamName: row.team_name ?? row.teamName,
    assignmentStatus: row.assignment_status ?? row.assignmentStatus
  };
}

function normalizeRefereeActivationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    tokenHash: row.token_hash ?? row.tokenHash,
    expiresAt: normalizeDateTime(row.expires_at ?? row.expiresAt),
    usedAt: normalizeDateTime(row.used_at ?? row.usedAt),
    revokedAt: normalizeDateTime(row.revoked_at ?? row.revokedAt),
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    userName: row.user_name ?? row.userName,
    userEmail: row.user_email ?? row.userEmail,
    userPhone: row.user_phone ?? row.userPhone,
    userStatus: row.user_status ?? row.userStatus,
    municipality: row.municipality || ""
  };
}

export async function createTeamDelegateActivationData({ id, userId, assignmentId, tokenHash, expiresAt }) {
  const createdAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO team_delegate_activation_tokens (id, user_id, assignment_id, token_hash, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, userId, assignmentId, tokenHash, expiresAt, createdAt]);
  } else {
    db.prepare(`
      INSERT INTO team_delegate_activation_tokens (id, user_id, assignment_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, assignmentId, tokenHash, expiresAt, createdAt);
  }
  return getTeamDelegateActivationByHashData(tokenHash);
}

export async function revokeTeamDelegateActivationsData(userId) {
  const revokedAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE team_delegate_activation_tokens
      SET revoked_at = $1
      WHERE user_id = $2 AND used_at IS NULL AND revoked_at IS NULL
    `, [revokedAt, userId]);
    return;
  }
  db.prepare(`
    UPDATE team_delegate_activation_tokens
    SET revoked_at = ?
    WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL
  `).run(revokedAt, userId);
}

export async function getTeamDelegateActivationByHashData(tokenHash) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT tdat.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
        tua.league_id, tua.team_id, tua.status AS assignment_status,
        l.name AS league_name, tm.name AS team_name
      FROM team_delegate_activation_tokens tdat
      JOIN users u ON u.id = tdat.user_id
      JOIN team_user_assignments tua ON tua.id = tdat.assignment_id
      JOIN leagues l ON l.id = tua.league_id
      JOIN teams tm ON tm.id = tua.team_id
      WHERE tdat.token_hash = $1
    `, [tokenHash]);
    return normalizeActivationRow(rows[0]);
  }
  return normalizeActivationRow(db.prepare(`
    SELECT tdat.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
      tua.league_id, tua.team_id, tua.status AS assignment_status,
      l.name AS league_name, tm.name AS team_name
    FROM team_delegate_activation_tokens tdat
    JOIN users u ON u.id = tdat.user_id
    JOIN team_user_assignments tua ON tua.id = tdat.assignment_id
    JOIN leagues l ON l.id = tua.league_id
    JOIN teams tm ON tm.id = tua.team_id
    WHERE tdat.token_hash = ?
  `).get(tokenHash));
}

export async function markTeamDelegateActivationUsedData(tokenId) {
  const usedAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery("UPDATE team_delegate_activation_tokens SET used_at = $1 WHERE id = $2", [usedAt, tokenId]);
    return;
  }
  db.prepare("UPDATE team_delegate_activation_tokens SET used_at = ? WHERE id = ?").run(usedAt, tokenId);
}

export async function createRefereeActivationData({ id, userId, tokenHash, expiresAt }) {
  const createdAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO referee_activation_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, userId, tokenHash, expiresAt, createdAt]);
  } else {
    db.prepare(`
      INSERT INTO referee_activation_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, tokenHash, expiresAt, createdAt);
  }
  return getRefereeActivationByHashData(tokenHash);
}

export async function revokeRefereeActivationsData(userId) {
  const revokedAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery(`
      UPDATE referee_activation_tokens
      SET revoked_at = $1
      WHERE user_id = $2 AND used_at IS NULL AND revoked_at IS NULL
    `, [revokedAt, userId]);
    return;
  }
  db.prepare(`
    UPDATE referee_activation_tokens
    SET revoked_at = ?
    WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL
  `).run(revokedAt, userId);
}

export async function getRefereeActivationByHashData(tokenHash) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT rat.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
        rp.municipality
      FROM referee_activation_tokens rat
      JOIN users u ON u.id = rat.user_id
      JOIN referee_profiles rp ON rp.user_id = rat.user_id
      WHERE rat.token_hash = $1
    `, [tokenHash]);
    return normalizeRefereeActivationRow(rows[0]);
  }
  return normalizeRefereeActivationRow(db.prepare(`
    SELECT rat.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
      rp.municipality
    FROM referee_activation_tokens rat
    JOIN users u ON u.id = rat.user_id
    JOIN referee_profiles rp ON rp.user_id = rat.user_id
    WHERE rat.token_hash = ?
  `).get(tokenHash));
}

export async function markRefereeActivationUsedData(tokenId) {
  const usedAt = new Date().toISOString();
  if (isPostgres()) {
    await pgQuery("UPDATE referee_activation_tokens SET used_at = $1 WHERE id = $2", [usedAt, tokenId]);
    return;
  }
  db.prepare("UPDATE referee_activation_tokens SET used_at = ? WHERE id = ?").run(usedAt, tokenId);
}

export async function activateRefereeUserData({ userId, passwordHash }) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET password_hash = $1, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
      WHERE id = $2
    `, [passwordHash, userId]);
    await pgQuery("UPDATE user_accesses SET status = 'active', updated_at = $1 WHERE user_id = $2 AND role = 'referee' AND status = 'pending_activation'", [new Date().toISOString(), userId]);
    return getUserById(userId);
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
    WHERE id = ?
  `).run(passwordHash, userId);
  db.prepare("UPDATE user_accesses SET status = 'active', updated_at = ? WHERE user_id = ? AND role = 'referee' AND status = 'pending_activation'").run(new Date().toISOString(), userId);
  return getUserById(userId);
}

export async function activateAdminUserData({ userId, accessId = "", passwordHash }) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET password_hash = $1, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
      WHERE id = $2
    `, [passwordHash, userId]);
    if (accessId) {
      await pgQuery("UPDATE user_accesses SET status = 'active', updated_at = $1 WHERE id = $2 AND user_id = $3 AND status = 'pending_activation'", [new Date().toISOString(), accessId, userId]);
    } else {
      await pgQuery("UPDATE user_accesses SET status = 'active', updated_at = $1 WHERE user_id = $2 AND role IN ('super_admin', 'league_admin', 'admin_limited') AND status = 'pending_activation'", [new Date().toISOString(), userId]);
    }
    return getUserById(userId);
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
    WHERE id = ?
  `).run(passwordHash, userId);
  if (accessId) {
    db.prepare("UPDATE user_accesses SET status = 'active', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending_activation'").run(new Date().toISOString(), accessId, userId);
  } else {
    db.prepare("UPDATE user_accesses SET status = 'active', updated_at = ? WHERE user_id = ? AND role IN ('super_admin', 'league_admin', 'admin_limited') AND status = 'pending_activation'").run(new Date().toISOString(), userId);
  }
  return getUserById(userId);
}

export async function activateTeamDelegateUserData({ userId, assignmentId, passwordHash }) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET password_hash = $1, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
      WHERE id = $2
    `, [passwordHash, userId]);
    await pgQuery("UPDATE team_user_assignments SET status = 'active' WHERE id = $1", [assignmentId]);
    await pgQuery("UPDATE user_accesses SET status = 'active', updated_at = $1 WHERE user_id = $2 AND role = 'team_delegate' AND status = 'pending_activation'", [new Date().toISOString(), userId]);
    return getUserById(userId);
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
    WHERE id = ?
  `).run(passwordHash, userId);
  db.prepare("UPDATE team_user_assignments SET status = 'active' WHERE id = ?").run(assignmentId);
  db.prepare("UPDATE user_accesses SET status = 'active', updated_at = ? WHERE user_id = ? AND role = 'team_delegate' AND status = 'pending_activation'").run(new Date().toISOString(), userId);
  return getUserById(userId);
}

function normalizePlayerRow(row) {
  return {
    id: row.id,
    leagueId: row.league_id,
    competitionId: row.competition_id,
    teamId: row.team_id,
    name: row.name,
    number: row.number,
    position: row.position,
    photoUrl: row.photo_url || "",
    photoAuthorized: Boolean(row.photo_authorized),
    status: row.status || "active"
  };
}

export async function deleteUserData(userId) {
  if (isPostgres()) {
    await pgQuery("DELETE FROM users WHERE id = $1", [userId]);
    return;
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export async function disableUserData(userId) {
  if (isPostgres()) {
    await pgQuery("UPDATE users SET status = 'disabled' WHERE id = $1", [userId]);
    return getUserById(userId);
  }
  db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(userId);
  return getUserById(userId);
}

export async function countActiveSuperAdminsExcept(userId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE role = 'super_admin'
        AND status = 'active'
        AND id != $1
    `, [userId]);
    return rows[0]?.total || 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM users
    WHERE role = 'super_admin'
      AND status = 'active'
      AND id != ?
  `).get(userId).total;
}

export async function countLeagueAdmins(leagueId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE role = 'league_admin' AND league_id = $1
    `, [leagueId]);
    return rows[0]?.total || 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM users
    WHERE role = 'league_admin' AND league_id = ?
  `).get(leagueId).total;
}

export async function registerFailedLoginData(user, lockedUntil, failedCount) {
  if (!user) return;
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET failed_login_count = $1, locked_until = $2, last_failed_login_at = $3
      WHERE id = $4
    `, [failedCount, lockedUntil, new Date().toISOString(), user.id]);
    return;
  }
  db.prepare(`
    UPDATE users
    SET failed_login_count = ?, locked_until = ?, last_failed_login_at = ?
    WHERE id = ?
  `).run(failedCount, lockedUntil, new Date().toISOString(), user.id);
}

export async function clearLoginLockData(userId) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
      WHERE id = $1
    `, [userId]);
    return;
  }
  db.prepare(`
    UPDATE users
    SET failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
    WHERE id = ?
  `).run(userId);
}

export async function createPasswordResetData({ id, userId, codeHash, expiresAt }) {
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO password_reset_requests (id, user_id, code_hash, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, userId, codeHash, expiresAt, new Date().toISOString()]);
    return;
  }
  db.prepare(`
    INSERT INTO password_reset_requests (id, user_id, code_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, codeHash, expiresAt, new Date().toISOString());
}

export async function listActivePasswordResetRequests(userId) {
  if (isPostgres()) {
    return pgQuery(`
      SELECT *
      FROM password_reset_requests
      WHERE user_id = $1 AND used_at IS NULL AND expires_at > $2
      ORDER BY created_at DESC
      LIMIT 5
    `, [userId, new Date().toISOString()]);
  }
  return db.prepare(`
    SELECT * FROM password_reset_requests
    WHERE user_id = ? AND used_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(userId, new Date().toISOString());
}

export async function updatePasswordData(userId, passwordHash) {
  if (isPostgres()) {
    await pgQuery("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
    return;
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export async function markPasswordResetUsed(resetId) {
  if (isPostgres()) {
    await pgQuery("UPDATE password_reset_requests SET used_at = $1 WHERE id = $2", [new Date().toISOString(), resetId]);
    return;
  }
  db.prepare("UPDATE password_reset_requests SET used_at = ? WHERE id = ?").run(new Date().toISOString(), resetId);
}

export async function logAuditData({ user, leagueId = null, action, entityType, entityId = null, detail = "" }) {
  const values = [
    user?.id || null,
    user?.email || "public",
    user?.role || "public",
    leagueId,
    action,
    entityType,
    entityId,
    detail,
    new Date().toISOString()
  ];

  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO audit_logs (user_id, user_email, user_role, league_id, action, entity_type, entity_id, detail, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, values);
    return;
  }

  db.prepare(`
    INSERT INTO audit_logs (user_id, user_email, user_role, league_id, action, entity_type, entity_id, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...values);
}

export async function listAuditLogsData(limit = 80) {
  if (isPostgres()) {
    return pgQuery(`
      SELECT id, user_id AS "userId", user_email AS "userEmail", user_role AS "userRole",
             league_id AS "leagueId", action, entity_type AS "entityType", entity_id AS "entityId",
             detail, created_at AS "createdAt"
      FROM audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `, [limit]);
  }
  return db.prepare(`
    SELECT id, user_id AS userId, user_email AS userEmail, user_role AS userRole,
           league_id AS leagueId, action, entity_type AS entityType, entity_id AS entityId,
           detail, created_at AS createdAt
    FROM audit_logs
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(limit);
}

function normalizeBackupRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    kind: row.kind,
    status: row.status,
    fileName: row.file_name ?? row.fileName ?? "",
    filePath: row.file_path ?? row.filePath ?? "",
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? 0),
    checksumSha256: row.checksum_sha256 ?? row.checksumSha256 ?? "",
    storageBucket: row.storage_bucket ?? row.storageBucket ?? "",
    storagePath: row.storage_path ?? row.storagePath ?? "",
    createdByUserId: row.created_by_user_id ?? row.createdByUserId ?? "",
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    completedAt: normalizeDateTime(row.completed_at ?? row.completedAt),
    errorMessage: row.error_message ?? row.errorMessage ?? ""
  };
}

export async function createBackupRecordData(record) {
  const values = [
    record.id,
    record.provider,
    record.kind,
    record.status,
    record.fileName || "",
    record.filePath || "",
    Number(record.sizeBytes || 0),
    record.checksumSha256 || "",
    record.storageBucket || "",
    record.storagePath || "",
    record.createdByUserId || null,
    record.createdAt,
    record.completedAt || null,
    record.errorMessage || ""
  ];

  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO backup_records (
        id, provider, kind, status, file_name, file_path, size_bytes, checksum_sha256,
        storage_bucket, storage_path, created_by_user_id, created_at, completed_at, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, values);
    return;
  }

  db.prepare(`
    INSERT INTO backup_records (
      id, provider, kind, status, file_name, file_path, size_bytes, checksum_sha256,
      storage_bucket, storage_path, created_by_user_id, created_at, completed_at, error_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...values);
}

export async function updateBackupRecordData(recordId, patch) {
  const current = await getBackupRecordData(recordId);
  if (!current) return null;
  const next = { ...current, ...patch };
  const values = [
    next.status,
    next.fileName || "",
    next.filePath || "",
    Number(next.sizeBytes || 0),
    next.checksumSha256 || "",
    next.storageBucket || "",
    next.storagePath || "",
    next.completedAt || null,
    next.errorMessage || "",
    recordId
  ];

  if (isPostgres()) {
    await pgQuery(`
      UPDATE backup_records
      SET status = $1, file_name = $2, file_path = $3, size_bytes = $4, checksum_sha256 = $5,
          storage_bucket = $6, storage_path = $7, completed_at = $8, error_message = $9
      WHERE id = $10
    `, values);
    return getBackupRecordData(recordId);
  }

  db.prepare(`
    UPDATE backup_records
    SET status = ?, file_name = ?, file_path = ?, size_bytes = ?, checksum_sha256 = ?,
        storage_bucket = ?, storage_path = ?, completed_at = ?, error_message = ?
    WHERE id = ?
  `).run(...values);
  return getBackupRecordData(recordId);
}

export async function getBackupRecordData(recordId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT id, provider, kind, status, file_name, file_path, size_bytes, checksum_sha256,
             storage_bucket, storage_path, created_by_user_id, created_at, completed_at, error_message
      FROM backup_records
      WHERE id = $1
    `, [recordId]);
    return normalizeBackupRecord(rows[0]);
  }

  return normalizeBackupRecord(db.prepare(`
    SELECT id, provider, kind, status, file_name, file_path, size_bytes, checksum_sha256,
           storage_bucket, storage_path, created_by_user_id, created_at, completed_at, error_message
    FROM backup_records
    WHERE id = ?
  `).get(recordId));
}

export async function listBackupRecordsData(limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT id, provider, kind, status, file_name, file_path, size_bytes, checksum_sha256,
             storage_bucket, storage_path, created_by_user_id, created_at, completed_at, error_message
      FROM backup_records
      ORDER BY created_at DESC
      LIMIT $1
    `, [safeLimit]);
    return rows.map(normalizeBackupRecord);
  }

  return db.prepare(`
    SELECT id, provider, kind, status, file_name, file_path, size_bytes, checksum_sha256,
           storage_bucket, storage_path, created_by_user_id, created_at, completed_at, error_message
    FROM backup_records
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(safeLimit).map(normalizeBackupRecord);
}

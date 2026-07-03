import "./env.js";
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
    status: (row.user_status ?? row.userStatus ?? row.status) || "active",
    municipality: row.municipality || "",
    photoUrl: row.photo_url ?? row.photoUrl ?? "",
    notes: row.notes || "",
    createdAt: normalizeDateTime(row.created_at ?? row.createdAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt)
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
    captainPin: row.captain_pin ?? row.captainPin ?? "",
    players: parseJsonValue(row.players_json ?? row.playersJson, []),
    status: row.status || "submitted",
    notes: row.notes || "",
    submittedAt: normalizeDateTime(row.submitted_at ?? row.submittedAt),
    updatedAt: normalizeDateTime(row.updated_at ?? row.updatedAt)
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
  initializeDatabase();
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
        u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status
      FROM referee_profiles rp
      JOIN users u ON u.id = rp.user_id
      WHERE ($1::text = '' OR rp.municipality = $1)
      ORDER BY rp.municipality, u.name
    `, [municipality || ""]);
    return rows.map(normalizeRefereeRow);
  }
  return db.prepare(`
    SELECT
      rp.user_id, rp.municipality, rp.photo_url, rp.notes, rp.created_at, rp.updated_at,
      u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status
    FROM referee_profiles rp
    JOIN users u ON u.id = rp.user_id
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
          u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status
        FROM referee_profiles rp
        JOIN users u ON u.id = rp.user_id
        WHERE rp.user_id = $1
      `, [userId])
    : db.prepare(`
        SELECT
          rp.user_id, rp.municipality, rp.photo_url, rp.notes, rp.created_at, rp.updated_at,
          u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.status AS user_status
        FROM referee_profiles rp
        JOIN users u ON u.id = rp.user_id
        WHERE rp.user_id = ?
      `).all(userId);
  return normalizeRefereeRow(rows[0]);
}

export async function updateMatchRefereesData(matchId, payload) {
  const values = [
    payload.centralRefereeUserId || null,
    payload.assistantReferee1UserId || null,
    payload.assistantReferee2UserId || null,
    payload.fourthRefereeUserId || null,
    matchId
  ];
  if (isPostgres()) {
    await pgQuery(`
      UPDATE matches
      SET central_referee_user_id = $1,
          assistant_referee1_user_id = $2,
          assistant_referee2_user_id = $3,
          fourth_referee_user_id = $4
      WHERE id = $5
    `, values);
    return;
  }
  db.prepare(`
    UPDATE matches
    SET central_referee_user_id = ?,
        assistant_referee1_user_id = ?,
        assistant_referee2_user_id = ?,
        fourth_referee_user_id = ?
    WHERE id = ?
  `).run(...values);
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
    await pgQuery("UPDATE users SET status = $1 WHERE id = $2", [status, userId]);
    return;
  }
  db.prepare("UPDATE team_user_assignments SET status = ? WHERE id = ?").run(status === "active" ? "active" : status, assignmentId);
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, userId);
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
      WHERE team_id = $1
      ORDER BY number, name
    `, [teamId]);
    return rows.map(normalizePlayerRow);
  }
  return db.prepare(`
    SELECT id, league_id, competition_id, team_id, name, number, position, photo_url, photo_authorized, status
    FROM players
    WHERE team_id = ?
    ORDER BY number, name
  `).all(teamId).map(normalizePlayerRow);
}

export async function listMatchRostersForLeagueData(leagueId) {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, captain_pin, players_json, status, notes, submitted_at, updated_at
      FROM match_rosters
      WHERE league_id = $1
      ORDER BY submitted_at DESC
    `, [leagueId]);
    return rows.map(normalizeMatchRosterRow);
  }
  return db.prepare(`
    SELECT id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, captain_pin, players_json, status, notes, submitted_at, updated_at
    FROM match_rosters
    WHERE league_id = ?
    ORDER BY submitted_at DESC
  `).all(leagueId).map(normalizeMatchRosterRow);
}

export async function upsertMatchRosterData({ id, leagueId, matchId, teamId, submittedByUserId, captainPlayerId, captainPin = "", players, status = "submitted", notes = "" }) {
  const now = new Date().toISOString();
  const payload = JSON.stringify(players || []);
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO match_rosters (id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, captain_pin, players_json, status, notes, submitted_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11)
      ON CONFLICT (match_id, team_id) DO UPDATE SET
        submitted_by_user_id = EXCLUDED.submitted_by_user_id,
        captain_player_id = EXCLUDED.captain_player_id,
        captain_pin = EXCLUDED.captain_pin,
        players_json = EXCLUDED.players_json,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at
    `, [id, leagueId, matchId, teamId, submittedByUserId, captainPlayerId || null, captainPin, payload, status, notes, now]);
    return;
  }
  db.prepare(`
    INSERT INTO match_rosters (id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, captain_pin, players_json, status, notes, submitted_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id, team_id) DO UPDATE SET
      submitted_by_user_id = excluded.submitted_by_user_id,
      captain_player_id = excluded.captain_player_id,
      captain_pin = excluded.captain_pin,
      players_json = excluded.players_json,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(id, leagueId, matchId, teamId, submittedByUserId, captainPlayerId || null, captainPin, payload, status, notes, now, now);
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
      WHERE id = $2 AND role = 'referee'
    `, [passwordHash, userId]);
    return getUserById(userId);
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
    WHERE id = ? AND role = 'referee'
  `).run(passwordHash, userId);
  return getUserById(userId);
}

export async function activateAdminUserData({ userId, passwordHash }) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET password_hash = $1, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
      WHERE id = $2
    `, [passwordHash, userId]);
    await pgQuery("UPDATE user_accesses SET status = 'active', updated_at = $1 WHERE user_id = $2 AND status = 'pending_activation'", [new Date().toISOString(), userId]);
    return getUserById(userId);
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
    WHERE id = ?
  `).run(passwordHash, userId);
  db.prepare("UPDATE user_accesses SET status = 'active', updated_at = ? WHERE user_id = ? AND status = 'pending_activation'").run(new Date().toISOString(), userId);
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
    return getUserById(userId);
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, status = 'active', failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
    WHERE id = ?
  `).run(passwordHash, userId);
  db.prepare("UPDATE team_user_assignments SET status = 'active' WHERE id = ?").run(assignmentId);
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

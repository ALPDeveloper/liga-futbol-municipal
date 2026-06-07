import "./env.js";
import { DB_PATH, db, getStore as getSqliteStore, importStore as importSqliteStore, initializeDatabase } from "./database.js";
import { getPostgresStore, importPostgresStore, initializePostgresDatabase, postgresPool } from "./postgresDatabase.js";

export const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER === "postgres" ? "postgres" : "sqlite";
export const DATABASE_LABEL = DATABASE_PROVIDER === "postgres" ? "postgres" : DB_PATH;

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

async function pgQuery(text, values = []) {
  const result = await postgresPool.query(text, values);
  return result.rows;
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
  return isPostgres() ? importPostgresStore(store) : importSqliteStore(store);
}

export async function getActiveUserByEmail(email) {
  if (isPostgres()) {
    const rows = await pgQuery("SELECT * FROM users WHERE lower(email) = $1 AND status = 'active'", [email]);
    return normalizeUserRow(rows[0]);
  }
  return normalizeUserRow(db.prepare("SELECT * FROM users WHERE lower(email) = ? AND status = 'active'").get(email));
}

export async function getUserById(userId, { activeOnly = false } = {}) {
  if (isPostgres()) {
    const rows = await pgQuery(
      `SELECT * FROM users WHERE id = $1${activeOnly ? " AND status = 'active'" : ""}`,
      [userId]
    );
    return normalizeUserRow(rows[0]);
  }
  const sql = `SELECT * FROM users WHERE id = ?${activeOnly ? " AND status = 'active'" : ""}`;
  return normalizeUserRow(db.prepare(sql).get(userId));
}

export async function listUsersData() {
  if (isPostgres()) {
    const rows = await pgQuery(`
      SELECT id, league_id, name, email, role, status, failed_login_count, locked_until
      FROM users
      ORDER BY role, name
    `);
    return rows.map(normalizeUserRow);
  }
  return db.prepare(`
    SELECT id, league_id, name, email, role, status, failed_login_count, locked_until
    FROM users
    ORDER BY role, name
  `).all().map(normalizeUserRow);
}

export async function createUserData({ id, leagueId, name, email, role, status, passwordHash }) {
  if (isPostgres()) {
    await pgQuery(`
      INSERT INTO users (id, league_id, name, email, role, status, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, leagueId || null, name, email, role, status || "active", passwordHash]);
  } else {
    db.prepare(`
      INSERT INTO users (id, league_id, name, email, role, status, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, leagueId || null, name, email, role, status || "active", passwordHash);
  }
  return getUserById(id);
}

export async function updateUserData(userId, payload) {
  if (isPostgres()) {
    await pgQuery(`
      UPDATE users
      SET league_id = $1, name = $2, email = $3, role = $4, status = $5
      WHERE id = $6
    `, [payload.leagueId, payload.name, payload.email, payload.role, payload.status, userId]);
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
    SET league_id = ?, name = ?, email = ?, role = ?, status = ?
    WHERE id = ?
  `).run(payload.leagueId, payload.name, payload.email, payload.role, payload.status, userId);
  if (payload.passwordHash) {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, failed_login_count = 0, locked_until = NULL, last_failed_login_at = NULL
      WHERE id = ?
    `).run(payload.passwordHash, userId);
  }
  return getUserById(userId);
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

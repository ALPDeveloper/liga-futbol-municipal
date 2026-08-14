import "./env.js";
import { Pool } from "pg";
import { defaultCompetitionForLeague, normalizeStore } from "../src/lib/domain.js";
import { hashPassword } from "./password.js";
import { runtimeConfig } from "./runtimeConfig.js";

const DATABASE_URL = process.env.DATABASE_URL;

export const postgresPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    })
  : null;

function requirePool() {
  if (!postgresPool) {
    throw new Error("DATABASE_URL es requerido para usar Postgres/Supabase.");
  }
  return postgresPool;
}

async function loadDemoSeedStore() {
  const { seedData } = await import("../src/data/seedData.js");
  return normalizeStore(seedData);
}

function toDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function toDateTimeValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return JSON.stringify(fallback);
  return typeof value === "string" ? value : JSON.stringify(value);
}

function rowDate(row, key) {
  return toDateValue(row[key]);
}

export async function initializePostgresDatabase() {
  const pool = requirePool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await runPostgresMigrations(pool);
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM leagues");
  if (result.rows[0].total === 0 && runtimeConfig.seedDemoData) await importPostgresStore(await loadDemoSeedStore());
  await seedPostgresUsers();
}

async function runPostgresMigrations(pool) {
  const tables = (await pool.query(`
    SELECT
      to_regclass('public.leagues') AS leagues,
      to_regclass('public.teams') AS teams,
      to_regclass('public.players') AS players
  `)).rows[0];
  if (!tables.leagues || !tables.teams || !tables.players) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS league_announcements (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      date DATE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS league_media (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
      type TEXT NOT NULL DEFAULT 'gallery',
      title TEXT NOT NULL,
      caption TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ
    )
  `);
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS leagues ADD COLUMN IF NOT EXISTS public_visibility TEXT NOT NULL DEFAULT 'visible'");
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS assistant_coach TEXT");
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS address TEXT");
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS logo_url TEXT");
  await pool.query("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS phone TEXT");
  await pool.query("ALTER TABLE IF EXISTS players ADD COLUMN IF NOT EXISTS competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS players ADD COLUMN IF NOT EXISTS photo_url TEXT");
  await pool.query("ALTER TABLE IF EXISTS players ADD COLUMN IF NOT EXISTS photo_authorized BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS observations TEXT");
  await pool.query("ALTER TABLE IF EXISTS matches ALTER COLUMN date DROP NOT NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS schedule_note TEXT");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS original_date DATE");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS original_time TEXT");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS original_round INTEGER");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS schedule_updated_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS central_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS assistant_referee1_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS assistant_referee2_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS fourth_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS extra_time_home_goals INTEGER");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS extra_time_away_goals INTEGER");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS penalty_home_goals INTEGER");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS penalty_away_goals INTEGER");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'scheduled'");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS capture_mode TEXT NOT NULL DEFAULT 'admin'");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS current_report_id TEXT");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS local_uuid TEXT");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS secondary_player_id TEXT REFERENCES players(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS assist_player_id TEXT REFERENCES players(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS event_team_side TEXT");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS subtype TEXT");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS period TEXT");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS suspension_indefinite BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS minute_label TEXT");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS second INTEGER");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS disciplinary_pending BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT true");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'synced'");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE IF EXISTS match_events ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1");
  await pool.query("ALTER TABLE IF EXISTS player_sanctions ADD COLUMN IF NOT EXISTS indefinite BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE IF EXISTS league_rules ADD COLUMN IF NOT EXISTS discipline_scope TEXT NOT NULL DEFAULT 'competition'");
  await pool.query("ALTER TABLE IF EXISTS league_rules ADD COLUMN IF NOT EXISTS playoff_qualifiers INTEGER NOT NULL DEFAULT 8");
  await pool.query("ALTER TABLE IF EXISTS league_rules ADD COLUMN IF NOT EXISTS minimum_playoff_appearances INTEGER NOT NULL DEFAULT 0");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_affiliations (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      source_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      target_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at DATE,
      ends_at DATE,
      player_numbers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discipline_links (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discipline_adjustments (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      value INTEGER NOT NULL,
      date DATE,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discipline_resets (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      date DATE,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_appearance_adjustments (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      value INTEGER NOT NULL,
      date DATE,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_accesses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      league_id TEXT REFERENCES leagues(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_activation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_id TEXT REFERENCES user_accesses(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_user_assignments (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'delegate',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_roster_permissions (
      team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      registration_enabled BOOLEAN NOT NULL DEFAULT false,
      enabled_until TIMESTAMPTZ,
      notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_delegate_activation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id TEXT NOT NULL REFERENCES team_user_assignments(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referee_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      municipality TEXT NOT NULL,
      photo_url TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referee_activation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referee_match_sheets (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      payload_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      review_note TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_rosters (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      captain_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      captain_pin TEXT,
      players_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      notes TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(match_id, team_id)
    )
  `);
  await pool.query("ALTER TABLE IF EXISTS match_rosters ADD COLUMN IF NOT EXISTS captain_pin TEXT");
  await pool.query("ALTER TABLE IF EXISTS match_rosters ADD COLUMN IF NOT EXISTS goalkeeper_player_id TEXT REFERENCES players(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS match_rosters ADD COLUMN IF NOT EXISTS starters_json JSONB NOT NULL DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE IF EXISTS match_rosters ADD COLUMN IF NOT EXISTS substitutes_json JSONB NOT NULL DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE IF EXISTS match_rosters ADD COLUMN IF NOT EXISTS lineup_json JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE IF EXISTS match_rosters ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_participations (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'submitted',
      captain_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      locked_at TIMESTAMPTZ,
      corrected_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      corrected_at TIMESTAMPTZ,
      correction_reason TEXT,
      source TEXT NOT NULL DEFAULT 'delegate_portal',
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT true,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_participation_players (
      id TEXT PRIMARY KEY,
      match_participation_id TEXT NOT NULL REFERENCES match_participations(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      player_name_snapshot TEXT NOT NULL,
      player_number_snapshot TEXT,
      player_photo_snapshot TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(match_participation_id, player_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_team_pins (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      roster_id TEXT REFERENCES match_rosters(id) ON DELETE SET NULL,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revealed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      revealed_at TIMESTAMPTZ,
      invalidated_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ,
      signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(match_id, team_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_sessions (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      capture_mode TEXT NOT NULL DEFAULT 'live',
      status TEXT NOT NULL DEFAULT 'draft',
      period TEXT,
      started_at TIMESTAMPTZ,
      paused_at TIMESTAMPTZ,
      saved_at TIMESTAMPTZ,
      resumed_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      suspended_at TIMESTAMPTZ,
      suspension_reason TEXT,
      clock_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_session_operations (
      operation_id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES match_sessions(id) ON DELETE SET NULL,
      referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'synced',
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_reports (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES match_sessions(id) ON DELETE SET NULL,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      capture_mode TEXT NOT NULL DEFAULT 'admin',
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      home_goals INTEGER,
      away_goals INTEGER,
      generated_at TIMESTAMPTZ,
      finalized_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_report_signatures (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES match_reports(id) ON DELETE CASCADE,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      captain_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      signed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      method TEXT NOT NULL DEFAULT 'pin',
      status TEXT NOT NULL DEFAULT 'signed',
      signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_address TEXT,
      user_agent TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE(report_id, team_id)
    )
  `);
  await pool.query("ALTER TABLE IF EXISTS match_report_signatures ADD COLUMN IF NOT EXISTS act_version INTEGER");
  await pool.query("ALTER TABLE IF EXISTS match_report_signatures ADD COLUMN IF NOT EXISTS act_hash TEXT");
  await pool.query("ALTER TABLE IF EXISTS match_report_signatures ADD COLUMN IF NOT EXISTS act_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE IF EXISTS match_report_signatures ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_report_disputes (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES match_reports(id) ON DELETE CASCADE,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_sync_queue (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES match_sessions(id) ON DELETE CASCADE,
      client_event_id TEXT,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      synced_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backup_records (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      checksum_sha256 TEXT,
      storage_bucket TEXT,
      storage_path TEXT,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      error_message TEXT
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_rosters_match ON match_rosters(match_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users(lower(email))");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_user_accesses_user ON user_accesses(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_user_accesses_league_role ON user_accesses(league_id, role)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_admin_activation_tokens_hash ON admin_activation_tokens(token_hash)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_team_delegate_activation_tokens_hash ON team_delegate_activation_tokens(token_hash)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_referee_activation_tokens_hash ON referee_activation_tokens(token_hash)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_expires ON password_reset_requests(user_id, expires_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_team_user_assignments_user ON team_user_assignments(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_team_user_assignments_league_team ON team_user_assignments(league_id, team_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_referee_profiles_municipality ON referee_profiles(municipality)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_referee_match_sheets_match ON referee_match_sheets(match_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_referee_match_sheets_status ON referee_match_sheets(status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_competitions_league ON competitions(league_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_players_league_team ON players(league_id, team_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_matches_league_competition_round ON matches(league_id, competition_id, round)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(match_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_participations_match_team ON match_participations(match_id, team_id)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_match_participations_active_team ON match_participations(match_id, team_id) WHERE active = true");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_participation_players_report ON match_participation_players(match_participation_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_team_pins_match ON match_team_pins(match_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_sessions_match ON match_sessions(match_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_session_operations_match ON match_session_operations(match_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_reports_match ON match_reports(match_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_reports_status ON match_reports(status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_report_signatures_report ON match_report_signatures(report_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_match_sync_queue_match_status ON match_sync_queue(match_id, status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_backup_records_created ON backup_records(created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_player_sanctions_league ON player_sanctions(league_id, competition_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_player_injuries_league ON player_injuries(league_id, competition_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_matches_referee_central ON matches(central_referee_user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_matches_referee_assistant1 ON matches(assistant_referee1_user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_matches_referee_assistant2 ON matches(assistant_referee2_user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_matches_referee_fourth ON matches(fourth_referee_user_id)");
  await pool.query(`
    UPDATE teams
    SET competition_id = leagues.current_competition_id
    FROM leagues
    WHERE teams.league_id = leagues.id
      AND teams.competition_id IS NULL
      AND leagues.current_competition_id IS NOT NULL
  `);
  await pool.query(`
    UPDATE players
    SET competition_id = COALESCE(
      (SELECT teams.competition_id FROM teams WHERE teams.id = players.team_id),
      (SELECT leagues.current_competition_id FROM leagues WHERE leagues.id = players.league_id)
    )
    WHERE players.competition_id IS NULL
      AND COALESCE(
        (SELECT teams.competition_id FROM teams WHERE teams.id = players.team_id),
        (SELECT leagues.current_competition_id FROM leagues WHERE leagues.id = players.league_id)
      ) IS NOT NULL
  `);
}

async function seedPostgresUsers() {
  if (!runtimeConfig.seedDemoUsers) return;

  const pool = requirePool();
  const users = [
    {
      id: "user-super-admin",
      leagueId: null,
      name: "Super Admin",
      email: "super@ligafut.local",
      role: "super_admin",
      password: "super123"
    },
    {
      id: "user-admin-tinguindin",
      leagueId: "liga-centro",
      name: "Admin Tingüindín",
      email: "admin.tinguindin@demo.com",
      role: "league_admin",
      password: "admin123"
    }
  ];

  for (const user of users) {
    if (user.leagueId) {
      const league = await pool.query("SELECT id FROM leagues WHERE id = $1", [user.leagueId]);
      if (!league.rowCount) continue;
    }

    await pool.query(
      `
        INSERT INTO users (id, league_id, name, email, role, status, password_hash)
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
        ON CONFLICT(email) DO NOTHING
      `,
      [user.id, user.leagueId, user.name, user.email, user.role, hashPassword(user.password)]
    );
  }
}

export async function getPostgresStore() {
  const pool = requirePool();
  const leagueRows = (await pool.query("SELECT * FROM leagues ORDER BY name")).rows;
  const currentLeagueSetting = (await pool.query("SELECT value FROM app_settings WHERE key = 'currentLeagueId'")).rows[0]?.value;

  const leagues = await Promise.all(leagueRows.map(async (leagueRow) => {
    const [
      identityRows,
      ruleRows,
      highlightRows,
      announcementRows,
      competitionRows,
      teamRows,
      playerRows,
      sanctionRows,
      injuryRows,
      affiliationRows,
      disciplineLinkRows,
      disciplineAdjustmentRows,
      disciplineResetRows,
      appearanceAdjustmentRows,
      sponsorRows,
      mediaRows,
      matchRows,
      rosterRows,
      participationRows
    ] = await Promise.all([
      pool.query("SELECT * FROM league_identities WHERE league_id = $1", [leagueRow.id]),
      pool.query("SELECT * FROM league_rules WHERE league_id = $1", [leagueRow.id]),
      pool.query("SELECT body FROM league_highlights WHERE league_id = $1 ORDER BY sort_order, id", [leagueRow.id]),
      pool.query("SELECT * FROM league_announcements WHERE league_id = $1 ORDER BY date DESC NULLS LAST, title", [leagueRow.id]),
      pool.query("SELECT * FROM competitions WHERE league_id = $1 ORDER BY status, season DESC, name", [leagueRow.id]),
      pool.query("SELECT * FROM teams WHERE league_id = $1 ORDER BY name", [leagueRow.id]),
      pool.query("SELECT * FROM players WHERE league_id = $1 ORDER BY team_id, number, name", [leagueRow.id]),
      pool.query("SELECT * FROM player_sanctions WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id]),
      pool.query("SELECT * FROM player_injuries WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id]),
      pool.query("SELECT * FROM team_affiliations WHERE league_id = $1 ORDER BY id", [leagueRow.id]),
      pool.query("SELECT * FROM discipline_links WHERE league_id = $1 ORDER BY id", [leagueRow.id]),
      pool.query("SELECT * FROM discipline_adjustments WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id]),
      pool.query("SELECT * FROM discipline_resets WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id]),
      pool.query("SELECT * FROM player_appearance_adjustments WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id]),
      pool.query("SELECT * FROM sponsors WHERE league_id = $1 ORDER BY sort_order, name", [leagueRow.id]),
      pool.query("SELECT * FROM league_media WHERE league_id = $1 ORDER BY sort_order, created_at DESC NULLS LAST, title", [leagueRow.id]),
      pool.query("SELECT * FROM matches WHERE league_id = $1 ORDER BY round, date, time", [leagueRow.id]),
      pool.query("SELECT * FROM match_rosters WHERE league_id = $1 ORDER BY submitted_at DESC", [leagueRow.id]),
      pool.query("SELECT * FROM match_participations WHERE league_id = $1 ORDER BY submitted_at DESC, version DESC", [leagueRow.id])
    ]);
    const identity = identityRows.rows[0] || {};
    const rules = ruleRows.rows[0] || {};
    const highlights = highlightRows.rows.map((row) => row.body);
    const announcements = announcementRows.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      status: row.status,
      date: rowDate(row, "date")
    }));
    const competitions = competitionRows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      season: row.season,
      status: row.status,
      activeRound: row.active_round,
      startsAt: rowDate(row, "starts_at"),
      endsAt: rowDate(row, "ends_at")
    }));
    const teams = teamRows.rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      name: row.name,
      coach: row.coach,
      assistantCoach: row.assistant_coach,
      address: row.address,
      colors: row.colors,
      logoUrl: row.logo_url,
      status: row.status,
      withdrawnRound: row.withdrawn_round,
      withdrawnReason: row.withdrawn_reason
    }));
    const players = playerRows.rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      teamId: row.team_id,
      name: row.name,
      number: row.number,
      position: row.position,
      photoUrl: row.photo_url || "",
      photoAuthorized: Boolean(row.photo_authorized),
      status: row.status
    }));
    const sanctions = sanctionRows.rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      type: row.type,
      matches: row.matches,
      indefinite: toBoolean(row.indefinite),
      reason: row.reason,
      date: rowDate(row, "date"),
      status: row.status,
      notes: row.notes
    }));
    const injuries = injuryRows.rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      type: row.type,
      date: rowDate(row, "date"),
      expectedReturn: rowDate(row, "expected_return"),
      needsSurgery: Boolean(row.needs_surgery),
      needsSupport: Boolean(row.needs_support),
      supportDetail: row.support_detail,
      status: row.status,
      notes: row.notes
    }));
    const teamAffiliations = affiliationRows.rows.map((row) => ({
      id: row.id,
      sourceTeamId: row.source_team_id,
      targetTeamId: row.target_team_id,
      status: row.status,
      startsAt: rowDate(row, "starts_at"),
      endsAt: rowDate(row, "ends_at"),
      playerNumbers: row.player_numbers_json || {},
      notes: row.notes || ""
    }));
    const disciplineLinks = disciplineLinkRows.rows.map((row) => ({
      id: row.id,
      playerIds: row.player_ids_json || [],
      notes: row.notes || ""
    }));
    const disciplineAdjustments = disciplineAdjustmentRows.rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      value: row.value,
      date: rowDate(row, "date"),
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const disciplineResets = disciplineResetRows.rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      date: rowDate(row, "date"),
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const appearanceAdjustments = appearanceAdjustmentRows.rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      value: row.value,
      date: rowDate(row, "date"),
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const sponsors = sponsorRows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      placement: row.placement,
      status: row.status,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      sortOrder: row.sort_order,
      notes: row.notes
    }));
    const media = mediaRows.rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id || "",
      type: row.type || "gallery",
      title: row.title,
      caption: row.caption || "",
      status: row.status || "active",
      imageUrl: row.image_url,
      sortOrder: row.sort_order,
      createdAt: toDateTimeValue(row.created_at) || ""
    }));
    const matchIds = matchRows.rows.map((row) => row.id);
    const eventRows = matchIds.length
      ? (await pool.query("SELECT * FROM match_events WHERE match_id = ANY($1::text[]) ORDER BY match_id, id", [matchIds])).rows
      : [];
    const eventsByMatchId = new Map();
    for (const event of eventRows) {
      const events = eventsByMatchId.get(event.match_id) || [];
      events.push({
        localUuid: event.local_uuid || "",
        type: event.type,
        playerId: event.player_id,
        secondaryPlayerId: event.secondary_player_id || "",
        assistPlayerId: event.assist_player_id || "",
        teamId: event.team_id,
        eventTeamSide: event.event_team_side || "",
        subtype: event.subtype || "",
        period: event.period || "",
        minute: event.minute,
        minuteLabel: event.minute_label || "",
        second: event.second,
        suspensionMatches: event.suspension_matches,
        suspensionIndefinite: toBoolean(event.suspension_indefinite),
        disciplinaryPending: toBoolean(event.disciplinary_pending),
        reason: event.reason,
        metadata: event.metadata_json || {},
        isOfficial: event.is_official !== false,
        syncStatus: event.sync_status || "synced",
        createdByUserId: event.created_by_user_id || "",
        createdAt: toDateTimeValue(event.created_at),
        updatedAt: toDateTimeValue(event.updated_at),
        version: event.version || 1
      });
      eventsByMatchId.set(event.match_id, events);
    }

    const matches = matchRows.rows.map((row) => ({
        id: row.id,
        competitionId: row.competition_id,
        stage: row.stage || "regular",
        playoffRound: row.playoff_round,
        playoffLeg: row.playoff_leg,
        aggregateHome: row.aggregate_home,
        aggregateAway: row.aggregate_away,
        extraTimeHomeGoals: row.extra_time_home_goals,
        extraTimeAwayGoals: row.extra_time_away_goals,
        penaltyHomeGoals: row.penalty_home_goals,
        penaltyAwayGoals: row.penalty_away_goals,
        round: row.round,
        date: rowDate(row, "date"),
        time: row.time,
        venue: row.venue,
        scheduleNote: row.schedule_note || "",
        originalDate: rowDate(row, "original_date"),
        originalTime: row.original_time || "",
        originalRound: row.original_round || "",
        scheduleUpdatedAt: toDateTimeValue(row.schedule_updated_at),
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        status: row.status,
        workflowStatus: row.workflow_status || row.status || "scheduled",
        captureMode: row.capture_mode || "admin",
        currentReportId: row.current_report_id || "",
        publishedAt: toDateTimeValue(row.published_at),
        finalizedAt: toDateTimeValue(row.finalized_at),
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        observations: row.observations,
        resolutionType: row.resolution_type,
        resolutionNote: row.resolution_note,
        centralRefereeUserId: row.central_referee_user_id || "",
        assistantReferee1UserId: row.assistant_referee1_user_id || "",
        assistantReferee2UserId: row.assistant_referee2_user_id || "",
        fourthRefereeUserId: row.fourth_referee_user_id || "",
        events: eventsByMatchId.get(row.id) || []
    }));
    const matchRosters = rosterRows.rows.map((row) => ({
      id: row.id,
      matchId: row.match_id,
      teamId: row.team_id,
      submittedByUserId: row.submitted_by_user_id || "",
      captainPlayerId: row.captain_player_id || "",
      goalkeeperPlayerId: row.goalkeeper_player_id || "",
      captainPin: row.captain_pin || "",
      players: row.players_json || [],
      starters: row.starters_json || [],
      substitutes: row.substitutes_json || [],
      lineup: row.lineup_json || {},
      status: row.status,
      notes: row.notes || "",
      submittedAt: rowDate(row, "submitted_at"),
      updatedAt: rowDate(row, "updated_at"),
      version: row.version || 1
    }));
    const participationIds = participationRows.rows.map((row) => row.id);
    const participationPlayerRows = participationIds.length
      ? (await pool.query("SELECT * FROM match_participation_players WHERE match_participation_id = ANY($1::text[]) ORDER BY created_at ASC", [participationIds])).rows
      : [];
    const participationPlayersById = new Map();
    for (const row of participationPlayerRows) {
      if (!participationPlayersById.has(row.match_participation_id)) participationPlayersById.set(row.match_participation_id, []);
      participationPlayersById.get(row.match_participation_id).push({
        id: row.id,
        playerId: row.player_id,
        playerNameSnapshot: row.player_name_snapshot || "",
        playerNumberSnapshot: row.player_number_snapshot || "",
        playerPhotoSnapshot: row.player_photo_snapshot || "",
        createdAt: toDateTimeValue(row.created_at) || ""
      });
    }
    const matchParticipations = participationRows.rows.map((row) => ({
      id: row.id,
      matchId: row.match_id,
      teamId: row.team_id,
      status: row.status || "submitted",
      captainPlayerId: row.captain_player_id || "",
      submittedByUserId: row.submitted_by_user_id || "",
      submittedAt: toDateTimeValue(row.submitted_at) || "",
      lockedAt: toDateTimeValue(row.locked_at) || "",
      correctedByUserId: row.corrected_by_user_id || "",
      correctedAt: toDateTimeValue(row.corrected_at) || "",
      correctionReason: row.correction_reason || "",
      source: row.source || "delegate_portal",
      metadata: row.metadata_json || {},
      active: row.active !== false,
      version: row.version || 1,
      createdAt: toDateTimeValue(row.created_at) || "",
      updatedAt: toDateTimeValue(row.updated_at) || "",
      players: participationPlayersById.get(row.id) || []
    }));

    return {
      id: leagueRow.id,
      name: leagueRow.name,
      city: leagueRow.city,
      season: leagueRow.season,
      currentCompetitionId: leagueRow.current_competition_id,
      competitions,
      status: leagueRow.status,
      publicVisibility: leagueRow.public_visibility || "visible",
      plan: leagueRow.plan,
      ownerEmail: leagueRow.owner_email,
      renewalDate: rowDate(leagueRow, "renewal_date"),
      adBanner: leagueRow.ad_banner,
      membershipNotes: leagueRow.membership_notes,
      identity: {
        nickname: identity.nickname,
        activities: identity.activities,
        publicIntro: identity.public_intro,
        primaryColor: identity.primary_color,
        accentColor: identity.accent_color,
        secondaryColor: identity.secondary_color
      },
      rules: {
        withdrawalPolicy: rules.withdrawal_policy,
        forfeitPoints: rules.forfeit_points,
        forfeitGoalsFor: rules.forfeit_goals_for,
        forfeitGoalsAgainst: rules.forfeit_goals_against,
        yellowSuspensionLimit: rules.yellow_suspension_limit,
        defaultRedSuspensionMatches: rules.default_red_suspension_matches,
        disciplineScope: rules.discipline_scope,
        playoffQualifiers: rules.playoff_qualifiers,
        minimumPlayoffAppearances: rules.minimum_playoff_appearances,
        notes: rules.notes
      },
      highlights,
      announcements,
      teams,
      players,
      sanctions,
      injuries,
      teamAffiliations,
      disciplineLinks,
      disciplineAdjustments,
      disciplineResets,
      appearanceAdjustments,
      sponsors,
      media,
      matches,
      matchRosters,
      matchParticipations
    };
  }));

  return normalizeStore({
    currentLeagueId: currentLeagueSetting || leagues[0]?.id || "",
    leagues
  });
}

async function query(client, text, values = []) {
  return client.query(text, values);
}

async function insertRows(client, table, columns, rows, options = {}) {
  if (!rows.length) return;
  const dateColumns = new Set(options.dateColumns || []);
  const chunkSize = Math.max(1, Math.floor(50000 / columns.length));

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const valueGroups = chunk.map((row) => {
      const placeholders = columns.map((column, index) => {
        values.push(row[index]);
        const placeholder = `$${values.length}`;
        return dateColumns.has(column) ? `NULLIF(${placeholder}, '')::date` : placeholder;
      });
      return `(${placeholders.join(", ")})`;
    });

    await query(
      client,
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueGroups.join(", ")}`,
      values
    );
  }
}

export async function importPostgresStore(store) {
  const normalized = normalizeStore(store);
  const pool = requirePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const userLeagueAssignments = (await query(client, "SELECT id, league_id FROM users")).rows;
    const preservedTeamAssignments = (await query(client, `
      SELECT id, league_id, team_id, user_id, role, status, created_at
      FROM team_user_assignments
    `)).rows;
    const preservedTeamRosterPermissions = (await query(client, `
      SELECT team_id, league_id, registration_enabled, enabled_until, notes, updated_at
      FROM team_roster_permissions
    `)).rows;
    const preservedUserAccesses = (await query(client, `
      SELECT id, user_id, league_id, team_id, role, permissions_json, status, created_at, updated_at
      FROM user_accesses
    `)).rows;
    const preservedAdminActivationTokens = (await query(client, `
      SELECT id, user_id, access_id, token_hash, expires_at, used_at, revoked_at, created_at
      FROM admin_activation_tokens
    `)).rows;
    const preservedDelegateActivationTokens = (await query(client, `
      SELECT id, user_id, assignment_id, token_hash, expires_at, used_at, revoked_at, created_at
      FROM team_delegate_activation_tokens
    `)).rows;
    const preservedMatchTeamPins = (await query(client, "SELECT * FROM match_team_pins")).rows;
    const preservedMatchSessions = (await query(client, "SELECT * FROM match_sessions")).rows;
    const preservedMatchReports = (await query(client, "SELECT * FROM match_reports")).rows;
    const preservedMatchReportSignatures = (await query(client, "SELECT * FROM match_report_signatures")).rows;
    const preservedMatchReportDisputes = (await query(client, "SELECT * FROM match_report_disputes")).rows;
    const preservedMatchSyncQueue = (await query(client, "SELECT * FROM match_sync_queue")).rows;
    const preservedMatchParticipations = (await query(client, "SELECT * FROM match_participations")).rows;
    const preservedMatchParticipationPlayers = (await query(client, "SELECT * FROM match_participation_players")).rows;
    const nextLeagueIds = new Set(normalized.leagues.map((league) => league.id));
    const nextTeamIds = new Set(normalized.leagues.flatMap((league) => (league.teams || []).map((team) => team.id)));
    const removedLeagueIds = new Set(
      userLeagueAssignments
        .map((assignment) => assignment.league_id)
        .filter((leagueId) => leagueId && !nextLeagueIds.has(leagueId))
    );

    for (const table of [
      "admin_activation_tokens",
      "team_delegate_activation_tokens",
      "team_roster_permissions",
      "team_user_assignments",
      "user_accesses"
    ]) {
      await query(client, `DELETE FROM ${table}`);
    }

    for (const leagueId of removedLeagueIds) {
      await query(client, "DELETE FROM users WHERE role = 'league_admin' AND league_id = $1", [leagueId]);
    }

    for (const table of [
      "match_participation_players",
      "match_participations",
      "match_events",
      "match_rosters",
      "discipline_resets",
      "discipline_adjustments",
      "discipline_links",
      "player_appearance_adjustments",
      "player_injuries",
      "player_sanctions",
      "matches",
      "team_affiliations",
      "players",
      "teams",
      "competitions",
      "league_announcements",
      "league_media",
      "league_highlights",
      "league_rules",
      "league_identities",
      "sponsors",
      "memberships",
      "leagues"
    ]) {
      await query(client, `DELETE FROM ${table}`);
    }

    await query(
      client,
      `
        INSERT INTO app_settings (key, value)
        VALUES ('currentLeagueId', $1)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
      `,
      [normalized.currentLeagueId]
    );

    for (const league of normalized.leagues) {
      await query(client, `
        INSERT INTO leagues (id, name, city, season, current_competition_id, status, public_visibility, plan, owner_email, renewal_date, ad_banner, membership_notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, '')::date, $11, $12)
      `, [
        league.id,
        league.name,
        league.city,
        league.season,
        league.currentCompetitionId,
        league.status,
        league.publicVisibility || "visible",
        league.plan,
        league.ownerEmail,
        league.renewalDate || "",
        league.adBanner,
        league.membershipNotes || ""
      ]);

      await insertRows(client, "competitions", ["id", "league_id", "name", "type", "season", "status", "active_round", "starts_at", "ends_at"], (league.competitions || []).map((competition) => [
          competition.id,
          league.id,
          competition.name,
          competition.type || "liga",
          competition.season || league.season,
          competition.status || "active",
          Number(competition.activeRound || 0) || null,
          competition.startsAt || "",
          competition.endsAt || ""
        ]), { dateColumns: ["starts_at", "ends_at"] });

      await query(client, `
        INSERT INTO league_identities (league_id, nickname, activities, public_intro, primary_color, accent_color, secondary_color)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        league.id,
        league.identity.nickname,
        league.identity.activities,
        league.identity.publicIntro,
        league.identity.primaryColor,
        league.identity.accentColor,
        league.identity.secondaryColor
      ]);

      await query(client, `
        INSERT INTO league_rules (league_id, withdrawal_policy, forfeit_points, forfeit_goals_for, forfeit_goals_against, yellow_suspension_limit, default_red_suspension_matches, discipline_scope, playoff_qualifiers, minimum_playoff_appearances, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        league.id,
        league.rules?.withdrawalPolicy || "award_walkover",
        Number(league.rules?.forfeitPoints ?? 3),
        Number(league.rules?.forfeitGoalsFor ?? 3),
        Number(league.rules?.forfeitGoalsAgainst ?? 0),
        Number(league.rules?.yellowSuspensionLimit ?? 3),
        Number(league.rules?.defaultRedSuspensionMatches ?? 1),
        league.rules?.disciplineScope === "league" ? "league" : "competition",
        Number(league.rules?.playoffQualifiers ?? 8),
        Number(league.rules?.minimumPlayoffAppearances ?? 0),
        league.rules?.notes || "Si un equipo se da de baja, la liga puede otorgar triunfo por default segun sus estatutos."
      ]);

      await insertRows(client, "league_highlights", ["league_id", "body", "sort_order"], (league.highlights || []).map((highlight, index) => [league.id, highlight, index]));

      await insertRows(client, "league_announcements", ["id", "league_id", "title", "body", "status", "date"], (league.announcements || []).map((announcement) => [
          announcement.id,
          league.id,
          announcement.title,
          announcement.body,
          announcement.status || "active",
          announcement.date || ""
        ]), { dateColumns: ["date"] });

      await insertRows(client, "sponsors", ["id", "league_id", "name", "placement", "status", "image_url", "link_url", "sort_order", "notes"], (league.sponsors || []).map((sponsor) => [
          sponsor.id,
          league.id,
          sponsor.name,
          sponsor.placement || "home_banner",
          sponsor.status || "active",
          sponsor.imageUrl || "",
          sponsor.linkUrl || "",
          Number(sponsor.sortOrder || 0),
          sponsor.notes || ""
        ]));

      await insertRows(client, "league_media", ["id", "league_id", "competition_id", "type", "title", "caption", "status", "image_url", "sort_order", "created_at"], (league.media || []).map((item) => [
          item.id,
          league.id,
          item.competitionId || null,
          item.type || "gallery",
          item.title || "Foto",
          item.caption || "",
          item.status || "active",
          item.imageUrl || "",
          Number(item.sortOrder || 0),
          item.createdAt || new Date().toISOString()
        ]), { dateColumns: ["created_at"] });

      await insertRows(client, "teams", ["id", "league_id", "competition_id", "name", "coach", "assistant_coach", "address", "colors", "logo_url", "status", "withdrawn_round", "withdrawn_reason"], league.teams.map((team) => (
        [team.id, league.id, team.competitionId || league.currentCompetitionId, team.name, team.coach, team.assistantCoach || "", team.address || "", team.colors, team.logoUrl || "", team.status || "active", team.withdrawnRound || null, team.withdrawnReason || null]
      )));

      await insertRows(client, "players", ["id", "league_id", "competition_id", "team_id", "name", "number", "position", "photo_url", "photo_authorized", "status"], league.players.map((player) => [
          player.id,
          league.id,
          player.competitionId || league.teams.find((team) => team.id === player.teamId)?.competitionId || league.currentCompetitionId,
          player.teamId,
          player.name,
          player.number,
          player.position,
          player.photoUrl || "",
          Boolean(player.photoAuthorized),
          player.status || "active"
        ]));

      await insertRows(client, "player_sanctions", ["id", "league_id", "competition_id", "player_id", "type", "matches", "indefinite", "reason", "date", "status", "notes"], (league.sanctions || []).map((sanction) => (
        [sanction.id, league.id, sanction.competitionId || league.currentCompetitionId, sanction.playerId, sanction.type || "Sancion disciplinaria", Number(sanction.matches || 0), toBoolean(sanction.indefinite), sanction.reason || "", sanction.date || "", sanction.status || "active", sanction.notes || ""]
      )), { dateColumns: ["date"] });

      await insertRows(client, "player_injuries", ["id", "league_id", "competition_id", "player_id", "type", "date", "expected_return", "needs_surgery", "needs_support", "support_detail", "status", "notes"], (league.injuries || []).map((injury) => (
        [injury.id, league.id, injury.competitionId || league.currentCompetitionId, injury.playerId, injury.type || "Lesion", injury.date || "", injury.expectedReturn || "", toBoolean(injury.needsSurgery), toBoolean(injury.needsSupport), injury.supportDetail || "", injury.status || "active", injury.notes || ""]
      )), { dateColumns: ["date", "expected_return"] });

      await insertRows(client, "team_affiliations", ["id", "league_id", "source_team_id", "target_team_id", "status", "starts_at", "ends_at", "player_numbers_json", "notes"], (league.teamAffiliations || []).map((affiliation) => (
        [affiliation.id, league.id, affiliation.sourceTeamId, affiliation.targetTeamId, affiliation.status || "active", affiliation.startsAt || "", affiliation.endsAt || "", JSON.stringify(affiliation.playerNumbers || {}), affiliation.notes || ""]
      )), { dateColumns: ["starts_at", "ends_at"] });

      await insertRows(client, "discipline_links", ["id", "league_id", "player_ids_json", "notes"], (league.disciplineLinks || []).map((link) => (
        [link.id, league.id, JSON.stringify(link.playerIds || []), link.notes || ""]
      )));

      await insertRows(client, "discipline_adjustments", ["id", "league_id", "competition_id", "player_id", "value", "date", "reason", "notes", "status"], (league.disciplineAdjustments || []).map((adjustment) => (
        [adjustment.id, league.id, adjustment.competitionId || league.currentCompetitionId, adjustment.playerId, Number(adjustment.value || 0), adjustment.date || "", adjustment.reason || "", adjustment.notes || "", adjustment.status || "active"]
      )), { dateColumns: ["date"] });

      await insertRows(client, "discipline_resets", ["id", "league_id", "player_id", "date", "reason", "notes", "status"], (league.disciplineResets || []).map((reset) => (
        [reset.id, league.id, reset.playerId, reset.date || "", reset.reason || "", reset.notes || "", reset.status || "active"]
      )), { dateColumns: ["date"] });

      await insertRows(client, "player_appearance_adjustments", ["id", "league_id", "player_id", "value", "date", "reason", "notes", "status"], (league.appearanceAdjustments || []).map((adjustment) => (
        [adjustment.id, league.id, adjustment.playerId, Number(adjustment.value || 0), adjustment.date || "", adjustment.reason || "", adjustment.notes || "", adjustment.status || "active"]
      )), { dateColumns: ["date"] });

      await insertRows(client, "matches", ["id", "league_id", "competition_id", "stage", "playoff_round", "playoff_leg", "aggregate_home", "aggregate_away", "extra_time_home_goals", "extra_time_away_goals", "penalty_home_goals", "penalty_away_goals", "round", "date", "time", "venue", "schedule_note", "original_date", "original_time", "original_round", "schedule_updated_at", "home_team_id", "away_team_id", "status", "workflow_status", "capture_mode", "current_report_id", "published_at", "finalized_at", "home_goals", "away_goals", "observations", "resolution_type", "resolution_note", "central_referee_user_id", "assistant_referee1_user_id", "assistant_referee2_user_id", "fourth_referee_user_id"], league.matches.map((match) => [
          match.id,
          league.id,
          match.competitionId || league.currentCompetitionId,
          match.stage || "regular",
          match.playoffRound || "",
          match.playoffLeg || "",
          match.aggregateHome ?? null,
          match.aggregateAway ?? null,
          match.extraTimeHomeGoals ?? null,
          match.extraTimeAwayGoals ?? null,
          match.penaltyHomeGoals ?? null,
          match.penaltyAwayGoals ?? null,
          match.round,
          match.date || "",
          match.time || "",
          match.venue || "",
          match.scheduleNote || "",
          match.originalDate || "",
          match.originalTime || "",
          match.originalRound || null,
          match.scheduleUpdatedAt || null,
          match.homeTeamId,
          match.awayTeamId,
          match.status,
          match.workflowStatus || match.status || "scheduled",
          match.captureMode || "admin",
          match.currentReportId || "",
          match.publishedAt || null,
          match.finalizedAt || null,
          match.homeGoals,
          match.awayGoals,
          match.observations || "",
          match.resolutionType || "normal",
          match.resolutionNote || null,
          match.centralRefereeUserId || null,
          match.assistantReferee1UserId || null,
          match.assistantReferee2UserId || null,
          match.fourthRefereeUserId || null
        ]), { dateColumns: ["date", "original_date"] });

      await insertRows(client, "match_events", ["match_id", "local_uuid", "type", "player_id", "secondary_player_id", "assist_player_id", "team_id", "event_team_side", "subtype", "period", "minute", "minute_label", "second", "suspension_matches", "suspension_indefinite", "disciplinary_pending", "reason", "metadata_json", "is_official", "sync_status", "created_by_user_id", "created_at", "updated_at", "version"], league.matches.flatMap((match) => (
        (match.events || []).map((event) => [
          match.id,
          event.localUuid || "",
          event.type,
          event.playerId || null,
          event.secondaryPlayerId || null,
          event.assistPlayerId || null,
          event.teamId || null,
          event.eventTeamSide || "",
          event.subtype || "",
          event.period || "",
          event.minute === "" || event.minute === undefined ? null : event.minute,
          event.minuteLabel || "",
          event.second || null,
          event.suspensionMatches,
          toBoolean(event.suspensionIndefinite),
          toBoolean(event.disciplinaryPending),
          event.reason,
          JSON.stringify(event.metadata || {}),
          event.isOfficial !== false,
          event.syncStatus || "synced",
          event.createdByUserId || null,
          event.createdAt || null,
          event.updatedAt || null,
          event.version || 1
        ])
      )));

      await insertRows(client, "match_rosters", ["id", "league_id", "match_id", "team_id", "submitted_by_user_id", "captain_player_id", "goalkeeper_player_id", "captain_pin", "players_json", "starters_json", "substitutes_json", "lineup_json", "status", "notes", "submitted_at", "updated_at", "version"], (league.matchRosters || []).map((roster) => [
        roster.id,
        league.id,
        roster.matchId,
        roster.teamId,
        roster.submittedByUserId || null,
        roster.captainPlayerId || null,
        roster.goalkeeperPlayerId || null,
        roster.captainPin || "",
        JSON.stringify(roster.players || []),
        JSON.stringify(roster.starters || []),
        JSON.stringify(roster.substitutes || []),
        JSON.stringify(roster.lineup || {}),
        roster.status || "submitted",
        roster.notes || "",
        roster.submittedAt || new Date().toISOString(),
        roster.updatedAt || roster.submittedAt || new Date().toISOString(),
        roster.version || 1
      ]));

      await insertRows(client, "match_participations", [
        "id", "league_id", "match_id", "team_id", "status", "captain_player_id",
        "submitted_by_user_id", "submitted_at", "locked_at", "corrected_by_user_id",
        "corrected_at", "correction_reason", "source", "metadata_json", "active",
        "version", "created_at", "updated_at"
      ], (league.matchParticipations || []).map((participation) => [
        participation.id,
        league.id,
        participation.matchId,
        participation.teamId,
        participation.status || "submitted",
        participation.captainPlayerId || null,
        participation.submittedByUserId || null,
        participation.submittedAt || new Date().toISOString(),
        participation.lockedAt || participation.submittedAt || new Date().toISOString(),
        participation.correctedByUserId || null,
        participation.correctedAt || null,
        participation.correctionReason || "",
        participation.source || "delegate_portal",
        JSON.stringify(participation.metadata || {}),
        participation.active !== false,
        participation.version || 1,
        participation.createdAt || participation.submittedAt || new Date().toISOString(),
        participation.updatedAt || participation.submittedAt || new Date().toISOString()
      ]));

      await insertRows(client, "match_participation_players", [
        "id", "match_participation_id", "player_id", "player_name_snapshot",
        "player_number_snapshot", "player_photo_snapshot", "created_at"
      ], (league.matchParticipations || []).flatMap((participation) => (
        (participation.players || []).map((player) => [
          player.id || `match-participation-player-${participation.id}-${player.playerId}`,
          participation.id,
          player.playerId,
          player.playerNameSnapshot || "",
          player.playerNumberSnapshot || "",
          player.playerPhotoSnapshot || "",
          player.createdAt || participation.submittedAt || new Date().toISOString()
        ])
      )));
    }

    const userIds = new Set((await query(client, "SELECT id FROM users")).rows.map((user) => user.id));
    const matchIds = new Set((await query(client, "SELECT id FROM matches")).rows.map((match) => match.id));
    const teamIds = new Set((await query(client, "SELECT id FROM teams")).rows.map((team) => team.id));
    const playerIds = new Set((await query(client, "SELECT id FROM players")).rows.map((player) => player.id));
    const rosterIds = new Set((await query(client, "SELECT id FROM match_rosters")).rows.map((roster) => roster.id));
    const participationIds = new Set((await query(client, "SELECT id FROM match_participations")).rows.map((participation) => participation.id));
    const restoredSessionIds = new Set();
    const restoredReportIds = new Set();

    await insertRows(client, "match_participations", [
      "id", "league_id", "match_id", "team_id", "status", "captain_player_id",
      "submitted_by_user_id", "submitted_at", "locked_at", "corrected_by_user_id",
      "corrected_at", "correction_reason", "source", "metadata_json", "active",
      "version", "created_at", "updated_at"
    ], preservedMatchParticipations
      .filter((participation) => nextLeagueIds.has(participation.league_id) && matchIds.has(participation.match_id) && teamIds.has(participation.team_id))
      .filter((participation) => !participationIds.has(participation.id))
      .map((participation) => {
        participationIds.add(participation.id);
        return [
          participation.id,
          participation.league_id,
          participation.match_id,
          participation.team_id,
          participation.status || "submitted",
          participation.captain_player_id && playerIds.has(participation.captain_player_id) ? participation.captain_player_id : null,
          participation.submitted_by_user_id && userIds.has(participation.submitted_by_user_id) ? participation.submitted_by_user_id : null,
          participation.submitted_at || new Date().toISOString(),
          participation.locked_at || participation.submitted_at || new Date().toISOString(),
          participation.corrected_by_user_id && userIds.has(participation.corrected_by_user_id) ? participation.corrected_by_user_id : null,
          participation.corrected_at || null,
          participation.correction_reason || "",
          participation.source || "delegate_portal",
          toJsonValue(participation.metadata_json, {}),
          participation.active !== false,
          Number(participation.version || 1),
          participation.created_at || participation.submitted_at || new Date().toISOString(),
          participation.updated_at || participation.submitted_at || new Date().toISOString()
        ];
      }));

    await insertRows(client, "match_participation_players", [
      "id", "match_participation_id", "player_id", "player_name_snapshot",
      "player_number_snapshot", "player_photo_snapshot", "created_at"
    ], preservedMatchParticipationPlayers
      .filter((player) => participationIds.has(player.match_participation_id) && playerIds.has(player.player_id))
      .map((player) => [
        player.id,
        player.match_participation_id,
        player.player_id,
        player.player_name_snapshot || "",
        player.player_number_snapshot || "",
        player.player_photo_snapshot || "",
        player.created_at || new Date().toISOString()
      ]));

    await insertRows(client, "match_team_pins", [
      "id", "league_id", "match_id", "team_id", "roster_id", "pin_hash", "pin_salt", "status",
      "attempts", "locked_until", "generated_by_user_id", "generated_at", "revealed_by_user_id",
      "revealed_at", "invalidated_at", "used_at", "signed_at", "created_at", "updated_at"
    ], preservedMatchTeamPins
      .filter((pin) => nextLeagueIds.has(pin.league_id) && matchIds.has(pin.match_id) && teamIds.has(pin.team_id))
      .map((pin) => [
        pin.id,
        pin.league_id,
        pin.match_id,
        pin.team_id,
        pin.roster_id && rosterIds.has(pin.roster_id) ? pin.roster_id : null,
        pin.pin_hash,
        pin.pin_salt || null,
        pin.status || "active",
        Number(pin.attempts || 0),
        pin.locked_until || null,
        pin.generated_by_user_id && userIds.has(pin.generated_by_user_id) ? pin.generated_by_user_id : null,
        pin.generated_at || new Date().toISOString(),
        pin.revealed_by_user_id && userIds.has(pin.revealed_by_user_id) ? pin.revealed_by_user_id : null,
        pin.revealed_at || null,
        pin.invalidated_at || null,
        pin.used_at || null,
        pin.signed_at || null,
        pin.created_at || new Date().toISOString(),
        pin.updated_at || new Date().toISOString()
      ]));

    await insertRows(client, "match_sessions", [
      "id", "league_id", "match_id", "referee_user_id", "capture_mode", "status", "period",
      "started_at", "paused_at", "saved_at", "resumed_at", "finished_at", "suspended_at",
      "suspension_reason", "clock_state_json", "metadata_json", "created_at", "updated_at"
    ], preservedMatchSessions
      .filter((session) => nextLeagueIds.has(session.league_id) && matchIds.has(session.match_id))
      .map((session) => {
        restoredSessionIds.add(session.id);
        return [
          session.id,
          session.league_id,
          session.match_id,
          session.referee_user_id && userIds.has(session.referee_user_id) ? session.referee_user_id : null,
          session.capture_mode || "live",
          session.status || "draft",
          session.period || "",
          session.started_at || null,
          session.paused_at || null,
          session.saved_at || null,
          session.resumed_at || null,
          session.finished_at || null,
          session.suspended_at || null,
          session.suspension_reason || "",
          toJsonValue(session.clock_state_json, {}),
          toJsonValue(session.metadata_json, {}),
          session.created_at || new Date().toISOString(),
          session.updated_at || new Date().toISOString()
        ];
      }));

    await insertRows(client, "match_reports", [
      "id", "league_id", "match_id", "session_id", "generated_by_user_id", "capture_mode", "status",
      "version", "payload_json", "home_goals", "away_goals", "generated_at", "finalized_at",
      "published_at", "created_at", "updated_at"
    ], preservedMatchReports
      .filter((report) => nextLeagueIds.has(report.league_id) && matchIds.has(report.match_id))
      .map((report) => {
        restoredReportIds.add(report.id);
        return [
          report.id,
          report.league_id,
          report.match_id,
          report.session_id && restoredSessionIds.has(report.session_id) ? report.session_id : null,
          report.generated_by_user_id && userIds.has(report.generated_by_user_id) ? report.generated_by_user_id : null,
          report.capture_mode || "admin",
          report.status || "draft",
          Number(report.version || 1),
          toJsonValue(report.payload_json, {}),
          report.home_goals ?? null,
          report.away_goals ?? null,
          report.generated_at || null,
          report.finalized_at || null,
          report.published_at || null,
          report.created_at || new Date().toISOString(),
          report.updated_at || new Date().toISOString()
        ];
      }));

    await insertRows(client, "match_report_signatures", [
      "id", "report_id", "league_id", "match_id", "team_id", "captain_player_id",
      "signed_by_user_id", "method", "status", "signed_at", "act_version", "act_hash",
      "act_snapshot_json", "invalidated_at", "ip_address", "user_agent", "metadata_json"
    ], preservedMatchReportSignatures
      .filter((signature) => restoredReportIds.has(signature.report_id))
      .filter((signature) => nextLeagueIds.has(signature.league_id) && matchIds.has(signature.match_id) && teamIds.has(signature.team_id))
      .map((signature) => [
        signature.id,
        signature.report_id,
        signature.league_id,
        signature.match_id,
        signature.team_id,
        signature.captain_player_id && playerIds.has(signature.captain_player_id) ? signature.captain_player_id : null,
        signature.signed_by_user_id && userIds.has(signature.signed_by_user_id) ? signature.signed_by_user_id : null,
        signature.method || "pin",
        signature.status || "signed",
        signature.signed_at || new Date().toISOString(),
        signature.act_version ?? null,
        signature.act_hash || "",
        toJsonValue(signature.act_snapshot_json, {}),
        signature.invalidated_at || null,
        signature.ip_address || "",
        signature.user_agent || "",
        toJsonValue(signature.metadata_json, {})
      ]));

    await insertRows(client, "match_report_disputes", [
      "id", "report_id", "league_id", "match_id", "team_id", "requested_by_user_id",
      "reason", "status", "created_at", "resolved_at", "resolved_by_user_id", "resolution_note"
    ], preservedMatchReportDisputes
      .filter((dispute) => restoredReportIds.has(dispute.report_id))
      .filter((dispute) => nextLeagueIds.has(dispute.league_id) && matchIds.has(dispute.match_id))
      .map((dispute) => [
        dispute.id,
        dispute.report_id,
        dispute.league_id,
        dispute.match_id,
        dispute.team_id && teamIds.has(dispute.team_id) ? dispute.team_id : null,
        dispute.requested_by_user_id && userIds.has(dispute.requested_by_user_id) ? dispute.requested_by_user_id : null,
        dispute.reason || "",
        dispute.status || "open",
        dispute.created_at || new Date().toISOString(),
        dispute.resolved_at || null,
        dispute.resolved_by_user_id && userIds.has(dispute.resolved_by_user_id) ? dispute.resolved_by_user_id : null,
        dispute.resolution_note || ""
      ]));

    await insertRows(client, "match_sync_queue", [
      "id", "league_id", "match_id", "session_id", "client_event_id", "created_by_user_id",
      "payload_json", "status", "attempts", "last_error", "created_at", "synced_at"
    ], preservedMatchSyncQueue
      .filter((queued) => nextLeagueIds.has(queued.league_id) && matchIds.has(queued.match_id))
      .map((queued) => [
        queued.id,
        queued.league_id,
        queued.match_id,
        queued.session_id && restoredSessionIds.has(queued.session_id) ? queued.session_id : null,
        queued.client_event_id || "",
        queued.created_by_user_id && userIds.has(queued.created_by_user_id) ? queued.created_by_user_id : null,
        toJsonValue(queued.payload_json, {}),
        queued.status || "pending",
        Number(queued.attempts || 0),
        queued.last_error || "",
        queued.created_at || new Date().toISOString(),
        queued.synced_at || null
      ]));

    const restoredAccessIds = new Set();
    const restoredAssignmentIds = new Set();

    await insertRows(client, "user_accesses", ["id", "user_id", "league_id", "team_id", "role", "permissions_json", "status", "created_at", "updated_at"], preservedUserAccesses
      .filter((access) => userIds.has(access.user_id))
      .filter((access) => !access.league_id || nextLeagueIds.has(access.league_id))
      .filter((access) => !access.team_id || nextTeamIds.has(access.team_id))
      .map((access) => {
        restoredAccessIds.add(access.id);
        return [
          access.id,
          access.user_id,
          access.league_id || null,
          access.team_id || null,
          access.role,
          toJsonValue(access.permissions_json, []),
          access.status || "active",
          access.created_at || new Date().toISOString(),
          access.updated_at || new Date().toISOString()
        ];
      }));

    await insertRows(client, "team_roster_permissions", ["team_id", "league_id", "registration_enabled", "enabled_until", "notes", "updated_at"], preservedTeamRosterPermissions
      .filter((permission) => nextLeagueIds.has(permission.league_id) && nextTeamIds.has(permission.team_id))
      .map((permission) => [
        permission.team_id,
        permission.league_id,
        Boolean(permission.registration_enabled),
        permission.enabled_until || null,
        permission.notes || "",
        permission.updated_at || new Date().toISOString()
      ]));

    const assignmentsToRestore = preservedTeamAssignments
      .filter((assignment) => nextLeagueIds.has(assignment.league_id) && nextTeamIds.has(assignment.team_id) && userIds.has(assignment.user_id));
    await insertRows(client, "team_user_assignments", ["id", "league_id", "team_id", "user_id", "role", "status", "created_at"], assignmentsToRestore.map((assignment) => {
      restoredAssignmentIds.add(assignment.id);
      return [
        assignment.id,
        assignment.league_id,
        assignment.team_id,
        assignment.user_id,
        assignment.role || "delegate",
        assignment.status || "active",
        assignment.created_at || new Date().toISOString()
      ];
    }));

    await insertRows(client, "team_delegate_activation_tokens", ["id", "user_id", "assignment_id", "token_hash", "expires_at", "used_at", "revoked_at", "created_at"], preservedDelegateActivationTokens
      .filter((token) => userIds.has(token.user_id) && restoredAssignmentIds.has(token.assignment_id))
      .map((token) => [
        token.id,
        token.user_id,
        token.assignment_id,
        token.token_hash,
        token.expires_at,
        token.used_at || null,
        token.revoked_at || null,
        token.created_at || new Date().toISOString()
      ]));

    await insertRows(client, "admin_activation_tokens", ["id", "user_id", "access_id", "token_hash", "expires_at", "used_at", "revoked_at", "created_at"], preservedAdminActivationTokens
      .filter((token) => userIds.has(token.user_id))
      .filter((token) => !token.access_id || restoredAccessIds.has(token.access_id))
      .map((token) => [
        token.id,
        token.user_id,
        token.access_id || null,
        token.token_hash,
        token.expires_at,
        token.used_at || null,
        token.revoked_at || null,
        token.created_at || new Date().toISOString()
      ]));

    for (const assignment of userLeagueAssignments) {
      if (assignment.league_id && nextLeagueIds.has(assignment.league_id)) {
        await query(client, "UPDATE users SET league_id = $1 WHERE id = $2", [assignment.league_id, assignment.id]);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await seedPostgresUsers();
  return normalized;
}

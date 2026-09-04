import "./env.js";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCompetitionForLeague, normalizeStore } from "../src/lib/domain.js";
import { hashPassword } from "./password.js";
import { ROOT_DIR } from "./env.js";
import { runtimeConfig } from "./runtimeConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configuredDbPath = process.env.DB_PATH || "data/liga-futbol.sqlite";
const DB_PATH = path.isAbsolute(configuredDbPath) ? configuredDbPath : path.join(ROOT_DIR, configuredDbPath);
const DATA_DIR = path.dirname(DB_PATH);
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

async function loadDemoSeedStore() {
  const { seedData } = await import("../src/data/seedData.js");
  return normalizeStore(seedData);
}

export async function initializeDatabase() {
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  runMigrations();
  const count = db.prepare("SELECT COUNT(*) AS total FROM leagues").get().total;
  if (count === 0 && runtimeConfig.seedDemoData) importStore(await loadDemoSeedStore());
  seedUsers();
}

function runMigrations() {
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!userColumns.includes("password_hash")) {
    db.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT").run();
  }
  if (!userColumns.includes("failed_login_count")) {
    db.prepare("ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!userColumns.includes("locked_until")) {
    db.prepare("ALTER TABLE users ADD COLUMN locked_until TEXT").run();
  }
  if (!userColumns.includes("last_failed_login_at")) {
    db.prepare("ALTER TABLE users ADD COLUMN last_failed_login_at TEXT").run();
  }
  if (!userColumns.includes("phone")) {
    db.prepare("ALTER TABLE users ADD COLUMN phone TEXT").run();
  }

  const leagueColumns = db.prepare("PRAGMA table_info(leagues)").all().map((column) => column.name);
  if (!leagueColumns.includes("membership_notes")) {
    db.prepare("ALTER TABLE leagues ADD COLUMN membership_notes TEXT").run();
  }
  if (!leagueColumns.includes("current_competition_id")) {
    db.prepare("ALTER TABLE leagues ADD COLUMN current_competition_id TEXT").run();
  }
  if (!leagueColumns.includes("public_visibility")) {
    db.prepare("ALTER TABLE leagues ADD COLUMN public_visibility TEXT NOT NULL DEFAULT 'visible'").run();
  }

  const ruleColumns = db.prepare("PRAGMA table_info(league_rules)").all().map((column) => column.name);
  if (!ruleColumns.includes("default_red_suspension_matches")) {
    db.prepare("ALTER TABLE league_rules ADD COLUMN default_red_suspension_matches INTEGER NOT NULL DEFAULT 1").run();
  }
  if (!ruleColumns.includes("discipline_scope")) {
    db.prepare("ALTER TABLE league_rules ADD COLUMN discipline_scope TEXT NOT NULL DEFAULT 'competition'").run();
  }
  if (!ruleColumns.includes("playoff_qualifiers")) {
    db.prepare("ALTER TABLE league_rules ADD COLUMN playoff_qualifiers INTEGER NOT NULL DEFAULT 8").run();
  }
  if (!ruleColumns.includes("minimum_playoff_appearances")) {
    db.prepare("ALTER TABLE league_rules ADD COLUMN minimum_playoff_appearances INTEGER NOT NULL DEFAULT 0").run();
  }

  const matchEventColumns = db.prepare("PRAGMA table_info(match_events)").all().map((column) => column.name);
  if (!matchEventColumns.includes("suspension_indefinite")) {
    db.prepare("ALTER TABLE match_events ADD COLUMN suspension_indefinite INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!matchEventColumns.includes("minute_label")) {
    db.prepare("ALTER TABLE match_events ADD COLUMN minute_label TEXT").run();
  }
  if (!matchEventColumns.includes("disciplinary_pending")) {
    db.prepare("ALTER TABLE match_events ADD COLUMN disciplinary_pending INTEGER NOT NULL DEFAULT 0").run();
  }
  [
    ["local_uuid", "TEXT"],
    ["secondary_player_id", "TEXT REFERENCES players(id) ON DELETE SET NULL"],
    ["assist_player_id", "TEXT REFERENCES players(id) ON DELETE SET NULL"],
    ["event_team_side", "TEXT"],
    ["subtype", "TEXT"],
    ["period", "TEXT"],
    ["second", "INTEGER"],
    ["metadata_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["is_official", "INTEGER NOT NULL DEFAULT 1"],
    ["sync_status", "TEXT NOT NULL DEFAULT 'synced'"],
    ["created_by_user_id", "TEXT REFERENCES users(id) ON DELETE SET NULL"],
    ["created_at", "TEXT"],
    ["updated_at", "TEXT"],
    ["version", "INTEGER NOT NULL DEFAULT 1"]
  ].forEach(([name, definition]) => {
    if (!matchEventColumns.includes(name)) {
      db.prepare(`ALTER TABLE match_events ADD COLUMN ${name} ${definition}`).run();
    }
  });

  const sponsorColumns = db.prepare("PRAGMA table_info(sponsors)").all().map((column) => column.name);
  if (!sponsorColumns.includes("image_url")) {
    db.prepare("ALTER TABLE sponsors ADD COLUMN image_url TEXT").run();
  }
  if (!sponsorColumns.includes("link_url")) {
    db.prepare("ALTER TABLE sponsors ADD COLUMN link_url TEXT").run();
  }
  if (!sponsorColumns.includes("sort_order")) {
    db.prepare("ALTER TABLE sponsors ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!sponsorColumns.includes("notes")) {
    db.prepare("ALTER TABLE sponsors ADD COLUMN notes TEXT").run();
  }

  db.prepare(`
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
      created_at TEXT
    )
  `).run();

  const matchColumns = db.prepare("PRAGMA table_info(matches)").all().map((column) => column.name);
  if (!matchColumns.includes("competition_id")) {
    db.prepare("ALTER TABLE matches ADD COLUMN competition_id TEXT").run();
  }
  if (!matchColumns.includes("stage")) {
    db.prepare("ALTER TABLE matches ADD COLUMN stage TEXT NOT NULL DEFAULT 'regular'").run();
  }
  if (!matchColumns.includes("playoff_round")) {
    db.prepare("ALTER TABLE matches ADD COLUMN playoff_round TEXT").run();
  }
  if (!matchColumns.includes("playoff_leg")) {
    db.prepare("ALTER TABLE matches ADD COLUMN playoff_leg TEXT").run();
  }
  if (!matchColumns.includes("aggregate_home")) {
    db.prepare("ALTER TABLE matches ADD COLUMN aggregate_home INTEGER").run();
  }
  if (!matchColumns.includes("aggregate_away")) {
    db.prepare("ALTER TABLE matches ADD COLUMN aggregate_away INTEGER").run();
  }
  if (!matchColumns.includes("extra_time_home_goals")) {
    db.prepare("ALTER TABLE matches ADD COLUMN extra_time_home_goals INTEGER").run();
  }
  if (!matchColumns.includes("extra_time_away_goals")) {
    db.prepare("ALTER TABLE matches ADD COLUMN extra_time_away_goals INTEGER").run();
  }
  if (!matchColumns.includes("penalty_home_goals")) {
    db.prepare("ALTER TABLE matches ADD COLUMN penalty_home_goals INTEGER").run();
  }
  if (!matchColumns.includes("penalty_away_goals")) {
    db.prepare("ALTER TABLE matches ADD COLUMN penalty_away_goals INTEGER").run();
  }
  if (!matchColumns.includes("observations")) {
    db.prepare("ALTER TABLE matches ADD COLUMN observations TEXT").run();
  }
  if (!matchColumns.includes("central_referee_user_id")) {
    db.prepare("ALTER TABLE matches ADD COLUMN central_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL").run();
  }
  if (!matchColumns.includes("assistant_referee1_user_id")) {
    db.prepare("ALTER TABLE matches ADD COLUMN assistant_referee1_user_id TEXT REFERENCES users(id) ON DELETE SET NULL").run();
  }
  if (!matchColumns.includes("assistant_referee2_user_id")) {
    db.prepare("ALTER TABLE matches ADD COLUMN assistant_referee2_user_id TEXT REFERENCES users(id) ON DELETE SET NULL").run();
  }
  if (!matchColumns.includes("fourth_referee_user_id")) {
    db.prepare("ALTER TABLE matches ADD COLUMN fourth_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL").run();
  }
  if (!matchColumns.includes("referee_crew_mode")) {
    db.prepare("ALTER TABLE matches ADD COLUMN referee_crew_mode TEXT").run();
  }
  [
    ["workflow_status", "TEXT NOT NULL DEFAULT 'scheduled'"],
    ["capture_mode", "TEXT NOT NULL DEFAULT 'admin'"],
    ["current_report_id", "TEXT"],
    ["published_at", "TEXT"],
    ["finalized_at", "TEXT"],
    ["schedule_note", "TEXT"],
    ["original_date", "TEXT"],
    ["original_time", "TEXT"],
    ["original_round", "INTEGER"],
    ["schedule_updated_at", "TEXT"]
  ].forEach(([name, definition]) => {
    if (!matchColumns.includes(name)) {
      db.prepare(`ALTER TABLE matches ADD COLUMN ${name} ${definition}`).run();
    }
  });

  const teamColumns = db.prepare("PRAGMA table_info(teams)").all().map((column) => column.name);
  if (teamColumns.length && !teamColumns.includes("competition_id")) {
    db.prepare("ALTER TABLE teams ADD COLUMN competition_id TEXT").run();
  }
  if (teamColumns.length && !teamColumns.includes("assistant_coach")) {
    db.prepare("ALTER TABLE teams ADD COLUMN assistant_coach TEXT").run();
  }
  if (teamColumns.length && !teamColumns.includes("address")) {
    db.prepare("ALTER TABLE teams ADD COLUMN address TEXT").run();
  }
  if (teamColumns.length && !teamColumns.includes("logo_url")) {
    db.prepare("ALTER TABLE teams ADD COLUMN logo_url TEXT").run();
  }

  const identityColumns = db.prepare("PRAGMA table_info(league_identities)").all().map((column) => column.name);
  if (identityColumns.length && !identityColumns.includes("logo_url")) {
    db.prepare("ALTER TABLE league_identities ADD COLUMN logo_url TEXT").run();
  }

  const playerColumns = db.prepare("PRAGMA table_info(players)").all().map((column) => column.name);
  if (playerColumns.length && !playerColumns.includes("competition_id")) {
    db.prepare("ALTER TABLE players ADD COLUMN competition_id TEXT").run();
  }
  if (playerColumns.length && !playerColumns.includes("photo_url")) {
    db.prepare("ALTER TABLE players ADD COLUMN photo_url TEXT").run();
  }
  if (playerColumns.length && !playerColumns.includes("photo_authorized")) {
    db.prepare("ALTER TABLE players ADD COLUMN photo_authorized INTEGER NOT NULL DEFAULT 0").run();
  }

  const sanctionColumns = db.prepare("PRAGMA table_info(player_sanctions)").all().map((column) => column.name);
  if (sanctionColumns.length && !sanctionColumns.includes("competition_id")) {
    db.prepare("ALTER TABLE player_sanctions ADD COLUMN competition_id TEXT").run();
  }
  if (sanctionColumns.length && !sanctionColumns.includes("indefinite")) {
    db.prepare("ALTER TABLE player_sanctions ADD COLUMN indefinite INTEGER NOT NULL DEFAULT 0").run();
  }

  const competitionColumns = db.prepare("PRAGMA table_info(competitions)").all().map((column) => column.name);
  if (competitionColumns.length && !competitionColumns.includes("active_round")) {
    db.prepare("ALTER TABLE competitions ADD COLUMN active_round INTEGER").run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'liga',
      season TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      active_round INTEGER,
      starts_at TEXT,
      ends_at TEXT
    );

    CREATE TABLE IF NOT EXISTS player_sanctions (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      matches INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS player_injuries (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      date TEXT,
      expected_return TEXT,
      needs_surgery INTEGER NOT NULL DEFAULT 0,
      needs_support INTEGER NOT NULL DEFAULT 0,
      support_detail TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      user_email TEXT,
      user_role TEXT,
      league_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_records (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      checksum_sha256 TEXT,
      storage_bucket TEXT,
      storage_path TEXT,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS user_accesses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      league_id TEXT REFERENCES leagues(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_activation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_id TEXT REFERENCES user_accesses(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_delegate_activation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id TEXT NOT NULL REFERENCES team_user_assignments(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referee_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      municipality TEXT NOT NULL,
      photo_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referee_activation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referee_match_sheets (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      review_note TEXT,
      submitted_at TEXT NOT NULL,
      reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS match_rosters (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      captain_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      captain_pin TEXT,
      players_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      notes TEXT,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(match_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS team_affiliations (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      source_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      target_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at TEXT,
      ends_at TEXT,
      player_numbers_json TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS discipline_links (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_ids_json TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS discipline_adjustments (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      value INTEGER NOT NULL,
      date TEXT,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS discipline_resets (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      date TEXT,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS player_appearance_adjustments (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      value INTEGER NOT NULL,
      date TEXT,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS team_user_assignments (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'delegate',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_roster_permissions (
      team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      registration_enabled INTEGER NOT NULL DEFAULT 0,
      enabled_until TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      requested_role TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      review_note TEXT,
      reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_access_id TEXT REFERENCES user_accesses(id) ON DELETE SET NULL,
      created_assignment_id TEXT REFERENCES team_user_assignments(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.prepare("CREATE INDEX IF NOT EXISTS idx_access_requests_league_status ON access_requests(league_id, status)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email)").run();

  const matchRosterColumns = db.prepare("PRAGMA table_info(match_rosters)").all().map((column) => column.name);
  if (matchRosterColumns.length && !matchRosterColumns.includes("captain_pin")) {
    db.prepare("ALTER TABLE match_rosters ADD COLUMN captain_pin TEXT").run();
  }
  [
    ["goalkeeper_player_id", "TEXT REFERENCES players(id) ON DELETE SET NULL"],
    ["starters_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["substitutes_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["lineup_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["version", "INTEGER NOT NULL DEFAULT 1"]
  ].forEach(([name, definition]) => {
    if (matchRosterColumns.length && !matchRosterColumns.includes(name)) {
      db.prepare(`ALTER TABLE match_rosters ADD COLUMN ${name} ${definition}`).run();
    }
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS match_participations (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'submitted',
      captain_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TEXT NOT NULL,
      locked_at TEXT,
      corrected_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      corrected_at TEXT,
      correction_reason TEXT,
      source TEXT NOT NULL DEFAULT 'delegate_portal',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_participation_players (
      id TEXT PRIMARY KEY,
      match_participation_id TEXT NOT NULL REFERENCES match_participations(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      player_name_snapshot TEXT NOT NULL,
      player_number_snapshot TEXT,
      player_photo_snapshot TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(match_participation_id, player_id)
    );

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
      locked_until TEXT,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      generated_at TEXT NOT NULL,
      revealed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      revealed_at TEXT,
      invalidated_at TEXT,
      used_at TEXT,
      signed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(match_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS match_sessions (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      capture_mode TEXT NOT NULL DEFAULT 'live',
      status TEXT NOT NULL DEFAULT 'draft',
      period TEXT,
      started_at TEXT,
      paused_at TEXT,
      saved_at TEXT,
      resumed_at TEXT,
      finished_at TEXT,
      suspended_at TEXT,
      suspension_reason TEXT,
      clock_state_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_session_operations (
      operation_id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES match_sessions(id) ON DELETE SET NULL,
      referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'synced',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_reports (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES match_sessions(id) ON DELETE SET NULL,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      capture_mode TEXT NOT NULL DEFAULT 'admin',
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL DEFAULT '{}',
      home_goals INTEGER,
      away_goals INTEGER,
      generated_at TEXT,
      finalized_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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
      signed_at TEXT NOT NULL,
      act_version INTEGER,
      act_hash TEXT,
      act_snapshot_json TEXT NOT NULL DEFAULT '{}',
      invalidated_at TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(report_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS match_report_disputes (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES match_reports(id) ON DELETE CASCADE,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT
    );

    CREATE TABLE IF NOT EXISTS match_sync_queue (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES match_sessions(id) ON DELETE CASCADE,
      client_event_id TEXT,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_match_team_pins_match ON match_team_pins(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_sessions_match ON match_sessions(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_session_operations_match ON match_session_operations(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_reports_match ON match_reports(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_reports_status ON match_reports(status);
    CREATE INDEX IF NOT EXISTS idx_match_report_signatures_report ON match_report_signatures(report_id);
    CREATE INDEX IF NOT EXISTS idx_match_sync_queue_match_status ON match_sync_queue(match_id, status);
    CREATE INDEX IF NOT EXISTS idx_match_participations_match_team ON match_participations(match_id, team_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_match_participations_active_team ON match_participations(match_id, team_id) WHERE active = 1;
    CREATE INDEX IF NOT EXISTS idx_match_participation_players_report ON match_participation_players(match_participation_id);
  `);

  const matchReportSignatureColumns = db.prepare("PRAGMA table_info(match_report_signatures)").all().map((column) => column.name);
  [
    ["act_version", "INTEGER"],
    ["act_hash", "TEXT"],
    ["act_snapshot_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["invalidated_at", "TEXT"]
  ].forEach(([name, definition]) => {
    if (matchReportSignatureColumns.length && !matchReportSignatureColumns.includes(name)) {
      db.prepare(`ALTER TABLE match_report_signatures ADD COLUMN ${name} ${definition}`).run();
    }
  });

  seedMissingCompetitions();
}

function seedMissingCompetitions() {
  const leagues = db.prepare("SELECT id, name, city, season, current_competition_id FROM leagues").all();

  for (const league of leagues) {
    const existing = db.prepare("SELECT id FROM competitions WHERE league_id = ? ORDER BY id LIMIT 1").get(league.id);
    const competition = existing || defaultCompetitionForLeague(league);

    if (!existing) {
      db.prepare(`
        INSERT INTO competitions (id, league_id, name, type, season, status, active_round, starts_at, ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        competition.id,
        league.id,
        competition.name,
        competition.type,
        competition.season,
        competition.status,
        null,
        competition.startsAt || "",
        competition.endsAt || ""
      );
    }

    const currentCompetitionId = league.current_competition_id || competition.id;
    db.prepare("UPDATE leagues SET current_competition_id = ? WHERE id = ?").run(currentCompetitionId, league.id);
    db.prepare("UPDATE teams SET competition_id = ? WHERE league_id = ? AND competition_id IS NULL").run(currentCompetitionId, league.id);
    db.prepare("UPDATE players SET competition_id = ? WHERE league_id = ? AND competition_id IS NULL").run(currentCompetitionId, league.id);
    db.prepare("UPDATE matches SET competition_id = ? WHERE league_id = ? AND competition_id IS NULL").run(currentCompetitionId, league.id);
    db.prepare("UPDATE player_sanctions SET competition_id = ? WHERE league_id = ? AND competition_id IS NULL").run(currentCompetitionId, league.id);
    db.prepare("UPDATE player_injuries SET competition_id = ? WHERE league_id = ? AND competition_id IS NULL").run(currentCompetitionId, league.id);
  }
}

function seedUsers() {
  if (!runtimeConfig.seedDemoUsers) return;

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
    if (user.leagueId && !db.prepare("SELECT id FROM leagues WHERE id = ?").get(user.leagueId)) continue;

    db.prepare(`
      INSERT INTO users (id, league_id, name, email, role, status, password_hash)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT(email) DO NOTHING
    `).run(user.id, user.leagueId, user.name, user.email, user.role, hashPassword(user.password));
  }
}

export function getStore() {
  const leagues = db.prepare("SELECT * FROM leagues ORDER BY name").all().map((leagueRow) => {
    const identity = db.prepare("SELECT * FROM league_identities WHERE league_id = ?").get(leagueRow.id) || {};
    const rules = db.prepare("SELECT * FROM league_rules WHERE league_id = ?").get(leagueRow.id) || {};
    const highlights = db.prepare("SELECT body FROM league_highlights WHERE league_id = ? ORDER BY sort_order, id").all(leagueRow.id).map((row) => row.body);
    const announcements = db.prepare("SELECT * FROM league_announcements WHERE league_id = ? ORDER BY date DESC, title").all(leagueRow.id).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      status: row.status,
      date: row.date
    }));
    const competitions = db.prepare("SELECT * FROM competitions WHERE league_id = ? ORDER BY status, season DESC, name").all(leagueRow.id).map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      season: row.season,
      status: row.status,
      activeRound: row.active_round,
      startsAt: row.starts_at,
      endsAt: row.ends_at
    }));
    const teams = db.prepare("SELECT * FROM teams WHERE league_id = ? ORDER BY name").all(leagueRow.id).map((row) => ({
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
    const players = db.prepare("SELECT * FROM players WHERE league_id = ? ORDER BY team_id, number, name").all(leagueRow.id).map((row) => ({
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
    const sanctions = db.prepare("SELECT * FROM player_sanctions WHERE league_id = ? ORDER BY date DESC, id DESC").all(leagueRow.id).map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      type: row.type,
      matches: row.matches,
      indefinite: Boolean(row.indefinite),
      reason: row.reason,
      date: row.date,
      status: row.status,
      notes: row.notes
    }));
    const injuries = db.prepare("SELECT * FROM player_injuries WHERE league_id = ? ORDER BY date DESC, id DESC").all(leagueRow.id).map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      type: row.type,
      date: row.date,
      expectedReturn: row.expected_return,
      needsSurgery: Boolean(row.needs_surgery),
      needsSupport: Boolean(row.needs_support),
      supportDetail: row.support_detail,
      status: row.status,
      notes: row.notes
    }));
    const teamAffiliations = db.prepare("SELECT * FROM team_affiliations WHERE league_id = ? ORDER BY id").all(leagueRow.id).map((row) => ({
      id: row.id,
      sourceTeamId: row.source_team_id,
      targetTeamId: row.target_team_id,
      status: row.status,
      startsAt: row.starts_at || "",
      endsAt: row.ends_at || "",
      playerNumbers: row.player_numbers_json ? JSON.parse(row.player_numbers_json) : {},
      notes: row.notes || ""
    }));
    const disciplineLinks = db.prepare("SELECT * FROM discipline_links WHERE league_id = ? ORDER BY id").all(leagueRow.id).map((row) => ({
      id: row.id,
      playerIds: row.player_ids_json ? JSON.parse(row.player_ids_json) : [],
      notes: row.notes || ""
    }));
    const disciplineAdjustments = db.prepare("SELECT * FROM discipline_adjustments WHERE league_id = ? ORDER BY date DESC, id DESC").all(leagueRow.id).map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      value: row.value,
      date: row.date,
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const disciplineResets = db.prepare("SELECT * FROM discipline_resets WHERE league_id = ? ORDER BY date DESC, id DESC").all(leagueRow.id).map((row) => ({
      id: row.id,
      playerId: row.player_id,
      date: row.date,
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const appearanceAdjustments = db.prepare("SELECT * FROM player_appearance_adjustments WHERE league_id = ? ORDER BY date DESC, id DESC").all(leagueRow.id).map((row) => ({
      id: row.id,
      playerId: row.player_id,
      value: row.value,
      date: row.date,
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const sponsors = db.prepare("SELECT * FROM sponsors WHERE league_id = ? ORDER BY sort_order, name").all(leagueRow.id).map((row) => ({
      id: row.id,
      name: row.name,
      placement: row.placement,
      status: row.status,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      sortOrder: row.sort_order,
      notes: row.notes
    }));
    const media = db.prepare("SELECT * FROM league_media WHERE league_id = ? ORDER BY sort_order, created_at DESC, title").all(leagueRow.id).map((row) => ({
      id: row.id,
      competitionId: row.competition_id || "",
      type: row.type || "gallery",
      title: row.title,
      caption: row.caption || "",
      status: row.status || "active",
      imageUrl: row.image_url,
      sortOrder: row.sort_order,
      createdAt: row.created_at || ""
    }));
    const matches = db.prepare("SELECT * FROM matches WHERE league_id = ? ORDER BY round, date, time").all(leagueRow.id).map((row) => ({
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
      date: row.date,
      time: row.time,
      venue: row.venue,
      scheduleNote: row.schedule_note || "",
      originalDate: row.original_date || "",
      originalTime: row.original_time || "",
      originalRound: row.original_round || "",
      scheduleUpdatedAt: row.schedule_updated_at || "",
      homeTeamId: row.home_team_id,
      awayTeamId: row.away_team_id,
      status: row.status,
      workflowStatus: row.workflow_status || row.status || "scheduled",
      captureMode: row.capture_mode || "admin",
      currentReportId: row.current_report_id || "",
      publishedAt: row.published_at || "",
      finalizedAt: row.finalized_at || "",
      homeGoals: row.home_goals,
      awayGoals: row.away_goals,
      observations: row.observations,
      resolutionType: row.resolution_type,
      resolutionNote: row.resolution_note,
      centralRefereeUserId: row.central_referee_user_id || "",
      assistantReferee1UserId: row.assistant_referee1_user_id || "",
      assistantReferee2UserId: row.assistant_referee2_user_id || "",
      fourthRefereeUserId: row.fourth_referee_user_id || "",
      refereeCrewMode: row.referee_crew_mode || "",
      events: db.prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY id").all(row.id).map((event) => ({
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
        suspensionIndefinite: Boolean(event.suspension_indefinite),
        disciplinaryPending: Boolean(event.disciplinary_pending),
        reason: event.reason,
        metadata: event.metadata_json ? JSON.parse(event.metadata_json) : {},
        isOfficial: event.is_official !== 0,
        syncStatus: event.sync_status || "synced",
        createdByUserId: event.created_by_user_id || "",
        createdAt: event.created_at || "",
        updatedAt: event.updated_at || "",
        version: event.version || 1
      }))
    }));
    const matchRosters = db.prepare("SELECT * FROM match_rosters WHERE league_id = ? ORDER BY submitted_at DESC").all(leagueRow.id).map((row) => ({
      id: row.id,
      matchId: row.match_id,
      teamId: row.team_id,
      submittedByUserId: row.submitted_by_user_id || "",
      captainPlayerId: row.captain_player_id || "",
      goalkeeperPlayerId: row.goalkeeper_player_id || "",
      captainPin: row.captain_pin || "",
      players: row.players_json ? JSON.parse(row.players_json) : [],
      starters: row.starters_json ? JSON.parse(row.starters_json) : [],
      substitutes: row.substitutes_json ? JSON.parse(row.substitutes_json) : [],
      lineup: row.lineup_json ? JSON.parse(row.lineup_json) : {},
      status: row.status,
      notes: row.notes || "",
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      version: row.version || 1
    }));
    const participationRows = db.prepare("SELECT * FROM match_participations WHERE league_id = ? ORDER BY submitted_at DESC, version DESC").all(leagueRow.id);
    const matchParticipations = participationRows.map((row) => ({
      id: row.id,
      matchId: row.match_id,
      teamId: row.team_id,
      status: row.status || "submitted",
      captainPlayerId: row.captain_player_id || "",
      submittedByUserId: row.submitted_by_user_id || "",
      submittedAt: row.submitted_at || "",
      lockedAt: row.locked_at || "",
      correctedByUserId: row.corrected_by_user_id || "",
      correctedAt: row.corrected_at || "",
      correctionReason: row.correction_reason || "",
      source: row.source || "delegate_portal",
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      active: row.active !== 0,
      version: row.version || 1,
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
      players: db.prepare("SELECT * FROM match_participation_players WHERE match_participation_id = ? ORDER BY created_at ASC").all(row.id).map((playerRow) => ({
        id: playerRow.id,
        playerId: playerRow.player_id,
        playerNameSnapshot: playerRow.player_name_snapshot || "",
        playerNumberSnapshot: playerRow.player_number_snapshot || "",
        playerPhotoSnapshot: playerRow.player_photo_snapshot || "",
        createdAt: playerRow.created_at || ""
      }))
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
      renewalDate: leagueRow.renewal_date,
      adBanner: leagueRow.ad_banner,
      membershipNotes: leagueRow.membership_notes,
      identity: {
        logoUrl: identity.logo_url || "",
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
  });

  return normalizeStore({
    currentLeagueId: leagues[0]?.id || "",
    leagues
  });
}

export function importStore(store) {
  const normalized = normalizeStore(store);
  const userLeagueAssignments = db.prepare("SELECT id, league_id FROM users").all();
  const preservedTeamAssignments = db.prepare(`
    SELECT id, league_id, team_id, user_id, role, status, created_at
    FROM team_user_assignments
  `).all();
  const preservedTeamRosterPermissions = db.prepare(`
    SELECT team_id, league_id, registration_enabled, enabled_until, notes, updated_at
    FROM team_roster_permissions
  `).all();
  const preservedUserAccesses = db.prepare(`
    SELECT id, user_id, league_id, team_id, role, permissions_json, status, created_at, updated_at
    FROM user_accesses
  `).all();
  const preservedAdminActivationTokens = db.prepare(`
    SELECT id, user_id, access_id, token_hash, expires_at, used_at, revoked_at, created_at
    FROM admin_activation_tokens
  `).all();
  const preservedDelegateActivationTokens = db.prepare(`
    SELECT id, user_id, assignment_id, token_hash, expires_at, used_at, revoked_at, created_at
    FROM team_delegate_activation_tokens
  `).all();
  const preservedMatchTeamPins = db.prepare("SELECT * FROM match_team_pins").all();
  const preservedMatchSessions = db.prepare("SELECT * FROM match_sessions").all();
  const preservedMatchReports = db.prepare("SELECT * FROM match_reports").all();
  const preservedMatchReportSignatures = db.prepare("SELECT * FROM match_report_signatures").all();
  const preservedMatchReportDisputes = db.prepare("SELECT * FROM match_report_disputes").all();
  const preservedMatchSyncQueue = db.prepare("SELECT * FROM match_sync_queue").all();
  const preservedMatchParticipations = db.prepare("SELECT * FROM match_participations").all();
  const preservedMatchParticipationPlayers = db.prepare("SELECT * FROM match_participation_players").all();
  const nextLeagueIds = new Set(normalized.leagues.map((league) => league.id));
  const nextTeamIds = new Set(normalized.leagues.flatMap((league) => (league.teams || []).map((team) => team.id)));
  const removedLeagueIds = new Set(
    userLeagueAssignments
      .map((assignment) => assignment.league_id)
      .filter((leagueId) => leagueId && !nextLeagueIds.has(leagueId))
  );

  const transaction = db.transaction(() => {
    for (const leagueId of removedLeagueIds) {
      db.prepare("DELETE FROM users WHERE role = 'league_admin' AND league_id = ?").run(leagueId);
    }

    db.exec(`
      DELETE FROM match_participation_players;
      DELETE FROM match_participations;
      DELETE FROM match_events;
      DELETE FROM match_rosters;
      DELETE FROM discipline_resets;
      DELETE FROM discipline_adjustments;
      DELETE FROM discipline_links;
      DELETE FROM player_appearance_adjustments;
      DELETE FROM player_injuries;
      DELETE FROM player_sanctions;
      DELETE FROM matches;
      DELETE FROM team_affiliations;
      DELETE FROM players;
      DELETE FROM teams;
      DELETE FROM competitions;
      DELETE FROM league_announcements;
      DELETE FROM league_media;
      DELETE FROM league_highlights;
      DELETE FROM league_rules;
      DELETE FROM league_identities;
      DELETE FROM sponsors;
      DELETE FROM memberships;
      DELETE FROM leagues;
    `);

    for (const league of normalized.leagues) {
      db.prepare(`
        INSERT INTO leagues (id, name, city, season, current_competition_id, status, public_visibility, plan, owner_email, renewal_date, ad_banner, membership_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        league.id,
        league.name,
        league.city,
        league.season,
        league.currentCompetitionId,
        league.status,
        league.publicVisibility || "visible",
        league.plan,
        league.ownerEmail,
        league.renewalDate,
        league.adBanner,
        league.membershipNotes || ""
      );

      for (const competition of league.competitions || []) {
        db.prepare(`
          INSERT INTO competitions (id, league_id, name, type, season, status, active_round, starts_at, ends_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        competition.id,
        league.id,
        competition.name,
        competition.type || "liga",
        competition.season || league.season,
        competition.status || "active",
        Number(competition.activeRound || 0) || null,
        competition.startsAt || "",
        competition.endsAt || ""
      );
      }

      db.prepare(`
        INSERT INTO league_identities (league_id, logo_url, nickname, activities, public_intro, primary_color, accent_color, secondary_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        league.id,
        league.identity.logoUrl || "",
        league.identity.nickname,
        league.identity.activities,
        league.identity.publicIntro,
        league.identity.primaryColor,
        league.identity.accentColor,
        league.identity.secondaryColor
      );

      db.prepare(`
        INSERT INTO league_rules (league_id, withdrawal_policy, forfeit_points, forfeit_goals_for, forfeit_goals_against, yellow_suspension_limit, default_red_suspension_matches, discipline_scope, playoff_qualifiers, minimum_playoff_appearances, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );

      league.highlights.forEach((highlight, index) => {
        db.prepare("INSERT INTO league_highlights (league_id, body, sort_order) VALUES (?, ?, ?)").run(league.id, highlight, index);
      });

      for (const announcement of league.announcements || []) {
        db.prepare(`
          INSERT INTO league_announcements (id, league_id, title, body, status, date)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          announcement.id,
          league.id,
          announcement.title,
          announcement.body,
          announcement.status || "active",
          announcement.date || ""
        );
      }

      for (const sponsor of league.sponsors || []) {
        db.prepare(`
          INSERT INTO sponsors (id, league_id, name, placement, status, image_url, link_url, sort_order, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sponsor.id,
          league.id,
          sponsor.name,
          sponsor.placement || "home_banner",
          sponsor.status || "active",
          sponsor.imageUrl || "",
          sponsor.linkUrl || "",
          Number(sponsor.sortOrder || 0),
          sponsor.notes || ""
        );
      }

      for (const item of league.media || []) {
        db.prepare(`
          INSERT INTO league_media (id, league_id, competition_id, type, title, caption, status, image_url, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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
        );
      }

      for (const team of league.teams) {
        db.prepare(`
          INSERT INTO teams (id, league_id, competition_id, name, coach, assistant_coach, address, colors, logo_url, status, withdrawn_round, withdrawn_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          team.id,
          league.id,
          team.competitionId || league.currentCompetitionId,
          team.name,
          team.coach,
          team.assistantCoach || "",
          team.address || "",
          team.colors,
          team.logoUrl || "",
          team.status || "active",
          team.withdrawnRound || null,
          team.withdrawnReason || null
        );
      }

      for (const player of league.players) {
        db.prepare(`
          INSERT INTO players (id, league_id, competition_id, team_id, name, number, position, photo_url, photo_authorized, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(player.id, league.id, player.competitionId || league.teams.find((team) => team.id === player.teamId)?.competitionId || league.currentCompetitionId, player.teamId, player.name, player.number, player.position, player.photoUrl || "", player.photoAuthorized ? 1 : 0, player.status || "active");
      }

      for (const sanction of league.sanctions || []) {
        db.prepare(`
          INSERT INTO player_sanctions (id, league_id, competition_id, player_id, type, matches, indefinite, reason, date, status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sanction.id,
          league.id,
          sanction.competitionId || league.currentCompetitionId,
          sanction.playerId,
          sanction.type || "Sancion disciplinaria",
          Number(sanction.matches || 0),
          sanction.indefinite ? 1 : 0,
          sanction.reason || "",
          sanction.date || "",
          sanction.status || "active",
          sanction.notes || ""
        );
      }

      for (const injury of league.injuries || []) {
        db.prepare(`
          INSERT INTO player_injuries (id, league_id, competition_id, player_id, type, date, expected_return, needs_surgery, needs_support, support_detail, status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          injury.id,
          league.id,
          injury.competitionId || league.currentCompetitionId,
          injury.playerId,
          injury.type || "Lesion",
          injury.date || "",
          injury.expectedReturn || "",
          injury.needsSurgery ? 1 : 0,
          injury.needsSupport ? 1 : 0,
          injury.supportDetail || "",
          injury.status || "active",
          injury.notes || ""
        );
      }

      for (const affiliation of league.teamAffiliations || []) {
        db.prepare(`
          INSERT INTO team_affiliations (id, league_id, source_team_id, target_team_id, status, starts_at, ends_at, player_numbers_json, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          affiliation.id,
          league.id,
          affiliation.sourceTeamId,
          affiliation.targetTeamId,
          affiliation.status || "active",
          affiliation.startsAt || "",
          affiliation.endsAt || "",
          JSON.stringify(affiliation.playerNumbers || {}),
          affiliation.notes || ""
        );
      }

      for (const link of league.disciplineLinks || []) {
        db.prepare(`
          INSERT INTO discipline_links (id, league_id, player_ids_json, notes)
          VALUES (?, ?, ?, ?)
        `).run(link.id, league.id, JSON.stringify(link.playerIds || []), link.notes || "");
      }

      for (const adjustment of league.disciplineAdjustments || []) {
        db.prepare(`
          INSERT INTO discipline_adjustments (id, league_id, competition_id, player_id, value, date, reason, notes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          adjustment.id,
          league.id,
          adjustment.competitionId || league.currentCompetitionId,
          adjustment.playerId,
          Number(adjustment.value || 0),
          adjustment.date || "",
          adjustment.reason || "",
          adjustment.notes || "",
          adjustment.status || "active"
        );
      }

      for (const reset of league.disciplineResets || []) {
        db.prepare(`
          INSERT INTO discipline_resets (id, league_id, player_id, date, reason, notes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(reset.id, league.id, reset.playerId, reset.date || "", reset.reason || "", reset.notes || "", reset.status || "active");
      }

      for (const adjustment of league.appearanceAdjustments || []) {
        db.prepare(`
          INSERT INTO player_appearance_adjustments (id, league_id, player_id, value, date, reason, notes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          adjustment.id,
          league.id,
          adjustment.playerId,
          Number(adjustment.value || 0),
          adjustment.date || "",
          adjustment.reason || "",
          adjustment.notes || "",
          adjustment.status || "active"
        );
      }

      for (const match of league.matches) {
        db.prepare(`
          INSERT INTO matches (id, league_id, competition_id, stage, playoff_round, playoff_leg, aggregate_home, aggregate_away, extra_time_home_goals, extra_time_away_goals, penalty_home_goals, penalty_away_goals, round, date, time, venue, schedule_note, original_date, original_time, original_round, schedule_updated_at, home_team_id, away_team_id, status, workflow_status, capture_mode, current_report_id, published_at, finalized_at, home_goals, away_goals, observations, resolution_type, resolution_note, central_referee_user_id, assistant_referee1_user_id, assistant_referee2_user_id, fourth_referee_user_id, referee_crew_mode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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
          match.date,
          match.time || "",
          match.venue || "",
          match.scheduleNote || "",
          match.originalDate || "",
          match.originalTime || "",
          match.originalRound || null,
          match.scheduleUpdatedAt || "",
          match.homeTeamId,
          match.awayTeamId,
          match.status,
          match.workflowStatus || match.status || "scheduled",
          match.captureMode || "admin",
          match.currentReportId || "",
          match.publishedAt || "",
          match.finalizedAt || "",
          match.homeGoals,
          match.awayGoals,
          match.observations || "",
          match.resolutionType || "normal",
          match.resolutionNote || null,
          match.centralRefereeUserId || null,
          match.assistantReferee1UserId || null,
          match.assistantReferee2UserId || null,
          match.fourthRefereeUserId || null,
          match.refereeCrewMode || ""
        );

        for (const event of match.events || []) {
          db.prepare(`
            INSERT INTO match_events (match_id, local_uuid, type, player_id, secondary_player_id, assist_player_id, team_id, event_team_side, subtype, period, minute, minute_label, second, suspension_matches, suspension_indefinite, disciplinary_pending, reason, metadata_json, is_official, sync_status, created_by_user_id, created_at, updated_at, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
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
            event.minute,
            event.minuteLabel || "",
            event.second || null,
            event.suspensionMatches,
            event.suspensionIndefinite ? 1 : 0,
            event.disciplinaryPending ? 1 : 0,
            event.reason,
            JSON.stringify(event.metadata || {}),
            event.isOfficial === false ? 0 : 1,
            event.syncStatus || "synced",
            event.createdByUserId || null,
            event.createdAt || "",
            event.updatedAt || "",
            event.version || 1
          );
        }
      }

      for (const roster of league.matchRosters || []) {
        db.prepare(`
          INSERT INTO match_rosters (id, league_id, match_id, team_id, submitted_by_user_id, captain_player_id, goalkeeper_player_id, captain_pin, players_json, starters_json, substitutes_json, lineup_json, status, notes, submitted_at, updated_at, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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
        );
      }

      for (const participation of league.matchParticipations || []) {
        const participationId = participation.id || `match-participation-${Date.now()}`;
        db.prepare(`
          INSERT OR IGNORE INTO match_participations (
            id, league_id, match_id, team_id, status, captain_player_id, submitted_by_user_id,
            submitted_at, locked_at, corrected_by_user_id, corrected_at, correction_reason,
            source, metadata_json, active, version, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          participationId,
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
          participation.active === false ? 0 : 1,
          participation.version || 1,
          participation.createdAt || participation.submittedAt || new Date().toISOString(),
          participation.updatedAt || participation.submittedAt || new Date().toISOString()
        );
        for (const player of participation.players || []) {
          db.prepare(`
            INSERT OR IGNORE INTO match_participation_players (
              id, match_participation_id, player_id, player_name_snapshot,
              player_number_snapshot, player_photo_snapshot, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            player.id || `match-participation-player-${Date.now()}-${player.playerId}`,
            participationId,
            player.playerId,
            player.playerNameSnapshot || "",
            player.playerNumberSnapshot || "",
            player.playerPhotoSnapshot || "",
            player.createdAt || participation.submittedAt || new Date().toISOString()
          );
        }
      }
    }

    const userIds = new Set(db.prepare("SELECT id FROM users").all().map((user) => user.id));
    const matchIds = new Set(db.prepare("SELECT id FROM matches").all().map((match) => match.id));
    const teamIds = new Set(db.prepare("SELECT id FROM teams").all().map((team) => team.id));
    const playerIds = new Set(db.prepare("SELECT id FROM players").all().map((player) => player.id));
    const rosterIds = new Set(db.prepare("SELECT id FROM match_rosters").all().map((roster) => roster.id));
    const participationIds = new Set(db.prepare("SELECT id FROM match_participations").all().map((participation) => participation.id));
    const restoredSessionIds = new Set();
    const restoredReportIds = new Set();

    for (const participation of preservedMatchParticipations) {
      if (!nextLeagueIds.has(participation.league_id) || !matchIds.has(participation.match_id) || !teamIds.has(participation.team_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_participations (
          id, league_id, match_id, team_id, status, captain_player_id, submitted_by_user_id,
          submitted_at, locked_at, corrected_by_user_id, corrected_at, correction_reason,
          source, metadata_json, active, version, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
        participation.metadata_json || "{}",
        participation.active === 0 ? 0 : 1,
        Number(participation.version || 1),
        participation.created_at || participation.submitted_at || new Date().toISOString(),
        participation.updated_at || participation.submitted_at || new Date().toISOString()
      );
      participationIds.add(participation.id);
    }

    for (const player of preservedMatchParticipationPlayers) {
      if (!participationIds.has(player.match_participation_id) || !playerIds.has(player.player_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_participation_players (
          id, match_participation_id, player_id, player_name_snapshot,
          player_number_snapshot, player_photo_snapshot, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        player.id,
        player.match_participation_id,
        player.player_id,
        player.player_name_snapshot || "",
        player.player_number_snapshot || "",
        player.player_photo_snapshot || "",
        player.created_at || new Date().toISOString()
      );
    }

    for (const pin of preservedMatchTeamPins) {
      if (!nextLeagueIds.has(pin.league_id) || !matchIds.has(pin.match_id) || !teamIds.has(pin.team_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_team_pins (
          id, league_id, match_id, team_id, roster_id, pin_hash, pin_salt, status,
          attempts, locked_until, generated_by_user_id, generated_at, revealed_by_user_id,
          revealed_at, invalidated_at, used_at, signed_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
    }

    for (const session of preservedMatchSessions) {
      if (!nextLeagueIds.has(session.league_id) || !matchIds.has(session.match_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_sessions (
          id, league_id, match_id, referee_user_id, capture_mode, status, period,
          started_at, paused_at, saved_at, resumed_at, finished_at, suspended_at,
          suspension_reason, clock_state_json, metadata_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
        session.clock_state_json || "{}",
        session.metadata_json || "{}",
        session.created_at || new Date().toISOString(),
        session.updated_at || new Date().toISOString()
      );
      restoredSessionIds.add(session.id);
    }

    for (const report of preservedMatchReports) {
      if (!nextLeagueIds.has(report.league_id) || !matchIds.has(report.match_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_reports (
          id, league_id, match_id, session_id, generated_by_user_id, capture_mode, status,
          version, payload_json, home_goals, away_goals, generated_at, finalized_at,
          published_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        report.id,
        report.league_id,
        report.match_id,
        report.session_id && restoredSessionIds.has(report.session_id) ? report.session_id : null,
        report.generated_by_user_id && userIds.has(report.generated_by_user_id) ? report.generated_by_user_id : null,
        report.capture_mode || "admin",
        report.status || "draft",
        Number(report.version || 1),
        report.payload_json || "{}",
        report.home_goals ?? null,
        report.away_goals ?? null,
        report.generated_at || null,
        report.finalized_at || null,
        report.published_at || null,
        report.created_at || new Date().toISOString(),
        report.updated_at || new Date().toISOString()
      );
      restoredReportIds.add(report.id);
    }

    for (const signature of preservedMatchReportSignatures) {
      if (!restoredReportIds.has(signature.report_id) || !nextLeagueIds.has(signature.league_id) || !matchIds.has(signature.match_id) || !teamIds.has(signature.team_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_report_signatures (
          id, report_id, league_id, match_id, team_id, captain_player_id,
          signed_by_user_id, method, status, signed_at, act_version, act_hash,
          act_snapshot_json, invalidated_at, ip_address, user_agent, metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
        signature.act_snapshot_json || "{}",
        signature.invalidated_at || null,
        signature.ip_address || "",
        signature.user_agent || "",
        signature.metadata_json || "{}"
      );
    }

    for (const dispute of preservedMatchReportDisputes) {
      if (!restoredReportIds.has(dispute.report_id) || !nextLeagueIds.has(dispute.league_id) || !matchIds.has(dispute.match_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_report_disputes (
          id, report_id, league_id, match_id, team_id, requested_by_user_id,
          reason, status, created_at, resolved_at, resolved_by_user_id, resolution_note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
    }

    for (const queued of preservedMatchSyncQueue) {
      if (!nextLeagueIds.has(queued.league_id) || !matchIds.has(queued.match_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO match_sync_queue (
          id, league_id, match_id, session_id, client_event_id, created_by_user_id,
          payload_json, status, attempts, last_error, created_at, synced_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        queued.id,
        queued.league_id,
        queued.match_id,
        queued.session_id && restoredSessionIds.has(queued.session_id) ? queued.session_id : null,
        queued.client_event_id || "",
        queued.created_by_user_id && userIds.has(queued.created_by_user_id) ? queued.created_by_user_id : null,
        queued.payload_json || "{}",
        queued.status || "pending",
        Number(queued.attempts || 0),
        queued.last_error || "",
        queued.created_at || new Date().toISOString(),
        queued.synced_at || null
      );
    }

    const restoredAccessIds = new Set();
    const restoredAssignmentIds = new Set();

    for (const access of preservedUserAccesses) {
      if (!userIds.has(access.user_id)) continue;
      if (access.league_id && !nextLeagueIds.has(access.league_id)) continue;
      if (access.team_id && !nextTeamIds.has(access.team_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO user_accesses (id, user_id, league_id, team_id, role, permissions_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        access.id,
        access.user_id,
        access.league_id || null,
        access.team_id || null,
        access.role,
        access.permissions_json || "[]",
        access.status || "active",
        access.created_at || new Date().toISOString(),
        access.updated_at || new Date().toISOString()
      );
      restoredAccessIds.add(access.id);
    }

    for (const permission of preservedTeamRosterPermissions) {
      if (!nextLeagueIds.has(permission.league_id) || !nextTeamIds.has(permission.team_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO team_roster_permissions (team_id, league_id, registration_enabled, enabled_until, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        permission.team_id,
        permission.league_id,
        permission.registration_enabled ? 1 : 0,
        permission.enabled_until || null,
        permission.notes || "",
        permission.updated_at || new Date().toISOString()
      );
    }

    for (const assignment of preservedTeamAssignments) {
      if (!nextLeagueIds.has(assignment.league_id) || !nextTeamIds.has(assignment.team_id) || !userIds.has(assignment.user_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO team_user_assignments (id, league_id, team_id, user_id, role, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        assignment.id,
        assignment.league_id,
        assignment.team_id,
        assignment.user_id,
        assignment.role || "delegate",
        assignment.status || "active",
        assignment.created_at || new Date().toISOString()
      );
      restoredAssignmentIds.add(assignment.id);
    }

    for (const token of preservedDelegateActivationTokens) {
      if (!userIds.has(token.user_id) || !restoredAssignmentIds.has(token.assignment_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO team_delegate_activation_tokens (id, user_id, assignment_id, token_hash, expires_at, used_at, revoked_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        token.id,
        token.user_id,
        token.assignment_id,
        token.token_hash,
        token.expires_at,
        token.used_at || null,
        token.revoked_at || null,
        token.created_at || new Date().toISOString()
      );
    }

    for (const token of preservedAdminActivationTokens) {
      if (!userIds.has(token.user_id)) continue;
      if (token.access_id && !restoredAccessIds.has(token.access_id)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO admin_activation_tokens (id, user_id, access_id, token_hash, expires_at, used_at, revoked_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        token.id,
        token.user_id,
        token.access_id || null,
        token.token_hash,
        token.expires_at,
        token.used_at || null,
        token.revoked_at || null,
        token.created_at || new Date().toISOString()
      );
    }

    for (const assignment of userLeagueAssignments) {
      if (assignment.league_id && nextLeagueIds.has(assignment.league_id)) {
        db.prepare("UPDATE users SET league_id = ? WHERE id = ?").run(assignment.league_id, assignment.id);
      }
    }
  });

  transaction();
  seedUsers();
  return getStore();
}

export { DB_PATH };

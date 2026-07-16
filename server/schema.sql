PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  season TEXT NOT NULL,
  current_competition_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  public_visibility TEXT NOT NULL DEFAULT 'visible',
  plan TEXT,
  owner_email TEXT,
  renewal_date TEXT,
  ad_banner TEXT,
  membership_notes TEXT
);

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

CREATE TABLE IF NOT EXISTS league_identities (
  league_id TEXT PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  nickname TEXT,
  activities TEXT,
  public_intro TEXT,
  primary_color TEXT,
  accent_color TEXT,
  secondary_color TEXT
);

CREATE TABLE IF NOT EXISTS league_rules (
  league_id TEXT PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  withdrawal_policy TEXT NOT NULL DEFAULT 'award_walkover',
  forfeit_points INTEGER NOT NULL DEFAULT 3,
  forfeit_goals_for INTEGER NOT NULL DEFAULT 3,
  forfeit_goals_against INTEGER NOT NULL DEFAULT 0,
  yellow_suspension_limit INTEGER NOT NULL DEFAULT 3,
  default_red_suspension_matches INTEGER NOT NULL DEFAULT 1,
  discipline_scope TEXT NOT NULL DEFAULT 'competition',
  playoff_qualifiers INTEGER NOT NULL DEFAULT 8,
  minimum_playoff_appearances INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS league_highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS league_announcements (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  date TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  coach TEXT,
  assistant_coach TEXT,
  address TEXT,
  colors TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  withdrawn_round INTEGER,
  withdrawn_reason TEXT
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  number INTEGER,
  position TEXT,
  photo_url TEXT,
  photo_authorized INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'regular',
  playoff_round TEXT,
  playoff_leg TEXT,
  aggregate_home INTEGER,
  aggregate_away INTEGER,
  extra_time_home_goals INTEGER,
  extra_time_away_goals INTEGER,
  penalty_home_goals INTEGER,
  penalty_away_goals INTEGER,
  round INTEGER NOT NULL,
  date TEXT,
  time TEXT NOT NULL,
  venue TEXT NOT NULL,
  schedule_note TEXT,
  original_date TEXT,
  original_time TEXT,
  original_round INTEGER,
  schedule_updated_at TEXT,
  home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled',
  workflow_status TEXT NOT NULL DEFAULT 'scheduled',
  capture_mode TEXT NOT NULL DEFAULT 'admin',
  current_report_id TEXT,
  published_at TEXT,
  finalized_at TEXT,
  home_goals INTEGER,
  away_goals INTEGER,
  observations TEXT,
  resolution_type TEXT NOT NULL DEFAULT 'normal',
  resolution_note TEXT,
  central_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assistant_referee1_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assistant_referee2_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  fourth_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS match_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  local_uuid TEXT,
  type TEXT NOT NULL,
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  secondary_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  assist_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  event_team_side TEXT,
  subtype TEXT,
  period TEXT,
  minute INTEGER,
  minute_label TEXT,
  second INTEGER,
  suspension_matches INTEGER,
  suspension_indefinite INTEGER NOT NULL DEFAULT 0,
  disciplinary_pending INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_official INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT,
  updated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS player_sanctions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
  player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  matches INTEGER NOT NULL DEFAULT 0,
  indefinite INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  league_id TEXT REFERENCES leagues(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_failed_login_at TEXT
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
  goalkeeper_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  captain_pin TEXT,
  players_json TEXT NOT NULL,
  starters_json TEXT NOT NULL DEFAULT '[]',
  substitutes_json TEXT NOT NULL DEFAULT '[]',
  lineup_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted',
  notes TEXT,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(match_id, team_id)
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

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  renewal_date TEXT
);

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'home_banner',
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  link_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_backup_records_created ON backup_records(created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

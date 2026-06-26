PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  season TEXT NOT NULL,
  current_competition_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
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
  round INTEGER NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  venue TEXT NOT NULL,
  home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled',
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
  type TEXT NOT NULL,
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  minute INTEGER,
  suspension_matches INTEGER,
  reason TEXT
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

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

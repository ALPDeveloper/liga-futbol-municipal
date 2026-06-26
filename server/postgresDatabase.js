import "./env.js";
import { Pool } from "pg";
import { seedData } from "../src/data/seedData.js";
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
  if (result.rows[0].total === 0 && runtimeConfig.seedDemoData) await importPostgresStore(normalizeStore(seedData));
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
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS assistant_coach TEXT");
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS address TEXT");
  await pool.query("ALTER TABLE IF EXISTS teams ADD COLUMN IF NOT EXISTS logo_url TEXT");
  await pool.query("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS phone TEXT");
  await pool.query("ALTER TABLE IF EXISTS players ADD COLUMN IF NOT EXISTS competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS players ADD COLUMN IF NOT EXISTS photo_url TEXT");
  await pool.query("ALTER TABLE IF EXISTS players ADD COLUMN IF NOT EXISTS photo_authorized BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS observations TEXT");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS central_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS assistant_referee1_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS assistant_referee2_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS matches ADD COLUMN IF NOT EXISTS fourth_referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE IF EXISTS league_rules ADD COLUMN IF NOT EXISTS discipline_scope TEXT NOT NULL DEFAULT 'competition'");
  await pool.query("ALTER TABLE IF EXISTS league_rules ADD COLUMN IF NOT EXISTS playoff_qualifiers INTEGER NOT NULL DEFAULT 8");
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

  const leagues = [];
  for (const leagueRow of leagueRows) {
    const identity = (await pool.query("SELECT * FROM league_identities WHERE league_id = $1", [leagueRow.id])).rows[0] || {};
    const rules = (await pool.query("SELECT * FROM league_rules WHERE league_id = $1", [leagueRow.id])).rows[0] || {};
    const highlights = (await pool.query("SELECT body FROM league_highlights WHERE league_id = $1 ORDER BY sort_order, id", [leagueRow.id])).rows.map((row) => row.body);
    const announcements = (await pool.query("SELECT * FROM league_announcements WHERE league_id = $1 ORDER BY date DESC NULLS LAST, title", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      status: row.status,
      date: rowDate(row, "date")
    }));
    const competitions = (await pool.query("SELECT * FROM competitions WHERE league_id = $1 ORDER BY status, season DESC, name", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      season: row.season,
      status: row.status,
      activeRound: row.active_round,
      startsAt: rowDate(row, "starts_at"),
      endsAt: rowDate(row, "ends_at")
    }));
    const teams = (await pool.query("SELECT * FROM teams WHERE league_id = $1 ORDER BY name", [leagueRow.id])).rows.map((row) => ({
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
    const players = (await pool.query("SELECT * FROM players WHERE league_id = $1 ORDER BY team_id, number, name", [leagueRow.id])).rows.map((row) => ({
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
    const sanctions = (await pool.query("SELECT * FROM player_sanctions WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      type: row.type,
      matches: row.matches,
      reason: row.reason,
      date: rowDate(row, "date"),
      status: row.status,
      notes: row.notes
    }));
    const injuries = (await pool.query("SELECT * FROM player_injuries WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id])).rows.map((row) => ({
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
    const teamAffiliations = (await pool.query("SELECT * FROM team_affiliations WHERE league_id = $1 ORDER BY id", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      sourceTeamId: row.source_team_id,
      targetTeamId: row.target_team_id,
      status: row.status,
      startsAt: rowDate(row, "starts_at"),
      endsAt: rowDate(row, "ends_at"),
      playerNumbers: row.player_numbers_json || {},
      notes: row.notes || ""
    }));
    const disciplineLinks = (await pool.query("SELECT * FROM discipline_links WHERE league_id = $1 ORDER BY id", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      playerIds: row.player_ids_json || [],
      notes: row.notes || ""
    }));
    const disciplineAdjustments = (await pool.query("SELECT * FROM discipline_adjustments WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      playerId: row.player_id,
      value: row.value,
      date: rowDate(row, "date"),
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const disciplineResets = (await pool.query("SELECT * FROM discipline_resets WHERE league_id = $1 ORDER BY date DESC NULLS LAST, id DESC", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      date: rowDate(row, "date"),
      reason: row.reason,
      notes: row.notes,
      status: row.status
    }));
    const sponsors = (await pool.query("SELECT * FROM sponsors WHERE league_id = $1 ORDER BY sort_order, name", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      name: row.name,
      placement: row.placement,
      status: row.status,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      sortOrder: row.sort_order,
      notes: row.notes
    }));
    const matchRows = (await pool.query("SELECT * FROM matches WHERE league_id = $1 ORDER BY round, date, time", [leagueRow.id])).rows;
    const matches = [];
    for (const row of matchRows) {
      const events = (await pool.query("SELECT * FROM match_events WHERE match_id = $1 ORDER BY id", [row.id])).rows.map((event) => ({
        type: event.type,
        playerId: event.player_id,
        teamId: event.team_id,
        minute: event.minute,
        suspensionMatches: event.suspension_matches,
        reason: event.reason
      }));

      matches.push({
        id: row.id,
        competitionId: row.competition_id,
        stage: row.stage || "regular",
        playoffRound: row.playoff_round,
        playoffLeg: row.playoff_leg,
        aggregateHome: row.aggregate_home,
        aggregateAway: row.aggregate_away,
        round: row.round,
        date: rowDate(row, "date"),
        time: row.time,
        venue: row.venue,
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        status: row.status,
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        observations: row.observations,
        resolutionType: row.resolution_type,
        resolutionNote: row.resolution_note,
        centralRefereeUserId: row.central_referee_user_id || "",
        assistantReferee1UserId: row.assistant_referee1_user_id || "",
        assistantReferee2UserId: row.assistant_referee2_user_id || "",
        fourthRefereeUserId: row.fourth_referee_user_id || "",
        events
      });
    }

    leagues.push({
      id: leagueRow.id,
      name: leagueRow.name,
      city: leagueRow.city,
      season: leagueRow.season,
      currentCompetitionId: leagueRow.current_competition_id,
      competitions,
      status: leagueRow.status,
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
      sponsors,
      matches
    });
  }

  return normalizeStore({
    currentLeagueId: currentLeagueSetting || leagues[0]?.id || seedData.currentLeagueId,
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
    const nextLeagueIds = new Set(normalized.leagues.map((league) => league.id));
    const removedLeagueIds = new Set(
      userLeagueAssignments
        .map((assignment) => assignment.league_id)
        .filter((leagueId) => leagueId && !nextLeagueIds.has(leagueId))
    );

    for (const leagueId of removedLeagueIds) {
      await query(client, "DELETE FROM users WHERE role = 'league_admin' AND league_id = $1", [leagueId]);
    }

    for (const table of [
      "match_events",
      "discipline_resets",
      "discipline_adjustments",
      "discipline_links",
      "player_injuries",
      "player_sanctions",
      "matches",
      "team_affiliations",
      "players",
      "teams",
      "competitions",
      "league_announcements",
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
        INSERT INTO leagues (id, name, city, season, current_competition_id, status, plan, owner_email, renewal_date, ad_banner, membership_notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, '')::date, $10, $11)
      `, [
        league.id,
        league.name,
        league.city,
        league.season,
        league.currentCompetitionId,
        league.status,
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
        INSERT INTO league_rules (league_id, withdrawal_policy, forfeit_points, forfeit_goals_for, forfeit_goals_against, yellow_suspension_limit, default_red_suspension_matches, discipline_scope, playoff_qualifiers, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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

      await insertRows(client, "player_sanctions", ["id", "league_id", "competition_id", "player_id", "type", "matches", "reason", "date", "status", "notes"], (league.sanctions || []).map((sanction) => (
        [sanction.id, league.id, sanction.competitionId || league.currentCompetitionId, sanction.playerId, sanction.type || "Sancion disciplinaria", Number(sanction.matches || 0), sanction.reason || "", sanction.date || "", sanction.status || "active", sanction.notes || ""]
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

      await insertRows(client, "matches", ["id", "league_id", "competition_id", "stage", "playoff_round", "playoff_leg", "aggregate_home", "aggregate_away", "round", "date", "time", "venue", "home_team_id", "away_team_id", "status", "home_goals", "away_goals", "observations", "resolution_type", "resolution_note", "central_referee_user_id", "assistant_referee1_user_id", "assistant_referee2_user_id", "fourth_referee_user_id"], league.matches.map((match) => [
          match.id,
          league.id,
          match.competitionId || league.currentCompetitionId,
          match.stage || "regular",
          match.playoffRound || "",
          match.playoffLeg || "",
          match.aggregateHome ?? null,
          match.aggregateAway ?? null,
          match.round,
          match.date || "",
          match.time || "",
          match.venue || "",
          match.homeTeamId,
          match.awayTeamId,
          match.status,
          match.homeGoals,
          match.awayGoals,
          match.observations || "",
          match.resolutionType || "normal",
          match.resolutionNote || null,
          match.centralRefereeUserId || null,
          match.assistantReferee1UserId || null,
          match.assistantReferee2UserId || null,
          match.fourthRefereeUserId || null
        ]), { dateColumns: ["date"] });

      await insertRows(client, "match_events", ["match_id", "type", "player_id", "team_id", "minute", "suspension_matches", "reason"], league.matches.flatMap((match) => (
        (match.events || []).map((event) => [match.id, event.type, event.playerId, event.teamId, event.minute, event.suspensionMatches, event.reason])
      )));
    }

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

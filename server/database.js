import "./env.js";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedData } from "../src/data/seedData.js";
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

export function initializeDatabase() {
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  runMigrations();
  const count = db.prepare("SELECT COUNT(*) AS total FROM leagues").get().total;
  if (count === 0 && runtimeConfig.seedDemoData) importStore(normalizeStore(seedData));
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
  if (!matchColumns.includes("observations")) {
    db.prepare("ALTER TABLE matches ADD COLUMN observations TEXT").run();
  }

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
  `);

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
    const matches = db.prepare("SELECT * FROM matches WHERE league_id = ? ORDER BY round, date, time").all(leagueRow.id).map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      stage: row.stage || "regular",
      playoffRound: row.playoff_round,
      playoffLeg: row.playoff_leg,
      aggregateHome: row.aggregate_home,
      aggregateAway: row.aggregate_away,
      round: row.round,
      date: row.date,
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
      events: db.prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY id").all(row.id).map((event) => ({
        type: event.type,
        playerId: event.player_id,
        teamId: event.team_id,
        minute: event.minute,
        suspensionMatches: event.suspension_matches,
        reason: event.reason
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
      plan: leagueRow.plan,
      ownerEmail: leagueRow.owner_email,
      renewalDate: leagueRow.renewal_date,
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
    };
  });

  return normalizeStore({
    currentLeagueId: leagues[0]?.id || seedData.currentLeagueId,
    leagues
  });
}

export function importStore(store) {
  const normalized = normalizeStore(store);
  const userLeagueAssignments = db.prepare("SELECT id, league_id FROM users").all();
  const nextLeagueIds = new Set(normalized.leagues.map((league) => league.id));
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
      DELETE FROM match_events;
      DELETE FROM discipline_resets;
      DELETE FROM discipline_adjustments;
      DELETE FROM discipline_links;
      DELETE FROM player_injuries;
      DELETE FROM player_sanctions;
      DELETE FROM matches;
      DELETE FROM team_affiliations;
      DELETE FROM players;
      DELETE FROM teams;
      DELETE FROM competitions;
      DELETE FROM league_announcements;
      DELETE FROM league_highlights;
      DELETE FROM league_rules;
      DELETE FROM league_identities;
      DELETE FROM sponsors;
      DELETE FROM memberships;
      DELETE FROM leagues;
    `);

    for (const league of normalized.leagues) {
      db.prepare(`
        INSERT INTO leagues (id, name, city, season, current_competition_id, status, plan, owner_email, renewal_date, ad_banner, membership_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        league.id,
        league.name,
        league.city,
        league.season,
        league.currentCompetitionId,
        league.status,
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
        INSERT INTO league_identities (league_id, nickname, activities, public_intro, primary_color, accent_color, secondary_color)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        league.id,
        league.identity.nickname,
        league.identity.activities,
        league.identity.publicIntro,
        league.identity.primaryColor,
        league.identity.accentColor,
        league.identity.secondaryColor
      );

      db.prepare(`
        INSERT INTO league_rules (league_id, withdrawal_policy, forfeit_points, forfeit_goals_for, forfeit_goals_against, yellow_suspension_limit, default_red_suspension_matches, discipline_scope, playoff_qualifiers, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          INSERT INTO player_sanctions (id, league_id, competition_id, player_id, type, matches, reason, date, status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sanction.id,
          league.id,
          sanction.competitionId || league.currentCompetitionId,
          sanction.playerId,
          sanction.type || "Sancion disciplinaria",
          Number(sanction.matches || 0),
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

      for (const match of league.matches) {
        db.prepare(`
          INSERT INTO matches (id, league_id, competition_id, stage, playoff_round, playoff_leg, aggregate_home, aggregate_away, round, date, time, venue, home_team_id, away_team_id, status, home_goals, away_goals, observations, resolution_type, resolution_note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          match.id,
          league.id,
          match.competitionId || league.currentCompetitionId,
          match.stage || "regular",
          match.playoffRound || "",
          match.playoffLeg || "",
          match.aggregateHome ?? null,
          match.aggregateAway ?? null,
          match.round,
          match.date,
          match.time || "",
          match.venue || "",
          match.homeTeamId,
          match.awayTeamId,
          match.status,
          match.homeGoals,
          match.awayGoals,
          match.observations || "",
          match.resolutionType || "normal",
          match.resolutionNote || null
        );

        for (const event of match.events || []) {
          db.prepare(`
            INSERT INTO match_events (match_id, type, player_id, team_id, minute, suspension_matches, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(match.id, event.type, event.playerId, event.teamId, event.minute, event.suspensionMatches, event.reason);
        }
      }
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

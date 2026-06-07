import "./env.js";
import { Pool } from "pg";
import { seedData } from "../src/data/seedData.js";
import { defaultCompetitionForLeague, normalizeStore } from "../src/lib/domain.js";
import { hashPassword } from "./password.js";

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
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM leagues");
  if (result.rows[0].total === 0) await importPostgresStore(normalizeStore(seedData));
  await seedPostgresUsers();
}

async function seedPostgresUsers() {
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
      name: row.name,
      coach: row.coach,
      colors: row.colors,
      status: row.status,
      withdrawnRound: row.withdrawn_round,
      withdrawnReason: row.withdrawn_reason
    }));
    const players = (await pool.query("SELECT * FROM players WHERE league_id = $1 ORDER BY team_id, number, name", [leagueRow.id])).rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      number: row.number,
      position: row.position,
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
        resolutionType: row.resolution_type,
        resolutionNote: row.resolution_note,
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
        notes: rules.notes
      },
      highlights,
      teams,
      players,
      sanctions,
      injuries,
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
      "player_injuries",
      "player_sanctions",
      "matches",
      "players",
      "teams",
      "competitions",
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

      for (const competition of league.competitions || []) {
        await query(client, `
          INSERT INTO competitions (id, league_id, name, type, season, status, active_round, starts_at, ends_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::date, NULLIF($9, '')::date)
        `, [
          competition.id,
          league.id,
          competition.name,
          competition.type || "liga",
          competition.season || league.season,
          competition.status || "active",
          Number(competition.activeRound || 0) || null,
          competition.startsAt || "",
          competition.endsAt || ""
        ]);
      }

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
        INSERT INTO league_rules (league_id, withdrawal_policy, forfeit_points, forfeit_goals_for, forfeit_goals_against, yellow_suspension_limit, default_red_suspension_matches, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        league.id,
        league.rules?.withdrawalPolicy || "award_walkover",
        Number(league.rules?.forfeitPoints ?? 3),
        Number(league.rules?.forfeitGoalsFor ?? 3),
        Number(league.rules?.forfeitGoalsAgainst ?? 0),
        Number(league.rules?.yellowSuspensionLimit ?? 3),
        Number(league.rules?.defaultRedSuspensionMatches ?? 1),
        league.rules?.notes || "Si un equipo se da de baja, la liga puede otorgar triunfo por default segun sus estatutos."
      ]);

      for (const [index, highlight] of league.highlights.entries()) {
        await query(client, "INSERT INTO league_highlights (league_id, body, sort_order) VALUES ($1, $2, $3)", [league.id, highlight, index]);
      }

      for (const team of league.teams) {
        await query(client, `
          INSERT INTO teams (id, league_id, name, coach, colors, status, withdrawn_round, withdrawn_reason)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [team.id, league.id, team.name, team.coach, team.colors, team.status || "active", team.withdrawnRound || null, team.withdrawnReason || null]);
      }

      for (const player of league.players) {
        await query(client, `
          INSERT INTO players (id, league_id, team_id, name, number, position, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [player.id, league.id, player.teamId, player.name, player.number, player.position, player.status || "active"]);
      }

      for (const sanction of league.sanctions || []) {
        await query(client, `
          INSERT INTO player_sanctions (id, league_id, competition_id, player_id, type, matches, reason, date, status, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::date, $9, $10)
        `, [sanction.id, league.id, sanction.competitionId || league.currentCompetitionId, sanction.playerId, sanction.type || "Sancion disciplinaria", Number(sanction.matches || 0), sanction.reason || "", sanction.date || "", sanction.status || "active", sanction.notes || ""]);
      }

      for (const injury of league.injuries || []) {
        await query(client, `
          INSERT INTO player_injuries (id, league_id, competition_id, player_id, type, date, expected_return, needs_surgery, needs_support, support_detail, status, notes)
          VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::date, NULLIF($7, '')::date, $8, $9, $10, $11, $12)
        `, [injury.id, league.id, injury.competitionId || league.currentCompetitionId, injury.playerId, injury.type || "Lesion", injury.date || "", injury.expectedReturn || "", toBoolean(injury.needsSurgery), toBoolean(injury.needsSupport), injury.supportDetail || "", injury.status || "active", injury.notes || ""]);
      }

      for (const match of league.matches) {
        await query(client, `
          INSERT INTO matches (id, league_id, competition_id, stage, playoff_round, playoff_leg, aggregate_home, aggregate_away, round, date, time, venue, home_team_id, away_team_id, status, home_goals, away_goals, resolution_type, resolution_note)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, '')::date, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `, [
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
          match.resolutionType || "normal",
          match.resolutionNote || null
        ]);

        for (const event of match.events || []) {
          await query(client, `
            INSERT INTO match_events (match_id, type, player_id, team_id, minute, suspension_matches, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [match.id, event.type, event.playerId, event.teamId, event.minute, event.suspensionMatches, event.reason]);
        }
      }
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
  return getPostgresStore();
}

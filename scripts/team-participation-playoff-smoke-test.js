import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligatec-team-playoff-"));
const dbPath = path.join(tempDir, "team-playoff.sqlite");
const port = 3224;
const apiBase = `http://127.0.0.1:${port}/api`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.env.API_PORT = String(port);
process.env.API_HOST = "127.0.0.1";
process.env.CORS_ORIGIN = "*";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DB_PATH = dbPath;
process.env.SEED_DEMO_DATA = "false";
process.env.SEED_DEMO_USERS = "false";
process.env.SERVE_STATIC = "false";

const { hashPassword } = await import("../server/password.js");
const {
  createTeamDelegateAssignmentData,
  createUserAccessData,
  createUserData,
  importStoreData,
  initializeData
} = await import("../server/dataLayer.js");
const { calculatePlayerAppearanceEligibility, normalizeStore } = await import("../src/lib/domain.js");

const ids = {
  league: "league-team-playoff-eligibility",
  competition: "competition-team-playoff-eligibility",
  home: "team-home-playoff-eligibility",
  away: "team-away-playoff-eligibility",
  regularMatch: "match-regular-playoff-eligibility",
  playoffMatch: "match-final-playoff-eligibility",
  eligiblePlayer: "player-eligible-playoff",
  ineligiblePlayer: "player-ineligible-playoff",
  awayPlayer: "player-away-playoff",
  delegate: "user-delegate-playoff-eligibility"
};

const credentials = {
  email: "delegate.playoff@ligatec.test",
  password: "DelegatePlayoff123!"
};

async function seedData() {
  await initializeData();
  await importStoreData(normalizeStore({
    currentLeagueId: ids.league,
    leagues: [
      {
        id: ids.league,
        name: "Liga Playoff Delegado",
        city: "Ciudad Playoff",
        season: "2026",
        currentCompetitionId: ids.competition,
        status: "active",
        plan: "pro",
        ownerEmail: "owner.playoff@ligatec.test",
        identity: {},
        rules: {
          minimumPlayoffAppearances: 1,
          playoffQualifiers: 2,
          playoffTieBreaker: "higher_seed",
          playoffFinalTieBreaker: "extra_time_penalties"
        },
        competitions: [{ id: ids.competition, name: "Primera", season: "2026", status: "active" }],
        teams: [
          { id: ids.home, competitionId: ids.competition, name: "Local Playoff", status: "active" },
          { id: ids.away, competitionId: ids.competition, name: "Visita Playoff", status: "active" }
        ],
        players: [
          { id: ids.eligiblePlayer, competitionId: ids.competition, teamId: ids.home, name: "Jugador Elegible", number: 1, position: "ARQUERO", status: "active" },
          { id: ids.ineligiblePlayer, competitionId: ids.competition, teamId: ids.home, name: "Jugador No Elegible", number: 2, position: "DEFENSOR", status: "active" },
          { id: ids.awayPlayer, competitionId: ids.competition, teamId: ids.away, name: "Rival Playoff", number: 1, position: "ARQUERO", status: "active" }
        ],
        matches: [
          {
            id: ids.regularMatch,
            competitionId: ids.competition,
            round: 1,
            date: "2026-09-01",
            time: "10:00",
            venue: "Campo Regular",
            homeTeamId: ids.home,
            awayTeamId: ids.away,
            status: "finished",
            workflowStatus: "published",
            homeGoals: 1,
            awayGoals: 0,
            events: []
          },
          {
            id: ids.playoffMatch,
            competitionId: ids.competition,
            stage: "playoff",
            playoffRound: "FINAL",
            playoffLeg: "",
            round: 0,
            date: "2026-09-08",
            time: "18:00",
            venue: "Campo Final",
            homeTeamId: ids.home,
            awayTeamId: ids.away,
            status: "scheduled",
            workflowStatus: "scheduled",
            captureMode: "live",
            events: []
          }
        ],
        matchParticipations: [
          {
            id: "participation-regular-playoff-eligibility",
            matchId: ids.regularMatch,
            teamId: ids.home,
            status: "submitted",
            active: true,
            players: [{ playerId: ids.eligiblePlayer }]
          }
        ],
        highlights: [],
        announcements: [],
        sponsors: [],
        memberships: [],
        sanctions: [],
        injuries: [],
        teamAffiliations: []
      }
    ]
  }));

  await createUserData({
    id: ids.delegate,
    leagueId: "",
    name: "Delegado Playoff",
    email: credentials.email,
    role: "team_delegate",
    status: "active",
    passwordHash: hashPassword(credentials.password)
  });
  await createUserAccessData({
    id: "access-delegate-playoff-eligibility",
    userId: ids.delegate,
    leagueId: ids.league,
    teamId: ids.home,
    role: "team_delegate",
    permissions: [],
    status: "active"
  });
  await createTeamDelegateAssignmentData({
    id: "assignment-delegate-playoff-eligibility",
    leagueId: ids.league,
    teamId: ids.home,
    userId: ids.delegate,
    status: "active"
  });
}

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      API_PORT: String(port),
      API_HOST: "127.0.0.1",
      CORS_ORIGIN: "*",
      DATABASE_PROVIDER: "sqlite",
      DB_PATH: dbPath,
      SEED_DEMO_DATA: "false",
      SEED_DEMO_USERS: "false",
      SERVE_STATIC: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function rawApiFetch(pathname, { token = "", method = "GET", body } = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function apiFetch(pathname, options = {}) {
  const { response, payload } = await rawApiFetch(pathname, options);
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${payload.error || payload.message || "Error API"}`);
  }
  return payload;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const health = await apiFetch("/health");
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("El servidor de prueba no inicio a tiempo.");
}

async function login() {
  const payload = await apiFetch("/auth/login", { method: "POST", body: credentials });
  assert.ok(payload.token);
  return payload.token;
}

function makePayload(playerId) {
  return {
    playerIds: [playerId],
    captainPlayerId: playerId,
    goalkeeperPlayerId: playerId,
    captainPin: "1234",
    starters: [playerId],
    substitutes: []
  };
}

await seedData();
const server = startServer();

try {
  await waitForServer();
  const token = await login();
  const publicStore = await apiFetch("/store");
  const publicLeague = publicStore.leagues.find((league) => league.id === ids.league);
  const publicParticipation = publicLeague.matchParticipations[0];
  assert.deepEqual(Object.keys(publicParticipation).sort(), ["active", "id", "matchId", "players", "status", "teamId"]);
  assert.deepEqual(Object.keys(publicParticipation.players[0]), ["playerId"]);
  assert.equal(calculatePlayerAppearanceEligibility(publicLeague).get(ids.eligiblePlayer).eligible, true);

  const ineligiblePayload = makePayload(ids.ineligiblePlayer);

  const roster = await apiFetch(`/team-portal/matches/${ids.playoffMatch}/roster`, {
    token,
    method: "POST",
    body: ineligiblePayload
  });
  const rosterMatch = roster.matches.find((match) => match.id === ids.playoffMatch);
  assert.equal(rosterMatch.roster.players.length, 1);
  assert.equal(rosterMatch.roster.players[0].playerId, ids.ineligiblePlayer);
  const ineligibleRosterPlayer = roster.eligiblePlayers.find((player) => player.id === ids.ineligiblePlayer);
  assert.equal(ineligibleRosterPlayer.playoffEligibility.eligible, false);
  assert.equal(ineligibleRosterPlayer.playoffEligibility.remaining, 1);

  const participation = await apiFetch(`/team-portal/matches/${ids.playoffMatch}/participation`, {
    token,
    method: "POST",
    body: ineligiblePayload
  });
  assert.equal(participation.matches.find((match) => match.id === ids.playoffMatch).participationSubmitted, true);

  console.log("Avisos de participantes en liguilla sin bloqueo OK");
} finally {
  server.kill("SIGTERM");
  fs.rmSync(tempDir, { recursive: true, force: true });
}

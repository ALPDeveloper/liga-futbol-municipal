import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligatec-admin-participation-"));
const dbPath = path.join(tempDir, "admin-participation.sqlite");
const port = 3227;
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
  createUserAccessData,
  createUserData,
  importStoreData,
  initializeData
} = await import("../server/dataLayer.js");
const { calculatePlayerAppearanceEligibility, normalizeStore } = await import("../src/lib/domain.js");

const ids = {
  league: "league-admin-participation",
  competition: "competition-admin-participation",
  home: "team-admin-home",
  away: "team-admin-away",
  finishedMatch: "match-admin-finished",
  scheduledMatch: "match-admin-scheduled",
  playerOne: "player-admin-one",
  playerTwo: "player-admin-two",
  awayPlayer: "player-admin-away",
  admin: "user-admin-participation"
};

const credentials = {
  email: "admin.participation@ligatec.test",
  password: "AdminParticipation123!"
};

async function seedData() {
  await initializeData();
  await importStoreData(normalizeStore({
    currentLeagueId: ids.league,
    leagues: [
      {
        id: ids.league,
        name: "Liga Convocatorias Admin",
        city: "Ciudad Admin",
        season: "2026",
        currentCompetitionId: ids.competition,
        status: "active",
        plan: "pro",
        ownerEmail: "owner.admin.participation@ligatec.test",
        identity: {},
        rules: {
          minimumPlayoffAppearances: 2,
          playoffQualifiers: 2,
          playoffTieBreaker: "higher_seed",
          playoffFinalTieBreaker: "extra_time_penalties"
        },
        competitions: [{ id: ids.competition, name: "Primera", season: "2026", status: "active" }],
        teams: [
          { id: ids.home, competitionId: ids.competition, name: "Admin Local", status: "active" },
          { id: ids.away, competitionId: ids.competition, name: "Admin Visita", status: "active" }
        ],
        players: [
          { id: ids.playerOne, competitionId: ids.competition, teamId: ids.home, name: "Jugador Uno Admin", number: 10, position: "DELANTERO", status: "active" },
          { id: ids.playerTwo, competitionId: ids.competition, teamId: ids.home, name: "Jugador Dos Admin", number: 11, position: "MEDIOCAMPISTA", status: "active" },
          { id: ids.awayPlayer, competitionId: ids.competition, teamId: ids.away, name: "Jugador Rival Admin", number: 1, position: "ARQUERO", status: "active" }
        ],
        matches: [
          {
            id: ids.finishedMatch,
            competitionId: ids.competition,
            round: 1,
            date: "2026-08-01",
            time: "10:00",
            venue: "Campo Finalizado",
            homeTeamId: ids.home,
            awayTeamId: ids.away,
            status: "finished",
            workflowStatus: "published",
            homeGoals: 2,
            awayGoals: 1,
            events: []
          },
          {
            id: ids.scheduledMatch,
            competitionId: ids.competition,
            round: 2,
            date: "2026-08-08",
            time: "11:00",
            venue: "Campo Programado",
            homeTeamId: ids.home,
            awayTeamId: ids.away,
            status: "scheduled",
            workflowStatus: "scheduled",
            events: []
          }
        ],
        matchParticipations: [],
        appearanceAdjustments: [],
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
    id: ids.admin,
    leagueId: ids.league,
    name: "Admin Convocatorias",
    email: credentials.email,
    role: "league_admin",
    status: "active",
    passwordHash: hashPassword(credentials.password)
  });
  await createUserAccessData({
    id: "access-admin-participation",
    userId: ids.admin,
    leagueId: ids.league,
    role: "league_admin",
    permissions: ["match_sheets", "matches"],
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

async function apiFetch(pathname, { token = "", method = "GET", body } = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${pathname} -> ${response.status}: ${payload.error || payload.message || "Error API"}`);
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

async function adminParticipation(token, matchId, playerIds, captainPlayerId = playerIds[0]) {
  return apiFetch(`/leagues/${ids.league}/matches/${matchId}/participations/${ids.home}/correction`, {
    token,
    method: "POST",
    body: {
      playerIds,
      captainPlayerId,
      jerseyNumbers: Object.fromEntries(playerIds.map((playerId, index) => [playerId, String(10 + index)])),
      reason: "Captura administrativa de convocatoria"
    }
  });
}

function getLeague(store) {
  return store.leagues.find((league) => league.id === ids.league);
}

await seedData();
const server = startServer();

try {
  await waitForServer();
  const token = await login();

  const scheduled = await adminParticipation(token, ids.scheduledMatch, [ids.playerOne]);
  assert.equal(scheduled.participation.matchId, ids.scheduledMatch);
  assert.equal(scheduled.participation.source, "admin_correction");
  assert.equal(scheduled.participation.players.length, 1);

  let store = await apiFetch("/store", { token });
  let eligibility = calculatePlayerAppearanceEligibility(getLeague(store));
  assert.equal(eligibility.get(ids.playerOne).officialAppearances, 0);
  assert.equal(eligibility.get(ids.playerOne).recognizedAppearances, 0);

  const finished = await adminParticipation(token, ids.finishedMatch, [ids.playerOne]);
  assert.equal(finished.participation.matchId, ids.finishedMatch);
  store = await apiFetch("/store", { token });
  eligibility = calculatePlayerAppearanceEligibility(getLeague(store));
  assert.equal(eligibility.get(ids.playerOne).officialAppearances, 1);
  assert.equal(eligibility.get(ids.playerOne).recognizedAppearances, 1);
  assert.equal(eligibility.get(ids.playerOne).eligible, false);
  assert.equal(eligibility.get(ids.playerOne).remaining, 1);

  const correction = await adminParticipation(token, ids.finishedMatch, [ids.playerTwo]);
  assert.equal(correction.participation.version, 2);
  store = await apiFetch("/store", { token });
  const league = getLeague(store);
  const activeFinishedParticipations = league.matchParticipations.filter((participation) => (
    participation.matchId === ids.finishedMatch &&
    participation.teamId === ids.home &&
    participation.active !== false
  ));
  assert.equal(activeFinishedParticipations.length, 1);
  assert.equal(activeFinishedParticipations[0].players[0].playerId, ids.playerTwo);
  eligibility = calculatePlayerAppearanceEligibility(league);
  assert.equal(eligibility.get(ids.playerOne).officialAppearances, 0);
  assert.equal(eligibility.get(ids.playerTwo).officialAppearances, 1);

  console.log("Convocatorias admin y conteo de partidos jugados OK");
} finally {
  server.kill("SIGTERM");
  fs.rmSync(tempDir, { recursive: true, force: true });
}

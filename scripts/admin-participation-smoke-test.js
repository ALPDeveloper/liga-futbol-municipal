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
  createTeamDelegateAssignmentData,
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
  pastPendingMatch: "match-admin-past-pending",
  scheduledMatch: "match-admin-scheduled",
  playerOne: "player-admin-one",
  playerTwo: "player-admin-two",
  awayPlayer: "player-admin-away",
  admin: "user-admin-participation",
  delegate: "user-delegate-admin-participation"
};

const credentials = {
  email: "admin.participation@ligatec.test",
  password: "AdminParticipation123!"
};

const delegateCredentials = {
  email: "delegate.admin.participation@ligatec.test",
  password: "DelegateParticipation123!"
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
            id: ids.pastPendingMatch,
            competitionId: ids.competition,
            round: 1,
            date: "2026-08-02",
            time: "12:00",
            venue: "Campo Finalizado Pendiente",
            homeTeamId: ids.home,
            awayTeamId: ids.away,
            status: "finished",
            workflowStatus: "published",
            homeGoals: 1,
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
    permissions: ["match_sheets", "matches", "players"],
    status: "active"
  });
  await createUserData({
    id: ids.delegate,
    leagueId: ids.league,
    name: "Delegado Convocatorias",
    email: delegateCredentials.email,
    role: "team_delegate",
    status: "active",
    passwordHash: hashPassword(delegateCredentials.password)
  });
  await createUserAccessData({
    id: "access-delegate-admin-participation",
    userId: ids.delegate,
    leagueId: ids.league,
    teamId: ids.home,
    role: "team_delegate",
    permissions: ["team_roster"],
    status: "active"
  });
  await createTeamDelegateAssignmentData({
    id: "assignment-delegate-admin-participation",
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

async function login(loginCredentials = credentials) {
  const payload = await apiFetch("/auth/login", { method: "POST", body: loginCredentials });
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
  const delegateToken = await login(delegateCredentials);

  const storeWithQuickPlayer = await apiFetch(`/leagues/${ids.league}/players`, {
    token,
    method: "POST",
    body: {
      teamId: ids.home,
      competitionId: ids.competition,
      name: "Jugador Nuevo Admin",
      number: 12,
      position: "Delantero"
    }
  });
  const quickPlayer = getLeague(storeWithQuickPlayer).players.find((player) => player.name === "JUGADOR NUEVO ADMIN");
  assert.ok(quickPlayer?.id, "El alta rapida admin debe regresar el jugador en el store actualizado.");

  const scheduled = await adminParticipation(token, ids.scheduledMatch, [ids.playerOne, quickPlayer.id], ids.playerOne);
  assert.equal(scheduled.participation.matchId, ids.scheduledMatch);
  assert.equal(scheduled.participation.source, "admin_correction");
  assert.equal(scheduled.participation.players.length, 2);

  const delegatePortalAfterAdmin = await apiFetch("/team-portal/me", { token: delegateToken });
  const scheduledForDelegate = delegatePortalAfterAdmin.matches.find((match) => match.id === ids.scheduledMatch);
  assert.equal(scheduledForDelegate.participationSubmitted, true);
  assert.equal(scheduledForDelegate.participation.players[0].playerId, ids.playerOne);
  assert.equal(scheduledForDelegate.participation.players.some((player) => player.playerId === quickPlayer.id), true);

  const delegatePortalWithPastPending = await apiFetch("/team-portal/me", { token: delegateToken });
  const pastPendingForDelegate = delegatePortalWithPastPending.matches.find((match) => match.id === ids.pastPendingMatch);
  assert.equal(pastPendingForDelegate.status, "finished");
  assert.equal(pastPendingForDelegate.participationSubmitted, false);

  const delegatePastParticipation = await apiFetch(`/team-portal/matches/${ids.pastPendingMatch}/participation`, {
    token: delegateToken,
    method: "POST",
    body: {
      playerIds: [quickPlayer.id],
      captainPlayerId: quickPlayer.id,
      jerseyNumbers: { [quickPlayer.id]: "12" },
      notes: "Captura delegada de partido pasado pendiente"
    }
  });
  const pastPendingAfterDelegate = delegatePastParticipation.matches.find((match) => match.id === ids.pastPendingMatch);
  assert.equal(pastPendingAfterDelegate.participationSubmitted, true);
  assert.equal(pastPendingAfterDelegate.participation.players[0].playerId, quickPlayer.id);

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

  const sheetStore = await apiFetch(`/leagues/${ids.league}/matches/${ids.scheduledMatch}/sheet`, {
    token,
    method: "POST",
    body: {
      homeGoals: 1,
      awayGoals: 0,
      status: "finished",
      observations: "Acta administrativa con convocatoria existente",
      events: [
        { type: "goal", playerId: ids.playerOne, teamId: ids.home, minute: 18 }
      ]
    }
  });
  const sheetLeague = getLeague(sheetStore);
  const publishedScheduledMatch = sheetLeague.matches.find((match) => match.id === ids.scheduledMatch);
  assert.equal(publishedScheduledMatch.status, "finished");
  assert.equal(publishedScheduledMatch.events.length, 1);
  assert.equal(sheetLeague.matchParticipations.filter((participation) => participation.matchId === ids.scheduledMatch && participation.active !== false).length, 1);

  console.log("Convocatorias admin y conteo de partidos jugados OK");
} finally {
  server.kill("SIGTERM");
  fs.rmSync(tempDir, { recursive: true, force: true });
}

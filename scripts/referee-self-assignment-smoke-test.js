import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligatec-referee-self-assign-"));
const dbPath = path.join(tempDir, "referee-self-assign.sqlite");
const port = 3221;
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
  createRefereeProfileData,
  createUserAccessData,
  createUserData,
  importStoreData,
  initializeData,
  upsertMatchSessionData
} = await import("../server/dataLayer.js");
const { normalizeStore } = await import("../src/lib/domain.js");

const ids = {
  league: "league-referee-self-assign",
  competition: "competition-referee-self-assign",
  home: "team-home-self-assign",
  away: "team-away-self-assign",
  soloMatch: "match-solo-self-assign",
  crewMatch: "match-crew-self-assign",
  central: "referee-central-self-assign",
  auxiliar: "referee-aux-self-assign",
  third: "referee-third-self-assign"
};

const credentials = {
  central: { email: "central.self@ligatec.test", password: "CentralSelf123!" },
  auxiliar: { email: "aux.self@ligatec.test", password: "AuxSelf123!" },
  third: { email: "third.self@ligatec.test", password: "ThirdSelf123!" }
};

async function seedData() {
  await initializeData();
  await importStoreData(normalizeStore({
    currentLeagueId: ids.league,
    leagues: [
      {
        id: ids.league,
        name: "Liga Autoasignacion",
        city: "Ciudad Autoasignacion",
        season: "2026",
        currentCompetitionId: ids.competition,
        status: "active",
        plan: "pro",
        ownerEmail: "owner.self@ligatec.test",
        identity: {},
        rules: {},
        competitions: [{ id: ids.competition, name: "Primera", season: "2026", status: "active" }],
        teams: [
          { id: ids.home, competitionId: ids.competition, name: "Local Auto", status: "active" },
          { id: ids.away, competitionId: ids.competition, name: "Visita Auto", status: "active" }
        ],
        players: [],
        matches: [
          {
            id: ids.soloMatch,
            competitionId: ids.competition,
            round: 1,
            date: "2026-09-05",
            time: "10:00",
            venue: "Campo Solo",
            homeTeamId: ids.home,
            awayTeamId: ids.away,
            status: "scheduled",
            events: []
          },
          {
            id: ids.crewMatch,
            competitionId: ids.competition,
            round: 1,
            date: "2026-09-05",
            time: "12:00",
            venue: "Campo Crew",
            homeTeamId: ids.home,
            awayTeamId: ids.away,
            status: "scheduled",
            events: []
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

  for (const [key, credential] of Object.entries(credentials)) {
    const userId = ids[key];
    await createUserData({
      id: userId,
      leagueId: "",
      name: `Arbitro ${key}`,
      email: credential.email,
      role: "referee",
      status: "active",
      passwordHash: hashPassword(credential.password)
    });
    await createUserAccessData({
      id: `access-${userId}`,
      userId,
      leagueId: ids.league,
      role: "referee",
      permissions: [],
      status: "active"
    });
    await createRefereeProfileData({ userId, municipality: "Ciudad Autoasignacion" });
  }
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

async function login({ email, password }) {
  const payload = await apiFetch("/auth/login", { method: "POST", body: { email, password } });
  assert.ok(payload.token);
  return payload.token;
}

await seedData();
const server = startServer();

try {
  await waitForServer();
  const centralToken = await login(credentials.central);
  const auxiliarToken = await login(credentials.auxiliar);
  const thirdToken = await login(credentials.third);

  const initialCentralPortal = await apiFetch("/referee-portal/me", { token: centralToken });
  assert.equal(initialCentralPortal.pendingMatches.some((match) => match.id === ids.soloMatch && match.canSelfAssign), true);
  assert.equal(initialCentralPortal.pendingMatches.some((match) => match.id === ids.crewMatch && match.canSelfAssign), true);

  await apiFetch(`/referee-portal/matches/${ids.soloMatch}/assign`, {
    token: centralToken,
    method: "POST",
    body: { crewMode: "solo", role: "central" }
  });
  const auxiliarAfterSolo = await apiFetch("/referee-portal/me", { token: auxiliarToken });
  assert.equal(auxiliarAfterSolo.pendingMatches.some((match) => match.id === ids.soloMatch), false);

  await apiFetch(`/referee-portal/matches/${ids.crewMatch}/assign`, {
    token: centralToken,
    method: "POST",
    body: { crewMode: "with_assistants", role: "central" }
  });
  const auxiliarBeforeAssign = await apiFetch("/referee-portal/me", { token: auxiliarToken });
  const crewAvailable = auxiliarBeforeAssign.pendingMatches.find((match) => match.id === ids.crewMatch);
  assert.equal(Boolean(crewAvailable?.canSelfAssign), true);
  assert.equal(crewAvailable.availableAssignmentRoles.includes("central"), false);
  assert.equal(crewAvailable.availableAssignmentRoles.includes("auxiliar_1"), true);

  await apiFetch(`/referee-portal/matches/${ids.crewMatch}/assign`, {
    token: auxiliarToken,
    method: "POST",
    body: { crewMode: "with_assistants", role: "assistant" }
  });
  const auxiliarAfterAssign = await apiFetch("/referee-portal/me", { token: auxiliarToken });
  const assignedAuxiliarMatch = auxiliarAfterAssign.pendingMatches.find((match) => match.id === ids.crewMatch);
  assert.equal(assignedAuxiliarMatch.refereeRole, "auxiliar_1");
  assert.equal(assignedAuxiliarMatch.canCapture, true);

  await upsertMatchSessionData({
    id: "shared-session-self-assign",
    leagueId: ids.league,
    matchId: ids.crewMatch,
    refereeUserId: ids.central,
    captureMode: "live",
    status: "in_progress",
    period: "1T",
    clockState: { liveStarted: true, liveRunning: true, liveElapsedSeconds: 120 },
    metadata: { homeGoals: 1, awayGoals: 0, events: [{ id: "event-home-central", type: "goal", playerId: "", teamId: ids.home, minute: 2 }] }
  });
  const liveStateForAuxiliar = await apiFetch(`/referee-portal/matches/${ids.crewMatch}/live-state`, { token: auxiliarToken });
  assert.equal(liveStateForAuxiliar.session.id, "shared-session-self-assign");

  const publicStore = await apiFetch("/store");
  let publicCrewMatch = publicStore.leagues[0].matches.find((match) => match.id === ids.crewMatch);
  assert.equal(publicCrewMatch.status, "in_progress");
  assert.equal(publicCrewMatch.homeGoals, 1);
  assert.equal(publicCrewMatch.liveEvents.length, 1);

  await apiFetch(`/referee-portal/matches/${ids.crewMatch}/sync`, {
    token: auxiliarToken,
    method: "POST",
    body: {
      sessionId: "shared-session-self-assign",
      captureMode: "live",
      status: "in_progress",
      period: "1T",
      clockState: { liveStarted: true, liveRunning: true, liveElapsedSeconds: 150 },
      metadata: {
        homeGoals: 0,
        awayGoals: 1,
        sheetMode: "played",
        events: [{ id: "event-away-auxiliar", type: "goal", playerId: "", teamId: ids.away, minute: 3 }]
      },
      operations: [{
        operationId: "operation-away-auxiliar",
        operationType: "add_event",
        payload: { event: { id: "event-away-auxiliar", type: "goal", playerId: "", teamId: ids.away, minute: 3 } }
      }]
    }
  });
  const publicStoreAfterAuxiliarGoal = await apiFetch("/store");
  publicCrewMatch = publicStoreAfterAuxiliarGoal.leagues[0].matches.find((match) => match.id === ids.crewMatch);
  assert.equal(publicCrewMatch.homeGoals, 1);
  assert.equal(publicCrewMatch.awayGoals, 1);
  assert.equal(publicCrewMatch.liveEvents.length, 2);

  await apiFetch(`/referee-portal/matches/${ids.crewMatch}/sync`, {
    token: centralToken,
    method: "POST",
    body: {
      sessionId: "shared-session-self-assign",
      captureMode: "live",
      status: "in_progress",
      period: "1T",
      clockState: { liveStarted: true, liveRunning: true, liveElapsedSeconds: 180 },
      metadata: {
        homeGoals: 0,
        awayGoals: 1,
        sheetMode: "played",
        events: [{ id: "event-away-auxiliar", type: "goal", playerId: "", teamId: ids.away, minute: 3 }]
      },
      operations: [{
        operationId: "operation-cancel-central-goal",
        operationType: "cancel_event",
        payload: { eventId: "event-home-central" }
      }]
    }
  });
  const publicStoreAfterCancel = await apiFetch("/store");
  publicCrewMatch = publicStoreAfterCancel.leagues[0].matches.find((match) => match.id === ids.crewMatch);
  assert.equal(publicCrewMatch.homeGoals, 0);
  assert.equal(publicCrewMatch.awayGoals, 1);
  assert.equal(publicCrewMatch.liveEvents.length, 1);

  const thirdPortal = await apiFetch("/referee-portal/me", { token: thirdToken });
  const crewForThird = thirdPortal.pendingMatches.find((match) => match.id === ids.crewMatch);
  assert.equal(Boolean(crewForThird?.canSelfAssign), true);
  assert.equal(crewForThird.availableAssignmentRoles.includes("central"), false);

  console.log("Autoasignacion arbitral y vivo publico OK");
} finally {
  server.kill("SIGTERM");
  fs.rmSync(tempDir, { recursive: true, force: true });
}

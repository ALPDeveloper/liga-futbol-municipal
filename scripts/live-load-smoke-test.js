import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MATCH_COUNT = 30;
const EVENTS_PER_MATCH = 3;
const PUBLIC_READS = 120;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligatec-live-load-"));
const dbPath = path.join(tempDir, "live-load.sqlite");
const port = 3230;
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
process.env.PUBLIC_READ_MAX_REQUESTS = "1000";
process.env.REFEREE_LIVE_READ_MAX_REQUESTS = "300";
process.env.REFEREE_LIVE_WRITE_MAX_REQUESTS = "300";

const { hashPassword } = await import("../server/password.js");
const {
  createRefereeProfileData,
  createUserAccessData,
  createUserData,
  importStoreData,
  initializeData
} = await import("../server/dataLayer.js");
const { normalizeStore } = await import("../src/lib/domain.js");

const ids = {
  league: "league-live-load",
  competition: "competition-live-load",
  home: "team-live-load-home",
  away: "team-live-load-away"
};

const referees = Array.from({ length: MATCH_COUNT }, (_, index) => ({
  id: `referee-live-load-${index + 1}`,
  email: `referee.live.load.${index + 1}@ligatec.test`,
  password: `RefLoad${index + 1}Pass!`
}));

const matches = referees.map((referee, index) => ({
  id: `match-live-load-${index + 1}`,
  competitionId: ids.competition,
  round: 1,
  date: "2026-09-11",
  time: `${String(10 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}`,
  venue: `Cancha carga ${index + 1}`,
  homeTeamId: ids.home,
  awayTeamId: ids.away,
  status: "scheduled",
  workflowStatus: "scheduled",
  captureMode: "live",
  centralRefereeUserId: referee.id,
  refereeCrewMode: "solo",
  events: []
}));

async function seedData() {
  await initializeData();
  for (const referee of referees) {
    await createUserData({
      id: referee.id,
      leagueId: "",
      name: `Arbitro carga ${referee.id}`,
      email: referee.email,
      role: "referee",
      status: "active",
      passwordHash: hashPassword(referee.password)
    });
    await createRefereeProfileData({ userId: referee.id, municipality: "Ciudad Carga" });
  }

  await importStoreData(normalizeStore({
    currentLeagueId: ids.league,
    leagues: [
      {
        id: ids.league,
        name: "Liga Carga Vivo",
        city: "Ciudad Carga",
        season: "2026",
        currentCompetitionId: ids.competition,
        status: "active",
        plan: "pro",
        ownerEmail: "owner.live.load@ligatec.test",
        identity: {},
        rules: {},
        competitions: [{ id: ids.competition, name: "Carga Vivo", season: "2026", status: "active" }],
        teams: [
          { id: ids.home, competitionId: ids.competition, name: "Local Carga", status: "active" },
          { id: ids.away, competitionId: ids.competition, name: "Visita Carga", status: "active" }
        ],
        players: [],
        matches,
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

  for (const referee of referees) {
    await createUserAccessData({
      id: `access-${referee.id}`,
      userId: referee.id,
      leagueId: ids.league,
      role: "referee",
      permissions: [],
      status: "active"
    });
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
      SERVE_STATIC: "false",
      PUBLIC_READ_MAX_REQUESTS: "1000",
      REFEREE_LIVE_READ_MAX_REQUESTS: "300",
      REFEREE_LIVE_WRITE_MAX_REQUESTS: "300"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function apiFetch(pathname, { token = "", method = "GET", body, withHeaders = false } = {}) {
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
  if (withHeaders) return { payload, headers: response.headers };
  return payload;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const health = await apiFetch("/health");
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("El servidor de prueba no inicio a tiempo.");
}

async function login(referee) {
  const payload = await apiFetch("/auth/login", {
    method: "POST",
    body: { email: referee.email, password: referee.password }
  });
  assert.ok(payload.token);
  return payload.token;
}

function buildLiveTimer(index, elapsedSeconds) {
  return {
    liveStarted: true,
    timerStatus: "running",
    currentPeriod: "1T",
    accumulatedSeconds: elapsedSeconds,
    periodStartedAt: new Date(Date.now() - elapsedSeconds * 1000 - index).toISOString(),
    version: index + 1,
    clientSessionId: `client-live-load-${index + 1}`
  };
}

function buildEvents(matchId, count) {
  return Array.from({ length: count }, (_, eventIndex) => ({
    id: `${matchId}-event-${eventIndex + 1}`,
    type: "goal",
    teamId: eventIndex % 2 === 0 ? ids.home : ids.away,
    playerId: "",
    minute: eventIndex + 1,
    period: "regular",
    createdAt: new Date(Date.now() + eventIndex).toISOString()
  }));
}

async function runPublicBurst() {
  const requests = Array.from({ length: PUBLIC_READS }, () => apiFetch("/store", { withHeaders: true }));
  const responses = await Promise.all(requests);
  const cacheHeader = responses[0].headers.get("cache-control") || "";
  assert.match(cacheHeader, /max-age=/);
  return responses[responses.length - 1].payload;
}

await seedData();
const server = startServer();

try {
  await waitForServer();
  const tokens = await Promise.all(referees.map(login));

  await Promise.all(matches.map((match, index) => apiFetch(`/referee-portal/matches/${match.id}/start`, {
    token: tokens[index],
    method: "POST",
    body: {
      sessionId: `session-${match.id}`,
      operationId: `start-${match.id}`,
      captureMode: "live",
      period: "1T",
      clockState: { liveStarted: true, liveRunning: true, liveTimer: buildLiveTimer(index, 60) },
      metadata: { events: [] }
    }
  })));

  await Promise.all(matches.flatMap((match, matchIndex) => {
    const events = buildEvents(match.id, EVENTS_PER_MATCH);
    return events.map((event, eventIndex) => apiFetch(`/referee-portal/matches/${match.id}/sync`, {
      token: tokens[matchIndex],
      method: "POST",
      body: {
        sessionId: `session-${match.id}`,
        captureMode: "live",
        status: "in_progress",
        period: "1T",
        clockState: {
          liveStarted: true,
          liveRunning: true,
          liveTimer: buildLiveTimer(matchIndex, 120 + eventIndex * 30)
        },
        metadata: {
          homeGoals: events.slice(0, eventIndex + 1).filter((item) => item.teamId === ids.home).length,
          awayGoals: events.slice(0, eventIndex + 1).filter((item) => item.teamId === ids.away).length,
          events: events.slice(0, eventIndex + 1)
        },
        operations: [{
          operationId: `sync-${match.id}-${eventIndex + 1}`,
          operationType: "add_event",
          payload: { event }
        }]
      }
    }));
  }));

  const publicStore = await runPublicBurst();
  const league = publicStore.leagues.find((item) => item.id === ids.league);
  assert.ok(league);
  const liveMatches = league.matches.filter((match) => match.status === "in_progress");
  assert.equal(liveMatches.length, MATCH_COUNT);
  assert.equal(liveMatches.reduce((total, match) => total + (match.liveEvents?.length || 0), 0), MATCH_COUNT * EVENTS_PER_MATCH);
  assert.ok(liveMatches.every((match) => match.liveState?.status === "in_progress"));

  console.log(`Carga vivo OK: ${MATCH_COUNT} partidos, ${MATCH_COUNT * EVENTS_PER_MATCH} eventos, ${PUBLIC_READS} lecturas publicas cacheadas`);
} finally {
  server.kill();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

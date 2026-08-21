import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligatec-access-request-"));
const dbPath = path.join(tempDir, "access-request.sqlite");
const port = 3219;
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
const { normalizeStore } = await import("../src/lib/domain.js");

const ids = {
  league: "league-access-request-flow",
  competition: "competition-access-request-flow",
  team: "team-access-request-flow",
  admin: "user-admin-access-request-flow"
};

const credentials = {
  admin: { email: "admin.access@ligatec.test", password: "AdminAccess123!" },
  requester: { email: "multirol.access@ligatec.test", password: "MultiRolAccess123!" }
};

async function seedData() {
  await initializeData();
  await importStoreData(normalizeStore({
    currentLeagueId: ids.league,
    leagues: [
      {
        id: ids.league,
        name: "Liga Acceso Multirol",
        city: "Ciudad Multirol",
        season: "2026",
        currentCompetitionId: ids.competition,
        status: "active",
        plan: "pro",
        ownerEmail: "owner.access@ligatec.test",
        identity: {},
        rules: {},
        competitions: [{ id: ids.competition, name: "Primera Fuerza", season: "2026", status: "active" }],
        teams: [{ id: ids.team, competitionId: ids.competition, name: "Equipo Multirol", status: "active" }],
        players: [],
        matches: [],
        highlights: [],
        announcements: [],
        sponsors: [],
        memberships: []
      }
    ]
  }));
  await createUserData({
    id: ids.admin,
    leagueId: ids.league,
    name: "Admin Acceso",
    email: credentials.admin.email,
    role: "league_admin",
    status: "active",
    passwordHash: hashPassword(credentials.admin.password)
  });
  await createUserAccessData({
    id: "access-admin-access-request-flow",
    userId: ids.admin,
    leagueId: ids.league,
    role: "league_admin",
    permissions: ["delegates", "referees", "users"],
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

async function login(email, password) {
  const payload = await apiFetch("/auth/login", { method: "POST", body: { email, password } });
  assert.ok(payload.token);
  return payload;
}

async function submitAccess(role, tokenlessBody = {}) {
  return apiFetch("/access-requests", {
    method: "POST",
    body: {
      leagueId: ids.league,
      role,
      teamId: role === "team_delegate" ? ids.team : "",
      name: "Usuario Multirol",
      phone: "5551234567",
      email: credentials.requester.email,
      password: credentials.requester.password,
      confirmPassword: credentials.requester.password,
      ...tokenlessBody
    }
  });
}

async function approveRequest(adminToken, requestId) {
  return apiFetch(`/access-requests/${requestId}`, {
    token: adminToken,
    method: "PATCH",
    body: { action: "approve" }
  });
}

await seedData();
const server = startServer();

try {
  await waitForServer();
  const adminSession = await login(credentials.admin.email, credentials.admin.password);

  const delegateRequest = await submitAccess("team_delegate");
  assert.equal(delegateRequest.request.requestedRole, "team_delegate");
  await approveRequest(adminSession.token, delegateRequest.request.id);

  await assert.rejects(
    submitAccess("team_delegate"),
    /409: Ese correo ya tiene acceso de delegado para este equipo/
  );

  await assert.rejects(
    submitAccess("referee", { password: "PasswordIncorrecta123!", confirmPassword: "PasswordIncorrecta123!" }),
    /401: Ese correo ya tiene cuenta/
  );

  const refereeRequest = await submitAccess("referee");
  assert.equal(refereeRequest.request.requestedRole, "referee");
  await approveRequest(adminSession.token, refereeRequest.request.id);

  const requesterSession = await login(credentials.requester.email, credentials.requester.password);
  const roles = requesterSession.user.accesses.map((access) => access.role);
  assert.equal(roles.includes("team_delegate"), true);
  assert.equal(roles.includes("referee"), true);
  assert.equal(requesterSession.user.accesses.some((access) => access.role === "team_delegate" && access.teamId === ids.team), true);

  console.log("Solicitudes multirol con mismo correo OK");
} finally {
  server.kill("SIGTERM");
  fs.rmSync(tempDir, { recursive: true, force: true });
}

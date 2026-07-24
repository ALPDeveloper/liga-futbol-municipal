import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const shouldReset = process.argv.includes("--reset");
const runApiCheck = process.argv.includes("--api-check") || Boolean(process.env.AFFILIATION_FLOW_API_BASE);
const apiBase = (process.env.AFFILIATION_FLOW_API_BASE || "http://127.0.0.1:3011/api").replace(/\/$/, "");

process.env.DATABASE_PROVIDER = "sqlite";
process.env.SEED_DEMO_DATA = "false";
process.env.SEED_DEMO_USERS = "false";
process.env.DB_PATH = process.env.DB_PATH || "data/ligatec-affiliation-flow.sqlite";

if (shouldReset && process.env.DB_PATH) {
  fs.mkdirSync(path.dirname(process.env.DB_PATH), { recursive: true });
  fs.rmSync(process.env.DB_PATH, { force: true });
}

const { hashPassword } = await import("../server/password.js");
const {
  createRefereeProfileData,
  createTeamDelegateAssignmentData,
  createUserAccessData,
  createUserData,
  getStoreData,
  importStoreData,
  initializeData,
  listMatchParticipationsForLeagueData,
  updateMatchRefereesData
} = await import("../server/dataLayer.js");
const {
  calculatePlayerStats,
  getCurrentLeague,
  getEligiblePlayersForTeam,
  getPlayerNumberForTeam,
  normalizeStore,
  scopeLeagueToCompetition
} = await import("../src/lib/domain.js");

const ids = {
  league: "liga-affiliation-flow",
  primaryCompetition: "competition-primera-flow",
  secondaryCompetition: "competition-segunda-flow",
  teamPrimary: "team-primera-b-flow",
  teamPrimaryRival: "team-primera-rival-flow",
  teamSecondary: "team-segunda-a-flow",
  teamSecondaryRival: "team-segunda-rival-flow",
  playerPrimaryCaptain: "player-capitan-primera-flow",
  playerPrimaryWing: "player-extremo-primera-flow",
  playerRival: "player-rival-primera-flow",
  playerAffiliate: "player-afiliado-segunda-flow",
  matchPrimary: "match-primera-affiliation-flow",
  matchSecondary: "match-segunda-origin-flow",
  adminUser: "user-admin-affiliation-flow",
  delegateUser: "user-delegate-primera-flow",
  rivalDelegateUser: "user-delegate-rival-flow",
  refereeUser: "user-referee-affiliation-flow"
};

const credentials = {
  admin: { email: "admin.afiliacion@ligatec.test", password: "AfiliacionAdmin123!" },
  delegate: { email: "delegado.primera@ligatec.test", password: "AfiliacionDelegado123!" },
  rivalDelegate: { email: "delegado.rival@ligatec.test", password: "AfiliacionRival123!" },
  referee: { email: "arbitro.afiliacion@ligatec.test", password: "AfiliacionArbitro123!" }
};

async function setupScenario() {
  await initializeData();
  const store = normalizeStore({
    currentLeagueId: ids.league,
    leagues: [
      {
        id: ids.league,
        name: "Liga QA Afiliaciones",
        city: "Ciudad QA Afiliacion",
        season: "2026",
        currentCompetitionId: ids.primaryCompetition,
        status: "active",
        plan: "pro",
        ownerEmail: "qa@ligatec.test",
        identity: {},
        rules: {
          disciplineScope: "competition",
          yellowSuspensionLimit: 3,
          defaultRedSuspensionMatches: 1,
          minimumPlayoffAppearances: 0
        },
        competitions: [
          { id: ids.primaryCompetition, name: "Primera Fuerza QA", season: "2026", status: "active" },
          { id: ids.secondaryCompetition, name: "Segunda Fuerza QA", season: "2026", status: "active" }
        ],
        teams: [
          { id: ids.teamPrimary, competitionId: ids.primaryCompetition, name: "Equipo B Primera", logoUrl: "" },
          { id: ids.teamPrimaryRival, competitionId: ids.primaryCompetition, name: "Rival Primera", logoUrl: "" },
          { id: ids.teamSecondary, competitionId: ids.secondaryCompetition, name: "Equipo A Segunda", logoUrl: "" },
          { id: ids.teamSecondaryRival, competitionId: ids.secondaryCompetition, name: "Rival Segunda", logoUrl: "" }
        ],
        players: [
          { id: ids.playerPrimaryCaptain, competitionId: ids.primaryCompetition, teamId: ids.teamPrimary, name: "CAPITAN PRIMERA", number: 10, position: "MEDIO", status: "active" },
          { id: ids.playerPrimaryWing, competitionId: ids.primaryCompetition, teamId: ids.teamPrimary, name: "EXTREMO PRIMERA", number: 7, position: "DELANTERO", status: "active" },
          { id: ids.playerRival, competitionId: ids.primaryCompetition, teamId: ids.teamPrimaryRival, name: "RIVAL GOLEADOR", number: 9, position: "DELANTERO", status: "active" },
          { id: ids.playerAffiliate, competitionId: ids.secondaryCompetition, teamId: ids.teamSecondary, name: "AFILIADO SEGUNDA", number: 18, position: "DELANTERO", status: "active" }
        ],
        matches: [
          {
            id: ids.matchPrimary,
            competitionId: ids.primaryCompetition,
            round: 4,
            date: "2026-08-02",
            time: "18:00",
            venue: "Cancha QA Central",
            homeTeamId: ids.teamPrimary,
            awayTeamId: ids.teamPrimaryRival,
            status: "scheduled",
            workflowStatus: "scheduled",
            centralRefereeUserId: "",
            events: []
          },
          {
            id: ids.matchSecondary,
            competitionId: ids.secondaryCompetition,
            round: 4,
            date: "2026-08-01",
            time: "16:00",
            venue: "Cancha QA Secundaria",
            homeTeamId: ids.teamSecondary,
            awayTeamId: ids.teamSecondaryRival,
            status: "finished",
            workflowStatus: "published",
            captureMode: "admin",
            homeGoals: 1,
            awayGoals: 0,
            events: [
              { type: "goal", playerId: ids.playerAffiliate, teamId: ids.teamSecondary, minute: 22 },
              { type: "yellow", playerId: ids.playerAffiliate, teamId: ids.teamSecondary, minute: 70 }
            ]
          }
        ],
        teamAffiliations: [
          {
            id: "affiliation-segunda-to-primera-flow",
            sourceTeamId: ids.teamSecondary,
            targetTeamId: ids.teamPrimary,
            status: "active",
            playerNumbers: { [ids.playerAffiliate]: 21 },
            notes: "Equipo A Segunda afiliado a Equipo B Primera"
          }
        ],
        disciplineLinks: [],
        sanctions: [],
        injuries: [],
        highlights: [],
        announcements: [],
        sponsors: [],
        memberships: []
      }
    ]
  });

  await importStoreData(store);
  await createUserData({ id: ids.adminUser, leagueId: ids.league, name: "Admin Afiliacion", email: credentials.admin.email, role: "league_admin", status: "active", passwordHash: hashPassword(credentials.admin.password) });
  await createUserAccessData({
    id: "access-admin-affiliation-flow",
    userId: ids.adminUser,
    leagueId: ids.league,
    role: "league_admin",
    permissions: ["matches", "teams", "players", "match_sheets", "delegates", "referees", "rules"],
    status: "active"
  });
  await createUserData({ id: ids.delegateUser, leagueId: "", name: "Delegado Equipo B", email: credentials.delegate.email, role: "team_delegate", status: "active", passwordHash: hashPassword(credentials.delegate.password) });
  await createUserAccessData({ id: "access-delegate-primera-flow", userId: ids.delegateUser, leagueId: ids.league, teamId: ids.teamPrimary, role: "team_delegate", permissions: ["team_roster"], status: "active" });
  await createTeamDelegateAssignmentData({ id: "assignment-delegate-primera-flow", leagueId: ids.league, teamId: ids.teamPrimary, userId: ids.delegateUser, status: "active" });
  await createUserData({ id: ids.rivalDelegateUser, leagueId: "", name: "Delegado Rival", email: credentials.rivalDelegate.email, role: "team_delegate", status: "active", passwordHash: hashPassword(credentials.rivalDelegate.password) });
  await createUserAccessData({ id: "access-delegate-rival-flow", userId: ids.rivalDelegateUser, leagueId: ids.league, teamId: ids.teamPrimaryRival, role: "team_delegate", permissions: ["team_roster"], status: "active" });
  await createTeamDelegateAssignmentData({ id: "assignment-delegate-rival-flow", leagueId: ids.league, teamId: ids.teamPrimaryRival, userId: ids.rivalDelegateUser, status: "active" });
  await createUserData({ id: ids.refereeUser, leagueId: "", name: "Arbitro Afiliacion", email: credentials.referee.email, role: "referee", status: "active", passwordHash: hashPassword(credentials.referee.password) });
  await createUserAccessData({ id: "access-referee-affiliation-flow", userId: ids.refereeUser, role: "referee", permissions: [], status: "active" });
  await createRefereeProfileData({ userId: ids.refereeUser, municipality: "Ciudad QA Afiliacion" });
  await updateMatchRefereesData(ids.matchPrimary, {
    centralRefereeUserId: ids.refereeUser,
    assistantReferee1UserId: "",
    assistantReferee2UserId: "",
    fourthRefereeUserId: ""
  });
}

async function assertDirectState() {
  const store = await getStoreData();
  const league = getCurrentLeague(store);
  const eligible = getEligiblePlayersForTeam(league, ids.teamPrimary);
  assert.equal(eligible.some((player) => player.id === ids.playerAffiliate), true);
  assert.equal(getPlayerNumberForTeam(league, ids.playerAffiliate, ids.teamPrimary), 21);

  const primaryStats = calculatePlayerStats(scopeLeagueToCompetition(league, ids.primaryCompetition));
  const secondaryStats = calculatePlayerStats(scopeLeagueToCompetition(league, ids.secondaryCompetition));
  const primaryAffiliateStats = primaryStats.find((row) => row.player.id === ids.playerAffiliate);
  const secondaryAffiliateStats = secondaryStats.find((row) => row.player.id === ids.playerAffiliate);
  return {
    eligibleCount: eligible.length,
    affiliateEligible: eligible.some((player) => player.id === ids.playerAffiliate),
    affiliatePrimaryGoals: primaryAffiliateStats?.goals || 0,
    affiliateSecondaryGoals: secondaryAffiliateStats?.goals || 0,
    participations: (await listMatchParticipationsForLeagueData(ids.league)).length
  };
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

async function login({ email, password }) {
  const session = await apiFetch("/auth/login", { method: "POST", body: { email, password } });
  assert.ok(session.token);
  return session.token;
}

async function runApiScenario() {
  const delegateToken = await login(credentials.delegate);
  const delegatePayload = await apiFetch("/team-portal/me", { token: delegateToken });
  const affiliate = delegatePayload.eligiblePlayers.find((player) => player.id === ids.playerAffiliate);
  assert.ok(affiliate, "El afiliado debe aparecer como elegible para el delegado del equipo receptor.");
  assert.equal(affiliate.isAffiliate, true);
  assert.equal(affiliate.originTeamName, "EQUIPO A SEGUNDA");
  assert.equal(Number(affiliate.number), 21);

  await apiFetch(`/team-portal/matches/${ids.matchPrimary}/participation`, {
    token: delegateToken,
    method: "POST",
    body: {
      playerIds: [ids.playerPrimaryCaptain, ids.playerPrimaryWing, ids.playerAffiliate],
      captainPlayerId: ids.playerPrimaryCaptain,
      notes: "Prueba QA con jugador afiliado de Segunda."
    }
  });

  const refereeToken = await login(credentials.referee);
  const refereePayload = await apiFetch("/referee-portal/me", { token: refereeToken });
  const refereeMatch = [...(refereePayload.pendingMatches || []), ...(refereePayload.history || [])].find((match) => match.id === ids.matchPrimary);
  assert.ok(refereeMatch, "El partido asignado debe aparecer en el panel arbitro.");
  const refereeAffiliate = (refereeMatch.homePlayers || []).find((player) => player.id === ids.playerAffiliate);
  assert.ok(refereeAffiliate, "El afiliado debe aparecer en jugadores del arbitro.");
  assert.equal(refereeAffiliate.isAffiliate, true);
  assert.equal(refereeAffiliate.originTeamName, "EQUIPO A SEGUNDA");
  assert.equal(Number(refereeAffiliate.number), 21);

  const reportPayload = {
    homeGoals: 2,
    awayGoals: 1,
    observations: "Acta QA con jugador afiliado capturado en Primera.",
    events: [
      { type: "goal", playerId: ids.playerPrimaryCaptain, teamId: ids.teamPrimary, minute: 12 },
      { type: "goal", playerId: ids.playerAffiliate, teamId: ids.teamPrimary, minute: 54 },
      { type: "yellow", playerId: ids.playerAffiliate, teamId: ids.teamPrimary, minute: 66 },
      { type: "goal", playerId: ids.playerRival, teamId: ids.teamPrimaryRival, minute: 70 }
    ]
  };
  await apiFetch(`/referee-portal/matches/${ids.matchPrimary}/start`, {
    token: refereeToken,
    method: "POST",
    body: { sessionId: "session-affiliation-flow", captureMode: "live", operationId: "aff-start" }
  });
  await apiFetch(`/referee-portal/matches/${ids.matchPrimary}/finish-match`, {
    token: refereeToken,
    method: "POST",
    body: {
      sessionId: "session-affiliation-flow",
      reportId: "report-affiliation-flow",
      captureMode: "live",
      operationId: "aff-finish",
      homeGoals: 2,
      awayGoals: 1,
      reportPayload
    }
  });
  await apiFetch(`/referee-portal/matches/${ids.matchPrimary}/report/finalize`, {
    token: refereeToken,
    method: "POST",
    body: {}
  });

  const store = await getStoreData();
  const league = getCurrentLeague(store);
  const match = league.matches.find((item) => item.id === ids.matchPrimary);
  assert.equal(match.status, "finished");
  assert.equal(match.competitionId, ids.primaryCompetition);
  assert.equal(match.events.some((event) => event.playerId === ids.playerAffiliate && event.teamId === ids.teamPrimary && event.type === "goal"), true);

  const primaryStats = calculatePlayerStats(scopeLeagueToCompetition(league, ids.primaryCompetition));
  const secondaryStats = calculatePlayerStats(scopeLeagueToCompetition(league, ids.secondaryCompetition));
  assert.equal(primaryStats.find((row) => row.player.id === ids.playerAffiliate)?.goals, 1);
  assert.equal(secondaryStats.find((row) => row.player.id === ids.playerAffiliate)?.goals, 1);

  return {
    delegateAffiliate: affiliate,
    refereeAffiliate,
    matchStatus: match.status,
    primaryAffiliateGoals: primaryStats.find((row) => row.player.id === ids.playerAffiliate)?.goals || 0,
    secondaryAffiliateGoals: secondaryStats.find((row) => row.player.id === ids.playerAffiliate)?.goals || 0
  };
}

if (!runApiCheck) {
  await setupScenario();
}

const direct = await assertDirectState();
let api = null;
if (runApiCheck) {
  api = await runApiScenario();
}

console.log(JSON.stringify({
  ok: true,
  dbPath: process.env.DB_PATH,
  ids,
  credentials,
  direct,
  api
}, null, 2));

import assert from "node:assert/strict";
import {
  addDisciplineAdjustment,
  addDisciplineReset,
  addTeamAffiliation,
  mergeDuplicatePlayer,
  saveMatchSheet,
  updateLeagueRules,
  updateTeamAffiliationPlayerNumber
} from "../src/lib/actions.js";
import {
  calculatePlayerStats,
  calculateSuspensionNotices,
  calculateYellowCardDiscipline,
  getEligiblePlayersForTeam,
  getPlayerNumberForTeam,
  getPlayerSeasonBreakdown,
  normalizeStore,
  scopeLeagueToCompetition
} from "../src/lib/domain.js";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:3001/api";
const TEST_LEAGUE_ID = "liga-codex-affiliation-test";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function buildTestLeague() {
  return {
    id: TEST_LEAGUE_ID,
    name: "Liga Codex Pruebas Afiliacion",
    city: "Guascuaro De Mujica",
    season: "Apertura 2026",
    currentCompetitionId: "primera-test",
    competitions: [
      { id: "primera-test", name: "Primera Fuerza", type: "liga", season: "Apertura 2026", status: "active", activeRound: 5 },
      { id: "segunda-test", name: "Segunda Fuerza", type: "liga", season: "Apertura 2026", status: "active", activeRound: 5 }
    ],
    status: "active",
    plan: "test",
    ownerEmail: "local@test.dev",
    renewalDate: "",
    adBanner: "",
    membershipNotes: "",
    identity: {},
    rules: {
      disciplineScope: "league",
      yellowSuspensionLimit: 3,
      defaultRedSuspensionMatches: 1,
      playoffQualifiers: 8
    },
    highlights: [],
    announcements: [],
    teams: [
      { id: "vasco-test", competitionId: "primera-test", name: "Vasco Jr", coach: "", colors: "#0f766e", status: "active" },
      { id: "primera-rival-test", competitionId: "primera-test", name: "Primera Rival", coach: "", colors: "#1d4ed8", status: "active" },
      { id: "naranja-test", competitionId: "segunda-test", name: "Naranja", coach: "", colors: "#f97316", status: "active" },
      { id: "segunda-rival-test", competitionId: "segunda-test", name: "Segunda Rival", coach: "", colors: "#7c2d12", status: "active" }
    ],
    players: [
      { id: "jose-naranja-test", competitionId: "segunda-test", teamId: "naranja-test", name: "Martinez Jose L", number: 9, position: "Delantero" },
      { id: "jose-vasco-duplicate-test", competitionId: "primera-test", teamId: "vasco-test", name: "#15 Martinez Jose L", number: 15, position: "Delantero" },
      { id: "star-vasco-test", competitionId: "primera-test", teamId: "vasco-test", name: "Goleador Vasco", number: 10, position: "Delantero" },
      { id: "rival-primera-test", competitionId: "primera-test", teamId: "primera-rival-test", name: "Defensa Rival", number: 4, position: "Defensor" },
      { id: "rival-segunda-test", competitionId: "segunda-test", teamId: "segunda-rival-test", name: "Defensa Segunda", number: 5, position: "Defensor" }
    ],
    sanctions: [],
    injuries: [],
    sponsors: [],
    matches: [
      {
        id: "segunda-j1-test",
        competitionId: "segunda-test",
        round: 1,
        date: "2026-06-01",
        time: "10:00",
        venue: "Cancha Test",
        homeTeamId: "naranja-test",
        awayTeamId: "segunda-rival-test",
        status: "scheduled",
        homeGoals: null,
        awayGoals: null,
        events: []
      },
      {
        id: "primera-j2-test",
        competitionId: "primera-test",
        round: 2,
        date: "2026-06-08",
        time: "10:00",
        venue: "Cancha Test",
        homeTeamId: "vasco-test",
        awayTeamId: "primera-rival-test",
        status: "scheduled",
        homeGoals: null,
        awayGoals: null,
        events: []
      },
      {
        id: "primera-j3-red-test",
        competitionId: "primera-test",
        round: 3,
        date: "2026-06-15",
        time: "10:00",
        venue: "Cancha Test",
        homeTeamId: "primera-rival-test",
        awayTeamId: "vasco-test",
        status: "scheduled",
        homeGoals: null,
        awayGoals: null,
        events: []
      },
      {
        id: "segunda-j4-next-test",
        competitionId: "segunda-test",
        round: 4,
        date: "2026-06-22",
        time: "10:00",
        venue: "Cancha Test",
        homeTeamId: "segunda-rival-test",
        awayTeamId: "naranja-test",
        status: "scheduled",
        homeGoals: null,
        awayGoals: null,
        events: []
      },
      {
        id: "primera-j5-future-test",
        competitionId: "primera-test",
        round: 5,
        date: "2026-06-29",
        time: "10:00",
        venue: "Cancha Test",
        homeTeamId: "vasco-test",
        awayTeamId: "primera-rival-test",
        status: "scheduled",
        homeGoals: null,
        awayGoals: null,
        events: []
      }
    ]
  };
}

async function main() {
  const health = await request("/health");
  assert.equal(health.provider, "sqlite");

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "super@ligafut.local", password: "super123" })
  });
  const authHeaders = { Authorization: `Bearer ${login.token}` };
  const originalStore = normalizeStore(await request("/store", { headers: authHeaders }));
  let store = normalizeStore({
    ...originalStore,
    currentLeagueId: TEST_LEAGUE_ID,
    leagues: [
      ...originalStore.leagues.filter((league) => league.id !== TEST_LEAGUE_ID),
      buildTestLeague()
    ]
  });

  store = updateLeagueRules(store, TEST_LEAGUE_ID, { disciplineScope: "league", yellowSuspensionLimit: 3, defaultRedSuspensionMatches: 1 });
  store = addTeamAffiliation(store, TEST_LEAGUE_ID, { sourceTeamId: "naranja-test", targetTeamId: "vasco-test", notes: "Prueba Naranja afiliado a Vasco" });
  let league = store.leagues.find((item) => item.id === TEST_LEAGUE_ID);
  const affiliationId = league.teamAffiliations[0].id;
  store = updateTeamAffiliationPlayerNumber(store, TEST_LEAGUE_ID, affiliationId, { playerId: "jose-naranja-test", number: 15 });

  store = saveMatchSheet(store, TEST_LEAGUE_ID, {
    matchId: "segunda-j1-test",
    homeGoals: 1,
    awayGoals: 0,
    events: [
      { type: "goal", playerId: "jose-naranja-test", teamId: "naranja-test", minute: 12 },
      { type: "yellow", playerId: "jose-naranja-test", teamId: "naranja-test", minute: 40 }
    ]
  });

  store = saveMatchSheet(store, TEST_LEAGUE_ID, {
    matchId: "primera-j2-test",
    homeGoals: 5,
    awayGoals: 0,
    events: [
      { type: "goal", playerId: "star-vasco-test", teamId: "vasco-test", minute: 5 },
      { type: "goal", playerId: "star-vasco-test", teamId: "vasco-test", minute: 30 },
      { type: "goal", playerId: "star-vasco-test", teamId: "vasco-test", minute: 75 },
      { type: "goal", playerId: "jose-vasco-duplicate-test", teamId: "vasco-test", minute: 20 },
      { type: "goal", playerId: "jose-vasco-duplicate-test", teamId: "vasco-test", minute: 62 },
      { type: "yellow", playerId: "jose-vasco-duplicate-test", teamId: "vasco-test", minute: 50 },
      { type: "yellow", playerId: "jose-vasco-duplicate-test", teamId: "vasco-test", minute: 80 }
    ]
  });

  store = mergeDuplicatePlayer(store, TEST_LEAGUE_ID, { targetPlayerId: "jose-naranja-test", duplicatePlayerId: "jose-vasco-duplicate-test" });
  league = store.leagues.find((item) => item.id === TEST_LEAGUE_ID);
  assert.equal(league.players.some((player) => player.id === "jose-vasco-duplicate-test"), false);
  assert.equal(getPlayerNumberForTeam(league, "jose-naranja-test", "vasco-test"), 15);
  assert.equal(getEligiblePlayersForTeam(league, "vasco-test").some((player) => player.id === "jose-naranja-test"), true);

  let discipline = calculateYellowCardDiscipline(league);
  let joseDiscipline = discipline.find((row) => row.player.id === "jose-naranja-test");
  assert.equal(joseDiscipline.status, "suspended");
  assert.equal(joseDiscipline.yellowCards, 3);
  let notices = calculateSuspensionNotices(league);
  assert.ok(notices.some((notice) => notice.player.id === "jose-naranja-test" && notice.type === "Acumulacion" && notice.status === "active"));

  store = addDisciplineReset(store, TEST_LEAGUE_ID, { playerId: "jose-naranja-test", date: "2026-06-09", reason: "Cumplio sancion de prueba" });

  store = saveMatchSheet(store, TEST_LEAGUE_ID, {
    matchId: "primera-j3-red-test",
    homeGoals: 2,
    awayGoals: 0,
    events: [
      { type: "goal", playerId: "rival-primera-test", teamId: "primera-rival-test", minute: 16 },
      { type: "own_goal", playerId: "jose-naranja-test", teamId: "primera-rival-test", minute: 70 },
      { type: "red", playerId: "jose-naranja-test", teamId: "vasco-test", minute: 85, suspensionMatches: 1, reason: "Conducta violenta" }
    ]
  });

  store = addDisciplineAdjustment(store, TEST_LEAGUE_ID, { playerId: "jose-naranja-test", competitionId: "primera-test", direction: "add", value: 1, date: "2026-06-16", reason: "Ajuste de prueba" });
  store = addDisciplineAdjustment(store, TEST_LEAGUE_ID, { playerId: "jose-naranja-test", competitionId: "primera-test", direction: "subtract", value: 1, date: "2026-06-17", reason: "Correccion de prueba" });

  league = store.leagues.find((item) => item.id === TEST_LEAGUE_ID);
  const breakdown = getPlayerSeasonBreakdown(league, "jose-naranja-test");
  assert.equal(breakdown.totals.goals, 3);
  assert.equal(breakdown.rows.find((row) => row.team.id === "naranja-test").goals, 1);
  assert.equal(breakdown.rows.find((row) => row.team.id === "vasco-test").goals, 2);

  const primeraStats = calculatePlayerStats(scopeLeagueToCompetition(league, "primera-test"));
  const josePrimera = primeraStats.find((row) => row.player.id === "jose-naranja-test");
  const starPrimera = primeraStats.find((row) => row.player.id === "star-vasco-test");
  assert.equal(josePrimera.goals, 2);
  assert.equal(josePrimera.team.id, "vasco-test");
  assert.equal(starPrimera.goals, 3);
  const vascoRanking = primeraStats
    .filter((row) => getEligiblePlayersForTeam(league, "vasco-test").some((player) => player.id === row.player.id))
    .sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name));
  assert.equal(vascoRanking.findIndex((row) => row.player.id === "jose-naranja-test") + 1, 2);

  discipline = calculateYellowCardDiscipline(league);
  assert.equal(discipline.some((row) => row.player.id === "jose-naranja-test"), false);
  notices = calculateSuspensionNotices(league);
  assert.ok(notices.some((notice) => notice.player.id === "jose-naranja-test" && notice.type === "Expulsion" && notice.status === "active"));
  assert.equal(getPlayerSeasonBreakdown(league, "jose-naranja-test").totals.goals, 3);

  await request("/store", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify(store)
  });
  const persistedStore = normalizeStore(await request("/store", { headers: authHeaders }));
  const persistedLeague = persistedStore.leagues.find((item) => item.id === TEST_LEAGUE_ID);
  assert.equal(persistedLeague.rules.disciplineScope, "league");
  assert.equal(persistedLeague.teamAffiliations.length, 1);
  assert.equal(getPlayerNumberForTeam(persistedLeague, "jose-naranja-test", "vasco-test"), 15);
  assert.equal(persistedLeague.disciplineAdjustments.length, 2);
  assert.equal(persistedLeague.disciplineResets.length, 1);
  assert.equal(getPlayerSeasonBreakdown(persistedLeague, "jose-naranja-test").totals.goals, 3);

  console.log("Prueba local de afiliaciones OK");
  console.log("- Afiliacion Naranja -> Vasco Jr sin duplicar jugador");
  console.log("- Fusion de duplicado conserva historial y numero alterno");
  console.log("- Goles por equipo: Naranja 1, Vasco Jr 2, total 3");
  console.log("- Ranking Vasco Jr usa 2 goles del equipo receptor");
  console.log("- Amarillas compartidas suspenden con 3 y reset limpia disciplina vigente");
  console.log("- Roja genera suspension activa");
  console.log("- Persistencia API SQLite conserva afiliacion, reglas, ajustes y reset");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

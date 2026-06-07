import assert from "node:assert/strict";
import { seedData } from "../src/data/seedData.js";
import {
  addPlayerInjury,
  addPlayerSanction,
  addTeam,
  deleteLeague,
  deletePlayer,
  deletePlayerInjury,
  saveMatchSheet,
  saveResult,
  updatePlayerInjury,
  updateLeagueMembership,
  updateLeagueRules,
  updateTeam
} from "../src/lib/actions.js";
import {
  calculatePlayerStats,
  calculateStandings,
  calculateSuspensionNotices,
  getCurrentLeague,
  normalizeStore
} from "../src/lib/domain.js";
import { validatePlayerFullName } from "../src/lib/playerValidation.js";
import { hashPassword, verifyPassword } from "../server/password.js";

let store = normalizeStore(structuredClone(seedData));
let league = getCurrentLeague(store);

const standings = calculateStandings(league);
assert.equal(standings[0].team.name, "HALCONES FC");
assert.equal(standings[0].points, 3);

store = addTeam(store, league.id, { name: "Club Prueba", coach: "Responsable" });
league = getCurrentLeague(store);
assert.equal(league.teams.at(-1).name, "CLUB PRUEBA");

const createdTeamId = league.teams.at(-1).id;
store = updateTeam(store, league.id, createdTeamId, { name: "Club Prueba Editado", coach: "Responsable Dos", colors: "#123456" });
league = getCurrentLeague(store);
assert.equal(league.teams.find((team) => team.id === createdTeamId).name, "CLUB PRUEBA EDITADO");

store = updateTeam(store, league.id, "real", {
  name: "Real Alameda",
  coach: "Carlos Vega",
  colors: "#7c2d12",
  status: "withdrawn",
  withdrawnRound: 2,
  withdrawnReason: "Baja administrativa"
});
league = getCurrentLeague(store);
assert.equal(league.teams.find((team) => team.id === "real").status, "withdrawn");
assert.equal(league.matches.find((match) => match.id === "m3").status, "walkover");
assert.equal(league.matches.find((match) => match.id === "m3").awayGoals, 3);

store = updateLeagueMembership(store, league.id, {
  plan: "Membresia Premium",
  status: "suspended",
  ownerEmail: "admin.tinguindin@demo.com",
  renewalDate: "2026-08-01",
  membershipNotes: "Pago pendiente"
});
league = getCurrentLeague(store);
assert.equal(league.plan, "Membresia Premium");
assert.equal(league.status, "suspended");
assert.equal(league.membershipNotes, "PAGO PENDIENTE");

store = updateLeagueRules(store, league.id, {
  withdrawalPolicy: "award_walkover",
  forfeitPoints: 3,
  forfeitGoalsFor: 4,
  forfeitGoalsAgainst: 1,
  yellowSuspensionLimit: 1,
  defaultRedSuspensionMatches: 2,
  notes: "Regla de prueba"
});
league = getCurrentLeague(store);
assert.equal(league.rules.forfeitGoalsFor, 4);
assert.equal(league.rules.defaultRedSuspensionMatches, 2);

store = saveResult(store, league.id, {
  matchId: "m3",
  homeGoals: 1,
  awayGoals: 0,
  goals: "9",
  yellows: "5",
  reds: ""
});
league = getCurrentLeague(store);

const updatedMatch = league.matches.find((match) => match.id === "m3");
assert.equal(updatedMatch.status, "finished");
assert.equal(updatedMatch.homeGoals, 1);

const playerStats = calculatePlayerStats(league);
const diego = playerStats.find((row) => row.player.name === "DIEGO SALAS");
assert.equal(diego.goals, 3);
const tomas = playerStats.find((row) => row.player.name === "TOMAS LUNA");
assert.equal(tomas.suspensionMatches, 1);

store = addPlayerSanction(store, league.id, {
  playerId: "p5",
  type: "Agresion",
  matches: 12,
  reason: "Golpe a rival",
  date: "2026-06-10",
  notes: "Resolucion de comision disciplinaria"
});
league = getCurrentLeague(store);
const mario = calculatePlayerStats(league).find((row) => row.player.name === "MARIO GIL");
assert.equal(mario.suspensionMatches, 13);
assert.equal(mario.extraSanctions.length, 1);
const marioNotice = calculateSuspensionNotices(league).find((notice) => notice.player.id === "p5" && notice.type === "AGRESION");
assert.equal(marioNotice.status, "active");
assert.equal(marioNotice.remainingMatches, 12);

store = addPlayerInjury(store, league.id, {
  playerId: "p5",
  type: "Lesion de rodilla",
  date: "2026-06-11",
  expectedReturn: "2026-07-20",
  needsSurgery: "on",
  needsSupport: "on",
  supportDetail: "Apoyo para estudios medicos",
  notes: "Seguimiento con comision"
});
league = getCurrentLeague(store);
const marioInjury = league.injuries.find((injury) => injury.playerId === "p5");
assert.equal(marioInjury.type, "LESION DE RODILLA");
assert.equal(marioInjury.needsSurgery, true);
assert.equal(marioInjury.needsSupport, true);
assert.equal(marioInjury.supportDetail, "APOYO PARA ESTUDIOS MEDICOS");

store = updatePlayerInjury(store, league.id, marioInjury.id, {
  playerId: "p5",
  type: "Lesion de rodilla",
  date: "2026-06-11",
  expectedReturn: "2026-07-20",
  status: "recovered",
  notes: "Alta medica"
});
league = getCurrentLeague(store);
assert.equal(league.injuries.find((injury) => injury.id === marioInjury.id).status, "recovered");
assert.equal(league.injuries.find((injury) => injury.id === marioInjury.id).needsSupport, false);

store = addPlayerSanction(store, league.id, {
  playerId: "p1",
  type: "Sancion administrativa",
  matches: 1,
  reason: "Documentacion pendiente",
  date: "2026-06-10",
  notes: "Cumple al jugarse la jornada 2"
});
league = getCurrentLeague(store);
const diegoNotice = calculateSuspensionNotices(league).find((notice) => notice.player.id === "p1" && notice.type === "SANCION ADMINISTRATIVA");
assert.equal(diegoNotice.status, "available");
assert.equal(diegoNotice.remainingMatches, 0);

const passwordHash = hashPassword("admin123");
assert.equal(verifyPassword("admin123", passwordHash), true);
assert.equal(verifyPassword("mal-password", passwordHash), false);
assert.equal(validatePlayerFullName("JUAN PEREZ").valid, true);
assert.equal(validatePlayerFullName("JUAN").valid, false);

const multiLeagueStore = normalizeStore({
  ...structuredClone(seedData),
  currentLeagueId: "liga-centro",
  leagues: [
    ...structuredClone(seedData.leagues),
    {
      ...structuredClone(seedData.leagues[0]),
      id: "liga-eliminar",
      name: "Liga a eliminar",
      teams: [{ id: "team-eliminar", name: "Equipo Eliminado", coach: "", colors: "#111111", status: "active" }],
      players: [{ id: "player-eliminar", teamId: "team-eliminar", name: "Jugador Eliminado", number: 1, position: "Portero", status: "active" }],
      matches: [],
      sanctions: [],
      competitions: [{ id: "comp-eliminar", name: "Torneo Eliminado", type: "liga", season: "2026", status: "active", activeRound: 1, startsAt: "", endsAt: "" }],
      currentCompetitionId: "comp-eliminar"
    }
  ]
});
const cleanedStore = deleteLeague(multiLeagueStore, "liga-eliminar");
assert.equal(cleanedStore.leagues.some((item) => item.id === "liga-eliminar"), false);
assert.equal(cleanedStore.leagues.some((item) => item.teams?.some((team) => team.id === "team-eliminar")), false);
assert.equal(cleanedStore.leagues.some((item) => item.players?.some((player) => player.id === "player-eliminar")), false);

assert.throws(() => saveMatchSheet(store, league.id, {
  matchId: "m4",
  homeGoals: 1,
  awayGoals: 0,
  events: []
}), /goleadores capturados/);

assert.throws(() => saveMatchSheet(store, league.id, {
  matchId: "m4",
  homeGoals: 0,
  awayGoals: 0,
  events: [
    { type: "red", playerId: "p5", minute: 70, suspensionMatches: 2, reason: "" }
  ]
}), /tarjeta roja debe tener motivo/);

store = saveMatchSheet(store, league.id, {
  matchId: "m4",
  homeGoals: 2,
  awayGoals: 0,
  events: [
    { type: "goal", playerId: "p3", minute: 12 },
    { type: "goal", playerId: "p4", minute: 55 },
    { type: "red", playerId: "p5", minute: 70, suspensionMatches: 2, reason: "Conducta violenta" }
  ]
});
league = getCurrentLeague(store);
const acta = league.matches.find((match) => match.id === "m4");
assert.equal(acta.status, "finished");
assert.equal(acta.events.length, 3);
assert.equal(acta.events.find((event) => event.type === "red").suspensionMatches, 2);

store = deletePlayerInjury(store, league.id, marioInjury.id);
league = getCurrentLeague(store);
assert.equal(league.injuries.some((injury) => injury.id === marioInjury.id), false);

store = deletePlayer(store, league.id, "p5");
league = getCurrentLeague(store);
assert.equal(league.players.some((player) => player.id === "p5"), false);
assert.equal(league.sanctions.some((sanction) => sanction.playerId === "p5"), false);
assert.equal(league.matches.find((match) => match.id === "m4").events.some((event) => event.playerId === "p5"), false);

console.log("Dominio deportivo OK");

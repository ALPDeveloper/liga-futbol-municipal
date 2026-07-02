import assert from "node:assert/strict";
import { seedData } from "../src/data/seedData.js";
import {
  addCompetition,
  addAppearanceAdjustment,
  addDisciplineAdjustment,
  addDisciplineLink,
  addDisciplineReset,
  addPlayerInjury,
  addPlayerSanction,
  addAnnouncement,
  addMatch,
  addSponsor,
  addTeam,
  addTeamAffiliation,
  deleteLeague,
  deleteAppearanceAdjustment,
  deleteAnnouncement,
  deletePlayer,
  deletePlayerInjury,
  deletePlayoffMatches,
  deleteSponsor,
  generatePlayoffBracket,
  mergeDuplicatePlayer,
  generateSchedule,
  saveMatchSheet,
  saveResult,
  updatePlayerInjury,
  updateTeamAffiliationPlayerNumber,
  updateLeagueMembership,
  updateLeagueRules,
  updateAnnouncement,
  updateSponsor,
  updateTeam
} from "../src/lib/actions.js";
import {
  calculatePlayerStats,
  calculatePlayerAppearanceEligibility,
  calculateStandings,
  calculateSuspensionNotices,
  calculateYellowCardDiscipline,
  buildSmartHighlights,
  getCurrentLeague,
  getEligibleTeamIdsForPlayer,
  getEligiblePlayersForTeam,
  getPlayerNumberForTeam,
  getPlayerSeasonBreakdown,
  normalizeStore,
  playoffMatches,
  regularMatches,
  sanitizeExternalUrl,
  sanitizeImageUrl,
  scopeLeagueToCompetition
} from "../src/lib/domain.js";
import { updateMatchSheetEventItem } from "../src/lib/matchSheet.js";
import { findDuplicatePlayer, validatePlayerFullName } from "../src/lib/playerValidation.js";
import { hashPassword, verifyPassword } from "../server/password.js";

let store = normalizeStore(structuredClone(seedData));
let league = getCurrentLeague(store);

const standings = calculateStandings(league);
assert.equal(standings[0].team.name, "HALCONES FC");
assert.equal(standings[0].points, 3);
assert.equal(scopeLeagueToCompetition(league, "comp-copa-tinguindin-2026").teams.length, 0);
const hugoNotice = calculateSuspensionNotices(league).find((notice) => notice.player.id === "p6" && notice.type === "Expulsion");
assert.equal(hugoNotice.remainingMatches, 1);
assert.equal(hugoNotice.returnRound, 3);

let disciplineStore = normalizeStore({
  currentLeagueId: "liga-disciplina",
  leagues: [
    {
      id: "liga-disciplina",
      name: "Liga Disciplina",
      city: "Ciudad",
      season: "2026",
      currentCompetitionId: "primera",
      competitions: [
        { id: "primera", name: "Primera", season: "2026", status: "active" },
        { id: "segunda", name: "Segunda", season: "2026", status: "active" }
      ],
      rules: { disciplineScope: "league", yellowSuspensionLimit: 3 },
      identity: {},
      teams: [
        { id: "primera-a", competitionId: "primera", name: "Primera A" },
        { id: "segunda-a", competitionId: "segunda", name: "Segunda A" }
      ],
      players: [
        { id: "juan-primera", competitionId: "primera", teamId: "primera-a", name: "Juan Perez", number: 10 },
        { id: "juan-segunda", competitionId: "segunda", teamId: "segunda-a", name: "Juan Perez", number: 10 }
      ],
      matches: [
        {
          id: "disciplina-1",
          competitionId: "segunda",
          round: 1,
          date: "2026-01-01",
          status: "finished",
          homeTeamId: "segunda-a",
          awayTeamId: "primera-a",
          events: [
            { type: "yellow", playerId: "juan-segunda", teamId: "segunda-a" },
            { type: "yellow", playerId: "juan-segunda", teamId: "segunda-a" }
          ]
        },
        {
          id: "disciplina-2",
          competitionId: "primera",
          round: 2,
          date: "2026-01-02",
          status: "finished",
          homeTeamId: "primera-a",
          awayTeamId: "segunda-a",
          events: [{ type: "yellow", playerId: "juan-primera", teamId: "primera-a" }]
        }
      ],
      sanctions: [],
      injuries: []
    }
  ]
});
disciplineStore = addDisciplineLink(disciplineStore, "liga-disciplina", { playerId: "juan-primera", linkedPlayerId: "juan-segunda" });
let disciplineLeague = getCurrentLeague(disciplineStore);
let disciplineRows = calculateYellowCardDiscipline(disciplineLeague);
assert.equal(disciplineRows.length, 2);
const segundaDiscipline = disciplineRows.find((row) => row.competition?.id === "segunda");
const primeraDiscipline = disciplineRows.find((row) => row.competition?.id === "primera");
assert.equal(segundaDiscipline.yellowCards, 2);
assert.equal(segundaDiscipline.status, "warning");
assert.equal(primeraDiscipline.yellowCards, 1);
assert.equal(primeraDiscipline.status, "tracking");
disciplineStore = addDisciplineReset(disciplineStore, "liga-disciplina", { playerId: "juan-primera", date: "2026-01-03", reason: "Cumplio sancion" });
disciplineLeague = getCurrentLeague(disciplineStore);
disciplineRows = calculateYellowCardDiscipline(disciplineLeague);
assert.equal(disciplineRows.length, 0);

let affiliationStore = normalizeStore({
  currentLeagueId: "liga-afiliacion",
  leagues: [
    {
      id: "liga-afiliacion",
      name: "Liga Afiliacion",
      city: "Ciudad",
      season: "2026",
      currentCompetitionId: "primera",
      competitions: [
        { id: "primera", name: "Primera", season: "2026", status: "active" },
        { id: "segunda", name: "Segunda", season: "2026", status: "active" }
      ],
      rules: { disciplineScope: "league", yellowSuspensionLimit: 3 },
      identity: {},
      teams: [
        { id: "fresno", competitionId: "primera", name: "Fresno Hass" },
        { id: "primera-rival", competitionId: "primera", name: "Primera Rival" },
        { id: "guascuaro", competitionId: "segunda", name: "Guascuaro" },
        { id: "segunda-rival", competitionId: "segunda", name: "Segunda Rival" }
      ],
      players: [
        { id: "juan-guascuaro", competitionId: "segunda", teamId: "guascuaro", name: "Juan Afiliado", number: 10 },
        { id: "juan-fresno", competitionId: "primera", teamId: "fresno", name: "#15 Juan Afiliado", number: 15 }
      ],
      matches: [
        {
          id: "aff-segunda",
          competitionId: "segunda",
          round: 1,
          date: "2026-02-01",
          status: "scheduled",
          homeTeamId: "guascuaro",
          awayTeamId: "segunda-rival",
          events: []
        },
        {
          id: "aff-primera",
          competitionId: "primera",
          round: 2,
          date: "2026-02-02",
          status: "scheduled",
          homeTeamId: "fresno",
          awayTeamId: "primera-rival",
          events: []
        },
        {
          id: "aff-proximo",
          competitionId: "segunda",
          round: 3,
          date: "2026-02-04",
          status: "scheduled",
          homeTeamId: "guascuaro",
          awayTeamId: "segunda-rival",
          events: []
        }
      ],
      sanctions: [],
      injuries: []
    }
  ]
});
affiliationStore = addTeamAffiliation(affiliationStore, "liga-afiliacion", { sourceTeamId: "guascuaro", targetTeamId: "fresno" });
let affiliationLeague = getCurrentLeague(affiliationStore);
assert.equal(getEligiblePlayersForTeam(affiliationLeague, "fresno").some((player) => player.id === "juan-guascuaro"), true);
const affiliationId = affiliationLeague.teamAffiliations[0].id;
affiliationStore = updateTeamAffiliationPlayerNumber(affiliationStore, "liga-afiliacion", affiliationId, { playerId: "juan-guascuaro", number: 14 });
assert.equal(getPlayerNumberForTeam(getCurrentLeague(affiliationStore), "juan-guascuaro", "fresno"), 14);

affiliationStore = saveMatchSheet(affiliationStore, "liga-afiliacion", {
  matchId: "aff-segunda",
  homeGoals: 1,
  awayGoals: 0,
  events: [
    { type: "goal", playerId: "juan-guascuaro", teamId: "guascuaro", minute: 11 },
    { type: "yellow", playerId: "juan-guascuaro", teamId: "guascuaro", minute: 30 },
    { type: "yellow", playerId: "juan-guascuaro", teamId: "guascuaro", minute: 70 }
  ]
});
affiliationStore = saveMatchSheet(affiliationStore, "liga-afiliacion", {
  matchId: "aff-primera",
  homeGoals: 1,
  awayGoals: 0,
  events: [
    { type: "goal", playerId: "juan-fresno", teamId: "fresno", minute: 20 },
    { type: "yellow", playerId: "juan-fresno", teamId: "fresno", minute: 50 }
  ]
});
affiliationStore = mergeDuplicatePlayer(affiliationStore, "liga-afiliacion", { targetPlayerId: "juan-guascuaro", duplicatePlayerId: "juan-fresno" });
affiliationLeague = getCurrentLeague(affiliationStore);
assert.equal(affiliationLeague.players.some((player) => player.id === "juan-fresno"), false);
assert.equal(getPlayerNumberForTeam(affiliationLeague, "juan-guascuaro", "fresno"), 15);
assert.equal(affiliationLeague.matches.find((match) => match.id === "aff-primera").events[0].playerId, "juan-guascuaro");
assert.equal(affiliationLeague.matches.find((match) => match.id === "aff-primera").events[0].teamId, "fresno");
const primeraAffiliationStats = calculatePlayerStats(scopeLeagueToCompetition(affiliationLeague, "primera")).find((row) => row.player.id === "juan-guascuaro");
const segundaAffiliationStats = calculatePlayerStats(scopeLeagueToCompetition(affiliationLeague, "segunda")).find((row) => row.player.id === "juan-guascuaro");
assert.equal(primeraAffiliationStats.goals, 1);
assert.equal(primeraAffiliationStats.team.id, "fresno");
assert.equal(segundaAffiliationStats.goals, 1);
assert.equal(segundaAffiliationStats.team.id, "guascuaro");
const affiliationBreakdown = getPlayerSeasonBreakdown(affiliationLeague, "juan-guascuaro");
assert.equal(affiliationBreakdown.hasAffiliation, true);
assert.equal(affiliationBreakdown.totals.goals, 2);
assert.equal(affiliationBreakdown.totals.yellowCards, 3);
let affiliationDisciplineRows = calculateYellowCardDiscipline(affiliationLeague);
assert.equal(affiliationDisciplineRows.length, 2);
assert.equal(affiliationDisciplineRows.find((row) => row.competition?.id === "segunda").status, "warning");
assert.equal(affiliationDisciplineRows.find((row) => row.competition?.id === "primera").status, "tracking");
affiliationStore = addDisciplineAdjustment(affiliationStore, "liga-afiliacion", {
  playerId: "juan-guascuaro",
  competitionId: "segunda",
  value: 1,
  date: "2026-02-03",
  reason: "Ajuste de prueba"
});
affiliationLeague = getCurrentLeague(affiliationStore);
affiliationDisciplineRows = calculateYellowCardDiscipline(affiliationLeague);
assert.equal(affiliationDisciplineRows.find((row) => row.competition?.id === "segunda").status, "suspended");
assert.equal(calculateSuspensionNotices(affiliationLeague).find((notice) => notice.player.id === "juan-guascuaro").status, "active");
assert.equal(getEligibleTeamIdsForPlayer(affiliationLeague, "juan-guascuaro").length, 2);
affiliationStore = addDisciplineReset(affiliationStore, "liga-afiliacion", { playerId: "juan-guascuaro", date: "2026-02-03", reason: "Cumplio sancion" });
assert.equal(calculateYellowCardDiscipline(getCurrentLeague(affiliationStore)).length, 0);

store = addTeam(store, league.id, {
  name: "Club Prueba",
  coach: "Responsable",
  assistantCoach: "Auxiliar Prueba",
  address: "Cancha Norte",
  colors: "#abcdef",
  logoUrl: "data:image/png;base64,ESCUDO1"
});
league = getCurrentLeague(store);
assert.equal(league.teams.at(-1).name, "CLUB PRUEBA");
assert.equal(league.teams.at(-1).competitionId, league.currentCompetitionId);
assert.equal(league.teams.at(-1).assistantCoach, "AUXILIAR PRUEBA");
assert.equal(league.teams.at(-1).address, "CANCHA NORTE");
assert.equal(league.teams.at(-1).colors, "#abcdef");
assert.equal(league.teams.at(-1).logoUrl, "data:image/png;base64,ESCUDO1");

const createdTeamId = league.teams.at(-1).id;
store = updateTeam(store, league.id, createdTeamId, {
  name: "Club Prueba Editado",
  coach: "Responsable Dos",
  assistantCoach: "",
  address: "Cancha Sur",
  colors: "#123456",
  logoUrl: ""
});
league = getCurrentLeague(store);
assert.equal(league.teams.find((team) => team.id === createdTeamId).name, "CLUB PRUEBA EDITADO");
assert.equal(league.teams.find((team) => team.id === createdTeamId).assistantCoach, "");
assert.equal(league.teams.find((team) => team.id === createdTeamId).address, "CANCHA SUR");
assert.equal(league.teams.find((team) => team.id === createdTeamId).logoUrl, "");

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

store = updateTeam(store, league.id, "real", {
  name: "Real Alameda",
  coach: "Carlos Vega",
  colors: "#7c2d12",
  status: "active",
  withdrawnRound: "",
  withdrawnReason: ""
});
league = getCurrentLeague(store);
assert.equal(league.teams.find((team) => team.id === "real").status, "active");
assert.equal(league.matches.find((match) => match.id === "m3").status, "scheduled");
assert.equal(league.matches.find((match) => match.id === "m3").homeGoals, null);
assert.equal(league.matches.find((match) => match.id === "m3").awayGoals, null);

store = addAnnouncement(store, league.id, {
  title: "Cambio de sede",
  body: "La jornada se jugara en la unidad norte",
  status: "active",
  date: "2026-06-12"
});
league = getCurrentLeague(store);
const announcementId = league.announcements.at(-1).id;
assert.equal(league.announcements.at(-1).title, "CAMBIO DE SEDE");
store = updateAnnouncement(store, league.id, announcementId, {
  title: "Cambio de sede",
  body: "La jornada se jugara en la unidad sur",
  status: "archived",
  date: "2026-06-12"
});
league = getCurrentLeague(store);
assert.equal(league.announcements.find((announcement) => announcement.id === announcementId).status, "archived");
store = deleteAnnouncement(store, league.id, announcementId);
league = getCurrentLeague(store);
assert.equal(league.announcements.some((announcement) => announcement.id === announcementId), false);

store = addSponsor(store, league.id, {
  name: "Panaderia Local",
  placement: "home_banner",
  status: "active",
  imageUrl: "data:image/png;base64,AAAA",
  linkUrl: "https://patrocinador.test",
  sortOrder: 2,
  notes: "Pago mensual"
});
league = getCurrentLeague(store);
const sponsorId = league.sponsors.at(-1).id;
assert.equal(league.sponsors.at(-1).name, "PANADERIA LOCAL");
assert.equal(league.sponsors.at(-1).sortOrder, 2);
assert.equal(sanitizeExternalUrl("javascript:alert(1)"), "");
assert.equal(sanitizeImageUrl("data:text/html;base64,PHNjcmlwdA=="), "");
store = updateSponsor(store, league.id, sponsorId, {
  name: "Panaderia Local Centro",
  placement: "home_banner",
  status: "inactive",
  imageUrl: "data:image/png;base64,BBBB",
  linkUrl: "",
  sortOrder: 1,
  notes: "Pausa temporal"
});
league = getCurrentLeague(store);
assert.equal(league.sponsors.find((sponsor) => sponsor.id === sponsorId).status, "inactive");
assert.equal(league.sponsors.find((sponsor) => sponsor.id === sponsorId).imageUrl, "data:image/png;base64,BBBB");
store = deleteSponsor(store, league.id, sponsorId);
league = getCurrentLeague(store);
assert.equal(league.sponsors.some((sponsor) => sponsor.id === sponsorId), false);

store = addCompetition(store, league.id, {
  name: "Liga Femenil",
  type: "liga",
  season: "Apertura 2026",
  status: "active",
  activeRound: "",
  startsAt: "",
  endsAt: ""
});
league = getCurrentLeague(store);
const femenilCompetitionId = league.competitions.find((competition) => competition.name === "LIGA FEMENIL").id;
store = addTeam(store, league.id, { competitionId: femenilCompetitionId, name: "Femenil Norte", coach: "Responsable Femenil" });
league = getCurrentLeague(store);
assert.equal(scopeLeagueToCompetition(league, femenilCompetitionId).teams.length, 1);
assert.equal(scopeLeagueToCompetition(league, league.currentCompetitionId).teams.some((team) => team.name === "FEMENIL NORTE"), false);

const regularBeforePlayoff = regularMatches(league).length;
store = addMatch(store, league.id, {
  competitionId: league.currentCompetitionId,
  stage: "playoff",
  round: "0",
  playoffRound: "Semifinal",
  playoffLeg: "Ida",
  date: "2026-07-01",
  time: "18:00",
  venue: "Cancha Municipal",
  homeTeamId: "halcones",
  awayTeamId: "union",
  aggregateHome: "",
  aggregateAway: ""
});
league = getCurrentLeague(store);
assert.equal(regularMatches(league).length, regularBeforePlayoff);
assert.equal(playoffMatches(league).at(-1).playoffRound, "SEMIFINAL");
assert.equal(playoffMatches(league).at(-1).round, 0);
const playoffCountBeforeAuto = playoffMatches(league).length;
store = generatePlayoffBracket(store, league.id, {
  competitionId: league.currentCompetitionId,
  phase: "semifinal",
  legMode: "two_legs",
  startDate: "2026-07-08"
});
league = getCurrentLeague(store);
assert.equal(regularMatches(league).length, regularBeforePlayoff);
assert.equal(playoffMatches(league).length, playoffCountBeforeAuto + 4);
assert.equal(playoffMatches(league).at(-1).playoffRound, "SEMIFINAL");
assert.equal(playoffMatches(league).at(-1).playoffLeg, "VUELTA");
store = deletePlayoffMatches(store, league.id, { competitionId: league.currentCompetitionId });
league = getCurrentLeague(store);
assert.equal(playoffMatches(league).length, 0);
assert.equal(regularMatches(league).length, regularBeforePlayoff);

const seededPlayoffStore = normalizeStore({
  currentLeagueId: "liga-siembra",
  leagues: [
    {
      id: "liga-siembra",
      name: "Liga Siembra",
      city: "Ciudad Prueba",
      season: "2026",
      currentCompetitionId: "comp-siembra",
      competitions: [
        { id: "comp-siembra", name: "Liga", type: "liga", season: "2026", status: "active" },
        { id: "comp-otra-categoria", name: "Copa", type: "copa", season: "2026", status: "active" }
      ],
      status: "active",
      plan: "Sin limite",
      ownerEmail: "siembra@demo.com",
      renewalDate: "",
      adBanner: "",
      identity: {},
      highlights: [],
      announcements: [],
      teams: Array.from({ length: 32 }, (_, index) => ({
        id: `seed-team-${String(index + 1).padStart(2, "0")}`,
        competitionId: "comp-siembra",
        name: `Equipo ${String(index + 1).padStart(2, "0")}`,
        coach: "",
        colors: "#123456",
        status: "active"
      })).concat([
        { id: "otra-categoria-1", competitionId: "comp-otra-categoria", name: "Otra Categoria 1", coach: "", colors: "#111111", status: "active" },
        { id: "otra-categoria-2", competitionId: "comp-otra-categoria", name: "Otra Categoria 2", coach: "", colors: "#222222", status: "active" }
      ]),
      players: [],
      matches: [],
      sanctions: [],
      injuries: []
    },
    {
      id: "liga-externa",
      name: "Liga Externa",
      city: "Otra Ciudad",
      season: "2026",
      currentCompetitionId: "comp-externa",
      competitions: [{ id: "comp-externa", name: "Liga Externa", type: "liga", season: "2026", status: "active" }],
      status: "active",
      plan: "Sin limite",
      ownerEmail: "externa@demo.com",
      renewalDate: "",
      adBanner: "",
      identity: {},
      highlights: [],
      announcements: [],
      teams: [
        { id: "externa-1", competitionId: "comp-externa", name: "Externa 1", coach: "", colors: "#333333", status: "active" },
        { id: "externa-2", competitionId: "comp-externa", name: "Externa 2", coach: "", colors: "#444444", status: "active" }
      ],
      players: [],
      matches: [],
      sanctions: [],
      injuries: []
    }
  ]
});
const seededRound16Store = generatePlayoffBracket(seededPlayoffStore, "liga-siembra", {
  competitionId: "comp-siembra",
  phase: "round16",
  legMode: "single",
  startDate: "2026-08-01"
});
const seededRound16League = seededRound16Store.leagues.find((item) => item.id === "liga-siembra");
const seededRound16Matches = playoffMatches(scopeLeagueToCompetition(seededRound16League, "comp-siembra"));
assert.equal(seededRound16Matches.length, 8);
assert.equal(seededRound16Matches[0].homeTeamId, "seed-team-01");
assert.equal(seededRound16Matches[0].awayTeamId, "seed-team-16");
assert.equal(playoffMatches(scopeLeagueToCompetition(seededRound16League, "comp-otra-categoria")).length, 0);
assert.equal(playoffMatches(seededRound16Store.leagues.find((item) => item.id === "liga-externa")).length, 0);

const seededRound32Store = generatePlayoffBracket(seededPlayoffStore, "liga-siembra", {
  competitionId: "comp-siembra",
  phase: "round32",
  legMode: "single",
  startDate: "2026-08-01"
});
const seededRound32League = seededRound32Store.leagues.find((item) => item.id === "liga-siembra");
const seededRound32Matches = playoffMatches(scopeLeagueToCompetition(seededRound32League, "comp-siembra"));
assert.equal(seededRound32Matches.length, 16);
assert.equal(seededRound32Matches[0].homeTeamId, "seed-team-01");
assert.equal(seededRound32Matches[0].awayTeamId, "seed-team-32");

store = updateLeagueMembership(store, league.id, {
  plan: "Sin limite",
  status: "suspended",
  ownerEmail: "admin.tinguindin@demo.com",
  renewalDate: "2026-08-01",
  membershipNotes: "Pago pendiente"
});
league = getCurrentLeague(store);
assert.equal(league.plan, "Sin limite");
assert.equal(league.status, "suspended");
assert.equal(league.membershipNotes, "PAGO PENDIENTE");

store = updateLeagueRules(store, league.id, {
  withdrawalPolicy: "award_walkover",
  forfeitPoints: 3,
  forfeitGoalsFor: 4,
  forfeitGoalsAgainst: 1,
  yellowSuspensionLimit: 1,
  defaultRedSuspensionMatches: 2,
  playoffQualifiers: 4,
  notes: "Regla de prueba"
});
league = getCurrentLeague(store);
assert.equal(league.rules.forfeitGoalsFor, 4);
assert.equal(league.rules.defaultRedSuspensionMatches, 2);
assert.equal(league.rules.playoffQualifiers, 4);

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

const yellowCycleLeague = normalizeStore({
  currentLeagueId: "liga-amarillas",
  leagues: [
    {
      id: "liga-amarillas",
      name: "Liga Amarillas",
      city: "Ciudad Prueba",
      season: "2026",
      currentCompetitionId: "comp-amarillas",
      competitions: [{ id: "comp-amarillas", name: "Liga", type: "liga", season: "2026", status: "active" }],
      status: "active",
      plan: "Sin limite",
      ownerEmail: "amarillas@demo.com",
      renewalDate: "",
      adBanner: "",
      identity: {},
      rules: {
        withdrawalPolicy: "award_walkover",
        forfeitPoints: 3,
        forfeitGoalsFor: 3,
        forfeitGoalsAgainst: 0,
        yellowSuspensionLimit: 3,
        defaultRedSuspensionMatches: 1,
        notes: ""
      },
      highlights: [],
      announcements: [],
      teams: [
        { id: "team-a", competitionId: "comp-amarillas", name: "Equipo A", coach: "", colors: "#111111", status: "active" },
        { id: "team-b", competitionId: "comp-amarillas", name: "Equipo B", coach: "", colors: "#222222", status: "active" }
      ],
      players: [
        { id: "player-a", teamId: "team-a", competitionId: "comp-amarillas", name: "Jugador A", number: 10, position: "Medio" }
      ],
      matches: [
        { id: "yc-1", competitionId: "comp-amarillas", round: 1, date: "2026-01-01", time: "", venue: "", homeTeamId: "team-a", awayTeamId: "team-b", status: "finished", homeGoals: 0, awayGoals: 0, events: [{ type: "yellow", playerId: "player-a", teamId: "team-a", minute: 20 }] },
        { id: "yc-2", competitionId: "comp-amarillas", round: 2, date: "2026-01-08", time: "", venue: "", homeTeamId: "team-b", awayTeamId: "team-a", status: "finished", homeGoals: 0, awayGoals: 0, events: [{ type: "yellow", playerId: "player-a", teamId: "team-a", minute: 30 }] },
        { id: "yc-3", competitionId: "comp-amarillas", round: 3, date: "2026-01-15", time: "", venue: "", homeTeamId: "team-a", awayTeamId: "team-b", status: "finished", homeGoals: 0, awayGoals: 0, events: [{ type: "yellow", playerId: "player-a", teamId: "team-a", minute: 40 }] },
        { id: "yc-4", competitionId: "comp-amarillas", round: 4, date: "2026-01-22", time: "", venue: "", homeTeamId: "team-b", awayTeamId: "team-a", status: "scheduled", homeGoals: null, awayGoals: null, events: [] }
      ],
      sanctions: [],
      injuries: []
    }
  ]
}).leagues[0];
const activeYellowDiscipline = calculateYellowCardDiscipline(yellowCycleLeague);
assert.equal(activeYellowDiscipline.length, 1);
assert.equal(activeYellowDiscipline[0].status, "suspended");
assert.equal(activeYellowDiscipline[0].yellowCards, 3);
assert.equal(calculateSuspensionNotices(yellowCycleLeague).find((notice) => notice.type === "Acumulacion").status, "active");

const servedYellowCycleLeague = {
  ...yellowCycleLeague,
  matches: yellowCycleLeague.matches.map((match) => (
    match.id === "yc-4"
      ? { ...match, status: "finished", homeGoals: 0, awayGoals: 0, events: [] }
      : match
  ))
};
assert.equal(calculateYellowCardDiscipline(servedYellowCycleLeague).length, 0);

const restartedYellowCycleLeague = {
  ...servedYellowCycleLeague,
  matches: [
    ...servedYellowCycleLeague.matches,
    { id: "yc-5", competitionId: "comp-amarillas", round: 5, date: "2026-01-29", time: "", venue: "", homeTeamId: "team-a", awayTeamId: "team-b", status: "finished", homeGoals: 0, awayGoals: 0, events: [{ type: "yellow", playerId: "player-a", teamId: "team-a", minute: 10 }] }
  ]
};
const restartedYellowDiscipline = calculateYellowCardDiscipline(restartedYellowCycleLeague);
assert.equal(restartedYellowDiscipline.length, 1);
assert.equal(restartedYellowDiscipline[0].yellowCards, 1);
assert.equal(restartedYellowDiscipline[0].remainingToSuspension, 2);

const fiveGoalHighlights = buildSmartHighlights(normalizeStore({
  currentLeagueId: "liga-goles",
  leagues: [
    {
      id: "liga-goles",
      name: "Liga Goles",
      city: "Ciudad Prueba",
      season: "2026",
      currentCompetitionId: "comp-goles",
      competitions: [{ id: "comp-goles", name: "Liga", type: "liga", season: "2026", status: "active" }],
      status: "active",
      plan: "Sin limite",
      ownerEmail: "goles@demo.com",
      renewalDate: "",
      adBanner: "",
      identity: {},
      highlights: [],
      announcements: [],
      teams: [
        { id: "goles-a", competitionId: "comp-goles", name: "Equipo Goles", coach: "", colors: "#111111", status: "active" },
        { id: "goles-b", competitionId: "comp-goles", name: "Rival", coach: "", colors: "#222222", status: "active" }
      ],
      players: [
        { id: "goleador-5", teamId: "goles-a", competitionId: "comp-goles", name: "Goleador Cinco", number: 9, position: "Delantero" }
      ],
      matches: [
        {
          id: "goles-m1",
          competitionId: "comp-goles",
          round: 2,
          date: "2026-02-01",
          time: "",
          venue: "",
          homeTeamId: "goles-a",
          awayTeamId: "goles-b",
          status: "finished",
          homeGoals: 5,
          awayGoals: 0,
          events: Array.from({ length: 5 }, () => ({ type: "goal", playerId: "goleador-5", teamId: "goles-a", minute: 0 }))
        }
      ],
      sanctions: [],
      injuries: []
    }
  ]
}).leagues[0]);
assert.equal(fiveGoalHighlights.some((highlight) => highlight.toLowerCase().includes("5 goles")), true);
assert.equal(fiveGoalHighlights.some((highlight) => /hattrick/i.test(highlight)), false);

const scheduleStoreBefore = store;
const scheduleLeagueBefore = getCurrentLeague(scheduleStoreBefore);
const scheduleCompetitionId = scheduleLeagueBefore.currentCompetitionId;
const scheduleTeamCount = scheduleLeagueBefore.teams.filter((team) => (team.competitionId || scheduleCompetitionId) === scheduleCompetitionId && team.status !== "withdrawn").length;
const singleTurnRounds = scheduleTeamCount % 2 === 0 ? scheduleTeamCount - 1 : scheduleTeamCount;
const scheduleStartRound = 40;
store = generateSchedule(store, scheduleLeagueBefore.id, {
  competitionId: scheduleCompetitionId,
  mode: "full",
  startRound: scheduleStartRound,
  startDate: "2026-07-01",
  intervalDays: 7,
  randomize: "",
  roundTrip: "on",
  replaceScheduled: ""
});
league = getCurrentLeague(store);
const roundTripMatches = league.matches.filter((match) => (
  match.competitionId === scheduleCompetitionId &&
  (match.stage || "regular") === "regular" &&
  Number(match.round) >= scheduleStartRound
));
assert.equal(new Set(roundTripMatches.map((match) => match.round)).size, singleTurnRounds * 2);
const firstTurnMatch = roundTripMatches.find((match) => Number(match.round) === scheduleStartRound);
const secondTurnMatch = roundTripMatches.find((match) => (
  Number(match.round) === scheduleStartRound + singleTurnRounds &&
  match.homeTeamId === firstTurnMatch.awayTeamId &&
  match.awayTeamId === firstTurnMatch.homeTeamId
));
assert.ok(secondTurnMatch);

const passwordHash = hashPassword("admin123");
assert.equal(verifyPassword("admin123", passwordHash), true);
assert.equal(verifyPassword("mal-password", passwordHash), false);
assert.equal(validatePlayerFullName("JUAN PEREZ").valid, true);
assert.equal(validatePlayerFullName("#3 JUAN PEREZ").valid, true);
assert.equal(validatePlayerFullName("JUAN").valid, false);
const duplicateValidationLeague = {
  ...league,
  players: [...league.players, { id: "player-duplicate-test", name: "JOSE PEREZ", teamId: "halcones" }]
};
assert.equal(findDuplicatePlayer(duplicateValidationLeague, { name: "  José   Pérez  " })?.name, "JOSE PEREZ");
assert.equal(findDuplicatePlayer(duplicateValidationLeague, { name: "#3 JOSE PEREZ" })?.name, "JOSE PEREZ");
assert.equal(findDuplicatePlayer(duplicateValidationLeague, { name: "JOSE PEREZ #3" })?.name, "JOSE PEREZ");
assert.equal(findDuplicatePlayer(duplicateValidationLeague, { name: "JOSE PEREZ" }, "player-duplicate-test")?.id, undefined);

const sheetEvent = {
  id: "event-test",
  type: "goal",
  teamId: "halcones",
  playerId: "p1",
  minute: "",
  suspensionMatches: 0,
  reason: ""
};
const playerChangedEvent = updateMatchSheetEventItem(sheetEvent, "playerId", "p2");
assert.equal(playerChangedEvent.playerId, "p2");
const teamChangedEvent = updateMatchSheetEventItem(sheetEvent, "teamId", "union", {
  getPlayersForTeam: (teamId) => teamId === "union" ? [{ id: "p3" }] : []
});
assert.equal(teamChangedEvent.teamId, "union");
assert.equal(teamChangedEvent.playerId, "p3");
const lockedGoalTeamEvent = updateMatchSheetEventItem(sheetEvent, "teamId", "union", {
  getPlayersForTeam: (teamId) => teamId === "union" ? [{ id: "p3" }] : [],
  lockGoalTeam: true
});
assert.equal(lockedGoalTeamEvent.teamId, "halcones");
assert.equal(lockedGoalTeamEvent.playerId, "p1");
const lockedCardEvent = updateMatchSheetEventItem({ ...sheetEvent, type: "yellow", lockedTeamId: "halcones" }, "teamId", "union", {
  getPlayersForTeam: (teamId) => teamId === "union" ? [{ id: "p3" }] : []
});
assert.equal(lockedCardEvent.teamId, "halcones");
assert.equal(lockedCardEvent.playerId, "p1");
const redChangedEvent = updateMatchSheetEventItem(sheetEvent, "type", "red", {
  defaultRedSuspensionMatches: 2
});
assert.equal(redChangedEvent.suspensionMatches, 2);
const redReasonChangedEvent = updateMatchSheetEventItem(redChangedEvent, "reason", "Conducta violenta");
assert.equal(redReasonChangedEvent.reason, "Conducta violenta");
const redSuspensionChangedEvent = updateMatchSheetEventItem(redReasonChangedEvent, "suspensionMatches", "3");
assert.equal(redSuspensionChangedEvent.suspensionMatches, "3");
const ownGoalChangedEvent = updateMatchSheetEventItem(sheetEvent, "type", "own_goal", {
  getPlayersForTeam: (teamId) => teamId === "halcones" ? [{ id: "p1" }] : [],
  getPlayersForEvent: (type, teamId) => type === "own_goal" && teamId === "halcones" ? [{ id: "p3" }] : [{ id: "p1" }],
  lockGoalTeam: true
});
assert.equal(ownGoalChangedEvent.teamId, "halcones");
assert.equal(ownGoalChangedEvent.playerId, "p3");

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
  observations: "Arbitro reporta incidentes al final del partido",
  events: [
    { type: "goal", playerId: "p3", minute: 12 },
    { type: "own_goal", playerId: "p5", teamId: "union", minute: 55 },
    { type: "red", playerId: "p5", minute: 70, suspensionMatches: 2, reason: "Conducta violenta" }
  ]
});
league = getCurrentLeague(store);
const acta = league.matches.find((match) => match.id === "m4");
assert.equal(acta.status, "finished");
assert.equal(acta.events.length, 3);
assert.equal(acta.observations, "ARBITRO REPORTA INCIDENTES AL FINAL DEL PARTIDO");
assert.equal(acta.events.find((event) => event.type === "own_goal").teamId, "union");
assert.equal(acta.events.find((event) => event.type === "red").suspensionMatches, 2);
assert.equal(calculatePlayerStats(league).find((row) => row.player.id === "p5").goals, 0);

store = saveMatchSheet(store, league.id, {
  matchId: "m3",
  homeGoals: 0,
  awayGoals: 5,
  status: "walkover",
  resolutionType: "no_show",
  resolutionNote: "Default administrativo 5-0 por inasistencia.",
  events: [
    { type: "goal", playerId: "p8", teamId: "real", minute: 18 },
    { type: "goal", playerId: "p8", teamId: "real", minute: 54 },
    { type: "goal", playerId: "p1", teamId: "halcones", minute: 72 },
    { type: "yellow", playerId: "p7", teamId: "real", minute: 80 }
  ]
});
league = getCurrentLeague(store);
const defaultActa = league.matches.find((match) => match.id === "m3");
assert.equal(defaultActa.status, "walkover");
assert.equal(defaultActa.homeGoals, 0);
assert.equal(defaultActa.awayGoals, 5);
assert.equal(defaultActa.events.length, 4);
assert.equal(defaultActa.resolutionType, "no_show");
const defaultStandings = calculateStandings(league);
const realDefaultRow = defaultStandings.find((row) => row.team.id === "real");
const halconesDefaultRow = defaultStandings.find((row) => row.team.id === "halcones");
assert.equal(realDefaultRow.goalsFor, 0);
assert.equal(realDefaultRow.goalsAgainst, 5);
assert.equal(halconesDefaultRow.goalsFor, 7);
assert.equal(halconesDefaultRow.goalsAgainst, 1);
const defaultStats = calculatePlayerStats(league);
assert.equal(defaultStats.find((row) => row.player.id === "p8").goals, 2);
assert.equal(defaultStats.find((row) => row.player.id === "p1").goals, 3);
assert.equal(defaultStats.find((row) => row.player.id === "p7").yellowCards, 1);

store = deletePlayerInjury(store, league.id, marioInjury.id);
league = getCurrentLeague(store);
assert.equal(league.injuries.some((injury) => injury.id === marioInjury.id), false);

store = deletePlayer(store, league.id, "p5");
league = getCurrentLeague(store);
assert.equal(league.players.some((player) => player.id === "p5"), false);
assert.equal(league.sanctions.some((sanction) => sanction.playerId === "p5"), false);
assert.equal(league.matches.find((match) => match.id === "m4").events.some((event) => event.playerId === "p5"), false);

store = updateLeagueRules(store, league.id, { ...league.rules, minimumPlayoffAppearances: 3 });
store = addAppearanceAdjustment(store, league.id, { playerId: "p1", value: 2, reason: "Correccion de asistencia" });
league = getCurrentLeague(store);
let appearanceEligibility = calculatePlayerAppearanceEligibility(league).get("p1");
assert.equal(appearanceEligibility.recognizedAppearances, 2);
assert.equal(appearanceEligibility.remaining, 1);
assert.equal(appearanceEligibility.eligible, false);
store = deleteAppearanceAdjustment(store, league.id, league.appearanceAdjustments[0].id);
league = getCurrentLeague(store);
appearanceEligibility = calculatePlayerAppearanceEligibility(league).get("p1");
assert.equal(appearanceEligibility.recognizedAppearances, 0);

console.log("Dominio deportivo OK");

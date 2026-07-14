import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligatec-referee-flow-"));
process.env.DB_PATH = path.join(tempDir, "workflow.sqlite");
process.env.SEED_DEMO_DATA = "false";
process.env.SEED_DEMO_USERS = "false";
process.env.DATABASE_PROVIDER = "sqlite";

const { hashPassword, verifyPassword } = await import("../server/password.js");
const {
  createUserData,
  createMatchReportData,
  createMatchReportSignatureData,
  getMatchReportData,
  getMatchTeamPinData,
  getStoreData,
  importStoreData,
  initializeData,
  listMatchReportSignaturesData,
  markMatchTeamPinSignedData,
  publishOfficialMatchFromReportData,
  upsertMatchRosterData,
  upsertMatchSessionData,
  upsertMatchTeamPinData
} = await import("../server/dataLayer.js");
const { saveMatchSheet } = await import("../src/lib/actions.js");
const { calculateStandings, calculateSuspensionNotices, normalizeStore } = await import("../src/lib/domain.js");
const { MATCH_CAPTURE_MODES, MATCH_REPORT_STATUSES } = await import("../src/lib/matchWorkflow.js");

await initializeData();

const leagueId = "liga-flow";
const matchId = "match-flow-1";
const homeTeamId = "team-home";
const awayTeamId = "team-away";
const homeCaptainId = "home-1";
const awayCaptainId = "away-1";
const refereeUserId = "referee-flow";
const homeDelegateId = "delegate-home";
const awayDelegateId = "delegate-away";

await createUserData({
  id: refereeUserId,
  leagueId: "",
  name: "Arbitro Flow",
  email: "arbitro-flow@ligatec.test",
  role: "referee",
  status: "active",
  passwordHash: hashPassword("ArbitroFlow123!")
});
await createUserData({
  id: homeDelegateId,
  leagueId: "",
  name: "Delegado Local",
  email: "delegado-local@ligatec.test",
  role: "team_delegate",
  status: "active",
  passwordHash: hashPassword("DelegadoFlow123!")
});
await createUserData({
  id: awayDelegateId,
  leagueId: "",
  name: "Delegado Visitante",
  email: "delegado-visitante@ligatec.test",
  role: "team_delegate",
  status: "active",
  passwordHash: hashPassword("DelegadoFlow123!")
});

const baseStore = normalizeStore({
  currentLeagueId: leagueId,
  leagues: [
    {
      id: leagueId,
      name: "Liga Flow",
      city: "Ciudad Flow",
      season: "2026",
      currentCompetitionId: "comp-flow",
      status: "active",
      plan: "pro",
      ownerEmail: "flow@ligatec.test",
      renewalDate: "",
      adBanner: "",
      membershipNotes: "",
      identity: {},
      rules: { defaultRedSuspensionMatches: 1, disciplineScope: "competition", yellowSuspensionLimit: 3 },
      highlights: [],
      announcements: [],
      sponsors: [],
      memberships: [],
      competitions: [{ id: "comp-flow", name: "Primera Fuerza", season: "2026", status: "active" }],
      teams: [
        { id: homeTeamId, competitionId: "comp-flow", name: "Local FC", coach: "", colors: "" },
        { id: awayTeamId, competitionId: "comp-flow", name: "Visitante FC", coach: "", colors: "" }
      ],
      players: [
        { id: homeCaptainId, competitionId: "comp-flow", teamId: homeTeamId, name: "Capitan Local", number: 10, position: "Delantero", status: "active" },
        { id: "home-2", competitionId: "comp-flow", teamId: homeTeamId, name: "Defensa Local", number: 5, position: "Defensor", status: "active" },
        { id: awayCaptainId, competitionId: "comp-flow", teamId: awayTeamId, name: "Capitan Visitante", number: 9, position: "Delantero", status: "active" },
        { id: "away-2", competitionId: "comp-flow", teamId: awayTeamId, name: "Medio Visitante", number: 8, position: "Mediocampista", status: "active" }
      ],
      matches: [
        {
          id: matchId,
          competitionId: "comp-flow",
          round: 8,
          date: "2026-07-19",
          time: "10:00",
          venue: "Campo Flow",
          homeTeamId,
          awayTeamId,
          status: "scheduled",
          centralRefereeUserId: refereeUserId,
          events: []
        }
      ],
      sanctions: [],
      injuries: [],
      teamAffiliations: [],
      disciplineLinks: [],
      disciplineAdjustments: [],
      disciplineResets: [],
      appearanceAdjustments: [],
      matchRosters: []
    }
  ]
});

await importStoreData(baseStore);

const homePin = "472916";
const awayPin = "836421";
await upsertMatchRosterData({
  id: "roster-home",
  leagueId,
  matchId,
  teamId: homeTeamId,
  submittedByUserId: homeDelegateId,
  captainPlayerId: homeCaptainId,
  goalkeeperPlayerId: "home-2",
  captainPin: homePin,
  players: [{ playerId: homeCaptainId }, { playerId: "home-2" }],
  starters: [homeCaptainId, "home-2"],
  substitutes: [],
  lineup: { captainPlayerId: homeCaptainId, goalkeeperPlayerId: "home-2", starters: [homeCaptainId, "home-2"], substitutes: [] }
});
await upsertMatchRosterData({
  id: "roster-away",
  leagueId,
  matchId,
  teamId: awayTeamId,
  submittedByUserId: awayDelegateId,
  captainPlayerId: awayCaptainId,
  goalkeeperPlayerId: "away-2",
  captainPin: awayPin,
  players: [{ playerId: awayCaptainId }, { playerId: "away-2" }],
  starters: [awayCaptainId, "away-2"],
  substitutes: [],
  lineup: { captainPlayerId: awayCaptainId, goalkeeperPlayerId: "away-2", starters: [awayCaptainId, "away-2"], substitutes: [] }
});
await upsertMatchTeamPinData({
  id: "pin-home",
  leagueId,
  matchId,
  teamId: homeTeamId,
  rosterId: "roster-home",
  pinHash: hashPassword(homePin),
  generatedByUserId: homeDelegateId
});
await upsertMatchTeamPinData({
  id: "pin-away",
  leagueId,
  matchId,
  teamId: awayTeamId,
  rosterId: "roster-away",
  pinHash: hashPassword(awayPin),
  generatedByUserId: awayDelegateId
});

const secureHomePin = await getMatchTeamPinData(matchId, homeTeamId);
const secureAwayPin = await getMatchTeamPinData(matchId, awayTeamId);
assert.equal(verifyPassword(homePin, secureHomePin.pinHash), true);
assert.equal(verifyPassword("000000", secureAwayPin.pinHash), false);

const session = await upsertMatchSessionData({
  id: "session-flow",
  leagueId,
  matchId,
  refereeUserId,
  captureMode: MATCH_CAPTURE_MODES.LIVE,
  status: "match_finished",
  period: "2T",
  clockState: { liveElapsedSeconds: 5400 },
  metadata: { source: "smoke-test" }
});

const reportPayload = {
  homeGoals: 2,
  awayGoals: 1,
  events: [
    { type: "goal", playerId: homeCaptainId, teamId: homeTeamId, minute: 12 },
    { type: "goal", playerId: awayCaptainId, teamId: awayTeamId, minute: 45, minuteLabel: "45+1" },
    { type: "goal", playerId: "home-2", teamId: homeTeamId, minute: 70 },
    { type: "red", playerId: awayCaptainId, teamId: awayTeamId, minute: 88, reason: "Insultos al arbitro" }
  ],
  observations: "Acta de prueba completa"
};
const report = await createMatchReportData({
  id: "report-flow",
  leagueId,
  matchId,
  sessionId: session.id,
  generatedByUserId: refereeUserId,
  captureMode: MATCH_CAPTURE_MODES.LIVE,
  status: MATCH_REPORT_STATUSES.PENDING_CAPTAIN_REVIEW,
  payload: reportPayload,
  homeGoals: 2,
  awayGoals: 1
});

await createMatchReportSignatureData({
  id: "signature-home",
  reportId: report.id,
  leagueId,
  matchId,
  teamId: homeTeamId,
  captainPlayerId: homeCaptainId,
  signedByUserId: refereeUserId,
  method: "pin",
  metadata: { teamSide: "home" }
});
await markMatchTeamPinSignedData({ matchId, teamId: homeTeamId });
await createMatchReportSignatureData({
  id: "signature-away",
  reportId: report.id,
  leagueId,
  matchId,
  teamId: awayTeamId,
  captainPlayerId: awayCaptainId,
  signedByUserId: refereeUserId,
  method: "pin",
  metadata: { teamSide: "away" }
});
await markMatchTeamPinSignedData({ matchId, teamId: awayTeamId });

assert.equal((await listMatchReportSignaturesData(report.id)).length, 2);
assert.ok((await getMatchTeamPinData(matchId, homeTeamId)).signedAt);
assert.ok((await getMatchTeamPinData(matchId, awayTeamId)).signedAt);

const finalizedAt = new Date().toISOString();
const storeBeforePublish = await getStoreData();
const officialPayload = {
  matchId,
  homeGoals: report.homeGoals,
  awayGoals: report.awayGoals,
  observations: reportPayload.observations,
  status: "finished",
  captureMode: MATCH_CAPTURE_MODES.LIVE,
  resolutionType: "normal",
  events: reportPayload.events.map((event) => ({
    ...event,
    suspensionMatches: event.type === "red" ? 0 : event.suspensionMatches,
    suspensionIndefinite: false,
    disciplinaryPending: event.type === "red",
    reason: event.type === "red" ? event.reason : ""
  }))
};
const publishedStore = saveMatchSheet(storeBeforePublish, leagueId, officialPayload);
const publishedMatch = publishedStore.leagues[0].matches.find((match) => match.id === matchId);
await publishOfficialMatchFromReportData({ leagueId, match: publishedMatch, reportId: report.id, publishedAt: finalizedAt });

const storeAfterPublish = await getStoreData();
const leagueAfterPublish = storeAfterPublish.leagues[0];
const matchAfterPublish = leagueAfterPublish.matches.find((match) => match.id === matchId);
assert.equal(matchAfterPublish.status, "finished");
assert.equal(matchAfterPublish.workflowStatus, "published");
assert.equal(matchAfterPublish.currentReportId, report.id);
assert.equal(matchAfterPublish.homeGoals, 2);
assert.equal(matchAfterPublish.awayGoals, 1);
assert.equal(matchAfterPublish.events.length, 4);
assert.equal(matchAfterPublish.events.find((event) => event.type === "red").disciplinaryPending, true);
assert.equal((await getMatchReportData(report.id)).status, MATCH_REPORT_STATUSES.PUBLISHED);
assert.equal(calculateStandings(leagueAfterPublish).find((row) => row.team.id === homeTeamId).points, 3);
assert.equal(calculateSuspensionNotices(leagueAfterPublish).some((notice) => notice.player.id === awayCaptainId && notice.pendingReview), true);

const beforeReimportSignatures = await listMatchReportSignaturesData(report.id);
await importStoreData({
  ...storeAfterPublish,
  leagues: storeAfterPublish.leagues.map((league) => (
    league.id === leagueId ? { ...league, membershipNotes: "Cambio administrativo posterior al acta" } : league
  ))
});

assert.equal((await getMatchReportData(report.id)).status, MATCH_REPORT_STATUSES.PUBLISHED);
assert.equal((await listMatchReportSignaturesData(report.id)).length, beforeReimportSignatures.length);
assert.ok((await getMatchTeamPinData(matchId, homeTeamId)).signedAt);
assert.equal((await getStoreData()).leagues[0].membershipNotes, "CAMBIO ADMINISTRATIVO POSTERIOR AL ACTA");

console.log("Flujo arbitro-delegado-PIN-publicacion OK");

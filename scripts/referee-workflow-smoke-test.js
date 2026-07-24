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
  createMatchParticipationData,
  createMatchReportData,
  createMatchReportSignatureData,
  getMatchReportData,
  getMatchTeamPinData,
  getStoreData,
  importStoreData,
  initializeData,
  invalidateMatchReportSignaturesData,
  listMatchReportSignaturesData,
  listMatchParticipationsForLeagueData,
  markMatchTeamPinSignedData,
  publishOfficialMatchFromReportData,
  updateMatchReportPayloadData,
  upsertMatchRosterData,
  upsertMatchSessionData,
  upsertMatchTeamPinData
} = await import("../server/dataLayer.js");
const { saveMatchSheet } = await import("../src/lib/actions.js");
const { calculatePlayerAppearanceEligibility, calculateStandings, calculateSuspensionNotices, normalizeStore } = await import("../src/lib/domain.js");
const { MATCH_CAPTURE_MODES, MATCH_REPORT_STATUSES } = await import("../src/lib/matchWorkflow.js");

await initializeData();

const leagueId = "liga-flow";
const matchId = "match-flow-1";
const adminMatchId = "match-admin-flow-1";
const homeTeamId = "team-home";
const awayTeamId = "team-away";
const homeCaptainId = "home-1";
const awayCaptainId = "away-1";
const refereeUserId = "referee-flow";
const homeDelegateId = "delegate-home";
const awayDelegateId = "delegate-away";
const adminUserId = "admin-flow";

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
await createUserData({
  id: adminUserId,
  leagueId: "",
  name: "Admin Flow",
  email: "admin-flow@ligatec.test",
  role: "league_admin",
  status: "active",
  passwordHash: hashPassword("AdminFlow123!")
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
        },
        {
          id: adminMatchId,
          competitionId: "comp-flow",
          round: 9,
          date: "2026-07-26",
          time: "12:00",
          venue: "Campo Admin Flow",
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

let reportPayload = {
  homeGoals: 2,
  awayGoals: 1,
  events: [
    { type: "goal", playerId: homeCaptainId, teamId: homeTeamId, minute: 12 },
    { type: "goal", playerId: awayCaptainId, teamId: awayTeamId, minute: 45, minuteLabel: "45+1" },
    { type: "goal", playerId: "home-2", teamId: homeTeamId, minute: 70 },
    { type: "yellow", playerId: "home-2", teamId: homeTeamId, minute: 77, cardDetail: "yellow" },
    { type: "red", playerId: awayCaptainId, teamId: awayTeamId, minute: 88, reason: "Insultos al arbitro" }
  ],
  observations: "Acta de prueba completa"
};
let report = await createMatchReportData({
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
  signedByUserId: homeDelegateId,
  method: "delegate_remote",
  actVersion: report.version,
  actHash: "hash-acta-v1",
  actSnapshot: { reportId: report.id, version: report.version, observations: reportPayload.observations },
  metadata: { teamSide: "home", signedFrom: "team_portal" }
});
let signatures = await listMatchReportSignaturesData(report.id);
assert.equal(signatures.find((signature) => signature.teamId === homeTeamId).method, "delegate_remote");
assert.equal(signatures.find((signature) => signature.teamId === homeTeamId).actHash, "hash-acta-v1");

reportPayload = {
  ...reportPayload,
  observations: "Acta de prueba actualizada antes de publicar"
};
report = await updateMatchReportPayloadData({
  reportId: report.id,
  payload: reportPayload,
  homeGoals: reportPayload.homeGoals,
  awayGoals: reportPayload.awayGoals
});
signatures = await invalidateMatchReportSignaturesData({ reportId: report.id, reason: "acta_updated_before_publish" });
const invalidatedHomeSignature = signatures.find((signature) => signature.teamId === homeTeamId);
assert.equal(invalidatedHomeSignature.status, "invalidated");
assert.ok(invalidatedHomeSignature.invalidatedAt);

await createMatchReportSignatureData({
  id: "signature-home",
  reportId: report.id,
  leagueId,
  matchId,
  teamId: homeTeamId,
  captainPlayerId: homeCaptainId,
  signedByUserId: homeDelegateId,
  method: "delegate_remote",
  actVersion: report.version,
  actHash: "hash-acta-v2",
  actSnapshot: { reportId: report.id, version: report.version, observations: reportPayload.observations },
  metadata: { teamSide: "home", signedFrom: "team_portal" }
});
signatures = await listMatchReportSignaturesData(report.id);
const resignedHomeSignature = signatures.find((signature) => signature.teamId === homeTeamId);
assert.equal(resignedHomeSignature.status, "signed");
assert.equal(resignedHomeSignature.invalidatedAt, null);
assert.equal(resignedHomeSignature.actHash, "hash-acta-v2");
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
  observations: report.payload.observations,
  status: "finished",
  captureMode: MATCH_CAPTURE_MODES.LIVE,
  resolutionType: "normal",
  events: report.payload.events.map((event) => ({
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
assert.equal(matchAfterPublish.events.length, 5);
assert.equal(matchAfterPublish.events.some((event) => event.type === "yellow"), true);
assert.equal(matchAfterPublish.events.find((event) => event.type === "red").disciplinaryPending, true);
assert.equal((await getMatchReportData(report.id)).status, MATCH_REPORT_STATUSES.PUBLISHED);
assert.equal(calculateStandings(leagueAfterPublish).find((row) => row.team.id === homeTeamId).points, 3);
assert.equal(calculateSuspensionNotices(leagueAfterPublish).some((notice) => notice.player.id === awayCaptainId && notice.pendingReview), true);

const participationResult = await createMatchParticipationData({
  id: "participation-home-flow",
  leagueId,
  matchId,
  teamId: homeTeamId,
  captainPlayerId: homeCaptainId,
  submittedByUserId: homeDelegateId,
  players: [
    { playerId: homeCaptainId, name: "Capitan Local", number: 10 },
    { playerId: "home-2", name: "Defensa Local", number: 5 }
  ],
  source: "delegate_portal",
  metadata: { round: 8 }
});
assert.equal(participationResult.duplicate, false);
let storedParticipations = await listMatchParticipationsForLeagueData(leagueId);
assert.equal(storedParticipations.length, 1);
let appearanceRows = calculatePlayerAppearanceEligibility({
  ...leagueAfterPublish,
  rules: { ...leagueAfterPublish.rules, minimumPlayoffAppearances: 1 },
  matchParticipations: storedParticipations
});
assert.equal(appearanceRows.get(homeCaptainId).officialAppearances, 1);

const correctionResult = await createMatchParticipationData({
  id: "participation-home-flow-correction",
  leagueId,
  matchId,
  teamId: homeTeamId,
  captainPlayerId: "home-2",
  submittedByUserId: homeDelegateId,
  players: [
    { playerId: "home-2", name: "Defensa Local", number: 5 }
  ],
  source: "admin_correction",
  allowCorrection: true,
  correctedByUserId: adminUserId,
  correctionReason: "Correccion administrativa de participantes"
});
assert.equal(correctionResult.duplicate, false);
const participationAuditRows = await listMatchParticipationsForLeagueData(leagueId, { activeOnly: false });
assert.equal(participationAuditRows.length, 2);
assert.equal(participationAuditRows.filter((participation) => participation.active).length, 1);
assert.equal(participationAuditRows.find((participation) => !participation.active).status, "superseded");
storedParticipations = await listMatchParticipationsForLeagueData(leagueId);
assert.equal(storedParticipations.length, 1);
appearanceRows = calculatePlayerAppearanceEligibility({
  ...leagueAfterPublish,
  rules: { ...leagueAfterPublish.rules, minimumPlayoffAppearances: 1 },
  matchParticipations: storedParticipations
});
assert.equal(appearanceRows.get("home-2").officialAppearances, 1);
assert.equal(appearanceRows.get(homeCaptainId).officialAppearances, 0);

await upsertMatchSessionData({
  id: "session-admin-flow",
  leagueId,
  matchId: adminMatchId,
  refereeUserId,
  captureMode: MATCH_CAPTURE_MODES.LIVE,
  status: "match_finished",
  period: "2T",
  clockState: { liveElapsedSeconds: 5400 },
  metadata: { source: "smoke-test-live-started-admin-published" }
});
await createMatchReportData({
  id: "report-live-started-admin-published",
  leagueId,
  matchId: adminMatchId,
  sessionId: "session-admin-flow",
  generatedByUserId: refereeUserId,
  captureMode: MATCH_CAPTURE_MODES.LIVE,
  status: MATCH_REPORT_STATUSES.DRAFT,
  payload: { homeGoals: 0, awayGoals: 0, events: [], observations: "Captura en vivo abandonada" },
  homeGoals: 0,
  awayGoals: 0
});
const storeBeforeAdminPublish = await getStoreData();
const adminPublishedStore = saveMatchSheet(storeBeforeAdminPublish, leagueId, {
  matchId: adminMatchId,
  homeGoals: 1,
  awayGoals: 1,
  observations: "Acta manual publicada por admin",
  status: "finished",
  captureMode: MATCH_CAPTURE_MODES.ADMIN,
  events: [
    { type: "goal", playerId: homeCaptainId, teamId: homeTeamId, minute: 20 },
    { type: "own_goal", playerId: "home-2", teamId: awayTeamId, minute: 55 }
  ]
});
const adminPublishedMatch = adminPublishedStore.leagues
  .find((league) => league.id === leagueId)
  ?.matches
  ?.find((match) => match.id === adminMatchId);
await publishOfficialMatchFromReportData({ leagueId, match: adminPublishedMatch });
const storeAfterAdminPublish = await getStoreData();
const adminMatchAfterPublish = storeAfterAdminPublish.leagues[0].matches.find((match) => match.id === adminMatchId);
assert.equal(adminMatchAfterPublish.status, "finished");
assert.equal(adminMatchAfterPublish.workflowStatus, "published");
assert.equal(adminMatchAfterPublish.captureMode, MATCH_CAPTURE_MODES.ADMIN);
assert.equal(adminMatchAfterPublish.currentReportId, "");
assert.equal(adminMatchAfterPublish.events.length, 2);
assert.equal(adminMatchAfterPublish.events.some((event) => event.type === "own_goal"), true);
assert.equal((await getMatchReportData("report-live-started-admin-published")).status, MATCH_REPORT_STATUSES.DRAFT);

const beforeReimportSignatures = await listMatchReportSignaturesData(report.id);
const storeBeforeReimport = await getStoreData();
await importStoreData({
  ...storeBeforeReimport,
  leagues: storeBeforeReimport.leagues.map((league) => (
    league.id === leagueId ? { ...league, membershipNotes: "Cambio administrativo posterior al acta" } : league
  ))
});

assert.equal((await getMatchReportData(report.id)).status, MATCH_REPORT_STATUSES.PUBLISHED);
assert.equal((await listMatchReportSignaturesData(report.id)).length, beforeReimportSignatures.length);
assert.ok((await getMatchTeamPinData(matchId, homeTeamId)).signedAt);
assert.equal((await getStoreData()).leagues[0].membershipNotes, "CAMBIO ADMINISTRATIVO POSTERIOR AL ACTA");
storedParticipations = await listMatchParticipationsForLeagueData(leagueId);
assert.equal(storedParticipations.length, 1);
assert.equal(storedParticipations.filter((participation) => participation.active).length, 1);
appearanceRows = calculatePlayerAppearanceEligibility({
  ...(await getStoreData()).leagues[0],
  rules: { ...(await getStoreData()).leagues[0].rules, minimumPlayoffAppearances: 1 },
  matchParticipations: storedParticipations
});
assert.equal(appearanceRows.get("home-2").officialAppearances, 1);
assert.equal(appearanceRows.get(homeCaptainId).officialAppearances, 0);
assert.equal((await getStoreData()).leagues[0].matches.find((match) => match.id === adminMatchId).captureMode, MATCH_CAPTURE_MODES.ADMIN);

console.log("Flujo arbitro-delegado-PIN-publicacion OK");

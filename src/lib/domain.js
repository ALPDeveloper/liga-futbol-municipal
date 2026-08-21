import { DEFAULT_IDENTITY } from "../data/defaultIdentity.js";
import {
  MATCH_CAPTURE_MODES,
  MATCH_WORKFLOW_STATUSES,
  normalizeCaptureMode,
  normalizeWorkflowStatus
} from "./matchWorkflow.js";

export const YELLOW_SUSPENSION_LIMIT = 3;
export const MAX_IMAGE_DATA_URL_LENGTH = 1_800_000;
export const ACTIVE_SCHEDULE_MATCH_STATUSES = ["scheduled", "rescheduled", "advanced"];
export const PLAYER_HISTORICAL_STATUS = "historical";

const ALLOWED_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;

export function sanitizeExternalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function sanitizeImageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (text.startsWith("data:")) {
    if (text.length > MAX_IMAGE_DATA_URL_LENGTH) return "";
    return ALLOWED_IMAGE_DATA_URL_PATTERN.test(text) ? text.replace(/\s+/g, "") : "";
  }

  if (text.startsWith("/uploads/")) return text;

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function upperText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[ \t]+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

function upperLines(items = []) {
  return items.map((item) => upperText(item)).filter(Boolean);
}

export function getEventCardDetail(event) {
  return event?.cardDetail || event?.subtype || event?.metadata?.cardDetail || "";
}

export function isSecondYellowDismissal(event) {
  return Boolean(event) && event.type === "yellow" && getEventCardDetail(event) === "double_yellow_second";
}

export function isDoubleYellowRedEvent(event) {
  return Boolean(event) && event.type === "red" && ["double_yellow", "double_yellow_second"].includes(getEventCardDetail(event));
}

function hasCompanionDoubleYellowRedEvent(events, event) {
  if (!isSecondYellowDismissal(event)) return false;
  return (events || []).some((item) => (
    isDoubleYellowRedEvent(item) &&
    item.playerId === event.playerId &&
    item.teamId === event.teamId
  ));
}

export function isAccumulatingYellowCard(event) {
  if (!event || event.type !== "yellow") return false;
  if (event.countsForAccumulation === false || event.excludedFromAccumulation === true) return false;
  return !["double_yellow_first", "double_yellow_second"].includes(getEventCardDetail(event));
}

function venueIdFromName(name) {
  const slug = upperText(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `venue-${slug || "cancha"}`;
}

function deriveVenuesFromMatches(matches = []) {
  const venues = new Map();

  for (const match of matches) {
    const name = upperText(match.venue || "");
    if (!name || venues.has(name)) continue;
    venues.set(name, {
      id: venueIdFromName(name),
      name,
      address: "",
      notes: "CREADA DESDE PARTIDOS YA PROGRAMADOS.",
      status: "active"
    });
  }

  return [...venues.values()];
}

export function isPlayerHistoricalOnly(player) {
  return (player?.status || "active") === PLAYER_HISTORICAL_STATUS;
}

export function defaultCompetitionForLeague(league) {
  return {
    id: `${league.id || "league"}-liga`,
    name: "TORNEO DE LIGA",
    type: "liga",
    season: upperText(league.season || "Temporada actual"),
    status: "active"
  };
}

export function normalizeStore(data) {
  return {
    currentLeagueId: data.currentLeagueId || data.leagues?.[0]?.id || "",
    leagues: (data.leagues || []).map((league) => {
      const fallbackCompetition = defaultCompetitionForLeague(league);
      const competitions = (league.competitions?.length ? league.competitions : [fallbackCompetition]).map((competition) => ({
        id: competition.id,
        name: upperText(competition.name || "Torneo de Liga"),
        type: competition.type || "liga",
        season: upperText(competition.season || league.season || "Temporada actual"),
        status: competition.status || "active",
        activeRound: Number(competition.activeRound || 0) || "",
        startsAt: competition.startsAt || "",
        endsAt: competition.endsAt || ""
      }));
      const currentCompetition = competitions.find((competition) => competition.id === league.currentCompetitionId);
      const currentCompetitionId = currentCompetition?.status !== "archived"
        ? currentCompetition.id
        : competitions.find((competition) => competition.status !== "archived")?.id || competitions[0]?.id || fallbackCompetition.id;
      const normalizedTeams = (league.teams || []).map((team) => ({
        ...team,
        competitionId: team.competitionId || currentCompetitionId,
        name: upperText(team.name),
        coach: upperText(team.coach),
        assistantCoach: upperText(team.assistantCoach),
        address: upperText(team.address),
        logoUrl: sanitizeImageUrl(team.logoUrl),
        status: team.status || "active",
        withdrawnRound: team.withdrawnRound || null,
        withdrawnReason: team.withdrawnReason ? upperText(team.withdrawnReason) : null
      }));
      const teamCompetitionIds = new Map(normalizedTeams.map((team) => [team.id, team.competitionId || currentCompetitionId]));
      const sourceVenues = league.venues?.length ? league.venues : deriveVenuesFromMatches(league.matches || []);

      return {
        ...league,
        name: upperText(league.name),
        city: upperText(league.city),
        season: upperText(league.season),
        adBanner: upperText(league.adBanner),
        publicVisibility: league.publicVisibility || "visible",
        currentCompetitionId,
        competitions,
        identity: {
          ...DEFAULT_IDENTITY,
          ...(league.identity || {}),
          logoUrl: sanitizeImageUrl(league.identity?.logoUrl || league.logoUrl || DEFAULT_IDENTITY.logoUrl || ""),
          nickname: upperText(league.identity?.nickname || DEFAULT_IDENTITY.nickname),
          activities: upperText(league.identity?.activities || DEFAULT_IDENTITY.activities),
          publicIntro: upperText(league.identity?.publicIntro || DEFAULT_IDENTITY.publicIntro)
        },
        rules: {
          withdrawalPolicy: "award_walkover",
          forfeitPoints: 3,
          forfeitGoalsFor: 3,
          forfeitGoalsAgainst: 0,
          yellowSuspensionLimit: YELLOW_SUSPENSION_LIMIT,
          defaultRedSuspensionMatches: 1,
          disciplineScope: "competition",
          playoffQualifiers: 8,
          minimumPlayoffAppearances: 0,
          notes: "SI UN EQUIPO SE DA DE BAJA, LA LIGA PUEDE OTORGAR TRIUNFO POR DEFAULT SEGUN SUS ESTATUTOS.",
          ...(league.rules || {}),
          minimumPlayoffAppearances: Math.max(0, Number(league.rules?.minimumPlayoffAppearances ?? 0)),
          disciplineScope: league.rules?.disciplineScope === "league" ? "league" : "competition",
          notes: upperText(league.rules?.notes || "SI UN EQUIPO SE DA DE BAJA, LA LIGA PUEDE OTORGAR TRIUNFO POR DEFAULT SEGUN SUS ESTATUTOS.")
        },
        membershipNotes: upperText(league.membershipNotes),
        sponsors: (league.sponsors || []).map((sponsor) => ({
          ...sponsor,
          name: upperText(sponsor.name),
          placement: sponsor.placement || "home_banner",
          status: sponsor.status || "active",
          sortOrder: Number(sponsor.sortOrder || 0),
          linkUrl: sanitizeExternalUrl(sponsor.linkUrl),
          imageUrl: sanitizeImageUrl(sponsor.imageUrl),
          notes: upperText(sponsor.notes || "")
        })),
        media: (league.media || []).map((item) => ({
          ...item,
          title: upperText(item.title || "Foto"),
          caption: upperText(item.caption || ""),
          type: ["hero", "moment", "gallery"].includes(item.type) ? item.type : "gallery",
          status: item.status || "active",
          sortOrder: Number(item.sortOrder || 0),
          imageUrl: sanitizeImageUrl(item.imageUrl),
          competitionId: item.competitionId || ""
        })).filter((item) => item.imageUrl),
        venues: sourceVenues.map((venue) => ({
          ...venue,
          id: venue.id || venueIdFromName(venue.name),
          name: upperText(venue.name || "Cancha"),
          address: upperText(venue.address || ""),
          notes: upperText(venue.notes || ""),
          status: venue.status || "active"
        })).filter((venue) => venue.name),
        highlights: upperLines(league.highlights || []),
        announcements: (league.announcements || []).map((announcement) => ({
          ...announcement,
          title: upperText(announcement.title || "Aviso"),
          body: upperText(announcement.body || ""),
          status: announcement.status || "active",
          date: announcement.date || ""
        })).filter((announcement) => announcement.body),
        teams: normalizedTeams,
        players: (league.players || []).map((player) => ({
          ...player,
          competitionId: player.competitionId || teamCompetitionIds.get(player.teamId) || currentCompetitionId,
          name: upperText(player.name),
          position: upperText(player.position || "Jugador"),
          photoUrl: sanitizeImageUrl(player.photoUrl),
          photoAuthorized: player.photoAuthorized === true,
          status: player.status === PLAYER_HISTORICAL_STATUS ? PLAYER_HISTORICAL_STATUS : "active"
        })),
        teamAffiliations: (league.teamAffiliations || []).map((affiliation) => ({
          ...affiliation,
          id: affiliation.id || makeId("team-affiliation"),
          sourceTeamId: affiliation.sourceTeamId || "",
          targetTeamId: affiliation.targetTeamId || "",
          status: affiliation.status || "active",
          startsAt: affiliation.startsAt || "",
          endsAt: affiliation.endsAt || "",
          playerNumbers: Object.fromEntries(
            Object.entries(affiliation.playerNumbers || {})
              .map(([playerId, number]) => [playerId, Number(number || 0)])
              .filter(([, number]) => number >= 0)
          ),
          notes: upperText(affiliation.notes || "")
        })).filter((affiliation) => (
          affiliation.sourceTeamId &&
          affiliation.targetTeamId &&
          affiliation.sourceTeamId !== affiliation.targetTeamId &&
          normalizedTeams.some((team) => team.id === affiliation.sourceTeamId) &&
          normalizedTeams.some((team) => team.id === affiliation.targetTeamId)
        )),
        sanctions: (league.sanctions || []).map((sanction) => ({
          ...sanction,
          competitionId: sanction.competitionId || currentCompetitionId,
          type: upperText(sanction.type),
          reason: upperText(sanction.reason),
          matches: Number(sanction.matches || 0),
          indefinite: Boolean(sanction.indefinite),
          status: sanction.status || "active",
          notes: upperText(sanction.notes)
        })),
        disciplineLinks: (league.disciplineLinks || []).map((link) => ({
          ...link,
          id: link.id || makeId("discipline-link"),
          playerIds: [...new Set(link.playerIds || [])].filter((playerId) => (
            (league.players || []).some((player) => player.id === playerId)
          )),
          notes: upperText(link.notes || "")
        })).filter((link) => link.playerIds.length > 1),
        disciplineAdjustments: (league.disciplineAdjustments || []).map((adjustment) => ({
          ...adjustment,
          id: adjustment.id || makeId("discipline-adjustment"),
          competitionId: adjustment.competitionId || currentCompetitionId,
          playerId: adjustment.playerId || "",
          value: Number(adjustment.value || 0),
          date: adjustment.date || "",
          reason: upperText(adjustment.reason || ""),
          notes: upperText(adjustment.notes || ""),
          status: adjustment.status || "active"
        })).filter((adjustment) => adjustment.playerId && adjustment.value),
        appearanceAdjustments: (league.appearanceAdjustments || []).map((adjustment) => ({
          ...adjustment,
          id: adjustment.id || makeId("appearance-adjustment"),
          playerId: adjustment.playerId || "",
          value: Number(adjustment.value || 0),
          date: adjustment.date || "",
          reason: upperText(adjustment.reason || ""),
          notes: upperText(adjustment.notes || ""),
          status: adjustment.status || "active"
        })).filter((adjustment) => adjustment.playerId && adjustment.value),
        disciplineResets: (league.disciplineResets || []).map((reset) => ({
          ...reset,
          id: reset.id || makeId("discipline-reset"),
          playerId: reset.playerId || "",
          date: reset.date || "",
          reason: upperText(reset.reason || ""),
          notes: upperText(reset.notes || ""),
          status: reset.status || "active"
        })).filter((reset) => reset.playerId),
        injuries: (league.injuries || []).map((injury) => ({
          ...injury,
          competitionId: injury.competitionId || currentCompetitionId,
          type: upperText(injury.type || "Lesion"),
          date: injury.date || "",
          expectedReturn: injury.expectedReturn || "",
          needsSurgery: Boolean(injury.needsSurgery),
          needsSupport: Boolean(injury.needsSupport),
          supportDetail: upperText(injury.supportDetail || ""),
          status: injury.status || "active",
          notes: upperText(injury.notes || "")
        })),
        matches: (league.matches || []).map((match) => ({
          ...match,
          competitionId: match.competitionId || currentCompetitionId,
          workflowStatus: normalizeWorkflowStatus(match.workflowStatus || match.workflow_status || match.status || MATCH_WORKFLOW_STATUSES.SCHEDULED),
          captureMode: normalizeCaptureMode(match.captureMode || match.capture_mode || MATCH_CAPTURE_MODES.ADMIN),
          currentReportId: match.currentReportId || match.current_report_id || "",
          publishedAt: match.publishedAt || match.published_at || "",
          finalizedAt: match.finalizedAt || match.finalized_at || "",
          stage: match.stage || "regular",
          playoffRound: upperText(match.playoffRound),
          playoffLeg: upperText(match.playoffLeg),
          venue: upperText(match.venue),
          aggregateHome: match.aggregateHome ?? null,
          aggregateAway: match.aggregateAway ?? null,
          extraTimeHomeGoals: match.extraTimeHomeGoals ?? null,
          extraTimeAwayGoals: match.extraTimeAwayGoals ?? null,
          penaltyHomeGoals: match.penaltyHomeGoals ?? null,
          penaltyAwayGoals: match.penaltyAwayGoals ?? null,
          observations: upperText(match.observations || ""),
          resolutionType: match.resolutionType || "normal",
          resolutionNote: match.resolutionNote ? upperText(match.resolutionNote) : null,
          events: (match.events || []).map((event) => ({
            ...event,
            localUuid: event.localUuid || event.local_uuid || "",
            minuteLabel: event.minuteLabel || "",
            period: event.period || "",
            second: Number(event.second || 0) || null,
            eventTeamSide: event.eventTeamSide || event.event_team_side || "",
            secondaryPlayerId: event.secondaryPlayerId || event.secondary_player_id || "",
            assistPlayerId: event.assistPlayerId || event.assist_player_id || "",
            subtype: event.subtype || event.cardDetail || event.metadata?.cardDetail || "",
            cardDetail: event.cardDetail || event.subtype || event.metadata?.cardDetail || "",
            countsForAccumulation: event.countsForAccumulation ?? event.metadata?.countsForAccumulation,
            sourceYellowCardMinutes: event.sourceYellowCardMinutes || event.metadata?.sourceYellowCardMinutes || [],
            suspensionMatches: Number(event.suspensionMatches || 0),
            suspensionIndefinite: Boolean(event.suspensionIndefinite),
            disciplinaryPending: Boolean(event.disciplinaryPending),
            reason: upperText(event.reason),
            metadata: event.metadata || {},
            isOfficial: event.isOfficial !== false,
            syncStatus: event.syncStatus || "synced",
            createdByUserId: event.createdByUserId || "",
            createdAt: event.createdAt || "",
            updatedAt: event.updatedAt || "",
            version: Number(event.version || 1)
          }))
        })),
        matchRosters: (league.matchRosters || []).map((roster) => ({
          ...roster,
          id: roster.id || makeId("match-roster"),
          matchId: roster.matchId || "",
          teamId: roster.teamId || "",
          submittedByUserId: roster.submittedByUserId || "",
          captainPlayerId: roster.captainPlayerId || "",
          goalkeeperPlayerId: roster.goalkeeperPlayerId || "",
          captainPin: String(roster.captainPin || ""),
          starters: (roster.starters || []).filter(Boolean),
          substitutes: (roster.substitutes || []).filter(Boolean),
          lineup: roster.lineup || {},
          players: (roster.players || [])
            .map((entry) => (typeof entry === "string"
              ? { playerId: entry, jerseyNumber: "" }
              : {
                  playerId: entry.playerId || "",
                  jerseyNumber: String(entry.jerseyNumber ?? entry.rosterNumber ?? "")
                }))
            .filter((entry) => entry.playerId),
          status: roster.status || "submitted",
          notes: upperText(roster.notes || ""),
          submittedAt: roster.submittedAt || "",
          updatedAt: roster.updatedAt || roster.submittedAt || "",
          version: Number(roster.version || 1)
        })).filter((roster) => roster.matchId && roster.teamId),
        matchParticipations: (league.matchParticipations || []).map((participation) => ({
          ...participation,
          id: participation.id || makeId("match-participation"),
          matchId: participation.matchId || "",
          teamId: participation.teamId || "",
          status: participation.status || "submitted",
          captainPlayerId: participation.captainPlayerId || "",
          submittedByUserId: participation.submittedByUserId || "",
          submittedAt: participation.submittedAt || "",
          lockedAt: participation.lockedAt || participation.submittedAt || "",
          correctedByUserId: participation.correctedByUserId || "",
          correctedAt: participation.correctedAt || "",
          correctionReason: upperText(participation.correctionReason || ""),
          source: participation.source || "delegate_portal",
          metadata: participation.metadata || {},
          active: participation.active !== false,
          version: Number(participation.version || 1),
          createdAt: participation.createdAt || participation.submittedAt || "",
          updatedAt: participation.updatedAt || participation.submittedAt || "",
          players: (participation.players || [])
            .map((entry) => (typeof entry === "string"
              ? {
                  playerId: entry,
                  playerNameSnapshot: "",
                  playerNumberSnapshot: "",
                  playerPhotoSnapshot: ""
                }
              : {
                  id: entry.id || "",
                  playerId: entry.playerId || "",
                  playerNameSnapshot: entry.playerNameSnapshot || entry.name || "",
                  playerNumberSnapshot: String(entry.playerNumberSnapshot ?? entry.number ?? ""),
                  playerPhotoSnapshot: entry.playerPhotoSnapshot || entry.photoUrl || "",
                  createdAt: entry.createdAt || participation.submittedAt || ""
                }))
            .filter((entry) => entry.playerId)
        })).filter((participation) => participation.matchId && participation.teamId),
        matchReports: (league.matchReports || []).map((report) => ({
          ...report,
          id: report.id || makeId("match-report"),
          matchId: report.matchId || "",
          sessionId: report.sessionId || "",
          captureMode: normalizeCaptureMode(report.captureMode || report.capture_mode || MATCH_CAPTURE_MODES.ADMIN),
          status: report.status || "draft",
          version: Number(report.version || 1),
          payload: report.payload || {},
          homeGoals: report.homeGoals ?? null,
          awayGoals: report.awayGoals ?? null,
          generatedAt: report.generatedAt || "",
          finalizedAt: report.finalizedAt || "",
          publishedAt: report.publishedAt || "",
          createdAt: report.createdAt || "",
          updatedAt: report.updatedAt || ""
        })).filter((report) => report.matchId)
      };
    })
  };
}

export function getCurrentLeague(store) {
  return store.leagues.find((league) => league.id === store.currentLeagueId) || store.leagues[0];
}

export function getTeam(league, teamId) {
  return (league.allTeams || league.teams || []).find((team) => team.id === teamId);
}

export function getPlayer(league, playerId) {
  return (league.allPlayers || league.players || []).find((player) => player.id === playerId);
}

export function getActiveTeamAffiliations(league) {
  return (league.teamAffiliations || []).filter((affiliation) => (
    affiliation.status !== "inactive" &&
    affiliation.status !== "revoked" &&
    getTeam(league, affiliation.sourceTeamId) &&
    getTeam(league, affiliation.targetTeamId) &&
    affiliation.sourceTeamId !== affiliation.targetTeamId
  ));
}

export function getTeamAffiliationsForTarget(league, targetTeamId) {
  return getActiveTeamAffiliations(league).filter((affiliation) => affiliation.targetTeamId === targetTeamId);
}

export function getPlayerAffiliationForTeam(league, playerId, teamId) {
  const player = getPlayer(league, playerId);
  if (!player || player.teamId === teamId) return null;
  return getTeamAffiliationsForTarget(league, teamId).find((affiliation) => affiliation.sourceTeamId === player.teamId) || null;
}

export function getPlayerNumberForTeam(league, playerId, teamId) {
  const player = getPlayer(league, playerId);
  if (!player) return "";
  if (!teamId || player.teamId === teamId) return player.number || "";
  const affiliation = getPlayerAffiliationForTeam(league, playerId, teamId);
  return affiliation?.playerNumbers?.[playerId] || player.number || "";
}

export function getEligiblePlayersForTeam(league, teamId) {
  const sourceTeamIds = new Set(getTeamAffiliationsForTarget(league, teamId).map((affiliation) => affiliation.sourceTeamId));
  return (league.allPlayers || league.players || [])
    .filter((player) => !isPlayerHistoricalOnly(player) && (player.teamId === teamId || sourceTeamIds.has(player.teamId)))
    .sort((a, b) => (
      (a.teamId === teamId ? 0 : 1) - (b.teamId === teamId ? 0 : 1) ||
      Number(getPlayerNumberForTeam(league, a.id, teamId) || 999) - Number(getPlayerNumberForTeam(league, b.id, teamId) || 999) ||
      a.name.localeCompare(b.name)
    ));
}

export function getEligibleTeamIdsForPlayer(league, playerId) {
  const player = getPlayer(league, playerId);
  if (!player) return [];
  const teamIds = new Set([player.teamId]);
  for (const affiliation of getActiveTeamAffiliations(league)) {
    if (affiliation.sourceTeamId === player.teamId) teamIds.add(affiliation.targetTeamId);
  }
  return [...teamIds].filter(Boolean);
}

export function isPlayerEligibleForTeam(league, playerId, teamId) {
  const player = getPlayer(league, playerId);
  return Boolean(player && (player.teamId === teamId || getPlayerAffiliationForTeam(league, playerId, teamId)));
}

export function getPlayerSeasonBreakdown(league, playerId) {
  const player = getPlayer(league, playerId);
  if (!player) return { rows: [], totals: { goals: 0, yellowCards: 0, redCards: 0 }, hasAffiliation: false };

  const affiliatedTeamIds = new Set(getEligibleTeamIdsForPlayer(league, playerId));
  const hasAffiliation = affiliatedTeamIds.size > 1;
  const rowsByTeam = new Map();

  function ensureRow(teamId) {
    if (!teamId) return null;
    if (!rowsByTeam.has(teamId)) {
      rowsByTeam.set(teamId, {
        team: getTeam(league, teamId),
        goals: 0,
        yellowCards: 0,
        redCards: 0
      });
    }
    return rowsByTeam.get(teamId);
  }

  for (const match of finishedMatches(league)) {
    for (const event of match.events || []) {
      if (event.playerId !== playerId) continue;
      const row = ensureRow(event.teamId || player.teamId);
      if (!row) continue;
      if (event.type === "goal") row.goals += 1;
      if (isAccumulatingYellowCard(event)) row.yellowCards += 1;
      if (event.type === "red") row.redCards += 1;
    }
  }

  const rows = [...rowsByTeam.values()]
    .filter((row) => row.goals || row.yellowCards || row.redCards || affiliatedTeamIds.has(row.team?.id))
    .sort((a, b) => (
      (a.team?.name || "").localeCompare(b.team?.name || "")
    ));
  const totals = rows.reduce((acc, row) => ({
    goals: acc.goals + row.goals,
    yellowCards: acc.yellowCards + row.yellowCards,
    redCards: acc.redCards + row.redCards
  }), { goals: 0, yellowCards: 0, redCards: 0 });

  return { rows, totals, hasAffiliation };
}

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getDefaultCompetitionId(league) {
  const currentCompetition = league.competitions?.find((competition) => competition.id === league.currentCompetitionId);
  if (currentCompetition && currentCompetition.status !== "archived") return currentCompetition.id;
  return league.competitions?.find((competition) => competition.status !== "archived")?.id || league.competitions?.[0]?.id || "";
}

export function getCompetition(league, competitionId) {
  return league.competitions?.find((competition) => competition.id === competitionId) || league.competitions?.[0] || null;
}

export function scopeLeagueToCompetition(league, competitionId = getDefaultCompetitionId(league)) {
  const targetCompetitionId = competitionId || getDefaultCompetitionId(league);
  const teams = league.teams.filter((team) => (team.competitionId || targetCompetitionId) === targetCompetitionId);
  const teamIds = new Set(teams.map((team) => team.id));
  const affiliatedSourceTeamIds = new Set(
    getActiveTeamAffiliations(league)
      .filter((affiliation) => teamIds.has(affiliation.targetTeamId))
      .map((affiliation) => affiliation.sourceTeamId)
  );

  return {
    ...league,
    currentCompetitionId: targetCompetitionId,
    allTeams: league.allTeams || league.teams,
    allPlayers: league.allPlayers || league.players,
    teams,
    players: league.players.filter((player) => (
      (player.competitionId || targetCompetitionId) === targetCompetitionId ||
      teamIds.has(player.teamId) ||
      affiliatedSourceTeamIds.has(player.teamId)
    )),
    matches: league.matches.filter((match) => match.competitionId === targetCompetitionId),
    sanctions: (league.sanctions || []).filter((sanction) => !sanction.competitionId || sanction.competitionId === targetCompetitionId),
    teamAffiliations: getActiveTeamAffiliations(league).filter((affiliation) => (
      teamIds.has(affiliation.targetTeamId) || teamIds.has(affiliation.sourceTeamId)
    )),
    disciplineLinks: league.disciplineLinks || [],
    disciplineAdjustments: (league.disciplineAdjustments || []).filter((adjustment) => !adjustment.competitionId || adjustment.competitionId === targetCompetitionId),
    disciplineResets: league.disciplineResets || [],
    injuries: (league.injuries || []).filter((injury) => !injury.competitionId || injury.competitionId === targetCompetitionId)
  };
}

export function finishedMatches(league) {
  return league.matches.filter((match) => match.status === "finished" || match.status === "walkover");
}

export function regularMatches(league) {
  return league.matches.filter((match) => (match.stage || "regular") !== "playoff");
}

export function playoffMatches(league) {
  return league.matches.filter((match) => (match.stage || "regular") === "playoff");
}

export function getPlayoffPhaseLabel(qualifiers) {
  const total = Number(qualifiers || 0);
  if (total === 32) return "16vos de final";
  if (total === 16) return "8vos de final";
  if (total === 8) return "Cuartos de final";
  if (total === 4) return "Semifinal";
  if (total === 2) return "Final";
  return total > 0 ? "Liguilla" : "";
}

export function calculateStandings(league) {
  const rows = new Map(
    league.teams.map((team) => [
      team.id,
      {
        team,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      }
    ])
  );

  for (const match of finishedMatches({ ...league, matches: regularMatches(league) })) {
    const home = rows.get(match.homeTeamId);
    const away = rows.get(match.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += Number(match.homeGoals);
    home.goalsAgainst += Number(match.awayGoals);
    away.goalsFor += Number(match.awayGoals);
    away.goalsAgainst += Number(match.homeGoals);

    const winPoints = match.status === "walkover"
      ? Number(league.rules?.forfeitPoints ?? 3)
      : 3;

    if (match.homeGoals > match.awayGoals) {
      home.wins += 1;
      home.points += winPoints;
      away.losses += 1;
    } else if (match.homeGoals < match.awayGoals) {
      away.wins += 1;
      away.points += winPoints;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...rows.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => (
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.team.name.localeCompare(b.team.name)
    ));
}

export function calculatePlayerStats(league) {
  const stats = new Map(
    league.players.map((player) => [
      player.id,
      {
        player,
        team: getTeam(league, player.teamId),
        teamActivity: new Map(),
        goals: 0,
        yellowCards: 0,
        redCards: 0,
        suspensionMatches: 0,
        suspensionIndefinite: false,
        extraSanctions: [],
        reasons: []
      }
    ])
  );

  function registerTeamActivity(row, teamId, weight = 1) {
    if (!teamId) return;
    row.teamActivity.set(teamId, (row.teamActivity.get(teamId) || 0) + weight);
  }

  for (const match of finishedMatches(league)) {
    for (const event of match.events) {
      const row = stats.get(event.playerId);
      if (!row) continue;

      if (event.type === "goal") {
        row.goals += 1;
        registerTeamActivity(row, event.teamId, 3);
      }
      if (isAccumulatingYellowCard(event)) {
        row.yellowCards += 1;
        registerTeamActivity(row, event.teamId);
      }
      if (event.type === "red" || (isSecondYellowDismissal(event) && !hasCompanionDoubleYellowRedEvent(match.events, event))) {
        row.redCards += 1;
        if (event.suspensionIndefinite) {
          row.suspensionIndefinite = true;
        } else {
          row.suspensionMatches += Number(event.suspensionMatches || 1);
        }
        row.reasons.push(event.reason || (isSecondYellowDismissal(event) || isDoubleYellowRedEvent(event) ? "Segunda amarilla" : "Tarjeta roja"));
        registerTeamActivity(row, event.teamId);
      }
    }
  }

  for (const row of stats.values()) {
    const yellowLimit = Number(league.rules?.yellowSuspensionLimit || YELLOW_SUSPENSION_LIMIT);
    if (row.yellowCards >= yellowLimit) {
      row.suspensionMatches += 1;
      row.reasons.push(`Acumulacion de ${yellowLimit} amarillas`);
    }
  }

  for (const sanction of league.sanctions || []) {
    if (sanction.status === "revoked") continue;
    const row = stats.get(sanction.playerId);
    if (!row) continue;

    if (sanction.indefinite) {
      row.suspensionIndefinite = true;
    } else {
      row.suspensionMatches += Number(sanction.matches || 0);
    }
    row.extraSanctions.push(sanction);
    row.reasons.push(sanction.reason || sanction.type || "Sancion disciplinaria");
  }

  return [...stats.values()].map((row) => {
    const primaryTeamId = [...row.teamActivity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      ...row,
      team: getTeam(league, primaryTeamId) || row.team,
      teamActivity: undefined
    };
  });
}

export function calculatePlayerAppearanceEligibility(league) {
  const required = Math.max(0, Number(league.rules?.minimumPlayoffAppearances || 0));
  const rows = new Map(
    (league.players || []).map((player) => [
      player.id,
      {
        playerId: player.id,
        required,
        officialAppearances: 0,
        manualAdjustment: 0,
        recognizedAppearances: 0,
        remaining: required,
        percentage: required > 0 ? 0 : 100,
        eligible: required <= 0,
        applies: required > 0
      }
    ])
  );

  for (const participation of league.matchParticipations || []) {
    if (!participation.active && participation.active !== undefined) continue;
    if (!["submitted", "locked", "corrected"].includes(participation.status || "")) continue;
    const match = (league.matches || []).find((item) => item.id === participation.matchId);
    if (!match || !["finished", "walkover"].includes(match.status)) continue;
    const participationTeamId = participation.teamId || "";

    for (const entry of participation.players || []) {
      const playerId = typeof entry === "string" ? entry : entry.playerId;
      const player = getPlayer(league, playerId);
      const row = rows.get(playerId);
      if (!player || !row) continue;
      if (player.teamId !== participationTeamId) continue;
      row.officialAppearances += 1;
    }
  }

  for (const adjustment of league.appearanceAdjustments || []) {
    if (adjustment.status === "revoked") continue;
    const row = rows.get(adjustment.playerId);
    if (!row) continue;
    row.manualAdjustment += Number(adjustment.value || 0);
  }

  for (const row of rows.values()) {
    row.recognizedAppearances = Math.max(0, row.officialAppearances + row.manualAdjustment);
    row.remaining = Math.max(required - row.recognizedAppearances, 0);
    row.percentage = required > 0 ? Math.min(100, Math.round((row.recognizedAppearances / required) * 100)) : 100;
    row.eligible = required <= 0 || row.recognizedAppearances >= required;
    row.applies = required > 0;
  }

  return rows;
}

export function getPlayerAppearanceEligibility(league, playerId) {
  return calculatePlayerAppearanceEligibility(league).get(playerId) || null;
}

function buildDisciplineContext(league, options = {}) {
  const shared = league.rules?.disciplineScope === "league";
  const byCompetition = options.byCompetition === true;
  const linkByPlayerId = new Map();

  for (const link of league.disciplineLinks || []) {
    const playerIds = [...new Set(link.playerIds || [])].filter((playerId) => getPlayer(league, playerId));
    if (playerIds.length < 2) continue;
    const key = shared ? `link:${link.id}` : "";
    for (const playerId of playerIds) linkByPlayerId.set(playerId, { key, playerIds });
  }

  function getKey(playerId, competitionId = "") {
    const baseKey = shared ? linkByPlayerId.get(playerId)?.key || `player:${playerId}` : `player:${playerId}`;
    return byCompetition ? `${baseKey}:competition:${competitionId || "general"}` : baseKey;
  }

  function getPlayerIds(playerId) {
    return linkByPlayerId.get(playerId)?.playerIds || [playerId];
  }

  function getState(states, playerId, competitionId = "") {
    const key = getKey(playerId, competitionId);
    if (!states.has(key)) {
      states.set(key, {
        key,
        competitionId,
        playerId,
        playerIds: getPlayerIds(playerId),
        yellowCards: 0,
        suspensionOrigin: null,
        sources: []
      });
    }
    const state = states.get(key);
    state.playerIds = [...new Set([...state.playerIds, ...getPlayerIds(playerId)])];
    if (!state.playerIds.includes(state.playerId)) state.playerId = state.playerIds[0];
    return state;
  }

  return { getKey, getPlayerIds, getState, shared };
}

function groupInvolvesMatch(league, state, match) {
  if (state.competitionId && match.competitionId && state.competitionId !== match.competitionId) return false;
  return state.playerIds.some((playerId) => {
    const teamIds = getEligibleTeamIdsForPlayer(league, playerId);
    return teamIds.some((teamId) => involvesTeam(match, teamId));
  });
}

function getDisplayPlayerForState(league, state) {
  const players = state.playerIds.map((playerId) => getPlayer(league, playerId)).filter(Boolean);
  if (state.competitionId) {
    const competitionPlayer = players.find((player) => (
      (player.competitionId || getTeam(league, player.teamId)?.competitionId || "") === state.competitionId
    ));
    if (competitionPlayer) return competitionPlayer;
  }
  return players[0] || getPlayer(league, state.playerId);
}

function getDisplayTeamForState(league, state) {
  const player = getDisplayPlayerForState(league, state);
  return player ? getTeam(league, player.teamId) : null;
}

export function calculateYellowCardDiscipline(league) {
  const yellowLimit = Number(league.rules?.yellowSuspensionLimit || YELLOW_SUSPENSION_LIMIT);
  const states = new Map();
  const discipline = buildDisciplineContext(league, { byCompetition: true });

  const timeline = [
    ...sortMatches(finishedMatches(league)).flatMap((match) => [
      { movementType: "match-start", date: match.date, round: match.round, match },
      ...(match.events || [])
        .flatMap((event) => {
          const movements = [];
          if (isAccumulatingYellowCard(event)) {
            movements.push({ movementType: "yellow", date: match.date, round: match.round, match, event });
          }
          if (isSecondYellowDismissal(event)) {
            movements.push({ movementType: "double-yellow-reset", date: match.date, round: match.round, match, event });
          }
          return movements;
        })
    ]),
    ...(league.disciplineAdjustments || [])
      .filter((adjustment) => adjustment.status !== "revoked" && Number(adjustment.value || 0))
      .map((adjustment) => ({ ...adjustment, movementType: "adjustment" })),
    ...(league.disciplineResets || [])
      .filter((reset) => reset.status !== "revoked")
      .map((reset) => ({ ...reset, movementType: "reset" }))
  ].sort((a, b) => (
    String(a.date || "").localeCompare(String(b.date || "")) ||
    movementOrder(a.movementType) - movementOrder(b.movementType) ||
    Number(a.round || 0) - Number(b.round || 0) ||
    String(a.id || "").localeCompare(String(b.id || ""))
  ));

  for (const movement of timeline) {
    if (movement.movementType === "match-start") {
      for (const state of states.values()) {
        if (!state.suspensionOrigin) continue;
        if (groupInvolvesMatch(league, state, movement.match) && isAfterOrigin(movement.match, state.suspensionOrigin)) {
          state.yellowCards = 0;
          state.suspensionOrigin = null;
          state.sources = [];
        }
      }
      continue;
    }

    if (movement.movementType === "yellow") {
      const { event, match } = movement;
      const player = getPlayer(league, event.playerId);
      const isHistoricalRecordedEvent = isPlayerHistoricalOnly(player) && involvesTeam(match, event.teamId);
      if (!player || !involvesTeam(match, event.teamId) || (!isHistoricalRecordedEvent && !isPlayerEligibleForTeam(league, event.playerId, event.teamId))) continue;

      const state = discipline.getState(states, event.playerId, match.competitionId || player.competitionId || "");
      if (state.suspensionOrigin) continue;

      state.yellowCards += 1;
      state.sources.push({
        type: "Acta",
        playerId: event.playerId,
        matchId: match.id,
        date: match.date,
        round: match.round,
        competitionId: match.competitionId,
        minute: event.minute,
        minuteLabel: event.minuteLabel || ""
      });
      if (state.yellowCards >= yellowLimit) {
        state.yellowCards = yellowLimit;
        state.suspensionOrigin = { date: match.date, round: match.round, matchId: match.id };
      }
      continue;
    }

    if (movement.movementType === "double-yellow-reset") {
      const { event, match } = movement;
      const player = getPlayer(league, event.playerId);
      const isHistoricalRecordedEvent = isPlayerHistoricalOnly(player) && involvesTeam(match, event.teamId);
      if (!player || !involvesTeam(match, event.teamId) || (!isHistoricalRecordedEvent && !isPlayerEligibleForTeam(league, event.playerId, event.teamId))) continue;

      for (const item of states.values()) {
        if (!item.playerIds.includes(event.playerId)) continue;
        if ((match.competitionId || player.competitionId || "") && item.competitionId !== (match.competitionId || player.competitionId || "")) continue;
        item.yellowCards = 0;
        item.suspensionOrigin = null;
        item.sources = [];
      }
      continue;
    }

    const player = getPlayer(league, movement.playerId);
    if (!player) continue;
    const state = discipline.getState(states, movement.playerId, movement.competitionId || player.competitionId || "");

    if (movement.movementType === "reset") {
      for (const item of states.values()) {
        if (!item.playerIds.includes(movement.playerId)) continue;
        if (movement.competitionId && item.competitionId !== movement.competitionId) continue;
        item.yellowCards = 0;
        item.suspensionOrigin = null;
        item.sources = [];
      }
      continue;
    }

    if (state.suspensionOrigin && Number(movement.value || 0) > 0) continue;

    state.yellowCards = Math.max(0, state.yellowCards + Number(movement.value || 0));
    state.sources.push({ type: "Ajuste", playerId: movement.playerId, date: movement.date, adjustmentId: movement.id, value: Number(movement.value || 0), reason: movement.reason });
    if (state.yellowCards >= yellowLimit) {
      state.yellowCards = yellowLimit;
      state.suspensionOrigin = { date: movement.date, adjustmentId: movement.id };
    }
  }

  return [...states.values()]
    .map((state) => {
      const player = getDisplayPlayerForState(league, state);
      if (!player || !state.yellowCards) return null;
      const team = getDisplayTeamForState(league, state);
      const isSuspended = Boolean(state.suspensionOrigin);

      return {
        player,
        team,
        competition: getCompetition(league, state.competitionId),
        linkedPlayers: state.playerIds.map((playerId) => getPlayer(league, playerId)).filter(Boolean),
        yellowCards: state.yellowCards,
        yellowLimit,
        suspensionOrigin: state.suspensionOrigin,
        remainingToSuspension: Math.max(yellowLimit - state.yellowCards, 0),
        sources: [...state.sources],
        status: isSuspended ? "suspended" : state.yellowCards >= yellowLimit - 1 ? "warning" : "tracking",
        message: isSuspended
          ? `Suspendido 1 partido por acumulacion de ${yellowLimit} amarillas.`
          : `${Math.max(yellowLimit - state.yellowCards, 0)} amarilla(s) para suspension.`
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      (a.status === "suspended" ? 0 : 1) - (b.status === "suspended" ? 0 : 1) ||
      b.yellowCards - a.yellowCards ||
      a.player.name.localeCompare(b.player.name)
    ));
}

function movementOrder(type) {
  if (type === "match-start") return 0;
  if (type === "yellow") return 1;
  if (type === "double-yellow-reset") return 2;
  if (type === "adjustment") return 3;
  if (type === "reset") return 4;
  return 9;
}

function sortMatches(matches) {
  return [...matches].sort((a, b) => (
    String(a.date).localeCompare(String(b.date)) ||
    Number(a.round || 0) - Number(b.round || 0) ||
    String(a.id).localeCompare(String(b.id))
  ));
}

function involvesTeam(match, teamId) {
  return match.homeTeamId === teamId || match.awayTeamId === teamId;
}

function isActiveScheduleMatch(match) {
  return ACTIVE_SCHEDULE_MATCH_STATUSES.includes(match?.status || "scheduled");
}

function isAfterOrigin(match, origin) {
  if (!origin?.date) return true;
  if (match.date > origin.date) return true;
  if (match.date < origin.date) return false;
  if (origin.matchId && match.id === origin.matchId) return false;
  return Number(match.round || 0) > Number(origin.round || 0);
}

function getServedMatches(league, teamId, origin) {
  return sortMatches(finishedMatches(league).filter((match) => involvesTeam(match, teamId) && isAfterOrigin(match, origin)));
}

function getNextScheduledMatch(league, teamId) {
  return sortMatches(league.matches.filter((match) => isActiveScheduleMatch(match) && involvesTeam(match, teamId)))[0] || null;
}

function getOriginSortValue(origin) {
  const dateValue = origin?.date ? Date.parse(origin.date) : 0;
  const roundValue = Number(origin?.round || 0);
  const idValue = String(origin?.matchId || origin?.sanctionId || "");
  return {
    date: Number.isFinite(dateValue) ? dateValue : 0,
    round: Number.isFinite(roundValue) ? roundValue : 0,
    id: idValue
  };
}

function getReturnMatch(league, teamId, remainingMatches, origin) {
  const scheduled = sortMatches(league.matches.filter((match) => isActiveScheduleMatch(match) && involvesTeam(match, teamId) && isAfterOrigin(match, origin)));
  if (remainingMatches > 0) return scheduled[remainingMatches] || null;
  return scheduled[0] || null;
}

function buildSuspensionNotice(league, { playerId, totalMatches, reason, type, origin, indefinite = false }) {
  const player = getPlayer(league, playerId);
  if (!player) return null;

  const team = getTeam(league, player.teamId);
  const eligibleTeamIds = getEligibleTeamIdsForPlayer(league, playerId);
  const total = Number(totalMatches || 0);
  if (!indefinite && total <= 0) return null;

  const servedMatches = sortMatches(finishedMatches(league).filter((match) => (
    eligibleTeamIds.some((teamId) => involvesTeam(match, teamId)) && isAfterOrigin(match, origin)
  )));
  const originMatch = origin?.matchId ? league.matches.find((match) => match.id === origin.matchId) || null : null;
  if (indefinite) {
    const nextIndefiniteMatch = sortMatches(league.matches.filter((match) => (
      isActiveScheduleMatch(match) && eligibleTeamIds.some((teamId) => involvesTeam(match, teamId))
    )))[0] || null;
    return {
      id: `${type}-${origin?.matchId || origin?.sanctionId || player.id}-${player.id}`,
      player,
      team,
      type,
      reason,
      totalMatches: null,
      servedMatches: servedMatches.length,
      remainingMatches: null,
      status: "active",
      nextMatch: nextIndefiniteMatch,
      returnMatch: null,
      returnRound: "Indefinido",
      indefinite: true,
      origin,
      originSort: getOriginSortValue(origin),
      originMatch,
      servedMatchList: servedMatches
    };
  }

  const served = Math.min(servedMatches.length, total);
  const remaining = Math.max(total - served, 0);
  const nextMatch = sortMatches(league.matches.filter((match) => (
    isActiveScheduleMatch(match) && eligibleTeamIds.some((teamId) => involvesTeam(match, teamId))
  )))[0] || null;
  const scheduled = sortMatches(league.matches.filter((match) => (
    isActiveScheduleMatch(match) &&
    eligibleTeamIds.some((teamId) => involvesTeam(match, teamId)) &&
    isAfterOrigin(match, origin)
  )));
  const returnMatch = remaining > 0 ? scheduled[remaining] || null : scheduled[0] || null;
  const status = remaining > 0 ? "active" : "available";
  const fallbackReturnRound = origin?.round ? Number(origin.round) + total + 1 : null;

  if (status === "available" && servedMatches.length < total) return null;

  return {
    id: `${type}-${origin?.matchId || origin?.sanctionId || player.id}-${player.id}`,
    player,
    team,
    type,
    reason,
    totalMatches: total,
    servedMatches: served,
    remainingMatches: remaining,
    status,
    nextMatch,
    returnMatch,
    returnRound: returnMatch?.round || fallbackReturnRound || "",
    origin,
    originSort: getOriginSortValue(origin),
    originMatch,
    servedMatchList: servedMatches
  };
}

function buildPendingDisciplinaryNotice(league, { playerId, reason, type, origin }) {
  const player = getPlayer(league, playerId);
  if (!player) return null;

  const team = getTeam(league, player.teamId);
  const eligibleTeamIds = getEligibleTeamIdsForPlayer(league, playerId);
  const nextMatch = sortMatches(league.matches.filter((match) => (
    isActiveScheduleMatch(match) && eligibleTeamIds.some((teamId) => involvesTeam(match, teamId))
  )))[0] || null;

  return {
    id: `pending-${type}-${origin?.matchId || player.id}-${player.id}`,
    player,
    team,
    type,
    reason,
    totalMatches: null,
    servedMatches: 0,
    remainingMatches: null,
    status: "active",
    nextMatch,
    returnMatch: null,
    returnRound: "Revision",
    indefinite: false,
    pendingReview: true,
    origin,
    originSort: getOriginSortValue(origin),
    originMatch: origin?.matchId ? league.matches.find((match) => match.id === origin.matchId) || null : null,
    servedMatchList: []
  };
}

function getSanctionOrigin(league, sanction) {
  const notes = upperText(sanction.notes || "");
  const referencedMatch = (league.matches || []).find((match) => (
    notes.includes(upperText(match.id)) &&
    (match.events || []).some((event) => event.type === "red" && event.playerId === sanction.playerId)
  ));
  if (referencedMatch) {
    return { date: referencedMatch.date, round: referencedMatch.round, matchId: referencedMatch.id };
  }

  const sameDayRedMatch = (league.matches || []).find((match) => (
    match.date === sanction.date &&
    (match.events || []).some((event) => event.type === "red" && event.playerId === sanction.playerId)
  ));
  if (sameDayRedMatch) {
    return { date: sameDayRedMatch.date, round: sameDayRedMatch.round, matchId: sameDayRedMatch.id };
  }

  return { date: sanction.date, sanctionId: sanction.id };
}

export function calculateSuspensionNotices(league) {
  const notices = [];

  for (const match of finishedMatches(league)) {
    for (const event of match.events || []) {
      if (isSecondYellowDismissal(event) && !hasCompanionDoubleYellowRedEvent(match.events, event)) {
        notices.push(buildSuspensionNotice(league, {
          playerId: event.playerId,
          totalMatches: event.suspensionMatches || 1,
          reason: event.reason || "Segunda amarilla",
          type: "Expulsion",
          origin: { date: match.date, round: match.round, matchId: match.id },
          indefinite: false
        }));
        continue;
      }
      if (event.type !== "red") continue;
      if (event.disciplinaryPending) {
        const hasCommissionResolution = (league.sanctions || []).some((sanction) => (
          sanction.status !== "revoked" &&
          sanction.playerId === event.playerId &&
          upperText(sanction.notes || "").includes(upperText(match.id))
        ));
        if (hasCommissionResolution) continue;
        notices.push(buildPendingDisciplinaryNotice(league, {
          playerId: event.playerId,
          reason: event.reason || "Tarjeta roja",
          type: "Expulsion",
          origin: { date: match.date, round: match.round, matchId: match.id }
        }));
        continue;
      }
      notices.push(buildSuspensionNotice(league, {
        playerId: event.playerId,
        totalMatches: event.suspensionMatches || league.rules?.defaultRedSuspensionMatches || 1,
        reason: event.reason || "Tarjeta roja",
        type: "Expulsion",
        origin: { date: match.date, round: match.round, matchId: match.id },
        indefinite: Boolean(event.suspensionIndefinite)
      }));
    }
  }

  const yellowLimit = Number(league.rules?.yellowSuspensionLimit || YELLOW_SUSPENSION_LIMIT);
  for (const row of calculateYellowCardDiscipline(league)) {
    if (row.status !== "suspended") continue;
    notices.push(buildSuspensionNotice(league, {
      playerId: row.player.id,
      totalMatches: 1,
      reason: `Acumulacion de ${yellowLimit} amarillas`,
      type: "Acumulacion",
      origin: row.suspensionOrigin || { date: "", sanctionId: row.player.id }
    }));
  }

  for (const sanction of league.sanctions || []) {
    if (sanction.status === "revoked") continue;
    notices.push(buildSuspensionNotice(league, {
      playerId: sanction.playerId,
      totalMatches: sanction.matches,
      reason: sanction.reason || sanction.type || "Sancion disciplinaria",
      type: sanction.type || "Sancion disciplinaria",
      origin: getSanctionOrigin(league, sanction),
      indefinite: Boolean(sanction.indefinite)
    }));
  }

  return notices
    .filter(Boolean)
    .sort((a, b) => (
      (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
      Number(b.originSort?.date || 0) - Number(a.originSort?.date || 0) ||
      Number(b.originSort?.round || 0) - Number(a.originSort?.round || 0) ||
      String(b.originSort?.id || "").localeCompare(String(a.originSort?.id || "")) ||
      a.player.name.localeCompare(b.player.name)
    ));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function getCurrentDisplayRound(matches) {
  const regular = matches.filter((match) => (match.stage || "regular") !== "playoff");
  const rounds = [...new Set(regular.map((match) => Number(match.round || 0)).filter(Boolean))].sort((a, b) => a - b);
  if (!rounds.length) return "";

  const today = todayIso();
  const upcoming = regular
    .filter((match) => isActiveScheduleMatch(match) && match.date >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
  if (upcoming[0]) return upcoming[0].round;

  const pending = regular
    .filter(isActiveScheduleMatch)
    .sort((a, b) => Number(a.round || 0) - Number(b.round || 0) || String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
  if (pending[0]) return pending[0].round;

  return rounds.at(-1);
}

export function buildSmartHighlights(league) {
  const highlights = [];
  const finished = finishedMatches(league).sort((a, b) => (
    Number(b.round || 0) - Number(a.round || 0) ||
    String(b.date).localeCompare(String(a.date))
  ));
  const latestRound = finished[0]?.round;

  if (latestRound) {
    const goalsByPlayer = new Map();
    for (const match of finished.filter((item) => Number(item.round) === Number(latestRound))) {
      for (const event of match.events || []) {
        if (event.type !== "goal") continue;
        goalsByPlayer.set(event.playerId, (goalsByPlayer.get(event.playerId) || 0) + 1);
      }
    }

    for (const [playerId, goals] of goalsByPlayer) {
      if (goals < 2) continue;
      const player = getPlayer(league, playerId);
      const team = player ? getTeam(league, player.teamId) : null;
      if (!player) continue;
      const goalLabel = goals === 2
        ? "doblete"
        : goals === 3
          ? "hattrick"
          : `${goals} goles`;
      highlights.push(`${player.name}${team ? ` de ${team.name}` : ""} hizo ${goalLabel} en la jornada ${latestRound}.`);
    }
  }

  const standings = calculateStandings(league);
  const topTeams = standings.slice(0, 2).map((row) => row.team.id);
  const featuredMatch = league.matches
    .filter(isActiveScheduleMatch)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
    .find((match) => topTeams.includes(match.homeTeamId) && topTeams.includes(match.awayTeamId));

  if (featuredMatch) {
    const home = getTeam(league, featuredMatch.homeTeamId);
    const away = getTeam(league, featuredMatch.awayTeamId);
    highlights.push(`Partido destacado: ${home?.name || "Local"} vs ${away?.name || "Visitante"}, duelo directo en la parte alta.`);
  }

  return highlights.slice(0, 4);
}

export function getIdentityTags(league) {
  return [league.identity.nickname, ...(league.identity.activities || "").split(",")]
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDate(value) {
  if (!value) return "Fecha por definir";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Fecha por definir";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

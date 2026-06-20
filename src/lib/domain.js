import { DEFAULT_IDENTITY, seedData } from "../data/seedData.js";

export const YELLOW_SUSPENSION_LIMIT = 3;
export const MAX_IMAGE_DATA_URL_LENGTH = 1_800_000;

const ALLOWED_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

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
    currentLeagueId: data.currentLeagueId || data.leagues?.[0]?.id || seedData.currentLeagueId,
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
      const currentCompetitionId = competitions.some((competition) => competition.id === league.currentCompetitionId)
        ? league.currentCompetitionId
        : competitions.find((competition) => competition.status === "active")?.id || competitions[0]?.id || fallbackCompetition.id;
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
        currentCompetitionId,
        competitions,
        identity: {
          ...DEFAULT_IDENTITY,
          ...(league.identity || {}),
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
          playoffQualifiers: 8,
          notes: "SI UN EQUIPO SE DA DE BAJA, LA LIGA PUEDE OTORGAR TRIUNFO POR DEFAULT SEGUN SUS ESTATUTOS.",
          ...(league.rules || {}),
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
          photoAuthorized: player.photoAuthorized === true
        })),
        sanctions: (league.sanctions || []).map((sanction) => ({
          ...sanction,
          competitionId: sanction.competitionId || currentCompetitionId,
          type: upperText(sanction.type),
          reason: upperText(sanction.reason),
          matches: Number(sanction.matches || 0),
          status: sanction.status || "active",
          notes: upperText(sanction.notes)
        })),
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
          stage: match.stage || "regular",
          playoffRound: upperText(match.playoffRound),
          playoffLeg: upperText(match.playoffLeg),
          venue: upperText(match.venue),
          aggregateHome: match.aggregateHome ?? null,
          aggregateAway: match.aggregateAway ?? null,
          observations: upperText(match.observations || ""),
          resolutionType: match.resolutionType || "normal",
          resolutionNote: match.resolutionNote ? upperText(match.resolutionNote) : null,
          events: (match.events || []).map((event) => ({
            ...event,
            reason: upperText(event.reason)
          }))
        }))
      };
    })
  };
}

export function getCurrentLeague(store) {
  return store.leagues.find((league) => league.id === store.currentLeagueId) || store.leagues[0];
}

export function getTeam(league, teamId) {
  return league.teams.find((team) => team.id === teamId);
}

export function getPlayer(league, playerId) {
  return league.players.find((player) => player.id === playerId);
}

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getDefaultCompetitionId(league) {
  return league.currentCompetitionId || league.competitions?.find((competition) => competition.status === "active")?.id || league.competitions?.[0]?.id || "";
}

export function getCompetition(league, competitionId) {
  return league.competitions?.find((competition) => competition.id === competitionId) || league.competitions?.[0] || null;
}

export function scopeLeagueToCompetition(league, competitionId = getDefaultCompetitionId(league)) {
  const targetCompetitionId = competitionId || getDefaultCompetitionId(league);
  const teams = league.teams.filter((team) => (team.competitionId || targetCompetitionId) === targetCompetitionId);
  const teamIds = new Set(teams.map((team) => team.id));

  return {
    ...league,
    currentCompetitionId: targetCompetitionId,
    teams,
    players: league.players.filter((player) => (
      (player.competitionId || targetCompetitionId) === targetCompetitionId ||
      teamIds.has(player.teamId)
    )),
    matches: league.matches.filter((match) => match.competitionId === targetCompetitionId),
    sanctions: (league.sanctions || []).filter((sanction) => !sanction.competitionId || sanction.competitionId === targetCompetitionId),
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
        goals: 0,
        yellowCards: 0,
        redCards: 0,
        suspensionMatches: 0,
        extraSanctions: [],
        reasons: []
      }
    ])
  );

  for (const match of finishedMatches(league)) {
    for (const event of match.events) {
      const row = stats.get(event.playerId);
      if (!row) continue;

      if (event.type === "goal") row.goals += 1;
      if (event.type === "yellow") row.yellowCards += 1;
      if (event.type === "red") {
        row.redCards += 1;
        row.suspensionMatches += Number(event.suspensionMatches || 1);
        row.reasons.push(event.reason || "Tarjeta roja");
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

    row.suspensionMatches += Number(sanction.matches || 0);
    row.extraSanctions.push(sanction);
    row.reasons.push(sanction.reason || sanction.type || "Sancion disciplinaria");
  }

  return [...stats.values()];
}

export function calculateYellowCardDiscipline(league) {
  const yellowLimit = Number(league.rules?.yellowSuspensionLimit || YELLOW_SUSPENSION_LIMIT);
  const states = new Map();

  function getState(playerId) {
    if (!states.has(playerId)) {
      states.set(playerId, {
        playerId,
        yellowCards: 0,
        suspensionOrigin: null
      });
    }
    return states.get(playerId);
  }

  for (const match of sortMatches(finishedMatches(league))) {
    for (const state of states.values()) {
      if (!state.suspensionOrigin) continue;
      const player = getPlayer(league, state.playerId);
      if (player && involvesTeam(match, player.teamId) && isAfterOrigin(match, state.suspensionOrigin)) {
        state.yellowCards = 0;
        state.suspensionOrigin = null;
      }
    }

    for (const event of match.events || []) {
      if (event.type !== "yellow") continue;
      const player = getPlayer(league, event.playerId);
      if (!player || !involvesTeam(match, player.teamId)) continue;

      const state = getState(event.playerId);
      if (state.suspensionOrigin) continue;

      state.yellowCards += 1;
      if (state.yellowCards >= yellowLimit) {
        state.yellowCards = yellowLimit;
        state.suspensionOrigin = { date: match.date, round: match.round, matchId: match.id };
      }
    }
  }

  return [...states.values()]
    .map((state) => {
      const player = getPlayer(league, state.playerId);
      if (!player || !state.yellowCards) return null;
      const team = getTeam(league, player.teamId);
      const isSuspended = Boolean(state.suspensionOrigin);

      return {
        player,
        team,
        yellowCards: state.yellowCards,
        yellowLimit,
        remainingToSuspension: Math.max(yellowLimit - state.yellowCards, 0),
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
  return sortMatches(league.matches.filter((match) => match.status === "scheduled" && involvesTeam(match, teamId)))[0] || null;
}

function getReturnMatch(league, teamId, remainingMatches, origin) {
  const scheduled = sortMatches(league.matches.filter((match) => match.status === "scheduled" && involvesTeam(match, teamId) && isAfterOrigin(match, origin)));
  if (remainingMatches > 0) return scheduled[remainingMatches] || null;
  return scheduled[0] || null;
}

function buildSuspensionNotice(league, { playerId, totalMatches, reason, type, origin }) {
  const player = getPlayer(league, playerId);
  if (!player) return null;

  const team = getTeam(league, player.teamId);
  const total = Number(totalMatches || 0);
  if (total <= 0) return null;

  const servedMatches = getServedMatches(league, player.teamId, origin);
  const served = Math.min(servedMatches.length, total);
  const remaining = Math.max(total - served, 0);
  const nextMatch = getNextScheduledMatch(league, player.teamId);
  const returnMatch = getReturnMatch(league, player.teamId, remaining, origin);
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
    returnRound: returnMatch?.round || fallbackReturnRound || ""
  };
}

export function calculateSuspensionNotices(league) {
  const notices = [];

  for (const match of finishedMatches(league)) {
    for (const event of match.events || []) {
      if (event.type !== "red") continue;
      notices.push(buildSuspensionNotice(league, {
        playerId: event.playerId,
        totalMatches: event.suspensionMatches || league.rules?.defaultRedSuspensionMatches || 1,
        reason: event.reason || "Tarjeta roja",
        type: "Expulsion",
        origin: { date: match.date, round: match.round, matchId: match.id }
      }));
    }
  }

  const yellowLimit = Number(league.rules?.yellowSuspensionLimit || YELLOW_SUSPENSION_LIMIT);
  const yellowCounts = new Map();
  for (const match of sortMatches(finishedMatches(league))) {
    for (const event of match.events || []) {
      if (event.type !== "yellow") continue;
      const count = (yellowCounts.get(event.playerId) || 0) + 1;
      yellowCounts.set(event.playerId, count);
      if (count === yellowLimit) {
        notices.push(buildSuspensionNotice(league, {
          playerId: event.playerId,
          totalMatches: 1,
          reason: `Acumulacion de ${yellowLimit} amarillas`,
          type: "Acumulacion",
          origin: { date: match.date, round: match.round, matchId: match.id }
        }));
      }
    }
  }

  for (const sanction of league.sanctions || []) {
    if (sanction.status === "revoked") continue;
    notices.push(buildSuspensionNotice(league, {
      playerId: sanction.playerId,
      totalMatches: sanction.matches,
      reason: sanction.reason || sanction.type || "Sancion disciplinaria",
      type: sanction.type || "Sancion disciplinaria",
      origin: { date: sanction.date, sanctionId: sanction.id }
    }));
  }

  return notices
    .filter(Boolean)
    .sort((a, b) => (
      (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
      b.remainingMatches - a.remainingMatches ||
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
    .filter((match) => match.status === "scheduled" && match.date >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
  if (upcoming[0]) return upcoming[0].round;

  const pending = regular
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.round || 0) - Number(a.round || 0));
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
    .filter((match) => match.status === "scheduled")
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
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

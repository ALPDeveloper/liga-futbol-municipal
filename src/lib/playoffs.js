import { calculateStandings, getDefaultCompetitionId, makeId, scopeLeagueToCompetition, upperText } from "./domain.js";

export const PLAYOFF_PHASES = [
  { value: "round32", label: "16vos de final", teams: 32 },
  { value: "round16", label: "8vos de final", teams: 16 },
  { value: "quarterfinal", label: "Cuartos de final", teams: 8 },
  { value: "semifinal", label: "Semifinal", teams: 4 },
  { value: "final", label: "Final", teams: 2 }
];

export const PLAYOFF_PHASES_BY_VALUE = Object.fromEntries(PLAYOFF_PHASES.map((phase) => [phase.value, phase]));

export const PLAYOFF_TIE_BREAKERS = {
  EXTRA_TIME_PENALTIES: "extra_time_penalties",
  HIGHER_SEED: "higher_seed",
  AWAY_GOALS_HIGHER_SEED: "away_goals_higher_seed",
  AWAY_GOALS_PENALTIES: "away_goals_penalties"
};

export const PLAYOFF_TIE_BREAKER_OPTIONS = [
  { value: PLAYOFF_TIE_BREAKERS.EXTRA_TIME_PENALTIES, label: "Tiempo extra / penales" },
  { value: PLAYOFF_TIE_BREAKERS.HIGHER_SEED, label: "Mejor posicion en tabla" },
  { value: PLAYOFF_TIE_BREAKERS.AWAY_GOALS_HIGHER_SEED, label: "Gol visitante / mejor posicion" },
  { value: PLAYOFF_TIE_BREAKERS.AWAY_GOALS_PENALTIES, label: "Gol visitante / penales" }
];

export function normalizePlayoffTieBreaker(value, fallback = PLAYOFF_TIE_BREAKERS.EXTRA_TIME_PENALTIES) {
  const normalized = String(value || "").trim();
  if (PLAYOFF_TIE_BREAKER_OPTIONS.some((option) => option.value === normalized)) return normalized;
  return PLAYOFF_TIE_BREAKER_OPTIONS.some((option) => option.value === fallback)
    ? fallback
    : PLAYOFF_TIE_BREAKERS.EXTRA_TIME_PENALTIES;
}

export function getPlayoffPhaseByLabel(label) {
  const normalized = upperText(label || "");
  return PLAYOFF_PHASES.find((phase) => upperText(phase.label) === normalized) || null;
}

export function getPlayoffPhaseByTeams(teams) {
  return PLAYOFF_PHASES.find((phase) => phase.teams === Number(teams)) || null;
}

export function getNextPlayoffPhase(phaseOrLabel) {
  const phase = typeof phaseOrLabel === "string" ? getPlayoffPhaseByLabel(phaseOrLabel) : phaseOrLabel;
  const index = PLAYOFF_PHASES.findIndex((item) => item.value === phase?.value);
  if (index < 0 || index >= PLAYOFF_PHASES.length - 1) return null;
  return PLAYOFF_PHASES[index + 1];
}

export function makePlayoffPairs(teamIds) {
  const pairs = [];
  for (let index = 0; index < teamIds.length / 2; index += 1) {
    pairs.push({
      homeTeamId: teamIds[index],
      awayTeamId: teamIds[teamIds.length - 1 - index]
    });
  }
  return pairs;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function makePlayoffMatches({ competitionId, pairs, phaseLabel, legMode, startDate, venue }) {
  const isTwoLegs = legMode === "two_legs";
  const defaultVenue = upperText(venue || "");

  return pairs.flatMap((pair, pairIndex) => {
    const baseMatch = {
      competitionId,
      stage: "playoff",
      playoffRound: upperText(phaseLabel),
      aggregateHome: null,
      aggregateAway: null,
      round: 0,
      time: "",
      venue: defaultVenue,
      status: "scheduled",
      homeGoals: null,
      awayGoals: null,
      observations: "",
      events: []
    };

    if (!isTwoLegs) {
      return [{
        ...baseMatch,
        id: makeId("match"),
        playoffLeg: "",
        date: startDate,
        homeTeamId: pair.homeTeamId,
        awayTeamId: pair.awayTeamId
      }];
    }

    return [
      {
        ...baseMatch,
        id: makeId("match"),
        playoffLeg: "IDA",
        date: startDate,
        homeTeamId: pair.awayTeamId,
        awayTeamId: pair.homeTeamId
      },
      {
        ...baseMatch,
        id: makeId("match"),
        playoffLeg: "VUELTA",
        date: addDays(startDate, 7),
        homeTeamId: pair.homeTeamId,
        awayTeamId: pair.awayTeamId
      }
    ].map((match, index) => ({ ...match, id: `${match.id}-${pairIndex}-${index}` }));
  });
}

function hasScore(value) {
  return value !== null && value !== undefined && value !== "" && Number.isInteger(Number(value));
}

function getSideWinner(match, homeValue, awayValue) {
  if (!hasScore(homeValue) || !hasScore(awayValue)) return "";
  const home = Number(homeValue);
  const away = Number(awayValue);
  if (home === away) return "";
  return home > away ? match.homeTeamId : match.awayTeamId;
}

function getSeedRanking(league, competitionId) {
  if (!league) return new Map();
  const scopedLeague = scopeLeagueToCompetition(league, competitionId);
  return new Map(calculateStandings(scopedLeague).map((row, index) => [row.team.id, index]));
}

function getHigherSeedWinnerTeamId(teamIds, league, competitionId) {
  const ranking = getSeedRanking(league, competitionId);
  return [...new Set(teamIds.filter(Boolean))]
    .sort((a, b) => (ranking.get(a) ?? Number.MAX_SAFE_INTEGER) - (ranking.get(b) ?? Number.MAX_SAFE_INTEGER))[0] || "";
}

function getMatchTieBreakerWinner(match, tieBreaker, league, competitionId) {
  if (tieBreaker === PLAYOFF_TIE_BREAKERS.HIGHER_SEED || tieBreaker === PLAYOFF_TIE_BREAKERS.AWAY_GOALS_HIGHER_SEED) {
    return getHigherSeedWinnerTeamId([match.homeTeamId, match.awayTeamId], league, competitionId);
  }
  return getSideWinner(match, match.extraTimeHomeGoals, match.extraTimeAwayGoals) ||
    getSideWinner(match, match.penaltyHomeGoals, match.penaltyAwayGoals);
}

export function getPlayoffMatchWinnerTeamId(match, options = {}) {
  if (!["finished", "walkover"].includes(match?.status || "")) return "";
  const tieBreaker = normalizePlayoffTieBreaker(options.tieBreaker || getTieBreakerForPhase(options.league, match.playoffRound));
  return getSideWinner(match, match.homeGoals, match.awayGoals) ||
    getMatchTieBreakerWinner(match, tieBreaker, options.league, options.competitionId || match.competitionId);
}

function getMatchupKey(match) {
  return [match.homeTeamId, match.awayTeamId].filter(Boolean).sort().join(":");
}

function sortPlayoffMatches(a, b) {
  const legWeight = (value) => upperText(value) === "IDA" ? 0 : upperText(value) === "VUELTA" ? 2 : 1;
  return legWeight(a.playoffLeg) - legWeight(b.playoffLeg) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || "")) ||
    String(a.id || "").localeCompare(String(b.id || ""));
}

function getAwayGoalsByTeam(matches) {
  const awayGoals = new Map();
  for (const match of matches) {
    if (!hasScore(match.awayGoals)) return null;
    awayGoals.set(match.awayTeamId, (awayGoals.get(match.awayTeamId) || 0) + Number(match.awayGoals));
  }
  return awayGoals;
}

function getTieBreakerForPhase(league, phaseLabel) {
  const phase = getPlayoffPhaseByLabel(phaseLabel);
  const isFinal = phase?.value === "final";
  return normalizePlayoffTieBreaker(
    isFinal ? league?.rules?.playoffFinalTieBreaker : league?.rules?.playoffTieBreaker,
    PLAYOFF_TIE_BREAKERS.EXTRA_TIME_PENALTIES
  );
}

export function getPlayoffMatchupWinnerTeamId(matches, options = {}) {
  const matchupMatches = [...(matches || [])].sort(sortPlayoffMatches);
  if (!matchupMatches.length) return "";
  if (matchupMatches.some((match) => !["finished", "walkover"].includes(match.status || ""))) return "";
  const tieBreaker = normalizePlayoffTieBreaker(options.tieBreaker);
  if (matchupMatches.length === 1) return getPlayoffMatchWinnerTeamId(matchupMatches[0], { ...options, tieBreaker });

  const scores = new Map();
  for (const match of matchupMatches) {
    if (!hasScore(match.homeGoals) || !hasScore(match.awayGoals)) return "";
    scores.set(match.homeTeamId, (scores.get(match.homeTeamId) || 0) + Number(match.homeGoals));
    scores.set(match.awayTeamId, (scores.get(match.awayTeamId) || 0) + Number(match.awayGoals));
  }
  const [first, second] = [...scores.entries()];
  if (!first || !second) return "";
  if (first[1] !== second[1]) return first[1] > second[1] ? first[0] : second[0];

  if (tieBreaker === PLAYOFF_TIE_BREAKERS.AWAY_GOALS_HIGHER_SEED || tieBreaker === PLAYOFF_TIE_BREAKERS.AWAY_GOALS_PENALTIES) {
    const awayGoals = getAwayGoalsByTeam(matchupMatches);
    if (awayGoals) {
      const [firstAway, secondAway] = [awayGoals.get(first[0]) || 0, awayGoals.get(second[0]) || 0];
      if (firstAway !== secondAway) return firstAway > secondAway ? first[0] : second[0];
    }
  }

  if (tieBreaker === PLAYOFF_TIE_BREAKERS.HIGHER_SEED || tieBreaker === PLAYOFF_TIE_BREAKERS.AWAY_GOALS_HIGHER_SEED) {
    return getHigherSeedWinnerTeamId([first[0], second[0]], options.league, options.competitionId);
  }

  const decisiveMatch = matchupMatches.at(-1);
  return getSideWinner(decisiveMatch, decisiveMatch.extraTimeHomeGoals, decisiveMatch.extraTimeAwayGoals) ||
    getSideWinner(decisiveMatch, decisiveMatch.penaltyHomeGoals, decisiveMatch.penaltyAwayGoals);
}

export function getPlayoffPhaseStatus(league, competitionId, phaseLabel) {
  const targetCompetitionId = competitionId || getDefaultCompetitionId(league);
  const phase = getPlayoffPhaseByLabel(phaseLabel);
  if (!phase) return null;
  const tieBreaker = getTieBreakerForPhase(league, phase.label);
  const matches = (league.matches || [])
    .filter((match) => (
      (match.competitionId || targetCompetitionId) === targetCompetitionId &&
      (match.stage || "regular") === "playoff" &&
      upperText(match.playoffRound || "") === upperText(phase.label)
    ))
    .sort(sortPlayoffMatches);

  const matchups = [];
  const matchupMap = new Map();
  for (const match of matches) {
    const key = getMatchupKey(match);
    if (!key) continue;
    if (!matchupMap.has(key)) {
      const item = { key, matches: [] };
      matchupMap.set(key, item);
      matchups.push(item);
    }
    matchupMap.get(key).matches.push(match);
  }

  const winners = matchups
    .map((matchup) => ({
      ...matchup,
      winnerTeamId: getPlayoffMatchupWinnerTeamId(matchup.matches, { league, competitionId: targetCompetitionId, tieBreaker })
    }));
  const unresolvedCount = winners.filter((matchup) => !matchup.winnerTeamId).length;
  const nextPhase = getNextPlayoffPhase(phase);

  return {
    phase,
    nextPhase,
    matches,
    matchups: winners,
    winners: winners.filter((matchup) => matchup.winnerTeamId),
    unresolvedCount,
    isReadyToAdvance: matches.length > 0 && unresolvedCount === 0 && Boolean(nextPhase)
  };
}

export function getAvailableNextPlayoffPhaseStatus(league, competitionId, requestedPhase = "") {
  const targetCompetitionId = competitionId || getDefaultCompetitionId(league);
  const requested = requestedPhase
    ? PLAYOFF_PHASES_BY_VALUE[requestedPhase] || getPlayoffPhaseByLabel(requestedPhase)
    : null;
  const phases = requested ? [requested] : PLAYOFF_PHASES;
  return phases
    .map((phase) => getPlayoffPhaseStatus(league, targetCompetitionId, phase.label))
    .find((status) => {
      if (!status?.isReadyToAdvance) return false;
      return !(league.matches || []).some((match) => (
        (match.competitionId || targetCompetitionId) === targetCompetitionId &&
        (match.stage || "regular") === "playoff" &&
        upperText(match.playoffRound || "") === upperText(status.nextPhase.label)
      ));
    }) || null;
}

export function sortPlayoffWinnerIdsBySeed(league, competitionId, winnerTeamIds) {
  const scopedLeague = scopeLeagueToCompetition(league, competitionId);
  const ranking = new Map(
    calculateStandings(scopedLeague).map((row, index) => [row.team.id, index])
  );
  return [...winnerTeamIds].sort((a, b) => (
    (ranking.get(a) ?? Number.MAX_SAFE_INTEGER) - (ranking.get(b) ?? Number.MAX_SAFE_INTEGER)
  ));
}

import { DEFAULT_IDENTITY } from "../data/seedData.js";
import { getDefaultCompetitionId, getPlayer, makeId, upperText } from "./domain.js";

function updateLeague(store, leagueId, updater) {
  return {
    ...store,
    leagues: store.leagues.map((league) => (league.id === leagueId ? updater(league) : league))
  };
}

export function addTeam(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    teams: [
      ...league.teams,
      {
        id: makeId("team"),
        name: upperText(payload.name),
        coach: upperText(payload.coach),
        colors: "#0f766e"
      }
    ]
  }));
}

export function updateTeam(store, leagueId, teamId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    teams: league.teams.map((team) => {
      if (team.id !== teamId) return team;

      return {
        ...team,
        name: upperText(payload.name),
        coach: upperText(payload.coach),
        colors: payload.colors || team.colors,
        status: payload.status || team.status || "active",
        withdrawnRound: payload.status === "withdrawn" ? Number(payload.withdrawnRound || 0) || null : null,
        withdrawnReason: payload.status === "withdrawn" ? upperText(payload.withdrawnReason || "Baja a medio torneo") : null
      };
    }),
    matches: payload.status === "withdrawn"
      ? applyWithdrawalWalkovers(league, teamId, payload)
      : league.matches
  }));
}

function applyWithdrawalWalkovers(league, teamId, payload) {
  if (league.rules?.withdrawalPolicy !== "award_walkover") return league.matches;

  const fromRound = Number(payload.withdrawnRound || 0);
  const reason = payload.withdrawnReason || "Baja a medio torneo";
  const goalsFor = Number(league.rules?.forfeitGoalsFor ?? 3);
  const goalsAgainst = Number(league.rules?.forfeitGoalsAgainst ?? 0);

  return league.matches.map((match) => {
    const involvesWithdrawnTeam = match.homeTeamId === teamId || match.awayTeamId === teamId;
    const isFutureRound = !fromRound || Number(match.round) >= fromRound;
    if (!involvesWithdrawnTeam || !isFutureRound || match.status !== "scheduled") return match;

    const withdrawnIsHome = match.homeTeamId === teamId;
    return {
      ...match,
      status: "walkover",
      resolutionType: "team_withdrawal",
      resolutionNote: reason,
      homeGoals: withdrawnIsHome ? goalsAgainst : goalsFor,
      awayGoals: withdrawnIsHome ? goalsFor : goalsAgainst,
      events: []
    };
  });
}

export function deleteTeam(store, leagueId, teamId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    teams: league.teams.filter((team) => team.id !== teamId),
    players: league.players.filter((player) => player.teamId !== teamId),
    sanctions: (league.sanctions || []).filter((sanction) => {
      const player = league.players.find((item) => item.id === sanction.playerId);
      return player?.teamId !== teamId;
    }),
    injuries: (league.injuries || []).filter((injury) => {
      const player = league.players.find((item) => item.id === injury.playerId);
      return player?.teamId !== teamId;
    }),
    matches: league.matches.filter((match) => match.homeTeamId !== teamId && match.awayTeamId !== teamId)
  }));
}

export function addPlayer(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    players: [
      ...league.players,
      {
        id: makeId("player"),
        teamId: payload.teamId,
        name: upperText(payload.name),
        number: Number(payload.number || 0),
        position: upperText(payload.position || "Jugador")
      }
    ]
  }));
}

export function updatePlayer(store, leagueId, playerId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    players: league.players.map((player) => (
      player.id === playerId
        ? {
            ...player,
            teamId: payload.teamId,
            name: upperText(payload.name),
            number: Number(payload.number || 0),
            position: upperText(payload.position || "Jugador")
          }
        : player
    ))
  }));
}

export function deletePlayer(store, leagueId, playerId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    players: league.players.filter((player) => player.id !== playerId),
    sanctions: (league.sanctions || []).filter((sanction) => sanction.playerId !== playerId),
    injuries: (league.injuries || []).filter((injury) => injury.playerId !== playerId),
    matches: league.matches.map((match) => ({
      ...match,
      events: match.events.filter((event) => event.playerId !== playerId)
    }))
  }));
}

function checkboxValue(value) {
  return value === true || value === "on" || value === "true" || value === "1";
}

export function addPlayerSanction(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    sanctions: [
      ...(league.sanctions || []),
      {
        id: makeId("sanction"),
        competitionId: payload.competitionId || getDefaultCompetitionId(league),
        playerId: payload.playerId,
        type: upperText(payload.type || "Sancion disciplinaria"),
        matches: Number(payload.matches || 0),
        reason: upperText(payload.reason || ""),
        date: payload.date || new Date().toISOString().slice(0, 10),
        status: payload.status || "active",
        notes: upperText(payload.notes || "")
      }
    ]
  }));
}

export function deletePlayerSanction(store, leagueId, sanctionId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    sanctions: (league.sanctions || []).filter((sanction) => sanction.id !== sanctionId)
  }));
}

export function addPlayerInjury(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    injuries: [
      ...(league.injuries || []),
      {
        id: makeId("injury"),
        competitionId: payload.competitionId || getDefaultCompetitionId(league),
        playerId: payload.playerId,
        type: upperText(payload.type || "Lesion"),
        date: payload.date || new Date().toISOString().slice(0, 10),
        expectedReturn: payload.expectedReturn || "",
        needsSurgery: checkboxValue(payload.needsSurgery),
        needsSupport: checkboxValue(payload.needsSupport),
        supportDetail: upperText(payload.supportDetail || ""),
        status: payload.status || "active",
        notes: upperText(payload.notes || "")
      }
    ]
  }));
}

export function updatePlayerInjury(store, leagueId, injuryId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    injuries: (league.injuries || []).map((injury) => (
      injury.id === injuryId
        ? {
            ...injury,
            competitionId: payload.competitionId || injury.competitionId || getDefaultCompetitionId(league),
            playerId: payload.playerId || injury.playerId,
            type: upperText(payload.type || injury.type || "Lesion"),
            date: payload.date || "",
            expectedReturn: payload.expectedReturn || "",
            needsSurgery: checkboxValue(payload.needsSurgery),
            needsSupport: checkboxValue(payload.needsSupport),
            supportDetail: upperText(payload.supportDetail || ""),
            status: payload.status || injury.status || "active",
            notes: upperText(payload.notes || "")
          }
        : injury
    ))
  }));
}

export function deletePlayerInjury(store, leagueId, injuryId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    injuries: (league.injuries || []).filter((injury) => injury.id !== injuryId)
  }));
}

export function addMatch(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    matches: [
      ...league.matches,
      {
        id: makeId("match"),
        competitionId: payload.competitionId || getDefaultCompetitionId(league),
        stage: payload.stage || "regular",
        playoffRound: upperText(payload.playoffRound || ""),
        playoffLeg: upperText(payload.playoffLeg || ""),
        aggregateHome: payload.aggregateHome === "" || payload.aggregateHome === undefined ? null : Number(payload.aggregateHome),
        aggregateAway: payload.aggregateAway === "" || payload.aggregateAway === undefined ? null : Number(payload.aggregateAway),
        round: Number(payload.round),
        date: payload.date,
        time: payload.time || "",
        venue: upperText(payload.venue || ""),
        homeTeamId: payload.homeTeamId,
        awayTeamId: payload.awayTeamId,
        status: "scheduled",
        homeGoals: null,
        awayGoals: null,
        events: []
      }
    ]
  }));
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildRoundRobinRounds(teamIds, shouldShuffle) {
  const bye = "__bye__";
  const teams = shouldShuffle ? shuffle(teamIds) : [...teamIds];
  if (teams.length % 2 === 1) teams.push(bye);

  const rounds = [];
  const rotating = [...teams];
  const totalRounds = rotating.length - 1;
  const half = rotating.length / 2;

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const matches = [];
    for (let pairIndex = 0; pairIndex < half; pairIndex += 1) {
      const first = rotating[pairIndex];
      const second = rotating[rotating.length - 1 - pairIndex];
      if (first === bye || second === bye) continue;

      const flip = (roundIndex + pairIndex) % 2 === 1;
      matches.push({
        homeTeamId: flip ? second : first,
        awayTeamId: flip ? first : second
      });
    }

    rounds.push(matches);
    rotating.splice(1, 0, rotating.pop());
  }

  return rounds;
}

function buildLateTeamRounds(allTeamIds, newTeamIds) {
  const pending = [];
  const seen = new Set();

  for (const newTeamId of newTeamIds) {
    for (const opponentId of allTeamIds) {
      if (newTeamId === opponentId) continue;
      const key = [newTeamId, opponentId].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push({ newTeamId, opponentId });
    }
  }

  const rounds = [];
  const homeCounts = new Map(allTeamIds.map((teamId) => [teamId, 0]));

  while (pending.length) {
    const used = new Set();
    const round = [];

    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const pair = pending[index];
      if (used.has(pair.newTeamId) || used.has(pair.opponentId)) continue;

      const newTeamHomeCount = homeCounts.get(pair.newTeamId) || 0;
      const opponentHomeCount = homeCounts.get(pair.opponentId) || 0;
      const newTeamIsHome = newTeamHomeCount <= opponentHomeCount;
      const homeTeamId = newTeamIsHome ? pair.newTeamId : pair.opponentId;
      const awayTeamId = newTeamIsHome ? pair.opponentId : pair.newTeamId;
      homeCounts.set(homeTeamId, (homeCounts.get(homeTeamId) || 0) + 1);
      round.push({ homeTeamId, awayTeamId });
      used.add(pair.newTeamId);
      used.add(pair.opponentId);
      pending.splice(index, 1);
    }

    rounds.push(round.reverse());
  }

  return rounds;
}

function makeScheduleMatches({ competitionId, rounds, startRound, startDate, intervalDays }) {
  return rounds.flatMap((roundMatches, roundIndex) => {
    const round = Number(startRound) + roundIndex;
    const date = addDays(startDate, roundIndex * Number(intervalDays || 7));

    return roundMatches.map((match, matchIndex) => ({
      id: makeId("match"),
      competitionId,
      stage: "regular",
      playoffRound: "",
      playoffLeg: "",
      aggregateHome: null,
      aggregateAway: null,
      round,
      date,
      time: "",
      venue: "",
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      status: "scheduled",
      homeGoals: null,
      awayGoals: null,
      events: []
    }));
  });
}

export function generateSchedule(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => {
    const competitionId = payload.competitionId || getDefaultCompetitionId(league);
    const activeTeamIds = league.teams.filter((team) => team.status !== "withdrawn").map((team) => team.id);
    if (activeTeamIds.length < 2) return league;

    const existingCompetitionMatches = league.matches.filter((match) => match.competitionId === competitionId && (match.stage || "regular") === "regular");
    const mode = payload.mode || "full";
    const startRound = Number(payload.startRound || 1);
    const startDate = payload.startDate || new Date().toISOString().slice(0, 10);
    const intervalDays = Number(payload.intervalDays || 7);
    const shouldShuffle = payload.randomize === "on";
    const replaceScheduled = payload.replaceScheduled === "on";

    let rounds = [];
    if (mode === "late") {
      const scheduledTeamIds = new Set(existingCompetitionMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
      const newTeamIds = activeTeamIds.filter((teamId) => !scheduledTeamIds.has(teamId));
      rounds = newTeamIds.length ? buildLateTeamRounds(activeTeamIds, shouldShuffle ? shuffle(newTeamIds) : newTeamIds) : [];
    } else {
      rounds = buildRoundRobinRounds(activeTeamIds, shouldShuffle);
    }

    const generatedMatches = makeScheduleMatches({
      competitionId,
      rounds,
      startRound,
      startDate,
      intervalDays
    });

    const matches = replaceScheduled && mode === "full"
      ? league.matches.filter((match) => (
          match.competitionId !== competitionId ||
          (match.stage || "regular") !== "regular" ||
          match.status !== "scheduled"
        ))
      : league.matches;

    return {
      ...league,
      matches: [...matches, ...generatedMatches]
    };
  });
}

export function updateMatch(store, leagueId, matchId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    matches: league.matches.map((match) => (
      match.id === matchId
        ? {
            ...match,
            competitionId: payload.competitionId || match.competitionId || getDefaultCompetitionId(league),
            stage: payload.stage || match.stage || "regular",
            playoffRound: upperText(payload.playoffRound || ""),
            playoffLeg: upperText(payload.playoffLeg || ""),
            aggregateHome: payload.aggregateHome === "" || payload.aggregateHome === undefined ? null : Number(payload.aggregateHome),
            aggregateAway: payload.aggregateAway === "" || payload.aggregateAway === undefined ? null : Number(payload.aggregateAway),
            round: Number(payload.round),
            date: payload.date,
            time: payload.time || "",
            venue: upperText(payload.venue || ""),
            homeTeamId: payload.homeTeamId,
            awayTeamId: payload.awayTeamId,
            status: payload.status || match.status || "scheduled",
            homeGoals: payload.homeGoals === "" || payload.homeGoals === undefined ? null : Number(payload.homeGoals),
            awayGoals: payload.awayGoals === "" || payload.awayGoals === undefined ? null : Number(payload.awayGoals)
          }
        : match
    ))
  }));
}

export function deleteMatch(store, leagueId, matchId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    matches: league.matches.filter((match) => match.id !== matchId)
  }));
}

export function saveIdentity(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    name: upperText(payload.name),
    city: upperText(payload.city),
    season: upperText(payload.season),
    currentCompetitionId: payload.currentCompetitionId || league.currentCompetitionId,
    adBanner: upperText(payload.adBanner ?? league.adBanner),
    highlights: String(payload.highlights || "")
      .split("\n")
      .map((item) => upperText(item))
      .filter(Boolean),
    identity: {
      ...DEFAULT_IDENTITY,
      ...league.identity,
      nickname: upperText(payload.nickname),
      activities: upperText(payload.activities),
      publicIntro: upperText(payload.publicIntro),
      primaryColor: payload.primaryColor,
      secondaryColor: payload.secondaryColor,
      accentColor: payload.accentColor
    }
  }));
}

export function updateLeagueRules(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    rules: {
      ...league.rules,
      withdrawalPolicy: payload.withdrawalPolicy || league.rules?.withdrawalPolicy || "award_walkover",
      forfeitPoints: Number(payload.forfeitPoints ?? league.rules?.forfeitPoints ?? 3),
      forfeitGoalsFor: Number(payload.forfeitGoalsFor ?? league.rules?.forfeitGoalsFor ?? 3),
      forfeitGoalsAgainst: Number(payload.forfeitGoalsAgainst ?? league.rules?.forfeitGoalsAgainst ?? 0),
      yellowSuspensionLimit: Number(payload.yellowSuspensionLimit ?? league.rules?.yellowSuspensionLimit ?? 3),
      defaultRedSuspensionMatches: Number(payload.defaultRedSuspensionMatches ?? league.rules?.defaultRedSuspensionMatches ?? 1),
      notes: upperText(payload.notes || "")
    }
  }));
}

function parseNumberList(value) {
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Boolean);
}

function findPlayerByNumber(league, number) {
  return league.players.find((player) => Number(player.number) === Number(number));
}

export function saveResult(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    matches: league.matches.map((match) => {
      if (match.id !== payload.matchId) return match;

      const events = [];
      for (const number of parseNumberList(payload.goals)) {
        const player = findPlayerByNumber(league, number);
        if (player) events.push({ type: "goal", playerId: player.id, teamId: player.teamId, minute: 0 });
      }

      for (const number of parseNumberList(payload.yellows)) {
        const player = findPlayerByNumber(league, number);
        if (player) events.push({ type: "yellow", playerId: player.id, teamId: player.teamId, minute: 0 });
      }

      const redRows = String(payload.reds || "").split(",").map((row) => row.trim()).filter(Boolean);
      for (const row of redRows) {
        const [number, suspensionMatches = "1", reason = "Tarjeta roja"] = row.split(":");
        const player = findPlayerByNumber(league, Number(number));
        if (player) {
          events.push({
            type: "red",
            playerId: player.id,
            teamId: player.teamId,
            minute: 0,
            suspensionMatches: Number(suspensionMatches),
            reason
          });
        }
      }

      return {
        ...match,
        homeGoals: Number(payload.homeGoals),
        awayGoals: Number(payload.awayGoals),
        status: "finished",
        events
      };
    })
  }));
}

export function saveMatchSheet(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    matches: league.matches.map((match) => {
      if (match.id !== payload.matchId) return match;
      const homeGoals = Number(payload.homeGoals);
      const awayGoals = Number(payload.awayGoals);
      if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) {
        throw new Error("El marcador del acta no es valido.");
      }

      const events = payload.events
        .map((event) => {
          const player = getPlayer(league, event.playerId);
          if (!player) return null;
          if (![match.homeTeamId, match.awayTeamId].includes(player.teamId)) return null;
          if (event.teamId && event.teamId !== player.teamId) return null;
          if (!["goal", "yellow", "red"].includes(event.type)) return null;
          const minute = Number(event.minute || 0);
          if (minute < 0 || minute > 130) throw new Error("Los minutos del acta deben estar entre 0 y 130.");
          if (event.type === "red" && !String(event.reason || "").trim()) {
            throw new Error("Toda tarjeta roja debe tener motivo.");
          }
          if (event.type === "red" && Number(event.suspensionMatches || 0) < 1) {
            throw new Error("Toda tarjeta roja debe tener partidos de sancion.");
          }

          return {
            type: event.type,
            playerId: player.id,
            teamId: player.teamId,
            minute,
            suspensionMatches: event.type === "red"
              ? Number(event.suspensionMatches || league.rules?.defaultRedSuspensionMatches || 1)
              : 0,
            reason: event.type === "red" ? upperText(event.reason || "Tarjeta roja") : ""
          };
        })
        .filter(Boolean);
      const goals = events.filter((event) => event.type === "goal");
      const homeGoalEvents = goals.filter((event) => event.teamId === match.homeTeamId).length;
      const awayGoalEvents = goals.filter((event) => event.teamId === match.awayTeamId).length;
      if (homeGoalEvents !== homeGoals || awayGoalEvents !== awayGoals) {
        throw new Error("Los goleadores capturados no coinciden con el marcador.");
      }

      return {
        ...match,
        homeGoals,
        awayGoals,
        status: "finished",
        events
      };
    })
  }));
}

export function addLeague(store, payload) {
  const id = makeId("league");
  const competitionId = makeId("competition");
  return {
    ...store,
    currentLeagueId: id,
    leagues: [
      ...store.leagues,
      {
        id,
        name: upperText(payload.name),
        city: upperText(payload.city),
        season: "APERTURA 2026",
        currentCompetitionId: competitionId,
        competitions: [
          {
            id: competitionId,
            name: "TORNEO DE LIGA",
            type: "liga",
            season: "APERTURA 2026",
            status: "active",
            startsAt: "",
            endsAt: ""
          }
        ],
        status: "active",
        plan: "Membresia Basica",
        ownerEmail: payload.ownerEmail,
        renewalDate: "",
        membershipNotes: "",
        adBanner: "ESPACIO DISPONIBLE PARA PATROCINADOR",
        identity: { ...DEFAULT_IDENTITY },
        highlights: ["LIGA CREADA. AGREGA EQUIPOS, JUGADORES Y CALENDARIO."],
        teams: [],
        players: [],
        matches: []
      }
    ]
  };
}

export function addCompetition(store, leagueId, payload) {
  const id = makeId("competition");

  return updateLeague(store, leagueId, (league) => ({
    ...league,
    currentCompetitionId: league.currentCompetitionId || id,
    competitions: [
      ...(league.competitions || []),
      {
        id,
        name: upperText(payload.name),
        type: payload.type || "liga",
        season: upperText(payload.season || league.season),
        status: payload.status || "active",
        activeRound: Number(payload.activeRound || 0) || "",
        startsAt: payload.startsAt || "",
        endsAt: payload.endsAt || ""
      }
    ]
  }));
}

export function updateCompetition(store, leagueId, competitionId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    currentCompetitionId: payload.makeCurrent ? competitionId : league.currentCompetitionId,
    competitions: (league.competitions || []).map((competition) => (
      competition.id === competitionId
        ? {
            ...competition,
            name: upperText(payload.name),
            type: payload.type || competition.type,
            season: upperText(payload.season || league.season),
            status: payload.status || competition.status,
            activeRound: Number(payload.activeRound || 0) || "",
            startsAt: payload.startsAt || "",
            endsAt: payload.endsAt || ""
          }
        : competition
    ))
  }));
}

export function updateLeagueMembership(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    plan: payload.plan || league.plan,
    status: payload.status || league.status,
    ownerEmail: payload.ownerEmail || "",
    renewalDate: payload.renewalDate || "",
    membershipNotes: upperText(payload.membershipNotes || "")
  }));
}

export function toggleLeagueStatus(store, leagueId, forcedStatus) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    status: forcedStatus || (league.status === "active" ? "suspended" : "active")
  }));
}

export function deleteLeague(store, leagueId) {
  if (store.leagues.length <= 1) return store;

  const leagues = store.leagues.filter((league) => league.id !== leagueId);
  return {
    ...store,
    leagues,
    currentLeagueId: store.currentLeagueId === leagueId ? leagues[0].id : store.currentLeagueId
  };
}

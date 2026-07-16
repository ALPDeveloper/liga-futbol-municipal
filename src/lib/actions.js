import { DEFAULT_IDENTITY } from "../data/defaultIdentity.js";
import { ACTIVE_SCHEDULE_MATCH_STATUSES, calculateStandings, getDefaultCompetitionId, getEligiblePlayersForTeam, getPlayer, getPlayerNumberForTeam, isPlayerEligibleForTeam, makeId, sanitizeExternalUrl, sanitizeImageUrl, scopeLeagueToCompetition, upperText } from "./domain.js";

function isActiveScheduleMatch(match) {
  return ACTIVE_SCHEDULE_MATCH_STATUSES.includes(match?.status || "scheduled");
}

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
        competitionId: payload.competitionId || getDefaultCompetitionId(league),
        name: upperText(payload.name),
        coach: upperText(payload.coach),
        assistantCoach: upperText(payload.assistantCoach),
        address: upperText(payload.address),
        colors: payload.colors || "#0f766e",
        logoUrl: sanitizeImageUrl(payload.logoUrl)
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
        competitionId: payload.competitionId || team.competitionId || getDefaultCompetitionId(league),
        name: upperText(payload.name),
        coach: upperText(payload.coach),
        assistantCoach: upperText(payload.assistantCoach),
        address: upperText(payload.address),
        colors: payload.colors || team.colors,
        logoUrl: payload.logoUrl === undefined ? sanitizeImageUrl(team.logoUrl) : sanitizeImageUrl(payload.logoUrl),
        status: payload.status || team.status || "active",
        withdrawnRound: payload.status === "withdrawn" ? Number(payload.withdrawnRound || 0) || null : null,
        withdrawnReason: payload.status === "withdrawn" ? upperText(payload.withdrawnReason || "Baja a medio torneo") : null
      };
    }),
    matches: payload.status === "withdrawn"
      ? applyWithdrawalWalkovers(league, teamId, payload)
      : restoreWithdrawalWalkovers(league.matches, teamId)
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
    if (!involvesWithdrawnTeam || !isFutureRound || !isActiveScheduleMatch(match)) return match;

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

function restoreWithdrawalWalkovers(matches, teamId) {
  return matches.map((match) => {
    const wasWithdrawalWalkover = match.status === "walkover" &&
      match.resolutionType === "team_withdrawal" &&
      (match.homeTeamId === teamId || match.awayTeamId === teamId);
    if (!wasWithdrawalWalkover) return match;

    return {
      ...match,
      status: "scheduled",
      resolutionType: "",
      resolutionNote: "",
      homeGoals: null,
      awayGoals: null,
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
    teamAffiliations: (league.teamAffiliations || []).filter((affiliation) => (
      affiliation.sourceTeamId !== teamId && affiliation.targetTeamId !== teamId
    )),
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
        competitionId: payload.competitionId || league.teams.find((team) => team.id === payload.teamId)?.competitionId || getDefaultCompetitionId(league),
        name: upperText(payload.name),
        number: Number(payload.number || 0),
        position: upperText(payload.position || "Jugador"),
        photoUrl: sanitizeImageUrl(payload.photoUrl),
        photoAuthorized: checkboxValue(payload.photoAuthorized)
      }
    ]
  }));
}

export function updatePlayer(store, leagueId, playerId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    players: league.players.map((player) => {
      if (player.id !== playerId) return player;
      const team = league.teams.find((item) => item.id === payload.teamId);

      return {
        ...player,
        teamId: payload.teamId,
        competitionId: payload.competitionId || team?.competitionId || player.competitionId || getDefaultCompetitionId(league),
        name: upperText(payload.name),
        number: Number(payload.number || 0),
        position: upperText(payload.position || "Jugador"),
        photoUrl: payload.photoUrl === undefined ? sanitizeImageUrl(player.photoUrl) : sanitizeImageUrl(payload.photoUrl),
        photoAuthorized: checkboxValue(payload.photoAuthorized)
      };
    })
  }));
}

export function deletePlayer(store, leagueId, playerId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    players: league.players.filter((player) => player.id !== playerId),
    sanctions: (league.sanctions || []).filter((sanction) => sanction.playerId !== playerId),
    disciplineLinks: (league.disciplineLinks || [])
      .map((link) => ({ ...link, playerIds: (link.playerIds || []).filter((item) => item !== playerId) }))
      .filter((link) => link.playerIds.length > 1),
    disciplineAdjustments: (league.disciplineAdjustments || []).filter((adjustment) => adjustment.playerId !== playerId),
    disciplineResets: (league.disciplineResets || []).filter((reset) => reset.playerId !== playerId),
    appearanceAdjustments: (league.appearanceAdjustments || []).filter((adjustment) => adjustment.playerId !== playerId),
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
        matches: checkboxValue(payload.indefinite) ? 0 : Number(payload.matches || 0),
        indefinite: checkboxValue(payload.indefinite),
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

export function resolveMatchEventDiscipline(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => {
    const matchId = String(payload.matchId || "").trim();
    const eventIndex = Number(payload.eventIndex);
    const resolutionType = ["matches", "indefinite", "release"].includes(payload.resolutionType)
      ? payload.resolutionType
      : "matches";
    const sanctionMatches = resolutionType === "matches" ? Number(payload.matches || 0) : 0;
    if (!matchId || !Number.isInteger(eventIndex) || eventIndex < 0) return league;
    if (resolutionType === "matches" && (!Number.isInteger(sanctionMatches) || sanctionMatches < 1 || sanctionMatches > 99)) {
      throw new Error("La sancion debe ser de 1 a 99 partidos.");
    }

    const targetMatch = (league.matches || []).find((match) => match.id === matchId);
    const targetEvent = targetMatch?.events?.[eventIndex];
    if (!targetMatch || !targetEvent || targetEvent.type !== "red" || !targetEvent.playerId) return league;

    const reason = upperText(payload.reason || targetEvent.reason || "Tarjeta roja");
    const date = payload.date || targetMatch.date || new Date().toISOString().slice(0, 10);
    const resolutionNote = upperText([
      `RESOLUCION COMISION ACTA ${targetMatch.id}`,
      `EVENTO ${eventIndex}`,
      `JORNADA ${targetMatch.round || "-"}`,
      payload.notes || ""
    ].filter(Boolean).join(" "));
    const nextSanction = {
      id: makeId("sanction"),
      competitionId: targetMatch.competitionId || payload.competitionId || getDefaultCompetitionId(league),
      playerId: targetEvent.playerId,
      type: upperText(payload.type || "Expulsion"),
      matches: resolutionType === "matches" ? sanctionMatches : 0,
      indefinite: resolutionType === "indefinite",
      reason: resolutionType === "release" ? upperText(payload.reason || "Sin suspension adicional por comision") : reason,
      date,
      status: resolutionType === "release" ? "cleared" : "active",
      notes: resolutionNote
    };

    return {
      ...league,
      matches: (league.matches || []).map((match) => {
        if (match.id !== targetMatch.id) return match;
        return {
          ...match,
          events: (match.events || []).map((event, index) => (
            index === eventIndex
              ? {
                ...event,
                suspensionMatches: 0,
                suspensionIndefinite: false,
                disciplinaryPending: true,
                reason
              }
              : event
          ))
        };
      }),
      sanctions: [
        ...(league.sanctions || []).filter((sanction) => !(
          sanction.playerId === targetEvent.playerId &&
          upperText(sanction.notes || "").includes(upperText(targetMatch.id))
        )),
        nextSanction
      ]
    };
  });
}

export function addDisciplineLink(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => {
    const playerIds = [...new Set([payload.playerId, payload.linkedPlayerId].filter(Boolean))];
    if (playerIds.length < 2 || playerIds.some((playerId) => !getPlayer(league, playerId))) return league;

    const mergedIds = new Set(playerIds);
    const remainingLinks = [];
    for (const link of league.disciplineLinks || []) {
      const intersects = (link.playerIds || []).some((playerId) => mergedIds.has(playerId));
      if (intersects) {
        for (const playerId of link.playerIds || []) mergedIds.add(playerId);
      } else {
        remainingLinks.push(link);
      }
    }

    return {
      ...league,
      disciplineLinks: [
        ...remainingLinks,
        {
          id: makeId("discipline-link"),
          playerIds: [...mergedIds],
          notes: upperText(payload.notes || "")
        }
      ]
    };
  });
}

export function deleteDisciplineLink(store, leagueId, linkId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    disciplineLinks: (league.disciplineLinks || []).filter((link) => link.id !== linkId)
  }));
}

export function addDisciplineAdjustment(store, leagueId, payload) {
  const value = payload.direction === "subtract" ? -Math.abs(Number(payload.value || 1)) : Math.abs(Number(payload.value || 1));

  return updateLeague(store, leagueId, (league) => ({
    ...league,
    disciplineAdjustments: [
      ...(league.disciplineAdjustments || []),
      {
        id: makeId("discipline-adjustment"),
        competitionId: payload.competitionId || getDefaultCompetitionId(league),
        playerId: payload.playerId,
        value,
        date: payload.date || new Date().toISOString().slice(0, 10),
        reason: upperText(payload.reason || "Ajuste manual de amarillas"),
        notes: upperText(payload.notes || ""),
        status: "active"
      }
    ]
  }));
}

export function deleteDisciplineAdjustment(store, leagueId, adjustmentId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    disciplineAdjustments: (league.disciplineAdjustments || []).filter((adjustment) => adjustment.id !== adjustmentId)
  }));
}

export function addAppearanceAdjustment(store, leagueId, payload) {
  const value = payload.direction === "subtract" ? -Math.abs(Number(payload.value || 1)) : Math.abs(Number(payload.value || 1));

  return updateLeague(store, leagueId, (league) => ({
    ...league,
    appearanceAdjustments: [
      ...(league.appearanceAdjustments || []),
      {
        id: makeId("appearance-adjustment"),
        playerId: payload.playerId,
        value,
        date: payload.date || new Date().toISOString().slice(0, 10),
        reason: upperText(payload.reason || "Ajuste manual de partidos jugados"),
        notes: upperText(payload.notes || ""),
        status: "active"
      }
    ]
  }));
}

export function deleteAppearanceAdjustment(store, leagueId, adjustmentId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    appearanceAdjustments: (league.appearanceAdjustments || []).filter((adjustment) => adjustment.id !== adjustmentId)
  }));
}

export function addDisciplineReset(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    disciplineResets: [
      ...(league.disciplineResets || []),
      {
        id: makeId("discipline-reset"),
        playerId: payload.playerId,
        date: payload.date || new Date().toISOString().slice(0, 10),
        reason: upperText(payload.reason || "Sancion cumplida"),
        notes: upperText(payload.notes || ""),
        status: "active"
      }
    ]
  }));
}

export function deleteDisciplineReset(store, leagueId, resetId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    disciplineResets: (league.disciplineResets || []).filter((reset) => reset.id !== resetId)
  }));
}

export function addTeamAffiliation(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => {
    const sourceTeamId = payload.sourceTeamId || "";
    const targetTeamId = payload.targetTeamId || "";
    const sourceTeam = league.teams.find((team) => team.id === sourceTeamId);
    const targetTeam = league.teams.find((team) => team.id === targetTeamId);
    if (!sourceTeam || !targetTeam || sourceTeamId === targetTeamId) return league;

    const exists = (league.teamAffiliations || []).some((affiliation) => (
      affiliation.status !== "revoked" &&
      affiliation.sourceTeamId === sourceTeamId &&
      affiliation.targetTeamId === targetTeamId
    ));
    if (exists) return league;

    return {
      ...league,
      teamAffiliations: [
        ...(league.teamAffiliations || []),
        {
          id: makeId("team-affiliation"),
          sourceTeamId,
          targetTeamId,
          status: "active",
          startsAt: payload.startsAt || "",
          endsAt: payload.endsAt || "",
          playerNumbers: {},
          notes: upperText(payload.notes || "")
        }
      ]
    };
  });
}

export function deleteTeamAffiliation(store, leagueId, affiliationId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    teamAffiliations: (league.teamAffiliations || []).filter((affiliation) => affiliation.id !== affiliationId)
  }));
}

export function updateTeamAffiliationPlayerNumber(store, leagueId, affiliationId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    teamAffiliations: (league.teamAffiliations || []).map((affiliation) => {
      if (affiliation.id !== affiliationId) return affiliation;
      const player = getPlayer(league, payload.playerId);
      if (!player || player.teamId !== affiliation.sourceTeamId) return affiliation;
      const number = Number(payload.number || 0);
      return {
        ...affiliation,
        playerNumbers: {
          ...(affiliation.playerNumbers || {}),
          [player.id]: number
        }
      };
    })
  }));
}

export function mergeDuplicatePlayer(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => {
    const targetPlayer = getPlayer(league, payload.targetPlayerId);
    const duplicatePlayer = getPlayer(league, payload.duplicatePlayerId);
    if (!targetPlayer || !duplicatePlayer || targetPlayer.id === duplicatePlayer.id) return league;

    const replacePlayerId = (playerId) => (playerId === duplicatePlayer.id ? targetPlayer.id : playerId);
    const affiliationForDuplicateTeam = (league.teamAffiliations || []).find((affiliation) => (
      affiliation.status !== "revoked" &&
      affiliation.sourceTeamId === targetPlayer.teamId &&
      affiliation.targetTeamId === duplicatePlayer.teamId
    ));

    return {
      ...league,
      players: league.players
        .filter((player) => player.id !== duplicatePlayer.id)
        .map((player) => {
          if (player.id !== targetPlayer.id) return player;
          return {
            ...player,
            photoUrl: player.photoUrl || duplicatePlayer.photoUrl || "",
            photoAuthorized: player.photoAuthorized || duplicatePlayer.photoAuthorized === true
          };
        }),
      teamAffiliations: (league.teamAffiliations || []).map((affiliation) => {
        const playerNumbers = { ...(affiliation.playerNumbers || {}) };
        if (playerNumbers[duplicatePlayer.id] !== undefined) {
          playerNumbers[targetPlayer.id] = playerNumbers[duplicatePlayer.id];
          delete playerNumbers[duplicatePlayer.id];
        }
        if (affiliation.id === affiliationForDuplicateTeam?.id && duplicatePlayer.number) {
          playerNumbers[targetPlayer.id] = Number(duplicatePlayer.number || 0);
        }
        return { ...affiliation, playerNumbers };
      }),
      sanctions: (league.sanctions || []).map((sanction) => ({
        ...sanction,
        playerId: replacePlayerId(sanction.playerId)
      })),
      injuries: (league.injuries || []).map((injury) => ({
        ...injury,
        playerId: replacePlayerId(injury.playerId)
      })),
      disciplineAdjustments: (league.disciplineAdjustments || []).map((adjustment) => ({
        ...adjustment,
        playerId: replacePlayerId(adjustment.playerId)
      })),
      disciplineResets: (league.disciplineResets || []).map((reset) => ({
        ...reset,
        playerId: replacePlayerId(reset.playerId)
      })),
      appearanceAdjustments: (league.appearanceAdjustments || []).map((adjustment) => ({
        ...adjustment,
        playerId: replacePlayerId(adjustment.playerId)
      })),
      disciplineLinks: (league.disciplineLinks || [])
        .map((link) => ({
          ...link,
          playerIds: [...new Set((link.playerIds || []).map(replacePlayerId))]
        }))
        .filter((link) => link.playerIds.length > 1),
      matches: league.matches.map((match) => ({
        ...match,
        events: (match.events || []).map((event) => (
          event.playerId === duplicatePlayer.id
            ? { ...event, playerId: targetPlayer.id, teamId: event.teamId || duplicatePlayer.teamId }
            : event
        ))
      })),
      matchRosters: (league.matchRosters || []).map((roster) => ({
        ...roster,
        captainPlayerId: replacePlayerId(roster.captainPlayerId),
        players: [...new Set((roster.players || []).map((entry) => replacePlayerId(typeof entry === "string" ? entry : entry.playerId)))]
          .filter(Boolean)
          .map((playerId) => ({ playerId }))
      }))
    };
  });
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

export function addAnnouncement(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    announcements: [
      ...(league.announcements || []),
      {
        id: makeId("announcement"),
        title: upperText(payload.title || "Aviso"),
        body: upperText(payload.body || ""),
        status: payload.status || "active",
        date: payload.date || new Date().toISOString().slice(0, 10)
      }
    ]
  }));
}

export function updateAnnouncement(store, leagueId, announcementId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    announcements: (league.announcements || []).map((announcement) => (
      announcement.id === announcementId
        ? {
            ...announcement,
            title: upperText(payload.title || "Aviso"),
            body: upperText(payload.body || ""),
            status: payload.status || announcement.status || "active",
            date: payload.date || ""
          }
        : announcement
    ))
  }));
}

export function deleteAnnouncement(store, leagueId, announcementId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    announcements: (league.announcements || []).filter((announcement) => announcement.id !== announcementId)
  }));
}

export function addSponsor(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    sponsors: [
      ...(league.sponsors || []),
      {
        id: makeId("sponsor"),
        name: upperText(payload.name),
        placement: payload.placement || "home_banner",
        status: payload.status || "active",
        sortOrder: Number(payload.sortOrder || 0),
        imageUrl: sanitizeImageUrl(payload.imageUrl),
        linkUrl: sanitizeExternalUrl(payload.linkUrl),
        notes: upperText(payload.notes || "")
      }
    ]
  }));
}

export function updateSponsor(store, leagueId, sponsorId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    sponsors: (league.sponsors || []).map((sponsor) => (
      sponsor.id === sponsorId
        ? {
            ...sponsor,
            name: upperText(payload.name || sponsor.name),
            placement: payload.placement || sponsor.placement || "home_banner",
            status: payload.status || sponsor.status || "active",
            sortOrder: Number(payload.sortOrder || 0),
            imageUrl: payload.imageUrl === undefined ? sanitizeImageUrl(sponsor.imageUrl) : sanitizeImageUrl(payload.imageUrl),
            linkUrl: payload.linkUrl === undefined ? sanitizeExternalUrl(sponsor.linkUrl) : sanitizeExternalUrl(payload.linkUrl),
            notes: upperText(payload.notes || "")
          }
        : sponsor
    ))
  }));
}

export function deleteSponsor(store, leagueId, sponsorId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    sponsors: (league.sponsors || []).filter((sponsor) => sponsor.id !== sponsorId)
  }));
}

export function addVenue(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    venues: [
      ...(league.venues || []),
      {
        id: makeId("venue"),
        name: upperText(payload.name || "Cancha"),
        address: upperText(payload.address || ""),
        status: payload.status || "active",
        notes: upperText(payload.notes || "")
      }
    ]
  }));
}

export function updateVenue(store, leagueId, venueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    venues: (league.venues || []).map((venue) => (
      venue.id === venueId
        ? {
            ...venue,
            name: upperText(payload.name || venue.name),
            address: upperText(payload.address || ""),
            status: payload.status || venue.status || "active",
            notes: upperText(payload.notes || "")
          }
        : venue
    ))
  }));
}

export function deleteVenue(store, leagueId, venueId) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    venues: (league.venues || []).filter((venue) => venue.id !== venueId)
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
  const stage = payload.stage || "regular";
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    matches: [
      ...league.matches,
      {
        id: makeId("match"),
        competitionId: payload.competitionId || getDefaultCompetitionId(league),
        stage,
        playoffRound: upperText(payload.playoffRound || ""),
        playoffLeg: upperText(payload.playoffLeg || ""),
        aggregateHome: payload.aggregateHome === "" || payload.aggregateHome === undefined ? null : Number(payload.aggregateHome),
        aggregateAway: payload.aggregateAway === "" || payload.aggregateAway === undefined ? null : Number(payload.aggregateAway),
        round: stage === "playoff" ? Number(payload.round || 0) : Number(payload.round),
        date: payload.date,
        time: payload.time || "",
        venue: upperText(payload.venue || ""),
        scheduleNote: upperText(payload.scheduleNote || ""),
        originalDate: "",
        originalTime: "",
        originalRound: "",
        scheduleUpdatedAt: "",
        homeTeamId: payload.homeTeamId,
        awayTeamId: payload.awayTeamId,
        status: payload.status || "scheduled",
        homeGoals: null,
        awayGoals: null,
        observations: "",
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

function makeScheduleMatches({ competitionId, rounds, startRound, startDate, intervalDays, venue }) {
  const defaultVenue = upperText(venue || "");

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
      venue: defaultVenue,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      status: "scheduled",
      homeGoals: null,
      awayGoals: null,
      observations: "",
      events: []
    }));
  });
}

function buildRoundTripRounds(rounds) {
  return [
    ...rounds,
    ...rounds.map((roundMatches) => (
      roundMatches.map((match) => ({
        homeTeamId: match.awayTeamId,
        awayTeamId: match.homeTeamId
      }))
    ))
  ];
}

const PLAYOFF_PHASES = {
  round32: { label: "16vos de final", teams: 32 },
  round16: { label: "8vos de final", teams: 16 },
  quarterfinal: { label: "Cuartos de final", teams: 8 },
  semifinal: { label: "Semifinal", teams: 4 },
  final: { label: "Final", teams: 2 }
};

function makePlayoffPairs(teamIds) {
  const pairs = [];
  for (let index = 0; index < teamIds.length / 2; index += 1) {
    pairs.push({
      homeTeamId: teamIds[index],
      awayTeamId: teamIds[teamIds.length - 1 - index]
    });
  }
  return pairs;
}

function makePlayoffMatches({ competitionId, pairs, phaseLabel, legMode, startDate, venue }) {
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

export function generateSchedule(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => {
    const competitionId = payload.competitionId || getDefaultCompetitionId(league);
    const activeTeamIds = league.teams
      .filter((team) => (team.competitionId || competitionId) === competitionId && team.status !== "withdrawn")
      .map((team) => team.id);
    if (activeTeamIds.length < 2) return league;

    const existingCompetitionMatches = league.matches.filter((match) => match.competitionId === competitionId && (match.stage || "regular") === "regular");
    const mode = payload.mode || "full";
    const startRound = Number(payload.startRound || 1);
    const startDate = payload.startDate || new Date().toISOString().slice(0, 10);
    const intervalDays = Number(payload.intervalDays || 7);
    const shouldShuffle = payload.randomize === "on";
    const replaceScheduled = payload.replaceScheduled === "on";
    const isRoundTrip = payload.roundTrip === "on" && mode === "full";

    let rounds = [];
    if (mode === "late") {
      const scheduledTeamIds = new Set(existingCompetitionMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
      const newTeamIds = activeTeamIds.filter((teamId) => !scheduledTeamIds.has(teamId));
      rounds = newTeamIds.length ? buildLateTeamRounds(activeTeamIds, shouldShuffle ? shuffle(newTeamIds) : newTeamIds) : [];
    } else {
      rounds = buildRoundRobinRounds(activeTeamIds, shouldShuffle);
      if (isRoundTrip) rounds = buildRoundTripRounds(rounds);
    }

    const generatedMatches = makeScheduleMatches({
      competitionId,
      rounds,
      startRound,
      startDate,
      intervalDays,
      venue: payload.venue
    });

    const matches = replaceScheduled && mode === "full"
      ? league.matches.filter((match) => (
          match.competitionId !== competitionId ||
          (match.stage || "regular") !== "regular" ||
          !isActiveScheduleMatch(match)
        ))
      : league.matches;

    return {
      ...league,
      matches: [...matches, ...generatedMatches]
    };
  });
}

export function generatePlayoffBracket(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => {
    const competitionId = payload.competitionId || getDefaultCompetitionId(league);
    const phase = PLAYOFF_PHASES[payload.phase] || PLAYOFF_PHASES.quarterfinal;
    const competitionLeague = scopeLeagueToCompetition(league, competitionId);
    const standings = calculateStandings(competitionLeague)
      .filter((row) => row.team.status !== "withdrawn")
      .slice(0, phase.teams);

    if (standings.length < phase.teams) return league;

    const teamIds = standings.map((row) => row.team.id);
    const pairs = makePlayoffPairs(teamIds);
    const generatedMatches = makePlayoffMatches({
      competitionId,
      pairs,
      phaseLabel: phase.label,
      legMode: payload.legMode || "single",
      startDate: payload.startDate || new Date().toISOString().slice(0, 10),
      venue: payload.venue
    });
    const shouldReplace = payload.replacePlayoffs === "on";
    const targetPhase = upperText(phase.label);
    const matches = shouldReplace
      ? league.matches.filter((match) => (
          match.competitionId !== competitionId ||
          (match.stage || "regular") !== "playoff" ||
          match.playoffRound !== targetPhase ||
          !isActiveScheduleMatch(match)
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
        ? (() => {
          const stage = payload.stage || match.stage || "regular";
          const round = stage === "playoff" ? Number(payload.round || 0) : Number(payload.round);
          const scheduleChanged = (
            String(match.date || "") !== String(payload.date || "") ||
            String(match.time || "") !== String(payload.time || "") ||
            Number(match.round || 0) !== Number(round || 0)
          );
          return {
            ...match,
            competitionId: payload.competitionId || match.competitionId || getDefaultCompetitionId(league),
            stage,
            playoffRound: upperText(payload.playoffRound || ""),
            playoffLeg: upperText(payload.playoffLeg || ""),
            aggregateHome: payload.aggregateHome === "" || payload.aggregateHome === undefined ? null : Number(payload.aggregateHome),
            aggregateAway: payload.aggregateAway === "" || payload.aggregateAway === undefined ? null : Number(payload.aggregateAway),
            extraTimeHomeGoals: payload.extraTimeHomeGoals === undefined ? match.extraTimeHomeGoals ?? null : optionalMatchScore(payload.extraTimeHomeGoals),
            extraTimeAwayGoals: payload.extraTimeAwayGoals === undefined ? match.extraTimeAwayGoals ?? null : optionalMatchScore(payload.extraTimeAwayGoals),
            penaltyHomeGoals: payload.penaltyHomeGoals === undefined ? match.penaltyHomeGoals ?? null : optionalMatchScore(payload.penaltyHomeGoals),
            penaltyAwayGoals: payload.penaltyAwayGoals === undefined ? match.penaltyAwayGoals ?? null : optionalMatchScore(payload.penaltyAwayGoals),
            round,
            date: payload.date,
            time: payload.time || "",
            venue: upperText(payload.venue || ""),
            scheduleNote: upperText(payload.scheduleNote ?? match.scheduleNote ?? ""),
            originalDate: scheduleChanged ? (match.originalDate || match.date || "") : (match.originalDate || ""),
            originalTime: scheduleChanged ? (match.originalTime || match.time || "") : (match.originalTime || ""),
            originalRound: scheduleChanged ? (match.originalRound || match.round || "") : (match.originalRound || ""),
            scheduleUpdatedAt: scheduleChanged ? new Date().toISOString() : (match.scheduleUpdatedAt || ""),
            homeTeamId: payload.homeTeamId,
            awayTeamId: payload.awayTeamId,
            status: payload.status || match.status || "scheduled",
            homeGoals: payload.homeGoals === "" || payload.homeGoals === undefined ? null : Number(payload.homeGoals),
            awayGoals: payload.awayGoals === "" || payload.awayGoals === undefined ? null : Number(payload.awayGoals),
            observations: payload.observations === undefined ? match.observations || "" : upperText(payload.observations || "")
          };
        })()
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

export function deletePlayoffMatches(store, leagueId, payload = {}) {
  return updateLeague(store, leagueId, (league) => {
    const competitionId = payload.competitionId || getDefaultCompetitionId(league);
    return {
      ...league,
      matches: league.matches.filter((match) => (
        match.competitionId !== competitionId ||
        (match.stage || "regular") !== "playoff"
      ))
    };
  });
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
      disciplineScope: payload.disciplineScope === "league" ? "league" : "competition",
      playoffQualifiers: Number(payload.playoffQualifiers ?? league.rules?.playoffQualifiers ?? 8),
      minimumPlayoffAppearances: Number(payload.minimumPlayoffAppearances ?? league.rules?.minimumPlayoffAppearances ?? 0),
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

function parseMatchEventMinute(value, label = "") {
  const rawLabel = String(label || "").trim();
  const rawValue = String(value ?? "").trim();
  const source = rawLabel || rawValue;
  if (!source) return { minute: 0, minuteLabel: "" };

  const addedMatch = source.match(/^(\d{1,3})\s*\+\s*(\d{1,2})$/);
  if (addedMatch) {
    const base = Number(addedMatch[1]);
    const added = Number(addedMatch[2]);
    const minute = base + added;
    if (minute < 0 || minute > 130) throw new Error("Los minutos del acta deben estar entre 0 y 130.");
    return { minute, minuteLabel: `${base}+${added}` };
  }

  const minute = Number(rawValue || source);
  if (!Number.isFinite(minute) || minute < 0 || minute > 130) {
    throw new Error("Los minutos del acta deben estar entre 0 y 130.");
  }
  return { minute, minuteLabel: rawLabel && rawLabel !== String(minute) ? rawLabel : "" };
}

function optionalMatchScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 99) {
    throw new Error("Los marcadores de desempate deben ser numeros entre 0 y 99.");
  }
  return score;
}

function findPlayerByNumber(league, number, teamIds = []) {
  const directPlayer = league.players.find((player) => (
    Number(player.number) === Number(number) &&
    (!teamIds.length || teamIds.includes(player.teamId))
  ));
  if (directPlayer) return { ...directPlayer, eventTeamId: directPlayer.teamId };

  for (const teamId of teamIds) {
    const player = getEligiblePlayersForTeam(league, teamId)
      .find((item) => Number(getPlayerNumberForTeam(league, item.id, teamId)) === Number(number));
    if (player) return { ...player, eventTeamId: teamId };
  }
  return league.players.find((player) => Number(player.number) === Number(number));
}

export function saveResult(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    matches: league.matches.map((match) => {
      if (match.id !== payload.matchId) return match;

      const events = [];
      for (const number of parseNumberList(payload.goals)) {
        const player = findPlayerByNumber(league, number, [match.homeTeamId, match.awayTeamId]);
        if (player) events.push({ type: "goal", playerId: player.id, teamId: player.eventTeamId || player.teamId, minute: 0 });
      }

      for (const number of parseNumberList(payload.yellows)) {
        const player = findPlayerByNumber(league, number, [match.homeTeamId, match.awayTeamId]);
        if (player) events.push({ type: "yellow", playerId: player.id, teamId: player.eventTeamId || player.teamId, minute: 0 });
      }

      const redRows = String(payload.reds || "").split(",").map((row) => row.trim()).filter(Boolean);
      for (const row of redRows) {
        const [number, suspensionMatches = "1", reason = "Tarjeta roja"] = row.split(":");
        const player = findPlayerByNumber(league, Number(number), [match.homeTeamId, match.awayTeamId]);
        if (player) {
          events.push({
            type: "red",
            playerId: player.id,
            teamId: player.eventTeamId || player.teamId,
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
      const isWalkover = payload.status === "walkover";
      const events = payload.events
        .map((event) => {
          const player = getPlayer(league, event.playerId);
          if (!player) return null;
          if (!["goal", "own_goal", "yellow", "red"].includes(event.type)) return null;
          const eventTeamId = event.type === "own_goal"
            ? event.teamId
            : event.teamId || player.teamId;
          if (![match.homeTeamId, match.awayTeamId].includes(eventTeamId)) return null;
          const playerTeamId = event.type === "own_goal"
            ? eventTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
            : eventTeamId;
          if (!isPlayerEligibleForTeam(league, player.id, playerTeamId)) return null;
          const { minute, minuteLabel } = parseMatchEventMinute(event.minute, event.minuteLabel);
          if (event.type === "red" && !String(event.reason || "").trim()) {
            throw new Error("Toda tarjeta roja debe tener motivo.");
          }
          if (event.type === "red" && !event.disciplinaryPending && !event.suspensionIndefinite && Number(event.suspensionMatches || 0) < 1) {
            throw new Error("Toda tarjeta roja debe tener partidos de sancion.");
          }

          return {
            type: event.type,
            playerId: player.id,
            teamId: eventTeamId,
            period: event.period === "extra_time" ? "extra_time" : "regular",
            minute,
            minuteLabel,
            cardDetail: event.cardDetail || "",
            countsForAccumulation: event.type === "yellow" ? event.countsForAccumulation !== false && !event.excludedFromAccumulation : undefined,
            excludedFromAccumulation: event.type === "yellow" ? event.countsForAccumulation === false || Boolean(event.excludedFromAccumulation) : undefined,
            sourceYellowCardMinutes: Array.isArray(event.sourceYellowCardMinutes) ? event.sourceYellowCardMinutes : undefined,
            suspensionMatches: event.type === "red"
              ? event.disciplinaryPending || event.suspensionIndefinite
                ? 0
                : Number(event.suspensionMatches || league.rules?.defaultRedSuspensionMatches || 1)
              : 0,
            suspensionIndefinite: event.type === "red" && !event.disciplinaryPending ? Boolean(event.suspensionIndefinite) : false,
            disciplinaryPending: event.type === "red" ? Boolean(event.disciplinaryPending) : false,
            reason: event.type === "red" ? upperText(event.reason || "Tarjeta roja") : ""
          };
        })
        .filter(Boolean);

      if (isWalkover) {
        const maxGoals = Math.max(homeGoals, awayGoals);
        const minGoals = Math.min(homeGoals, awayGoals);
        if (![3, 5].includes(maxGoals) || minGoals !== 0) {
          throw new Error("El default solo puede guardarse como 3-0 o 5-0.");
        }

        return {
          ...match,
          homeGoals,
          awayGoals,
          status: "walkover",
          resolutionType: payload.resolutionType || "no_show",
          resolutionNote: upperText(payload.resolutionNote || `Default administrativo ${maxGoals}-0`),
          observations: upperText(payload.observations || ""),
          extraTimeHomeGoals: optionalMatchScore(payload.extraTimeHomeGoals),
          extraTimeAwayGoals: optionalMatchScore(payload.extraTimeAwayGoals),
          penaltyHomeGoals: optionalMatchScore(payload.penaltyHomeGoals),
          penaltyAwayGoals: optionalMatchScore(payload.penaltyAwayGoals),
          events
        };
      }

      const goals = events.filter((event) => event.type === "goal" || event.type === "own_goal");
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
        resolutionType: payload.resolutionType || "normal",
        resolutionNote: "",
        observations: upperText(payload.observations || ""),
        extraTimeHomeGoals: optionalMatchScore(payload.extraTimeHomeGoals),
        extraTimeAwayGoals: optionalMatchScore(payload.extraTimeAwayGoals),
        penaltyHomeGoals: optionalMatchScore(payload.penaltyHomeGoals),
        penaltyAwayGoals: optionalMatchScore(payload.penaltyAwayGoals),
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
        publicVisibility: payload.publicVisibility || "visible",
        plan: "Sin limite",
        ownerEmail: payload.ownerEmail,
        renewalDate: "",
        membershipNotes: "",
        adBanner: "ESPACIO DISPONIBLE PARA PATROCINADOR",
        identity: { ...DEFAULT_IDENTITY },
        highlights: [],
        announcements: [],
        sponsors: [],
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
  return updateLeague(store, leagueId, (league) => {
    const competitions = (league.competitions || []).map((competition) => (
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
    ));
    const requestedCurrentCompetition = competitions.find((competition) => competition.id === competitionId);
    const existingCurrentCompetition = competitions.find((competition) => competition.id === league.currentCompetitionId);
    const nextCurrentCompetitionId = payload.makeCurrent && requestedCurrentCompetition?.status !== "archived"
      ? competitionId
      : existingCurrentCompetition?.status !== "archived"
        ? league.currentCompetitionId
        : competitions.find((competition) => competition.status !== "archived")?.id || competitions[0]?.id || league.currentCompetitionId;

    return {
      ...league,
      currentCompetitionId: nextCurrentCompetitionId,
      competitions
    };
  });
}

export function updateLeagueMembership(store, leagueId, payload) {
  return updateLeague(store, leagueId, (league) => ({
    ...league,
    plan: payload.plan || league.plan,
    status: payload.status || league.status,
    publicVisibility: payload.publicVisibility || league.publicVisibility || "visible",
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

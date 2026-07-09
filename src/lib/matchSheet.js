export function updateMatchSheetEventItem(eventItem, field, value, options = {}) {
  const getPlayersForTeam = options.getPlayersForTeam || (() => []);
  const getPlayersForEvent = options.getPlayersForEvent || ((type, teamId) => getPlayersForTeam(teamId));
  const defaultRedSuspensionMatches = Number(options.defaultRedSuspensionMatches || 1);
  const lockedTeamId = eventItem.lockedTeamId || (options.lockGoalTeam && ["goal", "own_goal"].includes(eventItem.type) ? eventItem.teamId : "");
  if (lockedTeamId && field === "teamId") return eventItem;
  if (eventItem.lockedType && field === "type") return eventItem;

  const nextType = field === "type" ? value : eventItem.type;
  const nextSuspensionMatches = field === "suspensionMatches" ? value : eventItem.suspensionMatches;
  const nextSuspensionIndefinite = field === "suspensionIndefinite" ? Boolean(value) : Boolean(eventItem.suspensionIndefinite);
  const nextReason = field === "reason" ? value : eventItem.reason;
  const nextTeamId = lockedTeamId || (field === "teamId" ? value : eventItem.teamId);
  const playersForNextEvent = getPlayersForEvent(nextType, nextTeamId);

  return {
    ...eventItem,
    [field]: value,
    playerId: field === "teamId"
      ? ""
      : field === "type" && !playersForNextEvent.some((player) => player.id === eventItem.playerId)
        ? ""
        : field === "playerId"
        ? value
        : eventItem.playerId,
    suspensionMatches: field === "type" && value === "red" && Number(eventItem.suspensionMatches || 0) < 1
      ? defaultRedSuspensionMatches
      : field === "type" && value !== "red"
        ? 0
        : nextSuspensionMatches,
    suspensionIndefinite: nextType === "red" ? nextSuspensionIndefinite : false,
    reason: field === "type" && nextType !== "red" ? "" : nextReason
  };
}

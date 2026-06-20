export function updateMatchSheetEventItem(eventItem, field, value, options = {}) {
  const getPlayersForTeam = options.getPlayersForTeam || (() => []);
  const defaultRedSuspensionMatches = Number(options.defaultRedSuspensionMatches || 1);
  const lockedTeamId = eventItem.lockedTeamId || (options.lockGoalTeam && eventItem.type === "goal" ? eventItem.teamId : "");
  if (lockedTeamId && field === "teamId") return eventItem;

  const nextType = field === "type" ? value : eventItem.type;
  const nextSuspensionMatches = field === "suspensionMatches" ? value : eventItem.suspensionMatches;
  const nextReason = field === "reason" ? value : eventItem.reason;
  const nextTeamId = lockedTeamId || (field === "teamId" ? value : eventItem.teamId);

  return {
    ...eventItem,
    [field]: value,
    playerId: field === "teamId"
      ? getPlayersForTeam(value)[0]?.id || ""
      : field === "type" && lockedTeamId && !getPlayersForTeam(nextTeamId).some((player) => player.id === eventItem.playerId)
        ? getPlayersForTeam(nextTeamId)[0]?.id || ""
        : field === "playerId"
        ? value
        : eventItem.playerId,
    suspensionMatches: field === "type" && value === "red" && Number(eventItem.suspensionMatches || 0) < 1
      ? defaultRedSuspensionMatches
      : field === "type" && value !== "red"
        ? 0
        : nextSuspensionMatches,
    reason: field === "type" && nextType !== "red" ? "" : nextReason
  };
}

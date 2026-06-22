export function validatePlayerFullName(name) {
  const normalized = normalizePlayerNameForMatch(name);
  const words = normalized.split(" ").filter(Boolean);

  if (words.length < 2) {
    return {
      valid: false,
      message: "Registra el nombre completo del jugador: nombre(s) y apellido(s)."
    };
  }

  const validWords = words.filter((word) => /[A-ZÁÉÍÓÚÜÑ]{2,}/i.test(word));
  if (validWords.length < 2) {
    return {
      valid: false,
      message: "El nombre del jugador debe incluir al menos nombre y apellido legibles."
    };
  }

  return { valid: true };
}

export function normalizePlayerNameForMatch(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/#\s*\d+/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-zA-ZñÑ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

export function findDuplicatePlayer(league, payload, excludePlayerId = "") {
  const targetName = normalizePlayerNameForMatch(payload.name);
  if (!targetName) return null;

  return (league.players || []).find((player) => (
    player.id !== excludePlayerId &&
    normalizePlayerNameForMatch(player.name) === targetName
  )) || null;
}

export function validatePlayerFullName(name) {
  const normalized = String(name || "").replace(/\s+/g, " ").trim();
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

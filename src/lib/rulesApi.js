import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudieron guardar las reglas");
  return payload;
}

export async function updateLeagueRulesInApi(token, leagueId, payload) {
  const response = await fetch(`${API_BASE_URL}/leagues/${leagueId}/rules`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

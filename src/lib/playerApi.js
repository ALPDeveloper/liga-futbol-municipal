import { API_BASE_URL } from "./apiBase.js";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo guardar el jugador.");
  return payload;
}

export async function createPlayerInApi(token, leagueId, payload) {
  const response = await fetch(`${API_BASE_URL}/leagues/${encodeURIComponent(leagueId)}/players`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function updatePlayerInApi(token, leagueId, playerId, payload) {
  const response = await fetch(`${API_BASE_URL}/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function deletePlayerInApi(token, leagueId, playerId) {
  const response = await fetch(`${API_BASE_URL}/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response);
}

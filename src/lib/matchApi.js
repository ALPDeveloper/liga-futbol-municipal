import { API_BASE_URL } from "./apiBase.js";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo guardar el partido.");
  return payload;
}

export async function createMatchInApi(token, leagueId, payload) {
  const response = await fetch(`${API_BASE_URL}/leagues/${encodeURIComponent(leagueId)}/matches`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function updateMatchInApi(token, leagueId, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/leagues/${encodeURIComponent(leagueId)}/matches/${encodeURIComponent(matchId)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function deleteMatchInApi(token, leagueId, matchId) {
  const response = await fetch(`${API_BASE_URL}/leagues/${encodeURIComponent(leagueId)}/matches/${encodeURIComponent(matchId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response);
}

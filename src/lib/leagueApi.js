import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la solicitud");
  return payload;
}

export async function deleteLeagueFromApi(token, leagueId) {
  const response = await fetch(`${API_BASE_URL}/leagues/${leagueId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response);
}

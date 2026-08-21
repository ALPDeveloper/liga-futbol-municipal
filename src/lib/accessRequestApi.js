import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response, fallback = "No se pudo completar la solicitud") {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload;
}

export async function submitAccessRequest(payload) {
  const response = await fetch(`${API_BASE_URL}/access-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo enviar la solicitud");
}

export async function fetchAccessRequests(token, { leagueId = "", status = "pending", role = "" } = {}) {
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  if (status) params.set("status", status);
  if (role) params.set("role", role);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/access-requests${suffix}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudieron cargar las solicitudes");
}

export async function reviewAccessRequest(token, requestId, payload) {
  const response = await fetch(`${API_BASE_URL}/access-requests/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo resolver la solicitud");
}

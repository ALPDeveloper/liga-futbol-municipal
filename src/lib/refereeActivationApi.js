import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || "No se pudo completar la activacion");
  return payload;
}

export async function fetchRefereeActivation(token) {
  const response = await fetch(`${API_BASE_URL}/referee-activations/${encodeURIComponent(token)}`);
  return parseResponse(response);
}

export async function activateReferee(token, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-activations/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || fallback);
  return payload;
}

export async function fetchDelegateActivation(token) {
  const response = await fetch(`${API_BASE_URL}/team-delegate-activations/${encodeURIComponent(token)}`);
  return parseResponse(response, "No se pudo validar la invitacion");
}

export async function activateDelegate(token, payload) {
  const response = await fetch(`${API_BASE_URL}/team-delegate-activations/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo activar la cuenta");
}

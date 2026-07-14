import { API_BASE_URL } from "./apiBase.js";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function parseResponse(response, fallback = "No se pudo completar la solicitud") {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload;
}

export async function fetchReferees(token, municipality = "") {
  const params = municipality ? `?municipality=${encodeURIComponent(municipality)}` : "";
  const response = await fetch(`${API_BASE_URL}/referees${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudieron cargar los arbitros");
}

export async function createReferee(token, payload) {
  const response = await fetch(`${API_BASE_URL}/referees`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo crear el arbitro");
}

export async function updateReferee(token, userId, payload) {
  const response = await fetch(`${API_BASE_URL}/referees/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo actualizar el arbitro");
}

export async function deleteReferee(token, userId) {
  const response = await fetch(`${API_BASE_URL}/referees/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo eliminar el arbitro");
}

export async function resendRefereeInvitation(token, userId) {
  const response = await fetch(`${API_BASE_URL}/referees/${encodeURIComponent(userId)}/invitation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo generar la invitacion");
}

export async function updateMatchReferees(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/matches/${encodeURIComponent(matchId)}/referees`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo guardar la designacion arbitral");
}

export async function fetchRefereeMatchSheets(token, { leagueId = "", status = "pending_review" } = {}) {
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  if (status) params.set("status", status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/referee-match-sheets${suffix}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudieron cargar las actas arbitrales");
}

export async function reviewRefereeMatchSheet(token, sheetId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-match-sheets/${encodeURIComponent(sheetId)}/review`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo revisar el acta arbitral");
}

export async function fetchFinalizedMatchReports(token, { leagueId = "", status = "finalized" } = {}) {
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  if (status) params.set("status", status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/match-reports${suffix}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudieron cargar las actas finalizadas");
}

export async function publishFinalizedMatchReport(token, reportId) {
  const response = await fetch(`${API_BASE_URL}/match-reports/${encodeURIComponent(reportId)}/publish`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({})
  });
  return parseResponse(response, "No se pudo publicar el acta finalizada");
}

export async function fetchRefereePortal(token) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo cargar el panel de arbitro");
}

export async function saveRefereeMatchSheet(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/sheet`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo guardar el acta");
}

export async function startRefereeMatchSession(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/start`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo iniciar el partido");
}

export async function saveRefereeMatchSession(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/save`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo guardar la sesion del partido");
}

export async function resumeRefereeMatchSession(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/resume`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo reanudar el partido");
}

export async function suspendRefereeMatchSession(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/suspend`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo suspender el partido");
}

export async function finishRefereeMatchSession(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/finish-match`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo finalizar el partido");
}

export async function fetchRefereeLiveState(token, matchId) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/live-state`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo consultar el estado en vivo");
}

export async function syncRefereeLiveState(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/sync`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo sincronizar el estado en vivo");
}

export async function fetchRefereeMatchReport(token, matchId) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/report`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo cargar el acta preliminar");
}

export async function signRefereeMatchReport(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/report/sign`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo firmar el acta");
}

export async function finalizeRefereeMatchReport(token, matchId, payload = {}) {
  const response = await fetch(`${API_BASE_URL}/referee-portal/matches/${encodeURIComponent(matchId)}/report/finalize`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo finalizar el acta");
}

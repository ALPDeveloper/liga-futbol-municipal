import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload;
}

export async function fetchTeamDelegates(token, leagueId = "") {
  const params = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
  const response = await fetch(`${API_BASE_URL}/team-delegates${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudieron cargar los delegados");
}

export async function createTeamDelegate(token, payload) {
  const response = await fetch(`${API_BASE_URL}/team-delegates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo crear el delegado");
}

export async function resendTeamDelegateInvitation(token, assignmentId) {
  const response = await fetch(`${API_BASE_URL}/team-delegates/${assignmentId}/invitation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo generar la invitacion");
}

export async function updateTeamDelegate(token, assignmentId, payload) {
  const response = await fetch(`${API_BASE_URL}/team-delegates/${assignmentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo actualizar el delegado");
}

export async function deleteTeamDelegate(token, assignmentId, { disableUser = true, deleteUser = false } = {}) {
  const mode = deleteUser ? "delete_user" : disableUser ? "disable_user" : "assignment_only";
  const response = await fetch(`${API_BASE_URL}/team-delegates/${assignmentId}?mode=${encodeURIComponent(mode)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo quitar el delegado");
}

export async function updateTeamRosterPermission(token, teamId, payload) {
  const response = await fetch(`${API_BASE_URL}/team-roster-permissions/${teamId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo actualizar el permiso de plantilla");
}

export async function updateTeamRosterPermissionsBulk(token, payload) {
  const response = await fetch(`${API_BASE_URL}/team-roster-permissions/bulk`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudieron actualizar los permisos de plantilla");
}

export async function fetchTeamPortal(token) {
  const response = await fetch(`${API_BASE_URL}/team-portal/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo cargar el portal de equipo");
}

export async function createTeamPortalPlayer(token, payload) {
  const response = await fetch(`${API_BASE_URL}/team-portal/players`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo registrar el jugador");
}

export async function updateTeamPortalPlayer(token, playerId, payload) {
  const response = await fetch(`${API_BASE_URL}/team-portal/players/${playerId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo actualizar el jugador");
}

export async function updateTeamPortalLogo(token, payload) {
  const response = await fetch(`${API_BASE_URL}/team-portal/team-logo`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo actualizar el escudo");
}

export async function submitTeamMatchRoster(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/team-portal/matches/${matchId}/roster`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo enviar la convocatoria");
}

export async function revealTeamMatchPin(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/team-portal/matches/${matchId}/pin/reveal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo mostrar el PIN");
}

export async function regenerateTeamMatchPin(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/team-portal/matches/${matchId}/pin/regenerate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo regenerar el PIN");
}

export async function signTeamMatchReport(token, matchId, payload) {
  const response = await fetch(`${API_BASE_URL}/team-portal/matches/${matchId}/report/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "No se pudo firmar el acta");
}

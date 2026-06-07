import { API_BASE_URL } from "./apiBase.js";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la solicitud");
  return payload;
}

export async function fetchUsers(token) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response);
}

export async function createUser(token, payload) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function updateUser(token, userId, payload) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function disableUser(token, userId) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response);
}

export async function deleteUser(token, userId) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}?mode=permanent`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response);
}

export async function requestPasswordReset(email) {
  const response = await fetch(`${API_BASE_URL}/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  return parseResponse(response);
}

export async function resetPassword(payload) {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

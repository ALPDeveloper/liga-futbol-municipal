import { API_BASE_URL } from "./apiBase.js";

async function getApiErrorMessage(response, fallback) {
  try {
    const body = await response.json();
    return body.error || body.message || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchStoreFromApi(token = "") {
  const response = await fetch(`${API_BASE_URL}/store`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) throw new Error(await getApiErrorMessage(response, "No se pudo cargar la API local"));
  return response.json();
}

export async function persistStoreToApi(store, token) {
  const response = await fetch(`${API_BASE_URL}/store`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(store)
  });

  if (!response.ok) throw new Error(await getApiErrorMessage(response, "No se pudo guardar en la API local"));
  return response.json();
}

export async function loginWithApi(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) throw new Error(await getApiErrorMessage(response, "Correo o contraseña incorrectos"));
  return response.json();
}

export async function fetchSessionFromApi(token) {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = new Error(await getApiErrorMessage(response, "Sesion invalida"));
    error.status = response.status;
    throw error;
  }
  return response.json();
}

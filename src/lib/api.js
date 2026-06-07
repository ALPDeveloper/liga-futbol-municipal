import { API_BASE_URL } from "./apiBase.js";

export async function fetchStoreFromApi() {
  const response = await fetch(`${API_BASE_URL}/store`);
  if (!response.ok) throw new Error("No se pudo cargar la API local");
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

  if (!response.ok) throw new Error("No se pudo guardar en la API local");
  return response.json();
}

export async function loginWithApi(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) throw new Error("Correo o contraseña incorrectos");
  return response.json();
}

export async function fetchSessionFromApi(token) {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) throw new Error("Sesion invalida");
  return response.json();
}

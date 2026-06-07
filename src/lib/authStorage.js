const AUTH_KEY = "liga-futbol-municipal:auth";

export function loadAuth() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return { token: "", user: null };

  try {
    return JSON.parse(raw);
  } catch {
    return { token: "", user: null };
  }
}

export function saveAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

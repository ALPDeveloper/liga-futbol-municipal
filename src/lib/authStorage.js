const AUTH_KEY = "liga-futbol-municipal:auth";

export function loadAuth() {
  const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
  if (!raw) return { token: "", user: null };

  try {
    return JSON.parse(raw);
  } catch {
    return { token: "", user: null };
  }
}

export function saveAuth(auth, remember = true) {
  sessionStorage.removeItem(AUTH_KEY);
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function isAuthRemembered() {
  return true;
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

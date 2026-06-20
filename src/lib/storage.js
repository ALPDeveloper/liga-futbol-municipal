import { normalizeStore } from "./domain.js";

export const STORAGE_KEY = "liga-futbol-municipal:react-v1";

export function loadStore() {
  let raw = "";
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Si el navegador bloquea almacenamiento local, la API sigue siendo la fuente real.
  }
}

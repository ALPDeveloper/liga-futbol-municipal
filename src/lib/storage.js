import { seedData } from "../data/seedData.js";
import { normalizeStore } from "./domain.js";

export const STORAGE_KEY = "liga-futbol-municipal:react-v1";

export function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return normalizeStore(seedData);

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return normalizeStore(seedData);
  }
}

export function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

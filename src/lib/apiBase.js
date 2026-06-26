const configuredBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim();

function getBrowserApiBaseUrl() {
  if (configuredBaseUrl) return configuredBaseUrl;
  return `${window.location.origin}/api`;
}

export const API_BASE_URL =
  typeof window === "undefined" ? "http://127.0.0.1:3001/api" : getBrowserApiBaseUrl();

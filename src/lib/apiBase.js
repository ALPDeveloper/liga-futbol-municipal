const configuredBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim();

function getBrowserApiBaseUrl() {
  if (configuredBaseUrl) return configuredBaseUrl;

  const { hostname, origin, port, protocol } = window.location;
  if (port && !["80", "443"].includes(port)) return `${protocol}//${hostname}:3001/api`;
  return `${origin}/api`;
}

export const API_BASE_URL =
  typeof window === "undefined" ? "http://127.0.0.1:3001/api" : getBrowserApiBaseUrl();

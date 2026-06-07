import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo cargar la auditoria");
  return payload;
}

export async function fetchAuditLogs(token, limit = 80) {
  const response = await fetch(`${API_BASE_URL}/audit-logs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response);
}

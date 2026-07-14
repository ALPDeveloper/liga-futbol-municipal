import { API_BASE_URL } from "./apiBase.js";

async function parseResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || fallbackMessage);
  return payload;
}

export async function fetchBackups(token, limit = 20) {
  const response = await fetch(`${API_BASE_URL}/backups?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudieron cargar los respaldos");
}

export async function createBackup(token) {
  const response = await fetch(`${API_BASE_URL}/backups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo crear el respaldo");
}

export async function verifyBackup(token, backup) {
  const response = await fetch(`${API_BASE_URL}/backups/${backup.id}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseResponse(response, "No se pudo verificar el respaldo");
}

export async function downloadBackup(token, backup) {
  const response = await fetch(`${API_BASE_URL}/backups/${backup.id}/download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "No se pudo descargar el respaldo");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = backup.fileName || "ligatec-respaldo";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

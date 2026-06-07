import { listAuditLogsData, logAuditData } from "./dataLayer.js";

export async function logAudit(payload) {
  await logAuditData(payload);
}

export async function listAuditLogs(limit = 80) {
  return listAuditLogsData(limit);
}

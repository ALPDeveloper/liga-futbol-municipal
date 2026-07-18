import { useEffect, useMemo, useRef, useState } from "react";
import ligatecLogo from "../../assets/ligatec-logo.png";
import {
  fetchRefereePortal,
  fetchRefereeLiveState,
  fetchRefereeMatchReport,
  finishRefereeMatchSession,
  finalizeRefereeMatchReport,
  resumeRefereeMatchSession,
  saveRefereeMatchSession,
  saveRefereeMatchSheet,
  signRefereeMatchReport,
  startRefereeMatchSession,
  syncRefereeLiveState,
  suspendRefereeMatchSession,
  updateRefereeMatchReportDraft
} from "../lib/refereeApi.js";
import {
  LIVE_PERIODS,
  LIVE_TIMER_STATUSES,
  calculateElapsedSeconds,
  createLiveTimerState,
  detectTimeDrift,
  finishLivePeriod,
  getLiveClientSessionId,
  getLivePeriodLabel,
  pauseLiveTimer,
  periodKeyToNumber,
  periodNumberToKey,
  resumeLiveTimer,
  startLivePeriod,
  suspendLiveTimer
} from "../lib/liveMatchClock.js";
import {
  clearLiveMatchState,
  enqueueLiveOperation,
  getLiveMatchState,
  listLiveMatchStates,
  listPendingLiveOperations,
  markLiveOperationFailed,
  markLiveOperationSynced,
  saveLiveMatchState
} from "../lib/liveMatchStore.js";

function formatDate(value) {
  if (!value) return "Fecha por definir";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "2-digit", month: "short" }).format(date);
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysKey(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

function formatMonth(value) {
  if (!value || value === "sin-fecha") return "Sin fecha";
  const date = new Date(`${value}-01T12:00:00`);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(date);
}

function formatHistoryDateParts(value, time) {
  if (!value || value === "sin-fecha") {
    return { weekday: "S/F", day: "--", month: "", time: time || "--:--" };
  }
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { weekday: "", day: value, month: "", time: time || "--:--" };
  return {
    weekday: new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(date).replace(".", "").toUpperCase(),
    day: new Intl.DateTimeFormat("es-MX", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("es-MX", { month: "short" }).format(date).replace(".", "").toUpperCase(),
    time: time || "--:--"
  };
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

const MATCH_EVENT_PERIODS = Object.freeze({
  REGULAR: "regular",
  EXTRA_TIME: "extra_time"
});

const DOUBLE_YELLOW_REASON = "Doble amonestacion (segunda amarilla)";
const RED_CARD_REASON_OPTIONS = Object.freeze([
  "Juego brusco grave",
  "Conducta violenta",
  "Insultos u ofensas al arbitro",
  "Impedir oportunidad manifiesta de gol"
]);
const SIGNATURE_ISSUE_REASONS = Object.freeze([
  { id: "forgot_pin", label: "Capitan no recuerda PIN" },
  { id: "no_signal", label: "Sin señal / falla tecnica" },
  { id: "captain_unavailable", label: "Capitan no disponible" },
  { id: "refused_to_sign", label: "Capitan se niega a firmar" },
  { id: "physical_backup", label: "Se firmo en acta fisica" }
]);

function getMatchEventPeriodLabel(period) {
  if (period === MATCH_EVENT_PERIODS.EXTRA_TIME) return "Tiempo extra";
  return "Tiempo regular";
}

function getTeamInitials(name) {
  const words = String(name || "EQ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "EQ";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function getRecentEventTeamAbbreviation(name) {
  const words = String(name || "EQ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "EQ";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return `${words[0].slice(0, 3)} ${words[1][0]}.`.toUpperCase();
}

function getMatchStartTime(match) {
  const date = String(match?.date || "").slice(0, 10);
  const time = String(match?.time || "23:59").slice(0, 5);
  if (!date) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(`${date}T${time || "23:59"}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function hasLocalRefereeCapture(match) {
  const draft = readRefereeDraft(`ligatec-referee-draft-${match.id}`);
  return isRecoverableLiveDraft(draft);
}

function isRecoverableLiveDraft(draft) {
  if (!draft || typeof draft !== "object") return false;
  if (draft.liveTimer?.timerStatus === LIVE_TIMER_STATUSES.FINISHED) return false;
  const timerStatus = draft.liveTimer?.timerStatus || "";
  return Boolean(
    draft.liveStarted ||
    draft.sessionId ||
    (Array.isArray(draft.events) && draft.events.length) ||
    (timerStatus && timerStatus !== LIVE_TIMER_STATUSES.NOT_STARTED)
  );
}

function isPreliminaryReportMatch(match) {
  const sessionStatus = match?.sessionStatus || "";
  const workflowStatus = match?.workflowStatus || "";
  return (
    sessionStatus === "match_finished" ||
    ["pending_captain_review", "both_signed", "finalized_pending_sync"].includes(workflowStatus)
  );
}

function isMatchInCapture(match) {
  const sessionStatus = match?.sessionStatus || "";
  const workflowStatus = match?.workflowStatus || "";
  const serverTimerStatus = match?.session?.clockState?.timerStatus || "";
  const postMatchStatuses = ["match_finished", "pending_captain_review", "both_signed", "finalized_pending_sync", "finalized", "published"];
  if (postMatchStatuses.includes(sessionStatus) || postMatchStatuses.includes(workflowStatus)) return false;
  return (
    ["in_progress", "temporarily_saved"].includes(sessionStatus) ||
    ["in_progress", "temporarily_saved"].includes(workflowStatus) ||
    Boolean(match?.session && !["match_finished", "finalized", "published"].includes(sessionStatus)) ||
    Boolean(serverTimerStatus && ![LIVE_TIMER_STATUSES.NOT_STARTED, LIVE_TIMER_STATUSES.FINISHED].includes(serverTimerStatus)) ||
    hasLocalRefereeCapture(match)
  );
}

function getOperationalRefereeMatch(matches = []) {
  const sorted = [...matches].sort((a, b) => getMatchStartTime(a) - getMatchStartTime(b));
  const activeMatch = sorted.find((match) => isMatchInCapture(match));
  if (activeMatch) return activeMatch;
  const now = Date.now();
  return sorted.find((match) => getMatchStartTime(match) >= now) || null;
}

function PortalNavIcon({ type }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };
  if (type === "assignments") {
    return <svg {...common}><path d="M9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  }
  if (type === "acts") {
    return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>;
  }
  if (type === "history") {
    return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>;
  }
  if (type === "stats") {
    return <svg {...common}><path d="M3 3v18h18" /><path d="M7 16v-5" /><path d="M12 16V7" /><path d="M17 16v-8" /></svg>;
  }
  if (type === "teams") {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  }
  if (type === "more") {
    return <svg {...common}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
  }
  return <svg {...common}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
}

function RefereeTinyIcon({ type }) {
  const common = {
    className: "referee-tiny-icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };
  if (type === "clock") {
    return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.2 1.9" /></svg>;
  }
  if (type === "field") {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M12 5v14" /><circle cx="12" cy="12" r="2.5" /><path d="M3.5 9h3" /><path d="M17.5 9h3" /><path d="M3.5 15h3" /><path d="M17.5 15h3" /></svg>;
  }
  if (type === "flag") {
    return <svg {...common}><path d="M6 20V5" /><path d="M6 5h10l-1.5 3L16 11H6" /></svg>;
  }
  if (type === "logout") {
    return <svg {...common}><path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /><path d="M14 8l4 4-4 4" /><path d="M18 12H9" /></svg>;
  }
  if (type === "check") {
    return <svg {...common}><path d="m5 12 4 4 10-10" /></svg>;
  }
  if (type === "wifi") {
    return <svg {...common}><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M12 20h.01" /></svg>;
  }
  if (type === "cloud") {
    return <svg {...common}><path d="M17.5 18H8a5 5 0 1 1 1.2-9.85A6 6 0 0 1 20 11.5 3.5 3.5 0 0 1 17.5 18Z" /><path d="m10 14 2 2 4-4" /></svg>;
  }
  if (type === "lightbulb") {
    return <svg {...common}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.2 14.2A6 6 0 1 1 15.8 14c-.9.7-1.3 1.5-1.5 2.5H9.8c-.2-.9-.7-1.7-1.6-2.3Z" /><path d="M12 2v2" /><path d="M4.9 4.9 6.3 6.3" /><path d="M19.1 4.9 17.7 6.3" /></svg>;
  }
  if (type === "whistle") {
    return <svg {...common}><path d="M7.5 9.5h8.2l3.8 3.1v2.2a5.7 5.7 0 0 1-5.7 5.7H8.8A5.8 5.8 0 0 1 3 14.7v-.1a5.1 5.1 0 0 1 4.5-5.1Z" /><path d="M15.5 9.5V5h5.2v5.9" /><path d="M18.4 5h2.9" /><circle cx="9.2" cy="14.7" r="2.15" /><path d="M3.9 9.8 2.7 7.5" /><path d="M6.9 9.5 5.7 6.6" /></svg>;
  }
  return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M4 10h16" /></svg>;
}

function RefereeTeamMark({ name, tone = "home" }) {
  return <span className={`portal-team-badge ${tone}`}><b>{getTeamInitials(name)}</b></span>;
}

function RefereeFilterIcon() {
  return (
    <svg className="referee-tiny-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16" />
      <path d="M7 12h10" />
      <path d="M10 19h4" />
    </svg>
  );
}

function getRefereeHistoryStatus(match) {
  if (match.status === "postponed") return { key: "draft", className: "postponed", label: "Pospuesto", actaLabel: "Borrador" };
  if (match.status === "suspended" || String(match.sessionStatus || "").startsWith("suspended")) {
    return { key: "pending", className: "pending", label: "Pendiente", actaLabel: "Pendiente" };
  }
  if (match.sheetReviewStatus === "rejected" || match.reportStatus === "correction_requested") {
    return { key: "pending", className: "pending", label: "Pendiente", actaLabel: "Correccion" };
  }
  if (match.sessionStatus === "temporarily_saved") return { key: "draft", className: "draft", label: "Borrador", actaLabel: "Borrador" };
  if (match.sheetReviewStatus === "pending_review" || ["match_finished", "pending_captain_review", "both_signed", "finalized"].includes(match.reportStatus || match.sessionStatus || "")) {
    return { key: "pending", className: "pending", label: "Pendiente", actaLabel: "Pendiente" };
  }
  return { key: "ready", className: "published", label: "Finalizado", actaLabel: "Publicado" };
}

function getRefereeHistoryScore(match) {
  if (match.status === "scheduled" && match.homeGoals == null && match.awayGoals == null) return "-- - --";
  const home = match.homeGoals ?? match.reportHomeGoals ?? 0;
  const away = match.awayGoals ?? match.reportAwayGoals ?? 0;
  return `${home} - ${away}`;
}

function getRefereeRoleLabel(match) {
  if (match?.refereeRole === "central") return "Tu: Central";
  if (match?.refereeRole === "auxiliar_1") return "Tu: Auxiliar 1";
  if (match?.refereeRole === "auxiliar_2") return "Tu: Auxiliar 2";
  if (match?.refereeRole === "cuarto_arbitro") return "Tu: Cuarto arbitro";
  return "Asignado";
}

function getRefereeDayGroupLabel(dateKey) {
  if (!dateKey || dateKey === "sin-fecha") {
    return { kicker: "FECHA", title: "POR DEFINIR" };
  }
  const todayKey = getLocalDateKey();
  const tomorrowKey = addDaysKey(1);
  const date = new Date(`${dateKey}T12:00:00`);
  const title = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(date).toUpperCase();
  if (dateKey === todayKey) return { kicker: "HOY", title };
  if (dateKey === tomorrowKey) return { kicker: "MAÑANA", title };
  return { kicker: "PROGRAMADO", title };
}

function getRefereeMatchFilterBucket(match) {
  const dateKey = String(match?.date || "").slice(0, 10);
  if (!dateKey) return "future";
  if (dateKey === getLocalDateKey()) return "today";
  if (dateKey === addDaysKey(1)) return "tomorrow";
  return "future";
}

function getRefereeAssignmentStatus(match) {
  if (match.status === "postponed") return { className: "postponed", label: "Pospuesto" };
  if (match.status === "advanced") return { className: "advanced", label: "Adelantado" };
  if (match.status === "rescheduled") return { className: "rescheduled", label: "Reprogramado" };
  if (match.sessionStatus === "temporarily_saved") return { className: "progress", label: "Guardado" };
  if (match.sessionStatus === "in_progress" || match.workflowStatus === "in_progress" || isMatchInCapture(match)) return { className: "progress", label: "En progreso" };
  if (isPreliminaryReportMatch(match)) return { className: "review", label: "Acta preliminar" };
  if (match.homeRosterSubmitted && match.awayRosterSubmitted) return { className: "ready", label: "Listo para capturar" };
  return { className: "pending", label: "Convocatorias pendientes" };
}

function groupRefereeMatchesByDate(matches) {
  const groups = new Map();
  for (const match of matches) {
    const dateKey = match.date || "sin-fecha";
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(match);
  }
  return [...groups.entries()].map(([date, dayMatches]) => ({
    date,
    matches: dayMatches.sort((a, b) => String(a.time || "23:59").localeCompare(String(b.time || "23:59")))
  }));
}

function RefereeAssignmentCard({ match, onCapture }) {
  const status = getRefereeAssignmentStatus(match);
  const assistantCount = [
    match.assistantReferee1Name,
    match.assistantReferee2Name,
    match.fourthRefereeName
  ].filter(Boolean).length;
  const canPrepare = match.canCapture && match.status !== "postponed";
  const openVenueMap = () => {
    if (!match.venue || typeof window === "undefined") return;
    const query = encodeURIComponent([match.venue, match.leagueName].filter(Boolean).join(" "));
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank", "noopener,noreferrer");
  };
  return (
    <article className={`referee-assignment-card ${status.className}`}>
      <div className="referee-assignment-side" aria-hidden="true" />
      <div className="referee-assignment-status-row">
        <span className={`referee-assignment-status ${status.className}`}><i />{match.time || "Hora"}</span>
        <b>{status.label}</b>
        <em>{getMatchDayLabel(match)}</em>
      </div>
      <div className="referee-assignment-teams">
        <div className="referee-assignment-team home">
          <RefereeTeamMark name={match.homeTeamName} />
          <strong>{match.homeTeamName}</strong>
          <small>Local</small>
        </div>
        <b className="referee-assignment-versus">VS</b>
        <div className="referee-assignment-team away">
          <RefereeTeamMark name={match.awayTeamName} tone="away" />
          <strong>{match.awayTeamName}</strong>
          <small>Visitante</small>
        </div>
      </div>
      <div className="referee-assignment-info-grid">
        <span><RefereeTinyIcon type="field" />{match.venue || "Cancha por definir"}</span>
        <span><RefereeTinyIcon type="flag" />{getRefereeRoleLabel(match)}</span>
        <span><PortalNavIcon type="teams" />{assistantCount ? `+${assistantCount} asistentes` : "Sin asistentes"}</span>
      </div>
      <div className="referee-assignment-rosters">
        <span><PortalNavIcon type="teams" />Convocatorias</span>
        <b className={match.homeRosterSubmitted ? "ready" : "pending"}><RefereeTinyIcon type={match.homeRosterSubmitted ? "check" : "clock"} />Local</b>
        <b className={match.awayRosterSubmitted ? "ready" : "pending"}><RefereeTinyIcon type={match.awayRosterSubmitted ? "check" : "clock"} />Visitante</b>
      </div>
      {getRosterLabel(match) && <small className="referee-assignment-note">{getRosterLabel(match)}</small>}
      <div className="referee-assignment-actions">
        <button className="primary" type="button" disabled={!canPrepare} onClick={() => onCapture?.(match.id)}>
          <RefereeTinyIcon type="flag" />
          <span>{getMatchActionLabel(match)}</span>
        </button>
        <button type="button" disabled={!match.venue} onClick={openVenueMap}>
          <RefereeTinyIcon type="field" />
          <span>Ver mapa</span>
        </button>
        <button type="button" onClick={() => onCapture?.(match.id)} disabled={!match.canCapture}>
          <PortalNavIcon type="acts" />
          <span>Ver detalle</span>
        </button>
      </div>
    </article>
  );
}

function notifyClockWarning() {
  if (typeof window === "undefined") return;
  try {
    if (window.navigator?.vibrate) window.navigator.vibrate([180, 90, 180]);
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
  } catch {
    // Audio/vibration can be blocked by the browser; the visual alert still works.
  }
}

function getMatchStatus(match, history) {
  if (match.status === "postponed") return { className: "review", label: "Pospuesto" };
  if (match.status === "rescheduled") return { className: "ready", label: "Reprogramado" };
  if (match.status === "advanced") return { className: "ready", label: "Adelantado" };
  if (match.sheetReviewStatus === "pending_review") return { className: "review", label: "En revision" };
  if (match.sheetReviewStatus === "rejected") return { className: "rejected", label: "Correccion solicitada" };
  if (match.sessionStatus === "in_progress" || match.workflowStatus === "in_progress" || isMatchInCapture(match)) return { className: "progress", label: "En captura" };
  if (match.sessionStatus === "temporarily_saved") return { className: "review", label: "Guardado" };
  if (String(match.sessionStatus || "").startsWith("suspended")) return { className: "rejected", label: "Suspendido" };
  if (match.sessionStatus === "match_finished") return { className: "review", label: "Acta preliminar" };
  if (isPreliminaryReportMatch(match)) return { className: "review", label: "Acta preliminar" };
  if (history) return { className: "done", label: "Finalizado" };
  if (!match.canCapture) return { className: "readonly", label: "Solo consulta" };
  return { className: "ready", label: "Listo para capturar" };
}

function getMatchActionLabel(match) {
  if (match.status === "postponed") return "Partido pospuesto";
  if (match.sheetReviewStatus === "rejected") return "Corregir acta";
  if (isPreliminaryReportMatch(match)) return "Revisar acta";
  if (match.sessionStatus === "in_progress" || match.workflowStatus === "in_progress" || isMatchInCapture(match)) return "Continuar captura";
  if (match.sessionStatus === "temporarily_saved") return "Continuar captura";
  if (match.homeRosterSubmitted && match.awayRosterSubmitted) return "Preparar partido";
  if (match.canCapture) return "Ver partido";
  return "Solo consulta";
}

function getRosterLabel(match) {
  if (match.homeRosterSubmitted && match.awayRosterSubmitted) return "Convocatorias completas";
  if (!match.homeRosterSubmitted && !match.awayRosterSubmitted) return "Esperando convocatorias";
  return match.homeRosterSubmitted ? "Convocatoria visitante pendiente" : "Convocatoria local pendiente";
}

function getMatchDayLabel(match) {
  return match.roundName || match.round || match.matchday || match.jornada || "Jornada por definir";
}

function getConnectionSnapshot() {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const now = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  return {
    online,
    connectionLabel: online ? "Con conexion" : "Sin conexion",
    syncLabel: online ? "Sincronizado" : "Cambios pendientes",
    lastSyncLabel: `Hoy ${now}`
  };
}

function scrollRefereePortalToTop() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.querySelector(".referee-mobile-app")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    document.querySelector(".referee-phone-panel")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  });
}

function RefereeHeader({ onLogout }) {
  return (
    <header className="referee-app-header">
      <img className="referee-header-watermark" alt="" src={ligatecLogo} aria-hidden="true" />
      <div className="referee-header-brand">
        <img alt="LIGATEC" src={ligatecLogo} />
        <span>
          <b>LIGATEC</b>
          <small>Panel arbitro</small>
        </span>
      </div>
      <div className="referee-header-actions">
        <b>Activo</b>
        <button className="portal-mini-link" type="button" onClick={onLogout}>
          <RefereeTinyIcon type="logout" />
          <span>Salir</span>
        </button>
      </div>
    </header>
  );
}

function ConnectionStatusBar() {
  const snapshot = getConnectionSnapshot();
  return (
    <section className="referee-sync-bar" aria-label="Estado del sistema">
      <span className={snapshot.online ? "is-ok" : "is-warning"}>
        <RefereeTinyIcon type="wifi" />
        <b>{snapshot.connectionLabel}</b>
        <small>Red local activa</small>
      </span>
      <span className={snapshot.online ? "is-ok" : "is-warning"}>
        <RefereeTinyIcon type="cloud" />
        <b>{snapshot.syncLabel}</b>
        <small>Ultima sync: {snapshot.lastSyncLabel.replace("Hoy ", "")}</small>
      </span>
    </section>
  );
}

function RefereeProfileCard({ referee, currentUser }) {
  const name = referee?.name || currentUser?.name || "Arbitro central";
  return (
    <section className="referee-home-profile-card" aria-label="Perfil del arbitro">
      <span className="portal-avatar blue referee-home-avatar">{getTeamInitials(name)}</span>
      <div>
        <strong>{name}</strong>
        <small>Licencia: {referee?.license || "ACT-2025"}</small>
      </div>
      <aside>
        <RefereeTinyIcon type="check" />
        <span>
          <b>Verificado</b>
          <small>Cuenta activa</small>
        </span>
      </aside>
    </section>
  );
}

function RefereeHomeOverview({ nextMatch, pendingCount, savedCount, publishedCount }) {
  return (
    <section className="referee-home-overview" aria-label="Resumen operativo">
      <div className="referee-home-next-mini">
        <RefereeTinyIcon />
        <span>Proximo partido</span>
        <strong>{nextMatch ? formatDate(nextMatch.date) : "Sin partido"}</strong>
        {nextMatch?.time && <b><RefereeTinyIcon type="clock" />{nextMatch.time} hrs</b>}
      </div>
      <div className="referee-home-overview-stats">
        <span><PortalNavIcon type="acts" /><small>Pendientes</small><strong>{pendingCount}</strong></span>
        <span><PortalNavIcon type="assignments" /><small>Guardadas</small><strong>{savedCount}</strong></span>
        <span><PortalNavIcon type="history" /><small>Publicadas</small><strong>{publishedCount}</strong></span>
      </div>
    </section>
  );
}

function RefereeAssignmentHero({ match, onOpen }) {
  const status = getMatchStatus(match, false);
  return (
    <article className="referee-home-assignment-card" aria-label="Asignacion principal">
      <div className="referee-home-assignment-head">
        <span>Asignacion principal</span>
        <b className={status.className}>{status.label}</b>
      </div>
      <strong>Proximo partido</strong>
      <div className="referee-home-stage-row">
        <span><PortalNavIcon type="history" />{match.competitionName || "Torneo de liga"}</span>
        <span>{getMatchDayLabel(match)}</span>
      </div>
      <div className="referee-home-date-row">
        <span><RefereeTinyIcon />{formatDate(match.date)}</span>
        <span><RefereeTinyIcon type="clock" />{match.time || "Hora por definir"} hrs</span>
      </div>
      <div className="referee-home-versus">
        <div className="local">
          <RefereeTeamMark name={match.homeTeamName} />
          <strong>{match.homeTeamName}</strong>
          <small>Local</small>
        </div>
        <b>VS</b>
        <div className="away">
          <RefereeTeamMark name={match.awayTeamName} tone="away" />
          <strong>{match.awayTeamName}</strong>
          <small>Visitante</small>
        </div>
      </div>
      <div className="referee-home-meta-row">
        <span><RefereeTinyIcon type="field" />{match.venue || "Cancha por definir"}</span>
        <span><RefereeTinyIcon type="flag" />{match.refereeRole === "central" ? "Arbitro central" : "Arbitro asignado"}</span>
      </div>
      <em className={match.homeRosterSubmitted && match.awayRosterSubmitted ? "ready" : "waiting"}>
        <RefereeTinyIcon type="check" />
        {getRosterLabel(match)}
      </em>
      <button className="portal-primary-action blue" type="button" onClick={() => onOpen(match.id)}>
        <span>Ver partido</span>
        <b>›</b>
      </button>
    </article>
  );
}

function RefereeNoAssignmentHero({ lastMatch, totalHistory, onViewHistory }) {
  const lastScore = lastMatch ? `${lastMatch.homeGoals ?? 0} - ${lastMatch.awayGoals ?? 0}` : "";
  return (
    <article className="referee-home-empty-card" aria-label="Sin asignaciones">
      <div className="referee-empty-main">
        <span><RefereeTinyIcon /></span>
        <div>
          <small>Sin asignaciones</small>
          <strong>Actualmente no tienes partidos programados.</strong>
          <p>Tu proxima asignacion aparecera aqui automaticamente.</p>
        </div>
      </div>
      <div className="referee-empty-stats">
        <span><PortalNavIcon type="history" /></span>
        <div>
          <small>Ultimo partido</small>
          <strong>{lastMatch ? `${lastMatch.homeTeamName} ${lastScore} ${lastMatch.awayTeamName}` : "Sin historial reciente"}</strong>
          <b><RefereeTinyIcon type="check" />{lastMatch ? "Acta publicada" : "Pendiente de primer partido"}</b>
        </div>
        <div>
          <small>Esta temporada</small>
          <strong>{totalHistory}</strong>
          <em>partidos arbitrados</em>
        </div>
      </div>
      <button type="button" onClick={onViewHistory}>
        <span>Ver historial</span>
        <b>›</b>
      </button>
    </article>
  );
}

function RefereeDailyTip() {
  return (
    <section className="referee-daily-tip-card" aria-label="Consejo del dia">
      <span className="referee-tip-icon"><RefereeTinyIcon type="lightbulb" /></span>
      <div>
        <small><RefereeTinyIcon type="lightbulb" />Consejo del dia</small>
        <strong>Recuerda verificar las convocatorias antes del silbatazo inicial.</strong>
      </div>
      <RefereeTinyIcon type="whistle" />
    </section>
  );
}

function NextMatchCard({ match, onOpen }) {
  if (!match) {
    return (
      <article className="referee-next-card">
        <div className="portal-card-head">
          <strong>Proximo partido</strong>
          <span className="portal-status-pill neutral">Sin asignacion</span>
        </div>
        <p className="helper-text">Cuando la liga te asigne un partido, aparecera aqui.</p>
      </article>
    );
  }
  const status = getMatchStatus(match, false);
  return (
    <article className="referee-next-card">
      <div className="portal-card-head">
        <span>
          <small>Asignacion principal</small>
          <strong>Proximo partido</strong>
        </span>
        <span className={`portal-status-pill ${status.className}`}>{status.label}</span>
      </div>
      <div className="referee-match-stage">
        <span>{match.competitionName || "Categoria"}</span>
        <b>{getMatchDayLabel(match)}</b>
      </div>
      <div className="portal-match-date">
        <span><RefereeTinyIcon />{formatDate(match.date)}</span>
        <span><RefereeTinyIcon type="clock" />{match.time || "Hora por definir"}</span>
      </div>
      <div className="portal-match-teams">
        <div>
          <RefereeTeamMark name={match.homeTeamName} />
          <strong>{match.homeTeamName}</strong>
          <small>Local</small>
        </div>
        <b>VS</b>
        <div>
          <RefereeTeamMark name={match.awayTeamName} tone="away" />
          <strong>{match.awayTeamName}</strong>
          <small>Visitante</small>
        </div>
      </div>
      <div className="portal-match-meta">
        <span><RefereeTinyIcon type="field" />{match.venue || "Cancha por definir"}</span>
        <span><RefereeTinyIcon type="flag" />{match.refereeRole === "central" ? "Arbitro central" : "Arbitro asignado"}</span>
      </div>
      <span className={`referee-roster-pill ${match.homeRosterSubmitted && match.awayRosterSubmitted ? "ready" : "warning"}`}>
        <RefereeTinyIcon type="check" />
        {getRosterLabel(match)}
      </span>
      <button className="portal-primary-action blue" type="button" onClick={() => onOpen(match.id)}>
        <span>{getMatchActionLabel(match)}</span>
        <b>›</b>
      </button>
    </article>
  );
}

function CompactSummary({ pendingCount, savedCount, publishedCount }) {
  return (
    <section className="referee-summary-strip" aria-label="Resumen del arbitro">
      <span><strong>{pendingCount}</strong><small>Pendientes</small></span>
      <span><strong>{savedCount}</strong><small>Guardadas</small></span>
      <span><strong>{publishedCount}</strong><small>Publicadas</small></span>
    </section>
  );
}

function UpcomingPreview({ matches, onOpen, onViewAll }) {
  return (
    <section className="referee-brief-list">
      <div className="referee-section-title">
        <strong>Siguientes partidos</strong>
        <button type="button" onClick={onViewAll}>Ver todos</button>
      </div>
      {matches.slice(1, 3).map((match) => (
        <button className="referee-brief-match" key={match.id} type="button" onClick={() => onOpen(match.id)}>
          <span>{formatDate(match.date)} | {match.time || "Hora por definir"}</span>
          <strong>{match.homeTeamName} vs {match.awayTeamName}</strong>
          <small>{getRosterLabel(match)}</small>
        </button>
      ))}
      {matches.length <= 1 && <p className="empty">No hay mas partidos proximos por ahora.</p>}
    </section>
  );
}

function MatchFilterChips({ activeFilter, onChange }) {
  const filters = [
    ["upcoming", "Proximos"],
    ["progress", "En progreso"],
    ["saved", "Guardados"],
    ["signatures", "Pendientes de firma"],
    ["all", "Todos"]
  ];
  return (
    <div className="referee-filter-chips" role="tablist" aria-label="Filtros de partidos">
      {filters.map(([value, label]) => (
        <button className={activeFilter === value ? "active" : ""} key={value} type="button" onClick={() => onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function RefereeMatchPreparation({ match, onBack, onChooseMode }) {
  const checklist = [
    ["Arbitro autorizado", true, match.refereeRole === "central" ? "Central" : "Asignado"],
    ["Partido vigente", Boolean(match.canCapture), match.canCapture ? "Editable" : "Solo consulta"],
    ["Convocatoria local recibida", Boolean(match.homeRosterSubmitted), match.homeTeamName],
    ["Convocatoria visitante recibida", Boolean(match.awayRosterSubmitted), match.awayTeamName],
    ["Plantillas disponibles", Boolean((match.homePlayers || []).length && (match.awayPlayers || []).length), "Jugadores cargados"],
    ["Datos guardados en el dispositivo", true, "Cache local activo"],
    ["Estado de conexion", getConnectionSnapshot().online, getConnectionSnapshot().connectionLabel],
    ["Sin cambios pendientes", true, "Listo"]
  ];
  return (
    <main className="page referee-portal-page referee-acta-page referee-prep-page">
      <section className="referee-phone-panel">
        <div className="referee-screen-top">
          <button type="button" onClick={onBack} aria-label="Volver">‹</button>
          <strong>Detalles del partido</strong>
          <span>{getMatchStatus(match, false).label}</span>
        </div>
        <article className="referee-prep-card">
          <span className="portal-match-date">{formatDate(match.date)} | {match.time || "Hora por definir"}</span>
          <div className="portal-match-teams">
            <div>
              <RefereeTeamMark name={match.homeTeamName} />
              <strong>{match.homeTeamName}</strong>
              <small>Local</small>
            </div>
            <b>VS</b>
            <div>
              <RefereeTeamMark name={match.awayTeamName} tone="away" />
              <strong>{match.awayTeamName}</strong>
              <small>Visitante</small>
            </div>
          </div>
          <div className="portal-match-meta">
            <span>{match.venue || "Cancha por definir"}</span>
            <span>{match.competitionName || "Categoria"}</span>
            <span>{getMatchDayLabel(match)}</span>
          </div>
        </article>
        <section className="referee-checklist">
          <strong>Lista de comprobacion</strong>
          {checklist.map(([label, ok, detail]) => (
            <div className={ok ? "ok" : "blocked"} key={label}>
              <i>{ok ? "✓" : "!"}</i>
              <span>{label}</span>
              <small>{detail}</small>
            </div>
          ))}
        </section>
        <button className="portal-primary-action blue" type="button" onClick={onChooseMode} disabled={!match.canCapture}>
          Elegir modalidad de captura
        </button>
      </section>
    </main>
  );
}

function CaptureModeSelector({ match, onBack, onSelect }) {
  return (
    <main className="page referee-portal-page referee-acta-page referee-prep-page">
      <section className="referee-phone-panel">
        <div className="referee-screen-top">
          <button type="button" onClick={onBack} aria-label="Volver">‹</button>
          <strong>Elegir modalidad</strong>
          <span />
        </div>
        <button className="referee-mode-option live" type="button" onClick={() => onSelect("live")}>
          <span>
            <strong>Acta digital en vivo</strong>
            <b>Recomendado</b>
          </span>
          <small>Usa cronometro y registra eventos en tiempo real. Requiere firma digital de capitanes con PIN.</small>
        </button>
        <button className="referee-mode-option manual" type="button" onClick={() => onSelect("manual")}>
          <span>
            <strong>Captura manual</strong>
          </span>
          <small>Basado en acta fisica. Minuto manual, sin firma digital obligatoria y con revision segun la liga.</small>
        </button>
        <p className="referee-info-note">Podras cambiar de modalidad solo antes de iniciar la captura de {match.homeTeamName} vs {match.awayTeamName}.</p>
      </section>
    </main>
  );
}

function MatchCard({ match, history = false, onCapture }) {
  const roleLabel = match.refereeRole === "central"
    ? "Central"
    : match.refereeRole === "auxiliar_1"
    ? "Auxiliar 1"
    : match.refereeRole === "auxiliar_2"
    ? "Auxiliar 2"
    : match.refereeRole === "cuarto_arbitro"
    ? "Cuarto arbitro"
    : "Asignado";
  const status = getMatchStatus(match, history);
  const scoreLabel = `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}`;
  return (
    <article className={`referee-match-card ${history ? "history-card" : ""}`}>
      <div className="referee-match-top">
        <span>{formatDate(match.date)} | {match.time || "Hora por definir"}</span>
        <b className={`referee-status ${status.className}`}>{status.label}</b>
      </div>
      <div className="referee-match-main">
        <div>
          <RefereeTeamMark name={match.homeTeamName} />
          <strong>{match.homeTeamName}</strong>
          <small>Local</small>
        </div>
        <div className="referee-match-score">
          {history || match.sheetReviewStatus === "pending_review" ? scoreLabel : "VS"}
        </div>
        <div>
          <RefereeTeamMark name={match.awayTeamName} tone="away" />
          <strong>{match.awayTeamName}</strong>
          <small>Visitante</small>
        </div>
      </div>
      <div className="referee-match-meta">
        <span>{roleLabel}</span>
        <span>{match.competitionName || "Categoria"}</span>
        <span>{match.venue || "Cancha por definir"}</span>
      </div>
      {["postponed", "rescheduled", "advanced"].includes(match.status || "") && (
        <p className="referee-card-note">
          {match.scheduleNote || (match.status === "postponed" ? "La liga pospuso este partido. Espera nueva indicacion." : match.status === "advanced" ? "Partido adelantado por la liga." : "Partido reprogramado por la liga.")}
        </p>
      )}
      <div className="referee-roster-status-row">
        <span>{match.homeRosterSubmitted ? `${match.homeTeamName}: convocatoria enviada` : `${match.homeTeamName}: sin convocatoria`}</span>
        <span>{match.awayRosterSubmitted ? `${match.awayTeamName}: convocatoria enviada` : `${match.awayTeamName}: sin convocatoria`}</span>
      </div>
      {!history && (
        <div className="referee-crew-grid" aria-label="Equipo arbitral">
          <span><b>Central</b><small>{match.refereeRole === "central" ? "Tu" : "Asignado"}</small></span>
          <span><b>Asistente 1</b><small>Por asignar</small></span>
          <span><b>Asistente 2</b><small>Por asignar</small></span>
          <span><b>4to arbitro</b><small>Por asignar</small></span>
        </div>
      )}
      {match.sessionStatus && !history && (
        <p className="referee-card-note">
          {match.sessionStatus === "temporarily_saved"
            ? "Hay una acta guardada temporalmente. Puedes continuar la captura."
            : String(match.sessionStatus).startsWith("suspended")
              ? "Partido suspendido. Revisa o continua segun indique la liga."
              : match.sessionStatus === "match_finished"
                ? "Partido finalizado con acta preliminar pendiente de firma/finalizacion."
                : "Sesion de captura iniciada."}
        </p>
      )}
      {match.sheetReviewStatus === "pending_review" ? (
        <p className="referee-card-note">Acta capturada. Cualquier correccion posterior se atiende desde administracion.</p>
      ) : match.sheetReviewStatus === "rejected" ? (
        <button className="referee-action-button warning" type="button" onClick={() => onCapture?.(match.id)}>Corregir acta</button>
      ) : history ? (
        <p className="referee-card-note">Resultado registrado en historial.</p>
      ) : !match.canCapture ? (
        <button className="referee-action-button" type="button" disabled>Solo consulta</button>
      ) : (
        <button className="referee-action-button primary-action" type="button" onClick={() => onCapture?.(match.id)}>
          {getMatchActionLabel(match)}
        </button>
      )}
    </article>
  );
}

function RefereeHistoryMatchCard({ match, onOpenActa }) {
  const status = getRefereeHistoryStatus(match);
  const dateParts = formatHistoryDateParts(match.date, match.time);
  const score = getRefereeHistoryScore(match);
  const note = match.scheduleNote || match.reportPayload?.observations || "";

  return (
    <article className={`referee-history-app-card ${status.className}`}>
      <div className="referee-history-date-rail">
        <span>{dateParts.weekday}</span>
        <strong>{dateParts.day}</strong>
        <small>{dateParts.month}</small>
        <em>{dateParts.time}</em>
      </div>
      <div className="referee-history-card-main">
        <div className="referee-history-score-row">
          <div className="referee-history-team home">
            <RefereeTeamMark name={match.homeTeamName} />
            <strong>{match.homeTeamName}</strong>
            <small>Local</small>
          </div>
          <div className="referee-history-scorebox">
            <span className={`referee-history-status-pill ${status.className}`}>{status.label}</span>
            <b>{score}</b>
          </div>
          <div className="referee-history-team away">
            <RefereeTeamMark name={match.awayTeamName} tone="away" />
            <strong>{match.awayTeamName}</strong>
            <small>Visitante</small>
          </div>
        </div>
        <div className="referee-history-card-meta">
          <span><RefereeTinyIcon type="field" />{match.venue || "Cancha por definir"}</span>
          <span><PortalNavIcon type="stats" />{match.competitionName || "Torneo de liga"}</span>
        </div>
        {note && <p>{note}</p>}
        <div className="referee-history-card-actions">
          <span className={`referee-history-acta-state ${status.className}`}>{status.actaLabel}</span>
          <button className="referee-history-acta-button" type="button" onClick={() => onOpenActa?.(match)}>
            <span>Ver acta</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function RefereeReadOnlyActa({ match, reportState, loading, error, onBack }) {
  const report = reportState?.report || null;
  const payload = report?.payload && typeof report.payload === "object" ? report.payload : match?.reportPayload || {};
  const events = Array.isArray(payload.events) ? payload.events : Array.isArray(match?.events) ? match.events : [];
  const homeGoals = payload.homeGoals ?? report?.homeGoals ?? match?.homeGoals ?? 0;
  const awayGoals = payload.awayGoals ?? report?.awayGoals ?? match?.awayGoals ?? 0;
  const observations = payload.observations || match?.observations || "";
  const signatures = Array.isArray(reportState?.signatures) ? reportState.signatures : Array.isArray(report?.signatures) ? report.signatures : [];
  const status = report?.status || match?.reportStatus || match?.sheetReviewStatus || match?.status || "published";
  const statusLabel = status === "published"
    ? "Publicada"
    : status === "finalized"
    ? "Finalizada"
    : status === "pending_review"
    ? "En revision"
    : "Lectura";

  return (
    <main className="page referee-portal-page referee-acta-page referee-readonly-acta-page">
      <section className="referee-phone-panel referee-readonly-acta">
        <div className="referee-readonly-topbar">
          <button type="button" onClick={onBack} aria-label="Regresar">‹</button>
          <div>
            <strong>Acta en lectura</strong>
            <small>{match?.homeTeamName || "Local"} vs {match?.awayTeamName || "Visitante"}</small>
          </div>
          <span>{statusLabel}</span>
        </div>
        {loading ? (
          <article className="referee-readonly-card">
            <strong>Cargando acta...</strong>
            <small>Consultando el resumen oficial del partido.</small>
          </article>
        ) : (
          <>
            {error && <p className="sheet-alert">{error}</p>}
            <article className="referee-readonly-scorecard">
              <span className="referee-readonly-kicker">{match?.competitionName || "Torneo"} · Jornada {match?.round || "-"}</span>
              <div className="referee-readonly-teams">
                <span>
                  <RefereeTeamMark name={match?.homeTeamName} />
                  <strong>{match?.homeTeamName || "Local"}</strong>
                  <small>Local</small>
                </span>
                <b>{homeGoals} - {awayGoals}</b>
                <span>
                  <RefereeTeamMark name={match?.awayTeamName} tone="away" />
                  <strong>{match?.awayTeamName || "Visitante"}</strong>
                  <small>Visitante</small>
                </span>
              </div>
              <div className="referee-readonly-meta">
                <span><RefereeTinyIcon />{match?.date || "Fecha por definir"}</span>
                <span><RefereeTinyIcon type="clock" />{match?.time || "Hora por definir"}</span>
                <span><RefereeTinyIcon type="field" />{match?.venue || "Cancha por definir"}</span>
              </div>
            </article>

            <article className="referee-readonly-card">
              <div className="referee-readonly-section-head">
                <strong>Eventos del partido</strong>
                <span>{events.length} registro(s)</span>
              </div>
              <div className="referee-readonly-events">
                {events.map((eventItem, index) => {
                  const eventTeam = eventItem.teamName || (eventItem.teamId === match?.homeTeamId ? match?.homeTeamName : eventItem.teamId === match?.awayTeamId ? match?.awayTeamName : "Equipo");
                  return (
                    <article className={`event-kind-${eventItem.type || "event"}`} key={eventItem.id || `${eventItem.type}-${index}`}>
                      <b aria-hidden="true">{getEventIcon(eventItem.type, eventItem)}</b>
                      <div>
                        <strong>{eventItem.playerName || eventItem.player || "Jugador no especificado"}</strong>
                        <span>{getEventLabel(eventItem.type, eventItem)} · {eventTeam}</span>
                      </div>
                      <small>{eventItem.minuteLabel || eventItem.minute || "-"}'</small>
                    </article>
                  );
                })}
                {!events.length && <p className="empty">No hay eventos registrados en esta acta.</p>}
              </div>
            </article>

            <article className="referee-readonly-card compact">
              <div>
                <strong>Observaciones</strong>
                <p>{observations || "Sin observaciones registradas."}</p>
              </div>
            </article>

            <article className="referee-readonly-card compact">
              <div className="referee-readonly-section-head">
                <strong>Firmas</strong>
                <span>{signatures.length}</span>
              </div>
              <div className="referee-readonly-signatures">
                <span className={reportState?.homeSigned ? "signed" : ""}><RefereeTinyIcon type={reportState?.homeSigned ? "check" : "clock"} />Local {reportState?.homeSigned ? "firmada" : "pendiente"}</span>
                <span className={reportState?.awaySigned ? "signed" : ""}><RefereeTinyIcon type={reportState?.awaySigned ? "check" : "clock"} />Visitante {reportState?.awaySigned ? "firmada" : "pendiente"}</span>
              </div>
            </article>
          </>
        )}
      </section>
    </main>
  );
}

function getPlayersForEvent(match, event) {
  const eventTeamId = event.teamId || match.homeTeamId;
  if (event.type === "own_goal") {
    return eventTeamId === match.homeTeamId ? match.awayPlayers || [] : match.homePlayers || [];
  }
  return eventTeamId === match.homeTeamId ? match.homePlayers || [] : match.awayPlayers || [];
}

function createEvent(match, type, teamId, minuteInfo = "") {
  const normalizedMinute = typeof minuteInfo === "object" && minuteInfo !== null ? minuteInfo : { minute: minuteInfo, minuteLabel: "" };
  return {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    lockedType: type,
    teamId,
    lockedTeamId: teamId,
    playerId: "",
    minute: normalizedMinute.minute || "",
    minuteLabel: normalizedMinute.minuteLabel || "",
    period: normalizedMinute.period || MATCH_EVENT_PERIODS.REGULAR,
    suspensionMatches: 0,
    suspensionIndefinite: false,
    disciplinaryPending: type === "red",
    redReasonMode: "",
    reason: ""
  };
}

function readRefereeDraft(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft && typeof draft === "object" ? draft : null;
  } catch {
    return null;
  }
}

function writeRefereeDraft(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify({ ...value, savedAt: new Date().toISOString() }));
}

function clearRefereeDraft(key) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function getRefereePortalCacheKey(userId) {
  return `ligatec-referee-portal-cache-${userId || "anonymous"}`;
}

function readRefereePortalCache(userId) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getRefereePortalCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.payload || null;
  } catch {
    return null;
  }
}

function writeRefereePortalCache(userId, payload) {
  if (typeof window === "undefined" || !userId || !payload) return;
  try {
    window.localStorage.setItem(getRefereePortalCacheKey(userId), JSON.stringify({
      payload,
      savedAt: new Date().toISOString()
    }));
  } catch {
    // El panel sigue funcionando aunque el navegador no permita cache local.
  }
}

function getRefereeActiveCaptureKey(userId) {
  return `ligatec-referee-active-capture-${userId || "anonymous"}`;
}

function readRefereeActiveCapture(userId) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getRefereeActiveCaptureKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeRefereeActiveCapture(userId, matchId, captureMode = "live") {
  if (typeof window === "undefined" || !userId || !matchId) return;
  try {
    window.localStorage.setItem(getRefereeActiveCaptureKey(userId), JSON.stringify({
      matchId,
      captureMode,
      savedAt: new Date().toISOString()
    }));
  } catch {
    // Si el navegador bloquea storage, la recuperacion por servidor/local draft sigue disponible.
  }
}

function clearRefereeActiveCapture(userId) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.removeItem(getRefereeActiveCaptureKey(userId));
}

function RefereeLoadingShell() {
  return (
    <main className="page referee-mobile-app portal-loading-page">
      <section className="portal-loading-card referee">
        <img alt="LIGATEC" src={ligatecLogo} />
        <span>Panel arbitro</span>
        <strong>Preparando partidos</strong>
        <small>Sincronizando asignaciones y actas.</small>
        <div className="portal-loading-bars" aria-hidden="true">
          <b />
          <b />
          <b />
        </div>
      </section>
    </main>
  );
}

function getEventLabel(type, eventItem = null) {
  if (eventItem?.cardDetail === "double_yellow") return "Roja por 2a amarilla";
  if (eventItem?.cardDetail === "double_yellow_second") return "2a amarilla";
  if (eventItem?.cardDetail === "double_yellow_first") return "Amarilla";
  if (type === "goal") return "Gol";
  if (type === "own_goal") return "Autogol";
  if (type === "yellow") return "Amarilla";
  if (type === "red") return "Roja";
  return "Evento";
}

function getEventIcon(type, eventItem = null) {
  if (type === "goal") return "⚽";
  if (type === "own_goal") return "↩";
  if (type === "yellow") return "🟨";
  if (type === "red") return "🟥";
  return "•";
}

function normalizeDoubleYellowDraftEvents(eventList = []) {
  const baseEvents = eventList
    .filter((eventItem) => !(eventItem.type === "red" && eventItem.cardDetail === "double_yellow" && eventItem.autoGenerated))
    .map((eventItem) => {
      if (eventItem.type !== "yellow") return eventItem;
      if (!["double_yellow_first", "double_yellow_second"].includes(eventItem.cardDetail)) return eventItem;
      return {
        ...eventItem,
        cardDetail: "",
        countsForAccumulation: true,
        excludedFromAccumulation: false
      };
    });
  const nextEvents = [];
  const firstYellowByPlayer = new Map();
  const sentOffPlayers = new Set();

  for (const eventItem of baseEvents) {
    if (eventItem.type !== "yellow" || !eventItem.playerId) {
      nextEvents.push(eventItem);
      if (eventItem.type === "red" && eventItem.playerId && eventItem.cardDetail === "double_yellow") {
        sentOffPlayers.add(eventItem.playerId);
      }
      continue;
    }

    const playerKey = eventItem.playerId;
    if (!firstYellowByPlayer.has(playerKey)) {
      firstYellowByPlayer.set(playerKey, { eventItem, index: nextEvents.length });
      nextEvents.push(eventItem);
      continue;
    }

    const firstYellow = firstYellowByPlayer.get(playerKey);
    const firstMinute = firstYellow.eventItem.minuteLabel || firstYellow.eventItem.minute || "";
    const secondMinute = eventItem.minuteLabel || eventItem.minute || "";
    nextEvents[firstYellow.index] = {
      ...firstYellow.eventItem,
      cardDetail: "double_yellow_first",
      countsForAccumulation: false,
      excludedFromAccumulation: true
    };
    nextEvents.push({
      ...eventItem,
      cardDetail: "double_yellow_second",
      countsForAccumulation: false,
      excludedFromAccumulation: true
    });

    if (!sentOffPlayers.has(playerKey)) {
      nextEvents.push({
        ...eventItem,
        id: `event-double-yellow-${playerKey}-${firstYellow.eventItem.id || firstYellow.index}-${eventItem.id || nextEvents.length}`,
        type: "red",
        lockedType: "red",
        cardDetail: "double_yellow",
        autoGenerated: true,
        countsForAccumulation: false,
        excludedFromAccumulation: true,
        suspensionMatches: 0,
        suspensionIndefinite: false,
        disciplinaryPending: true,
        reason: DOUBLE_YELLOW_REASON,
        sourceYellowCardMinutes: [firstMinute, secondMinute].filter(Boolean)
      });
      sentOffPlayers.add(playerKey);
    }
  }

  return nextEvents;
}

function getRecentLiveEvents(eventList = []) {
  return eventList
    .map((eventItem, index) => ({ eventItem, index }))
    .slice(-3)
    .sort((left, right) => {
      const leftSecondYellow = left.eventItem.type === "yellow" && left.eventItem.cardDetail === "double_yellow_second";
      const rightSecondYellow = right.eventItem.type === "yellow" && right.eventItem.cardDetail === "double_yellow_second";
      const leftDoubleRed = left.eventItem.type === "red" && left.eventItem.cardDetail === "double_yellow";
      const rightDoubleRed = right.eventItem.type === "red" && right.eventItem.cardDetail === "double_yellow";
      const sameDoubleYellowSequence = (
        left.eventItem.playerId &&
        left.eventItem.playerId === right.eventItem.playerId &&
        (left.eventItem.minuteLabel || left.eventItem.minute || "") === (right.eventItem.minuteLabel || right.eventItem.minute || "")
      );
      if (sameDoubleYellowSequence) {
        if (leftSecondYellow && rightDoubleRed) return -1;
        if (leftDoubleRed && rightSecondYellow) return 1;
      }
      return right.index - left.index;
    })
    .map(({ eventItem }) => eventItem);
}

function EventQuickButton({ className, icon, title, subtitle, onClick }) {
  return (
    <button className={className} type="button" onClick={onClick}>
      <span className="referee-event-button-icon" aria-hidden="true">{icon}</span>
      <span className="referee-event-button-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </button>
  );
}

function createTimerStateFromSources({ draft, serverClock }) {
  const sourceTimer = draft?.liveTimer || serverClock?.liveTimer || null;
  const currentPeriod = draft?.liveTimer?.currentPeriod ||
    serverClock?.currentPeriod ||
    periodNumberToKey(draft?.livePeriod || serverClock?.livePeriod || 1);
  const liveStarted = Boolean(sourceTimer || (draft?.liveStarted ?? serverClock?.liveStarted));
  const liveRunning = sourceTimer
    ? sourceTimer.timerStatus === LIVE_TIMER_STATUSES.RUNNING
    : Boolean(draft?.liveRunning ?? serverClock?.liveRunning);
  return createLiveTimerState({
    ...(sourceTimer || {}),
    currentPeriod: liveStarted ? currentPeriod : LIVE_PERIODS.PRE_MATCH,
    timerStatus: liveStarted
      ? liveRunning ? LIVE_TIMER_STATUSES.RUNNING : LIVE_TIMER_STATUSES.PAUSED
      : LIVE_TIMER_STATUSES.NOT_STARTED,
    accumulatedSeconds: draft?.liveTimer?.accumulatedSeconds ??
      serverClock?.liveTimer?.accumulatedSeconds ??
      draft?.liveElapsedSeconds ??
      serverClock?.liveElapsedSeconds ??
      0,
    periodStartedAt: draft?.liveTimer?.periodStartedAt || serverClock?.liveTimer?.periodStartedAt || null,
    clientSessionId: draft?.liveTimer?.clientSessionId || serverClock?.liveTimer?.clientSessionId || getLiveClientSessionId(),
    version: draft?.liveTimer?.version || serverClock?.liveTimer?.version || 1
  });
}

function RefereeSheetForm({ authToken, match, initialCaptureMode = "live", onCancel, onSaved }) {
  const draftKey = `ligatec-referee-draft-${match.id}`;
  const savedEvents = (match.events || []).map((event, index) => ({
    id: `saved-${match.id}-${index}-${event.type}-${event.playerId}`,
    ...event,
    lockedType: event.type,
    lockedTeamId: event.teamId || match.homeTeamId,
    minuteLabel: event.minuteLabel || "",
    suspensionIndefinite: Boolean(event.suspensionIndefinite),
    disciplinaryPending: Boolean(event.disciplinaryPending)
  }));
  const draft = readRefereeDraft(draftKey);
  const serverSession = match.session || null;
  const serverClock = serverSession?.clockState || {};
  const serverMetadata = serverSession?.metadata || {};
  const initialTimerState = createTimerStateFromSources({ draft, serverClock });
  const [homeGoals, setHomeGoals] = useState(draft?.homeGoals ?? serverMetadata.homeGoals ?? match.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(draft?.awayGoals ?? serverMetadata.awayGoals ?? match.awayGoals ?? 0);
  const [extraTimeEnabled, setExtraTimeEnabled] = useState(Boolean(draft?.extraTimeEnabled || match.extraTimeHomeGoals !== null || match.extraTimeAwayGoals !== null));
  const [penaltiesEnabled, setPenaltiesEnabled] = useState(Boolean(draft?.penaltiesEnabled || match.penaltyHomeGoals !== null || match.penaltyAwayGoals !== null));
  const [extraTimeHomeGoals, setExtraTimeHomeGoals] = useState(draft?.extraTimeHomeGoals ?? match.extraTimeHomeGoals ?? "");
  const [extraTimeAwayGoals, setExtraTimeAwayGoals] = useState(draft?.extraTimeAwayGoals ?? match.extraTimeAwayGoals ?? "");
  const [penaltyHomeGoals, setPenaltyHomeGoals] = useState(draft?.penaltyHomeGoals ?? match.penaltyHomeGoals ?? "");
  const [penaltyAwayGoals, setPenaltyAwayGoals] = useState(draft?.penaltyAwayGoals ?? match.penaltyAwayGoals ?? "");
  const [sheetMode, setSheetMode] = useState(draft?.sheetMode || "played");
  const [defaultWinner, setDefaultWinner] = useState(draft?.defaultWinner || "home");
  const [defaultScore, setDefaultScore] = useState(draft?.defaultScore || "3");
  const [observations, setObservations] = useState(draft?.observations ?? serverMetadata.observations ?? match.observations ?? "");
  const [events, setEvents] = useState(draft?.events || serverMetadata.events || savedEvents);
  const [homeCaptainPin, setHomeCaptainPin] = useState(draft?.homeCaptainPin || "");
  const [awayCaptainPin, setAwayCaptainPin] = useState(draft?.awayCaptainPin || "");
  const [sessionId, setSessionId] = useState(draft?.sessionId || serverSession?.id || "");
  const [liveTimer, setLiveTimer] = useState(initialTimerState);
  const [liveStarted, setLiveStarted] = useState(initialTimerState.timerStatus !== LIVE_TIMER_STATUSES.NOT_STARTED);
  const [liveRunning, setLiveRunning] = useState(initialTimerState.timerStatus === LIVE_TIMER_STATUSES.RUNNING);
  const [livePeriod, setLivePeriod] = useState(periodKeyToNumber(initialTimerState.currentPeriod));
  const [liveDuration, setLiveDuration] = useState(Number(draft?.liveDuration || serverClock.liveDuration || 45));
  const [extraTimeDuration, setExtraTimeDuration] = useState(Number(draft?.extraTimeDuration || serverClock.extraTimeDuration || 15));
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(calculateElapsedSeconds(initialTimerState));
  const [liveAlerted, setLiveAlerted] = useState(Boolean(draft?.liveAlerted ?? serverClock.liveAlerted));
  const [liveStorageStatus, setLiveStorageStatus] = useState("Guardado en este dispositivo");
  const [syncStatus, setSyncStatus] = useState("Sincronizado con LIGATEC");
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const [batterySaver, setBatterySaver] = useState(Boolean(draft?.batterySaver));
  const [wakeLockStatus, setWakeLockStatus] = useState("idle");
  const [playerSearches, setPlayerSearches] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reportState, setReportState] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [captureMode] = useState(draft?.captureMode || initialCaptureMode);
  const [selectedEventTeam, setSelectedEventTeam] = useState(match.homeTeamId);
  const [eventComposer, setEventComposer] = useState(null);
  const [eventComposerQuery, setEventComposerQuery] = useState("");
  const [eventComposerFilter, setEventComposerFilter] = useState("all");
  const [pendingRedReasonEventId, setPendingRedReasonEventId] = useState("");
  const wakeLockRef = useRef(null);
  const lastEventRef = useRef({ type: "", teamId: "", at: 0 });
  const signatureSnapshotRef = useRef({ initialized: false, homeSigned: false, awaySigned: false });

  useEffect(() => {
    if (!isPreliminaryReportMatch(match)) return;
    let cancelled = false;
    setLoadingReport(true);
    fetchRefereeMatchReport(authToken, match.id)
      .then((nextReportState) => {
        if (cancelled) return;
        setReportState(nextReportState);
        signatureSnapshotRef.current = {
          initialized: true,
          homeSigned: Boolean(nextReportState.homeSigned),
          awaySigned: Boolean(nextReportState.awaySigned)
        };
        const reportPayload = nextReportState.report?.payload && typeof nextReportState.report.payload === "object"
          ? nextReportState.report.payload
          : null;
        if (!reportPayload) return;
        setHomeGoals(reportPayload.homeGoals ?? nextReportState.report.homeGoals ?? homeGoals);
        setAwayGoals(reportPayload.awayGoals ?? nextReportState.report.awayGoals ?? awayGoals);
        setExtraTimeEnabled(Boolean(reportPayload.extraTimeEnabled));
        setPenaltiesEnabled(Boolean(reportPayload.penaltiesEnabled));
        setExtraTimeHomeGoals(reportPayload.extraTimeHomeGoals ?? "");
        setExtraTimeAwayGoals(reportPayload.extraTimeAwayGoals ?? "");
        setPenaltyHomeGoals(reportPayload.penaltyHomeGoals ?? "");
        setPenaltyAwayGoals(reportPayload.penaltyAwayGoals ?? "");
        setObservations(reportPayload.observations || "");
        setEvents(Array.isArray(reportPayload.events) ? reportPayload.events : []);
        if (reportPayload.liveTimer) {
          const nextTimer = createLiveTimerState(reportPayload.liveTimer);
          setLiveTimer(nextTimer);
          setLiveStarted(nextTimer.timerStatus !== LIVE_TIMER_STATUSES.NOT_STARTED);
          setLiveRunning(nextTimer.timerStatus === LIVE_TIMER_STATUSES.RUNNING);
          setLivePeriod(periodKeyToNumber(nextTimer.currentPeriod));
          setLiveElapsedSeconds(calculateElapsedSeconds(nextTimer));
        }
      })
      .catch((reportError) => {
        if (!cancelled) setMessage(reportError.message || "No se pudo cargar el acta preliminar.");
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, match.id, match.sessionStatus, match.workflowStatus]);

  useEffect(() => {
    if (!reportState?.report || ["finalized", "published"].includes(reportState.report.status)) return undefined;
    let cancelled = false;
    const getCaptainSignatureLabel = (teamSide) => {
      const playerId = teamSide === "home" ? match.homeCaptainPlayerId : match.awayCaptainPlayerId;
      const players = teamSide === "home" ? match.homePlayers || [] : match.awayPlayers || [];
      const teamName = teamSide === "home" ? match.homeTeamName : match.awayTeamName;
      const captain = players.find((player) => player.id === playerId || player.isCaptain);
      return captain?.name ? `${captain.name} (${teamName})` : teamName;
    };
    const pollSignatures = async () => {
      try {
        const nextReportState = await fetchRefereeMatchReport(authToken, match.id);
        if (cancelled) return;
        const previous = signatureSnapshotRef.current;
        const nextHomeSigned = Boolean(nextReportState.homeSigned);
        const nextAwaySigned = Boolean(nextReportState.awaySigned);
        const updates = [];
        if (previous.initialized && !previous.homeSigned && nextHomeSigned) updates.push(`Firma recibida: ${getCaptainSignatureLabel("home")}.`);
        if (previous.initialized && !previous.awaySigned && nextAwaySigned) updates.push(`Firma recibida: ${getCaptainSignatureLabel("away")}.`);
        signatureSnapshotRef.current = {
          initialized: true,
          homeSigned: nextHomeSigned,
          awaySigned: nextAwaySigned
        };
        setReportState(nextReportState);
        if (updates.length) {
          setMessage(nextReportState.readyToFinalize
            ? `${updates.join(" ")} Firmas completas; ya puedes publicar el acta.`
            : updates.join(" "));
        }
      } catch {
        // El estado en pantalla se conserva; el siguiente ciclo intentara sincronizar de nuevo.
      }
    };
    const intervalId = window.setInterval(pollSignatures, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authToken, match.id, reportState?.report?.id, reportState?.report?.status]);

  useEffect(() => {
    let cancelled = false;
    async function recoverLocalState() {
      try {
        const [localState, pendingOps, liveState] = await Promise.all([
          getLiveMatchState(match.id),
          listPendingLiveOperations(match.id),
          fetchRefereeLiveState(authToken, match.id).catch(() => null)
        ]);
        if (cancelled) return;
        setPendingOperationCount(pendingOps.length);
        if (liveState?.serverTimestamp) {
          const drift = detectTimeDrift({ serverTimestamp: liveState.serverTimestamp });
          if (drift.hasDrift) {
            setMessage("Advertencia: la hora del dispositivo parece distinta a la del servidor. No se corrigio el partido automaticamente.");
          }
        }
        if (!localState?.draft) return;
        const localUpdated = new Date(localState.lastLocalUpdate || 0).getTime();
        const serverUpdated = new Date(liveState?.session?.updatedAt || serverSession?.updatedAt || 0).getTime();
        const hasRecoverableLocalProgress = isRecoverableLiveDraft(localState.draft);
        if (localUpdated < serverUpdated && !pendingOps.length && !hasRecoverableLocalProgress) return;
        const recovered = localState.draft;
        setHomeGoals(recovered.homeGoals ?? homeGoals);
        setAwayGoals(recovered.awayGoals ?? awayGoals);
        setExtraTimeEnabled(Boolean(recovered.extraTimeEnabled));
        setPenaltiesEnabled(Boolean(recovered.penaltiesEnabled));
        setExtraTimeHomeGoals(recovered.extraTimeHomeGoals ?? "");
        setExtraTimeAwayGoals(recovered.extraTimeAwayGoals ?? "");
        setPenaltyHomeGoals(recovered.penaltyHomeGoals ?? "");
        setPenaltyAwayGoals(recovered.penaltyAwayGoals ?? "");
        setSheetMode(recovered.sheetMode || "played");
        setDefaultWinner(recovered.defaultWinner || "home");
        setDefaultScore(recovered.defaultScore || "3");
        setObservations(recovered.observations || "");
        setEvents(Array.isArray(recovered.events) ? recovered.events : []);
        setSessionId(recovered.sessionId || sessionId);
        if (recovered.liveTimer) {
          const nextTimer = createLiveTimerState(recovered.liveTimer);
          setLiveTimer(nextTimer);
          setLiveStarted(nextTimer.timerStatus !== LIVE_TIMER_STATUSES.NOT_STARTED);
          setLiveRunning(nextTimer.timerStatus === LIVE_TIMER_STATUSES.RUNNING);
          setLivePeriod(periodKeyToNumber(nextTimer.currentPeriod));
          setLiveElapsedSeconds(calculateElapsedSeconds(nextTimer));
        }
        setLiveDuration(Number(recovered.liveDuration || liveDuration));
        setExtraTimeDuration(Number(recovered.extraTimeDuration || extraTimeDuration));
        setLiveAlerted(Boolean(recovered.liveAlerted));
        setBatterySaver(Boolean(recovered.batterySaver));
        setLiveStorageStatus("Partido en vivo recuperado de este dispositivo");
        if (pendingOps.length) {
          setSyncStatus(`${pendingOps.length} operacion(es) pendiente(s)`);
          setMessage(`Partido en vivo recuperado. Existen ${pendingOps.length} operacion(es) guardada(s) en este dispositivo pendientes de sincronizar.`);
        } else {
          setMessage("Partido en vivo recuperado desde este dispositivo.");
        }
      } catch (storageError) {
        if (!cancelled) setMessage(storageError.message || "No se pudo revisar la recuperacion local.");
      }
    }
    recoverLocalState();
    return () => {
      cancelled = true;
    };
  }, [authToken, match.id]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && wakeLockStatus === "active" && !wakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseWakeLock();
    };
  }, [wakeLockStatus]);

  useEffect(() => {
    const refreshClock = () => setLiveElapsedSeconds(calculateElapsedSeconds(liveTimer));
    refreshClock();
    if (!liveRunning) return undefined;
    const interval = window.setInterval(refreshClock, 1000);
    const handleVisibility = () => refreshClock();
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refreshClock);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refreshClock);
    };
  }, [liveRunning, liveTimer]);

  useEffect(() => {
    if (!liveStarted || liveAlerted) return;
    const targetDuration = livePeriod >= 3 ? Number(extraTimeDuration || 15) : Number(liveDuration || 45);
    const remainingSeconds = targetDuration * 60 - liveElapsedSeconds;
    if (remainingSeconds > 0 && remainingSeconds <= 300) {
      setLiveAlerted(true);
      const warning = livePeriod === 1
        ? "Cronometro: faltan 5 minutos para terminar el primer tiempo. Ya puedes finalizar 1T cuando corresponda."
        : livePeriod === 3
        ? "Cronometro: faltan 5 minutos para terminar el primer tiempo extra. Ya puedes finalizar 1TE cuando corresponda."
        : livePeriod === 4
        ? "Cronometro: faltan 5 minutos para terminar el tiempo extra. Ya puedes finalizar TE cuando corresponda."
        : "Cronometro: faltan 5 minutos para terminar el partido. Ya puedes finalizar el partido cuando corresponda.";
      setMessage(warning);
      notifyClockWarning();
    }
  }, [extraTimeDuration, liveAlerted, liveDuration, liveElapsedSeconds, livePeriod, liveStarted]);

  useEffect(() => {
    if (!pendingRedReasonEventId || typeof window === "undefined") return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const reasonControl = document.querySelector(`[data-red-reason-event-id="${pendingRedReasonEventId}"]`);
      if (!reasonControl) return;
      const row = reasonControl.closest(".referee-event-row");
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusTarget = reasonControl.matches("input, button, select, textarea")
        ? reasonControl
        : reasonControl.querySelector("button, input, select, textarea");
      focusTarget?.focus({ preventScroll: true });
      setPendingRedReasonEventId("");
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [events, eventComposer, pendingRedReasonEventId]);

  useEffect(() => {
    if (!liveStarted) return;
    if (liveElapsedSeconds % 10 !== 0) return;
    persistDraftSilently();
  }, [liveElapsedSeconds, liveStarted]);

  useEffect(() => {
    if (!isRecoverableLiveDraft(buildDraftPayload()) && !observations) return undefined;
    const timeoutId = window.setTimeout(() => {
      persistDraftSilently();
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [
    homeGoals,
    awayGoals,
    extraTimeEnabled,
    penaltiesEnabled,
    extraTimeHomeGoals,
    extraTimeAwayGoals,
    penaltyHomeGoals,
    penaltyAwayGoals,
    sheetMode,
    defaultWinner,
    defaultScore,
    observations,
    events,
    homeCaptainPin,
    awayCaptainPin,
    sessionId,
    liveStarted,
    livePeriod,
    liveDuration,
    extraTimeDuration,
    liveAlerted,
    liveTimer,
    captureMode,
    batterySaver
  ]);

  useEffect(() => {
    let cancelled = false;
    async function refreshPendingStatus() {
      const pendingOps = await listPendingLiveOperations(match.id).catch(() => []);
      if (cancelled) return;
      setPendingOperationCount(pendingOps.length);
      if (!navigator.onLine) {
        setSyncStatus("Sin conexion: guardado en este dispositivo");
      } else if (pendingOps.length) {
        setSyncStatus(`${pendingOps.length} operacion(es) pendiente(s)`);
      } else {
        setSyncStatus("Sincronizado con LIGATEC");
      }
    }
    const handleOnline = () => {
      refreshPendingStatus();
      saveDraft({ keepOpen: true, message: "Conexion recuperada. El partido sigue abierto y se sincronizo sin salir de la captura." });
    };
    refreshPendingStatus();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", refreshPendingStatus);
    window.addEventListener("focus", refreshPendingStatus);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", refreshPendingStatus);
      window.removeEventListener("focus", refreshPendingStatus);
    };
  }, [match.id]);

  function applyDefault(nextMode, winner = defaultWinner) {
    setSheetMode(nextMode);
    if (nextMode === "played") {
      setMessage("");
      return;
    }
    const score = nextMode === "default_5" ? "5" : "3";
    setDefaultScore(score);
    setDefaultWinner(winner);
    setHomeGoals(winner === "home" ? score : "0");
    setAwayGoals(winner === "away" ? score : "0");
    setMessage("Marcador por default aplicado. Puedes conservar eventos reales solo para estadisticas de jugadores.");
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      setWakeLockStatus("unsupported");
      setMessage("Este dispositivo no permite mantener la pantalla activa desde la PWA. Puedes aumentar temporalmente el bloqueo automatico desde ajustes.");
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      setWakeLockStatus("active");
      sentinel.addEventListener("release", () => {
        wakeLockRef.current = null;
        setWakeLockStatus("released");
      });
      setMessage("Pantalla activa durante el partido mientras el sistema lo permita.");
    } catch {
      wakeLockRef.current = null;
      setWakeLockStatus("rejected");
      setMessage("El sistema desactivo o rechazo el modo de pantalla activa. Puedes ajustar el bloqueo automatico del telefono.");
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release?.();
    } catch {
      // El navegador puede liberar el wake lock antes de que intentemos cerrarlo.
    } finally {
      wakeLockRef.current = null;
    }
  }

  function adjustScore(teamId, delta) {
    const setter = teamId === match.homeTeamId ? setHomeGoals : setAwayGoals;
    setter((value) => String(Math.max(0, Number(value || 0) + delta)));
  }

  function isGoalEventType(type) {
    return type === "goal" || type === "own_goal";
  }

  function getCurrentEventPeriod() {
    if (captureMode === "live" && livePeriod >= 3) return MATCH_EVENT_PERIODS.EXTRA_TIME;
    return MATCH_EVENT_PERIODS.REGULAR;
  }

  function getExtraTimeGoalSummary(eventList = events) {
    return eventList.reduce((summary, eventItem) => {
      if (eventItem.period !== MATCH_EVENT_PERIODS.EXTRA_TIME || !isGoalEventType(eventItem.type)) return summary;
      if (eventItem.teamId === match.homeTeamId) return { ...summary, home: summary.home + 1 };
      if (eventItem.teamId === match.awayTeamId) return { ...summary, away: summary.away + 1 };
      return summary;
    }, { home: 0, away: 0 });
  }

  function getPenaltyShootoutSummary() {
    return {
      home: penaltiesEnabled ? penaltyHomeGoals : "",
      away: penaltiesEnabled ? penaltyAwayGoals : ""
    };
  }

  function buildDraftPayload() {
    return {
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeGoals,
      awayGoals,
      extraTimeEnabled,
      penaltiesEnabled,
      extraTimeHomeGoals,
      extraTimeAwayGoals,
      penaltyHomeGoals,
      penaltyAwayGoals,
      sheetMode,
      defaultWinner,
      defaultScore,
      observations,
      events,
      homeCaptainPin,
      awayCaptainPin,
      sessionId,
      liveStarted,
      livePeriod,
      liveDuration,
      extraTimeDuration,
      liveElapsedSeconds,
      liveAlerted,
      liveTimer,
      captureMode,
      batterySaver,
      signatureIssue: reportState?.report?.payload?.signatureIssue || null
    };
  }

  function getCaptureMode() {
    return captureMode;
  }

  function getReportSignatureIssue(report = reportState?.report) {
    const payload = report?.payload && typeof report.payload === "object" ? report.payload : null;
    return payload?.signatureIssue && typeof payload.signatureIssue === "object" ? payload.signatureIssue : null;
  }

  function canPublishPreliminaryReport() {
    const report = reportState?.report || null;
    if (!report || ["finalized", "published"].includes(report.status)) return false;
    return Boolean(reportState.readyToFinalize || reportState.readyToPublish || getReportSignatureIssue(report)?.status === "pending_admin_attention");
  }

  async function persistLiveDraft(nextDraft = buildDraftPayload(), options = {}) {
    try {
      await saveLiveMatchState({
        matchId: match.id,
        refereeId: match.refereeUserId || "",
        leagueId: match.leagueId || "",
        tournamentId: match.competitionId || "",
        currentPeriod: nextDraft.liveTimer?.currentPeriod || periodNumberToKey(nextDraft.livePeriod),
        timerStatus: nextDraft.liveTimer?.timerStatus || (nextDraft.liveStarted ? LIVE_TIMER_STATUSES.PAUSED : LIVE_TIMER_STATUSES.NOT_STARTED),
        accumulatedSeconds: calculateElapsedSeconds(nextDraft.liveTimer || liveTimer),
        periodStartedAt: nextDraft.liveTimer?.periodStartedAt || null,
        score: { homeGoals: nextDraft.homeGoals, awayGoals: nextDraft.awayGoals },
        events: nextDraft.events || [],
        pendingOperations: pendingOperationCount,
        lastServerSync: options.synced ? new Date().toISOString() : "",
        version: nextDraft.liveTimer?.version || liveTimer.version,
        clientSessionId: nextDraft.liveTimer?.clientSessionId || liveTimer.clientSessionId,
        draft: nextDraft
      });
      setLiveStorageStatus("Guardado en este dispositivo");
    } catch (storageError) {
      setLiveStorageStatus(storageError.message || "No se pudo guardar en este dispositivo");
    }
  }

  async function recordLiveOperation(operationType, payload = {}, nextDraft = buildDraftPayload()) {
    try {
      const operation = await enqueueLiveOperation({
        matchId: match.id,
        refereeId: match.refereeUserId || "",
        operationType,
        payload,
        clientSessionId: nextDraft.liveTimer?.clientSessionId || liveTimer.clientSessionId,
        localSequenceNumber: Date.now()
      });
      const pendingOps = await listPendingLiveOperations(match.id);
      setPendingOperationCount(pendingOps.length);
      setSyncStatus(navigator.onLine ? "Guardado en este dispositivo" : "Sin conexion: guardado en este dispositivo");
      return operation;
    } catch (storageError) {
      setSyncStatus(storageError.message || "No se pudo registrar operacion local");
      return null;
    }
  }

  function persistDraftSilently() {
    const draftPayload = buildDraftPayload();
    writeRefereeDraft(draftKey, buildDraftPayload());
    persistLiveDraft(draftPayload);
  }

  function getLiveEventMinute() {
    if (!liveStarted) return "";
    const periodDuration = Number(liveDuration || 45);
    const extraDuration = Number(extraTimeDuration || 15);
    const elapsedMinute = Math.max(1, Math.ceil(Math.max(1, liveElapsedSeconds) / 60));
    if (livePeriod === 1 && elapsedMinute > periodDuration) {
      return { minute: elapsedMinute, minuteLabel: `${periodDuration}+${elapsedMinute - periodDuration}`, period: MATCH_EVENT_PERIODS.REGULAR };
    }
    if (livePeriod === 3) {
      const base = periodDuration * 2;
      const absoluteMinute = base + elapsedMinute;
      if (elapsedMinute > extraDuration) return { minute: absoluteMinute, minuteLabel: `${base + extraDuration}+${elapsedMinute - extraDuration}`, period: MATCH_EVENT_PERIODS.EXTRA_TIME };
      return { minute: absoluteMinute, minuteLabel: "", period: MATCH_EVENT_PERIODS.EXTRA_TIME };
    }
    if (livePeriod === 4) {
      const base = periodDuration * 2 + extraDuration;
      const absoluteMinute = base + elapsedMinute;
      if (elapsedMinute > extraDuration) return { minute: absoluteMinute, minuteLabel: `${base + extraDuration}+${elapsedMinute - extraDuration}`, period: MATCH_EVENT_PERIODS.EXTRA_TIME };
      return { minute: absoluteMinute, minuteLabel: "", period: MATCH_EVENT_PERIODS.EXTRA_TIME };
    }
    const absoluteMinute = livePeriod === 2 ? periodDuration + elapsedMinute : elapsedMinute;
    if (livePeriod === 2 && absoluteMinute > periodDuration * 2) {
      return { minute: absoluteMinute, minuteLabel: `${periodDuration * 2}+${absoluteMinute - (periodDuration * 2)}`, period: MATCH_EVENT_PERIODS.REGULAR };
    }
    return { minute: absoluteMinute, minuteLabel: "", period: MATCH_EVENT_PERIODS.REGULAR };
  }

  function getLiveEventMinuteLabel() {
    if (!liveStarted) return "Manual";
    const minuteInfo = getLiveEventMinute();
    return minuteInfo.minuteLabel || String(minuteInfo.minute || "Manual");
  }

  function getLiveClockLabel() {
    const periodDuration = Number(liveDuration || 45);
    const extraDuration = Number(extraTimeDuration || 15);
    const elapsed = Math.floor(Math.max(0, liveElapsedSeconds) / 60);
    const seconds = Math.max(0, liveElapsedSeconds) % 60;
    const absoluteMinute = livePeriod === 4
      ? periodDuration * 2 + extraDuration + elapsed
      : livePeriod === 3
      ? periodDuration * 2 + elapsed
      : livePeriod === 2
      ? periodDuration + elapsed
      : elapsed;
    return `${String(absoluteMinute).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function getLiveFlowStepLabel() {
    if (!liveStarted) return "Prepartido";
    if (liveTimer.timerStatus === LIVE_TIMER_STATUSES.FINISHED) return "Partido finalizado";
    if (liveTimer.timerStatus === LIVE_TIMER_STATUSES.HALFTIME) {
      if (liveTimer.currentPeriod === LIVE_PERIODS.EXTRA_TIME_FIRST) return "Descanso T.E.";
      if (liveTimer.currentPeriod === LIVE_PERIODS.SECOND_HALF) return "Regular finalizado";
      return "Descanso";
    }
    return `${getLivePeriodName()} en curso`;
  }

  function getLivePeriodName() {
    return getLivePeriodLabel(liveTimer.currentPeriod);
  }

  function applyLiveTimer(nextTimer) {
    setLiveTimer(nextTimer);
    setLiveStarted(nextTimer.timerStatus !== LIVE_TIMER_STATUSES.NOT_STARTED);
    setLiveRunning(nextTimer.timerStatus === LIVE_TIMER_STATUSES.RUNNING);
    setLivePeriod(periodKeyToNumber(nextTimer.currentPeriod));
    setLiveElapsedSeconds(calculateElapsedSeconds(nextTimer));
    return nextTimer;
  }

  function buildSessionPayload(nextStatus = {}) {
    const captureMode = nextStatus.captureMode || getCaptureMode();
    return {
      sessionId,
      operationId: nextStatus.operationId || "",
      captureMode,
      period: nextStatus.period || getLivePeriodName(),
      clockState: {
        liveStarted: nextStatus.liveStarted ?? liveStarted,
        liveRunning: nextStatus.liveRunning ?? liveRunning,
        livePeriod: nextStatus.livePeriod ?? livePeriod,
        liveDuration,
        extraTimeDuration,
        liveElapsedSeconds: nextStatus.liveElapsedSeconds ?? liveElapsedSeconds,
        liveAlerted,
        liveTimer: nextStatus.liveTimer || liveTimer,
        currentPeriod: nextStatus.liveTimer?.currentPeriod || liveTimer.currentPeriod,
        timerStatus: nextStatus.liveTimer?.timerStatus || liveTimer.timerStatus,
        clientSessionId: liveTimer.clientSessionId,
        version: nextStatus.liveTimer?.version || liveTimer.version
      },
      metadata: {
        homeGoals,
        awayGoals,
        extraTimeEnabled,
        penaltiesEnabled,
        extraTimeHomeGoals,
        extraTimeAwayGoals,
        penaltyHomeGoals,
        penaltyAwayGoals,
        observations,
        events,
        sheetMode,
        savedFrom: "referee_portal"
      }
    };
  }

  async function startLiveMatch() {
    setSaving(true);
    setMessage("Iniciando partido...");
    const nextTimer = applyLiveTimer(startLivePeriod(liveTimer, LIVE_PERIODS.FIRST_HALF));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveStarted: true, liveRunning: true, livePeriod: 1, liveElapsedSeconds: 0 };
    await persistLiveDraft(nextDraft);
    const operation = await recordLiveOperation("start_first_half", { period: "1T" }, nextDraft);
    try {
      const response = await startRefereeMatchSession(authToken, match.id, buildSessionPayload({
        liveStarted: true,
        liveRunning: true,
        livePeriod: 1,
        liveElapsedSeconds: 0,
        period: "1T",
        liveTimer: nextTimer,
        operationId: operation?.operationId || ""
      }));
      if (response.session?.id) setSessionId(response.session.id);
      setLiveAlerted(false);
      if (operation?.operationId) await markLiveOperationSynced(operation.operationId);
      setSyncStatus("Sincronizado con LIGATEC");
      setMessage("Cronometro iniciado. Los eventos tomaran el minuto automaticamente.");
    } catch (sessionError) {
      if (operation?.operationId) await markLiveOperationFailed(operation.operationId);
      setSyncStatus("Guardado en este dispositivo");
      setMessage(`${sessionError.message || "No se pudo iniciar el partido en servidor."} El cronometro quedo guardado en este dispositivo.`);
    } finally {
      setSaving(false);
    }
  }

  function startLiveMatchLocalOnly() {
    const nextTimer = applyLiveTimer(startLivePeriod(liveTimer, LIVE_PERIODS.FIRST_HALF));
    setLiveAlerted(false);
    persistLiveDraft({ ...buildDraftPayload(), liveTimer: nextTimer, liveStarted: true, liveRunning: true, livePeriod: 1, liveElapsedSeconds: 0 });
    recordLiveOperation("start_first_half", { period: "1T" });
    setMessage("Cronometro iniciado. Los eventos tomaran el minuto automaticamente.");
  }

  function pauseLiveClock() {
    const nextTimer = applyLiveTimer(pauseLiveTimer(liveTimer));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: false, liveElapsedSeconds: calculateElapsedSeconds(nextTimer) };
    persistLiveDraft(nextDraft);
    recordLiveOperation("pause_clock", { period: getLivePeriodName(), elapsedSeconds: calculateElapsedSeconds(nextTimer) }, nextDraft);
    setMessage("Cronometro pausado.");
  }

  async function resumeLiveClock() {
    setSaving(true);
    const nextTimer = applyLiveTimer(resumeLiveTimer(liveTimer));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: true };
    await persistLiveDraft(nextDraft);
    const operation = await recordLiveOperation("resume_clock", { period: getLivePeriodName() }, nextDraft);
    try {
      const response = await resumeRefereeMatchSession(authToken, match.id, buildSessionPayload({ liveRunning: true, liveTimer: nextTimer, operationId: operation?.operationId || "" }));
      if (response.session?.id) setSessionId(response.session.id);
      if (operation?.operationId) await markLiveOperationSynced(operation.operationId);
      setSyncStatus("Sincronizado con LIGATEC");
      setMessage("Cronometro reanudado.");
    } catch (sessionError) {
      if (operation?.operationId) await markLiveOperationFailed(operation.operationId);
      setSyncStatus("Guardado en este dispositivo");
      setMessage(`${sessionError.message || "No se pudo sincronizar la reanudacion."} El reloj continuara localmente.`);
    } finally {
      setSaving(false);
    }
  }

  function startSecondHalf() {
    if (!window.confirm("¿Iniciar segundo tiempo? El reloj continuara desde el minuto final del primer periodo.")) return;
    const nextTimer = applyLiveTimer(startLivePeriod(liveTimer, LIVE_PERIODS.SECOND_HALF));
    setLiveAlerted(false);
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveStarted: true, liveRunning: true, livePeriod: 2, liveElapsedSeconds: 0 };
    persistLiveDraft(nextDraft);
    recordLiveOperation("start_second_half", { period: "2T" }, nextDraft);
    setMessage("Segundo tiempo iniciado.");
  }

  function finishRegularTime() {
    if (!window.confirm("¿Finalizar tiempo regular? El reloj quedara detenido y podras iniciar tiempo extra o cerrar el partido.")) return;
    const nextTimer = applyLiveTimer(finishLivePeriod(liveTimer, LIVE_PERIODS.SECOND_HALF));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: false, liveElapsedSeconds: calculateElapsedSeconds(nextTimer) };
    persistLiveDraft(nextDraft);
    recordLiveOperation("finish_regular_time", { elapsedSeconds: calculateElapsedSeconds(nextTimer) }, nextDraft);
    setMessage("Tiempo regular finalizado. Puedes iniciar 1TE o finalizar el partido.");
  }

  function startExtraTime() {
    if (!window.confirm("¿Iniciar primer tiempo extra? Usa esta opcion solo para liguilla o finales cuando el reglamento lo indique.")) return;
    setExtraTimeEnabled(true);
    const nextTimer = applyLiveTimer(startLivePeriod(liveTimer, LIVE_PERIODS.EXTRA_TIME_FIRST));
    setLiveAlerted(false);
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, extraTimeEnabled: true, liveStarted: true, liveRunning: true, livePeriod: 3, liveElapsedSeconds: 0 };
    persistLiveDraft(nextDraft);
    recordLiveOperation("start_extra_time_first", { period: "1TE" }, nextDraft);
    setMessage("Primer tiempo extra iniciado.");
  }

  function startSecondExtraTime() {
    if (!window.confirm("¿Iniciar segundo tiempo extra?")) return;
    const nextTimer = applyLiveTimer(startLivePeriod(liveTimer, LIVE_PERIODS.EXTRA_TIME_SECOND));
    setLiveAlerted(false);
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveStarted: true, liveRunning: true, livePeriod: 4, liveElapsedSeconds: 0 };
    persistLiveDraft(nextDraft);
    recordLiveOperation("start_extra_time_second", { period: "2TE" }, nextDraft);
    setMessage("Segundo tiempo extra iniciado.");
  }

  function finishFirstExtraTime() {
    if (!window.confirm("¿Finalizar primer tiempo extra?")) return;
    const nextTimer = applyLiveTimer(finishLivePeriod(liveTimer, LIVE_PERIODS.EXTRA_TIME_FIRST));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: false, liveElapsedSeconds: calculateElapsedSeconds(nextTimer) };
    persistLiveDraft(nextDraft);
    recordLiveOperation("finish_extra_time_first", { elapsedSeconds: calculateElapsedSeconds(nextTimer) }, nextDraft);
    setMessage("Primer tiempo extra finalizado. Puedes iniciar 2TE.");
  }

  function finishFirstHalf() {
    if (!window.confirm("¿Finalizar primer tiempo? Podras revisar eventos e iniciar el segundo tiempo despues.")) return;
    const nextTimer = applyLiveTimer(finishLivePeriod(liveTimer, LIVE_PERIODS.HALFTIME));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: false, liveElapsedSeconds: calculateElapsedSeconds(nextTimer) };
    persistLiveDraft(nextDraft);
    recordLiveOperation("finish_first_half", { elapsedSeconds: calculateElapsedSeconds(nextTimer) }, nextDraft);
    setMessage("Primer tiempo finalizado. Revisa eventos y cuando corresponda inicia el segundo tiempo.");
  }

  async function finishLiveMatch() {
    if (!window.confirm("¿Finalizar partido? Despues revisa el acta y captura PIN de capitanes para publicarla.")) return;
    setSaving(true);
    const nextTimer = applyLiveTimer(finishLivePeriod(liveTimer, LIVE_PERIODS.FINISHED));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: false, liveElapsedSeconds: calculateElapsedSeconds(nextTimer) };
    await persistLiveDraft(nextDraft);
    const operation = await recordLiveOperation("finish_match", { elapsedSeconds: calculateElapsedSeconds(nextTimer) }, nextDraft);
    try {
      const response = await finishRefereeMatchSession(authToken, match.id, {
        ...buildSessionPayload({ liveRunning: false, liveTimer: nextTimer, operationId: operation?.operationId || "" }),
        reportId: operation?.operationId ? `match-report-${operation.operationId}` : "",
        homeGoals,
        awayGoals,
        reportPayload: nextDraft
      });
      if (response.session?.id) setSessionId(response.session.id);
      if (operation?.operationId) await markLiveOperationSynced(operation.operationId);
      setSyncStatus("Sincronizado con LIGATEC");
      releaseWakeLock();
      writeRefereeDraft(draftKey, { ...nextDraft, sessionId: response.session?.id || sessionId });
      const nextReportState = await fetchRefereeMatchReport(authToken, match.id).catch(() => (
        response.report
          ? { report: response.report, signatures: [], homeSigned: false, awaySigned: false, readyToFinalize: false }
          : null
      ));
      if (nextReportState) setReportState(nextReportState);
      setMessage("Partido finalizado. Revisa el acta, agrega observaciones y solicita las firmas de capitanes.");
      onSaved(response.payload, { draft: true, keepOpen: true, message: "" });
    } catch (sessionError) {
      if (operation?.operationId) await markLiveOperationFailed(operation.operationId);
      setSyncStatus("Guardado en este dispositivo");
      setMessage(`${sessionError.message || "No se pudo finalizar el partido en servidor."} El cierre quedo guardado en este dispositivo pendiente de sincronizar.`);
    } finally {
      setSaving(false);
    }
  }

  function createEventFromSelection(type, teamId, playerId, minuteInfo = getLiveEventMinute()) {
    setMessage("");
    const now = Date.now();
    if (lastEventRef.current.type === type && lastEventRef.current.teamId === teamId && lastEventRef.current.playerId === playerId && now - lastEventRef.current.at < 800) {
      setMessage("Evento ignorado para evitar duplicado por doble toque. Si fue intencional, vuelve a tocar.");
      return;
    }
    lastEventRef.current = { type, teamId, playerId, at: now };
    const nextEvent = {
      ...createEvent(match, type, teamId, minuteInfo),
      playerId,
      period: minuteInfo?.period || getCurrentEventPeriod()
    };
    if (sheetMode === "played" && isGoalEventType(type)) adjustScore(teamId, 1);
    setEvents((current) => {
      const createsDoubleYellow = type === "yellow" && playerId && current.some((eventItem) => (
        eventItem.type === "yellow" &&
        eventItem.playerId === playerId &&
        eventItem.teamId === teamId
      ));
      const nextEvents = normalizeDoubleYellowDraftEvents([...current, nextEvent]);
      const nextDraft = { ...buildDraftPayload(), events: nextEvents };
      persistLiveDraft(nextDraft);
      recordLiveOperation("add_event", { event: nextEvent }, nextDraft);
      if (type === "red") {
        setPendingRedReasonEventId(nextEvent.id);
        setMessage("Roja directa registrada. Completa el motivo para que el acta quede lista.");
      } else {
        setMessage(createsDoubleYellow
          ? "Segunda amarilla registrada: se agrego roja por doble amarilla en el mismo minuto."
          : `${getEventLabel(type)} registrado. Guardado en este dispositivo.`);
      }
      return nextEvents;
    });
  }

  function addEvent(type, teamId) {
    createEventFromSelection(type, teamId, "", getLiveEventMinute());
  }

  function openEventComposer(type, teamId) {
    setMessage("");
    setEventComposer({
      type,
      teamId,
      minuteInfo: getLiveEventMinute()
    });
    setEventComposerQuery("");
    setEventComposerFilter("all");
  }

  function cancelEventComposer() {
    setEventComposer(null);
    setEventComposerQuery("");
    setEventComposerFilter("all");
  }

  function getEventComposerPlayers() {
    if (!eventComposer) return [];
    const players = getPlayersForEvent(match, { type: eventComposer.type, teamId: eventComposer.teamId });
    const query = normalizeSearch(eventComposerQuery);
    return players.filter((player) => {
      if (eventComposerFilter === "captains" && !player.isCaptain) return false;
      if (eventComposerFilter === "numbered" && !player.number) return false;
      if (!query) return true;
      return normalizeSearch(`#${player.number || ""} ${player.name}`).includes(query);
    });
  }

  function confirmEventComposer(player) {
    if (!eventComposer) return;
    createEventFromSelection(eventComposer.type, eventComposer.teamId, player.id, eventComposer.minuteInfo);
    cancelEventComposer();
  }

  function updateEvent(eventId, field, value) {
    const currentEvent = events.find((event) => event.id === eventId);
    if (!currentEvent) return;
    if (currentEvent.lockedType && field === "type") return;
    if (currentEvent.lockedTeamId && field === "teamId") return;
    const wasGoal = isGoalEventType(currentEvent.type);
    const nextType = field === "type" ? value : currentEvent.type;
    const nextEvent = {
      ...currentEvent,
      [field]: value,
      playerId: field === "type" || field === "teamId" ? "" : field === "playerId" ? value : currentEvent.playerId,
      minuteLabel: field === "minute" ? "" : currentEvent.minuteLabel,
      suspensionMatches: 0,
      suspensionIndefinite: false,
      disciplinaryPending: nextType === "red",
      redReasonMode: field === "type" && value !== "red" ? "" : currentEvent.redReasonMode || "",
      reason: field === "type" && value !== "red" ? "" : field === "reason" ? value : currentEvent.reason
    };
    const isGoal = isGoalEventType(nextEvent.type);
    if (sheetMode === "played" && wasGoal !== isGoal) adjustScore(nextEvent.teamId, isGoal ? 1 : -1);
    setEvents((current) => normalizeDoubleYellowDraftEvents(current.map((event) => (event.id === eventId ? nextEvent : event))));
  }

  function updateRedReason(eventId, reasonValue) {
    setEvents((current) => normalizeDoubleYellowDraftEvents(current.map((eventItem) => {
      if (eventItem.id !== eventId || eventItem.type !== "red") return eventItem;
      if (reasonValue === "__other__") {
        return { ...eventItem, redReasonMode: "other", reason: "" };
      }
      return { ...eventItem, redReasonMode: "preset", reason: reasonValue };
    })));
  }

  function updatePlayerSearch(eventId, value) {
    setPlayerSearches((current) => ({ ...current, [eventId]: value }));
  }

  function selectEventPlayer(eventId, player) {
    updateEvent(eventId, "playerId", player.id);
    setPlayerSearches((current) => ({
      ...current,
      [eventId]: `#${player.number || "-"} ${player.name}`
    }));
  }

  function removeEvent(eventId) {
    if (!window.confirm("¿Cancelar este evento? Se conservara registro local para auditoria hasta sincronizar.")) return;
    const eventToRemove = events.find((event) => event.id === eventId);
    if (sheetMode === "played" && eventToRemove && isGoalEventType(eventToRemove.type)) adjustScore(eventToRemove.teamId, -1);
    setEvents((current) => {
      const nextEvents = normalizeDoubleYellowDraftEvents(current.filter((event) => event.id !== eventId));
      const nextDraft = { ...buildDraftPayload(), events: nextEvents };
      persistLiveDraft(nextDraft);
      recordLiveOperation("cancel_event", { eventId, event: eventToRemove || null }, nextDraft);
      return nextEvents;
    });
    setPlayerSearches((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
  }

  function getEventPlayerName(eventItem) {
    const players = getPlayersForEvent(match, eventItem);
    return players.find((player) => player.id === eventItem.playerId)?.name || "Jugador pendiente";
  }

  async function saveDraft(options = {}) {
    setSaving(true);
    setMessage("Guardando acta temporal...");
    const pendingBeforeSync = await listPendingLiveOperations(match.id).catch(() => []);
    try {
      const sessionPayload = buildSessionPayload();
      const response = pendingBeforeSync.length
        ? await syncRefereeLiveState(authToken, match.id, {
          ...sessionPayload,
          status: "temporarily_saved",
          operations: pendingBeforeSync
        })
        : await saveRefereeMatchSession(authToken, match.id, sessionPayload);
      if (response.session?.id) setSessionId(response.session.id);
      writeRefereeDraft(draftKey, { ...buildDraftPayload(), sessionId: response.session?.id || sessionId });
      await persistLiveDraft({ ...buildDraftPayload(), sessionId: response.session?.id || sessionId }, { synced: true });
      await Promise.all(pendingBeforeSync.map((operation) => markLiveOperationSynced(operation.operationId)));
      setPendingOperationCount(0);
      setSyncStatus("Sincronizado con LIGATEC");
      onSaved(options.keepOpen ? null : response.payload || null, {
        draft: true,
        keepOpen: Boolean(options.keepOpen),
        message: options.message || "Acta guardada temporalmente. Puedes continuar editandola desde partidos pendientes."
      });
    } catch (sessionError) {
      writeRefereeDraft(draftKey, buildDraftPayload());
      await persistLiveDraft(buildDraftPayload());
      setMessage(`${sessionError.message || "No se pudo guardar en servidor."} Se conservo una copia local.`);
      setSyncStatus("Guardado en este dispositivo");
    } finally {
      setSaving(false);
    }
  }

  async function suspendMatch() {
    const reason = window.prompt("Motivo de suspension del partido");
    if (!reason?.trim()) return;
    setSaving(true);
    const nextTimer = applyLiveTimer(suspendLiveTimer(liveTimer, reason));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: false, liveElapsedSeconds: calculateElapsedSeconds(nextTimer) };
    await persistLiveDraft(nextDraft);
    const operation = await recordLiveOperation("suspend_match", { reason, elapsedSeconds: calculateElapsedSeconds(nextTimer) }, nextDraft);
    try {
      const response = await suspendRefereeMatchSession(authToken, match.id, {
        ...buildSessionPayload({ liveRunning: false, liveTimer: nextTimer, operationId: operation?.operationId || "" }),
        reason
      });
      if (response.session?.id) setSessionId(response.session.id);
      if (operation?.operationId) await markLiveOperationSynced(operation.operationId);
      setSyncStatus("Sincronizado con LIGATEC");
      onSaved(response.payload || null, { draft: true, message: "Partido suspendido. Podra reanudarse o resolverse desde administracion." });
    } catch (sessionError) {
      if (operation?.operationId) await markLiveOperationFailed(operation.operationId);
      setSyncStatus("Guardado en este dispositivo");
      setMessage(`${sessionError.message || "No se pudo suspender el partido en servidor."} La suspension quedo guardada en este dispositivo.`);
    } finally {
      setSaving(false);
    }
  }

  async function syncPreliminaryReportDraft({ silent = false, payloadOverrides = {} } = {}) {
    if (!reportState?.report) return reportState;
    if (["finalized", "published"].includes(reportState.report.status)) return reportState;
    const nextDraft = { ...buildDraftPayload(), ...payloadOverrides };
    const nextReportState = await updateRefereeMatchReportDraft(authToken, match.id, {
      reportId: reportState.report.id,
      sessionId,
      captureMode,
      reportPayload: nextDraft,
      homeGoals,
      awayGoals
    });
    setReportState(nextReportState);
    writeRefereeDraft(draftKey, { ...nextDraft, sessionId });
    if (nextReportState.payload) onSaved(nextReportState.payload, { draft: true, keepOpen: true, message: "" });
    if (!silent) setMessage("Revision del acta guardada. Ya puedes continuar con las firmas.");
    return nextReportState;
  }

  async function savePreliminaryReportReview() {
    setSaving(true);
    setMessage("Guardando revision del acta...");
    try {
      const nextReportState = await syncPreliminaryReportDraft({ silent: true });
      clearRefereeDraft(draftKey);
      await clearLiveMatchState(match.id);
      releaseWakeLock();
      onSaved(nextReportState?.payload || null, {
        draft: true,
        returnHome: true,
        message: "Acta preliminar guardada. Sigue pendiente de firmas y no se publicara hasta tocar Publicar acta."
      });
    } catch (syncError) {
      setMessage(syncError.message || "No se pudo guardar la revision del acta.");
    } finally {
      setSaving(false);
    }
  }

  async function reportSignatureIssue(reason) {
    if (!reportState?.report) return;
    const reasonLabel = reason?.label || "Problema con firma";
    const timestamp = new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date());
    const issueNote = `Incidencia de firma: ${reasonLabel}. Registrado por el arbitro ${timestamp}.`;
    const nextObservations = [observations, issueNote].filter(Boolean).join("\n");
    const signatureIssue = {
      id: `signature-issue-${Date.now()}`,
      reasonId: reason?.id || "other",
      reasonLabel,
      status: "pending_admin_attention",
      reportedAt: new Date().toISOString(),
      reportedBy: "referee",
      homeSigned: Boolean(reportState.homeSigned),
      awaySigned: Boolean(reportState.awaySigned),
      online: typeof navigator === "undefined" ? true : navigator.onLine
    };
    setSaving(true);
    setMessage("Guardando incidencia de firma...");
    try {
      setObservations(nextObservations);
      const nextReportState = await syncPreliminaryReportDraft({
        silent: true,
        payloadOverrides: {
          observations: nextObservations,
          signatureIssue
        }
      });
      onSaved(nextReportState?.payload || null, {
        draft: true,
        keepOpen: true,
        message: ""
      });
      setMessage("Incidencia de firma guardada. Puedes publicar el acta desde esta misma pantalla; cualquier inconformidad se corrige despues desde administracion.");
    } catch (issueError) {
      setMessage(issueError.message || "No se pudo guardar la incidencia de firma.");
    } finally {
      setSaving(false);
    }
  }

  async function signPreliminaryReport(teamSide) {
    const pin = teamSide === "home" ? homeCaptainPin : awayCaptainPin;
    const teamName = teamSide === "home" ? match.homeTeamName : match.awayTeamName;
    if (normalizePin(pin).length < 4) {
      setMessage(`Captura el PIN del capitan de ${teamName}.`);
      return;
    }

    setSaving(true);
    setMessage(`Firmando acta de ${teamName}...`);
    try {
      await syncPreliminaryReportDraft({ silent: true });
      const nextReportState = await signRefereeMatchReport(authToken, match.id, {
        teamSide,
        pin: normalizePin(pin)
      });
      setReportState(nextReportState);
      signatureSnapshotRef.current = {
        initialized: true,
        homeSigned: Boolean(nextReportState.homeSigned),
        awaySigned: Boolean(nextReportState.awaySigned)
      };
      if (nextReportState.payload) onSaved(nextReportState.payload, { draft: true, keepOpen: true, message: "" });
      setMessage(`Firma de ${teamName} registrada correctamente.`);
    } catch (signError) {
      setMessage(signError.message || "No se pudo firmar el acta.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizePreliminaryReport() {
    const signatureIssue = getReportSignatureIssue();
    const publishableByIssue = signatureIssue?.status === "pending_admin_attention";
    if (!canPublishPreliminaryReport()) {
      setMessage("Se requiere firma de ambos capitanes o una incidencia de firma documentada antes de publicar el acta.");
      return;
    }
    const confirmationText = publishableByIssue
      ? `¿Publicar acta con incidencia de firma?\n\nMotivo: ${signatureIssue.reasonLabel || "Problema con firma"}\n\nEl resultado quedara oficial. Si hay inconformidad o ajuste posterior, se resolvera desde el panel admin de liga.`
      : "¿Finalizar acta firmada y publicar resultado oficial? Se actualizaran marcador, eventos, tabla, goleo y disciplina en la parte publica.";
    if (!window.confirm(confirmationText)) return;

    setSaving(true);
    setMessage("Finalizando acta...");
    try {
      await syncPreliminaryReportDraft({ silent: true });
      const nextReportState = await finalizeRefereeMatchReport(authToken, match.id);
      setReportState(nextReportState);
      clearRefereeDraft(draftKey);
      await clearLiveMatchState(match.id);
      releaseWakeLock();
      onSaved(nextReportState.payload, {
        draft: true,
        message: publishableByIssue
          ? "Acta publicada con incidencia de firma documentada."
          : "Acta firmada, finalizada y publicada en la parte publica."
      });
    } catch (finalizeError) {
      setMessage(finalizeError.message || "No se pudo finalizar el acta.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSheet(event) {
    event.preventDefault();
    setMessage("");
    const cleanEvents = events.filter((item) => item.playerId);
    const isDefault = sheetMode !== "played";
    if (events.some((item) => !item.playerId)) {
      setMessage("Todos los eventos del acta deben tener jugador seleccionado.");
      return;
    }
    if (!isDefault) {
      const homeEventGoals = cleanEvents.filter((item) => ["goal", "own_goal"].includes(item.type) && item.teamId === match.homeTeamId).length;
      const awayEventGoals = cleanEvents.filter((item) => ["goal", "own_goal"].includes(item.type) && item.teamId === match.awayTeamId).length;
      if (homeEventGoals !== Number(homeGoals || 0) || awayEventGoals !== Number(awayGoals || 0)) {
        setMessage(`Revisa goleadores: marcador ${homeGoals}-${awayGoals}, eventos ${homeEventGoals}-${awayEventGoals}.`);
        return;
      }
    }
    const redWithoutReason = cleanEvents.find((item) => item.type === "red" && !String(item.reason || "").trim());
    if (redWithoutReason) {
      setMessage("Toda tarjeta roja debe tener motivo.");
      return;
    }
    const requiresDigitalSignature = getCaptureMode() === "live";
    if (requiresDigitalSignature && !isDefault && match.homePinRequired && normalizePin(homeCaptainPin).length < 4) {
      setMessage(`Captura el PIN del capitan de ${match.homeTeamName}.`);
      return;
    }
    if (requiresDigitalSignature && !isDefault && match.awayPinRequired && normalizePin(awayCaptainPin).length < 4) {
      setMessage(`Captura el PIN del capitan de ${match.awayTeamName}.`);
      return;
    }

    const confirmed = window.confirm(
      `¿Finalizar y publicar acta?\n\nPartido: ${match.homeTeamName} vs ${match.awayTeamName}\nMarcador reportado: ${homeGoals}-${awayGoals}\nEventos: ${cleanEvents.length}\nModo: ${requiresDigitalSignature ? "en vivo con firma digital" : "manual sin firma digital"}\nPIN local: ${requiresDigitalSignature && !isDefault && match.homePinRequired ? "capturado" : "no requerido"}\nPIN visitante: ${requiresDigitalSignature && !isDefault && match.awayPinRequired ? "capturado" : "no requerido"}\n\nEl resultado se publicara inmediatamente en la parte publica. Las rojas quedaran sujetas a comision disciplinaria.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const extraTimeSummary = getExtraTimeGoalSummary(cleanEvents);
      const penaltySummary = getPenaltyShootoutSummary();
      const nextPayload = await saveRefereeMatchSheet(authToken, match.id, {
        captureMode: getCaptureMode(),
        homeGoals,
        awayGoals,
        extraTimeHomeGoals: extraTimeEnabled ? extraTimeSummary.home : "",
        extraTimeAwayGoals: extraTimeEnabled ? extraTimeSummary.away : "",
        penaltyHomeGoals: penaltiesEnabled ? penaltySummary.home : "",
        penaltyAwayGoals: penaltiesEnabled ? penaltySummary.away : "",
        observations,
        status: isDefault ? "walkover" : "finished",
        resolutionType: isDefault ? "no_show" : penaltiesEnabled ? "penalties" : extraTimeEnabled ? "extra_time" : "normal",
        resolutionNote: isDefault ? `Default administrativo ${defaultScore}-0. Eventos capturados solo para estadisticas individuales.` : "",
        approvals: {
          homePin: requiresDigitalSignature ? normalizePin(homeCaptainPin) : "",
          awayPin: requiresDigitalSignature ? normalizePin(awayCaptainPin) : ""
        },
        events: cleanEvents.map((item) => ({
          type: item.type,
          teamId: item.teamId,
          playerId: item.playerId,
          minute: item.minute,
          minuteLabel: item.minuteLabel || "",
          period: item.period || MATCH_EVENT_PERIODS.REGULAR,
          cardDetail: item.cardDetail || "",
          countsForAccumulation: item.type === "yellow" ? item.countsForAccumulation !== false && !item.excludedFromAccumulation : undefined,
          excludedFromAccumulation: item.type === "yellow" ? item.countsForAccumulation === false || Boolean(item.excludedFromAccumulation) : undefined,
          sourceYellowCardMinutes: Array.isArray(item.sourceYellowCardMinutes) ? item.sourceYellowCardMinutes : undefined,
          suspensionMatches: 0,
          suspensionIndefinite: false,
          disciplinaryPending: item.type === "red",
          reason: item.type === "red" ? item.reason : ""
        }))
      });
      clearRefereeDraft(draftKey);
      onSaved(nextPayload);
    } catch (saveError) {
      setMessage(saveError.message || "No se pudo guardar el acta.");
    } finally {
      setSaving(false);
    }
  }

  function renderEventComposer() {
    if (!eventComposer) return null;
    const eventTeamName = eventComposer.teamId === match.homeTeamId ? match.homeTeamName : match.awayTeamName;
    const playerTeamName = eventComposer.type === "own_goal"
      ? eventComposer.teamId === match.homeTeamId ? match.awayTeamName : match.homeTeamName
      : eventTeamName;
    const players = getEventComposerPlayers();
    const filters = [
      ["all", "Todos"],
      ["captains", "Capitanes"],
      ["numbered", "Con numero"]
    ];
    return (
      <section className="referee-event-composer" aria-label="Seleccionar jugador del evento">
        <div className="referee-event-composer-top">
          <button type="button" onClick={cancelEventComposer} aria-label="Volver">‹</button>
          <div>
            <span>{getEventIcon(eventComposer.type)}</span>
            <strong>{getEventLabel(eventComposer.type)}</strong>
            <small>{eventComposer.type === "own_goal" ? `A favor de ${eventTeamName}` : eventTeamName}</small>
          </div>
        </div>
        <div className="referee-event-composer-meta">
          <span>{getMatchEventPeriodLabel(eventComposer.minuteInfo?.period || getCurrentEventPeriod())}</span>
          <span>Min {eventComposer.minuteInfo?.minuteLabel || eventComposer.minuteInfo?.minute || "Manual"}</span>
        </div>
        <label className="referee-event-composer-search">
          Buscar jugador de {playerTeamName}
          <input
            value={eventComposerQuery}
            onChange={(event) => setEventComposerQuery(event.target.value)}
            placeholder="Numero, nombre o apellido"
          />
        </label>
        <div className="referee-event-composer-filters" role="tablist" aria-label="Filtros de jugadores">
          {filters.map(([value, label]) => (
            <button className={eventComposerFilter === value ? "active" : ""} key={value} type="button" onClick={() => setEventComposerFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="referee-event-composer-list">
          {players.map((player) => (
            <button key={player.id} type="button" onClick={() => confirmEventComposer(player)}>
              <b>{player.number || "-"}</b>
              <span>{player.name}</span>
              {player.isCaptain && <small>Capitan</small>}
            </button>
          ))}
          {!players.length && <p>No hay jugadores que coincidan con la busqueda.</p>}
        </div>
      </section>
    );
  }

  function renderEventRow(eventItem, index, isLatest = false) {
    const players = getPlayersForEvent(match, eventItem);
    const eventTeam = eventItem.teamId === match.homeTeamId ? match.homeTeamName : match.awayTeamName;
    const playerTeam = eventItem.type === "own_goal"
      ? eventItem.teamId === match.homeTeamId ? match.awayTeamName : match.homeTeamName
      : eventTeam;
    const eventSide = eventItem.teamId === match.homeTeamId ? "home" : "away";
    const playerSearch = playerSearches[eventItem.id] || "";
    const playerQuery = normalizeSearch(playerSearch);
    const filteredPlayers = players.filter((player) => {
      if (!playerQuery) return true;
      return normalizeSearch(`#${player.number || ""} ${player.name}`).includes(playerQuery);
    });
    const visiblePlayers = filteredPlayers.length ? filteredPlayers : players;
    const suggestedPlayers = playerQuery ? filteredPlayers.slice(0, 5) : [];
    const isDoubleYellowRed = eventItem.type === "red" && eventItem.cardDetail === "double_yellow";
    const selectedRedReason = RED_CARD_REASON_OPTIONS.includes(eventItem.reason)
      ? eventItem.reason
      : eventItem.redReasonMode === "other" || eventItem.reason
      ? "__other__"
      : "";
    const showCustomRedReason = eventItem.type === "red" && !isDoubleYellowRed && selectedRedReason === "__other__";
    return (
      <article className={`referee-event-row event-side-${eventSide} event-kind-${eventItem.type} ${isLatest ? "is-latest" : ""} ${eventItem.type === "red" && !eventItem.reason ? "needs-reason" : ""}`} key={eventItem.id}>
        <div className="referee-event-row-head">
          <div>
            <strong>#{index + 1} <span className="event-icon" aria-hidden="true">{getEventIcon(eventItem.type, eventItem)}</span>{getEventLabel(eventItem.type, eventItem)}</strong>
            <span>{eventItem.type === "own_goal" ? `A favor de ${eventTeam}` : eventTeam}</span>
          </div>
          <button className="danger" type="button" onClick={() => removeEvent(eventItem.id)}>Quitar</button>
        </div>
        <div className="referee-locked-team">
          <span>Evento</span>
          <strong><span className="event-icon" aria-hidden="true">{getEventIcon(eventItem.type, eventItem)}</span>{getEventLabel(eventItem.type, eventItem)}</strong>
          <small>Fijo segun el boton elegido</small>
        </div>
        <div className="referee-locked-team">
          <span>{eventItem.type === "own_goal" ? "Equipo que recibe el gol" : "Equipo del evento"}</span>
          <strong>{eventTeam}</strong>
          <small>Fijo segun el boton elegido</small>
        </div>
        <label className="referee-player-search">Buscar jugador
          <input
            value={playerSearch}
            onChange={(event) => updatePlayerSearch(eventItem.id, event.target.value)}
            placeholder={`Numero, nombre o apellido de ${playerTeam}`}
            aria-label="Buscar jugador del evento"
          />
          {suggestedPlayers.length > 0 && (
            <div className="referee-player-suggestions" aria-label="Opciones de jugador">
              {suggestedPlayers.map((player) => (
                <button
                  className={eventItem.playerId === player.id ? "selected" : ""}
                  key={player.id}
                  type="button"
                  onClick={() => selectEventPlayer(eventItem.id, player)}
                >
                  <b>{player.number || "-"}</b>
                  <span>{player.name}</span>
                  {player.isCaptain && <small>Capitan</small>}
                </button>
              ))}
            </div>
          )}
        </label>
        <label>Jugador seleccionado
          <select value={eventItem.playerId} onChange={(event) => updateEvent(eventItem.id, "playerId", event.target.value)} aria-label="Jugador">
            <option value="">{filteredPlayers.length ? "Selecciona jugador" : "Sin coincidencias, mostrando plantilla"}</option>
            {visiblePlayers.map((player) => (
              <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}{player.isCaptain ? " | CAPITAN" : ""}</option>
            ))}
          </select>
        </label>
        <label>Minuto
          <input value={eventItem.minuteLabel || eventItem.minute} onChange={(event) => updateEvent(eventItem.id, "minute", event.target.value)} inputMode="numeric" placeholder="Min" type="text" aria-label="Minuto" />
        </label>
        {extraTimeEnabled && (
          <label>Periodo
            <select value={eventItem.period || MATCH_EVENT_PERIODS.REGULAR} onChange={(event) => updateEvent(eventItem.id, "period", event.target.value)} aria-label="Periodo del evento">
              <option value={MATCH_EVENT_PERIODS.REGULAR}>Tiempo regular</option>
              <option value={MATCH_EVENT_PERIODS.EXTRA_TIME}>Tiempo extra</option>
            </select>
          </label>
        )}
        {eventItem.type === "red" && (
          <>
            <div className="referee-locked-team">
              <span>Comision disciplinaria</span>
              <strong>Sujeto a revision</strong>
              <small>La cantidad de partidos se define desde administracion.</small>
            </div>
            {isDoubleYellowRed ? (
              <div className="referee-red-reason-field referee-red-reason-locked">
                <span>Motivo</span>
                <strong>{eventItem.reason || DOUBLE_YELLOW_REASON}</strong>
              </div>
            ) : (
              <div className="referee-red-reason-field">
                <span>Motivo de expulsion</span>
                <div className="referee-red-reason-options" data-red-reason-event-id={eventItem.id}>
                  {RED_CARD_REASON_OPTIONS.map((reason) => (
                    <button
                      className={selectedRedReason === reason ? "selected" : ""}
                      key={reason}
                      type="button"
                      onClick={() => updateRedReason(eventItem.id, reason)}
                    >
                      {reason}
                    </button>
                  ))}
                  <button className={selectedRedReason === "__other__" ? "selected" : ""} type="button" onClick={() => updateRedReason(eventItem.id, "__other__")}>
                    Otra
                  </button>
                </div>
                {showCustomRedReason && (
                  <input data-red-reason-event-id={eventItem.id} value={eventItem.reason || ""} onChange={(event) => updateEvent(eventItem.id, "reason", event.target.value)} placeholder="Describe el motivo de la roja" aria-label="Motivo de roja" />
                )}
              </div>
            )}
          </>
        )}
      </article>
    );
  }

  function getReportStatusLabel(report) {
    const status = typeof report === "string" ? report : report?.status;
    const signatureIssue = typeof report === "object" ? report?.payload?.signatureIssue : null;
    if (signatureIssue?.status === "pending_admin_attention") return "Incidencia de firma";
    if (status === "published") return "Publicada";
    if (status === "finalized") return "Finalizada";
    if (status === "both_signed") return "Firmas completas";
    if (status === "correction_requested") return "Correccion solicitada";
    return "Pendiente de firmas";
  }

  function renderPostMatchReview() {
    const report = reportState?.report || null;
    const reportLocked = ["finalized", "published"].includes(report?.status);
    const signatureIssue = getReportSignatureIssue(report);
    const publishableByIssue = signatureIssue?.status === "pending_admin_attention";
    const publishReady = canPublishPreliminaryReport();
    const reviewEvents = events.filter((eventItem) => eventItem.playerId || eventItem.type);
    const extraSummary = getExtraTimeGoalSummary(reviewEvents);
    const shootoutSummary = getPenaltyShootoutSummary();
    return (
      <form className="referee-sheet-form referee-live-capture-mode referee-post-match-form" onSubmit={(event) => event.preventDefault()}>
        <div className="referee-acta-title referee-review-title">
          <button type="button" onClick={onCancel} disabled={saving}>Volver al inicio</button>
          <div>
            <div className="referee-acta-brand">
              <img alt="LIGATEC" src={ligatecLogo} />
              <span>Revision del acta</span>
            </div>
            <strong>{match.homeTeamName} vs {match.awayTeamName}</strong>
            <small>{match.competitionName || "Categoria"} | {formatDate(match.date)} | {match.time || "Hora por definir"} | {match.venue || "Cancha por definir"}</small>
          </div>
        </div>

        <div className="referee-flow-steps referee-review-flow" aria-label="Flujo del acta">
          <span>1. Captura</span>
          <span className="active">2. Revisa acta</span>
          <span className={reportState?.readyToFinalize || publishableByIssue || reportLocked ? "active" : ""}>3. Firma capitanes</span>
          <span className={reportLocked ? "active" : ""}>4. Publica acta</span>
        </div>

        <section className="referee-post-review-card" aria-label="Resumen del acta">
          <img className="referee-review-watermark" alt="" src={ligatecLogo} aria-hidden="true" />
          <div className="referee-post-review-head">
            <span>{loadingReport ? "Cargando acta preliminar" : getReportStatusLabel(report)}</span>
            <strong>Resultado final</strong>
          </div>
          <div className="referee-post-scoreline">
            <div>
              <RefereeTeamMark name={match.homeTeamName} />
              <strong>{match.homeTeamName}</strong>
              <small>Local</small>
            </div>
            <b>{homeGoals || 0} - {awayGoals || 0}</b>
            <div>
              <RefereeTeamMark name={match.awayTeamName} tone="away" />
              <strong>{match.awayTeamName}</strong>
              <small>Visitante</small>
            </div>
          </div>
          <div className="referee-post-summary-grid">
            <span><small>Eventos</small><strong>{reviewEvents.length}</strong></span>
            <span><small>Tiempo extra</small><strong>{extraTimeEnabled ? `${extraSummary.home} - ${extraSummary.away}` : "No"}</strong></span>
            <span><small>Penales</small><strong>{penaltiesEnabled ? `${shootoutSummary.home || 0} - ${shootoutSummary.away || 0}` : "No"}</strong></span>
          </div>
        </section>

        <section className="referee-review-events-panel">
          <div className="referee-review-section-head">
            <span>Eventos registrados</span>
            <strong>{reviewEvents.length} evento(s)</strong>
          </div>
          {reviewEvents.length ? (
            <div className="referee-review-event-list">
              {reviewEvents.map((eventItem) => (
                <article className={`event-kind-${eventItem.type}`} key={eventItem.id}>
                  <b aria-hidden="true">{getEventIcon(eventItem.type, eventItem)}</b>
                  <div>
                    <strong>{getEventLabel(eventItem.type, eventItem)} · {eventItem.minuteLabel || eventItem.minute || "-"}'</strong>
                    <span>{getEventPlayerName(eventItem)}</span>
                  </div>
                  <small>{eventItem.teamId === match.homeTeamId ? getTeamInitials(match.homeTeamName) : getTeamInitials(match.awayTeamName)}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">No hay eventos registrados en el acta.</p>
          )}
        </section>

        <label className="referee-review-observations">Observaciones del acta
          <textarea
            disabled={reportLocked}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            placeholder="Agrega observaciones, incidentes o acuerdos antes de las firmas."
          />
          <small>Lo escrito aqui se guarda en el acta preliminar antes de firmar o publicar.</small>
        </label>

        <section className="referee-pin-panel referee-review-sign-panel">
          <div className="referee-pin-panel-head">
            <span>Firmas de capitanes</span>
            <strong>{report ? getReportStatusLabel(report) : "Acta preliminar pendiente"}</strong>
            <small>
              {publishableByIssue
                ? "Incidencia documentada. El acta puede publicarse sin salir de esta pantalla."
                : report
                ? "Captura los PIN generados desde el panel delegado para autorizar el acta."
                : "Cuando el reporte termine de generarse apareceran los campos de firma."}
            </small>
          </div>
          {report && (
            <>
              <div className="referee-roster-status-row">
                <span>{match.homeTeamName}: {reportState.homeSigned ? "firmada" : "pendiente"}</span>
                <span>{match.awayTeamName}: {reportState.awaySigned ? "firmada" : "pendiente"}</span>
              </div>
              <div className="referee-pin-grid">
                <label>PIN capitan local | {match.homeTeamName}
                  <input
                    disabled={reportState.homeSigned || reportLocked}
                    inputMode="numeric"
                    maxLength={8}
                    value={homeCaptainPin}
                    onChange={(event) => setHomeCaptainPin(normalizePin(event.target.value))}
                    placeholder={reportState.homeSigned ? "Firmada" : "PIN local"}
                  />
                </label>
                <label>PIN capitan visitante | {match.awayTeamName}
                  <input
                    disabled={reportState.awaySigned || reportLocked}
                    inputMode="numeric"
                    maxLength={8}
                    value={awayCaptainPin}
                    onChange={(event) => setAwayCaptainPin(normalizePin(event.target.value))}
                    placeholder={reportState.awaySigned ? "Firmada" : "PIN visitante"}
                  />
                </label>
              </div>
              <div className="inline-actions referee-review-actions">
                <button className="review-save" type="button" onClick={savePreliminaryReportReview} disabled={saving || reportLocked}>
                  Guardar revision
                </button>
                <button className="review-sign home" type="button" onClick={() => signPreliminaryReport("home")} disabled={saving || reportState.homeSigned || reportLocked}>
                  Firmar local
                </button>
                <button className="review-sign away" type="button" onClick={() => signPreliminaryReport("away")} disabled={saving || reportState.awaySigned || reportLocked}>
                  Firmar visitante
                </button>
                <button className="primary review-publish" type="button" onClick={finalizePreliminaryReport} disabled={saving || !publishReady || reportLocked}>
                  {publishableByIssue ? "Publicar con incidencia" : "Publicar acta"}
                </button>
              </div>
              {publishableByIssue && (
                <div className="referee-signature-issue-current">
                  <strong>Incidencia registrada</strong>
                  <span>{signatureIssue.reasonLabel || "Problema con firma"}</span>
                  <small>Se conservara como observacion del acta para auditoria y administracion.</small>
                </div>
              )}
              {!reportLocked && (
                <details className="referee-signature-issue-panel">
                  <summary>Problema con firma</summary>
                  <div>
                    {SIGNATURE_ISSUE_REASONS.map((reason) => (
                      <button key={reason.id} type="button" onClick={() => reportSignatureIssue(reason)} disabled={saving}>
                        {reason.label}
                      </button>
                    ))}
                  </div>
                  <small>Marca el motivo y la app conservara esta misma pantalla para que puedas publicar el acta.</small>
                </details>
              )}
            </>
          )}
        </section>

        {message && <p className={message.startsWith("No se") || message.startsWith("Revisa") || message.startsWith("Toda") || message.startsWith("Captura") || message.startsWith("Se requiere") || message.startsWith("PIN") ? "auth-error" : "auth-ok"}>{message}</p>}
        <div className="referee-review-bottom-actions" aria-label="Acciones del acta">
          <button className="review-exit" type="button" onClick={onCancel} disabled={saving}>Salir</button>
          <button className="review-save" type="button" onClick={savePreliminaryReportReview} disabled={saving || reportLocked}>Guardar</button>
          <button className="primary review-publish" type="button" onClick={finalizePreliminaryReport} disabled={saving || !publishReady || reportLocked}>
            {publishableByIssue ? "Publicar con incidencia" : "Publicar acta"}
          </button>
        </div>
      </form>
    );
  }

  const previousEvents = events.slice(0, -1);
  const latestEvent = events[events.length - 1] || null;
  const recentEvents = getRecentLiveEvents(events);
  const selectedEventTeamName = selectedEventTeam === match.homeTeamId ? match.homeTeamName : match.awayTeamName;
  const postMatchWorkflowStatuses = ["match_finished", "pending_captain_review", "both_signed", "finalized_pending_sync"];
  const isPostMatchReview = captureMode === "live" && sheetMode === "played" && (
    Boolean(reportState?.report) ||
    liveTimer.timerStatus === LIVE_TIMER_STATUSES.FINISHED ||
    postMatchWorkflowStatuses.includes(match.sessionStatus || "") ||
    postMatchWorkflowStatuses.includes(match.workflowStatus || "")
  );
  const isLiveCapture = captureMode === "live" && sheetMode === "played" && !isPostMatchReview;
  const extraTimeGoalSummary = getExtraTimeGoalSummary(events);
  const liveCanCloseCurrentPeriod = liveTimer.timerStatus !== LIVE_TIMER_STATUSES.FINISHED && (liveRunning || liveTimer.timerStatus === LIVE_TIMER_STATUSES.PAUSED);

  if (isPostMatchReview) return renderPostMatchReview();

  return (
    <form className={`referee-sheet-form ${isLiveCapture ? "referee-live-capture-mode" : ""} ${batterySaver ? "referee-low-power" : ""}`} onSubmit={submitSheet}>
      <div className="referee-acta-title">
        <button type="button" onClick={onCancel} disabled={saving}>Volver a partidos</button>
        <div>
          <div className="referee-acta-brand">
            <img alt="LIGATEC" src={ligatecLogo} />
            <span>Panel del arbitro</span>
          </div>
          <strong>{match.homeTeamName} vs {match.awayTeamName}</strong>
          <small>{captureMode === "live" ? "Acta digital en vivo" : "Captura manual"} | {match.competitionName || "Categoria"} | {formatDate(match.date)} | {match.time || "Hora por definir"} | {match.venue || "Cancha por definir"}</small>
        </div>
      </div>

      <div className="referee-flow-steps" aria-label="Flujo del acta">
        <span className="active">1. Captura</span>
        <span>2. Revisa eventos</span>
        <span>3. Firma capitanes</span>
        <span>4. Publica acta</span>
      </div>

      {isLiveCapture && eventComposer && renderEventComposer()}

      {isLiveCapture && !eventComposer && (
        <section className="referee-live-arena" aria-label="Modo partido en vivo">
          <img className="referee-live-logo" alt="" src={ligatecLogo} aria-hidden="true" />
          <div className="referee-live-arena-top">
            <button type="button" onClick={onCancel} aria-label="Volver">‹</button>
            <div>
              <span>{match.competitionName || "Partido"} · {getMatchDayLabel(match)}</span>
              <strong>{liveStarted ? getLivePeriodName() : "Antes del inicio"}</strong>
            </div>
            <button className="referee-live-save" type="button" onClick={saveDraft} disabled={saving}>
              <span aria-hidden="true">✓</span>
              Guardar
            </button>
          </div>

          <div className="referee-live-signal">
            <span className={navigator.onLine ? "online" : "offline"}>{navigator.onLine ? "En linea" : "Sin conexion"}</span>
            <span>{pendingOperationCount ? `${pendingOperationCount} ${pendingOperationCount === 1 ? "pendiente" : "pendientes"}` : liveStorageStatus}</span>
          </div>

          <div className="referee-live-scoreboard">
            <button
              className={`referee-live-team-card ${selectedEventTeam === match.homeTeamId ? "active" : ""}`}
              type="button"
              onClick={() => setSelectedEventTeam(match.homeTeamId)}
              aria-pressed={selectedEventTeam === match.homeTeamId}
            >
              <RefereeTeamMark name={match.homeTeamName} />
              <strong>{match.homeTeamName}</strong>
              <small>Local</small>
            </button>
            <div className="referee-live-center">
              <span>{getLiveFlowStepLabel()}</span>
              <b>{liveStarted ? getLiveClockLabel() : formatClock(0)}</b>
              <strong>{homeGoals || 0} - {awayGoals || 0}</strong>
            </div>
            <button
              className={`referee-live-team-card ${selectedEventTeam === match.awayTeamId ? "active" : ""}`}
              type="button"
              onClick={() => setSelectedEventTeam(match.awayTeamId)}
              aria-pressed={selectedEventTeam === match.awayTeamId}
            >
              <RefereeTeamMark name={match.awayTeamName} tone="away" />
              <strong>{match.awayTeamName}</strong>
              <small>Visitante</small>
            </button>
          </div>

          {!liveStarted && (
            <button className="referee-live-start" type="button" onClick={startLiveMatch} disabled={saving}>
              Iniciar partido
            </button>
          )}

          {liveStarted && (
            <div className="referee-live-primary-controls">
              {liveRunning && <button type="button" onClick={pauseLiveClock}>Pausar reloj</button>}
              {liveTimer.timerStatus === LIVE_TIMER_STATUSES.PAUSED && <button className="primary" type="button" onClick={resumeLiveClock}>Reanudar</button>}
              {liveCanCloseCurrentPeriod && livePeriod === 1 && <button className="primary" type="button" onClick={finishFirstHalf}>Finalizar 1T</button>}
              {!liveRunning && livePeriod === 1 && liveTimer.timerStatus === LIVE_TIMER_STATUSES.HALFTIME && <button className="primary" type="button" onClick={startSecondHalf}>Iniciar 2T</button>}
              {liveCanCloseCurrentPeriod && livePeriod === 2 && extraTimeEnabled && <button className="primary" type="button" onClick={finishRegularTime}>Finalizar regular</button>}
              {liveCanCloseCurrentPeriod && livePeriod === 2 && !extraTimeEnabled && <button className="primary" type="button" onClick={finishLiveMatch}>Finalizar partido</button>}
              {!liveRunning && livePeriod === 2 && liveTimer.timerStatus === LIVE_TIMER_STATUSES.HALFTIME && extraTimeEnabled && <button className="primary" type="button" onClick={startExtraTime}>Iniciar 1TE</button>}
              {!liveRunning && livePeriod === 2 && liveTimer.timerStatus === LIVE_TIMER_STATUSES.HALFTIME && <button type="button" onClick={finishLiveMatch}>Finalizar partido</button>}
              {liveCanCloseCurrentPeriod && livePeriod === 3 && <button className="primary" type="button" onClick={finishFirstExtraTime}>Finalizar 1TE</button>}
              {!liveRunning && livePeriod === 3 && liveTimer.timerStatus === LIVE_TIMER_STATUSES.HALFTIME && <button className="primary" type="button" onClick={startSecondExtraTime}>Iniciar 2TE</button>}
              {liveCanCloseCurrentPeriod && livePeriod === 4 && <button className="primary" type="button" onClick={finishLiveMatch}>Finalizar partido</button>}
            </div>
          )}

          <div className="referee-live-actions-head">
            <span>Eventos para</span>
            <strong>{selectedEventTeamName}</strong>
          </div>
          <div className="referee-live-actions" aria-label={`Eventos rapidos para ${selectedEventTeamName}`}>
            <EventQuickButton className="event-goal" icon={getEventIcon("goal")} title="Gol" subtitle={selectedEventTeamName} onClick={() => openEventComposer("goal", selectedEventTeam)} />
            <EventQuickButton className="event-yellow" icon={getEventIcon("yellow")} title="Tarjeta" subtitle="Amarilla" onClick={() => openEventComposer("yellow", selectedEventTeam)} />
            <EventQuickButton className="event-own-goal" icon={getEventIcon("own_goal")} title="Autogol" subtitle={selectedEventTeamName} onClick={() => openEventComposer("own_goal", selectedEventTeam)} />
            <EventQuickButton className="event-red" icon={getEventIcon("red")} title="Incidente" subtitle="Roja" onClick={() => openEventComposer("red", selectedEventTeam)} />
          </div>

          <section className="referee-recent-events">
            <div>
              <strong>Eventos recientes</strong>
              <span>{events.length ? "Ver todos abajo" : "Sin eventos"}</span>
            </div>
            {recentEvents.map((eventItem) => (
              <article key={eventItem.id}>
                <b className={`referee-recent-event-icon event-kind-${eventItem.type}`}>{getEventIcon(eventItem.type, eventItem)}</b>
                <em>{eventItem.minuteLabel || eventItem.minute || getLiveEventMinuteLabel()}'</em>
                <span>{getEventLabel(eventItem.type, eventItem)}</span>
                <strong>
                  <small>{eventItem.teamId === match.homeTeamId ? getRecentEventTeamAbbreviation(match.homeTeamName) : getRecentEventTeamAbbreviation(match.awayTeamName)}</small>
                  <span className="referee-recent-player-name">{getEventPlayerName(eventItem)}</span>
                </strong>
              </article>
            ))}
          </section>
        </section>
      )}

      {!isLiveCapture && (
      <div className="referee-sheet-head">
        <div className="referee-score-team home">
          <b className="referee-team-mark">{getTeamInitials(match.homeTeamName)}</b>
          <span>Local</span>
          <strong>{match.homeTeamName}</strong>
        </div>
        <div className="referee-score-box">
          <input aria-label="Goles local" min="0" type="number" value={homeGoals} onChange={(event) => setHomeGoals(event.target.value)} />
          <span>-</span>
          <input aria-label="Goles visitante" min="0" type="number" value={awayGoals} onChange={(event) => setAwayGoals(event.target.value)} />
        </div>
        <div className="referee-score-team away">
          <b className="referee-team-mark">{getTeamInitials(match.awayTeamName)}</b>
          <span>Visitante</span>
          <strong>{match.awayTeamName}</strong>
        </div>
      </div>
      )}

      {!isLiveCapture && (
      <div className="referee-sheet-controls">
        <label>Tipo de resultado
          <select value={sheetMode} onChange={(event) => applyDefault(event.target.value)}>
            <option value="played">Partido jugado</option>
            <option value="default_3">Default 3-0</option>
            <option value="default_5">Default 5-0</option>
          </select>
        </label>
        {sheetMode !== "played" && (
          <label>Ganador por default
            <select value={defaultWinner} onChange={(event) => applyDefault(sheetMode, event.target.value)}>
              <option value="home">{match.homeTeamName}</option>
              <option value="away">{match.awayTeamName}</option>
            </select>
          </label>
        )}
      </div>
      )}

      {sheetMode === "played" && captureMode === "live" && !isLiveCapture && (
        <section className={`referee-live-panel ${liveStarted ? "is-active" : ""}`} aria-label="Modo partido en vivo">
          <div className="referee-live-mode-card">
            <div>
              <span>Modo arbitraje</span>
              <strong>{wakeLockStatus === "active" ? "Pantalla activa durante el partido" : "Listo para captura resistente"}</strong>
              <small>
                {wakeLockStatus === "unsupported"
                  ? "Este dispositivo no permite mantener la pantalla activa desde la PWA."
                  : wakeLockStatus === "released"
                    ? "El sistema desactivo el modo de pantalla activa."
                    : "El cronometro se calcula por timestamps y se guarda en este dispositivo."}
              </small>
            </div>
            <button type="button" onClick={requestWakeLock} disabled={wakeLockStatus === "active"}>
              {wakeLockStatus === "active" ? "Pantalla activa" : "Activar modo arbitraje"}
            </button>
          </div>
          <div className="referee-live-status-grid" aria-label="Estado de captura">
            <span className={navigator.onLine ? "online" : "offline"}>{navigator.onLine ? "Con conexion" : "Sin conexion"}</span>
            <span>{liveStorageStatus}</span>
            <span>{syncStatus}</span>
            <span>{pendingOperationCount ? `${pendingOperationCount} pendiente(s)` : "Sin pendientes"}</span>
          </div>
          <div className="referee-live-head">
            <div>
              <span>Captura en vivo</span>
              <strong>{liveStarted ? `${getLivePeriodName()} en curso` : "Cronometro del partido"}</strong>
              <small>El tiempo extra no inicia solo. Solo se habilita desde liguilla cuando el reglamento lo pide.</small>
            </div>
            <div className="referee-live-clock">
              <b>{liveStarted ? getLiveClockLabel() : formatClock(0)}</b>
              <span>{liveStarted ? (liveRunning ? "Corriendo" : "Pausado") : "Sin iniciar"}</span>
            </div>
          </div>
          <div className="referee-live-meta">
            <label>Tiempo reglamentario
              <select value={liveDuration} onChange={(event) => setLiveDuration(Number(event.target.value))} disabled={liveRunning}>
                <option value={35}>35 min</option>
                <option value={40}>40 min</option>
                <option value={45}>45 min</option>
                <option value={50}>50 min</option>
              </select>
            </label>
            <div className="referee-live-added">
              <span>Minuto para nuevo evento</span>
              <strong>{getLiveEventMinuteLabel()}</strong>
            </div>
          </div>
          <div className="referee-live-controls">
            {!liveStarted && <button className="primary" type="button" onClick={startLiveMatch}>Iniciar partido</button>}
            {liveStarted && liveRunning && <button type="button" onClick={pauseLiveClock}>Pausar</button>}
            {liveStarted && !liveRunning && <button className="primary" type="button" onClick={resumeLiveClock}>Reanudar</button>}
            {liveStarted && livePeriod === 1 && canFinishCurrentPeriod() && <button type="button" onClick={finishFirstHalf}>Finalizar 1T</button>}
            {liveStarted && livePeriod === 1 && !liveRunning && canFinishCurrentPeriod() && <button className="primary" type="button" onClick={startSecondHalf}>Iniciar 2T</button>}
            {liveStarted && livePeriod === 2 && canFinishCurrentPeriod() && <button className="primary" type="button" onClick={finishLiveMatch}>Finalizar partido</button>}
            {liveStarted && livePeriod === 2 && !liveRunning && canFinishCurrentPeriod() && <button type="button" onClick={startExtraTime}>Iniciar 1TE</button>}
            {liveStarted && livePeriod === 3 && canFinishCurrentPeriod() && <button type="button" onClick={finishExtraTimePeriod}>Finalizar 1TE</button>}
            {liveStarted && livePeriod === 3 && !liveRunning && canFinishCurrentPeriod() && <button className="primary" type="button" onClick={startSecondExtraTime}>Iniciar 2TE</button>}
            {liveStarted && livePeriod === 4 && canFinishCurrentPeriod() && <button className="primary" type="button" onClick={finishExtraTimePeriod}>Finalizar TE</button>}
            {liveStarted && <button type="button" onClick={suspendMatch} disabled={saving}>Suspender</button>}
            {liveStarted && <button type="button" onClick={saveDraft} disabled={saving}>Sincronizar</button>}
          </div>
          <label className="referee-low-power-toggle">
            <input checked={batterySaver} onChange={(event) => setBatterySaver(event.target.checked)} type="checkbox" />
            Modo ahorro durante el partido
            <small>Menos efectos visuales, alto contraste y menor consumo.</small>
          </label>
        </section>
      )}

      {sheetMode === "played" && !isLiveCapture && (
        <div className="referee-team-selector" aria-label="Equipo para nuevo evento">
          <span>Equipo</span>
          <button
            className={selectedEventTeam === match.homeTeamId ? "active" : ""}
            type="button"
            onClick={() => setSelectedEventTeam(match.homeTeamId)}
          >
            <RefereeTeamMark name={match.homeTeamName} />
            <strong>{getTeamInitials(match.homeTeamName)}</strong>
            <small>Local</small>
          </button>
          <button
            className={selectedEventTeam === match.awayTeamId ? "active" : ""}
            type="button"
            onClick={() => setSelectedEventTeam(match.awayTeamId)}
          >
            <RefereeTeamMark name={match.awayTeamName} tone="away" />
            <strong>{getTeamInitials(match.awayTeamName)}</strong>
            <small>Visitante</small>
          </button>
        </div>
      )}

      {sheetMode === "played" && (
        <details className="referee-advanced-panel">
          <summary>
            <strong>Opciones de liguilla</strong>
            <span>Solo activalas en finales o partidos donde el reglamento lo indique.</span>
          </summary>
          <div className="referee-advanced-grid">
            <label className="event-toggle-field">
              <input checked={extraTimeEnabled} onChange={(event) => setExtraTimeEnabled(event.target.checked)} type="checkbox" />
              Habilitar tiempo extra
            </label>
            {extraTimeEnabled && (
              <>
                <label>Duracion T.E.
                  <select value={extraTimeDuration} onChange={(event) => setExtraTimeDuration(Number(event.target.value))} disabled={liveRunning}>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={20}>20 min</option>
                  </select>
                </label>
                <div className="referee-derived-score">
                  <span>Goles en tiempo extra</span>
                  <strong>{extraTimeGoalSummary.home} - {extraTimeGoalSummary.away}</strong>
                  <small>Se calcula con los eventos marcados como tiempo extra.</small>
                </div>
              </>
            )}
            <label className="event-toggle-field">
              <input checked={penaltiesEnabled} onChange={(event) => setPenaltiesEnabled(event.target.checked)} type="checkbox" />
              Habilitar penales
            </label>
            {penaltiesEnabled && (
              <>
                <label>Tanda local
                  <input min="0" type="number" value={penaltyHomeGoals} onChange={(event) => setPenaltyHomeGoals(event.target.value)} placeholder="0" />
                </label>
                <label>Tanda visitante
                  <input min="0" type="number" value={penaltyAwayGoals} onChange={(event) => setPenaltyAwayGoals(event.target.value)} placeholder="0" />
                </label>
                <p className="referee-advanced-note">La tanda se publica como desempate y no suma a goleadores.</p>
              </>
            )}
          </div>
        </details>
      )}

      {!isLiveCapture && (
      <div className="referee-event-buttons" aria-label="Eventos rapidos del partido">
        <EventQuickButton className="event-goal" icon={getEventIcon("goal")} title="Gol" subtitle={selectedEventTeam === match.homeTeamId ? "Local" : "Visitante"} onClick={() => addEvent("goal", selectedEventTeam)} />
        <EventQuickButton className="event-yellow" icon={getEventIcon("yellow")} title="Tarjeta" subtitle="Amarilla" onClick={() => addEvent("yellow", selectedEventTeam)} />
        <EventQuickButton className="event-own-goal" icon={getEventIcon("own_goal")} title="Autogol" subtitle={selectedEventTeam === match.homeTeamId ? "Local" : "Visitante"} onClick={() => addEvent("own_goal", selectedEventTeam)} />
        <EventQuickButton className="event-red" icon={getEventIcon("red")} title="Incidente" subtitle="Roja" onClick={() => addEvent("red", selectedEventTeam)} />
      </div>
      )}

      <div className="referee-event-list">
        {latestEvent && (
          <div className="referee-latest-event">
            <span>Ultimo evento registrado</span>
            {renderEventRow(latestEvent, events.length - 1, true)}
          </div>
        )}
        {previousEvents.length > 0 && (
          <details className="referee-previous-events">
            <summary>
              <strong>Eventos anteriores</strong>
              <span>{previousEvents.length} evento(s), tocar para revisar</span>
            </summary>
            <div className="referee-previous-event-list">
              {previousEvents.map((eventItem, index) => renderEventRow(eventItem, index))}
            </div>
          </details>
        )}
        {!events.length && <p className="empty">Agrega goles, tarjetas o autogoles con los botones superiores.</p>}
      </div>

      {(loadingReport || reportState?.report) && (
        <section className="referee-pin-panel">
          <div className="referee-pin-panel-head">
            <span>Acta preliminar</span>
            <strong>{loadingReport ? "Cargando acta..." : `${reportState.report.homeGoals ?? homeGoals} - ${reportState.report.awayGoals ?? awayGoals}`}</strong>
            <small>
              {reportState?.report?.status === "published"
                ? "Acta publicada oficialmente en la parte publica."
                : reportState?.report?.status === "finalized"
                ? "Acta finalizada."
                : "Los capitanes deben revisar el resumen y autorizar con su PIN."}
            </small>
          </div>
          {reportState?.report && (
            <>
              <div className="referee-roster-status-row">
                <span>{match.homeTeamName}: {reportState.homeSigned ? "firmada" : "pendiente de firma"}</span>
                <span>{match.awayTeamName}: {reportState.awaySigned ? "firmada" : "pendiente de firma"}</span>
              </div>
              <div className="referee-pin-grid">
                <label>PIN capitan local | {match.homeTeamName}
                  <input
                    disabled={reportState.homeSigned || ["finalized", "published"].includes(reportState.report.status)}
                    inputMode="numeric"
                    maxLength={8}
                    value={homeCaptainPin}
                    onChange={(event) => setHomeCaptainPin(normalizePin(event.target.value))}
                    placeholder={reportState.homeSigned ? "Firmada" : "PIN local"}
                  />
                </label>
                <label>PIN capitan visitante | {match.awayTeamName}
                  <input
                    disabled={reportState.awaySigned || ["finalized", "published"].includes(reportState.report.status)}
                    inputMode="numeric"
                    maxLength={8}
                    value={awayCaptainPin}
                    onChange={(event) => setAwayCaptainPin(normalizePin(event.target.value))}
                    placeholder={reportState.awaySigned ? "Firmada" : "PIN visitante"}
                  />
                </label>
              </div>
              <div className="inline-actions referee-review-actions compact">
                <button className="review-sign home" type="button" onClick={() => signPreliminaryReport("home")} disabled={saving || reportState.homeSigned || ["finalized", "published"].includes(reportState.report.status)}>
                  Firmar local
                </button>
                <button className="review-sign away" type="button" onClick={() => signPreliminaryReport("away")} disabled={saving || reportState.awaySigned || ["finalized", "published"].includes(reportState.report.status)}>
                  Firmar visitante
                </button>
                <button className="primary review-publish" type="button" onClick={finalizePreliminaryReport} disabled={saving || !reportState.readyToFinalize || ["finalized", "published"].includes(reportState.report.status)}>
                  Finalizar acta
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <label>Observaciones
        <textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Notas del partido, incidentes o acuerdos." />
      </label>
      {!reportState?.report && getCaptureMode() === "live" && sheetMode === "played" && (match.homePinRequired || match.awayPinRequired) && (
        <div className="referee-pin-panel">
          <div className="referee-pin-panel-head">
            <span>Firma digital del acta</span>
            <strong>Autorizacion de capitanes</strong>
            <small>Cuando ambos capitanes revisen el resumen del acta, captura sus PIN para poder publicarla.</small>
          </div>
          <div className="referee-pin-grid">
            {match.homePinRequired && (
              <label>Capitan local | {match.homeTeamName}
                <input
                  inputMode="numeric"
                  maxLength={8}
                  value={homeCaptainPin}
                  onChange={(event) => setHomeCaptainPin(normalizePin(event.target.value))}
                  placeholder="PIN de firma"
                />
              </label>
            )}
            {match.awayPinRequired && (
              <label>Capitan visitante | {match.awayTeamName}
                <input
                  inputMode="numeric"
                  maxLength={8}
                  value={awayCaptainPin}
                  onChange={(event) => setAwayCaptainPin(normalizePin(event.target.value))}
                  placeholder="PIN de firma"
                />
              </label>
            )}
          </div>
        </div>
      )}
      {message && <p className={message.startsWith("No se") || message.startsWith("Revisa") || message.startsWith("Toda") || message.startsWith("Captura") || message.startsWith("Se requiere") || message.startsWith("PIN") ? "auth-error" : "auth-ok"}>{message}</p>}
      <div className="inline-actions">
        <button type="button" onClick={saveDraft} disabled={saving}>Guardar temporalmente</button>
        <button className="primary" type="submit" disabled={saving}>{saving ? "Finalizando acta..." : "Finalizar y publicar acta"}</button>
        <button type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  );
}

export function RefereePortal({ authToken, currentUser, onLogout }) {
  const initialPayload = useMemo(() => readRefereePortalCache(currentUser?.id), [currentUser?.id]);
  const [payload, setPayload] = useState(initialPayload || null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialPayload);
  const [captureMatchId, setCaptureMatchId] = useState("");
  const [captureStep, setCaptureStep] = useState("prepare");
  const [selectedCaptureMode, setSelectedCaptureMode] = useState("live");
  const [activeView, setActiveView] = useState("home");
  const [matchFilter, setMatchFilter] = useState("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedMatchDate, setSelectedMatchDate] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [historyCalendarOpen, setHistoryCalendarOpen] = useState(false);
  const [readOnlyMatchId, setReadOnlyMatchId] = useState("");
  const [readOnlyReportState, setReadOnlyReportState] = useState(null);
  const [readOnlyReportLoading, setReadOnlyReportLoading] = useState(false);
  const [readOnlyReportError, setReadOnlyReportError] = useState("");
  const [portalNotice, setPortalNotice] = useState("");
  const [localLiveStates, setLocalLiveStates] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const cachedPayload = readRefereePortalCache(currentUser?.id);
    if (cachedPayload) {
      setPayload(cachedPayload);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchRefereePortal(authToken)
      .then((nextPayload) => {
        if (!cancelled) {
          setPayload(nextPayload);
          writeRefereePortalCache(currentUser?.id, nextPayload);
          setError("");
        }
      })
      .catch((portalError) => {
        if (cancelled) return;
        const fallbackPayload = cachedPayload || readRefereePortalCache(currentUser?.id);
        if (fallbackPayload) {
          setPayload(fallbackPayload);
          setPortalNotice("Sin conexion. Mostrando la ultima informacion guardada en este dispositivo.");
          setError("");
          return;
        }
        setError(portalError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    const refreshLocalLiveStates = async () => {
      const rows = await listLiveMatchStates().catch(() => []);
      if (cancelled) return;
      const authorizedIds = new Set([
        ...(payload?.pendingMatches || []),
        ...(payload?.history || [])
      ].map((match) => match.id));
      setLocalLiveStates(rows.filter((state) => (
        authorizedIds.has(state.matchId) &&
        isRecoverableLiveDraft(state.draft)
      )));
    };
    refreshLocalLiveStates();
    const handleVisibleRefresh = () => {
      if (document.visibilityState === "visible") refreshLocalLiveStates();
    };
    window.addEventListener("focus", refreshLocalLiveStates);
    window.addEventListener("online", refreshLocalLiveStates);
    window.addEventListener("offline", refreshLocalLiveStates);
    document.addEventListener("visibilitychange", handleVisibleRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshLocalLiveStates);
      window.removeEventListener("online", refreshLocalLiveStates);
      window.removeEventListener("offline", refreshLocalLiveStates);
      document.removeEventListener("visibilitychange", handleVisibleRefresh);
    };
  }, [payload]);

  useEffect(() => {
    scrollRefereePortalToTop();
  }, [activeView, captureMatchId, captureStep]);

  useEffect(() => {
    if (!payload || captureMatchId) return;
    const matches = payload.pendingMatches || [];
    if (!matches.length) return;
    const localMatchIds = new Set(localLiveStates.map((state) => state.matchId));
    const stored = readRefereeActiveCapture(currentUser?.id);
    const storedMatch = stored?.matchId ? matches.find((match) => match.id === stored.matchId) : null;
    const recoverableStoredMatch = storedMatch && (
      localMatchIds.has(storedMatch.id) ||
      isMatchInCapture(storedMatch) ||
      isPreliminaryReportMatch(storedMatch)
    );
    const serverLiveMatch = matches.find((match) => isMatchInCapture(match));
    const localDraftMatch = matches.find((match) => localMatchIds.has(match.id));
    const targetMatch = recoverableStoredMatch ? storedMatch : serverLiveMatch || localDraftMatch;
    if (!targetMatch) return;
    setPortalNotice("");
    setSelectedCaptureMode(stored?.captureMode || targetMatch.captureMode || "live");
    setCaptureStep("capture");
    setCaptureMatchId(targetMatch.id);
  }, [captureMatchId, currentUser?.id, localLiveStates, payload]);

  const historyItems = useMemo(() => payload?.history || [], [payload]);
  const historyStats = useMemo(() => {
    const statusCounts = historyItems.reduce((accumulator, match) => {
      const status = getRefereeHistoryStatus(match);
      accumulator[status.key] = (accumulator[status.key] || 0) + 1;
      return accumulator;
    }, { ready: 0, pending: 0, draft: 0 });
    return {
      total: historyItems.length,
      acts: historyItems.length,
      published: statusCounts.ready || 0,
      pending: statusCounts.pending || 0,
      draft: statusCounts.draft || 0
    };
  }, [historyItems]);
  const filteredHistory = useMemo(() => {
    const query = normalizeSearch(historyQuery);
    return historyItems.filter((match) => {
      const status = getRefereeHistoryStatus(match);
      const matchesFilter = historyFilter === "all" || status.key === historyFilter;
      const matchesDate = !historyDateFilter || String(match.date || "sin-fecha") === historyDateFilter;
      const matchesQuery = !query || normalizeSearch([
        match.homeTeamName,
        match.awayTeamName,
        match.competitionName,
        match.venue,
        match.date,
        match.time,
        status.label,
        status.actaLabel
      ].join(" ")).includes(query);
      return matchesFilter && matchesDate && matchesQuery;
    });
  }, [historyDateFilter, historyFilter, historyItems, historyQuery]);
  const groupedHistory = useMemo(() => {
    const groups = new Map();
    const sortedHistory = [...filteredHistory].sort((a, b) => (
      String(b.date || "").localeCompare(String(a.date || "")) ||
      String(b.time || "").localeCompare(String(a.time || ""))
    ));
    for (const match of sortedHistory) {
      const key = match.date ? match.date.slice(0, 7) : "sin-fecha";
      if (!groups.has(key)) groups.set(key, new Map());
      const dateKey = match.date || "sin-fecha";
      if (!groups.get(key).has(dateKey)) groups.get(key).set(dateKey, []);
      groups.get(key).get(dateKey).push(match);
    }
    return [...groups.entries()].map(([month, dateGroups]) => ({
      month,
      count: [...dateGroups.values()].reduce((total, matches) => total + matches.length, 0),
      dates: [...dateGroups.entries()]
    }));
  }, [filteredHistory]);

  if (loading) {
    return <RefereeLoadingShell />;
  }

  if (error) {
    return <main className="page"><section className="panel"><p className="sheet-alert">{error}</p></section></main>;
  }

  const referee = payload?.referee;
  const pendingMatches = payload?.pendingMatches || [];
  const localLiveMatchIds = new Set(localLiveStates.map((state) => state.matchId));
  const localLiveMatches = pendingMatches.filter((match) => localLiveMatchIds.has(match.id));
  const captureMatch = pendingMatches.find((match) => match.id === captureMatchId);
  const readOnlyMatch = [...pendingMatches, ...historyItems].find((match) => match.id === readOnlyMatchId) || null;
  const operationalMatch = getOperationalRefereeMatch(pendingMatches);
  const openReadOnlyActa = async (match) => {
    setReadOnlyMatchId(match.id);
    setReadOnlyReportState(null);
    setReadOnlyReportError("");
    setReadOnlyReportLoading(true);
    scrollRefereePortalToTop();
    try {
      const nextReport = await fetchRefereeMatchReport(authToken, match.id);
      setReadOnlyReportState(nextReport);
    } catch (reportError) {
      setReadOnlyReportError(reportError.message || "No se pudo cargar el acta completa. Mostrando la informacion disponible.");
    } finally {
      setReadOnlyReportLoading(false);
    }
  };
  const openCapture = (matchId, options = {}) => {
    setPortalNotice("");
    const targetMatch = pendingMatches.find((match) => match.id === matchId);
    const shouldResumeCapture = options.resume === true || localLiveMatchIds.has(matchId) || (targetMatch ? isMatchInCapture(targetMatch) || isPreliminaryReportMatch(targetMatch) : false);
    setSelectedCaptureMode(targetMatch?.captureMode || "live");
    setCaptureStep(shouldResumeCapture ? "capture" : "prepare");
    if (shouldResumeCapture) writeRefereeActiveCapture(currentUser?.id, matchId, targetMatch?.captureMode || "live");
    setCaptureMatchId(matchId);
    scrollRefereePortalToTop();
  };
  const openView = (view) => {
    setActiveView(view);
    if (view === "matches") {
      setMatchFilter("all");
      setSelectedMatchDate("");
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closeCaptureFlow = () => {
    setCaptureMatchId("");
    setCaptureStep("prepare");
    setActiveView("home");
    clearRefereeActiveCapture(currentUser?.id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const savedCount = pendingMatches.filter((match) => match.sessionStatus === "temporarily_saved").length;
  const publishedCount = payload?.history?.length || 0;
  const lastHistoryMatch = [...historyItems].sort((a, b) => (
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(b.time || "").localeCompare(String(a.time || ""))
  ))[0] || null;
  const refereeCalendarDates = groupRefereeMatchesByDate(pendingMatches).map((group) => ({
    date: group.date,
    count: group.matches.length,
    label: getRefereeDayGroupLabel(group.date)
  }));
  const matchFilterCounts = {
    all: pendingMatches.length,
    today: pendingMatches.filter((match) => getRefereeMatchFilterBucket(match) === "today").length,
    tomorrow: pendingMatches.filter((match) => getRefereeMatchFilterBucket(match) === "tomorrow").length,
    future: pendingMatches.filter((match) => getRefereeMatchFilterBucket(match) === "future").length
  };
  const filteredMatches = pendingMatches.filter((match) => {
    if (selectedMatchDate) return String(match.date || "sin-fecha") === selectedMatchDate;
    if (matchFilter === "all") return true;
    return getRefereeMatchFilterBucket(match) === matchFilter;
  });
  const groupedFilteredMatches = groupRefereeMatchesByDate(filteredMatches);
  const activeCalendarLabel = selectedMatchDate
    ? refereeCalendarDates.find((item) => item.date === selectedMatchDate)?.label?.title || "Fecha seleccionada"
    : "Todas las fechas";
  const historyCalendarDates = groupRefereeMatchesByDate(historyItems).map((group) => ({
    date: group.date,
    count: group.matches.length,
    label: getRefereeDayGroupLabel(group.date)
  }));
  const activeHistoryCalendarLabel = historyDateFilter
    ? historyCalendarDates.find((item) => item.date === historyDateFilter)?.label?.title || "Fecha seleccionada"
    : "Todas las fechas";
  const selectRefereeCalendarDate = (dateKey) => {
    setSelectedMatchDate(dateKey);
    setMatchFilter("all");
    setCalendarOpen(false);
  };
  const selectHistoryCalendarDate = (dateKey) => {
    setHistoryDateFilter(dateKey);
    setHistoryCalendarOpen(false);
  };

  if (readOnlyMatch) {
    return (
      <RefereeReadOnlyActa
        match={readOnlyMatch}
        reportState={readOnlyReportState}
        loading={readOnlyReportLoading}
        error={readOnlyReportError}
        onBack={() => {
          setReadOnlyMatchId("");
          setReadOnlyReportState(null);
          setReadOnlyReportError("");
          setActiveView("history");
          scrollRefereePortalToTop();
        }}
      />
    );
  }

  if (captureMatch) {
    if (captureStep === "prepare") {
      return (
        <RefereeMatchPreparation
          match={captureMatch}
          onBack={closeCaptureFlow}
          onChooseMode={() => setCaptureStep("mode")}
        />
      );
    }
    if (captureStep === "mode") {
      return (
        <CaptureModeSelector
          match={captureMatch}
          onBack={() => setCaptureStep("prepare")}
          onSelect={(mode) => {
            const label = mode === "live" ? "acta digital en vivo" : "captura manual";
            if (!window.confirm(`¿Comenzar ${label} para ${captureMatch.homeTeamName} vs ${captureMatch.awayTeamName}?`)) return;
            setSelectedCaptureMode(mode);
            writeRefereeActiveCapture(currentUser?.id, captureMatch.id, mode);
            setCaptureStep("capture");
          }}
        />
      );
    }
    return (
      <main className="page referee-portal-page referee-acta-page">
        <section className="referee-phone-panel referee-capture-panel">
          <RefereeSheetForm
            authToken={authToken}
            match={captureMatch}
            initialCaptureMode={selectedCaptureMode}
            onCancel={closeCaptureFlow}
            onSaved={(nextPayload, options = {}) => {
              if (nextPayload) {
                setPayload(nextPayload);
                writeRefereePortalCache(currentUser?.id, nextPayload);
              }
              if (options.keepOpen) {
                writeRefereeActiveCapture(currentUser?.id, captureMatch.id, selectedCaptureMode);
                if (options.message) setPortalNotice(options.message);
                return;
              }
              setLocalLiveStates((states) => states.filter((state) => state.matchId !== captureMatch.id));
              setCaptureMatchId("");
              clearRefereeActiveCapture(currentUser?.id);
              setActiveView(options.returnHome ? "home" : "matches");
              setPortalNotice(options.message || "Acta publicada. El partido se movio a historial y ya aparece en la parte publica.");
            }}
          />
        </section>
      </main>
    );
  }

  return (
    <main className={`page referee-portal-page portal-mobile-shell referee-mobile-app referee-view-${activeView}`} id="referee-home">
      {activeView === "home" && <RefereeHeader
        onLogout={onLogout}
      />}
      {activeView === "home" && portalNotice && <p className="auth-ok referee-portal-notice">{portalNotice}</p>}

      {activeView === "home" && (
      <section className="referee-portal-home referee-view-screen">
        <RefereeProfileCard referee={referee} currentUser={currentUser} />
        {operationalMatch ? (
          <RefereeHomeOverview
            nextMatch={operationalMatch}
            pendingCount={pendingMatches.length}
            savedCount={savedCount}
            publishedCount={publishedCount}
          />
        ) : (
          <RefereeNoAssignmentHero
            lastMatch={lastHistoryMatch}
            totalHistory={historyItems.length}
            onViewHistory={() => openView("history")}
          />
        )}
        <ConnectionStatusBar />
        {operationalMatch && <RefereeAssignmentHero match={operationalMatch} onOpen={openCapture} />}
        {localLiveMatches.length > 0 && (
          <section className="referee-local-resume">
            <div>
              <span>Respaldo local activo</span>
              <strong>Continuar partido en este dispositivo</strong>
              <small>Se detecto captura guardada localmente. Continua desde aqui antes de iniciar otra acta.</small>
            </div>
            {localLiveMatches.slice(0, 2).map((match) => (
              <button key={match.id} type="button" onClick={() => openCapture(match.id, { resume: true })}>
                <b>{getTeamInitials(match.homeTeamName)} vs {getTeamInitials(match.awayTeamName)}</b>
                <span>{match.homeTeamName} vs {match.awayTeamName}</span>
              </button>
            ))}
          </section>
        )}
        <RefereeDailyTip />
      </section>
      )}

      {activeView === "matches" && (
      <section className="referee-matches-screen referee-view-screen">
        <div className="referee-matches-heading">
          <div>
            <h2>Mis partidos</h2>
            <p>Proximos encuentros asignados</p>
          </div>
          <button
            className={`referee-calendar-button ${calendarOpen || selectedMatchDate ? "active" : ""}`}
            type="button"
            aria-expanded={calendarOpen}
            aria-label="Calendario de partidos"
            onClick={() => setCalendarOpen((current) => !current)}
          >
            <RefereeTinyIcon />
          </button>
        </div>
        {calendarOpen && (
          <section className="referee-calendar-panel" aria-label="Seleccionar fecha de partidos">
            <div className="referee-calendar-panel-head">
              <div>
                <span>Calendario</span>
                <strong>{activeCalendarLabel}</strong>
              </div>
              {selectedMatchDate && <button type="button" onClick={() => setSelectedMatchDate("")}>Limpiar</button>}
            </div>
            <label className="referee-calendar-input">Ir a fecha
              <input
                type="date"
                value={selectedMatchDate === "sin-fecha" ? "" : selectedMatchDate}
                onChange={(event) => {
                  setSelectedMatchDate(event.target.value);
                  setMatchFilter("all");
                }}
              />
            </label>
            <div className="referee-calendar-date-grid">
              <button className={!selectedMatchDate ? "active" : ""} type="button" onClick={() => setSelectedMatchDate("")}>
                <span>Todas</span>
                <b>{pendingMatches.length}</b>
              </button>
              {refereeCalendarDates.map((item) => (
                <button className={selectedMatchDate === item.date ? "active" : ""} key={item.date} type="button" onClick={() => selectRefereeCalendarDate(item.date)}>
                  <small>{item.label.kicker}</small>
                  <span>{item.date === "sin-fecha" ? "Sin fecha" : item.label.title}</span>
                  <b>{item.count}</b>
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="referee-match-filter-tabs" role="tablist" aria-label="Filtros de partidos">
          {[
            ["all", "Todos"],
            ["today", "Hoy"],
            ["tomorrow", "Mañana"],
            ["future", "Mas adelante"]
          ].map(([value, label]) => (
            <button
              className={!selectedMatchDate && matchFilter === value ? "active" : ""}
              key={value}
              type="button"
              onClick={() => {
                setSelectedMatchDate("");
                setMatchFilter(value);
              }}
            >
              <span>{label}</span>
              <b>{matchFilterCounts[value]}</b>
            </button>
          ))}
        </div>
        <div className="referee-assignment-list">
          {groupedFilteredMatches.map((group) => {
            const groupLabel = getRefereeDayGroupLabel(group.date);
            return (
              <section className="referee-assignment-day" key={group.date}>
                <header>
                  <span><RefereeTinyIcon />{groupLabel.kicker}</span>
                  <strong>{groupLabel.title}</strong>
                </header>
                <div className="referee-assignment-day-list">
                  {group.matches.map((match) => (
                    <RefereeAssignmentCard key={match.id} match={match} onCapture={openCapture} />
                  ))}
                </div>
              </section>
            );
          })}
          {!filteredMatches.length && <p className="empty">No hay partidos para este filtro.</p>}
        </div>
      </section>
      )}

      {activeView === "acts" && (
      <section className="referee-acts-screen referee-view-screen">
        <div className="referee-screen-option-head">
          <button type="button" onClick={() => openView("home")} aria-label="Regresar">‹</button>
          <div>
            <strong>Actas</strong>
            <small>Guardadas y pendientes</small>
          </div>
          <span>{pendingMatches.filter((match) => match.sessionStatus || match.sheetReviewStatus || isPreliminaryReportMatch(match)).length}</span>
        </div>
        <div className="referee-acts-summary">
          <span><PortalNavIcon type="acts" /><b>{savedCount}</b><small>Guardadas</small></span>
          <span><RefereeTinyIcon type="clock" /><b>{pendingMatches.filter((match) => match.sheetReviewStatus || isPreliminaryReportMatch(match)).length}</b><small>Pendientes</small></span>
          <span><RefereeTinyIcon type="check" /><b>{publishedCount}</b><small>Publicadas</small></span>
        </div>
        <div className="referee-match-list referee-acts-list">
          {pendingMatches.filter((match) => match.sessionStatus || match.sheetReviewStatus || isPreliminaryReportMatch(match)).map((match) => (
            <div className="referee-capture-wrap" key={match.id}>
              <MatchCard match={match} onCapture={openCapture} />
            </div>
          ))}
          {!pendingMatches.some((match) => match.sessionStatus || match.sheetReviewStatus || isPreliminaryReportMatch(match)) && <p className="empty">No hay actas guardadas o pendientes de firma.</p>}
        </div>
      </section>
      )}

      {activeView === "history" && (
      <section className="referee-history-screen">
        <div className="referee-history-topbar">
          <button type="button" onClick={() => openView("home")} aria-label="Regresar">‹</button>
          <div>
            <strong>Historial</strong>
            <small>Partidos arbitrados</small>
          </div>
          <button className={historyFilter !== "all" || historyDateFilter || historyQuery ? "active" : ""} type="button" onClick={() => {
            if (historyFilter !== "all" || historyDateFilter || historyQuery) {
              setHistoryFilter("all");
              setHistoryDateFilter("");
              setHistoryQuery("");
              setHistoryCalendarOpen(false);
              return;
            }
            setHistoryFilter("pending");
          }}>
            <RefereeFilterIcon />
            <span>Filtros</span>
          </button>
        </div>
        <div className="referee-history-kpis" aria-label="Resumen de historial">
          <span><PortalNavIcon type="assignments" /><b>{historyStats.total}</b><small>Partidos</small></span>
          <span><PortalNavIcon type="acts" /><b>{historyStats.acts}</b><small>Actas</small></span>
          <span><RefereeTinyIcon type="check" /><b>{historyStats.published}</b><small>Publicados</small></span>
          <span><RefereeTinyIcon type="clock" /><b>{historyStats.pending}</b><small>Pendientes</small></span>
        </div>
        <div className="referee-history-search-row">
          <label>
            <span aria-hidden="true">⌕</span>
            <input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Buscar por equipo, torneo o fecha..."
            />
          </label>
          <button className={historyCalendarOpen || historyDateFilter ? "active" : ""} type="button" onClick={() => setHistoryCalendarOpen((current) => !current)} aria-label="Filtrar por fecha">
            <RefereeTinyIcon />
          </button>
        </div>
        {historyCalendarOpen && (
          <section className="referee-calendar-panel referee-history-calendar-panel" aria-label="Calendario de historial">
            <div className="referee-calendar-panel-head">
              <div>
                <span>Calendario</span>
                <strong>{activeHistoryCalendarLabel}</strong>
              </div>
              {historyDateFilter && <button type="button" onClick={() => setHistoryDateFilter("")}>Limpiar</button>}
            </div>
            <label className="referee-calendar-input">Ir a fecha
              <input
                type="date"
                value={historyDateFilter === "sin-fecha" ? "" : historyDateFilter}
                onChange={(event) => setHistoryDateFilter(event.target.value)}
              />
            </label>
            <div className="referee-calendar-date-grid">
              <button className={!historyDateFilter ? "active" : ""} type="button" onClick={() => setHistoryDateFilter("")}>
                <span>Todas</span>
                <b>{historyItems.length}</b>
              </button>
              {historyCalendarDates.map((item) => (
                <button className={historyDateFilter === item.date ? "active" : ""} key={item.date} type="button" onClick={() => selectHistoryCalendarDate(item.date)}>
                  <small>{item.label.kicker}</small>
                  <span>{item.date === "sin-fecha" ? "Sin fecha" : item.label.title}</span>
                  <b>{item.count}</b>
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="referee-history-tabs" role="tablist" aria-label="Filtrar historial">
          {[
            ["all", "Todos", historyStats.total],
            ["ready", "Actas listas", historyStats.published],
            ["pending", "Pendientes", historyStats.pending],
            ["draft", "Borrador", historyStats.draft]
          ].map(([value, label, count]) => (
            <button className={historyFilter === value ? "active" : ""} key={value} type="button" onClick={() => setHistoryFilter(value)}>
              <span>{label}</span>
              <b>{count}</b>
            </button>
          ))}
        </div>
        <div className="referee-history-month-list">
          {groupedHistory.map((group, index) => (
            <section className="referee-history-month-group" key={group.month}>
              <header>
                <strong>{formatMonth(group.month)}</strong>
                <span>{group.count} partidos</span>
                <b aria-hidden="true">{index === 0 ? "⌃" : "⌄"}</b>
              </header>
              <div className="referee-history-month-cards">
                {group.dates.flatMap(([, matches]) => matches).map((match) => (
                  <RefereeHistoryMatchCard key={match.id} match={match} onOpenActa={openReadOnlyActa} />
                ))}
              </div>
            </section>
          ))}
          {!filteredHistory.length && <p className="empty">No hay partidos con esos filtros.</p>}
        </div>
      </section>
      )}

      {activeView === "more" && (
      <section className="panel referee-section referee-tools-panel referee-view-screen" id="referee-tools">
        <div className="section-heading">
          <span>Mas</span>
          <h2>Ayuda y contingencias</h2>
        </div>
        <div className="referee-tool-grid">
          <button type="button" onClick={() => openView("matches")}>
            <PortalNavIcon type="acts" />
            <span><strong>Nueva acta manual</strong><small>Crea acta sin capturar en vivo</small></span>
          </button>
          <button type="button" onClick={() => openView("acts")}>
            <PortalNavIcon type="assignments" />
            <span><strong>Actas guardadas</strong><small>Continua actas en progreso</small></span>
          </button>
          <button type="button" onClick={() => openView("history")}>
            <PortalNavIcon type="history" />
            <span><strong>Historial publicado</strong><small>Consulta actas cerradas</small></span>
          </button>
          <button type="button">
            <PortalNavIcon type="more" />
            <span><strong>Guia rapida</strong><small>Ayuda y tutoriales</small></span>
          </button>
        </div>
        <div className="portal-support-grid">
          <article>
            <strong>Estados del partido</strong>
            <span><i className="status-dot pending" /> Pendiente</span>
            <span><i className="status-dot live" /> En progreso</span>
            <span><i className="status-dot saved" /> Guardado temporal</span>
            <span><i className="status-dot published" /> Publicado</span>
          </article>
          <article>
            <strong>Consideraciones</strong>
            <p>Los PIN son privados del equipo. En modo manual, las firmas viven en el acta fisica y toda correccion posterior se controla desde administracion.</p>
          </article>
        </div>
      </section>
      )}

      <nav className="portal-bottom-nav referee" aria-label="Navegacion arbitro">
        <button className={activeView === "home" ? "active" : ""} type="button" onClick={() => openView("home")}><PortalNavIcon type="home" /><span>Inicio</span></button>
        <button className={activeView === "matches" ? "active" : ""} type="button" onClick={() => openView("matches")}><PortalNavIcon type="assignments" /><span>Partidos</span></button>
        <button className={activeView === "acts" ? "active" : ""} type="button" onClick={() => openView("acts")}><PortalNavIcon type="acts" /><span>Actas</span></button>
        <button className={activeView === "history" ? "active" : ""} type="button" onClick={() => openView("history")}><PortalNavIcon type="history" /><span>Historial</span></button>
        <button className={activeView === "more" ? "active" : ""} type="button" onClick={() => openView("more")}><PortalNavIcon type="more" /><span>Mas</span></button>
      </nav>
    </main>
  );
}

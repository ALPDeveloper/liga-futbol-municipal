import { useEffect, useMemo, useState } from "react";
import ligatecLogo from "../../assets/ligatec-logo.png";
import { getFormPayload } from "./forms.js";
import { PlayerPhotoUploader } from "./PlayerPhotoUploader.jsx";
import { SectionHeading } from "./SectionHeading.jsx";
import { uploadImage } from "../lib/uploadApi.js";
import {
  createTeamPortalPlayer,
  fetchTeamPortal,
  signTeamMatchReport,
  submitTeamMatchParticipation,
  updateTeamPortalAffiliateNumber,
  updateTeamPortalLogo,
  updateTeamPortalPlayer
} from "../lib/teamDelegateApi.js";
import { getPlayerPhotoInitials } from "../lib/playerPhotoProcessing.js";

const PLAYER_POSITION_OPTIONS = ["Arquero", "Defensor", "Mediocampista", "Delantero"];
const PLAYER_POSITION_LABELS = {
  Arquero: "Arqueros",
  Defensor: "Defensas",
  Mediocampista: "Medios",
  Delantero: "Delanteros"
};
const PLAYER_POSITION_ORDER = PLAYER_POSITION_OPTIONS.reduce((order, position, index) => {
  order[position] = index;
  return order;
}, {});

function getTeamInitials(name) {
  const words = String(name || "EQ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "EQ";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function formatMatchDate(match) {
  const date = match?.date || "Fecha por definir";
  const time = match?.time || "Hora por definir";
  return `${date} | ${time}`;
}

function formatDate(value) {
  if (!value) return "Fecha por definir";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "2-digit", month: "short" }).format(date);
}

function getMatchTimestamp(match, fallbackTime = "12:00") {
  if (!match?.date) return Number.POSITIVE_INFINITY;
  const time = match.time || fallbackTime;
  const timestamp = new Date(`${match.date}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function sortDelegatePendingMatches(items, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();
  return [...items].sort((a, b) => {
    const aTimestamp = getMatchTimestamp(a);
    const bTimestamp = getMatchTimestamp(b);
    const aFuture = aTimestamp >= todayTimestamp;
    const bFuture = bTimestamp >= todayTimestamp;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    if (aFuture) return aTimestamp - bTimestamp;
    return bTimestamp - aTimestamp;
  });
}

function getDelegateMatchOpponentLine(match) {
  if (!match) return "Rival por definir";
  const role = getDelegateMatchRoleLabel(match);
  return `${match.opponentName || "Rival"} | ${role}`;
}

function getDelegateMatchStatus(match) {
  if (!match) return { tone: "neutral", label: "Sin partido", detail: "No hay partido seleccionado", step: 1 };
  if (match.status === "finished" || match.status === "walkover" || match.reportStatus === "published") {
    return { tone: "published", label: "Publicado", detail: "Resultado oficial disponible", step: 6 };
  }
  if (match.status === "postponed") {
    return { tone: "warning", label: "Pospuesto", detail: match.scheduleNote || "La liga indicara nueva fecha u horario.", step: 1 };
  }
  if (match.status === "advanced") {
    return { tone: "live", label: "Adelantado", detail: match.scheduleNote || "El partido fue movido a una fecha anterior.", step: match.participationSubmitted ? 2 : 1 };
  }
  if (match.status === "rescheduled") {
    return { tone: "sent", label: "Reprogramado", detail: match.scheduleNote || "El partido tiene nueva fecha u horario.", step: match.participationSubmitted ? 2 : 1 };
  }
  if (match.myTeamSigned && match.opponentSigned) {
    return { tone: "signed", label: "Firmado", detail: "Ambos equipos firmaron el acta", step: 5 };
  }
  if (match.myTeamSigned) {
    return { tone: "signed", label: "Mi equipo firmo", detail: "Esperando firma rival o cierre arbitral", step: 5 };
  }
  if (["pending_captain_review", "both_signed", "correction_requested"].includes(match.reportStatus)) {
    return { tone: "warning", label: "Pendiente de firma", detail: "Revisa el acta y firma digitalmente", step: 4 };
  }
  if (["in_progress", "match_finished", "temporarily_saved"].includes(match.workflowStatus || "")) {
    return { tone: "live", label: "En curso", detail: "El arbitro esta capturando el partido", step: 3 };
  }
  if (match.participationSubmitted) {
    return { tone: "sent", label: "Participantes enviados", detail: "Reporte bloqueado para conteo de PJ", step: 2 };
  }
  return { tone: "pending", label: "Participantes pendientes", detail: "Selecciona jugadores participantes y capitan", step: 1 };
}

function getTeamScore(match) {
  if (!match) return { own: 0, opponent: 0 };
  const homeGoals = Number(match.homeGoals ?? 0);
  const awayGoals = Number(match.awayGoals ?? 0);
  return match.isHome
    ? { own: homeGoals, opponent: awayGoals }
    : { own: awayGoals, opponent: homeGoals };
}

function getReportEvents(match) {
  const events = Array.isArray(match?.reportPayload?.events) && match.reportPayload.events.length
    ? match.reportPayload.events
    : Array.isArray(match?.events)
    ? match.events
    : [];
  return sortDelegateReportEvents(events);
}

function getReportEventIcon(event) {
  const type = event?.type;
  if (type === "goal" || type === "own_goal") return "⚽";
  if ((type === "yellow" || type === "yellow_card") && isDelegateSecondYellowEvent(event)) return "🟨🟥";
  if (type === "yellow" || type === "yellow_card") return "🟨";
  if (type === "red" || type === "red_card") return "🟥";
  if (type === "substitution") return "↔";
  if (type === "injury_note") return "✚";
  if (type === "incident" || type === "other_note") return "⚠";
  return "•";
}

function getReportEventLabel(event) {
  const cardDetail = event.cardDetail || event.subtype || event.metadata?.cardDetail || "";
  if (cardDetail === "double_yellow") return "Roja por 2a amarilla";
  if (cardDetail === "double_yellow_second") return "2a amarilla";
  if (event.type === "goal") return "Gol";
  if (event.type === "own_goal") return "Autogol";
  if (event.type === "yellow" || event.type === "yellow_card") return "Amarilla";
  if (event.type === "red" || event.type === "red_card") return "Roja";
  if (event.type === "substitution") return "Cambio";
  if (event.type === "injury_note") return "Lesion";
  if (event.type === "incident") return "Incidente";
  if (event.type === "other_note") return "Nota";
  return event.reason || "Evento";
}

function getReportEventDetail(event) {
  const details = [
    event?.reason,
    event?.notes,
    event?.description,
    event?.detail,
    event?.supportDetail
  ].filter(Boolean);
  return details[0] || "";
}

function parseDelegateReportMinute(event) {
  const value = event?.minute ?? "";
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function hasDelegateReportMinute(event) {
  return parseDelegateReportMinute(event) !== null || Boolean(String(event?.minuteLabel || "").trim());
}

function getReportEventMinute(event) {
  if (!hasDelegateReportMinute(event)) return "";
  return `${event?.minuteLabel || event?.minute}'`;
}

function sortDelegateReportEvents(events) {
  const indexedEvents = events.map((event, index) => ({ event, index }));
  const hasMinutes = indexedEvents.some(({ event }) => hasDelegateReportMinute(event));

  if (!hasMinutes) return indexedEvents.map(({ event }) => event);

  return indexedEvents
    .sort((left, right) => {
      const leftMinute = parseDelegateReportMinute(left.event);
      const rightMinute = parseDelegateReportMinute(right.event);
      const leftHasMinute = hasDelegateReportMinute(left.event);
      const rightHasMinute = hasDelegateReportMinute(right.event);
      if (leftMinute !== null && rightMinute !== null) return leftMinute - rightMinute || left.index - right.index;
      if (leftHasMinute && rightHasMinute) return left.index - right.index;
      if (leftHasMinute) return -1;
      if (rightHasMinute) return 1;
      return left.index - right.index;
    })
    .map(({ event }) => event);
}

function isDelegateSecondYellowEvent(event) {
  const cardDetail = event?.cardDetail || event?.subtype || event?.metadata?.cardDetail || "";
  return cardDetail === "double_yellow_second";
}

function getDelegateReportEventTeamName(match, event, context) {
  if (event?.teamName) return event.teamName;
  if (event?.teamId === match?.homeTeamId) return match?.homeTeamName || (match?.isHome ? context?.teamName : match?.opponentName) || "Local";
  if (event?.teamId === match?.awayTeamId) return match?.awayTeamName || (match?.isHome ? match?.opponentName : context?.teamName) || "Visitante";
  return "Equipo no identificado";
}

function getDelegateReportEventPlayerName(event) {
  const number = event?.playerNumber ? `#${event.playerNumber} ` : "";
  return `${number}${event?.playerName || event?.player || event?.playerId || "Jugador no identificado"}`;
}

function getDelegateReportEventSecondaryName(event) {
  const name = event?.secondaryPlayerName || event?.secondaryPlayer || event?.assistPlayerName || "";
  if (!name) return "";
  if (event?.type === "substitution") return `Sale: ${name}`;
  if (event?.assistPlayerName) return `Asistencia: ${name}`;
  return name;
}

function normalizeJerseyNumberInput(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 4);
}

function getDelegateViewLabel(activeView, navItems) {
  if (activeView === "acta") return "Seguimiento del acta";
  if (activeView === "player") return "Editar jugador";
  if (activeView === "newPlayer") return "Nuevo jugador";
  return navItems.find((item) => item.id === activeView)?.label || "Inicio";
}

function scrollDelegatePortalToTop() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.querySelector(".delegate-phone-frame")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    document.querySelector(".team-portal-page")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  });
}

function showDelegateAlert(message) {
  if (!message || typeof window === "undefined") return;
  window.alert(message);
}

function getDelegateNextAction(match, status) {
  if (!match) {
    return {
      tone: "neutral",
      eyebrow: "Proxima accion",
      title: "Esperar calendario",
      detail: "Cuando la liga publique un partido para tu equipo, aparecera aqui como prioridad.",
      button: "Ver partidos",
      target: "matches"
    };
  }
  if (match.status === "postponed") {
    return {
      tone: "warning",
      eyebrow: "Seguimiento",
      title: "Partido pospuesto",
      detail: match.scheduleNote || "La liga pausó este partido. El reporte se conserva y se reactivara cuando se reprograme.",
      button: "Ver partidos",
      target: "matches"
    };
  }
  if (match.reportStatus === "published" || match.status === "finished" || status?.tone === "published") {
    return {
      tone: "published",
      eyebrow: "Resultado",
      title: "Acta publicada",
      detail: "El resultado ya quedo oficial y disponible para consulta publica.",
      button: "Ver acta",
      target: "acta"
    };
  }
  if (!match.participationSubmitted) {
    return {
      tone: "warning",
      eyebrow: "Proxima accion",
      title: "Enviar participantes",
      detail: "Selecciona solo los jugadores que participaron realmente y define al capitan del partido.",
      button: "Reportar participantes",
      target: "lineup"
    };
  }
  if (["pending_captain_review", "correction_requested", "both_signed"].includes(match.reportStatus) && !match.myTeamSigned) {
    return {
      tone: "warning",
      eyebrow: "Proxima accion",
      title: "Revisar y firmar acta",
      detail: "El acta ya esta disponible. Revisa eventos, resultado y firma digitalmente.",
      button: "Ir a firma",
      target: "acta"
    };
  }
  if (match.myTeamSigned && !match.opponentSigned && !["published", "finished"].includes(match.reportStatus || "")) {
    return {
      tone: "signed",
      eyebrow: "Seguimiento",
      title: "Esperando firma rival",
      detail: "Tu equipo ya firmo. El acta queda pendiente de la otra firma o cierre arbitral.",
      button: "Ver seguimiento",
      target: "acta"
    };
  }
  if (["in_progress", "match_finished", "temporarily_saved"].includes(match.workflowStatus || "")) {
    return {
      tone: "live",
      eyebrow: "Seguimiento",
      title: "Partido en captura",
      detail: "El arbitro esta trabajando el acta. Puedes consultar el avance y el estado de firmas.",
      button: "Ver seguimiento",
      target: "acta"
    };
  }
  return {
    tone: "sent",
    eyebrow: "Proxima accion",
    title: "Participantes enviados",
    detail: "Tu equipo ya reporto participantes. Mantente atento al acta del partido.",
    button: "Ver seguimiento",
    target: "acta"
  };
}

function isDelegateMatchOperational(match) {
  return ["scheduled", "rescheduled", "advanced"].includes(match?.status || "scheduled");
}

function hasDelegateActaAvailable(match) {
  return Boolean(match && (
    match.reportPayload ||
    match.reportStatus === "published" ||
    match.status === "finished" ||
    match.status === "walkover"
  ));
}

function getScheduleChangeText(match) {
  if (!["postponed", "rescheduled", "advanced"].includes(match?.status || "")) return "";
  const previous = [match.originalDate, match.originalTime].filter(Boolean).join(" | ");
  if (match.status === "postponed") return match.scheduleNote || "Pendiente de nueva programacion";
  const prefix = match.status === "advanced" ? "Adelantado" : "Reprogramado";
  return previous ? `${prefix} desde ${previous}` : (match.scheduleNote || prefix);
}

function TeamBadge({ logoUrl, name, tone = "home" }) {
  return (
    <span className={`portal-team-badge ${tone} ${logoUrl ? "has-image" : ""}`}>
      {logoUrl ? <img alt="" loading="lazy" src={logoUrl} /> : <b>{getTeamInitials(name)}</b>}
    </span>
  );
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
  if (type === "teams") {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  }
  if (type === "matches") {
    return <svg {...common}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" /></svg>;
  }
  if (type === "history") {
    return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>;
  }
  if (type === "more") {
    return <svg {...common}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
  }
  return <svg {...common}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
}

function RosterIcon({ type }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };
  if (type === "search") {
    return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  }
  if (type === "filters") {
    return <svg {...common}><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></svg>;
  }
  if (type === "all") {
    return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
  }
  if (type === "goalkeeper") {
    return <svg {...common}><path d="M12 3 5 6v5c0 4.2 2.7 7.7 7 10 4.3-2.3 7-5.8 7-10V6l-7-3Z" /><path d="M9 12h6" /><path d="M12 9v6" /></svg>;
  }
  if (type === "defense") {
    return <svg {...common}><path d="M12 3 5 6v5c0 4.2 2.7 7.7 7 10 4.3-2.3 7-5.8 7-10V6l-7-3Z" /></svg>;
  }
  if (type === "midfield") {
    return <svg {...common}><path d="M4 12h16" /><circle cx="12" cy="12" r="3" /><path d="M12 4v16" /></svg>;
  }
  if (type === "forward") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 7v10" /><path d="m8 11 4-4 4 4" /></svg>;
  }
  return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}

function getTeamPortalCacheKey(userId) {
  return `ligatec-team-portal-cache-${userId || "anonymous"}`;
}

function readTeamPortalCache(userId) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getTeamPortalCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.payload || null;
  } catch {
    return null;
  }
}

function writeTeamPortalCache(userId, payload) {
  if (typeof window === "undefined" || !userId || !payload) return;
  try {
    window.localStorage.setItem(getTeamPortalCacheKey(userId), JSON.stringify({
      payload,
      savedAt: new Date().toISOString()
    }));
  } catch {
    // El portal sigue funcionando aunque el navegador no permita guardar cache local.
  }
}

function getPlayerPositionOptionValue(position) {
  const normalized = String(position || "").toLocaleUpperCase("es-MX");
  if (normalized.includes("ARQUERO") || normalized.includes("PORTERO")) return "Arquero";
  if (normalized.includes("DEFENSOR") || normalized.includes("DEFENSA")) return "Defensor";
  if (normalized.includes("MEDIOCAMPISTA") || normalized.includes("MEDIO")) return "Mediocampista";
  if (normalized.includes("DELANTERO")) return "Delantero";
  return "Delantero";
}

function getDelegatePlayerStatus(player) {
  if (player?.suspension) return { className: "blocked", label: "Suspendido" };
  if (player?.playoffEligibility?.applies && !player.playoffEligibility?.eligible) return { className: "warning", label: "Liguilla" };
  return { className: "available", label: "Disponible" };
}

function getDelegateMatchTone(match) {
  if (match?.status === "postponed") return "warning";
  if (["in_progress", "match_finished", "temporarily_saved"].includes(match?.workflowStatus || "")) return "live";
  if (hasDelegateActaAvailable(match)) return "published";
  if (match?.status === "advanced" || match?.status === "rescheduled") return "rescheduled";
  return "scheduled";
}

function getDelegateMatchRoleLabel(match) {
  return match?.isHome ? "Local" : "Visitante";
}

function getDelegateOpponentRoleLabel(match) {
  return match?.isHome ? "Visitante" : "Local";
}

function DelegateLoadingShell() {
  return (
    <main className="page team-portal-page portal-loading-page">
      <section className="portal-loading-card">
        <img alt="LIGATEC" src={ligatecLogo} />
        <span>Panel delegado</span>
        <strong>Preparando tu equipo</strong>
        <small>Sincronizando plantilla, partidos y actas.</small>
        <div className="portal-loading-bars" aria-hidden="true">
          <b />
          <b />
          <b />
        </div>
      </section>
    </main>
  );
}

export function TeamPortal({ authToken, currentUser, onLogout, onNavigate, publicLeaguePath = "/" }) {
  const initialPayload = useMemo(() => readTeamPortalCache(currentUser?.id), [currentUser?.id]);
  const [context, setContext] = useState(initialPayload?.context || null);
  const [players, setPlayers] = useState(initialPayload?.players || []);
  const [eligiblePlayers, setEligiblePlayers] = useState(initialPayload?.eligiblePlayers || []);
  const [matches, setMatches] = useState(initialPayload?.matches || []);
  const [rosterDrafts, setRosterDrafts] = useState(
    initialPayload ? buildRosterDrafts(initialPayload.matches || [], initialPayload.eligiblePlayers || []) : {}
  );
  const [loading, setLoading] = useState(!initialPayload);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [photoResetKey, setPhotoResetKey] = useState(0);
  const [playerQuery, setPlayerQuery] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [busyPlayerId, setBusyPlayerId] = useState("");
  const [busyMatchId, setBusyMatchId] = useState("");
  const [teamLogoResetKey, setTeamLogoResetKey] = useState(0);
  const [activeView, setActiveView] = useState("home");
  const [delegateMatchTab, setDelegateMatchTab] = useState("upcoming");
  const [actaReturnView, setActaReturnView] = useState("home");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [signingMatchId, setSigningMatchId] = useState("");
  const canManageRoster = Boolean(context?.canManageRoster);
  const rosterPlayers = useMemo(() => (
    eligiblePlayers.length
      ? eligiblePlayers
      : players.map((player) => ({ ...player, isAffiliate: false, originTeamName: context?.teamName || "" }))
  ), [context?.teamName, eligiblePlayers, players]);
  const filteredPlayers = useMemo(() => {
    const tokens = getSearchTokens(playerQuery);
    return rosterPlayers.filter((player) => {
      return searchTokensMatch([
        player.name,
        player.number,
        player.originTeamName,
        player.isAffiliate ? "afiliado" : "propio",
        getPlayerPositionOptionValue(player.position)
      ], tokens);
    });
  }, [playerQuery, rosterPlayers]);
  const visibleRosterPlayers = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      const positionA = PLAYER_POSITION_ORDER[getPlayerPositionOptionValue(a.position)] ?? 99;
      const positionB = PLAYER_POSITION_ORDER[getPlayerPositionOptionValue(b.position)] ?? 99;
      if (positionA !== positionB) return positionA - positionB;
      const numberA = Number(a.number || 9999);
      const numberB = Number(b.number || 9999);
      if (numberA !== numberB) return numberA - numberB;
      return String(a.name || "").localeCompare(String(b.name || ""), "es");
    });
  }, [filteredPlayers]);
  const groupedRosterPlayers = useMemo(() => (
    PLAYER_POSITION_OPTIONS
      .map((position) => ({
        position,
        label: PLAYER_POSITION_LABELS[position],
        players: visibleRosterPlayers.filter((player) => getPlayerPositionOptionValue(player.position) === position)
      }))
      .filter((group) => group.players.length > 0)
  ), [visibleRosterPlayers]);
  const rosterSearchSuggestions = useMemo(() => {
    const tokens = getSearchTokens(playerQuery);
    if (!tokens.length) return [];
    return visibleRosterPlayers
      .filter((player) => searchTokensMatch([player.name, player.number, player.originTeamName, getPlayerPositionOptionValue(player.position)], tokens))
      .slice(0, 5);
  }, [playerQuery, visibleRosterPlayers]);
  const portalMatches = useMemo(() => {
    if (!context?.competitionId) return matches;
    return matches.filter((match) => match.competitionId === context.competitionId);
  }, [context?.competitionId, matches]);
  const selectedMatch = useMemo(
    () => portalMatches.find((match) => match.id === selectedMatchId) || portalMatches[0] || null,
    [portalMatches, selectedMatchId]
  );
  const upcomingMatchItems = useMemo(
    () => portalMatches.filter((match) => match.status !== "finished" && match.status !== "walkover" && match.reportStatus !== "published"),
    [portalMatches]
  );
  const historicalMatchItems = useMemo(
    () => portalMatches.filter((match) => match.status === "finished" || match.status === "walkover" || match.reportStatus === "published" || hasDelegateActaAvailable(match)),
    [portalMatches]
  );
  const lineupPendingMatches = useMemo(
    () => sortDelegatePendingMatches(portalMatches.filter((match) => (
      isDelegateMatchOperational(match) &&
      !hasDelegateActaAvailable(match) &&
      !match.participationSubmitted
    ))),
    [portalMatches]
  );
  const visibleMatchItems = delegateMatchTab === "upcoming"
    ? upcomingMatchItems
    : delegateMatchTab === "history"
    ? historicalMatchItems
    : portalMatches;
  const groupedMatches = useMemo(() => {
    const sortedMatches = [...visibleMatchItems].sort((a, b) => (
      String(a.date || "9999-12-31").localeCompare(String(b.date || "9999-12-31")) ||
      String(a.time || "23:59").localeCompare(String(b.time || "23:59"))
    ));
    const groups = new Map();
    for (const match of sortedMatches) {
      const dateKey = match.date || "sin-fecha";
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(match);
    }
    return [...groups.entries()].map(([date, groupMatches]) => ({ date, matches: groupMatches }));
  }, [visibleMatchItems]);
  const selectedEditingPlayer = useMemo(
    () => rosterPlayers.find((player) => player.id === editingPlayerId) || null,
    [editingPlayerId, rosterPlayers]
  );

  useEffect(() => {
    let cancelled = false;
    const cachedPayload = readTeamPortalCache(currentUser?.id);
    if (cachedPayload) {
      applyPortalPayload(cachedPayload);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchTeamPortal(authToken)
      .then((payload) => {
        if (cancelled) return;
        applyPortalPayload(payload);
        writeTeamPortalCache(currentUser?.id, payload);
        setError("");
      })
      .catch((loadError) => {
        if (cancelled) return;
        const fallbackPayload = cachedPayload || readTeamPortalCache(currentUser?.id);
        if (fallbackPayload) {
          applyPortalPayload(fallbackPayload);
          setNotice("Sin conexion. Mostrando la ultima informacion guardada en este dispositivo.");
          setError("");
          return;
        }
        setError(loadError.message || "No se pudo cargar el portal.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, currentUser?.id]);

  useEffect(() => {
    if (!portalMatches.length) {
      setSelectedMatchId("");
      return;
    }
    setSelectedMatchId((current) => portalMatches.some((match) => match.id === current) ? current : portalMatches[0].id);
  }, [portalMatches]);

  useEffect(() => {
    if (activeView !== "lineup" || !lineupPendingMatches.length) return;
    setSelectedMatchId((current) => lineupPendingMatches.some((match) => match.id === current) ? current : lineupPendingMatches[0].id);
  }, [activeView, lineupPendingMatches]);

  useEffect(() => {
    if (!context || activeView !== "newPlayer" || canManageRoster) return;
    setActiveView("roster");
    setNotice("");
    setError("El registro de plantilla esta cerrado para tu equipo.");
  }, [activeView, canManageRoster, context]);

  useEffect(() => {
    scrollDelegatePortalToTop();
  }, [activeView]);

  function applyPortalPayload(payload) {
    const nextEligiblePlayers = payload.eligiblePlayers || [];
    const nextMatches = payload.matches || [];
    setContext(payload.context);
    setPlayers(payload.players || []);
    setEligiblePlayers(nextEligiblePlayers);
    setMatches(nextMatches);
    setRosterDrafts(buildRosterDrafts(nextMatches, nextEligiblePlayers));
  }

  async function submitPlayer(event) {
    event.preventDefault();
    if (!context?.canManageRoster) {
      showDelegateAlert("El registro de plantilla esta cerrado para tu equipo.");
      setNotice("");
      setError("El registro de plantilla esta cerrado para tu equipo.");
      setActiveView("roster");
      return;
    }

    const form = event.currentTarget;
    const payload = getFormPayload(form);
    setNotice("Guardando jugador...");
    setError("");

    try {
      const photoPayload = await buildImageUploadPayload(payload, "", authToken, context.leagueId, "player-photos");

      const response = await createTeamPortalPlayer(authToken, {
        name: payload.name,
        number: payload.number,
        position: payload.position,
        ...photoPayload
      });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setNotice("Jugador registrado correctamente.");
      showDelegateAlert("Jugador registrado correctamente.");
      form.reset();
      setPhotoResetKey((value) => value + 1);
      setActiveView("roster");
    } catch (saveError) {
      const message = saveError.message || "No se pudo registrar el jugador.";
      setNotice("");
      setError(message);
      showDelegateAlert(message);
    }
  }

  async function submitPlayerEdit(event, player) {
    event.preventDefault();
    if (busyPlayerId) return;

    const payload = getFormPayload(event.currentTarget);
    setBusyPlayerId(player.id);
    setNotice(player.isAffiliate || !context?.canManageRoster ? "Actualizando numero..." : "Actualizando jugador...");
    setError("");

    try {
      const response = player.isAffiliate
        ? await updateTeamPortalAffiliateNumber(authToken, player.id, { number: payload.number })
        : !context?.canManageRoster
          ? await updateTeamPortalPlayer(authToken, player.id, { number: payload.number })
          : await updateTeamPortalPlayer(authToken, player.id, {
              name: payload.name,
              number: payload.number,
              position: payload.position,
              ...(await buildImageUploadPayload(payload, player.photoUrl || "", authToken, context.leagueId, "player-photos"))
            });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setEditingPlayerId("");
      setActiveView("roster");
      const message = player.isAffiliate ? "Numero de afiliado actualizado correctamente." : "Jugador actualizado correctamente.";
      setNotice(message);
      showDelegateAlert(message);
    } catch (saveError) {
      const message = saveError.message || "No se pudo actualizar el jugador.";
      setNotice("");
      setError(message);
      showDelegateAlert(message);
    } finally {
      setBusyPlayerId("");
    }
  }

  async function submitTeamLogo(event) {
    event.preventDefault();
    if (!context) return;
    const payload = getFormPayload(event.currentTarget);
    setNotice("Actualizando escudo...");
    setError("");

    try {
      const imagePayload = await buildImageUploadPayload(payload, context.teamLogoUrl || "", authToken, context.leagueId, "team-logos");
      const response = await updateTeamPortalLogo(authToken, { logoUrl: imagePayload.photoUrl });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setTeamLogoResetKey((value) => value + 1);
      setNotice("Escudo actualizado correctamente.");
      showDelegateAlert("Escudo actualizado correctamente.");
    } catch (saveError) {
      const message = saveError.message || "No se pudo actualizar el escudo.";
      setNotice("");
      setError(message);
      showDelegateAlert(message);
    }
  }

  function updateRosterDraft(matchId, updater) {
    setRosterDrafts((current) => ({
      ...current,
      [matchId]: updater(current[matchId] || { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", jerseyNumbers: {}, notes: "" })
    }));
  }

  async function submitMatchRoster(event, match) {
    event.preventDefault();
    if (busyMatchId) return;
    const draft = rosterDrafts[match.id] || { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", jerseyNumbers: {}, notes: "" };
    if (!draft.playerIds.length) {
      showDelegateAlert("Selecciona al menos un jugador participante.");
      setError("Selecciona al menos un jugador participante.");
      return;
    }
    if (!draft.captainPlayerId || !draft.playerIds.includes(draft.captainPlayerId)) {
      showDelegateAlert("Selecciona un capitan dentro de los participantes.");
      setError("Selecciona un capitan dentro de los participantes.");
      return;
    }
    const confirmed = window.confirm(`¿Enviar participantes de ${context.teamName} vs ${match.opponentName}?\n\nJugadores participantes: ${draft.playerIds.length}\nCapitan: ${getEligiblePlayerName(eligiblePlayers, draft.captainPlayerId)}\n\nEste reporte quedara bloqueado para conteo de partidos jugados.`);
    if (!confirmed) return;

    setBusyMatchId(match.id);
    setNotice("Enviando participantes...");
    setError("");
    try {
      const response = await submitTeamMatchParticipation(authToken, match.id, {
        playerIds: draft.playerIds,
        captainPlayerId: draft.captainPlayerId,
        jerseyNumbers: draft.jerseyNumbers || {},
        notes: draft.notes || ""
      });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setNotice("Participantes enviados y bloqueados correctamente.");
      showDelegateAlert("Participantes enviados y bloqueados correctamente.");
    } catch (saveError) {
      const message = saveError.message || "No se pudo enviar participantes.";
      setNotice("");
      setError(message);
      showDelegateAlert(message);
    } finally {
      setBusyMatchId("");
    }
  }

  async function submitReportSignature(event) {
    event.preventDefault();
    if (!activeMatch || signingMatchId) return;

    setSigningMatchId(activeMatch.id);
    setNotice("Firmando acta...");
    setError("");
    try {
      const response = await signTeamMatchReport(authToken, activeMatch.id, {});
      if (response.payload) {
        applyPortalPayload(response.payload);
        writeTeamPortalCache(currentUser?.id, response.payload);
      }
      const message = response.readyToFinalize ? "Acta firmada. Ambos equipos ya completaron firmas." : "Acta firmada correctamente.";
      setNotice(message);
      showDelegateAlert(message);
    } catch (signError) {
      const message = signError.message || "No se pudo firmar el acta.";
      setNotice("");
      setError(message);
      showDelegateAlert(message);
    } finally {
      setSigningMatchId("");
    }
  }

  if (loading) {
    return <DelegateLoadingShell />;
  }

  if (error && !context) {
    return (
      <main className="page team-portal-page">
        <section className="panel">
          <SectionHeading eyebrow="Portal de equipo" title="No disponible" />
          <p className="auth-error">{error}</p>
        </section>
      </main>
    );
  }

  const operationalUpcomingMatches = sortDelegatePendingMatches(upcomingMatchItems.filter(isDelegateMatchOperational));
  const nextLineupMatch = lineupPendingMatches[0] || null;
  const nextMatch = nextLineupMatch || operationalUpcomingMatches[0] || upcomingMatchItems[0] || portalMatches[0] || null;
  const submittedRosters = portalMatches.filter((match) => match.participationSubmitted).length;
  const openRosterMatches = lineupPendingMatches.length;
  const positionCounts = PLAYER_POSITION_OPTIONS.map((position) => ({
    position,
    count: rosterPlayers.filter((player) => getPlayerPositionOptionValue(player.position) === position).length
  }));
  const ownRosterCount = rosterPlayers.filter((player) => !player.isAffiliate).length;
  const affiliateRosterCount = rosterPlayers.filter((player) => player.isAffiliate).length;
  const nextMatchStatus = getDelegateMatchStatus(nextMatch);
  const activeMatch = selectedMatch || nextMatch;
  const secondaryLineupMatches = activeMatch
    ? lineupPendingMatches.filter((match) => match.id !== activeMatch.id)
    : lineupPendingMatches.slice(1);
  const activeMatchStatus = getDelegateMatchStatus(activeMatch);
  const activeScore = getTeamScore(activeMatch);
  const activeHomeTeamName = activeMatch ? (activeMatch.isHome ? context.teamName : activeMatch.opponentName) : "";
  const activeAwayTeamName = activeMatch ? (activeMatch.isHome ? activeMatch.opponentName : context.teamName) : "";
  const activeReportPayload = activeMatch?.reportPayload && typeof activeMatch.reportPayload === "object" ? activeMatch.reportPayload : {};
  const activeReportObservations = String(activeReportPayload.observations || activeMatch?.observations || "").trim();
  const activeReportEvents = getReportEvents(activeMatch);
  const activeParticipationPlayers = Array.isArray(activeMatch?.participation?.players) ? activeMatch.participation.players : [];
  const activeParticipationCaptain = activeParticipationPlayers.find((player) => player.playerId === activeMatch?.participation?.captainPlayerId);
  const activeReportCanSign = Boolean(
    activeMatch &&
    !activeMatch.myTeamSigned &&
    ["pending_captain_review", "correction_requested", "both_signed", "finalized", "published"].includes(activeMatch.reportStatus)
  );
  const activeActaReadOnly = Boolean(activeMatch && (
    activeMatch.reportStatus === "published" ||
    activeMatch.status === "finished" ||
    activeMatch.status === "walkover"
  ));
  const activeLineupAvailable = Boolean(
    activeMatch &&
    !activeMatch.participationSubmitted &&
    isDelegateMatchOperational(activeMatch) &&
    !hasDelegateActaAvailable(activeMatch)
  );
  const activeDraft = activeMatch
    ? rosterDrafts[activeMatch.id] || { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", jerseyNumbers: {}, notes: "" }
    : { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", jerseyNumbers: {}, notes: "" };
  const activeAvailablePlayers = activeMatch
    ? eligiblePlayers.filter((player) => {
        const blockedBySuspension = Boolean(player.suspension);
        const blockedByPlayoff = activeMatch.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
        return !blockedBySuspension && !blockedByPlayoff;
      })
    : [];
  const selectedEditingPlayerCanEditFull = Boolean(selectedEditingPlayer && !selectedEditingPlayer.isAffiliate && canManageRoster);
  const navItems = [
    { id: "home", label: "Inicio", icon: "home" },
    { id: "roster", label: "Plantilla", icon: "teams" },
    { id: "matches", label: "Partidos", icon: "matches" },
    { id: "lineup", label: "Participantes", icon: "history" },
    { id: "tools", label: "Mas", icon: "more" }
  ];
  const isActaView = activeView === "acta";
  const isPlayerEditView = activeView === "player";
  const isPlayerCreateView = activeView === "newPlayer";
  const isExclusiveView = isActaView || isPlayerEditView || isPlayerCreateView;
  const activeReferees = activeMatch ? [
    ["Arbitro central", activeMatch.centralRefereeName],
    ["Auxiliar 1", activeMatch.assistantReferee1Name],
    ["Auxiliar 2", activeMatch.assistantReferee2Name],
    ["Cuarto arbitro", activeMatch.fourthRefereeName]
  ].filter(([, name]) => name) : [];
  const nextAction = getDelegateNextAction(nextMatch, nextMatchStatus);
  const nextActionChecks = nextMatch ? [
    { label: "Participantes enviados", done: Boolean(nextMatch.participationSubmitted) },
    { label: "Rival reportado", done: Boolean(nextMatch.opponentParticipationSubmitted) },
    { label: "Acta activa", done: nextMatchStatus.step >= 3 },
    { label: "Firma del equipo", done: Boolean(nextMatch.myTeamSigned) }
  ] : [
    { label: "Plantilla lista", done: players.length > 0 },
    { label: "Calendario pendiente", done: false }
  ];
  const openMatchWorkflow = (match) => {
    if (!match) return;
    setSelectedMatchId(match.id);
    if (hasDelegateActaAvailable(match)) {
      setActaReturnView(activeView === "matches" ? "matches" : "home");
      setActiveView("acta");
      return;
    }
    if (!isDelegateMatchOperational(match)) {
      setActiveView("matches");
      return;
    }
    if (match.participationSubmitted) setActaReturnView(activeView === "matches" ? "matches" : "home");
    setActiveView(match.participationSubmitted ? "acta" : "lineup");
  };
  const openDelegateNextAction = () => {
    if (nextAction.target === "lineup" && nextLineupMatch) {
      setSelectedMatchId(nextLineupMatch.id);
      setActiveView("lineup");
      return;
    }
    if (nextAction.target === "acta" && nextMatch) {
      setSelectedMatchId(nextMatch.id);
      setActaReturnView("home");
      setActiveView("acta");
      return;
    }
    setActiveView(nextAction.target || "matches");
  };
  const openDelegateNavItem = (itemId) => {
    if (itemId === "lineup") {
      if (nextLineupMatch) setSelectedMatchId(nextLineupMatch.id);
      setActiveView("lineup");
      return;
    }
    setActiveView(itemId);
  };
  return (
    <main className={`page team-portal-page portal-mobile-shell portal-board-shell delegate-view-${activeView} ${isExclusiveView ? "delegate-acta-exclusive-page" : ""}`} id="delegate-home">
      <div className="portal-board-layout delegate-board">
        <section className={`delegate-phone-frame ${isExclusiveView ? "delegate-acta-frame" : ""}`}>
          {!isActaView && <div className="delegate-app-header">
            {activeView === "home" ? (
              <span className="delegate-app-logo">
                <img alt="LIGATEC" src={ligatecLogo} />
              </span>
            ) : (
              <button
                className="delegate-back-button"
                type="button"
                onClick={() => {
                  if (isPlayerEditView || isPlayerCreateView) {
                    setEditingPlayerId("");
                    setActiveView("roster");
                    return;
                  }
                  setActiveView("home");
                }}
                aria-label={isPlayerEditView || isPlayerCreateView ? "Regresar a plantilla" : "Regresar al inicio"}
              >
                ‹
              </button>
            )}
            <div>
              <small>{activeView === "home" ? "Panel delegado" : String(getDelegateViewLabel(activeView, navItems))}</small>
              <strong>{isPlayerEditView ? selectedEditingPlayer?.name || "Jugador" : isPlayerCreateView ? "Agregar jugador" : context.teamName}</strong>
              <em>{isPlayerEditView ? `#${selectedEditingPlayer?.number || "-"} ${getPlayerPositionOptionValue(selectedEditingPlayer?.position)}` : isPlayerCreateView ? "Plantilla del equipo" : context.competitionName || "Categoria asignada"}</em>
            </div>
            {activeView === "home" && (
              <div className="delegate-header-actions">
                <button
                  className="delegate-public-button"
                  type="button"
                  onClick={() => {
                    if (onNavigate) onNavigate(publicLeaguePath);
                    else window.location.href = publicLeaguePath;
                  }}
                >
                  Ir a liga
                </button>
                <button className="delegate-logout-button" type="button" onClick={onLogout}>Cerrar sesion</button>
              </div>
            )}
            {activeView === "matches" && (
              <button
                className="delegate-header-filter-button"
                type="button"
                onClick={() => setDelegateMatchTab((current) => current === "all" ? "upcoming" : "all")}
              >
                <RosterIcon type="filters" />
                <span>Filtros</span>
              </button>
            )}
          </div>}

          {activeView === "home" && (
            <div className="delegate-view-stack delegate-home-screen">
              {nextMatch ? (
                <article className="delegate-home-match-card">
                  <div className="delegate-home-match-card-head">
                    <span>Jornada en curso</span>
                    <span className={`portal-status-pill ${nextMatchStatus.tone}`}>{nextMatchStatus.label}</span>
                  </div>
                  <div className="delegate-home-match-date">
                    <span>{nextMatch.date || "Fecha por definir"}</span>
                    <b>•</b>
                    <span>{nextMatch.time || "Hora por definir"}</span>
                  </div>
                  <div className="delegate-home-teams">
                    <div className="delegate-home-team local">
                      <TeamBadge logoUrl={context.teamLogoUrl} name={context.teamName} />
                      <strong>{context.teamName}</strong>
                      <small>{context.competitionName || "Categoria"}</small>
                      <em>{nextMatch.isHome ? "Local" : "Visitante"}</em>
                    </div>
                    <b className="delegate-home-vs">VS</b>
                    <div className="delegate-home-team away">
                      <TeamBadge name={nextMatch.opponentName} tone="away" />
                      <strong>{nextMatch.opponentName}</strong>
                      <small>{context.competitionName || "Categoria"}</small>
                      <em>{nextMatch.isHome ? "Visitante" : "Local"}</em>
                    </div>
                  </div>
                  <div className="delegate-home-match-meta">
                    <span><PortalNavIcon type="matches" /><small>Jornada</small><b>{nextMatch.round || "-"}</b></span>
                    <span><PortalNavIcon type="home" /><small>Cancha</small><b>{nextMatch.venue || "Por definir"}</b></span>
                    <span><PortalNavIcon type="history" /><small>Formato</small><b>{nextMatch.captureMode === "manual" ? "Acta manual" : "Acta digital"}</b></span>
                  </div>
                  {getScheduleChangeText(nextMatch) && <small className="delegate-schedule-note">{getScheduleChangeText(nextMatch)}</small>}
                  <button className="delegate-home-primary-action" type="button" onClick={() => setActiveView("matches")}>
                    <PortalNavIcon type="matches" />
                    <span>Ver partidos</span>
                    <b>›</b>
                  </button>
                  <small className="delegate-home-footnote"><i />{nextMatchStatus.detail}</small>
                </article>
              ) : (
                <article className="delegate-home-match-card empty-state">
                  <div className="portal-card-head">
                    <strong>Proximo partido</strong>
                    <span className="portal-status-pill neutral">Sin programar</span>
                  </div>
                  <p className="helper-text">Cuando la liga publique una jornada para tu equipo, aparecera aqui.</p>
                </article>
              )}

              <article className={`delegate-home-state-card ${nextAction.tone}`}>
                <div className="delegate-home-state-head">
                  <span>Estado actual</span>
                </div>
                <div className="delegate-home-state-main">
                  <PortalNavIcon type={nextAction.target === "acta" ? "history" : nextAction.target === "lineup" ? "teams" : "matches"} />
                  <div>
                    <strong>{nextAction.title}</strong>
                    <small>{nextAction.detail}</small>
                  </div>
                  <button type="button" onClick={openDelegateNextAction}>{nextAction.button}<b>›</b></button>
                </div>
                <div className="delegate-home-checks">
                  {nextActionChecks.map((item) => (
                    <span className={item.done ? "done" : ""} key={item.label}>
                      <b>{item.done ? "✓" : "•"}</b>
                      {item.label}
                    </span>
                  ))}
                </div>
              </article>

              <div className="delegate-home-summary">
                <span><PortalNavIcon type="teams" /><b>{players.length}</b><small>Plantilla total</small></span>
                <span><PortalNavIcon type="matches" /><b>{submittedRosters}</b><small>Enviadas</small></span>
                <span><PortalNavIcon type="history" /><b>{openRosterMatches}</b><small>Pendientes</small></span>
              </div>

              <div className="portal-flow-strip delegate compact delegate-home-flow" aria-label="Flujo del delegado">
                {["Convocatoria", "Curso", "Acta", "Firma", "Publicado"].map((label, index) => (
                  <span className={nextMatchStatus.step >= index + 1 ? "active" : ""} key={label}><b>{index + 1}</b> {label}</span>
                ))}
              </div>
            </div>
          )}

          {activeView === "matches" && (
            <div className="delegate-view-stack delegate-matches-screen">
              <div className="delegate-match-tabs" role="tablist" aria-label="Filtro de partidos">
                <button className={delegateMatchTab === "upcoming" ? "active" : ""} type="button" onClick={() => setDelegateMatchTab("upcoming")}>
                  <PortalNavIcon type="matches" /><span>Proximos</span><b>{upcomingMatchItems.length}</b>
                </button>
                <button className={delegateMatchTab === "history" ? "active" : ""} type="button" onClick={() => setDelegateMatchTab("history")}>
                  <PortalNavIcon type="history" /><span>Historial</span><b>{historicalMatchItems.length}</b>
                </button>
                <button className={delegateMatchTab === "all" ? "active" : ""} type="button" onClick={() => setDelegateMatchTab("all")}>
                  <RosterIcon type="filters" /><span>Todos</span><b>{portalMatches.length}</b>
                </button>
              </div>
              <div className="delegate-match-board-list">
                {groupedMatches.map((group) => (
                  <section className="delegate-match-day-group" key={group.date}>
                    <header>
                      <PortalNavIcon type="matches" />
                      <strong>{group.date === "sin-fecha" ? "Fecha por definir" : formatDate(group.date)}</strong>
                      <span>{group.matches.length} partido(s)</span>
                    </header>
                    {group.matches.map((match) => {
                      const status = getDelegateMatchStatus(match);
                      const score = getTeamScore(match);
                      const actaAvailable = hasDelegateActaAvailable(match);
                      const tone = getDelegateMatchTone(match);
                      return (
                        <article
                          className={`delegate-match-card-app ${tone} ${selectedMatchId === match.id ? "selected" : ""}`}
                          key={match.id}
                        >
                          <div className="delegate-match-card-side">
                            <strong>{match.time || "--:--"}</strong>
                            <span><PortalNavIcon type="home" /></span>
                            <small>{match.venue || "Cancha por definir"}</small>
                          </div>
                          <div className="delegate-match-card-main">
                            <span className="delegate-match-round-pill">Jornada {match.round || "-"}</span>
                            <div className="delegate-match-card-teams">
                              <div>
                                <TeamBadge logoUrl={context.teamLogoUrl} name={context.teamName} />
                                <strong>{context.teamName}</strong>
                                <small>{context.competitionName || "Categoria"}</small>
                                <em>{getDelegateMatchRoleLabel(match)}</em>
                              </div>
                              <b>VS</b>
                              <div>
                                <TeamBadge logoUrl={match.opponentLogoUrl} name={match.opponentName} tone="away" />
                                <strong>{match.opponentName}</strong>
                                <small>{context.competitionName || "Categoria"}</small>
                                <em>{getDelegateOpponentRoleLabel(match)}</em>
                              </div>
                            </div>
                            <div className="delegate-match-card-checks">
                              <span className={match.participationSubmitted ? "done" : ""}><b>{match.participationSubmitted ? "✓" : "○"}</b>Participantes {match.participationSubmitted ? "enviados" : "pendientes"}</span>
                              <span className={actaAvailable ? "done" : ""}><b>{actaAvailable ? "✓" : "○"}</b>Acta {actaAvailable ? "activa" : "pendiente"}</span>
                              <span className={match.myTeamSigned ? "done" : ""}><b>{match.myTeamSigned ? "✓" : "○"}</b>Firma {match.myTeamSigned ? "lista" : "pendiente"}</span>
                            </div>
                          </div>
                          <div className="delegate-match-card-action">
                            {actaAvailable ? (
                              <button type="button" onClick={() => openMatchWorkflow(match)}>
                                <span>Ver acta</span>
                                <strong>{score.own} - {score.opponent}</strong>
                              </button>
                            ) : isDelegateMatchOperational(match) ? (
                              <button type="button" onClick={() => openMatchWorkflow(match)}>
                                <span>{match.participationSubmitted ? "Seguimiento" : "Participantes"}</span>
                                <strong>{status.label}</strong>
                              </button>
                            ) : (
                              <span className="delegate-match-disabled-action">{status.label}</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ))}
                {!visibleMatchItems.length && <p className="empty">No hay partidos para este filtro.</p>}
              </div>
              {historicalMatchItems.length > 0 && (
                <article className="delegate-match-published-summary">
                  <span><PortalNavIcon type="history" /></span>
                  <div>
                    <small>Resultado publicado</small>
                    <strong>Resultado oficial disponible</strong>
                    <p>Consulta las actas resueltas de tu equipo en modo lectura.</p>
                  </div>
                  <button type="button" onClick={() => setDelegateMatchTab("history")}>Ver actas</button>
                </article>
              )}
            </div>
          )}

          {activeView === "acta" && (
            <div className="delegate-view-stack delegate-acta-screen">
              {activeMatch ? (
                <>
                  <div className="delegate-acta-exclusive-head">
                    <button type="button" onClick={() => setActiveView(actaReturnView || "home")} aria-label="Regresar">‹</button>
                    <div>
                      <strong>{activeActaReadOnly ? "Acta resuelta" : "Acta del partido"}</strong>
                      <small>{activeHomeTeamName} vs {activeAwayTeamName}</small>
                    </div>
                  </div>
                  <article className="delegate-acta-hero">
                    <img className="delegate-acta-watermark" alt="" src={ligatecLogo} aria-hidden="true" />
                    <div className="portal-card-head">
                      <span className={`portal-status-pill ${activeMatchStatus.tone}`}>{activeMatchStatus.label}</span>
                    </div>
                    <strong>Resumen del acta</strong>
                    <small>{formatMatchDate(activeMatch)} | Jornada {activeMatch.round || "-"} | {activeMatch.venue || "Cancha por definir"}</small>
                    <div className="delegate-sign-score delegate-acta-score">
                      <span>{activeHomeTeamName}</span>
                      <b>{Number(activeMatch.homeGoals ?? 0)} - {Number(activeMatch.awayGoals ?? 0)}</b>
                      <span>{activeAwayTeamName}</span>
                    </div>
                    <div className="delegate-acta-summary-grid">
                      <span><small>Eventos</small><strong>{activeReportEvents.length}</strong></span>
                      <span><small>Tiempo extra</small><strong>{activeReportPayload.extraTimeEnabled ? `${activeReportPayload.extraTimeHomeGoals ?? 0} - ${activeReportPayload.extraTimeAwayGoals ?? 0}` : "No"}</strong></span>
                      <span><small>Penales</small><strong>{activeReportPayload.penaltiesEnabled ? `${activeReportPayload.penaltyHomeGoals ?? 0} - ${activeReportPayload.penaltyAwayGoals ?? 0}` : "No"}</strong></span>
                    </div>
                    {activeReportObservations && <p>{activeReportObservations}</p>}
                  </article>

                  <article className="delegate-match-detail delegate-acta-details">
                    <div className="portal-card-head">
                      <strong>{activeActaReadOnly ? "Consulta publica del acta" : "Datos del partido"}</strong>
                      <span>{activeMatch.captureMode === "manual" ? "Acta manual" : "Acta digital"}</span>
                    </div>
                    <div className="delegate-acta-detail-grid">
                      <span><small>Fecha</small><strong>{activeMatch.date || "Por definir"}</strong></span>
                      <span><small>Hora</small><strong>{activeMatch.time || "Por definir"}</strong></span>
                      <span><small>Cancha</small><strong>{activeMatch.venue || "Por definir"}</strong></span>
                      <span><small>Jornada</small><strong>{activeMatch.round || "-"}</strong></span>
                    </div>
                    {!activeMatch.participationSubmitted && (
                      <button className="portal-primary-action" type="button" onClick={() => setActiveView("lineup")}>
                        Reportar participantes
                      </button>
                    )}
                    {activeReferees.length > 0 && (
                      <div className="delegate-acta-officials">
                        <strong>Cuerpo arbitral</strong>
                        {activeReferees.map(([label, name]) => (
                          <span key={label}><small>{label}</small><b>{name}</b></span>
                        ))}
                      </div>
                    )}
                  </article>

                  {activeParticipationPlayers.length > 0 && (
                    <article className="delegate-match-detail">
                      <div className="portal-card-head">
                        <strong>Participantes reportados</strong>
                        <span>{activeParticipationPlayers.length}</span>
                      </div>
                      {activeParticipationCaptain && (
                        <p className="delegate-sign-note">Capitan: {activeParticipationCaptain.playerNameSnapshot}</p>
                      )}
                      <div className="delegate-acta-mini-events full">
                        {activeParticipationPlayers.map((player) => (
                          <span className="delegate-acta-event-row" key={player.id || player.playerId}>
                            <b>{player.playerNumberSnapshot || "-"}</b>
                            <small>
                              <em>{player.playerNameSnapshot}</em>
                              <span>{player.playerId === activeMatch.participation?.captainPlayerId ? "Capitan" : "Participante"}</span>
                              <i>{context.teamName}</i>
                            </small>
                          </span>
                        ))}
                      </div>
                    </article>
                  )}

                  <article className="delegate-match-detail">
                    <div className="portal-card-head">
                      <strong>Eventos registrados</strong>
                      <span>{activeReportEvents.length}</span>
                    </div>
                    <div className="delegate-acta-mini-events full">
                      {activeReportEvents.map((eventItem, index) => {
                        const minute = getReportEventMinute(eventItem);
                        const detail = getReportEventDetail(eventItem);
                        const secondaryName = getDelegateReportEventSecondaryName(eventItem);
                        return (
                          <span className={`delegate-acta-event-row event-kind-${eventItem.type || "event"} ${minute ? "" : "without-minute"}`} key={`${eventItem.id || eventItem.localUuid || eventItem.minute || eventItem.type || "event"}-${index}`}>
                            <b>{getReportEventIcon(eventItem)}</b>
                            {minute && <strong>{minute}</strong>}
                            <small>
                              <em>{getReportEventLabel(eventItem)}</em>
                              <span>{getDelegateReportEventPlayerName(eventItem)}</span>
                              {secondaryName && <span>{secondaryName}</span>}
                              {detail && <span>{detail}</span>}
                              <i>{getDelegateReportEventTeamName(activeMatch, eventItem, context)}</i>
                            </small>
                          </span>
                        );
                      })}
                      {!activeReportEvents.length && <small>No hay eventos registrados en el acta preliminar.</small>}
                    </div>
                    {activeReportObservations && (
                      <div className="delegate-acta-notes-card">
                        <span>Observaciones</span>
                        <p>{activeReportObservations}</p>
                      </div>
                    )}
                  </article>

                  {!activeActaReadOnly && (
                  <article className="delegate-sign-card">
                    <div className="portal-card-head">
                      <strong>Firma digital</strong>
                      <span className={`portal-status-pill ${activeMatch.myTeamSigned ? "signed" : activeReportCanSign ? "warning" : "neutral"}`}>
                        {activeMatch.myTeamSigned ? "Firmada" : activeReportCanSign ? "Pendiente" : "No disponible"}
                      </span>
                    </div>
                    {activeMatch.myTeamSigned ? (
                      <p className="delegate-sign-note">Tu equipo ya firmo esta acta. El arbitro vera la firma automaticamente en su panel.</p>
                    ) : (
                      <form className="delegate-acta-sign-form" onSubmit={submitReportSignature}>
                        <p className="delegate-sign-note">Confirma que revisaste el acta antes de firmarla digitalmente.</p>
                        <button className="portal-primary-action" type="submit" disabled={!activeReportCanSign || signingMatchId === activeMatch.id}>
                          {signingMatchId === activeMatch.id ? "Firmando..." : "Firmar acta"}
                        </button>
                      </form>
                    )}
                  </article>
                  )}
                </>
              ) : (
                <p className="empty">Selecciona un partido para revisar el acta.</p>
              )}
            </div>
          )}

          {activeView === "lineup" && (
            <div className="delegate-view-stack delegate-lineup-screen">
              {!nextLineupMatch ? (
                <article className="delegate-match-detail">
                  <span className="portal-status-pill neutral">Sin reporte pendiente</span>
                  <strong>No hay partidos disponibles para reportar participantes.</strong>
                  <small>Los participantes se reportan por partido y quedan bloqueados para conteo de PJ.</small>
                  <button className="portal-primary-action" type="button" onClick={() => setActiveView("matches")}>Ver partidos</button>
                </article>
              ) : activeMatch && !activeLineupAvailable ? (
                <article className="delegate-match-detail">
                  <span className={`portal-status-pill ${activeMatchStatus.tone}`}>{activeMatchStatus.label}</span>
                  <strong>{context.teamName} vs {activeMatch.opponentName}</strong>
                  <small>{hasDelegateActaAvailable(activeMatch) ? "Este partido ya tiene acta disponible. Puedes revisarla en modo lectura." : getScheduleChangeText(activeMatch) || activeMatchStatus.detail}</small>
                  <button className="portal-primary-action" type="button" onClick={() => openMatchWorkflow(hasDelegateActaAvailable(activeMatch) ? activeMatch : nextLineupMatch)}>
                    {hasDelegateActaAvailable(activeMatch) ? "Ver acta" : "Ir a participantes pendientes"}
                  </button>
                </article>
              ) : activeMatch ? (
                <form className="delegate-lineup-form" onSubmit={(event) => submitMatchRoster(event, activeMatch)}>
                  <article className="delegate-match-detail delegate-lineup-match-card">
                    <span className={`portal-status-pill ${activeMatchStatus.tone}`}>{activeMatchStatus.label}</span>
                    <div className="delegate-lineup-versus">
                      <span>
                        <TeamBadge logoUrl={context.teamLogoUrl} name={context.teamName} />
                        <strong>{context.teamName}</strong>
                        <small>{getDelegateMatchRoleLabel(activeMatch)}</small>
                      </span>
                      <b>VS</b>
                      <span>
                        <TeamBadge logoUrl={activeMatch.opponentLogoUrl} name={activeMatch.opponentName} tone="away" />
                        <strong>{activeMatch.opponentName}</strong>
                        <small>{getDelegateOpponentRoleLabel(activeMatch)}</small>
                      </span>
                    </div>
                    <div className="delegate-lineup-meta">
                      <span><PortalNavIcon type="matches" />{formatMatchDate(activeMatch)}</span>
                      <span><PortalNavIcon type="home" />{activeMatch.venue || "Cancha por definir"}</span>
                      <span><RosterIcon type="all" />Jornada {activeMatch.round || "-"}</span>
                    </div>
                  </article>
                  {secondaryLineupMatches.length > 0 && (
                    <section className="delegate-lineup-pending-queue" aria-label="Partidos pendientes compactados">
                      <div className="delegate-lineup-pending-head">
                        <div>
                          <strong>Otros pendientes</strong>
                          <small>El principal queda abierto; al enviar participantes se retira de esta lista.</small>
                        </div>
                        <span>{secondaryLineupMatches.length}</span>
                      </div>
                      <div className="delegate-lineup-pending-list">
                        {secondaryLineupMatches.map((match) => (
                          <button
                            className={selectedMatchId === match.id ? "active" : ""}
                            key={match.id}
                            type="button"
                            onClick={() => setSelectedMatchId(match.id)}
                          >
                            <span>J{match.round || "-"}</span>
                            <strong>{match.opponentName || "Rival"}</strong>
                            <small>{formatDate(match.date)} · {match.time || "--:--"} · {getDelegateMatchOpponentLine(match)}</small>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="delegate-lineup-summary">
                    <span><b>{activeDraft.playerIds?.length || 0}</b> Participantes</span>
                    <span><b>{activeDraft.captainPlayerId ? 1 : 0}</b> Capitan</span>
                    <span><b>{activeMatch.participationSubmitted ? "OK" : "Pendiente"}</b> Reporte</span>
                  </div>
                  <div className="delegate-lineup-control-card">
                    <label>Capitan
                      <select
                        value={activeDraft.captainPlayerId}
                        onChange={(event) => updateRosterDraft(activeMatch.id, (current) => ({ ...current, captainPlayerId: event.target.value }))}
                      >
                        <option value="">Selecciona capitan</option>
                        {activeAvailablePlayers.filter((player) => activeDraft.playerIds.includes(player.id)).map((player) => (
                          <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}{player.isAffiliate ? ` | AFILIADO ${player.originTeamName || ""}` : ""}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="delegate-lineup-list-head">
                    <strong>Jugadores disponibles</strong>
                    <span>{activeDraft.playerIds?.length || 0}/{eligiblePlayers.length}</span>
                  </div>
                  <div className="team-match-player-grid delegate-player-select">
                    {eligiblePlayers.map((player) => {
                      const blockedBySuspension = Boolean(player.suspension);
                      const blockedByPlayoff = activeMatch.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
                      const disabled = blockedBySuspension || blockedByPlayoff;
                      const checked = activeDraft.playerIds.includes(player.id) && !disabled;
                      const jerseyNumber = activeDraft.jerseyNumbers?.[player.id] ?? player.number ?? "";
                      const suspensionLabel = player.suspension?.pendingReview
                        ? `Expulsado sujeto a comision: ${player.suspension.reason || "Revision disciplinaria"}`
                        : player.suspension?.indefinite
                        ? `Inhabilitado indefinido: ${player.suspension.reason || player.suspension.type || "Sancion activa"}`
                        : `Suspendido${player.suspension?.remainingMatches ? ` (${player.suspension.remainingMatches} juego(s))` : ""}${player.suspension?.returnRound ? ` | Regresa J${player.suspension.returnRound}` : ""}`;
                      return (
                        <label className={disabled ? "blocked" : ""} key={player.id}>
                          <input
                            checked={checked}
                            disabled={disabled}
                            type="checkbox"
                            onChange={(event) => updateRosterDraft(activeMatch.id, (current) => {
                              const nextIds = new Set(current.playerIds || []);
                              if (event.target.checked) nextIds.add(player.id);
                              else nextIds.delete(player.id);
                              const playerIds = [...nextIds];
                              return {
                                ...current,
                                playerIds,
                                starters: event.target.checked
                                  ? [...new Set([...(current.starters || []), player.id])]
                                  : (current.starters || []).filter((playerId) => playerId !== player.id),
                                substitutes: (current.substitutes || []).filter((playerId) => playerId !== player.id),
                                jerseyNumbers: {
                                  ...(current.jerseyNumbers || {}),
                                  [player.id]: normalizeJerseyNumberInput(current.jerseyNumbers?.[player.id] ?? player.number ?? "")
                                },
                                captainPlayerId: playerIds.includes(current.captainPlayerId) ? current.captainPlayerId : "",
                                goalkeeperPlayerId: playerIds.includes(current.goalkeeperPlayerId) ? current.goalkeeperPlayerId : ""
                              };
                            })}
                          />
                          <span>
                            <strong>{player.name}{player.isAffiliate && <em className="delegate-affiliate-pill">Afiliado</em>}</strong>
                            <small>
                              {disabled
                                ? suspensionLabel
                                : `${player.isAffiliate ? `Origen: ${player.originTeamName || "Equipo afiliado"} | ` : ""}No. #${player.number || "-"} | ${player.position || "Jugador"}`}
                            </small>
                          </span>
                          {checked && (
                            <div className="delegate-lineup-player-tools">
                              <span className="delegate-jersey-field">
                                <em>No. playera</em>
                                <input
                                  aria-label={`Numero de playera de ${player.name}`}
                                  inputMode="numeric"
                                  maxLength={4}
                                  value={jerseyNumber}
                                  onChange={(event) => updateRosterDraft(activeMatch.id, (current) => ({
                                    ...current,
                                    jerseyNumbers: {
                                      ...(current.jerseyNumbers || {}),
                                      [player.id]: normalizeJerseyNumberInput(event.target.value)
                                    }
                                  }))}
                                />
                              </span>
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <label className="wide-field">Notas del reporte
                    <input
                      value={activeDraft.notes || ""}
                      onChange={(event) => updateRosterDraft(activeMatch.id, (current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Ej. Observacion sobre participantes"
                    />
                  </label>
                  <button className="portal-primary-action" type="submit" disabled={activeMatch.participationSubmitted || busyMatchId === activeMatch.id}>
                    {busyMatchId === activeMatch.id ? "Enviando..." : activeMatch.participationSubmitted ? "Participantes enviados" : "Enviar participantes"}
                  </button>
                </form>
              ) : (
                <p className="empty">Selecciona un partido para reportar participantes.</p>
              )}
            </div>
          )}

          {activeView === "roster" && (
            <div className="delegate-view-stack delegate-roster-screen">
              <section className="delegate-roster-hero">
                <span className={`delegate-roster-crest ${context.teamLogoUrl ? "has-image" : ""}`}>
                  {context.teamLogoUrl ? <img alt="" loading="lazy" src={context.teamLogoUrl} /> : <b>{getTeamInitials(context.teamName)}</b>}
                </span>
                <div>
                  <span>Plantilla del equipo</span>
                  <strong>{rosterPlayers.length} jugadores</strong>
                  <small>{canManageRoster ? "Registro abierto sin limite de integrantes." : "Registro cerrado. Numeros disponibles para edicion."}</small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!canManageRoster) {
                      showDelegateAlert("El registro de plantilla esta cerrado para tu equipo.");
                      setNotice("");
                      setError("El registro de plantilla esta cerrado para tu equipo.");
                      return;
                    }
                    setEditingPlayerId("");
                    setActiveView("newPlayer");
                  }}
                  disabled={!canManageRoster}
                >
                  {canManageRoster ? <><RosterIcon type="plus" />Nuevo jugador</> : "Registro cerrado"}
                </button>
              </section>
              <div className="delegate-roster-metrics">
                <span><b>{rosterPlayers.length}</b> Total</span>
                <span><b>{ownRosterCount}</b> Propios</span>
                <span><b>{affiliateRosterCount}</b> Afiliados</span>
                {positionCounts.map((item) => (
                  <span key={item.position}><b>{item.count}</b> {PLAYER_POSITION_LABELS[item.position]}</span>
                ))}
              </div>
              <div className="team-portal-filters delegate-roster-tools">
                <div className="delegate-roster-search-row">
                  <label className="delegate-search-field">
                    <span aria-hidden="true"><RosterIcon type="search" /></span>
                    <input
                      type="search"
                      inputMode="search"
                      value={playerQuery}
                      onChange={(event) => setPlayerQuery(event.target.value)}
                      placeholder="Buscar nombre, numero o equipo origen"
                    />
                    {playerQuery && (
                      <button className="delegate-search-clear" type="button" aria-label="Limpiar busqueda" onClick={() => setPlayerQuery("")}>
                        ×
                      </button>
                    )}
                  </label>
                </div>
                {rosterSearchSuggestions.length > 0 && (
                  <div className="delegate-roster-suggestions" role="listbox" aria-label="Coincidencias de jugadores">
                    {rosterSearchSuggestions.map((player) => (
                      <button type="button" key={player.id} onClick={() => setPlayerQuery(player.name)}>
                        <b>#{player.number || "-"}</b>
                        <span>{player.name}</span>
                        <small>{getPlayerPositionOptionValue(player.position)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="delegate-roster-list-head">
                <strong>Jugadores ({filteredPlayers.length})</strong>
                <span>Posicion y numero</span>
              </div>
              <div className="team-portal-player-list delegate-roster-list">
                {groupedRosterPlayers.map((group) => (
                  <section className="delegate-roster-position-group" key={group.position}>
                    <header>
                      <span><RosterIcon type={group.position === "Arquero" ? "goalkeeper" : group.position === "Defensor" ? "defense" : group.position === "Mediocampista" ? "midfield" : "forward"} /></span>
                      <strong>{group.label}</strong>
                      <small>{group.players.length}</small>
                    </header>
                    {group.players.map((player) => {
                      const isEditing = editingPlayerId === player.id;
                      const playerStatus = getDelegatePlayerStatus(player);
                      return (
                        <article className={isEditing ? "editing" : ""} key={player.id}>
                          <span className={`player-avatar team-portal-avatar ${player.photoAuthorized && player.photoUrl ? "has-image" : ""}`}>
                            {player.photoAuthorized && player.photoUrl ? <img alt="" loading="lazy" src={player.photoUrl} /> : null}
                            <span>{getPlayerPhotoInitials(player.name)}</span>
                          </span>
                          <b className="delegate-player-number">{player.number || "-"}</b>
                          <div>
                            <strong>{player.name}</strong>
                            <small>{player.isAffiliate ? `AFILIADO | ORIGEN: ${player.originTeamName || "EQUIPO ORIGEN"}` : getPlayerPositionOptionValue(player.position).toUpperCase()}</small>
                            <PlayoffProgress eligibility={player.playoffEligibility} />
                          </div>
                          <span className={`delegate-player-status ${playerStatus.className}`}><i />{playerStatus.label}</span>
                          <button
                            className="delegate-player-edit-button"
                            type="button"
                            aria-label={`${player.isAffiliate || !context.canManageRoster ? "Editar numero" : "Editar"} ${player.name}`}
                            onClick={() => {
                              setEditingPlayerId(player.id);
                              setActiveView("player");
                            }}
                          >
                            ›
                          </button>
                        </article>
                      );
                    })}
                  </section>
                ))}
                {!rosterPlayers.length && <p className="empty">Aun no hay jugadores registrados o afiliados en este equipo.</p>}
                {rosterPlayers.length > 0 && !filteredPlayers.length && <p className="empty">No hay jugadores con esa busqueda.</p>}
              </div>
            </div>
          )}

          {activeView === "newPlayer" && canManageRoster && (
            <div className="delegate-view-stack delegate-player-editor-screen">
              <section className="delegate-player-editor-hero delegate-player-create-hero">
                <span className="player-avatar team-portal-avatar">
                  <span>+</span>
                </span>
                <div>
                  <span>Alta de jugador</span>
                  <strong>Nuevo integrante</strong>
                  <small>Captura datos basicos y foto autorizada</small>
                </div>
              </section>
              <div className="delegate-player-editor-stats">
                <span><small>Plantilla</small><strong>{players.length}</strong></span>
                <span><small>Registro</small><strong>Abierto</strong></span>
                <span><small>Foto</small><strong>Opcional</strong></span>
              </div>
              <form className="delegate-player-edit-form" onSubmit={submitPlayer}>
                <label>Nombre completo
                  <input name="name" required pattern=".*\S+\s+\S+.*" placeholder="Nombre y apellidos" title="Registra nombre(s) y apellido(s)" />
                </label>
                <div className="delegate-player-edit-grid">
                  <label>Numero
                    <input name="number" type="number" min="0" max="9999" placeholder="10" />
                  </label>
                  <label>Posicion
                    <select name="position" defaultValue="Delantero">
                      {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                    </select>
                  </label>
                </div>
                <PlayerPhotoUploader
                  key={photoResetKey}
                  compact
                  addLabel="Subir foto"
                  authorizedLabel="Autorizo subir y usar la foto del jugador"
                  playerName="Nuevo jugador"
                />
                <div className="delegate-player-edit-actions">
                  <button className="portal-primary-action" type="submit">Guardar jugador</button>
                  <button type="button" onClick={() => setActiveView("roster")}>Cancelar</button>
                </div>
              </form>
            </div>
          )}

          {activeView === "player" && (
            <div className="delegate-view-stack delegate-player-editor-screen">
              {selectedEditingPlayer ? (
                <>
                  <section className="delegate-player-editor-hero">
                    <span className="player-avatar team-portal-avatar">
                      {selectedEditingPlayer.photoAuthorized && selectedEditingPlayer.photoUrl ? <img alt="" src={selectedEditingPlayer.photoUrl} /> : null}
                      <span>{getPlayerPhotoInitials(selectedEditingPlayer.name)}</span>
                    </span>
                    <div>
                      <span>{selectedEditingPlayer.isAffiliate ? "Jugador afiliado" : "Ficha de jugador"}</span>
                      <strong>{selectedEditingPlayer.name}</strong>
                      <small>
                        #{selectedEditingPlayer.number || "-"} | {selectedEditingPlayer.isAffiliate
                          ? `Origen: ${selectedEditingPlayer.originTeamName || "Equipo afiliado"}`
                          : getPlayerPositionOptionValue(selectedEditingPlayer.position)}
                      </small>
                    </div>
                  </section>
                  <div className="delegate-player-editor-stats">
                    <span><small>Numero</small><strong>#{selectedEditingPlayer.number || "-"}</strong></span>
                    <span><small>Tipo</small><strong>{selectedEditingPlayer.isAffiliate ? "Afiliado" : "Propio"}</strong></span>
                    <span><small>Edicion</small><strong>{selectedEditingPlayerCanEditFull ? "Completa" : "Numero"}</strong></span>
                  </div>
                  <form className="delegate-player-edit-form" onSubmit={(event) => submitPlayerEdit(event, selectedEditingPlayer)}>
                    {selectedEditingPlayerCanEditFull && (
                      <label>Nombre completo
                        <input name="name" required pattern=".*\S+\s+\S+.*" defaultValue={selectedEditingPlayer.name} title="Registra nombre(s) y apellido(s)" />
                      </label>
                    )}
                    <div className="delegate-player-edit-grid">
                      <label>Numero
                        <input name="number" type="number" min="0" max="9999" defaultValue={selectedEditingPlayer.number || ""} />
                      </label>
                      {selectedEditingPlayerCanEditFull && (
                        <label>Posicion
                          <select name="position" defaultValue={getPlayerPositionOptionValue(selectedEditingPlayer.position)}>
                            {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                    {!selectedEditingPlayerCanEditFull && (
                      <p className="delegate-number-edit-note">
                        {selectedEditingPlayer.isAffiliate
                          ? "Solo puedes ajustar el numero con el que este afiliado aparece en tu equipo. Nombre, posicion y foto pertenecen al equipo origen."
                          : "El registro esta cerrado. Por ahora solo puedes ajustar el numero del jugador."}
                      </p>
                    )}
                    {selectedEditingPlayerCanEditFull && (
                      <PlayerPhotoUploader compact defaultAuthorized={selectedEditingPlayer.photoAuthorized === true} existingPhotoUrl={selectedEditingPlayer.photoUrl || ""} playerName={selectedEditingPlayer.name} />
                    )}
                    <div className="delegate-player-edit-actions">
                      <button className="portal-primary-action" type="submit" disabled={busyPlayerId === selectedEditingPlayer.id}>
                        {busyPlayerId === selectedEditingPlayer.id ? "Guardando..." : selectedEditingPlayerCanEditFull ? "Guardar cambios" : "Guardar numero"}
                      </button>
                      <button type="button" onClick={() => {
                        setEditingPlayerId("");
                        setActiveView("roster");
                      }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <article className="delegate-match-detail">
                  <span className="portal-status-pill neutral">Jugador no disponible</span>
                  <strong>No encontramos esta ficha.</strong>
                  <button className="portal-primary-action" type="button" onClick={() => setActiveView("roster")}>Volver a plantilla</button>
                </article>
              )}
            </div>
          )}

          {activeView === "tools" && (
            <div className="delegate-view-stack">
              <article className="delegate-match-detail">
                <span className="portal-status-pill neutral">Herramientas</span>
                <strong>Gestion del equipo</strong>
                <small>El PIN y la firma digital solo aparecen dentro del seguimiento del acta.</small>
                {activeMatch?.roster && (
                  <button className="portal-primary-action" type="button" onClick={() => setActiveView("acta")}>
                    Ir al seguimiento del acta
                  </button>
                )}
              </article>
              <form className="team-logo-form" onSubmit={submitTeamLogo}>
                <SectionHeading eyebrow="Equipo" title="Escudo del equipo" />
                <PlayerPhotoUploader
                  key={teamLogoResetKey}
                  addLabel="Agregar escudo"
                  authorizationHint="Para subir escudo, primero marca la autorizacion del equipo."
                  authorizeFirstLabel="Autoriza escudo primero"
                  authorizedLabel="Escudo autorizado"
                  changeLabel="Cambiar escudo"
                  defaultAuthorized={Boolean(context.teamLogoUrl)}
                  existingPhotoUrl={context.teamLogoUrl || ""}
                  playerName={context.teamName}
                  removeLabel="Quitar escudo"
                />
                <button className="primary" type="submit">Guardar escudo</button>
              </form>
            </div>
          )}
        </section>
      </div>
      {!isExclusiveView && <nav className="portal-bottom-nav" aria-label="Navegacion delegado">
        {navItems.map((item) => (
          <button className={activeView === item.id ? "active" : ""} key={item.id} type="button" onClick={() => openDelegateNavItem(item.id)}>
            <PortalNavIcon type={item.icon} /><span>{item.label}</span>
          </button>
        ))}
      </nav>}
    </main>
  );
}

function PlayoffProgress({ eligibility }) {
  if (!eligibility?.applies) return null;
  const label = eligibility.eligible
    ? "Disponible para liguilla"
    : `Faltan ${eligibility.remaining} partido(s)`;

  return (
    <span className={`team-player-progress ${eligibility.eligible ? "complete" : ""}`}>
      <span>
        Liguilla: {eligibility.recognizedAppearances}/{eligibility.required} | {label}
      </span>
      <span className="team-player-progress-track" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, eligibility.percentage || 0))}%` }} />
      </span>
    </span>
  );
}

function buildRosterDrafts(matches, eligiblePlayers) {
  const drafts = {};
  for (const match of matches || []) {
    const availablePlayerIds = eligiblePlayers
      .filter((player) => {
        const blockedBySuspension = Boolean(player.suspension);
        const blockedByPlayoff = match.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
        return !blockedBySuspension && !blockedByPlayoff;
      })
      .map((player) => player.id);
    const participationPlayerIds = (match.participation?.players || [])
      .map((entry) => typeof entry === "string" ? entry : entry.playerId)
      .filter((playerId) => availablePlayerIds.includes(playerId));
    const playerIds = participationPlayerIds.length ? participationPlayerIds : [];
    const jerseyNumbers = Object.fromEntries(playerIds.map((playerId) => {
      const participationEntry = (match.participation?.players || []).find((entry) => (typeof entry === "string" ? entry : entry.playerId) === playerId);
      const player = eligiblePlayers.find((item) => item.id === playerId);
      return [playerId, normalizeJerseyNumberInput(typeof participationEntry === "object" ? participationEntry.playerNumberSnapshot ?? player?.number ?? "" : player?.number ?? "")];
    }));
    const starters = [];
    const substitutes = [];
    const captainPlayerId = playerIds.includes(match.participation?.captainPlayerId)
      ? match.participation.captainPlayerId
      : "";
    const goalkeeperPlayerId = "";
    drafts[match.id] = {
      playerIds,
      starters,
      substitutes,
      captainPlayerId,
      goalkeeperPlayerId,
      jerseyNumbers,
      notes: match.participation?.metadata?.notes || ""
    };
  }
  return drafts;
}

function getEligiblePlayerName(players, playerId) {
  return players.find((player) => player.id === playerId)?.name || "Sin capitan";
}

async function buildImageUploadPayload(payload, fallbackPhotoUrl, authToken, leagueId, scope) {
  const photoAuthorized = payload.photoAuthorized === true || payload.photoAuthorized === "true" || payload.photoAuthorized === "on";
  const shouldRemovePhoto = payload.removePhoto === "on";
  const photoUrl = shouldRemovePhoto
    ? ""
    : !photoAuthorized
      ? ""
      : payload.photoDataUrl
        ? (await uploadImage(authToken, {
          dataUrl: payload.photoDataUrl,
          leagueId,
          scope
        })).url
        : fallbackPhotoUrl;

  return { photoAuthorized, photoUrl };
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9ñÑ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

function getSearchTokens(value) {
  return normalizeSearch(value).split(" ").filter(Boolean);
}

function searchTokensMatch(values, tokens) {
  if (!tokens.length) return true;
  const haystack = (Array.isArray(values) ? values : [values])
    .map((value) => normalizeSearch(value))
    .filter(Boolean)
    .join(" ");
  return tokens.every((token) => haystack.includes(token));
}

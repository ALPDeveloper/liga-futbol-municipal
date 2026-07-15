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
  suspendRefereeMatchSession
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

function formatMonth(value) {
  if (!value || value === "sin-fecha") return "Sin fecha";
  const date = new Date(`${value}-01T12:00:00`);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(date);
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

function getTeamInitials(name) {
  const words = String(name || "EQ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "EQ";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
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
  if (type === "more") {
    return <svg {...common}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
  }
  return <svg {...common}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
}

function RefereeTeamMark({ name, tone = "home" }) {
  return <span className={`portal-team-badge ${tone}`}><b>{getTeamInitials(name)}</b></span>;
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
  if (match.sheetReviewStatus === "pending_review") return { className: "review", label: "En revision" };
  if (match.sheetReviewStatus === "rejected") return { className: "rejected", label: "Correccion solicitada" };
  if (match.sessionStatus === "temporarily_saved") return { className: "review", label: "Guardado" };
  if (String(match.sessionStatus || "").startsWith("suspended")) return { className: "rejected", label: "Suspendido" };
  if (match.sessionStatus === "match_finished") return { className: "review", label: "Acta preliminar" };
  if (history) return { className: "done", label: "Finalizado" };
  if (!match.canCapture) return { className: "readonly", label: "Solo consulta" };
  return { className: "ready", label: "Listo para capturar" };
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
    <article className="referee-match-card">
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
          {match.sessionStatus === "match_finished" ? "Revisar acta" : "Capturar acta"}
        </button>
      )}
    </article>
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
    suspensionMatches: 0,
    suspensionIndefinite: false,
    disciplinaryPending: type === "red",
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

function getEventLabel(type) {
  if (type === "goal") return "Gol";
  if (type === "own_goal") return "Autogol";
  if (type === "yellow") return "Amarilla";
  if (type === "red") return "Roja";
  return "Evento";
}

function getEventIcon(type) {
  if (type === "goal") return "⚽";
  if (type === "own_goal") return "↩";
  if (type === "yellow") return "🟨";
  if (type === "red") return "🟥";
  return "•";
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

function RefereeSheetForm({ authToken, match, onCancel, onSaved }) {
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
  const wakeLockRef = useRef(null);
  const lastEventRef = useRef({ type: "", teamId: "", at: 0 });

  useEffect(() => {
    if (!["match_finished", "pending_captain_review", "both_signed", "finalized_pending_sync"].includes(match.sessionStatus || match.workflowStatus)) return;
    let cancelled = false;
    setLoadingReport(true);
    fetchRefereeMatchReport(authToken, match.id)
      .then((nextReportState) => {
        if (!cancelled) setReportState(nextReportState);
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
        if (localUpdated < serverUpdated) return;
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
    if (!liveStarted) return;
    if (liveElapsedSeconds % 10 !== 0) return;
    persistDraftSilently();
  }, [liveElapsedSeconds, liveStarted]);

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
      saveDraft();
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

  function buildDraftPayload() {
    return {
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
      batterySaver
    };
  }

  function getCaptureMode() {
    return liveStarted ? "live" : "manual";
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
      return { minute: elapsedMinute, minuteLabel: `${periodDuration}+${elapsedMinute - periodDuration}` };
    }
    if (livePeriod === 3) {
      const base = periodDuration * 2;
      const absoluteMinute = base + elapsedMinute;
      if (elapsedMinute > extraDuration) return { minute: absoluteMinute, minuteLabel: `${base + extraDuration}+${elapsedMinute - extraDuration}` };
      return { minute: absoluteMinute, minuteLabel: "" };
    }
    if (livePeriod === 4) {
      const base = periodDuration * 2 + extraDuration;
      const absoluteMinute = base + elapsedMinute;
      if (elapsedMinute > extraDuration) return { minute: absoluteMinute, minuteLabel: `${base + extraDuration}+${elapsedMinute - extraDuration}` };
      return { minute: absoluteMinute, minuteLabel: "" };
    }
    const absoluteMinute = livePeriod === 2 ? periodDuration + elapsedMinute : elapsedMinute;
    if (livePeriod === 2 && absoluteMinute > periodDuration * 2) {
      return { minute: absoluteMinute, minuteLabel: `${periodDuration * 2}+${absoluteMinute - (periodDuration * 2)}` };
    }
    return { minute: absoluteMinute, minuteLabel: "" };
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

  function canFinishCurrentPeriod() {
    const targetDuration = livePeriod >= 3 ? Number(extraTimeDuration || 15) : Number(liveDuration || 45);
    return liveStarted && liveElapsedSeconds >= Math.max(0, targetDuration - 5) * 60;
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

  function finishExtraTimePeriod() {
    if (!window.confirm(livePeriod === 3 ? "¿Finalizar primer tiempo extra?" : "¿Finalizar tiempo extra?")) return;
    const nextTimer = applyLiveTimer(finishLivePeriod(liveTimer, livePeriod === 3 ? LIVE_PERIODS.EXTRA_TIME_FIRST : LIVE_PERIODS.HALFTIME));
    const nextDraft = { ...buildDraftPayload(), liveTimer: nextTimer, liveRunning: false, liveElapsedSeconds: calculateElapsedSeconds(nextTimer) };
    persistLiveDraft(nextDraft);
    recordLiveOperation(livePeriod === 3 ? "finish_extra_time_first" : "finish_extra_time", { elapsedSeconds: calculateElapsedSeconds(nextTimer) }, nextDraft);
    setMessage(livePeriod === 3 ? "Primer tiempo extra finalizado. Puedes iniciar 2TE." : "Tiempo extra finalizado. Si procede, captura penales.");
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
      onSaved(response.payload, { draft: true, message: "Partido finalizado y acta preliminar generada. Falta fase de firmas para publicarla." });
    } catch (sessionError) {
      if (operation?.operationId) await markLiveOperationFailed(operation.operationId);
      setSyncStatus("Guardado en este dispositivo");
      setMessage(`${sessionError.message || "No se pudo finalizar el partido en servidor."} El cierre quedo guardado en este dispositivo pendiente de sincronizar.`);
    } finally {
      setSaving(false);
    }
  }

  function addEvent(type, teamId) {
    setMessage("");
    const now = Date.now();
    if (lastEventRef.current.type === type && lastEventRef.current.teamId === teamId && now - lastEventRef.current.at < 800) {
      setMessage("Evento ignorado para evitar duplicado por doble toque. Si fue intencional, vuelve a tocar.");
      return;
    }
    lastEventRef.current = { type, teamId, at: now };
    const nextEvent = createEvent(match, type, teamId, getLiveEventMinute());
    if (sheetMode === "played" && isGoalEventType(type)) adjustScore(teamId, 1);
    setEvents((current) => {
      const nextEvents = [...current, nextEvent];
      const nextDraft = { ...buildDraftPayload(), events: nextEvents };
      persistLiveDraft(nextDraft);
      recordLiveOperation("add_event", { event: nextEvent }, nextDraft);
      return nextEvents;
    });
    setMessage(`${getEventLabel(type)} registrado. Guardado en este dispositivo.`);
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
      reason: field === "type" && value !== "red" ? "" : currentEvent.reason
    };
    const isGoal = isGoalEventType(nextEvent.type);
    if (sheetMode === "played" && wasGoal !== isGoal) adjustScore(nextEvent.teamId, isGoal ? 1 : -1);
    setEvents((current) => current.map((event) => (event.id === eventId ? nextEvent : event)));
  }

  function updatePlayerSearch(eventId, value) {
    setPlayerSearches((current) => ({ ...current, [eventId]: value }));
  }

  function removeEvent(eventId) {
    if (!window.confirm("¿Cancelar este evento? Se conservara registro local para auditoria hasta sincronizar.")) return;
    const eventToRemove = events.find((event) => event.id === eventId);
    if (sheetMode === "played" && eventToRemove && isGoalEventType(eventToRemove.type)) adjustScore(eventToRemove.teamId, -1);
    setEvents((current) => {
      const nextEvents = current.filter((event) => event.id !== eventId);
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

  async function saveDraft() {
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
      onSaved(response.payload || null, { draft: true, message: "Acta guardada temporalmente. Puedes continuar editandola desde partidos pendientes." });
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
      const nextReportState = await signRefereeMatchReport(authToken, match.id, {
        teamSide,
        pin: normalizePin(pin)
      });
      setReportState(nextReportState);
      if (nextReportState.payload) onSaved(nextReportState.payload, { draft: true, keepOpen: true, message: "" });
      setMessage(`Firma de ${teamName} registrada correctamente.`);
    } catch (signError) {
      setMessage(signError.message || "No se pudo firmar el acta.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizePreliminaryReport() {
    if (!reportState?.readyToFinalize) {
      setMessage("Se requiere firma de ambos capitanes antes de finalizar el acta.");
      return;
    }
    if (!window.confirm("¿Finalizar acta firmada y publicar resultado oficial? Se actualizaran marcador, eventos, tabla, goleo y disciplina en la parte publica.")) return;

    setSaving(true);
    setMessage("Finalizando acta...");
    try {
      const nextReportState = await finalizeRefereeMatchReport(authToken, match.id);
      setReportState(nextReportState);
      clearRefereeDraft(draftKey);
      await clearLiveMatchState(match.id);
      releaseWakeLock();
      onSaved(nextReportState.payload, {
        draft: true,
        message: "Acta firmada, finalizada y publicada en la parte publica."
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
      const nextPayload = await saveRefereeMatchSheet(authToken, match.id, {
        captureMode: getCaptureMode(),
        homeGoals,
        awayGoals,
        extraTimeHomeGoals: extraTimeEnabled ? extraTimeHomeGoals : "",
        extraTimeAwayGoals: extraTimeEnabled ? extraTimeAwayGoals : "",
        penaltyHomeGoals: penaltiesEnabled ? penaltyHomeGoals : "",
        penaltyAwayGoals: penaltiesEnabled ? penaltyAwayGoals : "",
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
    return (
      <article className={`referee-event-row event-side-${eventSide} event-kind-${eventItem.type} ${isLatest ? "is-latest" : ""}`} key={eventItem.id}>
        <div className="referee-event-row-head">
          <div>
            <strong>#{index + 1} <span className="event-icon" aria-hidden="true">{getEventIcon(eventItem.type)}</span>{getEventLabel(eventItem.type)}</strong>
            <span>{eventItem.type === "own_goal" ? `A favor de ${eventTeam}` : eventTeam}</span>
          </div>
          <button className="danger" type="button" onClick={() => removeEvent(eventItem.id)}>Quitar</button>
        </div>
        <div className="referee-locked-team">
          <span>Evento</span>
          <strong><span className="event-icon" aria-hidden="true">{getEventIcon(eventItem.type)}</span>{getEventLabel(eventItem.type)}</strong>
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
        </label>
        <label>Jugador
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
        {eventItem.type === "red" && (
          <>
            <div className="referee-locked-team">
              <span>Comision disciplinaria</span>
              <strong>Sujeto a revision</strong>
              <small>La cantidad de partidos se define desde administracion.</small>
            </div>
            <label>Motivo
              <input value={eventItem.reason || ""} onChange={(event) => updateEvent(eventItem.id, "reason", event.target.value)} placeholder="Ej. Insultos al arbitro" aria-label="Motivo de roja" />
            </label>
          </>
        )}
      </article>
    );
  }

  const previousEvents = events.slice(0, -1);
  const latestEvent = events[events.length - 1] || null;

  return (
    <form className={`referee-sheet-form ${batterySaver ? "referee-low-power" : ""}`} onSubmit={submitSheet}>
      <div className="referee-acta-title">
        <button type="button" onClick={onCancel} disabled={saving}>Volver a partidos</button>
        <div>
          <div className="referee-acta-brand">
            <img alt="LIGATEC" src={ligatecLogo} />
            <span>Panel del arbitro</span>
          </div>
          <strong>{match.homeTeamName} vs {match.awayTeamName}</strong>
          <small>{match.competitionName || "Categoria"} | {formatDate(match.date)} | {match.time || "Hora por definir"} | {match.venue || "Cancha por definir"}</small>
        </div>
      </div>

      <div className="referee-flow-steps" aria-label="Flujo del acta">
        <span className="active">1. Captura</span>
        <span>2. Revisa eventos</span>
        <span>3. Firma capitanes</span>
        <span>4. Publica acta</span>
      </div>

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

      {sheetMode === "played" && (
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
              <span>Modo en vivo opcional</span>
              <strong>{liveStarted ? `${getLivePeriodName()} en curso` : "Cronometro del partido"}</strong>
              <small>Si lo activas, goles y tarjetas toman el minuto actual automaticamente.</small>
            </div>
            <div className="referee-live-clock">
              <b>{liveStarted ? getLiveClockLabel() : formatClock(0)}</b>
              <span>{liveStarted ? (liveRunning ? "Corriendo" : "Pausado") : "Sin iniciar"}</span>
            </div>
          </div>
          <div className="referee-live-meta">
            <label>Duracion por tiempo
              <select value={liveDuration} onChange={(event) => setLiveDuration(Number(event.target.value))} disabled={liveRunning}>
                <option value={35}>35 min</option>
                <option value={40}>40 min</option>
                <option value={45}>45 min</option>
                <option value={50}>50 min</option>
              </select>
            </label>
            <label>Tiempo extra
              <select value={extraTimeDuration} onChange={(event) => setExtraTimeDuration(Number(event.target.value))} disabled={liveRunning}>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={20}>20 min</option>
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

      {sheetMode === "played" && (
        <details className="referee-advanced-panel">
          <summary>
            <strong>Opciones de liguilla</strong>
            <span>Tiempo extra y penales solo cuando el reglamento lo requiera</span>
          </summary>
          <div className="referee-advanced-grid">
            <label className="event-toggle-field">
              <input checked={extraTimeEnabled} onChange={(event) => setExtraTimeEnabled(event.target.checked)} type="checkbox" />
              Registrar tiempo extra
            </label>
            {extraTimeEnabled && (
              <>
                <label>T.E. local
                  <input min="0" type="number" value={extraTimeHomeGoals} onChange={(event) => setExtraTimeHomeGoals(event.target.value)} placeholder="0" />
                </label>
                <label>T.E. visitante
                  <input min="0" type="number" value={extraTimeAwayGoals} onChange={(event) => setExtraTimeAwayGoals(event.target.value)} placeholder="0" />
                </label>
              </>
            )}
            <label className="event-toggle-field">
              <input checked={penaltiesEnabled} onChange={(event) => setPenaltiesEnabled(event.target.checked)} type="checkbox" />
              Registrar penales
            </label>
            {penaltiesEnabled && (
              <>
                <label>Penales local
                  <input min="0" type="number" value={penaltyHomeGoals} onChange={(event) => setPenaltyHomeGoals(event.target.value)} placeholder="0" />
                </label>
                <label>Penales visitante
                  <input min="0" type="number" value={penaltyAwayGoals} onChange={(event) => setPenaltyAwayGoals(event.target.value)} placeholder="0" />
                </label>
              </>
            )}
          </div>
        </details>
      )}

      <div className="referee-event-buttons" aria-label="Eventos rapidos del partido">
        <EventQuickButton className="event-goal" icon={getEventIcon("goal")} title="Gol" subtitle="Local" onClick={() => addEvent("goal", match.homeTeamId)} />
        <EventQuickButton className="event-goal" icon={getEventIcon("goal")} title="Gol" subtitle="Visitante" onClick={() => addEvent("goal", match.awayTeamId)} />
        <EventQuickButton className="event-own-goal" icon={getEventIcon("own_goal")} title="Autogol" subtitle="A local" onClick={() => addEvent("own_goal", match.homeTeamId)} />
        <EventQuickButton className="event-own-goal" icon={getEventIcon("own_goal")} title="Autogol" subtitle="A visitante" onClick={() => addEvent("own_goal", match.awayTeamId)} />
        <EventQuickButton className="event-yellow" icon={getEventIcon("yellow")} title="Amarilla" subtitle="Local" onClick={() => addEvent("yellow", match.homeTeamId)} />
        <EventQuickButton className="event-yellow" icon={getEventIcon("yellow")} title="Amarilla" subtitle="Visitante" onClick={() => addEvent("yellow", match.awayTeamId)} />
        <EventQuickButton className="event-red" icon={getEventIcon("red")} title="Roja" subtitle="Local" onClick={() => addEvent("red", match.homeTeamId)} />
        <EventQuickButton className="event-red" icon={getEventIcon("red")} title="Roja" subtitle="Visitante" onClick={() => addEvent("red", match.awayTeamId)} />
      </div>

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
              <div className="inline-actions">
                <button type="button" onClick={() => signPreliminaryReport("home")} disabled={saving || reportState.homeSigned || ["finalized", "published"].includes(reportState.report.status)}>
                  Firmar local
                </button>
                <button type="button" onClick={() => signPreliminaryReport("away")} disabled={saving || reportState.awaySigned || ["finalized", "published"].includes(reportState.report.status)}>
                  Firmar visitante
                </button>
                <button className="primary" type="button" onClick={finalizePreliminaryReport} disabled={saving || !reportState.readyToFinalize || ["finalized", "published"].includes(reportState.report.status)}>
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
      {message && <p className={message.startsWith("No se") || message.startsWith("Revisa") || message.startsWith("Toda") || message.startsWith("Captura") ? "auth-error" : "auth-ok"}>{message}</p>}
      <div className="inline-actions">
        <button type="button" onClick={saveDraft} disabled={saving}>Guardar temporalmente</button>
        <button className="primary" type="submit" disabled={saving}>{saving ? "Publicando acta..." : "Publicar acta directa"}</button>
        <button type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  );
}

export function RefereePortal({ authToken, currentUser, onLogout }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [captureMatchId, setCaptureMatchId] = useState("");
  const [activeView, setActiveView] = useState("pending");
  const [portalNotice, setPortalNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        const cachedPayload = readRefereePortalCache(currentUser?.id);
        if (cachedPayload) {
          setPayload(cachedPayload);
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

  const groupedHistory = useMemo(() => {
    const groups = new Map();
    const sortedHistory = [...(payload?.history || [])].sort((a, b) => (
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
  }, [payload]);

  if (loading) {
    return <main className="page"><section className="panel"><p className="helper-text">Cargando partidos asignados...</p></section></main>;
  }

  if (error) {
    return <main className="page"><section className="panel"><p className="sheet-alert">{error}</p></section></main>;
  }

  const referee = payload?.referee;
  const pendingMatches = payload?.pendingMatches || [];
  const captureMatch = pendingMatches.find((match) => match.id === captureMatchId);
  const nextPendingMatch = pendingMatches[0] || null;
  const openCapture = (matchId) => {
    setPortalNotice("");
    setCaptureMatchId(matchId);
  };

  if (captureMatch) {
    return (
      <main className="page referee-portal-page referee-acta-page">
        <section className="panel referee-section">
          <RefereeSheetForm
            authToken={authToken}
            match={captureMatch}
            onCancel={() => setCaptureMatchId("")}
            onSaved={(nextPayload, options = {}) => {
              if (nextPayload) {
                setPayload(nextPayload);
                writeRefereePortalCache(currentUser?.id, nextPayload);
              }
              if (options.keepOpen) {
                if (options.message) setPortalNotice(options.message);
                return;
              }
              setCaptureMatchId("");
              setActiveView("pending");
              setPortalNotice(options.message || "Acta publicada. El partido se movio a historial y ya aparece en la parte publica.");
            }}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="page referee-portal-page portal-mobile-shell portal-board-shell" id="referee-home">
      <div className="portal-board-layout referee-board">
        <aside className="portal-side-rail referee">
          <div className="portal-side-brand">
            <img alt="LIGATEC" src={ligatecLogo} />
            <span>Plataforma deportiva</span>
          </div>
          <div className="portal-side-title">
            <span>Panel</span>
            <h1>Arbitro</h1>
            <p>Gestiona partidos asignados, captura en vivo, genera el acta y publica en la plataforma.</p>
          </div>
          <article className="portal-side-profile">
            <span className="portal-avatar blue">{getTeamInitials(referee?.name || currentUser?.name || "AC")}</span>
            <div>
              <strong>{referee?.name || currentUser?.name || "Arbitro central"}</strong>
              <small>Licencia: {referee?.license || "ACT-2025"}</small>
            </div>
            <b>Activo</b>
          </article>
          <nav className="portal-side-menu" aria-label="Menu arbitro">
            <a href="#referee-home" className="active"><PortalNavIcon type="home" />Inicio</a>
            <button type="button" onClick={() => setActiveView("pending")}><PortalNavIcon type="assignments" />Mis partidos</button>
            <button type="button" onClick={() => setActiveView("pending")}><PortalNavIcon type="acts" />Actas pendientes</button>
            <button type="button" onClick={() => setActiveView("history")}><PortalNavIcon type="history" />Historial de actas</button>
            <a href="#referee-tools"><PortalNavIcon type="more" />Herramientas</a>
          </nav>
          <article className="portal-side-pin">
            <strong>Modalidades de acta</strong>
            <p>En vivo usa firma digital con PIN. Manual se captura con respaldo fisico y no obliga firma digital.</p>
            <span>La publicacion sucede al finalizar el acta.</span>
          </article>
          <div className="portal-side-flow">
            <strong>Flujo del arbitro</strong>
            <span>Convocatorias</span>
            <span>Inicio del partido</span>
            <span>Captura de eventos</span>
            <span>Firmas con PIN</span>
            <span>Publicacion oficial</span>
          </div>
        </aside>
        <div className="portal-screen-stack">
      <section className="referee-portal-home">
        <div className="portal-topline">
          <span className="portal-brand">
            <img alt="LIGATEC" src={ligatecLogo} />
          </span>
          <div className="portal-topline-actions">
            <button className="portal-mini-link" type="button" onClick={onLogout}>Salir</button>
            <button className="portal-icon-button" type="button" aria-label="Herramientas">
              <PortalNavIcon type="more" />
            </button>
          </div>
        </div>
        <div className="portal-user-summary referee">
          <span className="portal-avatar blue">{getTeamInitials(referee?.name || currentUser?.name || "AC")}</span>
          <div>
            <strong>{referee?.name || currentUser?.name || "Arbitro central"}</strong>
            <small>Licencia: {referee?.license || "ACT-2025"}</small>
          </div>
        </div>

        <div className="referee-hero-stats portal-stat-strip">
          <span><strong>{pendingMatches.length}</strong> asignacion pendiente</span>
          <span><strong>{payload?.history?.filter((match) => match.date === new Date().toISOString().slice(0, 10)).length || 0}</strong> actas hoy</span>
          <span><strong>{payload?.history?.length || 0}</strong> historial</span>
        </div>

        {nextPendingMatch ? (
          <article className="portal-next-match-card referee-next">
            <div className="portal-card-head">
              <strong>Proximo partido</strong>
              <span className="portal-status-pill blue">{getMatchStatus(nextPendingMatch, false).label}</span>
            </div>
            <span className="portal-match-date">{formatDate(nextPendingMatch.date)} | {nextPendingMatch.time || "Hora por definir"}</span>
            <div className="portal-match-teams">
              <div>
                <RefereeTeamMark name={nextPendingMatch.homeTeamName} />
                <strong>{nextPendingMatch.homeTeamName}</strong>
                <small>Local</small>
              </div>
              <b>VS</b>
              <div>
                <RefereeTeamMark name={nextPendingMatch.awayTeamName} tone="away" />
                <strong>{nextPendingMatch.awayTeamName}</strong>
                <small>Visitante</small>
              </div>
            </div>
            <div className="portal-match-meta">
              <span>{nextPendingMatch.refereeRole === "central" ? "Central" : "Asignado"}</span>
              <span>{nextPendingMatch.competitionName || "Categoria"}</span>
              <span>{nextPendingMatch.venue || "Cancha por definir"}</span>
            </div>
            {nextPendingMatch.canCapture && (
              <button className="portal-primary-action blue" type="button" onClick={() => openCapture(nextPendingMatch.id)}>
                Capturar acta
              </button>
            )}
          </article>
        ) : (
          <article className="portal-next-match-card referee-next">
            <div className="portal-card-head">
              <strong>Proximo partido</strong>
              <span className="portal-status-pill neutral">Sin asignacion</span>
            </div>
            <p className="helper-text">Cuando la liga te asigne un partido, aparecera aqui.</p>
          </article>
        )}

        <div className="portal-quick-actions referee">
          <button type="button" onClick={() => setActiveView("pending")}><PortalNavIcon type="assignments" /><span>Asignaciones</span></button>
          <button type="button" onClick={() => setActiveView("pending")}><PortalNavIcon type="acts" /><span>Actas</span></button>
          <button type="button" onClick={() => setActiveView("history")}><PortalNavIcon type="history" /><span>Historial</span></button>
          <a href="#referee-tools"><PortalNavIcon type="stats" /><span>Estadisticas</span></a>
        </div>

        <div className="portal-info-grid referee">
          <article className="portal-info-card">
            <span>Acta digital en vivo</span>
            <strong>Con firma digital</strong>
            <small>Captura eventos con cronometro, solicita PIN a capitanes y publica al finalizar el acta.</small>
          </article>
          <article className="portal-info-card">
            <span>Acta manual</span>
            <strong>Sin firma obligatoria</strong>
            <small>Usa el acta fisica como respaldo, captura el resultado y publica directo al sistema.</small>
          </article>
          <article className="portal-info-card">
            <span>Sincronizacion</span>
            <strong>Preparado sin conexion</strong>
            <small>Los cambios en vivo se guardan localmente y se reintentan cuando vuelva la conexion.</small>
          </article>
        </div>

        <div className="portal-flow-strip referee" aria-label="Flujo del arbitro">
          <span><b>1</b> Convocatorias</span>
          <span><b>2</b> Captura</span>
          <span><b>3</b> Revision</span>
          <span><b>4</b> Firmas</span>
          <span><b>5</b> Publicacion</span>
        </div>
      </section>
      {portalNotice && <p className="auth-ok referee-portal-notice">{portalNotice}</p>}

      <section className="panel referee-section">
        <div className="referee-view-tabs" role="tablist" aria-label="Vistas del arbitro">
          <button
            className={activeView === "history" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("history")}
          >
            Historial
            <span>{payload?.history?.length || 0}</span>
          </button>
          <button
            className={activeView === "pending" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("pending")}
          >
            Proximos partidos
            <span>{pendingMatches.length}</span>
          </button>
        </div>
      </section>

      {activeView === "pending" && (
      <section className="panel referee-section">
        <div className="section-heading">
          <span>Proximos partidos</span>
          <h2>{pendingMatches.length ? `${pendingMatches.length} pendiente(s)` : "Sin partidos pendientes"}</h2>
        </div>
        <div className="referee-match-list">
          {pendingMatches.map((match) => (
            <div className="referee-capture-wrap" key={match.id}>
              <MatchCard match={match} onCapture={openCapture} />
            </div>
          ))}
          {!pendingMatches.length && <p className="empty">Cuando te asignen a partidos pendientes, apareceran aqui.</p>}
        </div>
      </section>
      )}

      {activeView === "history" && (
      <section className="panel referee-section">
        <div className="section-heading">
          <span>Historial</span>
          <h2>Partidos arbitrados</h2>
        </div>
        <div className="referee-history-list">
          {groupedHistory.map((group, index) => (
            <details className="referee-history-group" key={group.month} open={index === 0}>
              <summary>
                <strong>{formatMonth(group.month)}</strong>
                <span>{group.count} partido(s)</span>
              </summary>
              <div className="referee-history-dates">
                {group.dates.map(([date, matches]) => (
                  <section className="referee-history-date" key={date}>
                    <div className="referee-history-date-head">
                      <strong>{date === "sin-fecha" ? "Sin fecha" : formatDate(date)}</strong>
                      <span>{matches.length} acta(s)</span>
                    </div>
                    <div className="referee-match-list compact-history">
                      {matches.map((match) => <MatchCard history key={match.id} match={match} />)}
                    </div>
                  </section>
                ))}
              </div>
            </details>
          ))}
          {!groupedHistory.length && <p className="empty">Aun no hay actas finalizadas en tu historial.</p>}
        </div>
      </section>
      )}
      <section className="panel referee-section referee-tools-panel" id="referee-tools">
        <div className="section-heading">
          <span>Herramientas</span>
          <h2>Accesos del arbitro</h2>
        </div>
        <div className="referee-tool-grid">
          <button type="button" onClick={() => setActiveView("pending")}>
            <PortalNavIcon type="acts" />
            <span><strong>Nueva acta manual</strong><small>Crea acta sin capturar en vivo</small></span>
          </button>
          <button type="button" onClick={() => setActiveView("pending")}>
            <PortalNavIcon type="assignments" />
            <span><strong>Actas guardadas</strong><small>Continua actas en progreso</small></span>
          </button>
          <button type="button" onClick={() => setActiveView("history")}>
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
        </div>
      </div>
      <nav className="portal-bottom-nav referee" aria-label="Navegacion arbitro">
        <a href="#referee-home" className="active"><PortalNavIcon type="home" /><span>Inicio</span></a>
        <button type="button" onClick={() => setActiveView("pending")}><PortalNavIcon type="assignments" /><span>Asignaciones</span></button>
        <button type="button" onClick={() => setActiveView("pending")}><PortalNavIcon type="acts" /><span>Actas</span></button>
        <button type="button" onClick={() => setActiveView("history")}><PortalNavIcon type="history" /><span>Historial</span></button>
        <a href="#referee-tools"><PortalNavIcon type="more" /><span>Mas</span></a>
      </nav>
    </main>
  );
}

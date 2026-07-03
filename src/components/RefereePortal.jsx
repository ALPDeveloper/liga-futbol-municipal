import { useEffect, useMemo, useState } from "react";
import { fetchRefereePortal, saveRefereeMatchSheet } from "../lib/refereeApi.js";

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
          <strong>{match.homeTeamName}</strong>
          <small>Local</small>
        </div>
        <div className="referee-match-score">
          {history || match.sheetReviewStatus === "pending_review" ? scoreLabel : "VS"}
        </div>
        <div>
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
      {match.sheetReviewStatus === "pending_review" ? (
        <p className="referee-card-note">Acta enviada. El administrador debe aprobarla para hacerla oficial.</p>
      ) : match.sheetReviewStatus === "rejected" ? (
        <button className="referee-action-button warning" type="button" onClick={() => onCapture?.(match.id)}>Corregir acta</button>
      ) : history ? (
        <p className="referee-card-note">Resultado registrado en historial.</p>
      ) : !match.canCapture ? (
        <button className="referee-action-button" type="button" disabled>Solo consulta</button>
      ) : (
        <button className="referee-action-button primary-action" type="button" onClick={() => onCapture?.(match.id)}>Capturar acta</button>
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

function createEvent(match, type, teamId, minute = "") {
  const draft = {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    teamId,
    lockedTeamId: teamId,
    playerId: "",
    minute,
    suspensionMatches: type === "red" ? 1 : 0,
    reason: ""
  };
  const players = getPlayersForEvent(match, draft);
  return { ...draft, playerId: players[0]?.id || "" };
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

function RefereeSheetForm({ authToken, match, onCancel, onSaved }) {
  const draftKey = `ligatec-referee-draft-${match.id}`;
  const savedEvents = (match.events || []).map((event, index) => ({
    id: `saved-${match.id}-${index}-${event.type}-${event.playerId}`,
    lockedTeamId: event.teamId || match.homeTeamId,
    ...event
  }));
  const draft = readRefereeDraft(draftKey);
  const [homeGoals, setHomeGoals] = useState(draft?.homeGoals ?? match.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(draft?.awayGoals ?? match.awayGoals ?? 0);
  const [sheetMode, setSheetMode] = useState(draft?.sheetMode || "played");
  const [defaultWinner, setDefaultWinner] = useState(draft?.defaultWinner || "home");
  const [defaultScore, setDefaultScore] = useState(draft?.defaultScore || "3");
  const [observations, setObservations] = useState(draft?.observations ?? match.observations ?? "");
  const [events, setEvents] = useState(draft?.events || savedEvents);
  const [homeCaptainPin, setHomeCaptainPin] = useState(draft?.homeCaptainPin || "");
  const [awayCaptainPin, setAwayCaptainPin] = useState(draft?.awayCaptainPin || "");
  const [liveStarted, setLiveStarted] = useState(Boolean(draft?.liveStarted));
  const [liveRunning, setLiveRunning] = useState(false);
  const [livePeriod, setLivePeriod] = useState(Number(draft?.livePeriod || 1));
  const [liveDuration, setLiveDuration] = useState(Number(draft?.liveDuration || 45));
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(Number(draft?.liveElapsedSeconds || 0));
  const [liveAddedMinutes, setLiveAddedMinutes] = useState(Number(draft?.liveAddedMinutes || 0));
  const [liveAlerted, setLiveAlerted] = useState(Boolean(draft?.liveAlerted));
  const [playerSearches, setPlayerSearches] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!liveRunning) return undefined;
    const interval = window.setInterval(() => {
      setLiveElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [liveRunning]);

  useEffect(() => {
    if (!liveStarted || liveAlerted) return;
    const remainingSeconds = Number(liveDuration || 45) * 60 - liveElapsedSeconds;
    if (remainingSeconds > 0 && remainingSeconds <= 120) {
      setLiveAlerted(true);
      setMessage("Cronometro: faltan 2 minutos para terminar el tiempo. Puedes preparar tiempo agregado.");
      notifyClockWarning();
    }
  }, [liveAlerted, liveDuration, liveElapsedSeconds, liveStarted]);

  useEffect(() => {
    if (!liveStarted) return;
    if (liveElapsedSeconds % 10 !== 0) return;
    persistDraftSilently();
  }, [liveElapsedSeconds, liveStarted]);

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
      sheetMode,
      defaultWinner,
      defaultScore,
      observations,
      events,
      homeCaptainPin,
      awayCaptainPin,
      liveStarted,
      livePeriod,
      liveDuration,
      liveElapsedSeconds,
      liveAddedMinutes,
      liveAlerted
    };
  }

  function persistDraftSilently() {
    writeRefereeDraft(draftKey, buildDraftPayload());
  }

  function getLiveEventMinute() {
    if (!liveStarted) return "";
    const periodBase = livePeriod === 2 ? Number(liveDuration || 45) : 0;
    const elapsedMinute = Math.max(1, Math.ceil(Math.max(1, liveElapsedSeconds) / 60));
    return String(periodBase + elapsedMinute);
  }

  function startLiveMatch() {
    setLiveStarted(true);
    setLiveRunning(true);
    setLivePeriod(1);
    setLiveElapsedSeconds(0);
    setLiveAddedMinutes(0);
    setLiveAlerted(false);
    setMessage("Cronometro iniciado. Los eventos tomaran el minuto automaticamente.");
  }

  function pauseLiveClock() {
    setLiveRunning(false);
    setMessage("Cronometro pausado.");
  }

  function resumeLiveClock() {
    setLiveRunning(true);
    setMessage("Cronometro reanudado.");
  }

  function startSecondHalf() {
    if (!window.confirm("¿Iniciar segundo tiempo? El cronometro volvera a 00:00 y los eventos sumaran el tiempo del primer periodo.")) return;
    setLiveStarted(true);
    setLiveRunning(true);
    setLivePeriod(2);
    setLiveElapsedSeconds(0);
    setLiveAddedMinutes(0);
    setLiveAlerted(false);
    setMessage("Segundo tiempo iniciado.");
  }

  function stopLiveClock() {
    setLiveRunning(false);
    setMessage("Cronometro detenido. Puedes seguir editando el acta manualmente.");
  }

  function addEvent(type, teamId) {
    setMessage("");
    if (sheetMode === "played" && isGoalEventType(type)) adjustScore(teamId, 1);
    setEvents((current) => [...current, createEvent(match, type, teamId, getLiveEventMinute())]);
  }

  function updateEvent(eventId, field, value) {
    const currentEvent = events.find((event) => event.id === eventId);
    if (!currentEvent) return;
    const wasGoal = isGoalEventType(currentEvent.type);
    const nextEvent = {
      ...currentEvent,
      [field]: value,
      suspensionMatches: field === "type" && value === "red" ? Math.max(Number(currentEvent.suspensionMatches || 1), 1) : currentEvent.suspensionMatches,
      reason: field === "type" && value !== "red" ? "" : currentEvent.reason
    };
    if (field === "type") {
      nextEvent.playerId = getPlayersForEvent(match, nextEvent)[0]?.id || "";
    }
    const isGoal = isGoalEventType(nextEvent.type);
    if (sheetMode === "played" && wasGoal !== isGoal) adjustScore(nextEvent.teamId, isGoal ? 1 : -1);
    setEvents((current) => current.map((event) => (event.id === eventId ? nextEvent : event)));
  }

  function updatePlayerSearch(eventId, value) {
    setPlayerSearches((current) => ({ ...current, [eventId]: value }));
  }

  function removeEvent(eventId) {
    const eventToRemove = events.find((event) => event.id === eventId);
    if (sheetMode === "played" && eventToRemove && isGoalEventType(eventToRemove.type)) adjustScore(eventToRemove.teamId, -1);
    setEvents((current) => current.filter((event) => event.id !== eventId));
    setPlayerSearches((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
  }

  function saveDraft() {
    writeRefereeDraft(draftKey, buildDraftPayload());
    onSaved(null, { draft: true, message: "Acta guardada temporalmente. Puedes continuar editandola desde partidos pendientes." });
  }

  async function submitSheet(event) {
    event.preventDefault();
    setMessage("");
    const cleanEvents = events.filter((item) => item.playerId);
    const isDefault = sheetMode !== "played";
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
    if (!isDefault && match.homePinRequired && normalizePin(homeCaptainPin).length < 4) {
      setMessage(`Captura el PIN del capitan de ${match.homeTeamName}.`);
      return;
    }
    if (!isDefault && match.awayPinRequired && normalizePin(awayCaptainPin).length < 4) {
      setMessage(`Captura el PIN del capitan de ${match.awayTeamName}.`);
      return;
    }

    const confirmed = window.confirm(
      `¿Enviar acta a revision?\n\nPartido: ${match.homeTeamName} vs ${match.awayTeamName}\nMarcador reportado: ${homeGoals}-${awayGoals}\nEventos: ${cleanEvents.length}\nPIN local: ${!isDefault && match.homePinRequired ? "capturado" : "no requerido"}\nPIN visitante: ${!isDefault && match.awayPinRequired ? "capturado" : "no requerido"}\n\nEl administrador debera aprobarla para que sea oficial.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const nextPayload = await saveRefereeMatchSheet(authToken, match.id, {
        homeGoals,
        awayGoals,
        observations,
        status: isDefault ? "walkover" : "finished",
        resolutionType: isDefault ? "no_show" : "normal",
        resolutionNote: isDefault ? `Default administrativo ${defaultScore}-0. Eventos capturados solo para estadisticas individuales.` : "",
        approvals: {
          homePin: normalizePin(homeCaptainPin),
          awayPin: normalizePin(awayCaptainPin)
        },
        events: cleanEvents.map((item) => ({
          type: item.type,
          teamId: item.teamId,
          playerId: item.playerId,
          minute: item.minute,
          suspensionMatches: item.type === "red" ? item.suspensionMatches || 1 : 0,
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
    const playerSearch = playerSearches[eventItem.id] || "";
    const playerQuery = normalizeSearch(playerSearch);
    const filteredPlayers = players.filter((player) => {
      if (!playerQuery) return true;
      return normalizeSearch(`#${player.number || ""} ${player.name}`).includes(playerQuery);
    });
    const visiblePlayers = filteredPlayers.length ? filteredPlayers : players;
    return (
      <article className={`referee-event-row ${isLatest ? "is-latest" : ""}`} key={eventItem.id}>
        <div className="referee-event-row-head">
          <div>
            <strong>#{index + 1} {getEventLabel(eventItem.type)}</strong>
            <span>{eventItem.type === "own_goal" ? `A favor de ${eventTeam}` : eventTeam}</span>
          </div>
          <button className="danger" type="button" onClick={() => removeEvent(eventItem.id)}>Quitar</button>
        </div>
        <label>Tipo de evento
          <select value={eventItem.type} onChange={(event) => updateEvent(eventItem.id, "type", event.target.value)} aria-label="Tipo de evento">
            <option value="goal">Gol</option>
            <option value="own_goal">Autogol</option>
            <option value="yellow">Amarilla</option>
            <option value="red">Roja</option>
          </select>
        </label>
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
          <input value={eventItem.minute} onChange={(event) => updateEvent(eventItem.id, "minute", event.target.value)} inputMode="numeric" min="0" max="130" placeholder="Min" type="number" aria-label="Minuto" />
        </label>
        {eventItem.type === "red" && (
          <>
            <label>Suspension
              <input value={eventItem.suspensionMatches || 1} onChange={(event) => updateEvent(eventItem.id, "suspensionMatches", event.target.value)} inputMode="numeric" min="1" max="20" type="number" aria-label="Partidos de suspension" />
            </label>
            <label>Motivo
              <input value={eventItem.reason || ""} onChange={(event) => updateEvent(eventItem.id, "reason", event.target.value)} placeholder="Motivo de roja" aria-label="Motivo de roja" />
            </label>
          </>
        )}
      </article>
    );
  }

  const previousEvents = events.slice(0, -1);
  const latestEvent = events[events.length - 1] || null;

  return (
    <form className="referee-sheet-form" onSubmit={submitSheet}>
      <div className="referee-acta-title">
        <button type="button" onClick={onCancel} disabled={saving}>Volver a partidos</button>
        <div>
          <span>Captura de acta</span>
          <strong>{match.homeTeamName} vs {match.awayTeamName}</strong>
          <small>{formatDate(match.date)} | {match.time || "Hora por definir"} | {match.venue || "Cancha por definir"}</small>
        </div>
      </div>

      <div className="referee-sheet-head">
        <div className="referee-score-team home">
          <span>Local</span>
          <strong>{match.homeTeamName}</strong>
        </div>
        <div className="referee-score-box">
          <input aria-label="Goles local" min="0" type="number" value={homeGoals} onChange={(event) => setHomeGoals(event.target.value)} />
          <span>-</span>
          <input aria-label="Goles visitante" min="0" type="number" value={awayGoals} onChange={(event) => setAwayGoals(event.target.value)} />
        </div>
        <div className="referee-score-team away">
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
          <div className="referee-live-head">
            <div>
              <span>Modo en vivo opcional</span>
              <strong>{liveStarted ? `${livePeriod}T en curso` : "Cronometro del partido"}</strong>
              <small>Si lo activas, goles y tarjetas toman el minuto actual automaticamente.</small>
            </div>
            <div className="referee-live-clock">
              <b>{formatClock(liveElapsedSeconds)}</b>
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
            <label>Tiempo agregado
              <input
                value={liveAddedMinutes}
                onChange={(event) => setLiveAddedMinutes(event.target.value)}
                inputMode="numeric"
                min="0"
                max="20"
                type="number"
                placeholder="Minutos"
              />
            </label>
            <div className="referee-live-added">
              <span>Minuto para nuevo evento</span>
              <strong>{liveStarted ? `${getLiveEventMinute()}${Number(liveAddedMinutes || 0) > 0 ? ` +${liveAddedMinutes}` : ""}` : "Manual"}</strong>
            </div>
          </div>
          <div className="referee-live-controls">
            {!liveStarted && <button className="primary" type="button" onClick={startLiveMatch}>Iniciar partido</button>}
            {liveStarted && liveRunning && <button type="button" onClick={pauseLiveClock}>Pausar</button>}
            {liveStarted && !liveRunning && <button className="primary" type="button" onClick={resumeLiveClock}>Reanudar</button>}
            {liveStarted && livePeriod === 1 && <button type="button" onClick={startSecondHalf}>Iniciar 2T</button>}
            {liveStarted && <button type="button" onClick={stopLiveClock}>Detener</button>}
          </div>
        </section>
      )}

      <div className="referee-event-buttons">
        <button className="event-goal" type="button" onClick={() => addEvent("goal", match.homeTeamId)}>Gol local</button>
        <button className="event-goal" type="button" onClick={() => addEvent("goal", match.awayTeamId)}>Gol visitante</button>
        <button className="event-own-goal" type="button" onClick={() => addEvent("own_goal", match.homeTeamId)}>Autogol a local</button>
        <button className="event-own-goal" type="button" onClick={() => addEvent("own_goal", match.awayTeamId)}>Autogol a visitante</button>
        <button className="event-yellow" type="button" onClick={() => addEvent("yellow", match.homeTeamId)}>Amarilla local</button>
        <button className="event-yellow" type="button" onClick={() => addEvent("yellow", match.awayTeamId)}>Amarilla visitante</button>
        <button className="event-red" type="button" onClick={() => addEvent("red", match.homeTeamId)}>Roja local</button>
        <button className="event-red" type="button" onClick={() => addEvent("red", match.awayTeamId)}>Roja visitante</button>
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

      {sheetMode === "played" && (match.homePinRequired || match.awayPinRequired) && (
        <div className="referee-pin-panel">
          <div>
            <strong>Autorizacion de capitanes</strong>
            <span>Solicita el PIN al capitan o delegado antes de enviar el acta.</span>
          </div>
          {match.homePinRequired && (
            <label>PIN local | {match.homeTeamName}
              <input
                inputMode="numeric"
                maxLength={8}
                value={homeCaptainPin}
                onChange={(event) => setHomeCaptainPin(normalizePin(event.target.value))}
                placeholder="6 digitos"
              />
            </label>
          )}
          {match.awayPinRequired && (
            <label>PIN visitante | {match.awayTeamName}
              <input
                inputMode="numeric"
                maxLength={8}
                value={awayCaptainPin}
                onChange={(event) => setAwayCaptainPin(normalizePin(event.target.value))}
                placeholder="6 digitos"
              />
            </label>
          )}
        </div>
      )}

      <label>Observaciones
        <textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Notas del partido, incidentes o acuerdos." />
      </label>
      {message && <p className={message.startsWith("No se") || message.startsWith("Revisa") || message.startsWith("Toda") || message.startsWith("Captura") ? "auth-error" : "auth-ok"}>{message}</p>}
      <div className="inline-actions">
        <button type="button" onClick={saveDraft} disabled={saving}>Guardar temporalmente</button>
        <button className="primary" type="submit" disabled={saving}>{saving ? "Enviando acta..." : "Enviar a revision"}</button>
        <button type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  );
}

export function RefereePortal({ authToken, currentUser }) {
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
              setCaptureMatchId("");
              setActiveView("pending");
              setPortalNotice(options.message || "Acta enviada a revision. El partido se movio a historial.");
            }}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="page referee-portal-page">
      <section className="panel referee-hero">
        <div>
          <span className="eyebrow">Panel de arbitro</span>
          <h1>{referee?.name || currentUser?.name || "Arbitro"}</h1>
          <p>{referee?.municipality || "Municipio"} | Consulta designaciones y envia actas a revision.</p>
        </div>
        <div className="referee-hero-stats">
          <span><strong>{pendingMatches.length}</strong> pendientes</span>
          <span><strong>{payload?.history?.length || 0}</strong> historial</span>
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
    </main>
  );
}

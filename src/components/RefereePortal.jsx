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

function createEvent(match, type, teamId) {
  const draft = {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    teamId,
    lockedTeamId: teamId,
    playerId: "",
    minute: "",
    suspensionMatches: type === "red" ? 1 : 0,
    reason: ""
  };
  const players = getPlayersForEvent(match, draft);
  return { ...draft, playerId: players[0]?.id || "" };
}

function getEventLabel(type) {
  if (type === "goal") return "Gol";
  if (type === "own_goal") return "Autogol";
  if (type === "yellow") return "Amarilla";
  if (type === "red") return "Roja";
  return "Evento";
}

function RefereeSheetForm({ authToken, match, onCancel, onSaved }) {
  const [homeGoals, setHomeGoals] = useState(match.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(match.awayGoals ?? 0);
  const [sheetMode, setSheetMode] = useState("played");
  const [defaultWinner, setDefaultWinner] = useState("home");
  const [defaultScore, setDefaultScore] = useState("3");
  const [observations, setObservations] = useState(match.observations || "");
  const [events, setEvents] = useState((match.events || []).map((event, index) => ({
    id: `saved-${match.id}-${index}-${event.type}-${event.playerId}`,
    lockedTeamId: event.teamId || match.homeTeamId,
    ...event
  })));
  const [playerSearches, setPlayerSearches] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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

  function addEvent(type, teamId) {
    setEvents((current) => [...current, createEvent(match, type, teamId)]);
  }

  function updateEvent(eventId, field, value) {
    setEvents((current) => current.map((event) => {
      if (event.id !== eventId) return event;
      const nextEvent = {
        ...event,
        [field]: value,
        suspensionMatches: field === "type" && value === "red" ? Math.max(Number(event.suspensionMatches || 1), 1) : event.suspensionMatches,
        reason: field === "type" && value !== "red" ? "" : event.reason
      };
      if (field === "type") {
        nextEvent.playerId = getPlayersForEvent(match, nextEvent)[0]?.id || "";
      }
      return nextEvent;
    }));
  }

  function updatePlayerSearch(eventId, value) {
    setPlayerSearches((current) => ({ ...current, [eventId]: value }));
  }

  function removeEvent(eventId) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
    setPlayerSearches((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
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

    const confirmed = window.confirm(
      `¿Enviar acta a revision?\n\nPartido: ${match.homeTeamName} vs ${match.awayTeamName}\nMarcador reportado: ${homeGoals}-${awayGoals}\nEventos: ${cleanEvents.length}\n\nEl administrador debera aprobarla para que sea oficial.`
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
        events: cleanEvents.map((item) => ({
          type: item.type,
          teamId: item.teamId,
          playerId: item.playerId,
          minute: item.minute,
          suspensionMatches: item.type === "red" ? item.suspensionMatches || 1 : 0,
          reason: item.type === "red" ? item.reason : ""
        }))
      });
      onSaved(nextPayload);
    } catch (saveError) {
      setMessage(saveError.message || "No se pudo guardar el acta.");
    } finally {
      setSaving(false);
    }
  }

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
        <div>
          <span>Local</span>
          <strong>{match.homeTeamName}</strong>
        </div>
        <div className="referee-score-box">
          <input aria-label="Goles local" min="0" type="number" value={homeGoals} onChange={(event) => setHomeGoals(event.target.value)} />
          <span>-</span>
          <input aria-label="Goles visitante" min="0" type="number" value={awayGoals} onChange={(event) => setAwayGoals(event.target.value)} />
        </div>
        <div>
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
        {events.map((eventItem, index) => {
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
            <article className="referee-event-row" key={eventItem.id}>
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
                    <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}</option>
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
        })}
        {!events.length && <p className="empty">Agrega goles, tarjetas o autogoles con los botones superiores.</p>}
      </div>

      <label>Observaciones
        <textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Notas del partido, incidentes o acuerdos." />
      </label>
      {message && <p className={message.startsWith("No se") || message.startsWith("Revisa") || message.startsWith("Toda") ? "auth-error" : "auth-ok"}>{message}</p>}
      <div className="inline-actions">
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRefereePortal(authToken)
      .then((nextPayload) => {
        if (!cancelled) {
          setPayload(nextPayload);
          setError("");
        }
      })
      .catch((portalError) => {
        if (!cancelled) setError(portalError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

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

  if (captureMatch) {
    return (
      <main className="page referee-portal-page referee-acta-page">
        <section className="panel referee-section">
          <RefereeSheetForm
            authToken={authToken}
            match={captureMatch}
            onCancel={() => setCaptureMatchId("")}
            onSaved={(nextPayload) => {
              setPayload(nextPayload);
              setCaptureMatchId("");
              setActiveView("pending");
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
              <MatchCard match={match} onCapture={setCaptureMatchId} />
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

import { useEffect, useMemo, useState } from "react";
import { getFormPayload } from "./forms.js";
import { PlayerPhotoUploader } from "./PlayerPhotoUploader.jsx";
import { SectionHeading } from "./SectionHeading.jsx";
import { uploadImage } from "../lib/uploadApi.js";
import { createTeamPortalPlayer, fetchTeamPortal, submitTeamMatchRoster, updateTeamPortalLogo, updateTeamPortalPlayer } from "../lib/teamDelegateApi.js";
import { getPlayerPhotoInitials } from "../lib/playerPhotoProcessing.js";

const PLAYER_POSITION_OPTIONS = ["Arquero", "Defensor", "Mediocampista", "Delantero"];

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

export function TeamPortal({ authToken, currentUser }) {
  const [context, setContext] = useState(null);
  const [players, setPlayers] = useState([]);
  const [eligiblePlayers, setEligiblePlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [rosterDrafts, setRosterDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [photoResetKey, setPhotoResetKey] = useState(0);
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [busyPlayerId, setBusyPlayerId] = useState("");
  const [busyMatchId, setBusyMatchId] = useState("");
  const [teamLogoResetKey, setTeamLogoResetKey] = useState(0);
  const filteredPlayers = useMemo(() => {
    const query = normalizeSearch(playerQuery);
    return players.filter((player) => {
      const matchesQuery = !query || normalizeSearch(`${player.name} ${player.number || ""}`).includes(query);
      const matchesPosition = !positionFilter || player.position === positionFilter;
      return matchesQuery && matchesPosition;
    });
  }, [playerQuery, players, positionFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTeamPortal(authToken)
      .then((payload) => {
        if (cancelled) return;
        applyPortalPayload(payload);
        writeTeamPortalCache(currentUser?.id, payload);
        setError("");
      })
      .catch((loadError) => {
        if (cancelled) return;
        const cachedPayload = readTeamPortalCache(currentUser?.id);
        if (cachedPayload) {
          applyPortalPayload(cachedPayload);
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
    if (!context?.canManageRoster) return;

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
      form.reset();
      setPhotoResetKey((value) => value + 1);
      setRosterExpanded(true);
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo registrar el jugador.");
    }
  }

  async function submitPlayerEdit(event, player) {
    event.preventDefault();
    if (!context?.canManageRoster || busyPlayerId) return;

    const payload = getFormPayload(event.currentTarget);
    setBusyPlayerId(player.id);
    setNotice("Actualizando jugador...");
    setError("");

    try {
      const photoPayload = await buildImageUploadPayload(payload, player.photoUrl || "", authToken, context.leagueId, "player-photos");
      const response = await updateTeamPortalPlayer(authToken, player.id, {
        name: payload.name,
        number: payload.number,
        position: payload.position,
        ...photoPayload
      });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setEditingPlayerId("");
      setNotice("Jugador actualizado correctamente.");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el jugador.");
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
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el escudo.");
    }
  }

  function updateRosterDraft(matchId, updater) {
    setRosterDrafts((current) => ({
      ...current,
      [matchId]: updater(current[matchId] || { playerIds: [], captainPlayerId: "", notes: "" })
    }));
  }

  async function submitMatchRoster(event, match) {
    event.preventDefault();
    if (busyMatchId) return;
    const draft = rosterDrafts[match.id] || { playerIds: [], captainPlayerId: "", notes: "" };
    if (!draft.playerIds.length) {
      setError("Selecciona al menos un jugador para enviar la convocatoria.");
      return;
    }
    if (!draft.captainPlayerId || !draft.playerIds.includes(draft.captainPlayerId)) {
      setError("Selecciona un capitan dentro de la convocatoria.");
      return;
    }
    const confirmed = window.confirm(`¿Enviar convocatoria de ${context.teamName} vs ${match.opponentName}?\n\nJugadores: ${draft.playerIds.length}\nCapitan: ${getEligiblePlayerName(eligiblePlayers, draft.captainPlayerId)}\n\nEl arbitro vera esta lista para capturar el acta.`);
    if (!confirmed) return;

    setBusyMatchId(match.id);
    setNotice("Enviando convocatoria...");
    setError("");
    try {
      const response = await submitTeamMatchRoster(authToken, match.id, draft);
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setNotice("Plantilla enviada exitosamente.");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo enviar la convocatoria.");
    } finally {
      setBusyMatchId("");
    }
  }

  if (loading) {
    return (
      <main className="page team-portal-page">
        <section className="panel">
          <SectionHeading eyebrow="Portal de equipo" title="Cargando plantilla" />
          <p className="helper-text">Preparando la informacion de tu equipo.</p>
        </section>
      </main>
    );
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

  return (
    <main className="page team-portal-page">
      <section className="panel team-portal-hero">
        <SectionHeading eyebrow={context.leagueName} title={context.teamName} />
        <div className={`team-roster-status ${context.canManageRoster ? "open" : "closed"}`}>
          <strong>{context.canManageRoster ? "Registro abierto" : "Registro cerrado"}</strong>
          <span>
            {context.canManageRoster
              ? "Puedes agregar jugadores a tu plantilla en este momento."
              : "Tu liga debe habilitar el registro para que puedas agregar jugadores."}
          </span>
        </div>
        <p className="helper-text">
          Sesion de {currentUser?.name || "delegado"} | Categoria: {context.competitionName || "Sin categoria asignada"}
        </p>
        {notice && <p className="auth-ok">{notice}</p>}
        {error && <p className="auth-error">{error}</p>}
      </section>

      {context.canManageRoster && (
        <section className="panel">
          <SectionHeading eyebrow="Captura" title="Registrar jugador" />
          <form className="team-player-form" onSubmit={submitPlayer}>
            <label>Nombre completo
              <input name="name" required pattern=".*\S+\s+\S+.*" placeholder="NOMBRE Y APELLIDOS" title="Registra nombre(s) y apellido(s)" />
            </label>
            <label>Numero de jersey
              <input name="number" type="number" min="0" max="9999" placeholder="10" />
            </label>
            <label>Posicion
              <select name="position" defaultValue="Delantero">
                {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
            <div className="wide-field">
              <PlayerPhotoUploader key={photoResetKey} />
            </div>
            <button className="primary" type="submit">Guardar jugador</button>
          </form>
        </section>
      )}

      <section className="panel">
        <SectionHeading eyebrow="Partidos" title="Convocatoria por partido" />
        <p className="helper-text">Selecciona los jugadores que se presentaran al partido y marca al capitan. El arbitro usara esta lista para capturar el acta.</p>
        <div className="team-match-roster-list">
          {matches.map((match) => {
            const draft = rosterDrafts[match.id] || { playerIds: [], captainPlayerId: "", notes: "" };
            const selectedCount = draft.playerIds.length;
            const availablePlayers = eligiblePlayers.filter((player) => {
              const blockedBySuspension = Boolean(player.suspension);
              const blockedByPlayoff = match.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
              return !blockedBySuspension && !blockedByPlayoff;
            });
            return (
              <details className="team-match-roster-card" key={match.id}>
                <summary>
                  <div>
                    <strong>{context.teamName} vs {match.opponentName}</strong>
                    <span>{match.date || "Fecha por definir"} | {match.time || "Hora por definir"} | {match.venue || "Cancha por definir"}</span>
                  </div>
                  <b>{match.roster ? "Enviada" : "Pendiente"} | {selectedCount} jugador(es)</b>
                </summary>
                <form onSubmit={(event) => submitMatchRoster(event, match)}>
                  {match.roster?.captainPin && (
                    <div className="team-match-pin-box">
                      <span>PIN de autorizacion del capitan</span>
                      <strong>{match.roster.captainPin}</strong>
                      <small>Comparte este PIN con el arbitro solo al validar el acta del partido.</small>
                    </div>
                  )}
                  <label>Capitan
                    <select
                      value={draft.captainPlayerId}
                      onChange={(event) => updateRosterDraft(match.id, (current) => ({ ...current, captainPlayerId: event.target.value }))}
                    >
                      <option value="">Selecciona capitan</option>
                      {availablePlayers.filter((player) => draft.playerIds.includes(player.id)).map((player) => (
                        <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="team-match-player-grid">
                    {eligiblePlayers.map((player) => {
                      const blockedBySuspension = Boolean(player.suspension);
                      const blockedByPlayoff = match.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
                      const disabled = blockedBySuspension || blockedByPlayoff;
                      const checked = draft.playerIds.includes(player.id) && !disabled;
                      return (
                        <label className={disabled ? "blocked" : ""} key={player.id}>
                          <input
                            checked={checked}
                            disabled={disabled}
                            type="checkbox"
                            onChange={(event) => updateRosterDraft(match.id, (current) => {
                              const nextIds = new Set(current.playerIds || []);
                              if (event.target.checked) nextIds.add(player.id);
                              else nextIds.delete(player.id);
                              const playerIds = [...nextIds];
                              return {
                                ...current,
                                playerIds,
                                captainPlayerId: playerIds.includes(current.captainPlayerId) ? current.captainPlayerId : ""
                              };
                            })}
                          />
                          <span>
                            <strong>#{player.number || "-"} {player.name}</strong>
                            <small>
                              {blockedBySuspension
                                ? "Suspendido"
                                : blockedByPlayoff
                                  ? `No cumple liguilla (${player.playoffEligibility.recognizedAppearances}/${player.playoffEligibility.required})`
                                  : player.position || "Jugador"}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <label className="wide-field">Notas para el arbitro
                    <input
                      value={draft.notes || ""}
                      onChange={(event) => updateRosterDraft(match.id, (current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Ej. Capitan alterno, uniforme, observaciones"
                    />
                  </label>
                  <div className="inline-actions">
                    <button className="primary" type="submit" disabled={busyMatchId === match.id}>
                      {busyMatchId === match.id ? "Enviando..." : match.roster ? "Actualizar convocatoria" : "Enviar convocatoria"}
                    </button>
                  </div>
                </form>
              </details>
            );
          })}
          {!matches.length && <p className="empty">No hay partidos programados para este equipo.</p>}
        </div>
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Equipo" title="Escudo del equipo" />
        <form className="team-logo-form" onSubmit={submitTeamLogo}>
          <PlayerPhotoUploader
            key={teamLogoResetKey}
            addLabel="Agregar escudo"
            authorizedLabel="Escudo autorizado"
            changeLabel="Cambiar escudo"
            defaultAuthorized={Boolean(context.teamLogoUrl)}
            existingPhotoUrl={context.teamLogoUrl || ""}
            playerName={context.teamName}
            removeLabel="Quitar escudo"
          />
          <button className="primary" type="submit">Guardar escudo</button>
        </form>
      </section>

      <section className="panel">
        <div className="team-portal-roster-head">
          <SectionHeading eyebrow="Plantilla" title={`${players.length} jugador(es) registrados`} />
          <button type="button" onClick={() => setRosterExpanded((value) => !value)}>
            {rosterExpanded ? "Comprimir plantilla" : "Ver plantilla"}
          </button>
        </div>

        <div className="team-portal-filters">
          <label>Buscar jugador
            <input
              value={playerQuery}
              onChange={(event) => {
                setPlayerQuery(event.target.value);
                setRosterExpanded(true);
              }}
              placeholder="Nombre o numero"
            />
          </label>
          <label>Posicion
            <select
              value={positionFilter}
              onChange={(event) => {
                setPositionFilter(event.target.value);
                setRosterExpanded(true);
              }}
            >
              <option value="">Todas</option>
              {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
            </select>
          </label>
          <span>{filteredPlayers.length} resultado(s)</span>
        </div>

        {!rosterExpanded ? (
          <p className="helper-text">La plantilla esta comprimida para evitar listas largas. Usa buscar o presiona Ver plantilla para revisar jugadores.</p>
        ) : (
          <div className="team-portal-player-list">
            {filteredPlayers.map((player) => {
              const isEditing = editingPlayerId === player.id;
              return (
                <article className={isEditing ? "editing" : ""} key={player.id}>
                  <span className="player-avatar team-portal-avatar">
                    {player.photoAuthorized && player.photoUrl ? <img alt="" loading="lazy" src={player.photoUrl} /> : null}
                    <span>{getPlayerPhotoInitials(player.name)}</span>
                  </span>
                  <span>#{player.number || "-"}</span>
                  <div>
                    <strong>{player.name}</strong>
                    <small>{player.position || "JUGADOR"}</small>
                    <PlayoffProgress eligibility={player.playoffEligibility} />
                  </div>
                  <button
                    type="button"
                    disabled={!context.canManageRoster}
                    onClick={() => setEditingPlayerId(isEditing ? "" : player.id)}
                  >
                    {isEditing ? "Cerrar" : context.canManageRoster ? "Editar" : "Edicion cerrada"}
                  </button>
                  {isEditing && (
                    <form className="team-player-edit-form" onSubmit={(event) => submitPlayerEdit(event, player)}>
                      <label>Nombre completo
                        <input name="name" required pattern=".*\S+\s+\S+.*" defaultValue={player.name} title="Registra nombre(s) y apellido(s)" />
                      </label>
                      <label>Numero
                        <input name="number" type="number" min="0" max="9999" defaultValue={player.number || ""} />
                      </label>
                      <label>Posicion
                        <select name="position" defaultValue={getPlayerPositionOptionValue(player.position)}>
                          {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                        </select>
                      </label>
                      <div className="wide-field">
                        <PlayerPhotoUploader
                          compact
                          defaultAuthorized={player.photoAuthorized === true}
                          existingPhotoUrl={player.photoUrl || ""}
                          playerName={player.name}
                        />
                      </div>
                      <div className="inline-actions">
                        <button className="primary" type="submit" disabled={busyPlayerId === player.id}>
                          {busyPlayerId === player.id ? "Guardando..." : "Guardar cambios"}
                        </button>
                        <button type="button" onClick={() => setEditingPlayerId("")}>Cancelar</button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
            {!players.length && <p className="empty">Aun no hay jugadores registrados en este equipo.</p>}
            {players.length > 0 && !filteredPlayers.length && <p className="empty">No hay jugadores con esos filtros.</p>}
          </div>
        )}
      </section>
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
    const rosterPlayerIds = (match.roster?.players || [])
      .map((entry) => typeof entry === "string" ? entry : entry.playerId)
      .filter((playerId) => availablePlayerIds.includes(playerId));
    const playerIds = rosterPlayerIds.length ? rosterPlayerIds : availablePlayerIds;
    const captainPlayerId = playerIds.includes(match.roster?.captainPlayerId)
      ? match.roster.captainPlayerId
      : playerIds[0] || "";
    drafts[match.id] = {
      playerIds,
      captainPlayerId,
      notes: match.roster?.notes || ""
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
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

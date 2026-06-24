import { useEffect, useMemo, useState } from "react";
import { getFormPayload } from "./forms.js";
import { PlayerPhotoUploader } from "./PlayerPhotoUploader.jsx";
import { SectionHeading } from "./SectionHeading.jsx";
import { uploadImage } from "../lib/uploadApi.js";
import { createTeamPortalPlayer, fetchTeamPortal, updateTeamPortalLogo, updateTeamPortalPlayer } from "../lib/teamDelegateApi.js";
import { getPlayerPhotoInitials } from "../lib/playerPhotoProcessing.js";

const PLAYER_POSITION_OPTIONS = ["Arquero", "Defensor", "Mediocampista", "Delantero"];

export function TeamPortal({ authToken, currentUser }) {
  const [context, setContext] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [photoResetKey, setPhotoResetKey] = useState(0);
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [busyPlayerId, setBusyPlayerId] = useState("");
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
        setContext(payload.context);
        setPlayers(payload.players || []);
        setError("");
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "No se pudo cargar el portal.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

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
      setContext(response.context);
      setPlayers(response.players || []);
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
      setContext(response.context);
      setPlayers(response.players || []);
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
      setContext(response.context);
      setPlayers(response.players || []);
      setTeamLogoResetKey((value) => value + 1);
      setNotice("Escudo actualizado correctamente.");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el escudo.");
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
                        <select name="position" defaultValue={player.position || "Delantero"}>
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

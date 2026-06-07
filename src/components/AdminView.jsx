import { useEffect, useMemo, useState } from "react";
import { DEFAULT_IDENTITY } from "../data/seedData.js";
import { fetchAuditLogs } from "../lib/auditApi.js";
import { formatDate, getCompetition, getCurrentDisplayRound, getDefaultCompetitionId, getPlayer, getTeam, scopeLeagueToCompetition } from "../lib/domain.js";
import { MEMBERSHIP_PLANS, canAddCompetitionByPlan, canAddTeamByPlan, canUsePlayoffsByPlan, formatPlanLimit, getLeaguePlan, getPlanUsage } from "../lib/plans.js";
import { getFormPayload, handleFormSubmit } from "./forms.js";
import { SectionHeading } from "./PublicView.jsx";
import { createUser, deleteUser, disableUser, fetchUsers, updateUser } from "../lib/userApi.js";

export function AdminView({
  adminPanel,
  authToken,
  canUseSuperAdmin,
  currentUser,
  league,
  onAddLeague,
  onAddCompetition,
  onAddMatch,
  onAddPlayer,
  onAddPlayerInjury,
  onAddPlayerSanction,
  onAddTeam,
  onDeleteMatch,
  onDeleteLeague,
  onDeletePlayer,
  onDeletePlayerInjury,
  onDeletePlayerSanction,
  onDeleteTeam,
  onGenerateSchedule,
  onResetDemo,
  onSaveIdentity,
  onSaveMatchSheet,
  onSaveRules,
  onSetAdminPanel,
  onToggleLeague,
  onUpdateCompetition,
  onUpdateLeagueMembership,
  onUpdateMatch,
  onUpdatePlayer,
  onUpdatePlayerInjury,
  onUpdateTeam,
  store,
  userListRefreshKey = 0
}) {
  return (
    <main className="page">
      <section className="admin-shell">
        <div className="admin-sidebar">
          <span className="eyebrow">Panel administrativo</span>
          <h1>Operacion</h1>
          {currentUser && (
            <p className="admin-user-note">
              {currentUser.role === "super_admin" ? "Control total de plataforma" : `Editando ${league.name}`}
            </p>
          )}
          <button className={adminPanel === "league" ? "active" : ""} onClick={() => onSetAdminPanel("league")}>Admin de liga</button>
          {canUseSuperAdmin && (
            <button className={adminPanel === "super" ? "active" : ""} onClick={() => onSetAdminPanel("super")}>Super admin</button>
          )}
          <button className={adminPanel === "model" ? "active" : ""} onClick={() => onSetAdminPanel("model")}>Modelo futuro</button>
        </div>
        <div className="admin-content">
          {adminPanel === "league" && (
            <LeagueAdmin
              currentUser={currentUser}
              league={league}
              onAddCompetition={onAddCompetition}
              onAddMatch={onAddMatch}
              onAddPlayer={onAddPlayer}
              onAddPlayerInjury={onAddPlayerInjury}
              onAddPlayerSanction={onAddPlayerSanction}
              onAddTeam={onAddTeam}
              onDeleteMatch={onDeleteMatch}
              onDeletePlayer={onDeletePlayer}
              onDeletePlayerInjury={onDeletePlayerInjury}
              onDeletePlayerSanction={onDeletePlayerSanction}
              onDeleteTeam={onDeleteTeam}
              onGenerateSchedule={onGenerateSchedule}
              onSaveIdentity={onSaveIdentity}
              onSaveMatchSheet={onSaveMatchSheet}
              onSaveRules={onSaveRules}
              onUpdateCompetition={onUpdateCompetition}
              onUpdateMatch={onUpdateMatch}
              onUpdatePlayer={onUpdatePlayer}
              onUpdatePlayerInjury={onUpdatePlayerInjury}
              onUpdateTeam={onUpdateTeam}
            />
          )}
          {adminPanel === "super" && canUseSuperAdmin && (
            <SuperAdmin
              onAddLeague={onAddLeague}
              onDeleteLeague={onDeleteLeague}
              onResetDemo={onResetDemo}
              onToggleLeague={onToggleLeague}
              onUpdateLeagueMembership={onUpdateLeagueMembership}
              authToken={authToken}
              currentUser={currentUser}
              store={store}
              userListRefreshKey={userListRefreshKey}
            />
          )}
          {adminPanel === "model" && <ModelNotes />}
        </div>
      </section>
    </main>
  );
}

function LeagueAdmin({
  currentUser,
  league,
  onAddCompetition,
  onAddMatch,
  onAddPlayer,
  onAddPlayerInjury,
  onAddPlayerSanction,
  onAddTeam,
  onDeleteMatch,
  onDeletePlayer,
  onDeletePlayerInjury,
  onDeletePlayerSanction,
  onDeleteTeam,
  onGenerateSchedule,
  onSaveIdentity,
  onSaveMatchSheet,
  onSaveRules,
  onUpdateCompetition,
  onUpdateMatch,
  onUpdatePlayer,
  onUpdatePlayerInjury,
  onUpdateTeam
}) {
  const identity = league.identity || DEFAULT_IDENTITY;
  const plan = getLeaguePlan(league);
  const [activeSection, setActiveSection] = useState("capture");
  const sections = [
    { id: "capture", label: "Captura" },
    { id: "tournaments", label: "Torneos" },
    { id: "squads", label: "Plantillas" },
    { id: "lists", label: "Listados" },
    { id: "sheet", label: "Acta" },
    { id: "sanctions", label: "Sanciones" },
    { id: "injuries", label: "Lesiones" },
    { id: "rules", label: "Reglas" },
    { id: "identity", label: "Identidad" }
  ];

  return (
    <>
      <section className="panel admin-home-panel">
        <div className="admin-league-head">
          <div>
            <span className="eyebrow">Admin de liga</span>
            <h2>{league.name}</h2>
          </div>
          <div className="admin-metrics" aria-label="Resumen administrativo">
            <span><strong>{league.teams.length}</strong> Equipos</span>
            <span><strong>{league.players.length}</strong> Jugadores</span>
            <span><strong>{league.matches.length}</strong> Partidos</span>
            <span><strong>{league.competitions?.length || 0}</strong> Torneos</span>
          </div>
        </div>
        {currentUser?.role === "super_admin" && (
          <div className="super-admin-warning">
            <strong>Modo super admin</strong>
            <span>Estas operando {league.name}. Verifica que esta sea la liga correcta antes de guardar cambios.</span>
          </div>
        )}
        <div className="admin-section-tabs" aria-label="Secciones de captura">
          {sections.map((section) => (
            <button
              className={activeSection === section.id ? "active" : ""}
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </section>

      {activeSection === "capture" && (
        <CapturePanel
          league={league}
          onGenerateSchedule={onGenerateSchedule}
          onAddMatch={onAddMatch}
          onAddPlayer={onAddPlayer}
          onAddTeam={onAddTeam}
        />
      )}

      {activeSection === "tournaments" && (
        <TournamentsPanel
          league={league}
          onAddCompetition={onAddCompetition}
          onUpdateCompetition={onUpdateCompetition}
        />
      )}

      {activeSection === "squads" && <SquadsPanel league={league} />}

      {activeSection === "lists" && (
        <ManagementBoard
          league={league}
          onDeleteMatch={onDeleteMatch}
          onDeletePlayer={onDeletePlayer}
          onDeleteTeam={onDeleteTeam}
          onUpdateMatch={onUpdateMatch}
          onUpdatePlayer={onUpdatePlayer}
          onUpdateTeam={onUpdateTeam}
        />
      )}

      {activeSection === "sheet" && (
        <section className="panel">
          <SectionHeading eyebrow="Acta" title="Acta de partido" />
          <MatchSheet league={league} onSaveMatchSheet={onSaveMatchSheet} />
        </section>
      )}

      {activeSection === "sanctions" && (
        <SanctionsPanel
          league={league}
          onAddPlayerSanction={onAddPlayerSanction}
          onDeletePlayerSanction={onDeletePlayerSanction}
        />
      )}

      {activeSection === "injuries" && (
        <InjuriesPanel
          league={league}
          onAddPlayerInjury={onAddPlayerInjury}
          onDeletePlayerInjury={onDeletePlayerInjury}
          onUpdatePlayerInjury={onUpdatePlayerInjury}
        />
      )}

      {activeSection === "rules" && <RulesPanel league={league} onSaveRules={onSaveRules} />}

      {activeSection === "identity" && (
        <section className="panel">
          <SectionHeading eyebrow="Configuracion" title="Identidad publica de la liga" />
          <form className="identity-form" onSubmit={handleFormSubmit(onSaveIdentity)}>
            <label>Nombre de la liga<input name="name" required defaultValue={league.name} /></label>
            <label>Municipio o zona<input name="city" required defaultValue={league.city} /></label>
            <label>Temporada<input name="season" required defaultValue={league.season} /></label>
            <label>Distintivo local<input name="nickname" defaultValue={identity.nickname} placeholder="Ej. Pueblo de las 3 campanas" /></label>
            <label>Actividades o rasgos<input name="activities" defaultValue={identity.activities} placeholder="Ej. Aguacate, pan" /></label>
            <label>Patrocinador / anuncio<input name="adBanner" defaultValue={league.adBanner} disabled={!plan.features.adBanner} /></label>
            {!plan.features.adBanner && <p className="helper-text">El banner publicitario esta disponible desde Membresia Pro.</p>}
            <label>Color principal<input name="primaryColor" type="color" defaultValue={identity.primaryColor} /></label>
            <label>Color secundario<input name="secondaryColor" type="color" defaultValue={identity.secondaryColor} /></label>
            <label>Color acento<input name="accentColor" type="color" defaultValue={identity.accentColor} /></label>
            <label className="wide-field">Texto publico<textarea name="publicIntro" defaultValue={identity.publicIntro} /></label>
            <label className="wide-field">Destacados manuales<textarea name="highlights" defaultValue={(league.highlights || []).join("\n")} placeholder="Un destacado por linea" /></label>
            <button className="primary" type="submit">Guardar identidad</button>
          </form>
        </section>
      )}
    </>
  );
}

function TournamentsPanel({ league, onAddCompetition, onUpdateCompetition }) {
  const activeCompetitions = (league.competitions || []).filter((competition) => competition.status !== "archived");
  const archivedCompetitions = (league.competitions || []).filter((competition) => competition.status === "archived");
  const plan = getLeaguePlan(league);
  const planCheck = canAddCompetitionByPlan(league);

  return (
    <section className="panel">
      <SectionHeading eyebrow="Temporadas" title="Torneos de la liga" />
      <p className="helper-text">Usa activo para torneos visibles. Archiva temporadas viejas para guardarlas sin saturar la portada publica. Inicio y fin son opcionales.</p>
      <p className="helper-text">
        Plan {plan.label}: {activeCompetitions.length}/{plan.maxActiveCompetitions} torneos activos.
        {!planCheck.allowed ? ` ${planCheck.message}` : ""}
      </p>
      <form className="tournament-form" onSubmit={(event) => {
        event.preventDefault();
        onAddCompetition(getTournamentFormPayload(event.currentTarget));
        event.currentTarget.reset();
      }}>
        <label>Nombre
          <input name="name" required placeholder="Ej. Copa Tingüindín 2026" />
        </label>
        <TournamentTypeFields />
          <label>Temporada
            <input name="season" required defaultValue={league.season} placeholder="Apertura 2026" />
          </label>
        <label>Jornada activa<input name="activeRound" type="number" min="1" placeholder="Opcional" /></label>
          <label>Inicio<input name="startsAt" type="date" /></label>
        <label>Fin<input name="endsAt" type="date" /></label>
        <label>Estado
          <select name="status" defaultValue="active">
            <option value="active">Activo</option>
            <option value="archived">Archivado</option>
          </select>
        </label>
        <button className="primary" type="submit" disabled={!planCheck.allowed}>Crear torneo</button>
      </form>

      <TournamentList title="Torneos activos" competitions={activeCompetitions} league={league} onUpdateCompetition={onUpdateCompetition} />
      {!!archivedCompetitions.length && (
        <details className="archive-box">
          <summary>Historial archivado ({archivedCompetitions.length})</summary>
          <TournamentList title="" competitions={archivedCompetitions} league={league} onUpdateCompetition={onUpdateCompetition} />
        </details>
      )}
    </section>
  );
}

function SquadsPanel({ league }) {
  const sortedTeams = useMemo(
    () => [...league.teams].sort((a, b) => a.name.localeCompare(b.name)),
    [league.teams]
  );
  const [selectedTeamId, setSelectedTeamId] = useState(sortedTeams[0]?.id || "");
  const selectedTeam = sortedTeams.find((team) => team.id === selectedTeamId) || sortedTeams[0] || null;
  const squadPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return league.players
      .filter((player) => player.teamId === selectedTeam.id)
      .sort((a, b) => Number(a.number || 999) - Number(b.number || 999) || a.name.localeCompare(b.name));
  }, [league.players, selectedTeam]);

  useEffect(() => {
    if (!sortedTeams.length) {
      setSelectedTeamId("");
      return;
    }
    if (!sortedTeams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(sortedTeams[0].id);
    }
  }, [selectedTeamId, sortedTeams]);

  return (
    <section className="panel">
      <SectionHeading eyebrow="Equipos" title="Plantillas por equipo" />
      {!sortedTeams.length ? (
        <p className="empty">Aun no hay equipos registrados.</p>
      ) : (
        <>
          <div className="squad-toolbar">
            <label>Equipo
              <select value={selectedTeam?.id || ""} onChange={(event) => setSelectedTeamId(event.target.value)}>
                {sortedTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          </div>

          <div className="squad-card">
            <div className="squad-head">
              <div>
                <span className="eyebrow">Plantilla</span>
                <h3>{selectedTeam.name}</h3>
                <p>{selectedTeam.coach ? `ENTRENADOR: ${selectedTeam.coach}` : "ENTRENADOR SIN REGISTRAR"}</p>
              </div>
              <div className="squad-metrics">
                <span><strong>{squadPlayers.length}</strong> Jugadores</span>
                <span><strong>{selectedTeam.status === "withdrawn" ? "BAJA" : "ACTIVO"}</strong> Estado</span>
              </div>
            </div>

            <div className="squad-table" role="table" aria-label={`Plantilla ${selectedTeam.name}`}>
              <div className="squad-row squad-header" role="row">
                <span role="columnheader">#</span>
                <span role="columnheader">Jugador</span>
                <span role="columnheader">Posicion</span>
                <span role="columnheader">Estado</span>
              </div>
              {squadPlayers.map((player) => (
                <div className="squad-row" key={player.id} role="row">
                  <span role="cell">{player.number || "-"}</span>
                  <strong role="cell">{player.name}</strong>
                  <span role="cell">{player.position || "JUGADOR"}</span>
                  <span role="cell">{player.status === "inactive" ? "INACTIVO" : "ACTIVO"}</span>
                </div>
              ))}
              {!squadPlayers.length && <p className="empty">Este equipo aun no tiene jugadores registrados.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const TOURNAMENT_TYPE_OPTIONS = [
  { value: "liga", label: "Liga" },
  { value: "copa", label: "Copa" },
  { value: "barrios", label: "Barrios" },
  { value: "amistoso", label: "Amistoso" }
];

function isPresetTournamentType(value) {
  return TOURNAMENT_TYPE_OPTIONS.some((option) => option.value === value);
}

function getTournamentFormPayload(form) {
  const payload = getFormPayload(form);
  const typePreset = payload.typePreset || "liga";
  const typeCustom = String(payload.typeCustom || "").trim();

  return {
    ...payload,
    type: typePreset === "custom" ? typeCustom || "OTRO" : typePreset
  };
}

function TournamentTypeFields({ defaultValue = "liga" }) {
  const isCustom = defaultValue && !isPresetTournamentType(defaultValue);
  const [typePreset, setTypePreset] = useState(isCustom ? "custom" : defaultValue || "liga");

  return (
    <>
      <label>Tipo
        <select name="typePreset" value={typePreset} onChange={(event) => setTypePreset(event.target.value)}>
          {TOURNAMENT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value="custom">Otro</option>
        </select>
      </label>
      {typePreset === "custom" && (
        <label>Tipo personalizado
          <input name="typeCustom" defaultValue={isCustom ? defaultValue : ""} required placeholder="Ej. Veteranos, Femenil, Intercomunidades" />
        </label>
      )}
    </>
  );
}

function TournamentList({ title, competitions, league, onUpdateCompetition }) {
  return (
    <div className="tournament-list">
      {title && <h3>{title}</h3>}
      {competitions.map((competition) => (
        <form
          className="tournament-card"
          key={competition.id}
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateCompetition(competition.id, getTournamentFormPayload(event.currentTarget));
          }}
        >
          <label>Nombre<input name="name" defaultValue={competition.name} required /></label>
          <TournamentTypeFields defaultValue={competition.type} />
          <label>Temporada<input name="season" defaultValue={competition.season} required /></label>
          <label>J. activa<input name="activeRound" defaultValue={competition.activeRound || ""} type="number" min="1" placeholder="Auto" /></label>
          <label>Inicio<input name="startsAt" defaultValue={competition.startsAt || ""} type="date" /></label>
          <label>Fin<input name="endsAt" defaultValue={competition.endsAt || ""} type="date" /></label>
          <label>Estado
            <select name="status" defaultValue={competition.status}>
              <option value="active">Activo</option>
              <option value="archived">Archivado</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input name="makeCurrent" type="checkbox" defaultChecked={league.currentCompetitionId === competition.id} />
            Actual
          </label>
          <button className="primary" type="submit">Guardar</button>
        </form>
      ))}
      {!competitions.length && <p className="empty">No hay torneos en esta seccion.</p>}
    </div>
  );
}

function CapturePanel({ league, onAddMatch, onAddPlayer, onAddTeam, onGenerateSchedule }) {
  const [captureMode, setCaptureMode] = useState("team");
  const modes = [
    { id: "team", label: "Equipo" },
    { id: "player", label: "Jugador" },
    { id: "match", label: "Partido" },
    { id: "schedule", label: "Calendario" }
  ];
  const defaultCompetitionId = getDefaultCompetitionId(league);
  const activeCompetitionLeague = scopeLeagueToCompetition(league, defaultCompetitionId);
  const nextRound = Math.max(1, ...activeCompetitionLeague.matches.map((match) => Number(match.round || 1)));
  const nextScheduleRound = activeCompetitionLeague.matches.length
    ? Math.max(...activeCompetitionLeague.matches.map((match) => Number(match.round || 1))) + 1
    : 1;
  const today = new Date().toISOString().slice(0, 10);
  const plan = getLeaguePlan(league);
  const usage = getPlanUsage(league);
  const teamPlanCheck = canAddTeamByPlan(league);
  const playoffPlanCheck = canUsePlayoffsByPlan(league);

  return (
    <section className="panel">
      <SectionHeading eyebrow={league.name} title="Captura operativa" />
      <div className="capture-shell">
        <aside className="capture-menu">
          <div className="capture-mode-tabs" aria-label="Tipo de captura">
            {modes.map((mode) => (
              <button
                className={captureMode === mode.id ? "active" : ""}
                key={mode.id}
                type="button"
                onClick={() => setCaptureMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="capture-summary">
            <span><strong>{league.teams.length}</strong> equipos</span>
            <span><strong>{league.players.length}</strong> jugadores</span>
            <span><strong>{activeCompetitionLeague.matches.length}</strong> partidos del torneo actual</span>
          </div>
        </aside>

        <div className="capture-workspace">
          {captureMode === "team" && (
            <form className="capture-form" onSubmit={handleFormSubmit(onAddTeam)}>
              <h3>Registrar equipo</h3>
              <p className="helper-text">Plan {plan.label}: {usage.teams}/{formatPlanLimit(plan.maxTeams)} equipos.</p>
              <div className="capture-fields two-cols">
                <label>Nombre del equipo<input name="name" required placeholder="Ej. Deportivo Sur" /></label>
                <label>Entrenador<input name="coach" placeholder="Nombre del responsable" /></label>
              </div>
              <button className="primary" type="submit" disabled={!teamPlanCheck.allowed}>Agregar equipo</button>
              {!teamPlanCheck.allowed && <p className="auth-error">{teamPlanCheck.message}</p>}
            </form>
          )}

          {captureMode === "player" && (
            <form className="capture-form" onSubmit={handleFormSubmit(onAddPlayer)}>
              <h3>Registrar jugador</h3>
              <div className="capture-fields two-cols">
                <label>Equipo<TeamSelect league={league} name="teamId" /></label>
                <label>Nombre<input name="name" required pattern=".*\S+\s+\S+.*" placeholder="NOMBRE Y APELLIDOS" title="Registra nombre(s) y apellido(s)" /></label>
                <label>Numero<input name="number" type="number" min="1" max="99" placeholder="10" /></label>
                <label>Posicion<input name="position" placeholder="Delantero" /></label>
              </div>
              <button className="primary" type="submit" disabled={!league.teams.length}>Agregar jugador</button>
            </form>
          )}

          {captureMode === "match" && (
            <form className="capture-form" onSubmit={handleFormSubmit(onAddMatch)}>
              <h3>Programar partido</h3>
              <div className="capture-fields three-cols">
                <label>Torneo<CompetitionSelect league={league} name="competitionId" defaultValue={defaultCompetitionId} /></label>
                <label>Tipo de partido
                  <select name="stage" defaultValue="regular">
                    <option value="regular">Temporada regular</option>
                    <option value="playoff" disabled={!playoffPlanCheck.allowed}>Liguilla</option>
                  </select>
                </label>
                <label>Jornada<input name="round" type="number" min="1" defaultValue={nextRound} required /></label>
                <label>Fase liguilla
                  <select name="playoffRound" defaultValue="">
                    <option value="">No aplica</option>
                    <option value="Cuartos de final">Cuartos de final</option>
                    <option value="Semifinal">Semifinal</option>
                    <option value="Final">Final</option>
                    <option value="Repechaje">Repechaje</option>
                  </select>
                </label>
                <label>Juego
                  <select name="playoffLeg" defaultValue="">
                    <option value="">Unico / no aplica</option>
                    <option value="Ida">Ida</option>
                    <option value="Vuelta">Vuelta</option>
                  </select>
                </label>
                <label>Fecha<input name="date" type="date" required /></label>
                <label>Hora<input name="time" type="time" required /></label>
                <label>Cancha<input name="venue" required placeholder="Cancha Municipal" /></label>
                <label>Local<TeamSelect league={league} name="homeTeamId" /></label>
                <label>Visitante<TeamSelect league={league} name="awayTeamId" /></label>
                <label>Global local<input name="aggregateHome" type="number" min="0" placeholder="Opcional" /></label>
                <label>Global visitante<input name="aggregateAway" type="number" min="0" placeholder="Opcional" /></label>
              </div>
              {!playoffPlanCheck.allowed && <p className="helper-text">{playoffPlanCheck.message}</p>}
              <button className="primary" type="submit" disabled={league.teams.length < 2}>Crear partido</button>
            </form>
          )}

          {captureMode === "schedule" && (
            <form
              className="capture-form schedule-generator-form"
              onSubmit={(event) => {
                event.preventDefault();
                const payload = getFormPayload(event.currentTarget);
                const message = payload.mode === "late"
                  ? "Se agregaran partidos para equipos nuevos sin borrar el calendario existente. ¿Continuar?"
                  : "Se generara el calendario regular con los equipos activos. ¿Continuar?";
                if (!window.confirm(message)) return;
                onGenerateSchedule(payload);
              }}
            >
              <h3>Generar calendario</h3>
              <p className="helper-text">Arma solo los cruces y jornadas. La hora, cancha y cualquier ajuste de fecha se edita despues en Listados &gt; Partidos.</p>
              <p className="helper-text">Plan {plan.label}: generador de calendario incluido.</p>
              <div className="capture-fields schedule-fields">
                <label>Torneo<CompetitionSelect league={league} name="competitionId" defaultValue={defaultCompetitionId} /></label>
                <label>Modo
                  <select name="mode" defaultValue="full">
                    <option value="full">Generar calendario completo</option>
                    <option value="late">Integrar equipos nuevos</option>
                  </select>
                </label>
                <label>Desde jornada<input name="startRound" type="number" min="1" defaultValue={nextScheduleRound} required /></label>
                <label>Fecha inicial<input name="startDate" type="date" defaultValue={today} required /></label>
                <label>Dias entre jornadas<input name="intervalDays" type="number" min="1" defaultValue="7" required /></label>
                <label className="checkbox-field"><input name="randomize" type="checkbox" defaultChecked />Aleatorio</label>
                <label className="checkbox-field"><input name="replaceScheduled" type="checkbox" />Reemplazar programados</label>
              </div>
              <button className="primary" type="submit" disabled={league.teams.length < 2}>Generar jornadas</button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function RulesPanel({ league, onSaveRules }) {
  const rules = league.rules || {};
  const walkoverLabel = `${rules.forfeitGoalsFor ?? 3}-${rules.forfeitGoalsAgainst ?? 0}`;

  return (
    <section className="panel">
      <SectionHeading eyebrow="Estatutos" title="Reglas deportivas de la liga" />
      <form className="rules-form" onSubmit={handleFormSubmit(onSaveRules)}>
        <label>Equipo dado de baja
          <select name="withdrawalPolicy" defaultValue={rules.withdrawalPolicy || "award_walkover"}>
            <option value="award_walkover">Rival gana por default</option>
            <option value="rest_only">Rival descansa sin marcador automatico</option>
          </select>
        </label>
        <label>Puntos por default
          <input name="forfeitPoints" type="number" min="0" max="5" defaultValue={rules.forfeitPoints ?? 3} />
        </label>
        <label>Goles a favor
          <input name="forfeitGoalsFor" type="number" min="0" max="20" defaultValue={rules.forfeitGoalsFor ?? 3} />
        </label>
        <label>Goles en contra
          <input name="forfeitGoalsAgainst" type="number" min="0" max="20" defaultValue={rules.forfeitGoalsAgainst ?? 0} />
        </label>
        <label>Amarillas para suspension
          <input name="yellowSuspensionLimit" type="number" min="1" max="10" defaultValue={rules.yellowSuspensionLimit ?? 3} />
        </label>
        <label>Partidos por roja
          <input name="defaultRedSuspensionMatches" type="number" min="1" max="12" defaultValue={rules.defaultRedSuspensionMatches ?? 1} />
        </label>
        <label className="wide-field">Notas del reglamento
          <textarea name="notes" defaultValue={rules.notes || ""} placeholder="Ej. Criterios de sancion, defaults, bajas o acuerdos de asamblea." />
        </label>
        <div className="rules-preview">
          <strong>Resumen operativo</strong>
          <span>Default: {walkoverLabel}, {rules.forfeitPoints ?? 3} puntos.</span>
          <span>Suspension: {rules.yellowSuspensionLimit ?? 3} amarillas o {rules.defaultRedSuspensionMatches ?? 1} partido(s) base por roja.</span>
        </div>
        <button className="primary" type="submit">Guardar reglas</button>
      </form>
    </section>
  );
}

function ManagementBoard({
  league,
  onDeleteMatch,
  onDeletePlayer,
  onDeleteTeam,
  onUpdateMatch,
  onUpdatePlayer,
  onUpdateTeam
}) {
  const [activeList, setActiveList] = useState("teams");
  const activeCompetitionId = getDefaultCompetitionId(league);
  const activeCompetition = getCompetition(league, activeCompetitionId);
  const competitionMatches = useMemo(
    () => league.matches.filter((match) => match.competitionId === activeCompetitionId),
    [activeCompetitionId, league.matches]
  );
  const activeRound = Number(activeCompetition?.activeRound || getCurrentDisplayRound(competitionMatches) || competitionMatches[0]?.round || 0);
  const [openRounds, setOpenRounds] = useState(() => new Set(activeRound ? [activeRound] : []));
  const listTabs = [
    { id: "teams", label: `Equipos (${league.teams.length})` },
    { id: "players", label: `Jugadores (${league.players.length})` },
    { id: "matches", label: `Partidos (${league.matches.length})` }
  ];
  const matchRounds = useMemo(() => {
    const rounds = new Map();
    for (const match of [...league.matches].sort((a, b) => (
      Number(a.round || 0) - Number(b.round || 0) ||
      String(a.date).localeCompare(String(b.date)) ||
      String(a.time).localeCompare(String(b.time))
    ))) {
      const round = Number(match.round || 0);
      if (!rounds.has(round)) rounds.set(round, []);
      rounds.get(round).push(match);
    }
    return [...rounds.entries()].sort((a, b) => a[0] - b[0]);
  }, [league.matches]);

  useEffect(() => {
    if (!activeRound) return;
    setOpenRounds((current) => {
      if (current.size) return current;
      return new Set([activeRound]);
    });
  }, [activeRound]);

  function confirmDelete(label, callback) {
    if (window.confirm(`¿Seguro que quieres eliminar ${label}? Esta accion puede afectar informacion relacionada.`)) callback();
  }

  function toggleRound(round) {
    setOpenRounds((current) => {
      const next = new Set(current);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  }

  function handleMatchSave(matchId, form) {
    onUpdateMatch(matchId, getFormPayload(form));
    window.alert("Datos del partido guardados correctamente.");
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Administracion" title="Listados editables" />
      <div className="list-tabs" aria-label="Listados editables">
        {listTabs.map((tab) => (
          <button
            className={activeList === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            onClick={() => setActiveList(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="management-grid">
        {activeList === "teams" && <div>
          <h3>Equipos</h3>
          <div className="editable-list">
            {league.teams.map((team) => (
              <form
                className="editable-row"
                key={team.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  onUpdateTeam(team.id, getFormPayload(event.currentTarget));
                }}
              >
                <input name="name" defaultValue={team.name} aria-label={`Equipo ${team.name}`} required />
                <input name="coach" defaultValue={team.coach} aria-label={`Entrenador ${team.name}`} placeholder="Entrenador" />
                <input name="colors" defaultValue={team.colors} aria-label={`Color ${team.name}`} type="color" />
                <select name="status" defaultValue={team.status || "active"} aria-label={`Estatus ${team.name}`}>
                  <option value="active">Activo</option>
                  <option value="withdrawn">Baja</option>
                </select>
                <input name="withdrawnRound" defaultValue={team.withdrawnRound || ""} aria-label={`Jornada de baja ${team.name}`} type="number" min="1" placeholder="J baja" />
                <input name="withdrawnReason" defaultValue={team.withdrawnReason || ""} aria-label={`Motivo de baja ${team.name}`} placeholder="Motivo de baja" />
                <button className="primary" type="submit">Guardar</button>
                <button className="danger" type="button" onClick={() => confirmDelete(`el equipo ${team.name}`, () => onDeleteTeam(team.id))}>Eliminar</button>
              </form>
            ))}
            {!league.teams.length && <p className="empty">Aun no hay equipos registrados.</p>}
          </div>
        </div>}

        {activeList === "players" && <div>
          <h3>Jugadores</h3>
          <div className="editable-list">
            {league.players.map((player) => (
              <form
                className="editable-row player-row"
                key={player.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  onUpdatePlayer(player.id, getFormPayload(event.currentTarget));
                }}
              >
                <select name="teamId" defaultValue={player.teamId} aria-label={`Equipo de ${player.name}`} required>
                  {league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <input name="name" defaultValue={player.name} aria-label={`Jugador ${player.name}`} required pattern=".*\S+\s+\S+.*" title="Registra nombre(s) y apellido(s)" />
                <input name="number" defaultValue={player.number} aria-label={`Numero de ${player.name}`} type="number" min="1" max="99" />
                <input name="position" defaultValue={player.position} aria-label={`Posicion de ${player.name}`} placeholder="Posicion" />
                <button className="primary" type="submit">Guardar</button>
                <button className="danger" type="button" onClick={() => confirmDelete(`al jugador ${player.name}`, () => onDeletePlayer(player.id))}>Eliminar</button>
              </form>
            ))}
            {!league.players.length && <p className="empty">Aun no hay jugadores registrados.</p>}
          </div>
        </div>}

        {activeList === "matches" && <div className="wide-field">
          <h3>Partidos</h3>
          <p className="helper-text">Aqui puedes editar todos los partidos generados: fecha, hora, cancha, equipos, jornada y liguilla. Hora y cancha pueden quedar vacias hasta definirlas.</p>
          <div className="round-edit-list">
            {matchRounds.map(([round, matches]) => {
              const isOpen = openRounds.has(round);
              const finishedCount = matches.filter((match) => match.status === "finished" || match.status === "walkover").length;
              return (
                <section className={`round-edit-section ${Number(round) === Number(activeRound) ? "active" : ""}`} key={round}>
                  <button className="round-edit-header" type="button" onClick={() => toggleRound(round)}>
                    <span>{isOpen ? "Ocultar" : "Abrir"}</span>
                    <strong>Jornada {round || "-"}</strong>
                    <small>{matches.length} partido(s) | {finishedCount} con resultado</small>
                  </button>
                  {isOpen && (
                    <div className="editable-list">
                      {matches.map((match) => (
                        <form
                          className="editable-row match-edit-row"
                          key={match.id}
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleMatchSave(match.id, event.currentTarget);
                          }}
                        >
                          <CompetitionSelect league={league} name="competitionId" defaultValue={match.competitionId || getDefaultCompetitionId(league)} />
                          <select name="stage" defaultValue={match.stage || "regular"} aria-label={`Tipo ${match.id}`}>
                            <option value="regular">Regular</option>
                            <option value="playoff">Liguilla</option>
                          </select>
                          <input name="round" defaultValue={match.round} aria-label={`Jornada ${match.id}`} type="number" min="1" required />
                          <select name="playoffRound" defaultValue={match.playoffRound || ""} aria-label={`Fase ${match.id}`}>
                            <option value="">Fase</option>
                            <option value="Cuartos de final">Cuartos</option>
                            <option value="Semifinal">Semifinal</option>
                            <option value="Final">Final</option>
                            <option value="Repechaje">Repechaje</option>
                          </select>
                          <select name="playoffLeg" defaultValue={match.playoffLeg || ""} aria-label={`Juego ${match.id}`}>
                            <option value="">Juego</option>
                            <option value="Ida">Ida</option>
                            <option value="Vuelta">Vuelta</option>
                          </select>
                          <input name="date" defaultValue={match.date} aria-label={`Fecha ${match.id}`} type="date" required />
                          <input name="time" defaultValue={match.time || ""} aria-label={`Hora ${match.id}`} type="time" />
                          <input name="venue" defaultValue={match.venue || ""} aria-label={`Cancha ${match.id}`} placeholder="Cancha por definir" />
                          <TeamSelect league={league} name="homeTeamId" defaultValue={match.homeTeamId} />
                          <input name="homeGoals" defaultValue={match.homeGoals ?? ""} aria-label={`Goles local ${match.id}`} type="number" min="0" placeholder="GL" />
                          <TeamSelect league={league} name="awayTeamId" defaultValue={match.awayTeamId} />
                          <input name="awayGoals" defaultValue={match.awayGoals ?? ""} aria-label={`Goles visitante ${match.id}`} type="number" min="0" placeholder="GV" />
                          <select name="status" defaultValue={match.status || "scheduled"} aria-label={`Estado ${match.id}`}>
                            <option value="scheduled">Programado</option>
                            <option value="finished">Finalizado</option>
                            <option value="walkover">Default</option>
                          </select>
                          <input name="aggregateHome" defaultValue={match.aggregateHome ?? ""} aria-label={`Global local ${match.id}`} type="number" min="0" placeholder="G local" />
                          <input name="aggregateAway" defaultValue={match.aggregateAway ?? ""} aria-label={`Global visitante ${match.id}`} type="number" min="0" placeholder="G visitante" />
                          <span className={`status ${match.status}`}>{match.status === "finished" ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : match.status === "walkover" ? "Default" : "Programado"}</span>
                          <button className="primary" type="submit">Guardar</button>
                          <button className="danger" type="button" onClick={() => confirmDelete("este partido", () => onDeleteMatch(match.id))}>Eliminar</button>
                        </form>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            {!league.matches.length && <p className="empty">Aun no hay partidos registrados.</p>}
          </div>
        </div>}
      </div>
    </section>
  );
}

function MatchSheet({ league, onSaveMatchSheet }) {
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(getDefaultCompetitionId(league));
  const competitionLeague = useMemo(
    () => scopeLeagueToCompetition(league, selectedCompetitionId),
    [league, selectedCompetitionId]
  );
  const preferredMatch = competitionLeague.matches.find((match) => match.status === "scheduled") || competitionLeague.matches[0];
  const [matchId, setMatchId] = useState(preferredMatch?.id || "");
  const selectedMatch = useMemo(
    () => competitionLeague.matches.find((match) => match.id === matchId) || preferredMatch,
    [competitionLeague.matches, matchId, preferredMatch]
  );
  const rounds = useMemo(() => (
    [...new Set(competitionLeague.matches.map((match) => Number(match.round || 0)).filter(Boolean))]
      .sort((a, b) => b - a)
  ), [competitionLeague.matches]);
  const [selectedRound, setSelectedRound] = useState(preferredMatch?.round || rounds[0] || "");
  const [matchStatusFilter, setMatchStatusFilter] = useState("scheduled");
  const roundMatches = useMemo(() => (
    competitionLeague.matches
      .filter((match) => Number(match.round) === Number(selectedRound))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
  ), [competitionLeague.matches, selectedRound]);
  const visibleRoundMatches = useMemo(() => (
    roundMatches.filter((match) => {
      if (matchStatusFilter === "all") return true;
      if (matchStatusFilter === "scheduled") return match.status === "scheduled";
      if (matchStatusFilter === "finished") return match.status === "finished" || match.status === "walkover";
      return true;
    })
  ), [matchStatusFilter, roundMatches]);
  const eligiblePlayers = useMemo(() => {
    if (!selectedMatch) return [];
    return league.players.filter((player) => (
      player.teamId === selectedMatch.homeTeamId || player.teamId === selectedMatch.awayTeamId
    ));
  }, [league.players, selectedMatch]);
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [events, setEvents] = useState([]);
  const [validationMessage, setValidationMessage] = useState("");
  const [sheetNotice, setSheetNotice] = useState("");

  useEffect(() => {
    const defaultCompetitionId = getDefaultCompetitionId(league);
    if (!league.competitions?.some((competition) => competition.id === selectedCompetitionId)) {
      setSelectedCompetitionId(defaultCompetitionId);
    }
  }, [league, selectedCompetitionId]);

  useEffect(() => {
    if (!competitionLeague.matches.some((match) => match.id === matchId)) {
      setMatchId(preferredMatch?.id || "");
    }
  }, [competitionLeague.matches, matchId, preferredMatch]);

  useEffect(() => {
    if (!rounds.length) {
      setSelectedRound("");
      return;
    }
    if (!rounds.includes(Number(selectedRound))) setSelectedRound(rounds[0]);
  }, [rounds, selectedRound]);

  useEffect(() => {
    if (!visibleRoundMatches.length) return;
    if (!visibleRoundMatches.some((match) => match.id === matchId)) setMatchId(visibleRoundMatches[0].id);
  }, [matchId, visibleRoundMatches]);

  useEffect(() => {
    if (!selectedMatch) {
      setHomeGoals(0);
      setAwayGoals(0);
      setEvents([]);
      setValidationMessage("");
      return;
    }

    setHomeGoals(selectedMatch.homeGoals ?? 0);
    setAwayGoals(selectedMatch.awayGoals ?? 0);
    setEvents(selectedMatch.events.map((event, index) => ({
      id: `${selectedMatch.id}-${index}-${event.type}-${event.playerId}`,
      type: event.type,
      teamId: event.teamId || getPlayer(league, event.playerId)?.teamId || selectedMatch.homeTeamId,
      playerId: event.playerId,
      minute: event.minute || "",
      suspensionMatches: event.suspensionMatches || 1,
      reason: event.reason || ""
    })));
    setValidationMessage("");
    setSheetNotice("");
  }, [selectedMatch]);

  function getPlayersForTeam(teamId) {
    return eligiblePlayers.filter((player) => player.teamId === teamId);
  }

  function addEvent(type, teamId = selectedMatch?.homeTeamId) {
    const players = getPlayersForTeam(teamId);
    setEvents((current) => [
      ...current,
      {
        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        teamId,
        playerId: players[0]?.id || "",
        minute: "",
        suspensionMatches: type === "red" ? Number(league.rules?.defaultRedSuspensionMatches || 1) : 0,
        reason: ""
      }
    ]);
  }

  function addMissingGoalEvents(teamId) {
    const players = getPlayersForTeam(teamId);
    if (!players.length) return;

    const expected = teamId === selectedMatch.homeTeamId ? expectedHomeGoals : expectedAwayGoals;
    const currentGoals = goalEvents.filter((item) => getPlayer(league, item.playerId)?.teamId === teamId).length;
    const missing = Math.max(0, expected - currentGoals);
    if (!missing) return;

    const nextEvents = Array.from({ length: missing }, () => ({
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "goal",
      teamId,
      playerId: players[0]?.id || "",
      minute: "",
      suspensionMatches: 0,
      reason: ""
    }));

    setEvents((current) => [...current, ...nextEvents]);
  }

  function updateEvent(eventId, field, value) {
    setEvents((current) => current.map((event) => (
      event.id === eventId
        ? {
            ...event,
            [field]: value,
            playerId: field === "teamId" ? getPlayersForTeam(value)[0]?.id || "" : event.playerId,
            suspensionMatches: field === "type" && value === "red" && Number(event.suspensionMatches || 0) < 1
              ? Number(league.rules?.defaultRedSuspensionMatches || 1)
              : field === "type" && value !== "red"
                ? 0
                : event.suspensionMatches,
            reason: field === "type" && value !== "red" ? "" : event.reason
          }
        : event
    )));
  }

  function removeEvent(eventId) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  }

  if (!selectedMatch) {
    return (
      <div className="match-sheet">
        <div className="sheet-picker">
          <label>Torneo
            <CompetitionSelect
              league={league}
              name="sheetCompetitionId"
              defaultValue={selectedCompetitionId}
              value={selectedCompetitionId}
              onChange={(event) => setSelectedCompetitionId(event.target.value)}
            />
          </label>
        </div>
        <p className="empty">Programa un partido en este torneo para poder capturar el acta.</p>
      </div>
    );
  }

  const cleanEvents = events.filter((item) => item.playerId);
  const goalEvents = cleanEvents.filter((item) => item.type === "goal");
  const homeGoalEvents = goalEvents.filter((item) => getPlayer(league, item.playerId)?.teamId === selectedMatch.homeTeamId).length;
  const awayGoalEvents = goalEvents.filter((item) => getPlayer(league, item.playerId)?.teamId === selectedMatch.awayTeamId).length;
  const expectedHomeGoals = Number(homeGoals || 0);
  const expectedAwayGoals = Number(awayGoals || 0);

  function validateMatchSheet() {
    if (!selectedMatch) return "Selecciona un partido para capturar el acta.";
    if (selectedMatch.homeTeamId === selectedMatch.awayTeamId) return "El partido no puede tener el mismo equipo como local y visitante.";
    if (!Number.isInteger(expectedHomeGoals) || !Number.isInteger(expectedAwayGoals)) return "El marcador debe capturarse con numeros enteros.";
    if (expectedHomeGoals < 0 || expectedAwayGoals < 0) return "El marcador no puede tener goles negativos.";
    if (expectedHomeGoals > 50 || expectedAwayGoals > 50) return "Revisa el marcador; parece demasiado alto.";
    if ((expectedHomeGoals > 0 && !getPlayersForTeam(selectedMatch.homeTeamId).length) || (expectedAwayGoals > 0 && !getPlayersForTeam(selectedMatch.awayTeamId).length)) {
      return "Para guardar goles, ambos equipos con goles deben tener jugadores registrados.";
    }

    if (expectedHomeGoals > 0 && homeGoalEvents !== expectedHomeGoals) {
      return `Revisa goleadores del equipo local: marcador ${expectedHomeGoals}, capturados ${homeGoalEvents}.`;
    }

    if (expectedAwayGoals > 0 && awayGoalEvents !== expectedAwayGoals) {
      return `Revisa goleadores del equipo visitante: marcador ${expectedAwayGoals}, capturados ${awayGoalEvents}.`;
    }

    if (expectedHomeGoals === 0 && homeGoalEvents > 0) {
      return "Hay goleadores capturados para el local, pero el marcador local esta en 0.";
    }

    if (expectedAwayGoals === 0 && awayGoalEvents > 0) {
      return "Hay goleadores capturados para el visitante, pero el marcador visitante esta en 0.";
    }

    const eventWithoutPlayer = events.find((item) => !item.playerId);
    if (eventWithoutPlayer) return "Todos los eventos del acta deben tener jugador seleccionado.";

    const eventWithWrongTeam = cleanEvents.find((item) => {
      const player = getPlayer(league, item.playerId);
      return !player || player.teamId !== item.teamId || ![selectedMatch.homeTeamId, selectedMatch.awayTeamId].includes(item.teamId);
    });
    if (eventWithWrongTeam) return "Hay eventos con jugador o equipo que no corresponde al partido.";

    const invalidMinute = cleanEvents.find((item) => item.minute !== "" && (Number(item.minute) < 0 || Number(item.minute) > 130));
    if (invalidMinute) return "Los minutos deben estar entre 0 y 130.";

    const redWithoutReason = cleanEvents.find((item) => item.type === "red" && !String(item.reason || "").trim());
    if (redWithoutReason) return "Toda tarjeta roja debe tener motivo de sancion.";

    const redWithoutMatches = cleanEvents.find((item) => item.type === "red" && Number(item.suspensionMatches || 0) < 1);
    if (redWithoutMatches) return "Toda tarjeta roja debe tener al menos 1 partido de sancion.";

    return "";
  }

  return (
    <form
      className="match-sheet"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const error = validateMatchSheet();
        if (error) {
          setValidationMessage(error);
          return;
        }

        setValidationMessage("");
        const confirmed = window.confirm(`Antes de guardar, verifica el acta:\n\nMarcador: ${expectedHomeGoals}-${expectedAwayGoals}\nGoles capturados: ${goalEvents.length}\nAmarillas: ${cleanEvents.filter((item) => item.type === "yellow").length}\nRojas: ${cleanEvents.filter((item) => item.type === "red").length}\n\n¿Guardar acta?`);
        if (!confirmed) return;

        try {
          onSaveMatchSheet({
            matchId: selectedMatch.id,
            homeGoals,
            awayGoals,
            events: cleanEvents
          });
          setSheetNotice("Acta guardada correctamente.");
        } catch (saveError) {
          setValidationMessage(saveError.message || "No se pudo guardar el acta.");
        }
      }}
    >
      <div className="sheet-picker">
        <label>Torneo
          <CompetitionSelect
            league={league}
            name="sheetCompetitionId"
            defaultValue={selectedCompetitionId}
            value={selectedCompetitionId}
            onChange={(event) => setSelectedCompetitionId(event.target.value)}
          />
        </label>
        <label>Jornada
          <select value={selectedRound} onChange={(event) => setSelectedRound(event.target.value)}>
            {rounds.map((round) => <option key={round} value={round}>Jornada {round}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={matchStatusFilter} onChange={(event) => setMatchStatusFilter(event.target.value)}>
            <option value="scheduled">Por capturar</option>
            <option value="finished">Capturados</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <div className="sheet-match-grid" aria-label="Partidos de la jornada">
          {visibleRoundMatches.map((match) => (
            <button
              className={selectedMatch?.id === match.id ? "active" : ""}
              key={match.id}
              type="button"
              onClick={() => setMatchId(match.id)}
            >
              <span>Jornada {match.round}</span>
              <strong>{getTeam(league, match.homeTeamId)?.name || "LOCAL"} VS {getTeam(league, match.awayTeamId)?.name || "VISITANTE"}</strong>
              <span>{match.status === "finished" || match.status === "walkover" ? `${match.homeGoals}-${match.awayGoals}` : match.time || "POR DEFINIR"} | {match.venue || "CANCHA POR DEFINIR"}</span>
            </button>
          ))}
          {!visibleRoundMatches.length && <p className="empty">No hay partidos con ese filtro en esta jornada.</p>}
        </div>
      </div>

      <div className="sheet-head">
        <div className="sheet-score">
          <span>{getTeam(league, selectedMatch.homeTeamId)?.name || "Local"}</span>
          <input value={homeGoals} onChange={(event) => setHomeGoals(event.target.value)} type="number" min="0" aria-label="Goles local" />
          <strong>-</strong>
          <input value={awayGoals} onChange={(event) => setAwayGoals(event.target.value)} type="number" min="0" aria-label="Goles visitante" />
          <span>{getTeam(league, selectedMatch.awayTeamId)?.name || "Visitante"}</span>
        </div>
        <small>{formatDate(selectedMatch.date)} | {selectedMatch.time || "Hora por definir"} | {selectedMatch.venue || "Cancha por definir"}</small>
      </div>

      <div className="sheet-checklist">
        <span>Goles local: {homeGoalEvents}/{expectedHomeGoals}</span>
        <span>Goles visitante: {awayGoalEvents}/{expectedAwayGoals}</span>
        <span>Tarjetas: {cleanEvents.filter((item) => item.type === "yellow").length} amarilla(s), {cleanEvents.filter((item) => item.type === "red").length} roja(s)</span>
      </div>

      {validationMessage && <p className="sheet-alert">{validationMessage}</p>}
      {sheetNotice && <p className="auth-ok">{sheetNotice}</p>}

      <div className="event-toolbar">
        <button type="button" onClick={() => addEvent("goal", selectedMatch.homeTeamId)} disabled={!getPlayersForTeam(selectedMatch.homeTeamId).length}>Gol local</button>
        <button type="button" onClick={() => addEvent("goal", selectedMatch.awayTeamId)} disabled={!getPlayersForTeam(selectedMatch.awayTeamId).length}>Gol visitante</button>
        <button type="button" onClick={() => addMissingGoalEvents(selectedMatch.homeTeamId)} disabled={homeGoalEvents >= expectedHomeGoals || !getPlayersForTeam(selectedMatch.homeTeamId).length}>Completar goles local</button>
        <button type="button" onClick={() => addMissingGoalEvents(selectedMatch.awayTeamId)} disabled={awayGoalEvents >= expectedAwayGoals || !getPlayersForTeam(selectedMatch.awayTeamId).length}>Completar goles visitante</button>
        <button type="button" onClick={() => addEvent("yellow", selectedMatch.homeTeamId)} disabled={!getPlayersForTeam(selectedMatch.homeTeamId).length}>Amarilla local</button>
        <button type="button" onClick={() => addEvent("yellow", selectedMatch.awayTeamId)} disabled={!getPlayersForTeam(selectedMatch.awayTeamId).length}>Amarilla visitante</button>
        <button type="button" onClick={() => addEvent("red", selectedMatch.homeTeamId)} disabled={!getPlayersForTeam(selectedMatch.homeTeamId).length}>Roja local</button>
        <button type="button" onClick={() => addEvent("red", selectedMatch.awayTeamId)} disabled={!getPlayersForTeam(selectedMatch.awayTeamId).length}>Roja visitante</button>
      </div>

      <div className="event-list">
        {events.map((eventItem) => (
          <article className="event-row" key={eventItem.id}>
            <select value={eventItem.type} onChange={(event) => updateEvent(eventItem.id, "type", event.target.value)} aria-label="Tipo de evento">
              <option value="goal">Gol</option>
              <option value="yellow">Amarilla</option>
              <option value="red">Roja</option>
            </select>
            <select value={eventItem.teamId || selectedMatch.homeTeamId} onChange={(event) => updateEvent(eventItem.id, "teamId", event.target.value)} aria-label="Equipo del evento">
              <option value={selectedMatch.homeTeamId}>{getTeam(league, selectedMatch.homeTeamId)?.name || "Local"}</option>
              <option value={selectedMatch.awayTeamId}>{getTeam(league, selectedMatch.awayTeamId)?.name || "Visitante"}</option>
            </select>
            <select value={eventItem.playerId} onChange={(event) => updateEvent(eventItem.id, "playerId", event.target.value)} aria-label="Jugador">
              {getPlayersForTeam(eventItem.teamId || selectedMatch.homeTeamId).map((player) => (
                <option key={player.id} value={player.id}>
                  #{player.number} {player.name}
                </option>
              ))}
            </select>
            <input value={eventItem.minute} onChange={(event) => updateEvent(eventItem.id, "minute", event.target.value)} type="number" min="0" max="130" placeholder="Min" aria-label="Minuto" />
            {eventItem.type === "red" ? (
              <>
                <input value={eventItem.suspensionMatches} onChange={(event) => updateEvent(eventItem.id, "suspensionMatches", event.target.value)} type="number" min="1" placeholder="Sancion" aria-label="Partidos de sancion" />
                <input value={eventItem.reason} onChange={(event) => updateEvent(eventItem.id, "reason", event.target.value)} placeholder="Motivo" aria-label="Motivo de sancion" required />
              </>
            ) : (
              <span className="event-hint">{eventItem.type === "goal" ? "Gol anotado" : "Amonestacion"}</span>
            )}
            <button className="danger" type="button" onClick={() => removeEvent(eventItem.id)}>Quitar</button>
          </article>
        ))}
        {!events.length && <p className="empty">Agrega goles, tarjetas amarillas o rojas para completar el acta.</p>}
      </div>

      <button className="primary" type="submit">Guardar acta</button>
    </form>
  );
}

function SanctionsPanel({ league, onAddPlayerSanction, onDeletePlayerSanction }) {
  const sanctions = league.sanctions || [];

  return (
    <section className="panel">
      <SectionHeading eyebrow="Comision disciplinaria" title="Sanciones extraordinarias" />
      <form className="sanction-form" onSubmit={handleFormSubmit(onAddPlayerSanction)}>
        <label>Torneo
          <CompetitionSelect league={league} name="competitionId" defaultValue={getDefaultCompetitionId(league)} />
        </label>
        <label>Jugador
          <select name="playerId" required>
            {league.players.map((player) => (
              <option key={player.id} value={player.id}>
                #{player.number} {player.name} | {getTeam(league, player.teamId)?.name || "Sin equipo"}
              </option>
            ))}
          </select>
        </label>
        <label>Tipo
          <select name="type" defaultValue="Agresion">
            <option value="Agresion">Agresion</option>
            <option value="Insultos">Insultos</option>
            <option value="Rina">Rina</option>
            <option value="Conducta antideportiva">Conducta antideportiva</option>
            <option value="Sancion administrativa">Sancion administrativa</option>
            <option value="Otra">Otra</option>
          </select>
        </label>
        <label>Fecha
          <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label>Partidos
          <input name="matches" type="number" min="0" max="99" defaultValue="1" required />
        </label>
        <label>Motivo
          <input name="reason" required placeholder="Ej. Golpe a rival, insulto al arbitro" />
        </label>
        <label className="wide-field">Notas
          <textarea name="notes" placeholder="Resolucion, evidencia, acuerdo de comision o folio." />
        </label>
        <button className="primary" type="submit" disabled={!league.players.length}>Agregar sancion</button>
      </form>

      <div className="sanction-list">
        {sanctions.map((sanction) => {
          const player = getPlayer(league, sanction.playerId);
          const team = player ? getTeam(league, player.teamId) : null;
          const competition = getCompetition(league, sanction.competitionId);

          return (
            <article className="sanction-card" key={sanction.id}>
              <div>
                <strong>{player?.name || "Jugador eliminado"}</strong>
                <span>{team?.name || "Sin equipo"} | {competition?.name || "Torneo"} | {sanction.type}</span>
              </div>
              <div>
                <small>Castigo</small>
                <span>{sanction.matches} partido(s)</span>
              </div>
              <div>
                <small>Motivo</small>
                <span>{sanction.reason}</span>
              </div>
              <time dateTime={sanction.date}>{sanction.date ? formatDate(sanction.date) : "Sin fecha"}</time>
              <button
                className="danger"
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Seguro que quieres quitar la sancion de ${player?.name || "este jugador"}?`)) onDeletePlayerSanction(sanction.id);
                }}
              >
                Quitar
              </button>
            </article>
          );
        })}
        {!sanctions.length && <p className="empty">Aun no hay sanciones extraordinarias.</p>}
      </div>
    </section>
  );
}

function InjuriesPanel({ league, onAddPlayerInjury, onDeletePlayerInjury, onUpdatePlayerInjury }) {
  const injuries = [...(league.injuries || [])].sort((a, b) => (
    (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
    String(b.date || "").localeCompare(String(a.date || ""))
  ));

  function submitNewInjury(event) {
    event.preventDefault();
    if (!league.players.length) {
      window.alert("Primero registra jugadores para poder agregar lesiones.");
      return;
    }

    onAddPlayerInjury(getFormPayload(event.currentTarget));
    window.alert("Lesion registrada. Si esta activa, se mostrara en la vista publica.");
    event.currentTarget.reset();
  }

  function updateInjury(event, injuryId) {
    event.preventDefault();
    onUpdatePlayerInjury(injuryId, getFormPayload(event.currentTarget));
    window.alert("Lesion actualizada.");
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Salud y apoyo" title="Lesiones de jugadores" />
      <p className="helper-text">Registra lesiones activas para informar al publico y solicitar apoyo cuando la liga lo autorice. Los recuperados quedan como historial interno.</p>
      <form className="injury-form" onSubmit={submitNewInjury}>
        <label>Torneo
          <CompetitionSelect league={league} name="competitionId" defaultValue={getDefaultCompetitionId(league)} />
        </label>
        <label>Jugador
          <select name="playerId" required>
            {league.players.map((player) => (
              <option key={player.id} value={player.id}>
                #{player.number} {player.name} | {getTeam(league, player.teamId)?.name || "Sin equipo"}
              </option>
            ))}
          </select>
        </label>
        <label>Tipo de lesion
          <input name="type" required placeholder="Ej. Rodilla, fractura, esguince" />
        </label>
        <label>Fecha
          <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label>Regreso estimado
          <input name="expectedReturn" type="date" />
        </label>
        <label>Estado
          <select name="status" defaultValue="active">
            <option value="active">Activa</option>
            <option value="recovered">Recuperado</option>
          </select>
        </label>
        <label className="checkbox-field">
          <input name="needsSurgery" type="checkbox" />
          Requiere operacion
        </label>
        <label className="checkbox-field">
          <input name="needsSupport" type="checkbox" />
          Necesita apoyo
        </label>
        <label className="wide-field">Detalle de apoyo
          <textarea name="supportDetail" placeholder="Cuenta, contacto, medicamento, traslado o apoyo economico autorizado." />
        </label>
        <label className="wide-field">Notas internas
          <textarea name="notes" placeholder="Seguimiento, alta medica, acuerdo de la liga o contacto responsable." />
        </label>
        <button className="primary" type="submit" disabled={!league.players.length}>Registrar lesion</button>
      </form>

      <div className="injury-list">
        {injuries.map((injury) => {
          const player = getPlayer(league, injury.playerId);
          const team = player ? getTeam(league, player.teamId) : null;
          const competition = getCompetition(league, injury.competitionId);

          return (
            <article className={`injury-card ${injury.status}`} key={injury.id}>
              <div className="injury-card-head">
                <div>
                  <strong>{player?.name || "Jugador eliminado"}</strong>
                  <span>{team?.name || "Sin equipo"} | {competition?.name || "Torneo"}</span>
                </div>
                <span className={`status ${injury.status}`}>{injury.status === "active" ? "Activa" : "Recuperado"}</span>
              </div>
              <form className="injury-edit-form" onSubmit={(event) => updateInjury(event, injury.id)}>
                <label>Torneo
                  <CompetitionSelect league={league} name="competitionId" defaultValue={injury.competitionId || getDefaultCompetitionId(league)} />
                </label>
                <label>Jugador
                  <select name="playerId" required defaultValue={injury.playerId}>
                    {league.players.map((item) => (
                      <option key={item.id} value={item.id}>
                        #{item.number} {item.name} | {getTeam(league, item.teamId)?.name || "Sin equipo"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>Lesion
                  <input name="type" required defaultValue={injury.type} />
                </label>
                <label>Fecha
                  <input name="date" type="date" defaultValue={injury.date} />
                </label>
                <label>Regreso
                  <input name="expectedReturn" type="date" defaultValue={injury.expectedReturn} />
                </label>
                <label>Estado
                  <select name="status" defaultValue={injury.status || "active"}>
                    <option value="active">Activa</option>
                    <option value="recovered">Recuperado</option>
                  </select>
                </label>
                <label className="checkbox-field">
                  <input name="needsSurgery" type="checkbox" defaultChecked={injury.needsSurgery} />
                  Operacion
                </label>
                <label className="checkbox-field">
                  <input name="needsSupport" type="checkbox" defaultChecked={injury.needsSupport} />
                  Apoyo
                </label>
                <label className="wide-field">Detalle de apoyo
                  <textarea name="supportDetail" defaultValue={injury.supportDetail} />
                </label>
                <label className="wide-field">Notas
                  <textarea name="notes" defaultValue={injury.notes} />
                </label>
                <div className="inline-actions wide-field">
                  <button className="primary" type="submit">Guardar lesion</button>
                  <button
                    className="danger"
                    type="button"
                    onClick={() => {
                      if (window.confirm(`¿Seguro que quieres eliminar la lesion de ${player?.name || "este jugador"}?`)) onDeletePlayerInjury(injury.id);
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </form>
            </article>
          );
        })}
        {!injuries.length && <p className="empty">Aun no hay lesiones registradas.</p>}
      </div>
    </section>
  );
}

function SuperAdmin({ authToken, currentUser, onAddLeague, onDeleteLeague, onResetDemo, onToggleLeague, onUpdateLeagueMembership, store, userListRefreshKey }) {
  const [membershipNotice, setMembershipNotice] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <section className="panel">
        <SectionHeading eyebrow="Nosotros" title="Control de ligas y membresias" />
        <form className="league-create-form" onSubmit={handleFormSubmit(onAddLeague)}>
          <label>Liga<input name="name" required placeholder="Nombre de la nueva liga" /></label>
          <label>Municipio<input name="city" required placeholder="Municipio o zona" /></label>
          <label>Admin asignado<input name="adminName" placeholder="Nombre del administrador" /></label>
          <label>Correo admin<input name="adminEmail" type="email" placeholder="correo del admin" /></label>
          <label>Contraseña inicial<input name="adminPassword" type="password" minLength="6" placeholder="Minimo 6 caracteres" /></label>
          <button className="primary" type="submit">Agregar liga</button>
          <button type="button" onClick={onResetDemo}>Restaurar demo</button>
        </form>
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Comercial" title="Membresias por liga" />
        <p className="helper-text">
          Aqui se controla el plan comercial, estado de servicio, renovacion, contacto administrativo y notas internas. Si una liga queda suspendida, el publico vera la liga como suspendida y el admin de liga no podra operar hasta que un super admin la reactive.
        </p>
        {membershipNotice && <p className="auth-ok">{membershipNotice}</p>}
        <div className="membership-list">
          {store.leagues.map((league) => (
            <form
              className="membership-card"
              key={league.id}
              onSubmit={(event) => {
                event.preventDefault();
                const payload = getFormPayload(event.currentTarget);
                if (payload.status !== league.status) {
                  const action = payload.status === "suspended" ? "suspender" : "reactivar";
                  const confirmed = window.confirm(`¿Seguro que quieres ${action} ${league.name}?`);
                  if (!confirmed) return;
                }
                onUpdateLeagueMembership(league.id, payload);
                setMembershipNotice(`Membresia de ${league.name} guardada correctamente.`);
              }}
            >
              <div className="membership-title">
                <strong>{league.name}</strong>
                <span>{league.city}</span>
              </div>
              <label className="wide-field">URL publica
                <input readOnly type="url" value={`${origin}/liga/${league.id}`} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label>Plan
                <select name="plan" defaultValue={league.plan || "Membresia Basica"}>
                  {MEMBERSHIP_PLANS.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.id}</option>
                  ))}
                </select>
              </label>
              <label>Estado
                <select name="status" defaultValue={league.status}>
                  <option value="active">Activa</option>
                  <option value="suspended">Suspendida</option>
                </select>
              </label>
              <label>Renovacion<input name="renewalDate" type="date" defaultValue={league.renewalDate || ""} /></label>
              <label>Admin asignado<input name="ownerEmail" type="email" defaultValue={league.ownerEmail || ""} /></label>
              <label className="wide-field">Notas
                <textarea name="membershipNotes" defaultValue={league.membershipNotes || ""} placeholder="Pago pendiente, acuerdo comercial, contacto, etc." />
              </label>
              <PlanSummary league={league} />
              <div className="membership-actions">
                <span className={`status ${league.status}`}>{league.status === "active" ? "Activa" : "Suspendida"}</span>
                <button className="primary" type="submit">Guardar cambios</button>
                <button
                  type="button"
                  onClick={() => {
                    const nextAction = league.status === "active" ? "suspender" : "reactivar";
                    const confirmed = window.confirm(`¿Seguro que quieres ${nextAction} ${league.name}?`);
                    if (!confirmed) return;
                    onToggleLeague(league.id);
                    setMembershipNotice(`${league.name} ${league.status === "active" ? "suspendida" : "reactivada"} correctamente.`);
                  }}
                >
                  {league.status === "active" ? "Suspender" : "Reactivar"}
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={async () => {
                    const confirmation = window.prompt(
                      `Eliminar ${league.name} borrara torneos, equipos, jugadores, partidos, sanciones, identidad, membresia y usuarios administradores de esa liga.\n\nEscribe ELIMINAR para confirmar.`
                    );
                    if (confirmation !== "ELIMINAR") {
                      window.alert("Eliminacion cancelada.");
                      return;
                    }
                    await onDeleteLeague(league.id);
                  }}
                >
                  Eliminar
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      <UserManagement authToken={authToken} currentUser={currentUser} leagues={store.leagues} refreshKey={userListRefreshKey} />
      <AuditPanel authToken={authToken} leagues={store.leagues} />
    </>
  );
}

function PlanSummary({ league }) {
  const plan = getLeaguePlan(league);
  const usage = getPlanUsage(league);

  return (
    <div className="plan-summary">
      <strong>Plan {plan.label}</strong>
      <span>Equipos: {usage.teams}/{formatPlanLimit(plan.maxTeams)}</span>
      <span>Torneos activos: {usage.activeCompetitions}/{plan.maxActiveCompetitions}</span>
      <span>Liguilla: {plan.features.playoffs ? "incluida" : "desde Pro"}</span>
      <span>Banner publicitario: {plan.features.adBanner ? "incluido" : "desde Pro"}</span>
    </div>
  );
}

function UserManagement({ authToken, currentUser, leagues, refreshKey = 0 }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [temporaryPasswords, setTemporaryPasswords] = useState({});

  async function loadUsers() {
    if (!authToken) return;
    try {
      setError("");
      setUsers(await fetchUsers(authToken));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [authToken, refreshKey]);

  async function handleCreate(payload) {
    setNotice("");
    await createUser(authToken, payload);
    await loadUsers();
  }

  async function handleUpdate(userId, payload) {
    setNotice("");
    await updateUser(authToken, userId, payload);
    if (payload.password) setNotice("Contraseña actualizada. Comparte la nueva clave temporal con el usuario por un canal seguro.");
    await loadUsers();
  }

  async function handleDisable(userId) {
    if (!window.confirm("¿Seguro que quieres deshabilitar este usuario?")) return;
    await disableUser(authToken, userId);
    setNotice("Usuario deshabilitado. Ya no podra iniciar sesion mientras siga en ese estado.");
    await loadUsers();
  }

  async function handleDelete(user) {
    const confirmation = window.prompt(
      `Eliminar ${user.email} borrara definitivamente esta cuenta de acceso.\n\nSi solo quieres cortar el acceso temporalmente, usa Deshabilitar.\n\nEscribe el correo completo para confirmar.`
    );
    if (confirmation !== user.email) {
      window.alert("Eliminacion cancelada.");
      return;
    }
    await deleteUser(authToken, user.id);
    setNotice(`Usuario ${user.email} eliminado definitivamente.`);
    await loadUsers();
  }

  function generateTemporaryPassword(userId = "new") {
    const password = `Liga-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    setTemporaryPasswords((current) => ({ ...current, [userId]: password }));
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Accesos" title="Usuarios administradores" />
      <form className="user-create-form" onSubmit={handleFormSubmit(handleCreate)}>
        <input name="name" required placeholder="Nombre" />
        <input name="email" required type="email" placeholder="correo@liga.com" />
        <input
          name="password"
          required
          type="text"
          value={temporaryPasswords.new || ""}
          onChange={(event) => setTemporaryPasswords((current) => ({ ...current, new: event.target.value }))}
          placeholder="Contraseña temporal"
        />
        <select name="role" defaultValue="league_admin">
          <option value="league_admin">Admin de liga</option>
          <option value="super_admin">Super admin</option>
        </select>
        <select name="leagueId" defaultValue="">
          <option value="">Sin liga</option>
          {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
        </select>
        <button type="button" onClick={() => generateTemporaryPassword("new")}>Sugerir clave</button>
        <button className="primary" type="submit">Crear usuario</button>
      </form>

      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="auth-ok">{notice}</p>}
      <p className="helper-text">Si un usuario olvida su contraseña, el super admin puede asignar una nueva clave temporal aqui. Tambien existe recuperacion por codigo desde el login.</p>

      <div className="user-list">
        {users.map((user) => {
          const isSelf = user.id === currentUser?.id;
          return (
            <form
              className="user-card"
              key={user.id}
              onSubmit={(event) => {
                event.preventDefault();
                handleUpdate(user.id, getFormPayload(event.currentTarget));
              }}
            >
              <input name="name" defaultValue={user.name} aria-label={`Nombre ${user.name}`} required />
              <input name="email" defaultValue={user.email} aria-label={`Correo ${user.name}`} type="email" required />
              <select name="role" defaultValue={user.role} aria-label={`Rol ${user.name}`} disabled={isSelf}>
                <option value="league_admin">Admin de liga</option>
                <option value="super_admin">Super admin</option>
              </select>
              {isSelf && <input type="hidden" name="role" value={user.role} />}
              <select name="leagueId" defaultValue={user.leagueId || ""} aria-label={`Liga ${user.name}`}>
                <option value="">Sin liga</option>
                {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
              </select>
              <select name="status" defaultValue={user.status} aria-label={`Estado ${user.name}`} disabled={isSelf}>
                <option value="active">Activo</option>
                <option value="disabled">Deshabilitado</option>
              </select>
              {isSelf && <input type="hidden" name="status" value={user.status} />}
              <input
                name="password"
                type="text"
                value={temporaryPasswords[user.id] || ""}
                onChange={(event) => setTemporaryPasswords((current) => ({ ...current, [user.id]: event.target.value }))}
                placeholder="Nueva contraseña temporal"
                aria-label={`Contraseña ${user.name}`}
              />
              <button type="button" onClick={() => generateTemporaryPassword(user.id)}>Sugerir clave</button>
              <button className="primary" type="submit">Guardar usuario</button>
              <button className="danger" type="button" disabled={isSelf} onClick={() => handleDisable(user.id)}>
                Deshabilitar
              </button>
              <button className="danger ghost-danger" type="button" disabled={isSelf} onClick={() => handleDelete(user)}>
                Eliminar
              </button>
              {isSelf && <small className="self-user-note">Tu cuenta no se puede deshabilitar ni eliminar desde tu propia sesion.</small>}
              {user.lockedUntil && (
                <small className="self-user-note">
                  Bloqueado hasta {formatDate(user.lockedUntil)}. Asigna una contraseña temporal para limpiar el bloqueo.
                </small>
              )}
            </form>
          );
        })}
      </div>
    </section>
  );
}

const AUDIT_LABELS = {
  login: "Inicio de sesion",
  login_failed: "Intento fallido",
  login_locked: "Cuenta bloqueada",
  login_blocked: "Acceso bloqueado",
  store_save: "Guardado general",
  league_save: "Guardado de liga",
  league_delete: "Liga eliminada",
  user_create: "Usuario creado",
  user_update: "Usuario actualizado",
  user_disable: "Usuario deshabilitado",
  user_delete: "Usuario eliminado",
  password_reset_request: "Solicitud de recuperacion",
  password_reset_complete: "Contraseña recuperada",
  rules_update: "Reglas actualizadas",
  team_withdraw: "Baja de equipo",
  match_walkover: "Default administrativo",
  match_sheet_save: "Acta guardada",
  match_update: "Partido actualizado",
  match_delete: "Partido eliminado"
};

const AUDIT_CRITICAL_ACTIONS = new Set([
  "league_delete",
  "login_locked",
  "login_blocked",
  "user_delete",
  "user_disable",
  "password_reset_complete",
  "team_withdraw",
  "match_walkover"
]);

const AUDIT_WARNING_ACTIONS = new Set([
  "login_failed",
  "password_reset_request",
  "user_update",
  "rules_update",
  "match_sheet_save",
  "match_update",
  "match_delete",
  "league_save",
  "store_save"
]);

function auditSeverity(action) {
  if (AUDIT_CRITICAL_ACTIONS.has(action)) return "critical";
  if (AUDIT_WARNING_ACTIONS.has(action)) return "warning";
  return "normal";
}

function auditSeverityLabel(severity) {
  if (severity === "critical") return "Critico";
  if (severity === "warning") return "Revision";
  return "Normal";
}

function formatAuditDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function AuditPanel({ authToken, leagues }) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ leagueId: "all", action: "all", severity: "all", dateRange: "all", query: "" });
  const leagueNames = useMemo(() => new Map(leagues.map((league) => [league.id, league.name])), [leagues]);
  const actionOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs]);
  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, [logs.length]);

  const filteredLogs = useMemo(() => logs.filter((log) => {
    const severity = auditSeverity(log.action);
    const logDate = new Date(log.createdAt);
    const searchable = `${log.userEmail} ${log.detail} ${log.action} ${leagueNames.get(log.leagueId) || ""}`.toLowerCase();
    const query = filters.query.trim().toLowerCase();

    if (filters.leagueId !== "all" && String(log.leagueId || "platform") !== filters.leagueId) return false;
    if (filters.action !== "all" && log.action !== filters.action) return false;
    if (filters.severity !== "all" && severity !== filters.severity) return false;
    if (filters.dateRange === "today" && logDate < todayStart) return false;
    if (filters.dateRange === "7days" && logDate < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) return false;
    if (query && !searchable.includes(query)) return false;
    return true;
  }), [filters, leagueNames, logs, todayStart]);

  const auditSummary = useMemo(() => {
    const todayLogs = logs.filter((log) => new Date(log.createdAt) >= todayStart);
    return {
      total: logs.length,
      today: todayLogs.length,
      critical: logs.filter((log) => auditSeverity(log.action) === "critical").length,
      failedToday: todayLogs.filter((log) => ["login_failed", "login_locked", "login_blocked"].includes(log.action)).length
    };
  }, [logs, todayStart]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function loadLogs() {
    if (!authToken) return;
    try {
      setError("");
      setLogs(await fetchAuditLogs(authToken, 200));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [authToken]);

  return (
    <section className="panel">
      <div className="panel-title-row">
        <SectionHeading eyebrow="Auditoria" title="Historial de actividad" />
        <button type="button" onClick={loadLogs}>Actualizar</button>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="audit-summary">
        <article>
          <small>Eventos cargados</small>
          <strong>{auditSummary.total}</strong>
        </article>
        <article>
          <small>Movimientos hoy</small>
          <strong>{auditSummary.today}</strong>
        </article>
        <article className={auditSummary.critical ? "critical" : ""}>
          <small>Criticos</small>
          <strong>{auditSummary.critical}</strong>
        </article>
        <article className={auditSummary.failedToday ? "warning" : ""}>
          <small>Accesos fallidos hoy</small>
          <strong>{auditSummary.failedToday}</strong>
        </article>
      </div>

      <div className="audit-filters" aria-label="Filtros de auditoria">
        <select value={filters.leagueId} onChange={(event) => updateFilter("leagueId", event.target.value)} aria-label="Filtrar por liga">
          <option value="all">Todas las ligas</option>
          <option value="platform">Plataforma</option>
          {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
        </select>
        <select value={filters.action} onChange={(event) => updateFilter("action", event.target.value)} aria-label="Filtrar por accion">
          <option value="all">Todas las acciones</option>
          {actionOptions.map((action) => <option key={action} value={action}>{AUDIT_LABELS[action] || action}</option>)}
        </select>
        <select value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)} aria-label="Filtrar por nivel">
          <option value="all">Todos los niveles</option>
          <option value="critical">Criticos</option>
          <option value="warning">Revision</option>
          <option value="normal">Normal</option>
        </select>
        <select value={filters.dateRange} onChange={(event) => updateFilter("dateRange", event.target.value)} aria-label="Filtrar por fecha">
          <option value="all">Todo el historial</option>
          <option value="today">Hoy</option>
          <option value="7days">Ultimos 7 dias</option>
        </select>
        <input
          value={filters.query}
          onChange={(event) => updateFilter("query", event.target.value)}
          placeholder="Buscar usuario, detalle o accion"
          aria-label="Buscar en auditoria"
        />
      </div>

      <div className="audit-list">
        {filteredLogs.map((log) => (
          <article className={`audit-row ${auditSeverity(log.action)}`} key={log.id}>
            <div>
              <small>{auditSeverityLabel(auditSeverity(log.action))}</small>
              <strong>{AUDIT_LABELS[log.action] || log.action}</strong>
              <span>{log.detail || `${log.entityType} ${log.entityId || ""}`}</span>
            </div>
            <div>
              <small>Usuario</small>
              <span>{log.userEmail}</span>
              <small>{log.userRole}</small>
            </div>
            <div>
              <small>Liga</small>
              <span>{leagueNames.get(log.leagueId) || log.leagueId || "Plataforma"}</span>
              <small>{log.entityType}{log.entityId ? ` | ${log.entityId}` : ""}</small>
            </div>
            <time dateTime={log.createdAt}>{formatAuditDate(log.createdAt)}</time>
          </article>
        ))}
        {!logs.length && <p className="empty">Aun no hay movimientos registrados.</p>}
        {logs.length > 0 && !filteredLogs.length && <p className="empty">No hay movimientos con esos filtros.</p>}
      </div>
    </section>
  );
}

function ModelNotes() {
  return (
    <section className="panel">
      <SectionHeading eyebrow="Arquitectura" title="Preparado para web, iOS y Android" />
      <div className="roadmap">
        <article><strong>Multi-tenant</strong><span>Cada liga tendra sus propios equipos, jugadores, partidos, eventos, sanciones, anuncios y usuarios.</span></article>
        <article><strong>Identidad configurable</strong><span>Tingüindín puede usar su distintivo local, colores y actividades sin crear codigo especial para esa liga.</span></article>
        <article><strong>Bajas a medio torneo</strong><span>Cada liga define si una baja genera descanso, default administrativo o triunfo 3-0 para rivales pendientes.</span></article>
        <article><strong>Roles</strong><span>Super admin controla membresias; admin de liga captura informacion; publico consulta sin cuenta.</span></article>
        <article><strong>API primero</strong><span>La logica de tabla y estadisticas se puede mover a servicios compartidos para React Native o Expo.</span></article>
        <article><strong>Eventos de partido</strong><span>Goles, amarillas, rojas y sanciones nacen del acta del juego para evitar duplicar datos.</span></article>
      </div>
    </section>
  );
}

function CompetitionSelect({ league, name, defaultValue, value, onChange }) {
  return (
    <select name={name} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange} required>
      {(league.competitions || []).map((competition) => (
        <option key={competition.id} value={competition.id}>
          {competition.name} | {competition.season}
        </option>
      ))}
    </select>
  );
}

function TeamSelect({ league, name, defaultValue }) {
  return (
    <select name={name} defaultValue={defaultValue} required>
      {league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
    </select>
  );
}

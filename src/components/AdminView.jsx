import { useEffect, useMemo, useState } from "react";
import { DEFAULT_IDENTITY } from "../data/seedData.js";
import { fetchAuditLogs } from "../lib/auditApi.js";
import { MAX_IMAGE_DATA_URL_LENGTH, calculatePlayerAppearanceEligibility, calculateStandings, calculateYellowCardDiscipline, formatDate, getCompetition, getCurrentDisplayRound, getDefaultCompetitionId, getEligiblePlayersForTeam, getPlayer, getPlayerAffiliationForTeam, getPlayerNumberForTeam, getPlayoffPhaseLabel, getTeam, isPlayerEligibleForTeam, scopeLeagueToCompetition } from "../lib/domain.js";
import { getFormPayload } from "./forms.js";
import { SectionHeading } from "./SectionHeading.jsx";
import { PlayerPhotoUploader } from "./PlayerPhotoUploader.jsx";
import { createUser, deleteUser, disableUser, fetchUsers, resendUserInvitation, updateUser } from "../lib/userApi.js";
import { createTeamDelegate, deleteTeamDelegate, fetchTeamDelegates, resendTeamDelegateInvitation, updateTeamDelegate, updateTeamRosterPermission } from "../lib/teamDelegateApi.js";
import { createReferee, deleteReferee, fetchReferees, fetchRefereeMatchSheets, resendRefereeInvitation, reviewRefereeMatchSheet, updateMatchReferees, updateReferee } from "../lib/refereeApi.js";
import { uploadImage } from "../lib/uploadApi.js";
import { updateMatchSheetEventItem } from "../lib/matchSheet.js";

const PLAYOFF_PHASE_OPTIONS = [
  { value: "round32", label: "16vos de final", teams: 32 },
  { value: "round16", label: "8vos de final", teams: 16 },
  { value: "quarterfinal", label: "Cuartos de final", teams: 8 },
  { value: "semifinal", label: "Semifinal", teams: 4 },
  { value: "final", label: "Final", teams: 2 }
];

const PLAYER_POSITION_OPTIONS = ["Arquero", "Defensor", "Mediocampista", "Delantero"];
const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_UPLOAD_SIZE_MB = Math.round((MAX_IMAGE_DATA_URL_LENGTH / 1024 / 1024) * 10) / 10;

function getPlayoffPhaseValueByTeams(teams) {
  return PLAYOFF_PHASE_OPTIONS.find((phase) => phase.teams === Number(teams))?.value || "quarterfinal";
}

function getPlayerPositionOptionValue(position) {
  const normalized = String(position || "").toLocaleUpperCase("es-MX");
  if (normalized.includes("ARQUERO") || normalized.includes("PORTERO")) return "Arquero";
  if (normalized.includes("DEFENSOR") || normalized.includes("DEFENSA")) return "Defensor";
  if (normalized.includes("MEDIOCAMPISTA") || normalized.includes("MEDIO")) return "Mediocampista";
  if (normalized.includes("DELANTERO")) return "Delantero";
  return "Delantero";
}

export function AdminView({
  adminPanel,
  applyApiStore,
  authToken,
  canUseSuperAdmin,
  currentUser,
  league,
  onAddAnnouncement,
  onAddAppearanceAdjustment,
  onAddLeague,
  onAddCompetition,
  onAddDisciplineAdjustment,
  onAddDisciplineLink,
  onAddDisciplineReset,
  onAddMatch,
  onAddPlayer,
  onAddPlayerInjury,
  onAddPlayerSanction,
  onAddSponsor,
  onAddTeam,
  onAddTeamAffiliation,
  onAddVenue,
  onDeleteMatch,
  onDeletePlayoffMatches,
  onDeleteAnnouncement,
  onDeleteAppearanceAdjustment,
  onDeleteDisciplineAdjustment,
  onDeleteDisciplineLink,
  onDeleteDisciplineReset,
  onDeleteLeague,
  onDeletePlayer,
  onDeletePlayerInjury,
  onDeletePlayerSanction,
  onDeleteSponsor,
  onDeleteTeam,
  onDeleteTeamAffiliation,
  onDeleteVenue,
  onGenerateSchedule,
  onGeneratePlayoffBracket,
  onResetDemo,
  onSaveIdentity,
  onSaveMatchSheet,
  onSaveRules,
  onSetAdminPanel,
  onToggleLeague,
  onUpdateAnnouncement,
  onUpdateCompetition,
  onUpdateLeagueMembership,
  onUpdateMatch,
  onUpdatePlayer,
  onUpdatePlayerInjury,
  onUpdateSponsor,
  onUpdateTeam,
  onMergeDuplicatePlayer,
  onUpdateTeamAffiliationPlayerNumber,
  onUpdateVenue,
  selectedAccess,
  store,
  userListRefreshKey = 0
}) {
  const activeRole = selectedAccess?.role || currentUser?.role;
  return (
    <main className="page">
      <section className="admin-shell">
        <div className="admin-sidebar">
          <span className="eyebrow">Panel administrativo</span>
          <h1>Operacion</h1>
          {currentUser && (
            <p className="admin-user-note">
              {activeRole === "super_admin" ? "Control total de plataforma" : `Editando ${league.name}`}
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
              authToken={authToken}
              applyApiStore={applyApiStore}
              currentUser={currentUser}
              league={league}
              selectedAccess={selectedAccess}
              onAddAnnouncement={onAddAnnouncement}
              onAddAppearanceAdjustment={onAddAppearanceAdjustment}
              onAddCompetition={onAddCompetition}
              onAddDisciplineAdjustment={onAddDisciplineAdjustment}
              onAddDisciplineLink={onAddDisciplineLink}
              onAddDisciplineReset={onAddDisciplineReset}
              onAddMatch={onAddMatch}
              onAddPlayer={onAddPlayer}
              onAddPlayerInjury={onAddPlayerInjury}
              onAddPlayerSanction={onAddPlayerSanction}
              onAddTeam={onAddTeam}
              onAddTeamAffiliation={onAddTeamAffiliation}
              onAddVenue={onAddVenue}
              onDeleteMatch={onDeleteMatch}
              onDeletePlayoffMatches={onDeletePlayoffMatches}
              onDeleteAnnouncement={onDeleteAnnouncement}
              onDeleteAppearanceAdjustment={onDeleteAppearanceAdjustment}
              onDeleteDisciplineAdjustment={onDeleteDisciplineAdjustment}
              onDeleteDisciplineLink={onDeleteDisciplineLink}
              onDeleteDisciplineReset={onDeleteDisciplineReset}
              onDeletePlayer={onDeletePlayer}
              onDeletePlayerInjury={onDeletePlayerInjury}
              onDeletePlayerSanction={onDeletePlayerSanction}
              onDeleteTeam={onDeleteTeam}
              onDeleteTeamAffiliation={onDeleteTeamAffiliation}
              onDeleteVenue={onDeleteVenue}
              onGenerateSchedule={onGenerateSchedule}
              onGeneratePlayoffBracket={onGeneratePlayoffBracket}
              onSaveIdentity={onSaveIdentity}
              onSaveMatchSheet={onSaveMatchSheet}
              onSaveRules={onSaveRules}
              onUpdateAnnouncement={onUpdateAnnouncement}
              onUpdateCompetition={onUpdateCompetition}
              onUpdateMatch={onUpdateMatch}
              onUpdatePlayer={onUpdatePlayer}
              onUpdatePlayerInjury={onUpdatePlayerInjury}
              onUpdateTeam={onUpdateTeam}
              onMergeDuplicatePlayer={onMergeDuplicatePlayer}
              onUpdateTeamAffiliationPlayerNumber={onUpdateTeamAffiliationPlayerNumber}
              onUpdateVenue={onUpdateVenue}
            />
          )}
          {adminPanel === "super" && canUseSuperAdmin && (
            <SuperAdmin
              onAddLeague={onAddLeague}
              onAddSponsor={onAddSponsor}
              onDeleteLeague={onDeleteLeague}
              onDeleteSponsor={onDeleteSponsor}
              onResetDemo={onResetDemo}
              onToggleLeague={onToggleLeague}
              onUpdateLeagueMembership={onUpdateLeagueMembership}
              onUpdateSponsor={onUpdateSponsor}
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
  authToken,
  applyApiStore,
  currentUser,
  league,
  onAddAnnouncement,
  onAddAppearanceAdjustment,
  onAddCompetition,
  onAddDisciplineAdjustment,
  onAddDisciplineLink,
  onAddDisciplineReset,
  onAddMatch,
  onAddPlayer,
  onAddPlayerInjury,
  onAddPlayerSanction,
  onAddTeam,
  onAddTeamAffiliation,
  onAddVenue,
  onDeleteMatch,
  onDeletePlayoffMatches,
  onDeleteAnnouncement,
  onDeleteAppearanceAdjustment,
  onDeleteDisciplineAdjustment,
  onDeleteDisciplineLink,
  onDeleteDisciplineReset,
  onDeletePlayer,
  onDeletePlayerInjury,
  onDeletePlayerSanction,
  onDeleteTeam,
  onDeleteTeamAffiliation,
  onDeleteVenue,
  onGenerateSchedule,
  onGeneratePlayoffBracket,
  onSaveIdentity,
  onSaveMatchSheet,
  onSaveRules,
  onUpdateAnnouncement,
  onUpdateCompetition,
  onUpdateMatch,
  onUpdatePlayer,
  onUpdatePlayerInjury,
  onUpdateTeam,
  onMergeDuplicatePlayer,
  onUpdateTeamAffiliationPlayerNumber,
  onUpdateVenue,
  selectedAccess
}) {
  const identity = league.identity || DEFAULT_IDENTITY;
  const currentCompetitionId = getDefaultCompetitionId(league);
  const currentCompetition = getCompetition(league, currentCompetitionId);
  const currentCompetitionLeague = scopeLeagueToCompetition(league, currentCompetitionId);
  const [activeSection, setActiveSection] = useState("capture");
  const [identityNotice, setIdentityNotice] = useState("");
  const activeRole = selectedAccess?.role || currentUser?.role;
  const accessPermissions = new Set(Array.isArray(selectedAccess?.permissions) ? selectedAccess.permissions : []);
  const hasFullLeagueAccess = ["super_admin", "league_admin"].includes(activeRole);
  const limitedSectionIds = new Set(["capture", "lists", "delegates", "referees", "rules"]);
  const canUseSection = (requiredPermissions = []) => (
    hasFullLeagueAccess ||
    (activeRole === "admin_limited" &&
      requiredPermissions.some((permission) => accessPermissions.has(permission)))
  );
  const sections = [
    { id: "capture", label: "Captura", permissions: ["matches", "teams", "players"] },
    { id: "tournaments", label: "Torneos", permissions: ["settings"] },
    { id: "squads", label: "Plantillas", permissions: ["players", "teams", "read_only"] },
    { id: "delegates", label: "Delegados", permissions: ["delegates"] },
    { id: "referees", label: "Arbitros", permissions: ["referees", "match_sheets"] },
    { id: "venues", label: "Canchas", permissions: ["settings", "calendar"] },
    { id: "announcements", label: "Avisos", permissions: ["settings"] },
    { id: "lists", label: "Listados", permissions: ["matches", "teams", "players", "read_only"] },
    { id: "sheet", label: "Acta", permissions: ["match_sheets"] },
    { id: "affiliations", label: "Afiliaciones", permissions: ["players", "teams"] },
    { id: "discipline", label: "Disciplina", permissions: ["discipline"] },
    { id: "sanctions", label: "Sanciones", permissions: ["discipline"] },
    { id: "injuries", label: "Lesiones", permissions: ["players", "discipline"] },
    { id: "rules", label: "Reglas", permissions: ["settings"] },
    { id: "identity", label: "Identidad", permissions: ["settings"] }
  ];
  const visibleSections = sections.filter((section) => (
    canUseSection(section.permissions) &&
    (activeRole !== "admin_limited" || limitedSectionIds.has(section.id))
  ));

  useEffect(() => {
    if (visibleSections.length && !visibleSections.some((section) => section.id === activeSection)) {
      setActiveSection(visibleSections[0].id);
    }
  }, [activeSection, visibleSections]);

  return (
    <>
      <section className="panel admin-home-panel">
        <div className="admin-league-head">
          <div>
            <span className="eyebrow">Admin de liga</span>
            <h2>{league.name}</h2>
          </div>
          <div className="admin-metrics" aria-label="Resumen administrativo">
            <span><strong>{currentCompetitionLeague.teams.length}</strong> Equipos</span>
            <span><strong>{currentCompetitionLeague.players.length}</strong> Jugadores</span>
            <span><strong>{currentCompetitionLeague.matches.length}</strong> Partidos</span>
            <span><strong>{league.competitions?.length || 0}</strong> Torneos</span>
          </div>
        </div>
        <p className="helper-text">Categoria actual: {currentCompetition?.name || "TORNEO"} | {currentCompetition?.season || league.season}. Equipos y jugadores se administran separados por categoria.</p>
        {activeRole === "admin_limited" && !visibleSections.length && (
          <p className="auth-error">
            Este acceso tiene permisos registrados, pero aun no tiene un modulo habilitado en esta version. Solicita al super admin ajustar los permisos.
          </p>
        )}
        {activeRole === "super_admin" && (
          <div className="super-admin-warning">
            <strong>Modo super admin</strong>
            <span>Estas operando {league.name}. Verifica que esta sea la liga correcta antes de guardar cambios.</span>
          </div>
        )}
        <div className="admin-section-tabs" aria-label="Secciones de captura">
          {visibleSections.map((section) => (
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
          authToken={authToken}
          league={league}
          onGenerateSchedule={onGenerateSchedule}
          onGeneratePlayoffBracket={onGeneratePlayoffBracket}
          onAddMatch={onAddMatch}
          onAddPlayer={onAddPlayer}
          onAddTeam={onAddTeam}
          allowedModes={activeRole === "admin_limited" ? (accessPermissions.has("matches") ? ["match"] : []) : null}
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

      {activeSection === "delegates" && (
        <TeamDelegatesPanel
          authToken={authToken}
          league={league}
        />
      )}

      {activeSection === "referees" && (
        <RefereesPanel
          authToken={authToken}
          applyApiStore={applyApiStore}
          league={league}
        />
      )}

      {activeSection === "venues" && (
        <VenuesPanel
          league={league}
          onAddVenue={onAddVenue}
          onDeleteVenue={onDeleteVenue}
          onUpdateVenue={onUpdateVenue}
        />
      )}

      {activeSection === "announcements" && (
        <AnnouncementsPanel
          league={league}
          onAddAnnouncement={onAddAnnouncement}
          onDeleteAnnouncement={onDeleteAnnouncement}
          onUpdateAnnouncement={onUpdateAnnouncement}
        />
      )}

      {activeSection === "lists" && (
        <ManagementBoard
          authToken={authToken}
          league={league}
          onDeleteMatch={onDeleteMatch}
          onDeletePlayoffMatches={onDeletePlayoffMatches}
          onDeletePlayer={onDeletePlayer}
          onDeleteTeam={onDeleteTeam}
          onUpdateMatch={onUpdateMatch}
          onUpdatePlayer={onUpdatePlayer}
          onUpdateTeam={onUpdateTeam}
          allowedLists={activeRole === "admin_limited" ? (accessPermissions.has("matches") ? ["matches"] : []) : null}
          canEditMatchResults={activeRole !== "admin_limited" || accessPermissions.has("match_sheets")}
        />
      )}

      {activeSection === "sheet" && (
        <section className="panel">
          <SectionHeading eyebrow="Acta" title="Acta de partido" />
          <MatchSheet league={league} onSaveMatchSheet={onSaveMatchSheet} />
        </section>
      )}

      {activeSection === "affiliations" && (
        <AffiliationsPanel
          league={league}
          onAddTeamAffiliation={onAddTeamAffiliation}
          onDeleteTeamAffiliation={onDeleteTeamAffiliation}
          onMergeDuplicatePlayer={onMergeDuplicatePlayer}
          onUpdateTeamAffiliationPlayerNumber={onUpdateTeamAffiliationPlayerNumber}
        />
      )}

      {activeSection === "discipline" && (
        <DisciplineControlPanel
          league={league}
          onAddDisciplineAdjustment={onAddDisciplineAdjustment}
          onAddDisciplineLink={onAddDisciplineLink}
          onAddDisciplineReset={onAddDisciplineReset}
          onDeleteDisciplineAdjustment={onDeleteDisciplineAdjustment}
          onDeleteDisciplineLink={onDeleteDisciplineLink}
          onDeleteDisciplineReset={onDeleteDisciplineReset}
        />
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

      {activeSection === "rules" && (
        <RulesPanel
          league={league}
          onAddAppearanceAdjustment={onAddAppearanceAdjustment}
          onDeleteAppearanceAdjustment={onDeleteAppearanceAdjustment}
          onSaveRules={onSaveRules}
        />
      )}

      {activeSection === "identity" && (
        <section className="panel">
          <SectionHeading eyebrow="Configuracion" title="Identidad publica de la liga" />
          {identityNotice && <p className="auth-ok">{identityNotice}</p>}
          <form
            className="identity-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!window.confirm("¿Guardar los cambios de identidad publica de la liga?")) return;
              onSaveIdentity(getFormPayload(event.currentTarget));
              setIdentityNotice("Identidad publica guardada correctamente.");
            }}
          >
            <label>Nombre de la liga<input name="name" required defaultValue={league.name} /></label>
            <label>Municipio o zona<input name="city" required defaultValue={league.city} /></label>
            <label>Temporada<input name="season" required defaultValue={league.season} /></label>
            <label>Distintivo local<input name="nickname" defaultValue={identity.nickname} placeholder="Ej. Pueblo de las 3 campanas" /></label>
            <label>Actividades o rasgos<input name="activities" defaultValue={identity.activities} placeholder="Ej. Aguacate, pan" /></label>
            <label>Patrocinador / anuncio<input name="adBanner" defaultValue={league.adBanner} /></label>
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
  const [tournamentNotice, setTournamentNotice] = useState("");

  function updateCompetitionWithNotice(competitionId, payload) {
    onUpdateCompetition(competitionId, payload);
    setTournamentNotice("Torneo actualizado correctamente.");
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Temporadas" title="Torneos de la liga" />
      {tournamentNotice && <p className="auth-ok">{tournamentNotice}</p>}
      <p className="helper-text">Cada torneo/categoria tiene sus propios equipos, jugadores, calendario, tabla y actas. Usa nombres como LIGA PRIMERA, LIGA SEGUNDA, JUVENIL o FEMENIL.</p>
      <p className="helper-text">Usa activo para torneos visibles. Archiva temporadas viejas para guardarlas sin saturar la portada publica. Inicio y fin son opcionales.</p>
      <p className="helper-text">Torneos activos: {activeCompetitions.length}. Puedes registrar las categorias que necesite la liga.</p>
      <form className="tournament-form" onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm("¿Confirmas crear este torneo/categoria?")) return;
        onAddCompetition(getTournamentFormPayload(event.currentTarget));
        setTournamentNotice("Torneo creado correctamente.");
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
        <button className="primary" type="submit">Crear torneo</button>
      </form>

      <TournamentList title="Torneos activos" competitions={activeCompetitions} league={league} onUpdateCompetition={updateCompetitionWithNotice} />
      {!!archivedCompetitions.length && (
        <details className="archive-box">
          <summary>Historial archivado ({archivedCompetitions.length})</summary>
          <TournamentList title="" competitions={archivedCompetitions} league={league} onUpdateCompetition={updateCompetitionWithNotice} />
        </details>
      )}
    </section>
  );
}

function SquadsPanel({ league }) {
  const activeLeague = scopeLeagueToCompetition(league, getDefaultCompetitionId(league));
  const sortedTeams = useMemo(
    () => [...activeLeague.teams].sort((a, b) => a.name.localeCompare(b.name)),
    [activeLeague.teams]
  );
  const [selectedTeamId, setSelectedTeamId] = useState(sortedTeams[0]?.id || "");
  const selectedTeam = sortedTeams.find((team) => team.id === selectedTeamId) || sortedTeams[0] || null;
  const squadPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return getEligiblePlayersForTeam(league, selectedTeam.id);
  }, [league, selectedTeam]);

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
                  <span role="cell">{getPlayerNumberForTeam(league, player.id, selectedTeam.id) || "-"}</span>
                  <strong role="cell">
                    {player.name}
                    {getPlayerAffiliationForTeam(league, player.id, selectedTeam.id) && (
                      <small className="affiliate-badge">AFILIADO: {getTeam(league, player.teamId)?.name || "ORIGEN"}</small>
                    )}
                  </strong>
                  <span role="cell">{player.position || "JUGADOR"}</span>
                  <span role="cell">{getPlayerAffiliationForTeam(league, player.id, selectedTeam.id) ? "AFILIADO" : player.status === "inactive" ? "INACTIVO" : "ACTIVO"}</span>
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

function TeamDelegatesPanel({ authToken, league }) {
  const [delegates, setDelegates] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [cardMessages, setCardMessages] = useState({});
  const [lastInvitation, setLastInvitation] = useState(null);
  const [delegateSearch, setDelegateSearch] = useState("");
  const [delegateCompetitionFilter, setDelegateCompetitionFilter] = useState("all");
  const [delegateStatusFilter, setDelegateStatusFilter] = useState("all");
  const teams = useMemo(() => [...(league.teams || [])].sort((a, b) => a.name.localeCompare(b.name)), [league.teams]);
  const competitions = useMemo(() => [...(league.competitions || [])].sort((a, b) => a.name.localeCompare(b.name)), [league.competitions]);
  const filteredTeams = useMemo(() => {
    const query = normalizeAdminSearchTerm(delegateSearch);
    return teams.filter((team) => {
      const competition = getCompetition(league, team.competitionId);
      if (delegateCompetitionFilter !== "all" && (team.competitionId || getDefaultCompetitionId(league)) !== delegateCompetitionFilter) return false;
      if (!query) return true;
      const delegate = delegates.find((item) => item.teamId === team.id);
      const searchable = normalizeAdminSearchTerm(`${team.name} ${competition?.name || ""} ${delegate?.userName || ""} ${delegate?.userEmail || ""} ${delegate?.userPhone || ""}`);
      return searchable.includes(query);
    });
  }, [delegateCompetitionFilter, delegateSearch, delegates, league, teams]);
  const filteredDelegates = useMemo(() => {
    const query = normalizeAdminSearchTerm(delegateSearch);
    return delegates.filter((delegate) => {
      if (delegateCompetitionFilter !== "all" && (delegate.competitionId || getDefaultCompetitionId(league)) !== delegateCompetitionFilter) return false;
      if (delegateStatusFilter !== "all" && delegate.status !== delegateStatusFilter) return false;
      if (!query) return true;
      const searchable = normalizeAdminSearchTerm(`${delegate.userName} ${delegate.userEmail} ${delegate.userPhone || ""} ${delegate.teamName} ${delegate.competitionName || ""}`);
      return searchable.includes(query);
    });
  }, [delegateCompetitionFilter, delegateSearch, delegateStatusFilter, delegates, league]);
  const teamsByCompetition = useMemo(
    () => groupDelegateItemsByCompetition(filteredTeams, league, (team) => team.competitionId),
    [filteredTeams, league]
  );
  const delegatesByCompetition = useMemo(
    () => groupDelegateItemsByCompetition(filteredDelegates, league, (delegate) => delegate.competitionId),
    [filteredDelegates, league]
  );
  const createTeamOptions = useMemo(
    () => delegateCompetitionFilter === "all"
      ? teams
      : teams.filter((team) => (team.competitionId || getDefaultCompetitionId(league)) === delegateCompetitionFilter),
    [delegateCompetitionFilter, league, teams]
  );
  const assignedTeamIds = useMemo(() => new Set(delegates.map((delegate) => delegate.teamId)), [delegates]);

  function setCardMessage(key, message, type = "ok") {
    setCardMessages((current) => ({ ...current, [key]: { message, type } }));
  }

  async function reload() {
    setLoading(true);
    try {
      setDelegates(await fetchTeamDelegates(authToken, league.id));
      setError("");
    } catch (loadError) {
      setError(loadError.message || "No se pudieron cargar los delegados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [authToken, league.id]);

  async function submitDelegate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = getFormPayload(form);
    if (!window.confirm("¿Crear este usuario delegado y asignarlo al equipo seleccionado?")) return;
    try {
      setBusyAction("create-delegate");
      const response = await createTeamDelegate(authToken, { ...payload, leagueId: league.id });
      setDelegates(response.delegates || []);
      setLastInvitation(response.invitation || null);
      setNotice(`Invitacion creada para ${payload.name}. Copia el mensaje y envialo por WhatsApp.`);
      setError("");
      form.reset();
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo crear el delegado.");
    } finally {
      setBusyAction("");
    }
  }

  async function regenerateInvitation(delegate) {
    const actionKey = `invite-${delegate.id}`;
    setBusyAction(actionKey);
    setCardMessage(delegate.id, "Generando nueva invitacion...", "working");
    try {
      const response = await resendTeamDelegateInvitation(authToken, delegate.id);
      setDelegates(response.delegates || []);
      setLastInvitation(response.invitation || null);
      const message = "Invitacion regenerada. Copia el nuevo mensaje para enviarlo.";
      setNotice(message);
      setCardMessage(delegate.id, message, "ok");
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo regenerar la invitacion.");
      setCardMessage(delegate.id, saveError.message || "No se pudo regenerar la invitacion.", "error");
    } finally {
      setBusyAction("");
    }
  }

  async function savePermission(event, team) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    const actionKey = `permission-${team.id}`;
    setBusyAction(actionKey);
    setCardMessage(actionKey, "Guardando permiso...", "working");
    try {
      const nextDelegates = await updateTeamRosterPermission(authToken, team.id, {
        leagueId: league.id,
        registrationEnabled: payload.registrationEnabled === "on",
        enabledUntil: payload.enabledUntil,
        notes: payload.notes
      });
      setDelegates(nextDelegates);
      const stateLabel = payload.registrationEnabled === "on" ? "abierto" : "cerrado";
      const message = `Permiso guardado. Registro ${stateLabel} para ${team.name}.`;
      setNotice(message);
      setCardMessage(actionKey, message, "ok");
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el permiso.");
      setCardMessage(actionKey, saveError.message || "No se pudo actualizar el permiso.", "error");
    } finally {
      setBusyAction("");
    }
  }

  async function changeDelegateStatus(delegate, status) {
    const actionKey = `${status}-${delegate.id}`;
    setBusyAction(actionKey);
    setCardMessage(delegate.id, status === "active" ? "Activando delegado..." : status === "suspended" ? "Suspendiendo delegado..." : "Desactivando delegado...", "working");
    try {
      const nextDelegates = await updateTeamDelegate(authToken, delegate.id, { status });
      setDelegates(nextDelegates);
      const message = status === "active"
        ? `${delegate.userName} activado correctamente. Ya puede iniciar sesion si tiene acceso vigente.`
        : status === "suspended"
        ? `${delegate.userName} suspendido. No podra iniciar sesion hasta reactivarlo.`
        : `${delegate.userName} desactivado. No podra iniciar sesion hasta reactivarlo.`;
      setNotice(message);
      setCardMessage(delegate.id, message, "ok");
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el delegado.");
      setCardMessage(delegate.id, saveError.message || "No se pudo actualizar el delegado.", "error");
    } finally {
      setBusyAction("");
    }
  }

  async function removeDelegate(delegate) {
    const confirmed = window.confirm(
      `¿Quitar a ${delegate.userName} como delegado de ${delegate.teamName}?\n\n` +
      "Se elimina solo su asignacion a este equipo. Si no tiene otro equipo asignado, tambien se deshabilita su usuario para que no pueda iniciar sesion."
    );
    if (!confirmed) return;

    const actionKey = `remove-${delegate.id}`;
    setBusyAction(actionKey);
    setCardMessage(delegate.id, "Quitando acceso del equipo...", "working");
    try {
      const response = await deleteTeamDelegate(authToken, delegate.id, { disableUser: true });
      setDelegates(response.delegates || []);
      const message = response.userDisabled
        ? "Delegado quitado y usuario deshabilitado correctamente."
        : "Delegado quitado del equipo correctamente.";
      setNotice(message);
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo quitar el delegado.");
      setCardMessage(delegate.id, saveError.message || "No se pudo quitar el delegado.", "error");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteDelegateUser(delegate) {
    const typedEmail = window.prompt(
      `Eliminar definitivamente el usuario de equipo de ${delegate.userName}.\n\n` +
      `Esta accion borra la cuenta ${delegate.userEmail} y le quita el acceso a ${delegate.teamName}. No elimina jugadores ni datos del equipo.\n\n` +
      "Para confirmar, escribe el correo completo del usuario:"
    );
    if (typedEmail === null) return;
    if (typedEmail.trim().toLowerCase() !== String(delegate.userEmail || "").toLowerCase()) {
      setNotice("");
      setError("No se elimino el usuario. El correo escrito no coincide.");
      setCardMessage(delegate.id, "No se elimino el usuario. El correo escrito no coincide.", "error");
      return;
    }

    const actionKey = `delete-${delegate.id}`;
    setBusyAction(actionKey);
    setCardMessage(delegate.id, "Eliminando usuario de equipo...", "working");
    try {
      const response = await deleteTeamDelegate(authToken, delegate.id, { deleteUser: true });
      setDelegates(response.delegates || []);
      const message = response.userDeleted
        ? "Usuario de equipo eliminado definitivamente."
        : "Acceso del delegado eliminado.";
      setNotice(message);
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo eliminar definitivamente el usuario.");
      setCardMessage(delegate.id, saveError.message || "No se pudo eliminar definitivamente el usuario.", "error");
    } finally {
      setBusyAction("");
    }
  }

  function permissionForTeam(teamId) {
    return delegates.find((delegate) => delegate.teamId === teamId) || {};
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Equipos" title="Delegados y registro de plantillas" />
      <p className="helper-text">
        Crea un usuario por equipo y controla cuando puede registrar jugadores. Los delegados usan la ruta /equipo y no tienen acceso al panel administrativo completo.
      </p>
      <div className="module-guide">
        <span>1. Crea delegado</span>
        <span>2. Abre o cierra registro</span>
        <span>3. Revisa plantilla enviada</span>
      </div>
      {notice && <p className="auth-ok">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}

      <form className="delegate-create-form" onSubmit={submitDelegate}>
        <h3>Crear delegado de equipo</h3>
        <label>Torneo / categoria
          <select value={delegateCompetitionFilter} onChange={(event) => setDelegateCompetitionFilter(event.target.value)}>
            <option value="all">Todos los torneos</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name}</option>
            ))}
          </select>
        </label>
        <label>Equipo
          <select name="teamId" required disabled={!createTeamOptions.length}>
            {createTeamOptions.map((team) => (
              <option key={team.id} value={team.id}>{team.name} | {getCompetition(league, team.competitionId)?.name || "Categoria"}</option>
            ))}
          </select>
        </label>
        <label>Nombre del delegado<input name="name" required placeholder="Nombre del responsable" /></label>
        <label>Telefono<input name="phone" required inputMode="tel" placeholder="354..." /></label>
        <label>Correo<input name="email" required type="email" placeholder="delegado@correo.com" /></label>
        <button className="primary" type="submit" disabled={!createTeamOptions.length || busyAction === "create-delegate"}>
          {busyAction === "create-delegate" ? "Creando invitacion..." : "Crear invitacion"}
        </button>
      </form>

      {lastInvitation && (
        <div className="delegate-invitation-box">
          <strong>Mensaje listo para WhatsApp</strong>
          <textarea readOnly value={lastInvitation.whatsappMessage || ""} />
          <div className="inline-actions">
            <button type="button" onClick={() => navigator.clipboard?.writeText(lastInvitation.whatsappMessage || "")}>Copiar mensaje</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(lastInvitation.whatsappMessage || "")}`} rel="noreferrer" target="_blank">Abrir WhatsApp</a>
          </div>
          <small>Expira: {lastInvitation.expiresAt ? new Date(lastInvitation.expiresAt).toLocaleString("es-MX") : "segun configuracion"}</small>
        </div>
      )}

      <div className="delegate-filter-bar">
        <label>Buscar equipo o delegado
          <input
            type="search"
            value={delegateSearch}
            onChange={(event) => setDelegateSearch(event.target.value)}
            placeholder="Equipo, delegado, correo o telefono"
          />
        </label>
        <label>Torneo / categoria
          <select value={delegateCompetitionFilter} onChange={(event) => setDelegateCompetitionFilter(event.target.value)}>
            <option value="all">Todos los torneos</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name}</option>
            ))}
          </select>
        </label>
        <label>Estado delegado
          <select value={delegateStatusFilter} onChange={(event) => setDelegateStatusFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="pending_activation">Pendiente</option>
            <option value="active">Activo</option>
            <option value="disabled">Desactivado</option>
            <option value="suspended">Suspendido</option>
          </select>
        </label>
        <button type="button" onClick={() => {
          setDelegateSearch("");
          setDelegateCompetitionFilter("all");
          setDelegateStatusFilter("all");
        }}>
          Limpiar filtros
        </button>
      </div>
      <div className="delegate-summary-strip">
        <span><strong>{delegates.length}</strong> delegados</span>
        <span><strong>{assignedTeamIds.size}</strong> equipos asignados</span>
        <span><strong>{Math.max(teams.length - assignedTeamIds.size, 0)}</strong> equipos sin delegado</span>
      </div>

      <div className="delegate-grid">
        <div>
          <h3>Permisos por equipo</h3>
          <div className="delegate-group-list">
            {teamsByCompetition.map((group) => (
              <details className="delegate-compact-group" key={group.id} open={delegateCompetitionFilter !== "all" || Boolean(delegateSearch)}>
                <summary>
                  <strong>{group.name}</strong>
                  <span>{group.items.length} equipo(s)</span>
                </summary>
                <div className="delegate-list compact">
                  {group.items.map((team) => {
                    const permission = permissionForTeam(team.id);
                    const actionKey = `permission-${team.id}`;
                    const cardMessage = cardMessages[actionKey];
                    return (
                      <form className="delegate-card compact" key={team.id} onSubmit={(event) => savePermission(event, team)}>
                        <div className="delegate-card-head">
                          <strong>{team.name}</strong>
                          <small>{permission.userName ? `Delegado: ${permission.userName}` : "Sin delegado asignado"}</small>
                        </div>
                        <label className="checkbox-field compact-checkbox">
                          <input name="registrationEnabled" type="checkbox" defaultChecked={permission.registrationEnabled === true} />
                          Registro abierto
                        </label>
                        <label>Abierto hasta
                          <input name="enabledUntil" type="datetime-local" defaultValue={permission.enabledUntil ? permission.enabledUntil.slice(0, 16) : ""} />
                        </label>
                        <label>Nota
                          <input name="notes" defaultValue={permission.notes || ""} placeholder="Ej. Cierre viernes 8 pm" />
                        </label>
                        {cardMessage && <small className={`delegate-message ${cardMessage.type}`}>{cardMessage.message}</small>}
                        <button type="submit" disabled={busyAction === actionKey}>
                          {busyAction === actionKey ? "Guardando..." : "Guardar permiso"}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </details>
            ))}
            {!teams.length && <p className="empty">Primero registra equipos para poder asignar delegados.</p>}
            {teams.length > 0 && !filteredTeams.length && <p className="empty">No hay equipos que coincidan con los filtros.</p>}
          </div>
        </div>

        <div>
          <h3>Delegados asignados</h3>
          <div className="delegate-group-list">
            {loading ? <p className="empty">Cargando delegados...</p> : delegatesByCompetition.map((group) => (
              <details className="delegate-compact-group" key={group.id} open={delegateCompetitionFilter !== "all" || Boolean(delegateSearch) || delegateStatusFilter !== "all"}>
                <summary>
                  <strong>{group.name}</strong>
                  <span>{group.items.length} delegado(s)</span>
                </summary>
                <div className="delegate-list compact">
                  {group.items.map((delegate) => {
                    const cardMessage = cardMessages[delegate.id];
                    const isActivating = busyAction === `active-${delegate.id}`;
                    const isDisabling = busyAction === `disabled-${delegate.id}`;
                    const isSuspending = busyAction === `suspended-${delegate.id}`;
                    const isRemoving = busyAction === `remove-${delegate.id}`;
                    const isDeleting = busyAction === `delete-${delegate.id}`;
                    const isInviting = busyAction === `invite-${delegate.id}`;
                    const isBusyDelegate = isActivating || isDisabling || isSuspending || isRemoving || isDeleting || isInviting;
                    return (
                    <details className="delegate-card compact delegate-user-card" key={delegate.id}>
                      <summary>
                        <span>
                          <strong>{delegate.userName}</strong>
                          <small>{delegate.teamName} | Usuario {getDelegateStatusLabel(delegate.status)}</small>
                        </span>
                        <b>{delegate.registrationEnabled ? "Registro abierto" : "Registro cerrado"}</b>
                      </summary>
                      <span>{delegate.userEmail}</span>
                      {delegate.userPhone && <span>{delegate.userPhone}</span>}
                      <small>{delegate.competitionName || group.name}</small>
                      {cardMessage && <small className={`delegate-message ${cardMessage.type}`}>{cardMessage.message}</small>}
                      <div className="inline-actions delegate-action-grid">
                        <button type="button" disabled={delegate.status === "active" || delegate.status === "pending_activation" || isBusyDelegate} onClick={() => changeDelegateStatus(delegate, "active")}>
                          {isActivating ? "Activando..." : "Activar usuario"}
                        </button>
                        <button type="button" disabled={isBusyDelegate} onClick={() => regenerateInvitation(delegate)}>
                          {isInviting ? "Generando..." : delegate.status === "pending_activation" ? "Reenviar invitacion" : "Regenerar invitacion"}
                        </button>
                        <button className="danger" type="button" disabled={delegate.status === "disabled" || isBusyDelegate} onClick={() => changeDelegateStatus(delegate, "disabled")}>
                          {isDisabling ? "Desactivando..." : "Desactivar usuario"}
                        </button>
                        <button className="danger" type="button" disabled={delegate.status === "suspended" || isBusyDelegate} onClick={() => changeDelegateStatus(delegate, "suspended")}>
                          {isSuspending ? "Suspendiendo..." : "Suspender usuario"}
                        </button>
                        <button className="danger ghost-danger" type="button" disabled={isBusyDelegate} onClick={() => removeDelegate(delegate)}>
                          {isRemoving ? "Quitando..." : "Quitar acceso al equipo"}
                        </button>
                        <button className="danger ghost-danger" type="button" disabled={isBusyDelegate} onClick={() => deleteDelegateUser(delegate)}>
                          {isDeleting ? "Eliminando..." : "Eliminar usuario definitivo"}
                        </button>
                      </div>
                    </details>
                    );
                  })}
                </div>
              </details>
            ))}
            {!loading && !delegates.length && <p className="empty">Aun no hay delegados asignados.</p>}
            {!loading && delegates.length > 0 && !filteredDelegates.length && <p className="empty">No hay delegados que coincidan con los filtros.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function RefereesPanel({ authToken, applyApiStore, league }) {
  const [referees, setReferees] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [lastInvitation, setLastInvitation] = useState(null);
  const [pendingSheets, setPendingSheets] = useState([]);
  const [refereeSearch, setRefereeSearch] = useState("");
  const [refereeStatusFilter, setRefereeStatusFilter] = useState("all");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(getDefaultCompetitionId(league));
  const [matchSearch, setMatchSearch] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState("scheduled");
  const [assignmentCoverageFilter, setAssignmentCoverageFilter] = useState("missing_central");
  const [assignmentFeedback, setAssignmentFeedback] = useState({});
  const [activeRefereeTask, setActiveRefereeTask] = useState("assign");
  const competitions = useMemo(() => [...(league.competitions || [])].sort((a, b) => a.name.localeCompare(b.name)), [league.competitions]);
  const selectedCompetition = getCompetition(league, selectedCompetitionId);
  const competitionLeague = useMemo(
    () => scopeLeagueToCompetition(league, selectedCompetitionId || getDefaultCompetitionId(league)),
    [league, selectedCompetitionId]
  );
  const activeReferees = useMemo(
    () => referees.filter((referee) => referee.status === "active"),
    [referees]
  );
  const filteredReferees = useMemo(() => {
    const query = normalizeAdminSearchTerm(refereeSearch);
    return referees.filter((referee) => {
      if (refereeStatusFilter !== "all" && referee.status !== refereeStatusFilter) return false;
      if (!query) return true;
      return normalizeAdminSearchTerm(`${referee.name} ${referee.email} ${referee.phone || ""} ${referee.municipality}`).includes(query);
    });
  }, [refereeSearch, refereeStatusFilter, referees]);
  const filteredMatches = useMemo(() => {
    const query = normalizeAdminSearchTerm(matchSearch);
    return [...competitionLeague.matches]
      .filter((match) => {
        if (matchStatusFilter === "scheduled" && match.status !== "scheduled") return false;
        if (matchStatusFilter === "finished" && match.status !== "finished" && match.status !== "walkover") return false;
        if (assignmentCoverageFilter === "missing_central" && match.centralRefereeUserId) return false;
        if (assignmentCoverageFilter === "incomplete" && isMatchRefereeAssignmentComplete(match)) return false;
        if (!query) return true;
        return normalizeAdminSearchTerm(`${getMatchAdminLabel(league, match)} ${match.venue || ""} ${match.date || ""}`).includes(query);
      })
      .sort((a, b) => (
        Number(a.round || 0) - Number(b.round || 0) ||
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.time || "").localeCompare(String(b.time || ""))
      ));
  }, [assignmentCoverageFilter, competitionLeague.matches, league, matchSearch, matchStatusFilter]);
  const assignmentPendingCount = useMemo(
    () => competitionLeague.matches.filter((match) => match.status === "scheduled" && !match.centralRefereeUserId).length,
    [competitionLeague.matches]
  );
  const assignmentIncompleteCount = useMemo(
    () => competitionLeague.matches.filter((match) => match.status === "scheduled" && !isMatchRefereeAssignmentComplete(match)).length,
    [competitionLeague.matches]
  );
  const matchRounds = useMemo(() => {
    const groups = new Map();
    for (const match of filteredMatches) {
      const key = (match.stage || "regular") === "playoff"
        ? `playoff-${match.playoffRound || "liguilla"}`
        : `round-${match.round || "sin-jornada"}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          title: (match.stage || "regular") === "playoff" ? (match.playoffRound || "Liguilla") : `Jornada ${match.round || "-"}`,
          matches: []
        });
      }
      groups.get(key).matches.push(match);
    }
    return [...groups.values()];
  }, [filteredMatches]);

  async function reloadReferees() {
    setLoading(true);
    try {
      const [nextReferees, nextSheets] = await Promise.all([
        fetchReferees(authToken, league.city),
        fetchRefereeMatchSheets(authToken, { leagueId: league.id, status: "pending_review" })
      ]);
      setReferees(nextReferees);
      setPendingSheets(nextSheets);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "No se pudieron cargar los arbitros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadReferees();
  }, [authToken, league.city]);

  useEffect(() => {
    if (pendingSheets.length) setActiveRefereeTask("review");
  }, [pendingSheets.length]);

  useEffect(() => {
    const fallbackId = getDefaultCompetitionId(league);
    if (!league.competitions?.some((competition) => competition.id === selectedCompetitionId)) {
      setSelectedCompetitionId(fallbackId);
    }
  }, [league, selectedCompetitionId]);

  async function reviewSheet(sheet, action, note = "") {
    const confirmed = window.confirm(action === "approve"
      ? "¿Aprobar esta acta y aplicar marcador, goles y tarjetas al partido oficial?"
      : "¿Rechazar esta acta para que el arbitro pueda corregirla?");
    if (!confirmed) return;
    const actionKey = `${action}-sheet-${sheet.id}`;
    setBusyAction(actionKey);
    try {
      const response = await reviewRefereeMatchSheet(authToken, sheet.id, { action, reviewNote: note });
      setPendingSheets(response.sheets || []);
      if (response.store) applyApiStore?.(response.store);
      setNotice(action === "approve" ? "Acta aprobada y aplicada al partido oficial." : "Acta rechazada. El arbitro podra enviarla nuevamente.");
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo revisar el acta.");
    } finally {
      setBusyAction("");
    }
  }

  async function submitReferee(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = getFormPayload(form);
    if (!window.confirm("¿Crear este arbitro y generar su invitacion de activacion?")) return;
    try {
      setBusyAction("create-referee");
      const response = await createReferee(authToken, { ...payload, municipality: league.city });
      setReferees(response.referees || []);
      setLastInvitation(response.invitation || null);
      setNotice(`Invitacion creada para ${payload.name}. Copia el mensaje y envialo por WhatsApp.`);
      setError("");
      form.reset();
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo crear el arbitro.");
    } finally {
      setBusyAction("");
    }
  }

  async function changeRefereeStatus(referee, status) {
    const actionKey = `${status}-${referee.userId}`;
    setBusyAction(actionKey);
    try {
      const nextReferees = await updateReferee(authToken, referee.userId, { status });
      setReferees(nextReferees);
      setNotice(status === "active"
        ? `${referee.name} activado correctamente.`
        : status === "suspended"
        ? `${referee.name} suspendido. No podra iniciar sesion.`
        : `${referee.name} desactivado. No podra iniciar sesion.`);
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el arbitro.");
    } finally {
      setBusyAction("");
    }
  }

  async function regenerateRefereeInvitation(referee) {
    const actionKey = `invite-${referee.userId}`;
    setBusyAction(actionKey);
    try {
      const response = await resendRefereeInvitation(authToken, referee.userId);
      setReferees(response.referees || []);
      setLastInvitation(response.invitation || null);
      setNotice("Invitacion regenerada. Copia el nuevo mensaje para enviarlo.");
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo regenerar la invitacion.");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteRefereeUser(referee) {
    const typedEmail = window.prompt(
      `Eliminar definitivamente al arbitro ${referee.name}.\n\n` +
      `Esta accion borra la cuenta ${referee.email}, elimina su perfil de arbitro y quita sus asignaciones en partidos. No borra partidos ni actas ya capturadas.\n\n` +
      "Para confirmar, escribe el correo completo del arbitro:"
    );
    if (typedEmail === null) return;
    if (typedEmail.trim().toLowerCase() !== String(referee.email || "").toLowerCase()) {
      setNotice("");
      setError("No se elimino el arbitro. El correo escrito no coincide.");
      return;
    }

    const actionKey = `delete-${referee.userId}`;
    setBusyAction(actionKey);
    try {
      const response = await deleteReferee(authToken, referee.userId);
      setReferees(response.referees || []);
      setNotice(response.userDeleted ? "Arbitro eliminado definitivamente." : "Arbitro eliminado.");
      setError("");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo eliminar definitivamente el arbitro.");
    } finally {
      setBusyAction("");
    }
  }

  async function saveMatchReferees(event, match) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    const selectedReferees = [
      payload.centralRefereeUserId,
      payload.assistantReferee1UserId,
      payload.assistantReferee2UserId,
      payload.fourthRefereeUserId
    ].filter(Boolean);
    if (new Set(selectedReferees).size !== selectedReferees.length) {
      setNotice("");
      setError("Un arbitro no puede ocupar dos posiciones en el mismo partido.");
      return;
    }
    const actionKey = `match-referees-${match.id}`;
    setBusyAction(actionKey);
    setAssignmentFeedback((current) => ({ ...current, [match.id]: null }));
    try {
      const apiStore = await updateMatchReferees(authToken, match.id, payload);
      applyApiStore?.(apiStore);
      const successMessage = `Designacion guardada correctamente para ${getMatchAdminLabel(league, match)}.`;
      setAssignmentFeedback((current) => ({
        ...current,
        [match.id]: { type: "ok", message: successMessage }
      }));
      setNotice(successMessage);
      setError("");
    } catch (saveError) {
      const errorMessage = saveError.message || "No se pudo guardar la designacion arbitral.";
      setAssignmentFeedback((current) => ({
        ...current,
        [match.id]: { type: "error", message: errorMessage }
      }));
      setNotice("");
      setError(errorMessage);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Arbitraje" title="Arbitros e invitaciones" />
      <p className="helper-text">
        Crea arbitros por municipio, envia su enlace de activacion y asigna central o auxiliares a los partidos. El panel de arbitro vive separado en /arbitro.
      </p>
      <div className="module-guide">
        <span>1. Crea o activa arbitro</span>
        <span>2. Designa partidos pendientes</span>
        <span>3. Revisa actas enviadas</span>
      </div>
      {notice && <p className="auth-ok">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}

      <div className="referee-command-center">
        <button className={activeRefereeTask === "review" ? "active" : ""} type="button" onClick={() => setActiveRefereeTask("review")}>
          <span>Paso 1</span>
          <strong>Revisar actas</strong>
          <small>{pendingSheets.length} pendiente(s)</small>
        </button>
        <button className={activeRefereeTask === "invite" ? "active" : ""} type="button" onClick={() => setActiveRefereeTask("invite")}>
          <span>Paso 2</span>
          <strong>Crear / invitar</strong>
          <small>{referees.filter((referee) => referee.status === "pending_activation").length} por activar</small>
        </button>
        <button className={activeRefereeTask === "assign" ? "active" : ""} type="button" onClick={() => setActiveRefereeTask("assign")}>
          <span>Paso 3</span>
          <strong>Designar partidos</strong>
          <small>{filteredMatches.length} partido(s)</small>
        </button>
        <button className={activeRefereeTask === "manage" ? "active" : ""} type="button" onClick={() => setActiveRefereeTask("manage")}>
          <span>Control</span>
          <strong>Administrar arbitros</strong>
          <small>{activeReferees.length} activo(s)</small>
        </button>
      </div>

      {activeRefereeTask === "review" && (
        <div className="referee-task-panel">
          <div className="referee-task-head">
            <span>Primero atiende lo urgente</span>
            <h3>Actas enviadas por arbitros</h3>
            <p>Aprueba para aplicar marcador, goles y tarjetas al partido oficial. Rechaza si el arbitro debe corregir el acta.</p>
          </div>
          <RefereeSheetReviewPanel
            busyAction={busyAction}
            league={league}
            onReview={reviewSheet}
            sheets={pendingSheets}
          />
        </div>
      )}

      {activeRefereeTask === "invite" && (
        <div className="referee-task-panel">
          <div className="referee-task-head">
            <span>Alta de usuario</span>
            <h3>Crear arbitro y generar invitacion</h3>
            <p>Captura sus datos, LIGATEC genera el enlace de activacion y el mensaje listo para WhatsApp.</p>
          </div>
          <form className="delegate-create-form referee-create-card" onSubmit={submitReferee}>
            <label>Municipio
              <input name="municipality" value={league.city || ""} readOnly />
            </label>
            <label>Nombre del arbitro<input name="name" required placeholder="Nombre completo" /></label>
            <label>Telefono<input name="phone" required inputMode="tel" placeholder="354..." /></label>
            <label>Correo<input name="email" required type="email" placeholder="arbitro@correo.com" /></label>
            <button className="primary" type="submit" disabled={busyAction === "create-referee"}>
              {busyAction === "create-referee" ? "Creando invitacion..." : "Crear invitacion"}
            </button>
          </form>

          {lastInvitation && (
            <div className="delegate-invitation-box">
              <strong>Mensaje listo para WhatsApp</strong>
              <textarea readOnly value={lastInvitation.whatsappMessage || ""} />
              <div className="inline-actions">
                <button type="button" onClick={() => navigator.clipboard?.writeText(lastInvitation.whatsappMessage || "")}>Copiar mensaje</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(lastInvitation.whatsappMessage || "")}`} rel="noreferrer" target="_blank">Abrir WhatsApp</a>
              </div>
              <small>Expira: {lastInvitation.expiresAt ? new Date(lastInvitation.expiresAt).toLocaleString("es-MX") : "segun configuracion"}</small>
            </div>
          )}
        </div>
      )}

      {activeRefereeTask === "manage" && (
        <div className="referee-task-panel">
          <div className="referee-task-head">
            <span>Control de accesos</span>
            <h3>Administrar arbitros registrados</h3>
            <p>Busca al arbitro, regenera invitaciones o suspende acceso sin afectar partidos ya capturados.</p>
          </div>
          <div className="delegate-filter-bar referee-filter-bar referee-filter-bar-list">
            <label>Buscar arbitro
              <input
                type="search"
                value={refereeSearch}
                onChange={(event) => setRefereeSearch(event.target.value)}
                placeholder="Nombre, correo, telefono"
              />
            </label>
            <label>Estado
              <select value={refereeStatusFilter} onChange={(event) => setRefereeStatusFilter(event.target.value)}>
                <option value="all">Todos</option>
                <option value="pending_activation">Pendiente</option>
                <option value="active">Activo</option>
                <option value="disabled">Desactivado</option>
                <option value="suspended">Suspendido</option>
              </select>
            </label>
            <button type="button" onClick={() => {
              setRefereeSearch("");
              setRefereeStatusFilter("all");
            }}>
              Limpiar filtros
            </button>
          </div>
          <div className="delegate-summary-strip">
            <span><strong>{referees.length}</strong> arbitros</span>
            <span><strong>{activeReferees.length}</strong> activos</span>
            <span><strong>{referees.filter((referee) => referee.status === "pending_activation").length}</strong> pendientes</span>
          </div>
          <div className="delegate-list compact referee-compact-list">
            {loading ? <p className="empty">Cargando arbitros...</p> : filteredReferees.map((referee) => {
              const isActivating = busyAction === `active-${referee.userId}`;
              const isDisabling = busyAction === `disabled-${referee.userId}`;
              const isSuspending = busyAction === `suspended-${referee.userId}`;
              const isInviting = busyAction === `invite-${referee.userId}`;
              const isDeleting = busyAction === `delete-${referee.userId}`;
              const isBusyReferee = isActivating || isDisabling || isSuspending || isInviting || isDeleting;
              return (
                <details className="delegate-card compact delegate-user-card referee-user-card" key={referee.userId}>
                  <summary>
                    <span>
                      <strong>{referee.name}</strong>
                      <small>{referee.municipality} | {getRefereeStatusLabel(referee.status)}</small>
                    </span>
                    <b>{referee.status === "active" ? "Activo" : "Sin acceso"}</b>
                  </summary>
                  <span>{referee.email}</span>
                  {referee.phone && <span>{referee.phone}</span>}
                  <div className="inline-actions delegate-action-grid">
                    <button type="button" disabled={referee.status === "active" || referee.status === "pending_activation" || isBusyReferee} onClick={() => changeRefereeStatus(referee, "active")}>
                      {isActivating ? "Activando..." : "Activar"}
                    </button>
                    <button type="button" disabled={isBusyReferee} onClick={() => regenerateRefereeInvitation(referee)}>
                      {isInviting ? "Generando..." : referee.status === "pending_activation" ? "Reenviar invitacion" : "Regenerar invitacion"}
                    </button>
                    <button className="danger" type="button" disabled={referee.status === "disabled" || isBusyReferee} onClick={() => changeRefereeStatus(referee, "disabled")}>
                      {isDisabling ? "Desactivando..." : "Desactivar"}
                    </button>
                    <button className="danger" type="button" disabled={referee.status === "suspended" || isBusyReferee} onClick={() => changeRefereeStatus(referee, "suspended")}>
                      {isSuspending ? "Suspendiendo..." : "Suspender"}
                    </button>
                    <button className="danger ghost-danger" type="button" disabled={isBusyReferee} onClick={() => deleteRefereeUser(referee)}>
                      {isDeleting ? "Eliminando..." : "Eliminar definitivo"}
                    </button>
                  </div>
                </details>
              );
            })}
            {!loading && !filteredReferees.length && <p className="empty">No hay arbitros que coincidan con los filtros.</p>}
          </div>
        </div>
      )}

      {activeRefereeTask === "assign" && (
        <div className="referee-task-panel">
          <div className="referee-task-head">
            <span>Programacion arbitral</span>
            <h3>Designar arbitros por partido</h3>
            <p>Por defecto solo veras partidos sin arbitro central. Cambia a incompletos si tambien quieres revisar auxiliares.</p>
          </div>
          <div className="delegate-filter-bar referee-filter-bar referee-filter-bar-matches">
            <label>Torneo / categoria
              <select value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)}>
                {competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>{competition.name}</option>
                ))}
              </select>
            </label>
            <label>Estado partido
              <select value={matchStatusFilter} onChange={(event) => setMatchStatusFilter(event.target.value)}>
                <option value="scheduled">Programados</option>
                <option value="finished">Capturados</option>
                <option value="all">Todos</option>
              </select>
            </label>
            <label>Designacion
              <select value={assignmentCoverageFilter} onChange={(event) => setAssignmentCoverageFilter(event.target.value)}>
                <option value="missing_central">Sin central</option>
                <option value="incomplete">Incompletos</option>
                <option value="all">Todos</option>
              </select>
            </label>
            <label>Buscar partido
              <input
                type="search"
                value={matchSearch}
                onChange={(event) => setMatchSearch(event.target.value)}
                placeholder="Equipo, cancha o fecha"
              />
            </label>
          </div>
          <div className="delegate-summary-strip">
            <span><strong>{activeReferees.length}</strong> arbitros activos</span>
            <span><strong>{assignmentPendingCount}</strong> sin central</span>
            <span><strong>{assignmentIncompleteCount}</strong> incompletos</span>
            <span><strong>{matchRounds.length}</strong> grupos</span>
          </div>
          <div className="delegate-group-list referee-match-groups">
            {matchRounds.map((group) => (
              <details className="delegate-compact-group" key={group.id} open={Boolean(matchSearch) || matchStatusFilter !== "scheduled"}>
                <summary>
                  <strong>{group.title}</strong>
                  <span>{group.matches.length} partido(s)</span>
                </summary>
                <div className="delegate-list compact">
                  {group.matches.map((match) => {
                    const feedback = assignmentFeedback[match.id];
                    return (
                      <form className="delegate-card compact referee-match-card" key={match.id} onSubmit={(event) => saveMatchReferees(event, match)}>
                        <div className="delegate-card-head">
                          <strong>{getMatchAdminLabel(league, match)}</strong>
                          <small>{formatDate(match.date)} | {match.time || "POR DEFINIR"} | {match.venue || "CANCHA POR DEFINIR"}</small>
                        </div>
                        <div className="referee-assignment-form">
                          <RefereeSelect label="Central" name="centralRefereeUserId" referees={activeReferees} defaultValue={match.centralRefereeUserId || ""} />
                          <RefereeSelect label="Auxiliar 1" name="assistantReferee1UserId" referees={activeReferees} defaultValue={match.assistantReferee1UserId || ""} />
                          <RefereeSelect label="Auxiliar 2" name="assistantReferee2UserId" referees={activeReferees} defaultValue={match.assistantReferee2UserId || ""} />
                          <RefereeSelect label="Cuarto arbitro" name="fourthRefereeUserId" referees={activeReferees} defaultValue={match.fourthRefereeUserId || ""} />
                        </div>
                        <button className="primary" type="submit" disabled={busyAction === `match-referees-${match.id}`}>
                          {busyAction === `match-referees-${match.id}` ? "Guardando..." : "Guardar designacion"}
                        </button>
                        {feedback?.message && (
                          <p className={feedback.type === "error" ? "auth-error inline-feedback" : "auth-ok inline-feedback"}>
                            {feedback.message}
                          </p>
                        )}
                      </form>
                    );
                  })}
                </div>
              </details>
            ))}
            {!competitionLeague.matches.length && <p className="empty">Aun no hay partidos programados en esta categoria.</p>}
            {competitionLeague.matches.length > 0 && !filteredMatches.length && <p className="empty">No hay partidos que coincidan con los filtros.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function RefereeSelect({ defaultValue = "", label, name, referees }) {
  return (
    <label>{label}
      <select name={name} defaultValue={defaultValue}>
        <option value="">Sin asignar</option>
        {referees.map((referee) => (
          <option key={referee.userId} value={referee.userId}>{referee.name}</option>
        ))}
      </select>
    </label>
  );
}

function RefereeSheetReviewPanel({ busyAction, league, onReview, sheets }) {
  const [reviewNotes, setReviewNotes] = useState({});

  function updateReviewNote(sheetId, value) {
    setReviewNotes((current) => ({ ...current, [sheetId]: value }));
  }

  return (
    <section className="referee-review-panel">
      <div className="referee-review-head">
        <div>
          <span className="eyebrow">Revision de actas</span>
          <h3>Actas arbitrales pendientes</h3>
        </div>
        <strong>{sheets.length} pendiente(s)</strong>
      </div>
      {!sheets.length ? (
        <p className="empty">No hay actas arbitrales pendientes de revision.</p>
      ) : (
        <div className="referee-review-list">
          {sheets.map((sheet) => {
            const match = league.matches.find((item) => item.id === sheet.matchId);
            const homeTeam = getTeam(league, match?.homeTeamId);
            const awayTeam = getTeam(league, match?.awayTeamId);
            const payload = sheet.payload || {};
            const events = payload.events || [];
            const isApproving = busyAction === `approve-sheet-${sheet.id}`;
            const isRejecting = busyAction === `reject-sheet-${sheet.id}`;
            return (
              <article className="referee-review-card" key={sheet.id}>
                <div>
                  <strong>{homeTeam?.name || "LOCAL"} vs {awayTeam?.name || "VISITANTE"}</strong>
                  <small>
                    {match ? `Jornada ${match.round || "-"} | ${formatDate(match.date)} | ${match.venue || "CANCHA POR DEFINIR"}` : "Partido no encontrado"}
                  </small>
                  <small>Arbitro: {sheet.submittedByName || sheet.submittedByEmail || "Sin nombre"} | Enviada: {sheet.submittedAt ? new Date(sheet.submittedAt).toLocaleString("es-MX") : "-"}</small>
                </div>
                <div className="referee-review-summary">
                  <span><strong>{payload.homeGoals ?? 0}-{payload.awayGoals ?? 0}</strong> marcador</span>
                  <span>{events.filter((event) => event.type === "goal" || event.type === "own_goal").length} gol(es)</span>
                  <span>{events.filter((event) => event.type === "yellow").length} amarilla(s)</span>
                  <span>{events.filter((event) => event.type === "red").length} roja(s)</span>
                </div>
                {payload.observations && <p>{payload.observations}</p>}
                <details className="referee-review-events">
                  <summary>Ver eventos capturados ({events.length})</summary>
                  <div>
                    {events.map((event, index) => {
                      const player = getPlayer(league, event.playerId);
                      const team = getTeam(league, event.teamId);
                      return (
                        <span key={`${sheet.id}-${index}`}>
                          {getMatchEventLabel(event.type)} | {player?.name || "Jugador"} | {team?.name || "Equipo"} {event.minute !== "" && event.minute !== undefined ? `| Min ${event.minute}` : ""}
                        </span>
                      );
                    })}
                    {!events.length && <span>Sin eventos capturados.</span>}
                  </div>
                </details>
                <label className="referee-review-note">
                  Nota para el arbitro / revision
                  <textarea
                    value={reviewNotes[sheet.id] ?? sheet.reviewNote ?? ""}
                    onChange={(event) => updateReviewNote(sheet.id, event.target.value)}
                    placeholder="Opcional al aprobar. Recomendado si se rechaza para indicar que debe corregir."
                    rows={2}
                  />
                </label>
                <div className="inline-actions">
                  <button className="primary" type="button" disabled={isApproving || isRejecting} onClick={() => onReview(sheet, "approve", reviewNotes[sheet.id] || "")}>
                    {isApproving ? "Aprobando..." : "Aprobar y aplicar"}
                  </button>
                  <button className="danger ghost-danger" type="button" disabled={isApproving || isRejecting} onClick={() => onReview(sheet, "reject", reviewNotes[sheet.id] || "")}>
                    {isRejecting ? "Rechazando..." : "Rechazar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getMatchAdminLabel(league, match) {
  const homeTeam = getTeam(league, match.homeTeamId)?.name || "LOCAL";
  const awayTeam = getTeam(league, match.awayTeamId)?.name || "VISITANTE";
  return `${homeTeam} vs ${awayTeam}`;
}

function isMatchRefereeAssignmentComplete(match) {
  return Boolean(
    match.centralRefereeUserId &&
    match.assistantReferee1UserId &&
    match.assistantReferee2UserId
  );
}

function groupDelegateItemsByCompetition(items, league, getCompetitionId) {
  const fallbackCompetition = getDefaultCompetitionId(league);
  const groups = new Map();
  for (const item of items) {
    const competitionId = getCompetitionId(item) || fallbackCompetition;
    const competition = getCompetition(league, competitionId);
    const key = competitionId || "sin-categoria";
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: competition?.name || "Sin categoria",
        items: []
      });
    }
    groups.get(key).items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function AffiliationsPanel({ league, onAddTeamAffiliation, onDeleteTeamAffiliation, onMergeDuplicatePlayer, onUpdateTeamAffiliationPlayerNumber }) {
  const teams = useMemo(() => [...league.teams].sort((a, b) => a.name.localeCompare(b.name)), [league.teams]);
  const players = useMemo(() => [...league.players].sort((a, b) => a.name.localeCompare(b.name)), [league.players]);
  const competitions = useMemo(() => [...(league.competitions || [])].sort((a, b) => a.name.localeCompare(b.name)), [league.competitions]);
  const [sourceCompetitionId, setSourceCompetitionId] = useState(competitions[0]?.id || "");
  const targetCompetitionOptions = useMemo(
    () => competitions.filter((competition) => competition.id !== sourceCompetitionId),
    [competitions, sourceCompetitionId]
  );
  const [targetCompetitionId, setTargetCompetitionId] = useState(targetCompetitionOptions[0]?.id || "");
  const sourceTeams = useMemo(
    () => teams.filter((team) => (team.competitionId || getDefaultCompetitionId(league)) === sourceCompetitionId),
    [league, sourceCompetitionId, teams]
  );
  const targetTeams = useMemo(
    () => teams.filter((team) => (team.competitionId || getDefaultCompetitionId(league)) === targetCompetitionId),
    [league, targetCompetitionId, teams]
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!competitions.length) {
      setSourceCompetitionId("");
      return;
    }
    if (!competitions.some((competition) => competition.id === sourceCompetitionId)) {
      setSourceCompetitionId(competitions[0].id);
    }
  }, [competitions, sourceCompetitionId]);

  useEffect(() => {
    if (!targetCompetitionOptions.length) {
      setTargetCompetitionId("");
      return;
    }
    if (!targetCompetitionOptions.some((competition) => competition.id === targetCompetitionId)) {
      setTargetCompetitionId(targetCompetitionOptions[0].id);
    }
  }, [targetCompetitionId, targetCompetitionOptions]);

  function submitAffiliation(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (payload.sourceTeamId === payload.targetTeamId) {
      setNotice("El equipo origen y receptor deben ser distintos.");
      return;
    }
    const source = getTeam(league, payload.sourceTeamId);
    const target = getTeam(league, payload.targetTeamId);
    if (!window.confirm(`¿Afiliar la plantilla de ${source?.name || "origen"} con ${target?.name || "receptor"}?`)) return;
    onAddTeamAffiliation(payload);
    setNotice("Afiliacion guardada. La plantilla origen ya puede capturarse en actas del equipo receptor.");
    event.currentTarget.reset();
  }

  function submitMerge(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (payload.targetPlayerId === payload.duplicatePlayerId) {
      setNotice("El jugador principal y el duplicado deben ser distintos.");
      return;
    }
    const target = getPlayer(league, payload.targetPlayerId);
    const duplicate = getPlayer(league, payload.duplicatePlayerId);
    if (!target || !duplicate) return;
    const targetTeam = getTeam(league, target.teamId);
    const duplicateTeam = getTeam(league, duplicate.teamId);
    const hasAffiliation = (league.teamAffiliations || []).some((affiliation) => (
      affiliation.sourceTeamId === target.teamId && affiliation.targetTeamId === duplicate.teamId
    ));
    const affiliationWarning = hasAffiliation ? "" : "\n\nAviso: no encontre una afiliacion del equipo principal hacia el equipo del duplicado. Conviene crearla antes para conservar numero alterno y elegibilidad.";
    if (!window.confirm(`¿Fusionar el duplicado ${duplicate.name} (${duplicateTeam?.name || "sin equipo"}) dentro de ${target.name} (${targetTeam?.name || "sin equipo"})?\n\nSe moveran actas, goles, tarjetas, sanciones y movimientos manuales al jugador principal.${affiliationWarning}`)) return;
    onMergeDuplicatePlayer(payload);
    setNotice("Jugador duplicado fusionado. Revisa estadisticas y actas del jugador principal.");
    event.currentTarget.reset();
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Afiliaciones" title="Equipos afiliados" />
      <p className="helper-text">
        Afiliar no duplica jugadores. La plantilla del equipo origen queda disponible en el equipo receptor dentro de esta misma liga y temporada.
        Los goles se asignan al equipo del evento; las amarillas se acumulan para el jugador.
      </p>
      {notice && <p className="auth-ok">{notice}</p>}

      <form className="affiliation-form" onSubmit={submitAffiliation}>
        <label>Categoria origen
          <select value={sourceCompetitionId} onChange={(event) => setSourceCompetitionId(event.target.value)} required>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name}</option>
            ))}
          </select>
        </label>
        <label>Equipo origen
          <select name="sourceTeamId" required disabled={!sourceTeams.length}>
            {sourceTeams.map((team) => (
              <option key={team.id} value={team.id}>{team.name} | {getCompetition(league, team.competitionId)?.name || "Torneo"}</option>
            ))}
          </select>
        </label>
        <label>Categoria receptor
          <select value={targetCompetitionId} onChange={(event) => setTargetCompetitionId(event.target.value)} required disabled={targetCompetitionOptions.length <= 1}>
            {targetCompetitionOptions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name}</option>
            ))}
          </select>
        </label>
        <label>Equipo receptor
          <select name="targetTeamId" required disabled={!targetTeams.length}>
            {targetTeams.map((team) => (
              <option key={team.id} value={team.id}>{team.name} | {getCompetition(league, team.competitionId)?.name || "Torneo"}</option>
            ))}
          </select>
        </label>
        <label className="wide-field">Notas
          <textarea name="notes" placeholder="Ej. Plantilla de segunda afiliada a primera para este torneo." />
        </label>
        <button className="primary" type="submit" disabled={teams.length < 2 || !sourceTeams.length || !targetTeams.length}>Guardar afiliacion</button>
      </form>

      <div className="discipline-admin-list">
        <h3>Afiliaciones activas</h3>
        {(league.teamAffiliations || []).map((affiliation) => {
          const source = getTeam(league, affiliation.sourceTeamId);
          const target = getTeam(league, affiliation.targetTeamId);
          const sourcePlayers = league.players.filter((player) => player.teamId === affiliation.sourceTeamId);
          return (
            <article className="discipline-admin-card affiliation-card" key={affiliation.id}>
              <div>
                <strong>{source?.name || "Equipo origen"}{" -> "}{target?.name || "Equipo receptor"}</strong>
                <span>{getCompetition(league, source?.competitionId)?.name || "Categoria origen"} a {getCompetition(league, target?.competitionId)?.name || "categoria receptor"}</span>
                {affiliation.notes && <small>{affiliation.notes}</small>}
              </div>
              <div>
                <small>Plantilla</small>
                <span>{sourcePlayers.length} jugador(es)</span>
              </div>
              <div>
                <small>Estado</small>
                <span>{affiliation.status === "active" ? "ACTIVA" : affiliation.status}</span>
              </div>
              <button className="danger" type="button" onClick={() => {
                if (!window.confirm("¿Eliminar esta afiliacion? Los jugadores dejaran de estar disponibles en el equipo receptor.")) return;
                onDeleteTeamAffiliation(affiliation.id);
                setNotice("Afiliacion eliminada.");
              }}>Quitar</button>
              <form className="affiliation-number-form" onSubmit={(event) => {
                event.preventDefault();
                onUpdateTeamAffiliationPlayerNumber(affiliation.id, getFormPayload(event.currentTarget));
                setNotice("Numero de afiliado actualizado.");
              }}>
                <label>Numero en {target?.name || "receptor"}
                  <select name="playerId" required>
                    {sourcePlayers.map((player) => (
                      <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}</option>
                    ))}
                  </select>
                </label>
                <input name="number" type="number" min="0" max="9999" placeholder="Numero" />
                <button type="submit" disabled={!sourcePlayers.length}>Guardar numero</button>
              </form>
            </article>
          );
        })}
        {!(league.teamAffiliations || []).length && <p className="empty">Aun no hay equipos afiliados.</p>}
      </div>

      <div className="discipline-admin-list">
        <h3>Fusionar jugador duplicado</h3>
        <form className="duplicate-merge-form" onSubmit={submitMerge}>
          <label>Jugador principal que se conserva
            <SearchablePlayerSelect league={league} name="targetPlayerId" players={players} placeholder="Buscar jugador principal..." />
          </label>
          <label>Registro duplicado que se elimina
            <SearchablePlayerSelect league={league} name="duplicatePlayerId" players={players} placeholder="Buscar registro duplicado..." />
          </label>
          <button className="primary" type="submit" disabled={players.length < 2}>Fusionar duplicado</button>
        </form>
        <p className="helper-text">Usa esta herramienta para casos como “CAPILLA JORGE” y “#3 CAPILLA JORGE”. El historial del duplicado se mueve al jugador principal.</p>
      </div>
    </section>
  );
}

function VenuesPanel({ league, onAddVenue, onDeleteVenue, onUpdateVenue }) {
  const [notice, setNotice] = useState("");
  const venues = getSortedVenues(league);

  function submitVenue(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (!window.confirm(`¿Agregar la cancha ${payload.name || ""} a ${league.name}?`)) return;
    onAddVenue(payload);
    setNotice("Cancha agregada correctamente.");
    event.currentTarget.reset();
  }

  function updateExistingVenue(event, venue) {
    event.preventDefault();
    if (!window.confirm(`¿Guardar cambios de la cancha ${venue.name}?`)) return;
    onUpdateVenue(venue.id, getFormPayload(event.currentTarget));
    setNotice("Cancha actualizada correctamente.");
  }

  function deleteExistingVenue(venue) {
    if (!window.confirm(`¿Eliminar la cancha ${venue.name}? Los partidos ya programados conservaran su cancha capturada.`)) return;
    onDeleteVenue(venue.id);
    setNotice("Cancha eliminada del catalogo correctamente.");
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Programacion" title="Canchas de la liga" />
      <p className="helper-text">Estas canchas pertenecen solo a {league.name}. Al programar o editar partidos podras elegirlas automaticamente.</p>
      {notice && <p className="auth-ok">{notice}</p>}

      <form className="venue-form" onSubmit={submitVenue}>
        <label>Nombre de cancha<input name="name" required placeholder="Ej. Cancha Municipal" /></label>
        <label>Direccion o referencia<input name="address" placeholder="Ej. Unidad deportiva norte" /></label>
        <label>Estado
          <select name="status" defaultValue="active">
            <option value="active">Activa</option>
            <option value="inactive">Inactiva</option>
          </select>
        </label>
        <label className="wide-field">Notas<textarea name="notes" placeholder="Horario permitido, referencia, observaciones." /></label>
        <button className="primary" type="submit">Agregar cancha</button>
      </form>

      <div className="venue-list">
        {venues.map((venue) => (
          <form className="venue-card" key={venue.id} onSubmit={(event) => updateExistingVenue(event, venue)}>
            <label>Cancha<input name="name" defaultValue={venue.name} required aria-label={`Cancha ${venue.name}`} /></label>
            <label>Direccion<input name="address" defaultValue={venue.address || ""} aria-label={`Direccion ${venue.name}`} /></label>
            <label>Estado
              <select name="status" defaultValue={venue.status || "active"} aria-label={`Estado ${venue.name}`}>
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </select>
            </label>
            <label className="wide-field">Notas<textarea name="notes" defaultValue={venue.notes || ""} aria-label={`Notas ${venue.name}`} /></label>
            <button className="primary" type="submit">Guardar</button>
            <button className="danger" type="button" onClick={() => deleteExistingVenue(venue)}>Eliminar</button>
          </form>
        ))}
        {!venues.length && <p className="empty">Aun no hay canchas registradas.</p>}
      </div>
    </section>
  );
}

function AnnouncementsPanel({ league, onAddAnnouncement, onDeleteAnnouncement, onUpdateAnnouncement }) {
  const [notice, setNotice] = useState("");
  const announcements = [...(league.announcements || [])].sort((a, b) => (
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  ));

  function submitAnnouncement(event) {
    event.preventDefault();
    if (!window.confirm("¿Publicar/guardar este aviso para la liga?")) return;
    onAddAnnouncement(getFormPayload(event.currentTarget));
    setNotice("Aviso guardado correctamente.");
    event.currentTarget.reset();
  }

  function updateExistingAnnouncement(event, announcementId) {
    event.preventDefault();
    if (!window.confirm("¿Guardar cambios de este aviso?")) return;
    onUpdateAnnouncement(announcementId, getFormPayload(event.currentTarget));
    setNotice("Aviso actualizado correctamente.");
  }

  function deleteExistingAnnouncement(announcement) {
    if (!window.confirm(`¿Seguro que quieres eliminar el aviso "${announcement.title}"?`)) return;
    onDeleteAnnouncement(announcement.id);
    setNotice("Aviso eliminado correctamente.");
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Comunicacion" title="Avisos publicos" />
      <p className="helper-text">Los avisos activos apareceran en la pagina publica. Si no hay avisos activos, esa seccion no se muestra.</p>
      <div className="module-guide">
        <span>1. Titulo corto</span>
        <span>2. Mensaje claro</span>
        <span>3. Publicado o archivado</span>
      </div>
      {notice && <p className="auth-ok">{notice}</p>}

      <form className="announcement-form" onSubmit={submitAnnouncement}>
        <label>Titulo<input name="title" required placeholder="Ej. Cambio de horario" /></label>
        <label>Fecha<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>Estado
          <select name="status" defaultValue="active">
            <option value="active">Publicado</option>
            <option value="archived">Archivado</option>
          </select>
        </label>
        <label className="wide-field">Aviso
          <textarea name="body" required placeholder="Escribe el aviso para equipos, jugadores o publico." />
        </label>
        <button className="primary" type="submit">Guardar aviso</button>
      </form>

      <div className="announcement-list">
        {announcements.map((announcement) => (
          <form
            className="announcement-card"
            key={announcement.id}
            onSubmit={(event) => updateExistingAnnouncement(event, announcement.id)}
          >
            <input name="title" defaultValue={announcement.title} required aria-label={`Titulo ${announcement.title}`} />
            <input name="date" type="date" defaultValue={announcement.date || ""} aria-label={`Fecha ${announcement.title}`} />
            <select name="status" defaultValue={announcement.status || "active"} aria-label={`Estado ${announcement.title}`}>
              <option value="active">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
            <textarea name="body" defaultValue={announcement.body} required aria-label={`Aviso ${announcement.title}`} />
            <button className="primary" type="submit">Guardar cambios</button>
            <button className="danger" type="button" onClick={() => deleteExistingAnnouncement(announcement)}>Eliminar</button>
          </form>
        ))}
        {!announcements.length && <p className="empty">Aun no hay avisos registrados.</p>}
      </div>
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
            if (!window.confirm(`¿Guardar cambios del torneo ${competition.name}?`)) return;
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

function CapturePanel({ allowedModes = null, authToken, league, onAddMatch, onAddPlayer, onAddTeam, onGenerateSchedule, onGeneratePlayoffBracket }) {
  const allowedModeSet = allowedModes ? new Set(allowedModes) : null;
  const [captureMode, setCaptureMode] = useState(allowedModes?.[0] || "team");
  const [matchStage, setMatchStage] = useState("regular");
  const [selectedPlayoffPhase, setSelectedPlayoffPhase] = useState(getPlayoffPhaseValueByTeams(league.rules?.playoffQualifiers ?? 8));
  const [captureNotice, setCaptureNotice] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [selectedPlayerTeamId, setSelectedPlayerTeamId] = useState("");
  const [playerPhotoResetKey, setPlayerPhotoResetKey] = useState(0);
  const modes = [
    { id: "team", label: "Equipo" },
    { id: "player", label: "Jugador" },
    { id: "match", label: "Partido" },
    { id: "schedule", label: "Calendario" },
    { id: "playoffs", label: "Liguilla" }
  ].filter((mode) => !allowedModeSet || allowedModeSet.has(mode.id));
  const defaultCompetitionId = getDefaultCompetitionId(league);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(defaultCompetitionId);
  const activeCompetitionLeague = scopeLeagueToCompetition(league, selectedCompetitionId);
  const playoffStandings = useMemo(
    () => calculateStandings(activeCompetitionLeague).filter((row) => row.team.status !== "withdrawn"),
    [activeCompetitionLeague]
  );
  const selectedPlayoffPhaseOption = PLAYOFF_PHASE_OPTIONS.find((phase) => phase.value === selectedPlayoffPhase) || PLAYOFF_PHASE_OPTIONS[2];
  const nextRound = Math.max(1, ...activeCompetitionLeague.matches.map((match) => Number(match.round || 1)));
  const nextScheduleRound = activeCompetitionLeague.matches.length
    ? Math.max(...activeCompetitionLeague.matches.map((match) => Number(match.round || 1))) + 1
    : 1;
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!league.competitions?.some((competition) => competition.id === selectedCompetitionId)) {
      setSelectedCompetitionId(defaultCompetitionId);
    }
  }, [defaultCompetitionId, league.competitions, selectedCompetitionId]);

  useEffect(() => {
    setSelectedPlayoffPhase(getPlayoffPhaseValueByTeams(league.rules?.playoffQualifiers ?? 8));
  }, [league.rules?.playoffQualifiers]);

  useEffect(() => {
    if (!activeCompetitionLeague.teams.length) {
      setSelectedPlayerTeamId("");
      return;
    }
    if (!activeCompetitionLeague.teams.some((team) => team.id === selectedPlayerTeamId)) {
      setSelectedPlayerTeamId(activeCompetitionLeague.teams[0].id);
    }
  }, [activeCompetitionLeague.teams, selectedPlayerTeamId]);

  useEffect(() => {
    if (modes.length && !modes.some((mode) => mode.id === captureMode)) {
      setCaptureMode(modes[0].id);
    }
  }, [captureMode, modes]);

  async function submitCaptureAction(event, action, confirmMessage, successMessage, options = {}) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (confirmMessage && !window.confirm(confirmMessage(payload))) return;
    const result = await action(payload);
    if (result === false) return;
    setCaptureNotice(successMessage(payload));
    if (options.reset !== false) event.currentTarget.reset();
  }

  async function submitPlayer(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setCaptureError("");
    setCaptureNotice("Subiendo foto y guardando jugador...");
    try {
      const payload = await getPlayerPayload(form, "", { authToken, leagueId: league.id, scope: "player-photos" });
      if (!window.confirm("¿Confirmas registrar este jugador en el equipo seleccionado?")) return;
      const result = onAddPlayer(payload);
      if (result === false) return;
      setCaptureNotice("Jugador registrado correctamente.");
      form.reset();
      setPlayerPhotoResetKey((value) => value + 1);
      if (form.elements.photoFile) form.elements.photoFile.value = "";
    } catch (error) {
      setCaptureNotice("");
      setCaptureError(error.message || "No se pudo cargar la imagen.");
    }
  }

  async function submitTeam(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setCaptureError("");
    setCaptureNotice("Subiendo escudo y guardando equipo...");
    try {
      const payload = await getTeamPayload(form, "", { authToken, leagueId: league.id, scope: "teams" });
      if (!window.confirm("¿Confirmas registrar este equipo en la categoria seleccionada?")) return;
      resetTeamForm(form);
      onAddTeam(payload);
      setCaptureNotice("Equipo registrado correctamente.");
    } catch (error) {
      setCaptureNotice("");
      setCaptureError(error.message || "No se pudo cargar la imagen.");
    }
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow={league.name} title="Captura operativa" />
      {captureNotice && <p className="auth-ok">{captureNotice}</p>}
      {captureError && <p className="auth-error">{captureError}</p>}
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
            <span><strong>{activeCompetitionLeague.teams.length}</strong> equipos categoria</span>
            <span><strong>{activeCompetitionLeague.players.length}</strong> jugadores categoria</span>
            <span><strong>{activeCompetitionLeague.matches.length}</strong> partidos del torneo actual</span>
          </div>
        </aside>

        <div className="capture-workspace">
          {captureMode === "team" && (
            <form
              className="capture-form"
              onSubmit={submitTeam}
            >
              <h3>Registrar equipo</h3>
              <label>Categoria
                <CompetitionSelect league={league} name="competitionId" value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)} />
              </label>
              <p className="helper-text">Sin limite de equipos. El equipo se guardara dentro de la categoria seleccionada.</p>
              <div className="capture-fields two-cols">
                <label>Nombre del equipo<input name="name" required placeholder="Ej. Deportivo Sur" /></label>
                <label>Entrenador<input name="coach" placeholder="Nombre del responsable" /></label>
                <label>Auxiliar<input name="assistantCoach" placeholder="Opcional" /></label>
                <label>Direccion / sede<input name="address" placeholder="Cancha, colonia o sede" /></label>
                <label>Color uniforme<input name="colors" type="color" defaultValue="#0f766e" /></label>
                <label>Escudo<input name="logoFile" type="file" accept={IMAGE_UPLOAD_ACCEPT} /></label>
              </div>
              <button className="primary" type="submit">Agregar equipo</button>
            </form>
          )}

          {captureMode === "player" && (
            <form
              className="capture-form"
              onSubmit={submitPlayer}
            >
              <h3>Registrar jugador</h3>
              <div className="capture-fields two-cols">
                <label>Categoria
                  <CompetitionSelect league={league} name="competitionId" value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)} />
                </label>
                <label>Equipo
                  <TeamSelect
                    league={activeCompetitionLeague}
                    name="teamId"
                    value={selectedPlayerTeamId}
                    onChange={(event) => setSelectedPlayerTeamId(event.target.value)}
                  />
                </label>
                <label>Nombre<input name="name" required pattern=".*\S+\s+\S+.*" placeholder="NOMBRE Y APELLIDOS" title="Registra nombre(s) y apellido(s)" /></label>
                <label>Numero<input name="number" type="number" min="0" max="9999" placeholder="10" /></label>
                <label>Posicion<PlayerPositionSelect name="position" /></label>
                <div className="wide-field">
                  <PlayerPhotoUploader key={playerPhotoResetKey} />
                </div>
              </div>
              <button className="primary" type="submit" disabled={!activeCompetitionLeague.teams.length}>Agregar jugador</button>
            </form>
          )}

          {captureMode === "match" && (
            <form
              className="capture-form"
              onSubmit={(event) => submitCaptureAction(
                event,
                onAddMatch,
                () => "¿Confirmas crear este partido con los equipos, fecha y cancha capturados?",
                () => "Partido creado correctamente."
              )}
            >
              <h3>Programar partido</h3>
              <div className="capture-fields three-cols">
                <label>Categoria<CompetitionSelect league={league} name="competitionId" value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)} /></label>
                <label>Tipo de partido
                  <select name="stage" value={matchStage} onChange={(event) => setMatchStage(event.target.value)}>
                    <option value="regular">Temporada regular</option>
                    <option value="playoff">Liguilla</option>
                  </select>
                </label>
                {matchStage === "regular" ? (
                  <label>Jornada<input name="round" type="number" min="1" defaultValue={nextRound} required /></label>
                ) : (
                  <input type="hidden" name="round" value="0" />
                )}
                <label>Fase liguilla
                  <select name="playoffRound" defaultValue={matchStage === "playoff" ? "Cuartos de final" : ""} required={matchStage === "playoff"}>
                    <option value="">{matchStage === "playoff" ? "Selecciona fase" : "No aplica"}</option>
                    {PLAYOFF_PHASE_OPTIONS.map((phase) => (
                      <option key={phase.value} value={phase.label}>{phase.label}</option>
                    ))}
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
                {matchStage === "playoff" && (
                  <p className="helper-text wide-field">La liguilla se programa manualmente y se muestra aparte de las jornadas regulares.</p>
                )}
                <label>Fecha<input name="date" type="date" required /></label>
                <label>Hora<input name="time" type="time" required /></label>
                <label>Cancha<VenueSelect league={league} required /></label>
                <label>Local<TeamSelect league={activeCompetitionLeague} name="homeTeamId" /></label>
                <label>Visitante<TeamSelect league={activeCompetitionLeague} name="awayTeamId" /></label>
                <label>Global local<input name="aggregateHome" type="number" min="0" placeholder="Opcional" /></label>
                <label>Global visitante<input name="aggregateAway" type="number" min="0" placeholder="Opcional" /></label>
              </div>
              <button className="primary" type="submit" disabled={activeCompetitionLeague.teams.length < 2}>Crear partido</button>
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
                setCaptureNotice(payload.roundTrip === "on"
                  ? "Calendario ida y vuelta generado correctamente."
                  : "Calendario generado correctamente.");
              }}
            >
              <h3>Generar calendario</h3>
              <p className="helper-text">Arma solo los cruces y jornadas. La hora, cancha y cualquier ajuste de fecha se edita despues en Listados &gt; Partidos.</p>
              <p className="helper-text">Puedes generar calendario para cualquier categoria con equipos activos.</p>
              <div className="capture-fields schedule-fields">
                <label>Categoria<CompetitionSelect league={league} name="competitionId" value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)} /></label>
                <label>Modo
                  <select name="mode" defaultValue="full">
                    <option value="full">Generar calendario completo</option>
                    <option value="late">Integrar equipos nuevos</option>
                  </select>
                </label>
                <label>Desde jornada<input name="startRound" type="number" min="1" defaultValue={nextScheduleRound} required /></label>
                <label>Fecha inicial<input name="startDate" type="date" defaultValue={today} required /></label>
                <label>Cancha base<VenueSelect league={league} /></label>
                <label>Dias entre jornadas<input name="intervalDays" type="number" min="1" defaultValue="7" required /></label>
                <label className="checkbox-field"><input name="randomize" type="checkbox" defaultChecked />Aleatorio</label>
                <label className="checkbox-field"><input name="roundTrip" type="checkbox" />Ida y vuelta</label>
                <label className="checkbox-field"><input name="replaceScheduled" type="checkbox" />Reemplazar programados</label>
              </div>
              <button className="primary" type="submit" disabled={activeCompetitionLeague.teams.length < 2}>Generar jornadas</button>
            </form>
          )}

          {captureMode === "playoffs" && (
            <form
              className="capture-form schedule-generator-form"
              onSubmit={(event) => {
                event.preventDefault();
                const payload = getFormPayload(event.currentTarget);
                const phase = PLAYOFF_PHASE_OPTIONS.find((item) => item.value === payload.phase) || PLAYOFF_PHASE_OPTIONS[2];
                if (playoffStandings.length < phase.teams) {
                  window.alert(`No hay suficientes equipos con tabla para ${phase.label}. Se requieren ${phase.teams} equipos.`);
                  return;
                }
                const message = `Se generara ${phase.label} con cruces por tabla: 1 vs ${phase.teams}, 2 vs ${phase.teams - 1}, etc. ¿Continuar?`;
                if (!window.confirm(message)) return;
                onGeneratePlayoffBracket(payload);
                setCaptureNotice(`${phase.label} generada correctamente.`);
              }}
            >
              <h3>Generar liguilla</h3>
              <p className="helper-text">Toma la tabla de posiciones del torneo actual y arma cruces automaticos por siembra. No modifica el calendario regular.</p>
              <div className="capture-fields schedule-fields">
                <label>Categoria<CompetitionSelect league={league} name="competitionId" value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)} /></label>
                <label>Iniciar desde
                  <select name="phase" value={selectedPlayoffPhase} onChange={(event) => setSelectedPlayoffPhase(event.target.value)}>
                    {PLAYOFF_PHASE_OPTIONS.map((phase) => (
                      <option key={phase.value} value={phase.value}>{phase.label} ({phase.teams} equipos)</option>
                    ))}
                  </select>
                </label>
                <label>Formato
                  <select name="legMode" defaultValue="single">
                    <option value="single">Juego unico</option>
                    <option value="two_legs">Ida y vuelta</option>
                  </select>
                </label>
                <label>Fecha inicial<input name="startDate" type="date" defaultValue={today} required /></label>
                <label>Cancha base<VenueSelect league={league} /></label>
                <label className="checkbox-field"><input name="replacePlayoffs" type="checkbox" />Reemplazar programados de esta fase</label>
              </div>
              <div className="playoff-seeding-preview">
                <strong>Clasificados por tabla</strong>
                {playoffStandings.slice(0, selectedPlayoffPhaseOption.teams).map((row, index) => (
                  <span key={row.team.id}>{index + 1}. {row.team.name} | {row.points} pts</span>
                ))}
                {playoffStandings.length > selectedPlayoffPhaseOption.teams && <span>+ {playoffStandings.length - selectedPlayoffPhaseOption.teams} equipo(s) mas</span>}
                {playoffStandings.length < selectedPlayoffPhaseOption.teams && <span>Faltan {selectedPlayoffPhaseOption.teams - playoffStandings.length} equipo(s) para {selectedPlayoffPhaseOption.label}</span>}
              </div>
              <button className="primary" type="submit" disabled={playoffStandings.length < selectedPlayoffPhaseOption.teams}>Generar liguilla</button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function RulesPanel({ league, onAddAppearanceAdjustment, onDeleteAppearanceAdjustment, onSaveRules }) {
  const rules = league.rules || {};
  const walkoverLabel = `${rules.forfeitGoalsFor ?? 3}-${rules.forfeitGoalsAgainst ?? 0}`;
  const playoffQualifiers = Number(rules.playoffQualifiers ?? 8);
  const minimumPlayoffAppearances = Number(rules.minimumPlayoffAppearances ?? 0);
  const playoffPhaseLabel = getPlayoffPhaseLabel(playoffQualifiers);
  const [rulesNotice, setRulesNotice] = useState("");

  return (
    <section className="panel">
      <SectionHeading eyebrow="Estatutos" title="Reglas deportivas de la liga" />
      {rulesNotice && <p className="auth-ok">{rulesNotice}</p>}
      <form
        className="rules-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!window.confirm("¿Guardar estas reglas deportivas para la liga?")) return;
          onSaveRules(getFormPayload(event.currentTarget));
          setRulesNotice("Reglas guardadas correctamente.");
        }}
      >
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
        <label>Acumulacion de amarillas
          <select name="disciplineScope" defaultValue={rules.disciplineScope || "competition"}>
            <option value="competition">Separada por categoria</option>
            <option value="league">Compartida en toda la liga</option>
          </select>
        </label>
        <label>Partidos por roja
          <input name="defaultRedSuspensionMatches" type="number" min="1" max="12" defaultValue={rules.defaultRedSuspensionMatches ?? 1} />
        </label>
        <label>Equipos a liguilla
          <input name="playoffQualifiers" type="number" min="0" max="64" defaultValue={playoffQualifiers} />
        </label>
        <label>Partidos minimos por jugador para liguilla
          <input name="minimumPlayoffAppearances" type="number" min="0" max="64" defaultValue={minimumPlayoffAppearances} />
        </label>
        <label className="wide-field">Notas del reglamento
          <textarea name="notes" defaultValue={rules.notes || ""} placeholder="Ej. Criterios de sancion, defaults, bajas o acuerdos de asamblea." />
        </label>
        <div className="rules-preview">
          <strong>Resumen operativo</strong>
          <span>Default: {walkoverLabel}, {rules.forfeitPoints ?? 3} puntos.</span>
          <span>Suspension: {rules.yellowSuspensionLimit ?? 3} amarillas o {rules.defaultRedSuspensionMatches ?? 1} partido(s) base por roja.</span>
          <span>Disciplina: {(rules.disciplineScope || "competition") === "league" ? "amarillas compartidas en toda la liga" : "amarillas separadas por categoria"}.</span>
          <span>Liguilla: {playoffQualifiers || 0} clasificado(s){playoffPhaseLabel ? ` | ${playoffPhaseLabel}` : ""}.</span>
          <span>Jugadores: {minimumPlayoffAppearances || 0} partido(s) minimo para poder disputar liguilla.</span>
        </div>
        <button className="primary" type="submit">Guardar reglas</button>
      </form>
      <AppearanceAdjustmentsPanel
        league={league}
        onAddAppearanceAdjustment={onAddAppearanceAdjustment}
        onDeleteAppearanceAdjustment={onDeleteAppearanceAdjustment}
      />
    </section>
  );
}

function AppearanceAdjustmentsPanel({ league, onAddAppearanceAdjustment, onDeleteAppearanceAdjustment }) {
  const players = useMemo(() => [...league.players].sort((a, b) => a.name.localeCompare(b.name)), [league.players]);
  const eligibilityByPlayerId = useMemo(() => calculatePlayerAppearanceEligibility(league), [league]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const history = useMemo(() => (league.appearanceAdjustments || [])
    .filter((adjustment) => {
      if (!query.trim()) return true;
      const player = getPlayer(league, adjustment.playerId);
      const team = player ? getTeam(league, player.teamId) : null;
      return normalizeAdminSearchTerm(`${player?.name || ""} ${team?.name || ""} ${adjustment.reason || ""}`)
        .includes(normalizeAdminSearchTerm(query));
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id).localeCompare(String(a.id))), [league, query]);

  function submitAdjustment(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    const player = getPlayer(league, payload.playerId);
    if (!player) {
      setNotice("Selecciona un jugador valido.");
      return;
    }
    if (!window.confirm(`¿Guardar ajuste de partidos jugados para ${player.name}?`)) return;
    onAddAppearanceAdjustment(payload);
    event.currentTarget.reset();
    setNotice("Ajuste de partidos jugados guardado.");
  }

  return (
    <div className="appearance-admin-panel">
      <div className="discipline-list-head">
        <div>
          <h3>Partidos jugados por jugador</h3>
          <p className="helper-text">Ajusta manualmente partidos jugados para elegibilidad de liguilla. El conteo real por convocatoria se conserva separado.</p>
        </div>
      </div>
      {notice && <p className="auth-ok">{notice}</p>}
      <div className="discipline-admin-grid">
        <form className="discipline-admin-form" onSubmit={submitAdjustment}>
          <h3>Ajuste manual</h3>
          <label>Jugador
            <SearchablePlayerSelect league={league} name="playerId" players={players} placeholder="Buscar jugador..." />
          </label>
          <label>Movimiento
            <select name="direction" defaultValue="add">
              <option value="add">Sumar partidos</option>
              <option value="subtract">Restar partidos</option>
            </select>
          </label>
          <label>Cantidad
            <input name="value" type="number" min="1" max="64" defaultValue="1" />
          </label>
          <label>Fecha
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="wide-field">Motivo
            <input name="reason" placeholder="Ej. correccion de acta, acuerdo de liga" />
          </label>
          <label className="wide-field">Notas
            <input name="notes" placeholder="Detalle interno opcional" />
          </label>
          <button className="primary" type="submit" disabled={!players.length}>Guardar ajuste</button>
        </form>

        <div className="discipline-admin-list compact">
          <div className="discipline-list-head">
            <div>
              <h3>Avance principal</h3>
              <p className="helper-text">Vista rapida de jugadores con regla de liguilla activa.</p>
            </div>
          </div>
          <div className="appearance-progress-list">
            {players.slice(0, 8).map((player) => {
              const eligibility = eligibilityByPlayerId.get(player.id);
              const team = getTeam(league, player.teamId);
              return (
                <article key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{team?.name || "Sin equipo"} | {eligibility?.recognizedAppearances || 0}/{eligibility?.required || 0} partido(s)</span>
                  </div>
                  <b className={eligibility?.eligible ? "ready" : "pending"}>{eligibility?.eligible ? "Disponible" : `Faltan ${eligibility?.remaining || 0}`}</b>
                </article>
              );
            })}
            {!players.length && <p className="empty">No hay jugadores registrados.</p>}
          </div>
        </div>
      </div>

      <div className="discipline-admin-list">
        <div className="discipline-list-head">
          <div>
            <h3>Historial de ajustes</h3>
            <span>{history.length} movimiento(s)</span>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jugador o motivo" />
        </div>
        {history.map((adjustment) => {
          const player = getPlayer(league, adjustment.playerId);
          const team = player ? getTeam(league, player.teamId) : null;
          return (
            <article className="discipline-admin-card" key={adjustment.id}>
              <div>
                <strong>{player?.name || "Jugador eliminado"}</strong>
                <span>{team?.name || "Sin equipo"} | {adjustment.date || "Sin fecha"} | {adjustment.value > 0 ? "+" : ""}{adjustment.value} partido(s)</span>
                <small>{adjustment.reason || "Ajuste manual"}</small>
              </div>
              <button
                className="danger"
                type="button"
                onClick={() => {
                  if (!window.confirm("¿Eliminar este ajuste manual de partidos jugados?")) return;
                  onDeleteAppearanceAdjustment(adjustment.id);
                  setNotice("Ajuste eliminado.");
                }}
              >
                Eliminar
              </button>
            </article>
          );
        })}
        {!history.length && <p className="empty">No hay ajustes manuales registrados.</p>}
      </div>
    </div>
  );
}

function ManagementBoard({
  allowedLists = null,
  authToken,
  canEditMatchResults = true,
  league,
  onDeleteMatch,
  onDeletePlayoffMatches,
  onDeletePlayer,
  onDeleteTeam,
  onUpdateMatch,
  onUpdatePlayer,
  onUpdateTeam
}) {
  const allowedListSet = allowedLists ? new Set(allowedLists) : null;
  const [activeList, setActiveList] = useState(allowedLists?.[0] || "teams");
  const [listNotice, setListNotice] = useState("");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("all");
  const showingAllCompetitions = selectedCompetitionId === "all";
  const selectedCompetition = showingAllCompetitions ? null : getCompetition(league, selectedCompetitionId);
  const activeCompetitionLeague = useMemo(
    () => (showingAllCompetitions ? league : scopeLeagueToCompetition(league, selectedCompetitionId)),
    [league, selectedCompetitionId, showingAllCompetitions]
  );
  const competitionMatches = useMemo(
    () => activeCompetitionLeague.matches,
    [activeCompetitionLeague.matches]
  );
  const regularEditMatches = useMemo(
    () => competitionMatches.filter((match) => (match.stage || "regular") !== "playoff"),
    [competitionMatches]
  );
  const playoffEditMatches = useMemo(
    () => competitionMatches
      .filter((match) => (match.stage || "regular") === "playoff")
      .sort((a, b) => (
        String(a.playoffRound || "").localeCompare(String(b.playoffRound || "")) ||
        String(a.playoffLeg || "").localeCompare(String(b.playoffLeg || "")) ||
        String(a.date).localeCompare(String(b.date)) ||
        String(a.time).localeCompare(String(b.time))
      )),
    [competitionMatches]
  );
  const activeRound = Number(selectedCompetition?.activeRound || getCurrentDisplayRound(regularEditMatches) || regularEditMatches[0]?.round || 0);
  const [openRounds, setOpenRounds] = useState(new Set());
  const listTabs = [
    { id: "teams", label: `Equipos (${activeCompetitionLeague.teams.length})` },
    { id: "players", label: `Jugadores (${activeCompetitionLeague.players.length})` },
    { id: "matches", label: `Partidos (${activeCompetitionLeague.matches.length})` }
  ].filter((tab) => !allowedListSet || allowedListSet.has(tab.id));
  const playerGroups = useMemo(() => {
    const teamById = new Map(activeCompetitionLeague.teams.map((team) => [team.id, team]));
    const grouped = new Map();

    for (const player of [...activeCompetitionLeague.players].sort((a, b) => (
      String(teamById.get(a.teamId)?.name || "").localeCompare(String(teamById.get(b.teamId)?.name || "")) ||
      Number(a.number ?? 99999) - Number(b.number ?? 99999) ||
      String(a.name || "").localeCompare(String(b.name || ""))
    ))) {
      const team = teamById.get(player.teamId);
      const groupKey = team?.id || "sin-equipo";
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          team,
          competition: getCompetition(league, player.competitionId || team?.competitionId),
          players: []
        });
      }
      grouped.get(groupKey).players.push(player);
    }

    return [...grouped.values()];
  }, [activeCompetitionLeague.players, activeCompetitionLeague.teams, league]);
  const matchRounds = useMemo(() => {
    const rounds = new Map();
    for (const match of [...regularEditMatches].sort((a, b) => (
      Number(a.round || 0) - Number(b.round || 0) ||
      String(a.date).localeCompare(String(b.date)) ||
      String(a.time).localeCompare(String(b.time))
    ))) {
      const round = Number(match.round || 0);
      const key = showingAllCompetitions ? `${match.competitionId || "sin-categoria"}:${round}` : String(round);
      if (!rounds.has(key)) {
        rounds.set(key, {
          competitionId: match.competitionId || "",
          round,
          matches: []
        });
      }
      rounds.get(key).matches.push(match);
    }
    return [...rounds.values()].sort((a, b) => (
      String(getCompetition(league, a.competitionId)?.name || "").localeCompare(String(getCompetition(league, b.competitionId)?.name || "")) ||
      a.round - b.round
    ));
  }, [league, regularEditMatches, showingAllCompetitions]);

  useEffect(() => {
    if (!activeRound) return;
    setOpenRounds((current) => {
      if (current.size) return current;
      const firstOpenRound = matchRounds.find((roundGroup) => Number(roundGroup.round) === Number(activeRound)) || matchRounds[0];
      if (!firstOpenRound) return current;
      const key = showingAllCompetitions
        ? `${firstOpenRound.competitionId || "sin-categoria"}:${firstOpenRound.round}`
        : String(firstOpenRound.round);
      return new Set([key]);
    });
  }, [activeRound, matchRounds, showingAllCompetitions]);

  useEffect(() => {
    if (selectedCompetitionId === "all") return;
    const exists = league.competitions?.some((competition) => competition.id === selectedCompetitionId);
    if (!exists) setSelectedCompetitionId(getDefaultCompetitionId(league));
  }, [league, selectedCompetitionId]);

  function countTeamWithdrawalWalkovers(teamId) {
    return league.matches.filter((match) => (
      match.status === "walkover" &&
      match.resolutionType === "team_withdrawal" &&
      (match.homeTeamId === teamId || match.awayTeamId === teamId)
    )).length;
  }

  useEffect(() => {
    if (listTabs.length && !listTabs.some((tab) => tab.id === activeList)) {
      setActiveList(listTabs[0].id);
    }
  }, [activeList, listTabs]);

  async function confirmDelete(label, callback, successMessage = "Registro eliminado correctamente.") {
    if (!window.confirm(`¿Seguro que quieres eliminar ${label}? Esta accion puede afectar informacion relacionada.`)) return;
    const result = await callback();
    if (result === false) return;
    setListNotice(successMessage);
  }

  function toggleRound(round) {
    const key = String(round);
    setOpenRounds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function getCompetitionLeague(competitionId) {
    return scopeLeagueToCompetition(league, competitionId || getDefaultCompetitionId(league));
  }

  async function handleMatchSave(matchId, form) {
    if (!window.confirm("¿Guardar cambios de este partido?")) return;
    const result = await onUpdateMatch(matchId, getFormPayload(form));
    if (result === false) return;
    setListNotice("Datos del partido guardados correctamente.");
  }

  async function handlePlayerSave(player, form) {
    if (!window.confirm("¿Guardar cambios de este jugador?")) return;
    try {
      const payload = await getPlayerPayload(form, player.photoUrl || "", { authToken, leagueId: league.id, scope: "player-photos" });
      const result = onUpdatePlayer(player.id, payload);
      if (result === false) return;
      setListNotice("Datos del jugador guardados correctamente.");
    } catch (error) {
      window.alert(error.message || "No se pudo cargar la imagen.");
    }
  }

  async function handleTeamSave(team, form) {
    let payload;
    try {
      payload = await getTeamPayload(form, team.logoUrl || "", { authToken, leagueId: league.id, scope: "teams" });
    } catch (error) {
      window.alert(error.message || "No se pudo cargar la imagen.");
      return;
    }
    const previousStatus = team.status || "active";
    const nextStatus = payload.status || previousStatus;
    const generatedDefaults = countTeamWithdrawalWalkovers(team.id);

    if (previousStatus !== "withdrawn" && nextStatus === "withdrawn") {
      const confirmed = window.confirm(
        `¿Seguro que quieres dar de baja a ${team.name}?\n\n` +
        "Si el reglamento esta configurado con default, los partidos programados desde la jornada de baja se marcaran como default administrativo."
      );
      if (!confirmed) return;
    }

    if (previousStatus === "withdrawn" && nextStatus === "active" && generatedDefaults > 0) {
      const confirmed = window.confirm(
        `¿Reactivar a ${team.name}?\n\n` +
        `Se restauraran ${generatedDefaults} partido(s) que el sistema marco como default por la baja de este equipo.`
      );
      if (!confirmed) return;
    }

    if (previousStatus === nextStatus && !window.confirm(`¿Guardar cambios del equipo ${team.name}?`)) return;

    onUpdateTeam(team.id, payload);
    setListNotice(nextStatus === "withdrawn"
      ? "Equipo dado de baja correctamente."
      : nextStatus === "active" && previousStatus === "withdrawn"
        ? "Equipo reactivado y defaults por baja restaurados correctamente."
        : "Datos del equipo guardados correctamente.");
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Administracion" title="Listados editables" />
      <p className="helper-text">
        {showingAllCompetitions
          ? "Mostrando equipos, jugadores y partidos de todas las categorias."
          : `Mostrando ${selectedCompetition?.name || "la categoria seleccionada"} | ${selectedCompetition?.season || league.season}.`}
      </p>
      <div className="list-filter-bar">
        <label>Categoria
          <select value={selectedCompetitionId} onChange={(event) => {
            setSelectedCompetitionId(event.target.value);
            setOpenRounds(new Set());
          }}>
            <option value="all">Todas las categorias</option>
            {(league.competitions || []).map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name} | {competition.season}</option>
            ))}
          </select>
        </label>
      </div>
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
      {listNotice && <p className="auth-ok">{listNotice}</p>}
      <div className="management-grid">
        {activeList === "teams" && <div>
          <h3>Equipos</h3>
          <div className="editable-list">
            {activeCompetitionLeague.teams.map((team) => (
              <form
                className="editable-row"
                key={team.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  handleTeamSave(team, event.currentTarget);
                }}
              >
                <input name="name" defaultValue={team.name} aria-label={`Equipo ${team.name}`} required />
                {showingAllCompetitions && <span className="category-chip">{getCompetition(league, team.competitionId)?.name || "Sin categoria"}</span>}
                <input name="coach" defaultValue={team.coach} aria-label={`Entrenador ${team.name}`} placeholder="Entrenador" />
                <input name="assistantCoach" defaultValue={team.assistantCoach || ""} aria-label={`Auxiliar ${team.name}`} placeholder="Auxiliar" />
                <input name="address" defaultValue={team.address || ""} aria-label={`Direccion ${team.name}`} placeholder="Direccion / sede" />
                <input name="colors" defaultValue={team.colors} aria-label={`Color ${team.name}`} type="color" />
                <input name="logoFile" aria-label={`Escudo ${team.name}`} type="file" accept={IMAGE_UPLOAD_ACCEPT} />
                <label className="checkbox-field compact-checkbox">
                  <input name="removeLogo" type="checkbox" />
                  Quitar escudo
                </label>
                <select name="status" defaultValue={team.status || "active"} aria-label={`Estatus ${team.name}`}>
                  <option value="active">Activo</option>
                  <option value="withdrawn">Baja</option>
                </select>
                <input name="withdrawnRound" defaultValue={team.withdrawnRound || ""} aria-label={`Jornada de baja ${team.name}`} type="number" min="1" placeholder="J baja" />
                <input name="withdrawnReason" defaultValue={team.withdrawnReason || ""} aria-label={`Motivo de baja ${team.name}`} placeholder="Motivo de baja" />
                <button className="primary" type="submit">Guardar</button>
                <button className="danger" type="button" onClick={() => confirmDelete(`el equipo ${team.name}`, () => onDeleteTeam(team.id), "Equipo eliminado correctamente.")}>Eliminar</button>
              </form>
            ))}
            {!activeCompetitionLeague.teams.length && (
              <p className="empty">
                {showingAllCompetitions ? "Aun no hay equipos registrados en ninguna categoria." : "Aun no hay equipos registrados en esta categoria."}
              </p>
            )}
          </div>
        </div>}

        {activeList === "players" && <div>
          <h3>Jugadores</h3>
          <div className="player-team-groups">
            {playerGroups.map(({ team, competition, players }) => (
              <details className="player-team-group" key={team?.id || "sin-equipo"}>
                <summary className="player-team-group-head">
                  <div>
                    <strong>{team?.name || "Sin equipo asignado"}</strong>
                    <span>{players.length} jugador(es)</span>
                  </div>
                  {showingAllCompetitions && <span className="category-chip">{competition?.name || "Sin categoria"}</span>}
                </summary>
                <div className="editable-list">
                  {players.map((player) => (
                    <form
                      className="editable-row player-row"
                      key={player.id}
                      onSubmit={(event) => {
                        event.preventDefault();
                        handlePlayerSave(player, event.currentTarget);
                      }}
                    >
                      <select name="teamId" defaultValue={player.teamId} aria-label={`Equipo de ${player.name}`} required>
                        {getCompetitionLeague(player.competitionId).teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <input name="name" defaultValue={player.name} aria-label={`Jugador ${player.name}`} required pattern=".*\S+\s+\S+.*" title="Registra nombre(s) y apellido(s)" />
                      <input name="number" defaultValue={player.number} aria-label={`Numero de ${player.name}`} type="number" min="0" max="9999" />
                      <PlayerPositionSelect name="position" defaultValue={getPlayerPositionOptionValue(player.position)} ariaLabel={`Posicion de ${player.name}`} />
                      <PlayerPhotoUploader
                        compact
                        defaultAuthorized={player.photoAuthorized === true}
                        existingPhotoUrl={player.photoUrl || ""}
                        playerName={player.name}
                      />
                      <button className="primary" type="submit">Guardar</button>
                      <button className="danger" type="button" onClick={() => confirmDelete(`al jugador ${player.name}`, () => onDeletePlayer(player.id), "Jugador eliminado correctamente.")}>Eliminar</button>
                    </form>
                  ))}
                </div>
              </details>
            ))}
            {!activeCompetitionLeague.players.length && (
              <p className="empty">
                {showingAllCompetitions ? "Aun no hay jugadores registrados en ninguna categoria." : "Aun no hay jugadores registrados en esta categoria."}
              </p>
            )}
          </div>
        </div>}

        {activeList === "matches" && <div className="wide-field">
          <h3>Partidos</h3>
          <p className="helper-text">Aqui puedes editar todos los partidos generados: fecha, hora, cancha, equipos, jornada regular y liguilla. Hora y cancha pueden quedar vacias hasta definirlas.</p>
          {playoffEditMatches.length > 0 && (
            <section className="round-edit-section playoff-edit-section active">
              <div className="round-edit-header static">
                <span>Fase final</span>
                <strong>Liguilla</strong>
                <small>{playoffEditMatches.length} partido(s)</small>
              </div>
              <div className="bulk-actions">
                <button
                  className="danger"
                  type="button"
                  onClick={() => {
                    if (!selectedCompetition?.id) {
                      window.alert("Selecciona una categoria especifica para eliminar toda su liguilla.");
                      return;
                    }
                    if (!window.confirm(`¿Eliminar toda la liguilla de ${selectedCompetition.name || "este torneo"}? Esta accion borrara todos los partidos de fase final de esta categoria.`)) return;
                    onDeletePlayoffMatches({ competitionId: selectedCompetition.id });
                    setListNotice("Liguilla eliminada correctamente.");
                  }}
                >
                  Eliminar liguilla
                </button>
              </div>
              <div className="editable-list">
                {playoffEditMatches.map((match) => (
                  <form
                    className="editable-row match-edit-row"
                    key={match.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleMatchSave(match.id, event.currentTarget);
                    }}
                  >
                    <CompetitionSelect league={league} name="competitionId" defaultValue={match.competitionId || getDefaultCompetitionId(league)} />
                    <input type="hidden" name="stage" value="playoff" />
                    <input type="hidden" name="round" value={match.round || 0} />
                    <select name="playoffRound" defaultValue={match.playoffRound || ""} aria-label={`Fase ${match.id}`} required>
                      <option value="">Fase</option>
                      {PLAYOFF_PHASE_OPTIONS.map((phase) => (
                        <option key={phase.value} value={phase.label}>{phase.label}</option>
                      ))}
                      <option value="Repechaje">Repechaje</option>
                    </select>
                    <select name="playoffLeg" defaultValue={match.playoffLeg || ""} aria-label={`Juego ${match.id}`}>
                      <option value="">Unico</option>
                      <option value="Ida">Ida</option>
                      <option value="Vuelta">Vuelta</option>
                    </select>
                    <input name="date" defaultValue={match.date} aria-label={`Fecha ${match.id}`} type="date" required />
                    <input name="time" defaultValue={match.time || ""} aria-label={`Hora ${match.id}`} type="time" />
                    <VenueSelect league={league} defaultValue={match.venue || ""} ariaLabel={`Cancha ${match.id}`} />
                    <TeamSelect league={getCompetitionLeague(match.competitionId)} name="homeTeamId" defaultValue={match.homeTeamId} />
                    {canEditMatchResults && <input name="homeGoals" defaultValue={match.homeGoals ?? ""} aria-label={`Goles local ${match.id}`} type="number" min="0" placeholder="GL" />}
                    <TeamSelect league={getCompetitionLeague(match.competitionId)} name="awayTeamId" defaultValue={match.awayTeamId} />
                    {canEditMatchResults && <input name="awayGoals" defaultValue={match.awayGoals ?? ""} aria-label={`Goles visitante ${match.id}`} type="number" min="0" placeholder="GV" />}
                    {canEditMatchResults && (
                      <select name="status" defaultValue={match.status || "scheduled"} aria-label={`Estado ${match.id}`}>
                        <option value="scheduled">Programado</option>
                        <option value="finished">Finalizado</option>
                        <option value="walkover">Default</option>
                      </select>
                    )}
                    <input name="aggregateHome" defaultValue={match.aggregateHome ?? ""} aria-label={`Global local ${match.id}`} type="number" min="0" placeholder="G local" />
                    <input name="aggregateAway" defaultValue={match.aggregateAway ?? ""} aria-label={`Global visitante ${match.id}`} type="number" min="0" placeholder="G visitante" />
                    <span className={`status ${match.status}`}>{match.status === "finished" ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : match.status === "walkover" ? "Default" : "Programado"}</span>
                    <button className="primary" type="submit" disabled={!canEditMatchResults && match.status !== "scheduled"}>Guardar</button>
                    <button className="danger" type="button" disabled={!canEditMatchResults && match.status !== "scheduled"} onClick={() => confirmDelete("este partido de liguilla", () => onDeleteMatch(match.id), "Partido de liguilla eliminado correctamente.")}>Eliminar</button>
                  </form>
                ))}
              </div>
            </section>
          )}
          <div className="round-edit-list">
            {matchRounds.map(({ competitionId, round, matches }) => {
              const roundKey = showingAllCompetitions ? `${competitionId || "sin-categoria"}:${round}` : String(round);
              const isOpen = openRounds.has(roundKey);
              const roundCompetition = getCompetition(league, competitionId);
              const finishedCount = matches.filter((match) => match.status === "finished" || match.status === "walkover").length;
              return (
                <section className={`round-edit-section ${Number(round) === Number(activeRound) ? "active" : ""}`} key={roundKey}>
                  <button className="round-edit-header" type="button" onClick={() => toggleRound(roundKey)}>
                    <span>{isOpen ? "Ocultar" : "Abrir"}</span>
                    <strong>{showingAllCompetitions && roundCompetition ? `${roundCompetition.name} | ` : ""}Jornada {round || "-"}</strong>
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
                            {PLAYOFF_PHASE_OPTIONS.map((phase) => (
                              <option key={phase.value} value={phase.label}>{phase.label}</option>
                            ))}
                            <option value="Repechaje">Repechaje</option>
                          </select>
                          <select name="playoffLeg" defaultValue={match.playoffLeg || ""} aria-label={`Juego ${match.id}`}>
                            <option value="">Juego</option>
                            <option value="Ida">Ida</option>
                            <option value="Vuelta">Vuelta</option>
                          </select>
                          <input name="date" defaultValue={match.date} aria-label={`Fecha ${match.id}`} type="date" required />
                          <input name="time" defaultValue={match.time || ""} aria-label={`Hora ${match.id}`} type="time" />
                          <VenueSelect league={league} defaultValue={match.venue || ""} ariaLabel={`Cancha ${match.id}`} />
                          <TeamSelect league={getCompetitionLeague(match.competitionId)} name="homeTeamId" defaultValue={match.homeTeamId} />
                          {canEditMatchResults && <input name="homeGoals" defaultValue={match.homeGoals ?? ""} aria-label={`Goles local ${match.id}`} type="number" min="0" placeholder="GL" />}
                          <TeamSelect league={getCompetitionLeague(match.competitionId)} name="awayTeamId" defaultValue={match.awayTeamId} />
                          {canEditMatchResults && <input name="awayGoals" defaultValue={match.awayGoals ?? ""} aria-label={`Goles visitante ${match.id}`} type="number" min="0" placeholder="GV" />}
                          {canEditMatchResults && (
                            <select name="status" defaultValue={match.status || "scheduled"} aria-label={`Estado ${match.id}`}>
                              <option value="scheduled">Programado</option>
                              <option value="finished">Finalizado</option>
                              <option value="walkover">Default</option>
                            </select>
                          )}
                          <input name="aggregateHome" defaultValue={match.aggregateHome ?? ""} aria-label={`Global local ${match.id}`} type="number" min="0" placeholder="G local" />
                          <input name="aggregateAway" defaultValue={match.aggregateAway ?? ""} aria-label={`Global visitante ${match.id}`} type="number" min="0" placeholder="G visitante" />
                          <span className={`status ${match.status}`}>{match.status === "finished" ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : match.status === "walkover" ? "Default" : "Programado"}</span>
                          <button className="primary" type="submit" disabled={!canEditMatchResults && match.status !== "scheduled"}>Guardar</button>
                          <button className="danger" type="button" disabled={!canEditMatchResults && match.status !== "scheduled"} onClick={() => confirmDelete("este partido", () => onDeleteMatch(match.id), "Partido eliminado correctamente.")}>Eliminar</button>
                        </form>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            {!activeCompetitionLeague.matches.length && (
              <p className="empty">
                {showingAllCompetitions ? "Aun no hay partidos registrados en ninguna categoria." : "Aun no hay partidos registrados en esta categoria."}
              </p>
            )}
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
  const hasPlayoffMatches = competitionLeague.matches.some((match) => (match.stage || "regular") === "playoff");
  const [selectedRound, setSelectedRound] = useState((preferredMatch?.stage || "regular") === "playoff" ? "playoff" : preferredMatch?.round || rounds[0] || "");
  const [matchStatusFilter, setMatchStatusFilter] = useState("scheduled");
  const roundMatches = useMemo(() => (
    competitionLeague.matches
      .filter((match) => (
        selectedRound === "playoff"
          ? (match.stage || "regular") === "playoff"
          : (match.stage || "regular") !== "playoff" && Number(match.round) === Number(selectedRound)
      ))
      .sort((a, b) => (
        String(a.playoffRound || "").localeCompare(String(b.playoffRound || "")) ||
        String(a.playoffLeg || "").localeCompare(String(b.playoffLeg || "")) ||
        String(a.date).localeCompare(String(b.date)) ||
        String(a.time).localeCompare(String(b.time))
      ))
  ), [competitionLeague.matches, selectedRound]);
  const visibleRoundMatches = useMemo(() => (
    roundMatches.filter((match) => {
      if (matchStatusFilter === "all") return true;
      if (matchStatusFilter === "scheduled") return match.status === "scheduled";
      if (matchStatusFilter === "finished") return match.status === "finished" || match.status === "walkover";
      return true;
    })
  ), [matchStatusFilter, roundMatches]);
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [observations, setObservations] = useState("");
  const [sheetMode, setSheetMode] = useState("played");
  const [defaultWinner, setDefaultWinner] = useState("home");
  const [defaultScore, setDefaultScore] = useState("3");
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
      setSelectedRound(hasPlayoffMatches ? "playoff" : "");
      return;
    }
    if (selectedRound === "playoff" && hasPlayoffMatches) return;
    if (!rounds.includes(Number(selectedRound))) setSelectedRound(rounds[0]);
  }, [hasPlayoffMatches, rounds, selectedRound]);

  useEffect(() => {
    if (!visibleRoundMatches.length) return;
    if (!visibleRoundMatches.some((match) => match.id === matchId)) setMatchId(visibleRoundMatches[0].id);
  }, [matchId, visibleRoundMatches]);

  useEffect(() => {
    if (!selectedMatch) {
      setHomeGoals(0);
      setAwayGoals(0);
      setObservations("");
      setSheetMode("played");
      setDefaultWinner("home");
      setDefaultScore("3");
      setEvents([]);
      setValidationMessage("");
      return;
    }

    setHomeGoals(selectedMatch.homeGoals ?? 0);
    setAwayGoals(selectedMatch.awayGoals ?? 0);
    setObservations(selectedMatch.observations || "");
    const isWalkover = selectedMatch.status === "walkover";
    const winner = Number(selectedMatch.homeGoals || 0) > Number(selectedMatch.awayGoals || 0) ? "home" : "away";
    const walkoverGoals = Math.max(Number(selectedMatch.homeGoals || 0), Number(selectedMatch.awayGoals || 0));
    setSheetMode(isWalkover ? `default_${walkoverGoals === 5 ? "5" : "3"}` : "played");
    setDefaultWinner(winner);
    setDefaultScore(walkoverGoals === 5 ? "5" : "3");
    setEvents(selectedMatch.events.map((event, index) => ({
      id: `${selectedMatch.id}-${index}-${event.type}-${event.playerId}`,
      type: event.type,
      teamId: event.teamId || getPlayer(league, event.playerId)?.teamId || selectedMatch.homeTeamId,
      lockedTeamId: event.teamId || getPlayer(league, event.playerId)?.teamId || selectedMatch.homeTeamId,
      playerId: event.playerId,
      minute: event.minute || "",
      suspensionMatches: event.suspensionMatches || 1,
      reason: event.reason || "",
      playerQuery: ""
    })));
    setValidationMessage("");
    setSheetNotice("");
  }, [selectedMatch]);

  function getPlayersForTeam(teamId) {
    return getEligiblePlayersForTeam(league, teamId);
  }

  function getOpponentTeamId(teamId) {
    if (teamId === selectedMatch?.homeTeamId) return selectedMatch.awayTeamId;
    if (teamId === selectedMatch?.awayTeamId) return selectedMatch.homeTeamId;
    return "";
  }

  function getPlayersForEvent(type, teamId) {
    return type === "own_goal"
      ? getPlayersForTeam(getOpponentTeamId(teamId))
      : getPlayersForTeam(teamId);
  }

  function getEventPlayersForDisplay(eventItem, playerTeamId) {
    const eventTeamId = eventItem.teamId || selectedMatch.homeTeamId;
    const eventPlayers = getPlayersForEvent(eventItem.type, eventTeamId);
    const query = normalizeAdminSearchTerm(eventItem.playerQuery);
    if (!query) return eventPlayers;

    const filteredPlayers = eventPlayers.filter((player) => (
      normalizeAdminSearchTerm(`#${getPlayerNumberForTeam(league, player.id, playerTeamId) || ""} ${player.name} ${getTeam(league, player.teamId)?.name || ""}`).includes(query)
    ));
    if (!eventItem.playerId || filteredPlayers.some((player) => player.id === eventItem.playerId)) return filteredPlayers;

    const selectedPlayer = eventPlayers.find((player) => player.id === eventItem.playerId);
    return selectedPlayer ? [selectedPlayer, ...filteredPlayers] : filteredPlayers;
  }

  function addEvent(type, teamId = selectedMatch?.homeTeamId) {
    const players = getPlayersForEvent(type, teamId);
    setEvents((current) => [
      ...current,
      {
        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        teamId,
        lockedTeamId: teamId,
        playerId: players[0]?.id || "",
        minute: "",
        suspensionMatches: type === "red" ? Number(league.rules?.defaultRedSuspensionMatches || 1) : 0,
        reason: "",
        playerQuery: ""
      }
    ]);
  }

  function buildMissingGoalEvents(teamId, currentEvents) {
    const players = getPlayersForTeam(teamId);
    if (!players.length) return [];

    const expected = teamId === selectedMatch.homeTeamId ? expectedHomeGoals : expectedAwayGoals;
    const currentGoals = currentEvents.filter((item) => ["goal", "own_goal"].includes(item.type) && item.teamId === teamId && item.playerId).length;
    const missing = Math.max(0, expected - currentGoals);
    if (!missing) return [];

    return Array.from({ length: missing }, () => ({
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "goal",
      teamId,
      lockedTeamId: teamId,
      playerId: players[0]?.id || "",
      minute: "",
      suspensionMatches: 0,
      reason: "",
      playerQuery: ""
    }));
  }

  function completeGoalEventsFromScore() {
    const localNeedsPlayers = expectedHomeGoals > 0 && !getPlayersForTeam(selectedMatch.homeTeamId).length;
    const awayNeedsPlayers = expectedAwayGoals > 0 && !getPlayersForTeam(selectedMatch.awayTeamId).length;
    if (localNeedsPlayers || awayNeedsPlayers) {
      setValidationMessage("Para completar goles, los equipos con goles deben tener jugadores registrados.");
      return;
    }

    setValidationMessage("");
    setSheetNotice("Se agregaron los goles pendientes del marcador.");
    setEvents((current) => {
      const homeMissing = buildMissingGoalEvents(selectedMatch.homeTeamId, current);
      const withHome = [...current, ...homeMissing];
      const awayMissing = buildMissingGoalEvents(selectedMatch.awayTeamId, withHome);
      return [...withHome, ...awayMissing];
    });
  }

  function updateEvent(eventId, field, value) {
    setEvents((current) => current.map((event) => (
      event.id === eventId
        ? updateMatchSheetEventItem(event, field, value, {
            getPlayersForTeam,
            getPlayersForEvent,
            defaultRedSuspensionMatches: league.rules?.defaultRedSuspensionMatches,
            lockGoalTeam: true
          })
        : event
    )));
  }

  function removeEvent(eventId) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  }

  function applyDefaultScore(nextMode, winner = defaultWinner) {
    setSheetMode(nextMode);
    if (nextMode === "played") {
      setValidationMessage("");
      setSheetNotice("");
      return;
    }
    const score = nextMode === "default_5" ? "5" : "3";
    setDefaultScore(score);
    setDefaultWinner(winner);
    setHomeGoals(winner === "home" ? score : "0");
    setAwayGoals(winner === "away" ? score : "0");
    setValidationMessage("");
    setSheetNotice(`Marcador por default ${score}-0 aplicado para ${winner === "home" ? "local" : "visitante"}. Puedes conservar o capturar eventos reales para estadisticas de jugadores.`);
  }

  function changeDefaultWinner(winner) {
    setDefaultWinner(winner);
    if (sheetMode !== "played") applyDefaultScore(sheetMode, winner);
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
  const goalEvents = cleanEvents.filter((item) => item.type === "goal" || item.type === "own_goal");
  const homeGoalEvents = goalEvents.filter((item) => item.teamId === selectedMatch.homeTeamId).length;
  const awayGoalEvents = goalEvents.filter((item) => item.teamId === selectedMatch.awayTeamId).length;
  const expectedHomeGoals = Number(homeGoals || 0);
  const expectedAwayGoals = Number(awayGoals || 0);
  const isDefaultSheet = sheetMode !== "played";
  const isEditingSavedSheet = selectedMatch.status === "finished" || selectedMatch.status === "walkover";
  const hasMissingGoalEvents = homeGoalEvents < expectedHomeGoals || awayGoalEvents < expectedAwayGoals;
  const homeTeam = getTeam(league, selectedMatch.homeTeamId);
  const awayTeam = getTeam(league, selectedMatch.awayTeamId);

  function validateMatchSheet() {
    if (!selectedMatch) return "Selecciona un partido para capturar el acta.";
    if (selectedMatch.homeTeamId === selectedMatch.awayTeamId) return "El partido no puede tener el mismo equipo como local y visitante.";
    if (!Number.isInteger(expectedHomeGoals) || !Number.isInteger(expectedAwayGoals)) return "El marcador debe capturarse con numeros enteros.";
    if (expectedHomeGoals < 0 || expectedAwayGoals < 0) return "El marcador no puede tener goles negativos.";
    if (expectedHomeGoals > 50 || expectedAwayGoals > 50) return "Revisa el marcador; parece demasiado alto.";
    if (isDefaultSheet) {
      const maxGoals = Math.max(expectedHomeGoals, expectedAwayGoals);
      const minGoals = Math.min(expectedHomeGoals, expectedAwayGoals);
      if (![3, 5].includes(maxGoals) || minGoals !== 0) return "El default solo puede guardarse como 3-0 o 5-0.";
    }
    if (!isDefaultSheet) {
      const canAssignHomeGoals = getPlayersForTeam(selectedMatch.homeTeamId).length || getPlayersForTeam(selectedMatch.awayTeamId).length;
      const canAssignAwayGoals = getPlayersForTeam(selectedMatch.awayTeamId).length || getPlayersForTeam(selectedMatch.homeTeamId).length;
      if ((expectedHomeGoals > 0 && !canAssignHomeGoals) || (expectedAwayGoals > 0 && !canAssignAwayGoals)) {
        return "Para guardar goles o autogoles, el partido debe tener jugadores registrados.";
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
    }

    const eventWithoutPlayer = events.find((item) => !item.playerId);
    if (eventWithoutPlayer) return "Todos los eventos del acta deben tener jugador seleccionado.";

    const eventWithWrongTeam = cleanEvents.find((item) => {
      const player = getPlayer(league, item.playerId);
      if (!["goal", "own_goal", "yellow", "red"].includes(item.type)) return true;
      if (!player || ![selectedMatch.homeTeamId, selectedMatch.awayTeamId].includes(item.teamId)) return true;
      if (item.type === "own_goal") return !isPlayerEligibleForTeam(league, player.id, getOpponentTeamId(item.teamId));
      return !isPlayerEligibleForTeam(league, player.id, item.teamId);
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
        const editWarning = isEditingSavedSheet
          ? "\nEsta accion reemplazara la captura anterior del acta y recalculara estadisticas con los nuevos eventos.\n"
          : "";
        const modeLabel = isDefaultSheet ? `Default ${Math.max(expectedHomeGoals, expectedAwayGoals)}-0` : "Partido jugado";
        const goalsLabel = isDefaultSheet
          ? `${homeGoalEvents}-${awayGoalEvents} reales, solo para jugadores`
          : String(goalEvents.length);
        const confirmed = window.confirm(`Antes de guardar, verifica el acta:\n\nTipo: ${modeLabel}\nMarcador oficial: ${expectedHomeGoals}-${expectedAwayGoals}\nGoles capturados: ${goalsLabel}\nAmarillas: ${cleanEvents.filter((item) => item.type === "yellow").length}\nRojas: ${cleanEvents.filter((item) => item.type === "red").length}${editWarning}\n¿Guardar acta?`);
        if (!confirmed) return;

        try {
          onSaveMatchSheet({
            matchId: selectedMatch.id,
            homeGoals,
            awayGoals,
            observations,
            status: isDefaultSheet ? "walkover" : "finished",
            resolutionType: isDefaultSheet ? "no_show" : "normal",
            resolutionNote: isDefaultSheet
              ? `Default administrativo ${Math.max(expectedHomeGoals, expectedAwayGoals)}-0. Eventos capturados solo para estadisticas individuales.`
              : "",
            events: cleanEvents
          });
          setSheetNotice(isDefaultSheet ? "Default guardado correctamente. Los eventos capturados contaran solo para jugadores." : isEditingSavedSheet ? "Acta corregida correctamente." : "Acta guardada correctamente.");
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
            {hasPlayoffMatches && <option value="playoff">Liguilla</option>}
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
        <label className="sheet-match-select">Partido
          <select value={selectedMatch.id} onChange={(event) => setMatchId(event.target.value)} disabled={!visibleRoundMatches.length}>
            {visibleRoundMatches.map((match) => (
              <option key={match.id} value={match.id}>
                {getTeam(league, match.homeTeamId)?.name || "Local"} vs {getTeam(league, match.awayTeamId)?.name || "Visitante"} | {match.status === "finished" || match.status === "walkover" ? `${match.homeGoals}-${match.awayGoals}` : match.time || "POR DEFINIR"}
              </option>
            ))}
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
              <span>{(match.stage || "regular") === "playoff" ? [match.playoffRound || "Liguilla", match.playoffLeg].filter(Boolean).join(" | ") : `Jornada ${match.round}`}</span>
              <strong>{getTeam(league, match.homeTeamId)?.name || "LOCAL"} VS {getTeam(league, match.awayTeamId)?.name || "VISITANTE"}</strong>
              <span>{match.status === "finished" || match.status === "walkover" ? `${match.homeGoals}-${match.awayGoals}` : match.time || "POR DEFINIR"} | {match.venue || "CANCHA POR DEFINIR"}</span>
            </button>
          ))}
          {!visibleRoundMatches.length && <p className="empty">No hay partidos con ese filtro en esta jornada.</p>}
        </div>
      </div>

      <div className="sheet-head">
        <div className="sheet-score">
          <div className="sheet-team home">
            <span>Local</span>
            <strong>{homeTeam?.name || "Local"}</strong>
          </div>
          <div className="score-box">
            <input value={homeGoals} onChange={(event) => setHomeGoals(event.target.value)} type="number" min="0" aria-label="Goles local" />
            <span>-</span>
            <input value={awayGoals} onChange={(event) => setAwayGoals(event.target.value)} type="number" min="0" aria-label="Goles visitante" />
          </div>
          <div className="sheet-team away">
            <span>Visitante</span>
            <strong>{awayTeam?.name || "Visitante"}</strong>
          </div>
        </div>
        <div className="sheet-match-meta" aria-label="Datos del partido seleccionado">
          <span>{(selectedMatch.stage || "regular") === "playoff" ? [selectedMatch.playoffRound || "Liguilla", selectedMatch.playoffLeg].filter(Boolean).join(" | ") : `Jornada ${selectedMatch.round || "-"}`}</span>
          <time>{formatDate(selectedMatch.date)}</time>
          <span>{selectedMatch.time || "Hora por definir"}</span>
          <span>{selectedMatch.venue || "Cancha por definir"}</span>
        </div>
      </div>

      <div className="sheet-checklist">
        <span>{isDefaultSheet ? `Goles reales local: ${homeGoalEvents}` : `Goles local: ${homeGoalEvents}/${expectedHomeGoals}`}</span>
        <span>{isDefaultSheet ? `Goles reales visitante: ${awayGoalEvents}` : `Goles visitante: ${awayGoalEvents}/${expectedAwayGoals}`}</span>
        <span>Tarjetas: {cleanEvents.filter((item) => item.type === "yellow").length} amarilla(s), {cleanEvents.filter((item) => item.type === "red").length} roja(s)</span>
      </div>

      <div className="sheet-default-controls" aria-label="Tipo de resultado del acta">
        <label>Tipo de acta
          <select value={sheetMode} onChange={(event) => applyDefaultScore(event.target.value)}>
            <option value="played">Partido jugado</option>
            <option value="default_3">Default 3-0</option>
            <option value="default_5">Default 5-0</option>
          </select>
        </label>
        <label>Ganador del default
          <select value={defaultWinner} onChange={(event) => changeDefaultWinner(event.target.value)} disabled={!isDefaultSheet}>
            <option value="home">{homeTeam?.name || "Local"}</option>
            <option value="away">{awayTeam?.name || "Visitante"}</option>
          </select>
        </label>
        <p>
          {isDefaultSheet
            ? `Se guardara como default administrativo ${defaultScore}-0 para la tabla. Los eventos capturados se suman solo a jugadores.`
            : "Usa partido jugado cuando el marcador requiere goles, tarjetas y eventos normales."}
        </p>
      </div>

      <label className="sheet-observations">
        Observaciones del acta
        <textarea
          value={observations}
          onChange={(event) => setObservations(event.target.value)}
          placeholder="Registra hechos relevantes, incidencias, acuerdos arbitrales o notas internas del partido."
        />
      </label>

      {validationMessage && <p className="sheet-alert">{validationMessage}</p>}
      {sheetNotice && <p className="auth-ok">{sheetNotice}</p>}

      <div className="event-toolbar">
        <button type="button" onClick={completeGoalEventsFromScore} disabled={isDefaultSheet || !hasMissingGoalEvents}>Completar goles del marcador</button>
      </div>

      <div className="event-quick-panel" aria-label="Agregar eventos rapidos">
        <div className="event-team-card">
          <strong>{homeTeam?.name || "Local"}</strong>
          <span>Eventos del local</span>
          <div className="event-quick-buttons">
            <button type="button" onClick={() => addEvent("goal", selectedMatch.homeTeamId)} disabled={!getPlayersForTeam(selectedMatch.homeTeamId).length}>Gol</button>
            <button type="button" onClick={() => addEvent("yellow", selectedMatch.homeTeamId)} disabled={!getPlayersForTeam(selectedMatch.homeTeamId).length}>Amarilla</button>
            <button type="button" onClick={() => addEvent("red", selectedMatch.homeTeamId)} disabled={!getPlayersForTeam(selectedMatch.homeTeamId).length}>Roja</button>
            <button type="button" onClick={() => addEvent("own_goal", selectedMatch.awayTeamId)} disabled={!getPlayersForTeam(selectedMatch.homeTeamId).length}>Autogol</button>
          </div>
        </div>
        <div className="event-team-card away">
          <strong>{awayTeam?.name || "Visitante"}</strong>
          <span>Eventos del visitante</span>
          <div className="event-quick-buttons">
            <button type="button" onClick={() => addEvent("goal", selectedMatch.awayTeamId)} disabled={!getPlayersForTeam(selectedMatch.awayTeamId).length}>Gol</button>
            <button type="button" onClick={() => addEvent("yellow", selectedMatch.awayTeamId)} disabled={!getPlayersForTeam(selectedMatch.awayTeamId).length}>Amarilla</button>
            <button type="button" onClick={() => addEvent("red", selectedMatch.awayTeamId)} disabled={!getPlayersForTeam(selectedMatch.awayTeamId).length}>Roja</button>
            <button type="button" onClick={() => addEvent("own_goal", selectedMatch.homeTeamId)} disabled={!getPlayersForTeam(selectedMatch.awayTeamId).length}>Autogol</button>
          </div>
        </div>
      </div>

      <div className="event-list">
        {events.map((eventItem, index) => {
          const eventTeamId = eventItem.teamId || selectedMatch.homeTeamId;
          const eventTeam = getTeam(league, eventTeamId);
          const isLockedTeamEvent = Boolean(eventItem.lockedTeamId);
          const eventTeamLabel = eventItem.type === "own_goal" ? "Equipo que recibe el gol" : "Equipo del evento";
          const playerTeamId = eventItem.type === "own_goal" ? getOpponentTeamId(eventTeamId) : eventTeamId;
          const eventPlayers = getEventPlayersForDisplay(eventItem, playerTeamId);
          const playerLabel = eventItem.type === "own_goal" ? "Jugador que hizo el autogol" : "Jugador";

          return (
            <article className="event-row" key={eventItem.id}>
              <div className="event-row-head">
                <strong>{getMatchEventLabel(eventItem.type)} | {eventTeam?.name || "Equipo"}</strong>
                <span>Evento {index + 1}</span>
                <button className="danger ghost-danger" type="button" onClick={() => removeEvent(eventItem.id)}>Quitar</button>
              </div>
              <label>Evento
                <select value={eventItem.type} onChange={(event) => updateEvent(eventItem.id, "type", event.target.value)} aria-label="Tipo de evento">
                  <option value="goal">Gol</option>
                  <option value="own_goal">Autogol</option>
                  <option value="yellow">Amarilla</option>
                  <option value="red">Roja</option>
                </select>
              </label>
              <label>{eventTeamLabel}
                <select
                  disabled={isLockedTeamEvent}
                  title={isLockedTeamEvent ? "El equipo queda fijo segun el boton local/visitante seleccionado." : eventTeamLabel}
                  value={eventTeamId}
                  onChange={(event) => updateEvent(eventItem.id, "teamId", event.target.value)}
                  aria-label={eventTeamLabel}
                >
                  <option value={selectedMatch.homeTeamId}>{homeTeam?.name || "Local"}</option>
                  <option value={selectedMatch.awayTeamId}>{awayTeam?.name || "Visitante"}</option>
                </select>
              </label>
              <label>Buscar jugador
                <input
                  value={eventItem.playerQuery || ""}
                  onChange={(event) => updateEvent(eventItem.id, "playerQuery", event.target.value)}
                  placeholder="Nombre o numero"
                />
              </label>
              <label>{playerLabel}
                <select value={eventItem.playerId} onChange={(event) => updateEvent(eventItem.id, "playerId", event.target.value)} aria-label={eventItem.type === "own_goal" ? "Jugador que hizo el autogol" : `Jugador de ${eventTeam?.name || "equipo"}`}>
                  {eventPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      #{getPlayerNumberForTeam(league, player.id, playerTeamId) || "-"} {player.name}{getPlayerAffiliationForTeam(league, player.id, playerTeamId) ? ` | AFILIADO: ${getTeam(league, player.teamId)?.name || "ORIGEN"}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>Minuto
                <input value={eventItem.minute} onChange={(event) => updateEvent(eventItem.id, "minute", event.target.value)} type="number" min="0" max="130" placeholder="Min" aria-label="Minuto" />
              </label>
              {eventItem.type === "red" ? (
                <>
                  <label>Partidos de sancion
                    <input value={eventItem.suspensionMatches} onChange={(event) => updateEvent(eventItem.id, "suspensionMatches", event.target.value)} type="number" min="1" placeholder="Sancion" aria-label="Partidos de sancion" />
                  </label>
                  <label className="event-reason-field">Motivo
                    <input value={eventItem.reason} onChange={(event) => updateEvent(eventItem.id, "reason", event.target.value)} placeholder="Motivo" aria-label="Motivo de sancion" required />
                  </label>
                </>
              ) : (
                <span className="event-hint">
                  {eventItem.type === "goal"
                    ? `Gol de ${eventTeam?.name || "equipo asignado"}`
                    : eventItem.type === "own_goal"
                    ? `Autogol a favor de ${eventTeam?.name || "equipo asignado"}`
                    : `Amonestacion de ${eventTeam?.name || "equipo asignado"}`}
                </span>
              )}
            </article>
          );
        })}
        {!events.length && <p className="empty">Agrega goles, tarjetas amarillas o rojas para completar el acta.</p>}
      </div>

      <button className="primary" type="submit">Guardar acta</button>
    </form>
  );
}

function DisciplineControlPanel({
  league,
  onAddDisciplineAdjustment,
  onAddDisciplineReset,
  onDeleteDisciplineAdjustment,
  onDeleteDisciplineReset
}) {
  const rows = calculateYellowCardDiscipline(league);
  const players = useMemo(() => [...league.players].sort((a, b) => a.name.localeCompare(b.name)), [league.players]);
  const competitions = useMemo(() => [...(league.competitions || [])].sort((a, b) => a.name.localeCompare(b.name)), [league.competitions]);
  const teams = useMemo(() => [...league.teams].sort((a, b) => a.name.localeCompare(b.name)), [league.teams]);
  const [disciplineQuery, setDisciplineQuery] = useState("");
  const [disciplineCompetitionId, setDisciplineCompetitionId] = useState("");
  const [disciplineTeamId, setDisciplineTeamId] = useState("");
  const [disciplineStatus, setDisciplineStatus] = useState("all");
  const [notice, setNotice] = useState("");
  const visibleTeams = useMemo(() => (
    disciplineCompetitionId
      ? teams.filter((team) => (team.competitionId || getDefaultCompetitionId(league)) === disciplineCompetitionId)
      : teams
  ), [disciplineCompetitionId, league, teams]);
  const filteredRows = useMemo(() => rows.filter((row) => disciplineRowMatchesFilters(league, row, {
    query: disciplineQuery,
    competitionId: disciplineCompetitionId,
    teamId: disciplineTeamId,
    status: disciplineStatus
  })), [disciplineCompetitionId, disciplineQuery, disciplineStatus, disciplineTeamId, league, rows]);
  const manualHistory = useMemo(() => [...(league.disciplineAdjustments || []), ...(league.disciplineResets || [])]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [league.disciplineAdjustments, league.disciplineResets]);
  const filteredManualHistory = useMemo(() => manualHistory.filter((item) => disciplineMovementMatchesFilters(league, item, {
    query: disciplineQuery,
    competitionId: disciplineCompetitionId,
    teamId: disciplineTeamId
  })), [disciplineCompetitionId, disciplineQuery, disciplineTeamId, league, manualHistory]);

  function submitAdjustment(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (!window.confirm("¿Guardar este ajuste manual de amarillas?")) return;
    onAddDisciplineAdjustment(payload);
    setNotice("Ajuste disciplinario guardado.");
    event.currentTarget.reset();
  }

  function submitReset(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (!window.confirm("¿Marcar sancion cumplida y resetear acumulacion disciplinaria?")) return;
    onAddDisciplineReset(payload);
    setNotice("Cumplimiento registrado. La acumulacion disciplinaria se reinicia desde esa fecha.");
    event.currentTarget.reset();
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Comision disciplinaria" title="Control de amarillas" />
      <p className="helper-text">
        Los goles se mantienen por categoria. Las amarillas pueden operar por categoria o compartidas en toda la liga segun Reglas.
        Cuando se registra cumplimiento, la acumulacion disciplinaria se reinicia y deja de aparecer en este control; la ficha del jugador conserva sus tarjetas del torneo.
      </p>
      {notice && <p className="auth-ok">{notice}</p>}

      <div className="discipline-admin-grid">
        <form className="discipline-admin-form" onSubmit={submitAdjustment}>
          <h3>Ajuste manual</h3>
          <label>Jugador
            <SearchablePlayerSelect league={league} name="playerId" players={players} placeholder="Buscar jugador para ajustar..." />
          </label>
          <label>Torneo relacionado
            <CompetitionSelect league={league} name="competitionId" defaultValue={getDefaultCompetitionId(league)} />
          </label>
          <label>Movimiento
            <select name="direction" defaultValue="add">
              <option value="add">Sumar amarilla</option>
              <option value="subtract">Restar amarilla</option>
            </select>
          </label>
          <label>Cantidad
            <input name="value" type="number" min="1" max="10" defaultValue="1" />
          </label>
          <label>Fecha
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="wide-field">Motivo
            <textarea name="reason" required placeholder="Ej. Correccion de cedula, acuerdo de comision." />
          </label>
          <button className="primary" type="submit" disabled={!players.length}>Guardar ajuste</button>
        </form>

        <form className="discipline-admin-form" onSubmit={submitReset}>
          <h3>Cumplimiento / reset</h3>
          <label>Jugador
            <SearchablePlayerSelect league={league} name="playerId" players={players} placeholder="Buscar jugador suspendido..." />
          </label>
          <label>Fecha
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="wide-field">Motivo
            <textarea name="reason" required placeholder="Ej. Cumplio partido de suspension por acumulacion." />
          </label>
          <button className="primary" type="submit" disabled={!players.length}>Marcar cumplida</button>
        </form>
      </div>

      <div className="discipline-admin-list">
        <div className="discipline-list-head">
          <div>
            <h3>Acumulacion vigente</h3>
            <p className="helper-text">{filteredRows.length} de {rows.length} jugador(es) visibles con los filtros actuales.</p>
          </div>
          <div className="discipline-filters">
            <label>Buscar
              <input
                type="search"
                value={disciplineQuery}
                onChange={(event) => setDisciplineQuery(event.target.value)}
                placeholder="Nombre, numero o equipo"
              />
            </label>
            <label>Categoria
              <select value={disciplineCompetitionId} onChange={(event) => {
                setDisciplineCompetitionId(event.target.value);
                setDisciplineTeamId("");
              }}>
                <option value="">Todas</option>
                {competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>{competition.name}</option>
                ))}
              </select>
            </label>
            <label>Equipo
              <select value={disciplineTeamId} onChange={(event) => setDisciplineTeamId(event.target.value)}>
                <option value="">Todos</option>
                {visibleTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>
            <label>Estado
              <select value={disciplineStatus} onChange={(event) => setDisciplineStatus(event.target.value)}>
                <option value="all">Todos</option>
                <option value="suspended">Suspendidos</option>
                <option value="warning">En riesgo</option>
                <option value="tracking">En seguimiento</option>
              </select>
            </label>
          </div>
        </div>
        {filteredRows.map((row) => (
          <article className={`discipline-admin-card ${row.status}`} key={row.player.id}>
            <div>
              <strong>{row.player.name}</strong>
              <span>{row.team?.name || "Sin equipo"}{row.linkedPlayers?.length > 1 ? ` | ${row.linkedPlayers.length} registros vinculados` : ""}</span>
            </div>
            <div>
              <small>Amarillas</small>
              <span>{row.yellowCards}/{row.yellowLimit}</span>
            </div>
            <div>
              <small>Estado</small>
              <span>{row.message}</span>
            </div>
          </article>
        ))}
        {!rows.length && <p className="empty">No hay jugadores con acumulacion disciplinaria vigente.</p>}
        {Boolean(rows.length) && !filteredRows.length && <p className="empty">No hay jugadores que coincidan con los filtros.</p>}
      </div>

      <div className="discipline-admin-list">
        <div className="discipline-list-head">
          <div>
            <h3>Historial manual</h3>
            <p className="helper-text">{filteredManualHistory.length} de {manualHistory.length} movimiento(s) visibles con los filtros actuales.</p>
          </div>
        </div>
        {filteredManualHistory.map((item) => {
            const player = getPlayer(league, item.playerId);
            const isReset = item.value === undefined;
            return (
              <article className="discipline-admin-card" key={item.id}>
                <div>
                  <strong>{player?.name || "Jugador eliminado"}</strong>
                  <span>{isReset ? "Cumplimiento / reset" : `${Number(item.value || 0) > 0 ? "+" : ""}${item.value} amarilla(s)`}</span>
                </div>
                <div>
                  <small>Fecha</small>
                  <span>{item.date ? formatDate(item.date) : "Sin fecha"}</span>
                </div>
                <div>
                  <small>Motivo</small>
                  <span>{item.reason || item.notes || "Sin motivo"}</span>
                </div>
                <button className="danger" type="button" onClick={() => {
                  if (!window.confirm("¿Eliminar este movimiento manual?")) return;
                  if (isReset) onDeleteDisciplineReset(item.id);
                  else onDeleteDisciplineAdjustment(item.id);
                  setNotice("Movimiento eliminado.");
                }}>Quitar</button>
              </article>
            );
          })}
        {!manualHistory.length && <p className="empty">Aun no hay movimientos manuales.</p>}
        {Boolean(manualHistory.length) && !filteredManualHistory.length && <p className="empty">No hay movimientos manuales que coincidan con los filtros.</p>}
      </div>
    </section>
  );
}

function disciplineRowMatchesFilters(league, row, filters) {
  if (filters.status !== "all" && row.status !== filters.status) return false;
  const linkedPlayers = row.linkedPlayers?.length ? row.linkedPlayers : [row.player];
  return linkedPlayers.some((player) => disciplinePlayerMatchesFilters(league, player, filters));
}

function disciplineMovementMatchesFilters(league, item, filters) {
  const player = getPlayer(league, item.playerId);
  return player ? disciplinePlayerMatchesFilters(league, player, filters) : normalizeAdminSearchTerm("Jugador eliminado").includes(normalizeAdminSearchTerm(filters.query));
}

function disciplinePlayerMatchesFilters(league, player, filters) {
  const teamIds = getPlayerAdminTeamIds(league, player);
  const teams = teamIds.map((teamId) => getTeam(league, teamId)).filter(Boolean);
  const competitionIds = teams.map((team) => team.competitionId || getDefaultCompetitionId(league));
  const query = normalizeAdminSearchTerm(filters.query);
  if (filters.competitionId && !competitionIds.includes(filters.competitionId)) return false;
  if (filters.teamId && !teamIds.includes(filters.teamId)) return false;
  if (!query) return true;
  return getPlayerAdminSearchValues(league, player).some((value) => normalizeAdminSearchTerm(value).includes(query));
}

function PlayerSelect({ league, name, players }) {
  return (
    <select name={name} required>
      {players.map((player) => {
        const team = getTeam(league, player.teamId);
        const competition = getCompetition(league, player.competitionId || team?.competitionId);
        return (
          <option key={player.id} value={player.id}>
            #{player.number || "-"} {player.name} | {team?.name || "Sin equipo"} | {competition?.name || "Torneo"}
          </option>
        );
      })}
    </select>
  );
}

function SearchablePlayerSelect({ league, name, players, placeholder }) {
  const [query, setQuery] = useState("");
  const filteredPlayers = useMemo(() => {
    const term = normalizeAdminSearchTerm(query);
    const source = term
      ? players.filter((player) => {
        return getPlayerAdminSearchValues(league, player).some((value) => normalizeAdminSearchTerm(value).includes(term));
      })
      : players;
    return source.slice(0, 60);
  }, [league, players, query]);

  return (
    <div className="searchable-select">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder || "Buscar jugador..."}
        aria-label={placeholder || "Buscar jugador"}
      />
      <select name={name} required disabled={!filteredPlayers.length}>
        {filteredPlayers.map((player) => {
          const team = getTeam(league, player.teamId);
          const competition = getCompetition(league, player.competitionId || team?.competitionId);
          return (
            <option key={player.id} value={player.id}>
              #{player.number || "-"} {player.name} | {team?.name || "Sin equipo"} | {competition?.name || "Torneo"}
            </option>
          );
        })}
      </select>
      {!filteredPlayers.length && <small>No hay jugadores con esa busqueda.</small>}
    </div>
  );
}

function getPlayerAdminTeamIds(league, player) {
  const ids = new Set([player.teamId].filter(Boolean));
  for (const affiliation of league.teamAffiliations || []) {
    if (affiliation.status && affiliation.status !== "active") continue;
    if (affiliation.sourceTeamId === player.teamId) ids.add(affiliation.targetTeamId);
  }
  return [...ids];
}

function getPlayerAdminSearchValues(league, player) {
  const teamIds = getPlayerAdminTeamIds(league, player);
  const values = [player.name, player.number];
  for (const teamId of teamIds) {
    const team = getTeam(league, teamId);
    const competition = getCompetition(league, team?.competitionId || player.competitionId || getDefaultCompetitionId(league));
    values.push(team?.name, competition?.name);
  }
  return values;
}

function normalizeAdminSearchTerm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9ñÑ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

function getMatchEventLabel(type) {
  if (type === "goal") return "Gol";
  if (type === "own_goal") return "Autogol";
  if (type === "yellow") return "Amarilla";
  if (type === "red") return "Roja";
  return "Evento";
}

function getDelegateStatusLabel(status) {
  if (status === "pending_activation") return "pendiente de activacion";
  if (status === "active") return "activo";
  if (status === "disabled") return "desactivado";
  if (status === "suspended") return "suspendido";
  if (status === "deleted") return "eliminado";
  return "sin estado";
}

function getRefereeStatusLabel(status) {
  return getDelegateStatusLabel(status);
}

function SanctionsPanel({ league, onAddPlayerSanction, onDeletePlayerSanction }) {
  const activeLeague = scopeLeagueToCompetition(league, getDefaultCompetitionId(league));
  const sanctions = activeLeague.sanctions || [];
  const [sanctionNotice, setSanctionNotice] = useState("");

  function submitSanction(event) {
    event.preventDefault();
    if (!window.confirm("¿Confirmas agregar esta sancion extraordinaria?")) return;
    onAddPlayerSanction(getFormPayload(event.currentTarget));
    setSanctionNotice("Sancion agregada correctamente.");
    event.currentTarget.reset();
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Comision disciplinaria" title="Sanciones extraordinarias" />
      {sanctionNotice && <p className="auth-ok">{sanctionNotice}</p>}
      <form className="sanction-form" onSubmit={submitSanction}>
        <label>Torneo
          <CompetitionSelect league={league} name="competitionId" defaultValue={getDefaultCompetitionId(league)} />
        </label>
        <label>Jugador
          <select name="playerId" required>
            {activeLeague.players.map((player) => (
              <option key={player.id} value={player.id}>
                #{player.number} {player.name} | {getTeam(activeLeague, player.teamId)?.name || "Sin equipo"}
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
        <button className="primary" type="submit" disabled={!activeLeague.players.length}>Agregar sancion</button>
      </form>

      <div className="sanction-list">
        {sanctions.map((sanction) => {
          const player = getPlayer(activeLeague, sanction.playerId);
          const team = player ? getTeam(activeLeague, player.teamId) : null;
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
                  if (!window.confirm(`¿Seguro que quieres quitar la sancion de ${player?.name || "este jugador"}?`)) return;
                  onDeletePlayerSanction(sanction.id);
                  setSanctionNotice("Sancion eliminada correctamente.");
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
  const activeLeague = scopeLeagueToCompetition(league, getDefaultCompetitionId(league));
  const [injuryNotice, setInjuryNotice] = useState("");
  const injuries = [...(activeLeague.injuries || [])].sort((a, b) => (
    (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
    String(b.date || "").localeCompare(String(a.date || ""))
  ));

  function submitNewInjury(event) {
    event.preventDefault();
    if (!activeLeague.players.length) {
      window.alert("Primero registra jugadores para poder agregar lesiones.");
      return;
    }

    if (!window.confirm("¿Confirmas registrar esta lesion?")) return;
    onAddPlayerInjury(getFormPayload(event.currentTarget));
    setInjuryNotice("Lesion registrada. Si esta activa, se mostrara en la vista publica.");
    event.currentTarget.reset();
  }

  function updateInjury(event, injuryId) {
    event.preventDefault();
    if (!window.confirm("¿Guardar cambios de esta lesion?")) return;
    onUpdatePlayerInjury(injuryId, getFormPayload(event.currentTarget));
    setInjuryNotice("Lesion actualizada correctamente.");
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Salud y apoyo" title="Lesiones de jugadores" />
      <p className="helper-text">Registra lesiones activas para informar al publico y solicitar apoyo cuando la liga lo autorice. Los recuperados quedan como historial interno.</p>
      {injuryNotice && <p className="auth-ok">{injuryNotice}</p>}
      <form className="injury-form" onSubmit={submitNewInjury}>
        <label>Torneo
          <CompetitionSelect league={league} name="competitionId" defaultValue={getDefaultCompetitionId(league)} />
        </label>
        <label>Jugador
          <select name="playerId" required>
            {activeLeague.players.map((player) => (
              <option key={player.id} value={player.id}>
                #{player.number} {player.name} | {getTeam(activeLeague, player.teamId)?.name || "Sin equipo"}
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
        <button className="primary" type="submit" disabled={!activeLeague.players.length}>Registrar lesion</button>
      </form>

      <div className="injury-list">
        {injuries.map((injury) => {
          const player = getPlayer(activeLeague, injury.playerId);
          const team = player ? getTeam(activeLeague, player.teamId) : null;
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
                    {activeLeague.players.map((item) => (
                      <option key={item.id} value={item.id}>
                        #{item.number} {item.name} | {getTeam(activeLeague, item.teamId)?.name || "Sin equipo"}
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
                      if (!window.confirm(`¿Seguro que quieres eliminar la lesion de ${player?.name || "este jugador"}?`)) return;
                      onDeletePlayerInjury(injury.id);
                      setInjuryNotice("Lesion eliminada correctamente.");
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

function SuperAdmin({
  authToken,
  currentUser,
  onAddLeague,
  onAddSponsor,
  onDeleteLeague,
  onDeleteSponsor,
  onResetDemo,
  onToggleLeague,
  onUpdateLeagueMembership,
  onUpdateSponsor,
  store,
  userListRefreshKey
}) {
  const [membershipNotice, setMembershipNotice] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <section className="panel">
        <SectionHeading eyebrow="Nosotros" title="Control de ligas" />
        {membershipNotice && <p className="auth-ok">{membershipNotice}</p>}
        <form
          className="league-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!window.confirm("¿Confirmas crear esta liga?")) return;
            onAddLeague(getFormPayload(event.currentTarget));
            setMembershipNotice("Liga creada correctamente.");
            event.currentTarget.reset();
          }}
        >
          <label>Liga<input name="name" required placeholder="Nombre de la nueva liga" /></label>
          <label>Municipio<input name="city" required placeholder="Municipio o zona" /></label>
          <label>Admin asignado<input name="adminName" placeholder="Nombre del administrador" /></label>
          <label>Correo admin<input name="adminEmail" type="email" placeholder="correo del admin para enviar invitacion" /></label>
          <button className="primary" type="submit">Agregar liga</button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("¿Restaurar los datos demo? Esta accion reemplaza la informacion de demostracion.")) return;
              onResetDemo();
              setMembershipNotice("Demo restaurada correctamente.");
            }}
          >
            Restaurar demo
          </button>
        </form>
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Plataforma" title="Control de ligas" />
        <p className="helper-text">
          Aqui se controla el estado de cada liga, URL publica, contacto administrativo y notas internas. Todo queda sin limites comerciales de equipos, torneos o jugadores.
        </p>
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
                setMembershipNotice(`Datos de ${league.name} guardados correctamente.`);
              }}
            >
              <div className="membership-title">
                <strong>{league.name}</strong>
                <span>{league.city}</span>
              </div>
              <label className="wide-field">URL publica
                <input readOnly type="url" value={`${origin}/liga/${league.id}`} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <input type="hidden" name="plan" value={league.plan || ""} />
              <label>Estado
                <select name="status" defaultValue={league.status}>
                  <option value="active">Activa</option>
                  <option value="suspended">Suspendida</option>
                </select>
              </label>
              <input type="hidden" name="renewalDate" value={league.renewalDate || ""} />
              <label>Admin asignado<input name="ownerEmail" type="email" defaultValue={league.ownerEmail || ""} /></label>
              <label className="wide-field">Notas
                <textarea name="membershipNotes" defaultValue={league.membershipNotes || ""} placeholder="Contacto, acuerdos internos, observaciones de operacion, etc." />
              </label>
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
                      `Eliminar ${league.name} borrara torneos, equipos, jugadores, partidos, sanciones, identidad, avisos y usuarios administradores de esa liga.\n\nEscribe ELIMINAR para confirmar.`
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

      <SponsorManagement
        authToken={authToken}
        leagues={store.leagues}
        onAddSponsor={onAddSponsor}
        onDeleteSponsor={onDeleteSponsor}
        onUpdateSponsor={onUpdateSponsor}
      />

      <UserManagement authToken={authToken} currentUser={currentUser} leagues={store.leagues} refreshKey={userListRefreshKey} />
      <AuditPanel authToken={authToken} leagues={store.leagues} />
    </>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
      reject(new Error("Solo se permiten imagenes PNG, JPG o WebP."));
      return;
    }
    if (file.size > MAX_IMAGE_DATA_URL_LENGTH) {
      reject(new Error(`La imagen debe pesar menos de ${MAX_UPLOAD_SIZE_MB} MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

async function resolveImageUpload(file, { authToken, leagueId, scope } = {}) {
  const dataUrl = await readFileAsDataUrl(file);
  return resolveImageDataUrlUpload(dataUrl, { authToken, leagueId, scope });
}

async function resolveImageDataUrlUpload(dataUrl, { authToken, leagueId, scope } = {}) {
  if (!dataUrl || !authToken) return dataUrl;
  const response = await uploadImage(authToken, { dataUrl, leagueId, scope });
  return response.url;
}

async function getSponsorPayload(form, fallbackImageUrl = "", uploadContext = {}) {
  const payload = getFormPayload(form);
  const file = form.elements.imageFile?.files?.[0];
  const imageUrl = file ? await resolveImageUpload(file, uploadContext) : fallbackImageUrl;
  return { ...payload, imageUrl };
}

async function getTeamPayload(form, fallbackLogoUrl = "", uploadContext = {}) {
  const payload = getFormPayload(form);
  const file = form.elements.logoFile?.files?.[0];
  const shouldRemoveLogo = payload.removeLogo === "on";
  const logoUrl = shouldRemoveLogo
    ? ""
    : file && file.size
      ? await resolveImageUpload(file, uploadContext)
      : fallbackLogoUrl;

  return { ...payload, logoUrl };
}

async function getPlayerPayload(form, fallbackPhotoUrl = "", uploadContext = {}) {
  const payload = getFormPayload(form);
  const file = form.elements.photoFile?.files?.[0];
  const shouldRemovePhoto = payload.removePhoto === "on";
  const photoAuthorized = payload.photoAuthorized === "on" || payload.photoAuthorized === true || payload.photoAuthorized === "true" || payload.photoAuthorized === "1";
  const optimizedPhotoDataUrl = String(payload.photoDataUrl || "");
  const photoUrl = shouldRemovePhoto
    ? ""
    : !photoAuthorized
      ? ""
      : optimizedPhotoDataUrl
        ? await resolveImageDataUrlUpload(optimizedPhotoDataUrl, uploadContext)
        : file && file.size
          ? await resolveImageUpload(file, uploadContext)
          : fallbackPhotoUrl;

  return { ...payload, photoUrl };
}

function resetTeamForm(form) {
  form.reset();
  for (const fieldName of ["name", "coach", "assistantCoach", "address"]) {
    const field = form.elements[fieldName];
    if (field) field.value = "";
  }
  if (form.elements.logoFile) form.elements.logoFile.value = "";
  if (form.elements.colors) form.elements.colors.value = "#0f766e";
}

function SponsorManagement({ authToken, leagues, onAddSponsor, onDeleteSponsor, onUpdateSponsor }) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const activeLeagues = leagues.filter((league) => league.status !== "deleted");

  async function submitNewSponsor(event) {
    event.preventDefault();
    setError("");
    setUploading(true);
    try {
      const form = event.currentTarget;
      const payload = await getSponsorPayload(form, "", { authToken, leagueId: form.elements.leagueId?.value, scope: "sponsors" });
      if (!payload.imageUrl) {
        setError("Selecciona una imagen para el banner.");
        return;
      }
      if (!window.confirm("¿Confirmas agregar esta publicidad a la liga seleccionada?")) return;
      onAddSponsor(payload.leagueId, payload);
      event.currentTarget.reset();
      setNotice("Publicidad agregada correctamente.");
    } catch (sponsorError) {
      setError(sponsorError.message || "No se pudo guardar la publicidad.");
    } finally {
      setUploading(false);
    }
  }

  async function submitSponsorEdit(event, leagueId, sponsor) {
    event.preventDefault();
    setError("");
    setUploading(true);
    try {
      const payload = await getSponsorPayload(event.currentTarget, sponsor.imageUrl || "", { authToken, leagueId, scope: "sponsors" });
      if (!window.confirm(`¿Guardar cambios de la publicidad de ${sponsor.name}?`)) return;
      onUpdateSponsor(leagueId, sponsor.id, payload);
      setNotice("Publicidad actualizada correctamente.");
    } catch (sponsorError) {
      setError(sponsorError.message || "No se pudo actualizar la publicidad.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Super admin" title="Publicidad por liga" />
      <p className="helper-text">Cada liga tiene sus propios banners. Solo el super admin puede crear, editar o eliminar publicidad.</p>
      {notice && <p className="auth-ok">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
      {uploading && <p className="auth-ok">Subiendo imagen...</p>}

      <form className="sponsor-form" onSubmit={submitNewSponsor}>
        <label>Liga
          <select name="leagueId" required>
            {activeLeagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
          </select>
        </label>
        <label>Patrocinador<input name="name" required placeholder="Nombre comercial" /></label>
        <label>Imagen banner<input name="imageFile" type="file" accept={IMAGE_UPLOAD_ACCEPT} required /></label>
        <label>Enlace<input name="linkUrl" type="url" placeholder="https://..." /></label>
        <label>Orden<input name="sortOrder" type="number" min="0" defaultValue="0" /></label>
        <label>Estado
          <select name="status" defaultValue="active">
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </label>
        <input type="hidden" name="placement" value="home_banner" />
        <label className="wide-field">Notas<textarea name="notes" placeholder="Vigencia, contacto o indicaciones internas." /></label>
        <button className="primary" type="submit">Agregar publicidad</button>
      </form>

      <div className="sponsor-admin-list">
        {activeLeagues.map((league) => {
          const sponsors = [...(league.sponsors || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name));
          return (
            <section className="sponsor-league-block" key={league.id}>
              <div className="sponsor-league-head">
                <strong>{league.name}</strong>
                <span>{sponsors.length} banner(s)</span>
              </div>
              <div className="sponsor-card-grid">
                {sponsors.map((sponsor) => (
                  <form className="sponsor-admin-card" key={sponsor.id} onSubmit={(event) => submitSponsorEdit(event, league.id, sponsor)}>
                    <div className="sponsor-preview">
                      {sponsor.imageUrl ? <img alt={sponsor.name} src={sponsor.imageUrl} /> : <span>Sin imagen</span>}
                    </div>
                    <label>Patrocinador<input name="name" defaultValue={sponsor.name} required /></label>
                    <label>Reemplazar imagen<input name="imageFile" type="file" accept={IMAGE_UPLOAD_ACCEPT} /></label>
                    <label>Enlace<input name="linkUrl" type="url" defaultValue={sponsor.linkUrl || ""} placeholder="https://..." /></label>
                    <label>Orden<input name="sortOrder" type="number" min="0" defaultValue={sponsor.sortOrder || 0} /></label>
                    <label>Estado
                      <select name="status" defaultValue={sponsor.status || "active"}>
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </label>
                    <input type="hidden" name="placement" value={sponsor.placement || "home_banner"} />
                    <label className="wide-field">Notas<textarea name="notes" defaultValue={sponsor.notes || ""} /></label>
                    <div className="inline-actions wide-field">
                      <button className="primary" type="submit">Guardar publicidad</button>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`¿Eliminar publicidad de ${sponsor.name}?`)) return;
                          onDeleteSponsor(league.id, sponsor.id);
                          setNotice("Publicidad eliminada correctamente.");
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </form>
                ))}
                {!sponsors.length && <p className="empty">Esta liga aun no tiene publicidad cargada.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function generateSecureTemporaryPassword() {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = `${lower}${upper}${digits}`;
  const pick = (source) => source[getSecureRandomIndex(source.length)];
  const chars = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(all),
    pick(all),
    pick(all),
    pick(all),
    pick(all),
    pick(all),
    pick(all),
    pick(all),
    pick(all)
  ];
  return shuffleSecure(chars).join("");
}

function getSecureRandomIndex(max) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function shuffleSecure(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = getSecureRandomIndex(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function normalizeUserPayload(payload) {
  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions
    : payload.permissions
      ? [payload.permissions]
      : [];
  return {
    ...payload,
    email: String(payload.email || "").trim().toLowerCase(),
    permissions,
    leagueId: ["league_admin", "admin_limited"].includes(payload.role) ? payload.leagueId : ""
  };
}

const ADMIN_PERMISSION_OPTIONS = [
  { id: "matches", label: "Programar partidos" },
  { id: "referees", label: "Arbitros" },
  { id: "match_sheets", label: "Actas arbitrales" },
  { id: "delegates", label: "Delegados" },
  { id: "settings", label: "Reglas de liga" }
];

function getUserRoleLabel(role) {
  if (role === "super_admin") return "Super admin";
  if (role === "league_admin") return "Admin de liga";
  if (role === "admin_limited") return "Admin limitado";
  if (role === "referee") return "Arbitro";
  if (role === "team_delegate") return "Delegado";
  return "Usuario";
}

function getPermissionLabel(permissionId) {
  if (permissionId === "*") return "Control completo";
  return ADMIN_PERMISSION_OPTIONS.find((permission) => permission.id === permissionId)?.label || permissionId;
}

function UserManagement({ authToken, currentUser, leagues, refreshKey = 0 }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const adminUsers = users.filter((user) => !["team_delegate", "referee"].includes(user.role));
  const delegateUserCount = users.filter((user) => user.role === "team_delegate").length;
  const refereeUserCount = users.filter((user) => user.role === "referee").length;

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
    setError("");
    if (["league_admin", "admin_limited"].includes(payload.role) && !payload.leagueId) {
      setError("Selecciona una liga para este acceso administrativo.");
      return false;
    }
    if (payload.role === "admin_limited" && !payload.permissions?.length) {
      setError("Selecciona al menos un permiso para el admin limitado.");
      return false;
    }
    if (!window.confirm(`¿Confirmas crear o agregar acceso para ${payload.email}?`)) return false;
    const response = await createUser(authToken, normalizeUserPayload(payload));
    await loadUsers();
    setNotice(response.invitation?.whatsappMessage
      ? `Invitacion creada. Copia y envia este mensaje:\n\n${response.invitation.whatsappMessage}`
      : "Acceso agregado correctamente. El usuario ya puede entrar con su contraseña actual.");
    return true;
  }

  async function handleUpdate(userId, payload) {
    setNotice("");
    setError("");
    if (["league_admin", "admin_limited"].includes(payload.role) && !payload.leagueId) {
      setError("Selecciona una liga para este admin de liga.");
      return false;
    }
    if (payload.role === "admin_limited" && !payload.permissions?.length) {
      setError("Selecciona al menos un permiso para el admin limitado.");
      return false;
    }
    if (!window.confirm("¿Guardar cambios de este usuario?")) return false;
    await updateUser(authToken, userId, normalizeUserPayload(payload));
    await loadUsers();
    setNotice("Usuario actualizado correctamente.");
    return true;
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

  async function handleResendInvitation(user) {
    setNotice("");
    setError("");
    try {
      const response = await resendUserInvitation(authToken, user.id);
      setNotice(response.invitation?.whatsappMessage
        ? `Invitacion regenerada. Copia y envia este mensaje:\n\n${response.invitation.whatsappMessage}`
        : "Invitacion regenerada correctamente.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="panel">
      <SectionHeading eyebrow="Accesos" title="Usuarios administradores" />
      <form
        className="user-create-form"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            const created = await handleCreate(getFormPayload(event.currentTarget));
            if (created) event.currentTarget.reset();
          } catch (requestError) {
            setError(requestError.message);
          }
        }}
      >
        <label>
          Nombre
          <input name="name" required placeholder="Nombre del usuario" />
        </label>
        <label>
          Correo
          <input name="email" required type="email" placeholder="correo@liga.com" />
        </label>
        <label>
          Telefono
          <input name="phone" placeholder="354..." />
        </label>
        <label>
          Rol
          <select name="role" defaultValue="league_admin">
            <option value="league_admin">Admin de liga</option>
            <option value="admin_limited">Admin limitado</option>
            <option value="super_admin">Super admin</option>
          </select>
        </label>
        <label>
          Liga asignada
          <select name="leagueId" defaultValue="">
            <option value="">Sin liga</option>
            {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
          </select>
        </label>
        <fieldset className="permission-checklist">
          <legend>Permisos para admin limitado</legend>
          {ADMIN_PERMISSION_OPTIONS.map((permission) => (
            <label key={permission.id}>
              <input name="permissions" type="checkbox" value={permission.id} />
              {permission.label}
            </label>
          ))}
        </fieldset>
        <button className="primary" type="submit">Crear invitacion</button>
      </form>

      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="auth-ok">{notice}</p>}
      <p className="helper-text">Usa correos reales y accesibles. El usuario recibira un enlace de activacion para crear su propia contraseña. Si el correo ya existe, LIGATEC agrega el nuevo acceso a la misma cuenta.</p>
      {(delegateUserCount > 0 || refereeUserCount > 0) && (
        <p className="helper-text">
          {delegateUserCount} usuario(s) delegado se administran desde Admin de liga &gt; Delegados.
          {" "}
          {refereeUserCount} usuario(s) arbitro se administran desde Admin de liga &gt; Arbitros.
        </p>
      )}

      <div className="user-list">
        {adminUsers.map((user) => {
          const isSelf = user.id === currentUser?.id;
          const adminAccesses = (user.accesses || []).filter((access) => ["super_admin", "league_admin", "admin_limited"].includes(access.role));
          const primaryAccess = adminAccesses.find((access) => access.role === user.role && (access.leagueId || "") === (user.leagueId || "")) || adminAccesses[0] || null;
          const selectedPermissions = primaryAccess?.permissions || [];
          return (
            <form
              className="user-card"
              key={user.id}
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await handleUpdate(user.id, getFormPayload(event.currentTarget));
                } catch (requestError) {
                  setError(requestError.message);
                }
              }}
            >
              <label>
                Nombre
                <input name="name" defaultValue={user.name} required />
              </label>
              <label>
                Correo
                <input name="email" defaultValue={user.email} type="email" required />
              </label>
              <label>
                Rol
                <select name="role" defaultValue={user.role} disabled={isSelf}>
                  <option value="league_admin">Admin de liga</option>
                  <option value="admin_limited">Admin limitado</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </label>
              {isSelf && <input type="hidden" name="role" value={user.role} />}
              <label>
                Liga asignada
                <select name="leagueId" defaultValue={user.leagueId || ""}>
                  <option value="">Sin liga</option>
                  {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
                </select>
              </label>
              <label>
                Estado
                <select name="status" defaultValue={user.status} disabled={isSelf}>
                  <option value="pending_activation">Pendiente de activacion</option>
                  <option value="active">Activo</option>
                  <option value="disabled">Deshabilitado</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </label>
              {isSelf && <input type="hidden" name="status" value={user.status} />}
              <fieldset className="permission-checklist user-permission-checklist">
                <legend>Permisos admin limitado</legend>
                {ADMIN_PERMISSION_OPTIONS.map((permission) => (
                  <label key={permission.id}>
                    <input
                      name="permissions"
                      type="checkbox"
                      value={permission.id}
                      defaultChecked={selectedPermissions.includes(permission.id)}
                    />
                    {permission.label}
                  </label>
                ))}
              </fieldset>
              {adminAccesses.length > 0 && (
                <div className="user-access-summary">
                  <strong>Accesos activos</strong>
                  {adminAccesses.map((access) => (
                    <span key={access.id || `${access.role}-${access.leagueId}`}>
                      {getUserRoleLabel(access.role)} | {access.leagueName || "Todas las ligas"} | {access.status}
                      {access.permissions?.length ? ` | ${access.permissions.map(getPermissionLabel).join(", ")}` : ""}
                    </span>
                  ))}
                </div>
              )}
              <button className="primary" type="submit">Guardar usuario</button>
              <button type="button" disabled={isSelf} onClick={() => handleResendInvitation(user)}>
                Reenviar invitacion
              </button>
              <button className="danger" type="button" disabled={isSelf} onClick={() => handleDisable(user.id)}>
                Deshabilitar
              </button>
              <button className="danger ghost-danger" type="button" disabled={isSelf} onClick={() => handleDelete(user)}>
                Eliminar
              </button>
              {isSelf && <small className="self-user-note">Tu cuenta no se puede deshabilitar ni eliminar desde tu propia sesion.</small>}
              {user.lockedUntil && (
                <small className="self-user-note">
                  Bloqueado hasta {formatDate(user.lockedUntil)}. El usuario puede recuperar acceso con invitacion o recuperacion de contraseña.
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
  match_create: "Partido creado",
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
        <article><strong>Roles</strong><span>Super admin controla ligas y accesos; admin de liga captura informacion; publico consulta sin cuenta.</span></article>
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

function TeamSelect({ league, name, defaultValue, value, onChange }) {
  return (
    <select name={name} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange} required>
      {league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
    </select>
  );
}

function getSortedVenues(league, { includeInactive = true } = {}) {
  return [...(league.venues || [])]
    .filter((venue) => includeInactive || (venue.status || "active") === "active")
    .sort((a, b) => (
      Number((b.status || "active") === "active") - Number((a.status || "active") === "active") ||
      String(a.name || "").localeCompare(String(b.name || ""))
    ));
}

function VenueSelect({ league, name = "venue", defaultValue = "", ariaLabel, required = false }) {
  const activeVenues = getSortedVenues(league, { includeInactive: false });
  const hasDefaultVenue = defaultValue && activeVenues.some((venue) => venue.name === defaultValue);

  return (
    <select name={name} defaultValue={defaultValue || ""} aria-label={ariaLabel} required={required}>
      <option value="">Cancha por definir</option>
      {activeVenues.map((venue) => (
        <option key={venue.id} value={venue.name}>{venue.name}</option>
      ))}
      {defaultValue && !hasDefaultVenue && <option value={defaultValue}>{defaultValue}</option>}
    </select>
  );
}

function PlayerPositionSelect({ name, defaultValue = "Delantero", ariaLabel }) {
  return (
    <select name={name} defaultValue={defaultValue} aria-label={ariaLabel} required>
      {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
    </select>
  );
}

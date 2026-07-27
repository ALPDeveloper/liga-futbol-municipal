import { useEffect, useMemo, useState } from "react";
import { DEFAULT_IDENTITY } from "../data/defaultIdentity.js";
import { fetchAuditLogs } from "../lib/auditApi.js";
import { createBackup, downloadBackup, fetchBackups, verifyBackup } from "../lib/backupApi.js";
import { MAX_IMAGE_DATA_URL_LENGTH, calculatePlayerAppearanceEligibility, calculateStandings, calculateYellowCardDiscipline, formatDate, getCompetition, getCurrentDisplayRound, getDefaultCompetitionId, getEligiblePlayersForTeam, getPlayer, getPlayerAffiliationForTeam, getPlayerNumberForTeam, getPlayoffPhaseLabel, getTeam, isPlayerEligibleForTeam, isPlayerHistoricalOnly, scopeLeagueToCompetition } from "../lib/domain.js";
import { getFormPayload } from "./forms.js";
import { SectionHeading } from "./SectionHeading.jsx";
import { PlayerPhotoUploader } from "./PlayerPhotoUploader.jsx";
import { createUser, deleteUser, disableUser, fetchUsers, resendUserInvitation, updateUser } from "../lib/userApi.js";
import { createTeamDelegate, deleteTeamDelegate, fetchTeamDelegates, resendTeamDelegateInvitation, updateTeamDelegate, updateTeamRosterPermission, updateTeamRosterPermissionsBulk } from "../lib/teamDelegateApi.js";
import { createReferee, deleteReferee, fetchFinalizedMatchReports, fetchReferees, fetchRefereeMatchSheets, publishFinalizedMatchReport, resendRefereeInvitation, reviewRefereeMatchSheet, updateMatchReferees, updateReferee } from "../lib/refereeApi.js";
import { uploadImage } from "../lib/uploadApi.js";
import { updateMatchSheetEventItem } from "../lib/matchSheet.js";
import alpLogo from "../../assets/alp-logo.png";
import ligatecLogo from "../../assets/ligatec-logo.png";

const PLAYOFF_PHASE_OPTIONS = [
  { value: "round32", label: "16vos de final", teams: 32 },
  { value: "round16", label: "8vos de final", teams: 16 },
  { value: "quarterfinal", label: "Cuartos de final", teams: 8 },
  { value: "semifinal", label: "Semifinal", teams: 4 },
  { value: "final", label: "Final", teams: 2 }
];

const PLAYER_POSITION_OPTIONS = ["Arquero", "Defensor", "Mediocampista", "Delantero"];
const PLAYER_STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "historical", label: "Solo historial" }
];
const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_UPLOAD_SIZE_MB = Math.round((MAX_IMAGE_DATA_URL_LENGTH / 1024 / 1024) * 10) / 10;
const ADMIN_MATCH_REPORT_STATUSES = "finalized,pending_captain_review,correction_requested,both_signed";
const ADMIN_SHEET_STEPS = [
  { id: "match", number: 1, label: "Partido", hint: "Info" },
  { id: "score", number: 2, label: "Marcador", hint: "Resultado" },
  { id: "events", number: 3, label: "Eventos", hint: "Registro" },
  { id: "notes", number: 4, label: "Obs.", hint: "Acta" },
  { id: "finish", number: 5, label: "Finalizar", hint: "Publicar" }
];
const ADMIN_SHEET_EVENT_ACTIONS = [
  { type: "goal", label: "Gol", icon: "⚽", className: "event-goal" },
  { type: "yellow", label: "Amarilla", icon: "🟨", className: "event-yellow" },
  { type: "red", label: "Roja", icon: "🟥", className: "event-red" },
  { type: "own_goal", label: "Autogol", icon: "🥅", className: "event-own-goal" },
  { type: "injury_note", label: "Lesion", icon: "✚", className: "event-injury" },
  { type: "other_note", label: "Otro", icon: "⋯", className: "event-other" }
];
const ADMIN_SHEET_OBSERVATION_CHIPS = ["Juego limpio", "Lluvia", "Retraso", "Suspension temporal", "Sin novedades"];

function needsAdminMatchReportAttention(report) {
  return report?.status === "finalized" || report?.payload?.signatureIssue?.status === "pending_admin_attention";
}

function AdminIcon({ type = "home" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };
  const paths = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h5v-5h4v5h5v-9.5" /></>,
    platform: <><path d="M4 5h16v10H4z" /><path d="M8 19h8" /><path d="M12 15v4" /><path d="M8 9h.01" /><path d="M12 9h.01" /><path d="M16 9h.01" /></>,
    leagues: <><path d="M4 6h16" /><path d="M6 6v14" /><path d="M18 6v14" /><path d="M9 10h6" /><path d="M9 14h6" /><path d="M4 20h16" /></>,
    operation: <><path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h7" /><path d="m16 15 2 2 4-5" /></>,
    users: <><circle cx="8" cy="8" r="3" /><path d="M2.5 20a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.5" /><path d="M15 15.5a5 5 0 0 1 6.5 4.5" /></>,
    teams: <><path d="M4 8h16v10H4z" /><path d="M8 8V5h8v3" /><path d="M9 13h6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M3 11h18" /></>,
    commission: <><path d="M12 3 2.5 20h19z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 1 1-2.98 2.98l-.04-.04A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6 1.8 1.8 0 0 0-.5 1.3V21a2.1 2.1 0 1 1-4.2 0v-.06A1.8 1.8 0 0 0 8 19.4a1.8 1.8 0 0 0-1.78.56l-.04.04A2.1 2.1 0 1 1 3.2 17l.04-.04A1.8 1.8 0 0 0 3.6 15a1.8 1.8 0 0 0-1.6-1H2a2.1 2.1 0 1 1 0-4.2h.06A1.8 1.8 0 0 0 3.6 8a1.8 1.8 0 0 0-.36-1.98L3.2 6A2.1 2.1 0 1 1 6.18 3.02l.04.04A1.8 1.8 0 0 0 8 3.6 1.8 1.8 0 0 0 9.3 2H9.3a2.1 2.1 0 1 1 4.2 0v.06A1.8 1.8 0 0 0 15 3.6a1.8 1.8 0 0 0 1.78-.56l.04-.04A2.1 2.1 0 1 1 19.8 6l-.04.04A1.8 1.8 0 0 0 19.4 8c.28.6.86 1 1.6 1h.01a2.1 2.1 0 1 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" /></>,
    announcements: <><path d="M4 13h3l9 5V6L7 11H4z" /><path d="M18 9a4 4 0 0 1 0 6" /></>,
    capture: <><circle cx="12" cy="12" r="7" /><path d="M12 8v8" /><path d="M8 12h8" /></>,
    matches: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M4 10h16" /><path d="m8 15 2 2 5-5" /></>,
    sheet: <><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v5h5" /><path d="m9 15 2 2 5-6" /></>,
    delegates: <><circle cx="12" cy="7" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /><path d="M9 14h6" /></>,
    referees: <><path d="M6 4v16" /><path d="M6 5h11l-2 4 2 4H6" /></>,
    squads: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M3 20a5 5 0 0 1 10 0" /><path d="M11 20a5 5 0 0 1 10 0" /></>,
    affiliations: <><path d="M7 7h10" /><path d="m14 4 3 3-3 3" /><path d="M17 17H7" /><path d="m10 14-3 3 3 3" /></>,
    venues: <><path d="M12 21s7-5.2 7-12a7 7 0 0 0-14 0c0 6.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>,
    tournaments: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 3" /><path d="M17 6h3a3 3 0 0 1-3 3" /><path d="M9 12h6" /></>,
    advertising: <><path d="M4 7h12l4 5-4 5H4z" /><path d="M8 10h5" /><path d="M8 14h7" /></>,
    audit: <><path d="M5 4h14v16H5z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h2" /><path d="m14 16 1.5 1.5L19 14" /></>,
    backups: <><path d="M6 5h12v14H6z" /><path d="M9 5V3h6v2" /><path d="M9 11h6" /><path d="M9 15h4" /></>,
    discipline: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h3" /></>,
    sanctions: <><path d="M12 3 3 8v5c0 5 4 8 9 9 5-1 9-4 9-9V8z" /><path d="M12 8v5" /><path d="M12 17h.01" /></>,
    injuries: <><path d="M12 5v14" /><path d="M5 12h14" /><rect x="4" y="4" width="16" height="16" rx="4" /></>,
    rules: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></>,
    identity: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M12 3v18" /><path d="m4 7 8 4 8-4" /><path d="M8 14h3" /><path d="M13 14h3" /></>,
    player: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    match: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16" /><path d="M4 12h16" /></>,
    playoffs: <><path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" /></>
  };
  return <svg {...common}>{paths[type] || paths.home}</svg>;
}

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
  onResolveMatchDiscipline,
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
    <main className="page admin-console-page">
      <section className={`admin-shell admin-shell-app ${adminPanel === "super" ? "super-admin-only-shell" : ""}`}>
        {adminPanel !== "super" && (
          <div className="admin-sidebar admin-app-switcher">
            <div className="admin-app-switcher-head">
              <img alt="LIGATEC" src={ligatecLogo} />
              <div>
                <span className="eyebrow">Panel administrativo</span>
                <h1>Operacion</h1>
              </div>
            </div>
            {currentUser && (
              <p className="admin-user-note">
                {activeRole === "super_admin" ? "Control total de plataforma" : `Editando ${league.name}`}
              </p>
            )}
            <div className="admin-app-switcher-nav">
              <button className={adminPanel === "league" ? "active" : ""} onClick={() => onSetAdminPanel("league")}>
                <span><AdminIcon type="home" /></span>
                Admin de liga
              </button>
              {canUseSuperAdmin && (
                <button className={adminPanel === "super" ? "active" : ""} onClick={() => onSetAdminPanel("super")}>
                  <span>◆</span>
                  Super admin
                </button>
              )}
              <button className={adminPanel === "model" ? "active" : ""} onClick={() => onSetAdminPanel("model")}>
                <span>◌</span>
                Modelo futuro
              </button>
            </div>
          </div>
        )}
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
              onResolveMatchDiscipline={onResolveMatchDiscipline}
              onSaveIdentity={onSaveIdentity}
              onSaveMatchSheet={onSaveMatchSheet}
              onSaveRules={onSaveRules}
              onUpdateAnnouncement={onUpdateAnnouncement}
              onUpdateCompetition={onUpdateCompetition}
              onUpdateMatch={onUpdateMatch}
              onUpdatePlayer={onUpdatePlayer}
              onUpdatePlayerInjury={onUpdatePlayerInjury}
              onUpdateTeam={onUpdateTeam}
              onOpenSuperAdmin={canUseSuperAdmin ? () => onSetAdminPanel("super") : undefined}
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
              onOpenLeagueAdmin={() => onSetAdminPanel("league")}
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
  onResolveMatchDiscipline,
  onSaveIdentity,
  onSaveMatchSheet,
  onSaveRules,
  onUpdateAnnouncement,
  onUpdateCompetition,
  onUpdateMatch,
  onUpdatePlayer,
  onUpdatePlayerInjury,
  onUpdateTeam,
  onOpenSuperAdmin,
  onMergeDuplicatePlayer,
  onUpdateTeamAffiliationPlayerNumber,
  onUpdateVenue,
  selectedAccess
}) {
  const identity = league.identity || DEFAULT_IDENTITY;
  const currentCompetitionId = getDefaultCompetitionId(league);
  const currentCompetition = getCompetition(league, currentCompetitionId);
  const currentCompetitionLeague = scopeLeagueToCompetition(league, currentCompetitionId);
  const [activeSection, setActiveSection] = useState("home");
  const [identityNotice, setIdentityNotice] = useState("");
  const activeRole = selectedAccess?.role || currentUser?.role;
  const accessPermissions = new Set(Array.isArray(selectedAccess?.permissions) ? selectedAccess.permissions : []);
  const hasFullLeagueAccess = ["super_admin", "league_admin"].includes(activeRole);
  const limitedSectionIds = new Set(["capture", "lists", "delegates", "referees", "rules", "sheet", "sanctions"]);
  const canUseSection = (requiredPermissions = []) => (
    hasFullLeagueAccess ||
    (activeRole === "admin_limited" &&
      requiredPermissions.some((permission) => accessPermissions.has(permission)))
  );
  const sections = [
    { id: "capture", label: "Captura", shortLabel: "Captura", icon: "capture", group: "Operacion", permissions: ["matches", "teams", "players"], description: "Alta rapida de equipos, jugadores, partidos y calendarios.", metric: `${currentCompetitionLeague.matches.filter((match) => match.status !== "finished" && match.status !== "walkover").length} activos` },
    { id: "lists", label: "Partidos y datos", shortLabel: "Partidos", icon: "matches", group: "Operacion", permissions: ["matches", "teams", "players", "read_only"], description: "Edita calendario, marcadores, equipos y jugadores existentes.", metric: `${currentCompetitionLeague.matches.length} partidos` },
    { id: "sheet", label: "Actas", shortLabel: "Actas", icon: "sheet", group: "Operacion", permissions: ["match_sheets"], description: "Captura actas administrativas y publica resultados oficiales.", metric: `${currentCompetitionLeague.matches.filter((match) => match.status === "finished" || match.status === "walkover").length} capturadas` },
    { id: "delegates", label: "Delegados", shortLabel: "Delegados", icon: "delegates", group: "Usuarios", permissions: ["delegates"], description: "Gestiona accesos de delegados y permisos de plantilla.", metric: "Equipos" },
    { id: "referees", label: "Arbitros", shortLabel: "Arbitros", icon: "referees", group: "Usuarios", permissions: ["referees"], description: "Crea arbitros, asignaciones y seguimiento de actas digitales.", metric: league.city || "Municipio" },
    { id: "squads", label: "Plantillas", shortLabel: "Plantillas", icon: "squads", group: "Equipos", permissions: ["players", "teams", "read_only"], description: "Consulta plantillas por equipo en una vista limpia.", metric: `${currentCompetitionLeague.players.length} jugadores` },
    { id: "affiliations", label: "Afiliaciones", shortLabel: "Afiliaciones", icon: "affiliations", group: "Equipos", permissions: ["players", "teams"], description: "Relaciona equipos, fusiona duplicados y controla afiliados.", metric: `${league.teamAffiliations?.length || 0} activas` },
    { id: "venues", label: "Canchas", shortLabel: "Canchas", icon: "venues", group: "Calendario", permissions: ["settings", "calendar"], description: "Administra sedes y disponibilidad para programación.", metric: `${league.venues?.length || 0} canchas` },
    { id: "tournaments", label: "Torneos", shortLabel: "Torneos", icon: "tournaments", group: "Configuracion", permissions: ["settings"], description: "Controla categorias, temporadas e historicos.", metric: `${league.competitions?.length || 0} torneos` },
    { id: "announcements", label: "Avisos", shortLabel: "Avisos", icon: "announcements", group: "Comunicacion", permissions: ["settings"], description: "Publica comunicados visibles para usuarios y publico.", metric: `${league.announcements?.length || 0} avisos` },
    { id: "discipline", label: "Disciplina", shortLabel: "Disciplina", icon: "discipline", group: "Comision", permissions: ["discipline"], description: "Controla amarillas, acumulaciones y ajustes disciplinarios.", metric: "Amarillas" },
    { id: "sanctions", label: "Sanciones", shortLabel: "Sanciones", icon: "sanctions", group: "Comision", permissions: ["discipline"], description: "Resuelve rojas, sanciones extraordinarias y comision.", metric: `${league.sanctions?.length || 0} casos` },
    { id: "injuries", label: "Lesiones", shortLabel: "Lesiones", icon: "injuries", group: "Comision", permissions: ["players", "discipline"], description: "Registra lesiones, cirugias y apoyos requeridos.", metric: `${league.injuries?.length || 0} registros` },
    { id: "rules", label: "Reglas", shortLabel: "Reglas", icon: "rules", group: "Configuracion", permissions: ["settings"], description: "Define defaults, tarjetas, liguilla y criterios deportivos.", metric: "Reglamento" },
    { id: "identity", label: "Identidad", shortLabel: "Identidad", icon: "identity", group: "Configuracion", permissions: ["settings"], description: "Ajusta marca, colores, textos y portada publica.", metric: "Publica" }
  ];
  const visibleSections = sections.filter((section) => (
    canUseSection(section.permissions) &&
    (activeRole !== "admin_limited" || limitedSectionIds.has(section.id))
  ));

  const sectionGroups = visibleSections.reduce((groups, section) => {
    const group = section.group || "Otros";
    if (!groups[group]) groups[group] = [];
    groups[group].push(section);
    return groups;
  }, {});
  const workspaceDefinitions = [
    { id: "operation", group: "Operacion", label: "Operacion diaria", shortLabel: "Operacion", icon: "operation", description: "Partidos, capturas y actas oficiales.", accent: "green" },
    { id: "users", group: "Usuarios", label: "Usuarios y accesos", shortLabel: "Usuarios", icon: "users", description: "Delegados, arbitros y permisos operativos.", accent: "blue" },
    { id: "teams", group: "Equipos", label: "Equipos y plantillas", shortLabel: "Equipos", icon: "teams", description: "Plantillas, afiliaciones y control de jugadores.", accent: "green" },
    { id: "calendar", group: "Calendario", label: "Calendario y sedes", shortLabel: "Calendario", icon: "calendar", description: "Canchas, fechas y programacion.", accent: "blue" },
    { id: "commission", group: "Comision", label: "Comision disciplinaria", shortLabel: "Comision", icon: "commission", description: "Tarjetas, sanciones, lesiones y resoluciones.", accent: "gold" },
    { id: "settings", group: "Configuracion", label: "Configuracion", shortLabel: "Config.", icon: "settings", description: "Torneos, reglamento e identidad publica.", accent: "green" },
    { id: "communication", group: "Comunicacion", label: "Comunicacion", shortLabel: "Avisos", icon: "announcements", description: "Avisos y mensajes para usuarios.", accent: "blue" }
  ];
  const visibleWorkspaces = workspaceDefinitions
    .map((workspace) => ({ ...workspace, sections: sectionGroups[workspace.group] || [] }))
    .filter((workspace) => workspace.sections.length);
  const getWorkspaceScreenId = (workspaceId) => `workspace:${workspaceId}`;
  const activeWorkspace = visibleWorkspaces.find((workspace) => getWorkspaceScreenId(workspace.id) === activeSection) || null;
  const activeSectionMeta = visibleSections.find((section) => section.id === activeSection) || null;
  const isModuleScreen = Boolean(activeSectionMeta);
  const activeSectionWorkspace = activeSectionMeta ? visibleWorkspaces.find((workspace) => workspace.group === activeSectionMeta.group) : null;
  const parentSectionId = activeSectionWorkspace ? getWorkspaceScreenId(activeSectionWorkspace.id) : "home";
  const featuredSections = ["capture", "lists", "sheet", "delegates"]
    .map((sectionId) => visibleSections.find((section) => section.id === sectionId))
    .filter(Boolean);

  useEffect(() => {
    const isHome = activeSection === "home";
    const isKnownModule = visibleSections.some((section) => section.id === activeSection);
    const isKnownWorkspace = visibleWorkspaces.some((workspace) => getWorkspaceScreenId(workspace.id) === activeSection);
    if (!isHome && visibleSections.length && !isKnownModule && !isKnownWorkspace) {
      setActiveSection("home");
    }
  }, [activeSection, visibleSections, visibleWorkspaces]);

  const activeScheduledMatches = currentCompetitionLeague.matches.filter((match) => isActiveScheduleStatus(match.status));
  const finishedMatches = currentCompetitionLeague.matches.filter((match) => match.status === "finished" || match.status === "walkover");
  const pendingSheets = currentCompetitionLeague.matches.filter((match) => (
    match.status === "finished" || match.status === "walkover"
  ) && !match.sheetPublished).length;
  const hiddenCompetitionCount = (league.competitions || []).filter((competition) => competition.publicVisibility === "hidden" || competition.hidden).length;
  const activeAnnouncements = (league.announcements || []).filter((announcement) => announcement.status === "active").length;

  return (
    <section className="admin-league-app">
      <header className="admin-league-top">
        <img className="admin-league-alp-watermark" alt="" src={alpLogo} aria-hidden="true" />
        <div className="admin-league-title">
          {activeSection !== "home" && (
            <button className="admin-back-button" type="button" onClick={() => setActiveSection(parentSectionId)} aria-label="Regresar">←</button>
          )}
          <div>
            <span>{activeSection === "home" ? "Admin de liga" : activeWorkspace?.label || activeSectionMeta?.group || "Modulo"}</span>
            <h2>{activeSection === "home" ? league.name : activeWorkspace?.shortLabel || activeSectionMeta?.label}</h2>
            <small>{activeWorkspace?.description || activeSectionMeta?.description || `${currentCompetition?.name || "TORNEO"} · ${currentCompetition?.season || league.season}`}</small>
          </div>
        </div>
        {activeRole === "super_admin" && onOpenSuperAdmin && (
          <button className="admin-super-return-button" type="button" onClick={onOpenSuperAdmin}>
            <AdminIcon type="platform" />
            Super Admin
          </button>
        )}
        <div className="admin-league-status">
          <span>{league.status === "active" ? "Liga activa" : getMatchStatusLabel(league.status)}</span>
          <strong>{currentCompetitionLeague.teams.length} equipos</strong>
        </div>
      </header>

      <nav className="admin-league-nav admin-workspace-nav" aria-label="Areas del panel admin">
        <button className={activeSection === "home" ? "active" : ""} type="button" onClick={() => setActiveSection("home")}>
          <span><AdminIcon type="home" /></span>
          Inicio
        </button>
        {visibleWorkspaces.map((workspace) => (
          <button
            className={activeSection === getWorkspaceScreenId(workspace.id) || activeSectionMeta?.group === workspace.group ? "active" : ""}
            key={workspace.id}
            type="button"
            onClick={() => setActiveSection(getWorkspaceScreenId(workspace.id))}
          >
            <span><AdminIcon type={workspace.icon} /></span>
            {workspace.shortLabel}
          </button>
        ))}
      </nav>

      {activeSection === "home" && (
        <section className="admin-league-home">
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

          <article className="admin-operation-card">
            <img className="admin-operation-watermark" alt="" src={ligatecLogo} aria-hidden="true" />
            <div className="admin-operation-head">
              <span>Centro operativo</span>
              <strong>{league.name}</strong>
              <small>{currentCompetition?.name || "TORNEO"} · {currentCompetition?.season || league.season}</small>
            </div>
            <div className="admin-operation-overview" aria-label="Resumen operativo de la liga">
              <div>
                <span><AdminIcon type="teams" /></span>
                <strong>{currentCompetitionLeague.teams.length}</strong>
                <small>Equipos activos</small>
              </div>
              <div>
                <span><AdminIcon type="player" /></span>
                <strong>{currentCompetitionLeague.players.length}</strong>
                <small>Jugadores registrados</small>
              </div>
              <div>
                <span><AdminIcon type="matches" /></span>
                <strong>{activeScheduledMatches.length}</strong>
                <small>Partidos programados</small>
              </div>
              <div className={pendingSheets ? "needs-attention" : ""}>
                <span><AdminIcon type="sheet" /></span>
                <strong>{pendingSheets}</strong>
                <small>Actas por publicar</small>
              </div>
            </div>
            <div className="admin-operation-insights">
              <span><AdminIcon type="announcements" /> {activeAnnouncements} aviso(s) activo(s)</span>
              <span><AdminIcon type="tournaments" /> {(league.competitions || []).length} torneo(s) creados</span>
              <span><AdminIcon type="identity" /> {hiddenCompetitionCount} oculto(s) al publico</span>
            </div>
            <div className="admin-operation-actions">
              {visibleSections.filter((section) => ["capture", "lists", "sheet"].includes(section.id)).map((section) => (
                <button key={section.id} type="button" onClick={() => setActiveSection(section.id)}>
                  <span><AdminIcon type={section.icon} /></span>
                  {section.shortLabel}
                </button>
              ))}
            </div>
          </article>

          <div className="admin-league-summary" aria-label="Resumen administrativo">
            <article><span>Equipos</span><strong>{currentCompetitionLeague.teams.length}</strong></article>
            <article><span>Jugadores</span><strong>{currentCompetitionLeague.players.length}</strong></article>
            <article><span>Programados</span><strong>{activeScheduledMatches.length}</strong></article>
            <article><span>Finalizados</span><strong>{finishedMatches.length}</strong></article>
          </div>

          <div className="admin-home-action-grid">
            {featuredSections.map((section) => (
              <button key={section.id} type="button" onClick={() => setActiveSection(section.id)}>
                <span><AdminIcon type={section.icon} /></span>
                <strong>{section.shortLabel}</strong>
                <small>{section.description}</small>
              </button>
            ))}
          </div>

          <div className="admin-workspace-grid" aria-label="Areas administrativas">
            {visibleWorkspaces.map((workspace) => (
              <button className={`admin-workspace-card ${workspace.accent}`} key={workspace.id} type="button" onClick={() => setActiveSection(getWorkspaceScreenId(workspace.id))}>
                <span><AdminIcon type={workspace.icon} /></span>
                <strong>{workspace.label}</strong>
                <small>{workspace.description}</small>
                <em>{workspace.sections.length} funcion(es)</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeWorkspace && (
        <section className="admin-workspace-screen">
          <div className="admin-function-grid">
            {activeWorkspace.sections.map((section) => (
              <button className="admin-function-card" key={section.id} type="button" onClick={() => setActiveSection(section.id)}>
                <span><AdminIcon type={section.icon} /></span>
                <strong>{section.label}</strong>
                <small>{section.description}</small>
                <em>{section.metric}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {isModuleScreen && (
        <section className="admin-module-screen">
          <div className="admin-section-tabs compact" aria-label="Cambiar modulo">
            {(visibleWorkspaces.find((item) => item.group === activeSectionMeta?.group)?.sections || visibleSections).map((section) => (
              <button
                className={activeSection === section.id ? "active" : ""}
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
              >
                <span><AdminIcon type={section.icon} /></span>
                {section.shortLabel}
              </button>
            ))}
          </div>

          <div className="admin-module-content">
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
                onLinkPlayerIdentity={onAddDisciplineLink}
                onDeletePlayerIdentityLink={onDeleteDisciplineLink}
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
                onResolveMatchDiscipline={onResolveMatchDiscipline}
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
              <IdentityPanel
                identity={identity}
                league={league}
                notice={identityNotice}
                onSaveIdentity={onSaveIdentity}
                setIdentityNotice={setIdentityNotice}
              />
            )}
          </div>
        </section>
      )}
    </section>
  );
}

function TournamentsPanel({ league, onAddCompetition, onUpdateCompetition }) {
  const activeCompetitions = (league.competitions || []).filter((competition) => competition.status !== "archived");
  const publicCompetitions = (league.competitions || []).filter((competition) => !["archived", "hidden"].includes(competition.status));
  const hiddenCompetitions = (league.competitions || []).filter((competition) => competition.status === "hidden");
  const archivedCompetitions = (league.competitions || []).filter((competition) => competition.status === "archived");
  const [tournamentNotice, setTournamentNotice] = useState("");
  const currentCompetition = getCompetition(league, getDefaultCompetitionId(league));

  function updateCompetitionWithNotice(competitionId, payload) {
    onUpdateCompetition(competitionId, payload);
    setTournamentNotice("Torneo actualizado correctamente.");
  }

  return (
    <section className="panel admin-data-panel config-admin-panel tournaments-admin-panel">
      <SectionHeading eyebrow="Temporadas" title="Torneos de la liga" />
      {tournamentNotice && <p className="auth-ok">{tournamentNotice}</p>}
      <div className="admin-data-hero config-hero">
        <div>
          <span>Control de categorias</span>
          <strong>{publicCompetitions.length} visible(s)</strong>
          <small>{currentCompetition?.name || "Sin torneo principal"} es el torneo principal actual. {hiddenCompetitions.length} oculto(s).</small>
        </div>
        <b>{archivedCompetitions.length} historico(s)</b>
      </div>
      <div className="config-compact-guide">
        <span><strong>Publicado:</strong> visible en portada, paneles y selectores publicos.</span>
        <span><strong>Oculto:</strong> existe y opera en admin, pero no aparece al publico.</span>
        <span><strong>Historico:</strong> conserva tabla, calendario, goleo y actas sin saturar la operacion diaria.</span>
      </div>
      <form className="tournament-form" onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm("¿Confirmas crear este torneo/categoria?")) return;
        onAddCompetition(getTournamentFormPayload(event.currentTarget));
        setTournamentNotice("Torneo creado correctamente.");
        event.currentTarget.reset();
      }}>
        <h3>Nuevo torneo o categoria</h3>
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
            <option value="active">Publicado en portada</option>
            <option value="hidden">Oculto del publico</option>
            <option value="archived">Historico archivado</option>
          </select>
        </label>
        <button className="primary" type="submit">Crear torneo</button>
      </form>

      <TournamentList title="Torneos operativos" competitions={activeCompetitions} league={league} onUpdateCompetition={updateCompetitionWithNotice} />
      {!!archivedCompetitions.length && (
        <details className="archive-box config-details">
          <summary>Historico archivado ({archivedCompetitions.length})</summary>
          <TournamentList title="" competitions={archivedCompetitions} league={league} onUpdateCompetition={updateCompetitionWithNotice} />
        </details>
      )}
    </section>
  );
}

function IdentityPanel({ identity, league, notice, onSaveIdentity, setIdentityNotice }) {
  const highlightsCount = (league.highlights || []).length;
  return (
    <section className="panel admin-data-panel config-admin-panel identity-admin-panel">
      <SectionHeading eyebrow="Configuracion" title="Identidad publica de la liga" />
      {notice && <p className="auth-ok">{notice}</p>}
      <div className="identity-dashboard">
        <div className="identity-preview-card" style={{
          "--identity-primary": identity.primaryColor,
          "--identity-secondary": identity.secondaryColor,
          "--identity-accent": identity.accentColor
        }}>
          <span>Vista publica</span>
          <strong>{league.name}</strong>
          <small>{league.city} · {league.season}</small>
          <b>{identity.nickname || "Distintivo local pendiente"}</b>
        </div>
        <div className="identity-metrics">
          <span><strong>{highlightsCount}</strong> destacados</span>
          <span><strong>{identity.activities ? "Si" : "No"}</strong> rasgos</span>
          <span><strong>{league.adBanner ? "Si" : "No"}</strong> anuncio</span>
        </div>
      </div>
      <form
        className="identity-form config-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!window.confirm("¿Guardar los cambios de identidad publica de la liga?")) return;
          onSaveIdentity(getFormPayload(event.currentTarget));
          setIdentityNotice("Identidad publica guardada correctamente.");
        }}
      >
        <div className="config-form-section">
          <h3>Datos principales</h3>
          <label>Nombre de la liga<input name="name" required defaultValue={league.name} /></label>
          <label>Municipio o zona<input name="city" required defaultValue={league.city} /></label>
          <label>Temporada<input name="season" required defaultValue={league.season} /></label>
        </div>
        <div className="config-form-section">
          <h3>Marca local</h3>
          <label>Distintivo local<input name="nickname" defaultValue={identity.nickname} placeholder="Ej. Pueblo de las 3 campanas" /></label>
          <label>Actividades o rasgos<input name="activities" defaultValue={identity.activities} placeholder="Ej. Aguacate, pan" /></label>
          <label>Patrocinador / anuncio<input name="adBanner" defaultValue={league.adBanner} /></label>
        </div>
        <div className="config-form-section color-section">
          <h3>Colores</h3>
          <label>Principal<input name="primaryColor" type="color" defaultValue={identity.primaryColor} /></label>
          <label>Secundario<input name="secondaryColor" type="color" defaultValue={identity.secondaryColor} /></label>
          <label>Acento<input name="accentColor" type="color" defaultValue={identity.accentColor} /></label>
        </div>
        <div className="config-form-section wide-config-section">
          <h3>Contenido publico</h3>
          <label>Texto publico<textarea name="publicIntro" defaultValue={identity.publicIntro} /></label>
          <label>Destacados manuales<textarea name="highlights" defaultValue={(league.highlights || []).join("\n")} placeholder="Un destacado por linea" /></label>
        </div>
        <button className="primary" type="submit">Guardar identidad</button>
      </form>
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
  const [squadQuery, setSquadQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const selectedTeam = sortedTeams.find((team) => team.id === selectedTeamId) || sortedTeams[0] || null;
  const squadPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    const query = normalizeAdminSearchTerm(squadQuery);
    return getEligiblePlayersForTeam(league, selectedTeam.id)
      .filter((player) => {
        const affiliation = getPlayerAffiliationForTeam(league, player.id, selectedTeam.id);
        const originTeam = getTeam(league, player.teamId);
        const playerNumber = getPlayerNumberForTeam(league, player.id, selectedTeam.id) || "";
        const position = getPlayerPositionOptionValue(player.position);
        if (positionFilter !== "all" && position !== positionFilter) return false;
        if (!query) return true;
        return normalizeAdminSearchTerm(`${playerNumber} ${player.name} ${position} ${originTeam?.name || ""} ${affiliation ? "afiliado" : ""}`).includes(query);
      })
      .sort((a, b) => (
        Number(getPlayerNumberForTeam(league, a.id, selectedTeam.id) || 99999) -
        Number(getPlayerNumberForTeam(league, b.id, selectedTeam.id) || 99999) ||
        String(a.name || "").localeCompare(String(b.name || ""))
      ));
  }, [league, positionFilter, selectedTeam, squadQuery]);
  const allTeamPlayers = useMemo(() => (
    selectedTeam ? getEligiblePlayersForTeam(league, selectedTeam.id) : []
  ), [league, selectedTeam]);
  const positionSummary = PLAYER_POSITION_OPTIONS.map((position) => ({
    position,
    count: allTeamPlayers.filter((player) => getPlayerPositionOptionValue(player.position) === position).length
  }));

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
    <section className="panel admin-data-panel squad-admin-panel">
      <SectionHeading eyebrow="Equipos" title="Plantillas por equipo" />
      {!sortedTeams.length ? (
        <p className="empty">Aun no hay equipos registrados.</p>
      ) : (
        <>
          <div className="admin-data-hero squad-hero">
            <div>
              <span>Plantilla activa</span>
              <strong>{selectedTeam.name}</strong>
              <small>{selectedTeam.coach ? `Entrenador: ${selectedTeam.coach}` : "Entrenador sin registrar"}</small>
            </div>
            <b className={selectedTeam.status === "withdrawn" ? "danger" : ""}>{selectedTeam.status === "withdrawn" ? "Baja" : "Activo"}</b>
          </div>

          <div className="admin-filter-console squad-toolbar">
            <label>Equipo
              <select value={selectedTeam?.id || ""} onChange={(event) => setSelectedTeamId(event.target.value)}>
                {sortedTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label>Buscar jugador
              <input type="search" value={squadQuery} onChange={(event) => setSquadQuery(event.target.value)} placeholder="Nombre, numero o equipo origen" />
            </label>
            <label>Posicion
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
                <option value="all">Todas</option>
                {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
          </div>

          <div className="squad-card">
            <div className="squad-head">
              <div>
                <span className="eyebrow">Plantilla</span>
                <h3>{selectedTeam.name}</h3>
                <p>{squadPlayers.length} de {allTeamPlayers.length} jugador(es) visibles.</p>
              </div>
              <div className="squad-metrics">
                <span><strong>{allTeamPlayers.length}</strong> Total</span>
                {positionSummary.map((item) => (
                  <span key={item.position}><strong>{item.count}</strong> {item.position}</span>
                ))}
              </div>
            </div>

            <div className="squad-player-grid" aria-label={`Plantilla ${selectedTeam.name}`}>
              {squadPlayers.map((player) => (
                <article className="squad-player-card" key={player.id}>
                  <b>#{getPlayerNumberForTeam(league, player.id, selectedTeam.id) || "-"}</b>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{getPlayerPositionOptionValue(player.position)}</span>
                    {getPlayerAffiliationForTeam(league, player.id, selectedTeam.id) && (
                      <small className="affiliate-badge">Afiliado de {getTeam(league, player.teamId)?.name || "origen"}</small>
                    )}
                  </div>
                  <em>{player.status === "inactive" ? "Inactivo" : "Activo"}</em>
                </article>
              ))}
              {!squadPlayers.length && <p className="empty">No hay jugadores que coincidan con esos filtros.</p>}
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
  const [delegateListTab, setDelegateListTab] = useState("delegates");
  const [bulkRosterUntil, setBulkRosterUntil] = useState("");
  const [delegateTeamSearch, setDelegateTeamSearch] = useState("");
  const [selectedDelegateTeamId, setSelectedDelegateTeamId] = useState("");
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
  const createTeamSearchOptions = useMemo(() => {
    const query = normalizeAdminSearchTerm(delegateTeamSearch);
    if (!query) return createTeamOptions;
    return createTeamOptions.filter((team) => {
      const competition = getCompetition(league, team.competitionId || getDefaultCompetitionId(league));
      return normalizeAdminSearchTerm(`${team.name} ${competition?.name || ""}`).includes(query);
    });
  }, [createTeamOptions, delegateTeamSearch, league]);
  const activeBulkCompetitionId = delegateCompetitionFilter !== "all" ? delegateCompetitionFilter : "";
  const activeBulkCompetition = competitions.find((competition) => competition.id === activeBulkCompetitionId);
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

  useEffect(() => {
    if (selectedDelegateTeamId && createTeamOptions.some((team) => team.id === selectedDelegateTeamId)) return;
    setSelectedDelegateTeamId(createTeamOptions[0]?.id || "");
  }, [createTeamOptions, selectedDelegateTeamId]);

  useEffect(() => {
    if (!createTeamSearchOptions.length) return;
    if (selectedDelegateTeamId && createTeamSearchOptions.some((team) => team.id === selectedDelegateTeamId)) return;
    setSelectedDelegateTeamId(createTeamSearchOptions[0].id);
  }, [createTeamSearchOptions, selectedDelegateTeamId]);

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
      setDelegateTeamSearch("");
      setSelectedDelegateTeamId(createTeamOptions[0]?.id || "");
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

  async function bulkUpdateRosterPermissions(registrationEnabled) {
    if (!activeBulkCompetitionId) {
      setError("Selecciona un torneo o categoria para aplicar la accion masiva.");
      return;
    }
    const scopedTeams = teams.filter((team) => (team.competitionId || getDefaultCompetitionId(league)) === activeBulkCompetitionId);
    if (!scopedTeams.length) {
      setError("No hay equipos en esa categoria.");
      return;
    }
    const actionLabel = registrationEnabled ? "abrir" : "cerrar";
    if (!window.confirm(`¿${actionLabel.toUpperCase()} registro de plantilla para ${scopedTeams.length} equipo(s) de ${activeBulkCompetition?.name || "esta categoria"}?\n\nSolo se afectara esta liga y esta categoria.`)) return;
    const actionKey = `bulk-roster-${activeBulkCompetitionId}`;
    setBusyAction(actionKey);
    setNotice(`${registrationEnabled ? "Abriendo" : "Cerrando"} registros por categoria...`);
    setError("");
    try {
      const nextDelegates = await updateTeamRosterPermissionsBulk(authToken, {
        leagueId: league.id,
        competitionId: activeBulkCompetitionId,
        registrationEnabled,
        enabledUntil: registrationEnabled ? bulkRosterUntil : "",
        notes: registrationEnabled
          ? `Registro abierto por lote${bulkRosterUntil ? ` hasta ${bulkRosterUntil}` : ""}`
          : "Registro cerrado por lote"
      });
      setDelegates(nextDelegates);
      setNotice(`Listo: registro ${registrationEnabled ? "abierto" : "cerrado"} para ${scopedTeams.length} equipo(s) de ${activeBulkCompetition?.name || "la categoria"}.`);
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudieron actualizar los registros por categoria.");
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

  const activeDelegates = delegates.filter((delegate) => delegate.status === "active").length;
  const pendingDelegates = delegates.filter((delegate) => delegate.status === "pending_activation").length;
  const inactiveDelegates = delegates.filter((delegate) => delegate.status === "disabled" || delegate.status === "suspended").length;
  const teamsWithoutDelegate = Math.max(teams.length - assignedTeamIds.size, 0);

  return (
    <section className="panel delegate-admin-shell">
      <div className="delegate-admin-hero">
        <span className="delegate-hero-icon" aria-hidden="true">◉</span>
        <div>
          <small>Delegados</small>
          <h2>Centro de delegados</h2>
          <p>Gestiona responsables por equipo, invitaciones y control de registro de plantillas.</p>
        </div>
        <a href="#delegate-create" className="delegate-hero-action">Crear delegado</a>
      </div>

      <div className="delegate-quick-actions" aria-label="Acciones rapidas de delegados">
        <a href="#delegate-create"><span aria-hidden="true">+</span><b>Crear delegado</b><small>Invita a un responsable</small></a>
        <button type="button" onClick={() => setDelegateListTab("delegates")}><span aria-hidden="true">☷</span><b>Delegados y equipos</b><small>Ver asignaciones</small></button>
        <button type="button" onClick={() => setDelegateListTab("teams")}><span aria-hidden="true">□</span><b>Plantillas</b><small>Permisos de registro</small></button>
      </div>

      {notice && <p className="auth-ok">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}

      <div className="delegate-summary-strip delegate-summary-cards">
        <span><strong>{delegates.length}</strong> delegados totales</span>
        <span><strong>{activeDelegates}</strong> activos</span>
        <span><strong>{teams.length}</strong> equipos</span>
        <span><strong>{teamsWithoutDelegate}</strong> sin delegado</span>
        <span><strong>{pendingDelegates}</strong> invitaciones pendientes</span>
        <span><strong>{inactiveDelegates}</strong> inactivos</span>
      </div>

      <form className="delegate-create-form delegate-wizard-card" id="delegate-create" onSubmit={submitDelegate}>
        <div className="delegate-wizard-head">
          <div>
            <small>Crear delegado</small>
            <h3>Nueva invitacion</h3>
          </div>
          <div className="delegate-stepper" aria-label="Flujo de creacion">
            <span className="active">1<b>Delegado</b></span>
            <span className="active">2<b>Asignacion</b></span>
            <span>3<b>Resumen</b></span>
          </div>
        </div>
        <fieldset>
          <legend>Informacion del delegado</legend>
          <label>Nombre completo<input name="name" required placeholder="Ej. Juan Perez Lopez" /></label>
          <label>Telefono<input name="phone" required inputMode="tel" placeholder="Ej. 353 123 4567" /></label>
          <label>Correo electronico<input name="email" required type="email" placeholder="Ej. juan@correo.com" /></label>
        </fieldset>
        <fieldset>
          <legend>Asignar a equipo</legend>
          <label>Torneo / categoria
            <select value={delegateCompetitionFilter} onChange={(event) => setDelegateCompetitionFilter(event.target.value)}>
              <option value="all">Todos los torneos</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>{competition.name}</option>
              ))}
            </select>
          </label>
          <label>Equipo
            <input
              aria-label="Buscar equipo para delegado"
              value={delegateTeamSearch}
              onChange={(event) => setDelegateTeamSearch(event.target.value)}
              placeholder="Teclea equipo, ej. Guas..."
            />
            {delegateTeamSearch && createTeamSearchOptions.length > 0 && (
              <div className="delegate-team-suggestions" aria-label="Sugerencias de equipo">
                {createTeamSearchOptions.slice(0, 6).map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => {
                      setSelectedDelegateTeamId(team.id);
                      setDelegateTeamSearch(team.name);
                      if (team.competitionId) setDelegateCompetitionFilter(team.competitionId);
                    }}
                  >
                    <strong>{team.name}</strong>
                    <small>{getCompetition(league, team.competitionId || getDefaultCompetitionId(league))?.name || "Categoria"}</small>
                  </button>
                ))}
              </div>
            )}
            <select name="teamId" required disabled={!createTeamSearchOptions.length} value={selectedDelegateTeamId} onChange={(event) => setSelectedDelegateTeamId(event.target.value)}>
              {createTeamSearchOptions.map((team) => (
                <option key={team.id} value={team.id}>{team.name} | {getCompetition(league, team.competitionId)?.name || "Categoria"}</option>
              ))}
            </select>
          </label>
        </fieldset>
        <p className="delegate-form-note">Se enviara una invitacion con enlace unico para que el delegado active su cuenta.</p>
        <button className="primary delegate-submit-button" type="submit" disabled={!createTeamOptions.length || busyAction === "create-delegate"}>
          {busyAction === "create-delegate" ? "Creando invitacion..." : "Crear y generar invitacion"}
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

      <div className="delegate-filter-bar" id="delegate-list">
        <label>Buscar
          <input
            type="search"
            value={delegateSearch}
            onChange={(event) => setDelegateSearch(event.target.value)}
            placeholder="Delegado, equipo o correo..."
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

      <div className="delegate-tabs" role="tablist" aria-label="Vista de delegados">
        <button type="button" role="tab" aria-selected={delegateListTab === "delegates"} className={delegateListTab === "delegates" ? "active" : ""} onClick={() => setDelegateListTab("delegates")}>Delegados</button>
        <button type="button" role="tab" aria-selected={delegateListTab === "teams"} className={delegateListTab === "teams" ? "active" : ""} onClick={() => setDelegateListTab("teams")}>Equipos</button>
      </div>

      <div className="delegate-grid">
        {delegateListTab === "teams" && (
        <div className="delegate-list-panel">
          <div className="delegate-section-head">
            <h3>Permisos por equipo</h3>
            <small>{filteredTeams.length} equipo(s)</small>
          </div>
          <div className="delegate-bulk-permissions">
            <div>
              <strong>{activeBulkCompetition?.name || "Selecciona categoria"}</strong>
              <small>La accion masiva solo afecta equipos de esta liga y categoria.</small>
            </div>
            <label>Abierto hasta
              <input type="datetime-local" value={bulkRosterUntil} onChange={(event) => setBulkRosterUntil(event.target.value)} />
            </label>
            <div className="inline-actions">
              <button type="button" disabled={!activeBulkCompetitionId || busyAction === `bulk-roster-${activeBulkCompetitionId}`} onClick={() => bulkUpdateRosterPermissions(true)}>
                Abrir registro a todos
              </button>
              <button className="danger ghost-danger" type="button" disabled={!activeBulkCompetitionId || busyAction === `bulk-roster-${activeBulkCompetitionId}`} onClick={() => bulkUpdateRosterPermissions(false)}>
                Cerrar registro a todos
              </button>
            </div>
          </div>
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
        )}

        {delegateListTab === "delegates" && (
        <div className="delegate-list-panel">
          <div className="delegate-section-head">
            <h3>Lista de delegados</h3>
            <small>{filteredDelegates.length} resultado(s)</small>
          </div>
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
                      <details className="delegate-card-actions">
                        <summary>Acciones de acceso</summary>
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
        )}
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
  const [finalizedReports, setFinalizedReports] = useState([]);
  const [refereeSearch, setRefereeSearch] = useState("");
  const [refereeStatusFilter, setRefereeStatusFilter] = useState("all");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(getDefaultCompetitionId(league));
  const [matchSearch, setMatchSearch] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState("scheduled");
  const [assignmentCoverageFilter, setAssignmentCoverageFilter] = useState("missing_central");
  const [selectedRoundFilter, setSelectedRoundFilter] = useState("next");
  const [assignmentFeedback, setAssignmentFeedback] = useState({});
  const [activeRefereeTask, setActiveRefereeTask] = useState("assign");
  const [selectedAssignmentMatch, setSelectedAssignmentMatch] = useState(null);
  const [focusedAssignmentMatchId, setFocusedAssignmentMatchId] = useState("");
  const [showRefereeCreateSheet, setShowRefereeCreateSheet] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showRefereeHelp, setShowRefereeHelp] = useState(false);
  const competitions = useMemo(() => [...(league.competitions || [])].sort((a, b) => a.name.localeCompare(b.name)), [league.competitions]);
  const selectedCompetition = getCompetition(league, selectedCompetitionId);
  const competitionLeague = useMemo(
    () => scopeLeagueToCompetition(league, selectedCompetitionId || getDefaultCompetitionId(league)),
    [league, selectedCompetitionId]
  );
  const displayRound = useMemo(() => getCurrentDisplayRound(competitionLeague.matches), [competitionLeague.matches]);
  const roundOptions = useMemo(() => (
    [...new Set(competitionLeague.matches.map((match) => match.round).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
  ), [competitionLeague.matches]);
  const activeReferees = useMemo(
    () => referees.filter((referee) => referee.status === "active"),
    [referees]
  );
  const pendingReferees = useMemo(() => referees.filter((referee) => referee.status === "pending_activation"), [referees]);
  const inactiveReferees = useMemo(() => referees.filter((referee) => referee.status === "disabled"), [referees]);
  const suspendedReferees = useMemo(() => referees.filter((referee) => referee.status === "suspended"), [referees]);
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
        if (!isActiveScheduleStatus(match.status)) return false;
        if (selectedRoundFilter !== "all") {
          const targetRound = selectedRoundFilter === "next" ? displayRound : Number(selectedRoundFilter);
          if (targetRound && Number(match.round || 0) !== Number(targetRound)) return false;
        }
        if (assignmentCoverageFilter === "missing_central" && match.centralRefereeUserId) return false;
        if (assignmentCoverageFilter === "incomplete" && isMatchRefereeAssignmentComplete(match)) return false;
        if (assignmentCoverageFilter === "complete" && !isMatchRefereeAssignmentComplete(match)) return false;
        if (!query) return true;
        return normalizeAdminSearchTerm(`${getMatchAdminLabel(league, match)} ${match.venue || ""} ${match.date || ""}`).includes(query);
      })
      .sort((a, b) => (
        String(a.date || "").localeCompare(String(b.date || "")) ||
        Number(a.round || 0) - Number(b.round || 0) ||
        String(a.time || "").localeCompare(String(b.time || ""))
      ));
  }, [assignmentCoverageFilter, competitionLeague.matches, displayRound, league, matchSearch, matchStatusFilter, selectedRoundFilter]);
  const matchSearchSuggestions = useMemo(() => {
    const query = normalizeAdminSearchTerm(matchSearch);
    if (!query) return [];
    return [...competitionLeague.matches]
      .filter((match) => {
        if (!isActiveScheduleStatus(match.status)) return false;
        return normalizeAdminSearchTerm(`${getMatchAdminLabel(league, match)} ${match.venue || ""} ${match.date || ""} jornada ${match.round || ""}`).includes(query);
      })
      .sort((a, b) => (
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.time || "").localeCompare(String(b.time || ""))
      ))
      .slice(0, 6);
  }, [competitionLeague.matches, league, matchSearch]);
  const assignmentPendingCount = useMemo(
    () => competitionLeague.matches.filter((match) => isActiveScheduleStatus(match.status) && !match.centralRefereeUserId).length,
    [competitionLeague.matches]
  );
  const assignmentIncompleteCount = useMemo(
    () => competitionLeague.matches.filter((match) => isActiveScheduleStatus(match.status) && !isMatchRefereeAssignmentComplete(match)).length,
    [competitionLeague.matches]
  );
  const assignmentCompleteCount = useMemo(
    () => competitionLeague.matches.filter((match) => isActiveScheduleStatus(match.status) && isMatchRefereeAssignmentComplete(match)).length,
    [competitionLeague.matches]
  );
  const scheduledMatches = useMemo(
    () => competitionLeague.matches.filter((match) => isActiveScheduleStatus(match.status)),
    [competitionLeague.matches]
  );
  const nextScheduledMatch = useMemo(() => (
    [...scheduledMatches].sort((a, b) => (
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.time || "").localeCompare(String(b.time || ""))
    ))[0] || null
  ), [scheduledMatches]);
  const matchGroups = useMemo(() => {
    const groups = new Map();
    for (const match of filteredMatches) {
      const key = match.date || `round-${match.round || "sin-fecha"}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          title: match.date ? String(formatDate(match.date)).toLocaleUpperCase("es-MX") : "FECHA POR DEFINIR",
          subtitle: (match.stage || "regular") === "playoff" ? (match.playoffRound || "Liguilla") : `Jornada ${match.round || "-"}`,
          matches: []
        });
      }
      groups.get(key).matches.push(match);
    }
    return [...groups.values()];
  }, [filteredMatches]);
  const signatureIssueReports = finalizedReports.filter((report) => report.payload?.signatureIssue?.status === "pending_admin_attention");
  const readyFinalizedReports = finalizedReports.filter((report) => report.status === "finalized");
  const actaAttentionCount = pendingSheets.length + finalizedReports.length;

  function openRefereeCreateScreen() {
    setLastInvitation(null);
    setShowRefereeCreateSheet(false);
    setActiveRefereeTask("create");
    window.requestAnimationFrame(() => {
      document.querySelector(".referee-ops-shell")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function closeRefereeCreateScreen() {
    setActiveRefereeTask("manage");
    setShowRefereeCreateSheet(false);
  }

  async function reloadReferees() {
    setLoading(true);
    try {
      const [nextReferees, nextSheets, nextReports] = await Promise.all([
        fetchReferees(authToken, league.city),
        fetchRefereeMatchSheets(authToken, { leagueId: league.id, status: "pending_review" }),
        fetchFinalizedMatchReports(authToken, { leagueId: league.id, status: ADMIN_MATCH_REPORT_STATUSES })
      ]);
      setReferees(nextReferees);
      setPendingSheets(nextSheets);
      setFinalizedReports((nextReports || []).filter(needsAdminMatchReportAttention));
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
    const fallbackId = getDefaultCompetitionId(league);
    if (!league.competitions?.some((competition) => competition.id === selectedCompetitionId)) {
      setSelectedCompetitionId(fallbackId);
    }
  }, [league, selectedCompetitionId]);

  useEffect(() => {
    if (!selectedAssignmentMatch && !showAdvancedFilters) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedAssignmentMatch, showAdvancedFilters]);

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

  async function publishFinalizedReport(report) {
    const match = report.match || league.matches.find((item) => item.id === report.matchId);
    const signatureIssue = report.payload?.signatureIssue || null;
    const publishByException = report.status !== "finalized" && signatureIssue?.status === "pending_admin_attention";
    const confirmed = window.confirm(
      publishByException
        ? `¿Publicar esta acta por excepcion administrativa?\n\n${match?.homeTeamName || "LOCAL"} vs ${match?.awayTeamName || "VISITANTE"}\nMarcador: ${report.homeGoals ?? 0}-${report.awayGoals ?? 0}\nIncidencia: ${signatureIssue.reasonLabel || "Problema con firma"}\n\nEsto publicara el resultado oficial aunque queden firmas digitales pendientes.`
        : `¿Publicar esta acta finalizada como resultado oficial?\n\n${match?.homeTeamName || "LOCAL"} vs ${match?.awayTeamName || "VISITANTE"}\nMarcador: ${report.homeGoals ?? 0}-${report.awayGoals ?? 0}\n\nEsto actualizara la parte publica, tabla, goleo y disciplina.`
    );
    if (!confirmed) return;
    const adminNote = publishByException
      ? window.prompt(
          "Agrega una nota administrativa para justificar la publicacion por excepcion.",
          signatureIssue.reasonLabel || "Incidencia de firma validada por admin"
        )
      : "";
    if (adminNote === null) return;
    const actionKey = `publish-report-${report.id}`;
    setBusyAction(actionKey);
    try {
      const response = await publishFinalizedMatchReport(authToken, report.id, {
        overrideSignatureIssue: publishByException,
        adminNote: adminNote || ""
      });
      setFinalizedReports((response.reports || []).filter(needsAdminMatchReportAttention));
      if (response.store) applyApiStore?.(response.store);
      setNotice(publishByException ? "Acta publicada por excepcion administrativa." : "Acta finalizada publicada como resultado oficial.");
      setError("");
    } catch (publishError) {
      setNotice("");
      setError(publishError.message || "No se pudo publicar el acta finalizada.");
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
    const submitter = event.nativeEvent?.submitter;
    if (submitter?.value === "central-only") {
      payload.assistantReferee1UserId = "";
      payload.assistantReferee2UserId = "";
      payload.fourthRefereeUserId = "";
    }
    if (submitter?.value === "clear") {
      if (!window.confirm("¿Eliminar toda la designacion arbitral de este partido?")) return;
      payload.centralRefereeUserId = "";
      payload.assistantReferee1UserId = "";
      payload.assistantReferee2UserId = "";
      payload.fourthRefereeUserId = "";
    }
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
      setSelectedAssignmentMatch(null);
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

  function selectRefereeMatchSuggestion(match) {
    setSelectedRoundFilter(String(match.round || "all"));
    setAssignmentCoverageFilter("all");
    setMatchSearch("");
    setFocusedAssignmentMatchId(match.id);
    setSelectedAssignmentMatch(match);
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-referee-match-id="${CSS.escape(match.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <section className="panel referee-ops-shell">
      <div className="referee-ops-header">
        <div>
          <span className="eyebrow">Arbitraje</span>
          <h2>Centro de Operaciones Arbitrales</h2>
          <p>Gestiona arbitros, designaciones y actas de la liga.</p>
        </div>
        <button aria-label="Ayuda de arbitraje" type="button" onClick={() => setShowRefereeHelp((value) => !value)}>i</button>
      </div>
      {showRefereeHelp && (
        <div className="referee-help-box">
          <strong>Operacion arbitral</strong>
          <span>Programa designaciones, administra arbitros y da seguimiento a actas publicadas o casos legacy. Las actas finalizadas por el arbitro no requieren revision previa.</span>
        </div>
      )}
      {(notice || error) && (
        <div className={`referee-action-toast ${error ? "is-error" : "is-success"}`} role="status" aria-live="polite">
          <strong>{error ? "No se pudo completar" : "Accion completada"}</strong>
          <span>{error || notice}</span>
        </div>
      )}

      <div className="referee-command-center">
        <button className={activeRefereeTask === "assign" ? "active" : ""} type="button" onClick={() => setActiveRefereeTask("assign")}>
          <span>Programacion</span>
          <strong>Partidos</strong>
          <small>{filteredMatches.length} partido(s)</small>
        </button>
        <button className={activeRefereeTask === "manage" ? "active" : ""} type="button" onClick={() => setActiveRefereeTask("manage")}>
          <span>Arbitros</span>
          <strong>Registrados</strong>
          <small>{activeReferees.length} activo(s)</small>
        </button>
        <button className={activeRefereeTask === "review" ? "active" : ""} type="button" onClick={() => setActiveRefereeTask("review")}>
          <span>Actas</span>
          <strong>Seguimiento</strong>
          <small>{actaAttentionCount} por atender</small>
        </button>
      </div>

      {activeRefereeTask === "create" && (
        <RefereeCreateScreen
          busyAction={busyAction}
          lastInvitation={lastInvitation}
          league={league}
          onClose={closeRefereeCreateScreen}
          onSubmit={submitReferee}
        />
      )}

      {activeRefereeTask === "assign" && (
        <>
          <div className="referee-operations-card">
            <div className="referee-operations-head">
              <div>
                <span>Centro de operaciones</span>
                <strong>{selectedCompetition?.name || "Torneo"} · Jornada {displayRound || "-"}</strong>
              </div>
              <button type="button" aria-label="Ver actas" onClick={() => setActiveRefereeTask("review")}>{actaAttentionCount}</button>
            </div>
            <div className="referee-progress-ring">
              <strong>{assignmentCompleteCount}</strong>
              <span>de {scheduledMatches.length || 0}</span>
            </div>
            <div className="referee-progress-copy">
              <b>{assignmentCompleteCount} de {scheduledMatches.length || 0} designaciones completas.</b>
              <div><span style={{ width: `${scheduledMatches.length ? Math.round((assignmentCompleteCount / scheduledMatches.length) * 100) : 0}%` }} /></div>
              <small>{scheduledMatches.length ? Math.round((assignmentCompleteCount / scheduledMatches.length) * 100) : 0}% de cobertura</small>
            </div>
            <div className="referee-operations-next">
              <span>Proximo partido</span>
              <strong>{nextScheduledMatch ? getMatchAdminLabel(league, nextScheduledMatch) : "Sin partidos programados"}</strong>
              {nextScheduledMatch && <small>{formatDate(nextScheduledMatch.date)} · {nextScheduledMatch.time || "Hora por definir"}</small>}
            </div>
          </div>

          <div className="referee-metric-grid">
            <ArbitrationMetricCard label="Arbitros activos" tone="ok" value={activeReferees.length} onClick={() => setActiveRefereeTask("manage")} />
            <ArbitrationMetricCard label="Sin central" tone="warning" value={assignmentPendingCount} onClick={() => setAssignmentCoverageFilter("missing_central")} />
            <ArbitrationMetricCard label="Incompletas" tone="amber" value={assignmentIncompleteCount} onClick={() => setAssignmentCoverageFilter("incomplete")} />
            <ArbitrationMetricCard label="Actas pendientes" tone="info" value={actaAttentionCount} onClick={() => setActiveRefereeTask("review")} />
          </div>

          <div className="referee-quick-actions">
            <button className="primary" type="button" onClick={openRefereeCreateScreen}>+ Nuevo arbitro</button>
            <button type="button" onClick={() => setActiveRefereeTask("manage")}>Arbitros</button>
            <button type="button" onClick={() => setActiveRefereeTask("review")}>Actas</button>
            <button type="button" onClick={() => {
              setAssignmentCoverageFilter("all");
              setMatchStatusFilter("all");
              setSelectedRoundFilter("all");
            }}>Programacion pendiente</button>
          </div>

          <div className="referee-filter-chips" aria-label="Filtros de programacion">
            <select aria-label="Torneo o categoria" value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)}>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>{competition.name}</option>
              ))}
            </select>
            <select aria-label="Jornada" value={selectedRoundFilter} onChange={(event) => setSelectedRoundFilter(event.target.value)}>
              <option value="next">Jornada {displayRound || "-"}</option>
              <option value="all">Todas</option>
              {roundOptions.map((round) => <option key={round} value={round}>Jornada {round}</option>)}
            </select>
            <select aria-label="Estado del partido" value={matchStatusFilter} onChange={(event) => setMatchStatusFilter(event.target.value)}>
              <option value="scheduled">Por jugarse</option>
              <option value="all">Toda la programacion pendiente</option>
            </select>
            <select aria-label="Estado de designacion" value={assignmentCoverageFilter} onChange={(event) => setAssignmentCoverageFilter(event.target.value)}>
              <option value="missing_central">Sin central</option>
              <option value="incomplete">Incompletos</option>
              <option value="complete">Completos</option>
              <option value="all">Todos</option>
            </select>
            <button type="button" onClick={() => setShowAdvancedFilters(true)}>Mas filtros</button>
            <label className="referee-search-chip">
              <span>Buscar</span>
              <input type="search" value={matchSearch} onChange={(event) => setMatchSearch(event.target.value)} placeholder="Equipo o cancha" />
              {matchSearchSuggestions.length > 0 && (
                <div className="referee-match-suggestions" aria-label="Sugerencias de partidos">
                  {matchSearchSuggestions.map((match) => (
                    <button key={match.id} type="button" onClick={() => selectRefereeMatchSuggestion(match)}>
                      <strong>{getMatchAdminLabel(league, match)}</strong>
                      <small>J{match.round || "-"} · {match.date ? formatDate(match.date) : "Sin fecha"} · {match.time || "Hora por definir"} · {match.venue || "Cancha por definir"}</small>
                    </button>
                  ))}
                </div>
              )}
            </label>
          </div>

          <div className="referee-match-groups">
            {loading ? (
              <RefereeSkeletonList />
            ) : matchGroups.map((group) => (
              <section className="referee-day-group" key={group.id}>
                <div className="referee-day-head">
                  <strong>{group.title}</strong>
                  <span>{group.subtitle}</span>
                </div>
                <div className="referee-match-list">
                  {group.matches.map((match) => (
                    <RefereeMatchOpsCard
                      key={match.id}
                      feedback={assignmentFeedback[match.id]}
                      focused={focusedAssignmentMatchId === match.id}
                      league={league}
                      match={match}
                      onOpen={() => {
                        setFocusedAssignmentMatchId(match.id);
                        setSelectedAssignmentMatch(match);
                      }}
                      referees={referees}
                    />
                  ))}
                </div>
              </section>
            ))}
            {!loading && !competitionLeague.matches.length && (
              <ArbitrationEmptyState
                actionLabel="Ver programacion pendiente"
                description="Cuando se publique la jornada, los partidos apareceran aqui para realizar las designaciones."
                onAction={() => setMatchStatusFilter("all")}
                title="Aun no hay partidos programados"
              />
            )}
            {!loading && competitionLeague.matches.length > 0 && !filteredMatches.length && (
              <ArbitrationEmptyState
                actionLabel="Limpiar filtros"
                description="Prueba cambiando el torneo, la jornada o el estado de designacion."
                onAction={() => {
                  setMatchSearch("");
                  setMatchStatusFilter("all");
                  setAssignmentCoverageFilter("all");
                  setSelectedRoundFilter("all");
                }}
                title="No encontramos partidos"
              />
            )}
          </div>

          {selectedAssignmentMatch && (
            <RefereeAssignmentSheet
              activeReferees={activeReferees}
              busyAction={busyAction}
              league={league}
              match={selectedAssignmentMatch}
              matches={competitionLeague.matches}
              onClose={() => setSelectedAssignmentMatch(null)}
              onSubmit={saveMatchReferees}
              selectedCompetition={selectedCompetition}
            />
          )}
        </>
      )}

      {activeRefereeTask === "manage" && (
        <div className="referee-task-panel referee-tab-panel">
          <div className="referee-tab-head">
            <h3>Arbitros registrados</h3>
            <button className="primary" type="button" onClick={openRefereeCreateScreen}>+ Nuevo arbitro</button>
          </div>
          <div className="referee-metric-grid compact">
            <ArbitrationMetricCard label="Activos" tone="ok" value={activeReferees.length} />
            <ArbitrationMetricCard label="Pendientes" tone="warning" value={pendingReferees.length} />
            <ArbitrationMetricCard label="Inactivos" tone="neutral" value={inactiveReferees.length} />
            <ArbitrationMetricCard label="Suspendidos" tone="danger" value={suspendedReferees.length} />
          </div>
          <div className="referee-list-tools">
            <input
              aria-label="Buscar arbitro"
              type="search"
              value={refereeSearch}
              onChange={(event) => setRefereeSearch(event.target.value)}
              placeholder="Buscar arbitro..."
            />
            <select aria-label="Estado de arbitro" value={refereeStatusFilter} onChange={(event) => setRefereeStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="pending_activation">Pendientes</option>
              <option value="active">Activos</option>
              <option value="disabled">Inactivos</option>
              <option value="suspended">Suspendidos</option>
            </select>
          </div>
          <div className="referee-card-list">
            {loading ? <RefereeSkeletonList /> : filteredReferees.map((referee) => (
              <AdminRefereeCard
                busyAction={busyAction}
                key={referee.userId}
                onDelete={deleteRefereeUser}
                onInvite={regenerateRefereeInvitation}
                onStatus={changeRefereeStatus}
                referee={referee}
              />
            ))}
            {!loading && !filteredReferees.length && (
              <ArbitrationEmptyState
                actionLabel="Limpiar filtros"
                description="No hay arbitros con ese nombre o estado."
                onAction={() => {
                  setRefereeSearch("");
                  setRefereeStatusFilter("all");
                }}
                title="No encontramos arbitros"
              />
            )}
          </div>
        </div>
      )}

      {activeRefereeTask === "review" && (
        <div className="referee-task-panel referee-tab-panel">
          <div className="referee-tab-head">
            <div>
              <span>Actas</span>
              <h3>Seguimiento de actas</h3>
              <p>Las actas finalizadas por arbitros se publican directamente. Aqui se atienden pendientes legacy, actas finalizadas no publicadas e incidencias.</p>
            </div>
          </div>
          <div className="referee-metric-grid compact">
            <ArbitrationMetricCard label="Pendientes" tone="warning" value={pendingSheets.length} />
            <ArbitrationMetricCard label="Finalizadas" tone="info" value={readyFinalizedReports.length} />
            <ArbitrationMetricCard label="Publicadas" tone="ok" value={competitionLeague.matches.filter((match) => match.status === "finished" || match.status === "walkover").length} />
            <ArbitrationMetricCard label="Incidencia" tone="danger" value={signatureIssueReports.length} />
          </div>
          <RefereeSheetReviewPanel
            busyAction={busyAction}
            finalizedReports={finalizedReports}
            league={league}
            onPublishReport={publishFinalizedReport}
            onReview={reviewSheet}
            sheets={pendingSheets}
          />
        </div>
      )}

      {showAdvancedFilters && (
        <div className="referee-sheet-backdrop" role="presentation" onClick={() => setShowAdvancedFilters(false)}>
          <div className="referee-bottom-sheet" role="dialog" aria-modal="true" aria-label="Filtros avanzados" onClick={(event) => event.stopPropagation()}>
            <div className="referee-bottom-sheet-head">
              <strong>Filtros avanzados</strong>
              <button type="button" onClick={() => setShowAdvancedFilters(false)}>Cerrar</button>
            </div>
            <div className="referee-sheet-form-grid">
              <label>Torneo
                <select value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)}>
                  {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}
                </select>
              </label>
              <label>Jornada
                <select value={selectedRoundFilter} onChange={(event) => setSelectedRoundFilter(event.target.value)}>
                  <option value="next">Jornada {displayRound || "-"}</option>
                  <option value="all">Todas</option>
                  {roundOptions.map((round) => <option key={round} value={round}>Jornada {round}</option>)}
                </select>
              </label>
              <label>Estado partido
                <select value={matchStatusFilter} onChange={(event) => setMatchStatusFilter(event.target.value)}>
                  <option value="scheduled">Por jugarse</option>
                  <option value="all">Toda la programacion pendiente</option>
                </select>
              </label>
              <label>Designacion
                <select value={assignmentCoverageFilter} onChange={(event) => setAssignmentCoverageFilter(event.target.value)}>
                  <option value="missing_central">Sin central</option>
                  <option value="incomplete">Incompletos</option>
                  <option value="complete">Completos</option>
                  <option value="all">Todos</option>
                </select>
              </label>
              <label>Buscar
                <input value={matchSearch} onChange={(event) => setMatchSearch(event.target.value)} placeholder="Equipo, cancha o fecha" />
              </label>
            </div>
            <div className="referee-sheet-actions">
              <button type="button" onClick={() => {
                setMatchSearch("");
                setMatchStatusFilter("scheduled");
                setAssignmentCoverageFilter("missing_central");
                setSelectedRoundFilter("next");
              }}>Limpiar</button>
              <button className="primary" type="button" onClick={() => setShowAdvancedFilters(false)}>Aplicar filtros</button>
            </div>
          </div>
        </div>
      )}

      {showRefereeCreateSheet && (
        <RefereeCreateScreen
          busyAction={busyAction}
          lastInvitation={lastInvitation}
          league={league}
          onClose={closeRefereeCreateScreen}
          onSubmit={submitReferee}
        />
      )}
    </section>
  );
}

function ArbitrationMetricCard({ label, onClick, tone = "neutral", value }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`arbitration-metric-card tone-${tone}`} type={onClick ? "button" : undefined} onClick={onClick}>
      <strong>{value}</strong>
      <span>{label}</span>
    </Tag>
  );
}

function ArbitrationEmptyState({ actionLabel, description, onAction, title }) {
  return (
    <div className="arbitration-empty-state">
      <span aria-hidden="true">□</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {onAction && <button type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

function RefereeSkeletonList() {
  return (
    <div className="referee-skeleton-list" aria-label="Cargando">
      <span />
      <span />
      <span />
    </div>
  );
}

function getAssignmentCoverageLabel(value) {
  if (value === "missing_central") return "Sin central";
  if (value === "incomplete") return "Incompletos";
  if (value === "complete") return "Completos";
  return "Todos";
}

function getRefereeInitials(name = "") {
  const parts = String(name || "AR").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "A") + (parts[1]?.[0] || parts[0]?.[1] || "R");
}

function getTeamAbbreviation(team) {
  const source = String(team?.shortName || team?.name || "EQ").trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (team?.shortName && team.shortName.length <= 3) return team.shortName.toLocaleUpperCase("es-MX");
  if (words.length >= 2) return `${words[0][0] || ""}${words[1][0] || ""}`.toLocaleUpperCase("es-MX");
  return source.slice(0, 2).toLocaleUpperCase("es-MX") || "EQ";
}

function findReferee(referees, userId) {
  return referees.find((referee) => referee.userId === userId) || null;
}

function getRefereeDisplayName(referees, userId) {
  return findReferee(referees, userId)?.name || "Pendiente";
}

function getAssignmentState(match) {
  if (!match.centralRefereeUserId) return { id: "missing", label: "Sin arbitro central", action: "Asignar arbitro" };
  if (!isMatchRefereeAssignmentComplete(match)) return { id: "incomplete", label: "Designacion incompleta", action: "Completar" };
  return { id: "complete", label: "Designacion completa", action: "Editar" };
}

function getMatchStatusLabel(status) {
  if (status === "finished") return "Finalizado";
  if (status === "walkover") return "Default";
  if (status === "suspended") return "Suspendido";
  if (status === "postponed") return "Pospuesto";
  if (status === "rescheduled") return "Reprogramado";
  if (status === "advanced") return "Adelantado";
  return "Programado";
}

function isEditableScheduleStatus(status) {
  return ["scheduled", "rescheduled", "advanced", "postponed"].includes(status || "scheduled");
}

function isActiveScheduleStatus(status) {
  return ["scheduled", "rescheduled", "advanced"].includes(status || "scheduled");
}

function isValidScheduleDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function MatchStatusSelect({ defaultValue, ariaLabel, canEditMatchResults, onChange }) {
  return (
    <select name="status" defaultValue={defaultValue || "scheduled"} aria-label={ariaLabel} onChange={onChange}>
      <option value="scheduled">Programado</option>
      <option value="rescheduled">Reprogramado</option>
      <option value="advanced">Adelantado</option>
      <option value="postponed">Pospuesto</option>
      <option value="suspended">Suspendido</option>
      {canEditMatchResults && <option value="finished">Finalizado</option>}
      {canEditMatchResults && <option value="walkover">Default</option>}
    </select>
  );
}

function isRefereeAssignedToMatch(match, refereeId) {
  return [
    match.centralRefereeUserId,
    match.assistantReferee1UserId,
    match.assistantReferee2UserId,
    match.fourthRefereeUserId
  ].includes(refereeId);
}

function hasRefereeTimeConflict(matches, targetMatch, refereeId) {
  if (!refereeId || !targetMatch?.date || !targetMatch?.time) return false;
  return (matches || []).some((match) => (
    match.id !== targetMatch.id &&
    match.date === targetMatch.date &&
    match.time === targetMatch.time &&
    isRefereeAssignedToMatch(match, refereeId)
  ));
}

function countRefereeAssignmentsInRound(matches, targetMatch, refereeId) {
  if (!refereeId) return 0;
  return (matches || []).filter((match) => (
    match.id !== targetMatch.id &&
    Number(match.round || 0) === Number(targetMatch.round || 0) &&
    isRefereeAssignedToMatch(match, refereeId)
  )).length;
}

function RefereeMatchOpsCard({ feedback, focused = false, league, match, onOpen, referees }) {
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  const assignment = getAssignmentState(match);
  return (
    <article className={`referee-ops-match-card ${focused ? "is-focused" : ""}`} data-referee-match-id={match.id}>
      <div className="referee-match-timebox">
        <span>{match.time || "--:--"}</span>
        <small>{match.date ? formatDate(match.date) : "Sin fecha"}</small>
      </div>
      <div className="referee-match-core">
        <span className="referee-venue-pill">{match.venue || "Cancha por definir"}</span>
        <div className="referee-match-teams">
          <strong>{homeTeam?.name || "LOCAL"}</strong>
          <b>VS</b>
          <strong>{awayTeam?.name || "VISITANTE"}</strong>
        </div>
        <div className="referee-assignment-lines">
          <span>Central: <b>{getRefereeDisplayName(referees, match.centralRefereeUserId)}</b></span>
          {match.assistantReferee1UserId && <span>Aux 1: <b>{getRefereeDisplayName(referees, match.assistantReferee1UserId)}</b></span>}
          {match.assistantReferee2UserId && <span>Aux 2: <b>{getRefereeDisplayName(referees, match.assistantReferee2UserId)}</b></span>}
          {match.fourthRefereeUserId && <span>Cuarto: <b>{getRefereeDisplayName(referees, match.fourthRefereeUserId)}</b></span>}
        </div>
        {feedback?.message && <p className={feedback.type === "error" ? "auth-error inline-feedback" : "auth-ok inline-feedback"}>{feedback.message}</p>}
      </div>
      <div className="referee-match-action">
        <span className={`referee-status-badge ${assignment.id}`}>{assignment.label}</span>
        <small>{getMatchStatusLabel(match.status)}</small>
        <button type="button" onClick={onOpen}>{assignment.action}</button>
      </div>
    </article>
  );
}

function RefereeAssignmentSheet({ activeReferees, busyAction, league, match, matches, onClose, onSubmit, selectedCompetition }) {
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  return (
    <div className="referee-sheet-backdrop" role="presentation" onClick={onClose}>
      <form className="referee-bottom-sheet referee-assignment-sheet" role="dialog" aria-modal="true" aria-label="Asignar equipo arbitral" onClick={(event) => event.stopPropagation()} onSubmit={(event) => onSubmit(event, match)}>
        <div className="referee-bottom-sheet-head">
          <div>
            <span>Asignar equipo arbitral</span>
            <strong>{getMatchAdminLabel(league, match)}</strong>
          </div>
          <button className="referee-sheet-close-button" type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="referee-sheet-match-summary">
          <div className="referee-sheet-versus">
            <span>{getTeamAbbreviation(homeTeam)}</span>
            <b>VS</b>
            <span>{getTeamAbbreviation(awayTeam)}</span>
          </div>
          <div>
            <span>{formatDate(match.date)} · {match.time || "Hora por definir"}</span>
            <strong>{match.venue || "Cancha por definir"}</strong>
            <small>{selectedCompetition?.name || "Torneo"} · Jornada {match.round || "-"}</small>
          </div>
        </div>
        <div className="referee-sheet-form-grid">
          <RefereeSelect label="Arbitro central" match={match} matches={matches} name="centralRefereeUserId" referees={activeReferees} defaultValue={match.centralRefereeUserId || ""} />
          <RefereeSelect label="Auxiliar 1" match={match} matches={matches} name="assistantReferee1UserId" referees={activeReferees} defaultValue={match.assistantReferee1UserId || ""} />
          <RefereeSelect label="Auxiliar 2" match={match} matches={matches} name="assistantReferee2UserId" referees={activeReferees} defaultValue={match.assistantReferee2UserId || ""} />
          <RefereeSelect label="Cuarto arbitro" match={match} matches={matches} name="fourthRefereeUserId" referees={activeReferees} defaultValue={match.fourthRefereeUserId || ""} />
        </div>
        <div className="referee-sheet-actions">
          <button className="referee-action-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="referee-action-central" type="submit" name="saveMode" value="central-only" disabled={busyAction === `match-referees-${match.id}`}>Guardar solo central</button>
          {(match.centralRefereeUserId || match.assistantReferee1UserId || match.assistantReferee2UserId || match.fourthRefereeUserId) && (
            <button className="danger ghost-danger" type="submit" name="saveMode" value="clear" disabled={busyAction === `match-referees-${match.id}`}>Eliminar designacion</button>
          )}
          <button className="primary referee-action-save" type="submit" disabled={busyAction === `match-referees-${match.id}`}>
            {busyAction === `match-referees-${match.id}` ? "Guardando..." : "Guardar designacion"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RefereeCreateScreen({ busyAction, lastInvitation, league, onClose, onSubmit }) {
  return (
    <section className="referee-create-screen" aria-label="Nuevo arbitro">
      <div className="referee-create-hero">
        <button className="referee-create-back" type="button" onClick={onClose} aria-label="Volver a arbitros">←</button>
        <div>
          <span>Alta arbitral</span>
          <h3>Nuevo arbitro</h3>
          <p>Crea la cuenta, genera su invitacion y deja listo el acceso al panel arbitral.</p>
        </div>
      </div>
      <div className="referee-create-layout">
        <form className="referee-create-form" onSubmit={onSubmit}>
          <div className="referee-create-section-head">
            <span>Datos de contacto</span>
            <strong>Informacion principal</strong>
          </div>
          <label>Nombre completo<input name="name" required placeholder="Ej. Juan Perez Lopez" /></label>
          <label>Correo electronico<input name="email" required type="email" placeholder="ejemplo@correo.com" /></label>
          <label>Telefono<input name="phone" required inputMode="tel" placeholder="351 123 4567" /></label>
          <label>Municipio<input name="municipality" value={league.city || ""} readOnly /></label>
          <div className="referee-role-checks">
            <span>Roles</span>
            <label><input name="roles" type="checkbox" value="central" defaultChecked /> Central</label>
            <label><input name="roles" type="checkbox" value="assistant" defaultChecked /> Auxiliar</label>
            <label><input name="roles" type="checkbox" value="fourth" /> Cuarto arbitro</label>
          </div>
          <label className="wide-field">Observaciones<textarea name="notes" placeholder="Observaciones adicionales (opcional)" /></label>
          <div className="referee-sheet-actions wide-field">
            <button className="referee-action-secondary" type="button" onClick={onClose}>Cancelar</button>
            <button className="primary referee-action-save" type="submit" disabled={busyAction === "create-referee"}>
              {busyAction === "create-referee" ? "Creando..." : "Crear e invitar"}
            </button>
          </div>
        </form>
        {lastInvitation && (
          <div className="delegate-invitation-box referee-invitation-panel">
            <span>Invitacion generada</span>
            <strong>Lista para compartir</strong>
            <textarea readOnly value={lastInvitation.whatsappMessage || ""} />
            <div className="inline-actions">
              <button type="button" onClick={() => navigator.clipboard?.writeText(lastInvitation.whatsappMessage || "")}>Copiar mensaje</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(lastInvitation.whatsappMessage || "")}`} rel="noreferrer" target="_blank">Abrir WhatsApp</a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminRefereeCard({ busyAction, onDelete, onInvite, onStatus, referee }) {
  const isActivating = busyAction === `active-${referee.userId}`;
  const isDisabling = busyAction === `disabled-${referee.userId}`;
  const isSuspending = busyAction === `suspended-${referee.userId}`;
  const isInviting = busyAction === `invite-${referee.userId}`;
  const isDeleting = busyAction === `delete-${referee.userId}`;
  const isBusyReferee = isActivating || isDisabling || isSuspending || isInviting || isDeleting;
  return (
    <article className="admin-referee-card">
      <span className="admin-referee-avatar">{getRefereeInitials(referee.name)}</span>
      <div>
        <strong>{referee.name}</strong>
        <small>{referee.phone || referee.email} · {referee.municipality}</small>
        <div className="admin-referee-tags">
          <span>Central</span>
          <span>Auxiliar</span>
          <span>{referee.assignedMatches || 0} partidos</span>
        </div>
      </div>
      <b className={`referee-access-badge ${referee.status}`}>{getRefereeStatusLabel(referee.status)}</b>
      <div className="admin-referee-actions">
        <button type="button" disabled={isBusyReferee} onClick={() => onInvite(referee)}>{isInviting ? "Generando..." : "Invitacion"}</button>
        <button type="button" disabled={referee.status === "active" || referee.status === "pending_activation" || isBusyReferee} onClick={() => onStatus(referee, "active")}>{isActivating ? "Activando..." : "Activar"}</button>
        <button type="button" disabled={referee.status === "disabled" || isBusyReferee} onClick={() => onStatus(referee, "disabled")}>{isDisabling ? "Desactivando..." : "Desactivar"}</button>
        <button className="danger ghost-danger" type="button" disabled={referee.status === "suspended" || isBusyReferee} onClick={() => onStatus(referee, "suspended")}>{isSuspending ? "Suspendiendo..." : "Suspender"}</button>
        <button className="danger ghost-danger" type="button" disabled={isBusyReferee} onClick={() => onDelete(referee)}>{isDeleting ? "Eliminando..." : "Eliminar"}</button>
      </div>
    </article>
  );
}

function RefereeSelect({ defaultValue = "", label, match, matches = [], name, referees, required = false }) {
  return (
    <label>{label}
      <select name={name} defaultValue={defaultValue} required={required}>
        <option value="">Sin asignar</option>
        {referees.map((referee) => {
          const hasConflict = hasRefereeTimeConflict(matches, match, referee.userId) && referee.userId !== defaultValue;
          const assignmentCount = countRefereeAssignmentsInRound(matches, match, referee.userId);
          return (
            <option disabled={hasConflict} key={referee.userId} value={referee.userId}>
              {referee.name} · {hasConflict ? "Conflicto de horario" : assignmentCount ? `${assignmentCount} asignado(s) jornada` : "Disponible"}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function RefereeSheetReviewPanel({ busyAction, finalizedReports = [], league, onPublishReport, onReview, sheets }) {
  const [reviewNotes, setReviewNotes] = useState({});

  function updateReviewNote(sheetId, value) {
    setReviewNotes((current) => ({ ...current, [sheetId]: value }));
  }

  return (
    <section className="referee-review-panel">
      <div className="referee-review-head">
        <div>
          <span className="eyebrow">Seguimiento de actas</span>
          <h3>Actas por atender</h3>
        </div>
        <strong>{sheets.length + finalizedReports.length} pendiente(s)</strong>
      </div>
      {finalizedReports.length > 0 && (
        <div className="referee-review-list">
          {finalizedReports.map((report) => {
            const match = report.match || league.matches.find((item) => item.id === report.matchId);
            const homeTeam = getTeam(league, match?.homeTeamId);
            const awayTeam = getTeam(league, match?.awayTeamId);
            const payload = report.payload || {};
            const signatureIssue = payload.signatureIssue || null;
            const events = payload.events || [];
            const isPublishing = busyAction === `publish-report-${report.id}`;
            const canPublishByException = report.status !== "finalized" && signatureIssue?.status === "pending_admin_attention";
            const signatureCount = (report.signatures || []).length;
            return (
              <article className={`referee-review-card referee-review-card--ready ${signatureIssue ? "has-signature-issue" : ""}`} key={report.id}>
                <div>
                  <strong>{match?.homeTeamName || homeTeam?.name || "LOCAL"} vs {match?.awayTeamName || awayTeam?.name || "VISITANTE"}</strong>
                  <small>
                    {match ? `Jornada ${match.round || "-"} | ${formatDate(match.date)} | ${match.venue || "CANCHA POR DEFINIR"}` : "Partido no encontrado"}
                  </small>
                  <small>{match?.competitionName || "Categoria"} | {report.captureMode === "live" ? `${signatureCount}/2 firmas digitales` : "Acta manual sin firmas digitales"}</small>
                  {signatureIssue && (
                    <small className="referee-review-issue">
                      Incidencia de firma: {signatureIssue.reasonLabel || "Problema con firma"} | Local {signatureIssue.homeSigned ? "firmo" : "pendiente"} | Visitante {signatureIssue.awaySigned ? "firmo" : "pendiente"}
                    </small>
                  )}
                </div>
                <div className="referee-review-summary">
                  <span><strong>{report.homeGoals ?? payload.homeGoals ?? 0}-{report.awayGoals ?? payload.awayGoals ?? 0}</strong> marcador</span>
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
                        <span key={`${report.id}-${index}`}>
                          {getMatchEventLabel(event.type)} | {player?.name || "Jugador"} | {team?.name || "Equipo"} {event.minute !== "" && event.minute !== undefined ? `| Min ${event.minute}` : ""}
                        </span>
                      );
                    })}
                    {!events.length && <span>Sin eventos capturados.</span>}
                  </div>
                </details>
                <div className="inline-actions">
                  {report.status === "finalized" || canPublishByException ? (
                    <button className="primary" type="button" disabled={isPublishing} onClick={() => onPublishReport(report)}>
                      {isPublishing ? "Publicando..." : canPublishByException ? "Publicar por excepcion" : "Publicar oficial"}
                    </button>
                  ) : (
                    <button type="button" disabled>
                      Pendiente de firmas o validacion
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!sheets.length && !finalizedReports.length ? (
        <p className="empty">No hay actas pendientes por atender.</p>
      ) : sheets.length > 0 ? (
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
      ) : null}
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

function AffiliationsPanel({
  league,
  onAddTeamAffiliation,
  onDeleteTeamAffiliation,
  onLinkPlayerIdentity,
  onDeletePlayerIdentityLink,
  onMergeDuplicatePlayer,
  onUpdateTeamAffiliationPlayerNumber
}) {
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
  const [sourceTeamId, setSourceTeamId] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [notice, setNotice] = useState("");
  const activeAffiliations = useMemo(
    () => (league.teamAffiliations || []).filter((affiliation) => !affiliation.status || affiliation.status === "active"),
    [league.teamAffiliations]
  );
  const activeIdentityLinks = useMemo(
    () => (league.disciplineLinks || []).filter((link) => (link.playerIds || []).length > 1),
    [league.disciplineLinks]
  );
  const affiliatedPlayerCount = useMemo(() => activeAffiliations.reduce((total, affiliation) => (
    total + league.players.filter((player) => player.teamId === affiliation.sourceTeamId).length
  ), 0), [activeAffiliations, league.players]);
  const selectedSourceTeam = getTeam(league, sourceTeamId);
  const selectedTargetTeam = getTeam(league, targetTeamId);
  const selectedSourcePlayers = league.players.filter((player) => player.teamId === sourceTeamId);
  const affiliationAlreadyExists = Boolean(sourceTeamId && targetTeamId && activeAffiliations.some((affiliation) => (
    affiliation.sourceTeamId === sourceTeamId && affiliation.targetTeamId === targetTeamId
  )));

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

  useEffect(() => {
    setSourceTeamId((current) => sourceTeams.some((team) => team.id === current) ? current : sourceTeams[0]?.id || "");
  }, [sourceTeams]);

  useEffect(() => {
    setTargetTeamId((current) => targetTeams.some((team) => team.id === current) ? current : targetTeams[0]?.id || "");
  }, [targetTeams]);

  function submitAffiliation(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (payload.sourceTeamId === payload.targetTeamId) {
      setNotice("El equipo origen y receptor deben ser distintos.");
      return;
    }
    if (affiliationAlreadyExists) {
      setNotice("Esta afiliacion ya esta activa.");
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
    const targetCompetitionId = target.competitionId || targetTeam?.competitionId || getDefaultCompetitionId(league);
    const duplicateCompetitionId = duplicate.competitionId || duplicateTeam?.competitionId || getDefaultCompetitionId(league);
    if (targetCompetitionId !== duplicateCompetitionId) {
      setNotice("No fusione jugadores de categorias distintas. Usa Vincular misma persona para conservar cada historial en su torneo.");
      return;
    }
    const hasAffiliation = (league.teamAffiliations || []).some((affiliation) => (
      affiliation.sourceTeamId === target.teamId && affiliation.targetTeamId === duplicate.teamId
    ));
    const affiliationWarning = hasAffiliation ? "" : "\n\nAviso: no encontre una afiliacion del equipo principal hacia el equipo del duplicado. Conviene crearla antes para conservar numero alterno y elegibilidad.";
    if (!window.confirm(`¿Fusionar el duplicado ${duplicate.name} (${duplicateTeam?.name || "sin equipo"}) dentro de ${target.name} (${targetTeam?.name || "sin equipo"})?\n\nSe moveran actas, goles, tarjetas, sanciones y movimientos manuales al jugador principal.${affiliationWarning}`)) return;
    onMergeDuplicatePlayer(payload);
    setNotice("Jugador duplicado fusionado. Revisa estadisticas y actas del jugador principal.");
    event.currentTarget.reset();
  }

  function submitIdentityLink(event) {
    event.preventDefault();
    const payload = getFormPayload(event.currentTarget);
    if (payload.playerId === payload.linkedPlayerId) {
      setNotice("Selecciona dos registros distintos de la misma persona.");
      return;
    }
    const player = getPlayer(league, payload.playerId);
    const linkedPlayer = getPlayer(league, payload.linkedPlayerId);
    if (!player || !linkedPlayer) return;
    const alreadyLinked = activeIdentityLinks.some((link) => (
      (link.playerIds || []).includes(player.id) && (link.playerIds || []).includes(linkedPlayer.id)
    ));
    if (alreadyLinked) {
      setNotice("Estos registros ya estan vinculados.");
      return;
    }
    const playerTeam = getTeam(league, player.teamId);
    const linkedTeam = getTeam(league, linkedPlayer.teamId);
    if (!window.confirm(`¿Vincular ${player.name} (${playerTeam?.name || "sin equipo"}) con ${linkedPlayer.name} (${linkedTeam?.name || "sin equipo"})?\n\nNo se moveran goles, tarjetas, sanciones ni actas. Cada registro conservara su historial en su categoria.`)) return;
    onLinkPlayerIdentity({
      playerId: player.id,
      linkedPlayerId: linkedPlayer.id,
      notes: payload.notes || "VINCULO DE IDENTIDAD DEPORTIVA"
    });
    setNotice("Identidad vinculada. Los historiales por torneo se conservan separados.");
    event.currentTarget.reset();
  }

  return (
    <section className="panel admin-affiliations-panel">
      <div className="affiliation-hero">
        <div>
          <span>Control deportivo</span>
          <strong>Afiliaciones de equipos</strong>
          <small>Conecta plantillas entre categorias sin duplicar jugadores y conserva el historial disciplinario.</small>
        </div>
        <div className="affiliation-hero-metrics">
          <span><b>{activeAffiliations.length}</b> Activas</span>
          <span><b>{affiliatedPlayerCount}</b> Jugadores vinculados</span>
          <span><b>{activeIdentityLinks.length}</b> Identidades</span>
          <span><b>{competitions.length}</b> Categorias</span>
        </div>
      </div>
      {notice && <p className="auth-ok">{notice}</p>}

      <div className="affiliation-workspace">
        <form className="affiliation-form affiliation-builder" onSubmit={submitAffiliation}>
          <div className="affiliation-builder-head">
            <span>Nuevo enlace</span>
            <strong>Origen {"->"} Receptor</strong>
            <small>El origen presta su plantilla. El receptor podra usar esos jugadores al armar actas.</small>
          </div>
          <label><span>1</span> Categoria origen
            <select value={sourceCompetitionId} onChange={(event) => setSourceCompetitionId(event.target.value)} required>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>{competition.name}</option>
              ))}
            </select>
          </label>
          <label><span>2</span> Equipo origen
            <select name="sourceTeamId" value={sourceTeamId} onChange={(event) => setSourceTeamId(event.target.value)} required disabled={!sourceTeams.length}>
              {sourceTeams.map((team) => (
                <option key={team.id} value={team.id}>{team.name} | {getCompetition(league, team.competitionId)?.name || "Torneo"}</option>
              ))}
            </select>
          </label>
          <label><span>3</span> Categoria receptor
            <select value={targetCompetitionId} onChange={(event) => setTargetCompetitionId(event.target.value)} required disabled={targetCompetitionOptions.length <= 1}>
              {targetCompetitionOptions.map((competition) => (
                <option key={competition.id} value={competition.id}>{competition.name}</option>
              ))}
            </select>
          </label>
          <label><span>4</span> Equipo receptor
            <select name="targetTeamId" value={targetTeamId} onChange={(event) => setTargetTeamId(event.target.value)} required disabled={!targetTeams.length}>
              {targetTeams.map((team) => (
                <option key={team.id} value={team.id}>{team.name} | {getCompetition(league, team.competitionId)?.name || "Torneo"}</option>
              ))}
            </select>
          </label>
          <div className={`affiliation-route-preview ${affiliationAlreadyExists ? "warning" : ""}`}>
            <span>{getCompetition(league, selectedSourceTeam?.competitionId)?.name || "Categoria origen"}</span>
            <strong>{selectedSourceTeam?.name || "Equipo origen"}</strong>
            <b aria-hidden="true">{"->"}</b>
            <strong>{selectedTargetTeam?.name || "Equipo receptor"}</strong>
            <span>{selectedSourcePlayers.length} jugador(es) disponibles</span>
            {affiliationAlreadyExists && <small>Esta afiliacion ya existe.</small>}
          </div>
          <label className="wide-field">Notas operativas
            <textarea name="notes" placeholder="Ej. Plantilla de segunda afiliada a primera para este torneo." />
          </label>
          <button className="primary" type="submit" disabled={teams.length < 2 || !sourceTeams.length || !targetTeams.length || affiliationAlreadyExists}>Guardar afiliacion</button>
        </form>

        <section className="affiliation-maintenance-card">
          <div>
            <span>Identidad deportiva</span>
            <strong>Vincular misma persona</strong>
            <small>Relaciona registros entre categorias sin mover eventos, actas ni sanciones.</small>
          </div>
          <form className="duplicate-merge-form identity-link-form" onSubmit={submitIdentityLink}>
            <label>Registro base
              <SearchablePlayerSelect league={league} name="playerId" players={players} placeholder="Buscar jugador..." />
            </label>
            <label>Registro relacionado
              <SearchablePlayerSelect league={league} name="linkedPlayerId" players={players} placeholder="Buscar el otro registro..." />
            </label>
            <label className="wide-field">Nota interna
              <textarea name="notes" placeholder="Ej. MISMA PERSONA, SEGUNDA Y PRIMERA FUERZA." />
            </label>
            <button className="primary" type="submit" disabled={players.length < 2}>Vincular sin fusionar</button>
          </form>
        </section>

        <section className="affiliation-maintenance-card merge-risk-card">
          <div>
            <span>Depuracion controlada</span>
            <strong>Fusionar duplicado real</strong>
            <small>Solo para registros repetidos dentro de la misma categoria. Esta accion mueve historial al principal.</small>
          </div>
          <form className="duplicate-merge-form" onSubmit={submitMerge}>
            <label>Jugador principal
              <SearchablePlayerSelect league={league} name="targetPlayerId" players={players} placeholder="Buscar jugador principal..." />
            </label>
            <label>Registro duplicado
              <SearchablePlayerSelect league={league} name="duplicatePlayerId" players={players} placeholder="Buscar registro duplicado..." />
            </label>
            <button className="danger" type="submit" disabled={players.length < 2}>Fusionar duplicado</button>
          </form>
        </section>
      </div>

      <section className="affiliation-active-section identity-links-section">
        <div className="affiliation-section-head">
          <div>
            <span>Identidades vinculadas</span>
            <strong>Misma persona, historial separado</strong>
          </div>
          <small>{activeIdentityLinks.length} vinculo(s)</small>
        </div>
        <div className="affiliation-card-grid">
          {activeIdentityLinks.map((link) => {
            const linkedPlayers = (link.playerIds || []).map((playerId) => getPlayer(league, playerId)).filter(Boolean);
            return (
              <article className="discipline-admin-card affiliation-card identity-link-card" key={link.id}>
                <div className="identity-link-list">
                  {linkedPlayers.map((player) => {
                    const team = getTeam(league, player.teamId);
                    const competition = getCompetition(league, player.competitionId || team?.competitionId);
                    return (
                      <span key={player.id}>
                        <strong>{player.name}</strong>
                        <small>{team?.name || "Sin equipo"} | {competition?.name || "Categoria"}</small>
                      </span>
                    );
                  })}
                </div>
                {link.notes && <p>{link.notes}</p>}
                <button className="danger" type="button" onClick={() => {
                  if (!window.confirm("¿Quitar este vinculo de identidad? No se modificaran eventos ni jugadores.")) return;
                  onDeletePlayerIdentityLink(link.id);
                  setNotice("Vinculo de identidad eliminado.");
                }}>Quitar vinculo</button>
              </article>
            );
          })}
          {!activeIdentityLinks.length && <p className="empty">Aun no hay identidades vinculadas.</p>}
        </div>
      </section>

      <section className="affiliation-active-section">
        <div className="affiliation-section-head">
          <div>
            <span>Mapa activo</span>
            <strong>Afiliaciones activas</strong>
          </div>
          <small>{activeAffiliations.length} enlace(s)</small>
        </div>
        <div className="affiliation-card-grid">
          {(league.teamAffiliations || []).map((affiliation) => {
            const source = getTeam(league, affiliation.sourceTeamId);
            const target = getTeam(league, affiliation.targetTeamId);
            const sourcePlayers = league.players.filter((player) => player.teamId === affiliation.sourceTeamId);
            return (
              <article className="discipline-admin-card affiliation-card" key={affiliation.id}>
                <div className="affiliation-card-route">
                  <span>{getCompetition(league, source?.competitionId)?.name || "Categoria origen"}</span>
                  <strong>{source?.name || "Equipo origen"}</strong>
                  <b aria-hidden="true">{"->"}</b>
                  <strong>{target?.name || "Equipo receptor"}</strong>
                  <span>{getCompetition(league, target?.competitionId)?.name || "Categoria receptor"}</span>
                </div>
                <div className="affiliation-card-metrics">
                  <span><small>Plantilla</small><b>{sourcePlayers.length}</b></span>
                  <span><small>Estado</small><b>{affiliation.status === "active" ? "Activa" : affiliation.status}</b></span>
                </div>
                {affiliation.notes && <p>{affiliation.notes}</p>}
                <form className="affiliation-number-form" onSubmit={(event) => {
                  event.preventDefault();
                  onUpdateTeamAffiliationPlayerNumber(affiliation.id, getFormPayload(event.currentTarget));
                  setNotice("Numero de afiliado actualizado.");
                }}>
                  <label>Numero alterno en {target?.name || "receptor"}
                    <select name="playerId" required>
                      {sourcePlayers.map((player) => (
                        <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}</option>
                      ))}
                    </select>
                  </label>
                  <input name="number" type="number" min="0" max="9999" placeholder="No." />
                  <button type="submit" disabled={!sourcePlayers.length}>Guardar</button>
                </form>
                <button className="danger" type="button" onClick={() => {
                  if (!window.confirm("¿Eliminar esta afiliacion? Los jugadores dejaran de estar disponibles en el equipo receptor.")) return;
                  onDeleteTeamAffiliation(affiliation.id);
                  setNotice("Afiliacion eliminada.");
                }}>Quitar afiliacion</button>
              </article>
            );
          })}
          {!(league.teamAffiliations || []).length && <p className="empty">Aun no hay equipos afiliados.</p>}
        </div>
      </section>
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

  const activeVenueCount = venues.filter((venue) => (venue.status || "active") === "active").length;

  return (
    <section className="panel admin-data-panel venues-admin-panel">
      <SectionHeading eyebrow="Programacion" title="Canchas de la liga" />
      <div className="admin-data-hero">
        <div>
          <span>Catalogo de sedes</span>
          <strong>{venues.length} cancha(s) registradas</strong>
          <small>Disponibles para programar, posponer o reprogramar partidos de {league.name}.</small>
        </div>
        <b>{activeVenueCount} activas</b>
      </div>
      {notice && <p className="auth-ok">{notice}</p>}

      <form className="venue-form" onSubmit={submitVenue}>
        <h3>Nueva cancha</h3>
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

      <div className="venue-list-head">
        <strong>Canchas registradas</strong>
        <span>{venues.length ? "Edita datos, estado y referencias sin salir de esta pantalla." : "Aun no hay sedes para esta liga."}</span>
      </div>
      <div className="venue-list">
        {venues.map((venue) => (
          <details className="venue-card-shell" key={venue.id}>
            <summary className="venue-card-summary">
              <div className="venue-card-title">
                <b>{venue.name?.slice(0, 2).toUpperCase() || "CA"}</b>
                <span>{(venue.status || "active") === "active" ? "Activa" : "Inactiva"}</span>
              </div>
              <div className="venue-card-copy">
                <strong>{venue.name}</strong>
                <small>{venue.address || "Sin direccion capturada"}</small>
              </div>
              <em>Editar</em>
            </summary>
            <form className="venue-card" onSubmit={(event) => updateExistingVenue(event, venue)}>
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
          </details>
        ))}
        {!venues.length && <p className="empty">Aun no hay canchas registradas.</p>}
      </div>
    </section>
  );
}

function AnnouncementsPanel({ league, onAddAnnouncement, onDeleteAnnouncement, onUpdateAnnouncement }) {
  const [notice, setNotice] = useState("");
  const [createAnnouncementOpen, setCreateAnnouncementOpen] = useState(false);
  const [announcementQuery, setAnnouncementQuery] = useState("");
  const [announcementStatusFilter, setAnnouncementStatusFilter] = useState("all");
  const [visibleAnnouncementLimit, setVisibleAnnouncementLimit] = useState(8);
  const announcements = [...(league.announcements || [])].sort((a, b) => (
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  ));
  const announcementSummary = announcements.reduce((summary, announcement) => {
    const status = announcement.status === "archived" ? "archived" : "active";
    summary[status] += 1;
    return summary;
  }, { active: 0, archived: 0 });
  const filteredAnnouncements = announcements.filter((announcement) => {
    const status = announcement.status === "archived" ? "archived" : "active";
    const matchesStatus = announcementStatusFilter === "all" || status === announcementStatusFilter;
    const query = normalizeAdminSearchTerm(announcementQuery);
    const matchesQuery = !query || normalizeAdminSearchTerm(`${announcement.title || ""} ${announcement.body || ""} ${announcement.date || ""}`).includes(query);
    return matchesStatus && matchesQuery;
  });
  const visibleAnnouncements = filteredAnnouncements.slice(0, visibleAnnouncementLimit);

  function submitAnnouncement(event) {
    event.preventDefault();
    if (!window.confirm("¿Publicar/guardar este aviso para la liga?")) return;
    onAddAnnouncement(getFormPayload(event.currentTarget));
    setNotice("Aviso guardado correctamente.");
    event.currentTarget.reset();
    setCreateAnnouncementOpen(false);
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
    <section className="panel announcements-admin-panel">
      <SectionHeading eyebrow="Comunicacion" title="Avisos publicos" />
      <div className="announcement-command-center">
        <article>
          <span><AdminIcon type="announcements" /></span>
          <strong>{announcementSummary.active}</strong>
          <small>Publicados</small>
        </article>
        <article>
          <span><AdminIcon type="backups" /></span>
          <strong>{announcementSummary.archived}</strong>
          <small>Archivados</small>
        </article>
        <article>
          <span><AdminIcon type="identity" /></span>
          <strong>{announcements.length}</strong>
          <small>Total creados</small>
        </article>
      </div>
      <p className="helper-text">Los avisos activos apareceran en la pagina publica. Usa archivado para conservar historial sin mostrarlo al publico.</p>
      {notice && <p className="auth-ok">{notice}</p>}

      <button className="announcement-create-button" type="button" onClick={() => setCreateAnnouncementOpen(true)}>
          <span><AdminIcon type="announcements" /></span>
          <div>
            <strong>Nuevo aviso</strong>
            <small>Crear comunicado publico o archivado</small>
          </div>
          <em>Crear nuevo aviso</em>
      </button>

      {createAnnouncementOpen && (
        <div className="announcement-modal" role="dialog" aria-modal="true" aria-label="Crear nuevo aviso">
          <button className="announcement-modal-backdrop" type="button" aria-label="Cancelar nuevo aviso" onClick={() => setCreateAnnouncementOpen(false)} />
          <section className="announcement-modal-sheet">
            <div className="announcement-modal-head">
              <span><AdminIcon type="announcements" /></span>
              <div>
                <strong>Crear nuevo aviso</strong>
                <small>Comunicado publico o archivado.</small>
              </div>
              <button className="announcement-modal-close" type="button" aria-label="Cerrar nuevo aviso" onClick={() => setCreateAnnouncementOpen(false)}>&times;</button>
            </div>
            <form className="announcement-form announcement-modal-form" onSubmit={submitAnnouncement}>
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
              <div className="announcement-modal-actions">
                <button type="button" onClick={() => setCreateAnnouncementOpen(false)}>Cancelar</button>
                <button className="primary" type="submit">Guardar aviso</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <div className="announcement-toolbar">
        <label>Buscar aviso
          <input
            type="search"
            value={announcementQuery}
            onChange={(event) => {
              setAnnouncementQuery(event.target.value);
              setVisibleAnnouncementLimit(8);
            }}
            placeholder="Titulo, fecha o mensaje"
          />
        </label>
        <label>Estado
          <select
            value={announcementStatusFilter}
            onChange={(event) => {
              setAnnouncementStatusFilter(event.target.value);
              setVisibleAnnouncementLimit(8);
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Publicados</option>
            <option value="archived">Archivados</option>
          </select>
        </label>
        <span>{filteredAnnouncements.length} resultado(s)</span>
      </div>

      <div className="announcement-list">
        {visibleAnnouncements.map((announcement) => (
          <details className="announcement-card compact" key={announcement.id}>
            <summary>
              <span className={`announcement-status-dot ${announcement.status === "archived" ? "archived" : "active"}`} />
              <div>
                <strong>{announcement.title}</strong>
                <small>{announcement.date ? formatDate(announcement.date) : "Sin fecha"} · {announcement.status === "archived" ? "Archivado" : "Publicado"}</small>
                <p>{announcement.body || "Sin contenido"}</p>
              </div>
              <em>Editar</em>
            </summary>
            <form onSubmit={(event) => updateExistingAnnouncement(event, announcement.id)}>
              <label>Titulo<input name="title" defaultValue={announcement.title} required aria-label={`Titulo ${announcement.title}`} /></label>
              <label>Fecha<input name="date" type="date" defaultValue={announcement.date || ""} aria-label={`Fecha ${announcement.title}`} /></label>
              <label>Estado
                <select name="status" defaultValue={announcement.status || "active"} aria-label={`Estado ${announcement.title}`}>
                  <option value="active">Publicado</option>
                  <option value="archived">Archivado</option>
                </select>
              </label>
              <label className="wide-field">Aviso
                <textarea name="body" defaultValue={announcement.body} required aria-label={`Aviso ${announcement.title}`} />
              </label>
              <div className="announcement-card-actions">
                <button className="primary" type="submit">Guardar cambios</button>
                <button className="danger" type="button" onClick={() => deleteExistingAnnouncement(announcement)}>Eliminar</button>
              </div>
            </form>
          </details>
        ))}
        {!announcements.length && <p className="empty">Aun no hay avisos registrados.</p>}
        {announcements.length > 0 && !filteredAnnouncements.length && <p className="empty">No hay avisos con esos filtros.</p>}
        {visibleAnnouncements.length < filteredAnnouncements.length && (
          <button className="secondary announcement-load-more" type="button" onClick={() => setVisibleAnnouncementLimit((limit) => limit + 8)}>
            Mostrar 8 mas
          </button>
        )}
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
        <details className={`tournament-card-shell ${competition.status || "active"}`} key={competition.id}>
          <summary className="tournament-card-head">
            <b>{competition.name?.slice(0, 2).toUpperCase() || "TO"}</b>
            <div>
              <strong>{competition.name}</strong>
              <span>{competition.season || league.season} · {competition.type || "Liga"}</span>
            </div>
            <span className="tournament-card-summary-stats">
              <small>Jornada {competition.activeRound || "Auto"}</small>
              <small>{competition.startsAt || "Sin inicio"} - {competition.endsAt || "Sin fin"}</small>
            </span>
            <em>{competition.status === "archived" ? "Historico" : competition.status === "hidden" ? "Oculto" : "Publicado"}</em>
          </summary>
          <form
            className="tournament-card"
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
                <option value="active">Publicado en portada</option>
                <option value="hidden">Oculto del publico</option>
                <option value="archived">Historico archivado</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input name="makeCurrent" type="checkbox" defaultChecked={league.currentCompetitionId === competition.id} />
              Principal si esta activo u oculto
            </label>
            <button className="primary" type="submit">Guardar</button>
          </form>
        </details>
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
    { id: "team", label: "Equipo", icon: "teams" },
    { id: "player", label: "Jugador", icon: "player" },
    { id: "match", label: "Partido", icon: "match" },
    { id: "schedule", label: "Calendario", icon: "calendar" },
    { id: "playoffs", label: "Liguilla", icon: "playoffs" }
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
      const result = await onAddPlayer(payload);
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
                <span><AdminIcon type={mode.icon} /></span>
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
                <label>Fecha<input name="date" type="date" /></label>
                <label>Hora<input name="time" type="time" /></label>
                <label>Cancha<VenueSelect league={league} /></label>
                <label>Local<TeamSelect league={activeCompetitionLeague} name="homeTeamId" /></label>
                <label>Visitante<TeamSelect league={activeCompetitionLeague} name="awayTeamId" /></label>
                <label>Global local<input name="aggregateHome" type="number" min="0" placeholder="Opcional" /></label>
                <label>Global visitante<input name="aggregateAway" type="number" min="0" placeholder="Opcional" /></label>
                <label>Estado
                  <select name="status" defaultValue="scheduled">
                    <option value="scheduled">Programado</option>
                    <option value="postponed">Pospuesto sin fecha</option>
                    <option value="rescheduled">Reprogramado</option>
                    <option value="advanced">Adelantado</option>
                  </select>
                </label>
              </div>
              <p className="helper-text wide-field">Puedes crear el rol completo aunque un juego quede sin fecha, hora o cancha. Si todavia no hay sede definida, guardalo como pospuesto y reprogramalo despues desde Partidos.</p>
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
    <section className="panel admin-data-panel config-admin-panel rules-admin-panel">
      <SectionHeading eyebrow="Estatutos" title="Reglas deportivas de la liga" />
      {rulesNotice && <p className="auth-ok">{rulesNotice}</p>}
      <div className="admin-data-hero config-hero">
        <div>
          <span>Reglamento operativo</span>
          <strong>Default {walkoverLabel}</strong>
          <small>{(rules.disciplineScope || "competition") === "league" ? "Disciplina compartida en toda la liga" : "Disciplina separada por categoria"}</small>
        </div>
        <b>{playoffPhaseLabel || `${playoffQualifiers || 0} clasificados`}</b>
      </div>
      <form
        className="rules-form config-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!window.confirm("¿Guardar estas reglas deportivas para la liga?")) return;
          onSaveRules(getFormPayload(event.currentTarget));
          setRulesNotice("Reglas guardadas correctamente.");
        }}
      >
        <div className="config-form-section">
          <h3>Defaults y bajas</h3>
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
        </div>
        <div className="config-form-section">
          <h3>Disciplina</h3>
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
        </div>
        <div className="config-form-section">
          <h3>Liguilla</h3>
          <label>Equipos a liguilla
            <input name="playoffQualifiers" type="number" min="0" max="64" defaultValue={playoffQualifiers} />
          </label>
          <label>Partidos minimos por jugador
            <input name="minimumPlayoffAppearances" type="number" min="0" max="64" defaultValue={minimumPlayoffAppearances} />
          </label>
          <label>Notas del reglamento
            <textarea name="notes" defaultValue={rules.notes || ""} placeholder="Ej. Criterios de sancion, defaults, bajas o acuerdos de asamblea." />
          </label>
        </div>
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
      <details className="config-details appearance-config-details">
        <summary>Ajustes manuales de partidos jugados</summary>
        <AppearanceAdjustmentsPanel
          league={league}
          onAddAppearanceAdjustment={onAddAppearanceAdjustment}
          onDeleteAppearanceAdjustment={onDeleteAppearanceAdjustment}
        />
      </details>
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

function AdminMatchTeamBadge({ team, side = "home" }) {
  const initials = getInitials(team?.name || (side === "home" ? "L" : "V"));
  return (
    <span className={`admin-match-team-badge ${side}`}>
      {team?.logoUrl ? <img alt="" src={team.logoUrl} /> : initials}
    </span>
  );
}

function getAdminMatchScheduleState(match) {
  const hasDate = Boolean(match.date);
  const hasTime = Boolean(match.time);
  const hasVenue = Boolean(match.venue);
  const complete = hasDate && hasTime && hasVenue;
  const finished = match.status === "finished" || match.status === "walkover";
  const pendingAttention = match.status === "postponed" || match.status === "suspended";

  if (finished) return { tone: "finished", label: "Finalizado", detail: "Resultado registrado", complete, hasDate, hasTime, hasVenue };
  if (pendingAttention) return { tone: "pending", label: getMatchStatusLabel(match.status), detail: match.scheduleNote || "Requiere seguimiento", complete, hasDate, hasTime, hasVenue };
  if (complete) return { tone: "scheduled", label: getMatchStatusLabel(match.status), detail: `${formatDate(match.date)} · ${match.time}${match.venue ? ` · ${match.venue}` : ""}`, complete, hasDate, hasTime, hasVenue };
  return { tone: "pending", label: "Pendiente", detail: "Sin programar", complete, hasDate, hasTime, hasVenue };
}

function AdminMatchEditorCard({
  canEditMatchResults,
  getCompetitionLeague,
  league,
  match,
  onDelete,
  onSubmit,
  showingAllCompetitions = false
}) {
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  const competition = getCompetition(league, match.competitionId);
  const scheduleState = getAdminMatchScheduleState(match);
  const isInitialResultVisible = match.status === "finished" || match.status === "walkover";
  const [statusValue, setStatusValue] = useState(match.status || "scheduled");
  const [resultVisible, setResultVisible] = useState(isInitialResultVisible);
  const resultEnabled = resultVisible || statusValue === "finished" || statusValue === "walkover";
  const stage = match.stage || "regular";
  const isPlayoff = stage === "playoff";
  const editable = canEditMatchResults || isEditableScheduleStatus(match.status);

  useEffect(() => {
    const nextStatus = match.status || "scheduled";
    setStatusValue(nextStatus);
    setResultVisible(nextStatus === "finished" || nextStatus === "walkover");
  }, [match.id, match.status]);

  function handleStatusChange(event) {
    const nextStatus = event.target.value;
    setStatusValue(nextStatus);
    if (nextStatus === "finished" || nextStatus === "walkover") setResultVisible(true);
  }

  return (
    <details className={`admin-match-editor-card ${scheduleState.tone}`} data-match-id={match.id}>
      <summary className="admin-match-compact-card">
        <span className="admin-match-index">{match.round || "-"}</span>
        <div className="admin-match-compact-team home">
          <AdminMatchTeamBadge team={homeTeam} side="home" />
          <strong>{homeTeam?.name || "Local"}</strong>
        </div>
        <span className="admin-match-vs">VS</span>
        <div className="admin-match-compact-team away">
          <AdminMatchTeamBadge team={awayTeam} side="away" />
          <strong>{awayTeam?.name || "Visitante"}</strong>
        </div>
        <div className="admin-match-quick-status">
          <b>{scheduleState.label}</b>
          <small>{scheduleState.detail}</small>
        </div>
        <span className="admin-match-edit-pill">Editar</span>
        <span className="admin-match-chevron" aria-hidden="true">⌄</span>
      </summary>

      <form className="admin-match-edit-panel" onSubmit={onSubmit}>
        <header className="admin-match-edit-head">
          <div>
            <span>Partido {match.round || "-"}</span>
            <strong>{homeTeam?.name || "Local"} <b>VS</b> {awayTeam?.name || "Visitante"}</strong>
          </div>
          <small className={`admin-match-status-badge ${scheduleState.tone}`}>{scheduleState.label}</small>
          <button className="admin-match-delete-icon" type="button" disabled={!editable} onClick={onDelete} aria-label="Eliminar partido">🗑</button>
        </header>

        <div className="admin-match-readiness" aria-label="Indicador de programacion">
          <span className={scheduleState.hasDate ? "ok" : "missing"}>Fecha {scheduleState.hasDate ? "✓" : "✕"}</span>
          <span className={scheduleState.hasTime ? "ok" : "missing"}>Hora {scheduleState.hasTime ? "✓" : "✕"}</span>
          <span className={scheduleState.hasVenue ? "ok" : "missing"}>Cancha {scheduleState.hasVenue ? "✓" : "✕"}</span>
        </div>

        <section className="admin-match-edit-block">
          <h4><span aria-hidden="true">▣</span> Programacion</h4>
          <div className="admin-match-field-grid">
            <label>Fecha
              <input name="date" defaultValue={match.date} aria-label={`Fecha ${match.id}`} type="date" placeholder="Seleccionar fecha" />
              {!match.date && <small>Sin definir</small>}
            </label>
            <label>Hora
              <input name="time" defaultValue={match.time || ""} aria-label={`Hora ${match.id}`} type="time" placeholder="Seleccionar hora" />
              {!match.time && <small>Sin definir</small>}
            </label>
            <label>Cancha
              <VenueSelect league={league} defaultValue={match.venue || ""} ariaLabel={`Cancha ${match.id}`} />
              {!match.venue && <small>Seleccionar cancha</small>}
            </label>
          </div>
        </section>

        <section className="admin-match-edit-block">
          <h4><span aria-hidden="true">♜</span> Informacion del torneo</h4>
          <div className="admin-match-field-grid tournament">
            <label>Categoria
              <CompetitionSelect league={league} name="competitionId" defaultValue={match.competitionId || getDefaultCompetitionId(league)} />
            </label>
            <label>Tipo
              <select name="stage" defaultValue={stage} aria-label={`Tipo ${match.id}`}>
                <option value="regular">Regular</option>
                <option value="playoff">Liguilla</option>
              </select>
            </label>
            <label>Jornada
              <input name="round" defaultValue={match.round} aria-label={`Jornada ${match.id}`} type="number" min="1" required />
            </label>
            <label>Fase
              <select name="playoffRound" defaultValue={match.playoffRound || ""} aria-label={`Fase ${match.id}`} required={isPlayoff}>
                <option value="">{isPlayoff ? "Selecciona fase" : "No aplica"}</option>
                {PLAYOFF_PHASE_OPTIONS.map((phase) => (
                  <option key={phase.value} value={phase.label}>{phase.label}</option>
                ))}
                <option value="Repechaje">Repechaje</option>
              </select>
            </label>
            <label>Juego
              <select name="playoffLeg" defaultValue={match.playoffLeg || ""} aria-label={`Juego ${match.id}`}>
                <option value="">{isPlayoff ? "Unico" : "No aplica"}</option>
                <option value="Ida">Ida</option>
                <option value="Vuelta">Vuelta</option>
              </select>
            </label>
          </div>
          {showingAllCompetitions && <small className="admin-match-context-note">{competition?.name || "Sin categoria"} | {competition?.season || "Temporada"}</small>}
        </section>

        <section className="admin-match-edit-block">
          <h4><span aria-hidden="true">⚑</span> Estado del partido</h4>
          <div className="admin-match-field-grid status-notes">
            <label>Estado
              <MatchStatusSelect
                canEditMatchResults={canEditMatchResults}
                defaultValue={match.status || "scheduled"}
                ariaLabel={`Estado ${match.id}`}
                onChange={handleStatusChange}
              />
            </label>
            <label>Motivo / nota
              <textarea name="scheduleNote" defaultValue={match.scheduleNote || ""} aria-label={`Nota programacion ${match.id}`} placeholder="Escribe alguna nota o motivo..." />
            </label>
          </div>
        </section>

        <section className={`admin-match-edit-block result ${resultEnabled ? "expanded" : "hidden-result"}`}>
          <div className="admin-match-block-title-row">
            <h4><span aria-hidden="true">▥</span> Resultado</h4>
            {!resultEnabled && <small>Oculto</small>}
          </div>
          {!resultEnabled ? (
            <>
              <p>Los campos de resultado se habilitaran cuando el partido cambie a Finalizado.</p>
              <button className="admin-match-show-result" type="button" onClick={() => setResultVisible(true)}>Mostrar resultado</button>
              {canEditMatchResults && (
                <>
                  <input type="hidden" name="homeGoals" defaultValue={match.homeGoals ?? ""} />
                  <input type="hidden" name="awayGoals" defaultValue={match.awayGoals ?? ""} />
                  <input type="hidden" name="extraTimeHomeGoals" defaultValue={match.extraTimeHomeGoals ?? ""} />
                  <input type="hidden" name="extraTimeAwayGoals" defaultValue={match.extraTimeAwayGoals ?? ""} />
                  <input type="hidden" name="penaltyHomeGoals" defaultValue={match.penaltyHomeGoals ?? ""} />
                  <input type="hidden" name="penaltyAwayGoals" defaultValue={match.penaltyAwayGoals ?? ""} />
                </>
              )}
              <input type="hidden" name="aggregateHome" defaultValue={match.aggregateHome ?? ""} />
              <input type="hidden" name="aggregateAway" defaultValue={match.aggregateAway ?? ""} />
              <input type="hidden" name="homeTeamId" defaultValue={match.homeTeamId} />
              <input type="hidden" name="awayTeamId" defaultValue={match.awayTeamId} />
            </>
          ) : (
            <div className="admin-match-score-editor">
              <div className="admin-match-score-team-card home">
                <AdminMatchTeamBadge team={homeTeam} side="home" />
                <div>
                  <small>Local</small>
                  <strong>{homeTeam?.name || "Equipo local"}</strong>
                </div>
              </div>
              <b className="admin-match-score-vs">VS</b>
              <div className="admin-match-score-team-card away">
                <AdminMatchTeamBadge team={awayTeam} side="away" />
                <div>
                  <small>Visitante</small>
                  <strong>{awayTeam?.name || "Equipo visitante"}</strong>
                </div>
              </div>

              <label className="admin-match-team-select home">Equipo local
                <TeamSelect league={getCompetitionLeague(match.competitionId)} name="homeTeamId" defaultValue={match.homeTeamId} />
              </label>
              <label className="admin-match-team-select away">Equipo visitante
                <TeamSelect league={getCompetitionLeague(match.competitionId)} name="awayTeamId" defaultValue={match.awayTeamId} />
              </label>

              <div className="admin-match-score-fields home">
                {canEditMatchResults && <label>Goles<input name="homeGoals" defaultValue={match.homeGoals ?? ""} aria-label={`Goles local ${match.id}`} type="number" min="0" placeholder="0" /></label>}
                {canEditMatchResults && <label>Tiempo extra<input name="extraTimeHomeGoals" defaultValue={match.extraTimeHomeGoals ?? ""} aria-label={`Tiempo extra local ${match.id}`} type="number" min="0" placeholder="-" /></label>}
                {canEditMatchResults && <label>Penales<input name="penaltyHomeGoals" defaultValue={match.penaltyHomeGoals ?? ""} aria-label={`Penales local ${match.id}`} type="number" min="0" placeholder="-" /></label>}
                <label>Global<input name="aggregateHome" defaultValue={match.aggregateHome ?? ""} aria-label={`Global local ${match.id}`} type="number" min="0" placeholder="-" /></label>
              </div>
              <div className="admin-match-score-fields away">
                {canEditMatchResults && <label>Goles<input name="awayGoals" defaultValue={match.awayGoals ?? ""} aria-label={`Goles visitante ${match.id}`} type="number" min="0" placeholder="0" /></label>}
                {canEditMatchResults && <label>Tiempo extra<input name="extraTimeAwayGoals" defaultValue={match.extraTimeAwayGoals ?? ""} aria-label={`Tiempo extra visitante ${match.id}`} type="number" min="0" placeholder="-" /></label>}
                {canEditMatchResults && <label>Penales<input name="penaltyAwayGoals" defaultValue={match.penaltyAwayGoals ?? ""} aria-label={`Penales visitante ${match.id}`} type="number" min="0" placeholder="-" /></label>}
                <label>Global<input name="aggregateAway" defaultValue={match.aggregateAway ?? ""} aria-label={`Global visitante ${match.id}`} type="number" min="0" placeholder="-" /></label>
              </div>
            </div>
          )}
        </section>

        <footer className="admin-match-form-actions">
          <button className="danger" type="button" disabled={!editable} onClick={onDelete}>Eliminar partido</button>
          <button className="primary" type="submit" disabled={!editable}>Guardar cambios</button>
        </footer>
      </form>
    </details>
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
  const [listSearch, setListSearch] = useState("");
  const [teamStatusFilter, setTeamStatusFilter] = useState("all");
  const [playerPositionFilter, setPlayerPositionFilter] = useState("all");
  const [playerStatusFilter, setPlayerStatusFilter] = useState("all");
  const [matchListStatusFilter, setMatchListStatusFilter] = useState("active");
  const showingAllCompetitions = selectedCompetitionId === "all";
  const selectedCompetition = showingAllCompetitions ? null : getCompetition(league, selectedCompetitionId);
  const activeCompetitionLeague = useMemo(
    () => (showingAllCompetitions ? league : scopeLeagueToCompetition(league, selectedCompetitionId)),
    [league, selectedCompetitionId, showingAllCompetitions]
  );
  const filteredTeamsForList = useMemo(() => {
    const query = normalizeAdminSearchTerm(listSearch);
    return activeCompetitionLeague.teams.filter((team) => {
      if (teamStatusFilter !== "all" && (team.status || "active") !== teamStatusFilter) return false;
      if (!query) return true;
      const competition = getCompetition(league, team.competitionId);
      return normalizeAdminSearchTerm(`${team.name} ${team.coach || ""} ${team.assistantCoach || ""} ${team.address || ""} ${competition?.name || ""}`).includes(query);
    });
  }, [activeCompetitionLeague.teams, league, listSearch, teamStatusFilter]);
  const filteredPlayersForList = useMemo(() => {
    const query = normalizeAdminSearchTerm(listSearch);
    return activeCompetitionLeague.players.filter((player) => {
      const team = getTeam(league, player.teamId);
      const position = getPlayerPositionOptionValue(player.position);
      const status = player.status || "active";
      if (playerPositionFilter !== "all" && position !== playerPositionFilter) return false;
      if (playerStatusFilter !== "all" && status !== playerStatusFilter) return false;
      if (!query) return true;
      const statusLabel = PLAYER_STATUS_OPTIONS.find((item) => item.value === status)?.label || "Activo";
      return normalizeAdminSearchTerm(`${player.number || ""} ${player.name} ${position} ${team?.name || ""} ${statusLabel}`).includes(query);
    });
  }, [activeCompetitionLeague.players, league, listSearch, playerPositionFilter, playerStatusFilter]);
  const competitionMatches = useMemo(() => {
    const query = normalizeAdminSearchTerm(listSearch);
    return activeCompetitionLeague.matches.filter((match) => {
      const status = match.status || "scheduled";
      if (matchListStatusFilter === "active" && !isEditableScheduleStatus(status)) return false;
      if (matchListStatusFilter === "pending_date" && (match.date || match.time || match.venue)) return false;
      if (matchListStatusFilter !== "all" && matchListStatusFilter !== "active" && matchListStatusFilter !== "pending_date" && status !== matchListStatusFilter) return false;
      if (!query) return true;
      const homeTeam = getTeam(league, match.homeTeamId);
      const awayTeam = getTeam(league, match.awayTeamId);
      const competition = getCompetition(league, match.competitionId);
      return normalizeAdminSearchTerm(`${homeTeam?.name || ""} ${awayTeam?.name || ""} ${match.venue || ""} jornada ${match.round || ""} ${match.date || ""} ${match.time || ""} ${competition?.name || ""}`).includes(query);
    });
  }, [activeCompetitionLeague.matches, league, listSearch, matchListStatusFilter]);
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

    for (const player of [...filteredPlayersForList].sort((a, b) => (
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
  }, [activeCompetitionLeague.teams, filteredPlayersForList, league]);
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
    const payload = getFormPayload(form);
    if (isActiveScheduleStatus(payload.status) && !isValidScheduleDate(payload.date)) {
      window.alert("Para programar o reprogramar este partido, selecciona una fecha valida.");
      form.elements.date?.focus();
      return;
    }
    if (!window.confirm("¿Guardar cambios de este partido?")) return;
    const result = await onUpdateMatch(matchId, payload);
    if (result === false) return;
    setListNotice("Datos del partido guardados correctamente.");
  }

  async function handlePlayerSave(player, form) {
    if (!window.confirm("¿Guardar cambios de este jugador?")) return;
    try {
      const payload = await getPlayerPayload(form, player.photoUrl || "", { authToken, leagueId: league.id, scope: "player-photos" });
      const result = await onUpdatePlayer(player.id, payload);
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
      <div className="admin-filter-console list-filter-bar">
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
        <label>Buscar
          <input
            type="search"
            value={listSearch}
            onChange={(event) => setListSearch(event.target.value)}
            placeholder={activeList === "matches" ? "Equipo, jornada, cancha o fecha" : activeList === "players" ? "Nombre, numero o equipo" : "Equipo, entrenador o sede"}
          />
        </label>
        {activeList === "teams" && (
          <label>Estado
            <select value={teamStatusFilter} onChange={(event) => setTeamStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="withdrawn">Baja</option>
            </select>
          </label>
        )}
        {activeList === "players" && (
          <>
            <label>Posicion
              <select value={playerPositionFilter} onChange={(event) => setPlayerPositionFilter(event.target.value)}>
                <option value="all">Todas</option>
                {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
            <label>Estatus
              <select value={playerStatusFilter} onChange={(event) => setPlayerStatusFilter(event.target.value)}>
                <option value="all">Todos</option>
                {PLAYER_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </>
        )}
        {activeList === "matches" && (
          <label>Estado
            <select value={matchListStatusFilter} onChange={(event) => {
              setMatchListStatusFilter(event.target.value);
              setOpenRounds(new Set());
            }}>
              <option value="active">Programables</option>
              <option value="pending_date">Sin fecha/cancha</option>
              <option value="postponed">Pospuestos</option>
              <option value="rescheduled">Reprogramados</option>
              <option value="advanced">Adelantados</option>
              <option value="finished">Finalizados</option>
              <option value="all">Todos</option>
            </select>
          </label>
        )}
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
            {filteredTeamsForList.map((team) => (
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
            {activeCompetitionLeague.teams.length > 0 && !filteredTeamsForList.length && <p className="empty">No hay equipos con esos filtros.</p>}
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
                      className={`editable-row player-row ${isPlayerHistoricalOnly(player) ? "historical-player-row" : ""}`}
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
                      <select name="status" defaultValue={player.status || "active"} aria-label={`Estatus de ${player.name}`}>
                        {PLAYER_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
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
            {activeCompetitionLeague.players.length > 0 && !filteredPlayersForList.length && <p className="empty">No hay jugadores con esos filtros.</p>}
          </div>
        </div>}

        {activeList === "matches" && <div className="admin-match-board wide-field">
          <div className="admin-match-board-head">
            <div>
              <span>Operacion</span>
              <h3>Partidos y datos</h3>
              <p>Programa jornadas, revisa pendientes y edita un partido a la vez sin perder contexto.</p>
            </div>
            <small>{competitionMatches.length} partido(s)</small>
          </div>

          {playoffEditMatches.length > 0 && (
            <section className="admin-round-card playoff">
              <div className="admin-round-summary static">
                <div>
                  <span>{selectedCompetition?.name || "Fase final"}</span>
                  <strong>Liguilla</strong>
                  <small>{playoffEditMatches.length} partido(s)</small>
                </div>
                <div className="admin-round-metrics">
                  <span><b>{playoffEditMatches.length}</b>Total partidos</span>
                  <span><b>{playoffEditMatches.filter((match) => getAdminMatchScheduleState(match).complete && isActiveScheduleStatus(match.status)).length}</b>Programados</span>
                  <span><b>{playoffEditMatches.filter((match) => !getAdminMatchScheduleState(match).complete && match.status !== "finished" && match.status !== "walkover").length}</b>Pendientes</span>
                  <span><b>{playoffEditMatches.filter((match) => match.status === "finished" || match.status === "walkover").length}</b>Finalizados</span>
                </div>
                <button
                  className="admin-round-delete"
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
              <div className="admin-match-card-list">
                {playoffEditMatches.map((match) => (
                  <AdminMatchEditorCard
                    canEditMatchResults={canEditMatchResults}
                    getCompetitionLeague={getCompetitionLeague}
                    key={match.id}
                    league={league}
                    match={match}
                    onDelete={() => confirmDelete("este partido de liguilla", () => onDeleteMatch(match.id), "Partido de liguilla eliminado correctamente.")}
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleMatchSave(match.id, event.currentTarget);
                    }}
                    showingAllCompetitions={showingAllCompetitions}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="admin-round-list">
            {matchRounds.map(({ competitionId, round, matches }) => {
              const roundKey = showingAllCompetitions ? `${competitionId || "sin-categoria"}:${round}` : String(round);
              const isOpen = openRounds.has(roundKey);
              const roundCompetition = getCompetition(league, competitionId);
              const scheduledCount = matches.filter((match) => getAdminMatchScheduleState(match).complete && isActiveScheduleStatus(match.status)).length;
              const pendingCount = matches.filter((match) => !getAdminMatchScheduleState(match).complete && match.status !== "finished" && match.status !== "walkover").length;
              const finishedCount = matches.filter((match) => match.status === "finished" || match.status === "walkover").length;
              return (
                <section className={`admin-round-card ${Number(round) === Number(activeRound) ? "active" : ""}`} key={roundKey}>
                  <button className="admin-round-summary" type="button" onClick={() => toggleRound(roundKey)}>
                    <div>
                      <span>{showingAllCompetitions && roundCompetition ? roundCompetition.name : selectedCompetition?.name || "Categoria"}</span>
                      <strong>Jornada {round || "-"}</strong>
                      <small>Fase regular</small>
                    </div>
                    <div className="admin-round-metrics">
                      <span><b>{matches.length}</b>Total partidos</span>
                      <span><b>{scheduledCount}</b>Programados</span>
                      <span><b>{pendingCount}</b>Pendientes</span>
                      <span><b>{finishedCount}</b>Finalizados</span>
                    </div>
                    <span className="admin-round-open">{isOpen ? "Ocultar" : "Ver partidos"}</span>
                  </button>
                  {isOpen && (
                    <div className="admin-match-card-list">
                      {matches.map((match) => (
                        <AdminMatchEditorCard
                          canEditMatchResults={canEditMatchResults}
                          getCompetitionLeague={getCompetitionLeague}
                          key={match.id}
                          league={league}
                          match={match}
                          onDelete={() => confirmDelete("este partido", () => onDeleteMatch(match.id), "Partido eliminado correctamente.")}
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleMatchSave(match.id, event.currentTarget);
                          }}
                          showingAllCompetitions={showingAllCompetitions}
                        />
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
            {activeCompetitionLeague.matches.length > 0 && !competitionMatches.length && (
              <p className="empty">No hay partidos que coincidan con los filtros actuales.</p>
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
  const preferredMatch = competitionLeague.matches.find((match) => isActiveScheduleStatus(match.status)) || competitionLeague.matches[0];
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
  const [matchSearch, setMatchSearch] = useState("");
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
      if (matchStatusFilter === "scheduled") return isActiveScheduleStatus(match.status);
      if (matchStatusFilter === "finished") return match.status === "finished" || match.status === "walkover";
      return true;
    }).filter((match) => {
      const query = normalizeAdminSearchTerm(matchSearch);
      if (!query) return true;
      const homeTeam = getTeam(league, match.homeTeamId);
      const awayTeam = getTeam(league, match.awayTeamId);
      return normalizeAdminSearchTerm([
        homeTeam?.name,
        awayTeam?.name,
        match.venue,
        match.date,
        match.time,
        `jornada ${match.round || ""}`,
        getMatchStatusLabel(match.status)
      ].filter(Boolean).join(" ")).includes(query);
    })
  ), [league, matchSearch, matchStatusFilter, roundMatches]);
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [extraTimeEnabled, setExtraTimeEnabled] = useState(false);
  const [penaltiesEnabled, setPenaltiesEnabled] = useState(false);
  const [extraTimeHomeGoals, setExtraTimeHomeGoals] = useState("");
  const [extraTimeAwayGoals, setExtraTimeAwayGoals] = useState("");
  const [penaltyHomeGoals, setPenaltyHomeGoals] = useState("");
  const [penaltyAwayGoals, setPenaltyAwayGoals] = useState("");
  const [observations, setObservations] = useState("");
  const [sheetMode, setSheetMode] = useState("played");
  const [defaultWinner, setDefaultWinner] = useState("home");
  const [defaultScore, setDefaultScore] = useState("3");
  const [events, setEvents] = useState([]);
  const [validationMessage, setValidationMessage] = useState("");
  const [sheetNotice, setSheetNotice] = useState("");
  const [sheetStep, setSheetStep] = useState("select");
  const [eventDraft, setEventDraft] = useState(null);

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
      setExtraTimeEnabled(false);
      setPenaltiesEnabled(false);
      setExtraTimeHomeGoals("");
      setExtraTimeAwayGoals("");
      setPenaltyHomeGoals("");
      setPenaltyAwayGoals("");
      setObservations("");
      setSheetMode("played");
      setDefaultWinner("home");
      setDefaultScore("3");
      setEvents([]);
      setValidationMessage("");
      setSheetStep("select");
      setEventDraft(null);
      return;
    }

    const isSavedSheet = selectedMatch.status === "finished" || selectedMatch.status === "walkover";
    setHomeGoals(isSavedSheet ? selectedMatch.homeGoals ?? 0 : 0);
    setAwayGoals(isSavedSheet ? selectedMatch.awayGoals ?? 0 : 0);
    setExtraTimeEnabled(isSavedSheet && selectedMatch.extraTimeHomeGoals !== null && selectedMatch.extraTimeHomeGoals !== undefined && selectedMatch.extraTimeAwayGoals !== null && selectedMatch.extraTimeAwayGoals !== undefined);
    setPenaltiesEnabled(isSavedSheet && selectedMatch.penaltyHomeGoals !== null && selectedMatch.penaltyHomeGoals !== undefined && selectedMatch.penaltyAwayGoals !== null && selectedMatch.penaltyAwayGoals !== undefined);
    setExtraTimeHomeGoals(isSavedSheet ? selectedMatch.extraTimeHomeGoals ?? "" : "");
    setExtraTimeAwayGoals(isSavedSheet ? selectedMatch.extraTimeAwayGoals ?? "" : "");
    setPenaltyHomeGoals(isSavedSheet ? selectedMatch.penaltyHomeGoals ?? "" : "");
    setPenaltyAwayGoals(isSavedSheet ? selectedMatch.penaltyAwayGoals ?? "" : "");
    setObservations(isSavedSheet ? selectedMatch.observations || "" : "");
    const isWalkover = selectedMatch.status === "walkover";
    const winner = Number(selectedMatch.homeGoals || 0) > Number(selectedMatch.awayGoals || 0) ? "home" : "away";
    const walkoverGoals = Math.max(Number(selectedMatch.homeGoals || 0), Number(selectedMatch.awayGoals || 0));
    setSheetMode(isWalkover ? `default_${walkoverGoals === 5 ? "5" : "3"}` : "played");
    setDefaultWinner(winner);
    setDefaultScore(walkoverGoals === 5 ? "5" : "3");
    setEvents(isSavedSheet ? selectedMatch.events.map((event, index) => ({
      id: `${selectedMatch.id}-${index}-${event.type}-${event.playerId}`,
      type: event.type,
      lockedType: event.type,
      teamId: event.teamId || getPlayer(league, event.playerId)?.teamId || selectedMatch.homeTeamId,
      lockedTeamId: "",
      playerId: event.playerId,
      minute: event.minute || "",
      minuteLabel: event.minuteLabel || "",
      suspensionMatches: event.suspensionMatches || 1,
      suspensionIndefinite: Boolean(event.suspensionIndefinite),
      disciplinaryPending: Boolean(event.disciplinaryPending),
      reason: event.reason || "",
      playerQuery: ""
    })) : []);
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

  function createMatchSheetEvent(type, teamId = selectedMatch?.homeTeamId) {
    return {
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      lockedType: type,
      teamId,
      lockedTeamId: "",
      playerId: "",
      minute: "",
      suspensionMatches: type === "red" ? Number(league.rules?.defaultRedSuspensionMatches || 1) : 0,
      suspensionIndefinite: false,
      reason: "",
      playerQuery: ""
    };
  }

  function openEventModal(type, teamId = selectedMatch?.homeTeamId, existingEvent = null) {
    if (type === "injury_note" || type === "other_note") {
      setEventDraft({
        id: `note-${Date.now()}`,
        type,
        teamId,
        playerId: "",
        minute: "",
        note: "",
        playerQuery: ""
      });
      return;
    }
    setEventDraft(existingEvent ? { ...existingEvent } : createMatchSheetEvent(type, teamId));
  }

  function updateEventDraft(field, value) {
    setEventDraft((current) => {
      if (!current) return current;
      if (current.type === "injury_note" || current.type === "other_note") return { ...current, [field]: value };
      return updateMatchSheetEventItem(current, field, value, {
        getPlayersForTeam,
        getPlayersForEvent,
        defaultRedSuspensionMatches: league.rules?.defaultRedSuspensionMatches,
        lockGoalTeam: false
      });
    });
  }

  function appendObservationLine(line) {
    setObservations((current) => [String(current || "").trim(), line].filter(Boolean).join("\n"));
  }

  function saveEventDraft() {
    if (!eventDraft) return;
    if (eventDraft.type === "injury_note" || eventDraft.type === "other_note") {
      const team = getTeam(league, eventDraft.teamId);
      const player = getPlayer(league, eventDraft.playerId);
      const minuteText = eventDraft.minute ? `${eventDraft.minute}' · ` : "";
      const label = eventDraft.type === "injury_note" ? "Lesion" : "Incidencia";
      const playerText = player ? `${player.name} (${team?.name || "Equipo"})` : team?.name || "Equipo";
      appendObservationLine(`${label}: ${minuteText}${playerText}${eventDraft.note ? ` — ${eventDraft.note}` : ""}`);
      setSheetStep("notes");
      setEventDraft(null);
      return;
    }

    setEvents((current) => {
      const exists = current.some((item) => item.id === eventDraft.id);
      return exists
        ? current.map((item) => item.id === eventDraft.id ? eventDraft : item)
        : [...current, eventDraft];
    });
    setEventDraft(null);
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
      lockedType: "goal",
      teamId,
      lockedTeamId: "",
      playerId: "",
      minute: "",
      suspensionMatches: 0,
      suspensionIndefinite: false,
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
    setSheetNotice("Se agregaron eventos de gol pendientes. Selecciona jugador y minuto antes de guardar.");
    setEvents((current) => {
      const homeMissing = buildMissingGoalEvents(selectedMatch.homeTeamId, current);
      const withHome = [...current, ...homeMissing];
      const awayMissing = buildMissingGoalEvents(selectedMatch.awayTeamId, withHome);
      return [...withHome, ...awayMissing];
    });
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
      <div className="match-sheet admin-sheet-app">
        <div className="admin-sheet-shell">
          <header className="admin-sheet-hero">
            <div className="admin-sheet-brand">
              <img src={ligatecLogo} alt="" />
              <div>
                <span>Operacion de liga</span>
                <strong>Captura de Actas</strong>
              </div>
            </div>
          </header>
          <section className="admin-sheet-screen admin-sheet-select-screen">
            <div className="admin-sheet-screen-head">
              <div>
                <span>Selecciona un partido para comenzar.</span>
                <strong>Sin partidos disponibles</strong>
              </div>
            </div>
            <div className="sheet-picker admin-sheet-picker">
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
          </section>
        </div>
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
    if (!isDefaultSheet) {
      const validateTiebreaker = (enabled, homeValue, awayValue, label) => {
        if (!enabled) return "";
        const homeScore = Number(homeValue);
        const awayScore = Number(awayValue);
        if (homeValue === "" || awayValue === "") return `Captura ambos marcadores de ${label}.`;
        if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
          return `${label} debe tener numeros enteros entre 0 y 99.`;
        }
        return "";
      };
      const extraError = validateTiebreaker(extraTimeEnabled, extraTimeHomeGoals, extraTimeAwayGoals, "tiempo extra");
      if (extraError) return extraError;
      const penaltiesError = validateTiebreaker(penaltiesEnabled, penaltyHomeGoals, penaltyAwayGoals, "penales");
      if (penaltiesError) return penaltiesError;
    }
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

    const invalidMinute = cleanEvents.find((item) => {
      if (item.minute === "") return false;
      const value = String(item.minute || "").trim();
      const added = value.match(/^(\d{1,3})\s*\+\s*(\d{1,2})$/);
      const minute = added ? Number(added[1]) + Number(added[2]) : Number(value);
      return !Number.isFinite(minute) || minute < 0 || minute > 130;
    });
    if (invalidMinute) return "Los minutos deben estar entre 0 y 130.";

    const redWithoutReason = cleanEvents.find((item) => item.type === "red" && !String(item.reason || "").trim());
    if (redWithoutReason) return "Toda tarjeta roja debe tener motivo de sancion.";

    const redWithoutMatches = cleanEvents.find((item) => item.type === "red" && !item.suspensionIndefinite && Number(item.suspensionMatches || 0) < 1);
    if (redWithoutMatches) return "Toda tarjeta roja debe tener al menos 1 partido de sancion.";

    return "";
  }

  function renderEventRow(eventItem, index, isLatest = false) {
    const eventTeamId = eventItem.teamId || selectedMatch.homeTeamId;
    const eventTeam = getTeam(league, eventTeamId);
    const playerTeamId = eventItem.type === "own_goal" ? getOpponentTeamId(eventTeamId) : eventTeamId;
    const player = getPlayer(league, eventItem.playerId);
    const playerNumber = getPlayerNumberForTeam(league, eventItem.playerId, playerTeamId);
    const eventSide = eventTeamId === selectedMatch.homeTeamId ? "home" : "away";

    return (
      <article className={`event-row admin-sheet-timeline-event event-side-${eventSide} event-kind-${eventItem.type} ${isLatest ? "is-latest" : ""}`} key={eventItem.id}>
        <b aria-hidden="true">{getMatchEventIcon(eventItem.type)}</b>
        <time>{eventItem.minute ? `${eventItem.minute}'` : "--'"}</time>
        <div>
          <strong>{getMatchEventLabel(eventItem.type)}</strong>
          <span>{playerNumber ? `#${playerNumber} ` : ""}{player?.name || "Jugador pendiente"}</span>
          <small>{eventTeam?.name || "Equipo"}</small>
        </div>
        <button type="button" onClick={() => openEventModal(eventItem.type, eventTeamId, eventItem)} aria-label={`Editar ${getMatchEventLabel(eventItem.type)}`}>Editar</button>
        <button className="danger ghost-danger" type="button" onClick={() => removeEvent(eventItem.id)} aria-label={`Quitar ${getMatchEventLabel(eventItem.type)}`}>Quitar</button>
      </article>
    );
  }

  function renderFinalEventItem(eventItem, index) {
    const eventTeamId = eventItem.teamId || selectedMatch.homeTeamId;
    const eventTeam = getTeam(league, eventTeamId);
    const playerTeamId = eventItem.type === "own_goal" ? getOpponentTeamId(eventTeamId) : eventTeamId;
    const player = getPlayer(league, eventItem.playerId);
    const playerNumber = getPlayerNumberForTeam(league, eventItem.playerId, playerTeamId);
    const eventSide = eventTeamId === selectedMatch.homeTeamId ? "home" : "away";

    return (
      <article className={`admin-sheet-final-event event-kind-${eventItem.type} event-side-${eventSide}`} key={`${eventItem.id}-final-${index}`}>
        <b aria-hidden="true">{getMatchEventIcon(eventItem.type)}</b>
        <div>
          <strong>{getMatchEventLabel(eventItem.type)}</strong>
          <span>{playerNumber ? `#${playerNumber} ` : ""}{player?.name || "Jugador pendiente"}</span>
        </div>
        <small>{eventItem.minute ? `${eventItem.minute}' · ` : ""}{eventTeam?.name || "Equipo"}</small>
      </article>
    );
  }

  function renderEventModal() {
    if (!eventDraft) return null;
    const isNoteEvent = eventDraft.type === "injury_note" || eventDraft.type === "other_note";
    const eventTeamId = eventDraft.teamId || selectedMatch.homeTeamId;
    const eventTeam = getTeam(league, eventTeamId);
    const playerTeamId = eventDraft.type === "own_goal" ? getOpponentTeamId(eventTeamId) : eventTeamId;
    const eventPlayers = isNoteEvent
      ? getPlayersForTeam(eventTeamId)
      : getEventPlayersForDisplay(eventDraft, playerTeamId);
    const modalTitle = isNoteEvent
      ? eventDraft.type === "injury_note" ? "Registrar lesion" : "Registrar incidencia"
      : getMatchEventLabel(eventDraft.type);

    return (
      <div className="admin-sheet-modal-backdrop" role="presentation" onClick={() => setEventDraft(null)}>
        <div className="admin-sheet-event-modal" role="dialog" aria-modal="true" aria-label={modalTitle} onClick={(event) => event.stopPropagation()}>
          <header>
            <span aria-hidden="true">{isNoteEvent ? eventDraft.type === "injury_note" ? "✚" : "⋯" : getMatchEventIcon(eventDraft.type)}</span>
            <div>
              <small>Evento rapido</small>
              <strong>{modalTitle}</strong>
            </div>
            <button type="button" onClick={() => setEventDraft(null)} aria-label="Cerrar">×</button>
          </header>
          <div className="admin-sheet-modal-grid">
            <label>{eventDraft.type === "own_goal" ? "Equipo favorecido" : "Equipo"}
              <select value={eventTeamId} onChange={(event) => updateEventDraft("teamId", event.target.value)}>
                <option value={selectedMatch.homeTeamId}>{homeTeam?.name || "Local"}</option>
                <option value={selectedMatch.awayTeamId}>{awayTeam?.name || "Visitante"}</option>
              </select>
            </label>
            <label>Minuto
              <input value={eventDraft.minuteLabel || eventDraft.minute || ""} onChange={(event) => updateEventDraft("minute", event.target.value)} inputMode="numeric" placeholder="Ej. 12" />
            </label>
            <label className="wide-field">Buscar jugador
              <input value={eventDraft.playerQuery || ""} onChange={(event) => updateEventDraft("playerQuery", event.target.value)} placeholder="Nombre o numero" />
            </label>
            <label className="wide-field">{eventDraft.type === "own_goal" ? "Jugador que hizo el autogol" : "Jugador"}
              <select value={eventDraft.playerId || ""} onChange={(event) => updateEventDraft("playerId", event.target.value)}>
                <option value="">{eventPlayers.length ? "Selecciona jugador" : "Sin jugadores disponibles"}</option>
                {eventPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{getPlayerNumberForTeam(league, player.id, playerTeamId) || "-"} {player.name}{getPlayerAffiliationForTeam(league, player.id, playerTeamId) ? ` | AFILIADO: ${getTeam(league, player.teamId)?.name || "ORIGEN"}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {eventDraft.type === "red" && (
              <>
                <label className="event-toggle-field wide-field">
                  <input
                    checked={Boolean(eventDraft.suspensionIndefinite)}
                    onChange={(event) => updateEventDraft("suspensionIndefinite", event.target.checked)}
                    type="checkbox"
                  />
                  Inhabilitado indefinido
                </label>
                <label>Partidos de sancion
                  <input
                    value={eventDraft.suspensionIndefinite ? "" : eventDraft.suspensionMatches}
                    onChange={(event) => updateEventDraft("suspensionMatches", event.target.value)}
                    type="number"
                    min="1"
                    placeholder={eventDraft.suspensionIndefinite ? "Indefinido" : "Sancion"}
                    disabled={Boolean(eventDraft.suspensionIndefinite)}
                  />
                </label>
                <label>Motivo
                  <input value={eventDraft.reason || ""} onChange={(event) => updateEventDraft("reason", event.target.value)} placeholder="Ej. Insultos al arbitro" />
                </label>
              </>
            )}
            {isNoteEvent && (
              <label className="wide-field">Detalle
                <textarea value={eventDraft.note || ""} onChange={(event) => updateEventDraft("note", event.target.value)} placeholder="Describe brevemente la situacion." />
              </label>
            )}
          </div>
          <div className="admin-sheet-modal-actions">
            <button type="button" onClick={() => setEventDraft(null)}>Cancelar</button>
            <button className="primary" type="button" onClick={saveEventDraft}>Guardar</button>
          </div>
        </div>
      </div>
    );
  }

  const latestEvent = events[events.length - 1] || null;
  const activeStepIndex = Math.max(0, ADMIN_SHEET_STEPS.findIndex((step) => step.id === sheetStep));
  const selectedStageLabel = (selectedMatch.stage || "regular") === "playoff"
    ? [selectedMatch.playoffRound || "Liguilla", selectedMatch.playoffLeg].filter(Boolean).join(" | ")
    : `Jornada ${selectedMatch.round || "-"}`;
  const yellowCardCount = cleanEvents.filter((item) => item.type === "yellow").length;
  const redCardCount = cleanEvents.filter((item) => item.type === "red").length;
  const ownGoalCount = cleanEvents.filter((item) => item.type === "own_goal").length;
  const injuryNoteCount = String(observations || "").split("\n").filter((line) => normalizeAdminSearchTerm(line).includes("lesion")).length;
  const eventTotalCount = cleanEvents.length;
  const observationsReady = Boolean(String(observations || "").trim());
  const currentStepMeta = ADMIN_SHEET_STEPS[activeStepIndex] || ADMIN_SHEET_STEPS[0];

  function goToSheetStep(nextStepId) {
    setValidationMessage("");
    setSheetStep(nextStepId);
  }

  function moveSheetStep(direction) {
    const nextIndex = Math.min(ADMIN_SHEET_STEPS.length - 1, Math.max(0, activeStepIndex + direction));
    goToSheetStep(ADMIN_SHEET_STEPS[nextIndex].id);
  }

  function changeScore(side, delta) {
    const setter = side === "home" ? setHomeGoals : setAwayGoals;
    const currentValue = Number(side === "home" ? homeGoals : awayGoals || 0);
    setter(String(Math.max(0, currentValue + delta)));
  }

  function renderTeamBadge(team, side) {
    const initials = String(team?.name || side)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

    return (
      <span className={`admin-sheet-team-badge ${side}`}>
        {team?.logoUrl ? <img alt="" src={team.logoUrl} /> : initials || "EQ"}
      </span>
    );
  }

  return (
    <form
      className="match-sheet admin-sheet-app"
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
            extraTimeHomeGoals: !isDefaultSheet && extraTimeEnabled ? extraTimeHomeGoals : "",
            extraTimeAwayGoals: !isDefaultSheet && extraTimeEnabled ? extraTimeAwayGoals : "",
            penaltyHomeGoals: !isDefaultSheet && penaltiesEnabled ? penaltyHomeGoals : "",
            penaltyAwayGoals: !isDefaultSheet && penaltiesEnabled ? penaltyAwayGoals : "",
            observations,
            status: isDefaultSheet ? "walkover" : "finished",
            resolutionType: isDefaultSheet ? "no_show" : penaltiesEnabled ? "penalties" : extraTimeEnabled ? "extra_time" : "normal",
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
      <div className="admin-sheet-shell">
        <header className="admin-sheet-hero">
          {sheetStep !== "select" && (
            <button className="admin-sheet-back-button" type="button" onClick={() => setSheetStep("select")} aria-label="Volver a seleccionar partido">←</button>
          )}
          <div className="admin-sheet-brand">
            <img src={ligatecLogo} alt="" />
            <div>
              <span>{sheetStep === "select" ? "Operacion de liga" : "Captura de Acta"}</span>
              <strong>{sheetStep === "select" ? "Captura de Actas" : "Captura de Acta"}</strong>
            </div>
          </div>
          {sheetStep !== "select" && (
            <div className="admin-sheet-step-chip">
              <span>Paso {currentStepMeta.number} de 5</span>
              <strong>{currentStepMeta.label}</strong>
            </div>
          )}
        </header>

        {sheetStep !== "select" && (
          <>
          <nav className="admin-sheet-stepper" aria-label="Pasos de captura">
            {ADMIN_SHEET_STEPS.map((step, index) => (
              <button
                className={`${sheetStep === step.id ? "active" : ""} ${index < activeStepIndex ? "done" : ""}`}
                key={step.id}
                type="button"
                onClick={() => goToSheetStep(step.id)}
              >
                <span>{index < activeStepIndex ? "✓" : step.number}</span>
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </button>
            ))}
          </nav>
          </>
        )}

        {sheetStep === "select" && (
          <section className="admin-sheet-screen admin-sheet-select-screen">
            <div className="admin-sheet-screen-head">
              <div>
                <span>Selecciona un partido para comenzar.</span>
                <strong>Partidos disponibles</strong>
              </div>
              <small>{visibleRoundMatches.length} partido(s)</small>
            </div>
            <div className="sheet-picker admin-sheet-picker admin-sheet-select-filters">
              <label>Torneo
                <CompetitionSelect
                  league={league}
                  name="sheetCompetitionId"
                  defaultValue={selectedCompetitionId}
                  value={selectedCompetitionId}
                  onChange={(event) => {
                    setSelectedCompetitionId(event.target.value);
                    setSheetStep("select");
                  }}
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
                  <option value="scheduled">Pendientes por capturar</option>
                  <option value="finished">Capturados</option>
                  <option value="all">Todos</option>
                </select>
              </label>
              <label className="sheet-match-search">Buscar
                <input type="search" value={matchSearch} onChange={(event) => setMatchSearch(event.target.value)} placeholder="Buscar equipo o partido..." />
              </label>
            </div>
            <div className="admin-sheet-match-grid" aria-label="Partidos para capturar acta">
              {visibleRoundMatches.map((match) => {
                const cardHomeTeam = getTeam(league, match.homeTeamId);
                const cardAwayTeam = getTeam(league, match.awayTeamId);
                const isCaptured = match.status === "finished" || match.status === "walkover";
                const cardStatusLabel = isCaptured ? "Capturado" : getMatchStatusLabel(match.status);
                return (
                  <button
                    className={selectedMatch?.id === match.id ? "active" : ""}
                    key={match.id}
                    type="button"
                    onClick={() => {
                      setMatchId(match.id);
                      setSheetStep("match");
                    }}
                  >
                    <span className="admin-sheet-match-card-head">
                      <b>{(match.stage || "regular") === "playoff" ? [match.playoffRound || "Liguilla", match.playoffLeg].filter(Boolean).join(" | ") : `J${match.round || "-"}`}</b>
                      <small>{cardStatusLabel}</small>
                    </span>
                    <strong className="admin-sheet-match-teams">
                      {renderTeamBadge(cardHomeTeam, "home")}
                      <span className="admin-sheet-match-team-name home">{cardHomeTeam?.name || "LOCAL"}</span>
                      <em>VS</em>
                      {renderTeamBadge(cardAwayTeam, "away")}
                      <span className="admin-sheet-match-team-name away">{cardAwayTeam?.name || "VISITANTE"}</span>
                    </strong>
                    <span className="admin-sheet-match-meta">{formatDate(match.date)} · {match.time || "POR DEFINIR"}</span>
                    <span className="admin-sheet-match-meta">{match.venue || "Cancha por definir"}</span>
                  </button>
                );
              })}
              {!visibleRoundMatches.length && <p className="empty">No hay partidos con esos filtros.</p>}
            </div>
          </section>
        )}

        {sheetStep === "match" && (
          <section className="admin-sheet-screen admin-sheet-match-screen">
            <div className="admin-sheet-screen-head">
              <div>
                <span>Informacion del partido</span>
                <strong>Confirma que sea el encuentro correcto</strong>
              </div>
              <small>{isEditingSavedSheet ? "Acta capturada" : "Nueva captura"}</small>
            </div>
            <div className="admin-sheet-info-card">
              <div className="admin-sheet-info-versus">
                <div>
                  {renderTeamBadge(homeTeam, "home")}
                  <strong>{homeTeam?.name || "Local"}</strong>
                  <span>Local</span>
                </div>
                <b>VS</b>
                <div>
                  {renderTeamBadge(awayTeam, "away")}
                  <strong>{awayTeam?.name || "Visitante"}</strong>
                  <span>Visitante</span>
                </div>
              </div>
              <div className="admin-sheet-info-list">
                <span><small>Torneo</small><strong>{getCompetition(league, selectedCompetitionId)?.name || competitionLeague.name || "Torneo"}</strong></span>
                <span><small>Jornada</small><strong>{selectedStageLabel}</strong></span>
                <span><small>Fecha</small><strong>{formatDate(selectedMatch.date)}</strong></span>
                <span><small>Hora</small><strong>{selectedMatch.time || "Por definir"}</strong></span>
                <span><small>Cancha</small><strong>{selectedMatch.venue || "Cancha por definir"}</strong></span>
                <span><small>Arbitro</small><strong>{selectedMatch.refereeName || selectedMatch.referee || "Por asignar"}</strong></span>
                <span><small>Estado</small><strong>{getMatchStatusLabel(selectedMatch.status)}</strong></span>
              </div>
            </div>
          </section>
        )}

        {sheetStep === "score" && (
          <section className="admin-sheet-screen">
            <div className="admin-sheet-screen-head">
              <div>
                <span>Detalle del partido</span>
                <strong>Marcador oficial</strong>
              </div>
              <small>El marcador inicia en 0-0</small>
            </div>
            <div className="admin-sheet-score-edit">
              <article>
                {renderTeamBadge(homeTeam, "home")}
                <span>Local</span>
                <strong>{homeTeam?.name || "Local"}</strong>
                <div className="admin-score-stepper">
                  <button type="button" onClick={() => changeScore("home", -1)}>−</button>
                  <input value={homeGoals} onChange={(event) => setHomeGoals(event.target.value)} type="number" min="0" aria-label="Goles local" />
                  <button type="button" onClick={() => changeScore("home", 1)}>+</button>
                </div>
              </article>
              <article>
                {renderTeamBadge(awayTeam, "away")}
                <span>Visitante</span>
                <strong>{awayTeam?.name || "Visitante"}</strong>
                <div className="admin-score-stepper">
                  <button type="button" onClick={() => changeScore("away", -1)}>−</button>
                  <input value={awayGoals} onChange={(event) => setAwayGoals(event.target.value)} type="number" min="0" aria-label="Goles visitante" />
                  <button type="button" onClick={() => changeScore("away", 1)}>+</button>
                </div>
              </article>
            </div>
            {sheetMode === "played" && (
              <details className="sheet-advanced-panel admin-sheet-advanced">
                <summary>
                  <strong>Opciones de liguilla</strong>
                  <span>Solo cuando el reglamento lo indique</span>
                </summary>
                <div className="sheet-advanced-grid">
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
          </section>
        )}

        {sheetStep === "events" && (
          <section className="admin-sheet-screen">
            <div className="admin-sheet-screen-head">
              <div>
                <span>Eventos del partido</span>
                <strong>Registro rapido</strong>
              </div>
              <small>{eventTotalCount} evento(s)</small>
            </div>
            <div className="event-toolbar admin-sheet-toolbar">
              <button type="button" onClick={completeGoalEventsFromScore} disabled={isDefaultSheet || !hasMissingGoalEvents}>Agregar goles pendientes</button>
            </div>
            <div className="event-quick-panel admin-sheet-action-grid" aria-label="Agregar eventos rapidos">
              {ADMIN_SHEET_EVENT_ACTIONS.map((action) => (
                <button
                  className={action.className}
                  key={action.type}
                  type="button"
                  onClick={() => openEventModal(action.type, selectedMatch.homeTeamId)}
                  disabled={!["injury_note", "other_note"].includes(action.type) && !getPlayersForTeam(selectedMatch.homeTeamId).length && !getPlayersForTeam(selectedMatch.awayTeamId).length}
                >
                  <span aria-hidden="true">{action.icon}</span>
                  <strong>{action.label}</strong>
                </button>
              ))}
            </div>
            <div className="event-list admin-sheet-event-list">
              <div className="admin-sheet-timeline-head">
                <strong>Eventos registrados</strong>
                <span>{eventTotalCount} evento(s)</span>
              </div>
              {events.length ? events.map((eventItem, index) => renderEventRow(eventItem, index, eventItem.id === latestEvent?.id)) : (
                <p className="empty">Agrega goles, tarjetas o incidencias desde las acciones rapidas.</p>
              )}
            </div>
          </section>
        )}

        {sheetStep === "notes" && (
          <section className="admin-sheet-screen">
            <div className="admin-sheet-screen-head">
              <div>
                <span>Observaciones</span>
                <strong>Notas y tipo de acta</strong>
              </div>
              <small>{observationsReady ? "Con observaciones" : "Sin observaciones"}</small>
            </div>
            <label className="sheet-observations">
              Observaciones del acta
              <textarea
                value={observations}
                onChange={(event) => setObservations(event.target.value)}
                placeholder="Registra hechos relevantes, incidencias, acuerdos arbitrales o notas internas del partido."
              />
            </label>
            <div className="admin-sheet-observation-chips" aria-label="Sugerencias rapidas">
              {ADMIN_SHEET_OBSERVATION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    if (chip === "Sin novedades") setObservations("Juego sin incidentes mayores.");
                    else appendObservationLine(chip);
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
            <div className="sheet-default-controls admin-sheet-type-controls" aria-label="Tipo de resultado del acta">
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
          </section>
        )}

        {sheetStep === "finish" && (
          <section className="admin-sheet-screen">
            <div className="admin-sheet-screen-head">
              <div>
                <span>Finalizar y publicar</span>
                <strong>Resumen del acta</strong>
              </div>
              <small>{isEditingSavedSheet ? "Reemplazara captura" : "Lista para guardar"}</small>
            </div>
            <div className="admin-sheet-final-card">
              <div className="admin-sheet-final-score">
                {renderTeamBadge(homeTeam, "home")}
                <strong>{expectedHomeGoals} - {expectedAwayGoals}</strong>
                {renderTeamBadge(awayTeam, "away")}
              </div>
              <div className="admin-sheet-summary-grid">
                <span>Goles <strong>{goalEvents.length}</strong></span>
                <span>Amarillas <strong>{yellowCardCount}</strong></span>
                <span>Rojas <strong>{redCardCount}</strong></span>
                <span>Autogoles <strong>{ownGoalCount}</strong></span>
                <span>Lesiones <strong>{injuryNoteCount}</strong></span>
                <span>Observaciones <strong>{observationsReady ? "Si" : "No"}</strong></span>
              </div>
              <div className="admin-sheet-final-note">
                <strong>{sheetMode === "played" ? "Partido jugado" : `Default administrativo ${defaultScore}-0`}</strong>
                <span>{observationsReady ? observations : "Sin observaciones capturadas."}</span>
              </div>
              <div className="admin-sheet-final-events">
                <div>
                  <strong>Eventos registrados</strong>
                  <span>{cleanEvents.length} evento(s) en el acta</span>
                </div>
                {cleanEvents.length ? cleanEvents.map((eventItem, index) => renderFinalEventItem(eventItem, index)) : (
                  <p className="empty">Sin eventos registrados.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {validationMessage && <p className="sheet-alert">{validationMessage}</p>}
        {sheetNotice && <p className="auth-ok">{sheetNotice}</p>}

        {sheetStep !== "select" && (
        <div className="admin-sheet-actions">
          <button type="button" onClick={() => moveSheetStep(-1)} disabled={activeStepIndex === 0}>Anterior</button>
          {sheetStep === "finish" ? (
            <button className="primary admin-sheet-publish-button" type="submit">PUBLICAR ACTA</button>
          ) : (
            <button className="primary" type="button" onClick={() => moveSheetStep(1)}>Continuar</button>
          )}
        </div>
        )}
        {renderEventModal()}
      </div>
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
            <DisciplineAdminTrace league={league} row={row} />
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

function getAdminDisciplineMatchLabel(league, match) {
  if (!match) return "";
  const home = getTeam(league, match.homeTeamId)?.name || "Local";
  const away = getTeam(league, match.awayTeamId)?.name || "Visitante";
  const round = match.round ? `J${match.round}` : "Jornada";
  return `${round} | ${home} vs ${away}`;
}

function getDisciplineTraceMeta(source) {
  if (source.minuteLabel) return `${source.minuteLabel}'`;
  if (source.minute !== undefined && source.minute !== null && source.minute !== "") return `${source.minute}'`;
  return "";
}

function DisciplineAdminTrace({ league, row }) {
  const sources = row.sources || [];
  if (!sources.length) return null;
  const visibleSources = sources.slice(-4);
  const hiddenCount = Math.max(sources.length - visibleSources.length, 0);
  return (
    <div className="discipline-admin-trace">
      <small>Trazabilidad</small>
      <div>
        {visibleSources.map((source, index) => {
          const match = source.matchId ? league.matches.find((item) => item.id === source.matchId) : null;
          const sourceKey = source.matchId || source.adjustmentId || `${source.date}-${index}`;
          const traceMeta = getDisciplineTraceMeta(source);
          return (
            <span className={source.type === "Ajuste" ? "adjustment" : "sheet"} key={sourceKey}>
              <b>{source.type}</b>
              {match ? (
                <>
                  <em>{getAdminDisciplineMatchLabel(league, match)}</em>
                  {match.date && <i>{formatDate(match.date)}</i>}
                  {traceMeta && <i>{traceMeta}</i>}
                </>
              ) : (
                <>
                  <em>{source.reason || "Movimiento manual"}</em>
                  {source.date && <i>{formatDate(source.date)}</i>}
                  {source.value !== undefined && <i>{Number(source.value || 0) > 0 ? "+" : ""}{source.value}</i>}
                </>
              )}
            </span>
          );
        })}
        {hiddenCount > 0 && <span className="more"><b>+{hiddenCount}</b><em>movimiento(s) anterior(es)</em></span>}
      </div>
    </div>
  );
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

function getMatchEventIcon(type) {
  if (type === "goal") return "⚽";
  if (type === "own_goal") return "↩";
  if (type === "yellow") return "🟨";
  if (type === "red") return "🟥";
  return "•";
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

function getPendingDisciplinaryReviews(league) {
  return (league.matches || []).flatMap((match) => (
    (match.events || [])
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === "red" && (event.disciplinaryPending || event.suspensionIndefinite))
      .map(({ event, index }) => {
        const player = getPlayer(league, event.playerId);
        const team = player ? getTeam(league, player.teamId) : null;
        const hasResolution = (league.sanctions || []).some((sanction) => (
          sanction.playerId === event.playerId &&
          normalizeAdminSearchTerm(sanction.notes || "").includes(normalizeAdminSearchTerm(match.id))
        ));
        return {
          id: `${match.id}-${event.playerId}-${index}`,
          match,
          event,
          eventIndex: index,
          player,
          team,
          resolved: hasResolution
        };
      })
  )).filter((item) => item.player && !item.resolved);
}

function SanctionsPanel({ league, onAddPlayerSanction, onDeletePlayerSanction, onResolveMatchDiscipline }) {
  const activeLeague = scopeLeagueToCompetition(league, getDefaultCompetitionId(league));
  const sanctions = activeLeague.sanctions || [];
  const activeSanctions = sanctions.filter((sanction) => sanction.status !== "cleared" && sanction.status !== "revoked");
  const clearedSanctions = sanctions.filter((sanction) => sanction.status === "cleared");
  const pendingReviews = getPendingDisciplinaryReviews(activeLeague);
  const [sanctionNotice, setSanctionNotice] = useState("");
  const [sanctionIndefinite, setSanctionIndefinite] = useState(false);
  const [pendingResolutionType, setPendingResolutionType] = useState({});
  const [sanctionQuery, setSanctionQuery] = useState("");
  const [sanctionStatusFilter, setSanctionStatusFilter] = useState("active");
  const visibleActiveSanctions = useMemo(() => {
    const query = normalizeAdminSearchTerm(sanctionQuery);
    return activeSanctions.filter((sanction) => {
      const player = getPlayer(activeLeague, sanction.playerId);
      const team = player ? getTeam(activeLeague, player.teamId) : null;
      if (!query) return true;
      return normalizeAdminSearchTerm(`${player?.name || ""} ${player?.number || ""} ${team?.name || ""} ${sanction.type || ""} ${sanction.reason || ""}`).includes(query);
    });
  }, [activeLeague, activeSanctions, sanctionQuery]);
  const visibleClearedSanctions = useMemo(() => {
    const query = normalizeAdminSearchTerm(sanctionQuery);
    return clearedSanctions.filter((sanction) => {
      const player = getPlayer(activeLeague, sanction.playerId);
      const team = player ? getTeam(activeLeague, player.teamId) : null;
      if (!query) return true;
      return normalizeAdminSearchTerm(`${player?.name || ""} ${player?.number || ""} ${team?.name || ""} ${sanction.type || ""} ${sanction.reason || ""}`).includes(query);
    });
  }, [activeLeague, clearedSanctions, sanctionQuery]);

  function submitSanction(event) {
    event.preventDefault();
    if (!window.confirm("¿Confirmas agregar esta sancion extraordinaria?")) return;
    onAddPlayerSanction(getFormPayload(event.currentTarget));
    setSanctionNotice("Sancion agregada correctamente.");
    event.currentTarget.reset();
    setSanctionIndefinite(false);
  }

  async function submitPendingSanction(event, item) {
    event.preventDefault();
    const form = event.currentTarget;
    const resolutionType = pendingResolutionType[item.id] || "matches";
    if (!onResolveMatchDiscipline) {
      setSanctionNotice("No hay accion configurada para resolver expulsiones desde el acta.");
      return;
    }
    if (!window.confirm(`¿Confirmas dictamen disciplinario para ${item.player?.name || "este jugador"}?`)) return;
    const resolved = await onResolveMatchDiscipline({
      competitionId: item.match.competitionId || getDefaultCompetitionId(league),
      matchId: item.match.id,
      eventIndex: item.eventIndex,
      playerId: item.player.id,
      resolutionType,
      type: "Expulsion",
      date: item.match.date || new Date().toISOString().slice(0, 10),
      matches: resolutionType === "matches" ? form.elements.matches.value : 0,
      reason: item.event.reason || "Tarjeta roja",
      notes: form.elements.notes.value || ""
    });
    if (!resolved) return;
    setSanctionNotice(resolutionType === "release"
      ? "Jugador liberado por comision disciplinaria."
      : "Dictamen disciplinario agregado correctamente.");
  }

  return (
    <section className="panel admin-data-panel commission-panel">
      <SectionHeading eyebrow="Comision disciplinaria" title="Sanciones extraordinarias" />
      {sanctionNotice && <p className="auth-ok">{sanctionNotice}</p>}
      <form className="sanction-form" onSubmit={submitSanction}>
        <label>Torneo
          <CompetitionSelect league={league} name="competitionId" defaultValue={getDefaultCompetitionId(league)} />
        </label>
        <SearchablePlayerSelect league={activeLeague} name="playerId" players={activeLeague.players} placeholder="Buscar jugador sancionado..." />
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
        <label className="event-toggle-field sanction-indefinite-toggle">
          <input
            checked={sanctionIndefinite}
            name="indefinite"
            onChange={(event) => setSanctionIndefinite(event.target.checked)}
            type="checkbox"
          />
          Inhabilitado indefinido
        </label>
        <label>Partidos
          <input
            name="matches"
            type="number"
            min="0"
            max="99"
            defaultValue="1"
            required={!sanctionIndefinite}
            disabled={sanctionIndefinite}
            placeholder={sanctionIndefinite ? "Indefinido" : "Partidos"}
          />
        </label>
        <label>Motivo
          <input name="reason" required placeholder="Ej. Golpe a rival, insulto al arbitro" />
        </label>
        <label className="wide-field">Notas
          <textarea name="notes" placeholder="Resolucion, evidencia, acuerdo de comision o folio." />
        </label>
        <button className="primary" type="submit" disabled={!activeLeague.players.length}>Agregar sancion</button>
      </form>

      <div className="admin-filter-console">
        <label>Buscar sancion
          <input type="search" value={sanctionQuery} onChange={(event) => setSanctionQuery(event.target.value)} placeholder="Jugador, equipo, motivo" />
        </label>
        <label>Vista
          <select value={sanctionStatusFilter} onChange={(event) => setSanctionStatusFilter(event.target.value)}>
            <option value="active">Activas</option>
            <option value="pending">Rojas por dictaminar</option>
            <option value="cleared">Liberados</option>
          </select>
        </label>
      </div>

      {sanctionStatusFilter === "pending" && <div className="sanction-list">
        <h3>Rojas pendientes de comision</h3>
        {pendingReviews.map((item) => {
          const resolutionType = pendingResolutionType[item.id] || "matches";
          return (
            <article className="sanction-card pending-review" key={item.id}>
              <div>
                <strong>{item.player?.name || "Jugador"}</strong>
                <span>{item.team?.name || "Sin equipo"} | Jornada {item.match.round || "-"} | {formatDate(item.match.date)}</span>
              </div>
              <div>
                <small>Motivo arbitral</small>
                <span>{item.event.reason || "Tarjeta roja"}</span>
              </div>
              <form className="pending-sanction-form" onSubmit={(event) => submitPendingSanction(event, item)}>
                <label>Dictamen
                  <select
                    value={resolutionType}
                    onChange={(event) => setPendingResolutionType((current) => ({ ...current, [item.id]: event.target.value }))}
                  >
                    <option value="matches">Sancionar por partidos</option>
                    <option value="indefinite">Mantener indefinido</option>
                    <option value="release">Liberar jugador</option>
                  </select>
                </label>
                <label>Partidos
                  <input disabled={resolutionType !== "matches"} min="1" max="99" name="matches" required={resolutionType === "matches"} type="number" defaultValue="1" />
                </label>
                <label className="wide-field">Notas de comision
                  <input name="notes" placeholder="Ej. Se reduce a 2 partidos despues de revision" />
                </label>
                <button className="primary" type="submit">
                  {resolutionType === "release" ? "Liberar" : "Guardar dictamen"}
                </button>
              </form>
            </article>
          );
        })}
        {!pendingReviews.length && <p className="empty">No hay expulsiones pendientes o indefinidas por dictaminar.</p>}
      </div>}

      {sanctionStatusFilter === "active" && <div className="sanction-list">
        <h3>Sanciones activas</h3>
        {visibleActiveSanctions.map((sanction) => {
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
                <span>{sanction.indefinite ? "Indefinido" : `${sanction.matches} partido(s)`}</span>
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
        {!activeSanctions.length && <p className="empty">Aun no hay sanciones extraordinarias activas.</p>}
        {activeSanctions.length > 0 && !visibleActiveSanctions.length && <p className="empty">No hay sanciones con esos filtros.</p>}
      </div>}

      {sanctionStatusFilter === "cleared" && !!clearedSanctions.length && (
        <div className="sanction-list">
          <h3>Liberados por comision</h3>
          {visibleClearedSanctions.map((sanction) => {
            const player = getPlayer(activeLeague, sanction.playerId);
            const team = player ? getTeam(activeLeague, player.teamId) : null;
            const competition = getCompetition(league, sanction.competitionId);
            return (
              <article className="sanction-card" key={sanction.id}>
                <div>
                  <strong>{player?.name || "Jugador eliminado"}</strong>
                  <span>{team?.name || "Sin equipo"} | {competition?.name || "Torneo"} | Resolucion sin castigo</span>
                </div>
                <div>
                  <small>Motivo</small>
                  <span>{sanction.reason}</span>
                </div>
                <time dateTime={sanction.date}>{sanction.date ? formatDate(sanction.date) : "Sin fecha"}</time>
              </article>
            );
          })}
          {clearedSanctions.length > 0 && !visibleClearedSanctions.length && <p className="empty">No hay liberados con esos filtros.</p>}
        </div>
      )}
      {sanctionStatusFilter === "cleared" && !clearedSanctions.length && <p className="empty">Aun no hay jugadores liberados por comision.</p>}
    </section>
  );
}

function InjuriesPanel({ league, onAddPlayerInjury, onDeletePlayerInjury, onUpdatePlayerInjury }) {
  const activeLeague = scopeLeagueToCompetition(league, getDefaultCompetitionId(league));
  const [injuryNotice, setInjuryNotice] = useState("");
  const [injuryQuery, setInjuryQuery] = useState("");
  const [injuryStatusFilter, setInjuryStatusFilter] = useState("active");
  const injuries = [...(activeLeague.injuries || [])].sort((a, b) => (
    (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
    String(b.date || "").localeCompare(String(a.date || ""))
  ));
  const visibleInjuries = useMemo(() => {
    const query = normalizeAdminSearchTerm(injuryQuery);
    return injuries.filter((injury) => {
      const player = getPlayer(activeLeague, injury.playerId);
      const team = player ? getTeam(activeLeague, player.teamId) : null;
      if (injuryStatusFilter !== "all" && (injury.status || "active") !== injuryStatusFilter) return false;
      if (!query) return true;
      return normalizeAdminSearchTerm(`${player?.name || ""} ${player?.number || ""} ${team?.name || ""} ${injury.type || ""} ${injury.supportDetail || ""} ${injury.notes || ""}`).includes(query);
    });
  }, [activeLeague, injuries, injuryQuery, injuryStatusFilter]);

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
    <section className="panel admin-data-panel commission-panel">
      <SectionHeading eyebrow="Salud y apoyo" title="Lesiones de jugadores" />
      <p className="helper-text">Registra lesiones activas para informar al publico y solicitar apoyo cuando la liga lo autorice. Los recuperados quedan como historial interno.</p>
      {injuryNotice && <p className="auth-ok">{injuryNotice}</p>}
      <form className="injury-form" onSubmit={submitNewInjury}>
        <label>Torneo
          <CompetitionSelect league={league} name="competitionId" defaultValue={getDefaultCompetitionId(league)} />
        </label>
        <SearchablePlayerSelect league={activeLeague} name="playerId" players={activeLeague.players} placeholder="Buscar jugador lesionado..." />
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

      <div className="admin-filter-console">
        <label>Buscar lesion
          <input type="search" value={injuryQuery} onChange={(event) => setInjuryQuery(event.target.value)} placeholder="Jugador, equipo, lesion o apoyo" />
        </label>
        <label>Estado
          <select value={injuryStatusFilter} onChange={(event) => setInjuryStatusFilter(event.target.value)}>
            <option value="active">Activas</option>
            <option value="recovered">Recuperados</option>
            <option value="all">Todas</option>
          </select>
        </label>
      </div>

      <div className="injury-list">
        {visibleInjuries.map((injury) => {
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
        {injuries.length > 0 && !visibleInjuries.length && <p className="empty">No hay lesiones con esos filtros.</p>}
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
  onOpenLeagueAdmin,
  onResetDemo,
  onToggleLeague,
  onUpdateLeagueMembership,
  onUpdateSponsor,
  store,
  userListRefreshKey
}) {
  const [membershipNotice, setMembershipNotice] = useState("");
  const [activeModule, setActiveModule] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createLeagueOpen, setCreateLeagueOpen] = useState(false);
  const [leagueQuery, setLeagueQuery] = useState("");
  const [leagueStatusFilter, setLeagueStatusFilter] = useState("all");
  const leagues = store?.leagues || [];
  const stats = useMemo(() => getSuperAdminStats(leagues), [leagues]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const activeModuleInfo = SUPER_ADMIN_MODULES.find((module) => module.id === activeModule) || SUPER_ADMIN_MODULES[0];

  function switchModule(moduleId) {
    setActiveModule(moduleId);
    setDrawerOpen(false);
  }

  function submitLeagueCreate(event) {
    event.preventDefault();
    if (!window.confirm("¿Confirmas crear esta liga?")) return;
    onAddLeague(getFormPayload(event.currentTarget));
    setMembershipNotice("Liga creada correctamente.");
    event.currentTarget.reset();
    setCreateLeagueOpen(false);
  }

  const moduleContent = {
    dashboard: (
      <SuperAdminDashboard
        leagues={leagues}
        stats={stats}
        onOpenCreateLeague={() => setCreateLeagueOpen(true)}
        onOpenLeagues={() => setActiveModule("leagues")}
        onOpenModule={switchModule}
        onOpenUsers={() => setActiveModule("users")}
      />
    ),
    platform: <SuperAdminPlatformPanel stats={stats} />,
    leagues: (
      <SuperAdminLeagueList
        leagueQuery={leagueQuery}
        leagueStatusFilter={leagueStatusFilter}
        leagues={leagues}
        membershipNotice={membershipNotice}
        onCreateLeague={() => setCreateLeagueOpen(true)}
        onDeleteLeague={onDeleteLeague}
        onSetLeagueQuery={setLeagueQuery}
        onSetLeagueStatusFilter={setLeagueStatusFilter}
        onSetNotice={setMembershipNotice}
        onToggleLeague={onToggleLeague}
        onUpdateLeagueMembership={onUpdateLeagueMembership}
        origin={origin}
      />
    ),
    users: <UserManagement authToken={authToken} currentUser={currentUser} leagues={leagues} refreshKey={userListRefreshKey} />,
    tournaments: <SuperAdminTournamentsPanel leagues={leagues} />,
    advertising: (
      <SponsorManagement
        authToken={authToken}
        leagues={leagues}
        onAddSponsor={onAddSponsor}
        onDeleteSponsor={onDeleteSponsor}
        onUpdateSponsor={onUpdateSponsor}
      />
    ),
    audit: <AuditPanel authToken={authToken} leagues={leagues} />,
    backups: <SuperAdminBackupsPanel authToken={authToken} stats={stats} />,
    settings: (
      <SuperAdminSettingsPanel
        onResetDemo={() => {
          if (!window.confirm("¿Restaurar los datos demo? Esta accion reemplaza la informacion de demostracion.")) return;
          onResetDemo();
          setMembershipNotice("Demo restaurada correctamente.");
        }}
      />
    )
  };

  return (
    <div className="super-admin-v2">
      {drawerOpen && (
        <button className="super-admin-drawer-backdrop" type="button" aria-label="Cerrar menu" onClick={() => setDrawerOpen(false)} />
      )}
      <aside className={`super-admin-sidebar ${drawerOpen ? "open" : ""}`}>
        <SuperAdminNav
          activeModule={activeModule}
          currentUser={currentUser}
          onSelect={switchModule}
        />
      </aside>

      <main className="super-admin-main">
        <header className="super-admin-topbar">
          <img className="super-admin-alp-watermark" alt="" src={alpLogo} aria-hidden="true" />
          <button className="super-admin-menu-button" type="button" aria-label="Abrir menu" onClick={() => setDrawerOpen(true)}>☰</button>
          <div className="super-admin-mobile-brand">
            <span>Centro de operaciones</span>
          </div>
          <div className="super-admin-title-block">
            <span>{currentUser?.name ? `Buenos dias, ${currentUser.name.split(" ")[0]}` : "Panel Super Admin"}</span>
            <h1>{activeModuleInfo.label}</h1>
            <small>Control general de LIGATEC</small>
          </div>
          <button className="super-admin-league-admin-button" type="button" onClick={onOpenLeagueAdmin}>
            <AdminIcon type="leagues" />
            Admin de liga
          </button>
          <div className="super-admin-platform-pill">
            <span />
            Plataforma estable
          </div>
          <span className="super-admin-avatar" aria-label="Usuario actual">{getInitials(currentUser?.name || currentUser?.email || "SA")}</span>
        </header>

        {moduleContent[activeModule] || moduleContent.dashboard}
      </main>

      <nav className="super-admin-bottom-nav" aria-label="Navegacion rapida super admin">
        {SUPER_ADMIN_BOTTOM_MODULES.map((moduleId) => {
          const module = SUPER_ADMIN_MODULES.find((item) => item.id === moduleId);
          if (!module) return null;
          return (
            <button
              className={activeModule === module.id ? "active" : ""}
              key={module.id}
              type="button"
              onClick={() => switchModule(module.id)}
            >
              <span><AdminIcon type={module.icon} /></span>
              {module.label}
            </button>
          );
        })}
      </nav>

      {createLeagueOpen && (
        <SuperAdminCreateLeagueSheet
          onClose={() => setCreateLeagueOpen(false)}
          onSubmit={submitLeagueCreate}
        />
      )}
    </div>
  );
}

const SUPER_ADMIN_MODULES = [
  { id: "dashboard", label: "Inicio", short: "Inicio", icon: "home" },
  { id: "platform", label: "Sistema", short: "Sistema", icon: "platform" },
  { id: "leagues", label: "Ligas", short: "Ligas", icon: "leagues" },
  { id: "users", label: "Usuarios", short: "Usuarios", icon: "users" },
  { id: "tournaments", label: "Torneos", short: "Torneos", icon: "tournaments" },
  { id: "advertising", label: "Publicidad", short: "Ads", icon: "advertising" },
  { id: "audit", label: "Auditoria", short: "Audit", icon: "audit" },
  { id: "backups", label: "Respaldos", short: "Backups", icon: "backups" },
  { id: "settings", label: "Config.", short: "Config.", icon: "settings" }
];

const SUPER_ADMIN_BOTTOM_MODULES = ["dashboard", "leagues", "users", "advertising", "audit", "settings"];

function SuperAdminNav({ activeModule, currentUser, onSelect }) {
  return (
    <div className="super-admin-nav-shell">
      <div className="super-admin-brand">
        <div>
          <strong>Centro de operaciones</strong>
          <span>Super Admin</span>
        </div>
      </div>
      <div className="super-admin-profile">
        <span>{getInitials(currentUser?.name || currentUser?.email || "SA")}</span>
        <div>
          <strong>{currentUser?.name || "Super admin"}</strong>
          <small>{currentUser?.email || "Control plataforma"}</small>
        </div>
      </div>
      <nav className="super-admin-nav" aria-label="Modulos super admin">
        {SUPER_ADMIN_MODULES.map((module) => (
          <button
            className={activeModule === module.id ? "active" : ""}
            key={module.id}
            type="button"
            onClick={() => onSelect(module.id)}
          >
            <span><AdminIcon type={module.icon} /></span>
            {module.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function getInitials(value) {
  return String(value || "")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SA";
}

function getSuperAdminStats(leagues) {
  const visibleLeagues = leagues.filter((league) => league.status !== "deleted");
  const today = new Date().toISOString().slice(0, 10);
  const municipalities = new Set(visibleLeagues.map((league) => league.city).filter(Boolean));
  let teams = 0;
  let players = 0;
  let tournaments = 0;
  let activeTournaments = 0;
  let referees = 0;
  let delegates = 0;
  let matchesToday = 0;
  let scheduledToday = 0;
  let finalizedToday = 0;
  let activeSponsors = 0;

  visibleLeagues.forEach((league) => {
    teams += (league.teams || []).length;
    players += (league.players || []).length;
    tournaments += (league.competitions || []).length;
    activeTournaments += (league.competitions || []).filter((competition) => competition.status !== "archived").length;
    referees += (league.referees || []).length;
    delegates += (league.teamDelegates || league.delegates || []).length;
    activeSponsors += (league.sponsors || []).filter((sponsor) => sponsor.status !== "inactive").length;
    (league.matches || []).forEach((match) => {
      const matchDate = String(match.date || match.scheduledDate || match.matchDate || "").slice(0, 10);
      if (matchDate !== today) return;
      matchesToday += 1;
      if (match.status === "finalizado" || match.status === "finalized") finalizedToday += 1;
      else scheduledToday += 1;
    });
  });

  return {
    activeLeagues: visibleLeagues.filter((league) => league.status === "active").length,
    suspendedLeagues: visibleLeagues.filter((league) => league.status === "suspended").length,
    municipalities: municipalities.size,
    totalLeagues: visibleLeagues.length,
    teams,
    players,
    tournaments,
    activeTournaments,
    referees,
    delegates,
    matchesToday,
    scheduledToday,
    finalizedToday,
    activeSponsors
  };
}

function getLeagueSummary(league) {
  const activeTournaments = (league.competitions || []).filter((competition) => competition.status !== "archived").length;
  return {
    teams: (league.teams || []).length,
    players: (league.players || []).length,
    tournaments: activeTournaments || (league.competitions || []).length,
    matches: (league.matches || []).length,
    adminName: league.adminName || league.ownerName || league.ownerEmail || "Sin admin asignado"
  };
}

function SuperAdminDashboard({ leagues, stats, onOpenCreateLeague, onOpenLeagues, onOpenModule, onOpenUsers }) {
  const latestLeagues = leagues.filter((league) => league.status !== "deleted").slice(0, 4);
  const actionCards = [
    { label: "Crear liga", text: "Alta guiada con admin, municipio y estado inicial.", icon: "leagues", action: onOpenCreateLeague },
    { label: "Gestionar ligas", text: "Crear, ocultar, suspender o revisar ligas y municipios.", icon: "leagues", action: onOpenLeagues },
    { label: "Usuarios admin", text: "Crear super admin, admin de liga y admin limitado.", icon: "users", action: onOpenUsers },
    { label: "Publicidad", text: "Banners por liga para la vista publica.", icon: "advertising", action: () => onOpenModule("advertising") },
    { label: "Auditoria", text: "Accesos, cambios criticos y actividad administrativa.", icon: "audit", action: () => onOpenModule("audit") },
    { label: "Respaldos", text: "Crear, verificar y descargar respaldos operativos.", icon: "backups", action: () => onOpenModule("backups") },
    { label: "Torneos globales", text: "Resumen de torneos publicados e historicos.", icon: "tournaments", action: () => onOpenModule("tournaments") },
    { label: "Estado sistema", text: "Vista general de plataforma y servicios.", icon: "platform", action: () => onOpenModule("platform") }
  ];

  return (
    <section className="super-dashboard">
      <div className="super-status-card">
        <div>
          <span>Estado de la plataforma</span>
          <strong>Todo funcionando</strong>
          <small>{stats.totalLeagues} ligas bajo monitoreo activo</small>
        </div>
        <b aria-hidden="true">✓</b>
      </div>

      <div className="super-section-label">Resumen general</div>
      <div className="super-metric-grid">
        <SuperMetricCard label="Ligas activas" value={stats.activeLeagues} />
        <SuperMetricCard label="Municipios" value={stats.municipalities} />
        <SuperMetricCard label="Usuarios" value={stats.delegates + stats.referees} />
        <SuperMetricCard label="Equipos" value={stats.teams} />
        <SuperMetricCard label="Jugadores" value={stats.players} />
        <SuperMetricCard label="Arbitros" value={stats.referees} />
        <SuperMetricCard label="Delegados" value={stats.delegates} />
        <SuperMetricCard label="Torneos activos" value={stats.activeTournaments} />
      </div>

      <div className="super-today-strip">
        <article>
          <small>Partidos hoy</small>
          <strong>{stats.matchesToday}</strong>
          <span>{stats.scheduledToday} programados</span>
        </article>
        <article className="warning">
          <small>Actas pendientes</small>
          <strong>{Math.max(stats.scheduledToday - stats.finalizedToday, 0)}</strong>
          <span>{stats.finalizedToday} finalizados</span>
        </article>
      </div>

      <div className="super-dashboard-grid">
        <article className="super-panel-card">
          <div className="super-card-head">
            <div>
              <span>Gestion</span>
              <h3>Ligas recientes</h3>
            </div>
            <button type="button" onClick={onOpenLeagues}>Ver ligas</button>
          </div>
          <div className="super-mini-list">
            {latestLeagues.map((league) => {
              const summary = getLeagueSummary(league);
              return (
                <button key={league.id} type="button" onClick={onOpenLeagues}>
                  <span className={`super-status-dot ${league.status}`} />
                  <strong>{league.name}</strong>
                  <small>{league.city || "Sin municipio"} | {summary.teams} equipos</small>
                </button>
              );
            })}
            {!latestLeagues.length && <p className="empty">Aun no hay ligas registradas.</p>}
          </div>
        </article>

        <article className="super-panel-card">
          <div className="super-card-head">
            <div>
              <span>Acciones rápidas</span>
              <h3>Operación</h3>
            </div>
            <button type="button" onClick={onOpenUsers}>Administrar</button>
          </div>
          <div className="super-action-grid" aria-label="Acciones principales">
            {actionCards.map((card) => (
              <button key={card.label} type="button" onClick={card.action}>
                <span><AdminIcon type={card.icon} />{card.label}</span>
                <strong>{card.text}</strong>
                <em>Entrar</em>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function SuperMetricCard({ label, value, detail }) {
  return (
    <article className="super-metric-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </article>
  );
}

function SuperAdminPlatformPanel({ stats }) {
  const services = [
    { name: "API", detail: "Rutas protegidas por token" },
    { name: "Base de datos", detail: "Persistencia centralizada" },
    { name: "Almacenamiento", detail: "Imagenes y recursos publicos" },
    { name: "Usuarios", detail: "Roles y permisos por modulo" }
  ];

  return (
    <section className="panel super-module-panel">
      <SectionHeading eyebrow="Plataforma" title="Estado general del sistema" />
      <p className="helper-text">Vista operativa sin exponer llaves, tokens, rutas internas ni secretos. En una siguiente fase podemos conectar health checks reales si el backend los ofrece.</p>
      <div className="super-service-list">
        {services.map((service) => (
          <article key={service.name}>
            <div>
              <strong>{service.name}</strong>
              <span>{service.detail}</span>
            </div>
            <b>Operativo</b>
          </article>
        ))}
      </div>
      <div className="super-metric-grid compact">
        <SuperMetricCard label="Ligas totales" value={stats.totalLeagues} />
        <SuperMetricCard label="Suspendidas" value={stats.suspendedLeagues} />
        <SuperMetricCard label="Torneos" value={stats.tournaments} />
        <SuperMetricCard label="Delegados" value={stats.delegates} />
      </div>
    </section>
  );
}

function SuperAdminLeagueList({
  leagueQuery,
  leagueStatusFilter,
  leagues,
  membershipNotice,
  onCreateLeague,
  onDeleteLeague,
  onSetLeagueQuery,
  onSetLeagueStatusFilter,
  onSetNotice,
  onToggleLeague,
  onUpdateLeagueMembership,
  origin
}) {
  const normalizedQuery = leagueQuery.trim().toLowerCase();
  const filteredLeagues = leagues.filter((league) => {
    if (league.status === "deleted") return false;
    if (leagueStatusFilter !== "all" && league.status !== leagueStatusFilter) return false;
    if (!normalizedQuery) return true;
    return `${league.name} ${league.city} ${league.ownerEmail || ""}`.toLowerCase().includes(normalizedQuery);
  });
  const getVisibilityClass = (visibility) => {
    if (visibility === "private") return "private";
    if (visibility === "hidden") return "hidden";
    return "active";
  };
  const getVisibilityLabel = (visibility) => {
    if (visibility === "private") return "Privada";
    if (visibility === "hidden") return "Oculta";
    return "Publica";
  };

  return (
    <section className="panel super-module-panel">
      <div className="panel-title-row">
        <SectionHeading eyebrow="Ligas" title="Gestiona todas las ligas" />
        <button className="primary" type="button" onClick={onCreateLeague}>+ Nueva liga</button>
      </div>
      <p className="helper-text">Controla estado, URL publica, admin asignado y notas internas. Las acciones destructivas mantienen confirmacion reforzada.</p>
      {membershipNotice && <p className="auth-ok">{membershipNotice}</p>}
      <div className="super-list-toolbar">
        <label>
          Buscar liga
          <input value={leagueQuery} onChange={(event) => onSetLeagueQuery(event.target.value)} placeholder="Nombre, municipio o admin" />
        </label>
        <label>
          Estado
          <select value={leagueStatusFilter} onChange={(event) => onSetLeagueStatusFilter(event.target.value)}>
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="suspended">Suspendidas</option>
          </select>
        </label>
      </div>

      <div className="membership-list super-league-list">
        {filteredLeagues.map((league) => {
          const summary = getLeagueSummary(league);
          return (
            <details className={`super-league-card-shell ${league.status}`} key={league.id}>
              <summary>
                <span className="super-league-mark">{getInitials(league.name)}</span>
                <span className="super-league-summary-copy">
                  <b>{league.name}</b>
                  <small>{league.city || "Sin municipio"} | Admin: {summary.adminName}</small>
                </span>
                <span className="super-league-summary-stats">
                  <em><strong>{summary.teams}</strong> Equipos</em>
                  <em><strong>{summary.players}</strong> Jugadores</em>
                  <em><strong>{summary.tournaments}</strong> Torneos</em>
                </span>
                <span className={`status ${league.status}`}>{league.status === "active" ? "Activa" : "Suspendida"}</span>
                <span className={`status ${getVisibilityClass(league.publicVisibility || "visible")}`}>
                  {getVisibilityLabel(league.publicVisibility || "visible")}
                </span>
                <span className="super-detail-chevron">Editar</span>
              </summary>
              <form
                className="membership-card super-league-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  const payload = getFormPayload(event.currentTarget);
                  if (payload.status !== league.status) {
                    const action = payload.status === "suspended" ? "suspender" : "reactivar";
                    const confirmed = window.confirm(`¿Seguro que quieres ${action} ${league.name}?`);
                    if (!confirmed) return;
                  }
                  onUpdateLeagueMembership(league.id, payload);
                  onSetNotice(`Datos de ${league.name} guardados correctamente.`);
                }}
              >
                <div className="membership-title super-league-title">
                  <span>Configuracion operativa</span>
                  <strong>{league.name}</strong>
                  <span>Los cambios se aplican al acceso publico y administrativo de esta liga.</span>
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
                <label>Visibilidad publica
                  <select name="publicVisibility" defaultValue={league.publicVisibility || "visible"}>
                    <option value="visible">Visible en directorio publico</option>
                    <option value="hidden">Oculta en directorio publico</option>
                    <option value="private">Modo privado / pruebas</option>
                  </select>
                </label>
                <input type="hidden" name="renewalDate" value={league.renewalDate || ""} />
                <label>Admin asignado<input name="ownerEmail" type="email" defaultValue={league.ownerEmail || ""} /></label>
                <label className="wide-field">Notas
                  <textarea name="membershipNotes" defaultValue={league.membershipNotes || ""} placeholder="Contacto, acuerdos internos, observaciones de operacion, etc." />
                </label>
                <div className="membership-actions">
                  <button className="primary" type="submit">Guardar cambios</button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextAction = league.status === "active" ? "suspender" : "reactivar";
                      const confirmed = window.confirm(`¿Seguro que quieres ${nextAction} ${league.name}?`);
                      if (!confirmed) return;
                      onToggleLeague(league.id);
                      onSetNotice(`${league.name} ${league.status === "active" ? "suspendida" : "reactivada"} correctamente.`);
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
            </details>
          );
        })}
        {!filteredLeagues.length && <p className="empty">No hay ligas con esos filtros.</p>}
      </div>
    </section>
  );
}

function SuperAdminCreateLeagueSheet({ onClose, onSubmit }) {
  return (
    <div className="super-admin-modal super-entity-modal" role="dialog" aria-modal="true" aria-label="Nueva liga">
      <button className="super-admin-modal-backdrop" type="button" aria-label="Cerrar" onClick={onClose} />
      <section className="super-admin-sheet super-entity-sheet super-league-sheet">
        <div className="super-sheet-header">
          <span className="super-sheet-badge"><AdminIcon type="leagues" /></span>
          <div>
            <span>Nueva liga</span>
            <h3>Crear liga en LIGATEC</h3>
            <p>Registra el municipio, define su visibilidad publica y opcionalmente genera el acceso del administrador principal.</p>
          </div>
          <button className="super-sheet-close" type="button" onClick={onClose}>Cerrar</button>
        </div>
        <form className="league-create-form super-sheet-form" onSubmit={onSubmit}>
          <fieldset>
            <legend>Datos de la liga</legend>
            <label className="wide-field">Liga<input name="name" required placeholder="Nombre de la nueva liga" /></label>
            <label>Municipio<input name="city" required placeholder="Municipio o zona" /></label>
            <label>Visibilidad
              <select name="publicVisibility" defaultValue="visible">
                <option value="visible">Visible al publico</option>
                <option value="hidden">Oculta del directorio publico</option>
                <option value="private">Modo privado / pruebas</option>
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend>Administrador inicial</legend>
            <label>Admin asignado<input name="adminName" placeholder="Nombre del administrador" /></label>
            <label>Correo admin<input name="adminEmail" type="email" placeholder="correo del admin para enviar invitacion" /></label>
            <p className="super-sheet-note">Si agregas correo, se generara una invitacion para activar su cuenta.</p>
          </fieldset>
          <div className="super-sheet-actions">
            <button type="button" onClick={onClose}>Cancelar</button>
            <button className="primary" type="submit">Crear liga</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SuperAdminUserCreateSheet({ leagues, onClose, onSubmit }) {
  return (
    <div className="super-admin-modal super-entity-modal" role="dialog" aria-modal="true" aria-label="Nuevo usuario administrador">
      <button className="super-admin-modal-backdrop" type="button" aria-label="Cerrar" onClick={onClose} />
      <section className="super-admin-sheet super-entity-sheet super-user-sheet">
        <div className="super-sheet-header">
          <span className="super-sheet-badge"><AdminIcon type="users" /></span>
          <div>
            <span>Nuevo acceso</span>
            <h3>Crear usuario administrador</h3>
            <p>Define el rol correcto y, si es admin limitado, marca solo los permisos necesarios para operar.</p>
          </div>
          <button className="super-sheet-close" type="button" onClick={onClose}>Cerrar</button>
        </div>
        <form className="user-create-form super-sheet-form" onSubmit={onSubmit}>
          <fieldset>
            <legend>Identidad del usuario</legend>
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
          </fieldset>
          <fieldset>
            <legend>Acceso administrativo</legend>
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
            <p className="super-sheet-note">Super admin no requiere liga. Admin de liga y admin limitado si deben tener una liga asignada.</p>
          </fieldset>
          <fieldset className="permission-checklist">
            <legend>Permisos para admin limitado</legend>
            {ADMIN_PERMISSION_OPTIONS.map((permission) => (
              <label key={permission.id}>
                <input name="permissions" type="checkbox" value={permission.id} />
                {permission.label}
              </label>
            ))}
          </fieldset>
          <p className="helper-text wide-field">Para un capturista de resultados, usa rol Admin limitado y marca solo Capturar actas/resultados.</p>
          <div className="super-sheet-actions">
            <button type="button" onClick={onClose}>Cancelar</button>
            <button className="primary" type="submit">Crear invitacion</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SuperAdminTournamentsPanel({ leagues }) {
  const tournaments = leagues
    .filter((league) => league.status !== "deleted")
    .flatMap((league) => (league.competitions || []).map((competition) => ({ ...competition, leagueName: league.name, leagueCity: league.city })));
  const [query, setQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const tournamentSummary = useMemo(() => ({
    total: tournaments.length,
    active: tournaments.filter((competition) => competition.status !== "archived").length,
    archived: tournaments.filter((competition) => competition.status === "archived").length,
    leagues: new Set(tournaments.map((competition) => competition.leagueName)).size
  }), [tournaments]);
  const filteredTournaments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tournaments.filter((competition) => {
      if (leagueFilter !== "all" && competition.leagueName !== leagueFilter) return false;
      if (statusFilter === "active" && competition.status === "archived") return false;
      if (statusFilter === "archived" && competition.status !== "archived") return false;
      if (!normalizedQuery) return true;
      return `${competition.name} ${competition.season || ""} ${competition.leagueName} ${competition.leagueCity || ""}`.toLowerCase().includes(normalizedQuery);
    });
  }, [leagueFilter, query, statusFilter, tournaments]);
  const leagueOptions = useMemo(() => (
    [...new Set(tournaments.map((competition) => competition.leagueName).filter(Boolean))].sort()
  ), [tournaments]);

  return (
    <section className="panel super-module-panel">
      <SectionHeading eyebrow="Torneos" title="Historico y torneos activos" />
      <p className="helper-text">Vista global de temporadas y categorias. La gestion fina de torneos activos/historicos sigue en cada panel de liga para respetar permisos y evitar cambios masivos accidentales.</p>
      <div className="super-metric-grid compact super-tournament-metrics">
        <SuperMetricCard label="Torneos totales" value={tournamentSummary.total} />
        <SuperMetricCard label="Publicados" value={tournamentSummary.active} />
        <SuperMetricCard label="Historicos" value={tournamentSummary.archived} />
        <SuperMetricCard label="Ligas con torneos" value={tournamentSummary.leagues} />
      </div>
      <div className="super-list-toolbar super-tournament-toolbar">
        <label>
          Buscar torneo
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Torneo, temporada, liga o municipio" />
        </label>
        <label>
          Liga
          <select value={leagueFilter} onChange={(event) => setLeagueFilter(event.target.value)}>
            <option value="all">Todas</option>
            {leagueOptions.map((leagueName) => <option key={leagueName} value={leagueName}>{leagueName}</option>)}
          </select>
        </label>
        <label>
          Estado
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Publicados</option>
            <option value="archived">Historicos</option>
          </select>
        </label>
      </div>
      <div className="super-tournament-list">
        {filteredTournaments.map((competition) => (
          <article className={competition.status === "archived" ? "archived" : "active"} key={`${competition.leagueName}-${competition.id}`}>
            <span className="super-tournament-mark">{getInitials(competition.name)}</span>
            <div>
              <strong>{competition.name}</strong>
              <span>{competition.leagueName} | {competition.season || "Temporada sin definir"}</span>
              <small>{competition.leagueCity || "Sin municipio"}</small>
            </div>
            <b>{competition.status === "archived" ? "Historico" : "Publicado"}</b>
          </article>
        ))}
        {!tournaments.length && <p className="empty">Aun no hay torneos registrados.</p>}
        {tournaments.length > 0 && !filteredTournaments.length && <p className="empty">No hay torneos con esos filtros.</p>}
      </div>
    </section>
  );
}

function formatBytes(sizeBytes) {
  const size = Number(sizeBytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatBackupDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getBackupStatusLabel(status) {
  if (status === "completed") return "Completado";
  if (status === "failed") return "Fallido";
  return "En proceso";
}

function getBackupKindLabel(kind) {
  if (kind === "logical_store_json") return "Respaldo logico";
  if (kind === "sqlite_file") return "Copia SQLite";
  return "Respaldo";
}

function SuperAdminBackupsPanel({ authToken, stats }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadBackups() {
    if (!authToken) return;
    setLoading(true);
    setError("");
    try {
      setBackups(await fetchBackups(authToken, 20));
    } catch (err) {
      setError(err.message || "No se pudieron cargar los respaldos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBackups();
  }, [authToken]);

  async function handleCreateBackup() {
    const confirmed = window.confirm("Crear un respaldo manual ahora puede tardar unos segundos. ¿Deseas continuar?");
    if (!confirmed) return;
    setBusyAction("create");
    setError("");
    setNotice("");
    try {
      const backup = await createBackup(authToken);
      setNotice(`Respaldo creado: ${backup.fileName || backup.id}`);
      await loadBackups();
    } catch (err) {
      setError(err.message || "No se pudo crear el respaldo.");
      await loadBackups();
    } finally {
      setBusyAction("");
    }
  }

  async function handleDownloadBackup(backup) {
    setBusyAction(backup.id);
    setError("");
    setNotice("");
    try {
      await downloadBackup(authToken, backup);
      setNotice("Descarga iniciada.");
    } catch (err) {
      setError(err.message || "No se pudo descargar el respaldo.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleVerifyBackup(backup) {
    setBusyAction(`verify:${backup.id}`);
    setError("");
    setNotice("");
    try {
      const result = await verifyBackup(authToken, backup);
      if (result.ok) {
        setNotice(`Respaldo verificado correctamente: ${backup.fileName || backup.id}`);
      } else {
        setError(result.reason || "El respaldo no paso la verificacion.");
      }
    } catch (err) {
      setError(err.message || "No se pudo verificar el respaldo.");
    } finally {
      setBusyAction("");
    }
  }

  const latestBackup = backups.find((backup) => backup.status === "completed");

  return (
    <section className="panel super-module-panel">
      <SectionHeading eyebrow="Respaldos" title="Proteccion de informacion" />
      <div className="super-protection-card">
        <strong>Respaldos manuales auditados</strong>
        <span>Solo Super Admin puede generar o descargar respaldos. El sistema registra usuario, fecha, tamano, checksum y resultado sin exponer rutas internas del servidor.</span>
        <button type="button" onClick={handleCreateBackup} disabled={busyAction === "create"}>
          {busyAction === "create" ? "Creando respaldo..." : "Crear respaldo ahora"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-success">{notice}</p>}
      <div className="super-metric-grid compact">
        <SuperMetricCard label="Ligas protegidas" value={stats.totalLeagues} />
        <SuperMetricCard label="Equipos en store" value={stats.teams} />
        <SuperMetricCard label="Jugadores en store" value={stats.players} />
        <SuperMetricCard label="Ultimo respaldo" value={latestBackup ? formatBytes(latestBackup.sizeBytes) : "Pendiente"} />
      </div>
      <div className="super-backup-list">
        <div className="super-backup-list-head">
          <div>
            <strong>Historial de respaldos</strong>
            <span>{loading ? "Cargando historial..." : `${backups.length} registro(s) recientes`}</span>
          </div>
          <button type="button" onClick={loadBackups} disabled={loading || Boolean(busyAction)}>Actualizar</button>
        </div>
        {!loading && !backups.length && <p className="empty">Aun no hay respaldos creados desde el panel.</p>}
        {backups.map((backup) => (
          <article className={`super-backup-card ${backup.status}`} key={backup.id}>
            <div className="super-backup-main">
              <span className="super-backup-icon">{backup.kind === "logical_store_json" ? "JSON" : "DB"}</span>
              <div>
                <strong>{backup.fileName || backup.id}</strong>
                <span>{getBackupKindLabel(backup.kind)} | {backup.provider}</span>
                <small>Creado: {formatBackupDate(backup.createdAt)}</small>
              </div>
            </div>
            <div className="super-backup-meta">
              <span className={`super-status-pill ${backup.status}`}>{getBackupStatusLabel(backup.status)}</span>
              <b>{formatBytes(backup.sizeBytes)}</b>
              {backup.checksumSha256 && <small>SHA256: {backup.checksumSha256.slice(0, 12)}...</small>}
              {backup.storageBucket && <small>Storage externo configurado</small>}
              {backup.errorMessage && <small className="danger-text">{backup.errorMessage}</small>}
            </div>
            <div className="super-backup-actions">
              <button
                type="button"
                onClick={() => handleVerifyBackup(backup)}
                disabled={!backup.downloadAvailable || busyAction === `verify:${backup.id}`}
              >
                {busyAction === `verify:${backup.id}` ? "Verificando..." : "Verificar"}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadBackup(backup)}
                disabled={!backup.downloadAvailable || busyAction === backup.id}
              >
                {busyAction === backup.id ? "Descargando..." : "Descargar"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SuperAdminSettingsPanel({ onResetDemo }) {
  const demoToolsEnabled = import.meta.env.DEV;

  return (
    <section className="panel super-module-panel">
      <SectionHeading eyebrow="Configuracion" title="Ajustes generales" />
      <p className="helper-text">Acciones globales con impacto en toda la plataforma. Mantengo las operaciones peligrosas separadas y con confirmacion.</p>
      <div className="super-settings-list">
        {demoToolsEnabled ? (
          <article>
            <div>
              <strong>Datos demo</strong>
              <span>Restaurar datos de demostracion. Solo disponible en desarrollo local.</span>
            </div>
            <button className="danger" type="button" onClick={onResetDemo}>Restaurar demo</button>
          </article>
        ) : (
          <article>
            <div>
              <strong>Herramientas demo deshabilitadas</strong>
              <span>En produccion no se permite restaurar datos de demostracion ni reemplazar informacion operativa desde este panel.</span>
            </div>
            <span className="status active">Produccion protegida</span>
          </article>
        )}
      </div>
    </section>
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
  const [showCreateSponsor, setShowCreateSponsor] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const activeLeagues = leagues.filter((league) => league.status !== "deleted");
  const sponsorSummary = useMemo(() => {
    const sponsors = activeLeagues.flatMap((league) => league.sponsors || []);
    return {
      total: sponsors.length,
      active: sponsors.filter((sponsor) => sponsor.status !== "inactive").length,
      inactive: sponsors.filter((sponsor) => sponsor.status === "inactive").length,
      leagues: activeLeagues.filter((league) => (league.sponsors || []).length).length
    };
  }, [activeLeagues]);
  const displayedLeagues = useMemo(() => activeLeagues.filter((league) => (
    leagueFilter === "all" || league.id === leagueFilter
  )), [activeLeagues, leagueFilter]);

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
      setShowCreateSponsor(false);
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
    <section className="panel super-module-panel super-sponsor-module">
      <div className="panel-title-row">
        <SectionHeading eyebrow="Super admin" title="Publicidad por liga" />
        <button className="primary" type="button" onClick={() => setShowCreateSponsor(true)}>+ Agregar publicidad</button>
      </div>
      <p className="helper-text">Cada liga tiene sus propios banners. Solo el super admin puede crear, editar o eliminar publicidad.</p>
      {notice && <p className="auth-ok">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
      {uploading && <p className="auth-ok">Subiendo imagen...</p>}

      <div className="super-metric-grid compact super-sponsor-metrics">
        <SuperMetricCard label="Banners" value={sponsorSummary.total} />
        <SuperMetricCard label="Activos" value={sponsorSummary.active} />
        <SuperMetricCard label="Inactivos" value={sponsorSummary.inactive} />
        <SuperMetricCard label="Ligas con publicidad" value={sponsorSummary.leagues} />
      </div>

      <div className="super-list-toolbar super-sponsor-toolbar">
        <label>
          Liga
          <select value={leagueFilter} onChange={(event) => setLeagueFilter(event.target.value)}>
            <option value="all">Todas las ligas</option>
            {activeLeagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
          </select>
        </label>
        <label>
          Estado
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>
      </div>

      {showCreateSponsor && (
        <SuperAdminSponsorCreateSheet
          activeLeagues={activeLeagues}
          onClose={() => setShowCreateSponsor(false)}
          onSubmit={submitNewSponsor}
        />
      )}

      <div className="sponsor-admin-list">
        {displayedLeagues.map((league) => {
          const sponsors = [...(league.sponsors || [])]
            .filter((sponsor) => statusFilter === "all" || (sponsor.status || "active") === statusFilter)
            .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name));
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

function SuperAdminSponsorCreateSheet({ activeLeagues, onClose, onSubmit }) {
  return (
    <div className="super-admin-modal" role="dialog" aria-modal="true" aria-label="Nueva publicidad">
      <button className="super-admin-modal-backdrop" type="button" aria-label="Cerrar" onClick={onClose} />
      <section className="super-admin-sheet super-sponsor-sheet">
        <div className="super-card-head">
          <div>
            <span>Publicidad</span>
            <h3>Agregar banner por liga</h3>
          </div>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <form className="sponsor-form" onSubmit={onSubmit}>
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
      </section>
    </div>
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
  { id: "match_sheets", label: "Capturar actas/resultados" },
  { id: "discipline", label: "Comision disciplinaria" },
  { id: "delegates", label: "Delegados" },
  { id: "settings", label: "Reglas de liga" }
];
const ADMIN_ACCESS_ROLES = new Set(["super_admin", "league_admin", "admin_limited"]);

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

function getAdminAccesses(user) {
  return (user.accesses || []).filter((access) => ADMIN_ACCESS_ROLES.has(access.role));
}

function getPrimaryAdminAccess(user) {
  const adminAccesses = getAdminAccesses(user);
  return adminAccesses.find((access) => (
    access.role === user.role &&
    (access.leagueId || "") === (user.leagueId || "")
  )) || adminAccesses[0] || null;
}

function getUserStatusLabel(status) {
  if (status === "active") return "Activo";
  if (status === "pending_activation") return "Pendiente";
  if (status === "disabled") return "Deshabilitado";
  if (status === "suspended") return "Suspendido";
  return status || "Sin estado";
}

function getAdminAccessLabel(access) {
  const permissions = access.permissions?.length ? ` | ${access.permissions.map(getPermissionLabel).join(", ")}` : "";
  return `${getUserRoleLabel(access.role)} | ${access.leagueName || "Todas las ligas"} | ${getUserStatusLabel(access.status)}${permissions}`;
}

function matchesUserSearch(user, query) {
  if (!query) return true;
  const adminAccesses = getAdminAccesses(user);
  const searchable = [
    user.name,
    user.email,
    user.phone,
    user.status,
    getUserRoleLabel(user.role),
    ...adminAccesses.map((access) => getAdminAccessLabel(access))
  ].join(" ").toLowerCase();
  return searchable.includes(query);
}

function UserManagement({ authToken, currentUser, leagues, refreshKey = 0 }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const adminUsers = users.filter((user) => ADMIN_ACCESS_ROLES.has(user.role) || getAdminAccesses(user).length > 0);
  const delegateUserCount = users.filter((user) => user.role === "team_delegate").length;
  const refereeUserCount = users.filter((user) => user.role === "referee").length;
  const userSummary = useMemo(() => ({
    admins: adminUsers.filter((user) => user.role === "league_admin" || getAdminAccesses(user).some((access) => access.role === "league_admin")).length,
    limited: adminUsers.filter((user) => user.role === "admin_limited" || getAdminAccesses(user).some((access) => access.role === "admin_limited")).length,
    superAdmins: adminUsers.filter((user) => user.role === "super_admin" || getAdminAccesses(user).some((access) => access.role === "super_admin")).length,
    pending: adminUsers.filter((user) => user.status === "pending_activation").length,
    disabled: adminUsers.filter((user) => ["disabled", "suspended"].includes(user.status)).length
  }), [adminUsers]);
  const filteredAdminUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return adminUsers.filter((user) => {
      const adminAccesses = getAdminAccesses(user);
      if (roleFilter !== "all" && user.role !== roleFilter && !adminAccesses.some((access) => access.role === roleFilter)) return false;
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      return matchesUserSearch(user, query);
    });
  }, [adminUsers, roleFilter, statusFilter, userQuery]);

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
    setShowCreateUser(false);
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
    <section className="panel super-module-panel super-users-module">
      <div className="panel-title-row">
        <SectionHeading eyebrow="Accesos" title="Usuarios administradores" />
        <button className="primary" type="button" onClick={() => setShowCreateUser(true)}>+ Nuevo usuario</button>
      </div>

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

      <div className="super-metric-grid compact super-user-metrics">
        <SuperMetricCard label="Super admin" value={userSummary.superAdmins} />
        <SuperMetricCard label="Admins de liga" value={userSummary.admins} />
        <SuperMetricCard label="Admins limitados" value={userSummary.limited} />
        <SuperMetricCard label="Pendientes" value={userSummary.pending} />
        <SuperMetricCard label="Bloqueados/inactivos" value={userSummary.disabled} />
      </div>

      <div className="super-list-toolbar super-user-toolbar">
        <label>
          Buscar usuario
          <input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Nombre, correo, liga o permiso" />
        </label>
        <label>
          Rol
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="super_admin">Super admin</option>
            <option value="league_admin">Admin de liga</option>
            <option value="admin_limited">Admin limitado</option>
          </select>
        </label>
        <label>
          Estado
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="pending_activation">Pendientes</option>
            <option value="disabled">Deshabilitados</option>
            <option value="suspended">Suspendidos</option>
          </select>
        </label>
      </div>

      {showCreateUser && (
        <SuperAdminUserCreateSheet
          leagues={leagues}
          onClose={() => setShowCreateUser(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const created = await handleCreate(getFormPayload(event.currentTarget));
              if (created) event.currentTarget.reset();
            } catch (requestError) {
              setError(requestError.message);
            }
          }}
        />
      )}

      <div className="user-list">
        {filteredAdminUsers.map((user) => {
          const isSelf = user.id === currentUser?.id;
          const adminAccesses = getAdminAccesses(user);
          const primaryAccess = getPrimaryAdminAccess(user);
          const selectedPermissions = primaryAccess?.permissions || [];
          const adminRole = primaryAccess?.role || user.role;
          const adminLeagueId = primaryAccess?.leagueId || user.leagueId || "";
          return (
            <details className={`super-user-card ${user.status}`} key={user.id}>
              <summary>
                <span className="super-user-avatar">{getInitials(user.name || user.email)}</span>
                <span className="super-user-summary-copy">
                  <b>{user.name || "Usuario sin nombre"}</b>
                  <small>{user.email}</small>
                </span>
                <span className="super-user-access-pills">
                  {(adminAccesses.length ? adminAccesses : [{ role: user.role, leagueName: "Todas las ligas", status: user.status }]).slice(0, 2).map((access) => (
                    <em key={access.id || `${access.role}-${access.leagueName || access.leagueId || "global"}`}>{getUserRoleLabel(access.role)}</em>
                  ))}
                </span>
                <span className={`status ${user.status}`}>{getUserStatusLabel(user.status)}</span>
                <span className="super-detail-chevron">Editar</span>
              </summary>
              <form
                className="user-card super-user-edit-form"
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
                  <select name="role" defaultValue={adminRole} disabled={isSelf}>
                    <option value="league_admin">Admin de liga</option>
                    <option value="admin_limited">Admin limitado</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </label>
                {isSelf && <input type="hidden" name="role" value={adminRole} />}
                <label>
                  Liga asignada
                  <select name="leagueId" defaultValue={adminLeagueId}>
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
                        {getAdminAccessLabel(access)}
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
            </details>
          );
        })}
        {!filteredAdminUsers.length && <p className="empty">No hay usuarios con esos filtros.</p>}
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
  match_delete: "Partido eliminado",
  backup_create: "Respaldo creado",
  backup_create_failed: "Fallo en respaldo",
  backup_download: "Respaldo descargado",
  backup_verify: "Respaldo verificado",
  backup_verify_failed: "Fallo al verificar respaldo"
};

const AUDIT_CRITICAL_ACTIONS = new Set([
  "league_delete",
  "login_locked",
  "login_blocked",
  "user_delete",
  "user_disable",
  "password_reset_complete",
  "backup_create_failed",
  "backup_verify_failed",
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
  "backup_create",
  "backup_download",
  "backup_verify",
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
  const [visibleLogLimit, setVisibleLogLimit] = useState(8);
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
  const topAuditActions = useMemo(() => {
    const counts = filteredLogs.reduce((accumulator, log) => {
      const label = AUDIT_LABELS[log.action] || log.action;
      accumulator[label] = (accumulator[label] || 0) + 1;
      return accumulator;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [filteredLogs]);
  const visibleLogs = filteredLogs.slice(0, visibleLogLimit);
  const hiddenLogs = Math.max(filteredLogs.length - visibleLogs.length, 0);

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

  useEffect(() => {
    setVisibleLogLimit(8);
  }, [filters]);

  return (
    <section className="panel super-module-panel super-audit-module">
      <div className="panel-title-row">
        <SectionHeading eyebrow="Auditoria" title="Historial de actividad" />
        <button type="button" onClick={loadLogs}>Actualizar</button>
      </div>
      <p className="helper-text">Monitorea acciones criticas, accesos fallidos y cambios administrativos. La auditoria ayuda a detectar errores operativos o movimientos no autorizados.</p>

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

      <div className="audit-insight-grid" aria-label="Resumen rapido de auditoria">
        <article>
          <small>Vista actual</small>
          <strong>{filteredLogs.length}</strong>
          <span>movimiento(s) con filtros</span>
        </article>
        <article>
          <small>Accion mas frecuente</small>
          <strong>{topAuditActions[0]?.[0] || "Sin datos"}</strong>
          <span>{topAuditActions[0] ? `${topAuditActions[0][1]} evento(s)` : "Ajusta filtros para revisar"}</span>
        </article>
      </div>

      {topAuditActions.length > 1 && (
        <div className="audit-action-strip" aria-label="Acciones frecuentes">
          {topAuditActions.map(([label, count]) => (
            <span key={label}><strong>{count}</strong>{label}</span>
          ))}
        </div>
      )}

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
        {visibleLogs.map((log) => (
          <article className={`audit-row ${auditSeverity(log.action)}`} key={log.id}>
            <span className="audit-severity-mark" aria-hidden="true" />
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
        {hiddenLogs > 0 && (
          <button className="audit-show-more" type="button" onClick={() => setVisibleLogLimit((value) => value + 8)}>
            Mostrar 8 mas · {hiddenLogs} oculto(s)
          </button>
        )}
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

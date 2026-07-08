import { seedData } from "../data/seedData.js";
import {
  addLeague,
  addAnnouncement,
  addCompetition,
  addAppearanceAdjustment,
  addDisciplineAdjustment,
  addDisciplineLink,
  addDisciplineReset,
  addMatch,
  addPlayer,
  addPlayerInjury,
  addPlayerSanction,
  addSponsor,
  addTeam,
  addTeamAffiliation,
  addVenue,
  deleteMatch,
  deletePlayoffMatches,
  deleteAnnouncement,
  deleteAppearanceAdjustment,
  deleteDisciplineAdjustment,
  deleteDisciplineLink,
  deleteDisciplineReset,
  deleteLeague,
  deletePlayer,
  deletePlayerInjury,
  deletePlayerSanction,
  deleteSponsor,
  deleteTeam,
  deleteTeamAffiliation,
  deleteVenue,
  generateSchedule,
  generatePlayoffBracket,
  mergeDuplicatePlayer,
  saveIdentity,
  saveMatchSheet,
  saveResult,
  toggleLeagueStatus,
  updateLeagueRules,
  updateLeagueMembership,
  updateAnnouncement,
  updateCompetition,
  updateMatch,
  updatePlayer,
  updatePlayerInjury,
  updateSponsor,
  updateTeam,
  updateTeamAffiliationPlayerNumber,
  updateVenue
} from "../lib/actions.js";
import { createUser } from "../lib/userApi.js";
import { deleteLeagueFromApi } from "../lib/leagueApi.js";
import { createMatchInApi, deleteMatchInApi, saveMatchResultInApi, updateMatchInApi } from "../lib/matchApi.js";
import { createPlayerInApi, deletePlayerInApi, updatePlayerInApi } from "../lib/playerApi.js";
import { updateLeagueRulesInApi } from "../lib/rulesApi.js";
import { findDuplicatePlayer, validatePlayerFullName } from "../lib/playerValidation.js";
import { AdminView } from "./AdminView.jsx";

export function AdminRoute({
  adminPanel,
  applyApiStore,
  authToken,
  canUseSuperAdmin,
  commit,
  currentUser,
  heroImage,
  league,
  selectedAccess,
  setAdminPanel,
  setApiStatus,
  setUserListRefreshKey,
  store,
  userListRefreshKey
}) {
  function resetDemo() {
    setAdminPanel("league");
    commit(seedData);
  }

  async function createLeagueWithAdmin(payload) {
    const nextStore = addLeague(store, { ...payload, ownerEmail: payload.adminEmail || payload.ownerEmail });
    const newLeagueId = nextStore.currentLeagueId;
    setAdminPanel("league");
    commit(nextStore);

    if (payload.adminEmail && authToken) {
      try {
        const result = await createUser(authToken, {
          name: payload.adminName || `Admin ${payload.name}`,
          email: payload.adminEmail,
          role: "league_admin",
          leagueId: newLeagueId
        });
        setApiStatus("connected");
        if (result?.invitation?.whatsappMessage) {
          window.alert(`Liga creada. Invitacion del administrador:\n\n${result.invitation.whatsappMessage}`);
        }
      } catch (userError) {
        window.alert(`La liga se creo, pero no se pudo generar la invitacion del usuario admin: ${userError.message}`);
      }
    }
  }

  async function deleteLeagueWithCleanup(leagueId) {
    if (store.leagues.length <= 1) {
      window.alert("No se puede eliminar la unica liga registrada.");
      return;
    }

    if (authToken && canUseSuperAdmin) {
      try {
        const response = await deleteLeagueFromApi(authToken, leagueId);
        applyApiStore(response.store);
        setApiStatus("connected");
        setUserListRefreshKey((value) => value + 1);
        window.alert(`Liga eliminada. Tambien se eliminaron ${response.removedAdmins} usuario(s) administrador(es) de esa liga.`);
        return;
      } catch (deleteError) {
        window.alert(`No se pudo eliminar la liga: ${deleteError.message}`);
        return;
      }
    }

    commit(deleteLeague(store, leagueId));
    setUserListRefreshKey((value) => value + 1);
  }

  function guardPlayerName(payload, excludePlayerId = "") {
    const result = validatePlayerFullName(payload.name);
    if (!result.valid) {
      window.alert(result.message);
      return false;
    }

    const duplicate = findDuplicatePlayer(league, payload, excludePlayerId);
    if (!duplicate) return true;

    const duplicateTeam = league.teams.find((team) => team.id === duplicate.teamId);
    const duplicateCompetition = league.competitions?.find((competition) => competition.id === duplicate.competitionId);
    const details = [
      duplicateTeam?.name ? `Equipo: ${duplicateTeam.name}` : "",
      duplicateCompetition?.name ? `Categoria: ${duplicateCompetition.name}` : ""
    ].filter(Boolean).join("\n");

    window.alert(`Este jugador ya esta registrado como ${duplicate.name}.\n${details}\n\nNo se guardo un registro duplicado.`);
    return false;
  }

  async function saveRules(payload) {
    const localStore = updateLeagueRules(store, league.id, payload);

    if (!authToken) {
      commit(localStore);
      return;
    }

    try {
      const apiStore = await updateLeagueRulesInApi(authToken, league.id, payload);
      applyApiStore(apiStore);
      setApiStatus("connected");
    } catch {
      commit(localStore);
    }
  }

  async function createMatchFromPanel(payload) {
    if (!authToken) {
      commit(addMatch(store, league.id, payload));
      return true;
    }
    try {
      const apiStore = await createMatchInApi(authToken, league.id, payload);
      applyApiStore(apiStore);
      setApiStatus("connected");
      return true;
    } catch (matchError) {
      window.alert(matchError.message || "No se pudo crear el partido.");
      return false;
    }
  }

  async function updateMatchFromPanel(matchId, payload) {
    if (!authToken) {
      commit(updateMatch(store, league.id, matchId, payload));
      return true;
    }
    try {
      const apiStore = await updateMatchInApi(authToken, league.id, matchId, payload);
      applyApiStore(apiStore);
      setApiStatus("connected");
      return true;
    } catch (matchError) {
      window.alert(matchError.message || "No se pudo actualizar el partido.");
      return false;
    }
  }

  async function deleteMatchFromPanel(matchId) {
    if (!authToken) {
      commit(deleteMatch(store, league.id, matchId));
      return true;
    }
    try {
      const apiStore = await deleteMatchInApi(authToken, league.id, matchId);
      applyApiStore(apiStore);
      setApiStatus("connected");
      return true;
    } catch (matchError) {
      window.alert(matchError.message || "No se pudo eliminar el partido.");
      return false;
    }
  }

  async function createPlayerFromPanel(payload) {
    if (!guardPlayerName(payload)) return false;
    if (!authToken) {
      commit(addPlayer(store, league.id, payload));
      return true;
    }
    try {
      const apiStore = await createPlayerInApi(authToken, league.id, payload);
      applyApiStore(apiStore);
      setApiStatus("connected");
      return true;
    } catch (playerError) {
      window.alert(playerError.message || "No se pudo registrar el jugador.");
      return false;
    }
  }

  async function updatePlayerFromPanel(playerId, payload) {
    if (!guardPlayerName(payload, playerId)) return false;
    if (!authToken) {
      commit(updatePlayer(store, league.id, playerId, payload));
      return true;
    }
    try {
      const apiStore = await updatePlayerInApi(authToken, league.id, playerId, payload);
      applyApiStore(apiStore);
      setApiStatus("connected");
      return true;
    } catch (playerError) {
      window.alert(playerError.message || "No se pudo actualizar el jugador.");
      return false;
    }
  }

  async function deletePlayerFromPanel(playerId) {
    if (!authToken) {
      commit(deletePlayer(store, league.id, playerId));
      return true;
    }
    try {
      const apiStore = await deletePlayerInApi(authToken, league.id, playerId);
      applyApiStore(apiStore);
      setApiStatus("connected");
      return true;
    } catch (playerError) {
      window.alert(playerError.message || "No se pudo eliminar el jugador.");
      return false;
    }
  }

  async function saveResultFromPanel(payload) {
    if (!authToken) {
      commit(saveResult(store, league.id, payload));
      return true;
    }
    try {
      const apiStore = await saveMatchResultInApi(authToken, league.id, payload.matchId, payload);
      applyApiStore(apiStore);
      setApiStatus("connected");
      return true;
    } catch (matchError) {
      window.alert(matchError.message || "No se pudo guardar el resultado.");
      return false;
    }
  }

  return (
    <AdminView
      adminPanel={adminPanel}
      canUseSuperAdmin={canUseSuperAdmin}
      currentUser={currentUser}
      selectedAccess={selectedAccess}
      authToken={authToken}
      heroImage={heroImage}
      league={league}
      onAddAnnouncement={(payload) => commit(addAnnouncement(store, league.id, payload))}
      onAddAppearanceAdjustment={(payload) => commit(addAppearanceAdjustment(store, league.id, payload))}
      onAddCompetition={(payload) => {
        commit(addCompetition(store, league.id, payload));
      }}
      onAddDisciplineAdjustment={(payload) => commit(addDisciplineAdjustment(store, league.id, payload))}
      onAddDisciplineLink={(payload) => commit(addDisciplineLink(store, league.id, payload))}
      onAddDisciplineReset={(payload) => commit(addDisciplineReset(store, league.id, payload))}
      onAddLeague={createLeagueWithAdmin}
      onAddMatch={createMatchFromPanel}
      onAddPlayer={createPlayerFromPanel}
      onAddPlayerInjury={(payload) => commit(addPlayerInjury(store, league.id, payload))}
      onAddSponsor={(leagueId, payload) => commit(addSponsor(store, leagueId, payload))}
      onAddTeam={(payload) => {
        commit(addTeam(store, league.id, payload));
      }}
      onAddTeamAffiliation={(payload) => commit(addTeamAffiliation(store, league.id, payload))}
      onAddVenue={(payload) => commit(addVenue(store, league.id, payload))}
      onDeleteAnnouncement={(announcementId) => commit(deleteAnnouncement(store, league.id, announcementId))}
      onDeleteAppearanceAdjustment={(adjustmentId) => commit(deleteAppearanceAdjustment(store, league.id, adjustmentId))}
      onDeleteDisciplineAdjustment={(adjustmentId) => commit(deleteDisciplineAdjustment(store, league.id, adjustmentId))}
      onDeleteDisciplineLink={(linkId) => commit(deleteDisciplineLink(store, league.id, linkId))}
      onDeleteDisciplineReset={(resetId) => commit(deleteDisciplineReset(store, league.id, resetId))}
      onDeleteMatch={deleteMatchFromPanel}
      onDeletePlayoffMatches={(payload) => commit(deletePlayoffMatches(store, league.id, payload))}
      onDeleteLeague={deleteLeagueWithCleanup}
      onDeletePlayer={deletePlayerFromPanel}
      onDeletePlayerInjury={(injuryId) => commit(deletePlayerInjury(store, league.id, injuryId))}
      onDeletePlayerSanction={(sanctionId) => commit(deletePlayerSanction(store, league.id, sanctionId))}
      onDeleteSponsor={(leagueId, sponsorId) => commit(deleteSponsor(store, leagueId, sponsorId))}
      onDeleteTeam={(teamId) => commit(deleteTeam(store, league.id, teamId))}
      onDeleteTeamAffiliation={(affiliationId) => commit(deleteTeamAffiliation(store, league.id, affiliationId))}
      onDeleteVenue={(venueId) => commit(deleteVenue(store, league.id, venueId))}
      onResetDemo={resetDemo}
      onAddPlayerSanction={(payload) => commit(addPlayerSanction(store, league.id, payload))}
      onGenerateSchedule={(payload) => commit(generateSchedule(store, league.id, payload))}
      onGeneratePlayoffBracket={(payload) => commit(generatePlayoffBracket(store, league.id, payload))}
      onSaveIdentity={(payload) => commit(saveIdentity(store, league.id, payload))}
      onSaveMatchSheet={(payload) => commit(saveMatchSheet(store, league.id, payload))}
      onSaveRules={saveRules}
      onSaveResult={saveResultFromPanel}
      onSetAdminPanel={setAdminPanel}
      onToggleLeague={(leagueId) => commit(toggleLeagueStatus(store, leagueId))}
      onUpdateAnnouncement={(announcementId, payload) => commit(updateAnnouncement(store, league.id, announcementId, payload))}
      onUpdateCompetition={(competitionId, payload) => commit(updateCompetition(store, league.id, competitionId, payload))}
      onUpdateLeagueMembership={(leagueId, payload) => commit(updateLeagueMembership(store, leagueId, payload))}
      onUpdateMatch={updateMatchFromPanel}
      onUpdatePlayerInjury={(injuryId, payload) => commit(updatePlayerInjury(store, league.id, injuryId, payload))}
      onUpdateSponsor={(leagueId, sponsorId, payload) => commit(updateSponsor(store, leagueId, sponsorId, payload))}
      onUpdatePlayer={updatePlayerFromPanel}
      onUpdateTeam={(teamId, payload) => commit(updateTeam(store, league.id, teamId, payload))}
      onMergeDuplicatePlayer={(payload) => commit(mergeDuplicatePlayer(store, league.id, payload))}
      onUpdateTeamAffiliationPlayerNumber={(affiliationId, payload) => commit(updateTeamAffiliationPlayerNumber(store, league.id, affiliationId, payload))}
      onUpdateVenue={(venueId, payload) => commit(updateVenue(store, league.id, venueId, payload))}
      applyApiStore={applyApiStore}
      store={store}
      userListRefreshKey={userListRefreshKey}
    />
  );
}

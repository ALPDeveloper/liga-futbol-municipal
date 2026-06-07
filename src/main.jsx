import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import heroImage from "../assets/league-hero.png";
import { seedData } from "./data/seedData.js";
import {
  addLeague,
  addCompetition,
  addMatch,
  addPlayer,
  addPlayerInjury,
  addPlayerSanction,
  addTeam,
  deleteMatch,
  deleteLeague,
  deletePlayer,
  deletePlayerInjury,
  deletePlayerSanction,
  deleteTeam,
  generateSchedule,
  saveIdentity,
  saveMatchSheet,
  saveResult,
  toggleLeagueStatus,
  updateLeagueRules,
  updateLeagueMembership,
  updateCompetition,
  updateMatch,
  updatePlayer,
  updatePlayerInjury,
  updateTeam
} from "./lib/actions.js";
import { getCurrentLeague, normalizeStore } from "./lib/domain.js";
import { loadStore, saveStore } from "./lib/storage.js";
import { clearAuth, loadAuth, saveAuth } from "./lib/authStorage.js";
import { fetchSessionFromApi, fetchStoreFromApi, loginWithApi, persistStoreToApi } from "./lib/api.js";
import { deleteLeagueFromApi } from "./lib/leagueApi.js";
import { updateLeagueRulesInApi } from "./lib/rulesApi.js";
import { createUser } from "./lib/userApi.js";
import { canAddCompetitionByPlan, canAddTeamByPlan, canUsePlayoffsByPlan } from "./lib/plans.js";
import { validatePlayerFullName } from "./lib/playerValidation.js";
import { AdminView } from "./components/AdminView.jsx";
import { AuthPanel } from "./components/AuthPanel.jsx";
import { PublicView } from "./components/PublicView.jsx";
import "./styles.css";

const cachedStore = loadStore();
const initialStore = cachedStore || normalizeStore(seedData);
const initialAuth = loadAuth();

function getPublicLeagueIdFromPath(path) {
  const [, section, leagueId] = path.split("/");
  return section === "liga" ? decodeURIComponent(leagueId || "") : "";
}

function getPublicLeaguePath(leagueId) {
  return `/liga/${encodeURIComponent(leagueId)}`;
}

function App() {
  const [store, setStore] = useState(initialStore);
  const [routePath, setRoutePath] = useState(window.location.pathname);
  const [adminPanel, setAdminPanel] = useState("league");
  const [apiStatus, setApiStatus] = useState("checking");
  const [initialApiLoaded, setInitialApiLoaded] = useState(Boolean(cachedStore));
  const [auth, setAuth] = useState(initialAuth);
  const [userListRefreshKey, setUserListRefreshKey] = useState(0);
  const isAdminRoute = routePath.startsWith("/admin");
  const publicLeagueId = !isAdminRoute ? getPublicLeagueIdFromPath(routePath) : "";
  const league = useMemo(() => {
    if (publicLeagueId) return store.leagues.find((item) => item.id === publicLeagueId) || getCurrentLeague(store);
    return getCurrentLeague(store);
  }, [publicLeagueId, store]);
  const currentUser = auth.user;
  const canUseSuperAdmin = currentUser?.role === "super_admin";
  const canUseLeagueAdmin = currentUser?.role === "league_admin" && currentUser.leagueId === league.id && league.status === "active";
  const canUseAdmin = canUseSuperAdmin || canUseLeagueAdmin;
  const publicLeaguePath = getPublicLeaguePath(league.id);

  function navigateTo(path) {
    window.history.pushState({}, "", path);
    setRoutePath(window.location.pathname);
  }

  useEffect(() => {
    const handleNavigation = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchStoreFromApi()
      .then((apiStore) => {
        if (cancelled) return;
        const normalized = normalizeStore(apiStore);
        setStore(normalized);
        saveStore(normalized);
        setApiStatus("connected");
        setInitialApiLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setApiStatus("local");
          setInitialApiLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!auth.token) return;

    fetchSessionFromApi(auth.token)
      .then(({ user }) => {
        const nextAuth = { token: auth.token, user };
        setAuth(nextAuth);
        saveAuth(nextAuth);
      })
      .catch(() => {
        setAuth({ token: "", user: null });
        clearAuth();
      });
  }, [auth.token]);

  useEffect(() => {
    if (adminPanel === "super" && !canUseSuperAdmin) setAdminPanel("league");
  }, [adminPanel, canUseSuperAdmin]);

  function commit(nextStore) {
    const normalized = normalizeStore(nextStore);
    setStore(normalized);
    saveStore(normalized);
    persistStoreToApi(normalized, auth.token)
      .then(() => setApiStatus("connected"))
      .catch(() => setApiStatus("local"));
  }

  function selectLeague(leagueId) {
    const normalized = normalizeStore({ ...store, currentLeagueId: leagueId });
    setStore(normalized);
    saveStore(normalized);
    if (!isAdminRoute) navigateTo(getPublicLeaguePath(leagueId));
  }

  function resetDemo() {
    const nextStore = normalizeStore(seedData);
    setAdminPanel("league");
    commit(nextStore);
  }

  async function createLeagueWithAdmin(payload) {
    const nextStore = addLeague(store, { ...payload, ownerEmail: payload.adminEmail || payload.ownerEmail });
    const newLeagueId = nextStore.currentLeagueId;
    setAdminPanel("league");
    commit(nextStore);

    if (payload.adminEmail && payload.adminPassword && auth.token) {
      try {
        await createUser(auth.token, {
          name: payload.adminName || `Admin ${payload.name}`,
          email: payload.adminEmail,
          password: payload.adminPassword,
          role: "league_admin",
          leagueId: newLeagueId,
          status: "active"
        });
        setApiStatus("connected");
      } catch (userError) {
        window.alert(`La liga se creo, pero no se pudo crear el usuario admin: ${userError.message}`);
      }
    }
  }

  async function deleteLeagueWithCleanup(leagueId) {
    if (store.leagues.length <= 1) {
      window.alert("No se puede eliminar la unica liga registrada.");
      return;
    }

    if (auth.token && canUseSuperAdmin) {
      try {
        const response = await deleteLeagueFromApi(auth.token, leagueId);
        const normalized = normalizeStore(response.store);
        setStore(normalized);
        saveStore(normalized);
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

  function guardPlanAccess(result) {
    if (result.allowed) return true;
    window.alert(result.message);
    return false;
  }

  function guardPlayerName(payload) {
    const result = validatePlayerFullName(payload.name);
    if (result.valid) return true;
    window.alert(result.message);
    return false;
  }

  async function saveRules(payload) {
    const localStore = updateLeagueRules(store, league.id, payload);

    if (!auth.token) {
      commit(localStore);
      return;
    }

    try {
      const apiStore = await updateLeagueRulesInApi(auth.token, league.id, payload);
      const normalized = normalizeStore(apiStore);
      setStore(normalized);
      saveStore(normalized);
      setApiStatus("connected");
    } catch {
      commit(localStore);
    }
  }

  async function login(email, password) {
    const nextAuth = await loginWithApi(email, password);
    setAuth(nextAuth);
    saveAuth(nextAuth);
    setApiStatus("connected");
    if (!isAdminRoute) navigateTo("/admin");
    if (nextAuth.user.role === "league_admin" && nextAuth.user.leagueId) {
      selectLeague(nextAuth.user.leagueId);
    }
  }

  function logout() {
    setAuth({ token: "", user: null });
    clearAuth();
    navigateTo(publicLeaguePath);
    setAdminPanel("league");
  }

  const themeStyle = {
    "--field": league.identity.primaryColor,
    "--field-dark": league.identity.primaryColor,
    "--lime": league.identity.accentColor,
    "--blue": league.identity.secondaryColor
  };

  if (!initialApiLoaded && !isAdminRoute) {
    return (
      <main className="startup-screen">
        <div className="startup-card">
          <span className="brand-mark">LF</span>
          <strong>Cargando liga</strong>
          <small>Preparando calendario, tabla y estadisticas.</small>
        </div>
      </main>
    );
  }

  return (
    <div style={themeStyle}>
      <header className="topbar">
        <a className="brand" href={isAdminRoute ? "/admin" : publicLeaguePath} aria-label="Ir al inicio" onClick={(event) => {
          event.preventDefault();
          navigateTo(isAdminRoute ? "/admin" : publicLeaguePath);
        }}>
          <span className="brand-mark">LF</span>
          <span>
            <strong>Liga Futbol</strong>
            <small>Plataforma municipal</small>
          </span>
        </a>
        <div className="topbar-actions">
          {isAdminRoute ? (
            <label className="league-switcher">
              <span>Liga</span>
              <select value={league.id} onChange={(event) => selectLeague(event.target.value)}>
                {store.leagues.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="public-league-badge">
              <span>Liga</span>
              <strong>{league.name}</strong>
            </div>
          )}
          {isAdminRoute && (
            <>
              <a className="admin-public-link" href={publicLeaguePath} onClick={(event) => {
                event.preventDefault();
                navigateTo(publicLeaguePath);
              }}>
                Vista publica
              </a>
              <span className={`api-pill ${apiStatus}`}>
                {apiStatus === "connected" ? "API local" : apiStatus === "local" ? "Modo local" : "Conectando"}
              </span>
              {currentUser && <AuthPanel currentUser={currentUser} onLogin={login} onLogout={logout} />}
            </>
          )}
        </div>
      </header>

      {isAdminRoute && !canUseAdmin ? (
        <main className="page admin-access-page">
          <section className="admin-access-card">
            <span className="eyebrow">Acceso privado</span>
            <h1>Panel administrativo</h1>
            <p>Ingresa con el usuario asignado para administrar la liga o con una cuenta de super administrador.</p>
            <AuthPanel currentUser={currentUser} onLogin={login} onLogout={logout} />
            <a href="/" onClick={(event) => {
              event.preventDefault();
              navigateTo("/");
            }}>
              Volver a la pagina publica
            </a>
          </section>
        </main>
      ) : league.status === "suspended" && !isAdminRoute ? (
        <main className="page">
          <section className="hero compact" style={{ "--hero-image": `url(${heroImage})` }}>
            <div className="hero-content">
              <span className="eyebrow">
                {league.city} | {league.season}
              </span>
              <h1>{league.name}</h1>
              <p>{league.identity.publicIntro}</p>
            </div>
          </section>
        </main>
      ) : isAdminRoute ? (
        <AdminView
          adminPanel={adminPanel}
          canUseSuperAdmin={canUseSuperAdmin}
          currentUser={currentUser}
          authToken={auth.token}
          heroImage={heroImage}
          league={league}
          onAddCompetition={(payload) => {
            if (!guardPlanAccess(canAddCompetitionByPlan(league, payload))) return false;
            commit(addCompetition(store, league.id, payload));
          }}
          onAddLeague={createLeagueWithAdmin}
          onAddMatch={(payload) => {
            if (payload.stage === "playoff" && !guardPlanAccess(canUsePlayoffsByPlan(league))) return false;
            commit(addMatch(store, league.id, payload));
          }}
          onAddPlayer={(payload) => {
            if (!guardPlayerName(payload)) return false;
            commit(addPlayer(store, league.id, payload));
          }}
          onAddPlayerInjury={(payload) => commit(addPlayerInjury(store, league.id, payload))}
          onAddTeam={(payload) => {
            if (!guardPlanAccess(canAddTeamByPlan(league))) return false;
            commit(addTeam(store, league.id, payload));
          }}
          onDeleteMatch={(matchId) => commit(deleteMatch(store, league.id, matchId))}
          onDeleteLeague={deleteLeagueWithCleanup}
          onDeletePlayer={(playerId) => commit(deletePlayer(store, league.id, playerId))}
          onDeletePlayerInjury={(injuryId) => commit(deletePlayerInjury(store, league.id, injuryId))}
          onDeletePlayerSanction={(sanctionId) => commit(deletePlayerSanction(store, league.id, sanctionId))}
          onDeleteTeam={(teamId) => commit(deleteTeam(store, league.id, teamId))}
          onResetDemo={resetDemo}
          onAddPlayerSanction={(payload) => commit(addPlayerSanction(store, league.id, payload))}
          onGenerateSchedule={(payload) => commit(generateSchedule(store, league.id, payload))}
          onSaveIdentity={(payload) => commit(saveIdentity(store, league.id, payload))}
          onSaveMatchSheet={(payload) => commit(saveMatchSheet(store, league.id, payload))}
          onSaveRules={saveRules}
          onSaveResult={(payload) => commit(saveResult(store, league.id, payload))}
          onSetAdminPanel={setAdminPanel}
          onToggleLeague={(leagueId) => commit(toggleLeagueStatus(store, leagueId))}
          onUpdateCompetition={(competitionId, payload) => commit(updateCompetition(store, league.id, competitionId, payload))}
          onUpdateLeagueMembership={(leagueId, payload) => commit(updateLeagueMembership(store, leagueId, payload))}
          onUpdateMatch={(matchId, payload) => {
            if (payload.stage === "playoff" && !guardPlanAccess(canUsePlayoffsByPlan(league))) return;
            commit(updateMatch(store, league.id, matchId, payload));
          }}
          onUpdatePlayerInjury={(injuryId, payload) => commit(updatePlayerInjury(store, league.id, injuryId, payload))}
          onUpdatePlayer={(playerId, payload) => {
            if (!guardPlayerName(payload)) return;
            commit(updatePlayer(store, league.id, playerId, payload));
          }}
          onUpdateTeam={(teamId, payload) => commit(updateTeam(store, league.id, teamId, payload))}
          store={store}
          userListRefreshKey={userListRefreshKey}
        />
      ) : (
        <PublicView heroImage={heroImage} league={league} />
      )}
    </div>
  );
}

const rootElement = document.querySelector("#app");
const root = window.__ligaFutRoot || createRoot(rootElement);
window.__ligaFutRoot = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
